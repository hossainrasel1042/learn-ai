

import { randomUUID } from 'node:crypto';

import { Tag, Course, CourseMaterial } from './schemas.js';


async function _fileObjectsDelete(pool, sql, params, label = 'fo') {
  const sp = `sp_${label}_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  let created = false;
  try {
    await pool.query(`SAVEPOINT ${sp}`);
    created = true;
    const res = await pool.query(sql, params);
    await pool.query(`RELEASE SAVEPOINT ${sp}`);
    return { skipped: false, rowCount: res?.rowCount };
  } catch (e) {
    if (created) {
      try {
        await pool.query(`ROLLBACK TO SAVEPOINT ${sp}`);
        await pool.query(`RELEASE SAVEPOINT ${sp}`);
      } catch (_) {



      }
    }



    if (e?.code !== '42P01' && e?.code !== '42703') throw e;
    return { skipped: true, reason: e?.code };
  }
}


export function cmsRepository(pool) {
  return {

    async createCourse({ name, courseNo, description }) {
      const id = randomUUID();







      const { rows } = await pool.query(
        `INSERT INTO courses (id, name, course_no, description, created_at, updated_at)
         VALUES ($1, $2, $3, $4, now(), now())
         RETURNING id, name, code, course_no, description, created_at, updated_at`,
        [id, name, courseNo, description ?? null]
      );
      const row = rows[0];
      return new Course({
        id: row.id,
        name: row.name,
        code: row.code,
        courseNo: row.course_no,
        description: row.description,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      });
    },


    async listCourses({ limit = 500, offset = 0 } = {}) {
      const { rows } = await pool.query(
        `SELECT id, name, code, course_no, description, created_at, updated_at
         FROM courses
         ORDER BY course_no
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );
      return rows.map(
        (row) =>
          new Course({
            id: row.id,
            name: row.name,
            code: row.code,
            courseNo: row.course_no,
            description: row.description,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          })
      );
    },


    async findCourse(courseId) {
      const { rows } = await pool.query(
        `SELECT id, name, code, course_no, description, created_at, updated_at
         FROM courses
         WHERE id = $1`,
        [courseId]
      );
      if (rows.length === 0) return null;
      const row = rows[0];
      return new Course({
        id: row.id,
        name: row.name,
        code: row.code,
        courseNo: row.course_no,
        description: row.description,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      });
    },


    async getCourseStats(courseId) {
      const [matRes, fileRes] = await Promise.all([
        pool.query(
          `SELECT count(*)::int AS material_count
             FROM course_materials
            WHERE course_id = $1`,
          [courseId]
        ),
        pool.query(
          `SELECT count(*)::int AS file_count,
                  COALESCE(sum(size_bytes), 0)::bigint AS total_size_bytes
             FROM file_objects
            WHERE course_id = $1
              AND status = 'ready'
              AND category = 'course_material'`,
          [courseId]
        ),
      ]);

      const materialCount = matRes.rows[0]?.material_count ?? 0;
      const fileCount = fileRes.rows[0]?.file_count ?? 0;
      const totalSizeBytes = Number(fileRes.rows[0]?.total_size_bytes ?? 0);

      return {
        materialCount,
        fileCount,
        totalSizeBytes,




        totalFiles: fileCount > 0 ? fileCount : materialCount,
      };
    },


    async getOrCreateTags(tagNames) {
      if (!tagNames || tagNames.length === 0) return [];




      const uniqueNames = [...new Set(
        tagNames
          .filter((n) => typeof n === 'string')
          .map((n) => n.trim())
          .filter((n) => n.length > 0),
      )];
      if (uniqueNames.length === 0) return [];


      const existingRes = await pool.query(
        `SELECT id, name FROM tags WHERE name = ANY($1::text[])`,
        [uniqueNames]
      );
      const existing = existingRes.rows.map(
        (row) => new Tag({ id: row.id, name: row.name })
      );




      const existingNames = new Set(existing.map((t) => t.name));


      const newTags = [];
      for (const name of uniqueNames) {
        if (existingNames.has(name)) continue;
        const id = randomUUID();




        const { rows } = await pool.query(
          `INSERT INTO tags (id, name) VALUES ($1, $2)
           ON CONFLICT (name) DO NOTHING
           RETURNING id, name`,
          [id, name]
        );
        if (rows.length > 0) {
          existingNames.add(name);
          newTags.push(new Tag({ id: rows[0].id, name: rows[0].name }));
        } else {

          const raceRes = await pool.query(
            `SELECT id, name FROM tags WHERE name = $1`,
            [name]
          );
          if (raceRes.rows.length > 0) {
            existingNames.add(name);
            newTags.push(new Tag({ id: raceRes.rows[0].id, name: raceRes.rows[0].name }));
          }
        }
      }

      return [...existing, ...newTags];
    },


    async insertMaterial({
      courseId,
      title,
      description,
      type,
      fileType,
      url,
      week,
      metadata,
      tagIds,
      uploadedBy,
    }) {
      const id = randomUUID();
      const { rows } = await pool.query(
        `INSERT INTO course_materials
           (id, course_id, title, description, type, file_type, url, week, metadata, uploaded_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now(), now())
         RETURNING id, course_id, title, description, type, file_type, url, week, metadata, created_at, updated_at`,
        [
          id,
          courseId,
          title,
          description ?? null,
          type,
          fileType,
          url,
          week ?? null,
          metadata ?? null,
          uploadedBy ?? null,
        ]
      );
      const row = rows[0];


      if (tagIds && tagIds.length > 0) {
        const values = [];
        const params = [];
        let i = 1;
        for (const tagId of tagIds) {
          values.push(`($${i}, $${i + 1})`);
          params.push(id, tagId);
          i += 2;
        }
        await pool.query(
          `INSERT INTO material_tags (material_id, tag_id) VALUES ${values.join(
            ', '
          )} ON CONFLICT DO NOTHING`,
          params
        );
      }

      const tags = tagIds && tagIds.length > 0
        ? (await pool.query(
            `SELECT id, name FROM tags WHERE id = ANY($1::uuid[])`,
            [tagIds]
          )).rows.map((r) => new Tag({ id: r.id, name: r.name }))
        : [];

      return new CourseMaterial({
        id: row.id,
        courseId: row.course_id,
        title: row.title,
        description: row.description,
        type: row.type,
        fileType: row.file_type,
        url: row.url,
        week: row.week,
        metadata: row.metadata,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        tags,
      });
    },


    async findMaterial(materialId, { withTags = true } = {}) {
      const { rows } = await pool.query(
        `SELECT id, course_id, title, description, type, file_type, url, week, metadata, created_at, updated_at
         FROM course_materials
         WHERE id = $1`,
        [materialId]
      );
      if (rows.length === 0) return null;
      const row = rows[0];

      let tags = [];
      if (withTags) {
        const tagRes = await pool.query(
          `SELECT t.id, t.name
           FROM tags t
           JOIN material_tags mt ON mt.tag_id = t.id
           WHERE mt.material_id = $1`,
          [materialId]
        );
        tags = tagRes.rows.map((r) => new Tag({ id: r.id, name: r.name }));
      }

      return new CourseMaterial({
        id: row.id,
        courseId: row.course_id,
        title: row.title,
        description: row.description,
        type: row.type,
        fileType: row.file_type,
        url: row.url,
        week: row.week,
        metadata: row.metadata,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        tags,
      });
    },


    async updateMaterial(materialId, { title, description, week, tagIds }) {

      const setParts = [];
      const params = [];
      let i = 1;
      if (title !== undefined) {
        setParts.push(`title = $${i}`);
        params.push(title);
        i += 1;
      }
      if (description !== undefined) {
        setParts.push(`description = $${i}`);
        params.push(description);
        i += 1;
      }








      if (week !== undefined) {
        setParts.push(`week = $${i}`);
        params.push(week === '' ? null : week);
        i += 1;
      }

      if (setParts.length > 0) {
        setParts.push('updated_at = now()');
        params.push(materialId);
        await pool.query(
          `UPDATE course_materials SET ${setParts.join(', ')} WHERE id = $${i}`,
          params
        );
      }


      if (tagIds !== undefined) {
        await pool.query(
          `DELETE FROM material_tags WHERE material_id = $1`,
          [materialId]
        );
        if (tagIds.length > 0) {
          const values = [];
          const tagParams = [];
          let j = 1;
          for (const tagId of tagIds) {
            values.push(`($${j}, $${j + 1})`);
            tagParams.push(materialId, tagId);
            j += 2;
          }
          await pool.query(
            `INSERT INTO material_tags (material_id, tag_id) VALUES ${values.join(
              ', '
            )} ON CONFLICT DO NOTHING`,
            tagParams
          );
        }
      }











      if (setParts.length === 0) {
        await pool.query(
          `UPDATE course_materials SET updated_at = now() WHERE id = $1`,
          [materialId]
        );
      }

      return this.findMaterial(materialId, { withTags: true });
    },


    async deleteMaterial(materialId) {
      const { rows } = await pool.query(
        `SELECT url FROM course_materials WHERE id = $1`,
        [materialId]
      );
      if (rows.length === 0) return null;
      const url = rows[0].url;
      await pool.query(`DELETE FROM course_materials WHERE id = $1`, [materialId]);








      await _fileObjectsDelete(
        pool,
        `DELETE FROM public.file_objects WHERE material_id = $1`,
        [materialId],
        'delmat',
      );
      return url;
    },


    async listMaterials({ courseId, typeFilter, limit = 1000, offset = 0 }) {
      const params = [courseId];
      let typeClause = '';
      if (typeFilter) {
        typeClause = ' AND type = $2';
        params.push(typeFilter);
      }
      params.push(limit, offset);
      const limitIdx = params.length - 1;
      const offsetIdx = params.length;
      const { rows } = await pool.query(
        `SELECT id, course_id, title, description, type, file_type, url, week, metadata, created_at, updated_at
         FROM course_materials
         WHERE course_id = $1${typeClause}
         ORDER BY updated_at DESC
         LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
        params
      );


      const materialIds = rows.map((r) => r.id);
      let tagsByMaterial = new Map();
      if (materialIds.length > 0) {
        const tagRes = await pool.query(
          `SELECT mt.material_id, t.id, t.name
           FROM tags t
           JOIN material_tags mt ON mt.tag_id = t.id
           WHERE mt.material_id = ANY($1::uuid[])`,
          [materialIds]
        );
        for (const r of tagRes.rows) {
          if (!tagsByMaterial.has(r.material_id)) {
            tagsByMaterial.set(r.material_id, []);
          }
          tagsByMaterial.get(r.material_id).push(new Tag({ id: r.id, name: r.name }));
        }
      }

      const materials = rows.map(
        (row) =>
          new CourseMaterial({
            id: row.id,
            courseId: row.course_id,
            title: row.title,
            description: row.description,
            type: row.type,
            fileType: row.file_type,
            url: row.url,
            week: row.week,
            metadata: row.metadata,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            tags: tagsByMaterial.get(row.id) || [],
          })
      );









      try {
        const params2 = [courseId];
        let typeClause2 = '';
        if (typeFilter) {









          typeClause2 = " AND COALESCE(metadata->>'material_type', 'theory') = $2";
          params2.push(typeFilter);
        }
        const ghostRes = await pool.query(
          `SELECT id, course_id, original_name, metadata, status, updated_at, error_message
             FROM public.file_objects
            WHERE course_id = $1
              AND category = 'course_material'
              AND material_id IS NULL${typeClause2}
            ORDER BY updated_at DESC
            LIMIT 25`,
          params2,
        );
        for (const r of ghostRes.rows) {
          const meta = r.metadata || {};
          materials.push(
            new CourseMaterial({
              id: r.id,
              courseId: r.course_id,
              title: meta.title || r.original_name,
              description: meta.description || null,
              type: meta.material_type || 'theory',
              fileType: meta.file_type || 'pdf',
              url: `/api/v1/storage/files/${r.id}/url`,
              week: meta.week || null,
              metadata: { ...meta, _status: r.status, _errorMessage: r.error_message || null },
              createdAt: r.updated_at,
              updatedAt: r.updated_at,
              tags: [],
            }),
          );
        }
      } catch (_) {

      }

      return materials;
    },


    async listRecentMaterials(limit = 20) {
      const { rows } = await pool.query(
        `SELECT id, course_id, title, description, type, file_type, url, week, metadata, created_at, updated_at
         FROM course_materials
         ORDER BY updated_at DESC
         LIMIT $1`,
        [limit]
      );
      const materialIds = rows.map((r) => r.id);
      let tagsByMaterial = new Map();
      if (materialIds.length > 0) {
        const tagRes = await pool.query(
          `SELECT mt.material_id, t.id, t.name
           FROM tags t
           JOIN material_tags mt ON mt.tag_id = t.id
           WHERE mt.material_id = ANY($1::uuid[])`,
          [materialIds]
        );
        for (const r of tagRes.rows) {
          if (!tagsByMaterial.has(r.material_id)) {
            tagsByMaterial.set(r.material_id, []);
          }
          tagsByMaterial.get(r.material_id).push(new Tag({ id: r.id, name: r.name }));
        }
      }
      const materials = rows.map(
        (row) =>
          new CourseMaterial({
            id: row.id,
            courseId: row.course_id,
            title: row.title,
            description: row.description,
            type: row.type,
            fileType: row.file_type,
            url: row.url,
            week: row.week,
            metadata: row.metadata,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            tags: tagsByMaterial.get(row.id) || [],
          })
      );




      try {
        const ghostRes = await pool.query(
          `SELECT id, course_id, original_name, metadata, status, updated_at, error_message
             FROM public.file_objects
            WHERE category = 'course_material'
              AND material_id IS NULL
            ORDER BY updated_at DESC
            LIMIT $1`,
          [limit],
        );
        for (const r of ghostRes.rows) {
          const meta = r.metadata || {};
          materials.push(
            new CourseMaterial({
              id: r.id,
              courseId: r.course_id,
              title: meta.title || r.original_name,
              description: meta.description || null,
              type: meta.material_type || 'theory',
              fileType: meta.file_type || 'pdf',
              url: `/api/v1/storage/files/${r.id}/url`,
              week: meta.week || null,
              metadata: { ...meta, _status: r.status, _errorMessage: r.error_message || null },
              createdAt: r.updated_at,
              updatedAt: r.updated_at,
              tags: [],
            }),
          );
        }
      } catch (_) {

      }

      return materials;
    },


    async deleteMaterialsByType(courseId, type) {
      const { rows } = await pool.query(
        `SELECT id, url FROM course_materials
         WHERE course_id = $1 AND type = $2`,
        [courseId, type]
      );
      const ids = rows.map((r) => r.id);
      if (ids.length === 0) return [];
      await pool.query(
        `DELETE FROM course_materials WHERE id = ANY($1::uuid[])`,
        [ids]
      );












      await _fileObjectsDelete(
        pool,
        `DELETE FROM public.file_objects WHERE material_id = ANY($1::uuid[])`,
        [ids],
        'delbulk',
      );
      return rows.map((r) => r.url);
    },


    async deleteCourse(courseId) {
      const { rows } = await pool.query(
        `SELECT id, url FROM course_materials WHERE course_id = $1`,
        [courseId]
      );
      const urls = rows.map((r) => r.url);
      const materialIds = rows.map((r) => r.id);





      const foRes = await pool.query(
        `SELECT bucket, object_key FROM public.file_objects WHERE course_id = $1`,
        [courseId],
      );
      const objectKeys = foRes.rows
        .filter((r) => r.object_key)
        .map((r) => ({ bucket: r.bucket, key: r.object_key }));









      await _fileObjectsDelete(
        pool,
        `DELETE FROM public.file_objects WHERE course_id = $1`,
        [courseId],
        'delcourse',
      );

      await pool.query(`DELETE FROM courses WHERE id = $1`, [courseId]);
      return { urls, materialIds, objectKeys };
    },


    async searchTags(query = '') {
      const params = [];
      let whereClause = '';
      if (query) {
        whereClause = 'WHERE name ILIKE $1';
        params.push(`%${query}%`);
      }
      const { rows } = await pool.query(
        `SELECT id, name FROM tags ${whereClause} LIMIT 20`,
        params
      );
      return rows.map((r) => new Tag({ id: r.id, name: r.name }));
    },
  };
}
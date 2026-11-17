

import { existsSync } from 'node:fs';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { join, basename } from 'node:path';

import { settings } from '../config/settings.js';
import { cmsRepository } from './models.js';
import { logger } from '../utils/logger.js';
import { deleteObject } from '../storage_minio/client.js';


export const CONTENT_DIR = join(settings.BASE_DIR, 'contents');


function httpError(status, detail) {
  const err = new Error(detail);
  err.status = status;
  err.detail = detail;
  return err;
}

export class CMSService {





  static async createCourse(db, courseIn) {
    const repo = cmsRepository(db);



    const courseNo = courseIn?.course_no ?? courseIn?.courseNo;
    if (!courseNo || typeof courseNo !== 'string') {
      throw httpError(400, 'course_no is required');
    }


    const { rows } = await db.query(
      `SELECT id FROM courses WHERE course_no = $1`,
      [courseNo]
    );
    if (rows.length > 0) {
      throw httpError(400, 'Course number already exists');
    }

    try {
      return await repo.createCourse({
        name: courseIn.name,
        courseNo,
        description: courseIn.description,
      });
    } catch (e) {






      if (e?.code === '23505') {
        throw httpError(400, 'Course number already exists');
      }
      throw e;
    }
  }


  static async getCourses(db, pagination = {}) {
    const repo = cmsRepository(db);
    return repo.listCourses(pagination);
  }


  static async getCourseStats(db, courseId) {
    const repo = cmsRepository(db);
    const course = await repo.findCourse(courseId);
    if (!course) {
      throw httpError(404, 'Course not found');
    }
    const stats = await repo.getCourseStats(courseId);
    return {
      courseId,
      courseNo: course.courseNo,
      code: course.code ?? null,
      name: course.name,
      description: course.description ?? null,
      ...stats,
    };
  }


  static async getCourse(db, courseId) {
    const repo = cmsRepository(db);
    return repo.findCourse(courseId);
  }


  static async deleteCourse(db, courseId) {
    const repo = cmsRepository(db);

    const course = await repo.findCourse(courseId);
    if (!course) {
      throw httpError(404, 'Course not found');
    }




    const { urls, objectKeys } = await repo.deleteCourse(courseId);








    const objectsToDelete = objectKeys || [];







    const filesToDelete = [];
    for (const url of urls) {
      if (url && url.startsWith('/contents')) {
        const stripped = url.replace(/^\/contents\/?/, '');
        const filePath = join(CONTENT_DIR, stripped);
        if (existsSync(filePath)) {
          filesToDelete.push(filePath);
        }
      }
    }




    try {
      const { rm } = await import('node:fs/promises');
      const courseDir = join(CONTENT_DIR, course.courseNo);
      await rm(courseDir, { recursive: true, force: true });
    } catch (e) {
      logger.error(
        `Failed to remove course dir for ${course.courseNo}: ${e.message || e}`,
      );
    }

    return {
      deleted: true,
      courseNo: course.courseNo,
      objectsToDelete,
      filesToDelete,
    };
  }






  static async getOrCreateTags(db, tagNames) {
    const repo = cmsRepository(db);
    return repo.getOrCreateTags(tagNames || []);
  }






  static async uploadMaterial(db, courseId, fileObj, materialIn) {
    const repo = cmsRepository(db);

    const course = await repo.findCourse(courseId);
    if (!course) {
      throw httpError(404, 'Course not found');
    }


    const original = (fileObj && fileObj.originalname) || 'untitled';
    const filename = basename(original);

    const saveDir = join(CONTENT_DIR, course.courseNo, materialIn.type);
    await mkdir(saveDir, { recursive: true });

    const filePath = join(saveDir, filename);


    const relPath = `/contents/${course.courseNo}/${materialIn.type}/${filename}`;






    try {

      const buf =
        fileObj && fileObj.buffer
          ? fileObj.buffer
          : Buffer.from(fileObj && fileObj.data ? fileObj.data : []);
      await writeFile(filePath, buf);


      const tags = await repo.getOrCreateTags(materialIn.tags || []);
      const tagIds = tags.map((t) => t.id);

      return await repo.insertMaterial({
        courseId,
        title: materialIn.title,
        description: materialIn.description,
        type: materialIn.type,
        fileType: materialIn.fileType,
        url: relPath,
        week: materialIn.week,
        metadata: materialIn.metadata,
        tagIds,
        uploadedBy: materialIn.uploaded_by ?? materialIn.uploadedBy,
      });
    } catch (e) {


      try {
        await unlink(filePath);
      } catch (cleanupErr) {
        logger.error(
          `uploadMaterial rollback: failed to delete orphan file ${filePath}: ${cleanupErr.message || cleanupErr}`,
        );
      }
      throw e;
    }
  }


  static async updateMaterial(db, materialId, updateData) {
    const repo = cmsRepository(db);

    const existing = await repo.findMaterial(materialId, { withTags: true });
    if (!existing) {
      throw httpError(404, 'Material not found');
    }

    let tagIds;
    if (updateData.tags !== undefined && updateData.tags !== null) {
      const tags = await repo.getOrCreateTags(updateData.tags);
      tagIds = tags.map((t) => t.id);
    }

    return repo.updateMaterial(materialId, {
      title: updateData.title,
      description: updateData.description,
      week: updateData.week,
      tagIds,
    });
  }


  static async deleteMaterial(db, materialId) {
    const repo = cmsRepository(db);
    const objectsToDelete = [];
    const filesToDelete = [];

    const material = await repo.findMaterial(materialId, { withTags: false });
    if (material) {





      let foRow = null;



      const spSel = `sp_fo_sel_${materialId.replace(/-/g, '')}`;
      let spSelCreated = false;
      try {
        await db.query(`SAVEPOINT ${spSel}`);
        spSelCreated = true;
        const foRes = await db.query(
          `SELECT id, object_key, bucket
             FROM public.file_objects
            WHERE material_id = $1
            LIMIT 1`,
          [materialId],
        );
        if (foRes.rows.length > 0) foRow = foRes.rows[0];
        await db.query(`RELEASE SAVEPOINT ${spSel}`);
      } catch (e) {
        if (spSelCreated) {
          try {
            await db.query(`ROLLBACK TO SAVEPOINT ${spSel}`);
            await db.query(`RELEASE SAVEPOINT ${spSel}`);
          } catch (_) {

          }
        }



        if (e?.code !== '42P01' && e?.code !== '42703') throw e;
        logger.warn(
          `[cms] file_objects lookup skipped (${e?.code}): ${e?.message || e}`,
        );
      }



      if (material.url && material.url.startsWith('/contents')) {



        const stripped = material.url.replace(/^\/contents\/?/, '');
        const filePath = join(CONTENT_DIR, stripped);
        if (existsSync(filePath)) {
          filesToDelete.push(filePath);
        }
      }
      await repo.deleteMaterial(materialId);



      if (foRow) {






        const sp = `sp_delmat_${materialId.replace(/-/g, '')}`;
        let spCreated = false;
        try {
          await db.query(`SAVEPOINT ${sp}`);
          spCreated = true;
          await db.query(`DELETE FROM public.file_objects WHERE id = $1`, [foRow.id]);
          await db.query(`RELEASE SAVEPOINT ${sp}`);
        } catch (e) {
          if (spCreated) {
            try {
              await db.query(`ROLLBACK TO SAVEPOINT ${sp}`);
              await db.query(`RELEASE SAVEPOINT ${sp}`);
            } catch (_) {


            }
          }



          if (e?.code !== '42P01' && e?.code !== '42703') throw e;
          logger.warn(
            `[cms] file_objects row ${foRow.id} not deleted (${e?.code}): ${e?.message || e}`,
          );
        }


        objectsToDelete.push({ bucket: foRow.bucket, key: foRow.object_key });
      }

      return { kind: 'material', materialId, objectsToDelete, filesToDelete };
    }









    const spGhost = `sp_ghost_${materialId.replace(/-/g, '')}`;
    let spGhostCreated = false;
    try {
      await db.query(`SAVEPOINT ${spGhost}`);
      spGhostCreated = true;
      const ghostLookup = await db.query(
        `SELECT object_key, bucket FROM public.file_objects WHERE id = $1`,
        [materialId],
      );
      if (ghostLookup.rows.length > 0) {
        const { object_key: objectKey, bucket } = ghostLookup.rows[0];
        await db.query(`DELETE FROM public.file_objects WHERE id = $1`, [materialId]);
        await db.query(`RELEASE SAVEPOINT ${spGhost}`);



        objectsToDelete.push({ bucket, key: objectKey });
        return { kind: 'ghost', materialId, objectsToDelete, filesToDelete };
      }
      await db.query(`RELEASE SAVEPOINT ${spGhost}`);
    } catch (e) {
      if (spGhostCreated) {
        try {
          await db.query(`ROLLBACK TO SAVEPOINT ${spGhost}`);
          await db.query(`RELEASE SAVEPOINT ${spGhost}`);
        } catch (_) {

        }
      }
      if (e?.code !== '42P01' && e?.code !== '42703') throw e;

    }

    throw httpError(404, 'Material not found');
  }


  static async getMaterials(db, courseId, typeFilter, pagination = {}) {
    const repo = cmsRepository(db);
    return repo.listMaterials({ courseId, typeFilter, ...pagination });
  }


  static async getRecentMaterials(db, limit = 20) {
    const repo = cmsRepository(db);
    return repo.listRecentMaterials(limit);
  }


  static async deleteMaterialsByType(db, courseId, type) {
    const repo = cmsRepository(db);


    const materials = await repo.listMaterials({
      courseId,
      typeFilter: type,
      limit: 100000,
    });
    let deleted = 0;
    let failed = 0;
    const objectsToDelete = [];
    const filesToDelete = [];
    const materialIds = [];
    for (const material of materials) {










      const savepoint = `del_${material.id.replace(/-/g, '')}`;
      let savepointCreated = false;
      try {
        await db.query(`SAVEPOINT ${savepoint}`);
        savepointCreated = true;
        const result = await CMSService.deleteMaterial(db, material.id);
        await db.query(`RELEASE SAVEPOINT ${savepoint}`);
        if (result?.objectsToDelete) objectsToDelete.push(...result.objectsToDelete);
        if (result?.filesToDelete) filesToDelete.push(...result.filesToDelete);
        materialIds.push(material.id);
        deleted += 1;
      } catch (e) {
        if (savepointCreated) {
          try {
            await db.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
            await db.query(`RELEASE SAVEPOINT ${savepoint}`);
          } catch (_) {


          }
        }
        failed += 1;
        logger.error(
          `[cms] deleteMaterialsByType: failed to delete id=${material.id}: ${e?.message || e}`,
        );
      }
    }
    return { deleted, failed, objectsToDelete, filesToDelete, materialIds };
  }


  static async searchTags(db, query = '') {
    const repo = cmsRepository(db);
    return repo.searchTags(query);
  }
}

export default CMSService;

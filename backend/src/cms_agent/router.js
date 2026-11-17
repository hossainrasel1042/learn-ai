

import express from 'express';
import multer from 'multer';
import path from 'node:path';

import { settings } from '../config/settings.js';
import { logger } from '../utils/logger.js';
import { getCurrentUser } from '../middlewares/auth.js';
import { requireCourseAdmin } from './adminGate.js';
import { CMSService } from './service.js';
import {
  CourseCreateRequest,
  CourseMaterialUpdateRequest,
  CourseMaterialUploadFields,
  normalizeCourseCreate,
} from './schemas.js';
import { getRagIntegration } from './ragIntegration.js';
import { getSemanticSearch } from '../rag_engine/index.js';

const router = express.Router();


const upload = multer({ storage: multer.memoryStorage() });


function _sendError(res, err) {
  const status = err && err.status ? err.status : 500;
  const detail = (err && err.detail) || (err && err.message) || 'Internal server error';
  return res.status(status).json({ detail });
}


async function _deleteObjectsAfterCommit(objects) {
  if (!Array.isArray(objects) || objects.length === 0) return;
  const { deleteObject } = await import('../storage_minio/client.js');
  for (const { bucket, key } of objects) {
    if (!bucket || !key) continue;
    try {
      await deleteObject({ bucket, key });
    } catch (e) {
      logger.error(
        `[cms] failed to delete storage object ${bucket}/${key}: ${e?.message || e}`,
      );
    }
  }
}


async function _deleteFilesAfterCommit(filePaths) {
  if (!Array.isArray(filePaths) || filePaths.length === 0) return;
  const { unlink } = await import('node:fs/promises');
  for (const filePath of filePaths) {
    if (!filePath) continue;
    try {
      await unlink(filePath);
    } catch (e) {

      if (e?.code !== 'ENOENT') {
        logger.error(
          `[cms] failed to delete file ${filePath}: ${e?.message || e}`,
        );
      }
    }
  }
}


function _clampLimit(raw, fallback, max) {
  if (raw === undefined || raw === null || raw === '') return fallback;
  const n = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n)) return fallback;
  if (n < 1) return fallback;
  return Math.min(n, max);
}


function _clampOffset(raw) {
  if (raw === undefined || raw === null || raw === '') return 0;
  const n = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  return n;
}


function _validate(schema, body) {
  const result = schema.safeParse(body ?? {});
  if (result.success) return { ok: true, data: result.data };

  const issues = result.error.issues.map((i) => {
    const field = i.path.join('.');
    return field ? `${field}: ${i.message}` : i.message;
  });
  return { ok: false, detail: issues.join('; ') };
}






const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;


function _requireUuid(value, label) {
  const raw = String(value ?? '').trim();
  if (!UUID_RE.test(raw)) {
    const err = new Error(`${label} must be a valid UUID`);
    err.status = 400;
    throw err;
  }
  return raw.toLowerCase();
}


async function _materialBelongsToCourse(req, courseId, materialId) {
  const res = await req.db.query(
    `SELECT 1 FROM course_materials WHERE id = $1 AND course_id = $2`,
    [materialId, courseId],
  );
  return res.rows.length > 0;
}






router.post('/courses', ...requireCourseAdmin(), async (req, res, next) => {
  try {
    const check = _validate(CourseCreateRequest, req.body);
    if (!check.ok) {
      return res.status(400).json({ detail: check.detail });
    }

    const created = await CMSService.createCourse(
      req.db,
      normalizeCourseCreate(check.data),
    );




    if (req.dbCommit) await req.dbCommit();
    return res.status(201).json(created.toDict());
  } catch (e) {
    if (req.dbRollback) { try { await req.dbRollback(); } catch (_) {} }
    if (e && e.status) return _sendError(res, e);
    next(e);
  }
});


router.get('/courses', async (req, res, next) => {
  try {



    const limit = _clampLimit(req.query.limit, 500, 2000);
    const offset = _clampOffset(req.query.offset);
    const courses = await CMSService.getCourses(req.db, { limit, offset });
    return res.json(courses.map((c) => c.toDict()));
  } catch (e) {
    next(e);
  }
});


router.delete('/courses/:courseId', ...requireCourseAdmin(), async (req, res, next) => {
  try {
    const courseId = _requireUuid(req.params.courseId, 'courseId');



    const matRes = await req.db.query(
      `SELECT id FROM course_materials WHERE course_id = $1`,
      [courseId]
    );
    const materialIds = matRes.rows.map((r) => r.id);

    const courseDelete = await CMSService.deleteCourse(req.db, courseId);
    if (req.dbCommit) await req.dbCommit();





    const rag = getRagIntegration();
    for (const materialId of materialIds) {
      try {
        await rag.deleteMaterialChunksById(materialId);
      } catch (e) {
        logger.error(
          `RAG cleanup failed for material ${materialId}: ${e.message || e}`,
        );
      }
    }




    await _deleteObjectsAfterCommit(courseDelete?.objectsToDelete);

    await _deleteFilesAfterCommit(courseDelete?.filesToDelete);
    return res.status(204).end();
  } catch (e) {
    if (req.dbRollback) { try { await req.dbRollback(); } catch (_) {} }
    if (e && e.status) return _sendError(res, e);
    next(e);
  }
});






router.post(
  '/courses/:courseId/materials',
  ...requireCourseAdmin(),
  upload.single('file'),
  async (req, res, next) => {
    try {
      const courseId = _requireUuid(req.params.courseId, 'courseId');
      let tagsList = [];
      let metadataDict = {};
      try {
        tagsList = JSON.parse(req.body.tags || '[]');
        metadataDict = JSON.parse(req.body.metadata || '{}');
      } catch (_) {
        return res.status(400).json({ detail: 'Invalid JSON for tags or metadata' });
      }




      if (!Array.isArray(tagsList)) {
        return res.status(400).json({ detail: 'tags must be a JSON array' });
      }
      if (
        !metadataDict ||
        typeof metadataDict !== 'object' ||
        Array.isArray(metadataDict)
      ) {
        return res.status(400).json({ detail: 'metadata must be a JSON object' });
      }
      if (!tagsList.every((t) => typeof t === 'string')) {
        return res.status(400).json({ detail: 'tags must contain only strings' });
      }

      const check = _validate(CourseMaterialUploadFields, req.body);
      if (!check.ok) {
        return res.status(400).json({ detail: check.detail });
      }

      const materialIn = {
        title: check.data.title,
        type: check.data.type,
        fileType: check.data.file_type,
        description: check.data.description,
        tags: tagsList,




        week: check.data.week ?? undefined,
        metadata: metadataDict,


        uploaded_by: req.user && (req.user.id || req.user.user_id || req.user.sub) || undefined,
      };

      const material = await CMSService.uploadMaterial(
        req.db,
        courseId,
        req.file,
        materialIn
      );




      const course = await CMSService.getCourse(req.db, courseId);










      if (req.dbCommit) await req.dbCommit();


      if (course) {
        const rag = getRagIntegration();
        const urlStr = String(material.url);
        const filePath = path.join(settings.BASE_DIR, urlStr.replace(/^\//, ''));
        setImmediate(() => {
          rag.ingestMaterial({
            filePath,
            materialId: String(material.id),
            courseId: String(courseId),
            courseNo: course.courseNo,
            materialType: materialIn.type,
            metadata: { title: materialIn.title, week: materialIn.week },
          }).catch((e) => {
            logger.error(`Background ingestion failed: ${e.message || e}`);
          });
        });
      }

      return res.status(201).json(material.toDict());
    } catch (e) {
      if (req.dbRollback) { try { await req.dbRollback(); } catch (_) {} }
      if (e && e.status) return _sendError(res, e);
      next(e);
    }
  }
);


router.put(
  '/courses/:courseId/materials/:materialId',
  ...requireCourseAdmin(),
  async (req, res, next) => {
    try {
      const courseId = _requireUuid(req.params.courseId, 'courseId');
      const materialId = _requireUuid(req.params.materialId, 'materialId');


      if (!(await _materialBelongsToCourse(req, courseId, materialId))) {
        return res.status(404).json({ detail: 'Material not found in this course' });
      }

      const check = _validate(CourseMaterialUpdateRequest, req.body);
      if (!check.ok) {
        return res.status(400).json({ detail: check.detail });
      }

      const updated = await CMSService.updateMaterial(
        req.db,
        materialId,
        check.data
      );
      if (req.dbCommit) await req.dbCommit();
      return res.json(updated.toDict());
    } catch (e) {
      if (req.dbRollback) { try { await req.dbRollback(); } catch (_) {} }
      if (e && e.status) return _sendError(res, e);
      next(e);
    }
  }
);


router.delete(
  '/courses/:courseId/materials/:materialId',
  ...requireCourseAdmin(),
  async (req, res, next) => {
    try {
      const courseId = _requireUuid(req.params.courseId, 'courseId');
      const materialId = _requireUuid(req.params.materialId, 'materialId');


      if (!(await _materialBelongsToCourse(req, courseId, materialId))) {
        return res.status(404).json({ detail: 'Material not found in this course' });
      }

      const deleted = await CMSService.deleteMaterial(req.db, materialId);
      if (req.dbCommit) await req.dbCommit();











      try {
        const rag = getRagIntegration();
        await rag.deleteMaterialChunksById(materialId);
      } catch (e) {
        logger.error(
          `RAG cleanup failed for material ${materialId}: ${e.message || e}`,
        );
      }




      await _deleteObjectsAfterCommit(deleted?.objectsToDelete);

      await _deleteFilesAfterCommit(deleted?.filesToDelete);
      return res.status(204).end();
    } catch (e) {
      if (req.dbRollback) { try { await req.dbRollback(); } catch (_) {} }
      if (e && e.status) return _sendError(res, e);
      next(e);
    }
  }
);


router.get('/materials/recent', async (req, res, next) => {
  try {
    const limit = _clampLimit(req.query.limit, 20, 100);
    const materials = await CMSService.getRecentMaterials(req.db, limit);
    return res.json(materials.map((m) => m.toDict()));
  } catch (e) {
    next(e);
  }
});


router.delete('/courses/:courseId/materials', ...requireCourseAdmin(), async (req, res, next) => {
  try {
    const courseId = _requireUuid(req.params.courseId, 'courseId');
    const type = req.query.type;
    if (!type) {
      return res.status(400).json({ detail: 'type query param required' });
    }
    const bulk = await CMSService.deleteMaterialsByType(req.db, courseId, type);
    if (req.dbCommit) await req.dbCommit();











    try {
      const rag = getRagIntegration();
      for (const materialId of bulk?.materialIds || []) {
        try {
          await rag.deleteMaterialChunksById(materialId);
        } catch (e) {
          logger.error(
            `RAG cleanup failed for material ${materialId}: ${e.message || e}`,
          );
        }
      }
    } catch (e) {
      logger.error(`RAG cleanup failed: ${e.message || e}`);
    }


    await _deleteObjectsAfterCommit(bulk?.objectsToDelete);

    await _deleteFilesAfterCommit(bulk?.filesToDelete);








    if (bulk?.failed > 0) {
      return res.status(207).json({
        detail: `Deleted ${bulk.deleted} material(s); ${bulk.failed} could not be deleted`,
        deleted: bulk.deleted,
        failed: bulk.failed,
      });
    }
    return res.status(204).end();
  } catch (e) {
    if (req.dbRollback) { try { await req.dbRollback(); } catch (_) {} }
    if (e && e.status) return _sendError(res, e);
    next(e);
  }
});


router.get('/tags', async (req, res, next) => {
  try {
    const query = req.query.query || '';
    const tags = await CMSService.searchTags(req.db, query);
    return res.json(tags.map((t) => t.toDict()));
  } catch (e) {
    next(e);
  }
});


router.get('/courses/:courseId/materials', async (req, res, next) => {
  try {
    const courseId = _requireUuid(req.params.courseId, 'courseId');
    const typeFilter = req.query.type || null;



    const limit = _clampLimit(req.query.limit, 1000, 5000);
    const offset = _clampOffset(req.query.offset);
    const materials = await CMSService.getMaterials(
      req.db,
      courseId,
      typeFilter,
      { limit, offset }
    );
    return res.json(materials.map((m) => m.toDict()));
  } catch (e) {
    next(e);
  }
});


router.get('/courses/:courseId/stats', async (req, res, next) => {
  try {
    const courseId = _requireUuid(req.params.courseId, 'courseId');
    const stats = await CMSService.getCourseStats(req.db, courseId);
    return res.json(stats);
  } catch (e) {
    if (e && e.status) return _sendError(res, e);
    next(e);
  }
});






router.get('/search', getCurrentUser, async (req, res, next) => {
  try {
    const q = req.query.q || '';
    const type = req.query.type || null;
    const limit = _clampLimit(req.query.limit, 10, 50);

    logger.info(
      `[SEARCH] Starting search: query='${q}', type=${type}, limit=${limit}`
    );

    const searchService = getSemanticSearch();
    const results = await searchService.searchFiles(
      q,
      limit,
      type,
      true,
      3
    );

    logger.info(`[SEARCH] Got ${results.length} results`);

    return res.json({
      query: q,
      count: results.length,
      results: results.map((r) =>
        typeof r.toDict === 'function' ? r.toDict() : r
      ),
    });
  } catch (e) {
    logger.error(`[SEARCH] Error during search: ${e.message || e}`);
    next(e);
  }
});

export default router;
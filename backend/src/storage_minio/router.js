

import express from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';

import { getCurrentUser } from '../middlewares/auth.js';
import { logger } from '../utils/logger.js';
import * as adminService from '../admin_agent/service.js';
import {
  MATERIAL_TYPES,
  MATERIAL_FILE_TYPES,
} from '../cms_agent/schemas.js';
import {
  NotAdminMemberError,
  InsufficientPermissionsError,
} from '../admin_agent/errors.js';
import {
  buildObjectKey,
  presignGet,
  presignPut,
  headObject,
  deleteObject,
  getS3Client,
  BUCKETS,
} from './client.js';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import {
  enqueueUpload,
  enqueuePostProcess,
  getJobStatus,
} from '../queue/bullmq.js';

const router = express.Router();



const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

function _userId(req) {
  const u = req.user || {};
  return u.id || u.user_id || u.sub;
}

function _sendError(res, status, detail) {
  return res.status(status).json({ detail });
}



const FORBIDDEN_EXTENSIONS = new Set([
  'zip', 'rar', '7z', 'tar', 'gz', 'exe', 'dll', 'bat', 'sh', 'msi',
]);

function _extOf(name) {
  const i = String(name || '').lastIndexOf('.');
  return i >= 0 ? String(name).slice(i + 1).toLowerCase() : '';
}


async function _isCourseAdmin(req) {
  const userId = _userId(req);
  if (!userId) return false;




  if (!req.db) return false;
  try {
    const member = await adminService.getMe(req.db, userId);
    const perms = member?.permissions || [];
    return perms.includes('can_manage_courses');
  } catch (e) {






    if (e instanceof NotAdminMemberError || e instanceof InsufficientPermissionsError) {
      return false;
    }
    throw e;
  }
}


function _validateMetadata(metadata) {
  if (metadata === undefined || metadata === null) {
    return { ok: true, value: {} };
  }
  if (typeof metadata !== 'object' || Array.isArray(metadata)) {
    return { ok: false, error: 'metadata must be an object' };
  }
  if ('_bytes_processed' in metadata) {
    return { ok: false, error: 'metadata._bytes_processed is reserved' };
  }
  if (
    metadata.material_type !== undefined &&
    !MATERIAL_TYPES.includes(metadata.material_type)
  ) {
    return {
      ok: false,
      error: `metadata.material_type must be one of: ${MATERIAL_TYPES.join(', ')}`,
    };
  }
  if (
    metadata.file_type !== undefined &&
    !MATERIAL_FILE_TYPES.includes(metadata.file_type)
  ) {
    return {
      ok: false,
      error: `metadata.file_type must be one of: ${MATERIAL_FILE_TYPES.join(', ')}`,
    };
  }
  if (metadata.week !== undefined && metadata.week !== null) {








    if (typeof metadata.week !== 'number' && typeof metadata.week !== 'string') {
      return { ok: false, error: 'metadata.week must be an integer' };
    }
    if (typeof metadata.week === 'string' && !/^\d+$/.test(metadata.week.trim())) {
      return { ok: false, error: 'metadata.week must be an integer' };
    }
    const week = Number(metadata.week);
    if (!Number.isInteger(week) || week < -2147483648 || week > 2147483647) {
      return { ok: false, error: 'metadata.week must be an integer' };
    }
  }
  return { ok: true, value: metadata };
}


async function _validateCourseId(courseId, req) {
  if (courseId === undefined || courseId === null || courseId === '') return null;
  const raw = String(courseId).trim();
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(raw)) {
    const err = new Error('courseId must be a valid UUID');
    err.status = 400;
    err.detail = 'courseId must be a valid UUID';
    throw err;
  }

  if (!req.db) {
    const err = new Error('database client unavailable');
    err.status = 500;
    err.detail = 'database client unavailable';
    throw err;
  }
  const res = await req.db.query(
    `SELECT 1 FROM public.courses WHERE id = $1`,
    [raw],
  );
  if (res.rows.length === 0) {
    const err = new Error('Course not found');
    err.status = 404;
    err.detail = 'Course not found';
    throw err;
  }
  return raw;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;


function _requireUuid(value, label) {
  const raw = String(value ?? '').trim();
  if (!UUID_RE.test(raw)) {
    const err = new Error(`${label} must be a valid UUID`);
    err.status = 400;
    err.detail = `${label} must be a valid UUID`;
    throw err;
  }
  return raw;
}


function _validateSizeBytes(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
    const err = new Error('sizeBytes must be a non-negative integer');
    err.status = 400;
    err.detail = 'sizeBytes must be a non-negative integer';
    throw err;
  }

  if (n > Number.MAX_SAFE_INTEGER) {
    const err = new Error('sizeBytes is too large');
    err.status = 400;
    err.detail = 'sizeBytes is too large';
    throw err;
  }
  return n;
}







router.post('/presign', getCurrentUser, async (req, res, next) => {
  try {
    const userId = _userId(req);
    if (!userId) return _sendError(res, 401, 'unauthenticated');

    const {
      filename: rawFilename,
      contentType,
      sizeBytes,
      category = 'course_material',
      courseId: rawCourseId = null,
      metadata: rawMetadata = {},
    } = req.body || {};
    let courseId = rawCourseId;
    let metadata = rawMetadata;

    if (!rawFilename || typeof rawFilename !== 'string') {
      return _sendError(res, 400, 'filename is required');
    }
    if (sizeBytes === undefined || sizeBytes === null) {
      return _sendError(res, 400, 'sizeBytes is required');
    }



    let validatedSizeBytes;
    try {
      validatedSizeBytes = _validateSizeBytes(sizeBytes);
    } catch (e) {
      return _sendError(res, 400, e.detail || 'sizeBytes is invalid');
    }
    if (FORBIDDEN_EXTENSIONS.has(_extOf(rawFilename))) {
      return _sendError(res, 400, `extension .${_extOf(rawFilename)} is not allowed`);
    }
    if (!['course_material', 'avatar', 'course_thumbnail', 'other'].includes(category)) {
      return _sendError(res, 400, `unknown category: ${category}`);
    }



    const metaCheck = _validateMetadata(metadata);
    if (!metaCheck.ok) {
      return _sendError(res, 400, metaCheck.error);
    }
    metadata = metaCheck.value;




    if (['course_material', 'course_thumbnail'].includes(category)) {
      if (!(await _isCourseAdmin(req))) {
        return _sendError(res, 403, 'Missing permission: can_manage_courses');
      }
      if (!courseId) {
        return _sendError(res, 400, 'courseId is required for course content');
      }

      courseId = await _validateCourseId(courseId, req);
    } else if (courseId) {




      return _sendError(res, 400, 'courseId is only allowed for course content');
    }

    const objectKey = buildObjectKey({
      category,
      userId,
      courseId,
      originalName: rawFilename,
    });

    const bucket = category === 'avatar' ? BUCKETS.avatars : BUCKETS.uploads;
    const id = randomUUID();




    await req.db.query(
      `INSERT INTO public.file_objects
         (id, object_key, bucket, original_name, mime_type, category, user_id, course_id, uploaded_by, status, size_bytes, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $7, 'pending', $9, $10)`,
      [
        id, objectKey, bucket, rawFilename,
        contentType || null, category, userId, courseId,
        validatedSizeBytes, metadata,
      ],
    );

    const expiresIn = 900;
    const uploadUrl = await presignPut({
      bucket,
      key: objectKey,
      contentType,
      expiresIn,
    });

    logger.info(`[presign] fileObjectId=${id} bucket=${bucket} key=${objectKey} size=${sizeBytes}`);









    if (req.dbCommit) await req.dbCommit();

    return res.json({
      uploadUrl,
      objectKey,
      bucket,
      fileObjectId: id,
      expiresIn,
    });
  } catch (e) {
    logger.error(`presign failed: ${e?.message || e}`);
    next(e);
  }
});






router.post('/finalize', getCurrentUser, async (req, res, next) => {
  try {
    const userId = _userId(req);
    if (!userId) return _sendError(res, 401, 'unauthenticated');

    const {
      fileObjectId,
      sizeBytes,
      contentType,
      courseId,
      metadata: rawMetadata,
    } = req.body || {};
    let metadata = rawMetadata;

    if (!fileObjectId) return _sendError(res, 400, 'fileObjectId is required');


    let fileObjectUuid;
    try {
      fileObjectUuid = _requireUuid(fileObjectId, 'fileObjectId');
    } catch (e) {
      return _sendError(res, 400, e.detail || 'fileObjectId is invalid');
    }


    let validatedSizeBytes = null;
    try {
      validatedSizeBytes = _validateSizeBytes(sizeBytes);
    } catch (e) {
      return _sendError(res, 400, e.detail || 'sizeBytes is invalid');
    }



    const metaCheck = _validateMetadata(metadata);
    if (!metaCheck.ok) {
      return _sendError(res, 400, metaCheck.error);
    }
    metadata = metaCheck.value;



















    const metadataProvided =
      rawMetadata !== undefined &&
      rawMetadata !== null &&
      Object.keys(metadata).length > 0;


    const sel = await req.db.query(
      `SELECT id, object_key, bucket, uploaded_by, status, category, course_id
         FROM public.file_objects WHERE id = $1`,
      [fileObjectUuid],
    );
    if (sel.rows.length === 0) return _sendError(res, 404, 'file object not found');
    const row = sel.rows[0];

    if (row.uploaded_by !== userId) {
      return _sendError(res, 403, 'not your upload');
    }











    if (row.status !== 'pending') {
      return _sendError(
        res,
        409,
        `upload is already ${row.status} — it cannot be finalized again`,
      );
    }





    if (['course_material', 'course_thumbnail'].includes(row.category)) {
      if (!(await _isCourseAdmin(req))) {
        return _sendError(res, 403, 'Missing permission: can_manage_courses');
      }
    }







    if (courseId !== undefined && courseId !== null && courseId !== '') {
      if (!row.course_id) {
        return _sendError(res, 400, 'courseId cannot be set at finalize time');
      }
      if (String(courseId) !== String(row.course_id)) {
        return _sendError(res, 400, 'courseId does not match the upload');
      }
    }




    let head;
    try {
      head = await headObject({ bucket: row.bucket, key: row.object_key });
    } catch (e) {
      const code = e?.$metadata?.httpStatusCode;
      if (code === 404 || String(e?.name || '').includes('NotFound')) {
        logger.warn(`[finalize] object missing: bucket=${row.bucket} key=${row.object_key}`);
        return _sendError(res, 409, 'object not found in storage — upload may have failed');
      }
      throw e;
    }





    const patch = [];
    const patchArgs = [];
    let n_ = 1;
    if (contentType) {
      patch.push(`mime_type = $${n_++}`); patchArgs.push(contentType);
    }






    if (metadataProvided) {
      patch.push(`metadata = $${n_++}`); patchArgs.push(metadata);
    }


    const reportedSize =
      head?.ContentLength !== undefined && head?.ContentLength !== null
        ? Number(head.ContentLength)
        : validatedSizeBytes;
    if (reportedSize !== null) {
      patch.push(`size_bytes = $${n_++}`); patchArgs.push(reportedSize);
    }
    patch.push(`status = 'processing'`);
    patch.push(`updated_at = now()`);












    const claim = await req.db.query(
      `UPDATE public.file_objects SET ${patch.join(', ')}
        WHERE id = $${n_++} AND status = 'pending'
        RETURNING id`,
      [...patchArgs, fileObjectUuid],
    );
    if (claim.rows.length === 0) {

      const current = await req.db.query(
        `SELECT status FROM public.file_objects WHERE id = $1`,
        [fileObjectUuid],
      );
      const status = current.rows[0]?.status || 'unknown';
      return _sendError(
        res,
        409,
        `upload is already ${status} — it cannot be finalized again`,
      );
    }

    const job = await enqueuePostProcess({ fileObjectId: fileObjectUuid });






    if (req.dbCommit) await req.dbCommit();

    logger.info(`[finalize] fileObjectId=${fileObjectUuid} jobId=${job.id}`);
    return res.status(202).json({ jobId: job.id, fileObjectId: fileObjectUuid });
  } catch (e) {
    logger.error(`finalize failed: ${e?.message || e}`);
    next(e);
  }
});




router.post('/minio-avatars', getCurrentUser, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return _sendError(res, 400, 'file is required');
    const userId = _userId(req);
    if (!userId) return _sendError(res, 401, 'unauthenticated');






    if (req.file.buffer.length > 4 * 1024 * 1024) {
      return _sendError(
        res,
        413,
        'File too large for this upload path (>4MB). Use the presigned PUT upload instead.',
      );
    }

    const id = randomUUID();
    const objectKey = buildObjectKey({
      category: 'avatar',
      userId,
      originalName: req.file.originalname,
    });


    await req.db.query(
      `INSERT INTO public.file_objects
         (id, object_key, bucket, original_name, mime_type, category, user_id, uploaded_by, status)
       VALUES ($1, $2, $3, $4, $5, 'avatar', $6, $6, 'pending')`,
      [id, objectKey, BUCKETS.avatars, req.file.originalname, req.file.mimetype || null, userId],
    );

    let job;
    try {
      job = await enqueueUpload({
        fileObjectId: id,
        buffer: req.file.buffer,
        mimeType: req.file.mimetype,
      });
    } catch (e) {



      try {
        await req.db.query(`DELETE FROM public.file_objects WHERE id = $1`, [id]);
      } catch (cleanupErr) {
        logger.error(
          `[minio-avatars] failed to remove orphan file_objects row ${id}: ${cleanupErr?.message || cleanupErr}`,
        );
      }
      throw e;
    }








    if (req.dbCommit) await req.dbCommit();

    return res.status(202).json({ jobId: job.id, fileObjectId: id });
  } catch (e) {
    logger.error(`minio-avatars upload failed: ${e?.message || e}`);
    next(e);
  }
});





router.post('/minio-uploads', getCurrentUser, upload.single('file'), async (req, res, next) => {
  try {
    const userId = _userId(req);
    if (!userId) return _sendError(res, 401, 'unauthenticated');





    if (!(await _isCourseAdmin(req))) {
      return _sendError(res, 403, 'Missing permission: can_manage_courses');
    }

    if (!req.file) return _sendError(res, 400, 'file is required');

    let courseId = req.body.courseId || null;
    if (!courseId) {
      return _sendError(res, 400, 'courseId is required');
    }

    courseId = await _validateCourseId(courseId, req);
    let metadata = {};
    try {
      metadata = JSON.parse(req.body.metadata || '{}');
    } catch (_) {
      return _sendError(res, 400, 'metadata must be a JSON string');
    }
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return _sendError(res, 400, 'metadata must be a JSON object');
    }


    const metaCheck = _validateMetadata(metadata);
    if (!metaCheck.ok) {
      return _sendError(res, 400, metaCheck.error);
    }
    metadata = metaCheck.value;

    const id = randomUUID();
    const objectKey = buildObjectKey({
      category: 'course_material',
      userId,
      courseId,
      originalName: req.file.originalname,
    });







    if (req.file.buffer.length > 4 * 1024 * 1024) {
      return _sendError(
        res,
        413,
        'File too large for this upload path (>4MB). Use the presigned PUT upload instead.',
      );
    }

    await req.db.query(
      `INSERT INTO public.file_objects
         (id, object_key, bucket, original_name, mime_type, category, user_id, course_id, uploaded_by, status, metadata)
       VALUES ($1, $2, $3, $4, $5, 'course_material', $6, $7, $6, 'pending', $8)`,
      [
        id, objectKey, BUCKETS.uploads,
        req.file.originalname, req.file.mimetype || null,
        userId, courseId, metadata,
      ],
    );

    let job;
    try {
      job = await enqueueUpload({
        fileObjectId: id,
        buffer: req.file.buffer,
        mimeType: req.file.mimetype,
      });
    } catch (e) {



      try {
        await req.db.query(`DELETE FROM public.file_objects WHERE id = $1`, [id]);
      } catch (cleanupErr) {
        logger.error(
          `[minio-uploads] failed to remove orphan file_objects row ${id}: ${cleanupErr?.message || cleanupErr}`,
        );
      }
      throw e;
    }







    if (req.dbCommit) await req.dbCommit();

    return res.status(202).json({ jobId: job.id, fileObjectId: id });
  } catch (e) {
    logger.error(`minio-uploads upload failed: ${e?.message || e}`);
    next(e);
  }
});




router.get('/jobs/:jobId', getCurrentUser, async (req, res, next) => {
  try {



    const row = await getJobStatus(req.params.jobId, req.db);
    if (!row) return _sendError(res, 404, 'job not found');










    const userId = _userId(req);
    if (row.uploaded_by !== userId) {
      if (!(await _isCourseAdmin(req))) {
        return _sendError(res, 403, 'not your job');
      }
    }

    return res.json({
      status: row.status,
      errorMessage: row.error_message,
      fileObjectId: row.id,
      materialId: row.material_id,
      objectKey: row.object_key,
      sizeBytes: row.size_bytes ? Number(row.size_bytes) : null,





      bytesProcessed: row.bytes_processed ? Number(row.bytes_processed) : null,
    });
  } catch (e) { next(e); }
});




router.get('/files/:fileObjectId/url', getCurrentUser, async (req, res, next) => {
  try {




    const fileObjectUuid = _requireUuid(req.params.fileObjectId, 'fileObjectId');
    const r = await req.db.query(
      `SELECT id, object_key, bucket, uploaded_by, status, category
         FROM public.file_objects WHERE id = $1`,
      [fileObjectUuid],
    );
    if (r.rows.length === 0) return _sendError(res, 404, 'file not found');
    const row = r.rows[0];
    if (row.status !== 'ready') return _sendError(res, 409, `file is ${row.status}`);

    const userId = _userId(req);







    if (row.category === 'avatar' && row.uploaded_by !== userId) {
      return _sendError(res, 403, 'not your file');
    }

    const url = await presignGet({ bucket: row.bucket, key: row.object_key, expiresIn: 300 });
    return res.json({ url, expiresIn: 300 });
  } catch (e) { next(e); }
});









router.get('/files/:fileObjectId/download', getCurrentUser, async (req, res, next) => {
  try {
    const fileObjectUuid = _requireUuid(req.params.fileObjectId, 'fileObjectId');
    const r = await req.db.query(
      `SELECT id, object_key, bucket, uploaded_by, status, original_name, mime_type, category
         FROM public.file_objects WHERE id = $1`,
      [fileObjectUuid],
    );
    if (r.rows.length === 0) return _sendError(res, 404, 'file not found');
    const row = r.rows[0];
    if (row.status !== 'ready') return _sendError(res, 409, `file is ${row.status}`);

    const userId = _userId(req);


    if (row.category === 'avatar' && row.uploaded_by !== userId) {
      return _sendError(res, 403, 'not your file');
    }

    const obj = await getS3Client().send(new GetObjectCommand({
      Bucket: row.bucket,
      Key: row.object_key,
    }));






    const filename = row.original_name || 'download';
    res.setHeader('Content-Type', row.mime_type || obj.ContentType || 'application/octet-stream');
    res.setHeader('Content-Length', String(obj.ContentLength || ''));
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(filename)}"`);

    if (obj.Body && typeof obj.Body.pipe === 'function') {
      obj.Body.pipe(res);
    } else if (obj.Body) {

      const web =  (obj.Body);
      for await (const chunk of web) {
        res.write(Buffer.from(chunk));
      }
      res.end();
    } else {
      res.end();
    }
  } catch (e) { next(e); }
});








router.delete('/files/:fileObjectId', getCurrentUser, async (req, res, next) => {
  try {
    const userId = _userId(req);
    if (!userId) return _sendError(res, 401, 'unauthenticated');

    const fileObjectUuid = _requireUuid(req.params.fileObjectId, 'fileObjectId');
    const r = await req.db.query(
      `SELECT id, object_key, bucket, uploaded_by, status, material_id
         FROM public.file_objects WHERE id = $1`,
      [fileObjectUuid],
    );
    if (r.rows.length === 0) return res.status(204).end();
    const row = r.rows[0];








    if (row.uploaded_by !== userId) {
      if (!(await _isCourseAdmin(req))) {
        return _sendError(res, 403, 'not your upload');
      }
    }

















    const db = req.db;
    if (!db) {
      return _sendError(res, 500, 'database client unavailable');
    }
    try {
      if (row.material_id) {
        await db.query(
          `DELETE FROM public.course_materials WHERE id = $1`,
          [row.material_id],
        );
      }
      await db.query(`DELETE FROM public.file_objects WHERE id = $1`, [fileObjectUuid]);
      if (req.dbCommit) await req.dbCommit();
    } catch (e) {
      if (req.dbRollback) { try { await req.dbRollback(); } catch (_) {  } }
      throw e;
    }












    if (row.material_id) {
      try {
        const { getRagIntegration } = await import('../cms_agent/ragIntegration.js');
        const rag = getRagIntegration();
        await rag.deleteMaterialChunksById(row.material_id);
      } catch (e) {
        logger.warn(
          `[storage DELETE] RAG cleanup failed for material ${row.material_id}: ${e?.message || e}`,
        );
      }
    }


    try {
      await deleteObject({ bucket: row.bucket, key: row.object_key });
    } catch (e) {
      logger.warn(`[storage DELETE] object cleanup failed: ${e?.message || e}`);
    }

    return res.status(204).end();
  } catch (e) { next(e); }
});

export default router;
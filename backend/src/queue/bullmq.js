

import { Queue, Worker } from 'bullmq';
import IORedisBase from 'ioredis';
import crypto from 'node:crypto';
import { logger } from '../utils/logger.js';
import { pool } from '../config/database.js';
import {
  BUCKETS,
  putObject,
  deleteObject,
  getS3Client,
} from '../storage_minio/client.js';
import { GetObjectCommand } from '@aws-sdk/client-s3';

const QUEUE_NAME = 'minio-uploads';
const WORKER_CONCURRENCY = Number(process.env.UPLOAD_WORKER_CONCURRENCY || 4);

function buildRedisConnection() {


  const url = process.env.REDIS_URL || 'redis://localhost:6379/0';
  return new IORedisBase(url, { maxRetriesPerRequest: null });
}


function _weekToInt(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

let _queue = null;
let _worker = null;







let _queueRedis = null;
let _workerRedis = null;

export function getUploadQueue() {
  if (!_queue) {
    _queueRedis = buildRedisConnection();
    _queue = new Queue(QUEUE_NAME, { connection: _queueRedis });
  }
  return _queue;
}


export function startUploadWorker() {
  if (_worker) return _worker;
  _workerRedis = buildRedisConnection();
  const queue = getUploadQueue();

  _worker = new Worker(QUEUE_NAME, async (job) => processJob(job), {
    connection: _workerRedis,
    concurrency: WORKER_CONCURRENCY,
  });

  _worker.on('completed', (job) => {
    logger.info(`[upload] job ${job.id} completed`);
  });
  _worker.on('failed', (job, err) => {
    logger.error(`[upload] job ${job?.id} failed: ${err?.message || err}`);
  });
  _worker.on('error', (err) => {
    logger.error(`[upload] worker error: ${err?.message || err}`);
  });

  logger.info(`[upload] worker started, concurrency=${WORKER_CONCURRENCY}`);
  return _worker;
}


export async function stopUploadWorker() {
  if (_worker) {
    await _worker.close();
    _worker = null;
  }
  if (_queue) {
    await _queue.close();
    _queue = null;
  }



  if (_workerRedis) {
    try { _workerRedis.disconnect(); } catch (_) {  }
    _workerRedis = null;
  }
  if (_queueRedis) {
    try { _queueRedis.disconnect(); } catch (_) {  }
    _queueRedis = null;
  }
}


async function processJob(job) {
  const data = job.data || {};
  const { fileObjectId } = data;
  if (!fileObjectId) throw new Error('job.data.fileObjectId is required');


  const fo = await pool.query(
    `SELECT * FROM public.file_objects WHERE id = $1`,
    [fileObjectId],
  );
  if (fo.rows.length === 0) throw new Error(`file_objects row ${fileObjectId} not found`);
  const row = fo.rows[0];



  await pool.query(
    `UPDATE public.file_objects
        SET job_id = $2,
            updated_at = now()
      WHERE id = $1`,
    [fileObjectId, String(job.id)],
  );

  const bucket = row.category === 'avatar' ? BUCKETS.avatars : BUCKETS.uploads;

  try {
    if (data.kind === 'post-process') {
      return await _processPostProcess({ job, fileObjectId, row, bucket });
    }

    return await _processUpload({ job, fileObjectId, row, bucket, mimeType: data.mimeType, bufferBase64: data.bufferBase64 });
  } catch (e) {







    const total = (job.opts && Number(job.opts.attempts)) || 1;
    const made = (job.attemptsMade != null ? Number(job.attemptsMade) : 0) + 1;
    const isFinal = made >= total;
    if (isFinal) {
      try {
        await pool.query(
          `UPDATE public.file_objects
              SET status = 'failed',
                  error_message = $2,
                  updated_at = now()
            WHERE id = $1
              AND status NOT IN ('ready')`,
          [fileObjectId, String(e?.message || e || 'unknown error').slice(0, 500)],
        );
        logger.error(`[upload] fileObjectId=${fileObjectId} permanently failed: ${e?.message || e}`);
      } catch (innerErr) {
        logger.error(`[upload] failed to mark row as failed: ${innerErr?.message || innerErr}`);
      }
    }
    throw e;
  }
}

async function _processPostProcess({ job, fileObjectId, row, bucket }) {










  const client = getS3Client();
  const obj = await client.send(new GetObjectCommand({
    Bucket: bucket,
    Key: row.object_key,
  }));
  const { body, sha } = await _streamToBufferWithProgress(
    obj.Body,
    async (bytesSoFar) => {



      if (bytesSoFar === 0 || bytesSoFar % (256 * 1024) < 16 * 1024) {
        try {
          await pool.query(
            `UPDATE public.file_objects
                SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{_bytes_processed}', to_jsonb($2::bigint)),
                    updated_at = now()
              WHERE id = $1`,
            [fileObjectId, bytesSoFar],
          );
        } catch (_) {  }
      }
    },
  );



















  let materialId = row.material_id;
  if (row.category === 'course_material' && !materialId) {
    const meta = row.metadata || {};












    const client = await pool.connect();
    let claimed = null;
    try {
      await client.query('BEGIN');
      const claim = await client.query(
        `SELECT id, material_id
           FROM public.file_objects
          WHERE id = $1
          FOR UPDATE`,
        [fileObjectId],
      );
      if (claim.rows.length === 0) throw new Error(`file_objects row ${fileObjectId} vanished`);
      if (claim.rows[0].material_id) {

        claimed = claim.rows[0].material_id;
      } else {
        const insert = await client.query(
          `INSERT INTO public.course_materials
             (course_id, title, description, type, file_type, url, week, metadata, uploaded_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING id`,
          [
            row.course_id,
            meta.title || row.original_name,
            meta.description || null,
            meta.material_type || 'theory',
            meta.file_type || 'pdf',
            `/api/v1/storage/files/${row.id}/url`,





            _weekToInt(meta.week),
            meta,
            row.uploaded_by,
          ],
        );
        claimed = insert.rows[0].id;
        await client.query(
          `UPDATE public.file_objects
              SET material_id = $2,
                  updated_at   = now()
            WHERE id = $1`,
          [fileObjectId, claimed],
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch (_) {  }
      throw e;
    } finally {
      client.release();
    }
    materialId = claimed;











    if (row.course_id && materialId) {
      const { ingestMaterial } = await import('../services/ragService.js');
      if (typeof ingestMaterial === 'function') {
        await ingestMaterial({
          materialId,
          courseId: row.course_id,
          objectKey: row.object_key,
          bucket,
          filename: row.original_name,
          materialType: meta.material_type || 'theory',
          metadata: { title: meta.title || row.original_name },
        });
      }
    }
  }




  await pool.query(
    `UPDATE public.file_objects
        SET status = 'ready',
            size_bytes = $2,
            checksum_sha256 = $3,
            material_id = $4,
            metadata = metadata - '_bytes_processed',
            updated_at = now()
      WHERE id = $1`,
    [fileObjectId, body.length, sha, materialId],
  );

  logger.info(`[post-process] fileObjectId=${fileObjectId} sha=${sha.slice(0, 12)}… materialId=${materialId}`);
  return { fileObjectId, objectKey: row.object_key, materialId };
}

async function _processUpload({ job, fileObjectId, row, bucket, mimeType, bufferBase64 }) {
  await pool.query(
    `UPDATE public.file_objects SET status = 'uploading', updated_at = now() WHERE id = $1`,
    [fileObjectId],
  );

  if (!bufferBase64) {
    throw new Error('job.data.bufferBase64 missing — large-file staging not yet implemented');
  }
  const body = Buffer.from(bufferBase64, 'base64');

  await putObject({ bucket, key: row.object_key, body, contentType: mimeType || row.mime_type });

  const sha = crypto.createHash('sha256').update(body).digest('hex');

  let materialId = row.material_id;
  if (row.category === 'course_material' && !materialId) {
    const meta = row.metadata || {};



    const client = await pool.connect();
    let claimed = null;
    try {
      await client.query('BEGIN');
      const claim = await client.query(
        `SELECT id, material_id
           FROM public.file_objects
          WHERE id = $1
          FOR UPDATE`,
        [fileObjectId],
      );
      if (claim.rows.length === 0) throw new Error(`file_objects row ${fileObjectId} vanished`);
      if (claim.rows[0].material_id) {
        claimed = claim.rows[0].material_id;
      } else {
        const insert = await client.query(
          `INSERT INTO public.course_materials
             (course_id, title, description, type, file_type, url, week, metadata, uploaded_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING id`,
          [
            row.course_id,
            meta.title || row.original_name,
            meta.description || null,
            meta.material_type || 'theory',
            meta.file_type || 'pdf',
            `/api/v1/storage/files/${row.id}/url`,
            _weekToInt(meta.week),
            meta,
            row.uploaded_by,
          ],
        );
        claimed = insert.rows[0].id;
        await client.query(
          `UPDATE public.file_objects
              SET material_id = $2,
                  updated_at   = now()
            WHERE id = $1`,
          [fileObjectId, claimed],
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch (_) {  }
      throw e;
    } finally {
      client.release();
    }
    materialId = claimed;
  }

  await pool.query(
    `UPDATE public.file_objects
        SET status = 'ready', size_bytes = $2, checksum_sha256 = $3, material_id = $4, updated_at = now()
      WHERE id = $1`,
    [fileObjectId, body.length, sha, materialId],
  );

  return { fileObjectId, objectKey: row.object_key, materialId };
}


async function _streamToBuffer(stream) {
  if (!stream) return Buffer.alloc(0);
  if (Buffer.isBuffer(stream)) return stream;

  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}


async function _streamToBufferWithProgress(stream, onProgress) {
  if (!stream) return { body: Buffer.alloc(0), sha: '' };
  if (Buffer.isBuffer(stream)) {
    const sha = crypto.createHash('sha256').update(stream).digest('hex');
    return { body: stream, sha };
  }
  const hash = crypto.createHash('sha256');
  const chunks = [];
  let bytesSoFar = 0;
  try {
    for await (const chunk of stream) {
      const c = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      chunks.push(c);
      hash.update(c);
      bytesSoFar += c.length;
      try {
        await onProgress(bytesSoFar);
      } catch (_) {

      }
    }
  } finally {



    try { await onProgress(bytesSoFar); } catch (_) {}
  }
  return { body: Buffer.concat(chunks), sha: hash.digest('hex') };
}


export async function enqueueUpload({ fileObjectId, buffer, mimeType }) {
  const queue = getUploadQueue();
  if (buffer.length > 4 * 1024 * 1024) {
    throw new Error('File too large for in-payload transport (>4MB). Use presigned PUT instead.');
  }
  return queue.add('upload', {
    kind: 'upload',
    fileObjectId,
    bufferBase64: buffer.toString('base64'),
    mimeType,
  }, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: 1000,
    removeOnFail: 1000,
  });
}


export async function enqueuePostProcess({ fileObjectId }) {
  const queue = getUploadQueue();
  return queue.add('upload', {
    kind: 'post-process',
    fileObjectId,
  }, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: 1000,
    removeOnFail: 1000,
  });
}


export async function getJobStatus(idOrJobId, client = null) {
  const key = String(idOrJobId);


  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key);
  const where = isUuid ? 'id = $1' : 'job_id = $1';





  const db = client || pool;
  const r = await db.query(
    `SELECT id, status, error_message, material_id, job_id, object_key, size_bytes,
            uploaded_by, category,
            -- The cast is guarded: '_bytes_processed' is written by this
            -- worker as a bigint, but the column is JSONB and the value
            -- could be anything a client put there. A bare bigint cast
            -- makes the WHOLE query fail with a 22P02 invalid-input error,
            -- which turns every poll of that upload into a 500 -- for an
            -- upload that is actually fine. Cast defensively, fall back
            -- to NULL.
            CASE
              WHEN metadata->>'_bytes_processed' ~ '^-?[0-9]+$'
                THEN (metadata->>'_bytes_processed')::bigint
              ELSE NULL
            END AS bytes_processed
       FROM public.file_objects
       WHERE ${where}`,
    [key],
  );
  if (r.rows.length === 0) return null;
  return r.rows[0];
}


export async function cleanupFailedObject({ bucket, key }) {
  try {
    await deleteObject({ bucket, key });
  } catch (e) {
    logger.warn(`[upload] cleanup failed for ${bucket}/${key}: ${e.message}`);
  }
}
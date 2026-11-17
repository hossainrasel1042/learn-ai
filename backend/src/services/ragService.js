

import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, extname, basename } from 'node:path';

import { GetObjectCommand } from '@aws-sdk/client-s3';

import { getS3Client } from '../storage_minio/client.js';
import { getRagIntegration } from '../cms_agent/ragIntegration.js';
import { logger } from '../utils/logger.js';


const SUPPORTED_EXTENSIONS = new Set([
  '.pdf',
  '.pptx',
  '.ppt',
  '.py',
  '.js',
  '.ts',
  '.java',
  '.cpp',
  '.c',
  '.go',
  '.rs',
  '.rb',
]);


async function _downloadToTempFile({ bucket, key }, filename) {
  const client = getS3Client();
  const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));

  const chunks = [];
  for await (const chunk of res.Body) {
    chunks.push(chunk);
  }
  const body = Buffer.concat(chunks);

  const dir = await mkdtemp(join(tmpdir(), 'learnai-rag-'));
  try {

    const safeName = basename(String(filename || 'material')).replace(/[^a-zA-Z0-9._-]+/g, '_');
    const filePath = join(dir, safeName || 'material');
    await writeFile(filePath, body);
    return { filePath, dir };
  } catch (e) {



    try {
      await rm(dir, { recursive: true, force: true });
    } catch (_) {

    }
    throw e;
  }
}


export async function ingestMaterial({
  materialId,
  courseId,
  courseNo = null,
  objectKey,
  bucket,
  filename = null,
  materialType = 'theory',
  metadata = null,
}) {
  let dir = null;
  try {
    if (!objectKey || !bucket) {
      logger.warn(`[rag] ingest skipped for ${materialId}: missing bucket/objectKey`);
      return 0;
    }

    const ext = extname(String(filename || objectKey)).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(ext)) {
      logger.info(`[rag] ingest skipped for ${materialId}: unsupported type ${ext || '(none)'}`);
      return 0;
    }

    const tmp = await _downloadToTempFile({ bucket, key: objectKey }, filename || objectKey);
    dir = tmp.dir;

    const rag = getRagIntegration();
    const chunks = await rag.ingestMaterial({
      filePath: tmp.filePath,
      materialId: String(materialId),
      courseId: String(courseId),
      courseNo: courseNo || '',
      materialType,





      metadata: {
        ...(metadata || {}),
        source_file: objectKey,
        source_object_key: objectKey,
      },
    });

    logger.info(`[rag] ingested ${chunks} chunks for material ${materialId}`);
    return chunks;
  } catch (e) {
    logger.error(`[rag] ingest failed for material ${materialId}: ${e?.message || e}`);
    throw e;
  } finally {
    if (dir) {
      try {
        await rm(dir, { recursive: true, force: true });
      } catch (_) {

      }
    }
  }
}

export default { ingestMaterial };

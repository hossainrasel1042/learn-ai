






import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

import { ensureMinioBuckets, BUCKETS, getS3Client } from '../src/storage_minio/client.js';
import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import { startUploadWorker, stopUploadWorker, getJobStatus } from '../src/queue/bullmq.js';
import { createTestUser } from './_testAuth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let passed = 0, failed = 0;
const ok  = (m) => { console.log(`  ✓ ${m}`); passed++; };
const bad = (m, e) => { console.log(`  ✗ ${m}${e ? `: ${e}` : ''}`); failed++; };

const dbClient = new pg.Client({ connectionString: process.env.DB_URL });
await dbClient.connect();

const email = `minio-test-${Date.now()}@battle-test.local`;
const { token, userId } = await createTestUser(email, 'MinioTest-2026!', dbClient);
ok(`signed up + signed in ${userId.slice(0, 8)}`);


try {
    await ensureMinioBuckets();
    ok('MinIO buckets ensured');
} catch (e) {
    bad('ensure buckets', e.message);
}


startUploadWorker();
ok('upload worker started');



const { enqueueUpload } = await import('../src/queue/bullmq.js');
const { randomUUID } = await import('node:crypto');
const tmpFile = path.join('/tmp', `minio-smoke-${Date.now()}.txt`);
fs.writeFileSync(tmpFile, `hello from ${email} at ${new Date().toISOString()}\n`);
const fileBuffer = fs.readFileSync(tmpFile);
ok(`created ${fileBuffer.length}-byte sample file`);

const foId = randomUUID();
const objectKey = `other/smoke/${Date.now()}-${fileBuffer.length}.txt`;
await dbClient.query(
    `INSERT INTO public.file_objects (id, object_key, bucket, original_name, mime_type, category, user_id, uploaded_by, status)
     VALUES ($1, $2, $3, $4, 'text/plain', 'other', $5, $5, 'pending')`,
    [foId, objectKey, BUCKETS.uploads, path.basename(tmpFile), userId],
);
ok('file_objects row inserted (status=pending)');

const job = await enqueueUpload({
    fileObjectId: foId,
    buffer: fileBuffer,
    mimeType: 'text/plain',
});
ok(`job enqueued: ${job.id}`);


let final = null;
for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 500));
    final = await getJobStatus(String(job.id));
    if (final && (final.status === 'ready' || final.status === 'failed')) break;
}
if (final && final.status === 'ready' && Number(final.size_bytes) === fileBuffer.length) {
    ok(`worker reports ready (size=${final.size_bytes})`);
} else {
    bad('worker final status', JSON.stringify(final));
    console.log('  (this is expected when Redis is not running)');
}


const s3 = getS3Client();
const head = await s3.send(new ListObjectsV2Command({ Bucket: BUCKETS.uploads, Prefix: 'other/smoke/' }));
const found = (head.Contents || []).find((o) => o.Key === objectKey);
if (found) {
    ok(`object present in MinIO bucket ${BUCKETS.uploads} at ${found.Key}`);
} else {
    bad('object missing from MinIO', `prefix=other/smoke/ keys=${(head.Contents || []).map(c => c.Key).join(',')}`);
}


const fo = await dbClient.query(`SELECT status, checksum_sha256, size_bytes FROM public.file_objects WHERE id = $1`, [foId]);
const row = fo.rows[0];
if (row.status === 'ready' && row.size_bytes === String(fileBuffer.length) && row.checksum_sha256?.length === 64) {
    ok(`file_objects row finalized (status=${row.status} sha256=${row.checksum_sha256.slice(0, 8)}…)`);
} else {
    bad('file_objects final state', JSON.stringify(row));
}


fs.unlinkSync(tmpFile);
await stopUploadWorker();
await dbClient.end();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
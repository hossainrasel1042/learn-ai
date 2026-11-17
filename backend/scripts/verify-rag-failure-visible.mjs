import 'dotenv/config';

import { ingestMaterial } from '../src/services/ragService.js';
import { getRagIntegration } from '../src/cms_agent/ragIntegration.js';

let passed = 0;
let failed = 0;
const ok = (m) => { console.log(`  ✓ ${m}`); passed++; };
const bad = (m, e) => { console.log(`  ✗ ${m}${e ? `: ${e}` : ''}`); failed++; };

console.log('\n--- RAG ingestion failure visibility ---');

const rag = getRagIntegration();
const originalIngestFile = rag.ingestionService.ingestFile.bind(rag.ingestionService);
rag.ingestionService.ingestFile = async () => {
  throw new Error('SENTINEL_EMBEDDER_FAILURE');
};

const { pool } = await import('../src/config/database.js');
const { BUCKETS, putObject } = await import('../src/storage_minio/client.js');

const sentinelKey = 'other/sentinel/ingest-failure-visibility.py';
await putObject({
  bucket: BUCKETS.uploads,
  key: sentinelKey,
  body: Buffer.from('# sentinel body for the ingestion failure visibility test\nprint("hi")\n'),
  contentType: 'text/x-python',
});

try {
  const result = await ingestMaterial({
    materialId: 'test-material-visibility',
    courseId: 'test-course-visibility',
    objectKey: sentinelKey,
    bucket: BUCKETS.uploads,
    filename: 'ingest-failure-visibility.py',
    materialType: 'theory',
    metadata: { title: 'test' },
  });

  if (result === 0) {
    bad('ingestMaterial must not return 0 on failure — it must throw', `returned ${result}`);
  } else {
    ok(`ingestMaterial returned ${result}`);
  }
} catch (e) {
  const msg = String(e?.message || e);
  if (msg.includes('SENTINEL_EMBEDDER_FAILURE')) {
    ok('ingestMaterial threw the underlying embedder error (SENTINEL_EMBEDDER_FAILURE)');
  } else {
    bad('ingestMaterial threw the underlying embedder error', msg);
  }
} finally {
  rag.ingestionService.ingestFile = originalIngestFile;
}

const fs = await import('node:fs/promises');
const bullmqSrc = await fs.readFile(
  new URL('../src/queue/bullmq.js', import.meta.url),
  'utf8',
);
const postProcessBlock = bullmqSrc.slice(
  bullmqSrc.indexOf('async function _processPostProcess'),
  bullmqSrc.indexOf('async function _processUpload'),
);

if (/setImmediate/.test(postProcessBlock)) {
  bad('the post-process job must await the ingest, not fire-and-forget it');
} else if (/await ingestMaterial\(/.test(postProcessBlock)) {
  ok('the post-process job awaits ingestMaterial (no fire-and-forget)');
} else {
  bad('the post-process job must await ingestMaterial');
}

const ragServiceSrc = await fs.readFile(
  new URL('../src/services/ragService.js', import.meta.url),
  'utf8',
);
const ragServiceIngest = ragServiceSrc.slice(
  ragServiceSrc.indexOf('export async function ingestMaterial'),
);
const ragServiceCatch = ragServiceIngest.slice(ragServiceIngest.indexOf('} catch (e) {'));
if (/catch \(e\) \{[\s\S]{0,400}?throw e;/.test(ragServiceCatch)) {
  ok('ragService.ingestMaterial rethrows (does not swallow)');
} else {
  bad('ragService.ingestMaterial must rethrow, not swallow');
}

const ragIntegrationSrc = await fs.readFile(
  new URL('../src/cms_agent/ragIntegration.js', import.meta.url),
  'utf8',
);
const ragIntegrationIngest = ragIntegrationSrc.slice(
  ragIntegrationSrc.indexOf('async ingestMaterial('),
  ragIntegrationSrc.indexOf('async deleteMaterialChunks('),
);
if (/catch \(e\) \{[\s\S]{0,600}?throw e;/.test(ragIntegrationIngest)) {
  ok('ragIntegration.ingestMaterial rethrows (does not swallow)');
} else {
  bad('ragIntegration.ingestMaterial must rethrow, not swallow');
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);

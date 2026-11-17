import 'dotenv/config';

import { pool } from '../src/config/database.js';
import { ingestMaterial } from '../src/services/ragService.js';
import { getVectorStore } from '../src/services/vectorStoreService.js';
import { BUCKETS } from '../src/storage_minio/client.js';
import { logger } from '../src/utils/logger.js';

const COURSE_ID = process.argv[2] || null;

let passed = 0;
let failed = 0;

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function main() {
  const params = COURSE_ID ? [COURSE_ID] : [];
  const where = COURSE_ID ? 'AND cm.course_id = $1' : '';
  const { rows } = await pool.query(
    `SELECT cm.id AS material_id,
            cm.course_id,
            cm.title,
            cm.type AS material_type,
            fo.object_key,
            fo.original_name,
            fo.category
       FROM public.course_materials cm
       JOIN public.file_objects fo ON fo.material_id = cm.id
      WHERE fo.status = 'ready'
        ${where}
      ORDER BY cm.created_at`,
    params,
  );

  console.log(`\nBackfilling ${rows.length} material(s)${COURSE_ID ? ` for course ${COURSE_ID}` : ''}\n`);

  const vectorStore = getVectorStore('learnai');

  for (const row of rows) {
    const label = `${row.title} (${row.original_name})`;
    console.log(`→ ${label}`);

    const bucket = row.category === 'avatar' ? BUCKETS.avatars : BUCKETS.uploads;

    let chunks = 0;
    try {
      chunks = await ingestMaterial({
        materialId: row.material_id,
        courseId: row.course_id,
        objectKey: row.object_key,
        bucket,
        filename: row.original_name,
        materialType: row.material_type || 'theory',
        metadata: { title: row.title },
      });
    } catch (e) {
      check(`ingest ${label}`, false, e?.message || String(e));
      continue;
    }

    check(`ingest ${label}`, chunks > 0, `${chunks} chunks`);
  }

  console.log('\nChecking Chroma retrieval…');
  for (const courseId of new Set(rows.map((r) => r.course_id).filter(Boolean))) {
    const chunks = await vectorStore.getByFilter({ course_id: String(courseId) }, 200);
    check(`chunks retrievable for course ${courseId}`, (chunks?.length || 0) > 0, `${chunks?.length || 0} chunks`);
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main()
  .catch((e) => {
    logger.error(`backfill failed: ${e?.message || e}`);
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    process.exit(process.exitCode ?? 0);
  });

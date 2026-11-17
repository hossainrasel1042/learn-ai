import 'dotenv/config';

import pg from 'pg';
import { API_BASE, createTestUser } from './_testAuth.js';

let passed = 0;
let failed = 0;
const ok = (m) => { console.log(`  ✓ ${m}`); passed++; };
const bad = (m, e) => { console.log(`  ✗ ${m}${e ? `: ${e}` : ''}`); failed++; };

console.log('\n--- Client disconnect must not discard a write ---');

const db = new pg.Client({ connectionString: process.env.DB_URL });
await db.connect();

const email = `disconnectloss-${Date.now()}@e2e.local`;
const password = 'DisconnectLoss-2026!';

let token;
try {
  ({ token } = await createTestUser(email, password, db));
  ok('signed up a throwaway user');
} catch (e) {
  bad('could not create the test user', e?.message || e);
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(1);
}

const DELAYS = [10, 50, 80, 100, 120, 140, 160, 180, 220, 400];

const lost = [];

for (const delay of DELAYS) {
  const title = `Disconnect loss probe ${delay}ms ${Date.now()}`;
  const ctrl = new AbortController();

  const req = fetch(`${API_BASE}/community/posts`, {
    method: 'POST',
    signal: ctrl.signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      title,
      content: 'The client hangs up immediately.',
      category: 'general',
    }),
  });

  await new Promise((r) => setTimeout(r, delay));
  ctrl.abort();
  await req.catch(() => {  });

  await new Promise((r) => setTimeout(r, 3000));

  const rows = await db.query(
    'SELECT id FROM community_posts WHERE title = $1',
    [title],
  );

  if (rows.rows.length === 1) {
    ok(`an abort at ${delay}ms kept the post`);
  } else {
    lost.push(delay);
    bad(`an abort at ${delay}ms lost the post`, `found ${rows.rows.length} rows`);
  }

  await db.query('DELETE FROM community_posts WHERE title = $1', [title]).catch(() => {  });
}

if (lost.length === 0) {
  ok('no write was discarded at any abort timing');
} else {
  bad(`writes were discarded at abort timings: ${lost.join('ms, ')}ms`);
}

const failedTitle = `Disconnect rollback probe ${Date.now()}`;
const badRes = await fetch(`${API_BASE}/community/posts`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({}),
});
if (badRes.status === 400) {
  const rows = await db.query(
    'SELECT id FROM community_posts WHERE title = $1',
    [failedTitle],
  );
  if (rows.rows.length === 0) {
    ok('a rejected request leaves nothing behind');
  } else {
    bad('a rejected request left a row behind');
  }
} else {
  bad(`the invalid-payload request should answer 400, got ${badRes.status}`);
}

await db.query('DELETE FROM community_posts WHERE title LIKE $1', ['Disconnect loss probe %']).catch(() => {  });
await db.query('DELETE FROM community_posts WHERE title LIKE $1', ['Disconnect rollback probe %']).catch(() => {  });
await db.query('DELETE FROM public.profiles WHERE email = $1', [email]).catch(() => {  });
await db.end();

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);

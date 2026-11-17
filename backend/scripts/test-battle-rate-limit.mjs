









import 'dotenv/config';
import { io as ioc } from '../../frontend/node_modules/socket.io-client/build/esm/index.js';
import pg from 'pg';

import { createTestUser } from './_testAuth.js';

const BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/api\/v1\/?$/, '');
const TEST_PASSWORD = 'BattleTest-2026!';

const dbClient = new pg.Client({ connectionString: process.env.DB_URL });
await dbClient.connect();

let passed = 0;
let failed = 0;
const ok  = (m) => { console.log(`  ✓ ${m}`); passed++; };
const bad = (m, e) => { console.log(`  ✗ ${m}${e ? `: ${e}` : ''}`); failed++; };

const email = `battle-rl-${Date.now()}@battle-test.local`;
const { token, userId } = await createTestUser(email, TEST_PASSWORD, dbClient);
ok(`signed up + signed in ${userId.slice(0, 8)}`);

const courseRes = await dbClient.query(`SELECT id FROM public.courses LIMIT 1`);
const courseId = courseRes.rows[0].id;

const before = await dbClient.query(
    `SELECT COUNT(*)::int AS n FROM public.quiz_battle_matches WHERE player_one = $1 OR player_two = $1`,
    [userId],
);

const s = ioc(BASE, {
    transports: ['websocket'],
    auth: { token },
    extraHeaders: { cookie: `sb-access-token=${token}` },
});
const rateRejections = [];
s.on('battle:rate-limit-rejected', (d) => rateRejections.push(d));
s.on('battle:error', (d) => console.log(`  ! battle:error: ${d.message || JSON.stringify(d)}`));

await new Promise((r) => s.on('connect', r));
ok('connected');


for (let i = 0; i < 5; i++) {
    s.emit('battle:queue', { courseId });
}
await new Promise((r) => setTimeout(r, 1500));

if (rateRejections.length === 4) {
    ok(`received exactly 4 rate-limit-rejected events`);
} else {
    bad('rate-limit count', `expected 4 rejections, got ${rateRejections.length}`);
}
if (rateRejections.every((r) => r.action === 'battle:queue')) {
    ok('all rejections target the right action');
} else {
    bad('rejection action', JSON.stringify(rateRejections.map(r => r.action)));
}
if (rateRejections.every((r) => typeof r.retryAfterMs === 'number' && r.retryAfterMs > 0)) {
    ok('all rejections include positive retryAfterMs');
} else {
    bad('retryAfterMs', JSON.stringify(rateRejections.map(r => r.retryAfterMs)));
}

const after = await dbClient.query(
    `SELECT COUNT(*)::int AS n FROM public.quiz_battle_matches WHERE player_one = $1 OR player_two = $1`,
    [userId],
);
if (after.rows[0].n === before.rows[0].n) {
    ok(`no extra match rows created (before=${before} after=${after})`);
} else {
    bad('match rows', `before=${before} after=${after}`);
}

s.disconnect();
await dbClient.end();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
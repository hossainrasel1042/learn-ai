
import 'dotenv/config';
import { io as ioc } from '../../frontend/node_modules/socket.io-client/build/esm/index.js';
import pg from 'pg';

import { createTestUser } from './_testAuth.js';

const BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/api\/v1\/?$/, '');
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD || 'BattleTest-2026!';

const dbClient = new pg.Client({ connectionString: process.env.DB_URL });
await dbClient.connect();

let passed = 0;
let failed = 0;
const ok = (m) => { console.log(`  ✓ ${m}`); passed++; };
const bad = (m, e) => { console.log(`  ✗ ${m}${e ? `: ${e}` : ''}`); failed++; };

console.log('\n--- Battle matchmaking: different level scores ---');

const emailA = `battle-diff-a-${Date.now()}@battle-test.local`;
const emailB = `battle-diff-b-${Date.now()}@battle-test.local`;

const { token: tokenA, userId: userA } = await createTestUser(emailA, TEST_PASSWORD, dbClient);
const { token: tokenB, userId: userB } = await createTestUser(emailB, TEST_PASSWORD, dbClient);
ok(`signed up two distinct users ${userA.slice(0, 8)} / ${userB.slice(0, 8)}`);


const LEVEL_A = 1000;
const LEVEL_B = 1234;

for (const [userId, level] of [[userA, LEVEL_A], [userB, LEVEL_B]]) {
    await dbClient.query(
        `INSERT INTO public.quiz_battle_profiles (user_id, level_score)
         VALUES ($1, $2)
         ON CONFLICT (user_id) DO UPDATE SET level_score = EXCLUDED.level_score`,
        [userId, level],
    );
}
ok(`forced different level scores: ${LEVEL_A} vs ${LEVEL_B}`);

const verify = await dbClient.query(
    `SELECT user_id, level_score FROM public.quiz_battle_profiles
      WHERE user_id IN ($1, $2) ORDER BY level_score`,
    [userA, userB],
);
if (verify.rows.length === 2 && verify.rows[0].level_score !== verify.rows[1].level_score) {
    ok(`DB confirms the two players have different levels (${verify.rows[0].level_score} vs ${verify.rows[1].level_score})`);
} else {
    bad('could not force different level scores', JSON.stringify(verify.rows));
}

const courseRes = await dbClient.query(`SELECT c.id, c.name FROM public.courses c LIMIT 1`);
if (courseRes.rows.length === 0) {
    console.error('No courses in DB — create one first');
    process.exit(2);
}
const courseId = courseRes.rows[0].id;
console.log(`Using course ${courseRes.rows[0].name} (${courseId})`);

const sA = ioc(BASE, {
    transports: ['websocket'],
    auth: { token: tokenA },
    extraHeaders: { cookie: `sb-access-token=${tokenA}` },
});
const sB = ioc(BASE, {
    transports: ['websocket'],
    auth: { token: tokenB },
    extraHeaders: { cookie: `sb-access-token=${tokenB}` },
});

sA.on('connect_error', (e) => console.log(`  ! A connect_error: ${e.message}`));
sB.on('connect_error', (e) => console.log(`  ! B connect_error: ${e.message}`));
sA.on('battle:error', (e) => console.log(`  ! A battle:error: ${e.message || JSON.stringify(e)}`));
sB.on('battle:error', (e) => console.log(`  ! B battle:error: ${e.message || JSON.stringify(e)}`));

await Promise.all([
    new Promise((r, j) => { sA.on('connect', r); sA.on('connect_error', j); }),
    new Promise((r, j) => { sB.on('connect', r); sB.on('connect_error', j); }),
]);
ok('both sockets connected');

const matchedA = new Promise((resolve) => sA.once('battle:matched', resolve));
const matchedB = new Promise((resolve) => sB.once('battle:matched', resolve));

const timeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms));

console.log('  · A queues...');
sA.emit('battle:queue', { courseId });

await new Promise((r) => setTimeout(r, 4_000));

console.log('  · B queues...');
sB.emit('battle:queue', { courseId });

let mA = null;
let mB = null;
const queuedAt = Date.now();
try {
    [mA, mB] = await Promise.all([
        Promise.race([matchedA, timeout(45_000)]),
        Promise.race([matchedB, timeout(45_000)]),
    ]);
} catch (e) {
    bad('players with different levels were NOT matched', e.message);
}

const matchedAfterMs = Date.now() - queuedAt;
if (mA && mB) {
    if (matchedAfterMs >= 10_000) {
        ok(`matched after ${(matchedAfterMs / 1000).toFixed(1)}s (widened path — not the exact-level bucket)`);
    } else {
        bad('matched too fast — the test did not exercise the widened path', `${matchedAfterMs}ms`);
    }
}

if (mA && mB) {
    ok('both players received battle:matched');
    if (mA.matchId && mB.matchId && mA.matchId === mB.matchId) {
        ok(`both matched to the same match ${mA.matchId.slice(0, 8)}`);
    } else {
        bad('match ids differ', `${mA.matchId} vs ${mB.matchId}`);
    }
    if (mA.opponent?.id === userB && mB.opponent?.id === userA) {
        ok('each player sees the other as their opponent');
    } else {
        bad('opponent identity wrong', `A sees ${mA.opponent?.id}, B sees ${mB.opponent?.id}`);
    }
    if (mA.opponent?.levelScore === LEVEL_B && mB.opponent?.levelScore === LEVEL_A) {
        ok('opponent level scores carried across correctly');
    } else {
        bad('opponent level scores wrong', `A sees ${mA.opponent?.levelScore}, B sees ${mB.opponent?.levelScore}`);
    }
    if (mA.questions?.length > 0) {
        ok(`received ${mA.questions.length} questions`);
    } else {
        bad('no questions received');
    }
} else {
    bad('no battle:matched payload');
}

sA.emit('battle:cancel');
sB.emit('battle:cancel');
await new Promise((r) => setTimeout(r, 500));
sA.close();
sB.close();
await dbClient.end();

console.log(`\n--- ${passed} passed, ${failed} failed ---`);
process.exit(failed > 0 ? 1 : 0);

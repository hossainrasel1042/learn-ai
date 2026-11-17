















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
const ok  = (m) => { console.log(`  ✓ ${m}`); passed++; };
const bad = (m, e) => { console.log(`  ✗ ${m}${e ? `: ${e}` : ''}`); failed++; };

console.log('\n--- Socket smoke (assumes backend on :8000) ---');

const u1Email = `battle-p1-${Date.now()}@battle-test.local`;
const u2Email = `battle-p2-${Date.now()}@battle-test.local`;

const { token: t1, userId: u1 } = await createTestUser(u1Email, TEST_PASSWORD, dbClient);
const { token: t2, userId: u2 } = await createTestUser(u2Email, TEST_PASSWORD, dbClient);
ok(`signed up test users ${u1.slice(0, 8)} / ${u2.slice(0, 8)}`);
ok(`signed in both users, got access tokens`);


const courseRes = await dbClient.query(`SELECT c.id, c.name FROM public.courses c LIMIT 1`);
if (courseRes.rows.length === 0) {
    console.error('No courses in DB — create one first');
    process.exit(2);
}
const courseId = courseRes.rows[0].id;
console.log(`Using course ${courseRes.rows[0].name} (${courseId})`);





console.log(`Connecting two sockets...`);

const s1 = ioc(BASE, {
    transports: ['websocket'],
    auth: { token: t1 },
    extraHeaders: { cookie: `sb-access-token=${t1}` },
});
const s2 = ioc(BASE, {
    transports: ['websocket'],
    auth: { token: t2 },
    extraHeaders: { cookie: `sb-access-token=${t2}` },
});

const matched1 = new Promise((resolve) => s1.once('battle:matched', resolve));
const matched2 = new Promise((resolve) => s2.once('battle:matched', resolve));
const ended1 = new Promise((resolve) => s1.once('battle:ended', resolve));
const ended2 = new Promise((resolve) => s2.once('battle:ended', resolve));

s1.on('connect', () => console.log(`  · socket 1 connected: ${s1.id}`));
s2.on('connect', () => console.log(`  · socket 2 connected: ${s2.id}`));
s1.on('connect_error', (e) => console.log(`  ! socket 1 connect_error: ${e.message}`));
s2.on('connect_error', (e) => console.log(`  ! socket 2 connect_error: ${e.message}`));
s1.on('battle:error', (e) => console.log(`  ! socket 1 battle:error: ${e.message || JSON.stringify(e)}`));
s2.on('battle:error', (e) => console.log(`  ! socket 2 battle:error: ${e.message || JSON.stringify(e)}`));

await Promise.all([
    new Promise((r) => s1.on('connect', r)),
    new Promise((r) => s2.on('connect', r)),
]);
ok('both sockets connected');

console.log('  · both clients emitting battle:queue...');
s1.emit('battle:queue', { courseId });
s2.emit('battle:queue', { courseId });

const timeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms));

try {
    const [m1, m2] = await Promise.all([
        Promise.race([matched1, timeout(60_000)]),
        Promise.race([matched2, timeout(60_000)]),
    ]);
    if (m1?.matchId && m2?.matchId && m1.matchId === m2.matchId) {
        ok(`both matched to ${m1.matchId.slice(0,8)}`);
    } else {
        bad('match id', `${m1?.matchId} vs ${m2?.matchId}`);
    }
    if (m1.questions?.length > 0 && m2.questions?.length === m1.questions.length) {
        ok(`received ${m1.questions.length} questions`);
    } else {
        bad('question count mismatch', `${m1.questions?.length} vs ${m2.questions?.length}`);
    }
    if (m1.opponent && m2.opponent) {
        ok(`opponent info present on both sides`);
    } else {
        bad('opponent info missing');
    }


    let lastScores = null;
    const scorePromise = new Promise((resolve) => {
        s1.on('battle:score', (data) => { lastScores = data.scores; resolve(); });
    });
    s1.emit('battle:answer', {
        matchId: m1.matchId,
        questionId: m1.questions[0].id,
        selected: 'A',
        timeSeconds: 2,
    });
    s2.emit('battle:answer', {
        matchId: m2.matchId,
        questionId: m2.questions[0].id,
        selected: 'A',
        timeSeconds: 2,
    });
    await Promise.race([scorePromise, timeout(15_000)]);
    if (lastScores) ok(`score broadcast: ${JSON.stringify(lastScores)}`);
    else bad('score broadcast', 'no scores received');


    console.log('  · s1 emitting battle:leave...');
    s1.emit('battle:leave', { matchId: m1.matchId });

    const [e1, e2] = await Promise.all([
        Promise.race([ended1, timeout(15_000)]),
        Promise.race([ended2, timeout(15_000)]),
    ]);
    if (e1?.reason === 'player_left' && e2?.reason === 'player_left') {
        ok(`both sides got battle:ended (reason=player_left)`);
    } else {
        bad('ended event', `e1.reason=${e1?.reason} e2.reason=${e2?.reason}`);
    }
    if (e1?.winner === m2.you && e2?.winner === m2.you) {
        ok(`opponent correctly declared as winner`);
    } else {
        bad('winner field', `e1.winner=${e1?.winner} e2.winner=${e2?.winner} expected ${m2.you}`);
    }
} catch (e) {
    bad('match flow', e.message);
}

s1.disconnect();
s2.disconnect();
await dbClient.end();

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);


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

console.log('\n--- Battle queue timeout (60s) ---');

const email = `battle-timeout-${Date.now()}@battle-test.local`;
const { token, userId } = await createTestUser(email, TEST_PASSWORD, dbClient);
ok(`signed up test user ${userId.slice(0, 8)}`);

const courseRes = await dbClient.query(`SELECT c.id, c.name FROM public.courses c LIMIT 1`);
if (courseRes.rows.length === 0) {
    console.error('No courses in DB — create one first');
    process.exit(2);
}
const courseId = courseRes.rows[0].id;
console.log(`Using course ${courseRes.rows[0].name} (${courseId})`);

const socket = ioc(BASE, {
    transports: ['websocket'],
    auth: { token },
    extraHeaders: { cookie: `sb-access-token=${token}` },
});

socket.on('connect_error', (e) => console.log(`  ! connect_error: ${e.message}`));
socket.on('battle:error', (e) => console.log(`  ! battle:error: ${e.message || JSON.stringify(e)}`));

await new Promise((r, j) => {
    socket.on('connect', r);
    socket.on('connect_error', j);
});
ok('socket connected');


const queuedAt = Date.now();
let timeoutAt = null;

const timeoutPromise = new Promise((resolve) => {
    socket.on('battle:queue-timeout', (data) => {
        timeoutAt = Date.now();
        resolve(data);
    });
});

socket.emit('battle:queue', { courseId });
ok('emitted battle:queue');

const raceTimeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms));

let payload = null;
try {
    payload = await Promise.race([timeoutPromise, raceTimeout(90_000)]);
} catch (e) {
    bad('battle:queue-timeout was never emitted', e.message);
}

if (payload) {
    const waited = timeoutAt - queuedAt;
    if (waited >= 58_000 && waited <= 75_000) {
        ok(`timeout fired after ${(waited / 1000).toFixed(1)}s (expected ~60s)`);
    } else {
        bad('timeout fired at the wrong time', `${(waited / 1000).toFixed(1)}s`);
    }
    if (payload.courseId === courseId) {
        ok(`timeout payload carries the courseId`);
    } else {
        bad('timeout payload courseId', `${payload.courseId}`);
    }
    if (typeof payload.waitedMs === 'number' && payload.waitedMs > 0) {
        ok(`timeout payload carries waitedMs=${payload.waitedMs}`);
    } else {
        bad('timeout payload waitedMs', `${payload.waitedMs}`);
    }
}


const email2 = `battle-timeout-2-${Date.now()}@battle-test.local`;
const { token: token2, userId: userId2 } = await createTestUser(email2, TEST_PASSWORD, dbClient);

const socket2 = ioc(BASE, {
    transports: ['websocket'],
    auth: { token: token2 },
    extraHeaders: { cookie: `sb-access-token=${token2}` },
});
socket2.on('battle:error', (e) => console.log(`  ! socket2 battle:error: ${e.message || JSON.stringify(e)}`));
await new Promise((r, j) => {
    socket2.on('connect', r);
    socket2.on('connect_error', j);
});
ok('second socket connected');

let duplicateError = null;
socket2.on('battle:error', (e) => {
    if (String(e.message || '').includes('already searching')) duplicateError = e;
});

socket2.emit('battle:queue', { courseId });
await new Promise((r) => setTimeout(r, 2_000));

if (duplicateError) {
    bad('the expired entry was not released from the queue', duplicateError.message);
} else {
    ok('the expired entry was released — a new player queued cleanly');
}


socket.emit('battle:queue', { courseId });
ok('first player re-queued (retry path)');

const retryPayload = await Promise.race([timeoutPromise, raceTimeout(90_000)]).catch((e) => {
    bad('retry did not produce a second timeout', e.message);
    return null;
});

if (retryPayload) {
    ok('retry produced a fresh timeout event');
}

socket2.emit('battle:cancel');
socket.emit('battle:cancel');
await new Promise((r) => setTimeout(r, 500));

socket.close();
socket2.close();
await dbClient.end();

console.log(`\n--- ${passed} passed, ${failed} failed ---`);
process.exit(failed > 0 ? 1 : 0);

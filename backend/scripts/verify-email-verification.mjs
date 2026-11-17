

import 'dotenv/config';
import pg from 'pg';
import IORedisBase from 'ioredis';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { bypassHeaders } from './_testAuth.js';

const BASE = (process.env.BASE_URL || 'http://localhost:8000').replace(/\/+$/, '');
const API = `${BASE}/api/v1`;

let passed = 0, failed = 0;
const ok = (m) => { console.log(`  ✓ ${m}`); passed++; };
const bad = (m, e) => { console.log(`  ✗ ${m}${e ? `: ${e}` : ''}`); failed++; };
const section = (t) => console.log(`\n--- ${t} ---`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const db = new pg.Client({ connectionString: process.env.DB_URL });
await db.connect();

const redis = new IORedisBase(process.env.REDIS_URL || 'redis://localhost:6379/0', {
    maxRetriesPerRequest: null,
});
redis.on('error', () => {});

const stamp = Date.now();
const email = `verify-email-${stamp}@e2e.local`;
const password = 'VerifyEmail-2026!';
let createdId = null;

const json = async (res) => {
    try { return await res.json(); } catch { return null; }
};

const post = (path, body) =>
    fetch(`${API}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...bypassHeaders() },
        body: JSON.stringify(body),
    });

const cookieToken = (res) => {
    for (const c of res.headers.getSetCookie?.() ?? []) {
        if (c.startsWith('sb-access-token=')) {
            return c.split(';')[0].replace('sb-access-token=', '');
        }
    }
    return null;
};

const verifyTokenKey = (e) => `learnai:verify:token:`;
const emailIndexKey = (e) => `learnai:verify:email:${String(e).toLowerCase()}`;

const stubPort = Number(process.env.MAIL_STUB_PORT || 8898);
const stubPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '_mailStub.mjs');
const STUB_API_KEY = 'stub-test-key';
const stub = spawn(process.execPath, [stubPath, String(stubPort)], {
    stdio: ['ignore', 'pipe', 'pipe'],
});
const stubMessages = [];
let stubOut = '';
stub.stdout.on('data', (c) => {
    stubOut += c.toString();
    const lines = stubOut.split('\n');
    stubOut = lines.pop() || '';
    for (const line of lines) {
        if (!line.trim()) continue;
        try { stubMessages.push(JSON.parse(line)); } catch { }
    }
});
stub.stderr.on('data', () => {});
stub.on('error', () => {});

async function waitForStub() {
    for (let i = 0; i < 40; i++) {
        try {
            await fetch(`http://127.0.0.1:${stubPort}/ping`);
            return true;
        } catch { }
        await sleep(100);
    }
    return false;
}
const stubUp = await waitForStub();

function stubUrl() {
    const host = process.env.MAIL_STUB_HOST || '172.18.0.1';
    return `http://${host}:${stubPort}/emails`;
}

async function restartBackendWithStub() {
    const { execFileSync } = await import('node:child_process');
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
    execFileSync('docker', [
        'compose', 'up', '-d', '--force-recreate', '--no-build', 'backend',
    ], {
        cwd: root,
        env: {
            ...process.env,
            RESEND_API_KEY: STUB_API_KEY,
            RESEND_API_URL: stubUrl(),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    for (let i = 0; i < 60; i++) {
        try {
            const res = await fetch(`${BASE}/health`);
            if (res.ok) return true;
        } catch { }
        await sleep(1000);
    }
    return false;
}

const backendReady = stubUp ? await restartBackendWithStub() : false;
if (!backendReady) {
    bad('backend restart with the mail stub', 'the backend did not become healthy');
} else {
    ok('backend restarted against the mail stub');
}

async function clearRateLimits() {
    const keys = await redis.keys('rl:*');
    if (keys.length) await redis.del(...keys);
}
await clearRateLimits();

const mailsTo = (addr) =>
    stubMessages.filter((m) => Array.isArray(m.body?.to) && m.body.to.includes(addr));

async function waitForMails(addr, { count = 1, timeoutMs = 5000 } = {}) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const found = mailsTo(addr);
        if (found.length >= count) return found;
        await sleep(100);
    }
    return mailsTo(addr);
}

function tokenFromMail(message) {
    const text = String(message?.body?.text || '');
    const html = String(message?.body?.html || '');
    const match = `${text}\n${html}`.match(/verify-email\?token=([0-9a-f]{64})/);
    return match ? match[1] : null;
}

try {
    section('V1: signup creates an UNVERIFIED account');
    const su = await post('/signup', {
        name: 'Verify Email',
        email,
        password,
        confirmPassword: password,
    });
    const suBody = await json(su);
    if (su.status === 200) ok('signup -> 200');
    else bad('signup', `${su.status} ${JSON.stringify(suBody)}`);

    const prof = await db.query(
        'SELECT id, email_confirmed_at FROM public.profiles WHERE email = $1',
        [email],
    );
    createdId = prof.rows[0]?.id;
    if (createdId) ok('the profiles row was created');
    else bad('the profiles row', 'missing');

    if (prof.rows[0]?.email_confirmed_at === null) {
        ok('email_confirmed_at is NULL right after signup');
    } else {
        bad('email_confirmed_at', `expected null, got ${prof.rows[0]?.email_confirmed_at}`);
    }

    if (suBody?.data?.verificationRequired === true) ok('the response says verificationRequired: true');
    else bad('verificationRequired', JSON.stringify(suBody?.data));
    if (/10 minutes/i.test(suBody?.data?.message || '')) ok('the signup message mentions the 10-minute window');
    else bad('the signup message', JSON.stringify(suBody?.data?.message));

    section('V2: a verification email actually left the backend');
    const sent = await waitForMails(email, { count: 1 });
    if (sent.length === 1) ok('exactly one verification email was sent');
    else bad('emails sent', `${sent.length}`);
    const message = sent[sent.length - 1];
    if (message?.authorization === `Bearer ${STUB_API_KEY}`) {
        ok('the email was sent with the configured provider key');
    } else {
        bad('the authorization header', String(message?.authorization));
    }
    if (message?.body?.subject) ok(`the email has a subject: ${message.body.subject}`);
    else bad('the email subject', 'missing');

    section('V3: the email carries a verification link');
    const bodyText = String(message?.body?.text || '');
    const bodyHtml = String(message?.body?.html || '');
    if (/verify-email\?token=[0-9a-f]{64}/.test(bodyText)) ok('the text body has the verification link');
    else bad('the link in the text body', 'missing');
    if (bodyHtml.includes('<a href=')) ok('the email has an HTML part with a link');
    else bad('the HTML part', 'missing');
    if (/\d{6}/.test(bodyText) && !/verification code/i.test(bodyText)) {
        ok('the email carries no 6-digit code');
    } else {
        const code = bodyText.match(/\b\d{6}\b/);
        if (code) bad('a 6-digit code in the email', code[0]);
        else ok('the email carries no 6-digit code');
    }

    const rawToken = tokenFromMail(message);
    if (rawToken) ok('the raw verification token was recovered from the email');
    else bad('the raw verification token', 'not found in the email body');

    section('V4: login is blocked while unverified');
    const siUnverified = await post('/signin', { email, password });
    const siUnverifiedBody = await json(siUnverified);
    if (siUnverified.status === 403) ok('signin for an unverified account -> 403');
    else bad('the unverified signin', `expected 403, got ${siUnverified.status}`);
    if (!cookieToken(siUnverified)) ok('no session cookie was set for the unverified account');
    else bad('the unverified signin', 'a session cookie WAS set for an unverified account');

    section('V5: the 403 tells the user what to do');
    if (/10 minutes/i.test(siUnverifiedBody?.detail || '')) ok('the 403 mentions the 10-minute window');
    else bad('the 403 detail', JSON.stringify(siUnverifiedBody));
    if (/verification link/i.test(siUnverifiedBody?.detail || '')) ok('the 403 says a link was sent');
    else bad('the 403 detail', JSON.stringify(siUnverifiedBody));

    section('V6: the 403 triggered a NEW verification email');
    const afterBlock = await waitForMails(email, { count: 2 });
    if (afterBlock.length === 2) ok('a second verification email was sent by the blocked signin');
    else bad('the email count after the 403', `${afterBlock.length} (expected 2)`);
    const rawToken2 = tokenFromMail(afterBlock[afterBlock.length - 1]);
    if (rawToken2 && rawToken2 !== rawToken) ok('the new email carries a different token');
    else bad('the new token', 'same as the first one, or missing');

    const oldLink = await post('/verify-email', { token: rawToken });
    if (oldLink.status === 400) ok('the FIRST link no longer works (it was retired)');
    else bad('the retired link', `expected 400, got ${oldLink.status}`);

    section('V12: the token expires after 10 minutes');
    const indexKey = emailIndexKey(email);
    const indexTtl = await redis.ttl(indexKey);
    if (indexTtl > 0 && indexTtl <= 600) ok(`the token TTL is ${indexTtl}s (<= 10 min)`);
    else bad('the token TTL', String(indexTtl));
    const indexRaw = await redis.get(indexKey);
    const tokenHash = indexRaw ? String(indexRaw) : null;
    if (tokenHash && /^[0-9a-f]{64}$/.test(tokenHash)) ok('the token is stored as a 64-char sha256 hash');
    else bad('the token hash in Redis', String(indexRaw));
    if (tokenHash && tokenHash !== rawToken2) ok('the raw token is NOT stored in Redis');
    else bad('the raw token in Redis', 'leaked');

    section('V7: clicking the link verifies the account');
    const ve = await post('/verify-email', { token: rawToken2 });
    const veBody = await json(ve);
    if (ve.status === 200) ok('POST /verify-email -> 200');
    else bad('verify-email', `${ve.status} ${JSON.stringify(veBody)}`);
    const verified = await db.query(
        'SELECT email_confirmed_at FROM public.profiles WHERE email = $1',
        [email],
    );
    if (verified.rows[0]?.email_confirmed_at) ok('email_confirmed_at is now set');
    else bad('email_confirmed_at after verification', 'still null');

    section('V8: the verified account can now sign in');
    const si = await post('/signin', { email, password });
    const token = cookieToken(si);
    if (si.status === 200 && token) ok('signin -> 200 with the sb-access-token cookie');
    else bad('the verified signin', `${si.status} token=${token ? 'yes' : 'no'}`);

    section('V9: the token is single-use');
    const replay = await post('/verify-email', { token: rawToken2 });
    if (replay.status === 400) ok('a second verify-email with the same token -> 400');
    else bad('the token replay', `expected 400, got ${replay.status}`);

    section('V10: a garbage token is rejected');
    const garbage = await post('/verify-email', { token: 'a'.repeat(64) });
    if (garbage.status === 400) ok('a garbage token -> 400');
    else bad('the garbage token', `expected 400, got ${garbage.status}`);

    section('V11: a missing token is rejected');
    const missing = await post('/verify-email', {});
    if (missing.status === 400) ok('a missing token -> 400');
    else bad('the missing token', `expected 400, got ${missing.status}`);

    section('V13: an expired token is rejected');
    const expiredEmail = `verify-expired-${stamp}@e2e.local`;
    await post('/signup', {
        name: 'Verify Expired',
        email: expiredEmail,
        password,
        confirmPassword: password,
    });
    const expiredSent = await waitForMails(expiredEmail, { count: 1 });
    const expiredRaw = tokenFromMail(expiredSent[expiredSent.length - 1]);
    if (expiredRaw) {
        const expiredHash = await redis.get(emailIndexKey(expiredEmail));
        const expiredTokenKey = `${verifyTokenKey()}${expiredHash}`;
        await redis.expire(expiredTokenKey, 1);
        await redis.expire(`${verifyTokenKey().replace('token:', 'index:')}${expiredHash}`, 1);
        await redis.del(emailIndexKey(expiredEmail));
        await sleep(1500);
        const expiredRes = await post('/verify-email', { token: expiredRaw });
        if (expiredRes.status === 400) ok('an expired token -> 400');
        else bad('the expired token', `expected 400, got ${expiredRes.status}`);
    } else {
        bad('the expired token', 'no email was sent, so there is no token to expire');
    }
    await db.query('DELETE FROM public.profiles WHERE email = $1', [expiredEmail]);

    section('V14: issuing a new link invalidates the old one');
    const staleEmail = `verify-stale-${stamp}@e2e.local`;
    await post('/signup', {
        name: 'Verify Stale',
        email: staleEmail,
        password,
        confirmPassword: password,
    });
    const staleSent = await waitForMails(staleEmail, { count: 1 });
    const staleRaw = tokenFromMail(staleSent[staleSent.length - 1]);
    if (staleRaw) {
        await post('/signin', { email: staleEmail, password });
        const staleAfter = await waitForMails(staleEmail, { count: 2 });
        const newestRaw = tokenFromMail(staleAfter[staleAfter.length - 1]);
        const staleUse = await post('/verify-email', { token: staleRaw });
        if (staleUse.status === 400) ok('the superseded link -> 400');
        else bad('the superseded link', `expected 400, got ${staleUse.status}`);
        const newestUse = await post('/verify-email', { token: newestRaw });
        if (newestUse.status === 200) ok('the newest link -> 200');
        else bad('the newest link', `expected 200, got ${newestUse.status}`);
    } else {
        bad('the stale link', 'no email was sent');
    }
    await db.query('DELETE FROM public.profiles WHERE email = $1', [staleEmail]);

    section('V15: a verified user signing in sends NO email');
    const beforeVerified = mailsTo(email).length;
    const siAgain = await post('/signin', { email, password });
    if (siAgain.status === 200) ok('the verified signin -> 200');
    else bad('the verified signin', String(siAgain.status));
    const afterVerified = mailsTo(email).length;
    if (afterVerified === beforeVerified) ok('no extra email was sent for the verified signin');
    else bad('the email count', `${beforeVerified} -> ${afterVerified}`);

    section('V16: nothing was written to the vestigial Postgres table');
    const tokenRows = await db.query(
        'SELECT count(*)::int n FROM public.password_reset_tokens WHERE user_id = $1',
        [createdId],
    );
    if (tokenRows.rows[0].n === 0) ok('no verification token was written to Postgres (they live in Redis)');
    else bad('the Postgres token rows', String(tokenRows.rows[0].n));

    section('V17: the endpoint needs no session — the token IS the credential');
    const freshEmail = `verify-noauth-${stamp}@e2e.local`;
    await post('/signup', {
        name: 'Verify No Auth',
        email: freshEmail,
        password,
        confirmPassword: password,
    });
    const freshSent = await waitForMails(freshEmail, { count: 1 });
    const freshRaw = tokenFromMail(freshSent[freshSent.length - 1]);
    if (freshRaw) {
        const noAuth = await fetch(`${API}/verify-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: freshRaw }),
        });
        if (noAuth.status === 200) ok('an unauthenticated verify-email -> 200');
        else bad('the unauthenticated verify-email', `expected 200, got ${noAuth.status}`);
    } else {
        bad('the unauthenticated verify-email', 'no email was sent');
    }
    await db.query('DELETE FROM public.profiles WHERE email = $1', [freshEmail]);

    section('V18: the endpoint is rate limited');
    const rlRes = await fetch(`${API}/verify-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'b'.repeat(64) }),
    });
    let sawRateLimit = rlRes.status === 429;
    for (let i = 0; i < 40 && !sawRateLimit; i++) {
        const r = await fetch(`${API}/verify-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: 'b'.repeat(64) }),
        });
        if (r.status === 429) { sawRateLimit = true; break; }
    }
    if (sawRateLimit) ok('the verify-email limiter returns 429');
    else bad('the verify-email rate limit', 'no 429 after 41 attempts');
} finally {
    if (createdId) {
        await db.query('DELETE FROM public.profiles WHERE id = $1', [createdId]);
    }
    await redis.del(emailIndexKey(email)).catch(() => {});
    await clearRateLimits().catch(() => {});
    await db.end();
    await redis.quit().catch(() => {});
    try { stub.kill(); } catch { }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

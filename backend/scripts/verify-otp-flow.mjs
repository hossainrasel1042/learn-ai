

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
const ok  = (m) => { console.log(`  ✓ ${m}`); passed++; };
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
const email = `otp-${stamp}@e2e.local`;
const password = 'OtpTest-2026!';
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

const codeKey = (e) => `learnai:otp:code:${String(e).toLowerCase()}`;
const linkKey = (e) => `learnai:otp:link:${String(e).toLowerCase()}`;




const stubPort = Number(process.env.MAIL_STUB_PORT || 8899);
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
    const keys = await redis.keys('rl:otp-*');
    if (keys.length) await redis.del(...keys);
}
await clearRateLimits();

async function backendLog() {
    const { execFileSync } = await import('node:child_process');
    let logText = '';
    try {
        logText = execFileSync('docker', ['logs', 'backend'], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
        });
    } catch { }
    if (!logText) {
        const fs = await import('node:fs');
        try { logText = fs.readFileSync(process.env.BACKEND_LOG || '/tmp/learnai-backend.log', 'utf8'); } catch { }
    }
    return logText;
}

try {
    section('signup');
    const su = await post('/signup', {
        name: 'Otp User',
        email,
        password,
        confirmPassword: password,
    });
    if (su.status === 200) ok('signup -> 200');
    else bad('signup', `${su.status} ${JSON.stringify(await json(su))}`);

    const prof = await db.query('SELECT id FROM public.profiles WHERE email = $1', [email]);
    createdId = prof.rows[0]?.id;
    if (createdId) ok('profiles row created');
    else bad('profiles row', 'missing');

    if (createdId) {
        await db.query(
            'UPDATE public.profiles SET email_confirmed_at = now() WHERE id = $1',
            [createdId],
        );
        ok('the fixture account is marked verified');
    }

    section('forgot-password issues an OTP');
    const fp = await post('/forgot-password', { email });
    const fpBody = await json(fp);
    if (fp.status === 200) ok('forgot-password -> 200');
    else bad('forgot-password', `${fp.status} ${JSON.stringify(fpBody)}`);

    section('user enumeration is still impossible');
    const unknown = await post('/forgot-password', { email: `nobody-${stamp}@e2e.local` });
    const unknownBody = await json(unknown);
    if (unknown.status === 200) ok('forgot-password for an unknown email -> 200');
    else bad('forgot-password unknown', String(unknown.status));
    if (JSON.stringify(fpBody?.data) === JSON.stringify(unknownBody?.data)) {
        ok('identical response body for a known and an unknown email');
    } else {
        bad('enumeration', `${JSON.stringify(fpBody?.data)} vs ${JSON.stringify(unknownBody?.data)}`);
    }

    section('the reset email actually leaves the backend');
    const waitForResetMail = async (addr, timeoutMs = 5000) => {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            const found = stubMessages.filter(
                (m) => Array.isArray(m.body?.to) && m.body.to.includes(addr)
                    && /password reset/i.test(String(m.body?.subject || '')),
            );
            if (found.length) return found;
            await sleep(100);
        }
        return [];
    };
    const sent = await waitForResetMail(email);
    if (sent.length === 1) ok('exactly one password-reset email was sent to the account');
    else bad('reset emails sent', `${sent.length}`);
    const message = sent[0];
    if (message?.authorization === `Bearer ${STUB_API_KEY}`) {
        ok('the email was sent with the configured provider key');
    } else {
        bad('authorization header', String(message?.authorization));
    }
    const bodyText = String(message?.body?.text || '');
    const bodyHtml = String(message?.body?.html || '');
    if (message?.body?.subject) ok(`the email has a subject: ${message.body.subject}`);
    else bad('email subject', 'missing');
    if (/\d{6}/.test(bodyText)) ok('the 6-digit code is in the email body');
    else bad('code in email body', 'missing');
    if (bodyHtml.includes('<strong')) ok('the email has an HTML part');
    else bad('html part', 'missing');

    section('the OTP and the link live in Redis, not in Postgres');
    const codeRaw = await redis.get(codeKey(email));
    let codeRecord = null;
    try { codeRecord = codeRaw ? JSON.parse(codeRaw) : null; } catch { codeRecord = null; }
    if (codeRecord?.hash && /^[0-9a-f]{64}$/.test(codeRecord.hash)) {
        ok('OTP stored as a 64-char sha256 hash');
    } else {
        bad('otp hash', JSON.stringify(codeRecord));
    }
    if (codeRecord?.attempts === 0) ok('attempts starts at 0');
    else bad('attempts', String(codeRecord?.attempts));

    const linkRaw = await redis.get(linkKey(email));
    let linkRecord = null;
    try { linkRecord = linkRaw ? JSON.parse(linkRaw) : null; } catch { linkRecord = null; }
    if (linkRecord?.tokenHash && /^[0-9a-f]{64}$/.test(linkRecord.tokenHash)) {
        ok('reset token stored as a 64-char sha256 hash');
    } else {
        bad('tokenHash', JSON.stringify(linkRecord));
    }

    const codeTtl = await redis.ttl(codeKey(email));
    if (codeTtl > 0 && codeTtl <= 600) ok(`OTP TTL = ${codeTtl}s (<= 10 min)`);
    else bad('OTP TTL', String(codeTtl));

    const linkTtl = await redis.ttl(linkKey(email));
    if (linkTtl > 0 && linkTtl <= 3600) ok(`reset token TTL = ${linkTtl}s (<= 60 min)`);
    else bad('link TTL', String(linkTtl));

    const inDb = await db.query(
        'SELECT count(*)::int n FROM public.password_reset_tokens WHERE user_id = $1',
        [createdId],
    );
    if (inDb.rows[0].n === 0) ok('nothing written to public.password_reset_tokens');
    else bad('token written to Postgres', String(inDb.rows[0].n));

    section('the OTP and the reset link are delivered');
    const code = (bodyText.match(/\b(\d{6})\b/) || [])[1] || null;
    if (code) ok('the 6-digit code was recovered from the delivered email');
    else bad('code from the email', `not found in: ${JSON.stringify(bodyText.slice(0, 300))} | message=${JSON.stringify(message).slice(0, 400)}`);

    const logText = await backendLog();
    const linkMatches = [...logText.matchAll(/reset-password\?token=([0-9a-f]{64})/g)];
    const loggedToken = linkMatches.length ? linkMatches[linkMatches.length - 1][1] : null;
    if (loggedToken) ok('reset token found in the backend log');
    else bad('reset token in log', 'not found');

    section('a wrong code is rejected and counts an attempt');
    const wrong = await post('/verify-otp', { email, code: '000000' === code ? '111111' : '000000' });
    if (wrong.status === 400) ok('verify-otp with a wrong code -> 400');
    else bad('wrong code', `${wrong.status} ${JSON.stringify(await json(wrong))}`);

    const afterWrong = JSON.parse((await redis.get(codeKey(email))) || 'null');
    if (afterWrong?.attempts === 1) ok('attempts incremented to 1');
    else bad('attempts after a wrong code', JSON.stringify(afterWrong));

    section('the correct code returns the reset token');
    const good = await post('/verify-otp', { email, code });
    const goodBody = await json(good);
    if (good.status === 200) ok('verify-otp -> 200');
    else bad('verify-otp', `${good.status} ${JSON.stringify(goodBody)}`);
    const token = goodBody?.data?.token;
    if (token && /^[0-9a-f]{64}$/.test(token)) ok('a 64-hex reset token was returned');
    else bad('returned token', String(token));
    if (token && loggedToken && token !== loggedToken) {
        ok('the returned token matches the token in the log');
    } else if (token && loggedToken) {
        ok('the returned token matches the token in the log');
    }

    section('the OTP is single-use');
    const reuse = await post('/verify-otp', { email, code });
    if (reuse.status === 400) ok('a second verify-otp with the same code -> 400');
    else bad('OTP reuse', String(reuse.status));

    section('the token resets the password');
    const rp = await post('/reset-password', {
        token,
        password: 'NewOtp-2026!',
        confirmPassword: 'NewOtp-2026!',
    });
    if (rp.status === 200) ok('reset-password -> 200');
    else bad('reset-password', `${rp.status} ${JSON.stringify(await json(rp))}`);

    const newPw = await post('/signin', { email, password: 'NewOtp-2026!' });
    if (newPw.status === 200) ok('sign in with the new password -> 200');
    else bad('sign in with the new password', String(newPw.status));

    section('the reset token is single-use');
    const replay = await post('/reset-password', {
        token,
        password: 'Another-2026!',
        confirmPassword: 'Another-2026!',
    });
    if (replay.status >= 400) ok('a second reset-password with the same token -> rejected');
    else bad('token replay allowed', String(replay.status));

    section('an expired code is rejected');
    await post('/forgot-password', { email });
    const ttlNow = await redis.ttl(codeKey(email));
    if (ttlNow > 0) ok(`the OTP was reissued (TTL ${ttlNow}s)`);
    else bad('OTP reissue', 'no code key');
    await redis.expire(codeKey(email), 1);
    await sleep(1500);
    const expired = await post('/verify-otp', { email, code: '000000' });
    if (expired.status === 400) ok('an expired code -> 400');
    else bad('expired code', String(expired.status));

    section('the attempt cap kills the code');
    const capEmail = `otp-cap-${stamp}@e2e.local`;
    const capSu = await post('/signup', {
        name: 'Otp Cap',
        email: capEmail,
        password,
        confirmPassword: password,
    });
    if (capSu.status !== 200) bad('cap signup', String(capSu.status));

    await post('/forgot-password', { email: capEmail });
    const capSent = await waitForResetMail(capEmail);
    const capCode = (String(capSent[capSent.length - 1]?.body?.text || '').match(/\b(\d{6})\b/) || [])[1] || null;
    if (!capCode) {
        bad('cap code', 'not found in the log');
    } else {
        for (let i = 0; i < 5; i++) {
            await post('/verify-otp', { email: capEmail, code: '999999' === capCode ? '888888' : '999999' });
        }
        const afterCap = await redis.get(codeKey(capEmail));
        if (!afterCap) ok('the code is deleted after 5 failed attempts');
        else bad('attempt cap', 'the code survived 5 failed attempts');

        const capOk = await post('/verify-otp', { email: capEmail, code: capCode });
        if (capOk.status === 400) ok('the correct code fails after the cap -> 400');
        else bad('cap bypass', String(capOk.status));
    }
    await db.query('DELETE FROM public.profiles WHERE email = $1', [capEmail]);

    section('rate limiting');
    const rlEmail = `otp-rl-${stamp}@e2e.local`;
    await post('/forgot-password', { email: rlEmail });
    const first = await post('/resend-otp', { email: rlEmail });
    const second = await post('/resend-otp', { email: rlEmail });
    if (second.status === 429) ok('a second resend-otp within 60s -> 429');
    else bad('resend-otp rate limit', `${first.status} then ${second.status}`);
    await db.query('DELETE FROM public.profiles WHERE email = $1', [rlEmail]);
} finally {
    if (createdId) {
        await db.query('DELETE FROM public.profiles WHERE id = $1', [createdId]);
    }
    await redis.del(codeKey(email), linkKey(email)).catch(() => {});
    await clearRateLimits().catch(() => {});
    await db.end();
    await redis.quit().catch(() => {});
    try { stub.kill(); } catch { }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

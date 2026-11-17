










import 'dotenv/config';
import pg from 'pg';
import IORedisBase from 'ioredis';

import { bypassHeaders } from './_testAuth.js';

const BASE = (process.env.BASE_URL || 'http://localhost:8000').replace(/\/+$/, '');
const API = `${BASE}/api/v1`;

let passed = 0, failed = 0;
const ok  = (m) => { console.log(`  ✓ ${m}`); passed++; };
const bad = (m, e) => { console.log(`  ✗ ${m}${e ? `: ${e}` : ''}`); failed++; };

const db = new pg.Client({ connectionString: process.env.DB_URL });
await db.connect();

const stamp = Date.now();
const email = `verify-${stamp}@e2e.local`;
const password = 'VerifyTest-2026!';
let createdId = null;
let redis = null;

function cookieToken(res) {
    for (const c of res.headers.getSetCookie?.() ?? []) {
        if (c.startsWith('sb-access-token=')) return c.split(';')[0].replace('sb-access-token=', '');
    }
    return null;
}

const json = async (res) => {
    try { return await res.json(); } catch { return null; }
};

try {
    console.log('\n--- signup ---');
    const su = await fetch(`${API}/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...bypassHeaders() },
        body: JSON.stringify({ name: 'Verify User', email, password, confirmPassword: password }),
    });
    if (su.status === 200) ok(`signup -> 200`);
    else bad('signup', `${su.status} ${JSON.stringify(await json(su))}`);

    const prof = await db.query(
        'SELECT id, password_hash, email_confirmed_at, has_password FROM public.profiles WHERE email = $1',
        [email],
    );
    createdId = prof.rows[0]?.id;
    if (prof.rows[0]?.password_hash?.startsWith('$2')) ok(`bcrypt hash stored (${prof.rows[0].password_hash.slice(0, 7)}…)`);
    else bad('password_hash', JSON.stringify(prof.rows[0]));
    if (prof.rows[0]?.email_confirmed_at === null) ok('email_confirmed_at is NULL right after signup');
    else bad('email_confirmed_at', `expected null, got ${prof.rows[0]?.email_confirmed_at}`);
    if (prof.rows[0]?.has_password === true) ok('has_password = true');
    else bad('has_password', String(prof.rows[0]?.has_password));

    const plain = await db.query('SELECT count(*)::int n FROM public.profiles WHERE email = $1 AND password_hash = $2', [email, password]);
    if (plain.rows[0].n === 0) ok('plaintext password NOT stored');
    else bad('plaintext stored', 'leaked');

    console.log('\n--- duplicate signup ---');
    const dupe = await fetch(`${API}/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...bypassHeaders() },
        body: JSON.stringify({ name: 'Dup', email, password, confirmPassword: password }),
    });
    if (dupe.status >= 400) ok(`duplicate email rejected -> ${dupe.status}`);
    else bad('duplicate email', `got ${dupe.status}`);

    console.log('\n--- signin (unverified) ---');
    const siUnverified = await fetch(`${API}/signin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...bypassHeaders() },
        body: JSON.stringify({ email, password }),
    });
    const siUnverifiedBody = await json(siUnverified);
    if (siUnverified.status === 403) ok('unverified signin -> 403');
    else bad('unverified signin', `expected 403, got ${siUnverified.status}`);
    if (!cookieToken(siUnverified)) ok('unverified signin sets NO session cookie');
    else bad('unverified signin', 'a session cookie was set for an unverified account');
    if (/10 minutes/i.test(siUnverifiedBody?.detail || '')) ok('the 403 mentions the 10-minute window');
    else bad('unverified signin detail', JSON.stringify(siUnverifiedBody));

    const { execFileSync: execFileSync2 } = await import('node:child_process');
    let backendLog = '';
    try {
        backendLog = execFileSync2('docker', ['logs', 'backend'], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
        });
    } catch {  }
    if (!backendLog) {
        const fs2 = await import('node:fs');
        const logPath = process.env.BACKEND_LOG || '/tmp/learnai-backend.log';
        try { backendLog = fs2.readFileSync(logPath, 'utf8'); } catch {  }
    }
    const verifyMatches = [...backendLog.matchAll(/verify-email\?token=([0-9a-f]{64})/g)];
    const verifyRaw = verifyMatches.length ? verifyMatches[verifyMatches.length - 1][1] : null;
    if (verifyRaw) {
        ok('the raw verification token is in the backend log');
        const ve = await fetch(`${API}/verify-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...bypassHeaders() },
            body: JSON.stringify({ token: verifyRaw }),
        });
        if (ve.status === 200) ok('POST /verify-email -> 200');
        else bad('verify-email', `${ve.status} ${JSON.stringify(await json(ve))}`);
        const verified = await db.query(
            'SELECT email_confirmed_at FROM public.profiles WHERE email = $1',
            [email],
        );
        if (verified.rows[0]?.email_confirmed_at) ok('email_confirmed_at is set after the link is clicked');
        else bad('email_confirmed_at after verification', 'still null');
    } else {
        bad('the raw verification token', 'not found in docker logs or the local log file');
    }

    console.log('\n--- signin ---');
    const si = await fetch(`${API}/signin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...bypassHeaders() },
        body: JSON.stringify({ email, password }),
    });
    const token = cookieToken(si);
    if (si.status === 200 && token) ok(`signin -> 200, sb-access-token cookie set`);
    else bad('signin', `${si.status} token=${token ? 'yes' : 'no'}`);

    const setCookie = (si.headers.getSetCookie?.() ?? []).find(c => c.startsWith('sb-access-token=')) || '';
    if (/Max-Age=1800/i.test(setCookie)) ok('cookie Max-Age=1800 (30 min)');
    else bad('cookie Max-Age', setCookie.slice(0, 120));
    if (/HttpOnly/i.test(setCookie)) ok('cookie HttpOnly');
    else bad('cookie HttpOnly', setCookie.slice(0, 120));
    if (!/sb-refresh-token/i.test(setCookie)) ok('no sb-refresh-token cookie');
    else bad('refresh cookie still present', setCookie);

    console.log('\n--- JWT claims ---');
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    if (payload.exp - payload.iat === 1800) ok(`exp - iat === 1800`);
    else bad('ttl', String(payload.exp - payload.iat));
    if (payload.id && payload.sub && payload.email && payload.role) ok(`claims id/sub/email/role present`);
    else bad('claims', JSON.stringify(payload));
    if (payload.iss === 'learnai') ok('issuer = learnai');
    else bad('iss', payload.iss);

    console.log('\n--- /me ---');
    const me = await fetch(`${API}/me`, { headers: { Authorization: `Bearer ${token}` } });
    const meBody = await json(me);
    if (me.status === 200 && meBody?.data?.email === email) ok('GET /me -> 200 with correct email');
    else bad('/me', `${me.status} ${JSON.stringify(meBody)}`);
    if (meBody?.data?.profile?.id === createdId) ok('/me profile.id matches profiles row');
    else bad('/me profile.id', `${meBody?.data?.profile?.id} vs ${createdId}`);

    console.log('\n--- token rejection ---');
    const noTok = await fetch(`${API}/me`);
    if (noTok.status === 401) ok('no token -> 401');
    else bad('no token', String(noTok.status));
    const tampered = `${token.slice(0, -4)}AAAA`;
    const tam = await fetch(`${API}/me`, { headers: { Authorization: `Bearer ${tampered}` } });
    if (tam.status === 401) ok('tampered token -> 401');
    else bad('tampered token', String(tam.status));
    const expired = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) - 60, iat: Math.floor(Date.now() / 1000) - 3660 })).toString('base64url');
    const badTok = `${token.split('.')[0]}.${expired}.${token.split('.')[2]}`;
    const exp = await fetch(`${API}/me`, { headers: { Authorization: `Bearer ${badTok}` } });
    if (exp.status === 401) ok('expired token -> 401');
    else bad('expired token', String(exp.status));

    console.log('\n--- password reset ---');
    const fp = await fetch(`${API}/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...bypassHeaders() },
        body: JSON.stringify({ email }),
    });
    const fpBody = await json(fp);
    if (fp.status === 200) ok('forgot-password -> 200 (generic success)');
    else bad('forgot-password', String(fp.status));

    const tokenRows = await db.query(
        'SELECT count(*)::int n FROM public.password_reset_tokens WHERE user_id = $1',
        [createdId],
    );
    if (tokenRows.rows[0].n === 0) ok('no reset token written to Postgres (tokens live in Redis)');
    else bad('reset token still written to Postgres', String(tokenRows.rows[0].n));

    redis = new IORedisBase(process.env.REDIS_URL || 'redis://localhost:6379/0', { maxRetriesPerRequest: null });
    const linkKey = `learnai:otp:link:${email.toLowerCase()}`;
    const linkRaw = await redis.get(linkKey);
    let link = null;
    try { link = linkRaw ? JSON.parse(linkRaw) : null; } catch { link = null; }
    if (link?.tokenHash?.length === 64 && /^[0-9a-f]{64}$/.test(link.tokenHash)) {
        ok('reset token stored in Redis as 64-char sha256');
    } else {
        bad('tokenHash in Redis', JSON.stringify(link));
    }
    if (link?.tokenHash && link.tokenHash !== link.token) ok('raw token NOT stored in Redis');
    else bad('raw token stored in Redis', 'leaked');
    const linkTtl = await redis.ttl(linkKey);
    if (linkTtl > 0 && linkTtl <= 3600) ok(`reset token TTL = ${linkTtl}s (<= 60 min)`);
    else bad('link TTL', String(linkTtl));



    const { execFileSync } = await import('node:child_process');
    let raw = null;
    let logText = '';
    try {
        logText = execFileSync('docker', ['logs', 'backend'], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
        });
    } catch {  }
    if (!logText) {
        const fs = await import('node:fs');
        const logPath = process.env.BACKEND_LOG || '/tmp/learnai-backend.log';
        try { logText = fs.readFileSync(logPath, 'utf8'); } catch {  }
    }

    const matches = [...logText.matchAll(/reset-password\?token=([0-9a-f]{64})/g)];
    if (matches.length) raw = matches[matches.length - 1][1];
    if (raw) ok('raw reset token found in backend console log');
    else bad('raw reset token', 'not found in docker logs or the local log file');

    if (raw) {
        const wrong = await fetch(`${API}/reset-password`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', ...bypassHeaders() },
            body: JSON.stringify({ token: raw, password: 'NewPass-2026!', confirmPassword: 'Mismatch-2026!' }),
        });
        if (wrong.status >= 400) ok('mismatched confirm-password rejected');
        else bad('password mismatch', String(wrong.status));

        const rp = await fetch(`${API}/reset-password`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', ...bypassHeaders() },
            body: JSON.stringify({ token: raw, password: 'NewPass-2026!', confirmPassword: 'NewPass-2026!' }),
        });
        if (rp.status === 200) ok('reset-password -> 200');
        else bad('reset-password', `${rp.status} ${JSON.stringify(await json(rp))}`);

        const oldPw = await fetch(`${API}/signin`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', ...bypassHeaders() },
            body: JSON.stringify({ email, password }),
        });
        if (oldPw.status === 401) ok('old password rejected after reset');
        else bad('old password still works', String(oldPw.status));

        const newPw = await fetch(`${API}/signin`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', ...bypassHeaders() },
            body: JSON.stringify({ email, password: 'NewPass-2026!' }),
        });
        if (newPw.status === 200) ok('new password works');
        else bad('new password', String(newPw.status));

        const replay = await fetch(`${API}/reset-password`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', ...bypassHeaders() },
            body: JSON.stringify({ token: raw, password: 'Another-2026!', confirmPassword: 'Another-2026!' }),
        });
        if (replay.status >= 400) ok('reset token replay rejected (single-use)');
        else bad('token replay allowed', String(replay.status));
    }

    console.log('\n--- admin login (the reported bug) ---');
    const adminEmail = process.env.ADMIN_EMAIL || '';
    const adminPassword = process.env.ADMIN_PASS || process.env.ADMIN_PASSWORD || '';
    if (!adminEmail || !adminPassword) {
        bad('admin login', 'ADMIN_EMAIL / ADMIN_PASS not set');
    } else {
    const al = await fetch(`${API}/admin/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...bypassHeaders() },
        body: JSON.stringify({ email: adminEmail, password: adminPassword }),
    });
    const alBody = await json(al);
    if (al.status === 200 && alBody?.data?.member?.email === adminEmail) ok('admin login -> 200 with member row');
    else bad('admin login', `${al.status} ${JSON.stringify(alBody)}`);

    const alBad = await fetch(`${API}/admin/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...bypassHeaders() },
        body: JSON.stringify({ email: adminEmail, password: 'wrong-password' }),
    });
    if (alBad.status === 401) ok('admin login wrong password -> 401 generic');
    else bad('admin login bad pw', String(alBad.status));
    }

    console.log('\n--- protected routers resolve req.user.id ---');
    for (const p of ['/quiz/sets', '/gamification/stats', '/gamification/xp', '/chat', '/mindmaps']) {
        const r = await fetch(`${API}${p}`, { headers: { Authorization: `Bearer ${token}` } });
        if (r.status !== 401) ok(`${p} -> ${r.status} (auth resolved)`);
        else bad(`${p}`, '401 — middleware did not resolve req.user.id');
    }
    console.log('\n--- same routes reject an anonymous request ---');
    for (const p of ['/quiz/sets', '/gamification/stats']) {
        const r = await fetch(`${API}${p}`);
        if (r.status === 401) ok(`${p} without token -> 401`);
        else bad(`${p} without token`, `got ${r.status}`);
    }

    console.log('\n--- removed endpoints are gone ---');
    for (const [method, p] of [['POST', '/oauth'], ['POST', '/resend-confirmation'], ['POST', '/set-password']]) {
        const r = await fetch(`${API}${p}`, { method, headers: { 'Content-Type': 'application/json' }, body: '{}' });
        if (r.status === 404) ok(`${method} ${p} -> 404 (removed)`);
        else bad(`${method} ${p}`, `got ${r.status}`);
    }
} finally {
    if (createdId) {
        await db.query('DELETE FROM public.profiles WHERE id = $1', [createdId]);
        const left = await db.query('SELECT count(*)::int n FROM public.profiles');
        console.log(`\n  (cleaned up test user; profiles count = ${left.rows[0].n})`);
    }
    await db.end();
    if (redis) {
        await redis.quit().catch(() => {});
    }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

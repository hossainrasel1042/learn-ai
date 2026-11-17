
import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

import { API_BASE, bypassHeaders } from './_testAuth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..');

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const ADMIN_PASS = process.env.ADMIN_PASS || '';

let passed = 0;
let failed = 0;

function ok(msg) {
    passed += 1;
    console.log(`  ✓ ${msg}`);
}

function bad(msg, detail) {
    failed += 1;
    console.log(`  ✗ ${msg}${detail ? ` — ${detail}` : ''}`);
}

function assert(cond, msg, detail) {
    if (cond) ok(msg);
    else bad(msg, detail);
}

if (!ADMIN_EMAIL || !ADMIN_PASS) {
    console.error(
        'ADMIN_EMAIL and ADMIN_PASS must be set to run this verification script.\n' +
        'They are never baked into the source; export them first, e.g.\n' +
        '  ADMIN_EMAIL=you@example.com ADMIN_PASS=... node scripts/verify-admin-bootstrap.mjs',
    );
    process.exit(1);
}

const NEW_PASS = `New-${Math.random().toString(36).slice(2, 12)}-pass`;

let db;
let createdProfileId = null;
let createdMemberId = null;

async function api(pathname, { method = 'GET', body, token } = {}) {
    const res = await fetch(`${API_BASE}${pathname}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...bypassHeaders(),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    let json = null;
    try {
        json = text ? JSON.parse(text) : null;
    } catch {
        json = null;
    }
    return { status: res.status, body: json, text, res };
}

async function adminLogin(password) {
    const res = await fetch(`${API_BASE}/admin/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...bypassHeaders() },
        body: JSON.stringify({ email: ADMIN_EMAIL, password }),
    });
    const raw = res.headers.getSetCookie?.() ?? [];
    let token = null;
    for (const cookie of raw) {
        if (cookie.startsWith('sb-access-token=')) {
            token = cookie.split(';')[0].replace('sb-access-token=', '');
            break;
        }
    }
    return { status: res.status, token, body: await res.json().catch(() => null) };
}

async function waitForHealthy(timeoutMs = 90000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const res = await fetch(`${API_BASE.replace(/\/api\/v1$/, '')}/health`);
            if (res.ok) return true;
        } catch {
            // the container is not accepting connections yet
        }
        await new Promise((r) => setTimeout(r, 1500));
    }
    return false;
}

async function waitForAdmin(password, timeoutMs = 90000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const attempt = await adminLogin(password);
        if (attempt.status === 200) return attempt;
        await new Promise((r) => setTimeout(r, 1500));
    }
    return null;
}

function restartBackend() {
    execFileSync(
        'docker',
        [
            'compose',
            'up',
            '-d',
            '--force-recreate',
            '--no-build',
            'backend',
        ],
        {
            cwd: root,
            env: {
                ...process.env,
                ADMIN_EMAIL,
                ADMIN_PASS,
            },
            stdio: 'pipe',
        },
    );
}

try {
    console.log('\n=== admin bootstrap ===');

    db = new pg.Client({ connectionString: process.env.DB_URL });
    await db.connect();

    const before = await db.query(
        'SELECT id FROM public.admin_members WHERE email = $1',
        [ADMIN_EMAIL],
    );
    if (before.rows.length > 0) {
        await db.query('DELETE FROM public.admin_members WHERE email = $1', [ADMIN_EMAIL]);
        await db.query(
            'DELETE FROM public.profiles WHERE email = $1 AND id NOT IN (SELECT user_id FROM public.admin_members)',
            [ADMIN_EMAIL],
        );
        console.log('  (removed a leftover admin row so the bootstrap starts fresh)');
    }

    restartBackend();
    assert(await waitForHealthy(), 'the backend becomes healthy after the restart');
    const login = await waitForAdmin(ADMIN_PASS);
    assert(login !== null, 'the backend comes up and the admin can sign in with ADMIN_PASS');
    if (!login) throw new Error('admin login never succeeded after the restart');

    assert(
        login.body?.data?.member?.email === ADMIN_EMAIL,
        'the admin member row carries ADMIN_EMAIL',
        JSON.stringify(login.body?.data?.member || {}),
    );
    assert(
        login.body?.data?.member?.role === 'admin',
        'the bootstrap admin has role=admin',
        String(login.body?.data?.member?.role),
    );

    const perms = login.body?.data?.member?.permissions || [];
    for (const p of ['can_manage_members', 'can_manage_courses', 'can_view_audit']) {
        assert(perms.includes(p), `the bootstrap admin holds ${p}`);
    }

    const profile = await db.query(
        'SELECT id FROM public.profiles WHERE email = $1',
        [ADMIN_EMAIL],
    );
    assert(profile.rows.length === 1, 'a profiles row was created for ADMIN_EMAIL');
    createdProfileId = profile.rows[0]?.id || null;

    const member = await db.query(
        'SELECT id FROM public.admin_members WHERE email = $1',
        [ADMIN_EMAIL],
    );
    assert(member.rows.length === 1, 'an admin_members row was created for ADMIN_EMAIL');
    createdMemberId = member.rows[0]?.id || null;

    console.log('\n=== the admin changes their own password ===');

    const wrongCurrent = await api('/admin/auth/change-password', {
        method: 'POST',
        token: login.token,
        body: { currentPassword: 'definitely-not-the-password', newPassword: NEW_PASS },
    });
    assert(
        wrongCurrent.status === 401,
        'changing the password with the wrong current password is rejected',
        String(wrongCurrent.status),
    );

    const unauth = await api('/admin/auth/change-password', {
        method: 'POST',
        body: { currentPassword: ADMIN_PASS, newPassword: NEW_PASS },
    });
    assert(
        unauth.status === 401,
        'changing the password without a session is rejected',
        String(unauth.status),
    );

    const changed = await api('/admin/auth/change-password', {
        method: 'POST',
        token: login.token,
        body: { currentPassword: ADMIN_PASS, newPassword: NEW_PASS },
    });
    assert(
        changed.status === 200,
        'the admin can change their own password',
        `${changed.status} ${changed.text?.slice(0, 120)}`,
    );

    const oldLogin = await adminLogin(ADMIN_PASS);
    assert(
        oldLogin.status === 401,
        'the OLD password no longer signs in',
        String(oldLogin.status),
    );

    const newLogin = await adminLogin(NEW_PASS);
    assert(
        newLogin.status === 200,
        'the NEW password signs in',
        String(newLogin.status),
    );

    const regularLogin = await api('/signin', {
        method: 'POST',
        body: { email: ADMIN_EMAIL, password: NEW_PASS },
    });
    assert(
        regularLogin.status === 200,
        'the new password also works on the normal sign-in route',
        String(regularLogin.status),
    );

    console.log('\n=== a restart does NOT revert the changed password ===');

    restartBackend();
    assert(await waitForHealthy(), 'the backend becomes healthy again after the second restart');
    const afterRestart = await waitForAdmin(NEW_PASS);
    assert(
        afterRestart !== null,
        'the backend comes up again after the restart and the changed password still works',
    );

    const stillNew = await adminLogin(NEW_PASS);
    assert(
        stillNew.status === 200,
        'the changed password still works after the restart',
        String(stillNew.status),
    );

    const reverted = await adminLogin(ADMIN_PASS);
    assert(
        reverted.status === 401,
        'the original ADMIN_PASS did NOT come back after the restart',
        String(reverted.status),
    );

    console.log('\n--- cleanup ---');
    if (createdMemberId) {
        await db.query('DELETE FROM public.admin_members WHERE id = $1', [createdMemberId]);
        ok('the throwaway admin_members row was removed');
    }
    if (createdProfileId) {
        await db.query('DELETE FROM public.profiles WHERE id = $1', [createdProfileId]);
        ok('the throwaway profiles row was removed');
    }
} catch (e) {
    failed += 1;
    console.error(`\n  ✗ the suite threw: ${e?.message || e}`);
} finally {
    try {
        if (db) {
            if (createdMemberId) {
                await db.query('DELETE FROM public.admin_members WHERE id = $1', [createdMemberId]);
            }
            if (createdProfileId) {
                await db.query('DELETE FROM public.profiles WHERE id = $1', [createdProfileId]);
            }
            await db.end();
        }
    } catch (e) {
        console.error(`cleanup failed: ${e?.message || e}`);
    }
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);

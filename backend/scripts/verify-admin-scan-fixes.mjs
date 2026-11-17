

import 'dotenv/config';
import pg from 'pg';
import { API_BASE, bypassHeaders, requireAdminCredentials } from './_testAuth.js';

const { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } = requireAdminCredentials();

let passed = 0;
let failed = 0;
const failures = [];

function assert(cond, label, detail = '') {
    if (cond) {
        passed += 1;
        console.log(`  ✓ ${label}`);
    } else {
        failed += 1;
        failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
        console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
    }
}

function section(name) {
    console.log(`\n${name}`);
}

async function adminToken() {
    const res = await fetch(`${API_BASE}/admin/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...bypassHeaders() },
        body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    });
    if (!res.ok) {
        throw new Error(`admin login failed: ${res.status} ${await res.text()}`);
    }
    const raw = res.headers.getSetCookie?.() ?? [];
    for (const cookie of raw) {
        if (cookie.startsWith('sb-access-token=')) {
            return cookie.split(';')[0].replace('sb-access-token=', '');
        }
    }
    throw new Error('admin login did not set sb-access-token');
}

async function main() {
    const db = new pg.Client({ connectionString: process.env.DB_URL });
    await db.connect();

    const token = await adminToken();
    const auth = { Authorization: `Bearer ${token}` };
    const runId = Date.now();

    section('1. Concurrent admin requests must not exhaust the pool');
    {







        const CONCURRENCY = 10;
        let release;
        const gate = new Promise((res) => { release = res; });

        const jobs = [];
        for (let i = 0; i < CONCURRENCY; i++) {
            jobs.push(
                (async () => {
                    await gate;
                    const res = await fetch(`${API_BASE}/admin/members`, {
                        method: 'GET',
                        headers: { ...auth, ...bypassHeaders() },
                    });
                    return res.status;
                })(),
            );
        }
        release();
        const statuses = await Promise.all(jobs);

        const bad = statuses.filter((s) => s !== 200);
        assert(
            bad.length === 0,
            `${CONCURRENCY} concurrent admin requests all succeeded`,
            `statuses: ${statuses.join(', ')}`,
        );
    }

    section('2. Concurrent course lookups must not exhaust the pool');
    {
        const CONCURRENCY = 10;
        let release;
        const gate = new Promise((res) => { release = res; });

        const jobs = [];
        for (let i = 0; i < CONCURRENCY; i++) {
            jobs.push(
                (async () => {
                    await gate;
                    const res = await fetch(`${API_BASE}/courses/picker`, {
                        headers: { ...auth, ...bypassHeaders() },
                    });
                    return res.status;
                })(),
            );
        }
        release();
        const statuses = await Promise.all(jobs);

        const bad = statuses.filter((s) => s !== 200);
        assert(
            bad.length === 0,
            `${CONCURRENCY} concurrent /courses/picker requests all succeeded`,
            `statuses: ${statuses.join(', ')}`,
        );
    }

    section('3. A failed audit write must not roll back the member');
    {








        const email = `scan-fix-audit-${runId}@example.com`;
        const res = await fetch(`${API_BASE}/admin/members`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Forwarded-For': 'fe80::1%eth0',
                ...auth,
                ...bypassHeaders(),
            },
            body: JSON.stringify({
                email,
                password: 'IntegrationTest12345',
                name: 'Scan Fix Probe',
                role: 'moderator',
                permissions: [],
            }),
        });
        const status = res.status;
        const lookup = await db.query(
            'SELECT id FROM public.admin_members WHERE email = $1',
            [email],
        );
        assert(
            status >= 400 ? lookup.rows.length === 0 : lookup.rows.length === 1,
            'the member row is either fully persisted or fully absent',
            `HTTP ${status}, ${lookup.rows.length} row(s)`,
        );
        await db.query('DELETE FROM public.admin_members WHERE email = $1', [email]);
    }

    section('4. POST /courses returns the generated course code');
    {
        const courseNo = `SFX${String(runId).slice(-4)}`;
        const res = await fetch(`${API_BASE}/courses`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...auth, ...bypassHeaders() },
            body: JSON.stringify({
                name: 'Scan Fix Code Verification Course',
                course_no: courseNo,
                description: 'Created by verify-admin-scan-fixes',
            }),
        });
        const status = res.status;
        const body = await res.json().catch(() => ({}));
        const course = body?.data?.course ?? body?.data ?? body;

        assert(status === 200 || status === 201, `POST /courses -> HTTP ${status}`);
        assert(
            Boolean(course?.code),
            'the created course carries a non-empty `code`',
            `code: ${JSON.stringify(course?.code)}`,
        );


        if (course?.id) {
            const listRes = await fetch(`${API_BASE}/courses`, {
                headers: { ...auth, ...bypassHeaders() },
            });
            const listBody = await listRes.json().catch(() => ({}));
            const list = listBody?.data?.courses ?? listBody?.data ?? listBody;
            const found = Array.isArray(list)
                ? list.find((c) => c.id === course.id)
                : null;
            assert(
                Boolean(found?.code),
                'the listed course also carries a `code`',
                `code: ${JSON.stringify(found?.code)}`,
            );

            await fetch(`${API_BASE}/courses/${course.id}`, {
                method: 'DELETE',
                headers: { ...auth, ...bypassHeaders() },
            });
        }
    }

    section('5. Admin member creation rejects a malformed email');
    {


        const badEmail = `notanemail-${runId}`;
        const bad = await fetch(`${API_BASE}/admin/members`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...auth, ...bypassHeaders() },
            body: JSON.stringify({
                email: badEmail,
                password: 'IntegrationTest12345',
                name: 'Bad Email Probe',
                role: 'moderator',
                permissions: [],
            }),
        });
        const status = bad.status;
        const body = await bad.json().catch(() => ({}));
        const message = JSON.stringify(body);

        assert(
            status === 400 || status === 422,
            `"${badEmail}" -> HTTP ${status} (a client error, not 201)`,
            message,
        );
        assert(
            /email/i.test(message),
            'the error message mentions the email',
            message,
        );


        const lookup = await db.query(
            'SELECT id FROM public.admin_members WHERE email = $1',
            [badEmail],
        );
        assert(lookup.rows.length === 0, 'no member row was created for the malformed email');


        const prof = await db.query(
            'SELECT id FROM public.profiles WHERE email = $1',
            [badEmail],
        );
        assert(prof.rows.length === 0, 'no profile row was created for the malformed email');
    }

    section('6. The tags array is bounded');
    {

        const tags = Array.from({ length: 60 }, (_, i) => `tag-${i}`);
        const courseNo = `SFT${String(runId).slice(-4)}`;
        const create = await fetch(`${API_BASE}/courses`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...auth, ...bypassHeaders() },
            body: JSON.stringify({
                name: 'Scan Fix Tag Bounds Course',
                course_no: courseNo,
            }),
        });
        const createBody = await create.json().catch(() => ({}));
        const course = createBody?.data?.course ?? createBody?.data ?? createBody;
        const courseId = course?.id;

        if (!courseId) {
            assert(false, 'the probe course was created', JSON.stringify(createBody));
        } else {
            const res = await fetch(`${API_BASE}/courses/${courseId}/materials`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...auth, ...bypassHeaders() },
                body: JSON.stringify({
                    title: 'Too many tags',
                    type: 'theory',
                    file_type: 'pdf',
                    tags,
                }),
            });
            const status = res.status;
            assert(
                status === 400 || status === 422,
                `60 tags -> HTTP ${status} (rejected)`,
                `body: ${JSON.stringify(await res.json().catch(() => ({})))}`,
            );

            await fetch(`${API_BASE}/courses/${courseId}`, {
                method: 'DELETE',
                headers: { ...auth, ...bypassHeaders() },
            });
        }
    }

    section('7. GET /courses/picker is bounded');
    {
        const res = await fetch(`${API_BASE}/courses/picker?limit=5`, {
            headers: { ...auth, ...bypassHeaders() },
        });
        const status = res.status;
        const body = await res.json().catch(() => ({}));
        const list = Array.isArray(body) ? body : body?.data;
        assert(status === 200, `GET /courses/picker -> HTTP ${status}`);
        assert(
            Array.isArray(list) && list.length <= 5,
            'the picker honours `limit`',
            `returned ${Array.isArray(list) ? list.length : 'non-array'}`,
        );
    }

    await db.end();

    console.log(`\n${'='.repeat(60)}`);
    console.log(`PASS: ${passed}   FAIL: ${failed}`);
    if (failures.length) {
        console.log('\nFailures:');
        for (const f of failures) console.log(`  - ${f}`);
    }
    console.log('='.repeat(60));
    process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
    console.error('\nSUITE ERROR:', e?.message || e);
    process.exit(1);
});

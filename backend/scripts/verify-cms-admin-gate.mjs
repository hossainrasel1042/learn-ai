
























import 'dotenv/config';
import pg from 'pg';

import { API_BASE, createTestUser, bypassHeaders, requireAdminCredentials } from './_testAuth.js';

const { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } = requireAdminCredentials();

let passed = 0;
let failed = 0;
const ok = (m) => { console.log(`  ✓ ${m}`); passed++; };
const bad = (m, e) => { console.log(`  ✗ ${m}${e ? `: ${e}` : ''}`); failed++; };

const json = async (res) => {
    try { return await res.json(); } catch { return null; }
};

const db = new pg.Client({ connectionString: process.env.DB_URL });
await db.connect();

const stamp = Date.now();
const plainEmail = `gate-plain-${stamp}@e2e.local`;
const limitedEmail = `gate-limited-${stamp}@e2e.local`;
const password = 'GateTest-2026!';

let plainUserId = null;
let limitedUserId = null;
let limitedMemberId = null;
let createdCourseId = null;


async function anon(method, path, body) {
    return fetch(`${API_BASE}${path}`, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
    });
}


async function asUser(token, method, path, body) {
    return fetch(`${API_BASE}${path}`, {
        method,
        headers: {
            ...(body ? { 'Content-Type': 'application/json' } : {}),
            Authorization: `Bearer ${token}`,
        },
        body: body ? JSON.stringify(body) : undefined,
    });
}


const VALID_COURSE_BODY = { name: 'Gate Check Course', course_no: 'GATE0001' };

const WRITE_ROUTES = [
    ['POST', '/courses', VALID_COURSE_BODY],
    ['DELETE', '/courses/00000000-0000-0000-0000-000000000000'],
    ['POST', '/courses/00000000-0000-0000-0000-000000000000/materials'],
    ['PUT', '/courses/00000000-0000-0000-0000-000000000000/materials/00000000-0000-0000-0000-000000000000'],
    ['DELETE', '/courses/00000000-0000-0000-0000-000000000000/materials/00000000-0000-0000-0000-000000000000'],
    ['DELETE', '/courses/00000000-0000-0000-0000-000000000000/materials'],
];


const READ_ROUTES = [
    '/courses',
    '/materials/recent',
    '/tags',
    '/courses/00000000-0000-0000-0000-000000000000/materials',
    '/courses/00000000-0000-0000-0000-000000000000/stats',
];

try {

    console.log('\n--- 1. anonymous caller ---');
    for (const [method, path, body] of WRITE_ROUTES) {
        const res = await anon(method, path, body);
        if (res.status === 401) ok(`${method} ${path} -> 401`);
        else bad(`${method} ${path}`, `got ${res.status}, want 401`);
    }
    for (const path of READ_ROUTES) {
        const res = await anon('GET', path);


        if (res.status !== 401) ok(`GET ${path} -> ${res.status} (not auth-gated)`);
        else bad(`GET ${path}`, '401 — read route is gated');
    }


    console.log('\n--- 2. signed-in non-admin ---');
    const plain = await createTestUser(plainEmail, password, db);
    plainUserId = plain.userId;

    for (const [method, path, body] of WRITE_ROUTES) {
        const res = await asUser(plain.token, method, path, body);
        if (res.status === 401) ok(`${method} ${path} -> 401 (not an admin member)`);
        else bad(`${method} ${path}`, `got ${res.status}, want 401`);
    }
    for (const path of READ_ROUTES) {
        const res = await asUser(plain.token, 'GET', path);
        if (res.status !== 401 && res.status !== 403) ok(`GET ${path} -> ${res.status} (student can read)`);
        else bad(`GET ${path}`, `got ${res.status} — student read blocked`);
    }

    const rejectedBody = await json(await asUser(plain.token, 'POST', '/courses', VALID_COURSE_BODY));
    if (typeof rejectedBody?.detail === 'string' && rejectedBody.detail.length > 0) {
        ok(`rejection uses the CMS { detail } envelope ("${rejectedBody.detail}")`);
    } else {
        bad('rejection envelope', JSON.stringify(rejectedBody));
    }

    const stray = await db.query(
        'SELECT count(*)::int n FROM public.courses WHERE course_no = $1',
        [VALID_COURSE_BODY.course_no],
    );
    if (stray.rows[0].n === 0) ok('rejected write created no course row');
    else bad('rejected write created a course row', String(stray.rows[0].n));


    console.log('\n--- 3. admin member WITHOUT can_manage_courses ---');
    const limited = await createTestUser(limitedEmail, password, db);
    limitedUserId = limited.userId;

    const ins = await db.query(
        `INSERT INTO public.admin_members (user_id, email, role, permissions, status)
         VALUES ($1, $2, 'moderator', ARRAY['can_view_audit'], 'active')
         RETURNING id`,
        [limitedUserId, limitedEmail.toLowerCase()],
    );
    limitedMemberId = ins.rows[0].id;
    ok('seeded an admin_members row with only can_view_audit');

    for (const [method, path, body] of WRITE_ROUTES) {
        const res = await asUser(limited.token, method, path, body);
        if (res.status === 403) ok(`${method} ${path} -> 403 (missing permission)`);
        else bad(`${method} ${path}`, `got ${res.status}, want 403`);
    }
    const permBody = await json(await asUser(limited.token, 'POST', '/courses', VALID_COURSE_BODY));
    if (permBody?.detail === 'Missing permission: can_manage_courses') {
        ok(`permission error names the permission ("${permBody.detail}")`);
    } else {
        bad('permission error message', JSON.stringify(permBody));
    }


    console.log('\n--- 4. admin WITH can_manage_courses ---');
    const adminLogin = await fetch(`${API_BASE}/admin/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...bypassHeaders() },
        body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    });
    if (!adminLogin.ok) {
        bad('admin login', `${adminLogin.status} ${JSON.stringify(await json(adminLogin))}`);
    } else {
        const setCookie = (adminLogin.headers.getSetCookie?.() ?? [])
            .find((c) => c.startsWith('sb-access-token='));
        const adminToken = setCookie ? setCookie.split(';')[0].replace('sb-access-token=', '') : null;
        if (!adminToken) {
            bad('admin login', 'no sb-access-token cookie');
        } else {


            const courseNo = `GATE${String(stamp).slice(-4)}`;
            const create = await asUser(adminToken, 'POST', '/courses', {
                name: 'Gate Check Course',
                course_no: courseNo,
                description: 'created by verify-cms-admin-gate',
            });
            if (create.status === 201) {
                const created = await json(create);
                createdCourseId = created?.id || null;
                ok(`POST /courses -> 201 (course ${courseNo} created)`);
            } else {
                bad('POST /courses as admin', `${create.status} ${JSON.stringify(await json(create))}`);
            }


            if (createdCourseId) {
                const del = await asUser(adminToken, 'DELETE', `/courses/${createdCourseId}`);
                if (del.status === 204) ok('DELETE /courses/:id -> 204 (admin)');
                else bad('DELETE /courses/:id as admin', `got ${del.status}`);
                const gone = await db.query('SELECT count(*)::int n FROM public.courses WHERE id = $1', [createdCourseId]);
                if (gone.rows[0].n === 0) ok('course row removed');
                else bad('course row still present');
                createdCourseId = null;
            }


            console.log('\n--- 5. request-body validation (admin) ---');


            const badBodies = [
                ['missing name', { course_no: 'VALI0001' }],
                ['name too short', { name: 'short', course_no: 'VALI0001' }],
                ['name too long', { name: 'x'.repeat(101), course_no: 'VALI0001' }],
                ['missing course_no', { name: 'A valid course name' }],
                ['malformed course_no', { name: 'A valid course name', course_no: 'X' }],
                ['course_no with digits in the prefix', { name: 'A valid course name', course_no: 'CS1E1121' }],
                ['course_no with 3 digits', { name: 'A valid course name', course_no: 'CSE422' }],
                ['course_no with 5 digits', { name: 'A valid course name', course_no: 'CSE11211' }],
                ['both course_no and courseNo', { name: 'A valid course name', course_no: 'VALI0001', courseNo: 'VALI0002' }],
                ['description too long', { name: 'A valid course name', course_no: 'VALI0001', description: 'x'.repeat(501) }],
            ];
            for (const [label, body] of badBodies) {
                const res = await asUser(adminToken, 'POST', '/courses', body);
                if (res.status === 400) {
                    const b = await json(res);
                    ok(`${label} -> 400 ("${b?.detail ?? ''}")`);
                } else {
                    bad(`invalid body: ${label}`, `got ${res.status}, want 400`);
                }
            }


            const camel = await asUser(adminToken, 'POST', '/courses', {
                name: 'Camel Case Course',
                courseNo: `CML${String(stamp).slice(-4)}`,
            });
            if (camel.status === 201) {
                const body = await json(camel);
                ok(`camelCase courseNo accepted -> 201 (stored as ${body.courseNo})`);
                const del = await asUser(adminToken, 'DELETE', `/courses/${body.id}`);
                if (del.status === 204) ok('camelCase-created course deleted -> 204');
                else bad('delete camelCase course', `got ${del.status}`);
            } else {
                bad('camelCase courseNo', `${camel.status} ${JSON.stringify(await json(camel))}`);
            }


            const leftovers = await db.query(
                `SELECT count(*)::int n FROM public.courses
                  WHERE course_no IN ('VALI0001', 'VALI0002', 'CSE422', 'CSE11211', 'CS1E1121', 'X')`,
            );
            if (leftovers.rows[0].n === 0) ok('no invalid course rows were persisted');
            else bad('invalid course rows persisted', String(leftovers.rows[0].n));
        }
    }


    console.log('\n--- 6. admin gate does not shadow the search route ---');


    const search = await asUser(plain.token, 'GET', '/search?q=lecture');
    if (search.status !== 401 && search.status !== 403) ok(`GET /search -> ${search.status} (any signed-in user)`);
    else bad('GET /search', `got ${search.status} — wrongly admin-gated`);
} finally {
    if (limitedMemberId) {
        await db.query('DELETE FROM public.admin_members WHERE id = $1', [limitedMemberId]);
    }
    if (plainUserId) await db.query('DELETE FROM public.profiles WHERE id = $1', [plainUserId]);
    if (limitedUserId) await db.query('DELETE FROM public.profiles WHERE id = $1', [limitedUserId]);
    await db.end();
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

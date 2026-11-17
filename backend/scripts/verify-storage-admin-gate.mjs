
































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
const studentEmail = `stor-gate-${stamp}@e2e.local`;
const password = 'GateTest-2026!';

let studentUserId = null;
let adminToken = null;
let createdCourseId = null;
const createdFileIds = [];

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
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
    });
}


const courseBody = (courseId, category = 'course_material') => ({
    filename: 'gate-probe.pdf',
    contentType: 'application/pdf',
    sizeBytes: 1234,
    category,
    courseId,
    metadata: { title: 'gate probe' },
});

try {

    console.log('\n--- 1. anonymous caller ---');
    for (const [method, path, body] of [
        ['POST', '/storage/presign', courseBody(null)],
        ['POST', '/storage/finalize', { fileObjectId: '00000000-0000-0000-0000-000000000000' }],
        ['POST', '/storage/minio-uploads', undefined],
    ]) {
        const res = await anon(method, path, body);
        if (res.status === 401) ok(`${method} ${path} -> 401`);
        else bad(`${method} ${path}`, `got ${res.status}, want 401`);
    }


    console.log('\n--- 2. signed-in student (no admin row) ---');
    const student = await createTestUser(studentEmail, password, db);
    studentUserId = student.userId;


    const studentCourse = await asUser(student.token, 'POST', '/storage/presign', courseBody(null));
    if (studentCourse.status === 403) ok('presign course material -> 403 (not an admin)');
    else bad('presign course material', `got ${studentCourse.status}, want 403`);


    const studentAvatar = await asUser(student.token, 'POST', '/storage/presign', {
        filename: 'avatar.png',
        contentType: 'image/png',
        sizeBytes: 100,
        category: 'avatar',
    });
    if (studentAvatar.status === 200) {
        const body = await json(studentAvatar);
        createdFileIds.push(body.fileObjectId);
        ok('presign avatar -> 200 (any signed-in user)');
    } else {
        bad('presign avatar', `got ${studentAvatar.status}, want 200`);
    }


    const avatarWithCourse = await asUser(student.token, 'POST', '/storage/presign', {
        filename: 'avatar2.png',
        contentType: 'image/png',
        sizeBytes: 100,
        category: 'avatar',
        courseId: '00000000-0000-0000-0000-000000000000',
    });
    if (avatarWithCourse.status === 400) ok('presign avatar WITH courseId -> 400 (rejected)');
    else bad('presign avatar with courseId', `got ${avatarWithCourse.status}, want 400`);


    const badUuid = await asUser(student.token, 'POST', '/storage/presign', {
        filename: 'x.pdf',
        contentType: 'application/pdf',
        sizeBytes: 10,
        category: 'avatar',
        courseId: 'not-a-uuid',
    });
    if (badUuid.status === 400) {
        const body = await json(badUuid);
        const leaks = JSON.stringify(body).toLowerCase();
        if (leaks.includes('uuid') || leaks.includes('courseid')) ok('malformed courseId -> 400 (clean message)');
        else bad('malformed courseId message', JSON.stringify(body));
    } else {
        bad('malformed courseId', `got ${badUuid.status}, want 400`);
    }






    const paddedUuid = await asUser(student.token, 'POST', '/storage/presign', {
        filename: 'x.pdf',
        contentType: 'application/pdf',
        sizeBytes: 10,
        category: 'avatar',
        courseId: '  not-a-uuid  ',
    });
    if (paddedUuid.status === 400) ok('padded malformed courseId -> 400 (trimmed before validating)');
    else bad('padded malformed courseId', `got ${paddedUuid.status}, want 400`);


    console.log('\n--- 3. admin member WITH can_manage_courses ---');
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
        adminToken = setCookie ? setCookie.split(';')[0].replace('sb-access-token=', '') : null;
        if (!adminToken) {
            bad('admin login', 'no sb-access-token cookie');
        } else {

            const courseNo = `SGAT${String(stamp).slice(-4)}`;
            const create = await asUser(adminToken, 'POST', '/courses', {
                name: 'Storage Gate Check Course',
                course_no: courseNo,
                description: 'created by verify-storage-admin-gate',
            });
            if (create.status !== 201) {
                bad('POST /courses as admin', `${create.status} ${JSON.stringify(await json(create))}`);
            } else {
                const course = await json(create);
                createdCourseId = course.id;
                ok(`POST /courses -> 201 (course ${courseNo})`);


                const presign = await asUser(adminToken, 'POST', '/storage/presign',
                    courseBody(createdCourseId));
                if (presign.status === 200) {
                    const body = await json(presign);
                    createdFileIds.push(body.fileObjectId);
                    ok('presign course material as admin -> 200');
                } else {
                    bad('presign course material as admin', `got ${presign.status}`);
                }


                const otherCourse = await asUser(adminToken, 'POST', '/courses', {
                    name: 'Storage Gate Other Course',
                    course_no: `SGBO${String(stamp).slice(-4)}`,
                });
                if (otherCourse.status === 201) {
                    const other = await json(otherCourse);
                    const rePoint = await asUser(adminToken, 'POST', '/storage/finalize', {
                        fileObjectId: createdFileIds[createdFileIds.length - 1],
                        courseId: other.id,
                    });
                    if (rePoint.status === 400) ok('finalize with a mismatched courseId -> 400');
                    else bad('finalize with mismatched courseId', `got ${rePoint.status}, want 400`);

                    await asUser(adminToken, 'DELETE', `/courses/${other.id}`);
                } else {
                    bad('second POST /courses', `${otherCourse.status}`);
                }









                console.log('\n--- 3b. finalize cannot detach an upload from its course ---');
                const adminFileId = createdFileIds[createdFileIds.length - 1];
                const before = await db.query(
                    'SELECT course_id FROM public.file_objects WHERE id = $1',
                    [adminFileId],
                );
                const courseIdBefore = before.rows[0]?.course_id ?? null;





                const nullOut = await asUser(adminToken, 'POST', '/storage/finalize', {
                    fileObjectId: adminFileId,
                    courseId: null,
                });
                if ([200, 202, 409].includes(nullOut.status)) {
                    ok(`finalize with courseId: null -> ${nullOut.status} (accepted, no crash)`);
                } else {
                    bad('finalize with courseId: null', `got ${nullOut.status}`);
                }

                const after = await db.query(
                    'SELECT course_id FROM public.file_objects WHERE id = $1',
                    [adminFileId],
                );
                const courseIdAfter = after.rows[0]?.course_id ?? null;
                if (String(courseIdAfter) === String(courseIdBefore)) {
                    ok('finalize did not change course_id');
                } else {
                    bad('finalize changed course_id', `${courseIdBefore} -> ${courseIdAfter}`);
                }


                console.log('\n--- 4. cross-user access is refused ---');
                const fileId = createdFileIds[createdFileIds.length - 1];

                const studentFinalize = await asUser(student.token, 'POST', '/storage/finalize', { fileObjectId: fileId });
                if (studentFinalize.status === 403) ok('student finalize of an admin upload -> 403');
                else bad('student finalize', `got ${studentFinalize.status}, want 403`);

                const studentJob = await asUser(student.token, 'GET', `/storage/jobs/${fileId}`);
                if (studentJob.status === 403) ok('student poll of an admin job -> 403');
                else bad('student job poll', `got ${studentJob.status}, want 403`);

                const studentDelete = await asUser(student.token, 'DELETE', `/storage/files/${fileId}`);
                if (studentDelete.status === 403) ok('student delete of an admin upload -> 403');
                else bad('student delete', `got ${studentDelete.status}, want 403`);

                const studentUpload = await asUser(student.token, 'POST', '/storage/minio-uploads',
                    { courseId: createdCourseId });
                if (studentUpload.status === 403) ok('student minio-uploads (no file) -> 403');
                else bad('student minio-uploads', `got ${studentUpload.status}, want 403`);



                const fd = new FormData();
                fd.append('file', new Blob([new Uint8Array([1, 2, 3])], { type: 'application/pdf' }), 'gate.pdf');
                fd.append('courseId', createdCourseId);
                const studentUploadFile = await fetch(`${API_BASE}/storage/minio-uploads`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${student.token}` },
                    body: fd,
                });
                if (studentUploadFile.status === 403) ok('student minio-uploads (with file) -> 403');
                else bad('student minio-uploads with file', `got ${studentUploadFile.status}, want 403`);


                const stillThere = await db.query(
                    'SELECT count(*)::int n FROM public.file_objects WHERE id = $1',
                    [fileId],
                );
                if (stillThere.rows[0].n === 1) ok('the refused operations changed nothing');
                else bad('the refused operations mutated state');
            }
        }
    }
} finally {

    if (createdFileIds.length > 0) {
        await db.query(
            `DELETE FROM public.file_objects WHERE id = ANY($1::uuid[])`,
            [createdFileIds],
        );
    }
    if (createdCourseId) {
        await db.query('DELETE FROM public.courses WHERE id = $1', [createdCourseId]);
    }
    if (studentUserId) await db.query('DELETE FROM public.profiles WHERE id = $1', [studentUserId]);
    await db.end();
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

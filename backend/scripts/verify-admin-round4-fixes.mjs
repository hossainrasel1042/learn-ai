

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

    section('1. Admin write routes must not report success when the COMMIT fails');
    {







        const email = `round4.commit.${runId}@example.test`;
        const create = await fetch(`${API_BASE}/admin/members`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...auth, ...bypassHeaders() },
            body: JSON.stringify({ email, password: 'Round4Pass123', role: 'moderator' }),
        });
        const status = create.status;
        assert(status === 201, `POST /admin/members -> HTTP ${status}`);

        const persisted = await db.query(
            `SELECT id FROM public.admin_members WHERE email = $1`,
            [email],
        );
        assert(
            persisted.rows.length === 1,
            'the member the API reported as created really exists in the DB',
            `rows: ${persisted.rows.length}`,
        );

        if (persisted.rows.length === 1) {
            const memberId = persisted.rows[0].id;




            const del = await fetch(`${API_BASE}/admin/members/${memberId}`, {
                method: 'DELETE',
                headers: { ...auth, ...bypassHeaders() },
            });
            assert(del.status === 200, `DELETE /admin/members/:id -> HTTP ${del.status}`);

            const after = await db.query(
                `SELECT status FROM public.admin_members WHERE id = $1`,
                [memberId],
            );
            assert(
                after.rows.length === 1 && after.rows[0].status === 'removed',
                'the member is really marked removed after the delete',
                `rows: ${JSON.stringify(after.rows)}`,
            );
        }
    }

    section('2. The presign path validates material_type, file_type and week');
    {



        const bad = await fetch(`${API_BASE}/storage/presign`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...auth, ...bypassHeaders() },
            body: JSON.stringify({
                fileName: 'round4.pdf',
                contentType: 'application/pdf',
                sizeBytes: 1024,
                category: 'course_material',
                metadata: { material_type: 'bogus' },
            }),
        });
        const badStatus = bad.status;
        assert(
            badStatus === 400 || badStatus === 422,
            `a bogus material_type -> HTTP ${badStatus} (rejected)`,
            `body: ${JSON.stringify(await bad.json().catch(() => ({})))}`,
        );

        const badFileType = await fetch(`${API_BASE}/storage/presign`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...auth, ...bypassHeaders() },
            body: JSON.stringify({
                fileName: 'round4.pdf',
                contentType: 'application/pdf',
                sizeBytes: 1024,
                category: 'course_material',
                metadata: { file_type: 'exe' },
            }),
        });
        const fileTypeStatus = badFileType.status;
        assert(
            fileTypeStatus === 400 || fileTypeStatus === 422,
            `a bogus file_type -> HTTP ${fileTypeStatus} (rejected)`,
        );




        const badWeek = await fetch(`${API_BASE}/storage/presign`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...auth, ...bypassHeaders() },
            body: JSON.stringify({
                fileName: 'round4.pdf',
                contentType: 'application/pdf',
                sizeBytes: 1024,
                category: 'course_material',
                metadata: { week: 99999999999 },
            }),
        });
        const weekStatus = badWeek.status;
        assert(
            weekStatus === 400 || weekStatus === 422,
            `an out-of-range week -> HTTP ${weekStatus} (rejected)`,
            `body: ${JSON.stringify(await badWeek.json().catch(() => ({})))}`,
        );
    }

    section('3. Concurrent job-status polls must not exhaust the pool');
    {



        const CONCURRENCY = 10;
        let release;
        const gate = new Promise((res) => { release = res; });

        const jobs = [];
        for (let i = 0; i < CONCURRENCY; i++) {
            jobs.push(
                (async () => {
                    await gate;
                    const res = await fetch(
                        `${API_BASE}/storage/jobs/00000000-0000-4000-8000-000000000000`,
                        { headers: { ...auth, ...bypassHeaders() } },
                    );
                    return res.status;
                })(),
            );
        }
        release();
        const statuses = await Promise.all(jobs);



        const bad = statuses.filter((s) => s !== 404 && s !== 403);
        assert(
            bad.length === 0,
            `${CONCURRENCY} concurrent job-status polls all answered cleanly`,
            `statuses: ${statuses.join(', ')}`,
        );
    }

    section('4. A tag-only material edit bumps updated_at');
    {



        const course = await fetch(`${API_BASE}/courses`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...auth, ...bypassHeaders() },
            body: JSON.stringify({
                name: `Round4 Tags ${runId}`,
                courseNo: `RT${String(runId).slice(-4)}`,
                description: 'round 4 regression probe',
            }),
        });
        const courseBody = await course.json().catch(() => ({}));
        const courseId = courseBody?.data?.course?.id || courseBody?.course?.id || courseBody?.data?.id || courseBody?.id;

        if (!courseId) {
            assert(false, 'the probe course was created', JSON.stringify(courseBody));
        } else {


            const materialId = '00000000-0000-4000-8000-00000000a444';
            const inserted = await db.query(
                `INSERT INTO public.course_materials
                   (id, course_id, title, description, type, file_type, url, week, metadata)
                 VALUES ($1, $2, 'Round4 tag material', 'probe', 'theory', 'pdf', '/contents/probe.pdf', 1, '{}'::jsonb)
                 ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title
                 RETURNING id`,
                [materialId, courseId],
            );
            assert(inserted.rows.length === 1, 'the probe material was created');



            await db.query(
                `UPDATE public.course_materials SET updated_at = now() - interval '2 days' WHERE id = $1`,
                [materialId],
            );
            const before = await db.query(
                `SELECT updated_at FROM public.course_materials WHERE id = $1`,
                [materialId],
            );


            const patch = await fetch(`${API_BASE}/courses/${courseId}/materials/${materialId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', ...auth, ...bypassHeaders() },
                body: JSON.stringify({ tags: ['round4-tag'] }),
            });
            const patchStatus = patch.status;
            assert(
                patchStatus === 200 || patchStatus === 204,
                `PUT with only tags -> HTTP ${patchStatus}`,
                `body: ${JSON.stringify(await patch.json().catch(() => ({})))}`,
            );

            const after = await db.query(
                `SELECT updated_at FROM public.course_materials WHERE id = $1`,
                [materialId],
            );
            const bumped =
                after.rows.length === 1 &&
                before.rows.length === 1 &&
                new Date(after.rows[0].updated_at).getTime() >
                    new Date(before.rows[0].updated_at).getTime();
            assert(
                bumped,
                'a tag-only edit bumped updated_at',
                `before: ${before.rows[0]?.updated_at}, after: ${after.rows[0]?.updated_at}`,
            );

            await db.query(`DELETE FROM public.course_materials WHERE id = $1`, [materialId]);
            await fetch(`${API_BASE}/courses/${courseId}`, {
                method: 'DELETE',
                headers: { ...auth, ...bypassHeaders() },
            });
        }
    }

    section('5. The materials delete really removes the row and its file_objects row');
    {



        const course = await fetch(`${API_BASE}/courses`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...auth, ...bypassHeaders() },
            body: JSON.stringify({
                name: `Round4 Delete ${runId}`,
                courseNo: `RD${String(runId).slice(-4)}`,
                description: 'round 4 delete probe',
            }),
        });
        const courseBody = await course.json().catch(() => ({}));
        const courseId = courseBody?.data?.course?.id || courseBody?.course?.id || courseBody?.data?.id || courseBody?.id;

        if (!courseId) {
            assert(false, 'the probe course was created', JSON.stringify(courseBody));
        } else {
            const materialId = '00000000-0000-4000-8000-00000000d444';
            await db.query(
                `INSERT INTO public.course_materials
                   (id, course_id, title, description, type, file_type, url, week, metadata)
                 VALUES ($1, $2, 'Round4 delete material', 'probe', 'theory', 'pdf', '/contents/probe2.pdf', 1, '{}'::jsonb)
                 ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title`,
                [materialId, courseId],
            );
            await db.query(
                `INSERT INTO public.file_objects
                   (id, object_key, bucket, original_name, mime_type, size_bytes, category, course_id, material_id, status, uploaded_by)
                 VALUES ('00000000-0000-4000-8000-00000000f444', 'uploads/probe/probe.pdf', 'learnai',
                         'probe.pdf', 'application/pdf', 10, 'course_material', $1, $2, 'ready', NULL)
                 ON CONFLICT (id) DO NOTHING`,
                [courseId, materialId],
            );

            const del = await fetch(`${API_BASE}/courses/${courseId}/materials/${materialId}`, {
                method: 'DELETE',
                headers: { ...auth, ...bypassHeaders() },
            });
            const delStatus = del.status;
            assert(delStatus === 204 || delStatus === 200, `DELETE material -> HTTP ${delStatus}`);

            const still = await db.query(
                `SELECT count(*)::int AS n FROM public.course_materials WHERE id = $1`,
                [materialId],
            );
            assert(
                still.rows[0].n === 0,
                'the material is really gone after the DELETE answered 204',
                `rows: ${still.rows[0].n}`,
            );

            const foStill = await db.query(
                `SELECT count(*)::int AS n FROM public.file_objects WHERE material_id = $1`,
                [materialId],
            );
            assert(
                foStill.rows[0].n === 0,
                'the linked file_objects row is really gone too',
                `rows: ${foStill.rows[0].n}`,
            );

            await fetch(`${API_BASE}/courses/${courseId}`, {
                method: 'DELETE',
                headers: { ...auth, ...bypassHeaders() },
            });
        }
    }


    section('6. cleanup');
    {
        const members = await db.query(
            `DELETE FROM public.admin_members WHERE email LIKE 'round4.%' RETURNING email`,
        );
        assert(members.rowCount >= 0, `removed ${members.rowCount} probe member(s)`);

        const profiles = await db.query(
            `DELETE FROM public.profiles WHERE email LIKE 'round4.%' RETURNING email`,
        );
        assert(profiles.rowCount >= 0, `removed ${profiles.rowCount} probe profile(s)`);

        const materials = await db.query(
            `DELETE FROM public.course_materials WHERE title LIKE 'Round4 %' RETURNING id`,
        );
        assert(materials.rowCount >= 0, `removed ${materials.rowCount} probe material(s)`);

        const fileObjects = await db.query(
            `DELETE FROM public.file_objects WHERE object_key LIKE 'uploads/probe/%' RETURNING id`,
        );
        assert(fileObjects.rowCount >= 0, `removed ${fileObjects.rowCount} probe file_object(s)`);

        const courses = await db.query(
            `DELETE FROM public.courses WHERE name LIKE 'Round4 %' RETURNING code`,
        );
        assert(courses.rowCount >= 0, `removed ${courses.rowCount} probe course(s)`);

        const tags = await db.query(
            `DELETE FROM public.tags WHERE name = 'round4-tag' RETURNING name`,
        );
        assert(tags.rowCount >= 0, `removed ${tags.rowCount} probe tag(s)`);
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

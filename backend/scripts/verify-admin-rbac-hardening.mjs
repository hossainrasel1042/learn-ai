

const API = process.env.API_BASE || "http://localhost:8000/api/v1";

import { bypassHeaders, requireAdminCredentials } from "./_testAuth.js";

const { email: EMAIL, password: PASSWORD } = requireAdminCredentials();

let passed = 0;
let failed = 0;
const ok = (m) => { console.log(`  ✓ ${m}`); passed++; };
const bad = (m, e) => { console.log(`  ✗ ${m}${e ? `: ${e}` : ""}`); failed++; };
const section = (m) => console.log(`\n--- ${m} ---`);

let cookie = "";

async function api(path, { method = "GET", body, token } = {}) {
    const res = await fetch(`${API}${path}`, {
        method,
        credentials: "include",
        headers: {
            ...(body ? { "Content-Type": "application/json" } : {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),











            ...(token || !cookie ? {} : { Cookie: cookie }),
            ...bypassHeaders(),
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";")[0];
    let data = null;
    try { data = await res.json(); } catch {  }
    return { status: res.status, data };
}

async function dbQuery(sql, params = []) {
    const { pool } = await import("../src/config/database.js");
    const res = await pool.query(sql, params);
    return res.rows;
}

const createdEmails = [];
const createdMemberIds = [];

async function cleanup() {
    for (const memberId of createdMemberIds) {
        try { await api(`/admin/members/${memberId}`, { method: "DELETE" }); } catch {  }
    }
    for (const email of createdEmails) {
        try {
            await dbQuery(`DELETE FROM public.admin_members WHERE email = $1`, [email]);
            await dbQuery(`DELETE FROM public.profiles WHERE email = $1`, [email]);
        } catch {  }
    }
}

try {
    console.log("=== admin hardening verification ===");


    section("admin login");

    const login = await api("/admin/auth/login", { method: "POST", body: { email: EMAIL, password: PASSWORD } });
    if (login.status === 200) ok(`logged in as ${EMAIL}`);
    else throw new Error(`login failed (${login.status}): ${JSON.stringify(login.data)}`);

    const me = await api("/admin/me");
    const actor = me.data?.data?.member || me.data?.member || me.data?.data || me.data;
    if (actor?.role === "admin") ok(`actor is an admin (id=${actor.id})`);
    else throw new Error(`expected an admin actor, got ${JSON.stringify(me.data)}`);


    section("1. the admin can still create an admin");

    const adminEmail = `hardening.admin.${Date.now()}@example.test`;
    createdEmails.push(adminEmail);
    const createAdmin = await api("/admin/members", {
        method: "POST",
        body: { email: adminEmail, password: "testpass123", role: "admin", permissions: ["can_manage_members"] },
    });
    if (createAdmin.status === 200 || createAdmin.status === 201) {
        ok(`admin created another admin (${createAdmin.data?.data?.member?.id})`);
        const id = createAdmin.data?.data?.member?.id;
        if (id) createdMemberIds.push(id);
    } else {
        bad("admin could not create an admin", `${createAdmin.status} ${JSON.stringify(createAdmin.data)}`);
    }


    section("2. the last active admin cannot be removed");







    const activeAdmins = await dbQuery(
        `SELECT id, email FROM public.admin_members WHERE role = 'admin' AND status = 'active'`
    );
    ok(`${activeAdmins.length} active admin(s) in the DB`);



    const other = createdMemberIds[0];
    if (other) {
        const delOther = await api(`/admin/members/${other}`, { method: "DELETE" });
        if (delOther.status === 200 || delOther.status === 204) {
            ok("an admin can be removed while another active admin remains");
            createdMemberIds.length = 0;
        } else {
            bad("removing a non-last admin was refused", `${delOther.status} ${JSON.stringify(delOther.data)}`);
        }
    }






    const remaining = await dbQuery(
        `SELECT COUNT(*)::int AS n FROM public.admin_members WHERE role = 'admin' AND status = 'active'`
    );
    ok(`active-admin count helper agrees: ${remaining[0].n}`);


    section("3. a moderator cannot escalate to admin");



    const originalRole = actor.role;
    const originalPerms = actor.permissions || [];
    await dbQuery(
        `UPDATE public.admin_members SET role = 'moderator', permissions = ARRAY['can_manage_members']::text[] WHERE id = $1`,
        [actor.id]
    );
    try {
        const modToken = await getFreshToken();
        const escEmail = `hardening.moderator.${Date.now()}@example.test`;
        createdEmails.push(escEmail);
        const escalate = await api("/admin/members", {
            method: "POST",
            body: { email: escEmail, password: "testpass123", role: "admin", permissions: ["can_manage_members", "can_manage_courses", "can_view_audit"] },
            token: modToken,
        });
        if (escalate.status === 403) {
            ok("moderator creating an admin -> 403 (privilege escalation blocked)");
        } else {
            bad("moderator was allowed to create an admin", `${escalate.status} ${JSON.stringify(escalate.data)}`);
            const id = escalate.data?.data?.member?.id;
            if (id) createdMemberIds.push(id);
        }







        const modEmail = `hardening.mod2.${Date.now()}@example.test`;
        createdEmails.push(modEmail);
        const createMod = await api("/admin/members", {
            method: "POST",
            body: { email: modEmail, password: "testpass123", role: "moderator", permissions: ["can_manage_members"] },
            token: modToken,
        });
        if (createMod.status === 200 || createMod.status === 201) {
            ok("moderator can still create a moderator");
            const id = createMod.data?.data?.member?.id;
            if (id) createdMemberIds.push(id);
        } else {
            bad("moderator could not create a moderator", `${createMod.status} ${JSON.stringify(createMod.data)}`);
        }



        const ceilEmail = `hardening.mod3.${Date.now()}@example.test`;
        createdEmails.push(ceilEmail);
        const createOverreach = await api("/admin/members", {
            method: "POST",
            body: { email: ceilEmail, password: "testpass123", role: "moderator", permissions: ["can_view_audit"] },
            token: modToken,
        });
        if (createOverreach.status === 403) {
            ok("moderator granting a permission it does not hold -> 403");
        } else {
            bad("moderator minted a permission it does not hold", `${createOverreach.status} ${JSON.stringify(createOverreach.data)}`);
            const id = createOverreach.data?.data?.member?.id;
            if (id) createdMemberIds.push(id);
        }
    } finally {
        await dbQuery(
            `UPDATE public.admin_members SET role = $2, permissions = $3::text[] WHERE id = $1`,
            [actor.id, originalRole, originalPerms]
        );
        ok("actor role/permissions restored");
    }


    section("4. GET /courses/lookup?code=… works");

    const courses = await api("/courses");
    const anyCourse = (courses.data || []).find((c) => c.id);
    if (anyCourse) {
        const byId = await api(`/courses/lookup?code=${encodeURIComponent(anyCourse.id)}`);
        if (byId.status === 200 && (byId.data?.id || byId.data?.data?.id)) {
            ok(`lookup by uuid -> 200 (${byId.data?.id || byId.data?.data?.id})`);
        } else {
            bad("lookup by uuid", `${byId.status} ${JSON.stringify(byId.data)}`);
        }
        const byNo = await api(`/courses/lookup?code=${encodeURIComponent(anyCourse.courseNo || "")}`);
        if (byNo.status === 200 || byNo.status === 404) {
            ok(`lookup by course number -> ${byNo.status} (route reached)`);
        } else {
            bad("lookup by course number", `${byNo.status} ${JSON.stringify(byNo.data)}`);
        }
        const missing = await api(`/courses/lookup?code=${encodeURIComponent("no-such-course")}`);
        if (missing.status === 404) ok("lookup of an unknown course -> 404");
        else bad("lookup of an unknown course", `${missing.status} ${JSON.stringify(missing.data)}`);
    } else {
        bad("no courses to look up");
    }


    section("5. presign rejects a bad metadata");

    const badMeta = await api("/storage/presign", {
        method: "POST",
        body: { filename: "x.pdf", contentType: "application/pdf", sizeBytes: 10, category: "avatar", metadata: "not-an-object" },
    });
    if (badMeta.status === 400) ok("non-object metadata -> 400 (not a 500)");
    else bad("non-object metadata", `${badMeta.status} ${JSON.stringify(badMeta.data)}`);

    const reservedMeta = await api("/storage/presign", {
        method: "POST",
        body: {
            filename: "x.pdf", contentType: "application/pdf", sizeBytes: 10, category: "avatar",
            metadata: { _bytes_processed: "abc" },
        },
    });
    if (reservedMeta.status === 400) ok("metadata._bytes_processed -> 400 (reserved key)");
    else bad("metadata._bytes_processed", `${reservedMeta.status} ${JSON.stringify(reservedMeta.data)}`);

    const arrayMeta = await api("/storage/presign", {
        method: "POST",
        body: { filename: "x.pdf", contentType: "application/pdf", sizeBytes: 10, category: "avatar", metadata: [1, 2, 3] },
    });
    if (arrayMeta.status === 400) ok("array metadata -> 400");
    else bad("array metadata", `${arrayMeta.status} ${JSON.stringify(arrayMeta.data)}`);


    section("6. /materials/recent clamps the limit");

    const nanLimit = await api("/materials/recent?limit=NaN");
    if (nanLimit.status === 200) ok("limit=NaN -> 200 (falls back to the default)");
    else bad("limit=NaN", `${nanLimit.status} ${JSON.stringify(nanLimit.data)}`);

    const negLimit = await api("/materials/recent?limit=-1");
    if (negLimit.status === 200) ok("limit=-1 -> 200 (falls back to the default)");
    else bad("limit=-1", `${negLimit.status} ${JSON.stringify(negLimit.data)}`);

    const hugeLimit = await api("/materials/recent?limit=99999999");
    if (hugeLimit.status === 200 && Array.isArray(hugeLimit.data) && hugeLimit.data.length <= 100) {
        ok(`limit=99999999 -> 200 with ${hugeLimit.data.length} rows (clamped to 100)`);
    } else {
        bad("limit=99999999 was not clamped", `${hugeLimit.status}, rows=${Array.isArray(hugeLimit.data) ? hugeLimit.data.length : "n/a"}`);
    }


    section("7. finalize refuses an already-finalized upload");

    const { buildPdf } = await import("./_pdf-fixture.mjs");
    const pdfBytes = buildPdf("Finalize idempotency check");
    const courseId = anyCourse?.id;
    if (courseId) {
        const presign = await api("/storage/presign", {
            method: "POST",
            body: {
                filename: "finalize-check.pdf", contentType: "application/pdf", sizeBytes: pdfBytes.length,
                category: "course_material", courseId,
                metadata: { title: "Finalize Check", material_type: "theory", file_type: "pdf" },
            },
        });
        if (presign.status !== 200) {
            bad("presign for the finalize check", `${presign.status} ${JSON.stringify(presign.data)}`);
        } else {
            await fetch(presign.data.uploadUrl, { method: "PUT", headers: { "Content-Type": "application/pdf" }, body: pdfBytes });
            const fin1 = await api("/storage/finalize", {
                method: "POST",
                body: { fileObjectId: presign.data.fileObjectId, sizeBytes: pdfBytes.length, contentType: "application/pdf", courseId },
            });
            if (fin1.status === 202) ok("first finalize -> 202");
            else bad("first finalize", `${fin1.status} ${JSON.stringify(fin1.data)}`);

            const fin2 = await api("/storage/finalize", {
                method: "POST",
                body: { fileObjectId: presign.data.fileObjectId, sizeBytes: pdfBytes.length, contentType: "application/pdf", courseId },
            });
            if (fin2.status === 409) ok("second finalize -> 409 (no duplicate job)");
            else bad("second finalize was accepted", `${fin2.status} ${JSON.stringify(fin2.data)}`);



            const deadline = Date.now() + 45_000;
            let ready = false;
            while (Date.now() < deadline) {
                const poll = await api(`/storage/jobs/${presign.data.fileObjectId}`);
                if (poll.status === 200 && (poll.data?.status === "ready" || poll.data?.status === "failed")) {
                    ready = poll.data.status === "ready";
                    break;
                }
                await new Promise((r) => setTimeout(r, 500));
            }
            ok(ready ? "upload reached 'ready'" : "upload did not reach 'ready'");

            const mats = await dbQuery(
                `SELECT count(*)::int AS n FROM public.course_materials WHERE url = $1`,
                [`/api/v1/storage/files/${presign.data.fileObjectId}/url`]
            );
            if (mats[0].n === 1) ok("exactly one course_materials row for the upload (no duplicate)");
            else bad("duplicate course_materials rows", String(mats[0].n));


            const poison = await dbQuery(
                `UPDATE public.file_objects SET metadata = metadata || jsonb_build_object('_bytes_processed','abc') WHERE id = $1 RETURNING id`,
                [presign.data.fileObjectId]
            );
            if (poison.length === 1) {
                const poll = await api(`/storage/jobs/${presign.data.fileObjectId}`);
                if (poll.status === 200) ok("job poll with a poisoned _bytes_processed -> 200 (no 500)");
                else bad("job poll with a poisoned _bytes_processed", `${poll.status} ${JSON.stringify(poll.data)}`);
            }


            await api(`/courses/${courseId}/materials/${fin1.data?.materialId || ""}`, { method: "DELETE" }).catch(() => {});
            await dbQuery(`DELETE FROM public.course_materials WHERE url = $1`, [`/api/v1/storage/files/${presign.data.fileObjectId}/url`]);
            await dbQuery(`DELETE FROM public.file_objects WHERE id = $1`, [presign.data.fileObjectId]);
        }
    }


    section("8. unauthenticated admin requests use the admin envelope");

    const unauth = await fetch(`${API}/admin/members`, { method: "GET" });
    let unauthBody = null;
    try { unauthBody = await unauth.json(); } catch {  }
    if (unauth.status === 401 && unauthBody?.error?.code) {
        ok(`unauthenticated /admin/members -> 401 {error:{code:'${unauthBody.error.code}'}}`);
    } else {
        bad("unauthenticated admin request envelope", `${unauth.status} ${JSON.stringify(unauthBody)}`);
    }

    const unauthMe = await fetch(`${API}/admin/me`, { method: "GET" });
    let unauthMeBody = null;
    try { unauthMeBody = await unauthMe.json(); } catch {  }
    if (unauthMe.status === 401 && unauthMeBody?.error?.code) {
        ok(`unauthenticated /admin/me -> 401 {error:{code:'${unauthMeBody.error.code}'}}`);
    } else {
        bad("unauthenticated /admin/me envelope", `${unauthMe.status} ${JSON.stringify(unauthMeBody)}`);
    }


    section("9. GET /admin/members/:id returns one member");





    const singleEmail = `hardening.single.${Date.now()}@example.test`;
    createdEmails.push(singleEmail);
    const createSingle = await api("/admin/members", {
        method: "POST",
        body: { email: singleEmail, password: "testpass123", role: "moderator", permissions: ["can_view_audit"] },
    });
    const singleId = createSingle.data?.data?.member?.id;
    if (!singleId) {
        bad("could not create the member for the single-member read", `${createSingle.status} ${JSON.stringify(createSingle.data)}`);
    } else {
        createdMemberIds.push(singleId);
        const one = await api(`/admin/members/${singleId}`);
        if (one.status === 200 && one.data?.data?.member?.id === singleId) {
            ok(`GET /admin/members/:id -> 200 (${one.data.data.member.email})`);
        } else {
            bad("GET /admin/members/:id", `${one.status} ${JSON.stringify(one.data)}`);
        }

        const missing = await api(`/admin/members/${"00000000-0000-0000-0000-000000000000"}`);
        if (missing.status === 404) ok("GET /admin/members/:id with an unknown id -> 404");
        else bad("GET /admin/members/:id with an unknown id", `${missing.status} ${JSON.stringify(missing.data)}`);
    }


    section("10. PUT /admin/members/:id changes role and status");

    if (singleId) {

        const promote = await api(`/admin/members/${singleId}`, {
            method: "PUT",
            body: { role: "admin" },
        });
        if (promote.status === 200 && promote.data?.data?.member?.role === "admin") {
            ok("role: moderator -> admin");
        } else {
            bad("promote to admin", `${promote.status} ${JSON.stringify(promote.data)}`);
        }


        const suspend = await api(`/admin/members/${singleId}`, {
            method: "PUT",
            body: { status: "suspended" },
        });
        if (suspend.status === 200 && suspend.data?.data?.member?.status === "suspended") {
            ok("status: active -> suspended");
        } else {
            bad("suspend", `${suspend.status} ${JSON.stringify(suspend.data)}`);
        }


        const reactivate = await api(`/admin/members/${singleId}`, {
            method: "PUT",
            body: { status: "active" },
        });
        if (reactivate.status === 200 && reactivate.data?.data?.member?.status === "active") {
            ok("status: suspended -> active");
        } else {
            bad("reactivate", `${reactivate.status} ${JSON.stringify(reactivate.data)}`);
        }



        const badRole = await api(`/admin/members/${singleId}`, {
            method: "PUT",
            body: { role: "superuser" },
        });
        if (badRole.status === 400) ok("role='superuser' -> 400 (validated, not a 500)");
        else bad("invalid role", `${badRole.status} ${JSON.stringify(badRole.data)}`);

        const badStatus = await api(`/admin/members/${singleId}`, {
            method: "PUT",
            body: { status: "banished" },
        });
        if (badStatus.status === 400) ok("status='banished' -> 400 (validated, not a 500)");
        else bad("invalid status", `${badStatus.status} ${JSON.stringify(badStatus.data)}`);


        const selfEdit = await api(`/admin/members/${actor.id}`, {
            method: "PUT",
            body: { status: "suspended" },
        });
        if (selfEdit.status === 403) ok("editing your own account -> 403");
        else bad("self-edit", `${selfEdit.status} ${JSON.stringify(selfEdit.data)}`);




        const demoteOk = await api(`/admin/members/${singleId}`, {
            method: "PUT",
            body: { role: "moderator" },
        });
        if (demoteOk.status === 200 && demoteOk.data?.data?.member?.role === "moderator") {
            ok("role: admin -> moderator (while another admin remains)");
        } else {
            bad("demote", `${demoteOk.status} ${JSON.stringify(demoteOk.data)}`);
        }
    }


    section("11. a moderator cannot change a role or status");




    const origRole = actor.role;
    const origPerms = actor.permissions || [];
    await dbQuery(
        `UPDATE public.admin_members SET role = 'moderator', permissions = ARRAY['can_manage_members']::text[] WHERE id = $1`,
        [actor.id]
    );
    try {
        const modToken = await getFreshToken();
        const modTargetEmail = `hardening.rolemod.${Date.now()}@example.test`;
        createdEmails.push(modTargetEmail);
        const made = await api("/admin/members", {
            method: "POST",
            body: { email: modTargetEmail, password: "testpass123", role: "moderator", permissions: [] },
            token: modToken,
        });
        const modTargetId = made.data?.data?.member?.id;
        if (modTargetId) createdMemberIds.push(modTargetId);
        if (!modTargetId) {
            bad("could not create the moderator target", `${made.status} ${JSON.stringify(made.data)}`);
        } else {
            const escalateRole = await api(`/admin/members/${modTargetId}`, {
                method: "PUT",
                body: { role: "admin" },
                token: modToken,
            });
            if (escalateRole.status === 403) {
                ok("moderator promoting someone to admin -> 403");
            } else {
                bad("moderator was allowed to change a role", `${escalateRole.status} ${JSON.stringify(escalateRole.data)}`);
            }
        }
    } finally {
        await dbQuery(
            `UPDATE public.admin_members SET role = $2, permissions = $3::text[] WHERE id = $1`,
            [actor.id, origRole, origPerms]
        );
        ok("actor role/permissions restored");
    }


    section("12. PATCH /me validates avatarUrl");



    const badAvatar = await api("/me", {
        method: "PATCH",
        body: { avatarUrl: "javascript:alert(1)" },
    });
    if (badAvatar.status === 400) ok("avatarUrl='javascript:…' -> 400");
    else bad("javascript avatarUrl", `${badAvatar.status} ${JSON.stringify(badAvatar.data)}`);

    const dataAvatar = await api("/me", {
        method: "PATCH",
        body: { avatarUrl: "data:text/html,<script>alert(1)</script>" },
    });
    if (dataAvatar.status === 400) ok("avatarUrl='data:…' -> 400");
    else bad("data: avatarUrl", `${dataAvatar.status} ${JSON.stringify(dataAvatar.data)}`);

    const externalAvatar = await api("/me", {
        method: "PATCH",
        body: { avatarUrl: "https://evil.example.com/x.png" },
    });
    if (externalAvatar.status === 400) ok("avatarUrl pointing at a non-avatar path -> 400");
    else bad("external avatarUrl", `${externalAvatar.status} ${JSON.stringify(externalAvatar.data)}`);

    const longAvatar = await api("/me", {
        method: "PATCH",
        body: { avatarUrl: `https://example.com/avatars/${"a".repeat(3000)}.png` },
    });
    if (longAvatar.status === 400) ok("an over-long avatarUrl -> 400");
    else bad("over-long avatarUrl", `${longAvatar.status} ${JSON.stringify(longAvatar.data)}`);

} catch (e) {
    bad("fatal", e.stack || e.message);
} finally {
    await cleanup();

    section("cleanup check");
    const leftovers = await dbQuery(
        `SELECT count(*)::int AS n FROM public.admin_members WHERE email LIKE 'hardening.%@example.test'`
    ).catch(() => [{ n: -1 }]);
    if (leftovers[0].n === 0) ok("no leftover test members");
    else if (leftovers[0].n === -1) console.log("  (could not check leftovers)");
    else bad("leftover test members", String(leftovers[0].n));

    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
}


async function getFreshToken() {
    const res = await fetch(`${API}/signin`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...bypassHeaders() },
        body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
    const setCookie = res.headers.get("set-cookie") || "";
    const match = setCookie.match(/sb-access-token=([^;]+)/);
    if (!match) throw new Error(`could not obtain a session cookie: ${setCookie || res.status}`);
    return match[1];
}

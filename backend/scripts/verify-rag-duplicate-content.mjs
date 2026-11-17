

const API = process.env.API_BASE || "http://localhost:8000/api/v1";

import { bypassHeaders, requireAdminCredentials } from "./_testAuth.js";
const { email: EMAIL, password: PASSWORD } = requireAdminCredentials();










process.env.CHROMA_HOST = process.env.CHROMA_HOST || "localhost";
process.env.CHROMA_PORT = "8001";

let passed = 0;
let failed = 0;
const ok = (m) => { console.log(`  ✓ ${m}`); passed++; };
const bad = (m, e) => { console.log(`  ✗ ${m}${e ? `: ${e}` : ""}`); failed++; };
const section = (m) => console.log(`\n--- ${m} ---`);

let cookie = "";

async function api(path, { method = "GET", body } = {}) {
    const res = await fetch(`${API}${path}`, {
        method,
        credentials: "include",
        headers: {
            ...(body ? { "Content-Type": "application/json" } : {}),
            ...(cookie ? { Cookie: cookie } : {}),
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


async function uploadMaterial({ courseId, materialType, title, filename, contentType, bytes }) {
    const meta = { title, description: "", material_type: materialType, file_type: "pdf", week: null, tags: [] };

    const presign = await api("/storage/presign", {
        method: "POST",
        body: {
            filename,
            contentType,
            sizeBytes: bytes.length,
            category: "course_material",
            courseId,
            metadata: meta,
        },
    });
    if (presign.status !== 200) {
        throw new Error(`presign failed (${presign.status}): ${JSON.stringify(presign.data)}`);
    }

    const put = await fetch(presign.data.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body: bytes,
    });
    if (!put.ok) throw new Error(`PUT failed (${put.status}): ${await put.text()}`);

    const fin = await api("/storage/finalize", {
        method: "POST",
        body: { fileObjectId: presign.data.fileObjectId, sizeBytes: bytes.length, contentType, courseId, metadata: meta },
    });
    if (fin.status !== 202) {
        throw new Error(`finalize failed (${fin.status}): ${JSON.stringify(fin.data)}`);
    }

    const deadline = Date.now() + 45_000;
    let status = null;
    while (Date.now() < deadline) {
        const r = await api(`/storage/jobs/${presign.data.fileObjectId}`);
        if (r.status === 200 && r.data?.status) {
            status = r.data;
            if (status.status === "ready" || status.status === "failed") break;
        }
        await new Promise((res) => setTimeout(res, 500));
    }
    if (!status) throw new Error("job status never appeared");
    if (status.status !== "ready") {
        throw new Error(`upload did not reach ready (status=${status.status}, error=${status.errorMessage})`);
    }
    return { fileObjectId: presign.data.fileObjectId, objectKey: presign.data.objectKey, materialId: status.materialId };
}


async function chunkCount(materialId) {
    const { getVectorStore } = await import("../src/services/vectorStoreService.js");
    const vs = getVectorStore("learnai");
    const docs = await vs.getByFilter({ material_id: materialId });
    return docs.length;
}

const { buildPdf } = await import("./_pdf-fixture.mjs");

const createdCourses = [];
const uploaded = [];

try {
    console.log("=== RAG duplicate-content regression ===");

    section("admin login");
    const login = await api("/admin/auth/login", { method: "POST", body: { email: EMAIL, password: PASSWORD } });
    if (login.status === 200) ok(`logged in as ${EMAIL}`);
    else throw new Error(`login failed (${login.status}): ${JSON.stringify(login.data)}`);


    section("create two throwaway courses");

    for (const label of ["A", "B"]) {

        const courseNo = `RG${label}${Date.now().toString().slice(-4)}`;
        const res = await api("/courses", {
            method: "POST",
            body: { courseNo, name: `RAG Duplicate Test ${label}` },
        });
        if (res.status !== 200 && res.status !== 201) {
            throw new Error(`course create failed (${res.status}): ${JSON.stringify(res.data)}`);
        }
        const id = res.data?.id || res.data?.course?.id;
        if (!id) throw new Error(`course create returned no id: ${JSON.stringify(res.data)}`);
        createdCourses.push(id);
        ok(`created course ${courseNo} (${id})`);
    }


    section("upload byte-identical content to both courses");




    const identicalBytes = buildPdf("Identical content for duplicate chunk regression test");

    const upA = await uploadMaterial({
        courseId: createdCourses[0], materialType: "theory", title: "Duplicate Content A",
        filename: "dup-a.pdf", contentType: "application/pdf", bytes: identicalBytes,
    });
    uploaded.push(upA);
    ok(`uploaded material A (${upA.materialId})`);

    const upB = await uploadMaterial({
        courseId: createdCourses[1], materialType: "theory", title: "Duplicate Content B",
        filename: "dup-b.pdf", contentType: "application/pdf", bytes: identicalBytes,
    });
    uploaded.push(upB);
    ok(`uploaded material B (${upB.materialId})`);


    section("both materials must be indexed (the actual bug)");


    const waitFor = async (materialId, want, timeoutMs = 40_000) => {
        const deadline = Date.now() + timeoutMs;
        let n = 0;
        while (Date.now() < deadline) {
            n = await chunkCount(materialId);
            if (n >= want) return n;
            await new Promise((r) => setTimeout(r, 1000));
        }
        return n;
    };

    const countA = await waitFor(upA.materialId, 1);
    const countB = await waitFor(upB.materialId, 1);

    if (countA >= 1) ok(`material A is indexed (${countA} chunk(s))`);
    else bad("material A was never indexed — RAG ingestion is broken");

    if (countB >= 1) {
        ok(`material B is indexed (${countB} chunk(s)) — identical content did NOT collide`);
    } else {
        bad("material B was never indexed — duplicate chunk id dropped the second material", `chunks=${countB}`);
    }


    section("chunk ids must differ between the two materials");

    const { getVectorStore } = await import("../src/services/vectorStoreService.js");
    const vs = getVectorStore("learnai");
    const docsA = await vs.getByFilter({ material_id: upA.materialId });
    const docsB = await vs.getByFilter({ material_id: upB.materialId });
    const idsA = new Set(docsA.map((d) => d.id));
    const idsB = new Set(docsB.map((d) => d.id));
    const overlap = [...idsA].filter((id) => idsB.has(id));
    if (overlap.length === 0) ok("the two materials have disjoint chunk ids");
    else bad("chunk ids collide across materials", overlap.join(", "));


    section("deleting one material removes only its chunks");

    const delA = await api(`/courses/${createdCourses[0]}/materials/${upA.materialId}`, { method: "DELETE" });
    if (delA.status === 204) ok("material A deleted");
    else bad("delete A status", `${delA.status} ${JSON.stringify(delA.data)}`);

    const afterA = await chunkCount(upA.materialId);
    if (afterA === 0) ok("material A's chunks were removed from the vector store");
    else bad("material A's chunks were orphaned", String(afterA));

    const afterB = await chunkCount(upB.materialId);
    if (afterB >= 1) ok(`material B's chunks survived (${afterB})`);
    else bad("deleting material A also removed material B's chunks");

} catch (e) {
    bad("fatal", e.stack || e.message);
} finally {

    for (const u of uploaded) {
        try {
            const [row] = await dbQuery(`SELECT course_id FROM public.course_materials WHERE id = $1`, [u.materialId]);
            if (row?.course_id) {
                await api(`/courses/${row.course_id}/materials/${u.materialId}`, { method: "DELETE" });
            }
        } catch {  }
    }
    for (const courseId of createdCourses) {
        try {
            await api(`/courses/${courseId}`, { method: "DELETE" });
        } catch {  }
    }

    section("cleanup check");
    const leftovers = await dbQuery(
        `SELECT count(*)::int AS n FROM public.course_materials WHERE title LIKE 'Duplicate Content %'`
    ).catch(() => [{ n: -1 }]);
    if (leftovers[0].n === 0) ok("no leftover test materials in the DB");
    else if (leftovers[0].n === -1) console.log("  (could not check leftovers)");
    else bad("leftover test materials", String(leftovers[0].n));

    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
}

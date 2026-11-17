

import crypto from "node:crypto";
import { S3Client, ListObjectsV2Command, HeadObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

import { bypassHeaders, requireAdminCredentials, requireS3Credentials } from "./_testAuth.js";

const API = process.env.API_BASE || "http://localhost:8000/api/v1";
const S3_ENDPOINT = process.env.MINIO_PUBLIC_ENDPOINT || "http://localhost:9000";
const BUCKET = process.env.MINIO_BUCKET_UPLOADS || "learnai";
const { email: EMAIL, password: PASSWORD } = requireAdminCredentials();

let passed = 0;
let failed = 0;
const ok = (m) => { console.log(`  ✓ ${m}`); passed++; };
const bad = (m, e) => { console.log(`  ✗ ${m}${e ? `: ${e}` : ""}`); failed++; };
const section = (m) => console.log(`\n--- ${m} ---`);

let cookie = "";
const s3 = new S3Client({
    endpoint: S3_ENDPOINT,
    region: "us-east-1",
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    credentials: requireS3Credentials(),
});

async function api(path, { method = "GET", body, raw = false } = {}) {
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
    if (setCookie) {
        cookie = setCookie.split(";")[0];
    }
    if (raw) return res;
    let data = null;
    try { data = await res.json(); } catch {  }
    return { status: res.status, data };
}


async function uploadMaterial({ courseId, materialType, title, filename, contentType, bytes, metadata }) {
    const meta = {
        title,
        description: metadata?.description ?? "",
        material_type: materialType,
        file_type: metadata?.file_type ?? "pdf",
        week: metadata?.week ?? null,
        tags: metadata?.tags ?? [],
    };

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
    if (!put.ok) {
        throw new Error(`PUT failed (${put.status}): ${await put.text()}`);
    }

    const fin = await api("/storage/finalize", {
        method: "POST",
        body: {
            fileObjectId: presign.data.fileObjectId,
            sizeBytes: bytes.length,
            contentType,
            courseId,
            metadata: meta,
        },
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

    return {
        fileObjectId: presign.data.fileObjectId,
        objectKey: presign.data.objectKey,
        bucket: presign.data.bucket,
        materialId: status.materialId,
        jobStatus: status,
    };
}


async function listKeys(prefix) {
    const out = [];
    let token;
    do {
        const res = await s3.send(new ListObjectsV2Command({
            Bucket: BUCKET,
            Prefix: prefix,
            ContinuationToken: token,
        }));
        for (const o of res.Contents || []) out.push(o.Key);
        token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
    return out;
}

async function objectExists(key) {
    try {
        await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
        return true;
    } catch {
        return false;
    }
}

async function objectBytes(key) {
    const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    const chunks = [];
    for await (const c of res.Body) chunks.push(Buffer.from(c));
    return Buffer.concat(chunks);
}


async function dbQuery(sql, params = []) {
    const { pool } = await import("../src/config/database.js");
    const res = await pool.query(sql, params);
    return res.rows;
}

try {
    console.log("=== admin add-material workflow ===");

    section("admin login");
    const login = await api("/admin/auth/login", {
        method: "POST",
        body: { email: EMAIL, password: PASSWORD },
    });
    if (login.status === 200) ok(`logged in as ${EMAIL}`);
    else throw new Error(`login failed (${login.status}): ${JSON.stringify(login.data)}`);



    const courses = await api("/courses");
    const courseNo = process.env.COURSE_NO || "";
    const course = courseNo
        ? (courses.data || []).find((c) => c.courseNo === courseNo)
        : (courses.data || [])[0];
    if (!course) {
        throw new Error(
            courseNo
                ? `course ${courseNo} not found`
                : "no courses available; create one first or set COURSE_NO",
        );
    }
    const courseId = course.id;
    ok(`using course ${course.courseNo} (${courseId})`);

    const uploaded = [];


    section("upload into the theory folder");

    const theoryBytes = Buffer.from(
        `%PDF-1.4\n% theory material ${Date.now()}\n`.repeat(64),
        "utf-8"
    );
    const theory = await uploadMaterial({
        courseId,
        materialType: "theory",
        title: "Workflow Test Theory Note",
        filename: "workflow-theory.pdf",
        contentType: "application/pdf",
        bytes: theoryBytes,
        metadata: { file_type: "pdf", week: "3", description: "theory desc", tags: ["lecture"] },
    });
    uploaded.push(theory);
    ok(`theory upload reached 'ready' (materialId=${theory.materialId})`);


    if (theory.objectKey.startsWith(`uploads/${courseId}/`)) {
        ok(`object key is namespaced under the course: ${theory.objectKey}`);
    } else {
        bad("object key namespace", theory.objectKey);
    }
    if (await objectExists(theory.objectKey)) ok("object exists in SeaweedFS");
    else bad("object missing from SeaweedFS", theory.objectKey);

    const fetched = await objectBytes(theory.objectKey);
    if (fetched.equals(theoryBytes)) ok(`stored bytes match the uploaded bytes (${fetched.length} B)`);
    else bad("stored bytes differ", `expected ${theoryBytes.length}, got ${fetched.length}`);
    const sha = crypto.createHash("sha256").update(theoryBytes).digest("hex");
    const shaRemote = crypto.createHash("sha256").update(fetched).digest("hex");
    if (sha === shaRemote) ok("remote sha256 matches local sha256");
    else bad("remote sha mismatch");


    const [fo] = await dbQuery(
        `SELECT id, object_key, bucket, original_name, mime_type, category, course_id,
                status, size_bytes, checksum_sha256, material_id, metadata
           FROM public.file_objects WHERE id = $1`,
        [theory.fileObjectId]
    );
    if (fo) {
        ok("file_objects row exists");
        if (fo.status === "ready") ok("file_objects.status = ready");
        else bad("file_objects.status", fo.status);
        if (Number(fo.size_bytes) === theoryBytes.length) ok(`file_objects.size_bytes = ${fo.size_bytes}`);
        else bad("file_objects.size_bytes", `${fo.size_bytes} != ${theoryBytes.length}`);
        if (fo.checksum_sha256 === sha) ok("file_objects.checksum_sha256 matches");
        else bad("file_objects.checksum_sha256", fo.checksum_sha256);
        if (fo.material_id === theory.materialId) ok("file_objects.material_id linked to the material");
        else bad("file_objects.material_id", fo.material_id);
        if (fo.course_id === courseId) ok("file_objects.course_id set");
        else bad("file_objects.course_id", fo.course_id);
        if (fo.category === "course_material") ok("file_objects.category = course_material");
        else bad("file_objects.category", fo.category);
        if (fo.mime_type === "application/pdf") ok("file_objects.mime_type set");
        else bad("file_objects.mime_type", fo.mime_type);
        if (fo.original_name === "workflow-theory.pdf") ok("file_objects.original_name set");
        else bad("file_objects.original_name", fo.original_name);

        if (fo.metadata && "_bytes_processed" in fo.metadata) bad("metadata still has _bytes_processed");
        else ok("metadata has no leftover _bytes_processed");
        if (fo.metadata?.material_type === "theory") ok("metadata.material_type = theory");
        else bad("metadata.material_type", fo.metadata?.material_type);
    } else {
        bad("file_objects row missing");
    }


    const [cm] = await dbQuery(
        `SELECT id, course_id, title, description, type, file_type, url, week, metadata, uploaded_by
           FROM public.course_materials WHERE id = $1`,
        [theory.materialId]
    );
    if (cm) {
        ok("course_materials row exists");
        if (cm.type === "theory") ok("course_materials.type = theory");
        else bad("course_materials.type", cm.type);
        if (cm.title === "Workflow Test Theory Note") ok(`course_materials.title = "${cm.title}"`);
        else bad("course_materials.title", cm.title);
        if (cm.description === "theory desc") ok("course_materials.description set");
        else bad("course_materials.description", cm.description);
        if (String(cm.week) === "3") ok(`course_materials.week = ${cm.week}`);
        else bad("course_materials.week", cm.week);
        if (cm.file_type === "pdf") ok("course_materials.file_type = pdf");
        else bad("course_materials.file_type", cm.file_type);
        if (cm.url === `/api/v1/storage/files/${theory.fileObjectId}/url`) {
            ok(`course_materials.url points at the file object`);
        } else {
            bad("course_materials.url", cm.url);
        }
        if (cm.course_id === courseId) ok("course_materials.course_id set");
        else bad("course_materials.course_id", cm.course_id);
        if (cm.uploaded_by) ok("course_materials.uploaded_by stamped from the session");
        else bad("course_materials.uploaded_by", "null");
        if (Array.isArray(cm.metadata?.tags) && cm.metadata.tags.includes("lecture")) {
            ok("course_materials.metadata.tags carried through");
        } else {
            bad("course_materials.metadata.tags", JSON.stringify(cm.metadata?.tags));
        }
    } else {
        bad("course_materials row missing");
    }


    const theoryList = await api(`/courses/${courseId}/materials?type=theory`);
    if (theoryList.status === 200 && (theoryList.data || []).some((m) => m.id === theory.materialId)) {
        ok("material appears in GET /materials?type=theory");
    } else {
        bad("material missing from theory listing", `status=${theoryList.status}`);
    }
    const labList = await api(`/courses/${courseId}/materials?type=lab`);
    if (labList.status === 200 && !(labList.data || []).some((m) => m.id === theory.materialId)) {
        ok("theory material does NOT leak into the lab listing");
    } else {
        bad("type filter leaked the theory material into lab");
    }


    section("upload into the lab folder");

    const labBytes = Buffer.from(
        `print("lab material ${Date.now()}")\n`.repeat(64),
        "utf-8"
    );
    const lab = await uploadMaterial({
        courseId,
        materialType: "lab",
        title: "Workflow Test Lab Sheet",
        filename: "workflow-lab.py",
        contentType: "text/x-python",
        bytes: labBytes,
        metadata: { file_type: "code", week: "5", description: "lab desc", tags: ["assignment"] },
    });
    uploaded.push(lab);
    ok(`lab upload reached 'ready' (materialId=${lab.materialId})`);

    const [labCm] = await dbQuery(
        `SELECT id, type, title, file_type, week, metadata FROM public.course_materials WHERE id = $1`,
        [lab.materialId]
    );
    if (labCm?.type === "lab") ok("course_materials.type = lab");
    else bad("course_materials.type", labCm?.type);
    if (labCm?.file_type === "code") ok("course_materials.file_type = code");
    else bad("course_materials.file_type", labCm?.file_type);
    if (String(labCm?.week) === "5") ok(`course_materials.week = ${labCm?.week}`);
    else bad("course_materials.week", labCm?.week);
    if (await objectExists(lab.objectKey)) ok("lab object exists in SeaweedFS");
    else bad("lab object missing from SeaweedFS", lab.objectKey);

    const labList2 = await api(`/courses/${courseId}/materials?type=lab`);
    if (labList2.status === 200 && (labList2.data || []).some((m) => m.id === lab.materialId)) {
        ok("material appears in GET /materials?type=lab");
    } else {
        bad("lab material missing from lab listing", `status=${labList2.status}`);
    }


    section("rename material");

    const renamedTitle = "Workflow Test Theory Note RENAMED";
    const rename = await api(`/courses/${courseId}/materials/${theory.materialId}`, {
        method: "PUT",
        body: { title: renamedTitle },
    });
    if (rename.status === 200) ok(`rename returned 200`);
    else bad("rename status", `${rename.status} ${JSON.stringify(rename.data)}`);

    const [afterRename] = await dbQuery(
        `SELECT title, url, metadata FROM public.course_materials WHERE id = $1`,
        [theory.materialId]
    );
    if (afterRename?.title === renamedTitle) ok(`title updated to "${afterRename.title}"`);
    else bad("title not updated", afterRename?.title);

    const [foAfterRename] = await dbQuery(
        `SELECT object_key, original_name, size_bytes FROM public.file_objects WHERE id = $1`,
        [theory.fileObjectId]
    );
    if (foAfterRename?.object_key === theory.objectKey) ok("object_key unchanged by rename");
    else bad("object_key changed by rename", foAfterRename?.object_key);
    if (foAfterRename?.original_name === "workflow-theory.pdf") ok("original_name unchanged by rename");
    else bad("original_name changed by rename", foAfterRename?.original_name);
    if (await objectExists(theory.objectKey)) ok("S3 object still present after rename");
    else bad("S3 object vanished after rename");

    const listAfterRename = await api(`/courses/${courseId}/materials?type=theory`);
    const listed = (listAfterRename.data || []).find((m) => m.id === theory.materialId);
    if (listed?.title === renamedTitle) ok("listing shows the renamed title");
    else bad("listing title", listed?.title);


    section("delete material");

    const beforeKeys = await listKeys(`uploads/${courseId}/`);
    if (beforeKeys.includes(theory.objectKey)) ok("object key present before delete");
    else bad("object key absent before delete", theory.objectKey);

    const del = await api(`/courses/${courseId}/materials/${theory.materialId}`, {
        method: "DELETE",
    });
    if (del.status === 204) ok("delete returned 204");
    else bad("delete status", `${del.status} ${JSON.stringify(del.data)}`);

    const [cmAfter] = await dbQuery(
        `SELECT id FROM public.course_materials WHERE id = $1`,
        [theory.materialId]
    );
    if (!cmAfter) ok("course_materials row removed");
    else bad("course_materials row still present");

    const [foAfter] = await dbQuery(
        `SELECT id FROM public.file_objects WHERE id = $1`,
        [theory.fileObjectId]
    );
    if (!foAfter) ok("file_objects row removed");
    else bad("file_objects row still present");

    if (!(await objectExists(theory.objectKey))) ok("S3 object removed from SeaweedFS");
    else bad("S3 object orphaned in SeaweedFS", theory.objectKey);

    const afterKeys = await listKeys(`uploads/${courseId}/`);
    if (!afterKeys.includes(theory.objectKey)) ok("object key gone from the bucket listing");
    else bad("object key still listed", theory.objectKey);


    const [labStill] = await dbQuery(
        `SELECT id, type, title FROM public.course_materials WHERE id = $1`,
        [lab.materialId]
    );
    if (labStill) ok("sibling lab material survived the delete");
    else bad("sibling lab material was deleted too");
    if (await objectExists(lab.objectKey)) ok("sibling lab object survived the delete");
    else bad("sibling lab object was deleted too");


    section("cleanup (delete the lab test material)");

    const delLab = await api(`/courses/${courseId}/materials/${lab.materialId}`, {
        method: "DELETE",
    });
    if (delLab.status === 204) ok("lab material deleted");
    else bad("lab delete status", delLab.status);
    if (!(await objectExists(lab.objectKey))) ok("lab object removed from SeaweedFS");
    else bad("lab object orphaned", lab.objectKey);

    const leftovers = await dbQuery(
        `SELECT count(*)::int AS n FROM public.course_materials WHERE title LIKE 'Workflow Test %'`
    );
    if (leftovers[0].n === 0) ok("no leftover test materials in the DB");
    else bad("leftover test materials", String(leftovers[0].n));


    section("empty the whole theory folder (DELETE /materials?type=theory)");


    const t1 = await uploadMaterial({
        courseId, materialType: "theory", title: "Folder Empty A",
        filename: "folder-empty-a.pdf", contentType: "application/pdf",
        bytes: Buffer.from("%PDF-1.4\n% a\n".repeat(32)),
    });
    const t2 = await uploadMaterial({
        courseId, materialType: "theory", title: "Folder Empty B",
        filename: "folder-empty-b.pdf", contentType: "application/pdf",
        bytes: Buffer.from("%PDF-1.4\n% b\n".repeat(32)),
    });
    ok("two theory materials uploaded for the folder-emptying test");

    const beforeEmpty = await listKeys(`uploads/${courseId}/`);
    if (beforeEmpty.includes(t1.objectKey) && beforeEmpty.includes(t2.objectKey)) {
        ok("both objects present before emptying the folder");
    } else {
        bad("objects missing before folder empty");
    }

    const emptyRes = await api(`/courses/${courseId}/materials?type=theory`, { method: "DELETE" });
    if (emptyRes.status === 204) ok("emptying the theory folder returned 204");
    else bad("empty folder status", `${emptyRes.status} ${JSON.stringify(emptyRes.data)}`);

    const afterEmpty = await dbQuery(
        `SELECT count(*)::int AS n FROM public.course_materials
          WHERE course_id = $1 AND type = 'theory'`,
        [courseId]
    );
    if (afterEmpty[0].n === 0) ok("no theory materials remain in the DB");
    else bad("theory materials remain", String(afterEmpty[0].n));

    const keysAfterEmpty = await listKeys(`uploads/${courseId}/`);
    const leaked = [t1.objectKey, t2.objectKey].filter((k) => keysAfterEmpty.includes(k));
    if (leaked.length === 0) ok("both objects removed from SeaweedFS by the folder empty");
    else bad("objects leaked by folder empty", leaked.join(", "));

    const foAfterEmpty = await dbQuery(
        `SELECT count(*)::int AS n FROM public.file_objects WHERE id = ANY($1::uuid[])`,
        [[t1.fileObjectId, t2.fileObjectId]]
    );
    if (foAfterEmpty[0].n === 0) ok("both file_objects rows removed by the folder empty");
    else bad("file_objects rows remain", String(foAfterEmpty[0].n));
} catch (e) {
    bad("fatal", e.message);
} finally {
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
}

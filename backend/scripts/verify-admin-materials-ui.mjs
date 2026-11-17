

import { WebSocket } from "ws";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const CDP_HTTP = "http://localhost:9222";
const BASE = "http://localhost:3000";
const EMAIL = process.env.ADMIN_EMAIL || "";
const PASSWORD = process.env.ADMIN_PASSWORD || "";

if (!EMAIL || !PASSWORD) {
    console.error("ADMIN_EMAIL and ADMIN_PASSWORD must be set to run this verification script.");
    process.exit(1);
}

let passed = 0, failed = 0;
const ok = (m) => { console.log(`  ✓ ${m}`); passed++; };
const bad = (m, e) => { console.log(`  ✗ ${m}${e ? `: ${e}` : ""}`); failed++; };
const section = (m) => console.log(`\n--- ${m} ---`);


let ws, msgId = 0;
const pending = new Map();

async function connect() {
    const targets = await (await fetch(`${CDP_HTTP}/json/list`)).json();
    const page = targets.find((t) => t.type === "page");
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
        ws.on("open", res);
        ws.on("error", rej);
    });
    ws.on("message", (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.id && pending.has(msg.id)) {
            const { resolve, reject } = pending.get(msg.id);
            pending.delete(msg.id);
            msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
        }
    });
}

function send(method, params = {}) {
    const id = ++msgId;
    return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
        setTimeout(() => {
            if (pending.has(id)) {
                pending.delete(id);
                reject(new Error(`timeout: ${method}`));
            }
        }, 60000);
    });
}

async function evaluate(expression) {
    const r = await send("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true,
    });
    if (r.exceptionDetails) {
        throw new Error(r.exceptionDetails.exception?.description || "eval failed");
    }
    return r.result.value;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(expr, label, timeout = 20000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        try {
            if (await evaluate(expr)) return true;
        } catch {  }
        await sleep(250);
    }
    throw new Error(`timeout waiting for: ${label}`);
}


async function setInputValue(id, value) {
    const done = await evaluate(`
      (function() {
        const el = document.getElementById(${JSON.stringify(id)});
        if (!el) return false;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(el, ${JSON.stringify(value)});
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      })()
    `);
    if (!done) throw new Error(`could not set #${id}`);
}


async function realClick(elementExpr) {
    const rect = await evaluate(`
      (function() {
        const el = ${elementExpr};
        if (!el) return null;
        el.scrollIntoView({ block: 'center' });
        const r = el.getBoundingClientRect();
        return JSON.stringify({ x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) });
      })()
    `);
    if (!rect) throw new Error("realClick: element not found");
    const { x, y } = JSON.parse(rect);
    await sleep(150);
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    await sleep(80);
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 });
    await sleep(60);
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1 });
    await sleep(400);
}

async function clickByText(selector, text) {
    const clicked = await evaluate(`
      (function() {
        const els = Array.from(document.querySelectorAll(${JSON.stringify(selector)}));
        const el = els.find(e => (e.textContent || "").trim().includes(${JSON.stringify(text)}));
        if (!el) return false;
        el.click();
        return true;
      })()
    `);
    if (!clicked) throw new Error(`could not find "${text}"`);
}


async function attachFile(inputId, fileName, contentType, textContent) {
    const done = await evaluate(`
      (function() {
        const el = document.getElementById(${JSON.stringify(inputId)});
        if (!el) return 'no-input';
        const dt = new DataTransfer();
        const file = new File([${JSON.stringify(textContent)}], ${JSON.stringify(fileName)}, { type: ${JSON.stringify(contentType)} });
        dt.items.add(file);
        el.files = dt.files;
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return 'ok';
      })()
    `);
    if (done !== "ok") throw new Error(`could not attach file (${done})`);
}

const TITLE = `UI Workflow Theory ${Date.now().toString().slice(-6)}`;
const RENAMED = `${TITLE} RENAMED`;

try {
    await connect();
    await send("Page.enable");
    await send("Runtime.enable");

    section("admin login");
    await send("Page.navigate", { url: `${BASE}/admin/login` });
    await sleep(2500);
    const alreadyIn = await evaluate(
        `location.pathname !== '/admin/login' && !document.querySelector('input[type="password"]')`
    );
    if (alreadyIn) {
        ok(`already signed in, at ${await evaluate("location.pathname")}`);
    } else {
        await waitFor(`!!document.querySelector('input[type="password"]')`, "login form");
        await setInputValue("email", EMAIL);
        await setInputValue("password", PASSWORD);
        await clickByText('button[type="submit"]', "Sign in");
        await waitFor(
            `location.pathname === '/admin/dashboard' || location.pathname === '/admin/materials'`,
            "post-login redirect"
        );
        ok(`logged in, landed on ${await evaluate("location.pathname")}`);
    }

    section("navigate into the course → Theory folder");
    await send("Page.navigate", { url: `${BASE}/admin/materials` });
    await waitFor(`document.body.innerText.includes('CSE1121')`, "course list");

    const theoryCountBefore = await evaluate(`
      (async function() {
        const c = (await (await fetch('/api/v1/courses', {credentials:'include'})).json())
          .find(c => c.courseNo === 'CSE1121');
        if (!c) return -1;
        const m = await (await fetch('/api/v1/courses/' + c.id + '/materials?type=theory', {credentials:'include'})).json();
        return m.length;
      })()
    `);
    ok(`theory folder currently holds ${theoryCountBefore} material(s)`);


    await realClick(`
      (function() {
        const rows = Array.from(document.querySelectorAll('tr'));
        return rows.find(r => (r.innerText || '').includes('CSE1121')) || null;
      })()
    `);
    await waitFor(`document.body.innerText.includes('Theory') && document.body.innerText.includes('Lab')`, "theory/lab folders");
    ok("course drilled in — Theory and Lab folders visible");


    await realClick(`
      (function() {
        const rows = Array.from(document.querySelectorAll('tr'));
        return rows.find(r => (r.innerText || '').trim().startsWith('Theory')) || null;
      })()
    `);



    await waitFor(
        `Array.from(document.querySelectorAll('button')).some(b => (b.textContent||'').includes('Upload Material'))`,
        "theory folder listing"
    );
    ok("inside the Theory folder (material-level view reached)");

    section("upload a material through the UI");
    const uploadBtnFound = await evaluate(`
      Array.from(document.querySelectorAll('button')).some(b => (b.textContent||'').includes('Upload Material'))
    `);
    if (!uploadBtnFound) throw new Error("'Upload Material' button not visible at material level");
    ok("'Upload Material' button visible at material level");

    await clickByText("button", "Upload Material");
    await waitFor(`!!document.querySelector('[role="dialog"]')`, "upload dialog");
    ok("Upload Material dialog opened");

    await setInputValue("title", TITLE);
    await attachFile("file", "ui-workflow-note.pdf", "application/pdf", `%PDF-1.4\n% ui workflow ${Date.now()}\n`.repeat(32));
    await sleep(400);

    const detected = await evaluate(`document.querySelector('[role="dialog"]').innerText`);
    if (/Detected type:\s*PDF/i.test(detected)) ok("file type auto-detected as PDF");
    else bad("file type not detected", detected.replace(/\n/g, " | ").slice(0, 200));


    await setInputValue("week", "4");
    await sleep(200);

    await clickByText('[role="dialog"] button', "Upload");


    await waitFor(
        `!document.querySelector('[role="dialog"]')`,
        "upload dialog closes",
        90000
    );
    ok("upload dialog closed (upload reached a terminal state)");


    const apiState = await evaluate(`
      (async function() {
        const c = (await (await fetch('/api/v1/courses', {credentials:'include'})).json())
          .find(c => c.courseNo === 'CSE1121');
        const m = await (await fetch('/api/v1/courses/' + c.id + '/materials?type=theory', {credentials:'include'})).json();
        const hit = m.find(x => x.title === ${JSON.stringify(TITLE)});
        return hit ? { id: hit.id, title: hit.title, type: hit.type, fileType: hit.fileType, week: hit.week, url: hit.url } : null;
      })()
    `);
    if (apiState) {
        ok(`material row created: id=${apiState.id}`);
        if (apiState.type === "theory") ok("stored with type = theory");
        else bad("material type", apiState.type);
        if (apiState.fileType === "pdf") ok("stored with fileType = pdf");
        else bad("material fileType", apiState.fileType);
        if (String(apiState.week) === "4") ok(`stored with week = ${apiState.week}`);
        else bad("material week", apiState.week);
        if (apiState.url && apiState.url.includes("/storage/files/")) ok("material url points at the stored object");
        else bad("material url", apiState.url);
    } else {
        bad("material row not created");
    }

    await waitFor(`document.body.innerText.includes(${JSON.stringify(TITLE)})`, "material visible in the UI");
    ok("uploaded material is visible in the Theory listing");

    section("rename through the UI");

    await realClick(`
      (function() {
        const rows = Array.from(document.querySelectorAll('tr'));
        const row = rows.find(r => (r.innerText || '').includes(${JSON.stringify(TITLE)}));
        if (!row) return null;
        const btns = Array.from(row.querySelectorAll('button'));
        return btns.find(b => b.getAttribute('aria-haspopup') === 'menu')
          || btns.find(b => b.querySelector('svg.lucide-ellipsis-vertical'));
      })()
    `);
    await waitFor(`!!document.querySelector('[role="menu"]')`, "action menu");
    const menuText = await evaluate(`document.querySelector('[role="menu"]').innerText`);
    ok(`menu entries: ${menuText.replace(/\n/g, " | ")}`);

    await realClick(`
      (function() {
        const items = Array.from(document.querySelectorAll('[role="menu"] [role="menuitem"]'));
        return items.find(i => (i.textContent || '').trim() === 'Rename') || null;
      })()
    `);
    await waitFor(`!!document.querySelector('[role="dialog"]')`, "rename dialog");
    ok("Rename dialog opened");


    await evaluate(`
      (function() {
        const dlg = document.querySelector('[role="dialog"]');
        const input = dlg.querySelector('input');
        if (!input) return false;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, ${JSON.stringify(RENAMED)});
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      })()
    `);
    await sleep(200);
    await clickByText('[role="dialog"] button', "Save");
    await waitFor(`!document.querySelector('[role="dialog"]')`, "rename dialog closes");
    await waitFor(`document.body.innerText.includes(${JSON.stringify(RENAMED)})`, "renamed title in the list");
    ok("material renamed and the new title shows in the list");

    section("delete through the UI");
    await realClick(`
      (function() {
        const rows = Array.from(document.querySelectorAll('tr'));
        const row = rows.find(r => (r.innerText || '').includes(${JSON.stringify(RENAMED)}));
        if (!row) return null;
        const btns = Array.from(row.querySelectorAll('button'));
        return btns.find(b => b.getAttribute('aria-haspopup') === 'menu')
          || btns.find(b => b.querySelector('svg.lucide-ellipsis-vertical'));
      })()
    `);
    await waitFor(`!!document.querySelector('[role="menu"]')`, "action menu");
    await realClick(`
      (function() {
        const items = Array.from(document.querySelectorAll('[role="menu"] [role="menuitem"]'));
        return items.find(i => (i.textContent || '').trim() === 'Delete') || null;
      })()
    `);


    await waitFor(`!!document.querySelector('[role="alertdialog"]')`, "delete confirm dialog");
    ok("delete confirmation dialog opened");
    await clickByText('[role="alertdialog"] button', "Continue");
    await waitFor(`!document.querySelector('[role="alertdialog"]')`, "delete dialog closes");
    await sleep(1200);

    const gone = await evaluate(`!document.body.innerText.includes(${JSON.stringify(RENAMED)})`);
    if (gone) ok("deleted material no longer appears in the listing");
    else bad("deleted material still in the listing");

    const dbGone = await evaluate(`
      (async function() {
        const c = (await (await fetch('/api/v1/courses', {credentials:'include'})).json())
          .find(c => c.courseNo === 'CSE1121');
        const m = await (await fetch('/api/v1/courses/' + c.id + '/materials?type=theory', {credentials:'include'})).json();
        return !m.find(x => x.title === ${JSON.stringify(RENAMED)});
      })()
    `);
    if (dbGone) ok("material row removed from the database");
    else bad("material row still in the database");


    section("upload into the Lab folder through the UI");


    await evaluate(`
      (function() {
        const bc = Array.from(document.querySelectorAll('button')).find(b => (b.textContent||'').trim() === 'CSE1121 - C Programming language');
        if (bc) bc.click();
        return !!bc;
      })()
    `);
    await sleep(800);

    await realClick(`
      (function() {
        const rows = Array.from(document.querySelectorAll('tr'));
        return rows.find(r => (r.innerText || '').trim().startsWith('Lab')) || null;
      })()
    `);
    await waitFor(
        `Array.from(document.querySelectorAll('button')).some(b => (b.textContent||'').includes('Upload Material'))`,
        "lab folder listing"
    );
    ok("navigated into the Lab folder");

    const LAB_TITLE = `UI Workflow Lab ${Date.now().toString().slice(-6)}`;
    await clickByText("button", "Upload Material");
    await waitFor(`!!document.querySelector('[role="dialog"]')`, "upload dialog");
    await setInputValue("title", LAB_TITLE);
    await attachFile("file", "ui-workflow-lab.py", "text/x-python", `print("ui lab ${Date.now()}")\n`.repeat(16));
    await sleep(400);
    await clickByText('[role="dialog"] button', "Upload");
    await waitFor(`!document.querySelector('[role="dialog"]')`, "upload dialog closes", 90000);
    ok("lab material uploaded through the UI");

    const labApiState = await evaluate(`
      (async function() {
        const c = (await (await fetch('/api/v1/courses', {credentials:'include'})).json())
          .find(c => c.courseNo === 'CSE1121');
        const m = await (await fetch('/api/v1/courses/' + c.id + '/materials?type=lab', {credentials:'include'})).json();
        const hit = m.find(x => x.title === ${JSON.stringify(LAB_TITLE)});
        return hit ? { id: hit.id, type: hit.type, fileType: hit.fileType } : null;
      })()
    `);
    if (labApiState) {
        ok(`lab material row created: id=${labApiState.id}`);
        if (labApiState.type === "lab") ok("lab material stored with type = lab");
        else bad("lab material type", labApiState.type);
        if (labApiState.fileType === "code") ok("lab material stored with fileType = code");
        else bad("lab material fileType", labApiState.fileType);
    } else {
        bad("lab material row not created");
    }

    await waitFor(`document.body.innerText.includes(${JSON.stringify(LAB_TITLE)})`, "lab material visible");
    ok("lab material is visible in the Lab listing");


    await realClick(`
      (function() {
        const rows = Array.from(document.querySelectorAll('tr'));
        const row = rows.find(r => (r.innerText || '').includes(${JSON.stringify(LAB_TITLE)}));
        if (!row) return null;
        const btns = Array.from(row.querySelectorAll('button'));
        return btns.find(b => b.getAttribute('aria-haspopup') === 'menu')
          || btns.find(b => b.querySelector('svg.lucide-ellipsis-vertical'));
      })()
    `);
    await waitFor(`!!document.querySelector('[role="menu"]')`, "action menu");
    await realClick(`
      (function() {
        const items = Array.from(document.querySelectorAll('[role="menu"] [role="menuitem"]'));
        return items.find(i => (i.textContent || '').trim() === 'Delete') || null;
      })()
    `);
    await waitFor(`!!document.querySelector('[role="alertdialog"]')`, "delete confirm dialog");
    await clickByText('[role="alertdialog"] button', "Continue");
    await waitFor(`!document.querySelector('[role="alertdialog"]')`, "delete dialog closes");
    await sleep(1200);
    const labGone = await evaluate(`!document.body.innerText.includes(${JSON.stringify(LAB_TITLE)})`);
    if (labGone) ok("lab material deleted through the UI");
    else bad("lab material still in the listing");
} catch (e) {
    bad("fatal", e.message);
} finally {
    console.log(`\n${passed} passed, ${failed} failed`);
    try { ws.close(); } catch {  }
    process.exit(failed > 0 ? 1 : 0);
}

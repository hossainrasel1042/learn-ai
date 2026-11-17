

import { WebSocket } from "ws";

const CDP_HTTP = "http://localhost:9222";
const BASE = "http://localhost:3000";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.error("ADMIN_EMAIL and ADMIN_PASSWORD must be set to run this verification script.");
    process.exit(1);
}

let passed = 0, failed = 0;
const ok = (m) => { console.log(`  ✓ ${m}`); passed++; };
const bad = (m, e) => { console.log(`  ✗ ${m}${e ? `: ${e}` : ""}`); failed++; };


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
        }, 30000);
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

async function waitFor(expr, label, timeout = 15000) {
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


async function setInputValueByLabel(labelText, value) {
    const done = await evaluate(`
      (function() {
        const wanted = ${JSON.stringify(labelText)}.toLowerCase();
        const label = Array.from(document.querySelectorAll('label'))
          .find(l => (l.textContent || '').trim().toLowerCase().includes(wanted));
        if (!label) return false;
        const el = label.htmlFor ? document.getElementById(label.htmlFor) : null;
        if (!el) return false;
        const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
        setter.call(el, ${JSON.stringify(value)});
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      })()
    `);
    if (!done) throw new Error(`could not set the field labelled "${labelText}"`);
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

async function textContent() {
    return evaluate("document.body.innerText");
}


async function realClick(elementHandleExpr) {
    const rect = await evaluate(`
      (function() {
        const el = ${elementHandleExpr};
        if (!el) return null;
        el.scrollIntoView({ block: 'center' });
        const r = el.getBoundingClientRect();
        return JSON.stringify({ x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) });
      })()
    `);
    if (!rect) throw new Error("realClick: element not found");
    const { x, y } = JSON.parse(rect);
    await sleep(200);
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    await sleep(100);
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 });
    await sleep(80);
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1 });
    await sleep(500);
}

const TEST_NAME = "CDP Validation Test Course";


const TEST_NO = `TST${String(Date.now()).slice(-4)}`;

try {
    await connect();
    await send("Page.enable");
    await send("Runtime.enable");

    console.log("\n--- admin login ---");
    await send("Page.navigate", { url: `${BASE}/admin/login` });



    await sleep(2500);
    const alreadyIn = await evaluate(
        `location.pathname !== '/admin/login' && !!document.querySelector('input[type="password"]') === false`
    );
    if (alreadyIn) {
        ok(`already signed in (session cookie), at ${await evaluate("location.pathname")}`);
    } else {
        await waitFor(`!!document.querySelector('input[type="password"]')`, "login form");

        await setInputValue("email", ADMIN_EMAIL);
        await setInputValue("password", ADMIN_PASSWORD);

        await sleep(300);
        const echo = await evaluate(`document.getElementById('email').value`);
        if (echo === ADMIN_EMAIL) ok("email field populated");
        else bad("email field", echo);

        await clickByText('button[type="submit"]', "Sign in");

        await waitFor(
            `location.pathname === '/admin/dashboard' || location.pathname === '/admin/materials'`,
            "post-login redirect"
        );
        ok(`logged in, landed on ${await evaluate("location.pathname")}`);
    }

    console.log("\n--- materials page: left navigation ---");
    await send("Page.navigate", { url: `${BASE}/admin/materials` });
    await waitFor(`document.body.innerText.includes('Admin Portal')`, "admin shell");

    const bodyText = await textContent();
    for (const label of ["Dashboard", "Members", "My activity", "Add material"]) {
        if (bodyText.includes(label)) ok(`nav item "${label}" present`);
        else bad(`nav item "${label}" missing`);
    }
    if (bodyText.includes("Admin Portal")) ok("Admin Portal chrome rendered");
    else bad("Admin Portal chrome missing");
    if (bodyText.includes("Logout")) ok("Logout button rendered");
    else bad("Logout button missing");

    const navLinks = await evaluate(`
      Array.from(document.querySelectorAll('aside a')).map(a => a.getAttribute('href'))
    `);
    ok(`sidebar links: ${JSON.stringify(navLinks)}`);

    console.log("\n--- new course dialog: zod validation ---");
    await clickByText("button", "New Course");
    await waitFor(`!!document.querySelector('[role="dialog"]')`, "new course dialog");
    ok("New Course dialog opened");


    await clickByText('[role="dialog"] button', "Create Course");
    await sleep(900);
    let dlgText = await evaluate(`document.querySelector('[role="dialog"]').innerText`);
    if (/at least 10 characters/i.test(dlgText)) ok("name min-length error shown");
    else bad("name min-length error", dlgText.slice(0, 250));


    if (/Course number is required/i.test(dlgText)) ok("course_no required error shown");
    else if (/2–4 letters followed by 4 digits|2-4 letters followed by 4 digits/i.test(dlgText)) ok("course_no pattern error shown");
    else bad("course_no error", dlgText.slice(0, 250));


    await setInputValueByLabel("Course Name", "Short");
    await setInputValueByLabel("Course Number", "C42");
    await clickByText('[role="dialog"] button', "Create Course");
    await sleep(900);
    dlgText = await evaluate(`document.querySelector('[role="dialog"]').innerText`);
    if (/at least 10 characters/i.test(dlgText)) ok("short name rejected");
    else bad("short name accepted", dlgText.slice(0, 250));
    if (/2–4 letters|2-4 letters/i.test(dlgText)) ok("malformed course_no rejected");
    else bad("malformed course_no accepted", dlgText.slice(0, 250));


    await setInputValueByLabel("Course Name", TEST_NAME);
    await setInputValueByLabel("Course Number", "ABCDE12345");
    await clickByText('[role="dialog"] button', "Create Course");
    await sleep(900);
    const stillOpen = await evaluate(`!!document.querySelector('[role="dialog"]')`);
    if (stillOpen) ok("over-long course_no rejected (dialog stayed open)");
    else bad("over-long course_no accepted");


    await setInputValueByLabel("Course Name", TEST_NAME);
    await setInputValueByLabel("Course Number", TEST_NO);
    await clickByText('[role="dialog"] button', "Create Course");
    await waitFor(`!document.querySelector('[role="dialog"]')`, "dialog closes after create");
    ok("valid course submitted, dialog closed");

    await waitFor(`document.body.innerText.includes(${JSON.stringify(TEST_NO)})`, "new course in list");
    ok(`course "${TEST_NO}" appears in the list`);

    console.log("\n--- course action menu: Info ---");
    const opened = await evaluate(`
      (function() {
        const rows = Array.from(document.querySelectorAll('tr'));
        const row = rows.find(r => (r.innerText || '').includes(${JSON.stringify(TEST_NO)}));
        if (!row) return 'no-row';
        const btns = Array.from(row.querySelectorAll('button'));
        const menuBtn = btns.find(b => b.getAttribute('aria-haspopup') === 'menu')
          || btns.find(b => b.querySelector('svg.lucide-ellipsis-vertical'));
        if (!menuBtn) return 'no-menu-btn';
        return 'found';
      })()
    `);
    if (opened === "found") ok("row action menu button found");
    else bad("row action menu button", opened);

    await realClick(`
      (function() {
        const rows = Array.from(document.querySelectorAll('tr'));
        const row = rows.find(r => (r.innerText || '').includes(${JSON.stringify(TEST_NO)}));
        if (!row) return null;
        const btns = Array.from(row.querySelectorAll('button'));
        return btns.find(b => b.getAttribute('aria-haspopup') === 'menu')
          || btns.find(b => b.querySelector('svg.lucide-ellipsis-vertical'));
      })()
    `);

    await waitFor(`!!document.querySelector('[role="menu"]')`, "action menu");
    const menuText = await evaluate(`document.querySelector('[role="menu"]').innerText`);
    if (/\bInfo\b/.test(menuText)) ok("'Info' entry present in action menu");
    else bad("'Info' entry missing", menuText.replace(/\n/g, " | "));
    console.log(`  -- menu entries -- ${menuText.replace(/\n/g, " | ")}`);


    await realClick(`
      (function() {
        const items = Array.from(document.querySelectorAll('[role="menu"] [role="menuitem"]'));
        return items.find(i => (i.textContent || '').trim() === 'Info') || null;
      })()
    `);

    await waitFor(
        `!!Array.from(document.querySelectorAll('[role="dialog"]')).find(d => /Total Files/.test(d.innerText))`,
        "info modal"
    );
    ok("Info modal opened");

    const infoText = await evaluate(`
      (function() {
        const d = Array.from(document.querySelectorAll('[role="dialog"]')).find(d => /Total Files/.test(d.innerText));
        return d ? d.innerText : '';
      })()
    `);
    for (const label of ["Title", "Total Files", "Total Size", "Course ID"]) {
        if (infoText.includes(label)) ok(`modal shows "${label}"`);
        else bad(`modal missing "${label}"`, infoText.replace(/\n/g, " | "));
    }
    if (infoText.includes(TEST_NO)) ok("modal shows the course number");
    else bad("modal course number", infoText.replace(/\n/g, " | "));




    const courseCode = await evaluate(`
      (async function() {
        const courses = await (await fetch('/api/v1/courses', { credentials: 'include' })).json();
        const c = (courses || []).find(c => c.courseNo === ${JSON.stringify(TEST_NO)});
        return c ? c.code : null;
      })()
    `);
    if (!courseCode) {
        bad("course code lookup", "could not read the course code from the API");
    } else if (infoText.includes(courseCode)) {
        ok(`modal shows the human-readable course id "${courseCode}"`);
    } else {
        bad("modal course id", `expected "${courseCode}" in:\n${infoText.replace(/\n/g, " | ")}`);
    }


    const uuidInModal = infoText.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    if (!uuidInModal) ok("modal does not expose the internal UUID");
    else bad("modal leaks the UUID", uuidInModal[0]);
    console.log(`  -- modal content --\n${infoText.split("\n").map(l => "     " + l).join("\n")}`);

    console.log("\n--- cleanup ---");


    const courseUuid = await evaluate(`
      (async function() {
        const courses = await (await fetch('/api/v1/courses', { credentials: 'include' })).json();
        const c = (courses || []).find(c => c.courseNo === ${JSON.stringify(TEST_NO)});
        return c ? c.id : null;
      })()
    `);
    if (!courseUuid) {
        bad("cleanup", "could not find the test course to delete");
    } else {
        const deleted = await evaluate(`
          (async function() {
            const res = await fetch('/api/v1/courses/${courseUuid}', { method: 'DELETE', credentials: 'include' });
            return res.status;
          })()
        `);
        if (deleted === 204 || deleted === 200) ok(`cleaned up test course (HTTP ${deleted})`);
        else bad("cleanup", `HTTP ${deleted}`);
    }
} catch (e) {
    bad("fatal", e.message);
} finally {
    console.log(`\n${passed} passed, ${failed} failed`);
    try { ws.close(); } catch {  }
    process.exit(failed > 0 ? 1 : 0);
}

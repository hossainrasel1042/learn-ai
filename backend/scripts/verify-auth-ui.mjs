
import "dotenv/config";
import { WebSocket } from "ws";
import pg from "pg";
import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const CDP_HTTP = "http://localhost:9222";
const BASE = "http://localhost:3000";
const API_BASE = (process.env.API_BASE_URL || "http://localhost:8000/api/v1").replace(
    /\/+$/,
    "",
);

let passed = 0,
    failed = 0;
const ok = (m) => {
    console.log(`  ✓ ${m}`);
    passed++;
};
const bad = (m, e) => {
    console.log(`  ✗ ${m}${e ? `: ${e}` : ""}`);
    failed++;
};
const section = (t) => console.log(`\n--- ${t} ---`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ws;
let msgId = 0;
const pending = new Map();
const networkLog = [];

async function connectCdp() {
    const targets = await (await fetch(`${CDP_HTTP}/json/list`)).json();
    const page = targets.find((t) => t.type === "page");
    if (!page) throw new Error("no Chrome page target found on :9222");
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
            msg.error
                ? reject(new Error(JSON.stringify(msg.error)))
                : resolve(msg.result);
            return;
        }
        if (msg.method === "Network.requestWillBeSent") {
            const r = msg.params.request;
            networkLog.push({
                method: r.method,
                url: r.url,
                postData: r.postData || null,
            });
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
        throw new Error(
            r.exceptionDetails.exception?.description || "eval failed",
        );
    }
    return r.result.value;
}

async function waitFor(expr, label, timeout = 20000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        try {
            if (await evaluate(expr)) return true;
        } catch {}
        await sleep(250);
    }
    throw new Error(`timeout waiting for: ${label}`);
}

async function navigate(url) {
    await send("Page.navigate", { url });
    await sleep(1500);
}

async function setInputByLabel(labelText, value) {
    const done = await evaluate(`
      (function() {
        const wanted = ${JSON.stringify(labelText)}.toLowerCase();
        const usable = function(el) {
          if (!el) return false;
          var r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) return false;
          var style = window.getComputedStyle(el);
          return style.visibility !== 'hidden' && style.display !== 'none';
        };
        const labels = Array.prototype.slice.call(document.querySelectorAll('label'))
          .filter(function(l) { return (l.textContent || '').trim().toLowerCase().indexOf(wanted) === 0 && usable(l); });
        if (labels.length === 0) return false;
        // Prefer a label whose field lives inside a <form>.
        var inForm = labels.filter(function(l) {
          var el = l.htmlFor ? document.getElementById(l.htmlFor) : l.querySelector('input');
          return el && el.closest('form');
        });
        var label = inForm.length ? inForm[inForm.length - 1] : labels[labels.length - 1];
        const el = label.htmlFor ? document.getElementById(label.htmlFor) : label.querySelector('input');
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

async function clickButton(text) {
    return evaluate(`
      (function() {
        var wanted = ${JSON.stringify(text)};
        var usable = function(el) {
          if (el.disabled) return false;
          var r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) return false;
          var style = window.getComputedStyle(el);
          return style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0';
        };
        var matches = Array.prototype.slice.call(document.querySelectorAll('button'))
          .filter(function(b) { return (b.innerText || '').trim() === wanted && usable(b); });
        if (matches.length === 0) return false;
        var inForm = matches.filter(function(b) { return !!b.closest('form'); });
        var target = inForm.length ? inForm[inForm.length - 1] : matches[matches.length - 1];
        target.click();
        return true;
      })()
    `);
}

const currentUrl = () => evaluate("window.location.href");
const bodyText = () => evaluate("document.body ? document.body.innerText : ''");

const db = new pg.Client({ connectionString: process.env.DB_URL });
await db.connect();

const stamp = Date.now();
const email = `auth-ui-${stamp}@e2e.local`;
const password = "AuthUi-2026!";

const stubPort = Number(process.env.MAIL_STUB_PORT || 8899);
const stubPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "_mailStub.mjs",
);
const STUB_API_KEY = "stub-test-key";
const stub = spawn(process.execPath, [stubPath, String(stubPort)], {
    stdio: ["ignore", "pipe", "pipe"],
});
const stubMessages = [];
let stubOut = "";
stub.stdout.on("data", (c) => {
    stubOut += c.toString();
    const lines = stubOut.split("\n");
    stubOut = lines.pop() || "";
    for (const line of lines) {
        if (!line.trim()) continue;
        try {
            stubMessages.push(JSON.parse(line));
        } catch {}
    }
});
stub.stderr.on("data", () => {});
stub.on("error", () => {});

async function waitForStub() {
    for (let i = 0; i < 40; i++) {
        try {
            await fetch(`http://127.0.0.1:${stubPort}/ping`);
            return true;
        } catch {}
        await sleep(100);
    }
    return false;
}

const stubUp = await waitForStub();

function stubUrl() {
    const host = process.env.MAIL_STUB_HOST || "172.18.0.1";
    return `http://${host}:${stubPort}/emails`;
}

async function restartBackendWithStub() {
    const { execFileSync } = await import("node:child_process");
    const root = path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        "../..",
    );
    execFileSync(
        "docker",
        [
            "compose",
            "up",
            "-d",
            "--force-recreate",
            "--no-build",
            "backend",
        ],
        {
            cwd: root,
            env: {
                ...process.env,
                RESEND_API_KEY: STUB_API_KEY,
                RESEND_API_URL: stubUrl(),
            },
            stdio: ["ignore", "pipe", "pipe"],
        },
    );

    for (let i = 0; i < 60; i++) {
        try {
            const res = await fetch(
                `${API_BASE.replace(/\/api\/v1$/, "")}/health`,
            );
            if (res.ok) return true;
        } catch {}
        await sleep(1000);
    }
    return false;
}

const backendReady = stubUp ? await restartBackendWithStub() : false;
if (!backendReady) {
    bad("backend restart with the mail stub", "the backend did not become healthy");
    process.exit(1);
}
ok("backend restarted against the mail stub");

const mailsTo = (addr) =>
    stubMessages.filter(
        (m) => Array.isArray(m.body?.to) && m.body.to.includes(addr),
    );

async function waitForMails(addr, { count = 1, timeoutMs = 5000 } = {}) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const found = mailsTo(addr);
        if (found.length >= count) return found;
        await sleep(100);
    }
    return mailsTo(addr);
}

function tokenFromMail(message) {
    const text = String(message?.body?.text || "");
    const html = String(message?.body?.html || "");
    const match = `${text}\n${html}`.match(/verify-email\?token=([0-9a-f]{64})/);
    return match ? match[1] : null;
}

async function clearCookies() {
    await send("Network.clearBrowserCookies");
    await send("Storage.clearDataForOrigin", {
        origin: BASE,
        storageTypes: "all",
    });
}

try {
    await connectCdp();
    await send("Page.enable");
    await send("Runtime.enable");
    await send("Network.enable");

    section("U1: signing up shows the 'check your inbox' page");
    await clearCookies();
    await navigate(`${BASE}/auth?mode=signup`);
    await waitFor(
        "!!document.querySelector('input[type=email]')",
        "the signup form",
    );

    await setInputByLabel("Name", "Auth UI");
    await setInputByLabel("Email", email);
    await setInputByLabel("Confirm Password", password);
    await setInputByLabel("Password", password);

    const clickedSignup = await clickButton("Create account");
    if (clickedSignup) ok("the signup form was submitted");
    else bad("the signup form", "the 'Create account' button was not found");

    let landed = false;
    try {
        await waitFor(
            `window.location.pathname === '/auth/sign-up-success' && window.location.search.includes('email=')`,
            "the sign-up-success page",
            15000,
        );
        landed = true;
    } catch {}
    if (landed) ok("the browser landed on /auth/sign-up-success?email=...");
    else {
        const formErrors = await evaluate(`
          Array.prototype.slice.call(document.querySelectorAll('[data-slot="form-message"], .text-destructive, [role=alert]'))
            .map(function(e){ return (e.innerText || '').trim(); })
            .filter(function(t){ return t; })
            .join(' | ')
        `);
        bad(
            "the post-signup page",
            `${await currentUrl()}${formErrors ? ` [form errors: ${formErrors}]` : ''}`,
        );
    }

    const inboxText = await bodyText();
    if (/Check your email/i.test(inboxText))
        ok('the page shows the "Check your email" card');
    else bad('the "Check your email" card', inboxText.slice(0, 200));
    if (/10 minutes/i.test(inboxText))
        ok("the page mentions the 10-minute window");
    else bad("the 10-minute wording", inboxText.slice(0, 200));

    section("U2: the verification link was really emailed");
    const sent = await waitForMails(email, { count: 1 });
    let rawToken = tokenFromMail(sent[sent.length - 1] || {});
    if (rawToken) ok("the verification token was recovered from the stubbed mail");
    else bad("the verification token", "not found in the emailed body");

    section("U3: signing in while unverified routes to the inbox page");
    await clearCookies();
    await navigate(`${BASE}/auth?mode=login`);
    await waitFor(
        "!!document.querySelector('input[type=email]')",
        "the login form",
    );
    await setInputByLabel("Email", email);
    await setInputByLabel("Password", password);
    const clickedLogin = await clickButton("Sign in");
    if (clickedLogin) ok("the login form was submitted");
    else bad("the login form", "the 'Sign in' button was not found");

    let routed = false;
    try {
        await waitFor(
            `window.location.pathname === '/auth/sign-up-success'`,
            "the inbox page after a blocked sign-in",
            15000,
        );
        routed = true;
    } catch {}
    if (routed)
        ok("the blocked sign-in routed the browser to /auth/sign-up-success");
    else
        bad(
            "the blocked sign-in routing",
            `still on ${await currentUrl()} — the user was stranded on the login form`,
        );

    const afterLoginText = await bodyText();
    if (/Check your email/i.test(afterLoginText))
        ok('the "Check your email" card is shown after the blocked sign-in');
    else bad('the "Check your email" card', afterLoginText.slice(0, 200));

    const cookies = await send("Network.getCookies");
    const sessionCookie = cookies.cookies?.find((c) =>
        (c.name || "").includes("sb-access-token"),
    );
    if (!sessionCookie)
        ok("no session cookie was set for the unverified account");
    else
        bad(
            "the session cookie",
            `a cookie was set: ${sessionCookie.name}`,
        );

    const afterUrl = await currentUrl();
    if (!afterUrl.includes("/dashboard"))
        ok("the browser was NOT sent to the dashboard");
    else bad("the redirect target", afterUrl);

    const afterBlock = await waitForMails(email, { count: 2 });
    const newestToken = tokenFromMail(afterBlock[afterBlock.length - 1] || {});
    if (newestToken && newestToken !== rawToken)
        ok("the blocked sign-in re-issued the link with a NEW token");
    else
        bad(
            "the re-issued link",
            newestToken
                ? "the new mail carried the same token"
                : "no second mail was received",
        );
    rawToken = newestToken || rawToken;

    section("U4: clicking the link verifies the account");
    const u4Start = networkLog.length;
    if (rawToken) {
        await navigate(`${BASE}/auth/verify-email?token=${rawToken}`);
        let verified = false;
        try {
            await waitFor(
                `/Email verified/i.test(document.body ? document.body.innerText : '')`,
                "the 'Email verified' state",
                15000,
            );
            verified = true;
        } catch {}
        if (verified) ok('the page shows the "Email verified" state');
        else {
            const t = await bodyText();
            bad('the "Email verified" state', t.slice(0, 300));
        }

        const row = await db.query(
            "SELECT email_confirmed_at FROM public.profiles WHERE email = $1",
            [email],
        );
        if (row.rows[0]?.email_confirmed_at)
            ok("email_confirmed_at is set in the database");
        else bad("email_confirmed_at", "still null");

        const apiCalls = networkLog
            .slice(u4Start)
            .filter((r) => /\/api\/v1\/verify-email/.test(r.url));
        const verifyPost = apiCalls.find((r) => r.method === "POST");
        if (verifyPost)
            ok("the browser POSTed the token to the API");
        else
            bad("the verify-email API request", "no POST was observed");
        const verifyGet = apiCalls.find((r) => r.method === "GET");
        if (!verifyGet)
            ok("the browser never issued an API GET for the token (a scanner could burn it)");
        else bad("an API GET for the verification token", verifyGet.url);
    } else {
        bad("U4", "skipped — no token was available");
    }

    section("U5: the verified account can sign in from the browser");
    await clearCookies();
    await navigate(`${BASE}/auth?mode=login`);
    await waitFor(
        "!!document.querySelector('input[type=email]')",
        "the login form",
    );
    await setInputByLabel("Email", email);
    await setInputByLabel("Password", password);
    const u5Start = networkLog.length;
    await clickButton("Sign in");
    let signedIn = false;
    try {
        await waitFor(
            `window.location.pathname === '/dashboard'`,
            "the dashboard",
            20000,
        );
        signedIn = true;
    } catch {}
    if (signedIn) ok("the verified sign-in reached the dashboard");
    else {
        const url = await currentUrl();
        const cookies = await send("Network.getCookies");
        const sessionCookie = cookies.cookies?.find((c) =>
            (c.name || "").includes("sb-access-token"),
        );
        const toastText = await evaluate(`
          Array.prototype.slice.call(document.querySelectorAll('[data-sonner-toast], [role=status], [role=alert]'))
            .map(function(e){ return (e.innerText || '').trim(); })
            .filter(function(t){ return t; })
            .join(' | ')
        `);
        const signinCall = networkLog
            .slice(u5Start)
            .find((r) => r.url.includes("/signin") && r.method === "POST");
        bad(
            "the verified sign-in",
            `${url}${sessionCookie ? '' : ' [no session cookie]'}${
                toastText ? ` [toast: ${toastText}]` : ''
            }${signinCall ? '' : ' [no /signin request was made]'}`,
        );
    }

    section("U6: an already-used link is refused");
    if (rawToken) {
        await navigate(`${BASE}/auth/verify-email?token=${rawToken}`);
        let refused = false;
        try {
            await waitFor(
                `/Verification failed/i.test(document.body ? document.body.innerText : '')`,
                "the 'Verification failed' state",
                15000,
            );
            refused = true;
        } catch {}
        if (refused) ok('a replayed link shows the "Verification failed" state');
        else bad('the "Verification failed" state', (await bodyText()).slice(0, 300));
    }
} finally {
    try {
        await db.query("DELETE FROM public.profiles WHERE email = $1", [email]);
    } catch {}
    await db.end().catch(() => {});
    try {
        stub.kill();
    } catch {}
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

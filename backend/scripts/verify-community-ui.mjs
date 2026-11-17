

import 'dotenv/config';
import { WebSocket } from 'ws';
import pg from 'pg';

import { API_BASE, createTestUser, bypassHeaders } from './_testAuth.js';

const CDP_HTTP = 'http://localhost:9222';
const BASE = 'http://localhost:3000';

let passed = 0;
let failed = 0;
const ok = (m) => { console.log(`  ✓ ${m}`); passed++; };
const bad = (m, e) => { console.log(`  ✗ ${m}${e ? `: ${e}` : ''}`); failed++; };
const info = (m) => console.log(`  – ${m}`);
const section = (m) => console.log(`\n--- ${m} ---`);





let ws;
let msgId = 0;
const pending = new Map();

async function connect() {
  const targets = await (await fetch(`${CDP_HTTP}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page');
  if (!page) throw new Error('no Chrome page target found on :9222');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.on('open', res);
    ws.on('error', rej);
  });
  ws.on('message', (raw) => {
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
  const r = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.exception?.description || 'eval failed');
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

async function navigate(url) {
  await send('Page.navigate', { url });
  await sleep(1500);
}

async function setInputValue(selector, value) {
  const done = await evaluate(`
    (function() {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return false;
      const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      setter.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()
  `);
  if (!done) throw new Error(`could not set ${selector}`);
}

async function bodyText() {
  return evaluate('document.body.innerText');
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
  if (!rect) throw new Error('realClick: element not found');
  const { x, y } = JSON.parse(rect);
  await sleep(200);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await sleep(100);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
  await sleep(80);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
  await sleep(600);
}





const db = new pg.Client({ connectionString: process.env.DB_URL });
await db.connect();

const stamp = Date.now();
const email = `communityui-${stamp}@e2e.local`;
const password = 'CommunityUI-2026!';

let token = null;
let userId = null;
const createdPostIds = [];
const seededPostId = null;
const seededPostTitle = `UI Community Post ${stamp}`;
const seededPostTopic = 'UI Topic';

async function api(method, path, body, tok = token) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
      ...bypassHeaders(),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch {  }
  return { status: res.status, body: parsed, text };
}


async function seedPost(title, topic) {
  const r = await db.query(
    `INSERT INTO community_posts (author_id, title, content, category, course_topic, view_count)
     VALUES ($1, $2, $3, 'theory', $4, 7)
     RETURNING id`,
    [userId, title, 'Seeded content for the community UI test.', topic],
  );
  createdPostIds.push(r.rows[0].id);
  return r.rows[0].id;
}






const requests = [];
function captureRequests() {
  requests.length = 0;
  send('Network.enable');
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.method !== 'Network.requestWillBeSent') return;
    const { request } = msg.params;
    if (!request?.url?.includes('/community/')) return;
    let body = null;
    if (request.postData) {
      try { body = JSON.parse(request.postData); } catch { body = request.postData; }
    }
    requests.push({ url: request.url, method: request.method, body });
  });
}

function findRequest(predicate) {
  return requests.find(predicate);
}





try {
  console.log(`\nCommunity UI E2E against ${BASE}`);

  const user = await createTestUser(email, password, db);
  token = user.token;
  userId = user.userId;
  ok(`test user created (${email})`);

  const postId = await seedPost(seededPostTitle, seededPostTopic);
  ok(`post seeded (${postId})`);

  await connect();
  await send('Page.enable');
  await send('Runtime.enable');
  captureRequests();


  section('A. sign in through the real login form');

  await navigate(`${BASE}/auth`);
  await waitFor(`!!document.querySelector('input[type="password"]')`, 'the login form');

  await setInputValue('input[type="email"]', email);
  await setInputValue('input[type="password"]', password);
  await sleep(300);

  await evaluate(`
    (function() {
      const btn = document.querySelector('form button[type="submit"]');
      if (!btn) return false;
      btn.click();
      return true;
    })()
  `);




  let signedIn = false;
  for (let i = 0; i < 40; i++) {
    await sleep(250);
    try {
      if (await evaluate(`location.pathname !== '/auth'`)) { signedIn = true; break; }
    } catch {  }
  }

  if (signedIn) ok(`signed in, landed on ${await evaluate('location.pathname')}`);
  else {
    bad('signed in', `still on ${await evaluate('location.pathname')}`);
    info((await bodyText()).slice(0, 300));
  }


  section('B. community list — the post renders with real values');

  await navigate(`${BASE}/community`);
  await waitFor(
    `document.body.innerText.includes(${JSON.stringify(seededPostTitle)})`,
    'the seeded post to appear',
  );
  ok('the seeded post appears in the list');

  const listText = await bodyText();



  if (listText.includes(seededPostTopic)) ok('the course topic badge is rendered');
  else bad('the course topic badge is rendered', 'topic missing from the page');


  if (listText.includes('Theory')) ok('the category badge is rendered');
  else bad('the category badge is rendered', 'category missing from the page');



  if (/\b7 views\b/.test(listText)) ok('the view count is rendered with its real value (7 views)');
  else {
    const m = listText.match(/(\d+)\s+views/);
    bad('the view count is rendered with its real value (7 views)', m ? `saw "${m[0]}"` : 'no view count on the page');
  }


  if (/\b0 comments\b/.test(listText)) ok('the comment count is rendered');
  else {
    const m = listText.match(/(\d+)\s+comments/);
    bad('the comment count is rendered', m ? `saw "${m[0]}"` : 'no comment count on the page');
  }



  if (listText.includes(email.split('@')[0])) ok('the author name is rendered');
  else bad('the author name is rendered', 'author missing from the page');




  const invalidDate = /Invalid Date|NaN/.test(listText);
  if (!invalidDate) ok('the post date renders without an Invalid Date');
  else bad('the post date renders without an Invalid Date', 'the page contains Invalid Date / NaN');


  section('C. community list — the status filter sends the right param');

  requests.length = 0;


  await realClick(`
    Array.from(document.querySelectorAll('button'))
      .find(e => (e.textContent || '').trim() === 'All Status')
      || Array.from(document.querySelectorAll('[role="combobox"]'))[0]
  `);
  await sleep(500);

  const optionFound = await evaluate(`
    (function() {
      const opt = Array.from(document.querySelectorAll('[role="option"]'))
        .find(e => (e.textContent || '').trim() === 'Unresolved');
      if (!opt) return false;
      opt.click();
      return true;
    })()
  `);
  if (optionFound) ok('the "Unresolved" status option was selectable');
  else bad('the "Unresolved" status option was selectable', 'option not found in the listbox');

  await sleep(1500);

  const statusRequest = findRequest(
    (r) => r.method === 'GET' && r.url.includes('/community/posts?'),
  );
  if (statusRequest) ok('the list request was captured');
  else bad('the list request was captured', 'no GET /community/posts request seen');

  if (statusRequest) {
    const url = statusRequest.url;
    if (url.includes('isResolved=false')) ok('the request carries `isResolved=false`');
    else bad('the request carries `isResolved=false`', url);
    if (!url.includes('is_resolved')) ok('the request does not carry the legacy `is_resolved`');
    else bad('the request does not carry the legacy `is_resolved`', url);
    if (url.includes('pageSize=20')) ok('the request carries an explicit `pageSize`');
    else bad('the request carries an explicit `pageSize`', url);
  }


  section('D. community list — create a post with a topic');

  requests.length = 0;

  const createdTitle = `UI Created Post ${stamp}`;
  const createdTopic = `UI Created Topic ${stamp}`;


  await evaluate(`
    (function() {
      const btn = Array.from(document.querySelectorAll('button'))
        .find(e => (e.textContent || '').trim().includes('New Post'));
      if (!btn) return false;
      btn.click();
      return true;
    })()
  `);
  await sleep(1200);

  await waitFor(`!!document.querySelector('#title')`, 'the create-post form');

  const formShape = JSON.parse(await evaluate(`
    (function() {
      const title = document.querySelector('#title');
      if (!title) return JSON.stringify({ found: false });
      const dialog = title.closest('[role="dialog"]');
      if (!dialog) return JSON.stringify({ found: true, role: null });
      const r = dialog.getBoundingClientRect();
      return JSON.stringify({
        found: true,
        role: 'dialog',
        left: r.left,
        right: r.right,
        width: r.width,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        top: r.top,
        height: r.height,
      });
    })()
  `));

  if (formShape.found && formShape.role === 'dialog') {
    ok('the create-post form is rendered inside a dialog');
  } else {
    bad('the create-post form is rendered inside a dialog', JSON.stringify(formShape));
  }

  if (formShape.found && formShape.role === 'dialog') {
    const mid = formShape.viewportWidth / 2;
    const center = formShape.left + formShape.width / 2;
    const offset = Math.abs(center - mid);
    if (offset <= 24) {
      ok(`the dialog is horizontally centred (offset ${Math.round(offset)}px)`);
    } else {
      bad(
        'the dialog is horizontally centred',
        `center ${Math.round(center)} vs viewport mid ${Math.round(mid)} `
          + `(offset ${Math.round(offset)}px, left ${Math.round(formShape.left)}, `
          + `right ${Math.round(formShape.right)}, vw ${formShape.viewportWidth})`,
      );
    }

    const flushRight = formShape.viewportWidth - formShape.right;
    if (flushRight > 24) {
      ok(`the dialog is not flush against the right edge (${Math.round(flushRight)}px gap)`);
    } else {
      bad(
        'the dialog is not flush against the right edge',
        `only ${Math.round(flushRight)}px from the right edge — that is a drawer`,
      );
    }
  }

  await setInputValue('#title', createdTitle);
  await setInputValue('#content', 'Created from the community UI test.');
  await setInputValue('#topic', createdTopic);
  await sleep(300);

  await evaluate(`
    (function() {
      const btn = document.querySelector('form button[type="submit"]');
      if (!btn) return false;
      btn.click();
      return true;
    })()
  `);
  await sleep(2500);

  const createRequest = findRequest(
    (r) => r.method === 'POST' && r.url.includes('/community/posts') && !r.url.includes('/comments'),
  );
  if (createRequest) ok('the create-post request was captured');
  else bad('the create-post request was captured', 'no POST /community/posts request seen');

  if (createRequest) {
    const body = createRequest.body || {};
    if (body.courseTopic === createdTopic) ok('the request body carries `courseTopic`');
    else bad('the request body carries `courseTopic`', JSON.stringify(body));
    if (body.course_topic === undefined) ok('the request body does not carry the legacy `course_topic`');
    else bad('the request body does not carry the legacy `course_topic`', JSON.stringify(body));
  }



  const dbRow = await db.query(
    'SELECT id, course_topic FROM community_posts WHERE title = $1',
    [createdTitle],
  );
  if (dbRow.rows.length === 1) {
    createdPostIds.push(dbRow.rows[0].id);
    ok('the created post was stored');
  } else {
    bad('the created post was stored', `found ${dbRow.rows.length} rows`);
  }
  if (dbRow.rows[0]?.course_topic === createdTopic) {
    ok('the course topic reached the database');
  } else {
    bad('the course topic reached the database', `got ${dbRow.rows[0]?.course_topic}`);
  }


  await navigate(`${BASE}/community`);
  await waitFor(
    `document.body.innerText.includes(${JSON.stringify(createdTitle)})`,
    'the created post to appear in the list',
  );
  const afterCreate = await bodyText();
  if (afterCreate.includes(createdTopic)) ok('the new post shows its topic badge');
  else bad('the new post shows its topic badge', 'topic missing');


  section('E. community detail — views, threading and the reply body');

  await navigate(`${BASE}/community/${postId}`);
  await waitFor(
    `document.body.innerText.includes(${JSON.stringify(seededPostTitle)})`,
    'the post detail page',
  );
  ok('the post detail page loads');

  const detailText = await bodyText();
  if (detailText.includes(seededPostTopic)) ok('the detail page renders the course topic');
  else bad('the detail page renders the course topic', 'topic missing');



  if (/\b8 views\b/.test(detailText)) ok('opening the post increments the view count (7 -> 8)');
  else {
    const m = detailText.match(/(\d+)\s+views/);
    bad('opening the post increments the view count (7 -> 8)', m ? `saw "${m[0]}"` : 'no view count');
  }


  if (/\b0 Comments\b/.test(detailText)) ok('the comment count heading is rendered');
  else {
    const m = detailText.match(/(\d+)\s+Comments/);
    bad('the comment count heading is rendered', m ? `saw "${m[0]}"` : 'no heading');
  }


  requests.length = 0;
  const rootComment = `UI root comment ${stamp}`;
  await setInputValue('textarea', rootComment);
  await sleep(300);
  await evaluate(`
    (function() {
      const btn = Array.from(document.querySelectorAll('button'))
        .find(e => (e.textContent || '').trim() === 'Post Comment');
      if (!btn) return false;
      btn.click();
      return true;
    })()
  `);
  await sleep(2500);

  const commentRequest = findRequest(
    (r) => r.method === 'POST' && r.url.includes('/comments'),
  );
  if (commentRequest) ok('the comment request was captured');
  else bad('the comment request was captured', 'no POST /comments request seen');

  if (commentRequest) {
    const body = commentRequest.body || {};
    if (body.parent_id === undefined) ok('the comment body does not carry the legacy `parent_id`');
    else bad('the comment body does not carry the legacy `parent_id`', JSON.stringify(body));
    if (body.mentioned_username === undefined) ok('the comment body does not carry the legacy `mentioned_username`');
    else bad('the comment body does not carry the legacy `mentioned_username`', JSON.stringify(body));
  }

  await waitFor(
    `document.body.innerText.includes(${JSON.stringify(rootComment)})`,
    'the comment to appear',
  );
  ok('the posted comment appears on the page');


  requests.length = 0;
  const replyText = `UI nested reply ${stamp}`;

  await evaluate(`
    (function() {
      const btn = Array.from(document.querySelectorAll('button'))
        .find(e => (e.textContent || '').trim() === 'Reply');
      if (!btn) return false;
      btn.click();
      return true;
    })()
  `);
  await sleep(800);

  await setInputValue('textarea', replyText);
  await sleep(300);
  await evaluate(`
    (function() {
      const btn = Array.from(document.querySelectorAll('button'))
        .find(e => (e.textContent || '').trim() === 'Post Comment');
      if (!btn) return false;
      btn.click();
      return true;
    })()
  `);
  await sleep(2500);

  const replyRequest = findRequest(
    (r) => r.method === 'POST' && r.url.includes('/comments'),
  );
  if (replyRequest) {
    const body = replyRequest.body || {};
    if (typeof body.parentId === 'string' && body.parentId.length > 0) {
      ok('the reply body carries `parentId`');
    } else {
      bad('the reply body carries `parentId`', JSON.stringify(body));
    }
  } else {
    bad('the reply request was captured', 'no POST /comments request seen');
  }



  const nested = await evaluate(`
    (function() {
      const el = Array.from(document.querySelectorAll('p'))
        .find(e => (e.textContent || '').includes(${JSON.stringify(replyText)}));
      if (!el) return null;
      let node = el;
      while (node && node !== document.body) {
        if (node.className && String(node.className).includes('ml-8')) return true;
        node = node.parentElement;
      }
      return false;
    })()
  `);
  if (nested === true) ok('the reply is rendered nested under its parent');
  else if (nested === null) bad('the reply is rendered nested under its parent', 'the reply text is not on the page');
  else bad('the reply is rendered nested under its parent', 'the reply is a flat sibling');


  section('F. community detail — the comment date renders');

  const finalText = await bodyText();
  if (!/Invalid Date|NaN/.test(finalText)) ok('no Invalid Date / NaN anywhere on the detail page');
  else bad('no Invalid Date / NaN anywhere on the detail page', 'the page contains Invalid Date / NaN');
} finally {
  console.log('\n--- cleanup ---');
  for (const id of createdPostIds) {
    await db.query('DELETE FROM community_posts WHERE id = $1', [id]).catch(() => {});
  }
  await db.query('DELETE FROM community_comments WHERE author_id = $1', [userId]).catch(() => {});
  await db.query('DELETE FROM community_posts WHERE author_id = $1', [userId]).catch(() => {});
  await db.query('DELETE FROM user_presence WHERE user_id = $1', [userId]).catch(() => {});
  await db.query('DELETE FROM public.profiles WHERE email = $1', [email]).catch(() => {});
  await db.end().catch(() => {});
  console.log('  ✓ test rows removed');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

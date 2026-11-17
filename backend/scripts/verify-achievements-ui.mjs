

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





const db = new pg.Client({ connectionString: process.env.DB_URL });
await db.connect();

const stamp = Date.now();
const email = `achui-${stamp}@e2e.local`;
const password = 'AchievementUI-2026!';

let token = null;
let userId = null;

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


async function seedXpEvents(sources) {
  let i = 0;
  for (const source of sources) {
    i += 1;
    await db.query(
      `INSERT INTO xp_events (user_id, source, amount, metadata, created_at)
       VALUES ($1, $2, 7, '{}'::jsonb, now() - ($3 || ' minutes')::interval)`,
      [userId, source, String(i)],
    );
  }
}


async function seedXpEventCount(count) {
  if (count <= 0) return;
  await db.query(
    `INSERT INTO xp_events (user_id, source, amount, metadata, created_at)
     SELECT $1, 'quiz_correct', 7, '{}'::jsonb, now() - (g || ' minutes')::interval
     FROM generate_series(1, $2) g`,
    [userId, count],
  );
}


async function seedLevelAndStreak(totalXp, level) {
  await db.query(
    `INSERT INTO user_xp (user_id, total_xp, level, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (user_id) DO UPDATE SET total_xp = EXCLUDED.total_xp,
                                         level = EXCLUDED.level,
                                         updated_at = now()`,
    [userId, totalXp, level],
  );
  await db.query(
    `INSERT INTO daily_streaks (user_id, current_streak, longest_streak, last_active_date, updated_at)
     VALUES ($1, 5, 9, CURRENT_DATE, now())
     ON CONFLICT (user_id) DO UPDATE SET current_streak = EXCLUDED.current_streak,
                                        longest_streak = EXCLUDED.longest_streak,
                                        last_active_date = EXCLUDED.last_active_date,
                                        updated_at = now()`,
    [userId],
  );
}






const requests = [];
function captureRequests() {
  requests.length = 0;
  send('Network.enable');
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.method !== 'Network.requestWillBeSent') return;
    const { request } = msg.params;
    if (!request?.url?.includes('/gamification/')) return;
    let body = null;
    if (request.postData) {
      try { body = JSON.parse(request.postData); } catch { body = request.postData; }
    }
    requests.push({ url: request.url, method: request.method, body });
  });
}

function findRequests(predicate) {
  return requests.filter(predicate);
}


async function iconClassOf(selector) {
  return evaluate(`
    (function() {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      const svg = el.querySelector('svg');
      if (!svg) return null;
      const cls = svg.getAttribute('class') || '';
      const m = cls.match(/lucide-([a-z0-9-]+)/);
      return m ? m[1] : cls;
    })()
  `);
}





const XP_SOURCES = [
  'srs_review',
  'quiz_correct',
  'quiz_finished',
  'mindmap_generated',
  'chat_message',
  'material_viewed',
];

try {
  console.log(`\nAchievements UI E2E against ${BASE}`);

  const user = await createTestUser(email, password, db);
  token = user.token;
  userId = user.userId;
  ok(`test user created (${email})`);

  await seedLevelAndStreak(450, 3);
  await seedXpEvents(XP_SOURCES);
  ok('seeded level, streak and one XP event per source');

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


  section('B. the page renders the level card');

  requests.length = 0;
  await navigate(`${BASE}/achievements`);
  await waitFor(
    `document.body.innerText.includes('Achievements') && document.body.innerText.includes('XP history')`,
    'the achievements page',
  );
  ok('the achievements page renders');

  const text = await bodyText();



  if (text.includes('450 XP')) ok('the XP total is rendered with its real value (450 XP)');
  else {
    const m = text.match(/([\d,]+)\s*XP/);
    bad('the XP total is rendered with its real value (450 XP)', m ? `saw "${m[0]}"` : 'no XP total on the page');
  }

  if (text.includes('Level 3')) ok('the level is rendered (Level 3)');
  else bad('the level is rendered (Level 3)', 'level missing from the page');




  if (text.includes('450 to Lv 4')) ok('the XP-to-next-level label is rendered (450 to Lv 4)');
  else {
    const m = text.match(/([\d,]+)\s*to Lv\s*(\d+)/);
    bad('the XP-to-next-level label is rendered (450 to Lv 4)', m ? `saw "${m[0]}"` : 'label missing');
  }


  section('C. the streak card renders');


  if (/\b5\b[\s\S]{0,40}\bdays\b/.test(text)) ok('the current streak is rendered (5 days)');
  else bad('the current streak is rendered (5 days)', 'streak count missing');

  if (text.includes('Longest streak: 9 days')) ok('the longest streak is rendered (9 days)');
  else bad('the longest streak is rendered (9 days)', 'longest streak missing');

  if (text.includes('Last active')) ok('the last-active date is rendered');
  else bad('the last-active date is rendered', 'last active line missing');




  if (!/Invalid Date|NaN/.test(text)) ok('no Invalid Date / NaN on the page');
  else bad('no Invalid Date / NaN on the page', 'the page contains Invalid Date / NaN');


  section('D. the badge grid renders');


  if (/\b0\b[\s\S]{0,30}\/\s*8/.test(text)) ok('the badge counter renders (0 / 8)');
  else {
    const m = text.match(/(\d+)\s*\/\s*(\d+)/);
    bad('the badge counter renders (0 / 8)', m ? `saw "${m[0]}"` : 'no badge counter on the page');
  }

  if (text.includes('Keep learning to earn your first badge')) {
    ok('the empty-badge state renders when nothing is earned');
  } else {
    bad('the empty-badge state renders when nothing is earned', 'empty state missing');
  }


  section('E. XP history rows show DISTINCT source icons');



  const rowIcons = await evaluate(`
    (function() {
      const rows = Array.from(document.querySelectorAll('tbody tr'));
      return rows.map(function(row) {
        const span = row.querySelector('span');
        if (!span) return null;
        const svg = span.querySelector('svg');
        if (!svg) return null;
        const cls = svg.getAttribute('class') || '';
        const m = cls.match(/lucide-([a-z0-9-]+)/);
        return {
          icon: m ? m[1] : cls,
          label: (span.textContent || '').trim(),
        };
      }).filter(Boolean);
    })()
  `);

  info(`rows rendered: ${rowIcons.length}`);
  if (rowIcons.length >= 6) ok(`all ${rowIcons.length} seeded XP rows render`);
  else bad(`all seeded XP rows render`, `only ${rowIcons.length} rows`);

  const icons = rowIcons.map((r) => r.icon);
  const distinct = new Set(icons);
  info(`icons: ${icons.join(', ')}`);
  if (distinct.size >= 6) ok(`the rows use ${distinct.size} distinct icons`);
  else {
    bad(`the rows use distinct icons`, `only ${distinct.size}: ${[...distinct].join(', ')}`);
  }

  const allAward = icons.every((i) => i === 'award');
  if (!allAward) ok('the rows are not all the generic "award" fallback');
  else bad('the rows are not all the generic "award" fallback', 'every row used the fallback icon');







  const expected = {
    'Flashcard review': 'layers',
    'Quiz answer': 'circle-check',
    'Quiz completed': 'list-checks',
    'Mind map created': 'network',
    'Chat message': 'message-square',
    'Material viewed': 'book-open',
  };
  for (const [label, icon] of Object.entries(expected)) {
    const row = rowIcons.find((r) => r.label === label);
    if (!row) {
      bad(`the "${label}" row renders`, 'row not found');
    } else if (row.icon === icon) {
      ok(`the "${label}" row uses the "${icon}" icon`);
    } else {
      bad(`the "${label}" row uses the "${icon}" icon`, `got "${row.icon}"`);
    }
  }


  if (text.includes('Flashcard review')) ok('the source labels are rendered');
  else bad('the source labels are rendered', 'labels missing');


  section('F. request audit — no duplicate stats request');

  const statsRequests = findRequests(
    (r) => r.method === 'GET' && r.url.includes('/gamification/stats'),
  );
  info(`GET /gamification/stats requests: ${statsRequests.length}`);
  if (statsRequests.length === 1) ok('the page issues exactly ONE GET /gamification/stats');
  else bad('the page issues exactly ONE GET /gamification/stats', `saw ${statsRequests.length}`);

  const xpRequests = findRequests(
    (r) => r.method === 'GET' && r.url.includes('/gamification/xp'),
  );
  if (xpRequests.length >= 1) ok('the page requests the XP history');
  else bad('the page requests the XP history', 'no GET /gamification/xp seen');

  if (xpRequests.length >= 1) {
    const url = xpRequests[0].url;
    if (url.includes('limit=50')) ok('the XP request carries limit=50');
    else bad('the XP request carries limit=50', url);
  }

  const badgeRequests = findRequests(
    (r) => r.method === 'GET' && r.url.includes('/gamification/badges'),
  );
  if (badgeRequests.length === 1) ok('the page issues exactly ONE GET /gamification/badges');
  else bad('the page issues exactly ONE GET /gamification/badges', `saw ${badgeRequests.length}`);


  section('G. "Load more" appends the next page');




  await seedXpEventCount(60 - XP_SOURCES.length);

  requests.length = 0;
  await navigate(`${BASE}/achievements`);
  await waitFor(
    `document.body.innerText.includes('Achievements') && document.body.innerText.includes('XP history')`,
    'the achievements page',
  );
  await waitFor(
    `Array.from(document.querySelectorAll('button')).some(e => (e.textContent || '').trim() === 'Load more')`,
    'the "Load more" button',
  ).catch(() => {});

  const before = await evaluate(`document.querySelectorAll('tbody tr').length`);
  info(`rows on the first page: ${before}`);
  if (before === 50) ok('the first page shows exactly 50 rows');
  else bad('the first page shows exactly 50 rows', `saw ${before}`);

  requests.length = 0;

  const clicked = await evaluate(`
    (function() {
      const btn = Array.from(document.querySelectorAll('button'))
        .find(e => (e.textContent || '').trim() === 'Load more');
      if (!btn) return false;
      btn.click();
      return true;
    })()
  `);

  if (!clicked) {
    bad('the "Load more" button exists and was clicked', 'no button found');
  } else {
    ok('the "Load more" button was clicked');
    await waitFor(
      `document.querySelectorAll('tbody tr').length > 50`,
      'the second page of rows',
      15000,
    ).catch(() => {});
    await sleep(500);
  }

  const after = await evaluate(`document.querySelectorAll('tbody tr').length`);
  info(`rows before=${before} after=${after}`);
  if (after > before) ok(`"Load more" appended rows (${before} -> ${after})`);
  else bad(`"Load more" appended rows`, `stayed at ${after}`);


  if (after === 60) ok('all 60 seeded rows are reachable across both pages');
  else bad('all 60 seeded rows are reachable across both pages', `saw ${after}`);



  const dupIds = await evaluate(`
    (function() {
      const rows = Array.from(document.querySelectorAll('tbody tr'));
      const texts = rows.map(r => (r.textContent || '').trim());
      const seen = new Set();
      const dups = [];
      texts.forEach(t => { if (seen.has(t)) dups.push(t); seen.add(t); });
      return dups.length;
    })()
  `);
  if (dupIds === 0) ok('no duplicated rows after "Load more"');
  else bad('no duplicated rows after "Load more"', `${dupIds} duplicates`);

  const loadMoreRequests = findRequests(
    (r) => r.method === 'GET' && r.url.includes('/gamification/xp') && r.url.includes('cursor='),
  );
  if (loadMoreRequests.length >= 1) ok('the "Load more" request carries a cursor');
  else bad('the "Load more" request carries a cursor', 'no cursor request seen');


  section('G2. "Load more" absorbs rows the server repeats');










  const overlapStub = await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      (function() {
        const orig = window.fetch;
        let firstPage = null;
        window.fetch = function(input, init) {
          const url = typeof input === 'string' ? input : (input && input.url) || '';
          if (url.indexOf('/gamification/xp') === -1) {
            return orig.call(window, input, init);
          }
          return orig.call(window, input, init).then(function(res) {
            return res.clone().json().then(function(body) {
              const isCursor = url.indexOf('cursor=') !== -1;
              if (!isCursor && !firstPage) {
                firstPage = body;
                return new Response(JSON.stringify(body), {
                  status: res.status, headers: { 'Content-Type': 'application/json' },
                });
              }
              if (isCursor && firstPage && firstPage.events) {
                const fresh = (firstPage.events || [])[0];
                return new Response(JSON.stringify({
                  events: (firstPage.events || []).slice(0, 3).concat(fresh ? [fresh] : []),
                  nextCursor: null,
                }), { status: 200, headers: { 'Content-Type': 'application/json' } });
              }
              return res;
            });
          });
        };
      })();
    `,
  });

  try {
    await navigate(`${BASE}/achievements`);
    await waitFor(
      `Array.from(document.querySelectorAll('button')).some(e => (e.textContent || '').trim() === 'Load more')`,
      'the "Load more" button',
      15000,
    ).catch(() => {});

    const before = await evaluate(`document.querySelectorAll('tbody tr').length`);
    await evaluate(`
      (function() {
        const btn = Array.from(document.querySelectorAll('button'))
          .find(e => (e.textContent || '').trim() === 'Load more');
        if (!btn) return false;
        btn.click();
        return true;
      })()
    `);
    await sleep(2500);

    const after = await evaluate(`document.querySelectorAll('tbody tr').length`);
    info(`rows before=${before} after=${after} (the stub repeats 4 rows)`);



    if (after === before) {
      ok('repeated rows from the server are dropped, not appended');
    } else {
      bad(
        'repeated rows from the server are dropped, not appended',
        `grew ${before} -> ${after} (rows were duplicated)`,
      );
    }


    const dupIds = await evaluate(`
      (function() {
        const rows = Array.from(document.querySelectorAll('tbody tr'));
        const texts = rows.map(r => (r.textContent || '').trim());
        const seen = new Set();
        const dups = [];
        texts.forEach(t => { if (seen.has(t)) dups.push(t); seen.add(t); });
        return dups.length;
      })()
    `);
    if (dupIds === 0) ok('no row is rendered twice when the server repeats rows');
    else bad('no row is rendered twice when the server repeats rows', `${dupIds} duplicates`);
  } finally {
    await send('Page.removeScriptToEvaluateOnNewDocument', {
      identifier: overlapStub.identifier,
    });
  }


  section('H. the page surfaces errors instead of an empty state');








  const { identifier: stubId } = await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      (function() {
        const orig = window.fetch;
        window.fetch = function(input, init) {
          const url = typeof input === 'string' ? input : (input && input.url) || '';
          if (url.indexOf('/gamification/') !== -1) {
            return Promise.resolve(new Response(
              JSON.stringify({ detail: 'simulated outage' }),
              { status: 500, headers: { 'Content-Type': 'application/json' } },
            ));
          }
          return orig.call(window, input, init);
        };
      })();
    `,
  });
  ok('the gamification API is stubbed to fail');

  await navigate(`${BASE}/achievements`);
  await waitFor(
    `document.body.innerText.includes('simulated outage') || document.body.innerText.includes('Failed to load')`,
    'an error message',
    15000,
  ).catch(() => {});

  const errorText = await bodyText();
  if (errorText.includes('simulated outage') || errorText.includes('Failed to load')) {
    ok('the page shows the API error instead of an empty state');
  } else {
    bad('the page shows the API error instead of an empty state', `page shows: "${errorText.slice(0, 200)}"`);
  }


  if (!errorText.includes('Keep learning to earn your first badge')) {
    ok('the empty-badge state does not masquerade as an error');
  } else {
    bad('the empty-badge state does not masquerade as an error', 'the empty state is showing');
  }


  await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: stubId });
  await evaluate(`
    (function() {
      if (window.__origFetch) { window.fetch = window.__origFetch; }
      return true;
    })()
  `);
  ok('the real fetch was restored');
} catch (e) {
  bad('the suite ran to completion', e.message);
  console.error(e);
} finally {

  section('Cleanup');
  try {
    await db.query(`DELETE FROM xp_events WHERE user_id = $1`, [userId]);
    await db.query(`DELETE FROM user_badges WHERE user_id = $1`, [userId]);
    await db.query(`DELETE FROM daily_streaks WHERE user_id = $1`, [userId]);
    await db.query(`DELETE FROM user_xp WHERE user_id = $1`, [userId]);
    await db.query(`DELETE FROM public.profiles WHERE id = $1`, [userId]);
    const leftover = await db.query(
      `SELECT COUNT(*)::int c FROM public.profiles WHERE email LIKE 'achui-%'`,
    );
    if (leftover.rows[0].c === 0) ok('no test profiles left behind');
    else bad('no test profiles left behind', `${leftover.rows[0].c} left`);
  } catch (e) {
    bad('cleanup', e.message);
  }
  await db.end();
}

console.log(`\n${'='.repeat(60)}`);
console.log(`  achievements UI suite: ${passed} passed, ${failed} failed`);
console.log('='.repeat(60));
process.exit(failed > 0 ? 1 : 0);

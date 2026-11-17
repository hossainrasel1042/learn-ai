

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


async function sidebarText() {
  return evaluate(`
    (function() {
      const all = Array.from(document.querySelectorAll('div'));
      const sidebar = all.find(function(d) {
        const t = d.innerText || '';
        return t.includes('Recent Conversations') && t.includes('New Chat');
      });
      return sidebar ? sidebar.innerText : '';
    })()
  `);
}


async function sidebarRowCount() {
  return evaluate(`
    (function() {
      var all = Array.from(document.querySelectorAll('div'));
      var sidebar = all.find(function(d) {
        var t = d.innerText || '';
        return t.includes('Recent Conversations') && t.includes('New Chat');
      });
      return sidebar ? sidebar.querySelectorAll('.lucide-message-square').length : -1;
    })()
  `);
}


async function sidebarTitles() {
  return evaluate(`
    (function() {
      var all = Array.from(document.querySelectorAll('div'));
      var sidebar = all.find(function(d) {
        var t = d.innerText || '';
        return t.includes('Recent Conversations') && t.includes('New Chat');
      });
      if (!sidebar) return [];
      var out = [];
      var rows = sidebar.querySelectorAll('.lucide-message-square');
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i].closest('div.group') || rows[i].parentElement.parentElement;
        var p = row.querySelector('p');
        if (p) out.push((p.innerText || '').trim());
      }
      return out;
    })()
  `);
}





const requests = [];




let requestListenerAttached = false;

function captureRequests() {
  requests.length = 0;
  send('Network.enable');
  if (requestListenerAttached) return;
  requestListenerAttached = true;
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.method !== 'Network.requestWillBeSent') return;
    const { request } = msg.params;
    if (!request?.url) return;
    if (!request.url.includes('/chat')) return;
    let body = null;
    if (request.postData) {
      try { body = JSON.parse(request.postData); } catch { body = request.postData; }
    }
    requests.push({
      url: request.url,
      method: request.method,
      body,
      stack: msg.params.initiator?.stack?.callFrames?.slice(0, 8).map((f) => `${f.functionName || '(anon)'} ${(f.url || '').split('/').pop()}:${f.lineNumber}`),
    });
  });
}

function findRequests(predicate) {
  return requests.filter(predicate);
}





const db = new pg.Client({ connectionString: process.env.DB_URL });
await db.connect();

const stamp = Date.now();
const email = `dashui-${stamp}@e2e.local`;
const password = 'DashboardUI-2026!';

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


const createdChats = new Map();


function trackChat(title, id) {
    createdChats.set(id, title);
}


async function countChats() {
  const r = await db.query(
    'SELECT COUNT(*)::int c FROM chat_agent.chats WHERE user_id = $1',
    [userId],
  );
  return r.rows[0].c;
}


async function countMessages() {
  const r = await db.query(
    `SELECT COUNT(*)::int c
       FROM chat_agent.messages m
       JOIN chat_agent.chats c ON c.id = m.chat_id
      WHERE c.user_id = $1`,
    [userId],
  );
  return r.rows[0].c;
}


async function seedAssistantMessage(chatId, content) {
  await db.query(
    `INSERT INTO chat_agent.messages (id, chat_id, role, content, created_at)
     VALUES (gen_random_uuid(), $1, 'assistant', $2, now())`,
    [chatId, content],
  );
}





try {
  console.log(`\nDashboard UI E2E against ${BASE}`);

  const user = await createTestUser(email, password, db);
  token = user.token;
  userId = user.userId;
  ok(`test user created (${email})`);

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


  section('B. the dashboard renders with an empty sidebar');

  await navigate(`${BASE}/dashboard`);
  await waitFor(
    `document.body.innerText.includes('New Chat') && document.body.innerText.includes('Recent Conversations')`,
    'the dashboard',
  );
  ok('the dashboard renders');

  const emptyText = await evaluate(`
    (function() {
      const all = Array.from(document.querySelectorAll('div'));
      const sidebar = all.find(function(d) {
        const t = d.innerText || '';
        return t.includes('Recent Conversations') && t.includes('New Chat');
      });
      return sidebar ? sidebar.innerText : '';
    })()
  `);
  if (emptyText.includes('No conversations yet')) {
    ok('the empty sidebar state renders (no phantom rows yet)');
  } else {
    bad('the empty sidebar state renders', `sidebar shows: "${emptyText.slice(0, 200)}"`);
  }


  section('B2. the dashboard fetches the chat list ONCE');










  captureRequests();
  await navigate(`${BASE}/dashboard`);
  await waitFor(
    `document.body.innerText.includes('Recent Conversations')`,
    'the sidebar',
  );
  await sleep(1500);

  const listRequests = findRequests(
    (r) => r.method === 'GET' && /\/api\/v1\/chat(\?|$)/.test(r.url),
  );
  info(`chat list requests on load: ${listRequests.length}`);
  for (const r of listRequests) info(`  stack: ${JSON.stringify(r.stack)}`);

  if (listRequests.length === 1) {
    ok('the dashboard fetches the chat list exactly once');
  } else {
    bad(
      'the dashboard fetches the chat list exactly once',
      `${listRequests.length} GET /chat requests: ${JSON.stringify(listRequests.map((r) => r.url))}`,
    );
  }


  section('C. "New Chat" creates NO row in the database');





  const chatsBefore = await countChats();
  info(`chat rows before: ${chatsBefore}`);

  const clickedNew = await evaluate(`
    (function() {
      const btn = Array.from(document.querySelectorAll('button'))
        .find(e => (e.textContent || '').trim() === 'New Chat');
      if (!btn) return false;
      btn.click();
      return true;
    })()
  `);

  if (!clickedNew) {
    bad('the "New Chat" button exists and was clicked', 'no button found');
  } else {
    ok('the "New Chat" button was clicked');
    await sleep(1200);
  }

  const chatsAfter = await countChats();
  info(`chat rows after: ${chatsAfter}`);
  if (chatsAfter === chatsBefore) {
    ok('"New Chat" wrote no chat row (no phantom entry)');
  } else {
    bad('"New Chat" wrote no chat row', `grew ${chatsBefore} -> ${chatsAfter}`);
  }


  const newChatPosts = findRequests(
    (r) => r.method === 'POST' && /\/chat(\?|$)/.test(r.url.replace(API_BASE, '')),
  );
  if (newChatPosts.length === 0) {
    ok('"New Chat" issued no POST /chat request');
  } else {
    bad('"New Chat" issued no POST /chat request', `saw ${newChatPosts.length}`);
  }


  section('D. sending a message creates exactly one chat and one user message');

  requests.length = 0;

  const chatsBeforeSend = await countChats();
  const messagesBeforeSend = await countMessages();






  const openStreamStub = await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      (function() {
        const orig = window.fetch;
        window.fetch = function(input, init) {
          const url = typeof input === 'string' ? input : (input && input.url) || '';
          if (url.indexOf('/chat/') === -1 || url.indexOf('/message?stream=true') === -1) {
            return orig.call(window, input, init);
          }
          const encoder = new TextEncoder();







          return orig.call(window, input, init).then(function(res) {
            if (!res.ok || !res.body) return res;
            const stream = new ReadableStream({
              start(controller) {
                controller.enqueue(encoder.encode(
                  'event: token\\ndata: ' + JSON.stringify({ content: 'Still streaming.' }) + '\\n\\n'
                ));

              },
            });
            return new Response(stream, {
              status: res.status,
              statusText: res.statusText,
              headers: { 'Content-Type': 'text/event-stream' },
            });
          });
        };
      })();
`,
  });

  try {
    await navigate(`${BASE}/dashboard`);
    await waitFor(
      `document.body.innerText.includes('Recent Conversations')`,
      'the dashboard',
    );
    await sleep(600);

    await setInputValue('textarea', 'Hello there, this is the dashboard UI suite.');
    await sleep(300);
    await evaluate(`
      (function() {
        const ta = document.querySelector('textarea');
        if (!ta) return false;
        ta.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Enter', keyCode: 13, which: 13, bubbles: true,
        }));
        return true;
      })()
    `);


    await waitFor(
      `document.body.innerText.includes('dashboard UI suite')`,
      'the user message in the transcript',
      20000,
    );
    ok('the user message renders in the transcript');











    const gotIdWhileStreaming = await waitFor(
      `location.search.includes('id=')`,
      'the chat id in the URL',
      15000,
    ).then(() => true).catch(() => false);

    if (gotIdWhileStreaming) {
      ok('the URL carries the chat id WHILE the reply is still streaming');
    } else {
      bad(
        'the URL carries the chat id WHILE the reply is still streaming',
        `url: ${await evaluate('location.href')}`,
      );
    }

    const url = await evaluate('location.href');
    const chatId = (url.match(/[?&]id=([^&]+)/) || [])[1];
    if (chatId) ok(`the URL carries the new chat id (${chatId})`);
    else bad('the URL carries the new chat id', `url: ${url}`);


    if (chatId) trackChat('dashboard UI suite', chatId);

    const chatsAfterSend = await countChats();


    let messagesAfterSend = await countMessages();
    for (let i = 0; i < 20 && messagesAfterSend <= messagesBeforeSend; i++) {
      await sleep(250);
      messagesAfterSend = await countMessages();
    }
    info(`chat rows ${chatsBeforeSend} -> ${chatsAfterSend}, messages ${messagesBeforeSend} -> ${messagesAfterSend}`);

    if (chatsAfterSend === chatsBeforeSend + 1) {
      ok('sending a message created exactly one chat row');
    } else {
      bad('sending a message created exactly one chat row', `grew ${chatsBeforeSend} -> ${chatsAfterSend}`);
    }

    if (messagesAfterSend >= messagesBeforeSend + 1) {
      ok('the user message was persisted');
    } else {
      bad('the user message was persisted', `messages ${messagesBeforeSend} -> ${messagesAfterSend}`);
    }







    const sidebarNow = await sidebarText();
    info(`sidebar: ${JSON.stringify(sidebarNow.slice(0, 200))}`);

    if (!sidebarNow.includes('No conversations yet')) {
      ok('the new chat appears in the sidebar without waiting for the reply');
    } else {
      bad(
        'the new chat appears in the sidebar without waiting for the reply',
        'the sidebar still says "No conversations yet"',
      );
    }
  } finally {
    await send('Page.removeScriptToEvaluateOnNewDocument', {
      identifier: openStreamStub.identifier,
    });
  }


  section('D2. switching chats mid-stream does not leak the old reply');










  const leakStub = await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      (function() {
        const orig = window.fetch;
        window.fetch = function(input, init) {
          const url = typeof input === 'string' ? input : (input && input.url) || '';
          if (url.indexOf('/chat/') === -1 || url.indexOf('/message?stream=true') === -1) {
            return orig.call(window, input, init);
          }
          const encoder = new TextEncoder();
          return orig.call(window, input, init).then(function(res) {
            if (!res.ok || !res.body) return res;




            const signal = init && init.signal;
            const stream = new ReadableStream({
              start(controller) {
                controller.enqueue(encoder.encode(
                  'event: token\\ndata: ' + JSON.stringify({ content: 'LEAKED-STREAM-TEXT' }) + '\\n\\n'
                ));
                controller.enqueue(encoder.encode(
                  'event: thinking\\ndata: ' + JSON.stringify({ content: 'LEAKED-THINKING' }) + '\\n\\n'
                ));


                if (signal) {
                  signal.addEventListener('abort', function() {
                    try { controller.error(new DOMException('Aborted', 'AbortError')); } catch (_) {}
                  });
                }
              },
            });
            return new Response(stream, {
              status: res.status,
              statusText: res.statusText,
              headers: { 'Content-Type': 'text/event-stream' },
            });
          });
        };
      })();
`,
  });

  try {



    const otherChatId = (
      await db.query(
        `INSERT INTO chat_agent.chats (id, user_id, title, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, 'other chat', clock_timestamp(), clock_timestamp())
         RETURNING id`,
        [userId],
      )
    ).rows[0].id;
    trackChat('other chat', otherChatId);

    await navigate(`${BASE}/dashboard`);
    await waitFor(
      `document.body.innerText.includes('Recent Conversations')`,
      'the sidebar',
    );
    await sleep(600);


    await setInputValue('textarea', 'first chat message');
    await sleep(300);
    await evaluate(`
      (function() {
        const ta = document.querySelector('textarea');
        if (!ta) return false;
        ta.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Enter', keyCode: 13, which: 13, bubbles: true,
        }));
        return true;
      })()
    `);

    await waitFor(
      `document.body.innerText.includes('LEAKED-STREAM-TEXT')`,
      'the streaming reply in the first chat',
      20000,
    );
    ok('the first chat shows its own streaming reply');



    const firstUrl = await evaluate('location.href');
    const firstChatId = (firstUrl.match(/[?&]id=([^&]+)/) || [])[1];
    if (firstChatId) trackChat('first chat message', firstChatId);






    const clickedOther = await evaluate(`
      (function() {

        var titles = Array.prototype.slice.call(
          document.querySelectorAll('p')
        );
        for (var i = 0; i < titles.length; i++) {
          if ((titles[i].innerText || '').trim() !== 'other chat') continue;
          var row = titles[i].closest('div.group') || titles[i].parentElement;
          if (!row) continue;
          row.click();
          return true;
        }
        return false;
      })()
`);

    if (clickedOther) {
      ok('the other chat was clicked in the sidebar');
    } else {
      info('could not click the other chat row; navigating instead');
      await navigate(`${BASE}/dashboard?id=${otherChatId}`);
    }
    await sleep(2500);

    const leakProbe = await evaluate(`
      (function() {
        var body = document.body.innerText;
        return {
          leakedText: body.indexOf('LEAKED-STREAM-TEXT') !== -1,
          leakedThinking: body.indexOf('LEAKED-THINKING') !== -1,
          stillStreaming: body.indexOf('Thinking...') !== -1 ||
                         document.querySelectorAll('.animate-pulse').length > 0,
          url: location.href,
        };
      })()
    `);
    info(`leak probe: ${JSON.stringify(leakProbe)}`);

    if (!leakProbe.leakedText) {
      ok('the other chat does not show the previous chat\'s streaming reply');
    } else {
      bad(
        'the other chat does not show the previous chat\'s streaming reply',
        'LEAKED-STREAM-TEXT is visible in the other chat',
      );
    }

    if (!leakProbe.leakedThinking) {
      ok('the other chat does not show the previous chat\'s thinking logs');
    } else {
      bad(
        'the other chat does not show the previous chat\'s thinking logs',
        'LEAKED-THINKING is visible in the other chat',
      );
    }
  } finally {
    await send('Page.removeScriptToEvaluateOnNewDocument', {
      identifier: leakStub.identifier,
    });
  }


  section('D3. a failed turn keeps the user question in the transcript');

  {






















    const failedTurnChatId = (
      await db.query(
        `INSERT INTO chat_agent.chats (id, user_id, title, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, 'failed turn probe', clock_timestamp(), clock_timestamp())
         RETURNING id`,
        [userId],
      )
    ).rows[0].id;
    trackChat('failed turn probe', failedTurnChatId);

    const errorStub = await send('Page.addScriptToEvaluateOnNewDocument', {
      source: `
        (function() {
          const orig = window.fetch;
          window.fetch = function(input, init) {
            const url = typeof input === 'string' ? input : (input && input.url) || '';
            if (url.indexOf('/chat/') === -1 || url.indexOf('/message?stream=true') === -1) {
              return orig.call(window, input, init);
            }
            const encoder = new TextEncoder();
            return orig.call(window, input, init).then(function(res) {
              if (!res.ok || !res.body) return res;
              const stream = new ReadableStream({
                start(controller) {
                  controller.enqueue(encoder.encode(
                    'event: error\\ndata: ' + JSON.stringify({ content: 'stubbed stream failure' }) + '\\n\\n'
                  ));
                  controller.close();
                },
              });
              return new Response(stream, {
                status: res.status,
                statusText: res.statusText,
                headers: { 'Content-Type': 'text/event-stream' },
              });
            });
          };
        })();
      `,
    });

    try {
      await navigate(`${BASE}/dashboard?id=${failedTurnChatId}`);
      await waitFor(
        `document.body.innerText.includes('Recent Conversations')`,
        'the dashboard',
      );
      await sleep(600);

      const marker = 'a failed turn must keep this question';
      await setInputValue('textarea', marker);
      await sleep(300);










      await evaluate(`
        (function() {
          var btn = document.querySelector('button[type="submit"]');
          if (btn) { btn.click(); return true; }
          var form = document.querySelector('textarea') && document.querySelector('textarea').closest('form');
          if (form) { form.requestSubmit(); return true; }
          return false;
        })()
      `);


      await waitFor(
        `document.body.innerText.includes('Something went wrong')`,
        'the error banner',
        25000,
      );

      const text = await bodyText();
      const questionVisible = text.includes(marker);
      const errorShown = text.includes('Something went wrong');



      const persisted = await db.query(
        'SELECT COUNT(*)::int AS cnt FROM chat_agent.messages WHERE chat_id = $1 AND content = $2',
        [failedTurnChatId, marker],
      );
      if (persisted.rows[0].cnt === 1) {
        ok('the backend persisted the question of the failed turn');
      } else {
        bad(
          'the backend persisted the question of the failed turn',
          `found ${persisted.rows[0].cnt} matching rows`,
        );
      }

      if (errorShown) {
        ok('a failed turn shows an error banner');
      } else {
        bad('a failed turn shows an error banner', 'no error banner in the transcript');
      }

      if (questionVisible) {
        ok('a failed turn KEEPS the user question in the transcript');
      } else {
        bad(
          'a failed turn KEEPS the user question in the transcript',
          'the question was removed from the transcript even though the backend persisted it',
        );
      }

      await db.query('DELETE FROM chat_agent.chats WHERE id = $1', [failedTurnChatId]);

      createdChats.delete(failedTurnChatId);
    } finally {
      await send('Page.removeScriptToEvaluateOnNewDocument', {
        identifier: errorStub.identifier,
      });
    }
  }


  section('E. the sidebar renders a real date (no "Invalid Date")');







  await navigate(`${BASE}/dashboard`);
  await waitFor(
    `document.body.innerText.includes('Recent Conversations')`,
    'the sidebar',
  );
  await sleep(1200);

  const sideText = await sidebarText();
  info(`sidebar: ${JSON.stringify(sideText.slice(0, 200))}`);

  if (!/Invalid Date|NaN/.test(sideText)) {
    ok('the sidebar has no "Invalid Date" / "NaN"');
  } else {
    bad('the sidebar has no "Invalid Date" / "NaN"', sideText.slice(0, 200));
  }


  if (/\b[A-Z][a-z]{2}\s+\d{1,2}\b/.test(sideText)) {
    ok('the sidebar rows show a real calendar date');
  } else {
    bad('the sidebar rows show a real calendar date', sideText.slice(0, 200));
  }


  section('F. the sidebar keeps its depth after a turn');







  let seeded = 25;
  for (let i = 0; i < seeded; i++) {
    const title = `Seed chat ${i}`;
    const created = await api('POST', '/chat', { title });
    if (created.body?.id) trackChat(title, created.body.id);
  }
  info(`seeded ${seeded} chats`);

  await navigate(`${BASE}/dashboard`);
  await waitFor(
    `document.body.innerText.includes('Recent Conversations')`,
    'the sidebar',
  );
  await sleep(1200);

  const rowsOnLoad = await sidebarRowCount();
  info(`sidebar rows on load: ${rowsOnLoad}`);

  if (rowsOnLoad >= 20) {
    ok(`the first page shows ${rowsOnLoad} chats`);
  } else {
    bad('the first page shows 20 chats', `saw ${rowsOnLoad}`);
  }


  const loadMoreClicked = await evaluate(`
    (function() {
      const btn = Array.from(document.querySelectorAll('button'))
        .find(e => (e.textContent || '').trim() === 'Load more');
      if (!btn) return false;
      btn.click();
      return true;
    })()
  `);

  let rowsAfterLoadMore = rowsOnLoad;
  if (loadMoreClicked) {
    ok('the "Load more" button was clicked');
    await sleep(2000);
    rowsAfterLoadMore = await sidebarRowCount();
    info(`sidebar rows after "Load more": ${rowsAfterLoadMore}`);
  }

  if (rowsAfterLoadMore > rowsOnLoad) {
    ok(`"Load more" appended rows (${rowsOnLoad} -> ${rowsAfterLoadMore})`);
  } else {
    bad('"Load more" appended rows', `stayed at ${rowsAfterLoadMore}`);
  }









  const clickedChat = await evaluate(`
    (function() {
      const all = Array.from(document.querySelectorAll('div'));
      const sidebar = all.find(function(d) {
        const t = d.innerText || '';
        return t.includes('Recent Conversations') && t.includes('New Chat');
      });
      if (!sidebar) return false;
      const rows = Array.from(sidebar.querySelectorAll('.lucide-message-square'));
      if (!rows.length) return false;
      const row = rows[0].closest('div.group') || rows[0].parentElement.parentElement;
      row.click();
      return true;
    })()
  `);

  if (!clickedChat) {
    bad('the sidebar kept its depth after a refetch', 'no chat row to click');
  } else {
    ok('a chat in the sidebar was clicked (this triggers the refetch)');
    await sleep(3000);

    const rowsAfterRefetch = await sidebarRowCount();
    info(`sidebar rows after the refetch: ${rowsAfterRefetch}`);

    if (rowsAfterRefetch >= rowsAfterLoadMore) {
      ok(`the sidebar kept its depth after the refetch (${rowsAfterLoadMore} -> ${rowsAfterRefetch})`);
    } else {
      bad(
        'the sidebar kept its depth after the refetch',
        `collapsed ${rowsAfterLoadMore} -> ${rowsAfterRefetch}`,
      );
    }









    const titles = await sidebarTitles();
    const seen = new Set();
    const dupes = [];
    for (const t of titles) {
      if (seen.has(t)) dupes.push(t);
      seen.add(t);
    }
    if (dupes.length === 0) {
      ok('the sidebar shows no duplicated chat after the refetch');
    } else {
      bad(
        'the sidebar shows no duplicated chat after the refetch',
        `${dupes.length} duplicated row(s): ${[...new Set(dupes)].slice(0, 5).join(', ')}`,
      );
    }
  }


  section('F2. a chat that jumps to the top is not listed twice');

  {














    const movedTitle = 'moves to the top';
    const movedChatId = (
      await db.query(
        `INSERT INTO chat_agent.chats (id, user_id, title, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, clock_timestamp(),
                 clock_timestamp() - interval '1 day')
         RETURNING id`,
        [userId, movedTitle],
      )
    ).rows[0].id;
    trackChat(movedTitle, movedChatId);

    try {

      await navigate(`${BASE}/dashboard`);
      await waitFor(
        `document.body.innerText.includes('Recent Conversations')`,
        'the sidebar',
      );
      await sleep(1200);

      const loadMoreClicked = await evaluate(`
        (function() {
          var btn = Array.from(document.querySelectorAll('button'))
            .find(e => (e.textContent || '').trim() === 'Load more');
          if (!btn) return false;
          btn.click();
          return true;
        })()
      `);
      if (loadMoreClicked) await sleep(2000);

      const titlesBefore = await sidebarTitles();
      const appearedBefore = titlesBefore.filter((t) => t === movedTitle).length;
      info(`"${movedTitle}" appears ${appearedBefore} time(s) before the move`);



      await db.query(
        `UPDATE chat_agent.chats SET updated_at = clock_timestamp() WHERE id = $1`,
        [movedChatId],
      );

      await evaluate(`
        (function() {
          var all = Array.from(document.querySelectorAll('div'));
          var sidebar = all.find(function(d) {
            var t = d.innerText || '';
            return t.includes('Recent Conversations') && t.includes('New Chat');
          });
          if (!sidebar) return false;
          var rows = sidebar.querySelectorAll('.lucide-message-square');
          if (!rows.length) return false;
          var row = rows[0].closest('div.group') || rows[0].parentElement.parentElement;
          row.click();
          return true;
        })()
      `);
      await sleep(3000);

      const titlesAfter = await sidebarTitles();
      const appearedAfter = titlesAfter.filter((t) => t === movedTitle).length;
      info(`"${movedTitle}" appears ${appearedAfter} time(s) after the move`);

      if (appearedAfter <= 1) {
        ok('a chat that jumped to the top is listed exactly once');
      } else {
        bad(
          'a chat that jumped to the top is listed exactly once',
          `"${movedTitle}" is rendered ${appearedAfter} times`,
        );
      }
    } finally {
      await db.query('DELETE FROM chat_agent.chats WHERE id = $1', [movedChatId]);

      createdChats.delete(movedChatId);
    }
  }


  section('F3. "Load more" clicked twice does not duplicate rows');

  {










    await navigate(`${BASE}/dashboard`);
    await waitFor(
      `document.body.innerText.includes('Recent Conversations')`,
      'the sidebar',
    );
    await sleep(1200);

    const rowsOnLoad = await sidebarRowCount();
    info(`sidebar rows on load: ${rowsOnLoad}`);

    const doubleClicked = await evaluate(`
      (function() {
        var btn = Array.from(document.querySelectorAll('button'))
          .find(e => (e.textContent || '').trim() === 'Load more');
        if (!btn) return false;



        btn.click();
        btn.click();
        return true;
      })()
`);

    if (!doubleClicked) {
      bad('the "Load more" button was double-clicked', 'no "Load more" button');
    } else {
      ok('the "Load more" button was double-clicked in one frame');
      await sleep(3000);

      const rowsAfter = await sidebarRowCount();
      const titlesAfter = await sidebarTitles();
      const seen = new Set();
      const dupes = [];
      for (const t of titlesAfter) {
        if (seen.has(t)) dupes.push(t);
        seen.add(t);
      }

      info(`sidebar rows after the double click: ${rowsAfter}`);

      if (dupes.length === 0) {
        ok('the double-clicked "Load more" did not duplicate any row');
      } else {
        bad(
          'the double-clicked "Load more" did not duplicate any row',
          `${dupes.length} duplicated row(s): ${[...new Set(dupes)].slice(0, 5).join(', ')}`,
        );
      }
    }
  }


  section('G. the "Thinking Process" panel renders');








  const thinkingStub = await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      (function() {
        const orig = window.fetch;
        window.fetch = function(input, init) {
          const url = typeof input === 'string' ? input : (input && input.url) || '';
          if (url.indexOf('/chat/') === -1 || url.indexOf('/message?stream=true') === -1) {
            return orig.call(window, input, init);
          }











          const encoder = new TextEncoder();
          const thinkingFrame =
            'event: thinking\\ndata: ' + JSON.stringify({ content: 'Planning the answer' }) + '\\n\\n';
          const doneFrames =
            'event: token\\ndata: ' + JSON.stringify({ content: 'Hello from the stub.' }) + '\\n\\n' +
            'event: end\\ndata: ' + JSON.stringify({ content: '' }) + '\\n\\n';
          let controllerRef = null;
          const stream = new ReadableStream({
            start(controller) {
              controllerRef = controller;
              controller.enqueue(encoder.encode(thinkingFrame));


              const timer = setInterval(function() {
                if (!window.__finishStub) return;
                clearInterval(timer);
                try {
                  controller.enqueue(encoder.encode(doneFrames));
                  controller.close();
                } catch (_) {  }
              }, 100);
            },
          });
          return Promise.resolve(new Response(stream, {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream' },
          }));
        };
      })();
`,
  });

  try {
    await navigate(`${BASE}/dashboard`);
    await waitFor(
      `document.body.innerText.includes('Recent Conversations')`,
      'the sidebar',
    );
    await sleep(800);

    await setInputValue('textarea', 'Trigger the thinking panel.');
    await sleep(300);
    await evaluate(`
      (function() {
        const ta = document.querySelector('textarea');
        if (!ta) return false;
        ta.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Enter', keyCode: 13, which: 13, bubbles: true,
        }));
        return true;
      })()
    `);

    const sawThinking = await waitFor(
      `document.body.innerText.includes('Thinking Process')`,
      'the "Thinking Process" panel',
      20000,
    ).then(() => true).catch(() => false);

    if (sawThinking) {
      ok('the "Thinking Process" panel renders during streaming');
    } else {
      bad('the "Thinking Process" panel renders during streaming', 'the panel never appeared');
    }

    const sawLog = await evaluate(
      `document.body.innerText.includes('Planning the answer')`,
    );
    if (sawLog) ok('the thinking log text is rendered');
    else bad('the thinking log text is rendered', 'the log content was not shown');


    await evaluate(`window.__finishStub = true;`);
    await sleep(1500);

    const sawReply = await waitFor(
      `document.body.innerText.includes('Hello from the stub.')`,
      'the assistant reply',
      20000,
    ).then(() => true).catch(() => false);
    if (sawReply) ok('the assistant reply renders');
    else bad('the assistant reply renders', 'the reply never appeared');




    const thinkingUrl = await evaluate('location.href');
    const thinkingChatId = (thinkingUrl.match(/[?&]id=([^&]+)/) || [])[1];
    if (thinkingChatId) trackChat('thinking panel', thinkingChatId);
  } finally {
    await send('Page.removeScriptToEvaluateOnNewDocument', {
      identifier: thinkingStub.identifier,
    });
  }


  section('H. the content viewer builds a real /contents URL');



  const viewerUrl = await evaluate(`
    (function() {
      const proto = window.__learnaiContentViewerProbe;
      return proto ? 'available' : 'absent';
    })()
  `);




  const contentRequests = [];
  const onMsg = (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.method !== 'Network.requestWillBeSent') return;
    const u = msg.params.request?.url || '';
    if (u.includes('/contents/')) contentRequests.push(u);
  };
  ws.on('message', onMsg);

  try {






    const srcChat = await api('POST', '/chat', { title: 'Citation chat' });
    if (srcChat.body?.id) trackChat('Citation chat', srcChat.body.id);
    await seedAssistantMessage(
      srcChat.body.id,
      'Here is the source [Source: notes.md, Chapter 1|' +
        'http://localhost:8000/contents/CS101/theory/notes.md]',
    );

    await navigate(`${BASE}/dashboard?id=${srcChat.body.id}`);
    await waitFor(
      `document.body.innerText.includes('notes.md')`,
      'the source citation badge',
      20000,
    ).catch(() => {});
    await sleep(800);

    const hasBadge = await evaluate(
      `document.body.innerText.includes('notes.md')`,
    );
    if (hasBadge) ok('the source citation renders');
    else {
      bad('the source citation renders', 'the badge never appeared');
      info(`viewer probe: ${viewerUrl}`);
    }


    await evaluate(`
      (function() {
        const btn = Array.from(document.querySelectorAll('button'))
          .find(b => (b.textContent || '').includes('notes.md'));
        if (!btn) return false;
        btn.click();
        return true;
      })()
    `);
    await sleep(800);

    const viewClicked = await evaluate(`
      (function() {
        const btn = Array.from(document.querySelectorAll('button'))
          .find(b => (b.textContent || '').trim() === 'View Full Source');
        if (!btn) return false;
        btn.click();
        return true;
      })()
    `);

    if (!viewClicked) {
      info('"View Full Source" was not reachable in this run (no fileUrl on the citation)');
    } else {
      ok('"View Full Source" was clicked');
      await sleep(2500);

      const contentHits = contentRequests.filter((u) => u.includes('/contents/'));
      if (contentHits.length > 0) {
        ok(`the viewer requested ${contentHits.length} /contents URL(s)`);
        const badUrl = contentHits.find((u) => u.includes('/contents/generated/'));
        if (!badUrl) ok('the requested URL has no "generated/" segment');
        else bad('the requested URL has no "generated/" segment', badUrl);
      } else {


        info('no /contents request was observed (the material file may not exist)');
      }
    }
  } finally {
    ws.off('message', onMsg);
  }


  section('I. the deployed frontend builds the real /contents URL');








  const { readFileSync, existsSync } = await import('node:fs');
  const { join } = await import('node:path');

  const viewerSource = join(
    process.cwd(),
    '..',
    'frontend',
    'src',
    'components',
    'chat',
    'content-viewer-modal.tsx',
  );

  if (!existsSync(viewerSource)) {
    bad('the deployed frontend builds the real /contents URL', `source not found at ${viewerSource}`);
  } else {
    const src = readFileSync(viewerSource, 'utf8');


    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .join('\n');

    const usesContentsRoot = /\/contents\/\$\{relative\}/.test(code);
    const usesGeneratedDir = /contents\/generated|\/generated\/|\$\{rootBase\}\/generated/.test(code);

    if (usesContentsRoot && !usesGeneratedDir) {
      ok('the content viewer resolves against the real /contents root');
    } else {
      bad(
        'the content viewer resolves against the real /contents root',
        `usesContentsRoot=${usesContentsRoot} usesGeneratedDir=${usesGeneratedDir}`,
      );
    }
  }


  section('J. the sidebar shows no phantom rows after everything');

  const finalChats = await countChats();






  const expectedChats = createdChats.size;
  info(`chat rows at the end: ${finalChats} (expected ${expectedChats})`);

  if (finalChats === expectedChats) {
    ok(`the database holds no phantom rows (${finalChats} chats)`);
  } else {




    const unregistered = await db.query(
      `SELECT id, title FROM chat_agent.chats
       WHERE user_id = $1 AND NOT (id = ANY($2::uuid[]))`,
      [userId, [...createdChats.keys()]],
    );
    const present = await db.query(
      'SELECT id FROM chat_agent.chats WHERE user_id = $1',
      [userId],
    );
    const presentIds = new Set(present.rows.map((r) => r.id));
    const missing = [...createdChats.entries()]
      .filter(([id]) => !presentIds.has(id))
      .map(([id, title]) => `${title} (${id})`);

    bad(
      'the database holds no phantom rows',
      `${finalChats} chats but only ${expectedChats} were created on purpose` +
        (unregistered.rows.length
          ? `; unregistered (phantom): ${unregistered.rows.map((r) => `${r.title} (${r.id})`).join(', ')}`
          : '') +
        (missing.length
          ? `; tracked but never created: ${missing.join(', ')}`
          : ''),
    );
  }


  section('K. a message typed during a chat switch stays in the NEW chat');








  {

    const chatAId = (
      await db.query(
        `INSERT INTO chat_agent.chats (id, user_id, title, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, 'switch target A', clock_timestamp(),
                 clock_timestamp())
         RETURNING id`,
        [userId],
      )
    ).rows[0].id;
    trackChat('switch target A', chatAId);

    const chatBId = (
      await db.query(
        `INSERT INTO chat_agent.chats (id, user_id, title, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, 'switch target B', clock_timestamp(),
                 clock_timestamp() - interval '1 minute')
         RETURNING id`,
        [userId],
      )
    ).rows[0].id;
    trackChat('switch target B', chatBId);

    await db.query(
      `INSERT INTO chat_agent.messages (id, chat_id, role, content, created_at)
       VALUES (gen_random_uuid(), $1, 'user', $2, clock_timestamp())`,
      [chatAId, 'message that belongs to A'],
    );
    await db.query(
      `INSERT INTO chat_agent.messages (id, chat_id, role, content, created_at)
       VALUES (gen_random_uuid(), $1, 'user', $2, clock_timestamp())`,
      [chatBId, 'message that belongs to B'],
    );

    try {


      await navigate(`${BASE}/dashboard?id=${chatAId}`);
      await waitFor(
        `document.body.innerText.includes('message that belongs to A')`,
        "chat A's transcript",
        20000,
      );




      const slowGet = await send('Page.addScriptToEvaluateOnNewDocument', {
        source: `
          (function() {
            var orig = window.fetch;
            window.fetch = function(input, init) {
              var url = typeof input === 'string' ? input : (input && input.url) || '';
              var isChatDetail = /\\/chat\\/[0-9a-f-]{36}$/.test(url);
              if (!isChatDetail) return orig.call(window, input, init);
              return new Promise(function(resolve) {
                setTimeout(function() {
                  orig.call(window, input, init).then(resolve, resolve);
                }, 2500);
              });
            };
          })();
        `,
      });

      try {


        await evaluate(`window.location.href = ${JSON.stringify(`${BASE}/dashboard?id=${chatBId}`)};`);







        let typed = { ok: false, reason: 'never observed' };
        for (let i = 0; i < 40; i++) {
          await sleep(200);
          typed = await evaluate(`
            (function() {
              var ta = document.querySelector('textarea');
              if (!ta) return { ok: false, reason: 'no textarea' };
              var proto = window.HTMLTextAreaElement.prototype;
              var setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
              setter.call(ta, 'typed during the switch');
              ta.dispatchEvent(new Event('input', { bubbles: true }));
              return {
                ok: true,
                disabled: ta.disabled,
                placeholder: ta.getAttribute('placeholder'),
              };
            })()
          `).catch((e) => ({ ok: false, reason: e.message }));



          if (typed.ok && typed.disabled === true) break;
        }
        info(`input state during the switch: ${JSON.stringify(typed)}`);


        if (typed.ok && typed.disabled === true) {
          ok('the input is disabled while the new conversation loads');
        } else {
          bad(
            'the input is disabled while the new conversation loads',
            `disabled=${typed.ok ? typed.disabled : typed.reason}`,
          );
        }



        await evaluate(`
          (function() {
            var ta = document.querySelector('textarea');
            if (!ta) return false;
            ta.dispatchEvent(new KeyboardEvent('keydown', {
              key: 'Enter', keyCode: 13, which: 13, bubbles: true,
            }));
            return true;
          })()
        `);
        await sleep(1500);


        const landed = await db.query(
          `SELECT m.chat_id, m.content FROM chat_agent.messages m
             JOIN chat_agent.chats c ON c.id = m.chat_id
            WHERE c.user_id = $1 AND m.content LIKE 'typed during the switch%'`,
          [userId],
        );

        if (landed.rows.length === 0) {
          ok('a send during the switch wrote nothing');
        } else {
          bad(
            'a send during the switch wrote nothing',
            `${landed.rows.length} row(s) landed in ${
              landed.rows[0].chat_id === chatAId ? 'chat A (the OLD chat)' : 'chat B'
            }`,
          );
        }


        const inA = await db.query(
          `SELECT COUNT(*)::int c FROM chat_agent.messages
            WHERE chat_id = $1 AND content LIKE 'typed during the switch%'`,
          [chatAId],
        );
        if (inA.rows[0].c === 0) {
          ok('the question did NOT land in the previously open chat');
        } else {
          bad('the question did NOT land in the previously open chat', `${inA.rows[0].c} row(s)`);
        }
      } finally {
        await send('Page.removeScriptToEvaluateOnNewDocument', {
          identifier: slowGet.identifier,
        });
      }
    } finally {
      await db.query('DELETE FROM chat_agent.chats WHERE id = ANY($1::uuid[])', [
        [chatAId, chatBId],
      ]);
      createdChats.delete(chatAId);
      createdChats.delete(chatBId);
    }
  }


  section('L. deleting the OPEN chat leaves the dashboard usable');





  {
    const doomedId = (
      await db.query(
        `INSERT INTO chat_agent.chats (id, user_id, title, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, 'doomed chat', clock_timestamp(), clock_timestamp())
         RETURNING id`,
        [userId],
      )
    ).rows[0].id;
    trackChat('doomed chat', doomedId);

    await db.query(
      `INSERT INTO chat_agent.messages (id, chat_id, role, content, created_at)
       VALUES (gen_random_uuid(), $1, 'user', $2, clock_timestamp())`,
      [doomedId, 'this message will be deleted with its chat'],
    );

    try {
      await navigate(`${BASE}/dashboard?id=${doomedId}`);
      await waitFor(
        `document.body.innerText.includes('this message will be deleted')`,
        "the doomed chat's transcript",
        20000,
      );









      const deleted = await evaluate(`
        (function() {
          var titles = Array.prototype.slice.call(document.querySelectorAll('p'));
          for (var i = 0; i < titles.length; i++) {
            if ((titles[i].innerText || '').trim() !== 'doomed chat') continue;
            var row = titles[i].closest('div.group') || titles[i].parentElement;
            if (!row) continue;
            var btns = row.querySelectorAll('button');
            if (!btns.length) return { ok: false, reason: 'no menu button' };

            var btn = btns[btns.length - 1];
            btn.setAttribute('data-doomed-trigger', '1');
            var opts = { bubbles: true, cancelable: true, button: 0, buttons: 1, view: window };
            btn.dispatchEvent(new PointerEvent('pointerdown', opts));
            btn.dispatchEvent(new PointerEvent('pointerup', opts));
            btn.dispatchEvent(new MouseEvent('click', opts));
            return { ok: true, label: btn.getAttribute('aria-label') };
          }
          return { ok: false, reason: 'row not found' };
        })()
`);
      if (!deleted.ok) {
        bad('the doomed chat could be opened in the sidebar', deleted.reason);
      } else {


        let confirmed = false;
        for (let i = 0; i < 25; i++) {
          await sleep(200);
          confirmed = await evaluate(`
            (function() {
              var items = Array.prototype.slice.call(document.querySelectorAll('[role="menuitem"]'));
              for (var i = 0; i < items.length; i++) {
                if ((items[i].innerText || '').trim().indexOf('Delete') !== -1) {
                  items[i].click();
                  return true;
                }
              }
              return false;
            })()
          `).catch(() => false);
          if (confirmed) break;
        }
        if (!confirmed) {
          bad('the "Delete" action could be reached', 'no Delete menu item');
        } else {
          ok('the "Delete" action was clicked');
          await sleep(2500);


          const after = await evaluate('location.href');
          if (!after.includes(doomedId)) {
            ok('the dashboard navigated away from the deleted chat');
          } else {
            bad('the dashboard navigated away from the deleted chat', after);
          }


          await setInputValue('textarea', 'a message after the delete');
          await sleep(300);
          await evaluate(`
            (function() {
              var ta = document.querySelector('textarea');
              if (!ta) return false;
              ta.dispatchEvent(new KeyboardEvent('keydown', {
                key: 'Enter', keyCode: 13, which: 13, bubbles: true,
              }));
              return true;
            })()
          `);
          await sleep(2500);

          const bodyNow = await bodyText();
          if (!bodyNow.includes('Chat not found')) {
            ok('a message after the delete does not fail with "Chat not found"');
          } else {
            bad('a message after the delete does not fail with "Chat not found"', 'the error banner showed');
          }
        }
      }
    } finally {
      await db.query('DELETE FROM chat_agent.chats WHERE id = $1', [doomedId]);
      createdChats.delete(doomedId);
    }
  }


  section('M. the "Retry" button actually retries');





  {

    const failOnceStub = await send('Page.addScriptToEvaluateOnNewDocument', {
      source: `
        (function() {
          var orig = window.fetch;
          window.__failedOnce = false;
          window.fetch = function(input, init) {
            var url = typeof input === 'string' ? input : (input && input.url) || '';
            var isChatDetail = /\\/chat\\/[0-9a-f-]{36}$/.test(url);
            if (isChatDetail && !window.__failedOnce) {
              window.__failedOnce = true;
              return Promise.resolve(new Response(
                JSON.stringify({ detail: 'simulated load failure' }),
                { status: 500, headers: { 'Content-Type': 'application/json' } }
              ));
            }
            return orig.call(window, input, init);
          };
        })();
      `,
    });

    const retryChatId = (
      await db.query(
        `INSERT INTO chat_agent.chats (id, user_id, title, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, 'retry chat', clock_timestamp(), clock_timestamp())
         RETURNING id`,
        [userId],
      )
    ).rows[0].id;
    trackChat('retry chat', retryChatId);

    try {
      await db.query(
        `INSERT INTO chat_agent.messages (id, chat_id, role, content, created_at)
         VALUES (gen_random_uuid(), $1, 'user', $2, clock_timestamp())`,
        [retryChatId, 'the transcript that must come back'],
      );

      await navigate(`${BASE}/dashboard?id=${retryChatId}`);
      await waitFor(
        `document.body.innerText.includes('Something went wrong')`,
        'the error banner',
        20000,
      ).catch(() => {});
      await sleep(800);

      const beforeRetry = await bodyText();
      if (beforeRetry.includes('Something went wrong')) {
        ok('a failed load shows the error banner');
      } else {
        bad('a failed load shows the error banner', 'no banner');
      }

      const hadTranscript = beforeRetry.includes('the transcript that must come back');
      if (!hadTranscript) {
        ok('the failed load left the transcript empty');
      } else {
        bad('the failed load left the transcript empty', 'the transcript was already there');
      }


      const clicked = await evaluate(`
        (function() {
          var btns = Array.prototype.slice.call(document.querySelectorAll('button'));
          for (var i = 0; i < btns.length; i++) {
            if ((btns[i].innerText || '').trim() === 'Retry') {
              btns[i].click();
              return true;
            }
          }
          return false;
        })()
      `);
      if (!clicked) {
        bad('the "Retry" button was clicked', 'no Retry button found');
      } else {
        ok('the "Retry" button was clicked');
        await sleep(2500);

        const afterRetry = await bodyText();
        if (afterRetry.includes('the transcript that must come back')) {
          ok('"Retry" actually re-issued the load (the transcript came back)');
        } else {
          bad(
            '"Retry" actually re-issued the load (the transcript came back)',
            'the transcript is still missing — the button only dismissed the banner',
          );
        }
      }
    } finally {
      await send('Page.removeScriptToEvaluateOnNewDocument', {
        identifier: failOnceStub.identifier,
      });
      await db.query('DELETE FROM chat_agent.chats WHERE id = $1', [retryChatId]);
      createdChats.delete(retryChatId);
    }
  }


  section('N. a tool call renders as a label, not as raw JSON');








  {
    const toolStub = await send('Page.addScriptToEvaluateOnNewDocument', {
      source: `
        (function() {
          var orig = window.fetch;
          window.fetch = function(input, init) {
            var url = typeof input === 'string' ? input : (input && input.url) || '';
            if (url.indexOf('/chat/') === -1 || url.indexOf('/message?stream=true') === -1) {
              return orig.call(window, input, init);
            }
            var encoder = new TextEncoder();
            var toolFrame =
              'event: tool_call\\ndata: ' +
              JSON.stringify({ content: JSON.stringify({ name: 'semantic_search', input: { query: 'recursion' } }) }) +
              '\\n\\n';
            var tokenFrames =
              'event: token\\ndata: ' + JSON.stringify({ content: 'The answer is 42.' }) + '\\n\\n' +
              'event: token\\ndata: ' + JSON.stringify({ content: ' (recursion unwinds).' }) + '\\n\\n' +
              'event: end\\ndata: ' + JSON.stringify({ content: '' }) + '\\n\\n';
            var stream = new ReadableStream({
              start(controller) {
                controller.enqueue(encoder.encode(toolFrame));
                controller.enqueue(encoder.encode(tokenFrames));
                controller.close();
              },
            });
            return Promise.resolve(new Response(stream, {
              status: 200,
              headers: { 'Content-Type': 'text/event-stream' },
            }));
          };
        })();
      `,
    });

    try {
      await navigate(`${BASE}/dashboard`);
      await waitFor(
        `document.body.innerText.includes('Recent Conversations')`,
        'the sidebar',
      );
      await sleep(800);

      await setInputValue('textarea', 'ask something that needs a tool');
      await sleep(300);
      await evaluate(`
        (function() {
          var ta = document.querySelector('textarea');
          if (!ta) return false;
          ta.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Enter', keyCode: 13, which: 13, bubbles: true,
          }));
          return true;
        })()
      `);

      await waitFor(
        `document.body.innerText.includes('The answer is 42.')`,
        'the assistant reply',
        20000,
      ).catch(() => {});
      await sleep(1500);

      const toolText = await bodyText();

      if (!toolText.includes('{"name"') && !toolText.includes('"semantic_search"')) {
        ok('the raw tool-call JSON never reaches the transcript');
      } else {
        bad(
          'the raw tool-call JSON never reaches the transcript',
          'the page shows the raw JSON payload',
        );
      }

      if (toolText.includes('semantic_search')) {
        ok('the tool call is shown as a readable label');
      } else {
        bad('the tool call is shown as a readable label', 'the tool name is not shown');
      }



      if (toolText.includes('semantic_search') && toolText.includes('The answer is 42.')) {
        ok('the tool-call label survives the tokens that follow it');
      } else {
        bad(
          'the tool-call label survives the tokens that follow it',
          'the label flickered out when the next token arrived',
        );
      }
    } finally {
      await send('Page.removeScriptToEvaluateOnNewDocument', {
        identifier: toolStub.identifier,
      });
    }
  }


  section('O. the sidebar reports a failed list load instead of "No conversations yet"');





  {
    const listFailStub = await send('Page.addScriptToEvaluateOnNewDocument', {
      source: `
        (function() {
          var orig = window.fetch;
          window.fetch = function(input, init) {
            var url = typeof input === 'string' ? input : (input && input.url) || '';
            var isList = /\\/chat\\?/.test(url);
            if (!isList) return orig.call(window, input, init);
            return Promise.resolve(new Response(
              JSON.stringify({ detail: 'simulated list failure' }),
              { status: 500, headers: { 'Content-Type': 'application/json' } }
            ));
          };
        })();
      `,
    });

    try {
      await navigate(`${BASE}/dashboard`);
      await sleep(2500);

      const listText = await sidebarText();
      info(`sidebar after the list failure: ${JSON.stringify(listText.slice(0, 200))}`);

      if (listText.includes('No conversations yet')) {
        bad(
          'a failed list load does NOT say "No conversations yet"',
          'the sidebar claims there are no conversations',
        );
      } else {
        ok('a failed list load does NOT say "No conversations yet"');
      }

      if (/could not load conversations/i.test(listText)) {
        ok('the sidebar explains that the list failed to load');
      } else {
        bad('the sidebar explains that the list failed to load', 'no error shown in the sidebar');
      }
    } finally {
      await send('Page.removeScriptToEvaluateOnNewDocument', {
        identifier: listFailStub.identifier,
      });
    }
  }


  section('R. a failed send does not destroy the question');












  {


    const notFoundStub = await send('Page.addScriptToEvaluateOnNewDocument', {
      source: `
        (function() {
          var orig = window.fetch;
          window.__sentBodies = [];
          window.fetch = function(input, init) {
            var url = typeof input === 'string' ? input : (input && input.url) || '';
            if (url.indexOf('/message?stream=true') === -1) {
              return orig.call(window, input, init);
            }
            if (init && init.body) {
              try { window.__sentBodies.push(init.body); } catch (e) {}
            }
            return Promise.resolve(new Response(
              JSON.stringify({ detail: 'Chat not found' }),
              { status: 404, headers: { 'Content-Type': 'application/json' } }
            ));
          };
        })();
      `,
    });

    try {
      await navigate(`${BASE}/dashboard`);
      await waitFor(
        `document.body.innerText.includes('Recent Conversations')`,
        'the sidebar',
      );
      await sleep(800);


      await setInputValue('textarea', 'the question that must survive');
      await sleep(300);
      await evaluate(`
        (function() {
          var ta = document.querySelector('textarea');
          ta.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Enter', keyCode: 13, which: 13, bubbles: true,
          }));
          return true;
        })()
      `);
      await sleep(2500);


      const restored = await evaluate(`
        (function() {
          var ta = document.querySelector('textarea');
          return ta ? ta.value : '(no textarea)';
        })()
      `);
      if (restored.includes('the question that must survive')) {
        ok('a failed send puts the question back into the input box');
      } else {
        bad(
          'a failed send puts the question back into the input box',
          `the box holds ${JSON.stringify(restored)}`,
        );
      }



      const beforeRetry = await evaluate('(window.__sentBodies || []).length');
      await evaluate(`
        (function() {
          var btns = Array.prototype.slice.call(document.querySelectorAll('button'));
          for (var i = 0; i < btns.length; i++) {
            if ((btns[i].innerText || '').trim() === 'Retry') { btns[i].click(); return true; }
          }
          return false;
        })()
      `);
      await sleep(2500);

      const afterRetry = await evaluate('(window.__sentBodies || []).length');
      if (afterRetry > beforeRetry) {
        ok('"Retry" re-sends the failed message');
      } else {
        bad(
          '"Retry" re-sends the failed message',
          `no new request was issued (${beforeRetry} -> ${afterRetry})`,
        );
      }







      const lastBody = await evaluate(`
        (function() {
          var b = window.__sentBodies || [];
          return b.length ? b[b.length - 1] : '(none)';
        })()
      `);
      if (lastBody.includes('the question that must survive')) {
        ok('the re-sent message carries the original question');
      } else {
        bad(
          'the re-sent message carries the original question',
          `the last body was ${JSON.stringify(lastBody)}`,
        );
      }
    } finally {
      await send('Page.removeScriptToEvaluateOnNewDocument', {
        identifier: notFoundStub.identifier,
      });
    }
  }


  section('S. a failed send whose outcome is unknown is NOT re-sent');









  {
    const serverErrorStub = await send('Page.addScriptToEvaluateOnNewDocument', {
      source: `
        (function() {
          var orig = window.fetch;
          window.__sentBodies = [];
          window.fetch = function(input, init) {
            var url = typeof input === 'string' ? input : (input && input.url) || '';
            if (url.indexOf('/message?stream=true') === -1) {
              return orig.call(window, input, init);
            }
            if (init && init.body) {
              try { window.__sentBodies.push(init.body); } catch (e) {}
            }
            return Promise.resolve(new Response(
              JSON.stringify({ detail: 'simulated backend failure' }),
              { status: 500, headers: { 'Content-Type': 'application/json' } }
            ));
          };
        })();
      `,
    });

    try {
      await navigate(`${BASE}/dashboard`);
      await waitFor(
        `document.body.innerText.includes('Recent Conversations')`,
        'the sidebar',
      );
      await sleep(800);

      await setInputValue('textarea', 'a question with an unknown outcome');
      await sleep(300);
      await evaluate(`
        (function() {
          var ta = document.querySelector('textarea');
          ta.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Enter', keyCode: 13, which: 13, bubbles: true,
          }));
          return true;
        })()
      `);
      await sleep(2500);



      const restored = await evaluate(`
        (function() {
          var ta = document.querySelector('textarea');
          return ta ? ta.value : '(no textarea)';
        })()
      `);
      if (restored.includes('a question with an unknown outcome')) {
        ok('a failed send with an unknown outcome still keeps the question');
      } else {
        bad(
          'a failed send with an unknown outcome still keeps the question',
          `the box holds ${JSON.stringify(restored)}`,
        );
      }

      const beforeRetry = await evaluate('(window.__sentBodies || []).length');
      await evaluate(`
        (function() {
          var btns = Array.prototype.slice.call(document.querySelectorAll('button'));
          for (var i = 0; i < btns.length; i++) {
            if ((btns[i].innerText || '').trim() === 'Retry') { btns[i].click(); return true; }
          }
          return false;
        })()
      `);
      await sleep(2500);

      const afterRetry = await evaluate('(window.__sentBodies || []).length');
      if (afterRetry === beforeRetry) {
        ok('"Retry" does NOT re-send a message whose outcome is unknown');
      } else {
        bad(
          '"Retry" does NOT re-send a message whose outcome is unknown',
          `it sent the question again (${beforeRetry} -> ${afterRetry}) — that would duplicate it`,
        );
      }
    } finally {
      await send('Page.removeScriptToEvaluateOnNewDocument', {
        identifier: serverErrorStub.identifier,
      });
    }
  }


  section('P. a malicious assistant reply cannot execute');














  const xssChatId = (
    await db.query(
      `INSERT INTO chat_agent.chats (id, user_id, title, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, 'xss probe', now(), now())
       RETURNING id`,
      [userId],
    )
  ).rows[0].id;
  trackChat('xss probe', xssChatId);

  const xssPayload = [
    'XSS probe line.',
    '',
    '<script>window.__learnaiXss = "script-executed";</script>',
    '',
    '<iframe src="https://evil.example.com/steal"></iframe>',
    '',
    '<style>body{background:red}</style>',
    '',
    '<object data="https://evil.example.com/x.swf"></object>',
    '',
    '<embed src="https://evil.example.com/x.swf">',
    '',
    '<form action="https://evil.example.com/steal"><button>go</button></form>',
    '',
    '<meta http-equiv="refresh" content="0;url=https://evil.example.com/">',
    '',
    '<img src="x" onerror="window.__learnaiXss = \'img-executed\'">',
    '',
    '<a href="javascript:window.__learnaiXss=\'href-executed\'">click</a>',
    '',
    '<svg onload="window.__learnaiXss=\'svg-executed\'"><circle r="10"/></svg>',
    '',
    '<div onmouseover="window.__learnaiXss=\'div-executed\'">hover</div>',
  ].join('\n');

  await seedAssistantMessage(xssChatId, xssPayload);
  seeded += 1;

  await navigate(`${BASE}/dashboard`);
  await waitFor(
    `document.body.innerText.includes('Recent Conversations')`,
    'the sidebar',
  );
  await sleep(800);


  const openedXssChat = await evaluate(`
    (function() {
      var rows = Array.prototype.slice.call(
        document.querySelectorAll('a[href*="id="], [data-chat-id], button')
      );
      for (var i = 0; i < rows.length; i++) {
        var el = rows[i];
        var text = (el.innerText || '');
        var href = el.getAttribute && el.getAttribute('href');
        if (text.indexOf('xss probe') !== -1 || (href && href.indexOf('xss') !== -1)) {
          el.click();
          return true;
        }
      }
      return false;
    })()
  `);

  if (openedXssChat) {
    ok('the XSS-probe chat was opened');
    await sleep(1500);
  } else {
    info('could not click the XSS-probe chat row; falling back to a direct URL');
    await navigate(`${BASE}/dashboard?id=${xssChatId}`);
    await sleep(2000);
  }

  const xssDom = await evaluate(`
    (function() {
      var root = document.querySelector('.markdown-content') || document.body;






      var dangerous = ['script', 'iframe', 'style', 'object', 'embed', 'form', 'base', 'meta', 'link'];
      var byTag = {};
      dangerous.forEach(function(tag) {
        byTag[tag] = root.querySelectorAll(tag).length;
      });

      return {
        byTag: byTag,

        metaRefresh: root.querySelectorAll('meta[http-equiv]').length,

        baseHref: root.querySelectorAll('base[href]').length,

        onAttrs: Array.prototype.slice.call(
          root.querySelectorAll('*')
        ).filter(function(el) {
          return Array.prototype.slice.call(el.attributes).some(function(a) {
            return /^on/i.test(a.name);
          });
        }).length,
        executed: window.__learnaiXss || null,
        hasProbeText: (root.innerText || '').indexOf('XSS probe line') !== -1,
      };
    })()
`);
  info(`xss dom probe: ${JSON.stringify(xssDom)}`);

  if (xssDom.hasProbeText) {
    ok('the seeded assistant message is rendered on the page');
  } else {
    bad('the seeded assistant message is rendered on the page', JSON.stringify(xssDom));
  }

  const dangerousTags = ['script', 'iframe', 'style', 'object', 'embed', 'form', 'base', 'meta', 'link'];
  for (const tag of dangerousTags) {
    const n = xssDom.byTag[tag] ?? 0;
    if (n === 0) ok(`the rendered reply contains no <${tag}> element`);
    else bad(`the rendered reply contains no <${tag}> element`, `${n} found`);
  }

  if (xssDom.onAttrs === 0) ok('the rendered reply contains no inline event handler');
  else bad('the rendered reply contains no inline event handler', `${xssDom.onAttrs} found`);

  if (!xssDom.executed) ok('no payload executed (window.__learnaiXss is unset)');
  else bad('no payload executed', `window.__learnaiXss = ${xssDom.executed}`);


  section('Q. a malicious reply cannot hijack the page base URL');











  const baseChatId = (
    await db.query(
      `INSERT INTO chat_agent.chats (id, user_id, title, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, 'base probe', now(), now())
       RETURNING id`,
      [userId],
    )
  ).rows[0].id;
  trackChat('base probe', baseChatId);

  await seedAssistantMessage(
    baseChatId,
    [
      'Base probe line.',
      '',
      '<base href="https://evil.example.com/">',
      '',
      '[a relative link](/relative/path)',
    ].join('\n'),
  );
  seeded += 1;

  await navigate(`${BASE}/dashboard`);
  await waitFor(
    `document.body.innerText.includes('Recent Conversations')`,
    'the sidebar',
  );
  await sleep(600);
  await navigate(`${BASE}/dashboard?id=${baseChatId}`);
  await sleep(2000);

  const baseProbe = await evaluate(`
    (function() {
      var bases = document.querySelectorAll('base');
      return {
        url: location.href,
        baseCount: bases.length,
        baseHref: bases.length ? bases[0].getAttribute('href') : null,
        bodyText: document.body.innerText.slice(0, 200),
      };
    })()
  `);
  info(`base probe: ${JSON.stringify(baseProbe)}`);

  if (baseProbe.baseCount === 0) {
    ok('the rendered reply contains no <base> element');
  } else {
    bad(
      'the rendered reply contains no <base> element',
      `base href=${baseProbe.baseHref}`,
    );
  }

  if (baseProbe.url.startsWith(BASE)) {
    ok('the dashboard URL was not hijacked by the reply');
  } else {
    bad('the dashboard URL was not hijacked by the reply', baseProbe.url);
  }


  await navigate(`${BASE}/dashboard`);
  await sleep(800);


  section('T. dictation keeps the live interim words, without duplicating them');
















  {
    const speechStub = await send('Page.addScriptToEvaluateOnNewDocument', {
      source: `
        (function() {
          function FakeRecognition() {
            this.lang = '';
            this.continuous = false;
            this.interimResults = false;
            this.maxAlternatives = 1;
            this.onresult = null;
            this.onerror = null;
            this.onend = null;
            this.onstart = null;
            this._started = false;
          }
          FakeRecognition.prototype.start = function() {
            if (this._started) throw new Error('InvalidStateError: already started');
            this._started = true;
            if (this.onstart) this.onstart();
            var self = this;


            setTimeout(function() {
              if (!self.onresult) return;
              var mk = function(text, isFinal) {
                return { 0: { transcript: text }, isFinal: isFinal, length: 1 };
              };
              var results = [ mk('hello world', true), mk('hello world again', false) ];
              results.length = 2;
              self.onresult({ results: results, resultIndex: 0 });
            }, 50);
          };
          FakeRecognition.prototype.stop = function() {
            this._started = false;
            if (this.onend) this.onend();
          };
          FakeRecognition.prototype.abort = function() {
            this._started = false;
            if (this.onend) this.onend();
          };
          window.SpeechRecognition = FakeRecognition;
          window.webkitSpeechRecognition = FakeRecognition;
          if (!window.speechSynthesis) {
            window.speechSynthesis = { speak: function(){}, cancel: function(){} };
          }
        })();
`,
    });

    try {
      await navigate(`${BASE}/dashboard`);
      await waitFor(
        `document.body.innerText.includes('Recent Conversations')`,
        'the sidebar',
      );
      await sleep(800);

      const micLabel = await evaluate(`
        (function() {
          var btns = Array.prototype.slice.call(document.querySelectorAll('button'));
          for (var i = 0; i < btns.length; i++) {
            var l = btns[i].getAttribute('aria-label') || '';
            if (l.indexOf('dictation') !== -1) return l;
          }
          return '(no mic button)';
        })()
      `);

      if (micLabel === '(no mic button)') {
        bad('the mic button renders', 'voice is unsupported in this browser');
      } else {
        ok('the mic button renders');

        await evaluate(`
          (function() {
            var btns = Array.prototype.slice.call(document.querySelectorAll('button'));
            for (var i = 0; i < btns.length; i++) {
              var l = btns[i].getAttribute('aria-label') || '';
              if (l.indexOf('Start dictation') !== -1) { btns[i].click(); return true; }
            }
            return false;
          })()
        `);
        await sleep(1200);

        const shown = await evaluate(`
          (function() {
            var ta = document.querySelector('textarea');
            return ta ? ta.value : '(no textarea)';
          })()
        `);


        if (shown.includes('again')) {
          ok('the live interim words reach the input box');
        } else {
          bad(
            'the live interim words reach the input box',
            `the box holds ${JSON.stringify(shown)}`,
          );
        }


        const occurrences = (shown.match(/hello world/g) || []).length;
        if (occurrences === 1) {
          ok('the finalized prefix is not duplicated');
        } else {
          bad(
            'the finalized prefix is not duplicated',
            `"hello world" appears ${occurrences}x in ${JSON.stringify(shown)}`,
          );
        }
      }
    } finally {
      await send('Page.removeScriptToEvaluateOnNewDocument', {
        identifier: speechStub.identifier,
      });
    }
  }
} catch (e) {
  bad('the suite ran to completion', e.message);
  console.error(e);
} finally {

  section('Cleanup');
  try {
    await db.query(
      `DELETE FROM chat_agent.messages WHERE chat_id IN (SELECT id FROM chat_agent.chats WHERE user_id = $1)`,
      [userId],
    );
    await db.query(`DELETE FROM chat_agent.chats WHERE user_id = $1`, [userId]);
    await db.query(`DELETE FROM public.profiles WHERE id = $1`, [userId]);
    const leftover = await db.query(
      `SELECT COUNT(*)::int c FROM public.profiles WHERE email LIKE 'dashui-%'`,
    );
    if (leftover.rows[0].c === 0) ok('no test profiles left behind');
    else bad('no test profiles left behind', `${leftover.rows[0].c} left`);
  } catch (e) {
    bad('cleanup', e.message);
  }
  await db.end();
}

console.log(`\n${'='.repeat(60)}`);
console.log(`  dashboard UI suite: ${passed} passed, ${failed} failed`);
console.log('='.repeat(60));
process.exit(failed > 0 ? 1 : 0);



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
  await sleep(1200);
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


async function clickTab(text) {
  const expr = `
    Array.from(document.querySelectorAll('button[role="tab"]'))
      .find(e => (e.textContent || "").trim().toLowerCase() === ${JSON.stringify(text.toLowerCase())})
      || Array.from(document.querySelectorAll('button[role="tab"]'))
      .find(e => (e.textContent || "").trim().toLowerCase().includes(${JSON.stringify(text.toLowerCase())}))
  `;
  await realClick(expr);
}


async function clickLink(text) {
  const clicked = await evaluate(`
    (function() {
      const els = Array.from(document.querySelectorAll('a'));
      const el = els.find(e => (e.textContent || "").trim().includes(${JSON.stringify(text)}));
      if (!el) return false;
      el.click();
      return true;
    })()
  `);
  if (!clicked) throw new Error(`could not find a link reading "${text}"`);
  await sleep(1500);
}

async function bodyText() {
  return evaluate('document.body.innerText');
}





const db = new pg.Client({ connectionString: process.env.DB_URL });
await db.connect();

const stamp = Date.now();
const email = `learnui-${stamp}@e2e.local`;
const password = 'LearnPages-2026!';

let token = null;
let userId = null;
const createdDeckIds = [];
const createdMindMapIds = [];
const createdChatIds = [];

async function api(method, path, body, tok = token) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...bypassHeaders(),
      ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch {  }
  return { status: res.status, body: parsed, text };
}


async function seedDeckWithCards(title, count = 3) {
  const res = await api('POST', '/srs/decks', {
    title,
    description: 'created by verify-learning-pages-ui.mjs',
    sourceType: 'manual',
  });
  if (res.status !== 201 || !res.body?.deck?.id) {
    throw new Error(`could not create the deck: ${res.status} ${res.text.slice(0, 200)}`);
  }
  const deckId = res.body.deck.id;
  createdDeckIds.push(deckId);

  const cards = [
    {
      front: 'What is a relational database?',
      back: 'A database that stores data in tables made of rows and columns.',
      tags: ['databases'],
    },
    {
      front: 'What does a primary key do?',
      back: 'It uniquely identifies every row within a table.',
      tags: ['databases', 'keys'],
    },
    {
      front: 'What is referential integrity?',
      back: 'The rule that foreign keys must point at an existing row.',
      tags: ['databases', 'keys'],
    },
  ].slice(0, count);

  for (let i = 0; i < cards.length; i++) {
    await db.query(
      `INSERT INTO flashcards
         (deck_id, user_id, front, back, tags, ease_factor,
          interval_days, repetitions, due_at, created_at)
       VALUES ($1, $2, $3, $4, $5, 2.5, 0, 0, now(), now())`,
      [deckId, userId, cards[i].front, cards[i].back, cards[i].tags],
    );
  }
  await db.query(
    'UPDATE flashcard_decks SET card_count = $2 WHERE id = $1',
    [deckId, cards.length],
  );
  return deckId;
}


async function seedChat(title) {
  const res = await db.query(
    `INSERT INTO chat_agent.chats (user_id, title) VALUES ($1, $2) RETURNING id`,
    [userId, title],
  );
  const id = res.rows[0].id;
  createdChatIds.push(id);
  await db.query(
    `INSERT INTO chat_agent.messages (chat_id, role, content)
     VALUES ($1, 'user', $2), ($1, 'assistant', $3)`,
    [
      id,
      'What is a relational database and how does it store data?',
      'A relational database stores data in tables of rows and columns, keyed by primary keys and related through foreign keys.',
    ],
  );
  return id;
}


async function seedChats(count, prefix) {
  for (let i = 0; i < count; i++) {
    const res = await db.query(
      `INSERT INTO chat_agent.chats (user_id, title) VALUES ($1, $2) RETURNING id`,
      [userId, `${prefix} ${i + 1}`],
    );
    createdChatIds.push(res.rows[0].id);
  }
}


async function seedMindMap(title) {
  const res = await api('POST', '/mindmaps', {
    title,
    description: 'created by verify-learning-pages-ui.mjs',
    sourceType: 'manual',
  });
  if (res.status !== 201 || !res.body?.mindMap?.id) {
    throw new Error(`could not create the mind map: ${res.status} ${res.text.slice(0, 200)}`);
  }
  const id = res.body.mindMap.id;
  createdMindMapIds.push(id);

  const graph = {
    root: 'Databases',
    nodes: [
      { id: 'n0', label: 'Databases', level: 0, parent: null, description: 'The root concept.' },
      { id: 'n1', label: 'Tables', level: 1, parent: 'n0', description: 'Where the rows live.' },
      { id: 'n2', label: 'Indexes', level: 1, parent: 'n0', description: 'Speed up lookups.' },
    ],
  };
  await db.query(
    `UPDATE mind_maps
        SET graph_json = $2, root_concept = $3, node_count = $4
      WHERE id = $1`,
    [id, JSON.stringify(graph), 'Databases', graph.nodes.length],
  );
  return id;
}





try {
  console.log(`\nLearning-pages UI E2E against ${BASE}`);

  const user = await createTestUser(email, password, db);
  token = user.token;
  userId = user.userId;
  ok(`test user created (${email})`);

  const deckId = await seedDeckWithCards(`UI Deck ${stamp}`);
  ok(`deck seeded with cards (${deckId})`);

  const mindMapId = await seedMindMap(`UI Map ${stamp}`);
  ok(`mind map seeded (${mindMapId})`);

  await seedChat(`UI Chat ${stamp}`);
  ok('chat seeded');



  await seedChats(30, `UI Bulk Chat ${stamp}`);
  ok('30 more chats seeded');

  await connect();
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');


  section('A. sign in through the real login form');

  await navigate(`${BASE}/auth`);
  await waitFor(`!!document.querySelector('input[type="password"]')`, 'the login form');

  await setInputValue('input[type="email"]', email);
  await setInputValue('input[type="password"]', password);
  await sleep(300);

  const echo = await evaluate(`document.querySelector('input[type="email"]').value`);
  if (echo === email) ok('the email field is populated');
  else bad('the email field is populated', echo);




  await evaluate(`
    (function() {
      const btn = document.querySelector('form button[type="submit"]');
      if (!btn) return false;
      btn.click();
      return true;
    })()
  `);
  await sleep(3000);

  const loggedIn = await evaluate(`location.pathname !== '/auth'`);
  if (loggedIn) ok(`signed in, landed on ${await evaluate('location.pathname')}`);
  else {
    bad('signed in', `still on ${await evaluate('location.pathname')}`);
    info((await bodyText()).slice(0, 300));
  }


  section('B. flashcards — the deck list');

  await navigate(`${BASE}/flashcards`);
  await waitFor(`document.body.innerText.includes('Flashcard')`, 'the flashcards page');





  await waitFor(
    `document.body.innerText.includes(${JSON.stringify(`UI Deck ${stamp}`)})`,
    'the seeded deck in the list',
    15000,
  ).catch(() => {});

  const listText = await bodyText();
  if (listText.includes(`UI Deck ${stamp}`)) ok('the seeded deck appears in the list');
  else bad('the seeded deck appears in the list', listText.slice(0, 300));


  section('C. flashcards — the deck detail page');

  await navigate(`${BASE}/flashcards/${deckId}`);
  await waitFor(
    `document.body.innerText.includes('What is a relational database?')`,
    'the seeded cards',
  );
  ok('the deck page renders the seeded cards');

  const deckText = await bodyText();
  if (deckText.includes('Total cards')) ok('the stats row is rendered');
  else bad('the stats row is rendered', deckText.slice(0, 300));


  const heading = await evaluate(`document.querySelector('h1')?.textContent || ''`);
  if (heading.includes(`UI Deck ${stamp}`)) ok(`the deck title is correct ("${heading}")`);
  else bad('the deck title is correct', heading);


  section('D. flashcards — generate more from pasted text');

  await clickTab('Generate more');
  await sleep(800);

  const onGenerateTab = await evaluate(`
    document.body.innerText.includes('Cards to generate')
  `);
  if (onGenerateTab) ok('the "Generate more" tab opened');
  else bad('the "Generate more" tab opened', 'the panel did not appear');



  const sourceButtons = await evaluate(`
    (function() {
      const panel = Array.from(document.querySelectorAll('button'))
        .filter(b => ['manual','course','chat','note'].includes((b.textContent||'').trim().toLowerCase()));
      return JSON.stringify(panel.map(b => (b.textContent||'').trim().toLowerCase()));
    })()
  `);
  const sources = JSON.parse(sourceButtons);
  if (!sources.includes('note')) ok('the removed "note" source is not offered');
  else bad('the removed "note" source is not offered', sourceButtons);
  if (sources.includes('manual') && sources.includes('course') && sources.includes('chat')) {
    ok(`the source picker offers manual/course/chat (${sources.join(', ')})`);
  } else {
    bad('the source picker offers manual/course/chat', sourceButtons);
  }


  const PASTED = 'A relational database stores data in tables made of rows and columns. '
    + 'Each row is a record and each column is an attribute of that record. '
    + 'A primary key uniquely identifies every row within a table. '
    + 'Foreign keys establish relationships between tables and enforce referential integrity. '
    + 'Indexes speed up lookups by maintaining a sorted structure on selected columns. '
    + 'Transactions group several statements so that they either all succeed or all fail together.';

  await setInputValue('#src-text', PASTED);
  await sleep(300);




  await realClick(`
    Array.from(document.querySelectorAll('button'))
      .find(b => (b.textContent || "").trim() === "Generate" && b.getAttribute("role") !== "tab")
  `);
  await sleep(10000);



  const genText = await bodyText();
  const cardsMatch = genText.match(/Cards \((\d+)\)/);
  const cardCount = Number(cardsMatch?.[1] ?? 0);
  if (cardCount >= 3) ok(`the generated cards were added (${cardCount} cards in the deck)`);
  else bad('the generated cards were added', `the tab reads ${cardsMatch?.[0] ?? 'n/a'}`);




  if (genText.includes('AI quota')) {
    ok('the local-generation notice is shown');
  } else {
    info('no local-generation notice (the AI answered, or the banner had not rendered yet)');
  }


  section('E. mind maps — the list and the detail page');

  await navigate(`${BASE}/mindmaps`);
  await waitFor(`document.body.innerText.includes('Mind Maps')`, 'the mind maps page');



  await waitFor(
    `document.body.innerText.includes(${JSON.stringify(`UI Map ${stamp}`)})`,
    'the seeded mind map in the list',
    15000,
  ).catch(() => {});

  const mmListText = await bodyText();
  if (mmListText.includes(`UI Map ${stamp}`)) ok('the seeded mind map appears in the list');
  else bad('the seeded mind map appears in the list', mmListText.slice(0, 300));

  await navigate(`${BASE}/mindmaps/${mindMapId}`);
  await waitFor(
    `document.body.innerText.includes('Databases') || document.body.innerText.includes('Tables')`,
    'the mind map content',
  );
  ok('the mind map page renders the concept graph');

  const mmHeading = await evaluate(`document.querySelector('h1')?.textContent || ''`);
  if (mmHeading.includes(`UI Map ${stamp}`)) ok(`the mind map title is correct ("${mmHeading.trim()}")`);
  else bad('the mind map title is correct', mmHeading);

  if (mmListText.includes('Mind Maps')) ok('the mind maps page renders its heading');
  else bad('the mind maps page renders its heading', mmListText.slice(0, 200));


  section('F. mind maps — regenerate from pasted text');

  await clickTab('Regenerate');
  await sleep(800);

  const onRegenTab = await evaluate(`
    document.body.innerText.includes('Number of concepts')
  `);
  if (onRegenTab) ok('the "Regenerate" tab opened');
  else bad('the "Regenerate" tab opened', 'the panel did not appear');

  await setInputValue('#src-text', PASTED);
  await sleep(300);




  await realClick(`
    Array.from(document.querySelectorAll('button'))
      .find(b => (b.textContent || "").trim() === "Regenerate" && b.getAttribute("role") !== "tab")
  `);
  await sleep(10000);

  const regenText = await bodyText();
  const conceptMatch = regenText.match(/(\d+)\s+concepts?/);
  const conceptCount = Number(conceptMatch?.[1] ?? 0);
  if (conceptCount >= 3) ok(`the regenerated map has ${conceptCount} concepts`);
  else bad('the regenerated map has concepts', `the header reads ${conceptMatch?.[0] ?? 'n/a'}`);




  const persisted = await db.query(
    'SELECT root_concept, node_count, graph_json FROM public.mind_maps WHERE id = $1',
    [mindMapId],
  );
  const row = persisted.rows[0];
  if (row && row.graph_json) {
    const graph = typeof row.graph_json === 'string'
      ? JSON.parse(row.graph_json)
      : row.graph_json;
    const nodes = graph?.nodes || [];
    if (nodes.length >= 3) {
      ok(`the graph was persisted with ${nodes.length} node(s)`);
    } else {
      bad('the graph was persisted with nodes', `the row has ${nodes.length}`);
    }
    const ids = new Set(nodes.map((n) => n.id));
    const roots = nodes.filter((n) => n.parent === null);
    if (roots.length === 1) ok('the persisted graph has exactly one root');
    else bad('the persisted graph has exactly one root', `found ${roots.length}`);
    const dangling = nodes.filter((n) => n.parent !== null && !ids.has(n.parent));
    if (dangling.length === 0) ok('every persisted node points at an existing parent');
    else bad('every persisted node points at an existing parent', `${dangling.length} dangling`);
    if (row.root_concept && row.root_concept !== 'Databases') {
      ok(`the root concept was replaced ("${row.root_concept}")`);
    } else {
      bad('the root concept was replaced', `it still reads "${row.root_concept}"`);
    }
  } else {
    bad('the graph was persisted', 'the row has no graph');
  }


  section('H. flashcards — the study page keyboard shortcuts');





  await navigate(`${BASE}/flashcards/${deckId}/study`);
  await waitFor(
    `document.body.innerText.includes('What is a relational database?')`,
    'the study page',
  );
  ok('the study page loads the first card');


  await send('Input.dispatchKeyEvent', {
    type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32, text: ' ',
  });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
  await sleep(800);

  const revealed = await evaluate(
    `document.body.innerText.includes('Press 1–4 on your keyboard')`,
  );
  if (revealed) ok('Space reveals the answer');
  else bad('Space reveals the answer', await bodyText());


  const before = await evaluate(`document.body.innerText`);
  await send('Input.dispatchKeyEvent', {
    type: 'keyDown', key: '1', code: 'Digit1', windowsVirtualKeyCode: 49, text: '1',
  });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: '1', code: 'Digit1', windowsVirtualKeyCode: 49 });
  await sleep(2500);

  const after = await evaluate(`document.body.innerText`);

  const stuck = after.includes('What is a relational database?')
    && after.includes('Failed to submit review');
  if (stuck) {
    bad('the "1" shortcut submits a review', 'the review was rejected (rating 1 is not a valid SM-2 rating)');
  } else if (after.includes('Failed to submit review')) {
    bad('the "1" shortcut submits a review', 'the page reported "Failed to submit review"');
  } else {
    ok('the "1" shortcut submits a review (rating 0 / "Again")');
  }


  const reviewed = await db.query(
    `SELECT rating FROM flashcard_reviews
      WHERE card_id IN (SELECT id FROM flashcards WHERE deck_id = $1)
      ORDER BY reviewed_at DESC LIMIT 1`,
    [deckId],
  );
  if (reviewed.rows.length === 0) {
    bad('the "1" shortcut recorded a review', 'no review row was written');
  } else if (reviewed.rows[0].rating === 0) {
    ok('the review was recorded with rating 0 ("Again")');
  } else {
    bad('the review was recorded with rating 0 ("Again")', `got rating ${reviewed.rows[0].rating}`);
  }
  void before;


  section('I. the "Chat history" source picker lists the user\'s chats');




  await navigate(`${BASE}/quizzes/new`);
  await waitFor(`document.body.innerText.includes('Create a new quiz')`, 'the new quiz page');
  await sleep(1200);




  await realClick(`
    Array.from(document.querySelectorAll('button'))
      .find(b => (b.textContent || "").trim().startsWith("Chat history"))
  `);
  await sleep(2000);

  const chatPickerReady = await evaluate(`
    (function() {
      const trigger = document.querySelector('#chat-id');
      return !!trigger && (trigger.textContent || "").includes('conversation');
    })()
  `);
  if (chatPickerReady) ok('the "Chat history" source picker is shown');
  else bad('the "Chat history" source picker is shown', 'the trigger did not appear');


  await realClick(`document.querySelector('#chat-id')`);
  await sleep(1500);

  const optionText = await evaluate(`
    (function() {
      const list = document.querySelector('[role="listbox"]');
      return list ? list.textContent || '' : '';
    })()
  `);
  if (optionText.includes(`UI Chat ${stamp}`)) {
    ok('the picker lists the seeded conversation');
  } else {
    bad('the picker lists the seeded conversation', optionText.slice(0, 300) || 'the dropdown is empty');
  }




  const optionCount = await evaluate(`
    (function() {
      const list = document.querySelector('[role="listbox"]');
      return list ? list.querySelectorAll('[role="option"]').length : 0;
    })()
  `);
  if (optionCount > 20) {
    ok(`the picker loaded more than 20 conversations (${optionCount})`);
  } else {
    bad('the picker loaded more than 20 conversations', `got ${optionCount} — the page size was capped`);
  }


  section('G. the pages must not be broken by the removed notes feature');

  for (const [label, url] of [
    ['quizzes', '/quizzes'],
    ['flashcards', '/flashcards'],
    ['mindmaps', '/mindmaps'],
  ]) {
    await navigate(`${BASE}${url}`);
    await sleep(1500);
    const text = await bodyText();
    const broken = /Application error|isn't valid|Unexpected Application Error/i.test(text);
    if (broken) bad(`the ${label} page renders`, text.slice(0, 300));
    else ok(`the ${label} page renders without a runtime error`);
  }


  await navigate(`${BASE}/dashboard`);
  await sleep(1500);
  const navText = await bodyText();
  if (!/\bNotes\b/.test(navText)) ok('the "Notes" nav item is gone');
  else bad('the "Notes" nav item is gone', 'it is still in the navigation');
} catch (e) {
  bad('the suite ran to completion', e.message);
} finally {
  console.log('\n--- cleanup ---');
  try {
    for (const id of createdDeckIds) {
      await db.query('DELETE FROM public.flashcard_decks WHERE id = $1', [id]);
    }
    for (const id of createdMindMapIds) {
      await db.query('DELETE FROM public.mind_maps WHERE id = $1', [id]);
    }
    for (const id of createdChatIds) {
      await db.query('DELETE FROM chat_agent.messages WHERE chat_id = $1', [id]);
      await db.query('DELETE FROM chat_agent.chats WHERE id = $1', [id]);
    }
    if (userId) await db.query('DELETE FROM public.profiles WHERE id = $1', [userId]);
    console.log('  ✓ test rows removed');
  } catch (e) {
    bad('cleanup', e.message);
  }
  await db.end();
  if (ws) ws.close();
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

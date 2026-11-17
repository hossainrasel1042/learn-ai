

import 'dotenv/config';
import pg from 'pg';
import { readFile } from 'node:fs/promises';

import { API_BASE, createTestUser, bypassHeaders } from './_testAuth.js';














if (!process.env.DASHBOARD_CHROMA_HOST) {
  const host = process.env.CHROMA_HOST || 'localhost';
  const port = process.env.CHROMA_PORT || '8000';

  if (host === 'localhost' && port === '8000') {
    process.env.CHROMA_HOST = 'localhost';
    process.env.CHROMA_PORT = '8001';
  }
}

let passed = 0;
let failed = 0;
const ok = (m) => { console.log(`  ✓ ${m}`); passed++; };
const bad = (m, e) => { console.log(`  ✗ ${m}${e ? `: ${e}` : ''}`); failed++; };
const info = (m) => console.log(`  – ${m}`);
const skip = (m) => console.log(`  ○ skipped: ${m}`);
const section = (m) => console.log(`\n--- ${m} ---`);


const WITH_LLM = process.env.DASHBOARD_E2E_LLM === '1';

const db = new pg.Client({ connectionString: process.env.DB_URL });
await db.connect();

const stamp = Date.now();
const email = `dashapi-${stamp}@e2e.local`;
const password = 'DashboardApi-2026!';

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


async function messageRows(chatId) {
  const { rows } = await db.query(
    'SELECT id, role, content FROM chat_agent.messages WHERE chat_id = $1 ORDER BY created_at ASC',
    [chatId]
  );
  return rows;
}

try {
  console.log(`\nDashboard API suite against ${API_BASE}`);

  const user = await createTestUser(email, password, db);
  token = user.token;
  userId = user.userId;
  ok(`test user created (${email})`);


  section('A. auth is required');

  {
    const res = await api('GET', '/chat', undefined, null);
    if (res.status === 401) ok('GET /chat without a token → 401');
    else bad('GET /chat without a token → 401', `got ${res.status}`);
  }


  section('B. POST /chat creates a chat');

  let chatId = null;
  {
    const res = await api('POST', '/chat', { title: 'Suite chat' });
    if (res.status === 201) ok('POST /chat → 201');
    else bad('POST /chat → 201', `got ${res.status}: ${res.text.slice(0, 160)}`);

    const b = res.body || {};
    chatId = b.id;


    const expectedKeys = ['id', 'userId', 'title', 'createdAt', 'updatedAt'];
    const missing = expectedKeys.filter((k) => !(k in b));
    if (missing.length === 0) ok(`the chat response is camelCase (${expectedKeys.join(', ')})`);
    else bad('the chat response is camelCase', `missing: ${missing.join(', ')}`);

    const snakeKeys = Object.keys(b).filter((k) => k.includes('_'));
    if (snakeKeys.length === 0) ok('the chat response has no snake_case keys');
    else bad('the chat response has no snake_case keys', snakeKeys.join(', '));

    if (typeof b.createdAt === 'string' && !Number.isNaN(Date.parse(b.createdAt))) {
      ok('createdAt is a parseable ISO timestamp');
    } else {
      bad('createdAt is a parseable ISO timestamp', String(b.createdAt));
    }
  }


  section('C. the chat row is actually persisted');

  {
    const { rows } = await db.query(
      'SELECT id, title FROM chat_agent.chats WHERE id = $1 AND user_id = $2',
      [chatId, userId]
    );
    if (rows.length === 1) ok('the chat row exists in the database (not rolled back)');
    else bad('the chat row exists in the database', `found ${rows.length} rows`);
  }


  section('D. GET /chat returns a FLAT envelope');

  {
    const res = await api('GET', `/chat/${chatId}`);
    if (res.status === 200) ok('GET /chat/:id → 200');
    else bad('GET /chat/:id → 200', `got ${res.status}`);

    const b = res.body || {};


    if (!('chat' in b)) ok('the response is flat (no nested "chat" key)');
    else bad('the response is flat (no nested "chat" key)', 'a nested "chat" key is present');

    if (b.id === chatId) ok('the flat response carries the chat id');
    else bad('the flat response carries the chat id', `got ${b.id}`);

    if (Array.isArray(b.messages)) ok('the response carries a messages array');
    else bad('the response carries a messages array', typeof b.messages);

    const snakeKeys = Object.keys(b).filter((k) => k.includes('_'));
    if (snakeKeys.length === 0) ok('the detail response has no snake_case keys');
    else bad('the detail response has no snake_case keys', snakeKeys.join(', '));
  }


  section('E. GET /chat lists the chat');

  {
    const res = await api('GET', '/chat?page=1&pageSize=20');
    if (res.status === 200) ok('GET /chat → 200');
    else bad('GET /chat → 200', `got ${res.status}`);

    const b = res.body || {};
    if (Array.isArray(b.chats)) ok('the list carries a chats array');
    else bad('the list carries a chats array', typeof b.chats);

    if (b.chats?.some((c) => c.id === chatId)) ok('the created chat is in the list');
    else bad('the created chat is in the list', 'not found');



    const first = b.chats?.[0] || {};
    if ('updatedAt' in first && !('updated_at' in first)) {
      ok('the list entries expose updatedAt (camelCase)');
    } else {
      bad('the list entries expose updatedAt (camelCase)', Object.keys(first).join(', '));
    }
  }


  section('F. invalid pagination is a 400, not a 500');

  for (const [query, label] of [
    ['page=0', 'page=0'],
    ['page=-1', 'page=-1'],
    ['page=abc', 'page=abc'],
    ['pageSize=0', 'pageSize=0'],
    ['pageSize=1000', 'pageSize=1000'],
  ]) {
    const res = await api('GET', `/chat?${query}`);
    if (res.status === 400) ok(`GET /chat?${query} → 400 (no SQL error leak)`);
    else bad(`GET /chat?${query} → 400`, `got ${res.status}: ${res.text.slice(0, 120)}`);


    if (!/OFFSET must not be negative|invalid input syntax|pg|postgres/i.test(res.text)) {
      ok(`GET /chat?${query} leaks no SQL detail`);
    } else {
      bad(`GET /chat?${query} leaks no SQL detail`, res.text.slice(0, 160));
    }
  }

  {

    const res = await api('GET', '/chat?page=1&pageSize=100');
    if (res.status === 200) ok('GET /chat?page=1&pageSize=100 → 200 (upper bound allowed)');
    else bad('GET /chat?page=1&pageSize=100 → 200', `got ${res.status}`);
  }


  section('G. message validation');

  {
    const res = await api('POST', `/chat/${chatId}/message?stream=false`, { content: '' });
    if (res.status === 400) ok('an empty message → 400');
    else bad('an empty message → 400', `got ${res.status}`);
  }
  {
    const res = await api('POST', `/chat/${chatId}/message?stream=false`, { content: 'x'.repeat(10001) });
    if (res.status === 400) ok('an over-long message → 400');
    else bad('an over-long message → 400', `got ${res.status}`);
  }
  {
    const res = await api('POST', '/chat/00000000-0000-0000-0000-000000000000/message?stream=false', { content: 'hi' });
    if (res.status === 404) ok('a message to an unknown chat → 404');
    else bad('a message to an unknown chat → 404', `got ${res.status}`);
  }


  section('G2. a non-UUID chat id is a 400, not a 500');

  {




    for (const [method, path, body] of [
      ['GET', '/chat/not-a-uuid', undefined],
      ['GET', '/chat/12345', undefined],
      ['POST', '/chat/not-a-uuid/message?stream=false', { content: 'hi' }],
      ['DELETE', '/chat/not-a-uuid', undefined],
      ['PATCH', '/chat/not-a-uuid/title', { title: 'x' }],
    ]) {
      const res = await api(method, path, body);
      if (res.status === 400) {
        ok(`${method} ${path.split('?')[0]} → 400 (not a 500)`);
      } else {
        bad(`${method} ${path.split('?')[0]} → 400`, `got ${res.status}: ${res.text.slice(0, 120)}`);
      }

      if (!/invalid input syntax|22P02|pg|postgres|SQLSTATE/i.test(res.text)) {
        ok(`${method} ${path.split('?')[0]} leaks no SQL detail`);
      } else {
        bad(`${method} ${path.split('?')[0]} leaks no SQL detail`, res.text.slice(0, 160));
      }
    }
  }


  section('H. another user cannot read or write this chat');

  {
    const otherEmail = `dashapi-other-${stamp}@e2e.local`;
    const other = await createTestUser(otherEmail, password, db);
    const res = await api('GET', `/chat/${chatId}`, undefined, other.token);
    if (res.status === 404) ok('GET another user\'s chat → 404');
    else bad('GET another user\'s chat → 404', `got ${res.status}`);

    const res2 = await api(
      'POST',
      `/chat/${chatId}/message?stream=false`,
      { content: 'hi' },
      other.token,
    );
    if (res2.status === 404) ok('POST to another user\'s chat → 404');
    else bad('POST to another user\'s chat → 404', `got ${res2.status}`);

    await db.query('DELETE FROM public.profiles WHERE id = $1', [other.userId]);
  }


  section('I. rename + delete');

  {
    const res = await api('PATCH', `/chat/${chatId}/title`, { title: 'Renamed chat' });
    if (res.status === 200) ok('PATCH /chat/:id/title → 200');
    else bad('PATCH /chat/:id/title → 200', `got ${res.status}`);

    const { rows } = await db.query(
      'SELECT title FROM chat_agent.chats WHERE id = $1',
      [chatId],
    );
    if (rows[0]?.title === 'Renamed chat') ok('the rename was persisted (not rolled back)');
    else bad('the rename was persisted', `got "${rows[0]?.title}"`);

    const bad = await api('PATCH', `/chat/${chatId}/title`, { title: '' });
    if (bad.status === 400) ok('an empty title → 400');
    else bad('an empty title → 400', `got ${bad.status}`);
  }


  section('J. the SSE frame shape');

  {
    const res = await fetch(
      `${API_BASE}/chat/${chatId}/message?stream=true`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...bypassHeaders(),
        },
        body: JSON.stringify({ content: 'stream shape check' }),
      },
    );

    if (res.headers.get('content-type')?.includes('text/event-stream')) {
      ok('the streaming response is text/event-stream');
    } else {
      bad('the streaming response is text/event-stream', res.headers.get('content-type'));
    }

    const text = await res.text();
    const frames = text
      .split('\n\n')
      .map((f) => f.trim())
      .filter(Boolean);

    let sawEvent = false;
    let allPayloadsHaveContent = true;
    let sawEnvelopeLeak = false;

    for (const frame of frames) {
      const eventLine = frame.split('\n').find((l) => l.startsWith('event:'));
      const dataLine = frame.split('\n').find((l) => l.startsWith('data:'));
      if (!eventLine || !dataLine) continue;
      sawEvent = true;

      const payload = JSON.parse(dataLine.slice('data:'.length).trim());
      if (!('content' in payload)) allPayloadsHaveContent = false;


      if ('event' in payload && 'data' in payload) sawEnvelopeLeak = true;
    }

    if (sawEvent) ok('the stream emits SSE frames');
    else bad('the stream emits SSE frames', `frames: ${text.slice(0, 200)}`);

    if (allPayloadsHaveContent) ok('every SSE payload carries a "content" key');
    else bad('every SSE payload carries a "content" key', 'a payload was missing "content"');

    if (!sawEnvelopeLeak) ok('no SSE payload carries the old {event,data,metadata} envelope');
    else bad('no SSE payload carries the old {event,data,metadata} envelope', 'envelope found');
  }


  section('K. the user message survives a client disconnect');

  {



    const res = await fetch(
      `${API_BASE}/chat/${chatId}/message?stream=true`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...bypassHeaders(),
        },
        body: JSON.stringify({ content: 'This question must survive a disconnect' }),
        signal: AbortSignal.timeout(1200),
      },
    ).catch(() => null);


    await new Promise((r) => setTimeout(r, 4000));

    const rows = await messageRows(chatId);
    const survived = rows.some(
      (r) => r.role === 'user' && r.content === 'This question must survive a disconnect',
    );
    if (survived) ok('the user message is still persisted after a client disconnect');
    else bad('the user message is still persisted after a client disconnect', 'it was rolled back');
  }


  section('K2. the transcript is in chronological order');

  {














    const orderChat = await api('POST', '/chat', { title: 'Ordering probe' });
    const orderChatId = orderChat.body?.id;

    const sendRes = await api(
      'POST',
      `/chat/${orderChatId}/message?stream=false`,
      { content: 'ordering probe: reply with a single short word' },
    );
    if (sendRes.status === 200) {
      ok('the ordering probe turn completed');
    } else {
      skip(
        `the ordering probe turn completed — the LLM did not answer (HTTP ${sendRes.status}: ${sendRes.text.slice(0, 120)})`,
      );
    }

    const rows = await db.query(
      `SELECT role, created_at FROM chat_agent.messages
       WHERE chat_id = $1 ORDER BY created_at ASC`,
      [orderChatId]
    );

    const roles = rows.rows.map((r) => r.role);
    const firstUser = roles.indexOf('user');
    const firstAssistant = roles.indexOf('assistant');

    if (firstUser !== -1 && firstAssistant !== -1 && firstUser < firstAssistant) {
      ok("the user's question is stored before the assistant's reply");
    } else if (firstAssistant === -1) {


      skip(
        "the user's question is stored before the assistant's reply — the turn produced no reply to compare against",
      );
    } else {
      bad(
        "the user's question is stored before the assistant's reply",
        `roles in created_at order: ${roles.join(',')}`,
      );
    }


    let monotonic = true;
    for (let i = 1; i < rows.rows.length; i++) {
      if (rows.rows[i].created_at.getTime() < rows.rows[i - 1].created_at.getTime()) {
        monotonic = false;
        break;
      }
    }
    if (monotonic) ok('the message timestamps are non-decreasing');
    else bad('the message timestamps are non-decreasing', 'a later row has an earlier timestamp');



    const chatRow = await db.query(
      'SELECT updated_at FROM chat_agent.chats WHERE id = $1',
      [orderChatId]
    );
    const lastMsg = rows.rows[rows.rows.length - 1];
    if (chatRow.rows[0] && lastMsg) {
      if (chatRow.rows[0].updated_at.getTime() >= lastMsg.created_at.getTime()) {
        ok("the chat's updated_at is not older than its last message");
      } else {
        bad(
          "the chat's updated_at is not older than its last message",
          `updated_at=${chatRow.rows[0].updated_at.toISOString()} last message=${lastMsg.created_at.toISOString()}`,
        );
      }
    }


    await db.query('DELETE FROM chat_agent.chats WHERE id = $1', [orderChatId]);
  }


  section('K3. a FAILED turn still leaves the chat correctly dated');

  {
















    const staleChat = await api('POST', '/chat', { title: 'stale timestamp probe' });
    const staleChatId = staleChat.body?.id;

    if (!staleChatId) {
      bad('the stale-timestamp probe chat was created', JSON.stringify(staleChat.body).slice(0, 120));
    } else {


      await api('POST', `/chat/${staleChatId}/message?stream=false`, {
        content: 'stale timestamp probe: this turn may succeed or fail',
      });

      const probe = await db.query(
        `SELECT c.updated_at,
                (SELECT MAX(m.created_at) FROM chat_agent.messages m WHERE m.chat_id = c.id) AS last_msg
         FROM chat_agent.chats c WHERE c.id = $1`,
        [staleChatId],
      );
      const row = probe.rows[0];

      if (!row) {
        bad('the stale-timestamp probe chat still exists', 'the chat row vanished');
      } else if (!row.last_msg) {
        bad('the stale-timestamp probe persisted the user message', 'no message row');
      } else if (row.updated_at.getTime() >= row.last_msg.getTime()) {
        ok("a failed turn still leaves the chat's updated_at at least as new as its last message");
      } else {
        bad(
          "a failed turn still leaves the chat's updated_at at least as new as its last message",
          `updated_at=${row.updated_at.toISOString()} last message=${row.last_msg.toISOString()}`,
        );
      }

      await db.query('DELETE FROM chat_agent.chats WHERE id = $1', [staleChatId]);
    }
  }


  section('L. an empty assistant reply is not persisted');

  {



    const rows = await messageRows(chatId);
    const emptyAssistant = rows.filter((r) => r.role === 'assistant' && !String(r.content || '').trim());
    if (emptyAssistant.length === 0) ok('no empty assistant message is persisted');
    else bad('no empty assistant message is persisted', `${emptyAssistant.length} empty rows`);
  }


  section('L2. exactly ONE system message reaches the LLM');

  {










    const { ChatContext } = await import('../src/chat-agent/context.js');
    const { ChatService } = await import('../src/chat-agent/service.js');

    const ctx = new ChatContext('probe-user', 'probe-chat');
    const contextMessages = await ctx.buildContext(
      [
        { role: 'user', content: 'what is a monad?' },
        { role: 'assistant', content: 'A monad is a functor that composes.' },
      ],
      'and how does it compose?',
      true,
    );


    const svc = new ChatService(null);
    const { llmMessages, systemPrompt } = svc._buildLlmMessages(contextMessages);

    const systemCount =
      llmMessages.filter((m) => m.role === 'system').length +
      (systemPrompt ? 1 : 0);

    if (systemCount === 1) {
      ok('the agent sends exactly one system message');
    } else {
      bad('the agent sends exactly one system message', `found ${systemCount}`);
    }

    const firstIsSystem = llmMessages[0]?.role === 'system';
    if (!firstIsSystem) {
      ok('the forwarded history carries no system message at a non-zero index');
    } else {
      bad(
        'the forwarded history carries no system message at a non-zero index',
        `llmMessages[0].role=${llmMessages[0]?.role}`,
      );
    }

    const roles = llmMessages.map((m) => m.role);
    const onlyUserOrAssistant = roles.every((r) => r === 'user' || r === 'assistant');
    if (onlyUserOrAssistant) {
      ok('the forwarded history is user/assistant only');
    } else {
      bad('the forwarded history is user/assistant only', roles.join(','));
    }
  }


  section('M. the ChromaDB filter builder');

  {
    const { buildChromaWhere } = await import('../src/utils/chromaFilter.js');

    const one = buildChromaWhere({ userId: 'u' });
    if (one && one.userId === 'u') ok('a single condition stays flat');
    else bad('a single condition stays flat', JSON.stringify(one));

    const two = buildChromaWhere({ userId: 'u', chatId: 'c' });
    if (two && Array.isArray(two.$and) && two.$and.length === 2) {
      ok('two conditions become an explicit $and conjunction');
    } else {
      bad('two conditions become an explicit $and conjunction', JSON.stringify(two));
    }

    const none = buildChromaWhere({ userId: null, chatId: undefined });
    if (none === null) ok('no conditions produce no filter');
    else bad('no conditions produce no filter', JSON.stringify(none));
  }


  section('N. the memory store really accepts the built filter');

  {








    const { ChatMemory } = await import('../src/chat-agent/memory.js');
    const { buildChromaWhere } = await import('../src/utils/chromaFilter.js');

    const mem = new ChatMemory();
    const probeUser = `probe-user-${stamp}`;
    const probeChat = `probe-chat-${stamp}`;

    const addedId = await mem.addMemory({
      userId: probeUser,
      chatId: probeChat,
      content: 'dashboard suite memory probe',
      memoryType: 'conversation',
    });

    try {
      const where = buildChromaWhere({ userId: probeUser, chatId: probeChat });
      const res = await mem.getMemories({
        userId: probeUser,
        chatId: probeChat,
        query: 'dashboard suite memory probe',
        nResults: 5,
      });
      const ids = (res || []).map((m) => m.id);
      if (ids.includes(addedId)) {
        ok('a two-condition Chroma query returns the row (no "Invalid where clause")');
      } else {
        bad('a two-condition Chroma query returns the row', `ids: ${JSON.stringify(ids)}`);
      }
    } finally {

      const { getChromaClient } = await import('../src/config/chromadb.js');
      const client = await getChromaClient();
      const collection = await client.getOrCreateCollection({
        name: ChatMemory.COLLECTION_NAME,
        metadata: { 'hnsw:space': 'cosine' },
      });
      await collection.delete({ ids: [addedId] }).catch(() => {});
    }
  }


  section('O. the search_chat_history tool receives an identity');

  {
    const {
      search_chat_history,
      setSearchRuntimeContext,
      clearSearchRuntimeContext,
      getSemanticSearchTool,
    } = await import('../src/chat-agent/tools/semanticSearch.js');

    const t = search_chat_history();







    const searchTool = getSemanticSearchTool();
    const realSearch = searchTool.search.bind(searchTool);
    const seen = [];
    searchTool.search = async (params) => {
      seen.push(params);
      return realSearch(params);
    };

    const probeUser = `probe-user-${stamp}`;
    const probeChat = `probe-chat-${stamp}`;

    try {
      clearSearchRuntimeContext();
      await t.invoke({ query: 'anything' });
      if (seen.length === 0) {
        ok('the tool without an identity does not run a search (returns the empty result)');
      } else {
        bad(
          'the tool without an identity does not run a search',
          `searched with userId=${JSON.stringify(seen[0].userId)}`,
        );
      }

      seen.length = 0;
      setSearchRuntimeContext({ userId: probeUser, chatId: probeChat });
      await t.invoke({ query: 'anything' });
      clearSearchRuntimeContext();
      if (seen.length === 1 && seen[0].userId === probeUser) {
        ok('the tool reads its identity from the runtime context');
      } else {
        bad(
          'the tool reads its identity from the runtime context',
          `calls=${seen.length} userId=${JSON.stringify(seen[0]?.userId)}`,
        );
      }


      seen.length = 0;
      clearSearchRuntimeContext();
      await t.invoke(
        { query: 'anything' },
        { configurable: { userId: probeUser, chatId: probeChat } },
      );
      if (seen.length === 1 && seen[0].userId === probeUser) {
        ok('the tool reads its identity from config.configurable');
      } else {
        bad(
          'the tool reads its identity from config.configurable',
          `calls=${seen.length} userId=${JSON.stringify(seen[0]?.userId)}`,
        );
      }
    } finally {
      clearSearchRuntimeContext();
      searchTool.search = realSearch;
    }
  }


  section('O2. the XP award never runs on a released connection');

  {











    const { pool: dbPool } = await import('../src/config/database.js');
    const { getGamificationAgent } = await import('../src/gamification_agent/agent.js');



    const probeClient = await dbPool.connect();
    const clientHasRelease = typeof probeClient.release === 'function';
    probeClient.release();
    if (clientHasRelease) {
      ok('a checked-out pool client exposes .release (the probe heuristic is inverted)');
    } else {
      bad('a checked-out pool client exposes .release', 'heuristic assumption changed');
    }



    const agent = getGamificationAgent();
    const realConnect = dbPool.connect.bind(dbPool);
    let sawBegin = false;
    let sawCommit = false;
    let usedPool = false;
    dbPool.connect = async (...args) => {
      usedPool = true;
      const c = await realConnect(...args);
      const realQuery = c.query.bind(c);
      c.query = async (sql, ...rest) => {
        if (/^\s*BEGIN/i.test(String(sql))) sawBegin = true;
        if (/^\s*COMMIT/i.test(String(sql))) sawCommit = true;
        return realQuery(sql, ...rest);
      };
      return c;
    };

    try {
      await agent.awardXp({
        pool: dbPool,
        userId,
        source: 'chat_message',
        amount: 1,
        metadata: { probe: true },
      });
    } catch (e) {

    } finally {
      dbPool.connect = realConnect;
    }

    if (usedPool) ok('the XP agent acquires its own connection when given a pool');
    else bad('the XP agent acquires its own connection when given a pool', 'no connect() call');

    if (sawBegin && sawCommit) ok('the XP award runs inside its own BEGIN/COMMIT');
    else bad('the XP award runs inside its own BEGIN/COMMIT', `begin=${sawBegin} commit=${sawCommit}`);












    const routerSrc = await readFile(
      new URL('../src/chat-agent/router.js', import.meta.url),
      'utf8'
    );


    const xpCall = routerSrc.match(/awardXpFire\(\s*([^,]+),/);
    if (!xpCall) {
      bad('the router builds a dedicated request for the XP hook', 'no awardXpFire call found');
    } else {
      const arg = xpCall[1].trim();



      let literal = arg;
      if (/^[A-Za-z_$][\w$]*$/.test(arg)) {
        const decl = routerSrc.match(
          new RegExp(`(?:const|let|var)\\s+${arg}\\s*=\\s*(\\{[^}]*\\})`)
        );
        literal = decl ? decl[1] : arg;
      }



      if (/\bdb\s*:\s*undefined/.test(literal)) {
        ok('the router neutralises req.db before handing it to the XP hook');
      } else {
        bad(
          'the router neutralises req.db before handing it to the XP hook',
          `the hook receives: ${literal.slice(0, 90)}`,
        );
      }
    }
  }


  section('O3. a real chat turn awards XP');

  {








    const xpChat = await api('POST', '/chat', { title: 'XP probe' });
    const xpChatId = xpChat.body?.id;

    const before = await db.query(
      `SELECT COUNT(*)::int AS cnt FROM public.xp_events
       WHERE user_id = $1 AND source = 'chat_message'`,
      [userId]
    );

    const turn = await api('POST', `/chat/${xpChatId}/message?stream=false`, {
      content: 'xp probe: reply with a single short word',
    });


    await new Promise((r) => setTimeout(r, 2500));

    const after = await db.query(
      `SELECT COUNT(*)::int AS cnt FROM public.xp_events
       WHERE user_id = $1 AND source = 'chat_message'`,
      [userId]
    );






    const llmDown = turn.status !== 200;
    if (llmDown) {
      skip(
        `the chat turn wrote an XP event — the LLM did not answer (HTTP ${turn.status}), and a failed turn earns no XP by design`,
      );
    } else if (after.rows[0].cnt > before.rows[0].cnt) {
      ok('the chat turn wrote an XP event');
    } else {
      bad(
        'the chat turn wrote an XP event',
        `count stayed at ${after.rows[0].cnt} (the award was silently lost)`,
      );
    }

    await db.query('DELETE FROM chat_agent.chats WHERE id = $1', [xpChatId]);
  }


  section('O4. XP is awarded if and only if the turn produced a reply');

  {












    const xpChat = await api('POST', '/chat', { title: 'XP conditional probe' });
    const xpChatId = xpChat.body?.id;

    const xpCount = async () => {
      const { rows } = await db.query(
        `SELECT COUNT(*)::int AS cnt FROM public.xp_events
         WHERE user_id = $1 AND source = 'chat_message'`,
        [userId],
      );
      return rows[0].cnt;
    };

    const before = await xpCount();


    const streamRes = await api('POST', `/chat/${xpChatId}/message?stream=true`, {
      content: 'xp conditional probe: reply with a single short word',
    });
    const streamBody = streamRes.text || '';

    await new Promise((r) => setTimeout(r, 2500));



    const turnFailed = /event:\s*error/.test(streamBody);
    const turnProducedReply = !turnFailed && /event:\s*end/.test(streamBody);

    const after = await xpCount();
    const awarded = after > before;

    if (turnProducedReply && awarded) {
        ok('a successful streaming turn awards XP');
    } else if (!turnProducedReply && !awarded) {
        ok('a FAILED streaming turn awards NO XP');
    } else if (turnProducedReply && !awarded) {
        bad('a successful streaming turn awards XP', `count stayed at ${after}`);
    } else {
        bad(
            'a FAILED streaming turn awards NO XP',
            `XP was awarded (${before} -> ${after}) for a turn that failed: ${streamBody.slice(0, 160).replace(/\n/g, ' | ')}`,
        );
    }

    await db.query('DELETE FROM chat_agent.chats WHERE id = $1', [xpChatId]);
  }


  section('P. the Gemini tool schemas are accepted by the API');

  {



    const { zodToJsonSchema } = await import('zod-to-json-schema');
    const { z } = await import('zod');

    const schemas = {
      search_chat_history: (await import('../src/chat-agent/tools/semanticSearch.js')).search_chat_history,
      course_materials_search: (await import('../src/chat-agent/tools/courseMaterialsSearch.js')).course_materials_search,
      wikipedia_search: (await import('../src/chat-agent/tools/wikipedia.js')).wikipedia_search,
      duckduckgo_search: (await import('../src/chat-agent/tools/duckduckgoSearch.js')).duckduckgo_search,
      generate_validated_code: (await import('../src/chat-agent/tools/validatedCodeGen.js')).generate_validated_code,
      generate_learning_content: (await import('../src/chat-agent/tools/contentGen.js')).generate_learning_content,
    };

    for (const [name, factory] of Object.entries(schemas)) {
      const t = factory();
      const json = zodToJsonSchema(t.schema, { target: 'jsonSchema7' });
      const text = JSON.stringify(json);
      const offenders = [];
      if (text.includes('exclusiveMinimum')) offenders.push('exclusiveMinimum');
      if (/"type":\s*\[[^\]]*"null"/.test(text)) offenders.push('type:[...,null]');
      if (offenders.length === 0) ok(`${name}: the schema has no Gemini-rejected keywords`);
      else bad(`${name}: the schema has no Gemini-rejected keywords`, offenders.join(', '));
    }
    void z;
  }


  section('Q. the model fallback chain is configured');

  {
    const { settings } = await import('../src/config/settings.js');

    const primary = settings.GEMINI_MODEL;
    const fallbacks = (settings.GEMINI_FALLBACK_MODELS || '')
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean);


    if (primary !== 'gemini-2.5-flash' && primary !== 'gemini-3-pro-preview') {
      ok(`the primary model is not a retired id (${primary})`);
    } else {
      bad('the primary model is not a retired id', primary);
    }

    if (fallbacks.length > 0) ok(`there are ${fallbacks.length} fallback models configured`);
    else bad('there are fallback models configured', 'GEMINI_FALLBACK_MODELS is empty');

    const distinct = new Set([primary, ...fallbacks]);
    if (distinct.size === [primary, ...fallbacks].length) {
      ok('the fallback list has no duplicates');
    } else {
      bad('the fallback list has no duplicates', 'a model is listed twice');
    }
  }


  section('R. the live model round-trip (optional)');

  if (!WITH_LLM) {
    skip('set DASHBOARD_E2E_LLM=1 to run the live Gemini round-trip');
  } else {
    const res = await api('POST', `/chat/${chatId}/message?stream=false`, {
      content: 'Reply with exactly: pong',
    });
    if (res.status === 200) {
      const reply = res.body?.reply || '';
      if (reply && !/^\s*\{/.test(reply)) {
        ok(`the reply is plain prose, not a JSON envelope: ${JSON.stringify(reply.slice(0, 60))}`);
      } else if (/^\s*\{/.test(reply)) {
        bad('the reply is plain prose, not a JSON envelope', `got ${reply.slice(0, 80)}`);
      } else {
        ok('the request succeeded');
      }

      const rows = await messageRows(chatId);
      const userMsg = rows.filter((r) => r.role === 'user' && r.content === 'Reply with exactly: pong');
      const assistantMsg = rows.filter((r) => r.role === 'assistant');
      if (userMsg.length === 1) ok('the user message was persisted');
      else bad('the user message was persisted', `found ${userMsg.length}`);
      if (assistantMsg.length > 0) ok('the assistant message was persisted');
      else bad('the assistant message was persisted', 'none found');
    } else if (res.status === 429) {
      skip('the live model call hit the free-tier daily quota (429) — not a failure');
    } else {
      bad('the live model call succeeded', `got ${res.status}: ${res.text.slice(0, 200)}`);
    }
  }


  section('S. DELETE /chat/:id');

  {
    const res = await api('DELETE', `/chat/${chatId}`);
    if (res.status === 204) ok('DELETE /chat/:id → 204');
    else bad('DELETE /chat/:id → 204', `got ${res.status}`);

    const { rows } = await db.query(
      'SELECT COUNT(*)::int c FROM chat_agent.chats WHERE id = $1',
      [chatId],
    );
    if (rows[0].c === 0) ok('the chat row is gone (the delete was committed)');
    else bad('the chat row is gone (the delete was committed)', 'still present');

    const msgs = await db.query(
      'SELECT COUNT(*)::int c FROM chat_agent.messages WHERE chat_id = $1',
      [chatId],
    );
    if (msgs.rows[0].c === 0) ok('the messages were cascaded away');
    else bad('the messages were cascaded away', `${msgs.rows[0].c} left`);
  }
} catch (e) {
  bad('the suite ran to completion', e.message);
  console.error(e);
} finally {
  section('Cleanup');
  try {
    await db.query('DELETE FROM chat_agent.chats WHERE user_id = $1', [userId]);
    await db.query('DELETE FROM public.profiles WHERE id = $1', [userId]);
    const leftover = await db.query(
      `SELECT COUNT(*)::int c FROM public.profiles WHERE email LIKE 'dashapi-%'`,
    );
    if (leftover.rows[0].c === 0) ok('no test profiles left behind');
    else bad('no test profiles left behind', `${leftover.rows[0].c} left`);
  } catch (e) {
    bad('cleanup', e.message);
  }
  await db.end();
}

console.log(`\n${'='.repeat(60)}`);
console.log(`  dashboard API suite: ${passed} passed, ${failed} failed`);
console.log('='.repeat(60));
process.exit(failed > 0 ? 1 : 0);

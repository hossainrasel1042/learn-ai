
































import 'dotenv/config';
import pg from 'pg';

import { API_BASE, createTestUser, bypassHeaders } from './_testAuth.js';

let passed = 0;
let failed = 0;
const ok = (m) => { console.log(`  ✓ ${m}`); passed++; };
const bad = (m, e) => { console.log(`  ✗ ${m}${e ? `: ${e}` : ''}`); failed++; };
const info = (m) => console.log(`  – ${m}`);
const section = (m) => console.log(`\n--- ${m} ---`);

const db = new pg.Client({ connectionString: process.env.DB_URL });
await db.connect();

const stamp = Date.now();
const email = `learnsuite-${stamp}@e2e.local`;
const password = 'LearnSuite-2026!';

let token = null;
let userId = null;
const createdQuizSetIds = [];
const createdDeckIds = [];
const createdMindMapIds = [];
let seededChatId = null;
let otherUserId = null;

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


async function seedCard(deckId, ownerId, front = 'What is a relational database?') {
  const r = await db.query(
    `INSERT INTO public.flashcards
       (deck_id, user_id, front, back, tags, ease_factor, interval_days, repetitions, due_at)
     VALUES ($1, $2, $3, 'A table-based store', ARRAY['db','basics'], 2.5, 0, 0, now())
     RETURNING id`,
    [deckId, ownerId, front],
  );

  await db.query(
    `UPDATE public.flashcard_decks
     SET card_count = (SELECT COUNT(*)::int FROM public.flashcards WHERE deck_id = $1)
     WHERE id = $1`,
    [deckId],
  );
  return r.rows[0].id;
}

async function seedQuestion(quizSetId, ownerId, position, prompt, correct = 'B') {
  const r = await db.query(
    `INSERT INTO public.quiz_questions
       (quiz_set_id, user_id, position, prompt, option_a, option_b, option_c, option_d,
        correct, explanation, tags, difficulty)
     VALUES ($1, $2, $3, $4, 'A file cabinet', 'A table-based store', 'A text editor',
             'A compiler', $5, 'Relational databases store data in tables.',
             ARRAY['db','basics'], 'easy')
     RETURNING id`,
    [quizSetId, ownerId, position, prompt, correct],
  );
  await db.query(
    `UPDATE public.quiz_sets
     SET question_count = (SELECT COUNT(*)::int FROM public.quiz_questions WHERE quiz_set_id = $1)
     WHERE id = $1`,
    [quizSetId],
  );
  return r.rows[0].id;
}

try {
  console.log(`\nLearning-suite verification against ${API_BASE}`);

  const user = await createTestUser(email, password, db);
  token = user.token;
  userId = user.userId;
  ok(`test user created (${email})`);


  section('1. health endpoints (no auth required)');

  for (const [label, path] of [
    ['quiz', '/quiz/health'],
    ['srs', '/srs/health'],
    ['mindmaps', '/mindmaps/health'],
  ]) {
    const h = await api('GET', path, undefined, null);
    if (h.status === 200 && h.body?.status === 'ok') {
      ok(`GET ${path} -> 200 (status: ok)`);
    } else {
      bad(`GET ${path} -> 200 (status: ok)`, `${h.status} ${h.text.slice(0, 160)}`);
    }
  }


  section('2. flashcard decks — the full CRUD surface');

  const deckRes = await api('POST', '/srs/decks', {
    title: 'LearnSuite Deck',
    description: 'created by verify-learning-suite.mjs',
    sourceType: 'manual',
  });
  if (deckRes.status === 201 && deckRes.body?.deck?.id) {
    ok('POST /srs/decks -> 201');
  } else {
    bad('POST /srs/decks -> 201', `${deckRes.status} ${deckRes.text.slice(0, 200)}`);
    throw new Error('cannot continue without a deck');
  }
  const deckId = deckRes.body.deck.id;
  createdDeckIds.push(deckId);

  const DECK_KEYS = ['id', 'userId', 'title', 'description', 'sourceType', 'sourceId',
    'cardCount', 'createdAt', 'updatedAt'];
  if (JSON.stringify(Object.keys(deckRes.body.deck)) === JSON.stringify(DECK_KEYS)) {
    ok('deck keys match the Deck type');
  } else {
    bad('deck keys match the Deck type', `got ${JSON.stringify(Object.keys(deckRes.body.deck))}`);
  }
  if (deckRes.body.deck.userId === userId) ok('deck.userId is the caller');
  else bad('deck.userId is the caller', `got ${deckRes.body.deck.userId}`);


  const decksRes = await api('GET', '/srs/decks?page=1&pageSize=20');
  if (decksRes.status === 200 && Array.isArray(decksRes.body?.decks)) {
    ok(`GET /srs/decks -> 200 (${decksRes.body.decks.length} deck(s), total ${decksRes.body.total})`);
  } else {
    bad('GET /srs/decks -> 200 with a `decks` array',
      `${decksRes.status} ${decksRes.text.slice(0, 200)}`);
  }
  if (decksRes.body?.decks?.some((d) => d.id === deckId)) {
    ok('the new deck appears in the list');
  } else {
    bad('the new deck appears in the list', 'it was not returned');
  }


  const patched = await api('PATCH', `/srs/decks/${deckId}`, {
    title: 'LearnSuite Deck (edited)',
    description: 'edited description',
  });
  if (patched.status === 200 && patched.body?.deck) {
    ok('PATCH /srs/decks/:id -> 200');
  } else {
    bad('PATCH /srs/decks/:id -> 200', `${patched.status} ${patched.text.slice(0, 200)}`);
  }
  const deckRow = await db.query(
    'SELECT title, description FROM public.flashcard_decks WHERE id = $1',
    [deckId],
  );
  if (deckRow.rows[0]?.title === 'LearnSuite Deck (edited)') {
    ok('the deck edit was persisted');
  } else {
    bad('the deck edit was persisted', `title is "${deckRow.rows[0]?.title}"`);
  }


  const statsRes = await api('GET', `/srs/decks/${deckId}/stats`);
  if (statsRes.status === 200 && statsRes.body && typeof statsRes.body === 'object') {
    ok(`GET /srs/decks/:id/stats -> 200 (${JSON.stringify(statsRes.body)})`);
  } else {
    bad('GET /srs/decks/:id/stats -> 200', `${statsRes.status} ${statsRes.text.slice(0, 200)}`);
  }


  section('3. flashcard cards — fetch, due list, review, delete');

  const cardId = await seedCard(deckId, userId);

  const cardRes = await api('GET', `/srs/cards/${cardId}`);
  if (cardRes.status === 200 && cardRes.body?.card?.id === cardId) {
    ok('GET /srs/cards/:id -> 200');
  } else {
    bad('GET /srs/cards/:id -> 200', `${cardRes.status} ${cardRes.text.slice(0, 200)}`);
  }
  const CARD_KEYS = ['id', 'deckId', 'userId', 'front', 'back', 'tags', 'easeFactor',
    'intervalDays', 'repetitions', 'dueAt', 'lastReviewed', 'createdAt'];
  if (JSON.stringify(Object.keys(cardRes.body?.card || {})) === JSON.stringify(CARD_KEYS)) {
    ok('card keys match the Card type');
  } else {
    bad('card keys match the Card type', `got ${JSON.stringify(Object.keys(cardRes.body?.card || {}))}`);
  }


  const dueRes = await api('GET', `/srs/due?deckId=${deckId}&limit=10`);
  if (dueRes.status === 200 && Array.isArray(dueRes.body?.cards)) {
    ok(`GET /srs/due -> 200 (${dueRes.body.cards.length} due)`);
  } else {
    bad('GET /srs/due -> 200 with a `cards` array', `${dueRes.status} ${dueRes.text.slice(0, 200)}`);
  }
  if (dueRes.body?.cards?.some((c) => c.id === cardId)) {
    ok('the seeded card is reported as due');
  } else {
    bad('the seeded card is reported as due', 'it was not returned');
  }


  const reviewRes = await api('POST', '/srs/review', { cardId, rating: 3 });
  if (reviewRes.status === 200 && reviewRes.body?.card && reviewRes.body?.review) {
    ok('POST /srs/review -> 200');
  } else {
    bad('POST /srs/review -> 200', `${reviewRes.status} ${reviewRes.text.slice(0, 200)}`);
  }
  if (reviewRes.body?.review?.newInterval > reviewRes.body?.review?.prevInterval) {
    ok(`SM-2 pushed the interval out (${reviewRes.body.review.prevInterval} -> ${reviewRes.body.review.newInterval} days)`);
  } else {
    bad('SM-2 pushed the interval out',
      `${reviewRes.body?.review?.prevInterval} -> ${reviewRes.body?.review?.newInterval}`);
  }
  const dueAfter = await api('GET', `/srs/due?deckId=${deckId}&limit=10`);
  if (!dueAfter.body?.cards?.some((c) => c.id === cardId)) {
    ok('the reviewed card is no longer due');
  } else {
    bad('the reviewed card is no longer due', 'it is still in the due list');
  }




  const ratingCardId = await seedCard(deckId, userId, 'What is SM-2 scheduling?');
  for (const rating of [0, 2, 3, 4]) {
    const r = await api('POST', '/srs/review', { cardId: ratingCardId, rating });
    if (r.status === 200) ok(`POST /srs/review with rating ${rating} -> 200`);
    else bad(`POST /srs/review with rating ${rating} -> 200`, `${r.status} ${r.text.slice(0, 160)}`);
  }
  const ratingOne = await api('POST', '/srs/review', { cardId: ratingCardId, rating: 1 });
  if (ratingOne.status === 400) ok('POST /srs/review with rating 1 -> 400 (there is no rating 1)');
  else bad('POST /srs/review with rating 1 -> 400', `got ${ratingOne.status}`);


  const delCard = await api('DELETE', `/srs/cards/${cardId}`);
  if (delCard.status === 204) ok('DELETE /srs/cards/:id -> 204');
  else bad('DELETE /srs/cards/:id -> 204', `${delCard.status} ${delCard.text.slice(0, 200)}`);
  const goneCard = await db.query('SELECT id FROM public.flashcards WHERE id = $1', [cardId]);
  if (goneCard.rows.length === 0) ok('the card row is really gone');
  else bad('the card row is really gone', 'the row still exists');




  const deckGen = await api('POST', `/srs/decks/${deckId}/generate`, {
    sourceType: 'manual',
    text: 'The mitochondria is the organelle that produces ATP through oxidative phosphorylation. The inner mitochondrial membrane folds into cristae to increase the surface area available for the electron transport chain. NADH and FADH2 donate electrons that drive the proton gradient across the membrane.',
    cardCount: 4,
  });
  if (deckGen.status === 200) {
    ok('POST /srs/decks/:id/generate -> 200');
    if (deckGen.body?.cards?.length) {
      ok(`the generated deck has ${deckGen.body.cards.length} card(s)`);
    } else {
      bad('the generated deck has cards', 'the card list is empty');
    }
    if (deckGen.body?.generatedBy === 'ai' || deckGen.body?.generatedBy === 'local') {
      ok(`the generate response reports generatedBy="${deckGen.body.generatedBy}"`);
    } else {
      bad('the generate response reports generatedBy', `got ${JSON.stringify(deckGen.body?.generatedBy)}`);
    }


    const blank = (deckGen.body?.cards || []).filter(
      (c) => !c.front?.trim() || !c.back?.trim(),
    );
    if (blank.length === 0) ok('every generated card has a front and a back');
    else bad('every generated card has a front and a back', `${blank.length} blank`);
  } else {
    bad('POST /srs/decks/:id/generate', `${deckGen.status} ${deckGen.text.slice(0, 200)}`);
  }


  section('4. ownership isolation — a second user must not see the first user\'s rows');

  const otherEmail = `learnsuite-other-${stamp}@e2e.local`;
  const other = await createTestUser(otherEmail, 'LearnSuite-2026!', db);
  otherUserId = other.userId;






  const chatSeed = await db.query(
    `INSERT INTO chat_agent.chats (user_id, title) VALUES ($1, 'LearnSuite Chat') RETURNING id`,
    [userId],
  );
  seededChatId = chatSeed.rows[0].id;
  await db.query(
    `INSERT INTO chat_agent.messages (chat_id, role, content)
     VALUES ($1, 'user', $2), ($1, 'assistant', $3)`,
    [
      seededChatId,
      'What is a relational database and how does it store data?',
      'A relational database stores data in tables of rows and columns, keyed by primary keys and related through foreign keys.',
    ],
  );





  const chatList = await api('GET', '/chat?page=1&pageSize=100');
  if (chatList.status === 200 && Array.isArray(chatList.body?.chats)) {
    ok(`GET /chat -> 200 with the \`chats\` array (${chatList.body.chats.length})`);
  } else {
    bad('GET /chat -> 200 with the `chats` array', `${chatList.status} ${chatList.text.slice(0, 200)}`);
  }
  if (chatList.body?.pageSize === 100) ok('GET /chat honours pageSize (the response echoes 100)');
  else bad('GET /chat honours pageSize (the response echoes 100)', `got ${chatList.body?.pageSize}`);

  const foreignChatDeck = await api('POST', '/srs/decks', {
    title: 'LearnSuite foreign chat',
    sourceType: 'chat',
    sourceId: seededChatId,
  }, other.token);
  const foreignChatDeckId = foreignChatDeck.body?.deck?.id;
  if (foreignChatDeckId) createdDeckIds.push(foreignChatDeckId);
  const foreignChatGen = await api('POST', `/srs/decks/${foreignChatDeckId}/generate`, {
    sourceType: 'chat',
    sourceId: seededChatId,
    cardCount: 3,
  }, other.token);
  if (foreignChatGen.status === 400) {
    ok("another user's chat is not readable as a source (400)");
  } else {
    bad(
      "another user's chat is not readable as a source (400)",
      `got ${foreignChatGen.status} ${foreignChatGen.text.slice(0, 200)}`,
    );
  }


  const ownChatDeck = await api('POST', '/srs/decks', {
    title: 'LearnSuite own chat',
    sourceType: 'chat',
    sourceId: seededChatId,
  });
  const ownChatDeckId = ownChatDeck.body?.deck?.id;
  if (ownChatDeckId) createdDeckIds.push(ownChatDeckId);
  const ownChatGen = await api('POST', `/srs/decks/${ownChatDeckId}/generate`, {
    sourceType: 'chat',
    sourceId: seededChatId,
    cardCount: 3,
  });
  if (ownChatGen.status === 200) {
    ok("the owner can still use their own chat as a source (200)");
  } else {
    bad(
      "the owner can still use their own chat as a source (200)",
      `got ${ownChatGen.status} ${ownChatGen.text.slice(0, 200)}`,
    );
  }

  const foreignDeck = await api('GET', `/srs/decks/${deckId}`, undefined, other.token);
  if (foreignDeck.status === 404) ok("another user's deck is not readable (404)");
  else bad("another user's deck is not readable (404)", `got ${foreignDeck.status}`);

  const foreignDelete = await api('DELETE', `/srs/decks/${deckId}`, undefined, other.token);
  if (foreignDelete.status === 404) ok("another user cannot delete the deck (404)");
  else bad("another user cannot delete the deck (404)", `got ${foreignDelete.status}`);

  const foreignCard = await api('GET', `/srs/cards/${cardId}`, undefined, other.token);
  if (foreignCard.status === 404) ok("another user's card is not readable (404)");
  else bad("another user's card is not readable (404)", `got ${foreignCard.status}`);


  section('5. quiz — PATCH /sets/:id and POST /attempts/:id/to-srs');

  const setRes = await api('POST', '/quiz/sets', {
    title: 'LearnSuite Quiz',
    sourceType: 'manual',
  });
  if (setRes.status === 201 && setRes.body?.set?.id) ok('POST /quiz/sets -> 201');
  else {
    bad('POST /quiz/sets -> 201', `${setRes.status} ${setRes.text.slice(0, 200)}`);
    throw new Error('cannot continue without a quiz set');
  }
  const setId = setRes.body.set.id;
  createdQuizSetIds.push(setId);


  const setPatch = await api('PATCH', `/quiz/sets/${setId}`, {
    title: 'LearnSuite Quiz (edited)',
    description: 'edited description',
  });
  if (setPatch.status === 200 && setPatch.body?.set) {
    ok('PATCH /quiz/sets/:id -> 200');
  } else {
    bad('PATCH /quiz/sets/:id -> 200', `${setPatch.status} ${setPatch.text.slice(0, 200)}`);
  }
  const setRow = await db.query('SELECT title FROM public.quiz_sets WHERE id = $1', [setId]);
  if (setRow.rows[0]?.title === 'LearnSuite Quiz (edited)') ok('the quiz edit was persisted');
  else bad('the quiz edit was persisted', `title is "${setRow.rows[0]?.title}"`);



  const q1 = await seedQuestion(setId, userId, 1, 'What is a relational database?', 'B');
  const q2 = await seedQuestion(setId, userId, 2, 'What is a primary key?', 'A');

  const attemptRes = await api('POST', '/quiz/attempts', { quizSetId: setId });
  if (attemptRes.status === 201 && attemptRes.body?.attempt?.id) {
    ok('POST /quiz/attempts -> 201');
  } else {
    bad('POST /quiz/attempts -> 201', `${attemptRes.status} ${attemptRes.text.slice(0, 200)}`);
    throw new Error('cannot continue without an attempt');
  }
  const attemptId = attemptRes.body.attempt.id;

  await api('POST', `/quiz/attempts/${attemptId}/answers`, {
    questionId: q1, selected: 'A', timeSeconds: 2,
  });
  await api('POST', `/quiz/attempts/${attemptId}/answers`, {
    questionId: q2, selected: 'A', timeSeconds: 2,
  });
  const finishRes = await api('POST', `/quiz/attempts/${attemptId}/finish`, { durationSeconds: 4 });
  if (finishRes.status === 200) ok('POST /quiz/attempts/:id/finish -> 200');
  else bad('POST /quiz/attempts/:id/finish -> 200', `${finishRes.status} ${finishRes.text.slice(0, 200)}`);





  const setStats = await api('GET', `/quiz/sets/${setId}/stats`);
  if (setStats.status === 200) ok('GET /quiz/sets/:id/stats -> 200');
  else bad('GET /quiz/sets/:id/stats -> 200', `${setStats.status} ${setStats.text.slice(0, 200)}`);

  const STATS_KEYS = ['attempts', 'best_score', 'avg_score', 'total_correct',
    'total_questions', 'last_taken'];
  if (JSON.stringify(Object.keys(setStats.body || {}).sort()) === JSON.stringify(STATS_KEYS.slice().sort())) {
    ok('the stats response is the bare stats object (not the set detail envelope)');
  } else {
    bad('the stats response is the bare stats object (not the set detail envelope)',
      `got keys ${JSON.stringify(Object.keys(setStats.body || {}))}`);
  }
  if (setStats.body?.attempts === 1) ok('the stats count the finished attempt (1)');
  else bad('the stats count the finished attempt (1)', `got ${setStats.body?.attempts}`);
  if (setStats.body?.total_questions === 2) ok('the stats count the answered questions (2)');
  else bad('the stats count the answered questions (2)', `got ${setStats.body?.total_questions}`);


  const foreignStats = await api('GET', `/quiz/sets/${setId}/stats`, undefined, other.token);
  if (foreignStats.status === 404) ok("another user's quiz stats are not readable (404)");
  else bad("another user's quiz stats are not readable (404)", `got ${foreignStats.status}`);



  const setDetail = await api('GET', `/quiz/sets/${setId}`);
  if (setDetail.status === 200 && setDetail.body?.set?.id === setId && Array.isArray(setDetail.body?.questions)) {
    ok('GET /quiz/sets/:id still returns the detail envelope');
  } else {
    bad('GET /quiz/sets/:id still returns the detail envelope',
      `${setDetail.status} ${setDetail.text.slice(0, 200)}`);
  }


  const toSrs = await api('POST', `/quiz/attempts/${attemptId}/to-srs`);
  if (toSrs.status === 200) ok('POST /quiz/attempts/:id/to-srs -> 200');
  else bad('POST /quiz/attempts/:id/to-srs -> 200', `${toSrs.status} ${toSrs.text.slice(0, 200)}`);
  if (toSrs.body?.srsDeck?.id) {
    ok(`to-srs built a deck from the wrong answers (${toSrs.body.inserted} card(s))`);
    createdDeckIds.push(toSrs.body.srsDeck.id);
    const deckExists = await db.query(
      'SELECT id FROM public.flashcard_decks WHERE id = $1',
      [toSrs.body.srsDeck.id],
    );
    if (deckExists.rows.length === 1) ok('the to-srs deck row was really committed');
    else bad('the to-srs deck row was really committed', 'the row does not exist');
  } else {
    bad('to-srs built a deck from the wrong answers', `body: ${toSrs.text.slice(0, 200)}`);
  }


  section('6. mind maps — delete, envelope keys, and generate');

  const mmRes = await api('POST', '/mindmaps', {
    title: 'LearnSuite Map',
    description: 'created by verify-learning-suite.mjs',
    sourceType: 'manual',
  });
  if (mmRes.status === 201) ok('POST /mindmaps -> 201');
  else bad('POST /mindmaps -> 201', `${mmRes.status} ${mmRes.text.slice(0, 200)}`);




  if (mmRes.body?.mindMap?.id) ok('the create response uses the `mindMap` envelope key');
  else bad('the create response uses the `mindMap` envelope key',
    `got keys ${JSON.stringify(Object.keys(mmRes.body || {}))}`);

  const mmId = mmRes.body?.mindMap?.id;
  if (mmId) createdMindMapIds.push(mmId);

  const mmDetail = await api('GET', `/mindmaps/${mmId}`);
  if (mmDetail.status === 200 && mmDetail.body?.mindMap?.id === mmId) {
    ok('GET /mindmaps/:id -> 200 with the `mindMap` envelope key');
  } else {
    bad('GET /mindmaps/:id -> 200 with the `mindMap` envelope key',
      `${mmDetail.status} ${mmDetail.text.slice(0, 200)}`);
  }
  const MM_KEYS = ['id', 'userId', 'title', 'description', 'sourceType', 'sourceId',
    'rootConcept', 'nodeCount', 'graph', 'createdAt', 'updatedAt'];
  if (JSON.stringify(Object.keys(mmDetail.body?.mindMap || {})) === JSON.stringify(MM_KEYS)) {
    ok('mind map keys match the MindMap type');
  } else {
    bad('mind map keys match the MindMap type', `got ${JSON.stringify(Object.keys(mmDetail.body?.mindMap || {}))}`);
  }

  const mmList = await api('GET', '/mindmaps?page=1&pageSize=20');
  if (mmList.status === 200 && Array.isArray(mmList.body?.mindMaps)) {
    ok(`GET /mindmaps -> 200 with the \`mindMaps\` array (${mmList.body.mindMaps.length})`);
  } else {
    bad('GET /mindmaps -> 200 with the `mindMaps` array', `${mmList.status} ${mmList.text.slice(0, 200)}`);
  }




  const mmPage = await api('GET', '/mindmaps?page=1&pageSize=1');
  if (mmPage.status === 200 && mmPage.body?.mindMaps?.length <= 1) {
    ok('GET /mindmaps honours pageSize (a page of 1 returned <= 1 map)');
  } else {
    bad('GET /mindmaps honours pageSize',
      `got ${mmPage.body?.mindMaps?.length} maps for pageSize=1`);
  }
  if (mmPage.body?.pageSize === 1) ok('the response echoes the requested pageSize');
  else bad('the response echoes the requested pageSize', `got ${mmPage.body?.pageSize}`);




  const mmGen = await api('POST', `/mindmaps/${mmId}/generate`, {
    sourceType: 'manual',
    text: 'Photosynthesis is the process by which green plants convert light energy into chemical energy stored as sugars. Chlorophyll in the chloroplasts absorbs light, mostly in the blue and red wavelengths, and the Calvin cycle fixes carbon dioxide into glucose.',
    nodeCount: 5,
  });
  if (mmGen.status === 200) {
    ok('POST /mindmaps/:id/generate -> 200');
    if (mmGen.body?.graph?.nodes?.length) {
      ok(`the generated map has ${mmGen.body.graph.nodes.length} node(s)`);
    } else {
      bad('the generated map has nodes', 'the graph is empty');
    }


    const mmNodes = mmGen.body?.graph?.nodes || [];
    const mmIds = new Set(mmNodes.map((n) => n.id));
    const mmRoots = mmNodes.filter((n) => n.parent === null);
    if (mmRoots.length === 1) ok('the generated graph has exactly one root');
    else bad('the generated graph has exactly one root', `found ${mmRoots.length}`);
    const mmDangling = mmNodes.filter((n) => n.parent !== null && !mmIds.has(n.parent));
    if (mmDangling.length === 0) ok('every generated node points at an existing parent');
    else bad('every generated node points at an existing parent', `${mmDangling.length} dangling`);
    if (mmGen.body?.generatedBy === 'ai' || mmGen.body?.generatedBy === 'local') {
      ok(`the generate response reports generatedBy="${mmGen.body.generatedBy}"`);
    } else {
      bad('the generate response reports generatedBy', `got ${JSON.stringify(mmGen.body?.generatedBy)}`);
    }
  } else {
    bad('POST /mindmaps/:id/generate', `${mmGen.status} ${mmGen.text.slice(0, 200)}`);
  }


  const delMm = await api('DELETE', `/mindmaps/${mmId}`);
  if (delMm.status === 204) ok('DELETE /mindmaps/:id -> 204');
  else bad('DELETE /mindmaps/:id -> 204', `${delMm.status} ${delMm.text.slice(0, 200)}`);
  const goneMm = await db.query('SELECT id FROM public.mind_maps WHERE id = $1', [mmId]);
  if (goneMm.rows.length === 0) ok('the mind map row is really gone');
  else bad('the mind map row is really gone', 'the row still exists');
  createdMindMapIds.pop();

  const delMmAgain = await api('DELETE', `/mindmaps/${mmId}`);
  if (delMmAgain.status === 404) ok('deleting a deleted mind map -> 404');
  else bad('deleting a deleted mind map -> 404', `got ${delMmAgain.status}`);


  section('7. flashcard deck delete cascade');

  const delDeck = await api('DELETE', `/srs/decks/${deckId}`);
  if (delDeck.status === 204) ok('DELETE /srs/decks/:id -> 204');
  else bad('DELETE /srs/decks/:id -> 204', `${delDeck.status} ${delDeck.text.slice(0, 200)}`);
  const goneDeck = await db.query('SELECT id FROM public.flashcard_decks WHERE id = $1', [deckId]);
  if (goneDeck.rows.length === 0) ok('the deck row is really gone');
  else bad('the deck row is really gone', 'the row still exists');


  section('8. validation and error paths');

  const noAuth = await fetch(`${API_BASE}/srs/decks`, {
    headers: { 'Content-Type': 'application/json' },
  });
  if (noAuth.status === 401) ok('GET /srs/decks without a token -> 401');
  else bad('GET /srs/decks without a token -> 401', `got ${noAuth.status}`);

  const badUuid = await api('GET', '/srs/decks/not-a-uuid');
  if (badUuid.status === 400) ok('GET /srs/decks/:id with a malformed uuid -> 400');
  else bad('GET /srs/decks/:id with a malformed uuid -> 400', `got ${badUuid.status}`);

  const unknownDeck = await api('GET', '/srs/decks/00000000-0000-0000-0000-000000000000');
  if (unknownDeck.status === 404) ok('GET /srs/decks/:id with an unknown id -> 404');
  else bad('GET /srs/decks/:id with an unknown id -> 404', `got ${unknownDeck.status}`);

  const noTitle = await api('POST', '/srs/decks', { description: 'no title' });
  if (noTitle.status === 400) ok('POST /srs/decks without a title -> 400');
  else bad('POST /srs/decks without a title -> 400', `got ${noTitle.status}`);

  const badSource = await api('POST', '/srs/decks', { title: 'x', sourceType: 'note' });
  if (badSource.status === 400) ok("POST /srs/decks with sourceType 'note' -> 400 (the option was removed)");
  else bad("POST /srs/decks with sourceType 'note' -> 400", `got ${badSource.status}`);

  const badRating = await api('POST', '/srs/review', { cardId, rating: 7 });
  if (badRating.status === 400) ok('POST /srs/review with an invalid rating -> 400');
  else bad('POST /srs/review with an invalid rating -> 400', `got ${badRating.status}`);

  const unknownAttempt = await api('POST', '/quiz/attempts/00000000-0000-0000-0000-000000000000/to-srs');
  if (unknownAttempt.status === 404) ok('POST /quiz/attempts/:id/to-srs with an unknown id -> 404');
  else bad('POST /quiz/attempts/:id/to-srs with an unknown id -> 404', `got ${unknownAttempt.status}`);
} finally {
  console.log('\n--- cleanup ---');
  for (const id of createdQuizSetIds) {
    await db.query('DELETE FROM public.quiz_sets WHERE id = $1', [id]).catch(() => {});
  }
  for (const id of createdDeckIds) {
    await db.query('DELETE FROM public.flashcard_decks WHERE id = $1', [id]).catch(() => {});
  }
  for (const id of createdMindMapIds) {
    await db.query('DELETE FROM public.mind_maps WHERE id = $1', [id]).catch(() => {});
  }
  await db.query('DELETE FROM public.quiz_questions WHERE user_id = $1', [userId]).catch(() => {});
  await db.query('DELETE FROM public.flashcards WHERE user_id = $1', [userId]).catch(() => {});
  await db.query('DELETE FROM public.quiz_attempts WHERE user_id = $1', [userId]).catch(() => {});
  if (seededChatId) {
    await db.query('DELETE FROM chat_agent.messages WHERE chat_id = $1', [seededChatId]).catch(() => {});
    await db.query('DELETE FROM chat_agent.chats WHERE id = $1', [seededChatId]).catch(() => {});
  }

  await db.query('DELETE FROM public.flashcards WHERE user_id = $1', [otherUserId]).catch(() => {});
  await db.query('DELETE FROM public.flashcard_decks WHERE user_id = $1', [otherUserId]).catch(() => {});
  await db.query('DELETE FROM public.xp_events WHERE user_id = $1', [userId]).catch(() => {});
  await db.query('DELETE FROM public.user_xp WHERE user_id = $1', [userId]).catch(() => {});
  await db.query('DELETE FROM public.daily_streaks WHERE user_id = $1', [userId]).catch(() => {});
  await db.query('DELETE FROM public.user_badges WHERE user_id = $1', [userId]).catch(() => {});
  await db.query('DELETE FROM public.xp_events WHERE user_id = $1', [otherUserId]).catch(() => {});
  await db.query('DELETE FROM public.user_xp WHERE user_id = $1', [otherUserId]).catch(() => {});
  await db.query('DELETE FROM public.daily_streaks WHERE user_id = $1', [otherUserId]).catch(() => {});
  await db.query('DELETE FROM public.user_badges WHERE user_id = $1', [otherUserId]).catch(() => {});
  await db.query('DELETE FROM public.profiles WHERE email = $1', [email]).catch(() => {});
  await db.query('DELETE FROM public.profiles WHERE email = $1', [`learnsuite-other-${stamp}@e2e.local`]).catch(() => {});
  await db.end().catch(() => {});
  console.log('  ✓ test rows removed');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

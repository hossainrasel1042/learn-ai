




























import 'dotenv/config';
import pg from 'pg';

import { API_BASE, createTestUser, bypassHeaders } from './_testAuth.js';

let passed = 0;
let failed = 0;
const ok = (m) => { console.log(`  ✓ ${m}`); passed++; };
const bad = (m, e) => { console.log(`  ✗ ${m}${e ? `: ${e}` : ''}`); failed++; };
const info = (m) => console.log(`  – ${m}`);

const db = new pg.Client({ connectionString: process.env.DB_URL });
await db.connect();

const stamp = Date.now();
const email = `dbcommit-${stamp}@e2e.local`;
const password = 'DbCommit-2026!';

let token = null;
let userId = null;
const createdPostIds = [];
const createdQuizSetIds = [];

async function api(method, path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...bypassHeaders(),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch {  }
  return { status: res.status, body: parsed, text };
}

try {
  console.log(`\nDB-commit verification against ${API_BASE}`);

  const user = await createTestUser(email, password, db);
  token = user.token;
  userId = user.userId;
  ok(`signed in (user ${userId})`);


  console.log('\n--- community: create a post ---');

  const created = await api('POST', '/community/posts', {
    title: 'DB commit probe',
    content: 'This post must survive the end of the request that created it.',
    category: 'general',
  });
  const postId = created.body?.id || created.body?.post?.id;
  if (created.status === 201 && postId) {
    createdPostIds.push(postId);
    ok(`POST /community/posts -> 201 (post ${postId})`);
  } else {
    bad('POST /community/posts -> 201', `${created.status} ${created.text.slice(0, 200)}`);
  }




  const postRow = await db.query(
    'SELECT id, title, content FROM community_posts WHERE id = $1',
    [postId],
  );
  if (postRow.rows.length === 1) ok('the post row is still in the table after the request ended');
  else bad('the post row is still in the table after the request ended', `found ${postRow.rows.length} rows`);


  console.log('\n--- community: update a post ---');

  const updated = await api('PATCH', `/community/posts/${postId}`, {
    title: 'DB commit probe (edited)',
  });
  if (updated.status === 200) ok('PATCH /community/posts/:id -> 200');
  else bad('PATCH /community/posts/:id -> 200', `${updated.status} ${updated.text.slice(0, 200)}`);

  const afterUpdate = await db.query(
    'SELECT title FROM community_posts WHERE id = $1',
    [postId],
  );
  if (afterUpdate.rows[0]?.title === 'DB commit probe (edited)') {
    ok('the edit was persisted');
  } else {
    bad('the edit was persisted', `title is "${afterUpdate.rows[0]?.title}"`);
  }


  console.log('\n--- community: toggle resolved ---');

  const resolved = await api('PATCH', `/community/posts/${postId}/resolve`);
  if (resolved.status === 200) ok('PATCH /community/posts/:id/resolve -> 200');
  else bad('PATCH /community/posts/:id/resolve -> 200', `${resolved.status} ${resolved.text.slice(0, 200)}`);

  const afterResolve = await db.query(
    'SELECT is_resolved FROM community_posts WHERE id = $1',
    [postId],
  );
  if (afterResolve.rows[0]?.is_resolved === true) ok('the resolved flag was persisted');
  else bad('the resolved flag was persisted', `is_resolved = ${afterResolve.rows[0]?.is_resolved}`);


  console.log('\n--- community: view counter (a write on a GET) ---');

  const before = await db.query(
    'SELECT view_count FROM community_posts WHERE id = $1',
    [postId],
  );
  const beforeCount = Number(before.rows[0]?.view_count ?? 0);

  await api('GET', `/community/posts/${postId}?track_view=true`);

  const after = await db.query(
    'SELECT view_count FROM community_posts WHERE id = $1',
    [postId],
  );
  const afterCount = Number(after.rows[0]?.view_count ?? 0);
  if (afterCount === beforeCount + 1) ok(`the view counter persisted (${beforeCount} → ${afterCount})`);
  else bad('the view counter persisted', `${beforeCount} → ${afterCount} (expected +1)`);


  console.log('\n--- community: create a comment ---');

  const commented = await api('POST', `/community/posts/${postId}/comments`, {
    content: 'A comment that must also survive.',
  });
  const commentId = commented.body?.id || commented.body?.comment?.id;
  if (commented.status === 201 && commentId) ok(`POST /community/posts/:id/comments -> 201 (comment ${commentId})`);
  else bad('POST /community/posts/:id/comments -> 201', `${commented.status} ${commented.text.slice(0, 200)}`);

  const commentRow = await db.query(
    'SELECT id, content FROM community_comments WHERE id = $1',
    [commentId],
  );
  if (commentRow.rows.length === 1) ok('the comment row is still in the table after the request ended');
  else bad('the comment row is still in the table after the request ended', `found ${commentRow.rows.length} rows`);


  console.log('\n--- community: presence heartbeat ---');

  const hb = await api('POST', '/community/presence/heartbeat');
  if (hb.status === 200) ok('POST /community/presence/heartbeat -> 200');
  else bad('POST /community/presence/heartbeat -> 200', `${hb.status} ${hb.text.slice(0, 200)}`);

  const presence = await db.query(
    'SELECT user_id, is_online, last_seen FROM user_presence WHERE user_id = $1',
    [userId],
  );
  if (presence.rows.length === 1 && presence.rows[0].is_online === true) {
    ok('the presence row was persisted');
  } else {
    bad('the presence row was persisted', `found ${presence.rows.length} rows`);
  }


  console.log('\n--- community: delete a comment ---');

  const delComment = await api('DELETE', `/community/comments/${commentId}`);
  if (delComment.status === 204) ok('DELETE /community/comments/:id -> 204');
  else bad('DELETE /community/comments/:id -> 204', `${delComment.status} ${delComment.text.slice(0, 200)}`);

  const goneComment = await db.query(
    'SELECT id FROM community_comments WHERE id = $1',
    [commentId],
  );
  if (goneComment.rows.length === 0) ok('the comment row is really gone (the delete was committed)');
  else bad('the comment row is really gone (the delete was committed)', 'the row still exists');


  console.log('\n--- community: delete a post ---');

  const delPost = await api('DELETE', `/community/posts/${postId}`);
  if (delPost.status === 204) ok('DELETE /community/posts/:id -> 204');
  else bad('DELETE /community/posts/:id -> 204', `${delPost.status} ${delPost.text.slice(0, 200)}`);

  const gonePost = await db.query(
    'SELECT id FROM community_posts WHERE id = $1',
    [postId],
  );
  if (gonePost.rows.length === 0) ok('the post row is really gone (the delete was committed)');
  else bad('the post row is really gone (the delete was committed)', 'the row still exists');


  console.log('\n--- notes: the XP award must persist ---');














  const xpBefore = await db.query(
    "SELECT COALESCE(SUM(amount), 0) AS total FROM xp_events WHERE user_id = $1 AND source = 'quiz_finished'",
    [userId],
  );
  const xpBeforeTotal = Number(xpBefore.rows[0]?.total ?? 0);



  const setRes = await api('POST', '/quiz/sets', { title: 'XP commit probe', sourceType: 'manual' });
  const quizSetId = setRes.body?.set?.id;
  if (!quizSetId) {
    bad('created a quiz set for the XP probe', `${setRes.status} ${setRes.text.slice(0, 200)}`);
  } else {
    createdQuizSetIds.push(quizSetId);

    const q = await db.query(
      `INSERT INTO public.quiz_questions
         (quiz_set_id, user_id, position, prompt, option_a, option_b, option_c, option_d, correct, explanation, tags, difficulty)
       VALUES ($1, $2, 1, 'Probe question?', 'A', 'B', 'C', 'D', 'A', 'Because.', ARRAY['probe'], 'easy')
       RETURNING id`,
      [quizSetId, userId],
    );
    const questionId = q.rows[0]?.id;

    const attemptRes = await api('POST', '/quiz/attempts', { quizSetId });
    const attemptId = attemptRes.body?.attempt?.id;
    if (!attemptId) {
      bad('started an attempt for the XP probe', `${attemptRes.status} ${attemptRes.text.slice(0, 200)}`);
    } else {
      await api('POST', `/quiz/attempts/${attemptId}/answers`, {
        questionId,
        selected: 'A',
        timeSeconds: 3,
      });
      const finishRes = await api('POST', `/quiz/attempts/${attemptId}/finish`, { durationSeconds: 3 });
      if (finishRes.status === 200) ok('POST /quiz/attempts/:id/finish -> 200');
      else bad('POST /quiz/attempts/:id/finish -> 200', `${finishRes.status} ${finishRes.text.slice(0, 200)}`);

      const xpAfter = await db.query(
        "SELECT COALESCE(SUM(amount), 0) AS total FROM xp_events WHERE user_id = $1 AND source = 'quiz_finished'",
        [userId],
      );
      const xpAfterTotal = Number(xpAfter.rows[0]?.total ?? 0);
      if (xpAfterTotal > xpBeforeTotal) {
        ok(`the XP event was committed (${xpBeforeTotal} → ${xpAfterTotal})`);
      } else {
        bad('the XP event was committed', `total stayed at ${xpAfterTotal} — the write was rolled back`);
      }
    }
  }






  const fs = await import('node:fs/promises');
  const agentDir = new URL('../src/', import.meta.url);
  const routers = [
    'quiz_agent/router.js',
    'srs_agent/router.js',
    'mindmap_agent/router.js',
    'community_agent/router.js',
  ];
  let awardCount = 0;
  let commitCount = 0;
  for (const rel of routers) {
    const src = await fs.readFile(new URL(rel, agentDir), 'utf8');
    awardCount += (src.match(/awardXpSafely\(/g) || []).length;
    commitCount += (src.match(/await _commit\(req\)/g) || []).length;
  }
  if (awardCount > 0 && commitCount >= awardCount) {
    ok(`every XP award is followed by a commit (${awardCount} awards, ${commitCount} commits)`);
  } else {
    bad('every XP award is followed by a commit',
      `${awardCount} XP awards but only ${commitCount} commits`);
  }


  console.log('\n--- quiz-battle: writes use the raw pool (autocommit) ---');






  const battleSource = await import('node:fs/promises').then((fs) =>
    fs.readFile(new URL('../src/quiz_battle_agent/router.js', import.meta.url), 'utf8'),
  );
  if (/quizBattleService\(\{\s*pool\b/.test(battleSource)) {
    ok('the quiz-battle service is bound to the raw pool, so its writes autocommit');
  } else {
    bad('the quiz-battle service is bound to the raw pool, so its writes autocommit',
      'the router no longer passes the raw pool to quizBattleService');
  }
} finally {
  for (const id of createdPostIds) {
    await db.query('DELETE FROM community_comments WHERE post_id = $1', [id]).catch(() => {});
    await db.query('DELETE FROM community_posts WHERE id = $1', [id]).catch(() => {});
  }
  for (const id of createdQuizSetIds) {
    await db.query('DELETE FROM public.quiz_sets WHERE id = $1', [id]).catch(() => {});
  }
  await db.query('DELETE FROM community_comments WHERE author_id = $1', [userId]).catch(() => {});
  await db.query('DELETE FROM community_posts WHERE author_id = $1', [userId]).catch(() => {});
  await db.query('DELETE FROM user_presence WHERE user_id = $1', [userId]).catch(() => {});
  await db.query('DELETE FROM xp_events WHERE user_id = $1', [userId]).catch(() => {});
  await db.query('DELETE FROM user_xp WHERE user_id = $1', [userId]).catch(() => {});
  await db.query('DELETE FROM user_badges WHERE user_id = $1', [userId]).catch(() => {});
  await db.query('DELETE FROM daily_streaks WHERE user_id = $1', [userId]).catch(() => {});
  await db.query('DELETE FROM public.profiles WHERE email = $1', [email]).catch(() => {});
  await db.end().catch(() => {});
  console.log('\n  ✓ test rows removed');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

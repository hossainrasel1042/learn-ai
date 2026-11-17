







































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
const email = `communitysuite-${stamp}@e2e.local`;
const otherEmail = `communitysuite-other-${stamp}@e2e.local`;
const password = 'CommunitySuite-2026!';

let token = null;
let userId = null;
let otherToken = null;
let otherUserId = null;
const createdPostIds = [];
const createdCommentIds = [];

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


async function makePost(title, extra = {}) {
  const res = await api('POST', '/community/posts', {
    title,
    content: `Content for ${title}`,
    category: 'general',
    ...extra,
  });
  if (res.status === 201 && res.body?.id) createdPostIds.push(res.body.id);
  return res;
}

try {
  console.log(`\nCommunity-suite verification against ${API_BASE}`);

  const user = await createTestUser(email, password, db);
  token = user.token;
  userId = user.userId;
  ok(`test user created (${email})`);

  const other = await createTestUser(otherEmail, password, db);
  otherToken = other.token;
  otherUserId = other.userId;
  ok(`second test user created (${otherEmail})`);


  section('1. POST /community/posts — request body field names');



  const created = await makePost('Contract check post', {
    courseTopic: 'Data Structures',
    category: 'theory',
  });
  if (created.status === 201) ok('POST /community/posts -> 201');
  else bad('POST /community/posts -> 201', `got ${created.status}: ${created.text}`);

  const post = created.body || {};
  const postId = post.id;

  if (post.courseTopic === 'Data Structures') {
    ok('create body `courseTopic` is stored and echoed back');
  } else {
    bad('create body `courseTopic` is stored and echoed back', `got ${JSON.stringify(post.courseTopic)}`);
  }
  if (post.category === 'theory') ok('create body `category` is honoured');
  else bad('create body `category` is honoured', `got ${post.category}`);


  section('2. POST /community/posts — response field names');


  const postFields = [
    'id', 'author', 'title', 'content', 'category',
    'courseTopic', 'isResolved', 'viewCount', 'commentCount',
    'createdAt', 'updatedAt',
  ];
  for (const f of postFields) {
    if (post[f] !== undefined) ok(`POST response has \`${f}\``);
    else bad(`POST response has \`${f}\``, 'undefined');
  }

  if (post.author && typeof post.author.name === 'string' && post.author.avatarUrl !== undefined) {
    ok('POST response `author` carries `name` + `avatarUrl`');
  } else {
    bad('POST response `author` carries `name` + `avatarUrl`', JSON.stringify(post.author));
  }

  if (typeof post.createdAt === 'string' && !Number.isNaN(Date.parse(post.createdAt))) {
    ok('POST response `createdAt` is a parseable ISO timestamp');
  } else {
    bad('POST response `createdAt` is a parseable ISO timestamp', String(post.createdAt));
  }



  for (const f of ['course_topic', 'is_resolved', 'view_count', 'comment_count', 'created_at', 'updated_at']) {
    if (post[f] === undefined) ok(`POST response does not carry the legacy \`${f}\``);
    else bad(`POST response does not carry the legacy \`${f}\``, 'still present');
  }


  section('3. GET /community/posts — envelope + field names');

  const list = await api('GET', '/community/posts');
  if (list.status === 200) ok('GET /community/posts -> 200');
  else bad('GET /community/posts -> 200', `got ${list.status}`);

  for (const f of ['posts', 'total', 'page', 'pageSize', 'hasMore']) {
    if (list.body?.[f] !== undefined) ok(`list envelope has \`${f}\``);
    else bad(`list envelope has \`${f}\``, 'undefined');
  }
  for (const f of ['page_size', 'has_more']) {
    if (list.body?.[f] === undefined) ok(`list envelope does not carry the legacy \`${f}\``);
    else bad(`list envelope does not carry the legacy \`${f}\``, 'still present');
  }

  const listed = (list.body?.posts || [])[0];
  if (listed && listed.viewCount !== undefined && listed.commentCount !== undefined) {
    ok('listed posts carry `viewCount` + `commentCount`');
  } else {
    bad('listed posts carry `viewCount` + `commentCount`', JSON.stringify(listed));
  }


  section('4. GET /community/posts — query parameter names');


  const unresolved = await makePost('Filter probe unresolved', { category: 'lab' });
  const resolvedProbe = await makePost('Filter probe resolved', { category: 'lab' });
  await api('PATCH', `/community/posts/${resolvedProbe.body.id}/resolve`);

  const filterResolved = await api('GET', '/community/posts?isResolved=true');
  if (filterResolved.status === 200) ok('GET /community/posts?isResolved=true -> 200');
  else bad('GET /community/posts?isResolved=true -> 200', `got ${filterResolved.status}`);

  const resolvedOnly = (filterResolved.body?.posts || []);
  if (resolvedOnly.length > 0 && resolvedOnly.every((p) => p.isResolved === true)) {
    ok('`isResolved=true` returns only resolved posts');
  } else {
    bad('`isResolved=true` returns only resolved posts',
      `got ${resolvedOnly.length} posts, resolved flags: ${resolvedOnly.map((p) => p.isResolved).join(',')}`);
  }

  const filterUnresolved = await api('GET', '/community/posts?isResolved=false');
  const unresolvedOnly = (filterUnresolved.body?.posts || []);
  if (unresolvedOnly.length > 0 && unresolvedOnly.every((p) => p.isResolved === false)) {
    ok('`isResolved=false` returns only unresolved posts');
  } else {
    bad('`isResolved=false` returns only unresolved posts',
      `got ${unresolvedOnly.length} posts, resolved flags: ${unresolvedOnly.map((p) => p.isResolved).join(',')}`);
  }


  const legacyFilter = await api('GET', '/community/posts?is_resolved=true');
  const legacyCount = (legacyFilter.body?.posts || []).length;
  const totalCount = list.body?.total ?? 0;
  if (legacyCount >= totalCount) {
    ok('`is_resolved` is ignored by the router (filter is a no-op)');
  } else {
    info(`legacy \`is_resolved\` filtered to ${legacyCount}/${totalCount} — router may now honour it`);
  }


  const byCategory = await api('GET', '/community/posts?category=lab');
  const labPosts = byCategory.body?.posts || [];
  if (labPosts.length > 0 && labPosts.every((p) => p.category === 'lab')) {
    ok('`category=lab` returns only lab posts');
  } else {
    bad('`category=lab` returns only lab posts', `got ${labPosts.map((p) => p.category).join(',')}`);
  }

  const bySearch = await api('GET', '/community/posts?search=Filter probe unresolved');
  if ((bySearch.body?.posts || []).length >= 1) ok('`search=` matches post content');
  else bad('`search=` matches post content', `got ${(bySearch.body?.posts || []).length}`);


  section('5. GET /community/posts/:id — detail envelope + view tracking');

  const detail0 = await api('GET', `/community/posts/${postId}`);
  if (detail0.status === 200) ok('GET /community/posts/:id -> 200');
  else bad('GET /community/posts/:id -> 200', `got ${detail0.status}`);
  if (detail0.body?.comments !== undefined) ok('detail response carries `comments`');
  else bad('detail response carries `comments`', 'undefined');

  const viewBefore = detail0.body?.viewCount ?? 0;
  const tracked = await api('GET', `/community/posts/${postId}?track_view=true`);
  const viewAfter = tracked.body?.viewCount ?? 0;
  if (viewAfter === viewBefore + 1) {
    ok(`\`track_view=true\` increments viewCount (${viewBefore} -> ${viewAfter})`);
  } else {
    bad('`track_view=true` increments viewCount', `got ${viewBefore} -> ${viewAfter}`);
  }

  const untracked = await api('GET', `/community/posts/${postId}`);
  const viewUntracked = untracked.body?.viewCount ?? 0;
  if (viewUntracked === viewAfter) {
    ok('a read without `track_view` does not inflate viewCount');
  } else {
    bad('a read without `track_view` does not inflate viewCount', `${viewAfter} -> ${viewUntracked}`);
  }

  const missing = await api('GET', '/community/posts/00000000-0000-0000-0000-000000000000');
  if (missing.status === 404) ok('GET an unknown post -> 404');
  else bad('GET an unknown post -> 404', `got ${missing.status}`);


  section('6. POST comments — request body field names + threading');

  const rootComment = await api('POST', `/community/posts/${postId}/comments`, {
    content: 'Root comment',
  });
  if (rootComment.status === 201) ok('POST a root comment -> 201');
  else bad('POST a root comment -> 201', `got ${rootComment.status}: ${rootComment.text}`);

  const rootId = rootComment.body?.id;
  if (rootId) createdCommentIds.push(rootId);

  for (const f of ['id', 'postId', 'author', 'parentId', 'content', 'isBotReply', 'mentionedUserId', 'botMetadata', 'createdAt', 'replies']) {
    if (rootComment.body?.[f] !== undefined) ok(`comment response has \`${f}\``);
    else bad(`comment response has \`${f}\``, 'undefined');
  }
  for (const f of ['post_id', 'parent_id', 'is_bot_reply', 'mentioned_user_id', 'bot_metadata', 'created_at']) {
    if (rootComment.body?.[f] === undefined) ok(`comment response does not carry the legacy \`${f}\``);
    else bad(`comment response does not carry the legacy \`${f}\``, 'still present');
  }



  const reply = await api('POST', `/community/posts/${postId}/comments`, {
    content: 'Nested reply',
    parentId: rootId,
  });
  if (reply.status === 201) ok('POST a reply with `parentId` -> 201');
  else bad('POST a reply with `parentId` -> 201', `got ${reply.status}: ${reply.text}`);
  if (reply.body?.parentId === rootId) ok('the reply echoes back its `parentId`');
  else bad('the reply echoes back its `parentId`', `got ${reply.body?.parentId}`);



  const legacyReply = await api('POST', `/community/posts/${postId}/comments`, {
    content: 'Legacy-key reply',
    parent_id: rootId,
  });
  if (legacyReply.body?.parentId === null || legacyReply.body?.parentId === undefined) {
    ok('`parent_id` is ignored (the schema wants `parentId`)');
  } else {
    bad('`parent_id` is ignored (the schema wants `parentId`)', `parentId=${legacyReply.body?.parentId}`);
  }

  const detail1 = await api('GET', `/community/posts/${postId}`);
  const roots = detail1.body?.comments || [];
  const nested = roots.find((c) => c.id === rootId)?.replies || [];
  if (nested.some((r) => r.content === 'Nested reply')) {
    ok('the nested reply appears under its parent in the comment tree');
  } else {
    bad('the nested reply appears under its parent in the comment tree',
      `roots=${roots.length}, nested=${nested.length}`);
  }

  if (roots.length >= 1) ok('the comment tree has root comments');
  else bad('the comment tree has root comments', 'none');


  section('7. POST comments — mention resolution');



  const mention = await api('POST', `/community/posts/${postId}/comments`, {
    content: `Hey @${otherEmail.split('@')[0]} can you help?`,
    mentionedUsername: otherEmail.split('@')[0],
  });
  if (mention.status === 201) ok('POST a comment with `mentionedUsername` -> 201');
  else bad('POST a comment with `mentionedUsername` -> 201', `got ${mention.status}: ${mention.text}`);

  const storedMention = await db.query(
    'SELECT mentioned_user_id FROM community_comments WHERE id = $1',
    [mention.body?.id],
  );
  if (storedMention.rows[0]?.mentioned_user_id === otherUserId) {
    ok('`mentionedUsername` resolves to the mentioned user\'s id');
  } else {
    bad('`mentionedUsername` resolves to the mentioned user\'s id',
      `got ${storedMention.rows[0]?.mentioned_user_id}`);
  }



  const unknownMention = await api('POST', `/community/posts/${postId}/comments`, {
    content: 'Hello @nobody-at-all',
    mentionedUsername: 'nobody-at-all',
  });
  if (unknownMention.status === 201) ok('an unresolvable mention still creates the comment');
  else bad('an unresolvable mention still creates the comment', `got ${unknownMention.status}`);

  const bothMention = await api('POST', `/community/posts/${postId}/comments`, {
    content: 'Ambiguous mention',
    mentionedUserId: otherUserId,
    mentionedUsername: 'someone',
  });
  if (bothMention.status === 400) ok('sending both `mentionedUserId` and `mentionedUsername` -> 400');
  else bad('sending both `mentionedUserId` and `mentionedUsername` -> 400', `got ${bothMention.status}`);

  const emptyComment = await api('POST', `/community/posts/${postId}/comments`, { content: '' });
  if (emptyComment.status === 400) ok('POST an empty comment -> 400');
  else bad('POST an empty comment -> 400', `got ${emptyComment.status}`);


  section('8. ownership isolation');

  const otherPatch = await api('PATCH', `/community/posts/${postId}`, { title: 'Hijacked' }, otherToken);
  if (otherPatch.status === 404) ok("another user's PATCH /community/posts/:id -> 404");
  else bad("another user's PATCH /community/posts/:id -> 404", `got ${otherPatch.status}`);

  const otherDelete = await api('DELETE', `/community/posts/${postId}`, undefined, otherToken);
  if (otherDelete.status === 404) ok("another user's DELETE /community/posts/:id -> 404");
  else bad("another user's DELETE /community/posts/:id -> 404", `got ${otherDelete.status}`);

  const otherResolve = await api('PATCH', `/community/posts/${postId}/resolve`, undefined, otherToken);
  if (otherResolve.status === 404) ok("another user's PATCH .../resolve -> 404");
  else bad("another user's PATCH .../resolve -> 404", `got ${otherResolve.status}`);

  const stillThere = await api('GET', `/community/posts/${postId}`);
  if (stillThere.status === 200) ok('the post survived the foreign delete attempt');
  else bad('the post survived the foreign delete attempt', `got ${stillThere.status}`);


  section('9. author actions');

  const ownPatch = await api('PATCH', `/community/posts/${postId}`, {
    title: 'Renamed by the author',
    courseTopic: 'Algorithms',
    isResolved: true,
  });
  if (ownPatch.status === 200) ok("the author's PATCH /community/posts/:id -> 200");
  else bad("the author's PATCH /community/posts/:id -> 200", `got ${ownPatch.status}: ${ownPatch.text}`);
  if (ownPatch.body?.title === 'Renamed by the author') ok('PATCH updates the title');
  else bad('PATCH updates the title', `got ${ownPatch.body?.title}`);
  if (ownPatch.body?.courseTopic === 'Algorithms') ok('PATCH updates `courseTopic`');
  else bad('PATCH updates `courseTopic`', `got ${ownPatch.body?.courseTopic}`);
  if (ownPatch.body?.isResolved === true) ok('PATCH updates `isResolved`');
  else bad('PATCH updates `isResolved`', `got ${ownPatch.body?.isResolved}`);

  const toggle = await api('PATCH', `/community/posts/${postId}/resolve`);
  if (toggle.status === 200 && toggle.body?.isResolved === false) {
    ok('PATCH .../resolve toggles `isResolved` back to false');
  } else {
    bad('PATCH .../resolve toggles `isResolved` back to false',
      `got ${toggle.status}, isResolved=${toggle.body?.isResolved}`);
  }

  const badPatch = await api('PATCH', `/community/posts/${postId}`, { title: '' });
  if (badPatch.status === 400) ok('PATCH with an empty title -> 400');
  else bad('PATCH with an empty title -> 400', `got ${badPatch.status}`);


  section('10. comment deletion');

  const otherCommentDelete = await api('DELETE', `/community/comments/${rootId}`, undefined, otherToken);
  if (otherCommentDelete.status === 404) ok("another user's DELETE /community/comments/:id -> 404");
  else bad("another user's DELETE /community/comments/:id -> 404", `got ${otherCommentDelete.status}`);

  const ownCommentDelete = await api('DELETE', `/community/comments/${rootId}`);
  if (ownCommentDelete.status === 204) ok("the author's DELETE /community/comments/:id -> 204");
  else bad("the author's DELETE /community/comments/:id -> 204", `got ${ownCommentDelete.status}`);

  const afterDelete = await db.query(
    'SELECT COUNT(*)::int AS n FROM community_comments WHERE id = $1',
    [rootId],
  );
  if (afterDelete.rows[0]?.n === 0) ok('the comment row is really gone');
  else bad('the comment row is really gone', `still ${afterDelete.rows[0]?.n} rows`);


  section('11. presence');

  const heartbeat = await api('POST', '/community/presence/heartbeat');
  if (heartbeat.status === 200) ok('POST /community/presence/heartbeat -> 200');
  else bad('POST /community/presence/heartbeat -> 200', `got ${heartbeat.status}`);
  for (const f of ['userId', 'isOnline', 'lastSeen']) {
    if (heartbeat.body?.[f] !== undefined) ok(`presence response has \`${f}\``);
    else bad(`presence response has \`${f}\``, 'undefined');
  }
  if (heartbeat.body?.userId === userId) ok('the heartbeat records the caller\'s own id');
  else bad('the heartbeat records the caller\'s own id', `got ${heartbeat.body?.userId}`);

  const presence = await api('GET', '/community/presence/users');
  if (presence.status === 200) ok('GET /community/presence/users -> 200');
  else bad('GET /community/presence/users -> 200', `got ${presence.status}`);
  if (Array.isArray(presence.body?.users)) ok('presence response carries a `users` array');
  else bad('presence response carries a `users` array', JSON.stringify(presence.body));



  const presenceForeign = await api('GET', `/community/presence/users?userIds=${otherUserId}`);
  const foreignIds = (presenceForeign.body?.users || []).map((u) => u.userId);
  if (!foreignIds.includes(otherUserId)) {
    ok('`userIds` in the query string is ignored (no presence leak)');
  } else {
    bad('`userIds` in the query string is ignored (no presence leak)', `leaked ${foreignIds.join(',')}`);
  }

  const anonHeartbeat = await api('POST', '/community/presence/heartbeat', undefined, null);
  if (anonHeartbeat.status === 401) ok('POST heartbeat without auth -> 401');
  else bad('POST heartbeat without auth -> 401', `got ${anonHeartbeat.status}`);

  const anonCreate = await api('POST', '/community/posts', { title: 'x', content: 'y' }, null);
  if (anonCreate.status === 401) ok('POST /community/posts without auth -> 401');
  else bad('POST /community/posts without auth -> 401', `got ${anonCreate.status}`);


  section('12. post deletion');

  const throwaway = await makePost('Delete me');
  const del = await api('DELETE', `/community/posts/${throwaway.body.id}`);
  if (del.status === 204) ok("the author's DELETE /community/posts/:id -> 204");
  else bad("the author's DELETE /community/posts/:id -> 204", `got ${del.status}`);

  const gone = await api('GET', `/community/posts/${throwaway.body.id}`);
  if (gone.status === 404) ok('the deleted post is really gone');
  else bad('the deleted post is really gone', `got ${gone.status}`);


  section('13. pagination bounds');



  for (const q of ['page=0', 'page=-1', 'pageSize=-1', 'pageSize=0']) {
    const res = await api('GET', `/community/posts?${q}`);
    if (res.status === 200) ok(`GET /community/posts?${q} -> 200 (no SQL error)`);
    else bad(`GET /community/posts?${q} -> 200 (no SQL error)`, `got ${res.status}: ${res.text.slice(0, 80)}`);
  }

  const clamped = await api('GET', '/community/posts?pageSize=100000');
  if (clamped.status === 200 && clamped.body?.pageSize === 100) {
    ok('`pageSize=100000` is clamped to 100');
  } else {
    bad('`pageSize=100000` is clamped to 100', `got ${clamped.body?.pageSize}`);
  }

  const smallSize = await api('GET', '/community/posts?pageSize=1');
  if (smallSize.status === 200 && smallSize.body?.pageSize === 1) {
    ok('`pageSize=1` is honoured');
  } else {
    bad('`pageSize=1` is honoured', `got ${smallSize.body?.pageSize}`);
  }

  const sizeZero = await api('GET', '/community/posts?pageSize=0');
  if (sizeZero.body?.pageSize === 1) {
    ok('`pageSize=0` is raised to 1 (never 0, which would empty the list)');
  } else {
    bad('`pageSize=0` is raised to 1 (never 0, which would empty the list)', `got ${sizeZero.body?.pageSize}`);
  }

  const garbage = await api('GET', '/community/posts?page=abc&pageSize=abc');
  if (garbage.status === 200 && garbage.body?.page === 1 && garbage.body?.pageSize === 20) {
    ok('non-numeric page/pageSize fall back to the defaults');
  } else {
    bad('non-numeric page/pageSize fall back to the defaults',
      `got page=${garbage.body?.page}, pageSize=${garbage.body?.pageSize}`);
  }




  const p1 = await api('GET', '/community/posts?page=1&pageSize=2');
  const p2 = await api('GET', '/community/posts?page=2&pageSize=2');
  const ids1 = (p1.body?.posts || []).map((x) => x.id);
  const ids2 = (p2.body?.posts || []).map((x) => x.id);
  if (ids1.length === 2 && ids2.length >= 1 && !ids1.some((id) => ids2.includes(id))) {
    ok('page 1 and page 2 return different posts');
  } else {
    bad('page 1 and page 2 return different posts', `p1=${ids1.join(',')} p2=${ids2.join(',')}`);
  }


  if (ids1.length === 2) ok('`pageSize=2` returns exactly 2 posts');
  else bad('`pageSize=2` returns exactly 2 posts', `got ${ids1.length}`);


  section('14. comment tree integrity');



  const treeA = await makePost('Tree post A');
  const treeB = await makePost('Tree post B');
  const aComment = await api('POST', `/community/posts/${treeA.body.id}/comments`, {
    content: 'comment on A',
  });
  const crossReply = await api('POST', `/community/posts/${treeB.body.id}/comments`, {
    content: 'reply on B pointing at A',
    parentId: aComment.body.id,
  });
  if (crossReply.status === 201) ok('a cross-post reply is accepted (-> 201)');
  else bad('a cross-post reply is accepted (-> 201)', `got ${crossReply.status}`);

  const bDetail = await api('GET', `/community/posts/${treeB.body.id}`);
  const bComments = bDetail.body?.comments || [];
  const bAll = [];
  const collect = (list) => {
    for (const c of list) {
      bAll.push(c);
      collect(c.replies || []);
    }
  };
  collect(bComments);
  if (bAll.some((c) => c.content === 'reply on B pointing at A')) {
    ok('the cross-post reply is still visible in the comment tree');
  } else {
    bad('the cross-post reply is still visible in the comment tree',
      `tree had ${bAll.length} comments`);
  }
  if (bAll.find((c) => c.content === 'reply on B pointing at A')?.parentId === null) {
    ok('the cross-post reply is stored as a root comment');
  } else {
    bad('the cross-post reply is stored as a root comment', 'still points at the foreign parent');
  }


  section('15. view-count inflation');



  const publicPost = await makePost('View count probe');
  const anonBefore = await api('GET', `/community/posts/${publicPost.body.id}`, undefined, null);
  const beforeCount = anonBefore.body?.viewCount ?? 0;

  const anonTrack = await api('GET', `/community/posts/${publicPost.body.id}?track_view=true`, undefined, null);
  if (anonTrack.status === 200) ok('an anonymous read with `track_view` still returns the post');
  else bad('an anonymous read with `track_view` still returns the post', `got ${anonTrack.status}`);

  const anonAfter = await api('GET', `/community/posts/${publicPost.body.id}`, undefined, null);
  const afterCount = anonAfter.body?.viewCount ?? 0;
  if (afterCount === beforeCount) {
    ok('an anonymous `track_view` does not inflate the counter');
  } else {
    bad('an anonymous `track_view` does not inflate the counter', `${beforeCount} -> ${afterCount}`);
  }

  const authTrack = await api('GET', `/community/posts/${publicPost.body.id}?track_view=true`);
  const authAfter = await api('GET', `/community/posts/${publicPost.body.id}`);
  if ((authAfter.body?.viewCount ?? 0) === afterCount + 1) {
    ok('an authenticated `track_view` still increments the counter');
  } else {
    bad('an authenticated `track_view` still increments the counter',
      `${afterCount} -> ${authAfter.body?.viewCount}`);
  }


  section('16. a post survives a client disconnect');
















  {
    const ctrl = new AbortController();
    const title = `Disconnect probe ${Date.now()}`;
    const req = fetch(`${API_BASE}/community/posts`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...bypassHeaders(),
      },
      body: JSON.stringify({
        title,
        content: 'The client hangs up immediately.',
        category: 'general',
      }),
    });



    await new Promise((r) => setTimeout(r, 150));
    ctrl.abort();
    await req.catch(() => {  });


    await new Promise((r) => setTimeout(r, 3000));

    const rows = await db.query(
      'SELECT id FROM community_posts WHERE title = $1', [title],
    );
    if (rows.rows.length === 1) {
      createdPostIds.push(rows.rows[0].id);
      ok('the post is committed before the response is sent');
    } else {
      bad('the post is committed before the response is sent', `found ${rows.rows.length} rows`);
    }
  }
} finally {
  console.log('\n--- cleanup ---');
  for (const id of createdPostIds) {
    await db.query('DELETE FROM community_posts WHERE id = $1', [id]).catch(() => {});
  }
  await db.query('DELETE FROM community_comments WHERE author_id = $1', [userId]).catch(() => {});
  await db.query('DELETE FROM community_comments WHERE author_id = $1', [otherUserId]).catch(() => {});
  await db.query('DELETE FROM community_posts WHERE author_id = $1', [userId]).catch(() => {});
  await db.query('DELETE FROM community_posts WHERE author_id = $1', [otherUserId]).catch(() => {});
  await db.query('DELETE FROM user_presence WHERE user_id = $1', [userId]).catch(() => {});
  await db.query('DELETE FROM user_presence WHERE user_id = $1', [otherUserId]).catch(() => {});
  await db.query('DELETE FROM public.profiles WHERE email = $1', [email]).catch(() => {});
  await db.query('DELETE FROM public.profiles WHERE email = $1', [otherEmail]).catch(() => {});
  await db.end().catch(() => {});
  console.log('  ✓ test rows removed');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

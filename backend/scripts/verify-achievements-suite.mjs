










































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
const email = `achsuite-${stamp}@e2e.local`;
const otherEmail = `achsuite-other-${stamp}@e2e.local`;
const password = 'AchievementSuite-2026!';

let token = null;
let userId = null;
let otherToken = null;
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




section('1. Authentication');
{
  for (const path of ['/gamification/stats', '/gamification/xp', '/gamification/badges']) {
    const res = await api('GET', path, undefined, null);
    if (res.status === 401) ok(`GET ${path} without a token -> 401`);
    else bad(`GET ${path} without a token -> 401`, `got ${res.status}`);
  }
  const award = await api('POST', '/gamification/award', { source: 'quiz_correct' }, null);
  if (award.status === 401) ok('POST /gamification/award without a token -> 401');
  else bad('POST /gamification/award without a token -> 401', `got ${award.status}`);

  const health = await api('GET', '/gamification/health', undefined, null);
  if (health.status === 200 && health.body?.status === 'ok') {
    ok('GET /gamification/health -> 200 {status:"ok"}');
  } else {
    bad('GET /gamification/health -> 200 {status:"ok"}', `got ${health.status} ${health.text}`);
  }
}




section('2. Test users');
{
  const a = await createTestUser(email, password, db);
  token = a.token;
  userId = a.userId;
  const b = await createTestUser(otherEmail, password, db);
  otherToken = b.token;
  otherUserId = b.userId;
  ok(`created primary user ${userId}`);
  ok(`created second user ${otherUserId}`);
}




section('3. Response envelopes and field names');
{
  const stats = await api('GET', '/gamification/stats');
  if (stats.status === 200) ok('GET /gamification/stats -> 200');
  else bad('GET /gamification/stats -> 200', `got ${stats.status} ${stats.text}`);

  const expected = [
    'totalXp', 'level', 'xpToNextLevel', 'progressPct',
    'currentStreak', 'longestStreak', 'lastActiveDate',
  ];
  for (const key of expected) {
    if (Object.hasOwn(stats.body || {}, key)) ok(`stats has "${key}"`);
    else bad(`stats has "${key}"`, `keys: ${Object.keys(stats.body || {}).join(',')}`);
  }

  for (const key of ['total_xp', 'xp_to_next_level', 'progress_pct', 'current_streak', 'longest_streak', 'last_active_date']) {
    if (!Object.hasOwn(stats.body || {}, key)) ok(`stats does NOT have legacy "${key}"`);
    else bad(`stats does NOT have legacy "${key}"`, 'snake_case key present');
  }

  const badges = await api('GET', '/gamification/badges');
  if (badges.status === 200) ok('GET /gamification/badges -> 200');
  else bad('GET /gamification/badges -> 200', `got ${badges.status}`);
  if (Array.isArray(badges.body?.badges)) ok('badges envelope has "badges" array');
  else bad('badges envelope has "badges" array', `got ${JSON.stringify(Object.keys(badges.body || {}))}`);

  const badgeFields = ['id', 'code', 'name', 'description', 'icon', 'threshold', 'createdAt', 'earned', 'earnedAt'];
  const first = badges.body?.badges?.[0];
  if (first) {
    for (const key of badgeFields) {
      if (Object.hasOwn(first, key)) ok(`badge has "${key}"`);
      else bad(`badge has "${key}"`, `keys: ${Object.keys(first).join(',')}`);
    }
    for (const key of ['created_at', 'earned_at']) {
      if (!Object.hasOwn(first, key)) ok(`badge does NOT have legacy "${key}"`);
      else bad(`badge does NOT have legacy "${key}"`, 'snake_case key present');
    }
  } else {
    bad('badge catalogue is non-empty', 'no badges returned');
  }

  const xp = await api('GET', '/gamification/xp');
  if (xp.status === 200) ok('GET /gamification/xp -> 200');
  else bad('GET /gamification/xp -> 200', `got ${xp.status}`);
  if (Array.isArray(xp.body?.events)) ok('xp envelope has "events" array');
  else bad('xp envelope has "events" array', `got ${JSON.stringify(Object.keys(xp.body || {}))}`);
  if (Object.hasOwn(xp.body || {}, 'nextCursor')) ok('xp envelope has "nextCursor"');
  else bad('xp envelope has "nextCursor"', `got ${JSON.stringify(Object.keys(xp.body || {}))}`);
}




section('4. XP award amount is server-authoritative');
let firstAward = null;
{


  const res = await api('POST', '/gamification/award', {
    source: 'quiz_correct',
    amount: 1000,
  });
  firstAward = res;
  if (res.status === 200) ok('POST /gamification/award -> 200');
  else bad('POST /gamification/award -> 200', `got ${res.status} ${res.text}`);

  const expected = 5;
  if (res.body?.totalXp === expected) {
    ok(`client asked 1000 XP, server awarded ${expected}`);
  } else {
    bad(`client asked 1000 XP, server awarded ${expected}`, `totalXp=${res.body?.totalXp}`);
  }
}




section('5. newlyEarned badge reports earned status');
{




  const newly = firstAward.body?.newlyEarned || [];
  if (newly.length > 0) ok('award response carries newlyEarned');
  else bad('award response carries newlyEarned', 'empty array');

  for (const b of newly) {
    if (b.earned === true) ok(`newlyEarned "${b.code}" has earned=true`);
    else bad(`newlyEarned "${b.code}" has earned=true`, `got ${b.earned}`);
    if (typeof b.earnedAt === 'string' && b.earnedAt.length > 0) {
      ok(`newlyEarned "${b.code}" has an earnedAt timestamp`);
    } else {
      bad(`newlyEarned "${b.code}" has an earnedAt timestamp`, `got ${JSON.stringify(b.earnedAt)}`);
    }
  }


  const badges = await api('GET', '/gamification/badges');
  for (const b of newly) {
    const listed = badges.body?.badges?.find((x) => x.code === b.code);
    if (listed?.earned === true) ok(`GET /badges agrees "${b.code}" is earned`);
    else bad(`GET /badges agrees "${b.code}" is earned`, `got ${listed?.earned}`);
  }
}




section('6. XP history pagination keeps every row');
{


  await db.query(
    `INSERT INTO xp_events (user_id, source, amount, metadata, created_at)
     SELECT $1, 'quiz_correct', 1, '{}'::jsonb, now() - interval '1 day'
     FROM generate_series(1, 25)`,
    [userId],
  );
  await db.query(
    `INSERT INTO xp_events (user_id, source, amount, metadata, created_at)
     SELECT $1, 'quiz_correct', 1, '{}'::jsonb, now() - (g || ' seconds')::interval
     FROM generate_series(1, 5) g`,
    [userId],
  );

  const total = await db.query(
    `SELECT COUNT(*)::int c FROM xp_events WHERE user_id = $1`, [userId],
  );
  info(`${total.rows[0].c} xp_events for this user (6 distinct timestamps)`);

  const seen = new Set();
  const order = [];
  let cursor = null;
  let pages = 0;
  let guard = 0;
  while (guard++ < 50) {
    const q = cursor
      ? `/gamification/xp?limit=10&cursor=${encodeURIComponent(cursor)}`
      : '/gamification/xp?limit=10';
    const page = await api('GET', q);
    pages++;
    const events = page.body?.events || [];
    order.push(events.length);
    for (const ev of events) {
      if (seen.has(ev.id)) bad('no event id is returned twice', `duplicate ${ev.id}`);
      seen.add(ev.id);
    }
    cursor = page.body?.nextCursor;
    if (!cursor) break;
  }
  info(`paged through ${pages} page(s), page sizes: ${order.join(', ')}`);

  if (seen.size === total.rows[0].c) {
    ok(`all ${total.rows[0].c} events reachable across ${pages} pages`);
  } else {
    bad(`all ${total.rows[0].c} events reachable across pages`, `only saw ${seen.size}`);
  }
  if (pages > 1) ok('pagination produced more than one page');
  else bad('pagination produced more than one page', `pages=${pages}`);
}




section('6b. nextCursor is null when the page is exactly full');
{






  const edgeEmail = `ach-edge-${Date.now()}@example.com`;
  const edge = await createTestUser(edgeEmail, password, db);
  const edgeId = edge.userId;

  try {

    await db.query(
      `INSERT INTO xp_events (user_id, source, amount, metadata, created_at)
       SELECT $1, 'quiz_correct', 1, '{}'::jsonb, now() - (g || ' seconds')::interval
       FROM generate_series(1, 5) g`,
      [edgeId],
    );

    const page = await api(
      'GET', '/gamification/xp?limit=5', undefined, edge.token,
    );
    const events = page.body?.events || [];
    if (events.length === 5) ok('the exactly-full page returned all 5 rows');
    else bad('the exactly-full page returned all 5 rows', `got ${events.length}`);

    if (page.body?.nextCursor === null || page.body?.nextCursor === undefined) {
      ok('nextCursor is null on the last page (no spurious cursor)');
    } else {
      bad(
        'nextCursor is null on the last page (no spurious cursor)',
        `got ${JSON.stringify(page.body?.nextCursor)}`,
      );
    }


    await db.query(
      `INSERT INTO xp_events (user_id, source, amount, metadata, created_at)
       VALUES ($1, 'quiz_correct', 1, '{}'::jsonb, now())`,
      [edgeId],
    );
    const page2 = await api(
      'GET', '/gamification/xp?limit=5', undefined, edge.token,
    );
    if (typeof page2.body?.nextCursor === 'string') {
      ok('nextCursor is present when more rows remain');
    } else {
      bad('nextCursor is present when more rows remain', `got ${JSON.stringify(page2.body?.nextCursor)}`);
    }
  } finally {
    await db.query(`DELETE FROM xp_events WHERE user_id = $1`, [edgeId]);
    await db.query(`DELETE FROM public.profiles WHERE id = $1`, [edgeId]);
  }
}




section('7. Cursor format and validation');
{
  const page = await api('GET', '/gamification/xp?limit=5');
  const cursor = page.body?.nextCursor;
  if (typeof cursor === 'string' && cursor.includes('|')) {
    ok(`nextCursor is a composite "<timestamp>|<id>" string`);
  } else {
    bad(`nextCursor is a composite "<timestamp>|<id>" string`, `got ${JSON.stringify(cursor)}`);
  }

  if (typeof cursor === 'string') {
    const [ts, id] = cursor.split('|');


    const frac = ts.split('.')[1] || '';
    if (frac.replace(/[^0-9]/g, '').length > 3) {
      ok(`cursor timestamp keeps microsecond precision (${frac.replace(/[^0-9]/g, '').length} digits)`);
    } else {
      bad('cursor timestamp keeps microsecond precision', `got "${ts}"`);
    }
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      ok('cursor id is a uuid');
    } else {
      bad('cursor id is a uuid', `got "${id}"`);
    }
  }

  for (const badCursor of ['not-a-date', '2026-13-45T99:99:99Z', 'x|y', '12345']) {
    const res = await api('GET', `/gamification/xp?cursor=${encodeURIComponent(badCursor)}`);
    if (res.status === 400) ok(`malformed cursor "${badCursor}" -> 400`);
    else bad(`malformed cursor "${badCursor}" -> 400`, `got ${res.status} ${res.text?.slice(0, 120)}`);
  }

  for (const badLimit of ['0', '101', 'abc', '-5']) {
    const res = await api('GET', `/gamification/xp?limit=${badLimit}`);
    if (res.status === 400) ok(`limit=${badLimit} -> 400`);
    else bad(`limit=${badLimit} -> 400`, `got ${res.status}`);
  }
}




section('8. Per-source daily cap');
{

  let awardedCount = 0;
  let cappedCount = 0;
  for (let i = 0; i < 60; i++) {
    const res = await api('POST', '/gamification/award', { source: 'quiz_correct' });
    if (res.body?.awarded) awardedCount++;
    if (res.body?.reason === 'daily_cap') cappedCount++;
  }
  info(`awarded=${awardedCount} capped=${cappedCount}`);

  if (cappedCount > 0) ok('the daily cap stops unbounded XP minting');
  else bad('the daily cap stops unbounded XP minting', 'never capped');

  const stats = await api('GET', '/gamification/stats');
  const xpNow = stats.body?.totalXp ?? 0;


  if (xpNow <= 400) ok(`total XP stayed bounded (${xpNow} <= 400)`);
  else bad(`total XP stayed bounded`, `totalXp=${xpNow}`);

  const level = stats.body?.level ?? 1;
  if (level < 5) ok(`the user did not reach level 5 from self-minting (level ${level})`);
  else bad(`the user did not reach level 5 from self-minting`, `level=${level}`);
}




section('9. Streak counters and lastActiveDate');
{
  const stats = await api('GET', '/gamification/stats');
  const last = stats.body?.lastActiveDate;
  if (last === null || typeof last === 'string') ok('lastActiveDate is a string or null');
  else bad('lastActiveDate is a string or null', `got ${typeof last}`);

  if (typeof last === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(last)) ok('lastActiveDate is YYYY-MM-DD');
    else bad('lastActiveDate is YYYY-MM-DD', `got "${last}"`);
  }

  const today = new Date().toISOString().slice(0, 10);
  if (last === today) ok(`lastActiveDate is today (${today})`);
  else bad(`lastActiveDate is today (${today})`, `got "${last}"`);

  if ((stats.body?.currentStreak ?? 0) >= 1) ok('currentStreak >= 1 after awarding XP');
  else bad('currentStreak >= 1 after awarding XP', `got ${stats.body?.currentStreak}`);
  if ((stats.body?.longestStreak ?? 0) >= 1) ok('longestStreak >= 1 after awarding XP');
  else bad('longestStreak >= 1 after awarding XP', `got ${stats.body?.longestStreak}`);
}




section('10. Per-user isolation');
{
  const other = await api('GET', '/gamification/stats', undefined, otherToken);
  if ((other.body?.totalXp ?? -1) === 0) ok('a second user has 0 XP');
  else bad('a second user has 0 XP', `got ${other.body?.totalXp}`);

  const otherXp = await api('GET', '/gamification/xp', undefined, otherToken);
  if ((otherXp.body?.events || []).length === 0) ok('a second user has no XP events');
  else bad('a second user has no XP events', `got ${otherXp.body.events.length}`);


  const mine = await api('GET', '/gamification/xp?limit=100');
  const mineIds = new Set((mine.body?.events || []).map((e) => e.id));
  const leaked = (otherXp.body?.events || []).filter((e) => mineIds.has(e.id));
  if (leaked.length === 0) ok('XP events do not leak between users');
  else bad('XP events do not leak between users', `${leaked.length} leaked`);

  const otherBadges = await api('GET', '/gamification/badges', undefined, otherToken);
  const earnedByOther = (otherBadges.body?.badges || []).filter((b) => b.earned);
  if (earnedByOther.length === 0) ok('the second user has earned no badges');
  else bad('the second user has earned no badges', `got ${earnedByOther.map((b) => b.code).join(',')}`);
}




section('11. XP source values');
{
  const valid = ['srs_review', 'quiz_correct', 'quiz_finished', 'mindmap_generated', 'chat_message', 'material_viewed'];
  const res = await api('POST', '/gamification/award', { source: 'not_a_source' });
  if (res.status === 400) ok('an unknown source -> 400');
  else bad('an unknown source -> 400', `got ${res.status}`);

  const xp = await api('GET', '/gamification/xp?limit=100');
  const seen = new Set((xp.body?.events || []).map((e) => e.source));
  for (const s of seen) {
    if (valid.includes(s)) ok(`event source "${s}" is a known XP source`);
    else bad(`event source "${s}" is a known XP source`, 'unknown source stored');
  }
}




section('Cleanup');
{
  for (const uid of [userId, otherUserId]) {
    await db.query(`DELETE FROM xp_events WHERE user_id = $1`, [uid]);
    await db.query(`DELETE FROM user_badges WHERE user_id = $1`, [uid]);
    await db.query(`DELETE FROM daily_streaks WHERE user_id = $1`, [uid]);
    await db.query(`DELETE FROM user_xp WHERE user_id = $1`, [uid]);
    await db.query(`DELETE FROM public.profiles WHERE id = $1`, [uid]);
  }
  const leftover = await db.query(
    `SELECT COUNT(*)::int c FROM public.profiles WHERE email LIKE 'achsuite-%'`,
  );
  if (leftover.rows[0].c === 0) ok('no test profiles left behind');
  else bad('no test profiles left behind', `${leftover.rows[0].c} left`);
  await db.end();
}

console.log(`\n${'='.repeat(60)}`);
console.log(`  achievements API suite: ${passed} passed, ${failed} failed`);
console.log('='.repeat(60));
process.exit(failed > 0 ? 1 : 0);

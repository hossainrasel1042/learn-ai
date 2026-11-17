



















import 'dotenv/config';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

let passed = 0;
let failed = 0;
const ok = (m) => { console.log(`  ✓ ${m}`); passed++; };
const bad = (m, e) => { console.log(`  ✗ ${m}${e ? `: ${e}` : ''}`); failed++; };


async function apiRequest(endpoint, options = {}) {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (response.status === 204) {
    return undefined;
  }
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Request failed' }));
    throw new Error(error.detail || 'Request failed');
  }
  const text = await response.text();
  if (!text) return undefined;
  return JSON.parse(text);
}


async function apiRequestOld(endpoint, options = {}) {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!response.ok) {
    if (response.status === 204) return undefined;
    const error = await response.json().catch(() => ({ detail: 'Request failed' }));
    throw new Error(error.detail || 'Request failed');
  }
  return response.json();
}





const stamp = Date.now();
const email = `apiclient-${stamp}@e2e.local`;
const password = 'ApiClient-2026!';

async function signUp() {
  const res = await fetch(`${API_BASE_URL}/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: email.split('@')[0], email, password, confirmPassword: password,
    }),
  });
  if (!res.ok) throw new Error(`signUp failed: ${res.status} ${await res.text()}`);
  return res.json();
}


function tokenFromSetCookie(res) {
  const raw = res.headers.getSetCookie?.() ?? [];
  for (const c of raw) {
    const m = c.match(/sb-access-token=([^;]+)/);
    if (m) return decodeURIComponent(m[1]);
  }
  return null;
}

async function signIn() {
  const res = await fetch(`${API_BASE_URL}/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`signIn failed: ${res.status} ${await res.text()}`);
  return { token: tokenFromSetCookie(res) };
}

console.log(`\nFrontend API-client check against ${API_BASE_URL}`);

await signUp();
const signedIn = await signIn();
const token = signedIn?.token;

if (!token) {
  console.log('  ✗ could not sign in — cannot run the client check');
  console.log(`    ${JSON.stringify(signedIn).slice(0, 300)}`);
  process.exit(1);
}
ok('signed in');

const H = { Authorization: `Bearer ${token}` };

try {

  console.log('\n--- 204 No Content (the delete path) ---');

  const created = await apiRequest('/quiz/sets', {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ title: 'API client check', sourceType: 'manual' }),
  });
  const setId = created?.set?.id;
  if (!setId) {
    bad('created a quiz set to delete', JSON.stringify(created).slice(0, 200));
  } else {
    ok('created a quiz set');


    let oldFailed = false;
    try {
      await apiRequestOld(`/quiz/sets/${setId}`, { method: 'DELETE', headers: H });
    } catch (e) {
      oldFailed = /JSON|Unexpected end/i.test(e.message);
    }
    if (oldFailed) {
      ok('the OLD wrapper reproduces "Unexpected end of JSON input"');
    } else {
      bad('the OLD wrapper reproduces "Unexpected end of JSON input"',
        'expected a JSON parse error');
    }


    const again = await apiRequest('/quiz/sets', {
      method: 'POST',
      headers: H,
      body: JSON.stringify({ title: 'API client check 2', sourceType: 'manual' }),
    });
    const againId = again?.set?.id;

    let threw = null;
    let result;
    try {
      result = await apiRequest(`/quiz/sets/${againId}`, { method: 'DELETE', headers: H });
    } catch (e) {
      threw = e;
    }
    if (threw) {
      bad('deleteQuizSet() does not throw', threw.message);
    } else {
      ok('deleteQuizSet() does not throw');
      if (result === undefined) ok('deleteQuizSet() resolves to undefined (as its type says)');
      else bad('deleteQuizSet() resolves to undefined', String(result));
    }




    let goneErr = null;
    try {
      await apiRequest(`/quiz/sets/${againId}`, { headers: H });
    } catch (e) {
      goneErr = e;
    }
    if (goneErr && /not found/i.test(goneErr.message)) {
      ok('the deleted set is really gone (GET answers 404)');
    } else {
      bad('the deleted set is really gone (GET answers 404)',
        goneErr ? goneErr.message : 'the set was still there');
    }


    try {
      await apiRequest(`/quiz/sets/${setId}`, { method: 'DELETE', headers: H });
    } catch (_) {

    }
  }


  console.log('\n--- normal JSON responses still work ---');

  const list = await apiRequest('/quiz/sets?page=1&pageSize=20', { headers: H });
  if (Array.isArray(list?.sets)) ok('GET /quiz/sets parses to an object with `sets`');
  else bad('GET /quiz/sets parses to an object with `sets`', JSON.stringify(list).slice(0, 150));

  const one = await apiRequest('/quiz/sets?page=1&pageSize=20', { headers: H });
  ok('repeated GET works');


  console.log('\n--- error responses still throw the backend `detail` ---');

  let err = null;
  try {
    await apiRequest('/quiz/sets/00000000-0000-4000-8000-000000000000', { headers: H });
  } catch (e) {
    err = e;
  }
  if (err && /not found/i.test(err.message)) ok('a 404 throws with the backend detail message');
  else bad('a 404 throws with the backend detail message', err ? err.message : 'no error thrown');

  let err2 = null;
  try {
    await apiRequest('/quiz/sets', { method: 'POST', headers: H, body: JSON.stringify({}) });
  } catch (e) {
    err2 = e;
  }
  if (err2) ok('a 400 throws (zod validation)');
  else bad('a 400 throws (zod validation)', 'no error thrown');
} finally {


  try {
    const { createRequire } = await import('node:module');
    const require = createRequire(`${process.cwd()}/../backend/package.json`);
    const pg = require('pg');
    const db = new pg.Client({ connectionString: process.env.DB_URL });
    await db.connect();
    await db.query(
      'DELETE FROM public.quiz_sets WHERE user_id IN (SELECT id FROM public.profiles WHERE email = $1)',
      [email],
    );
    await db.query('DELETE FROM public.profiles WHERE email = $1', [email]);
    await db.end();
    console.log('\n  ✓ test rows removed');
  } catch (e) {
    console.log(`\n  – cleanup skipped: ${e.message}`);
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

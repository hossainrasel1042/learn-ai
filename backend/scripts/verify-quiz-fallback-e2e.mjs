






















import 'dotenv/config';
import pg from 'pg';

import { API_BASE, createTestUser, bypassHeaders } from './_testAuth.js';
import { QuizAgent } from '../src/quiz_agent/agent.js';
import { geminiService } from '../src/services/geminiService.js';
import { pool } from '../src/config/database.js';
import { logger } from '../src/utils/logger.js';

let passed = 0;
let failed = 0;
const ok = (m) => { console.log(`  ✓ ${m}`); passed++; };
const bad = (m, e) => { console.log(`  ✗ ${m}${e ? `: ${e}` : ''}`); failed++; };
const info = (m) => console.log(`  – ${m}`);
const section = (m) => console.log(`\n--- ${m} ---`);

const db = new pg.Client({ connectionString: process.env.DB_URL });
await db.connect();




const agentPool = new pg.Pool({ connectionString: process.env.DB_URL });

const stamp = Date.now();
const email = `quizfallback-${stamp}@e2e.local`;
const password = 'QuizFallback-2026!';

let userId = null;
let token = null;
const createdSetIds = [];


const SOURCE_TEXT = `Kubernetes Pods and Namespaces.
A pod is the smallest unit that Kubernetes schedules, holding one or more containers that share an IP address.
The pause container starts first and owns the network namespace, so the pod keeps its IP when app containers restart.
All containers inside a pod share the same IP address and the same localhost, so two containers cannot bind the same port.
Containers share data only through volumes such as emptyDir, PVC, ConfigMap and Secret, because root filesystems stay separate.
The PID namespace is separate by default, and you must set shareProcessNamespace to true to share processes between containers.
Init containers run one at a time to completion before any application container is allowed to start.
A namespace provides a way to isolate groups of resources within a single Kubernetes cluster.
Namespaces do not provide any real isolation, they are only a logical grouping of resources.
The default namespace is used whenever a manifest does not specify a namespace explicitly.
Every namespace contains a special ServiceAccount named the default ServiceAccount.
Resource quotas and limit ranges are scoped to a single namespace by design.
Every pod receives its own IP address and can reach every other pod without network address translation.
The CNI plugin is responsible for setting up the pod network across the whole cluster.
Network policies control the traffic that is allowed to flow between pods in the cluster.
A NetworkPolicy selects pods using label selectors and specifies the traffic rules that apply to them.
ReplicaSets maintain a desired number of pod replicas and are usually managed by a Deployment.
A Deployment manages ReplicaSets and performs rolling updates of the pods underneath them.
`;

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


function quotaExceededGemini() {
  return {
    async generateJson() {
      const e = new Error(
        '[GoogleGenerativeAI Error]: Error fetching from '
        + 'https://generativelanguage.googleapis.com/v1beta/models/'
        + 'gemini-3-flash-preview:generateContent: [429 Too Many Requests] '
        + 'Quota exceeded for metric: generativelanguage.googleapis.com/'
        + 'generate_content_free_tier_requests, limit: 20',
      );
      throw e;
    },
  };
}


function truncatedGemini() {
  return {
    async generateJson() {



      const e = new Error(
        'The AI response was cut off because it hit the output token limit '
        + '(the model ran out of room before finishing the JSON). '
        + 'Try generating fewer questions at once.',
      );
      e.status = 502;
      throw e;
    },
  };
}

try {
  console.log(`\nQuiz-generation fallback check against ${API_BASE}`);

  const user = await createTestUser(email, password, db);
  token = user.token;
  userId = user.userId;
  ok(`test user created (${email})`);


  section('A. the local fallback triggers on a Gemini 429');


  const created = await api('POST', '/quiz/sets', {
    title: 'Fallback Quiz',
    sourceType: 'manual',
  });
  const setId = created.body?.set?.id;
  if (!setId) {
    bad('created a quiz set', `${created.status} ${created.text.slice(0, 200)}`);
  } else {
    createdSetIds.push(setId);
    ok('created a quiz set');


    const agent = new QuizAgent({ gemini: quotaExceededGemini() });
    let result = null;
    let threw = null;
    try {
      result = await agent.generateQuestions({
        userId,
        quizSetId: setId,
        sourceType: 'manual',
        text: SOURCE_TEXT,
        questionCount: 5,
        pool: agentPool,
      });
    } catch (e) {
      threw = e;
    }

    if (threw) {
      bad('a 429 falls back to the local generator', threw.message);
    } else {
      ok('a 429 falls back to the local generator (no error thrown)');
      if (result.inserted > 0) ok(`the fallback inserted ${result.inserted} questions`);
      else bad('the fallback inserted questions', `inserted=${result.inserted}`);
      if (result.generatedBy === 'local') ok('the result is marked generatedBy="local"');
      else bad('the result is marked generatedBy="local"', String(result.generatedBy));
    }
  }


  section('B. the fallback questions are real and persisted');

  const detail = await api('GET', `/quiz/sets/${setId}`);
  const questions = detail.body?.questions ?? [];
  if (questions.length > 0) {
    ok(`the questions are readable through the API (${questions.length})`);
  } else {
    bad('the questions are readable through the API', `got ${questions.length}`);
  }



  let allValid = true;
  let invalidReason = '';
  for (const [i, q] of questions.entries()) {
    const opts = [q.optionA, q.optionB, q.optionC, q.optionD];
    if (opts.some((o) => !o || !String(o).trim())) {
      allValid = false; invalidReason = `question ${i} has an empty option`; break;
    }
    if (new Set(opts.map((o) => String(o).trim().toLowerCase())).size !== 4) {
      allValid = false; invalidReason = `question ${i} has duplicate options`; break;
    }
    if (!['A', 'B', 'C', 'D'].includes(q.correct)) {
      allValid = false; invalidReason = `question ${i} has correct="${q.correct}"`; break;
    }
    if (!q.prompt.includes('___')) {
      allValid = false; invalidReason = `question ${i} has no blank to fill`; break;
    }
    if (!Array.isArray(q.tags) || q.tags.length === 0) {
      allValid = false; invalidReason = `question ${i} has no tags`; break;
    }
  }
  if (allValid) ok('every fallback question has four distinct options, a valid answer letter, a blank and tags');
  else bad('every fallback question has four distinct options, a valid answer letter, a blank and tags', invalidReason);


  const letters = questions.map((q) => q.correct);
  if (new Set(letters).size > 1) ok(`the answer position varies (${letters.join(', ')})`);
  else bad('the answer position varies', `every answer is "${letters[0]}"`);


  section('C. a truncated Gemini response gives a specific error');

  const created2 = await api('POST', '/quiz/sets', {
    title: 'Truncated Quiz',
    sourceType: 'manual',
  });
  const setId2 = created2.body?.set?.id;
  if (!setId2) {
    bad('created a second quiz set', `${created2.status} ${created2.text.slice(0, 200)}`);
  } else {
    createdSetIds.push(setId2);

    const agent = new QuizAgent({ gemini: truncatedGemini() });
    let threw = null;
    try {
      await agent.generateQuestions({
        userId,
        quizSetId: setId2,
        sourceType: 'manual',
        text: SOURCE_TEXT,
        questionCount: 5,
        pool: agentPool,
      });
    } catch (e) {
      threw = e;
    }

    if (!threw) {
      bad('a truncated response raises a clear error', 'no error thrown');
    } else if (/no usable questions/i.test(threw.message)) {
      bad('a truncated response raises a clear error', 'still says "no usable questions"');
    } else if (/output token limit|truncated|cut off/i.test(threw.message)) {
      ok(`a truncated response explains itself: "${threw.message.slice(0, 90)}..."`);
    } else {
      bad('a truncated response raises a clear error', threw.message.slice(0, 160));
    }
  }


  section('D. the rate-limit detector recognises a 429');

  const { isRateLimitError } = await import('../src/services/geminiService.js');
  const quota = new Error('429 Too Many Requests ... Quota exceeded ... limit: 20');
  if (isRateLimitError(quota)) ok('a 429 error is detected as a rate-limit error');
  else bad('a 429 error is detected as a rate-limit error');

  const other = new Error('Source text is too short or unavailable');
  if (!isRateLimitError(other)) ok('an unrelated error is NOT treated as a rate limit');
  else bad('an unrelated error is NOT treated as a rate limit');

  if (!isRateLimitError(null) && !isRateLimitError(undefined)) ok('a missing error is handled safely');
  else bad('a missing error is handled safely');


  section('E. the output budget scales with the question count');



  const agent = new QuizAgent({ gemini: { async generateJson(_p, _s, config) {
    budgets.push(config.maxOutputTokens);
    return { questions: [] };
  } } });
  const budgets = [];
  await agent.generateQuestions({
    userId, quizSetId: setId, sourceType: 'manual', text: SOURCE_TEXT, questionCount: 3, pool: agentPool,
  }).catch(() => {});
  await agent.generateQuestions({
    userId, quizSetId: setId, sourceType: 'manual', text: SOURCE_TEXT, questionCount: 20, pool: agentPool,
  }).catch(() => {});
  if (budgets.length === 2 && budgets[1] > budgets[0]) {
    ok(`the output budget grows with the question count (${budgets[0]} -> ${budgets[1]})`);
  } else {
    bad('the output budget grows with the question count', JSON.stringify(budgets));
  }
  if (budgets.every((b) => b >= 8192)) ok('the budget is never below the 8192-token floor');
  else bad('the budget is never below the 8192-token floor', JSON.stringify(budgets));
} finally {
  for (const id of createdSetIds) {
    await db.query('DELETE FROM public.quiz_sets WHERE id = $1', [id]).catch(() => {});
  }
  await db.query('DELETE FROM public.profiles WHERE email = $1', [email]).catch(() => {});
  await agentPool.end().catch(() => {});
  await db.end().catch(() => {});
  await pool.end().catch(() => {});
  console.log('\n  ✓ test rows removed');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

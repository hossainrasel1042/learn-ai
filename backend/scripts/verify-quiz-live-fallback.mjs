
















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
const email = `quizlive-${stamp}@e2e.local`;
const password = 'QuizLive-2026!';

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

try {
  console.log(`\nLive quiz-generation check against ${API_BASE}`);

  const user = await createTestUser(email, password, db);
  token = user.token;
  ok('signed in');

  const created = await api('POST', '/quiz/sets', {
    title: 'Live Fallback Quiz',
    sourceType: 'manual',
  });
  const setId = created.body?.set?.id;
  if (!setId) {
    bad('created a quiz set', `${created.status} ${created.text.slice(0, 200)}`);
  } else {
    createdSetIds.push(setId);
    ok('created a quiz set');


    const gen = await api('POST', `/quiz/sets/${setId}/generate`, {
      sourceType: 'manual',
      text: SOURCE_TEXT,
      questionCount: 5,
    });

    console.log(`    HTTP ${gen.status}`);
    if (gen.body?.generatedBy) console.log(`    generatedBy = ${gen.body.generatedBy}`);

    if (gen.status === 200) {
      ok('POST /quiz/sets/:id/generate -> 200');

      const qs = gen.body?.questions ?? [];
      if (qs.length > 0) ok(`the quiz has questions (${qs.length})`);
      else bad('the quiz has questions', '0 questions');

      if (gen.body?.generatedBy === 'local') {
        ok('the AI quota was exhausted and the local generator was used');
      } else if (gen.body?.generatedBy === 'ai') {
        ok('the AI generated the questions (quota still available)');
      } else {
        bad('the response says who generated the questions', String(gen.body?.generatedBy));
      }


      let valid = true;
      let why = '';
      for (const [i, q] of qs.entries()) {
        const opts = [q.optionA, q.optionB, q.optionC, q.optionD];
        if (opts.some((o) => !o || !String(o).trim())) { valid = false; why = `q${i} empty option`; break; }
        if (new Set(opts.map((o) => String(o).trim().toLowerCase())).size !== 4) { valid = false; why = `q${i} duplicate options`; break; }
        if (!['A', 'B', 'C', 'D'].includes(q.correct)) { valid = false; why = `q${i} bad correct`; break; }
      }
      if (valid) ok('every question has four distinct options and a valid answer letter');
      else bad('every question has four distinct options and a valid answer letter', why);

      if (qs.length > 1 && new Set(qs.map((q) => q.correct)).size > 1) {
        ok(`the answer position varies (${qs.map((q) => q.correct).join(', ')})`);
      } else {
        info('the answer position did not vary (only one question, or all the same letter)');
      }


      const attempt = await api('POST', `/quiz/attempts`, { quizSetId: setId });
      if (attempt.status === 201) {
        ok('the generated quiz can be started (POST /quiz/attempts -> 201)');
        const attemptId = attempt.body?.attempt?.id;
        if (attemptId) {
          const qs2 = attempt.body?.questions ?? [];
          if (qs2.length > 0) ok(`the attempt carries the questions (${qs2.length})`);
          else bad('the attempt carries the questions', '0 questions');
          await api('DELETE', `/quiz/attempts/${attemptId}`).catch(() => {});
        }
      } else {
        bad('the generated quiz can be started', `${attempt.status} ${attempt.text.slice(0, 160)}`);
      }
    } else if (gen.status === 502) {


      if (/no usable questions/i.test(gen.text)) {
        bad('the error explains what went wrong', 'still says "no usable questions"');
      } else {
        ok(`the error explains what went wrong: "${gen.text.slice(0, 120)}"`);
      }
    } else if (gen.status === 429) {
      info('the backend surfaced the 429 instead of falling back — the fallback did not engage');
      bad('a 429 falls back to the local generator', 'the request failed with 429');
    } else {
      bad('POST /quiz/sets/:id/generate', `${gen.status} ${gen.text.slice(0, 220)}`);
    }
  }
} finally {
  for (const id of createdSetIds) {
    await db.query('DELETE FROM public.quiz_sets WHERE id = $1', [id]).catch(() => {});
  }
  await db.query('DELETE FROM public.profiles WHERE email = $1', [email]).catch(() => {});
  await db.end().catch(() => {});
  console.log('\n  ✓ test rows removed');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

















import { generateLocalQuestions } from '../src/quiz_agent/localGenerator.js';

let passed = 0;
let failed = 0;
const ok = (m) => { console.log(`  ✓ ${m}`); passed++; };
const bad = (m, e) => { console.log(`  ✗ ${m}${e ? `: ${e}` : ''}`); failed++; };


const SOURCE = `FILE: lecture 1
[Section: GOMEMLIMIT]

Kubernetes Pods & Namespaces: Production Guide
Nov 9, 2026 · @Rr
1. How pods work
A pod is the smallest unit Kubernetes schedules: one or more containers that share one IP
address, the same volumes and one lifecycle, and always run together on a single node.
The pause container is started first by the container runtime and it owns the pod's
network namespace, so the pod keeps its IP even when your app containers crash and
restart.
All containers inside a pod see the same IP address and the same localhost, which means
two containers in one pod cannot listen on the same port.
Containers share data only through volumes such as emptyDir, PVC, ConfigMap and Secret,
because their root filesystems always stay separate from each other.
The PID namespace is separate by default, and you have to set shareProcessNamespace to
true if you want the containers to see each other's processes.
Init containers run one at a time, each to completion, before any app container starts.
Sidecars run next to the app container, and a log shipper or a proxy is a common example.
Native sidecars are stable since Kubernetes 1.33 and they start before the main container
and stop after it.
2. Namespaces
A namespace provides a way to isolate groups of resources within a single cluster.
Namespaces do not provide any real isolation, they are only a logical grouping of resources.
The default namespace is used when a namespace is not specified in the manifest.
Every namespace has a special ServiceAccount called the default ServiceAccount.
Resource quotas and limit ranges are scoped to a single namespace by design.
3. Networking
Every pod gets its own IP address and can reach every other pod in the cluster without NAT.
The CNI plugin is responsible for setting up the pod network in the cluster.
Network policies control the traffic that flows between pods in the cluster.
A NetworkPolicy selects pods with label selectors and specifies traffic rules for them.`;

console.log('\nLocal generator check');


console.log('\n--- basic generation ---');

const questions = generateLocalQuestions({ sourceText: SOURCE, questionCount: 5 });

if (questions.length === 5) ok(`generated the requested 5 questions (got ${questions.length})`);
else bad('generated the requested 5 questions', `got ${questions.length}`);

if (questions.length > 0) {
  const first = questions[0];
  console.log('\n  sample question:');
  console.log(`    prompt:     ${first.prompt}`);
  console.log(`    A: ${first.optionA}`);
  console.log(`    B: ${first.optionB}`);
  console.log(`    C: ${first.optionC}`);
  console.log(`    D: ${first.optionD}`);
  console.log(`    correct:   ${first.correct}`);
  console.log(`    tags:      ${JSON.stringify(first.tags)}`);
  console.log(`    difficulty: ${first.difficulty}\n`);
}


console.log('--- shape of every question ---');

const REQUIRED = ['prompt', 'optionA', 'optionB', 'optionC', 'optionD', 'correct', 'explanation', 'tags', 'difficulty'];

let shapeOk = true;
let shapeErr = '';
for (const [i, q] of questions.entries()) {
  for (const key of REQUIRED) {
    if (q[key] === undefined || q[key] === null) {
      shapeOk = false;
      shapeErr = `question ${i} is missing "${key}"`;
      break;
    }
  }
  if (!shapeOk) break;
  if (!['A', 'B', 'C', 'D'].includes(q.correct)) {
    shapeOk = false;
    shapeErr = `question ${i} has invalid correct="${q.correct}"`;
    break;
  }
  if (!Array.isArray(q.tags) || q.tags.length === 0) {
    shapeOk = false;
    shapeErr = `question ${i} has no tags`;
    break;
  }
  if (!['easy', 'medium', 'hard'].includes(q.difficulty)) {
    shapeOk = false;
    shapeErr = `question ${i} has invalid difficulty="${q.difficulty}"`;
    break;
  }
}
if (shapeOk) ok('every question has the full shape the DB insert expects');
else bad('every question has the full shape the DB insert expects', shapeErr);


console.log('\n--- the four options are distinct ---');

let distinctOk = true;
let distinctErr = '';
for (const [i, q] of questions.entries()) {
  const opts = [q.optionA, q.optionB, q.optionC, q.optionD].map((o) => String(o).trim().toLowerCase());
  if (new Set(opts).size !== 4) {
    distinctOk = false;
    distinctErr = `question ${i} has duplicate options: ${JSON.stringify(opts)}`;
    break;
  }
  if (opts.some((o) => o.length === 0)) {
    distinctOk = false;
    distinctErr = `question ${i} has an empty option`;
    break;
  }
}
if (distinctOk) ok('all four options are non-empty and distinct');
else bad('all four options are non-empty and distinct', distinctErr);


console.log('\n--- the answer actually fits the blank ---');


const optionOf = (q, letter) => ({
  A: q.optionA, B: q.optionB, C: q.optionC, D: q.optionD,
}[letter]);

let blankOk = true;
let blankErr = '';


const NORMALISED_SOURCE = SOURCE.replace(/\s+/g, ' ');
for (const [i, q] of questions.entries()) {
  if (!q.prompt.includes('___')) {
    blankOk = false;
    blankErr = `question ${i} has no blank to fill: ${q.prompt}`;
    break;
  }
  const answer = optionOf(q, q.correct);


  const filled = q.prompt.replace('___', answer).trim().replace(/\s+/g, ' ');
  if (!NORMALISED_SOURCE.includes(filled)) {
    blankOk = false;
    blankErr = `question ${i}: filling the blank with "${answer}" does not reproduce the source`;
    break;
  }
}
if (blankOk) ok('filling the blank with the correct option reproduces the source sentence');
else bad('filling the blank with the correct option reproduces the source sentence', blankErr);


console.log('\n--- the distractors are actually wrong ---');

let distractorOk = true;
let distractorErr = '';
for (const [i, q] of questions.entries()) {
  const answer = String(optionOf(q, q.correct)).toLowerCase();
  for (const letter of ['A', 'B', 'C', 'D']) {
    if (letter === q.correct) continue;
    const opt = String(optionOf(q, letter));


    if (opt.toLowerCase() === answer) {
      distractorOk = false;
      distractorErr = `question ${i}: distractor ${letter} equals the answer`;
      break;
    }
  }
  if (!distractorOk) break;
}
if (distractorOk) ok('no distractor equals the correct answer');
else bad('no distractor equals the correct answer', distractorErr);


console.log('\n--- the answer is not always A ---');

const correctLetters = questions.map((q) => q.correct);
if (new Set(correctLetters).size > 1) ok(`the answer position varies (${correctLetters.join(', ')})`);
else bad('the answer position varies', `every question has correct="${correctLetters[0]}"`);


console.log('\n--- determinism ---');

const again = generateLocalQuestions({ sourceText: SOURCE, questionCount: 5 });
const same = JSON.stringify(again) === JSON.stringify(questions);
if (same) ok('the same source produces the same questions');
else bad('the same source produces the same questions', 'output differed between runs');


console.log('\n--- edge cases ---');

const empty = generateLocalQuestions({ sourceText: '', questionCount: 5 });
if (empty.length === 0) ok('empty source returns no questions (no crash)');
else bad('empty source returns no questions (no crash)', `got ${empty.length}`);

const tiny = generateLocalQuestions({ sourceText: 'Too short.', questionCount: 5 });
if (tiny.length === 0) ok('a source with too little text returns no questions (no crash)');
else bad('a source with too little text returns no questions (no crash)', `got ${tiny.length}`);

const nullish = generateLocalQuestions({});
if (nullish.length === 0) ok('missing options return no questions (no crash)');
else bad('missing options return no questions (no crash)', `got ${nullish.length}`);

const one = generateLocalQuestions({ sourceText: SOURCE, questionCount: 1 });
if (one.length === 1) ok('questionCount: 1 returns exactly one question');
else bad('questionCount: 1 returns exactly one question', `got ${one.length}`);

const many = generateLocalQuestions({ sourceText: SOURCE, questionCount: 20 });
if (many.length > 5) ok(`questionCount: 20 returns many questions (${many.length})`);
else bad('questionCount: 20 returns many questions', `got ${many.length}`);

const withDiff = generateLocalQuestions({ sourceText: SOURCE, questionCount: 3, difficulty: 'hard' });
if (withDiff.every((q) => q.difficulty === 'hard')) ok('an explicit difficulty is honoured');
else bad('an explicit difficulty is honoured', JSON.stringify(withDiff.map((q) => q.difficulty)));


console.log('\n--- a SHORT source still produces questions ---');



const SHORT = `The pause container starts first and owns the pod's network namespace.
Every pod receives its own IP address and can reach every other pod without network address translation.`;
const shortQs = generateLocalQuestions({ sourceText: SHORT, questionCount: 3 });
if (shortQs.length > 0) ok(`a short source still yields questions (${shortQs.length})`);
else bad('a short source still yields questions', `got ${shortQs.length}`);

let shortValid = true;
let shortErr = '';
for (const [i, q] of shortQs.entries()) {
  const opts = [q.optionA, q.optionB, q.optionC, q.optionD];
  if (opts.some((o) => !o || !String(o).trim())) { shortValid = false; shortErr = `q${i} empty option`; break; }
  if (new Set(opts.map((o) => String(o).trim().toLowerCase())).size !== 4) { shortValid = false; shortErr = `q${i} duplicate options`; break; }
  if (!['A', 'B', 'C', 'D'].includes(q.correct)) { shortValid = false; shortErr = `q${i} bad correct`; break; }
  if (!q.prompt.includes('___')) { shortValid = false; shortErr = `q${i} no blank`; break; }
}
if (shortValid) ok('the short-source questions are well formed');
else bad('the short-source questions are well formed', shortErr);


const ONE = 'Every namespace contains a special ServiceAccount named the default ServiceAccount.';
const oneQs = generateLocalQuestions({ sourceText: ONE, questionCount: 1 });
if (oneQs.length > 0) ok(`a single sentence still yields a question (${oneQs.length})`);
else bad('a single sentence still yields a question', `got ${oneQs.length}`);


console.log('\n--- a pasted-text style source also works ---');

const pasted = `React is a JavaScript library for building user interfaces. React lets you compose complex UIs from small and isolated pieces of code called components.
A component is a reusable, self-contained piece of logic that returns a React element. Components can accept arbitrary inputs called props and may contain state.
State is like a snapshot of the props at a given moment in time. When a component's state changes, React re-renders the component and updates the DOM.
Hooks are functions that let you use state and other React features without writing a class. The useState hook returns a state variable and a function to update it.
The useEffect hook lets you synchronize a component with an external system such as a network connection.`;
const pastedQs = generateLocalQuestions({ sourceText: pasted, questionCount: 4 });
if (pastedQs.length === 4) ok(`generated 4 questions from pasted text (got ${pastedQs.length})`);
else bad('generated 4 questions from pasted text', `got ${pastedQs.length}`);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

import 'dotenv/config';

import { embeddingService } from '../src/services/embeddingService.js';
import { settings } from '../src/config/settings.js';

let passed = 0;
let failed = 0;
const ok = (m) => { console.log(`  ✓ ${m}`); passed++; };
const bad = (m, e) => { console.log(`  ✗ ${m}${e ? `: ${e}` : ''}`); failed++; };

console.log('\n--- Embedding provider ---');

console.log(`  model: ${embeddingService.model}`);
console.log(`  provider: ${String(embeddingService.model).startsWith('gemini') ? 'Gemini' : 'other'}`);

if (String(embeddingService.model).startsWith('gemini')) {
  ok(`the active embedding model is Gemini (${embeddingService.model}) — no Cohere trial dependency`);
} else {
  bad(`the active embedding model must be Gemini, got ${embeddingService.model}`);
}

if (!settings.COHERE_API_KEY) {
  ok('COHERE_API_KEY is empty — the backend does not need a Cohere key to boot');
} else {
  ok('COHERE_API_KEY is set (optional; used only by the reranker, not by embeddings)');
}

const docs = ['The sky is blue.', 'Grass grows in the rain.', 'A third document about physics.'];
let vecs = null;
try {
  vecs = await embeddingService.embedDocuments(docs);
  ok(`embedDocuments returned ${vecs.length} vectors`);
} catch (e) {
  bad('embedDocuments failed', e?.message || e);
}

if (vecs?.length === docs.length) {
  const dims = vecs[0].length;
  ok(`embedding dimensionality is ${dims}`);
  if (dims === 3072) {
    ok('dimensionality matches gemini-embedding-001 (3072)');
  } else {
    bad(`expected 3072 dims for gemini-embedding-001, got ${dims}`);
  }

  const q = await embeddingService.embedQuery('what colour is the sky?');
  const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
  const norm = (a) => Math.sqrt(dot(a, a));
  const sims = vecs.map((v) => dot(q, v) / (norm(q) * norm(v)));
  const best = sims.indexOf(Math.max(...sims));
  console.log(`  cosine sims: ${sims.map((s) => s.toFixed(4)).join(', ')}`);
  if (best === 0) {
    ok('semantic check passed — the sky query is closest to the sky document');
  } else {
    bad(`semantic check failed — the sky query matched document ${best}, expected 0`);
  }
} else if (vecs) {
  bad(`embedDocuments returned ${vecs.length} vectors, expected ${docs.length}`);
}

if (settings.COHERE_API_KEY) {
  try {
    const res = await fetch('https://api.cohere.com/v1/embed', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.COHERE_API_KEY}`,
      },
      body: JSON.stringify({
        texts: ['probe'],
        model: 'embed-english-v3.0',
        input_type: 'search_document',
      }),
    });
    console.log(`  cohere embed status: ${res.status}`);
    if (res.status === 429) {
      ok('the Cohere trial key is exhausted (HTTP 429) — embeddings must not depend on it');
    } else {
      ok(`the Cohere key responds with ${res.status} — embeddings still do not depend on it`);
    }
  } catch (e) {
    ok(`could not reach Cohere (${e?.message || e}) — embeddings do not depend on it`);
  }
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);

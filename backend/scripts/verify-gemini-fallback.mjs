import 'dotenv/config';

import {
  GeminiService,
  modelCandidates,
  isRateLimitError,
  isTransientServiceError,
  shouldTryFallbackModel,
} from '../src/services/geminiService.js';
import { settings } from '../src/config/settings.js';

let passed = 0;
let failed = 0;
const ok = (m) => { console.log(`  ✓ ${m}`); passed++; };
const bad = (m, e) => { console.log(`  ✗ ${m}${e ? `: ${e}` : ''}`); failed++; };

console.log('\n--- Gemini model fallback ---');

const candidates = modelCandidates();
console.log(`  primary: ${settings.GEMINI_MODEL}`);
console.log(`  candidates: ${candidates.join(', ')}`);

if (candidates[0] === settings.GEMINI_MODEL) {
  ok(`the primary model "${settings.GEMINI_MODEL}" is tried first`);
} else {
  bad(`the primary model must be tried first, got "${candidates[0]}"`);
}

if (candidates.length > 1) {
  ok(`there are ${candidates.length - 1} fallback model(s) configured`);
} else {
  bad('no fallback models are configured — a quota error would be fatal');
}

if (new Set(candidates).size === candidates.length) {
  ok('the candidate list has no duplicates');
} else {
  bad('the candidate list contains duplicates');
}

const quota = new Error('[429 Too Many Requests] Quota exceeded for metric: generate_content_free_tier_requests');
const notQuota = new Error('The requested resource could not be found [404]');
if (isRateLimitError(quota)) {
  ok('a 429 quota error is recognised as a rate-limit error');
} else {
  bad('a 429 quota error was not recognised');
}
if (!isRateLimitError(notQuota)) {
  ok('a 404 model-not-found error is not treated as a rate-limit error');
} else {
  bad('a 404 error was wrongly treated as a rate-limit error');
}

const unavailable = new Error('[503 Service Unavailable] This model is currently experiencing high demand.');
if (isTransientServiceError(unavailable)) {
  ok('a 503 high-demand error is recognised as transient');
} else {
  bad('a 503 high-demand error was not recognised');
}
if (shouldTryFallbackModel(unavailable)) {
  ok('a 503 high-demand error triggers a fallback');
} else {
  bad('a 503 high-demand error did not trigger a fallback');
}
if (!shouldTryFallbackModel(notQuota)) {
  ok('a 404 error does not trigger a fallback');
} else {
  bad('a 404 error wrongly triggered a fallback');
}

const service = new GeminiService();
const tried = [];

const originalGet = service.client.getGenerativeModel.bind(service.client);
service.client.getGenerativeModel = (opts) => {
  tried.push(opts.model);
  if (opts.model === candidates[0]) {
    return {
      generateContent: async () => {
        throw new Error(
          '[429 Too Many Requests] Quota exceeded for metric: '
          + 'generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 20',
        );
      },
    };
  }
  return {
    generateContent: async () => ({
      candidates: [{ content: { parts: [{ text: 'fallback answer' }] }, finishReason: 'STOP' }],
      usageMetadata: { totalTokenCount: 5 },
    }),
  };
};

try {
  const { text, model } = await service.generateWithMeta('hello');
  if (text === 'fallback answer') {
    ok(`generation succeeded on the fallback model "${model}" after the primary was rate limited`);
  } else {
    bad(`the fallback returned unexpected text: ${JSON.stringify(text)}`);
  }
  if (tried.length >= 2 && tried[0] === candidates[0]) {
    ok(`the primary was tried first, then the fallback (${tried.join(' → ')})`);
  } else {
    bad(`unexpected attempt order: ${tried.join(' → ')}`);
  }
} catch (e) {
  bad('generateWithMeta did not fall back to another model', e?.message || e);
} finally {
  service.client.getGenerativeModel = originalGet;
}


const service503 = new GeminiService();
const tried503 = [];
service503.client.getGenerativeModel = (opts) => {
  tried503.push(opts.model);
  if (opts.model === candidates[0]) {
    return {
      generateContent: async () => {
        throw new Error(
          '[503 Service Unavailable] This model is currently experiencing high demand.',
        );
      },
    };
  }
  return {
    generateContent: async () => ({
      candidates: [{ content: { parts: [{ text: 'fallback after 503' }] }, finishReason: 'STOP' }],
    }),
  };
};

try {
  const { text, model } = await service503.generateWithMeta('hello');
  if (text === 'fallback after 503') {
    ok(`a transient 503 fell back to "${model}" instead of surfacing`);
  } else {
    bad(`the 503 fallback returned unexpected text: ${JSON.stringify(text)}`);
  }
  if (tried503.length >= 2) {
    ok(`the 503 was retried on the next model (${tried503.join(' → ')})`);
  } else {
    bad(`the 503 was not retried (tried: ${tried503.join(' → ')})`);
  }
} catch (e) {
  bad('a transient 503 did not fall back to another model', e?.message || e);
}

const service2 = new GeminiService();
const tried2 = [];
service2.client.getGenerativeModel = (opts) => {
  tried2.push(opts.model);
  return {
    generateContent: async () => {
      throw new Error('The requested resource could not be found [404 Not Found]');
    },
  };
};

try {
  await service2.generateWithMeta('hello');
  bad('a 404 error was swallowed — the fallback chain should not have retried');
} catch (e) {
  if (String(e.message).includes('404')) {
    ok(`a non-quota error surfaces unchanged (${e.message.slice(0, 48)}…)`);
  } else {
    bad(`a non-quota error was replaced: ${e.message || e}`);
  }
}
if (tried2.length === 1) {
  ok('a non-quota error does not switch models (only one model was tried)');
} else {
  bad(`a non-quota error tried ${tried2.length} models: ${tried2.join(' → ')}`);
}

const service3 = new GeminiService();
service3.client.getGenerativeModel = (opts) => ({
  generateContent: async () => {
    throw new Error('[429 Too Many Requests] Quota exceeded for metric: generate_content_free_tier_requests');
  },
});

try {
  await service3.generateWithMeta('hello');
  bad('an exhausted fallback chain returned successfully instead of throwing');
} catch (e) {
  if (isRateLimitError(e)) {
    ok('when every candidate is rate limited the quota error is thrown');
  } else {
    bad(`the wrong error surfaced: ${e.message || e}`);
  }
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);

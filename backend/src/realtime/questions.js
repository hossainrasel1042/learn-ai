

import { logger } from '../utils/logger.js';
import { geminiService } from '../services/geminiService.js';
import { collectCourseText } from '../srs_agent/sources.js';





const GENERATION_PROMPT = `You are a study assistant that creates high-quality multiple-choice quiz questions
from learning material.

Produce exactly 20 multiple-choice questions for a competitive 1v1 quiz battle.
Each question must have exactly 4 options labeled A, B, C, D with only one
correct answer. Mix difficulty (easy recall, applied reasoning, comparison).
Questions should be concise — no more than 25 words for the prompt.

Rules:
- "prompt" must be a clear question requiring recall or reasoning (not just yes/no).
- "options" is an object with keys A, B, C, D.
- "correct" is the letter ('A'/'B'/'C'/'D') of the correct option.
- "explanation" is a concise (1-2 sentence) justification of the correct answer.
- "tags" is 1-3 short topic strings (lowercase, kebab-case).
- "difficulty" is one of 'easy' | 'medium' | 'hard'.
- Wrong options must be plausible distractors, not obviously wrong.
- Output STRICT JSON only. No prose, no markdown fences, no commentary.`;

const QUESTIONS_SCHEMA_HINT = `{
  "questions": [
    {
      "prompt": "<question>",
      "options": { "A": "<option text>", "B": "<option text>", "C": "<option text>", "D": "<option text>" },
      "correct": "A",
      "explanation": "<why this is correct>",
      "tags": ["topic-a"],
      "difficulty": "medium"
    }
  ]
}`;





const VALID_OPTIONS = ['A', 'B', 'C', 'D'];

function pickOption(opts, letter) {
    if (!opts) return '';
    if (typeof opts === 'object') {
        if (opts[letter] !== undefined) return String(opts[letter]);
        const lower = String(letter).toLowerCase();
        if (opts[lower] !== undefined) return String(lower);
    }
    if (Array.isArray(opts)) {
        const idx = { A: 0, B: 1, C: 2, D: 3 }[letter];
        if (idx !== undefined && opts[idx] !== undefined) return String(opts[idx]);
    }
    return '';
}

function parseQuestions(raw) {
    if (!raw) return [];
    let payload = raw;
    if (!Array.isArray(payload) && typeof payload === 'object' && Array.isArray(payload.questions)) {
        payload = payload.questions;
    }
    if (!Array.isArray(payload)) return [];
    const out = [];
    for (const item of payload) {
        if (!item || typeof item !== 'object') continue;
        const prompt = String(item.prompt || item.question || '').trim();
        if (!prompt) continue;
        const correct = String(item.correct || '').toUpperCase();
        if (!VALID_OPTIONS.includes(correct)) continue;
        let a = pickOption(item.options, 'A');
        let b = pickOption(item.options, 'B');
        let c = pickOption(item.options, 'C');
        let d = pickOption(item.options, 'D');
        if (Array.isArray(item.options) && item.options.length >= 4) {
            a = String(item.options[0] || '');
            b = String(item.options[1] || '');
            c = String(item.options[2] || '');
            d = String(item.options[3] || '');
        }
        const tagsRaw = Array.isArray(item.tags) ? item.tags : [];
        const tags = tagsRaw
            .map((t) => String(t).trim().toLowerCase().replace(/\s+/g, '-'))
            .filter((t) => t.length > 0 && t.length <= 32)
            .slice(0, 3);
        const difficulty = ['easy', 'medium', 'hard'].includes(item.difficulty)
            ? item.difficulty
            : null;
        out.push({ prompt, optionA: a, optionB: b, optionC: c, optionD: d, correct, explanation: item.explanation ? String(item.explanation).trim() : null, tags, difficulty });
    }
    return out;
}





export const QUESTION_COUNT = 20;


function _syntheticQuestions(courseId) {
    const out = [];
    for (let i = 1; i <= QUESTION_COUNT; i++) {
        out.push({
            prompt: `Battle question ${i} (synthetic — no course material indexed for ${courseId.slice(0, 8)})`,
            optionA: 'Choice A',
            optionB: 'Choice B',
            optionC: 'Choice C',
            optionD: 'Choice D',
            correct: 'A',
            explanation: 'Synthetic fallback so the realtime flow can be tested without LLM.',
            tags: ['synthetic'],
            difficulty: 'easy',
        });
    }
    return out;
}


export async function generateBattleQuestions({ courseId, userId, pool }) {
    logger.info?.(`[realtime] generateBattleQuestions course=${courseId} count=${QUESTION_COUNT}`);




    const useSynthetic = String(process.env.BATTLE_SYNTHETIC_QUESTIONS || '').toLowerCase() === '1' ||
        String(process.env.BATTLE_SYNTHETIC_QUESTIONS || '').toLowerCase() === 'true';
    if (useSynthetic) {
        logger.warn?.(`[realtime] BATTLE_SYNTHETIC_QUESTIONS=1 — using synthetic questions (do NOT enable in production)`);
        return _syntheticQuestions(courseId);
    }

    let sourceText = '';
    try {
        sourceText = await collectCourseText(courseId, userId, pool);
    } catch (e) {
        logger.warn?.(`[realtime] collectCourseText failed: ${e?.message || e}`);
    }
    if (!sourceText || sourceText.length < 50) {
        throw Object.assign(
            new Error('Course material is too short or unavailable for a battle.'),
            { statusCode: 400 },
        );
    }

    const MAX_CHARS = 30_000;
    if (sourceText.length > MAX_CHARS) sourceText = sourceText.slice(0, MAX_CHARS);

    const userPrompt =
        `${GENERATION_PROMPT}\n\n` +
        `Generate ${QUESTION_COUNT} multiple-choice questions from the following source material.\n\n` +
        `<source>\n${sourceText}\n</source>\n\n` +
        `Respond with strict JSON matching:\n${QUESTIONS_SCHEMA_HINT}`;

    const raw = await geminiService.generateJson(userPrompt, QUESTIONS_SCHEMA_HINT);
    const parsed = parseQuestions(raw);
    if (parsed.length === 0) {
        throw Object.assign(new Error('AI returned no usable questions for battle.'), { statusCode: 502 });
    }

    return parsed.slice(0, QUESTION_COUNT);
}
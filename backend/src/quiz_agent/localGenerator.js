

import { logger } from '../utils/logger.js';






function splitSentences(text) {
  if (!text || typeof text !== 'string') return [];

  const lines = text.replace(/\r\n?/g, '\n').split('\n');





  const blocks = [];
  let current = '';
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (current) { blocks.push(current); current = ''; }
      continue;
    }
    const isHeading = trimmed.length <= 80 && (
      /[:：]$/.test(trimmed)

      || /^\d+(\.\d+)*[.)]?\s+\S/.test(trimmed)

      || /^(chapter|section|part|lesson|module|unit)\s+\w+/i.test(trimmed)
    );
    if (isHeading) {
      if (current) { blocks.push(current); current = ''; }
      blocks.push(trimmed);
      continue;
    }
    current = current ? `${current} ${trimmed}` : trimmed;
    if (/[.!?]["')\]]?$/.test(trimmed)) {
      blocks.push(current);
      current = '';
    }
  }
  if (current) blocks.push(current);

  const parts = blocks
    .flatMap((block) => block.split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/g))
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  return parts;
}


const STOP_SENTENCE_PATTERNS = [
  /^file\s*:/i,
  /^\[section[:\s]/i,
  /^table of contents/i,
  /^figure \d/i,
  /^chapter \d/i,
  /^\d+\s*$/,
  /^page \d/i,
  /^\[?\.\.\.\s*truncated/i,


  /^\d+\s*$|^(chapter|section|part|lesson|module|unit)\b/i,
];


function looksLikeTitle(sentence) {

  if (/[.!?]$/.test(sentence)) return false;

  if (sentence.split(/\s+/).length > 12) return false;

  const words = sentence.split(/\s+/).filter(Boolean);
  const capitalised = words.filter((w) => /^[A-Z0-9]/.test(w)).length;
  if (capitalised >= Math.ceil(words.length * 0.6)) return true;
  if (/[&—–|]/.test(sentence)) return true;
  return false;
}


const MIN_SENTENCE_LENGTH = 40;


const MAX_SENTENCE_LENGTH = 400;


const STOPWORDS = new Set([
  'that', 'this', 'with', 'from', 'have', 'been', 'were', 'they', 'their',
  'there', 'these', 'those', 'which', 'when', 'what', 'where', 'while',
  'would', 'could', 'should', 'about', 'into', 'over', 'under', 'also',
  'than', 'then', 'them', 'some', 'such', 'only', 'other', 'more', 'most',
  'very', 'much', 'many', 'each', 'both', 'after', 'before', 'because',
  'does', 'doing', 'done', 'will', 'shall', 'must', 'can', 'not', 'its',
  'his', 'her', 'our', 'your', 'you', 'and', 'for', 'are', 'was', 'has',
  'had', 'but', 'all', 'any', 'may', 'use', 'used', 'using', 'via', 'one',
  'two', 'out', 'per', 'set', 'new', 'such', 'same', 'way', 'well',
]);


function keyTerms(sentence) {
  const words = sentence
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^-+|-+$/g, ''))
    .filter((w) => w.length >= 4);

  const seen = new Set();
  const out = [];
  for (const w of words) {
    if (STOPWORDS.has(w)) continue;
    if (seen.has(w)) continue;
    seen.add(w);
    out.push(w);
  }
  return out;
}


function salientTerms(sentence) {
  const terms = keyTerms(sentence);



  const proper = [];
  const words = sentence.split(/\s+/);
  words.forEach((w, i) => {
    const clean = w.replace(/[^A-Za-z0-9\-]/g, '');
    if (i > 0 && clean.length >= 3 && /^[A-Z]/.test(clean) && !STOPWORDS.has(clean.toLowerCase())) {
      if (!proper.includes(clean)) proper.push(clean);
    }
  });

  const merged = [...proper, ...terms];
  return [...new Set(merged)];
}


function display(term) {
  if (!term) return '';

  if (/^[A-Z0-9\-]{2,}$/.test(term)) return term;
  if (/^[A-Z]/.test(term)) return term;
  return term.charAt(0).toUpperCase() + term.slice(1);
}


function toTag(term) {
  return String(term || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}


function toOptionText(text, maxLength = 160) {
  let s = String(text || '').replace(/\s+/g, ' ').trim();
  if (!s) return '';


  const boundary = s.search(/[,;:—–]|\s-\s/);
  if (boundary > 20) s = s.slice(0, boundary);

  s = s.replace(/[.!?]+$/, '').trim();
  if (s.length > maxLength) {
    s = `${s.slice(0, maxLength - 1).trimEnd()}…`;
  }
  return s;
}


function phraseClauses(sentence) {
  return String(sentence || '')
    .split(/[,;:—–]|\s-\s|\b(?:and|but|while|because|which|that|so)\b/i)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length >= 12 && s.length <= 90 && /[a-z]/i.test(s))
    .slice(0, 8);
}


const GENERIC_DISTRACTORS = [
  'None of the above',
  'It is not mentioned in the material',
  'The opposite of what is described',
  'This is unrelated to the source material',
];






const CLOZE = '___';


function buildQuestion({ sentence, others, terms, seed, difficulty }) {
  if (!sentence || !terms.length || !others.length) return null;


  const term = terms[0];
  if (!term || term.length < 3) return null;






  const match = new RegExp(`\\b${escapeRegExp(term)}\\b`, 'i').exec(sentence);
  if (!match) return null;

  const answer = match[0];
  const blanked = `${sentence.slice(0, match.index)}${CLOZE}${sentence.slice(match.index + match[0].length)}`;
  const prompt = blanked.trim();




  const distractors = [];
  const used = new Set([answer.toLowerCase()]);

  for (let i = 0; i < others.length && distractors.length < 3; i++) {
    const candidate = others[(i + seed) % others.length];
    const option = toOptionText(candidate);
    if (!option || option.length < 8) continue;
    const key = option.toLowerCase();
    if (used.has(key)) continue;

    if (option.toLowerCase().includes(answer.toLowerCase())) continue;
    used.add(key);
    distractors.push(option);
  }





  if (distractors.length < 3) {
    for (const phrase of phraseClauses(sentence)) {
      if (distractors.length >= 3) break;
      const key = phrase.toLowerCase();
      if (used.has(key)) continue;
      if (key.includes(answer.toLowerCase())) continue;
      used.add(key);
      distractors.push(phrase);
    }
  }




  if (distractors.length < 3) {
    for (const generic of GENERIC_DISTRACTORS) {
      if (distractors.length >= 3) break;
      const key = generic.toLowerCase();
      if (used.has(key)) continue;
      used.add(key);
      distractors.push(generic);
    }
  }

  if (distractors.length < 3) return null;








  const options = shuffleWithSeed([answer, ...distractors], seed);
  const correctIndex = options.indexOf(answer);

  const tags = terms
    .slice(0, 3)
    .map(toTag)
    .filter((t) => t.length >= 3);

  return {
    prompt,
    optionA: options[0],
    optionB: options[1],
    optionC: options[2],
    optionD: options[3],
    correct: ['A', 'B', 'C', 'D'][correctIndex],
    explanation:
      `The source material states: "${sentence.length > 240 ? `${sentence.slice(0, 240)}…` : sentence}"`,
    tags: tags.length ? tags : ['source-material'],
    difficulty: difficulty || pickDifficulty(seed),
  };
}


function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}


function shuffleWithSeed(array, seed) {
  const arr = [...array];
  let state = (seed * 2654435761) % 2147483647;
  if (state <= 0) state += 2147483646;
  const next = () => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}


function pickDifficulty(seed) {
  const options = ['easy', 'medium', 'medium', 'hard'];
  return options[Math.abs(seed) % options.length];
}






export function generateLocalQuestions({ sourceText, questionCount = 5, difficulty = null } = {}) {
  if (!sourceText || typeof sourceText !== 'string') return [];

  const sentences = splitSentences(sourceText).filter((s) => {
    if (s.length < MIN_SENTENCE_LENGTH || s.length > MAX_SENTENCE_LENGTH) return false;
    if (STOP_SENTENCE_PATTERNS.some((p) => p.test(s))) return false;
    if (looksLikeTitle(s)) return false;
    return true;
  });




  if (sentences.length < 1) {
    logger.warn(
      `localGenerator: not enough usable sentences (${sentences.length}) to build questions`,
    );
    return [];
  }

  const questions = [];
  const seenPrompts = new Set();


  const wanted = Math.max(1, Number(questionCount) || 5);

  for (let round = 0; round < wanted && questions.length < wanted; round++) {
    for (let i = 0; i < sentences.length && questions.length < wanted; i++) {
      const index = (round * sentences.length + i) % sentences.length;
      const sentence = sentences[index];
      const allTerms = salientTerms(sentence);
      if (!allTerms.length) continue;




      const termOffset = round % allTerms.length;
      const terms = [...allTerms.slice(termOffset), ...allTerms.slice(0, termOffset)];



      const others = [
        sentences[(index + 1) % sentences.length],
        sentences[(index + 2) % sentences.length],
        sentences[(index + 3) % sentences.length],
        sentences[(index + sentences.length - 1) % sentences.length],
        sentences[(index + sentences.length - 2) % sentences.length],
      ];

      const q = buildQuestion({
        sentence,
        others,
        terms,
        seed: index * 7 + round * 31 + 1,
        difficulty,
      });
      if (!q) continue;

      const key = q.prompt.toLowerCase();
      if (seenPrompts.has(key)) continue;
      seenPrompts.add(key);

      questions.push(q);
      break;
    }
  }

  logger.info(
    `localGenerator: built ${questions.length}/${wanted} questions from ${sentences.length} sentences`,
  );
  return questions;
}

export default generateLocalQuestions;

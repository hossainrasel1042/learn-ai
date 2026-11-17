

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

  return blocks
    .flatMap((block) => block.split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/g))
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
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
  /^(chapter|section|part|lesson|module|unit)\b/i,
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

  return [...new Set([...proper, ...terms])];
}


function toTag(term) {
  return String(term || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}


function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}


function toAnswerText(text, maxLength = 320) {
  let s = String(text || '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  s = s.replace(/[.!?]+$/, '').trim();
  if (s.length > maxLength) {
    s = `${s.slice(0, maxLength - 1).trimEnd()}…`;
  }
  return s;
}


const DEFINITION_PATTERNS = [
  /^(.{3,60}?)\s+(?:is|are)\s+(?:a|an|the|one of)\s+(.{10,})$/i,
  /^(.{3,60}?)\s+(?:refers to|means|denotes)\s+(.{10,})$/i,
  /^(.{3,60}?)\s+(?:is defined as|is called)\s+(.{10,})$/i,
];


function listItems(sentence) {
  const m = /^(.{3,80}?)\s+(?:are|include|consist of|contain)\s+(.+)$/i.exec(sentence);
  if (!m) return null;
  const subject = m[1].trim();
  const rest = m[2].trim();
  if (!rest.includes(',')) return null;
  const items = rest
    .split(/,\s*(?:and\s+|or\s+)?|\s+and\s+|\s+or\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2 && s.length <= 60);
  if (items.length < 2) return null;
  return { subject, items };
}





const CLOZE = '___';


function buildCard({ sentence, terms, seed }) {
  if (!sentence || !terms.length) return null;

  const tags = terms
    .slice(0, 3)
    .map(toTag)
    .filter((t) => t.length >= 3);


  for (const pattern of DEFINITION_PATTERNS) {
    const m = pattern.exec(sentence);
    if (!m) continue;
    const subject = m[1].trim();
    const definition = toAnswerText(m[2].trim());
    if (subject.length < 3 || definition.length < 8) continue;
    return {
      front: `What is ${subject}?`,
      back: definition,
      tags: tags.length ? tags : ['definition'],
    };
  }


  const list = listItems(sentence);
  if (list) {
    return {
      front: `What are the components of ${list.subject}?`,
      back: list.items.join(', '),
      tags: tags.length ? tags : ['list'],
    };
  }


  const term = terms[0];
  if (!term || term.length < 3) return null;
  const match = new RegExp(`\\b${escapeRegExp(term)}\\b`, 'i').exec(sentence);
  if (!match) return null;
  const answer = match[0];
  const front = `${sentence.slice(0, match.index)}${CLOZE}${sentence.slice(match.index + match[0].length)}`.trim();
  if (!front || front.length < 12) return null;
  return {
    front: `Complete the statement: ${front}`,
    back: answer,
    tags: tags.length ? tags : ['source-material'],
  };
}


function isDuplicateCard(a, b) {
  if (!a || !b) return false;
  if (a.front === b.front) return true;


  const norm = (front) => String(front)
    .replace(/^Complete the statement:\s*/i, '')
    .replace(/^What is\s+/i, '')
    .replace(/^What are the components of\s+/i, '')
    .replace(new RegExp(CLOZE, 'g'), ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  const na = norm(a.front);
  const nb = norm(b.front);
  if (!na || !nb) return false;
  if (na === nb) return true;

  const shorter = na.length < nb.length ? na : nb;
  const longer = na.length < nb.length ? nb : na;
  if (shorter.length < 20) return false;
  return longer.replace(shorter, '').trim().split(/\s+/).length <= 2;
}






export function generateLocalCards({ sourceText, cardCount = 10 } = {}) {
  if (!sourceText || typeof sourceText !== 'string') return [];

  const sentences = splitSentences(sourceText).filter((s) => {
    if (s.length < MIN_SENTENCE_LENGTH || s.length > MAX_SENTENCE_LENGTH) return false;
    if (STOP_SENTENCE_PATTERNS.some((p) => p.test(s))) return false;
    if (looksLikeTitle(s)) return false;
    return true;
  });

  if (sentences.length < 1) {
    logger.warn(
      `localGenerator: not enough usable sentences (${sentences.length}) to build cards`,
    );
    return [];
  }

  const cards = [];
  const wanted = Math.max(1, Number(cardCount) || 10);





  for (let i = 0; i < sentences.length && cards.length < wanted; i++) {
    const sentence = sentences[i];
    const allTerms = salientTerms(sentence);
    if (!allTerms.length) continue;



    let picked = null;
    for (let t = 0; t < allTerms.length && !picked; t++) {
      const terms = [...allTerms.slice(t), ...allTerms.slice(0, t)];
      const card = buildCard({ sentence, terms, seed: i * 7 + t * 31 + 1 });
      if (!card) continue;
      if (cards.some((existing) => isDuplicateCard(existing, card))) continue;
      picked = card;
    }
    if (picked) cards.push(picked);
  }




  if (cards.length < wanted) {
    for (let i = 0; i < sentences.length && cards.length < wanted; i++) {
      const sentence = sentences[i];
      const allTerms = salientTerms(sentence);
      if (!allTerms.length) continue;
      for (let t = 0; t < allTerms.length && cards.length < wanted; t++) {
        const terms = [...allTerms.slice(t), ...allTerms.slice(0, t)];
        const card = buildCard({ sentence, terms, seed: i * 7 + t * 31 + 1 });
        if (!card) continue;
        if (cards.some((existing) => isDuplicateCard(existing, card))) continue;
        cards.push(card);
        break;
      }
    }
  }

  logger.info(
    `localGenerator: built ${cards.length}/${wanted} cards from ${sentences.length} sentences`,
  );
  return cards;
}

export default generateLocalCards;

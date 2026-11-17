

import { logger } from '../utils/logger.js';






function splitSentences(text) {
  if (!text || typeof text !== 'string') return [];

  const lines = text.replace(/\r\n?/g, '\n').split('\n');

  const blocks = [];
  let current = '';
  let currentStart = 0;
  let offset = 0;
  for (const raw of lines) {
    const lineStart = offset;
    offset += raw.length + 1;
    const trimmed = raw.trim();
    if (!trimmed) {
      if (current) { blocks.push({ text: current, index: currentStart }); current = ''; }
      continue;
    }
    const isHeading = trimmed.length <= 80 && (
      /[:：]$/.test(trimmed)
      || /^\d+(\.\d+)*[.)]?\s+\S/.test(trimmed)
      || /^(chapter|section|part|lesson|module|unit)\s+\w+/i.test(trimmed)
    );
    if (isHeading) {
      if (current) { blocks.push({ text: current, index: currentStart }); current = ''; }
      blocks.push({ text: trimmed, index: lineStart });
      continue;
    }
    if (!current) currentStart = lineStart;
    current = current ? `${current} ${trimmed}` : trimmed;
    if (/[.!?]["')\]]?$/.test(trimmed)) {
      blocks.push({ text: current, index: currentStart });
      current = '';
    }
  }
  if (current) blocks.push({ text: current, index: currentStart });

  const out = [];
  for (const block of blocks) {


    for (const part of block.text.split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/g)) {
      const cleaned = part.replace(/\s+/g, ' ').trim();
      if (cleaned) out.push({ text: cleaned, index: block.index });
    }
  }
  return out;
}


function extractTitle(text) {
  if (!text || typeof text !== 'string') return '';
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (/^\d+(\.\d+)*[.)]?\s+\S/.test(line)) continue;
    if (/^(chapter|section|part|lesson|module|unit)\s+\w+/i.test(line)) continue;
    if (/^file\s*:/i.test(line)) continue;
    if (line.length > 90) continue;
    return line.replace(/[:：]$/, '').trim();
  }
  return '';
}


function extractHeadings(text) {
  if (!text || typeof text !== 'string') return [];
  const out = [];
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  let offset = 0;
  for (const raw of lines) {
    const line = raw.trim();
    const start = offset;
    offset += raw.length + 1;
    if (!line || line.length > 80) continue;
    const isHeading =
      /[:：]$/.test(line)
      || /^\d+(\.\d+)*[.)]?\s+\S/.test(line)
      || /^(chapter|section|part|lesson|module|unit)\s+\w+/i.test(line);
    if (!isHeading) continue;
    const label = line.replace(/[:：]$/, '').trim();
    if (!label) continue;
    out.push({ label, index: start });
  }
  return out;
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


function display(term) {
  if (!term) return '';
  if (/^[A-Z0-9\-]{2,}$/.test(term)) return term;
  if (/^[A-Z]/.test(term)) return term;
  return term.charAt(0).toUpperCase() + term.slice(1);
}


function toDescription(text, maxLength = 180) {
  let s = String(text || '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  if (s.length > maxLength) {
    s = `${s.slice(0, maxLength - 1).trimEnd()}…`;
  }
  return s;
}






export function generateLocalMindMap({ sourceText, nodeCount = 12, title = null } = {}) {
  const empty = { root: '', nodes: [] };
  if (!sourceText || typeof sourceText !== 'string') return empty;

  const sentences = splitSentences(sourceText).filter((s) => {
    if (s.text.length < MIN_SENTENCE_LENGTH || s.text.length > MAX_SENTENCE_LENGTH) return false;
    if (STOP_SENTENCE_PATTERNS.some((p) => p.test(s.text))) return false;
    return true;
  });

  if (sentences.length < 1) {
    logger.warn(
      `localGenerator: not enough usable sentences (${sentences.length}) to build a mind map`,
    );
    return empty;
  }

  const wanted = Math.max(2, Number(nodeCount) || 12);




  const headings = extractHeadings(sourceText);
  let rootLabel = '';
  if (title && String(title).trim()) {
    rootLabel = String(title).trim();
  } else {
    rootLabel = extractTitle(sourceText);
  }
  if (!rootLabel) {
    const freq = new Map();
    for (const s of sentences) {
      for (const t of keyTerms(s.text)) {
        freq.set(t, (freq.get(t) || 0) + 1);
      }
    }
    const top = [...freq.entries()].sort((a, b) => b[1] - a[1])[0];
    rootLabel = top ? display(top[0]) : 'Source Material';
  }
  rootLabel = rootLabel.replace(/[:：]$/, '').trim() || 'Source Material';

  const nodes = [];
  let counter = 0;
  const nextId = () => `n${counter++}`;

  const rootId = nextId();
  nodes.push({
    id: rootId,
    label: rootLabel.slice(0, 60),
    level: 0,
    parent: null,
    description: `Overview of ${rootLabel}`,
  });






  const groups = [];
  const headingBranches = headings.filter(
    (h) => h.label.toLowerCase() !== rootLabel.toLowerCase(),
  );

  if (headingBranches.length >= 2) {
    for (const heading of headingBranches) {
      groups.push({
        label: heading.label.replace(/^\d+(\.\d+)*[.)]?\s+/, '').trim() || heading.label,
        index: heading.index,
        sentences: [],
      });
    }

    for (const sentence of sentences) {
      let target = null;
      for (const group of groups) {
        if (group.index <= sentence.index) target = group;
        else break;
      }

      if (!target) continue;
      target.sentences.push({
        sentence: sentence.text,
        terms: salientTerms(sentence.text),
      });
    }
  }

  if (groups.filter((g) => g.sentences.length > 0).length < 2) {

    const byTerm = new Map();
    for (const sentence of sentences) {
      const terms = salientTerms(sentence.text);
      if (!terms.length) continue;
      const key = terms[0].toLowerCase();
      if (!byTerm.has(key)) byTerm.set(key, { label: display(terms[0]), sentences: [] });
      byTerm.get(key).sentences.push({ sentence: sentence.text, terms });
    }
    groups.length = 0;
    groups.push(...byTerm.values());
  }


  const usable = groups.filter((g) => g.sentences.length > 0);
  const branchCount = Math.max(
    1,
    Math.min(usable.length, Math.ceil((wanted - 1) / 2)),
  );
  const ordered = usable.slice(0, branchCount);



  const usedLabels = new Set([rootLabel.toLowerCase()]);

  for (const group of ordered) {
    if (nodes.length >= wanted) break;
    const branchId = nextId();
    let label = display(group.label).slice(0, 40);
    if (usedLabels.has(label.toLowerCase())) {

      const alt = group.sentences
        .flatMap((s) => s.terms)
        .find((t) => !usedLabels.has(display(t).slice(0, 40).toLowerCase()));
      label = alt ? display(alt).slice(0, 40) : label;
    }
    usedLabels.add(label.toLowerCase());
    nodes.push({
      id: branchId,
      label,
      level: 1,
      parent: rootId,
      description: toDescription(group.sentences[0]?.sentence),
    });


    const detailBudget = Math.max(1, Math.ceil((wanted - nodes.length) / 2));
    const details = group.sentences.slice(0, detailBudget);
    for (const { sentence, terms } of details) {
      if (nodes.length >= wanted) break;
      const detailTerm = terms.find(
        (t) => !usedLabels.has(display(t).slice(0, 40).toLowerCase()),
      );
      if (!detailTerm) continue;
      const detailLabel = display(detailTerm).slice(0, 40);
      usedLabels.add(detailLabel.toLowerCase());
      const detailId = nextId();
      nodes.push({
        id: detailId,
        label: detailLabel,
        level: 2,
        parent: branchId,
        description: toDescription(sentence),
      });
    }
  }



  if (nodes.length < 2) {
    const terms = salientTerms(sentences[0].text);
    for (const term of terms) {
      if (nodes.length >= Math.min(wanted, 3)) break;
      const label = display(term).slice(0, 40);
      if (usedLabels.has(label.toLowerCase())) continue;
      usedLabels.add(label.toLowerCase());
      const id = nextId();
      nodes.push({
        id,
        label,
        level: 1,
        parent: rootId,
        description: toDescription(sentences[0].text),
      });
    }
  }

  logger.info(
    `localGenerator: built ${nodes.length} nodes (root="${rootLabel}") from ${sentences.length} sentences`,
  );
  return { root: rootLabel, nodes };
}

export default generateLocalMindMap;

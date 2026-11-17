


const ROLE_OVERRIDE_TOKENS = [
  /<\|im_start\|>/gi,
  /<\|im_end\|>/gi,
  /<\|system\|>/gi,
  /<\|user\|>/gi,
  /<\|assistant\|>/gi,
  /<system\b[^>]*>/gi,
  /<\/system>/gi,
  /<assistant\b[^>]*>/gi,
  /<\/assistant>/gi,
  /###\s*System\s*:/gi,
  /###\s*Assistant\s*:/gi,
  /###\s*User\s*:/gi,
  /\[INST\]\s*/gi,
  /\[\/INST\]/gi,
  /<<SYS>>/gi,
  /<<\/SYS>>/gi,
];


export function stripRoleOverrideTokens(text) {
  if (typeof text !== 'string') return '';
  let out = text;
  for (const pattern of ROLE_OVERRIDE_TOKENS) {
    out = out.replace(pattern, '');
  }
  return out;
}


export function wrapChannel(name, content, { maxChars = 30_000 } = {}) {
  const safeName = String(name || 'content').replace(/[^a-zA-Z0-9_-]/g, '');
  let raw = '';
  if (typeof content === 'string') {
    raw = content;
  } else if (content === null || content === undefined) {
    raw = '';
  } else if (typeof content === 'object') {
    raw = JSON.stringify(content);
  } else {
    raw = String(content);
  }
  raw = stripRoleOverrideTokens(raw);
  if (raw.length > maxChars) {
    raw = `${raw.slice(0, maxChars)}\n\n[... truncated at ${maxChars} chars ...]`;
  }
  return `<${safeName}>\n${raw}\n</${safeName}>`;
}


export function wrapChannels(entries, opts) {
  return entries
    .map(([name, content]) => wrapChannel(name, content, opts))
    .join('\n\n');
}

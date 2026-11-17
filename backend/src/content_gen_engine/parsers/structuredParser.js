

import { logger } from '../../utils/logger.js';


export class ParsedImage {
  constructor({
    id,
    prompt,
    alt,
    position = 'center',
    width = '80%',
    style = 'educational, clean, minimalist',
  } = {}) {
    this.id = id;
    this.prompt = prompt;
    this.alt = alt;
    this.position = position;
    this.width = width;
    this.style = style;
  }
}


export class ParsedMermaid {
  constructor({ id, diagram_type, code, caption = null } = {}) {
    this.id = id;
    this.diagram_type = diagram_type;
    this.code = code;
    this.caption = caption;
  }
}


export class ParsedCodeBlock {
  constructor({ language, code, title = null } = {}) {
    this.language = language;
    this.code = code;
    this.title = title;
  }
}


export class ParsedCallout {
  constructor({ callout_type, content, title = null } = {}) {
    this.callout_type = callout_type;
    this.content = content;
    this.title = title;
  }
}


export class ParsedTable {
  constructor({ headers, rows, caption = null } = {}) {
    this.headers = headers;
    this.rows = rows;
    this.caption = caption;
  }
}


export class ParsedContent {
  constructor({
    headings = [],
    paragraphs = [],
    images = [],
    diagrams = [],
    code_blocks = [],
    callouts = [],
    lists = [],
    tables = [],
    citations = [],
    element_order = [],
  } = {}) {
    this.headings = headings;
    this.paragraphs = paragraphs;
    this.images = images;
    this.diagrams = diagrams;
    this.code_blocks = code_blocks;
    this.callouts = callouts;
    this.lists = lists;
    this.tables = tables;
    this.citations = citations;

    this.element_order = element_order;
  }
}


export class ParsedPage {
  constructor({
    number,
    page_type,
    title = null,
    subtitle = null,
    content = null,
    speaker_notes = null,
  } = {}) {
    this.number = number;
    this.page_type = page_type;
    this.title = title;
    this.subtitle = subtitle;
    this.content = content || new ParsedContent();
    this.speaker_notes = speaker_notes;
  }
}


export class ParsedDocument {
  constructor({
    document_type,
    title,
    subtitle = null,
    author = null,
    course = null,
    pages = [],
    theme = null,
  } = {}) {
    this.document_type = document_type;
    this.title = title;
    this.subtitle = subtitle;
    this.author = author;
    this.course = course;
    this.pages = pages;
    this.theme = theme;
  }
}


const htmlEscape = (s) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const htmlUnescape = (s) =>
  s
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');


class XmlElement {
  constructor(tag, attrs = {}, children = []) {
    this.tag = tag;
    this.attrs = attrs;
    this.children = children;
    this.text = null;
    this.tail = null;
  }

  get(name, defaultValue = null) {
    return Object.prototype.hasOwnProperty.call(this.attrs, name)
      ? this.attrs[name]
      : defaultValue;
  }

  find(tag) {
    const stack = [...this.children];
    while (stack.length) {
      const node = stack.shift();
      if (node.tag === tag) return node;
      if (node.children && node.children.length) stack.push(...node.children);
    }
    return null;
  }

  findAll(tag) {
    const out = [];
    const stack = [...this.children];
    while (stack.length) {
      const node = stack.shift();
      if (node.tag === tag) out.push(node);
      if (node.children && node.children.length) stack.push(...node.children);
    }
    return out;
  }
}

const parseXml = (input) => {
  let pos = 0;

  const skipWhitespace = () => {
    while (pos < input.length && /\s/.test(input[pos])) pos += 1;
  };

  const parseAttrs = () => {
    const attrs = {};
    while (pos < input.length) {
      skipWhitespace();
      if (input[pos] === '>' || input[pos] === '/' || pos >= input.length) break;
      const m = input.slice(pos).match(/^([A-Za-z_:][\w:.\-]*)\s*=\s*("([^"]*)"|'([^']*)')/);
      if (!m) break;
      attrs[m[1]] = m[3] !== undefined ? m[3] : m[4];
      pos += m[0].length;
    }
    return attrs;
  };

  const parseElement = () => {
    if (input[pos] !== '<') throw new Error('expected < at ' + pos);
    pos += 1;

    if (input[pos] === '?' || input[pos] === '!') {
      const end = input.indexOf('>', pos);
      if (end < 0) throw new Error('malformed special tag');
      pos = end + 1;
      return parseElement();
    }
    const tagMatch = input.slice(pos).match(/^([A-Za-z_][\w:.\-]*)/);
    if (!tagMatch) throw new Error('invalid tag at ' + pos);
    const tag = tagMatch[1];
    pos += tag.length;
    const attrs = parseAttrs();
    skipWhitespace();
    if (input[pos] === '/') {

      pos += 1;
      if (input[pos] === '>') pos += 1;
      return new XmlElement(tag, attrs, []);
    }
    if (input[pos] !== '>') throw new Error('expected > at ' + pos);
    pos += 1;

    const children = [];
    let textBuf = '';
    while (pos < input.length) {
      const lt = input.indexOf('<', pos);
      if (lt < 0) throw new Error('unterminated element');
      if (lt > pos) textBuf += input.slice(pos, lt);
      if (input[lt + 1] === '/') {

        const closeEnd = input.indexOf('>', lt);
        if (closeEnd < 0) throw new Error('unterminated close');
        pos = closeEnd + 1;
        const elem = new XmlElement(tag, attrs, children);
        if (textBuf) elem.text = textBuf;
        return elem;
      }

      if (input.slice(lt, lt + 9) === '<![CDATA[') {
        const cdataEnd = input.indexOf(']]>', lt);
        if (cdataEnd < 0) throw new Error('unterminated CDATA');
        textBuf += input.slice(lt + 9, cdataEnd);
        pos = cdataEnd + 3;
        continue;
      }
      const child = parseElement();

      const tail = child.tail || '';
      textBuf += tail;
      children.push(child);
      pos = pos;
    }
    throw new Error('unterminated element ' + tag);
  };

  skipWhitespace();
  return parseElement();
};


export class StructuredContentParser {
  constructor() {
    this.image_counter = 0;
    this.diagram_counter = 0;
  }


  parse(content) {

    this.image_counter = 0;
    this.diagram_counter = 0;


    content = this._preprocess(content);


    let root;
    try {
      root = parseXml(content);
    } catch (e) {
      logger.warn(`XML parse error, attempting fix: ${e.message || e}`);
      content = this._fix_xml(content);
      try {
        root = parseXml(content);
      } catch (e2) {

        return this._create_fallback_document(content);
      }
    }


    const doc = new ParsedDocument({
      document_type: root.get('type', 'markdown'),
      title: root.get('title', 'Untitled'),
    });


    const pageElems = root.findAll('page');
    for (const pageElem of pageElems) {
      doc.pages.push(this._parse_page(pageElem));
    }


    const themeElem = root.find('theme');
    if (themeElem !== null) {
      doc.theme = this._parse_theme(themeElem);
    }

    return doc;
  }

  _preprocess(content) {
    content = content.trim();


    if (!content.startsWith('<document')) {
      const match = content.match(/<document[\s\S]*?<\/document>/);
      if (match) {
        content = match[0];
      } else {

        content = `<document type="markdown" title="Generated">${content}</document>`;
      }
    }


    content = this._escape_code_blocks(content);


    content = this._escape_mermaid_blocks(content);

    return content;
  }

  _escape_code_blocks(content) {

    return content.replace(/(<code[^>]*>)([\s\S]*?)(<\/code>)/g, (m, start, code, end) => {
      const escaped = htmlEscape(code);
      return `${start}${escaped}${end}`;
    });
  }

  _escape_mermaid_blocks(content) {

    return content.replace(/(<mermaid[^>]*>)([\s\S]*?)(<\/mermaid>)/g, (m, start, code, end) => {
      if (code.includes('<![CDATA[')) {
        return m;
      }
      return `${start}<![CDATA[${code}]]>${end}`;
    });
  }

  _fix_xml(content) {




    const selfClosingRe = new RegExp('<(img|br|hr)([^>]*?)(?<!/)>', 'g');
    content = content.replace(selfClosingRe, '<$1$2/>');


    content = content.replace(/&(?!(amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9A-Fa-f]+;))/g, '&amp;');

    return content;
  }

  _parse_page(elem) {
    const page = new ParsedPage({
      number: parseInt(elem.get('number', 1), 10),
      page_type: elem.get('type', 'content'),
    });


    const titleElem = elem.find('title');
    if (titleElem !== null && titleElem.text) {
      page.title = titleElem.text.trim();
    }

    const subtitleElem = elem.find('subtitle');
    if (subtitleElem !== null && subtitleElem.text) {
      page.subtitle = subtitleElem.text.trim();
    }


    const notesElem = elem.find('speaker_notes');
    if (notesElem !== null && notesElem.text) {
      page.speaker_notes = notesElem.text.trim();
    }


    page.content = this._parse_content(elem);

    return page;
  }

  _parse_content(parent) {
    const content = new ParsedContent();

    for (const child of parent.children) {
      const tag = (child.tag || '').toLowerCase();

      if (tag === 'heading') {
        const heading = {
          level: parseInt(child.get('level', 1), 10),
          text: child.text || '',
        };
        content.headings.push(heading);
        content.element_order.push(['heading', content.headings.length - 1]);
      } else if (tag === 'paragraph') {
        const text = this._get_text(child);
        content.paragraphs.push(text);
        content.element_order.push(['paragraph', content.paragraphs.length - 1]);
      } else if (tag === 'img') {
        this.image_counter += 1;
        const img = new ParsedImage({
          id: `img_${this.image_counter}`,
          prompt: child.get('prompt', ''),
          alt: child.get('alt', ''),
          position: child.get('position', 'center'),
          width: child.get('width', '80%'),
          style: child.get('style', 'educational'),
        });
        content.images.push(img);
        content.element_order.push(['image', content.images.length - 1]);
      } else if (tag === 'mermaid') {
        this.diagram_counter += 1;
        let code = this._get_text(child).trim();

        code = code.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');

        const diagram = new ParsedMermaid({
          id: `diagram_${this.diagram_counter}`,
          diagram_type: child.get('type', 'flowchart'),
          code,
          caption: child.get('caption'),
        });
        content.diagrams.push(diagram);
        content.element_order.push(['diagram', content.diagrams.length - 1]);
      } else if (tag === 'code') {
        const codeText = htmlUnescape(this._get_text(child));
        const codeBlock = new ParsedCodeBlock({
          language: child.get('language', 'python'),
          code: codeText,
          title: child.get('title'),
        });
        content.code_blocks.push(codeBlock);
        content.element_order.push(['code', content.code_blocks.length - 1]);
      } else if (tag === 'callout') {
        const callout = new ParsedCallout({
          callout_type: child.get('type', 'info'),
          content: this._get_text(child),
          title: child.get('title'),
        });
        content.callouts.push(callout);
        content.element_order.push(['callout', content.callouts.length - 1]);
      } else if (tag === 'list') {
        const items = child
          .findAll('item')
          .map((item) => (item.text ? item.text : ''));
        const listData = {
          type: child.get('type', 'bullet'),
          items,
        };
        content.lists.push(listData);
        content.element_order.push(['list', content.lists.length - 1]);
      } else if (tag === 'table') {
        const table = this._parse_table(child);
        if (table) {
          content.tables.push(table);
          content.element_order.push(['table', content.tables.length - 1]);
        }
      } else if (tag === 'citation') {
        const citation = {
          source: child.get('source', ''),
          page: child.get('page'),
          section: child.get('section'),
        };
        content.citations.push(citation);
        content.element_order.push(['citation', content.citations.length - 1]);
      }
    }

    return content;
  }

  _get_text(elem) {
    let text = elem.text || '';


    if (text.startsWith('<![CDATA[')) {
      text = text.slice(9, -3);
    }

    for (const child of elem.children) {
      if (child.tail) {
        text += child.tail;
      }
    }

    return text;
  }

  _parse_table(elem) {
    const headers = [];
    const rows = [];

    const headersElem = elem.find('headers');
    if (headersElem !== null) {
      for (const h of headersElem.findAll('header')) {
        headers.push(h.text || '');
      }
    }

    for (const rowElem of elem.findAll('row')) {
      const row = rowElem.findAll('cell').map((cell) => cell.text || '');
      rows.push(row);
    }

    if (headers.length || rows.length) {
      return new ParsedTable({
        headers,
        rows,
        caption: elem.get('caption'),
      });
    }
    return null;
  }

  _parse_theme(elem) {
    const theme = {};
    for (const child of elem.children) {
      if (child.text) {
        theme[child.tag] = child.text;
      }
    }
    return theme;
  }

  _create_fallback_document(content) {
    const doc = new ParsedDocument({
      document_type: 'markdown',
      title: 'Generated Content',
    });


    const page = new ParsedPage({ number: 1, page_type: 'content' });
    page.content.paragraphs.push(content);
    page.content.element_order.push(['paragraph', 0]);

    doc.pages.push(page);
    return doc;
  }
}


export const getContentParser = () => new StructuredContentParser();
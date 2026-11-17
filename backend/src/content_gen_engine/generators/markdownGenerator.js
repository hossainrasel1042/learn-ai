

import path from 'node:path';
import fs from 'node:fs/promises';
import { logger } from '../../utils/logger.js';


export class MarkdownGenerator {

  constructor(outputDir = './output') {
    this.outputDir = outputDir;
  }


  generate(document, includeImages = true, imagePaths = null) {
    const lines = [];


    lines.push(`# ${document.title}`);
    if (document.subtitle) {
      lines.push(`*${document.subtitle}*`);
    }
    lines.push('');


    if (document.author || document.course) {
      if (document.author) {
        lines.push(`**Author:** ${document.author}`);
      }
      if (document.course) {
        lines.push(`**Course:** ${document.course}`);
      }
      lines.push('');
    }


    lines.push('## Table of Contents');
    for (const page of document.pages) {
      if (page.title && page.page_type !== 'title') {
        lines.push(`- [${page.title}](#${this._slugify(page.title)})`);
      }
    }
    lines.push('');
    lines.push('---');
    lines.push('');


    for (const page of document.pages) {
      const pageMd = this._render_page(page, includeImages, imagePaths);
      lines.push(pageMd);
      lines.push('');
      lines.push('---');
      lines.push('');
    }

    return lines.join('\n');
  }


  async save(document, filename = null, kwargs = {}) {







    let includeImages = true;
    let imagePaths = null;
    if (filename && typeof filename === 'object') {

      imagePaths = filename;
    } else if (filename && typeof filename === 'string') {

    }
    if (kwargs && typeof kwargs === 'object') {
      if ('include_images' in kwargs) includeImages = !!kwargs.include_images;
      if ('includeImages' in kwargs) includeImages = !!kwargs.includeImages;
      if ('image_paths' in kwargs) imagePaths = kwargs.image_paths;
      if ('imagePaths' in kwargs) imagePaths = kwargs.imagePaths;
    }

    const content = this.generate(document, includeImages, imagePaths);

    let finalName = typeof filename === 'string' ? filename : null;
    if (!finalName) {
      finalName = `${this._slugify(document.title)}.md`;
    }

    const outputPath = path.join(this.outputDir, finalName);
    await fs.mkdir(this.outputDir, { recursive: true });
    await fs.writeFile(outputPath, content, 'utf8');

    logger.info(`Saved markdown: ${outputPath}`);
    return outputPath;
  }

  _render_page(page, includeImages, imagePaths) {
    const lines = [];


    if (page.title) {
      if (page.page_type === 'title') {
        lines.push(`# ${page.title}`);
        if (page.subtitle) {
          lines.push(`### ${page.subtitle}`);
        }
      } else {
        lines.push(`## ${page.title}`);
      }
    }

    lines.push('');


    const content = page.content;
    for (const [elementType, idx] of content.element_order) {
      if (elementType === 'heading') {
        const h = content.headings[idx];
        const prefix = '#'.repeat(h.level + 1);
        lines.push(`${prefix} ${h.text}`);
        lines.push('');
      } else if (elementType === 'paragraph') {
        lines.push(content.paragraphs[idx]);
        lines.push('');
      } else if (elementType === 'image' && includeImages) {
        const img = content.images[idx];
        if (imagePaths && img.id in imagePaths) {

          const imgPath = this._make_relative_path(imagePaths[img.id]);
          lines.push(`![${img.alt}](${imgPath})`);
        } else {

          lines.push(`<!-- IMAGE: ${img.prompt} -->`);
          lines.push(`*[Image: ${img.alt}]*`);
        }
        lines.push('');
      } else if (elementType === 'diagram') {
        const diagram = content.diagrams[idx];

        if (imagePaths && diagram.id in imagePaths) {

          const diagramPath = this._make_relative_path(imagePaths[diagram.id]);
          const caption = diagram.caption || 'Diagram';
          lines.push(`![${caption}](${diagramPath})`);
          if (diagram.caption) {
            lines.push(`*${diagram.caption}*`);
          }
        } else {

          lines.push('```mermaid');
          lines.push(diagram.code);
          lines.push('```');
          if (diagram.caption) {
            lines.push(`*${diagram.caption}*`);
          }
        }
        lines.push('');
      } else if (elementType === 'code') {
        const code = content.code_blocks[idx];
        if (code.title) {
          lines.push(`**${code.title}**`);
        }
        lines.push(`\`\`\`${code.language}`);
        lines.push(code.code);
        lines.push('```');
        lines.push('');
      } else if (elementType === 'callout') {
        const callout = content.callouts[idx];
        const icon = this._get_callout_icon(callout.callout_type);
        lines.push(`> ${icon} **${callout.callout_type.toUpperCase()}**`);
        lines.push('> ');
        lines.push(`> ${callout.content}`);
        lines.push('');
      } else if (elementType === 'list') {
        const lst = content.lists[idx];

        const items = (lst.items || []).filter((item) => item && String(item).trim());
        if (items.length) {

          items.forEach((item, i) => {
            if (lst.type === 'numbered') {
              lines.push(`${i + 1}. ${String(item).trim()}`);
            } else {
              lines.push(`- ${String(item).trim()}`);
            }
          });
          lines.push('');
        }
      } else if (elementType === 'table') {
        const table = content.tables[idx];
        lines.push(this._render_table(table));
        lines.push('');
      } else if (elementType === 'citation') {
        const cit = content.citations[idx];
        let source = cit.source;
        if (cit.page) {
          source += `, p.${cit.page}`;
        }
        lines.push(`*Source: ${source}*`);
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  _render_table(table) {
    const lines = [];

    if (table.headers && table.headers.length) {
      lines.push(`| ${table.headers.join(' | ')} |`);
      lines.push(`| ${Array(table.headers.length).fill('---').join(' | ')} |`);
    }

    for (const row of table.rows) {
      lines.push(`| ${row.join(' | ')} |`);
    }

    if (table.caption) {
      lines.push(`*${table.caption}*`);
    }

    return lines.join('\n');
  }

  _get_callout_icon(calloutType) {
    const icons = {
      info: 'ℹ️',
      warning: '⚠️',
      tip: '💡',
      example: '📝',
    };
    return icons[calloutType] || 'ℹ️';
  }

  _make_relative_path(absolutePath) {
    const absPath = path.resolve(absolutePath);



    const parentName = path.basename(path.dirname(absPath));
    const filename = path.basename(absPath);


    return `${parentName}/${filename}`;
  }

  _slugify(text) {
    let slug = String(text).toLowerCase();
    slug = slug.replace(/[^\w\s-]/g, '');
    slug = slug.replace(/[\s_]+/g, '-');
    return slug.replace(/^-+|-+$/g, '');
  }
}


export const getMarkdownGenerator = (outputDir = './output') =>
  new MarkdownGenerator(outputDir);
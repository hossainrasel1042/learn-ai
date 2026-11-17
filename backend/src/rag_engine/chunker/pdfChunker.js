

import { readFile } from 'node:fs/promises';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';

import { countTokens } from './base.js';

let HAS_PDFPARSE = true;


export class PDFPage {
  constructor({ pageNumber, text, headers = [] }) {
    this.pageNumber = pageNumber;
    this.text = text;
    this.headers = headers;
  }
}


export class PDFChunker {

  constructor(config = null) {
    const defaultConfig = {
      minTokens: 150,
      maxTokens: 1000,
      targetTokens: 500,
      overlapTokens: 75,
    };
    this.config = config || defaultConfig;
  }


  async chunk(content, metadata) {
    if (!HAS_PDFPARSE) {
      throw new Error('pdf-parse required: npm install pdf-parse');
    }

    const filePath = content;
    const pages = await this._extractPages(filePath);
    return this._chunkPages(pages, metadata);
  }


  chunkFromText(text, metadata) {
    return this._chunkText(text, metadata);
  }


  async _extractPages(filePath) {
    const buffer = await readFile(filePath);








    const data = await pdfParse(new Uint8Array(buffer));





    const pages = [];
    const pageTexts = data.text.split('\f');

    for (let i = 0; i < pageTexts.length; i++) {
      const pageText = pageTexts[i];
      const headers = this._detectHeaders(pageText);
      pages.push(
        new PDFPage({
          pageNumber: i + 1,
          text: pageText,
          headers,
        })
      );
    }

    return pages;
  }


  _detectHeaders(text) {
    const headers = [];
    const lines = text.split('\n');
    for (const line of lines) {
      const stripped = line.trim();

      if (!stripped) continue;
      if (stripped.length < 80 && /^[A-Z][A-Z\s\d:.-]+$/.test(stripped)) {
        headers.push([1, stripped]);
      } else if (/^#{1,3}\s+/.test(stripped)) {
        headers.push([2, stripped.replace(/^#+\s+/, '')]);
      }
    }
    return headers;
  }


  _chunkPages(pages, baseMetadata) {
    const chunks = [];
    let currentSection = null;
    let bufferText = [];
    let bufferPages = [];
    let bufferTokens = 0;

    for (const page of pages) {

      for (const [level, header] of page.headers) {
        if (level === 1) {

          if (bufferText.length) {
            chunks.push(
              this._createChunk(
                bufferText.join('\n'),
                bufferPages,
                currentSection,
                baseMetadata
              )
            );
            bufferText = [];
            bufferPages = [];
            bufferTokens = 0;
          }
          currentSection = header;
        }
      }

      const pageTokens = countTokens(page.text);


      if (bufferTokens + pageTokens > this.config.maxTokens) {
        if (bufferText.length) {
          chunks.push(
            this._createChunk(
              bufferText.join('\n'),
              bufferPages,
              currentSection,
              baseMetadata
            )
          );
        }


        if (pageTokens > this.config.maxTokens) {
          const pageChunks = this._splitLargeText(
            page.text,
            [page.pageNumber],
            currentSection,
            baseMetadata
          );
          chunks.push(...pageChunks);
          bufferText = [];
          bufferPages = [];
          bufferTokens = 0;
        } else {
          bufferText = [page.text];
          bufferPages = [page.pageNumber];
          bufferTokens = pageTokens;
        }
      } else {
        bufferText.push(page.text);
        bufferPages.push(page.pageNumber);
        bufferTokens += pageTokens;
      }
    }


    if (bufferText.length) {
      chunks.push(
        this._createChunk(
          bufferText.join('\n'),
          bufferPages,
          currentSection,
          baseMetadata
        )
      );
    }

    return chunks;
  }


  _chunkText(text, baseMetadata) {
    const sentences = this._splitSentences(text);
    const chunks = [];
    let buffer = [];
    let bufferTokens = 0;

    for (const sentence of sentences) {
      const sentTokens = countTokens(sentence);

      if (bufferTokens + sentTokens > this.config.maxTokens) {
        if (buffer.length) {
          chunks.push(
            this._createChunk(buffer.join(' '), [], null, baseMetadata)
          );
        }
        buffer = [sentence];
        bufferTokens = sentTokens;
      } else {
        buffer.push(sentence);
        bufferTokens += sentTokens;
      }
    }

    if (buffer.length) {
      chunks.push(this._createChunk(buffer.join(' '), [], null, baseMetadata));
    }

    return chunks;
  }


  _splitLargeText(text, pageNumbers, section, baseMetadata) {
    const sentences = this._splitSentences(text);
    const chunks = [];
    let buffer = [];
    let bufferTokens = 0;

    for (const sentence of sentences) {
      const sentTokens = countTokens(sentence);

      if (bufferTokens + sentTokens > this.config.maxTokens) {
        if (buffer.length) {
          chunks.push(
            this._createChunk(buffer.join(' '), pageNumbers, section, baseMetadata)
          );
        }
        buffer = [sentence];
        bufferTokens = sentTokens;
      } else {
        buffer.push(sentence);
        bufferTokens += sentTokens;
      }
    }

    if (buffer.length) {
      chunks.push(
        this._createChunk(buffer.join(' '), pageNumbers, section, baseMetadata)
      );
    }

    return chunks;
  }


  _createChunk(text, pageNumbers, section, baseMetadata) {
    let content = text;
    if (section) {
      content = `[Section: ${section}]\n\n${text}`;
    }


    let pageRef = null;
    if (pageNumbers.length) {
      if (pageNumbers.length === 1) {
        pageRef = `Page ${pageNumbers[0]}`;
      } else {
        pageRef = `Pages ${pageNumbers[0]}-${pageNumbers[pageNumbers.length - 1]}`;
      }
    }

    const chunkMetadata = {
      ...baseMetadata,
      chunk_type: 'pdf',
      page_numbers: pageNumbers,
      page_range: pageRef,
      section: section,
    };

    return {
      content,
      metadata: chunkMetadata,
      tokenCount: countTokens(content),
    };
  }


  _splitSentences(text) {

    const sentences = text.split(/(?<=[.!?])\s+/);
    return sentences.map((s) => s.trim()).filter((s) => s);
  }
}


export function getPdfChunker(config = null) {
  return new PDFChunker(config);
}
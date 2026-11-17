

import { basename, extname } from 'node:path';
import { readFile } from 'node:fs/promises';

import { Chunk, ChunkingConfig } from './base.js';
import { SlideChunker, getSlideChunker } from './slideChunker.js';
import { PDFChunker, getPdfChunker } from './pdfChunker.js';
import { CodeChunker, getCodeChunker } from './codeChunker.js';
import { CodePreprocessor } from '../code_processor/codePreprocessor.js';
import { logger } from '../../utils/logger.js';


export class ChunkingService {

  static SLIDE_EXTENSIONS = new Set(['.pptx', '.ppt']);
  static PDF_EXTENSIONS = new Set(['.pdf']);
  static CODE_EXTENSIONS = new Set([
    '.py',
    '.js',
    '.ts',
    '.java',
    '.cpp',
    '.c',
    '.go',
    '.rs',
    '.rb',
  ]);


  constructor(slideConfig = null, pdfConfig = null, codeConfig = null) {
    this.slideChunker = getSlideChunker(slideConfig);
    this.pdfChunker = getPdfChunker(pdfConfig);
    this.codeChunker = getCodeChunker(codeConfig);
    this.codePreprocessor = new CodePreprocessor();
  }


  chunkFile(filePath, metadata = null) {
    const meta = metadata || {};






    if (meta.source_file === undefined) {
      meta.source_file = filePath;
    }
    meta.filename = basename(filePath);

    const ext = extname(filePath).toLowerCase();

    if (ChunkingService.SLIDE_EXTENSIONS.has(ext)) {

      return this.slideChunker.chunk(filePath, meta);
    }
    if (ChunkingService.PDF_EXTENSIONS.has(ext)) {
      return this.pdfChunker.chunk(filePath, meta);
    }
    if (ChunkingService.CODE_EXTENSIONS.has(ext)) {
      return this.codeChunker.chunk(filePath, meta);
    }
    throw new Error(`Unsupported file type: ${ext}`);
  }


  async chunkFileWithLlm(filePath, metadata = null) {
    const meta = metadata || {};
    if (meta.source_file === undefined) {
      meta.source_file = filePath;
    }
    meta.filename = basename(filePath);

    const ext = extname(filePath).toLowerCase();

    if (ChunkingService.CODE_EXTENSIONS.has(ext)) {

      const code = await readFile(filePath, 'utf8');


      logger.info(`Running LLM analysis on ${filePath}`);
      const analysis = await this.codePreprocessor.process(code, meta.filename);


      return this.codeChunker.chunkWithLlmMetadata(code, meta, analysis);
    }

    return this.chunkFile(filePath, meta);
  }


  chunkContent(content, contentType, metadata = null) {
    const meta = metadata || {};

    if (contentType === 'code') {
      return this.codeChunker.chunk(content, meta);
    }
    if (contentType === 'pdf' || contentType === 'text') {
      return this.pdfChunker.chunkFromText(content, meta);
    }
    throw new Error(`Unknown content type: ${contentType}`);
  }


  async chunkCodeWithLlm(code, filename, metadata = null) {
    const meta = metadata || {};
    meta.filename = filename;


    const analysis = await this.codePreprocessor.process(code, filename);


    const chunks = this.codeChunker.chunkWithLlmMetadata(code, meta, analysis);

    return [chunks, analysis];
  }


  getSupportedExtensions() {
    return {
      slides: [...ChunkingService.SLIDE_EXTENSIONS],
      pdf: [...ChunkingService.PDF_EXTENSIONS],
      code: [...ChunkingService.CODE_EXTENSIONS],
    };
  }
}


export function getChunkingService(
  slideConfig = null,
  pdfConfig = null,
  codeConfig = null
) {
  return new ChunkingService(slideConfig, pdfConfig, codeConfig);
}


export const chunkingService = new ChunkingService();


export { Chunk, ChunkingConfig };
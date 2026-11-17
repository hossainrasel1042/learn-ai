

import { createHash } from 'node:crypto';

let _encoder = null;
let HAS_TIKTOKEN = false;
try {
  // eslint-disable-next-line no-unused-vars
  const tiktoken = await import('tiktoken');
  _encoder = tiktoken.get_encoding('cl100k_base');
  HAS_TIKTOKEN = true;
} catch {
  HAS_TIKTOKEN = false;
}


export class Chunk {

  constructor({ content, metadata, tokenCount, chunkId = null }) {
    this.content = content;
    this.metadata = metadata;
    this.tokenCount = tokenCount;
    if (chunkId === null || chunkId === undefined) {
      this.chunkId = generateChunkId(content);
    } else {
      this.chunkId = chunkId;
    }
  }


  toDict() {
    return {
      content: this.content,
      metadata: this.metadata,
      tokenCount: this.tokenCount,
      chunkId: this.chunkId,
    };
  }


  static fromDict(d) {
    return new Chunk({
      content: d.content,
      metadata: d.metadata,
      tokenCount: d.tokenCount,
      chunkId: d.chunkId ?? null,
    });
  }
}


export class ChunkingConfig {
  constructor({
    chunkSize = 1000,
    chunkOverlap = 200,
    minChunkSize = 100,
    maxChunkSize = 2000,
  } = {}) {
    this.chunkSize = chunkSize;
    this.chunkOverlap = chunkOverlap;
    this.minChunkSize = minChunkSize;
    this.maxChunkSize = maxChunkSize;
  }
}


export function countTokens(text) {
  if (HAS_TIKTOKEN && _encoder) {
    return _encoder.encode(text).length;
  }

  return Math.floor(text.length / 4);
}


export function generateChunkId(content) {
  return createHash('sha256').update(content, 'utf8').digest('hex').slice(0, 16);
}
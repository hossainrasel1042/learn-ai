

import { existsSync, statSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { ChunkingService, Chunk, getChunkingService } from './chunker/index.js';
import {
  VectorStoreService,
  getVectorStore,
} from '../services/vectorStoreService.js';
import { logger } from '../utils/logger.js';


export class IngestionService {

  constructor(
    collectionName = 'learnai',
    chunkingService = null,
    vectorStore = null
  ) {
    this.chunkingService = chunkingService || getChunkingService();
    this.vectorStore = vectorStore || getVectorStore(collectionName);
    this.collectionName = collectionName;
  }


  ingestFile(filePath, metadata = null) {
    if (!existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    logger.info(`Ingesting file: ${filePath.split('/').pop()}`);


    const baseMetadata = { ...(metadata || {}) };
    const filename = filePath.split('/').pop();
    const ext = '.' + (filename.split('.').pop() || '').toLowerCase();






    if (baseMetadata.source_file === undefined) {
      baseMetadata.source_file = filePath;
    }
    baseMetadata.filename = filename;
    baseMetadata.file_type = ext;


    const chunks = this.chunkingService.chunkFile(filePath, baseMetadata);


    if (chunks && typeof chunks.then === 'function') {
      return chunks.then((resolved) => {
        if (!resolved || resolved.length === 0) {
          logger.warn(`No chunks generated from ${filename}`);
          return [];
        }
        logger.info(`Generated ${resolved.length} chunks from ${filename}`);
        return this._storeChunks(resolved);
      });
    }

    if (!chunks || chunks.length === 0) {
      logger.warn(`No chunks generated from ${filename}`);
      return [];
    }

    logger.info(`Generated ${chunks.length} chunks from ${filename}`);
    return this._storeChunks(chunks);
  }


  async ingestDirectory(directoryPath, recursive = false, metadata = null) {
    if (!existsSync(directoryPath) || !statSync(directoryPath).isDirectory()) {
      throw new Error(`Not a directory: ${directoryPath}`);
    }

    const supportedExts = new Set();
    for (const exts of Object.values(
      this.chunkingService.getSupportedExtensions()
    )) {
      for (const ext of exts) supportedExts.add(ext);
    }

    const results = {};

    const allFiles = await readdir(directoryPath, { recursive });
    const filesToProcess = recursive
      ? allFiles
      : allFiles.filter((f) => !f.includes('/'));

    for (const name of filesToProcess) {
      const filePath = join(directoryPath, name);
      try {
        if (
          statSync(filePath).isFile() &&
          supportedExts.has('.' + (name.split('.').pop() || '').toLowerCase())
        ) {
          const fileMetadata = { ...(metadata || {}) };
          const chunkIds = await this.ingestFile(filePath, fileMetadata);
          results[name] = chunkIds;
        }
      } catch (e) {
        logger.error(`Failed to ingest ${name}: ${e.message || e}`);
        results[name] = [];
      }
    }

    const totalChunks = Object.values(results).reduce(
      (s, ids) => s + ids.length,
      0
    );
    logger.info(
      `Ingested ${Object.keys(results).length} files with ${totalChunks} total chunks`
    );

    return results;
  }


  async ingestContent(content, contentType, metadata = null) {
    const baseMetadata = metadata || {};
    const chunks = this.chunkingService.chunkContent(
      content,
      contentType,
      baseMetadata
    );

    if (!chunks || chunks.length === 0) return [];

    return this._storeChunks(chunks);
  }


  async _storeChunks(chunks) {
    const documents = chunks.map((chunk) => chunk.content);
    const metadatas = chunks.map((chunk) => chunk.metadata);

    const ids = await this.vectorStore.addDocuments(documents, metadatas);
    return ids;
  }


  async clearCollection() {
    try {

      const allDocs = await this.vectorStore.getAll(300);
      if (allDocs && allDocs.length) {
        const ids = allDocs.map((doc) => doc.id);
        await this.vectorStore.delete(ids);
        logger.info(`Cleared ${ids.length} documents from collection`);
      }
    } catch (e) {
      logger.error(`Failed to clear collection: ${e.message || e}`);
    }
  }


  async getStats() {
    const count = await this.vectorStore.count();
    return {
      collection_name: this.collectionName,
      document_count: count,
    };
  }
}


export function getIngestionService(collectionName = 'learnai') {
  return new IngestionService(collectionName);
}


void Chunk;
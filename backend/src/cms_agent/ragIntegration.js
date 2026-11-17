

import { existsSync, statSync } from 'node:fs';
import { extname } from 'node:path';

import { getIngestionService } from '../rag_engine/index.js';
import { getVectorStore } from '../services/vectorStoreService.js';
import { logger } from '../utils/logger.js';


export class RAGIntegrationService {

  constructor(collectionName = 'learnai') {
    this.collectionName = collectionName;
    this._ingestionService = null;
    this._vectorStore = null;
  }


  get ingestionService() {
    if (this._ingestionService === null) {
      this._ingestionService = getIngestionService(this.collectionName);
    }
    return this._ingestionService;
  }


  get vectorStore() {
    if (this._vectorStore === null) {
      this._vectorStore = getVectorStore(this.collectionName);
    }
    return this._vectorStore;
  }


  async ingestMaterial({
    filePath,
    materialId,
    courseId,
    courseNo,
    materialType,
    metadata = null,
  }) {
    logger.info(`[INGESTION] ===== Starting ingestion =====`);
    logger.info(`[INGESTION] File: ${filePath}`);
    logger.info(`[INGESTION] Material ID: ${materialId}`);
    logger.info(`[INGESTION] Course: ${courseNo} (${courseId})`);
    logger.info(`[INGESTION] Type: ${materialType}`);
    logger.debug(`[INGESTION] Extra metadata: ${JSON.stringify(metadata || {})}`);

    try {
      if (!existsSync(filePath)) {
        logger.error(`[INGESTION] File not found: ${filePath}`);
        return 0;
      }

      const size = statSync(filePath).size;
      logger.debug(`[INGESTION] File exists, size: ${size} bytes`);
      logger.debug(`[INGESTION] File extension: ${extname(filePath)}`);


      const chunkMetadata = {
        material_id: String(materialId),
        course_id: String(courseId),
        course_no: courseNo,
        material_type: materialType,
        ...(metadata || {}),
      };
      logger.debug(`[INGESTION] Chunk metadata: ${JSON.stringify(chunkMetadata)}`);

      logger.info(`[INGESTION] Calling ingestion service...`);
      const chunkIds = await this.ingestionService.ingestFile(
        String(filePath),
        chunkMetadata
      );

      logger.info(`[INGESTION] ✅ SUCCESS: Created ${chunkIds.length} chunks`);
      if (chunkIds.length > 0) {
        logger.debug(`[INGESTION] First chunk ID: ${chunkIds[0]}`);
      }
      logger.info(`[INGESTION] ===== Ingestion complete =====`);
      return chunkIds.length;
    } catch (e) {
      logger.error(
        `[INGESTION] ❌ FAILED: ${e.message || e}`,
        { stack: e.stack }
      );
      throw e;
    }
  }


  async deleteMaterialChunks(filePath) {
    try {
      const chunks = await this.vectorStore.getByFilter(
        { source_file: filePath },
        500
      );

      if (!chunks || chunks.length === 0) {
        logger.info(`No chunks found for: ${filePath}`);
        return 0;
      }

      const chunkIds = chunks.map((c) => c.id);
      await this.vectorStore.delete(chunkIds);

      logger.info(`Deleted ${chunkIds.length} chunks for: ${filePath}`);
      return chunkIds.length;
    } catch (e) {
      logger.error(`Failed to delete chunks for ${filePath}: ${e.message || e}`);
      return 0;
    }
  }


  async deleteMaterialChunksById(materialId) {
    try {
      const chunks = await this.vectorStore.getByFilter(
        { material_id: String(materialId) },
        500
      );

      if (!chunks || chunks.length === 0) {
        return 0;
      }

      const chunkIds = chunks.map((c) => c.id);
      await this.vectorStore.delete(chunkIds);

      logger.info(
        `Deleted ${chunkIds.length} chunks for material: ${materialId}`
      );
      return chunkIds.length;
    } catch (e) {
      logger.error(
        `Failed to delete chunks for material ${materialId}: ${e.message || e}`
      );
      return 0;
    }
  }
}


let _ragIntegration = null;


export function getRagIntegration(collectionName = 'learnai') {
  if (_ragIntegration === null) {
    _ragIntegration = new RAGIntegrationService(collectionName);
  }
  return _ragIntegration;
}

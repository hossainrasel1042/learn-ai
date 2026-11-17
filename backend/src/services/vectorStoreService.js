

import { createHash } from 'node:crypto';
import { getChromaClient } from '../config/chromadb.js';
import { embeddingService } from './embeddingService.js';
import { logger } from '../utils/logger.js';


export class VectorStoreService {

  constructor(collectionName = 'rag-documents') {


    this.collectionName = collectionName;
    this.embeddingService = embeddingService;

    this._collection = null;
  }


  async _ensureCollection() {
    if (this._collection) return this._collection;
    const client = await getChromaClient();
    this._collection = await client.getOrCreateCollection({
      name: this.collectionName,
      metadata: { 'hnsw:space': 'cosine' },
    });
    return this._collection;
  }


  async addDocuments(documents, metadatas, ids = null) {
    if (!documents || documents.length === 0) return [];

    const collection = await this._ensureCollection();










    const finalIds = ids || documents.map((doc, i) =>
      this._generateId(doc, metadatas?.[i]),
    );


    const embeddings = await this.embeddingService.embedDocuments(documents);


    const cleanMetadatas = metadatas.map((m) => this._sanitizeMetadata(m));


    await collection.add({
      ids: finalIds,
      embeddings,
      documents,
      metadatas: cleanMetadatas,
    });

    logger.info(`Added ${documents.length} documents to vector store`);
    return finalIds;
  }


  async search(query, k = 10, where = null) {
    const collection = await this._ensureCollection();
    const queryEmbedding = await this.embeddingService.embedQuery(query);

    const results = await collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults: k,
      where: where || undefined,
      include: ['documents', 'metadatas', 'distances'],
    });

    const formatted = [];
    const ids = results.ids[0] || [];
    const documents = results.documents[0] || [];
    const metadatas = results.metadatas[0] || [];
    const distances = results.distances[0] || [];

    for (let i = 0; i < ids.length; i++) {
      formatted.push({
        id: ids[i],
        content: documents[i],
        metadata: metadatas[i],
        distance: distances[i],

        score: 1 / (1 + distances[i]),
      });
    }

    return formatted;
  }


  async delete(ids) {
    const collection = await this._ensureCollection();
    await collection.delete({ ids });
    logger.info(`Deleted ${ids.length} documents`);
  }


  async getByFilter(where, limit = 100) {
    const collection = await this._ensureCollection();
    const results = await collection.get({
      where,
      limit,
      include: ['documents', 'metadatas'],
    });

    const formatted = [];
    const ids = results.ids || [];
    const documents = results.documents || [];
    const metadatas = results.metadatas || [];

    for (let i = 0; i < ids.length; i++) {
      formatted.push({
        id: ids[i],
        content: documents[i],
        metadata: metadatas[i],
      });
    }

    return formatted;
  }


  async getAll(limit = 300) {
    try {
      const collection = await this._ensureCollection();
      const results = await collection.get({
        limit,
        include: ['documents', 'metadatas'],
      });

      const formatted = [];
      const ids = results.ids || [];
      const documents = results.documents || [];
      const metadatas = results.metadatas || [];

      for (let i = 0; i < ids.length; i++) {
        formatted.push({
          id: ids[i],
          content: documents[i],
          metadata: metadatas[i],
        });
      }

      return formatted;
    } catch (e) {
      logger.error(`Failed to get all documents: ${e.message || e}`);
      return [];
    }
  }


  async count() {
    const collection = await this._ensureCollection();
    return await collection.count();
  }


  _generateId(content, metadata = null) {
    const materialId =
      metadata && metadata.material_id ? String(metadata.material_id) : '';
    return createHash('sha256')
      .update(`${materialId}\u0000${content}`, 'utf8')
      .digest('hex')
      .slice(0, 16);
  }


  _sanitizeMetadata(metadata) {
    const clean = {};
    for (const [key, value] of Object.entries(metadata)) {
      if (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
      ) {
        clean[key] = value;
      } else if (Array.isArray(value)) {

        if (value.every((v) => typeof v === 'string')) {
          clean[key] = value.join(',');
        } else {
          clean[key] = String(value);
        }
      } else if (value === null || value === undefined) {
        clean[key] = '';
      } else {
        clean[key] = String(value);
      }
    }
    return clean;
  }
}


export const vectorStoreService = new VectorStoreService();


export const getVectorStore = (collectionName = 'rag-documents') =>
  new VectorStoreService(collectionName);

export default vectorStoreService;

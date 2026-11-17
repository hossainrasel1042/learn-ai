

import { v4 as uuidv4 } from 'uuid';

import { getChromaClient } from '../config/chromadb.js';
import { embeddingService } from '../services/embeddingService.js';
import { logger } from '../utils/logger.js';
import { buildChromaWhere } from '../utils/chromaFilter.js';


export class ChatMemory {
  static COLLECTION_NAME = 'chat_memories';

  constructor() {
    this.client = null;
    this.embeddingService = embeddingService;
    this._collection = null;
  }


  async _getCollection() {
    if (this._collection) return this._collection;
    if (!this.client) {
      this.client = await getChromaClient();
    }
    this._collection = await this.client.getOrCreateCollection({
      name: ChatMemory.COLLECTION_NAME,
      metadata: { 'hnsw:space': 'cosine' },
    });
    return this._collection;
  }


  async _getEmbedding(text) {
    const [vector] = await this.embeddingService.embedDocuments([text]);
    return vector;
  }


  async _getQueryEmbedding(text) {
    const [vector] = await this.embeddingService.embedDocuments([text]);
    return vector;
  }


  async addMemory({
    userId,
    chatId,
    content,
    memoryType = 'conversation',
    metadata = {},
  }) {
    const id = uuidv4();
    const collection = await this._getCollection();
    const embedding = await this._getEmbedding(content);

    const fullMetadata = {
      userId,
      chatId,
      memoryType,
      createdAt: new Date().toISOString(),
      ...metadata,
    };

    await collection.add({
      ids: [id],
      embeddings: [embedding],
      documents: [content],
      metadatas: [fullMetadata],
    });

    return id;
  }


  async addMemoriesBatch(memories) {
    if (!memories || memories.length === 0) return [];
    const collection = await this._getCollection();

    const ids = [];
    const texts = [];
    const metadatas = [];
    const embeddings = [];

    for (const m of memories) {
      const id = uuidv4();
      ids.push(id);
      texts.push(m.content);
      embeddings.push(await this._getEmbedding(m.content));
      metadatas.push({
        userId: m.userId,
        chatId: m.chatId,
        memoryType: m.memoryType || 'conversation',
        createdAt: new Date().toISOString(),
        ...(m.metadata || {}),
      });
    }

    await collection.add({
      ids,
      embeddings,
      documents: texts,
      metadatas,
    });

    return ids;
  }


  async getMemories({
    userId,
    query,
    chatId = null,
    memoryType = null,
    nResults = 5,
  }) {
    const collection = await this._getCollection();
    const embedding = await this._getQueryEmbedding(query);






    const where = buildChromaWhere({ userId, chatId, memoryType });

    let results;
    try {
      results = await collection.query({
        queryEmbeddings: [embedding],
        nResults,
        where,
      });
    } catch (e) {
      logger.warn(`memory.getMemories failed: ${e?.message || e}`);
      return [];
    }

    const ids = results.ids?.[0] || [];
    const docs = results.documents?.[0] || [];
    const metas = results.metadatas?.[0] || [];
    const dists = results.distances?.[0] || [];

    const out = [];
    for (let i = 0; i < ids.length; i++) {

      const relevance = dists[i] !== undefined ? 1 - dists[i] : 0;
      out.push({
        id: ids[i],
        content: docs[i],
        metadata: metas[i] || {},
        relevance,
      });
    }
    return out;
  }


  async getChatMemories(chatId, nResults = 10) {
    const collection = await this._getCollection();
    let results;
    try {
      results = await collection.get({
        where: { chatId },
        limit: nResults,
      });
    } catch (e) {
      logger.warn(`memory.getChatMemories failed: ${e?.message || e}`);
      return [];
    }

    const ids = results.ids || [];
    const docs = results.documents || [];
    const metas = results.metadatas || [];
    return ids.map((id, i) => ({
      id,
      content: docs[i],
      metadata: metas[i] || {},
      relevance: 1.0,
    }));
  }


  async clearChatMemories(chatId) {
    const collection = await this._getCollection();
    let results;
    try {
      results = await collection.get({ where: { chatId } });
    } catch (e) {
      logger.warn(`memory.clearChatMemories get failed: ${e?.message || e}`);
      return 0;
    }
    const ids = results.ids || [];
    if (ids.length === 0) return 0;
    await collection.delete({ ids });
    return ids.length;
  }


  async clearUserMemories(userId) {
    const collection = await this._getCollection();
    let results;
    try {
      results = await collection.get({ where: { userId } });
    } catch (e) {
      logger.warn(`memory.clearUserMemories get failed: ${e?.message || e}`);
      return 0;
    }
    const ids = results.ids || [];
    if (ids.length === 0) return 0;
    await collection.delete({ ids });
    return ids.length;
  }


  formatMemoriesForContext(memories, maxLength = 2000) {
    if (!memories || memories.length === 0) return '';

    const parts = [];
    let currentLength = 0;

    parts.push('Relevant memories from past conversations:');
    currentLength += parts[0].length;

    for (const m of memories) {
      const entry = `- ${m.content}`;
      if (currentLength + entry.length + 1 > maxLength) break;
      parts.push(entry);
      currentLength += entry.length + 1;
    }

    return parts.join('\n');
  }
}





let _chatMemory = null;


export const getChatMemory = () => {
  if (!_chatMemory) {
    _chatMemory = new ChatMemory();
  }
  return _chatMemory;
};

export { _chatMemory };



import { v4 as uuidv4 } from 'uuid';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

import { getChromaClient } from '../../config/chromadb.js';
import { getEmbeddingService } from '../../services/embeddingService.js';
import { logger } from '../../utils/logger.js';
import { buildChromaWhere } from '../../utils/chromaFilter.js';


export class SemanticSearchTool {
  static COLLECTION_NAME = 'chat_history';

  constructor() {
    this.client = null;
    this.embeddingService = null;
    this._collection = null;
  }

  async _getCollection() {
    if (this._collection) return this._collection;
    if (!this.client) {
      this.client = await getChromaClient();
    }
    if (!this.embeddingService) {
      this.embeddingService = getEmbeddingService();
    }
    this._collection = await this.client.getOrCreateCollection({
      name: SemanticSearchTool.COLLECTION_NAME,
      metadata: { 'hnsw:space': 'cosine' },
    });
    return this._collection;
  }


  async indexMessage({
    chatId,
    userId,
    role,
    content,
    messageId = null,
    metadata = {},
  }) {
    const collection = await this._getCollection();
    const embedding = await this.embeddingService.embedQuery(content);

    const id = messageId || uuidv4();
    const fullMetadata = {
      chatId,
      userId,
      role,
      indexedAt: new Date().toISOString(),
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


  async indexMessagesBatch(messages) {
    if (!messages || messages.length === 0) return [];
    const collection = await this._getCollection();

    const ids = [];
    const texts = [];
    const embeddings = [];
    const metadatas = [];

    for (const m of messages) {
      const id = m.messageId || uuidv4();
      ids.push(id);
      texts.push(m.content);
      embeddings.push(await this.embeddingService.embedQuery(m.content));
      metadatas.push({
        chatId: m.chatId,
        userId: m.userId,
        role: m.role,
        indexedAt: new Date().toISOString(),
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


  async search({ userId, query, chatId = null, nResults = 5 }) {
    const collection = await this._getCollection();
    const embedding = await this.embeddingService.embedQuery(query);




    const where = buildChromaWhere({ userId, chatId });

    let results;
    try {
      results = await collection.query({
        queryEmbeddings: [embedding],
        nResults,
        where,
      });
    } catch (e) {
      logger.warn(`SemanticSearchTool.search failed: ${e?.message || e}`);
      return [];
    }

    const ids = results.ids?.[0] || [];
    const docs = results.documents?.[0] || [];
    const metas = results.metadatas?.[0] || [];
    const dists = results.distances?.[0] || [];

    return ids.map((id, i) => ({
      id,
      content: docs[i],
      metadata: metas[i] || {},
      relevance: dists[i] !== undefined ? 1 - dists[i] : 0,
    }));
  }


  async deleteChatMessages(chatId) {
    const collection = await this._getCollection();
    let results;
    try {
      results = await collection.get({ where: { chatId } });
    } catch (e) {
      logger.warn(`SemanticSearchTool.deleteChatMessages failed: ${e?.message || e}`);
      return 0;
    }
    const ids = results.ids || [];
    if (ids.length === 0) return 0;
    await collection.delete({ ids });
    return ids.length;
  }


  formatSearchResults(results) {
    if (!results || results.length === 0) return 'No relevant past messages found.';
    return results
      .map(
        (r, i) =>
          `${i + 1}. [${r.metadata.role || 'unknown'}] ${r.content}\n   (relevance: ${r.relevance.toFixed(2)})`
      )
      .join('\n\n');
  }
}





let _tool = null;
let _instance = null;


let _runtimeContext = { userId: null, chatId: null };


export function setSearchRuntimeContext(ctx) {
  _runtimeContext = {
    userId: ctx?.userId ?? null,
    chatId: ctx?.chatId ?? null,
  };
}


export function clearSearchRuntimeContext() {
  _runtimeContext = { userId: null, chatId: null };
}


export const search_chat_history = () => {
  if (_tool) return _tool;









  const schema = z.object({
    query: z.string().describe('The search query'),
    chatId: z
      .string()
      .optional()
      .describe('Optional chat ID to scope the search'),
    nResults: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Number of results to return'),
  });

  _tool = tool(
    async (input, config) => {
      const toolInstance = getSemanticSearchTool();










      const configurable = config?.configurable || {};
      const userId =
        configurable.userId ||
        _runtimeContext.userId ||
        input.userId ||
        input._userId ||
        null;









      const chatId =
        configurable.chatId || _runtimeContext.chatId || input.chatId || null;

      if (!userId) {
        logger.warn(
          'search_chat_history called without a user id — returning no results'
        );
        return 'No relevant past messages found.';
      }

      const results = await toolInstance.search({
        userId,
        query: input.query,
        chatId,
        nResults: input.nResults || 5,
      });
      return toolInstance.formatSearchResults(results);
    },
    {
      name: 'search_chat_history',
      description:
        'Search the user\'s past chat conversations for relevant context.',
      schema,
    }
  );

  return _tool;
};


export const getSemanticSearchTool = () => {
  if (!_instance) {
    _instance = new SemanticSearchTool();
  }
  return _instance;
};
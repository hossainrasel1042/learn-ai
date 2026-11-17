

import { CohereClient } from 'cohere-ai';

import { settings } from '../../config/settings.js';
import { logger } from '../../utils/logger.js';
import { QueryIntent } from './queryProcessor.js';
import { RetrievalResult } from './hybridRetriever.js';


export class RankedResult {
  constructor({ id, content, metadata, relevanceScore, originalRank }) {
    this.id = id;
    this.content = content;
    this.metadata = metadata;
    this.relevanceScore = relevanceScore;
    this.originalRank = originalRank;
  }
}


export class Reranker {

  constructor(apiKey = null) {
    this.apiKey = apiKey || settings.COHERE_API_KEY || null;
    this.enabled = Boolean(this.apiKey);
    if (this.enabled) {
      this.client = new CohereClient({ token: this.apiKey });
    } else {
      this.client = null;
    }
    this.model = 'rerank-v3.5';
  }


  async rerank(query, documents, topK = 10, relevanceThreshold = 0.1) {
    if (!documents || documents.length === 0) return [];



    if (!this.enabled || !this.client) {
      logger.warn(
        'COHERE_API_KEY missing; reranker disabled, using embedding-only retrieval'
      );
      return documents.slice(0, topK).map((doc, i) =>
        new RankedResult({
          id: doc.id,
          content: doc.content,
          metadata: doc.metadata,
          relevanceScore: doc.score,
          originalRank: i,
        })
      );
    }

    try {

      const docTexts = [];
      for (const doc of documents) {
        const text = this._prepareRerankText(doc);
        docTexts.push(text);
      }


      const response = await this.client.rerank({
        query,
        documents: docTexts,
        topN: Math.min(topK, documents.length),
        model: this.model,
        returnDocuments: false,
      });


      const reranked = [];
      for (const result of response.results) {
        if (result.relevanceScore >= relevanceThreshold) {
          const doc = documents[result.index];
          reranked.push(
            new RankedResult({
              id: doc.id,
              content: doc.content,
              metadata: doc.metadata,
              relevanceScore: result.relevanceScore,
              originalRank: result.index,
            })
          );
        }
      }

      logger.info(
        `Reranked ${documents.length} docs → ${reranked.length} above threshold`
      );
      return reranked;
    } catch (e) {
      logger.error(`Reranking failed: ${e.message || e}`);

      return documents.slice(0, topK).map((doc, i) =>
        new RankedResult({
          id: doc.id,
          content: doc.content,
          metadata: doc.metadata,
          relevanceScore: doc.score,
          originalRank: i,
        })
      );
    }
  }


  _prepareRerankText(doc) {
    const parts = [];
    const meta = doc.metadata || {};


    if (meta.title) parts.push(`Title: ${meta.title}`);
    if (meta.summary) parts.push(`Summary: ${meta.summary}`);
    if (meta.purpose_summary) parts.push(`Purpose: ${meta.purpose_summary}`);


    parts.push(doc.content);

    return parts.join('\n');
  }
}


export class AdaptiveReranker extends Reranker {

  static THRESHOLDS = {
    [QueryIntent.FACTUAL]: 0.3,
    [QueryIntent.CONCEPTUAL]: 0.2,
    [QueryIntent.CODE_FIND]: 0.25,
    [QueryIntent.CODE_EXPLAIN]: 0.2,
    [QueryIntent.COMPARE]: 0.15,
    [QueryIntent.EXAMPLE]: 0.2,
    [QueryIntent.EXERCISE]: 0.2,
  };


  async rerankAdaptive(processedQuery, documents, topK = 10) {

    const threshold =
      AdaptiveReranker.THRESHOLDS[processedQuery.intent] || 0.2;


    let boostedDocs = documents;
    if (processedQuery.isCodeQuery) {
      boostedDocs = this._boostCodeResults(documents);
    }

    return this.rerank(
      processedQuery.original,
      boostedDocs,
      topK,
      threshold
    );
  }


  _boostCodeResults(documents, boostFactor = 1.2) {
    const boosted = [];

    for (const doc of documents) {
      if ((doc.metadata || {}).chunk_type === 'code') {

        boosted.push(
          new RetrievalResult({
            id: doc.id,
            content: doc.content,
            metadata: doc.metadata,
            score: doc.score * boostFactor,
            source: doc.source,
          })
        );
      } else {
        boosted.push(doc);
      }
    }


    boosted.sort((a, b) => b.score - a.score);
    return boosted;
  }
}


export function getReranker(adaptive = true) {
  if (adaptive) {
    return new AdaptiveReranker();
  }
  return new Reranker();
}
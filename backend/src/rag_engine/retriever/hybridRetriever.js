

import { settings } from '../../config/settings.js';
import { logger } from '../../utils/logger.js';
import { EmbeddingService, getEmbeddingService } from '../../services/embeddingService.js';
import { VectorStoreService, getVectorStore } from '../../services/vectorStoreService.js';


export class RetrievalResult {
  constructor({ id, content, metadata, score, source = 'dense' }) {
    this.id = id;
    this.content = content;
    this.metadata = metadata;
    this.score = score;
    this.source = source;
  }
}


export class SimpleBM25 {

  constructor(k1 = 1.5, b = 0.75) {
    this.k1 = k1;
    this.b = b;
    this.corpus = [];
    this.docFreqs = {};
    this.idf = {};
    this.docLens = [];
    this.avgdl = 0;
    this.nDocs = 0;
  }


  fit(documents) {
    this.corpus = documents;
    this.nDocs = documents.length;


    const tokenized = [];
    const df = {};

    for (const doc of documents) {
      const text = this._getSearchableText(doc);
      const tokens = this._tokenize(text);
      tokenized.push(tokens);


      for (const term of new Set(tokens)) {
        df[term] = (df[term] || 0) + 1;
      }
    }

    this.docFreqs = df;
    this.docLens = tokenized.map((t) => t.length);
    this.avgdl = this.docLens.reduce((s, l) => s + l, 0) / Math.max(this.docLens.length, 1);


    for (const [term, freq] of Object.entries(df)) {
      this.idf[term] = this._computeIdf(freq);
    }

    this._tokenized = tokenized;
  }


  search(query, k = 50) {
    const queryTokens = this._tokenize(query);
    const scores = [];

    for (let idx = 0; idx < this._tokenized.length; idx++) {
      const docTokens = this._tokenized[idx];
      const score = this._scoreDocument(queryTokens, docTokens, this.docLens[idx]);
      if (score > 0) {
        scores.push([idx, score]);
      }
    }


    scores.sort((a, b) => b[1] - a[1]);
    return scores.slice(0, k);
  }


  _tokenize(text) {
    const words = (text.toLowerCase().match(/\w+/g) || []);

    const bigrams = [];
    for (let i = 0; i < words.length - 1; i++) {
      bigrams.push(`${words[i]}_${words[i + 1]}`);
    }
    return [...words, ...bigrams];
  }


  _getSearchableText(doc) {
    const parts = [doc.content || ''];
    const meta = doc.metadata || {};


    for (const field of ['title', 'summary', 'keywords', 'topics', 'function_name', 'nl_queries']) {
      if (meta[field] !== undefined) {
        const val = meta[field];
        if (Array.isArray(val)) {
          for (const v of val) parts.push(String(v));
        } else {
          parts.push(String(val));
        }
      }
    }

    return parts.join(' ');
  }


  _computeIdf(docFreq) {
    return Math.log((this.nDocs - docFreq + 0.5) / (docFreq + 0.5) + 1);
  }


  _scoreDocument(queryTokens, docTokens, docLen) {
    let score = 0.0;
    const docTermFreqs = {};

    for (const token of docTokens) {
      docTermFreqs[token] = (docTermFreqs[token] || 0) + 1;
    }

    for (const term of queryTokens) {
      if (!(term in docTermFreqs)) continue;

      const freq = docTermFreqs[term];
      const idf = this.idf[term] || 0;


      const numerator = freq * (this.k1 + 1);
      const denominator =
        freq + this.k1 * (1 - this.b + (this.b * docLen) / this.avgdl);
      score += (idf * numerator) / denominator;
    }

    return score;
  }
}


export class HybridRetriever {

  constructor(
    collectionName = 'learnai',
    embeddingService = null,
    vectorStore = null
  ) {
    this.embeddingService = embeddingService || getEmbeddingService();
    this.vectorStore = vectorStore || getVectorStore(collectionName);
    this.collectionName = collectionName;


    this._bm25 = null;
    this._bm25Docs = null;
  }


  async retrieve(processedQuery, k = 30, denseWeight = 0.6, sparseWeight = 0.4) {

    const searchTexts = [...processedQuery.expandedQueries];
    if (processedQuery.hydeText) {
      searchTexts.push(processedQuery.hydeText);
    }


    const whereFilter = this._buildFilter(processedQuery);


    const denseResults = await this._denseSearch({
      queries: searchTexts,
      k: 50,
      whereFilter,
    });


    const sparseResults = await this._sparseSearch({
      queries: searchTexts,
      k: 50,
      whereFilter,
    });


    const fused = this._rrfFusion({
      denseResults,
      sparseResults,
      denseWeight,
      sparseWeight,
      k,
    });

    return fused;
  }


  async _denseSearch({ queries, k, whereFilter = null }) {
    const allResults = {};

    for (const query of queries.slice(0, 5)) {

      try {

        const results = await this.vectorStore.search({
          query,
          k,
          where: whereFilter,
        });

        for (const r of results) {
          const docId = r.id;
          const score = 1 / (1 + (r.distance || 0));

          if (
            !(docId in allResults) ||
            score > allResults[docId].score
          ) {
            allResults[docId] = new RetrievalResult({
              id: docId,
              content: r.content,
              metadata: r.metadata || {},
              score,
              source: 'dense',
            });
          }
        }
      } catch (e) {

        if (whereFilter && String(e).toLowerCase().includes('where')) {
          logger.warn('Dense search filter failed, retrying without filter');
          try {
            const results = await this.vectorStore.search({
              query,
              k,
              where: null,
            });
            for (const r of results) {
              const docId = r.id;
              const score = 1 / (1 + (r.distance || 0));
              if (
                !(docId in allResults) ||
                score > allResults[docId].score
              ) {
                allResults[docId] = new RetrievalResult({
                  id: docId,
                  content: r.content,
                  metadata: r.metadata || {},
                  score,
                  source: 'dense',
                });
              }
            }
          } catch (retryErr) {
            logger.warn(`Dense search retry failed: ${retryErr.message || retryErr}`);
          }
        } else {
          logger.warn(`Dense search failed: ${e.message || e}`);
        }
      }
    }


    const results = Object.values(allResults);
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, k);
  }


  async _sparseSearch({ queries, k, whereFilter = null }) {

    if (this._bm25 === null) {
      await this._buildBm25Index();
    }

    if (!this._bm25Docs || this._bm25Docs.length === 0) {
      return [];
    }

    const allResults = {};

    for (const query of queries.slice(0, 5)) {
      const bm25Results = this._bm25.search(query, k);

      for (const [idx, score] of bm25Results) {
        const doc = this._bm25Docs[idx];
        const docId = doc.id;


        if (
          whereFilter &&
          !this._matchesFilter(doc.metadata || {}, whereFilter)
        ) {
          continue;
        }

        if (!(docId in allResults) || score > allResults[docId].score) {
          allResults[docId] = new RetrievalResult({
            id: docId,
            content: doc.content,
            metadata: doc.metadata || {},
            score,
            source: 'sparse',
          });
        }
      }
    }

    const results = Object.values(allResults);
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, k);
  }


  async _buildBm25Index() {
    try {

      const allDocs = await this.vectorStore.getAll();

      if (!allDocs || allDocs.length === 0) {
        logger.warn('No documents found for BM25 index');
        this._bm25Docs = [];
        this._bm25 = new SimpleBM25();
        return;
      }

      this._bm25Docs = allDocs;
      this._bm25 = new SimpleBM25();
      this._bm25.fit(allDocs);

      logger.info(`Built BM25 index with ${allDocs.length} documents`);
    } catch (e) {
      logger.error(`Failed to build BM25 index: ${e.message || e}`);
      this._bm25Docs = [];
      this._bm25 = new SimpleBM25();
    }
  }


  _rrfFusion({
    denseResults,
    sparseResults,
    denseWeight,
    sparseWeight,
    k,
    rrfK = 60,
  }) {
    const rrfScores = {};
    const resultData = {};


    for (let rank = 0; rank < denseResults.length; rank++) {
      const result = denseResults[rank];
      const rrfScore = denseWeight / (rrfK + rank + 1);
      rrfScores[result.id] = (rrfScores[result.id] || 0) + rrfScore;
      resultData[result.id] = result;
    }


    for (let rank = 0; rank < sparseResults.length; rank++) {
      const result = sparseResults[rank];
      const rrfScore = sparseWeight / (rrfK + rank + 1);
      rrfScores[result.id] = (rrfScores[result.id] || 0) + rrfScore;
      if (!(result.id in resultData)) {
        resultData[result.id] = result;
      }
    }


    const sortedIds = Object.entries(rrfScores).sort((a, b) => b[1] - a[1]);


    const fused = [];
    for (const [docId, score] of sortedIds.slice(0, k)) {
      const result = resultData[docId];
      fused.push(
        new RetrievalResult({
          id: result.id,
          content: result.content,
          metadata: result.metadata,
          score,
          source: 'hybrid',
        })
      );
    }

    return fused;
  }


  _buildFilter(query) {
    if (!query.filters) return null;


    const validKeys = new Set([
      'course_id',
      'category',
      'content_type',
      'week_number',
      'language',
      'file_type',
      'chunk_type',
    ]);

    const conditions = [];
    for (const [key, value] of Object.entries(query.filters)) {

      if (!validKeys.has(key)) {
        logger.debug(`Skipping invalid filter key: ${key}`);
        continue;
      }
      if (value === null || value === undefined || value === '') continue;

      const t = typeof value;
      if (t !== 'string' && t !== 'number' && t !== 'boolean') continue;
      conditions.push({ [key]: { $eq: value } });
    }

    if (conditions.length === 0) return null;
    if (conditions.length === 1) return conditions[0];
    return { $and: conditions };
  }


  _matchesFilter(metadata, whereFilter) {
    if (!whereFilter) return true;

    for (const [key, condition] of Object.entries(whereFilter)) {
      if (key === '$and') {
        if (!condition.every((c) => this._matchesFilter(metadata, c))) return false;
      } else if (key === '$or') {
        if (!condition.some((c) => this._matchesFilter(metadata, c))) return false;
      } else if (typeof condition === 'object' && condition !== null) {
        if ('$eq' in condition) {
          if (metadata[key] !== condition.$eq) return false;
        }
      } else {
        if (metadata[key] !== condition) return false;
      }
    }

    return true;
  }


  invalidateBm25Cache() {
    this._bm25 = null;
    this._bm25Docs = null;
  }
}


export function getHybridRetriever(collectionName = 'learnai', embeddingService = null) {
  return new HybridRetriever(collectionName, embeddingService);
}


void settings;


import { basename } from 'node:path';

import {
  VectorStoreService,
  getVectorStore,
} from '../services/vectorStoreService.js';
import { getEmbeddingService } from '../services/embeddingService.js';
import { SimpleBM25, RetrievalResult } from './retriever/hybridRetriever.js';
import { logger } from '../utils/logger.js';


export class FileSearchResult {
  constructor({
    filename,
    filepath,
    fileType,
    relevanceScore,
    matchingSections = [],
    summary = null,
  }) {
    this.filename = filename;
    this.filepath = filepath;
    this.fileType = fileType;
    this.relevanceScore = relevanceScore;
    this.matchingSections = matchingSections;
    this.summary = summary;
  }


  toDict() {
    return {
      filename: this.filename,
      filepath: this.filepath,
      file_type: this.fileType,
      relevance_score: Math.round(this.relevanceScore * 1000) / 1000,
      matching_sections: this.matchingSections,
      summary: this.summary,
    };
  }
}


export class SectionMatch {
  constructor({ contentPreview, location, locationType, score }) {
    this.contentPreview = contentPreview;
    this.location = location;
    this.locationType = locationType;
    this.score = score;
  }
}


export class SemanticSearchService {

  constructor(collectionName = 'learnai', vectorStore = null) {
    this.vectorStore = vectorStore || getVectorStore(collectionName);
    this.embeddingService = getEmbeddingService();
    this._bm25 = null;
    this._bm25Docs = null;
  }


  async searchFiles(
    query,
    topK = 10,
    fileType = null,
    returnSections = true,
    maxSectionsPerFile = 3
  ) {
    logger.info(
      `[SemanticSearch] search_files called: query='${query}', top_k=${topK}, file_type=${fileType}`
    );


    logger.debug('[SemanticSearch] Searching chunks...');
    const chunkResults = await this._searchChunks(query, 50, fileType);

    logger.info(`[SemanticSearch] Got ${chunkResults.length} chunk results`);

    if (chunkResults.length === 0) {
      logger.warn(
        `[SemanticSearch] No chunk results found for query: '${query}'`
      );
      return [];
    }


    const fileGroups = this._groupByFile(chunkResults);
    logger.debug(
      `[SemanticSearch] Grouped into ${fileGroups.size} files`
    );


    const results = [];
    for (const [filepath, chunks] of fileGroups.entries()) {



      const topScores = chunks.slice(0, 3).map((c) => c.score);
      let fileScore = topScores.length ? Math.max(...topScores) : 0;


      if (topScores.length >= 2 && topScores[1] > 0.3) {
        fileScore *= 1.1;
      }
      if (topScores.length >= 3 && topScores[2] > 0.3) {
        fileScore *= 1.05;
      }


      const firstChunk = chunks[0];
      const metadata = firstChunk.metadata || {};


      const sections = [];
      if (returnSections) {
        for (const chunk of chunks.slice(0, maxSectionsPerFile)) {
          const section = this._extractSectionInfo(chunk);
          if (section) sections.push(section);
        }
      }

      const result = new FileSearchResult({
        filename: metadata.filename || basename(filepath),
        filepath,
        fileType: this._getFileType(metadata),
        relevanceScore: fileScore,
        matchingSections: sections,
        summary: this._generateMatchSummary(chunks.slice(0, 3)),
      });
      results.push(result);
      logger.debug(
        `[SemanticSearch] File: ${result.filename}, score=${fileScore.toFixed(3)}, sections=${sections.length}`
      );
    }


    results.sort((a, b) => b.relevanceScore - a.relevanceScore);
    const finalResults = results.slice(0, topK);

    logger.info(
      `[SemanticSearch] Returning ${finalResults.length} file results`
    );
    return finalResults;
  }


  async searchByContentType(query, contentType, topK = 5) {
    const typeMap = {
      slides: 'pptx',
      presentations: 'pptx',
      pdf: 'pdf',
      documents: 'pdf',
      code: 'code',
    };
    const fileType = typeMap[contentType.toLowerCase()] || contentType;
    return this.searchFiles(query, topK, fileType);
  }


  async findSimilarFiles(sourceFile, topK = 5) {

    const sourceChunks = await this.vectorStore.getByFilter(
      { source_file: sourceFile },
      10
    );

    if (sourceChunks.length === 0) return [];


    const combinedContent = sourceChunks
      .slice(0, 3)
      .map((c) => (c.content || '').slice(0, 200))
      .join(' ');


    const results = await this.searchFiles(combinedContent, topK + 1);


    return results.filter((r) => r.filepath !== sourceFile).slice(0, topK);
  }


  async _searchChunks(query, k = 50, fileType = null) {
    const results = {};


    try {
      let whereFilter = null;
      if (fileType) {
        whereFilter = { file_type: { $eq: `.${fileType}` } };
      }

      const denseResults = await this.vectorStore.search({
        query,
        k,
        where: whereFilter,
      });

      for (const r of denseResults) {
        const docId = r.id;
        const score = 1 / (1 + (r.distance || 0));
        results[docId] = new RetrievalResult({
          id: docId,
          content: r.content,
          metadata: r.metadata || {},
          score,
          source: 'dense',
        });
      }
    } catch (e) {
      logger.warn(`Dense search failed: ${e.message || e}`);
    }


    try {
      if (this._bm25 === null) {
        this._buildBm25Index();
      }

      if (this._bm25Docs && this._bm25Docs.length) {
        const bm25Results = this._bm25.search(query, k);
        for (const [idx, score] of bm25Results) {
          const doc = this._bm25Docs[idx];
          const docId = doc.id;


          if (docId in results) {
            results[docId].score = (results[docId].score + score) / 2;
          } else {
            results[docId] = new RetrievalResult({
              id: docId,
              content: doc.content,
              metadata: doc.metadata || {},
              score,
              source: 'sparse',
            });
          }
        }
      }
    } catch (e) {
      logger.warn(`Sparse search failed: ${e.message || e}`);
    }


    const sortedResults = Object.values(results).sort(
      (a, b) => b.score - a.score
    );
    return sortedResults.slice(0, k);
  }


  _buildBm25Index() {
    try {





      const allDocs = this.vectorStore.getAll ? null : null;


      this.vectorStore
        .getAll()
        .then((docs) => {
          if (docs && docs.length) {
            this._bm25Docs = docs;
            this._bm25 = new SimpleBM25();
            this._bm25.fit(docs);
            logger.info(`Built BM25 index with ${docs.length} documents`);
          } else {
            this._bm25Docs = [];
            this._bm25 = new SimpleBM25();
          }
        })
        .catch((e) => {
          logger.error(`Failed to build BM25 index: ${e.message || e}`);
          this._bm25Docs = [];
          this._bm25 = new SimpleBM25();
        });
      void allDocs;
    } catch (e) {
      logger.error(`Failed to build BM25 index: ${e.message || e}`);
      this._bm25Docs = [];
      this._bm25 = new SimpleBM25();
    }
  }


  _groupByFile(results) {
    const groups = new Map();
    for (const r of results) {
      const filepath = (r.metadata || {}).source_file || 'unknown';
      if (!groups.has(filepath)) groups.set(filepath, []);
      groups.get(filepath).push(r);
    }


    for (const chunks of groups.values()) {
      chunks.sort((a, b) => b.score - a.score);
    }

    return groups;
  }


  _extractSectionInfo(chunk) {
    const meta = chunk.metadata || {};

    let location = null;
    let locationType = null;

    if (meta.slide_range) {
      location = meta.slide_range;
      locationType = 'slide';
    } else if (meta.page_range) {
      location = meta.page_range;
      locationType = 'page';
    } else if (meta.line_start) {
      location = `Lines ${meta.line_start}-${meta.line_end || meta.line_start}`;
      locationType = 'code';
    } else if (meta.unit_name) {
      location = `Function: ${meta.unit_name}`;
      locationType = 'code';
    }

    if (!location) return null;

    return {
      content_preview: chunk.content.slice(0, 200) + '...',
      location,
      location_type: locationType,
      score: Math.round(chunk.score * 1000) / 1000,
      section: meta.section,
      titles: meta.titles || [],
    };
  }


  _getFileType(metadata) {
    const fileType = metadata.file_type || '';
    const chunkType = metadata.chunk_type || '';

    const typeNames = {
      '.pptx': 'PowerPoint',
      '.ppt': 'PowerPoint',
      '.pdf': 'PDF Document',
      '.py': 'Python Code',
      '.js': 'JavaScript',
      '.ts': 'TypeScript',
      slides: 'Slides',
      code: 'Code',
    };

    return typeNames[fileType] || typeNames[chunkType] || 'Document';
  }


  _generateMatchSummary(chunks) {
    if (chunks.length === 0) return '';

    const sections = [];
    for (const c of chunks) {
      const meta = c.metadata || {};
      const loc = meta.slide_range || meta.page_range;
      if (loc) {
        sections.push(loc);
      } else {
        const titles = meta.titles || [null];
        const title = titles[0];
        if (title) sections.push(title);
      }
    }

    if (sections.length) {
      return `Matches in: ${sections.slice(0, 3).join(', ')}`;
    }
    return `Found in ${chunks.length} sections`;
  }


  invalidateCache() {
    this._bm25 = null;
    this._bm25Docs = null;
  }
}


export function getSemanticSearch(collectionName = 'learnai') {
  return new SemanticSearchService(collectionName);
}


import { logger } from '../../utils/logger.js';
import { GeminiService } from '../../services/geminiService.js';

import {
  QueryProcessor,
  ProcessedQuery,
  getQueryProcessor,
} from './queryProcessor.js';
import {
  HybridRetriever,
  getHybridRetriever,
} from './hybridRetriever.js';
import {
  AdaptiveReranker,
  RankedResult,
  getReranker,
} from './reranker.js';
import {
  ContextAssembler,
  RetrievedContext,
  getContextAssembler,
} from './contextAssembler.js';


export class RetrievalPipeline {

  constructor(
    collectionName = 'learnai',
    llmService = null,
    maxContextTokens = 6000
  ) {
    this.queryProcessor = getQueryProcessor(llmService);
    this.retriever = getHybridRetriever(collectionName);
    this.reranker = getReranker(true);
    this.assembler = getContextAssembler(maxContextTokens);
  }


  async retrieve(query, filters = null, topK = 10, skipRerank = false) {
    logger.info(`Starting retrieval for: ${query.slice(0, 100)}...`);





    const processed = await this.queryProcessor.process(query);
    logger.info(
      `Query intent: ${processed.intent}, entities: ${processed.entities}`
    );


    if (filters) {
      Object.assign(processed.filters, filters);
    }





    const candidates = await this.retriever.retrieve({
      processedQuery: processed,
      k: 50,
    });

    logger.info(`Retrieved ${candidates.length} candidates`);

    if (candidates.length === 0) {
      logger.warn('No candidates retrieved');
      return new RetrievedContext({
        chunks: [],
        totalTokens: 0,
        citations: [],
        contextString: 'No relevant context found.',
        query: processed,
      });
    }





    let reranked;
    if (skipRerank) {

      reranked = candidates
        .slice(0, topK)
        .map((c, i) =>
          new RankedResult({
            id: c.id,
            content: c.content,
            metadata: c.metadata,
            relevanceScore: c.score,
            originalRank: i,
          })
        );
    } else {
      reranked = await this.reranker.rerankAdaptive({
        processedQuery: processed,
        documents: candidates,
        topK,
      });
    }

    logger.info(`Reranked to ${reranked.length} documents`);





    const context = this.assembler.assemble(reranked, processed);

    logger.info(
      `Assembled context: ${context.totalTokens} tokens, ${context.citations.length} citations`
    );

    return context;
  }


  async retrieveSimple(query, k = 5) {
    const context = await this.retrieve(query, null, k);
    return context.contextString;
  }


  invalidateCache() {
    this.retriever.invalidateBm25Cache();
  }
}


let _pipelineInstance = null;


export function getRetrievalPipeline(collectionName = 'learnai', ...kwargs) {
  if (_pipelineInstance === null) {
    _pipelineInstance = new RetrievalPipeline(collectionName, ...kwargs);
  }
  return _pipelineInstance;
}


export function resetPipeline() {
  _pipelineInstance = null;
}


void GeminiService;
void ProcessedQuery;
void HybridRetriever;


import { logger } from '../../utils/logger.js';
import { StaticAnalyzer, StaticAnalysisResult } from './staticAnalyzer.js';
import { CodeAnalyzerAgent, FileAnalysis, FunctionAnalysis } from './codeAnalyzerAgent.js';
import { NLBridgeGenerator } from './nlBridgeGenerator.js';


export class CodeAnalysisResult {
  constructor({
    static: staticResult,
    purposeSummary,
    algorithmsUsed,
    dataStructuresUsed,
    designPatterns,
    conceptsDemonstrated,
    learningGoals,
    commonMistakes,
    complexity,
    functions,
    nlQueries,
    keywords,
    relatedTopics,
  }) {
    this.static = staticResult;
    this.purposeSummary = purposeSummary;
    this.algorithmsUsed = algorithmsUsed;
    this.dataStructuresUsed = dataStructuresUsed;
    this.designPatterns = designPatterns;
    this.conceptsDemonstrated = conceptsDemonstrated;
    this.learningGoals = learningGoals;
    this.commonMistakes = commonMistakes;
    this.complexity = complexity;
    this.functions = functions;
    this.nlQueries = nlQueries;
    this.keywords = keywords;
    this.relatedTopics = relatedTopics;
  }
}


export class CodePreprocessor {

  constructor(maxFunctions = 10) {
    this.staticAnalyzer = new StaticAnalyzer();
    this.codeAgent = new CodeAnalyzerAgent();
    this.bridgeGenerator = new NLBridgeGenerator();
    this.maxFunctions = maxFunctions;
  }


  async process(code, filename) {
    logger.info(`[1/4] Static analysis: ${filename}`);


    const staticResult = this.staticAnalyzer.analyze(code, filename);


    logger.info(`[2/4] File-level LLM analysis`);

    const fileAnalysis = await this.codeAgent.analyzeFile({
      code,
      filename,
      language: staticResult.language,
      functions: staticResult.functions.map((f) => f.name),
      classes: staticResult.classes.map((c) => c.name),
      imports: staticResult.imports,
    });


    logger.info(
      `[3/4] Function-level analysis (${staticResult.functions.length} functions)`
    );

    const funcDicts = staticResult.functions
      .slice(0, this.maxFunctions)
      .map((f) => ({
        name: f.name,
        code: f.code,
        parent_class: f.parentClass,
      }));

    const functionAnalyses = await this.codeAgent.analyzeFunctionsBatch({
      functions: funcDicts,
      language: staticResult.language,
      maxFunctions: this.maxFunctions,
    });


    logger.info(`[4/4] Generating NL bridge`);

    const functionsSummary = Object.entries(functionAnalyses).map(
      ([name, analysis]) => `${name}: ${analysis.summary}`
    );

    const nlBridge = await this.bridgeGenerator.generateBridge({
      purposeSummary: fileAnalysis.purposeSummary,
      algorithms: fileAnalysis.algorithmsUsed,
      concepts: fileAnalysis.conceptsDemonstrated,
      functionsSummary,
    });


    const allNlQueries = this.bridgeGenerator.mergeAllNlQueries({
      fileBridge: nlBridge,
      functionAnalyses,
    });

    return new CodeAnalysisResult({
      static: staticResult,
      purposeSummary: fileAnalysis.purposeSummary,
      algorithmsUsed: fileAnalysis.algorithmsUsed,
      dataStructuresUsed: fileAnalysis.dataStructuresUsed,
      designPatterns: fileAnalysis.designPatterns,
      conceptsDemonstrated: fileAnalysis.conceptsDemonstrated,
      learningGoals: fileAnalysis.learningGoals,
      commonMistakes: fileAnalysis.commonMistakes,
      complexity: fileAnalysis.complexity,
      functions: functionAnalyses,
      nlQueries: allNlQueries,
      keywords: nlBridge.keywords || [],
      relatedTopics: nlBridge.related_topics || [],
    });
  }


  toEmbeddingText(result) {
    const parts = [
      `[Purpose] ${result.purposeSummary}`,
      `[Algorithms] ${result.algorithmsUsed.join(', ')}`,
      `[Concepts] ${result.conceptsDemonstrated.join(', ')}`,
      `[This code can help with:]`,
    ];

    for (const query of result.nlQueries.slice(0, 10)) {
      parts.push(`- ${query}`);
    }

    parts.push(`[Keywords] ${result.keywords.join(', ')}`);

    return parts.join('\n');
  }


  toDict(result) {
    const out = {
      language: result.static.language,
      imports: result.static.imports,
      classes: result.static.classes.map((c) => c.name),
      functions: {},
      purpose_summary: result.purposeSummary,
      algorithms_used: result.algorithmsUsed,
      data_structures_used: result.dataStructuresUsed,
      concepts_demonstrated: result.conceptsDemonstrated,
      nl_queries: result.nlQueries,
      keywords: result.keywords,
      complexity: result.complexity,
    };

    for (const [name, fa] of Object.entries(result.functions)) {
      out.functions[name] = {
        summary: fa.summary,
        what_it_does: fa.whatItDoes,
        concepts: fa.concepts,
        nl_queries: fa.nlQueries,
        time_complexity: fa.timeComplexity,
        space_complexity: fa.spaceComplexity,
      };
    }

    return out;
  }
}


export function getCodePreprocessor(maxFunctions = 10) {
  return new CodePreprocessor(maxFunctions);
}


export { StaticAnalysisResult, FileAnalysis, FunctionAnalysis };
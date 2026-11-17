

import { basename } from 'node:path';
import { readFileSync } from 'node:fs';
import { countTokens } from './base.js';
import { StaticAnalyzer } from '../code_processor/staticAnalyzer.js';


export class CodeChunker {

  constructor(config = null) {
    const defaultConfig = {
      minTokens: 50,
      maxTokens: 600,
      targetTokens: 300,
      overlapTokens: 0,
    };
    this.config = config || defaultConfig;
    this.staticAnalyzer = new StaticAnalyzer();
  }


  chunk(content, metadata) {

    let code;
    let filename;
    if (
      typeof content === 'string' &&
      !content.includes('\n') &&
      /\.(py|js|ts|java)$/.test(content)
    ) {

      code = readFileSync(content, 'utf8');
      filename = basename(content);
    } else {
      code = content;
      filename = metadata.filename || 'unknown.py';
    }


    const staticResult = this.staticAnalyzer.analyze(code, filename);

    return this._chunkCode(code, staticResult, metadata);
  }


  chunkWithLlmMetadata(content, metadata, llmAnalysis) {
    return this._chunkCodeWithLlm(content, llmAnalysis, metadata);
  }


  _chunkCode(code, staticResult, baseMetadata) {
    const chunks = [];
    const filename = baseMetadata.filename || 'unknown';


    const overview = this._createOverviewChunk(code, staticResult, baseMetadata);
    chunks.push(overview);


    for (const func of staticResult.functions) {
      const chunk = this._createFunctionChunk(func, staticResult, baseMetadata);
      chunks.push(chunk);
    }


    for (const cls of staticResult.classes) {
      const chunk = this._createClassChunk(cls, staticResult, baseMetadata);
      chunks.push(chunk);
    }

    return chunks;
  }


  _chunkCodeWithLlm(code, analysis, baseMetadata) {
    const chunks = [];


    const overview = this._createEnrichedOverview(code, analysis, baseMetadata);
    chunks.push(overview);


    for (const func of analysis.static.functions) {
      const funcAnalysis = analysis.functions[func.name];
      const chunk = this._createEnrichedFunctionChunk(
        func,
        funcAnalysis,
        analysis.static,
        baseMetadata
      );
      chunks.push(chunk);
    }

    return chunks;
  }


  _createOverviewChunk(code, staticResult, baseMetadata) {
    const filename = baseMetadata.filename || 'unknown';

    const contentParts = [
      `[File Overview: ${filename}]`,
      `[Language: ${staticResult.language}]`,
      `[Functions: ${staticResult.functions.map((f) => f.name).join(', ')}]`,
      `[Classes: ${staticResult.classes.map((c) => c.name).join(', ')}]`,
    ];

    if (staticResult.imports.length) {
      contentParts.push(
        `[Imports: ${staticResult.imports.slice(0, 5).join(', ')}]`
      );
    }

    const content = contentParts.join('\n');

    const chunkMetadata = {
      ...baseMetadata,
      chunk_type: 'code_overview',
      language: staticResult.language,
      is_overview: true,
      functions: staticResult.functions.map((f) => f.name),
      classes: staticResult.classes.map((c) => c.name),
    };

    return {
      content,
      metadata: chunkMetadata,
      tokenCount: countTokens(content),
    };
  }


  _createEnrichedOverview(code, analysis, baseMetadata) {
    const filename = baseMetadata.filename || 'unknown';

    const contentParts = [
      `[File Overview: ${filename}]`,
      `[Language: ${analysis.static.language}]`,
      `[Purpose: ${analysis.purposeSummary}]`,
      `[Algorithms: ${analysis.algorithmsUsed.join(', ')}]`,
      `[Concepts: ${analysis.conceptsDemonstrated.join(', ')}]`,
    ];

    if (analysis.nlQueries && analysis.nlQueries.length) {
      contentParts.push('[This file can answer:]');
      for (const q of analysis.nlQueries.slice(0, 5)) {
        contentParts.push(`- ${q}`);
      }
    }

    const content = contentParts.join('\n');

    const chunkMetadata = {
      ...baseMetadata,
      chunk_type: 'code_overview',
      language: analysis.static.language,
      is_overview: true,
      purpose: analysis.purposeSummary,
      algorithms: analysis.algorithmsUsed,
      concepts: analysis.conceptsDemonstrated,
      nl_queries: analysis.nlQueries,
      keywords: analysis.keywords,
    };

    return {
      content,
      metadata: chunkMetadata,
      tokenCount: countTokens(content),
    };
  }


  _createFunctionChunk(func, staticResult, baseMetadata) {
    const contentParts = [`[Language: ${staticResult.language}]`];

    if (func.docstring) {
      contentParts.push(`[Docstring: ${func.docstring}]`);
    }

    if (func.parentClass) {
      contentParts.push(`[Class: ${func.parentClass}]`);
    }


    contentParts.push(`\`\`\`${staticResult.language}\n${func.code}\n\`\`\``);

    const content = contentParts.join('\n\n');

    const chunkMetadata = {
      ...baseMetadata,
      chunk_type: 'code',
      language: staticResult.language,
      unit_type: func.parentClass ? 'method' : 'function',
      unit_name: func.name,
      qualified_name: func.qualifiedName,
      line_start: func.startLine,
      line_end: func.endLine,
      parent_class: func.parentClass,
    };

    return {
      content,
      metadata: chunkMetadata,
      tokenCount: countTokens(content),
    };
  }


  _createEnrichedFunctionChunk(func, funcAnalysis, staticResult, baseMetadata) {
    const contentParts = [`[Language: ${staticResult.language}]`];

    if (funcAnalysis) {
      contentParts.push(`[Purpose: ${funcAnalysis.summary}]`);
      if (funcAnalysis.concepts && funcAnalysis.concepts.length) {
        contentParts.push(`[Concepts: ${funcAnalysis.concepts.join(', ')}]`);
      }
      if (funcAnalysis.timeComplexity) {
        contentParts.push(`[Complexity: ${funcAnalysis.timeComplexity}]`);
      }
    }

    if (func.parentClass) {
      contentParts.push(`[Class: ${func.parentClass}]`);
    }

    contentParts.push(`\`\`\`${staticResult.language}\n${func.code}\n\`\`\``);

    const content = contentParts.join('\n\n');

    const chunkMetadata = {
      ...baseMetadata,
      chunk_type: 'code',
      language: staticResult.language,
      unit_type: func.parentClass ? 'method' : 'function',
      unit_name: func.name,
      qualified_name: func.qualifiedName,
      line_start: func.startLine,
      line_end: func.endLine,
      summary: funcAnalysis ? funcAnalysis.summary : '',
      concepts: funcAnalysis ? funcAnalysis.concepts : [],
      nl_queries: funcAnalysis ? funcAnalysis.nlQueries : [],
    };

    return {
      content,
      metadata: chunkMetadata,
      tokenCount: countTokens(content),
    };
  }


  _createClassChunk(cls, staticResult, baseMetadata) {

    const lines = cls.code.split('\n');
    const classDef = lines.length ? lines[0] : cls.code;

    const content = `[Language: ${staticResult.language}]\n\n[Class Definition]\n\`\`\`${staticResult.language}\n${classDef}\n\`\`\`\n\n[Methods: ${cls.methods.join(', ')}]`;

    const chunkMetadata = {
      ...baseMetadata,
      chunk_type: 'code',
      language: staticResult.language,
      unit_type: 'class',
      unit_name: cls.name,
      line_start: cls.startLine,
      methods: cls.methods,
    };

    return {
      content,
      metadata: chunkMetadata,
      tokenCount: countTokens(content),
    };
  }
}


export function getCodeChunker(config = null) {
  return new CodeChunker(config);
}
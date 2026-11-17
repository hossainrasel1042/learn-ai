


export class Citation {
  constructor({
    key,
    id,
    sourceFile,
    documentTitle,
    location = null,
    locationType = null,
    functionName = null,
  }) {
    this.key = key;
    this.id = id;
    this.sourceFile = sourceFile;
    this.documentTitle = documentTitle;
    this.location = location;
    this.locationType = locationType;
    this.functionName = functionName;
  }
}


export class RetrievedContext {
  constructor({ chunks, totalTokens, citations, contextString, query }) {
    this.chunks = chunks;
    this.totalTokens = totalTokens;
    this.citations = citations;
    this.contextString = contextString;
    this.query = query;
  }
}


export class ContextAssembler {

  constructor(maxTokens = 6000) {
    this.maxTokens = maxTokens;
  }


  assemble(rerankedDocs, query) {

    const deduped = this._deduplicate(rerankedDocs);


    const grouped = this._groupBySource(deduped);


    const contextParts = [];
    const citations = [];
    let totalTokens = 0;
    const includedChunks = [];
    let citationNum = 1;

    for (const sourceGroup of grouped) {
      for (const doc of sourceGroup) {

        const docTokens = this._countTokens(doc.content);
        if (totalTokens + docTokens > this.maxTokens) break;


        const citation = this._createCitation(doc, citationNum);
        citations.push(citation);
        citationNum += 1;


        const formatted = this._formatChunk(doc, citation);
        contextParts.push(formatted);
        includedChunks.push(doc);

        totalTokens += docTokens;
      }
    }


    const contextString = this._buildContextString(contextParts, query);

    return new RetrievedContext({
      chunks: includedChunks,
      totalTokens,
      citations,
      contextString,
      query,
    });
  }


  _deduplicate(docs) {
    const seenFingerprints = new Set();
    const deduped = [];

    for (const doc of docs) {
      const fingerprint = this._createFingerprint(doc.content);
      if (!seenFingerprints.has(fingerprint)) {
        seenFingerprints.add(fingerprint);
        deduped.push(doc);
      }
    }

    return deduped;
  }


  _createFingerprint(content) {

    const normalized = content.toLowerCase().split(/\s+/).join(' ').slice(0, 500);
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
      hash = (hash * 31 + normalized.charCodeAt(i)) | 0;
    }
    return hash;
  }


  _groupBySource(docs) {
    const groups = new Map();

    for (const doc of docs) {
      const source = (doc.metadata || {}).source_file || 'unknown';
      if (!groups.has(source)) groups.set(source, []);
      groups.get(source).push(doc);
    }


    const sortedGroups = [...groups.values()].sort(
      (a, b) =>
        b.reduce((s, d) => s + d.relevanceScore, 0) / b.length -
        a.reduce((s, d) => s + d.relevanceScore, 0) / a.length
    );

    return sortedGroups;
  }


  _createCitation(doc, num) {
    const meta = doc.metadata || {};


    let location = null;
    let locationType = null;
    let functionName = null;

    if (meta.slide_number) {
      location = `Slide ${meta.slide_number}`;
      locationType = 'slide';
    } else if (meta.page_range) {
      location = meta.page_range;
      locationType = 'page';
    } else if (meta.page_numbers) {
      if (Array.isArray(meta.page_numbers) && meta.page_numbers.length) {
        location =
          meta.page_numbers.length === 1
            ? `Page ${meta.page_numbers[0]}`
            : `Pages ${meta.page_numbers[0]}-${meta.page_numbers[meta.page_numbers.length - 1]}`;
      }
      locationType = 'page';
    } else if (meta.line_start) {
      location = `Lines ${meta.line_start}-${meta.line_end || meta.line_start}`;
      locationType = 'code';
      functionName = meta.unit_name || meta.function_name;
    }

    return new Citation({
      key: `[${num}]`,
      id: doc.id,
      sourceFile: meta.source_file || 'Unknown',
      documentTitle:
        meta.document_title ||
        meta.filename ||
        meta.source_file ||
        'Unknown',
      location,
      locationType,
      functionName,
    });
  }


  _formatChunk(doc, citation) {
    const meta = doc.metadata || {};


    const headerParts = [`Source: ${citation.documentTitle}`];
    if (citation.location) headerParts.push(citation.location);
    if (meta.section) headerParts.push(`Section: ${meta.section}`);
    if (citation.functionName)
      headerParts.push(`Function: ${citation.functionName}`);

    const header = headerParts.join(' | ');

    return `
<context citation="${citation.key}">
[${header}]

${doc.content}
</context>
`;
  }


  _buildContextString(parts, query) {
    const intro = `The following context is retrieved from course materials to help answer the query.
Each section is marked with a citation key that should be referenced in the answer.

Query: ${query.original}
Query Type: ${query.intent}

Retrieved Context:
`;
    return intro + parts.join('\n');
  }


  _countTokens(text) {
    return Math.floor(text.length / 4);
  }
}


export function getContextAssembler(maxTokens = 6000) {
  return new ContextAssembler(maxTokens);
}
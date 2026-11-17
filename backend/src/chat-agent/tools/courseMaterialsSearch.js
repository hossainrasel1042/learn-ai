

import { tool } from '@langchain/core/tools';
import { z } from 'zod';

import { getSemanticSearch } from '../../rag_engine/semanticSearch.js';
import { settings } from '../../config/settings.js';
import { logger } from '../../utils/logger.js';


export class CourseMaterialsSearchResult {
  constructor({
    filename,
    filepath,
    fileType,
    content,
    relevanceScore,
    matchingSections = [],
    summary = null,
  }) {
    this.filename = filename;
    this.filepath = filepath;
    this.fileType = fileType;
    this.content = content;
    this.relevanceScore = relevanceScore;
    this.matchingSections = matchingSections;
    this.summary = summary;
  }

  toDict() {
    return {
      filename: this.filename,
      filepath: this.filepath,
      fileType: this.fileType,
      content: this.content,
      relevanceScore: this.relevanceScore,
      matchingSections: this.matchingSections,
      summary: this.summary,
    };
  }
}


export class CourseMaterialsSearchTool {
  constructor() {
    this.searchService = null;
  }

  async _getService() {
    if (!this.searchService) {
      this.searchService = getSemanticSearch();
    }
    return this.searchService;
  }


  async search(query, topK = 5, fileType = null) {
    const service = await this._getService();
    try {
      const results = await service.search(query, topK, fileType);
      return results.map(
        (r) =>
          new CourseMaterialsSearchResult({
            filename: r.filename,
            filepath: r.filepath,
            fileType: r.fileType,
            content: r.matchingSections?.[0]?.content || r.summary || '',
            relevanceScore: r.relevanceScore,
            matchingSections: r.matchingSections || [],
            summary: r.summary,
          })
      );
    } catch (e) {
      logger.warn(`CourseMaterialsSearchTool.search failed: ${e?.message || e}`);
      return [];
    }
  }


  _formatCitation(result) {
    const filename = result.filename || 'unknown';
    const location = result.matchingSections?.[0]?.location || 'N/A';
    let content = result.content || result.summary || '';
    if (content.length > 300) {
      content = content.substring(0, 300) + '...';
    }
    return `[Source: ${filename}, ${location} | ${content}]`;
  }


  formatForLlm(results) {
    if (!results || results.length === 0) {
      return 'No relevant course materials found.';
    }

    const sections = [];
    const sources = [];

    results.forEach((r, i) => {
      const sectionTitle = `## Result ${i + 1}: ${r.filename}`;
      const content = r.content || r.summary || '(no content)';
      sections.push(`${sectionTitle}\n\n${content}`);

      const url = this._buildSourceUrl(r);
      const citation = this._formatCitation(r);
      sources.push(`${i + 1}. ${r.filename}\n   ${citation}\n   URL: ${url}`);
    });

    const sectionsBlock = sections.join('\n\n---\n\n');
    const sourcesBlock = sources.join('\n\n');

    return `Found ${results.length} relevant course material(s):\n\n${sectionsBlock}\n\n---\n\n## Sources Used\n\n${sourcesBlock}`;
  }


  _buildSourceUrl(result) {
    if (!result.filepath) return '';

    let rel = result.filepath;
    if (settings.BASE_DIR && rel.startsWith(settings.BASE_DIR)) {
      rel = rel.substring(settings.BASE_DIR.length);
    }
    rel = rel.replace(/^\/+/, '');
    const host = settings.HOST === '0.0.0.0' ? 'localhost' : settings.HOST;
    return `http://${host}:${settings.PORT}/${rel}`;
  }
}





let _tool = null;
let _instance = null;


export const course_materials_search = () => {
  if (_tool) return _tool;




  const schema = z.object({
    query: z.string().describe('Natural language search query'),
    topK: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('How many results to retrieve'),
    fileType: z
      .string()
      .optional()
      .describe('Optional file-type filter (e.g. "pdf", "md")'),
  });

  _tool = tool(
    async (input) => {
      const toolInstance = getCourseMaterialsTool();
      const results = await toolInstance.search(
        input.query,
        input.topK || 5,
        input.fileType || null
      );
      return toolInstance.formatForLlm(results);
    },
    {
      name: 'course_materials_search',
      description:
        'Search official course materials, lectures, and educational content. Returns passages with citations.',
      schema,
    }
  );

  return _tool;
};


export const getCourseMaterialsTool = () => {
  if (!_instance) {
    _instance = new CourseMaterialsSearchTool();
  }
  return _instance;
};
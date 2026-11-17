

import axios from 'axios';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

import { logger } from '../../utils/logger.js';


export class WikipediaTool {
  static BASE_URL = 'https://en.wikipedia.org/api/rest_v1';
  static USER_AGENT = 'LearnAI-Bot/1.0 (educational use)';

  constructor() {
    this.client = axios.create({
      baseURL: WikipediaTool.BASE_URL,
      headers: {
        'User-Agent': WikipediaTool.USER_AGENT,
        Accept: 'application/json',
      },
      timeout: 15000,
    });
  }


  async search(query, limit = 5) {
    try {
      const url = 'https://en.wikipedia.org/w/api.php';
      const res = await this.client.get(url, {
        baseURL: undefined,
        params: {
          action: 'query',
          list: 'search',
          srsearch: query,
          srlimit: limit,
          format: 'json',
          origin: '*',
        },
        headers: {
          'User-Agent': WikipediaTool.USER_AGENT,
        },
      });

      const hits = res.data?.query?.search || [];
      return hits.map((h) => ({
        title: h.title,
        description: h.snippet?.replace(/<[^>]+>/g, '') || '',
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(h.title.replace(/ /g, '_'))}`,
      }));
    } catch (e) {
      logger.warn(`WikipediaTool.search failed: ${e?.message || e}`);
      return [];
    }
  }


  async getPageSummary(title) {
    try {
      const safeTitle = encodeURIComponent(title.replace(/ /g, '_'));
      const res = await this.client.get(`/page/summary/${safeTitle}`);
      return res.data;
    } catch (e) {
      logger.warn(
        `WikipediaTool.getPageSummary('${title}') failed: ${e?.message || e}`
      );
      return null;
    }
  }


  async getPageContent(title) {
    try {
      const safeTitle = encodeURIComponent(title.replace(/ /g, '_'));
      const res = await this.client.get(`/page/html/${safeTitle}`);

      const html = String(res.data || '');
      const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      return text;
    } catch (e) {
      logger.warn(
        `WikipediaTool.getPageContent('${title}') failed: ${e?.message || e}`
      );
      return '';
    }
  }


  async searchAndSummarize(query, limit = 3) {
    const hits = await this.search(query, limit);
    const summaries = [];
    for (const hit of hits) {
      const summary = await this.getPageSummary(hit.title);
      if (summary) {
        summaries.push({
          title: hit.title,
          url: hit.url,
          extract: summary.extract || '',
          description: hit.description || '',
        });
      }
    }
    return summaries;
  }


  async close() {

  }
}





let _tool = null;
let _instance = null;


export const wikipedia_search = () => {
  if (_tool) return _tool;



  const schema = z.object({
    query: z.string().describe('Search query for Wikipedia'),
    limit: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Max number of results to return'),
  });

  _tool = tool(
    async (input) => {
      const toolInstance = getWikipediaTool();
      const summaries = await toolInstance.searchAndSummarize(
        input.query,
        input.limit || 3
      );
      if (!summaries.length) return 'No Wikipedia results found.';
      return summaries
        .map(
          (s, i) =>
            `${i + 1}. ${s.title}\n${s.description || ''}\n${s.extract.substring(0, 500)}\n${s.url}`
        )
        .join('\n\n');
    },
    {
      name: 'wikipedia_search',
      description:
        'Look up factual information from Wikipedia. Use for definitions, historical facts, scientific concepts, etc.',
      schema,
    }
  );

  return _tool;
};


export const getWikipediaTool = () => {
  if (!_instance) {
    _instance = new WikipediaTool();
  }
  return _instance;
};
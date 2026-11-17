

import axios from 'axios';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

import { logger } from '../../utils/logger.js';


export class DDGResult {
  constructor({ title, href, body }) {
    this.title = title;
    this.href = href;
    this.body = body;
  }

  toDict() {
    return { title: this.title, href: this.href, body: this.body };
  }
}


export class DuckDuckGoTool {
  static BASE_URL = 'https://html.duckduckgo.com/html/';
  static USER_AGENT =
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

  constructor() {
    this.client = axios.create({
      headers: {
        'User-Agent': DuckDuckGoTool.USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: 15000,
    });
  }


  async _fetchHtml(query) {
    const res = await this.client.post(
      DuckDuckGoTool.BASE_URL,
      new URLSearchParams({ q: query }).toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );
    return String(res.data || '');
  }


  _parseHtml(html) {
    const results = [];





    const blockRegex =
      /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;

    let match;
    while ((match = blockRegex.exec(html)) !== null) {
      const href = match[1];
      const title = match[2].replace(/<[^>]+>/g, '').trim();
      const body = match[3].replace(/<[^>]+>/g, '').trim();
      if (title && href) {
        results.push(new DDGResult({ title, href, body }));
      }
    }

    return results;
  }


  async search(query, maxResults = 5) {
    try {
      const html = await this._fetchHtml(query);
      const all = this._parseHtml(html);
      return all.slice(0, maxResults);
    } catch (e) {
      logger.warn(`DuckDuckGoTool.search failed: ${e?.message || e}`);
      return [];
    }
  }
}





let _tool = null;
let _instance = null;


export const duckduckgo_search = () => {
  if (_tool) return _tool;



  const schema = z.object({
    query: z.string().describe('Search query'),
    maxResults: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Max number of results'),
  });

  _tool = tool(
    async (input) => {
      const toolInstance = getDuckDuckGoTool();
      const results = await toolInstance.search(
        input.query,
        input.maxResults || 5
      );
      if (!results.length) return 'No web results found.';
      return results
        .map(
          (r, i) =>
            `${i + 1}. ${r.title}\n${r.body}\n${r.href}`
        )
        .join('\n\n');
    },
    {
      name: 'duckduckgo_search',
      description:
        'General web search via DuckDuckGo. Use for anything not covered by course materials or Wikipedia.',
      schema,
    }
  );

  return _tool;
};


export const getDuckDuckGoTool = () => {
  if (!_instance) {
    _instance = new DuckDuckGoTool();
  }
  return _instance;
};
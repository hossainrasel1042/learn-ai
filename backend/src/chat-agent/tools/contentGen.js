

import { tool } from '@langchain/core/tools';
import { z } from 'zod';

import { getContentPipeline } from '../../content_gen_engine/pipeline.js';
import { logger } from '../../utils/logger.js';


export class ContentGenTool {
  constructor() {
    this.pipeline = getContentPipeline();
  }


  async generate({
    topic,
    outputType = 'markdown',
    context = null,
    numPages = null,
  }) {
    try {
      return await this.pipeline.generateTheory(
        topic,
        outputType,
        context,
        numPages
      );
    } catch (e) {
      logger.error(`ContentGenTool.generate failed: ${e.message || e}`);
      throw e;
    }
  }
}





let _tool = null;
let _instance = null;


export const generate_learning_content = () => {
  if (_tool) return _tool;




  const schema = z.object({
    topic: z.string().describe('The topic to generate learning material for'),
    outputType: z
      .enum(['markdown', 'pdf', 'pptx'])
      .optional()
      .describe('Output format'),
    context: z
      .string()
      .optional()
      .describe('Optional extra context to inform generation'),
    numPages: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Target number of pages'),
  });

  _tool = tool(
    async (input) => {
      const toolInstance = getContentGenTool();
      const result = await toolInstance.generate({
        topic: input.topic,
        outputType: input.outputType || 'markdown',
        context: input.context || null,
        numPages: input.numPages || null,
      });
      return JSON.stringify(result, null, 2);
    },
    {
      name: 'generate_learning_content',
      description:
        'Generate structured learning materials (notes, tutorials, slide decks) for a given topic.',
      schema,
    }
  );

  return _tool;
};


export const getContentGenTool = () => {
  if (!_instance) {
    _instance = new ContentGenTool();
  }
  return _instance;
};
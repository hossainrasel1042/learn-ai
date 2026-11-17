

import { z } from 'zod';

const uuid = z.string().uuid();

const SOURCE_TYPES = ['course', 'chat', 'manual'];






export const CreateMindMapRequest = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  sourceType: z.enum(SOURCE_TYPES).optional(),
  sourceId: uuid.optional(),
});


export const GenerateMindMapRequest = z.object({
  sourceType: z.enum(SOURCE_TYPES).default('manual'),
  sourceId: uuid.optional(),
  text: z.string().min(50).optional(),
  nodeCount: z.number().int().min(3).max(20).default(8),
});


export const MindMapIdParam = z.object({ mindMapId: uuid });


export const PaginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});





export const MindMapNodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  level: z.number().int().min(0).max(5),
  parent: z.string().nullable(),
  description: z.string().nullable().optional(),
});

export const MindMapGraphSchema = z.object({
  root: z.string(),
  nodes: z.array(MindMapNodeSchema),
});

export const MindMapSchema = z.object({
  id: z.string(),
  userId: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  sourceType: z.string().nullable(),
  sourceId: z.string().nullable(),
  rootConcept: z.string(),
  nodeCount: z.number().int(),
  graph: MindMapGraphSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

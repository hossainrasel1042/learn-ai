

export type SourceType = 'course' | 'chat' | 'manual';

export interface MindMapNode {
  id: string;
  label: string;
  level: number;
  parent: string | null;
  description?: string | null;
}

export interface MindMapGraph {
  root: string;
  nodes: MindMapNode[];
}

export interface MindMap {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  sourceType: string | null;
  sourceId: string | null;
  rootConcept: string;
  nodeCount: number;
  graph: MindMapGraph;
  createdAt: string;
  updatedAt: string;
}

export interface MindMapListResponse {
  mindMaps: MindMap[];

  mind_maps?: MindMap[];
  total: number;
  page: number;
  pageSize: number;
}

export interface MindMapDetailResponse {
  mindMap: MindMap;
}

export interface GenerateMindMapResponse {
  inserted: number;
  nodeCount: number;
  graph: MindMapGraph;

  generatedBy?: 'ai' | 'local';
}

export interface CreateMindMapInput {
  title: string;
  description?: string;
  sourceType?: SourceType;
  sourceId?: string;
}

export interface GenerateMindMapInput {
  sourceType: SourceType;
  sourceId?: string;
  text?: string;
  nodeCount?: number;
}
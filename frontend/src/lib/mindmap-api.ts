

import { apiFetch } from '@/lib/api';
import type {
  CreateMindMapInput,
  GenerateMindMapInput,
  GenerateMindMapResponse,
  MindMap,
  MindMapDetailResponse,
  MindMapListResponse,
} from '@/types/mindmap';





export async function createMindMap(input: CreateMindMapInput): Promise<{ mindMap: MindMap }> {
  const res = await apiFetch<{ mindMap?: MindMap; mind_map?: MindMap }>('/mindmaps', {
    method: 'POST',
    body: input,
  });



  const mindMap = res.mindMap ?? res.mind_map;
  if (!mindMap) throw new Error('Mind map was created but the response was empty.');
  return { mindMap };
}

export async function listMindMaps(page = 1, pageSize = 20): Promise<MindMapListResponse> {
  const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  return apiFetch<MindMapListResponse>(`/mindmaps?${qs.toString()}`);
}

export async function getMindMap(mindMapId: string): Promise<MindMapDetailResponse> {
  const res = await apiFetch<{ mindMap?: MindMap; mind_map?: MindMap }>(
    `/mindmaps/${mindMapId}`,
  );

  const mindMap = res.mindMap ?? res.mind_map;
  if (!mindMap) throw new Error('Mind map not found.');
  return { mindMap };
}

export async function deleteMindMap(mindMapId: string): Promise<void> {
  await apiFetch<void>(`/mindmaps/${mindMapId}`, { method: 'DELETE' });
}

export interface GenerateMindMapOptions {

  timeoutMs?: number;

  signal?: AbortSignal;
}


export async function generateMindMap(
  mindMapId: string,
  input: GenerateMindMapInput,
  options: GenerateMindMapOptions = {},
): Promise<GenerateMindMapResponse> {
  const { timeoutMs = 90_000, signal: externalSignal } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);


  if (externalSignal?.aborted) {
    controller.abort();
  } else if (externalSignal) {

    externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  try {
    return await apiFetch<GenerateMindMapResponse>(
      `/mindmaps/${mindMapId}/generate`,
      {
        method: 'POST',
        body: input,
        signal: controller.signal,
      },
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
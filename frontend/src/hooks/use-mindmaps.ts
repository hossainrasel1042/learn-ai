

'use client';

import { useCallback, useEffect, useState } from 'react';

import { listMindMaps, deleteMindMap } from '@/lib/mindmap-api';
import type { MindMap } from '@/types/mindmap';

interface UseMindMapsOptions {
  pageSize?: number;
}

interface UseMindMapsResult {
  mindMaps: MindMap[];
  total: number;
  page: number;
  pageSize: number;
  isLoading: boolean;
  error: string | null;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  remove: (mindMapId: string) => Promise<void>;
}

export function useMindMaps({ pageSize = 20 }: UseMindMapsOptions = {}): UseMindMapsResult {
  const [mindMaps, setMindMaps] = useState<MindMap[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (pageNum: number, append: boolean) => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await listMindMaps(pageNum, pageSize);






        const list = res.mindMaps ?? res.mind_maps ?? [];
        setTotal(res.total ?? 0);
        setMindMaps((prev) => (append ? [...prev, ...list] : list));
        setPage(res.page ?? pageNum);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load mind maps');
      } finally {
        setIsLoading(false);
      }
    },
    [pageSize],
  );

  useEffect(() => {
    void load(1, false);
  }, [load]);

  const loadMore = useCallback(async () => {
    if (mindMaps.length >= total) return;
    await load(page + 1, true);
  }, [mindMaps.length, total, page, load]);

  const refresh = useCallback(async () => {
    await load(1, false);
  }, [load]);

  const remove = useCallback(
    async (mindMapId: string) => {
      await deleteMindMap(mindMapId);
      setMindMaps((prev) => prev.filter((m) => m.id !== mindMapId));
      setTotal((t) => Math.max(0, t - 1));
    },
    [],
  );

  return {
    mindMaps,
    total,
    page,
    pageSize,
    isLoading,
    error,
    loadMore,
    refresh,
    remove,
  };
}
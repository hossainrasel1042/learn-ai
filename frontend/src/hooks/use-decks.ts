

'use client';

import { useCallback, useEffect, useState } from 'react';

import { listDecks, deleteDeck } from '@/lib/srs-api';
import type { Deck } from '@/types/srs';

interface UseDecksOptions {
  pageSize?: number;
}

interface UseDecksResult {
  decks: Deck[];
  total: number;
  page: number;
  pageSize: number;
  isLoading: boolean;
  error: string | null;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  remove: (deckId: string) => Promise<void>;
}

export function useDecks({ pageSize = 20 }: UseDecksOptions = {}): UseDecksResult {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (pageNum: number, append: boolean) => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await listDecks(pageNum, pageSize);
        setTotal(res.total);
        setDecks((prev) => (append ? [...prev, ...res.decks] : res.decks));
        setPage(pageNum);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load decks');
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
    if (decks.length >= total) return;
    await load(page + 1, true);
  }, [decks.length, total, page, load]);

  const refresh = useCallback(async () => {
    await load(1, false);
  }, [load]);

  const remove = useCallback(
    async (deckId: string) => {
      await deleteDeck(deckId);
      setDecks((prev) => prev.filter((d) => d.id !== deckId));
      setTotal((t) => Math.max(0, t - 1));
    },
    [],
  );

  return {
    decks,
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

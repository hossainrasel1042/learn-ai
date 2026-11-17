

'use client';

import { useCallback, useEffect, useState } from 'react';

import { getBadges, getStats, getXpHistory } from '@/lib/gamification-api';
import type {
  BadgeWithStatus,
  GamificationStats,
  XpEvent,
} from '@/types/gamification';





interface UseStatsResult {
  stats: GamificationStats | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}


export function useGamificationStats(enabled = true): UseStatsResult {
  const [stats, setStats] = useState<GamificationStats | null>(null);
  const [isLoading, setIsLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const s = await getStats();
      setStats(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load stats');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void load();
  }, [load, enabled]);

  return { stats, isLoading, error, refresh: load };
}





interface UseXpHistoryResult {
  events: XpEvent[];
  nextCursor: string | null;
  isLoading: boolean;
  error: string | null;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useXpHistory(pageSize = 50): UseXpHistoryResult {
  const [events, setEvents] = useState<XpEvent[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (cursor: string | null, append: boolean) => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await getXpHistory(pageSize, cursor);
        setNextCursor(res.nextCursor);
        setEvents((prev) => {
          if (!append) return res.events;


          const seen = new Set(prev.map((e) => e.id));
          const fresh = res.events.filter((e) => !seen.has(e.id));
          return [...prev, ...fresh];
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load XP history');
      } finally {
        setIsLoading(false);
      }
    },
    [pageSize],
  );

  useEffect(() => {
    void load(null, false);
  }, [load]);

  const loadMore = useCallback(async () => {
    if (!nextCursor) return;
    await load(nextCursor, true);
  }, [nextCursor, load]);

  const refresh = useCallback(async () => {
    await load(null, false);
  }, [load]);

  return { events, nextCursor, isLoading, error, loadMore, refresh };
}





interface UseBadgesResult {
  badges: BadgeWithStatus[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useBadges(): UseBadgesResult {
  const [badges, setBadges] = useState<BadgeWithStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await getBadges();
      setBadges(res.badges);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load badges');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { badges, isLoading, error, refresh: load };
}
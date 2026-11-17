

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { getDueCards, submitReview } from '@/lib/srs-api';
import type { Card, IntervalPreview, Rating } from '@/types/srs';

export type ReviewPhase = 'loading' | 'question' | 'reveal' | 'submitting' | 'done';

export interface ReviewStats {
  reviewed: number;
  again: number;
  hard: number;
  good: number;
  easy: number;
}

interface UseReviewSessionOptions {

  deckId?: string;

  limit?: number;
}

interface UseReviewSessionResult {
  phase: ReviewPhase;
  cards: Card[];
  current: Card | null;

  index: number;

  reviewed: number;
  stats: ReviewStats;

  preview: IntervalPreview | null;
  error: string | null;
  reveal: () => void;
  submit: (rating: Rating) => Promise<void>;
  restart: () => Promise<void>;
}

const INITIAL_STATS: ReviewStats = {
  reviewed: 0,
  again: 0,
  hard: 0,
  good: 0,
  easy: 0,
};





function clampEase(ef: number) {
  return ef < 1.3 ? 1.3 : ef;
}

function previewNextInterval(
  card: Pick<Card, 'easeFactor' | 'intervalDays' | 'repetitions'>,
  rating: Rating,
): number {
  const r = Number(rating);
  let interval = card.intervalDays ?? 0;
  const reps = card.repetitions ?? 0;
  let ef = card.easeFactor ?? 2.5;



  let q: number;
  if (r === 0) q = 1;
  else if (r === 2) q = 3;
  else if (r === 3) q = 4;
  else if (r === 4) q = 5;
  else q = 1;

  if (q < 3) {
    return 1;
  }
  if (reps === 0) return 1;
  if (reps === 1) return 6;
  interval = Math.round(interval * ef);

  ef = clampEase(ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
  return interval;
}

function makePreview(card: Card): IntervalPreview {
  return {
    again: previewNextInterval(card, 0),
    hard: previewNextInterval(card, 2),
    good: previewNextInterval(card, 3),
    easy: previewNextInterval(card, 4),
  };
}





export function useReviewSession({
  deckId,
  limit = 30,
}: UseReviewSessionOptions = {}): UseReviewSessionResult {
  const [phase, setPhase] = useState<ReviewPhase>('loading');
  const [cards, setCards] = useState<Card[]>([]);
  const [index, setIndex] = useState(0);
  const [reviewed, setReviewed] = useState(0);
  const [stats, setStats] = useState<ReviewStats>(INITIAL_STATS);
  const [error, setError] = useState<string | null>(null);

  const inFlightRef = useRef(false);

  const load = useCallback(async () => {
    setPhase('loading');
    setError(null);
    try {
      const res = await getDueCards(deckId, limit);
      setCards(res.cards);
      setIndex(0);
      setReviewed(0);
      setStats(INITIAL_STATS);
      setPhase(res.cards.length === 0 ? 'done' : 'question');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load cards');
      setPhase('done');
    }
  }, [deckId, limit]);

  useEffect(() => {



    Promise.resolve().then(() => { void load(); });
  }, [load]);

  const current = index < cards.length ? cards[index] : null;
  const preview = useMemo(() => (current ? makePreview(current) : null), [current]);



  useEffect(() => {
    if (phase !== 'submitting') {
      inFlightRef.current = false;
    }
  }, [phase]);

  const reveal = useCallback(() => {
    setPhase((p) => (p === 'question' ? 'reveal' : p));
  }, []);

  const submit = useCallback(
    async (rating: Rating) => {
      if (!current || inFlightRef.current) return;
      inFlightRef.current = true;
      setPhase('submitting');
      try {
        await submitReview(current.id, rating);

        setStats((s) => ({
          ...s,
          reviewed: s.reviewed + 1,
          ...(rating === 0 ? { again: s.again + 1 } : {}),
          ...(rating === 2 ? { hard: s.hard + 1 } : {}),
          ...(rating === 3 ? { good: s.good + 1 } : {}),
          ...(rating === 4 ? { easy: s.easy + 1 } : {}),
        }));
        const next = index + 1;
        if (next >= cards.length) {
          setReviewed((r) => r + 1);
          setIndex(next);
          setPhase('done');
        } else {
          setReviewed((r) => r + 1);
          setIndex(next);
          setPhase('question');
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to submit review');
        setPhase('reveal');

        inFlightRef.current = false;
      }
    },
    [current, index, cards.length],
  );

  const restart = useCallback(async () => {
    await load();
  }, [load]);

  return {
    phase,
    cards,
    current,
    index,
    reviewed,
    stats,
    preview,
    error,
    reveal,
    submit,
    restart,
  };
}
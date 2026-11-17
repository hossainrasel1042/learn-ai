'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  Loader2,
  RotateCcw,
  Sparkles,
  Timer,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { useReviewSession } from '@/hooks/use-review-session';
import type { Rating } from '@/types/srs';

const RATING_BUTTONS: Array<{
  rating: Rating;
  label: string;
  shortcut: string;
  classes: string;
}> = [
  {
    rating: 0,
    label: 'Again',
    shortcut: '1',
    classes:
      'bg-rose-100 hover:bg-rose-200 text-rose-900 dark:bg-rose-950/40 dark:hover:bg-rose-950/60 dark:text-rose-200 border-rose-300 dark:border-rose-800',
  },
  {
    rating: 2,
    label: 'Hard',
    shortcut: '2',
    classes:
      'bg-amber-100 hover:bg-amber-200 text-amber-900 dark:bg-amber-950/40 dark:hover:bg-amber-950/60 dark:text-amber-200 border-amber-300 dark:border-amber-800',
  },
  {
    rating: 3,
    label: 'Good',
    shortcut: '3',
    classes:
      'bg-indigo-100 hover:bg-indigo-200 text-indigo-900 dark:bg-indigo-950/40 dark:hover:bg-indigo-950/60 dark:text-indigo-200 border-indigo-300 dark:border-indigo-800',
  },
  {
    rating: 4,
    label: 'Easy',
    shortcut: '4',
    classes:
      'bg-emerald-100 hover:bg-emerald-200 text-emerald-900 dark:bg-emerald-950/40 dark:hover:bg-emerald-950/60 dark:text-emerald-200 border-emerald-300 dark:border-emerald-800',
  },
];


const SHORTCUT_RATINGS: Record<string, Rating> = {
  '1': 0,
  '2': 2,
  '3': 3,
  '4': 4,
};

function formatInterval(days: number): string {  const d = Math.max(0, Math.round(days));
  if (d === 0) return '<1d';
  if (d === 1) return '1d';
  if (d < 30) return `${d}d`;
  if (d < 365) return `${Math.round(d / 30)}mo`;
  return `${(d / 365).toFixed(1).replace(/\.0$/, '')}y`;
}

export default function StudyPage() {
  const params = useParams<{ deckId: string }>();
  const deckId = params.deckId;

  const session = useReviewSession({ deckId, limit: 30 });
  const { phase, current, index, cards, reviewed, stats, preview, error, reveal, submit, restart } =
    session;


  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (phase === 'question' && e.key === ' ') {
        e.preventDefault();
        reveal();
      } else if (phase === 'reveal') {
        const rating = SHORTCUT_RATINGS[e.key];
        if (rating !== undefined) {
          e.preventDefault();
          void submit(rating);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [phase, reveal, submit]);

  const total = cards.length;
  const progressPct = total > 0 ? Math.round((reviewed / total) * 100) : 0;

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/flashcards/${deckId}`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to deck
          </Link>
        </Button>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          {total > 0 && (
            <span>
              {index + (phase === 'done' ? 0 : 1)} / {total}
            </span>
          )}
        </div>
      </div>

      {total > 0 && <Progress value={progressPct} className="mb-6" />}

      {phase === 'loading' && (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin mb-3" />
          Loading your due cards...
        </div>
      )}

      {phase === 'done' && (
        <DoneView
          reviewed={reviewed}
          stats={stats}
          error={error}
          onRestart={restart}
        />
      )}

      {(phase === 'question' || phase === 'reveal' || phase === 'submitting') && current && (
        <Card className="learn-slide-up">
          <CardContent className="p-8">
            <div className="flex items-center justify-between mb-4 text-xs uppercase tracking-wide text-muted-foreground">
              <span>Card {index + 1} of {total}</span>
              {current.tags.length > 0 && (
                <div className="flex gap-1">
                  {current.tags.map((t) => (
                    <Badge key={t} variant="secondary" className="text-[10px]">
                      {t}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div className="min-h-[200px] flex items-center justify-center text-xl md:text-2xl font-medium text-center py-8">
              {current.front}
            </div>

            {phase === 'reveal' || phase === 'submitting' ? (
              <div className="learn-fade-in space-y-6">
                <div className="border-t pt-6 min-h-[100px] text-center text-base md:text-lg text-muted-foreground whitespace-pre-wrap">
                  {current.back}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {RATING_BUTTONS.map((btn) => (
                    <button
                      key={btn.rating}
                      type="button"
                      onClick={() => submit(btn.rating)}
                      disabled={phase === 'submitting'}
                      className={[
                        'rounded-lg border p-3 text-sm font-medium transition-all',
                        'focus:outline-none focus:ring-2 focus:ring-primary/40',
                        btn.classes,
                        phase === 'submitting' ? 'opacity-50 cursor-not-allowed' : '',
                      ].join(' ')}
                    >
                      <div className="flex items-center justify-between">
                        <span>{btn.label}</span>
                        <kbd className="text-[10px] opacity-60 font-mono">{btn.shortcut}</kbd>
                      </div>
                      {preview && (
                        <div className="text-xs opacity-70 mt-1">
                          {formatInterval(preview[btn.label.toLowerCase() as 'again' | 'hard' | 'good' | 'easy'])}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-center text-muted-foreground">
                  Press 1–4 on your keyboard
                </p>
              </div>
            ) : (
              <div className="flex justify-center pt-4 border-t">
                <Button size="lg" onClick={reveal}>
                  <Eye className="mr-2 h-4 w-4" />
                  Show answer
                  <kbd className="ml-3 text-[10px] opacity-60 font-mono border rounded px-1">
                    Space
                  </kbd>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function DoneView({
  reviewed,
  stats,
  error,
  onRestart,
}: {
  reviewed: number;
  stats: { again: number; hard: number; good: number; easy: number };
  error: string | null;
  onRestart: () => void | Promise<void>;
}) {
  if (reviewed === 0 && !error) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-emerald-500" />
          <h2 className="text-2xl font-bold mb-2">All caught up!</h2>
          <p className="text-muted-foreground mb-6">
            You have no cards due right now. Come back later or generate more cards.
          </p>
          <div className="flex justify-center gap-2">
            <Button asChild>
              <Link href="/flashcards">Back to decks</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="learn-slide-up">
      <CardContent className="py-12 text-center">
        <div className="rounded-full bg-emerald-100 dark:bg-emerald-950/40 p-3 w-fit mx-auto mb-4">
          <Sparkles className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
        </div>
        <h2 className="text-2xl font-bold mb-1">Session complete!</h2>
        <p className="text-muted-foreground mb-6">
          You reviewed {reviewed} card{reviewed === 1 ? '' : 's'}.
        </p>

        <div className="grid grid-cols-4 gap-2 max-w-sm mx-auto mb-6">
          <Stat label="Again" value={stats.again} color="text-rose-600" />
          <Stat label="Hard" value={stats.hard} color="text-amber-600" />
          <Stat label="Good" value={stats.good} color="text-indigo-600" />
          <Stat label="Easy" value={stats.easy} color="text-emerald-600" />
        </div>

        {error && (
          <p className="text-sm text-destructive mb-4">{error}</p>
        )}

        <div className="flex justify-center gap-2">
          <Button variant="outline" onClick={onRestart}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Study again
          </Button>
          <Button asChild>
            <Link href="/flashcards">
              <Timer className="mr-2 h-4 w-4" />
              Done for now
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}
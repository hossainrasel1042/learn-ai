

'use client';

import Link from 'next/link';
import { Flame, Trophy } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useGamificationStats } from '@/hooks/use-gamification';

interface StreakWidgetProps {
  className?: string;
}

export function StreakWidget({ className }: StreakWidgetProps) {
  const { stats, isLoading } = useGamificationStats();

  if (isLoading) {
    return <Skeleton className={cn('h-9 w-24 rounded-full', className)} />;
  }

  const streak = stats?.currentStreak ?? 0;
  const level = stats?.level ?? 1;

  return (
    <Link
      href="/achievements"
      aria-label={`Streak ${streak} days, level ${level}`}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border bg-background/80 px-3 py-1 text-xs font-medium transition-colors hover:bg-accent',
        className,
      )}
    >
      <Badge variant="secondary" className="gap-1 px-2 py-0.5">
        <Flame className="h-3 w-3 text-orange-500" />
        <span>{streak}</span>
      </Badge>
      <Badge variant="secondary" className="gap-1 px-2 py-0.5">
        <Trophy className="h-3 w-3 text-amber-500" />
        <span>Lv {level}</span>
      </Badge>
    </Link>
  );
}
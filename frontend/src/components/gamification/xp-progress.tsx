

'use client';

import { useEffect, useRef } from 'react';
import { Trophy } from 'lucide-react';
import { toast } from 'sonner';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';

import { useGamificationStats } from '@/hooks/use-gamification';
import type { GamificationStats } from '@/types/gamification';

interface XpProgressProps {
  showTitle?: boolean;
  className?: string;

  stats?: GamificationStats | null;
  isLoading?: boolean;
}

export function XpProgress({
  showTitle = true,
  className,
  stats: statsProp,
  isLoading: isLoadingProp,
}: XpProgressProps) {


  const hasExternalStats = statsProp !== undefined;
  const selfFetched = useGamificationStats(!hasExternalStats);
  const stats = hasExternalStats ? statsProp : selfFetched.stats;
  const isLoading =
    isLoadingProp !== undefined ? isLoadingProp : selfFetched.isLoading;

  const lastLevelRef = useRef<number | null>(null);

  useEffect(() => {
    if (!stats) return;
    if (lastLevelRef.current === null) {
      lastLevelRef.current = stats.level;
      return;
    }
    if (stats.level > lastLevelRef.current) {
      toast.success(`Level up! You're now level ${stats.level}.`);
      lastLevelRef.current = stats.level;
    }
  }, [stats]);

  if (isLoading || !stats) {
    return (
      <Card className={className}>
        {showTitle && (
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-amber-500" /> Level
            </CardTitle>
          </CardHeader>
        )}
        <CardContent>
          <Skeleton className="h-2 w-full" />
          <Skeleton className="h-4 w-24 mt-2" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      {showTitle && (
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber-500" /> Level {stats.level}
          </CardTitle>
        </CardHeader>
      )}
      <CardContent className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">{stats.totalXp.toLocaleString()} XP</span>
          <span className="text-muted-foreground">
            {stats.xpToNextLevel.toLocaleString()} to Lv {stats.level + 1}
          </span>
        </div>
        <Progress value={stats.progressPct} className="h-2" />
        <p className="text-xs text-muted-foreground">
          {Math.round(stats.progressPct)}% of the way to the next level.
        </p>
      </CardContent>
    </Card>
  );
}

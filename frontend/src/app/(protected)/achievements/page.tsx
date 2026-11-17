

'use client';

import {
  ArrowLeft,
  Calendar,
  Flame,
  Loader2,
  Trophy,
} from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';

import { BadgeCard } from '@/components/gamification/badge-card';
import { XpProgress } from '@/components/gamification/xp-progress';
import { resolveBadgeIcon } from '@/components/gamification/icon-resolver';
import {
  useBadges,
  useGamificationStats,
  useXpHistory,
} from '@/hooks/use-gamification';
import { XP_SOURCE_META, type XpSource } from '@/types/gamification';

export default function AchievementsPage() {
  const {
    stats,
    isLoading: statsLoading,
    error: statsError,
  } = useGamificationStats();
  const {
    badges,
    isLoading: badgesLoading,
    error: badgesError,
  } = useBadges();
  const {
    events,
    nextCursor,
    isLoading: historyLoading,
    error: historyError,
    loadMore,
  } = useXpHistory(50);

  const earnedCount = badges.filter((b) => b.earned).length;

  return (
    <div className="container mx-auto max-w-5xl py-8 px-4">
      <Button asChild variant="ghost" size="sm" className="mb-4">
        <Link href="/dashboard">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to dashboard
        </Link>
      </Button>

      <div className="flex items-center gap-2 mb-6">
        <Trophy className="h-7 w-7 text-amber-500" />
        <h1 className="text-3xl font-bold tracking-tight">Achievements</h1>
      </div>
      <p className="text-muted-foreground mb-8">
        Track your XP, level, study streak, and unlocked badges.
      </p>

      
      <div className="grid gap-4 md:grid-cols-3 mb-8">
        
        <XpProgress stats={stats} isLoading={statsLoading} />
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Flame className="h-4 w-4 text-orange-500" />
              Daily streak
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {statsLoading ? (
              <Skeleton className="h-7 w-24" />
            ) : statsError ? (
              <p className="text-sm text-destructive">{statsError}</p>
            ) : (
              <>
                <div className="text-2xl font-bold">
                  {stats?.currentStreak ?? 0}{' '}
                  <span className="text-sm text-muted-foreground font-normal">
                    days
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Longest streak: {stats?.longestStreak ?? 0} days
                </p>
                {stats?.lastActiveDate && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                    <Calendar className="h-3 w-3" />
                    Last active {new Date(stats.lastActiveDate).toLocaleDateString()}
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Trophy className="h-4 w-4 text-amber-500" />
              Badges
            </CardTitle>
          </CardHeader>
          <CardContent>
            {badgesLoading ? (
              <Skeleton className="h-7 w-20" />
            ) : badgesError ? (
              <p className="text-sm text-destructive">{badgesError}</p>
            ) : (
              <>
                <div className="text-2xl font-bold">
                  {earnedCount}{' '}
                  <span className="text-sm text-muted-foreground font-normal">
                    / {badges.length}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Earn more by studying every day.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Badges</CardTitle>
          <CardDescription>
            Earned badges are highlighted. Hover for the date you earned each one.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {badgesLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : badgesError ? (
            <p className="text-sm text-destructive">{badgesError}</p>
          ) : earnedCount === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center">
              <p className="text-muted-foreground">
                Keep learning to earn your first badge.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {badges.map((b) => (
                <BadgeCard key={b.id} badge={b} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      
      <Card>
        <CardHeader>
          <CardTitle>XP history</CardTitle>
          <CardDescription>
            Every XP-earning action you&apos;ve taken, newest first.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {historyLoading && events.length === 0 ? (
            <Skeleton className="h-32 w-full" />
          ) : historyError && events.length === 0 ? (
            <p className="text-sm text-destructive">{historyError}</p>
          ) : events.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center">
              <p className="text-muted-foreground">
                No XP earned yet — start a study session to see your activity here.
              </p>
            </div>
          ) : (
            <>
              {historyError && (
                <p className="text-sm text-destructive mb-3">{historyError}</p>
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead className="text-right">XP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map((ev) => {
                    const meta = XP_SOURCE_META[ev.source as XpSource];
                    const Icon = resolveBadgeIcon(meta?.icon ?? 'sparkles');
                    return (
                      <TableRow key={ev.id}>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(ev.createdAt).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center gap-1.5 text-sm ${meta?.tone ?? ''}`}>
                            <Icon className="h-4 w-4" />
                            {meta?.label ?? ev.source}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          +{ev.amount}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {nextCursor && (
                <div className="flex justify-center mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={loadMore}
                    disabled={historyLoading}
                  >
                    {historyLoading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    Load more
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
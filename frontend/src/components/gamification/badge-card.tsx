

'use client';

import { Award } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { BADGE_ICON_MAP } from '@/components/gamification/icon-resolver';
import type { BadgeWithStatus } from '@/types/gamification';

interface BadgeCardProps {
  badge: BadgeWithStatus;
  className?: string;
}







function BadgeIcon({ name, className }: { name: string | null | undefined; className?: string }) {
  if (name && name in BADGE_ICON_MAP) {
    const Icon = BADGE_ICON_MAP[name]!;
    return <Icon className={className} />;
  }
  return <Award className={className} />;
}

export function BadgeCard({ badge, className }: BadgeCardProps) {
  const earnedAt = badge.earnedAt
    ? new Date(badge.earnedAt).toLocaleDateString()
    : null;

  return (
    <Card
      title={earnedAt ? `Earned ${earnedAt}` : 'Not yet earned'}
      className={cn(
        'transition-colors',
        badge.earned
          ? 'border-amber-500/30 bg-amber-50/40 dark:bg-amber-950/20'
          : 'opacity-60 grayscale',
        className,
      )}
    >
      <CardContent className="p-4 flex items-start gap-3">
        <div
          className={cn(
            'rounded-md p-2 shrink-0',
            badge.earned
              ? 'bg-amber-500 text-white'
              : 'bg-muted text-muted-foreground',
          )}
        >
          <BadgeIcon name={badge.icon} className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="font-medium text-sm leading-tight">{badge.name}</div>
          <div className="text-xs text-muted-foreground mt-1 line-clamp-3">
            {badge.description}
          </div>
          {badge.earned && earnedAt && (
            <div className="text-[10px] text-muted-foreground mt-2">
              Earned {earnedAt}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
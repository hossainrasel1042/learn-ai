

'use client';

import {
  Award,
  BookOpen,
  CheckCircle,
  CheckCircle2,
  Crown,
  Flame,
  GraduationCap,
  Layers,
  ListChecks,
  Map as MapIcon,
  MessageSquare,
  Network,
  Sparkles,
  Trophy,
  type LucideIcon,
} from 'lucide-react';


export const BADGE_ICON_MAP: Record<string, LucideIcon> = {
  sparkles: Sparkles,
  flame: Flame,
  crown: Crown,
  award: Award,
  'graduation-cap': GraduationCap,
  layers: Layers,
  'check-circle': CheckCircle,
  'check-circle-2': CheckCircle2,
  map: MapIcon,
  'list-checks': ListChecks,
  network: Network,
  'message-square': MessageSquare,
  'book-open': BookOpen,
  trophy: Trophy,
};


export function resolveBadgeIcon(name: string | null | undefined): LucideIcon {
  if (!name) return Award;
  return BADGE_ICON_MAP[name] ?? Award;
}



export type XpSource =
  | 'srs_review'
  | 'quiz_correct'
  | 'quiz_finished'
  | 'mindmap_generated'
  | 'chat_message'
  | 'material_viewed';

export interface Badge {
  id: string;
  code: string;
  name: string;
  description: string;
  icon: string;
  threshold: Record<string, unknown>;
  createdAt: string;
}

export interface BadgeWithStatus extends Badge {
  earned: boolean;
  earnedAt: string | null;
}

export interface XpEvent {
  id: string;
  userId: string;
  source: XpSource | string;
  amount: number;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface UserXp {
  userId: string;
  totalXp: number;
  level: number;
  updatedAt: string;
}

export interface DailyStreak {
  userId: string;
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string | null;
  updatedAt: string;
}

export interface GamificationStats {
  totalXp: number;
  level: number;
  xpToNextLevel: number;
  progressPct: number;
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string | null;
}

export interface AwardXpResult {
  awarded: boolean;
  leveledUp?: boolean;
  newLevel?: number;
  totalXp?: number;
  newlyEarned?: Badge[];
  reason?: string;
}

export interface XpHistoryResponse {
  events: XpEvent[];
  nextCursor: string | null;
}

export interface BadgesResponse {
  badges: BadgeWithStatus[];
}


export const XP_SOURCE_META: Record<
  XpSource,
  { label: string; icon: string; tone: string }
> = {
  srs_review:        { label: 'Flashcard review',   icon: 'layers',        tone: 'text-blue-500' },
  quiz_correct:      { label: 'Quiz answer',        icon: 'check-circle-2', tone: 'text-green-500' },
  quiz_finished:     { label: 'Quiz completed',     icon: 'list-checks',    tone: 'text-emerald-500' },
  mindmap_generated: { label: 'Mind map created',   icon: 'network',       tone: 'text-purple-500' },
  chat_message:      { label: 'Chat message',       icon: 'message-square', tone: 'text-sky-500' },
  material_viewed:   { label: 'Material viewed',    icon: 'book-open',      tone: 'text-rose-500' },
};
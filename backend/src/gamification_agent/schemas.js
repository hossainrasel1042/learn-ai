

import { z } from 'zod';

import { isValidTimestamp } from '../models/gamification.js';

const uuid = z.string().uuid();

export const XP_SOURCES = [
  'srs_review',
  'quiz_correct',
  'quiz_finished',
  'mindmap_generated',
  'chat_message',
  'material_viewed',
];






export const AwardXpRequest = z.object({
  source: z.enum(XP_SOURCES),
  amount: z.number().int().min(0).max(1000).optional(),
  metadata: z.record(z.unknown()).optional(),
});


const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const XpHistoryQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z
    .string()
    .max(200)
    .refine(
      (v) => {
        const sep = v.lastIndexOf('|');
        const ts = sep === -1 ? v : v.slice(0, sep);
        if (!isValidTimestamp(ts)) return false;
        if (sep === -1) return true;
        return UUID_RE.test(v.slice(sep + 1));
      },
      { message: 'cursor must be a valid pagination cursor' },
    )
    .optional(),
});





export const UserXpSchema = z.object({
  userId: z.string(),
  totalXp: z.number().int(),
  level: z.number().int(),
  updatedAt: z.string(),
});

export const DailyStreakSchema = z.object({
  userId: z.string(),
  currentStreak: z.number().int(),
  longestStreak: z.number().int(),
  lastActiveDate: z.string().nullable(),
  updatedAt: z.string(),
});

export const XpEventSchema = z.object({
  id: z.string(),
  userId: z.string(),
  source: z.string(),
  amount: z.number().int(),
  metadata: z.record(z.unknown()),
  createdAt: z.string(),
});

export const BadgeSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  description: z.string(),
  icon: z.string(),
  threshold: z.record(z.unknown()),
  createdAt: z.string(),
});

export const BadgeWithStatusSchema = BadgeSchema.extend({
  earned: z.boolean(),
  earnedAt: z.string().nullable(),
});

export const GamificationStatsSchema = z.object({
  totalXp: z.number().int(),
  level: z.number().int(),
  xpToNextLevel: z.number().int(),
  progressPct: z.number(),
  currentStreak: z.number().int(),
  longestStreak: z.number().int(),
  lastActiveDate: z.string().nullable(),
});

export const AwardXpResultSchema = z.object({
  awarded: z.boolean(),
  leveledUp: z.boolean().optional(),
  newLevel: z.number().int().optional(),
  totalXp: z.number().int().optional(),
  newlyEarned: z.array(BadgeSchema).optional(),
  reason: z.string().optional(),
});





export class UserXpClass {
  constructor({ userId, totalXp = 0, level = 1, updatedAt } = {}) {
    this.userId = userId;
    this.totalXp = totalXp;
    this.level = level;
    this.updatedAt = updatedAt;
  }

  toDict() {
    return {
      userId: this.userId,
      totalXp: this.totalXp,
      level: this.level,
      updatedAt: toIso(this.updatedAt),
    };
  }
}

export class DailyStreakClass {
  constructor({
    userId,
    currentStreak = 0,
    longestStreak = 0,
    lastActiveDate = null,
    updatedAt,
  } = {}) {
    this.userId = userId;
    this.currentStreak = currentStreak;
    this.longestStreak = longestStreak;
    this.lastActiveDate = lastActiveDate;
    this.updatedAt = updatedAt;
  }

  toDict() {
    return {
      userId: this.userId,
      currentStreak: this.currentStreak,
      longestStreak: this.longestStreak,
      lastActiveDate: this.lastActiveDate
        ? typeof this.lastActiveDate === 'string'
          ? this.lastActiveDate
          : this.lastActiveDate.toISOString().slice(0, 10)
        : null,
      updatedAt: toIso(this.updatedAt),
    };
  }
}

export class XpEventClass {
  constructor({ id, userId, source, amount, metadata = {}, createdAt } = {}) {
    this.id = id;
    this.userId = userId;
    this.source = source;
    this.amount = amount;
    this.metadata = metadata;
    this.createdAt = createdAt;
  }

  toDict() {
    return {
      id: this.id,
      userId: this.userId,
      source: this.source,
      amount: this.amount,
      metadata: this.metadata || {},
      createdAt: toIso(this.createdAt),
    };
  }
}

export class BadgeClass {
  constructor({ id, code, name, description, icon, threshold = {}, createdAt } = {}) {
    this.id = id;
    this.code = code;
    this.name = name;
    this.description = description;
    this.icon = icon;
    this.threshold = threshold;
    this.createdAt = createdAt;
  }

  toDict() {
    return {
      id: this.id,
      code: this.code,
      name: this.name,
      description: this.description,
      icon: this.icon,
      threshold: this.threshold || {},
      createdAt: toIso(this.createdAt),
    };
  }
}

export class BadgeWithStatusClass {
  constructor({
    id,
    code,
    name,
    description,
    icon,
    threshold = {},
    createdAt,
    earned = false,
    earnedAt = null,
  } = {}) {
    this.id = id;
    this.code = code;
    this.name = name;
    this.description = description;
    this.icon = icon;
    this.threshold = threshold;
    this.createdAt = createdAt;
    this.earned = earned;
    this.earnedAt = earnedAt;
  }

  toDict() {
    return {
      ...new BadgeClass({
        id: this.id,
        code: this.code,
        name: this.name,
        description: this.description,
        icon: this.icon,
        threshold: this.threshold,
        createdAt: this.createdAt,
      }).toDict(),
      earned: this.earned,
      earnedAt: this.earnedAt
        ? typeof this.earnedAt === 'string'
          ? this.earnedAt
          : this.earnedAt.toISOString()
        : null,
    };
  }
}

export class GamificationStatsClass {
  constructor({
    totalXp = 0,
    level = 1,
    xpToNextLevel = 100,
    progressPct = 0,
    currentStreak = 0,
    longestStreak = 0,
    lastActiveDate = null,
  } = {}) {
    this.totalXp = totalXp;
    this.level = level;
    this.xpToNextLevel = xpToNextLevel;
    this.progressPct = progressPct;
    this.currentStreak = currentStreak;
    this.longestStreak = longestStreak;
    this.lastActiveDate = lastActiveDate;
  }

  toDict() {
    return {
      totalXp: this.totalXp,
      level: this.level,
      xpToNextLevel: this.xpToNextLevel,
      progressPct: this.progressPct,
      currentStreak: this.currentStreak,
      longestStreak: this.longestStreak,
      lastActiveDate: this.lastActiveDate,
    };
  }
}

export class AwardXpResultClass {
  constructor({
    awarded,
    leveledUp = false,
    newLevel,
    totalXp,
    newlyEarned = [],
    reason,
  } = {}) {
    this.awarded = awarded;
    this.leveledUp = leveledUp;
    this.newLevel = newLevel;
    this.totalXp = totalXp;
    this.newlyEarned = newlyEarned;
    this.reason = reason;
  }

  toDict() {
    return {
      awarded: this.awarded,
      leveledUp: this.leveledUp,
      newLevel: this.newLevel,
      totalXp: this.totalXp,
      newlyEarned: this.newlyEarned.map((b) =>
        b && typeof b.toDict === 'function' ? b.toDict() : b,
      ),
      reason: this.reason,
    };
  }
}





function toIso(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}
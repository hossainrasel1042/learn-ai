

















































import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);






export function computeLevel(totalXp) {
  const xp = Math.max(0, Math.floor(totalXp || 0));
  return Math.floor(Math.sqrt(xp / 100)) + 1;
}

export function xpForLevel(level) {
  const L = Math.max(1, Math.floor(level || 1));
  return (L - 1) * (L - 1) * 100;
}

export function xpForNextLevel(level) {
  const L = Math.max(1, Math.floor(level || 1));
  return L * L * 100;
}

export function progressPercent(totalXp, level) {
  const base = xpForLevel(level);
  const next = xpForNextLevel(level);
  const xp = Math.max(0, Math.floor(totalXp || 0));
  if (next <= base) return 0;
  const pct = ((xp - base) / (next - base)) * 100;
  if (pct < 0) return 0;
  if (pct > 100) return 100;
  return Math.round(pct * 100) / 100;
}






export function computeStreakUpdate(prevCurrent, prevLast, now, graceHours = 36) {
  const today = isoDate(now);
  const prevLongest = Math.max(0, Math.floor(prevCurrent || 0));

  if (!prevLast) {
    return {
      current: 1,
      longest: Math.max(prevLongest, 1),
      lastActiveDate: today,
    };
  }

  if (prevLast === today) {

    return {
      current: Math.max(0, Math.floor(prevCurrent || 0)),
      longest: prevLongest,
      lastActiveDate: today,
    };
  }


  const prevDate = new Date(`${prevLast}T00:00:00Z`);
  const todayDate = new Date(`${today}T00:00:00Z`);
  const dayDiff = Math.round((todayDate - prevDate) / 86_400_000);

  if (dayDiff === 1) {
    const next = (prevCurrent || 0) + 1;
    return {
      current: next,
      longest: Math.max(prevLongest, next),
      lastActiveDate: today,
    };
  }

  if (dayDiff > 1) {

    const prevActiveDateTime = new Date(`${prevLast}T12:00:00Z`);
    const hoursSinceLast = (now - prevActiveDateTime) / 3_600_000;
    if (hoursSinceLast <= graceHours) {

      const next = Math.max(1, prevCurrent || 1);
      return {
        current: next,
        longest: Math.max(prevLongest, next),
        lastActiveDate: today,
      };
    }

    return {
      current: 1,
      longest: Math.max(prevLongest, 1),
      lastActiveDate: today,
    };
  }


  return {
    current: Math.max(1, prevCurrent || 1),
    longest: prevLongest,
    lastActiveDate: today,
  };
}

function isoDate(d) {
  const dt = d instanceof Date ? d : new Date();
  return dt.toISOString().slice(0, 10);
}





export class UserXp {
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

export class DailyStreak {
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
      lastActiveDate: this.lastActiveDate,
      updatedAt: toIso(this.updatedAt),
    };
  }
}

export class XpEvent {
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

export class Badge {
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

export class UserBadge {
  constructor({ userId, badgeId, earnedAt } = {}) {
    this.userId = userId;
    this.badgeId = badgeId;
    this.earnedAt = earnedAt;
  }

  toDict() {
    return {
      userId: this.userId,
      badgeId: this.badgeId,
      earnedAt: toIso(this.earnedAt),
    };
  }
}





function rowToUserXp(row) {
  return new UserXp({
    userId: row.user_id,
    totalXp: row.total_xp,
    level: row.level,
    updatedAt: row.updated_at,
  });
}

function rowToStreak(row) {
  return new DailyStreak({
    userId: row.user_id,
    currentStreak: row.current_streak,
    longestStreak: row.longest_streak,





    lastActiveDate: row.last_active_date ?? null,
    updatedAt: row.updated_at,
  });
}

function rowToXpEvent(row) {
  return new XpEvent({
    id: row.id,
    userId: row.user_id,
    source: row.source,
    amount: row.amount,
    metadata: row.metadata || {},
    createdAt: row.created_at,
  });
}

function rowToBadge(row) {
  return new Badge({
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    icon: row.icon,
    threshold: row.threshold || {},
    createdAt: row.created_at,
  });
}

function rowToUserBadge(row) {
  return new UserBadge({
    userId: row.user_id,
    badgeId: row.badge_id,
    earnedAt: row.earned_at,
  });
}








let _schemaEnsured = false;


export function gamificationRepository(pool) {
  return {

    async ensureSchema() {
      if (_schemaEnsured) return;
      const sqlPath = path.join(__dirname, '..', '..', 'sql', 'gamification_schema.sql');
      let sql;
      try {
        sql = fs.readFileSync(sqlPath, 'utf8');
      } catch (e) {
        logger.error(`[gamification] could not read ${sqlPath}: ${e.message}`);
        throw e;
      }






      const isPool = pool && typeof pool.totalCount === 'number' && typeof pool.connect === 'function';
      let migrationClient;
      let releaseAfter = false;
      if (isPool) {
        migrationClient = pool;
      } else {
        const { pool: sharedPool } = await import('../config/database.js');
        migrationClient = await sharedPool.connect();
        releaseAfter = true;
      }

      try {
        await migrationClient.query(sql);
        _schemaEnsured = true;
        logger.info('[gamification] schema ensured');
      } finally {
        if (releaseAfter) {
          try { migrationClient.release(); } catch (_) {  }
        }
      }
    },



    async getUserXp(userId) {
      const { rows } = await pool.query(
        `SELECT user_id, total_xp, level, updated_at FROM user_xp WHERE user_id = $1`,
        [userId],
      );
      if (rows.length === 0) return null;
      return rowToUserXp(rows[0]);
    },

    async upsertUserXp(userId, totalXp, level) {
      const { rows } = await pool.query(
        `INSERT INTO user_xp (user_id, total_xp, level, updated_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (user_id)
           DO UPDATE SET total_xp = EXCLUDED.total_xp,
                         level = EXCLUDED.level,
                         updated_at = now()
         RETURNING user_id, total_xp, level, updated_at`,
        [userId, totalXp, level],
      );
      return rowToUserXp(rows[0]);
    },



    async getDailyStreak(userId) {
      const { rows } = await pool.query(
        `SELECT user_id, current_streak, longest_streak,
                last_active_date::text AS last_active_date, updated_at
         FROM daily_streaks WHERE user_id = $1`,
        [userId],
      );
      if (rows.length === 0) return null;
      return rowToStreak(rows[0]);
    },

    async upsertDailyStreak(userId, { current, longest, lastActiveDate }) {
      const { rows } = await pool.query(
        `INSERT INTO daily_streaks (user_id, current_streak, longest_streak, last_active_date, updated_at)
         VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (user_id)
           DO UPDATE SET current_streak = EXCLUDED.current_streak,
                         longest_streak = EXCLUDED.longest_streak,
                         last_active_date = EXCLUDED.last_active_date,
                         updated_at = now()
         RETURNING user_id, current_streak, longest_streak,
                   last_active_date::text AS last_active_date, updated_at`,
        [userId, current, longest, lastActiveDate],
      );
      return rowToStreak(rows[0]);
    },



    async insertXpEvent({ userId, source, amount, metadata = {} }) {
      const { rows } = await pool.query(
        `INSERT INTO xp_events (user_id, source, amount, metadata)
         VALUES ($1, $2, $3, $4::jsonb)
         RETURNING id, user_id, source, amount, metadata, created_at`,
        [userId, source, amount, JSON.stringify(metadata || {})],
      );
      return rowToXpEvent(rows[0]);
    },


    async sumXpToday(userId, source, today = new Date()) {
      const dayStr = today.toISOString().slice(0, 10);
      const { rows } = await pool.query(
        `SELECT COALESCE(SUM(amount), 0)::int AS total
         FROM xp_events
         WHERE user_id = $1 AND source = $2 AND created_at::date = $3::date`,
        [userId, source, dayStr],
      );
      return rows[0].total;
    },

    async countSourceEvents(userId, source) {
      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS total
         FROM xp_events WHERE user_id = $1 AND source = $2`,
        [userId, source],
      );
      return rows[0].total;
    },


    async listXpEvents(userId, { limit = 50, cursor = null } = {}) {
      const params = [userId];
      let cursorFilter = '';
      if (cursor) {
        const parsed = parseXpCursor(cursor);
        if (parsed && parsed.id) {
          params.push(parsed.createdAt, parsed.id);
          cursorFilter = `AND (created_at, id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`;
        } else if (parsed) {

          params.push(parsed.createdAt);
          cursorFilter = `AND created_at < $${params.length}::timestamptz`;
        }
      }
      params.push(limit + 1);
      const limitIdx = params.length;
      const { rows } = await pool.query(
        `SELECT id, user_id, source, amount, metadata,
                created_at,
                to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.USOF') AS created_at_text
         FROM xp_events
         WHERE user_id = $1 ${cursorFilter}
         ORDER BY created_at DESC, id DESC
         LIMIT $${limitIdx}`,
        params,
      );




      const hasMore = rows.length > limit;
      const pageRows = hasMore ? rows.slice(0, limit) : rows;
      const events = pageRows.map(rowToXpEvent);
      const nextCursor = hasMore
        ? buildXpCursor(pageRows[pageRows.length - 1].created_at_text, pageRows[pageRows.length - 1].id)
        : null;
      return { events, nextCursor };
    },



    async getAllBadges() {
      const { rows } = await pool.query(
        `SELECT id, code, name, description, icon, threshold, created_at
         FROM badges ORDER BY name ASC`,
      );
      return rows.map(rowToBadge);
    },

    async getEarnedBadgeIds(userId) {
      const { rows } = await pool.query(
        `SELECT badge_id, earned_at FROM user_badges WHERE user_id = $1`,
        [userId],
      );
      return rows.map((r) => ({
        badgeId: r.badge_id,
        earnedAt: r.earned_at,
      }));
    },

    async getBadgesWithStatus(userId) {
      const all = await this.getAllBadges();
      const earned = await this.getEarnedBadgeIds(userId);
      const earnedMap = new Map(earned.map((e) => [e.badgeId, e.earnedAt]));
      return all.map((b) => {
        const earned = earnedMap.get(b.id);
        const earnedAt = earned instanceof Date
          ? earned.toISOString()
          : earned
            ? new Date(earned).toISOString()
            : null;
        return {
          ...b.toDict(),
          earned: earnedMap.has(b.id),
          earnedAt,
        };
      });
    },


    async insertUserBadge(userId, badgeId) {
      const { rows } = await pool.query(
        `INSERT INTO user_badges (user_id, badge_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING
         RETURNING earned_at`,
        [userId, badgeId],
      );
      return rows[0]?.earned_at ?? new Date();
    },
  };
}






export function buildXpCursor(createdAt, id) {
  return `${createdAt}|${id}`;
}


export function parseXpCursor(cursor) {
  if (typeof cursor !== 'string' || cursor.length === 0) return null;
  const sep = cursor.lastIndexOf('|');
  if (sep === -1) {
    if (!isValidTimestamp(cursor)) return null;
    return { createdAt: cursor, id: null };
  }
  const iso = cursor.slice(0, sep);
  const id = cursor.slice(sep + 1);
  if (!isValidTimestamp(iso)) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return null;
  }
  return { createdAt: iso, id };
}


export function isValidTimestamp(value) {
  if (typeof value !== 'string' || value.length === 0) return false;
  const m = TIMESTAMP_RE.exec(value);
  if (!m) return false;

  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > daysInMonth(year, month)) return false;


  if (m[1]) {
    const hour = Number(value.slice(11, 13));
    const minute = Number(value.slice(14, 16));
    const second = Number(value.slice(17, 19));
    if (hour > 23 || minute > 59 || second > 60) return false;
  }
  return true;
}


function daysInMonth(year, month) {
  const lengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month === 2 && ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0)) {
    return 29;
  }
  return lengths[month - 1];
}


export const TIMESTAMP_RE =
  /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}(:?\d{2})?)?$/;

function toIso(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}
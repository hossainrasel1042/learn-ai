

import { logger } from '../utils/logger.js';
import { settings } from '../config/index.js';
import {
  gamificationRepository,
  computeLevel,
  computeStreakUpdate,
} from '../models/gamification.js';
import {
  AwardXpResultClass,
  BadgeWithStatusClass,
  GamificationStatsClass,
} from './schemas.js';





export class GamificationAgent {

  async ensureSchema(pool) {
    const repo = gamificationRepository(pool);
    await repo.ensureSchema();
  }


  async awardXp({ pool, userId, source, amount, metadata = {} }) {
    if (!userId) {
      return new AwardXpResultClass({ awarded: false, reason: 'no_user' });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return new AwardXpResultClass({ awarded: false, reason: 'zero_amount' });
    }




    const isTransactionalClient = typeof pool?.release === 'function';
    const workClient = isTransactionalClient
      ? pool
      : await pool.connect();
    let ownConnection = !isTransactionalClient;

    try {
      if (ownConnection) {
        await workClient.query('BEGIN');
      }

      const repo = gamificationRepository(workClient);


      await repo.ensureSchema();







      const cap = dailyCapFor(source);
      if (cap !== null) {
        const used = await repo.sumXpToday(userId, source);
        if (used + amount > cap) {
          logger.info(
            `[gamification] daily cap reached for user=${userId} source=${source} (used=${used}/${cap})`,
          );
          const result = new AwardXpResultClass({
            awarded: false,
            reason: 'daily_cap',
            totalXp: (await repo.getUserXp(userId))?.totalXp ?? 0,
          });



          if (ownConnection) await workClient.query('COMMIT');
          return result;
        }
      }


      await repo.insertXpEvent({ userId, source, amount, metadata });


      const prevXp = await repo.getUserXp(userId);
      const prevLevel = prevXp?.level ?? 1;
      const prevTotal = prevXp?.totalXp ?? 0;
      const newTotal = prevTotal + amount;
      const newLevel = computeLevel(newTotal);
      const updated = await repo.upsertUserXp(userId, newTotal, newLevel);


      const prevStreak = await repo.getDailyStreak(userId);
      const streakUpdate = computeStreakUpdate(
        prevStreak?.currentStreak ?? 0,
        prevStreak?.lastActiveDate ?? null,
        new Date(),
        settings.STREAK_GRACE_HOURS,
      );
      await repo.upsertDailyStreak(userId, {
        current: streakUpdate.current,
        longest: Math.max(prevStreak?.longestStreak ?? 0, streakUpdate.longest),
        lastActiveDate: streakUpdate.lastActiveDate,
      });


      const newlyEarned = await this.evaluateBadges(workClient, userId);

      const leveledUp = newLevel > prevLevel;
      if (leveledUp) {
        logger.info(
          `[gamification] user=${userId} leveled up: ${prevLevel} → ${newLevel} (${newTotal} XP)`,
        );
      }
      if (newlyEarned.length > 0) {
        logger.info(
          `[gamification] user=${userId} earned ${newlyEarned.length} badge(s): ${newlyEarned.map((b) => b.code).join(', ')}`,
        );
      }

      const result = new AwardXpResultClass({
        awarded: true,
        leveledUp,
        newLevel: updated.level,
        totalXp: updated.totalXp,





        newlyEarned: newlyEarned.map((b) =>
          new BadgeWithStatusClass({
            ...b,
            earned: true,
            earnedAt: b.earnedAt,
          }),
        ),
      });

      if (ownConnection) await workClient.query('COMMIT');
      return result;
    } catch (e) {
      if (ownConnection) {
        try {
          await workClient.query('ROLLBACK');
        } catch (_) {

        }
      }
      throw e;
    } finally {
      if (ownConnection) {
        workClient.release();
      }
    }
  }


  async evaluateBadges(pool, userId) {
    const repo = gamificationRepository(pool);
    const all = await repo.getAllBadges();
    const earnedIds = new Set(
      (await repo.getEarnedBadgeIds(userId)).map((e) => e.badgeId),
    );

    const newlyEarned = [];
    for (const badge of all) {
      if (earnedIds.has(badge.id)) continue;
      const satisfied = await this._evaluateBadge(pool, userId, badge);
      if (satisfied) {
        const earnedAt = await repo.insertUserBadge(userId, badge.id);
        newlyEarned.push({ ...badge, earnedAt });
      }
    }
    return newlyEarned;
  }


  async _evaluateBadge(pool, userId, badge) {
    const repo = gamificationRepository(pool);
    const kind = badge.threshold?.kind;
    const value = Number(badge.threshold?.value ?? 0);

    if (!kind) return false;

    switch (kind) {
      case 'xp_total': {
        const xp = await repo.getUserXp(userId);
        return (xp?.totalXp ?? 0) >= value;
      }
      case 'level': {
        const xp = await repo.getUserXp(userId);
        return (xp?.level ?? 1) >= value;
      }
      case 'streak': {
        const streak = await repo.getDailyStreak(userId);
        return (streak?.currentStreak ?? 0) >= value;
      }
      case 'srs_count': {
        const count = await repo.countSourceEvents(userId, 'srs_review');
        return count >= value;
      }
      case 'mindmap_count': {
        const count = await repo.countSourceEvents(userId, 'mindmap_generated');
        return count >= value;
      }
      case 'quiz_finished_avg': {

        const finishedCount = await repo.countSourceEvents(userId, 'quiz_finished');
        if (finishedCount < value) return false;
        const { rows } = await pool.query(
          `SELECT
             COUNT(*)::int       AS total,
             COALESCE(AVG((correct_count::float / GREATEST(total, 1))), 0)::float AS avg_pct
           FROM quiz_attempts
           WHERE user_id = $1 AND finished_at IS NOT NULL`,
          [userId],
        );
        const total = rows[0]?.total ?? 0;
        const avgPct = rows[0]?.avg_pct ?? 0;
        return total >= value && avgPct >= 0.8;
      }
      default:
        return false;
    }
  }


  async getStats(pool, userId) {
    const repo = gamificationRepository(pool);
    await repo.ensureSchema();

    const xp = await repo.getUserXp(userId);
    const streak = await repo.getDailyStreak(userId);

    const totalXp = xp?.totalXp ?? 0;
    const level = xp?.level ?? 1;
    const currentStreak = streak?.currentStreak ?? 0;
    const longestStreak = streak?.longestStreak ?? 0;


    const lastActiveDate = streak?.lastActiveDate
      ? typeof streak.lastActiveDate === 'string'
        ? streak.lastActiveDate.slice(0, 10)
        : streak.lastActiveDate.toISOString().slice(0, 10)
      : null;


    const xpForNext = level * level * 100;
    const xpToNextLevel = Math.max(0, xpForNext - totalXp);
    const base = (level - 1) * (level - 1) * 100;
    const span = Math.max(1, xpForNext - base);
    const pct = Math.min(100, Math.max(0, ((totalXp - base) / span) * 100));

    return new GamificationStatsClass({
      totalXp,
      level,
      xpToNextLevel,
      progressPct: Math.round(pct * 100) / 100,
      currentStreak,
      longestStreak,
      lastActiveDate,
    });
  }


  async getXpHistory(pool, userId, { limit = 50, cursor = null } = {}) {
    const repo = gamificationRepository(pool);
    await repo.ensureSchema();
    const { events, nextCursor } = await repo.listXpEvents(userId, {
      limit,
      cursor,
    });
    return { events, nextCursor };
  }


  async getBadges(pool, userId) {
    const repo = gamificationRepository(pool);
    await repo.ensureSchema();
    return repo.getBadgesWithStatus(userId);
  }
}






export function dailyCapFor(source) {
  if (source === 'chat_message') return settings.XP_CHAT_DAILY_CAP;
  const key = `XP_DAILY_CAP_${source.toUpperCase()}`;
  const value = settings[key];
  return Number.isFinite(value) && value > 0 ? value : null;
}





let _gamificationAgent = null;


export function getGamificationAgent() {
  if (_gamificationAgent === null) {
    _gamificationAgent = new GamificationAgent();
  }
  return _gamificationAgent;
}
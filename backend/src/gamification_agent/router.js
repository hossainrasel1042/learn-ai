

import express from 'express';

import { getCurrentUser } from '../middlewares/auth.js';
import { logger } from '../utils/logger.js';
import { pool } from '../config/database.js';
import { settings } from '../config/index.js';
import { getGamificationAgent } from './agent.js';
import {
  AwardXpRequest,
  XpHistoryQuery,
  AwardXpResultClass,
  GamificationStatsClass,
  XpEventClass,
  BadgeWithStatusClass,
} from './schemas.js';

const router = express.Router();





function _userId(req) {
  const u = req.user || {};
  const id = u.id || u.user_id || u.sub;
  if (!id) {
    const err = new Error('Not authenticated');
    err.status = 401;
    throw err;
  }
  return id;
}

function _sendError(res, status, detail) {
  return res.status(status).json({ detail });
}


function xpAmountFor(source) {
  const key = `XP_${source.toUpperCase()}`;
  const configured = settings[key];
  if (Number.isFinite(configured) && configured > 0) return configured;
  const fallback = DEFAULT_XP_AMOUNTS[source];
  return fallback === undefined ? null : fallback;
}

const DEFAULT_XP_AMOUNTS = {
  srs_review: 10,
  quiz_correct: 5,
  quiz_finished: 20,
  mindmap_generated: 25,
  chat_message: 2,
  material_viewed: 1,
};






router.post('/award', getCurrentUser, async (req, res, next) => {
  try {
    const parsed = AwardXpRequest.safeParse(req.body || {});
    if (!parsed.success) {
      return _sendError(res, 400, parsed.error.message);
    }
    const userId = _userId(req);
    const source = parsed.data.source;
    const amount = xpAmountFor(source);
    if (amount === null) {
      return _sendError(res, 400, `no XP amount configured for source "${source}"`);
    }
    const agent = getGamificationAgent();
    const result = await agent.awardXp({
      pool: req.db || pool,
      userId,
      source,
      amount,
      metadata: parsed.data.metadata || {},
    });
    const out = result instanceof AwardXpResultClass ? result.toDict() : result;



    if (req.dbCommit) await req.dbCommit();
    return res.json(out);
  } catch (e) {
    if (req.dbRollback) { try { await req.dbRollback(); } catch (_) {} }
    logger.error(`gamification award error: ${e.message || e}`);
    return _sendError(res, e.status || 500, e.message || String(e));
  }
});


router.get('/stats', getCurrentUser, async (req, res, next) => {
  try {
    const userId = _userId(req);
    const agent = getGamificationAgent();
    const stats = await agent.getStats(req.db || pool, userId);
    const out = stats instanceof GamificationStatsClass ? stats.toDict() : stats;
    return res.json(out);
  } catch (e) {
    logger.error(`gamification stats error: ${e.message || e}`);
    return _sendError(res, e.status || 500, e.message || String(e));
  }
});


router.get('/xp', getCurrentUser, async (req, res, next) => {
  try {
    const parsed = XpHistoryQuery.safeParse(req.query);
    if (!parsed.success) {
      return _sendError(res, 400, parsed.error.message);
    }
    const userId = _userId(req);
    const agent = getGamificationAgent();
    const { events, nextCursor } = await agent.getXpHistory(
      req.db || pool,
      userId,
      { limit: parsed.data.limit, cursor: parsed.data.cursor || null },
    );
    return res.json({
      events: events.map((e) =>
        e instanceof XpEventClass ? e.toDict() : e,
      ),
      nextCursor,
    });
  } catch (e) {
    logger.error(`gamification xp history error: ${e.message || e}`);
    return _sendError(res, e.status || 500, e.message || String(e));
  }
});


router.get('/badges', getCurrentUser, async (req, res, next) => {
  try {
    const userId = _userId(req);
    const agent = getGamificationAgent();
    const badges = await agent.getBadges(req.db || pool, userId);
    const out = badges.map((b) =>
      b instanceof BadgeWithStatusClass
        ? b.toDict()
        : new BadgeWithStatusClass(b).toDict(),
    );
    return res.json({ badges: out });
  } catch (e) {
    logger.error(`gamification badges error: ${e.message || e}`);
    return _sendError(res, e.status || 500, e.message || String(e));
  }
});


router.get('/health', async (_req, res, next) => {
  try {
    res.json({ status: 'ok', service: 'gamification' });
  } catch (e) {
    next(e);
  }
});

export default router;
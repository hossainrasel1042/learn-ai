

import { getGamificationAgent } from './agent.js';
import { pool as defaultPool } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { settings } from '../config/index.js';


function _userId(req) {
  if (!req || !req.user) return null;
  const u = req.user;
  return u.id || u.user_id || u.sub || null;
}


function _client(req) {
  return (req && req.db) || defaultPool;
}


export async function awardXpSafely(req, source, options = {}) {
  try {
    const userId = _userId(req);
    if (!userId) return null;

    const amountKey = `XP_${source.toUpperCase()}`;
    const amount =
      options.amount ?? settings[amountKey] ?? defaultAmountFor(source);

    if (!Number.isFinite(amount) || amount <= 0) {
      return null;
    }

    const agent = getGamificationAgent();
    return await agent.awardXp({
      pool: _client(req),
      userId,
      source,
      amount,
      metadata: options.metadata || {},
    });
  } catch (e) {
    logger.warn(`[gamification] awardXpSafely(${source}) failed: ${e.message || e}`);
    return null;
  }
}


export function awardXpFire(req, source, options = {}) {
  void awardXpSafely(req, source, options).catch(() => {});
}


function defaultAmountFor(source) {
  switch (source) {
    case 'srs_review':         return 10;
    case 'quiz_correct':       return 5;
    case 'quiz_finished':      return 20;
    case 'mindmap_generated':  return 25;
    case 'chat_message':       return 2;
    case 'material_viewed':    return 1;
    default:                   return 0;
  }
}
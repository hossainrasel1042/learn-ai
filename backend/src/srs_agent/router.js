

import express from 'express';

import { getCurrentUser } from '../middlewares/auth.js';
import { logger } from '../utils/logger.js';
import { pool } from '../config/database.js';
import { srsRepository } from '../models/srs.js';
import { getSrsAgent } from './agent.js';
import { awardXpSafely } from '../gamification_agent/hook.js';
import {
  CreateDeckRequest,
  GenerateCardsRequest,
  ReviewRequest,
  DeckIdParam,
  CardIdParam,
  PaginationQuery,
  DueQuery,
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

function _repo(req) {



  const client = req.db || pool;
  return srsRepository(client);
}

function _sendError(res, status, detail) {
  return res.status(status).json({ detail });
}


async function _commit(req) {
  if (req.dbCommit) await req.dbCommit();
}


async function _rollback(req) {
  if (req.dbRollback) {
    try { await req.dbRollback(); } catch (_) {  }
  }
}

function _shapeDeck(d) {
  return d ? d.toDict() : d;
}

function _shapeCard(c) {
  return c ? c.toDict() : c;
}

function _shapeReview(r) {
  return r ? r.toDict() : r;
}






router.post('/decks', getCurrentUser, async (req, res, next) => {
  try {
    const parsed = CreateDeckRequest.safeParse(req.body || {});
    if (!parsed.success) {
      return _sendError(res, 400, parsed.error.message);
    }
    const userId = _userId(req);



    const { userId: _ignored, ...safeBody } = parsed.data || {};
    const deck = await _repo(req).createDeck({ userId, ...safeBody });
    await _commit(req);
    return res.status(201).json({ deck: _shapeDeck(deck) });
  } catch (e) {
    await _rollback(req);
    logger.error(`SRS createDeck error: ${e.message || e}`);
    return _sendError(res, e.status || 500, e.message || String(e));
  }
});


router.get('/decks', getCurrentUser, async (req, res, next) => {
  try {
    const parsed = PaginationQuery.safeParse(req.query);
    if (!parsed.success) {
      return _sendError(res, 400, parsed.error.message);
    }
    const userId = _userId(req);
    const { page, pageSize } = parsed.data;
    const { items, total } = await _repo(req).listDecks(userId, { page, pageSize });
    return res.json({
      decks: items.map(_shapeDeck),
      total,
      page,
      pageSize,
    });
  } catch (e) {
    return _sendError(res, e.status || 500, e.message || String(e));
  }
});


router.get('/decks/:deckId', getCurrentUser, async (req, res, next) => {
  try {
    const paramParsed = DeckIdParam.safeParse(req.params);
    if (!paramParsed.success) {
      return _sendError(res, 400, paramParsed.error.message);
    }
    const q = PaginationQuery.safeParse(req.query);
    if (!q.success) {
      return _sendError(res, 400, q.error.message);
    }
    const userId = _userId(req);
    const { deckId } = paramParsed.data;
    const repo = _repo(req);
    const deck = await repo.getDeck(deckId, userId);
    if (!deck) return _sendError(res, 404, 'Deck not found');
    const { page, pageSize } = q.data;
    const { items, total } = await repo.listCards(deckId, userId, { page, pageSize });
    const stats = await repo.getDeckStats(deckId, userId);
    return res.json({
      deck: _shapeDeck(deck),
      cards: items.map(_shapeCard),
      cardsTotal: total,
      stats,
      page,
      pageSize,
    });
  } catch (e) {
    return _sendError(res, e.status || 500, e.message || String(e));
  }
});


router.patch('/decks/:deckId', getCurrentUser, async (req, res, next) => {
  try {
    const paramParsed = DeckIdParam.safeParse(req.params);
    if (!paramParsed.success) {
      return _sendError(res, 400, paramParsed.error.message);
    }
    const userId = _userId(req);
    const deck = await _repo(req).updateDeck(paramParsed.data.deckId, userId, {
      title: req.body?.title,
      description: req.body?.description,
    });
    if (!deck) return _sendError(res, 404, 'Deck not found');
    await _commit(req);
    return res.json({ deck: _shapeDeck(deck) });
  } catch (e) {
    await _rollback(req);
    return _sendError(res, e.status || 500, e.message || String(e));
  }
});


router.delete('/decks/:deckId', getCurrentUser, async (req, res, next) => {
  try {
    const paramParsed = DeckIdParam.safeParse(req.params);
    if (!paramParsed.success) {
      return _sendError(res, 400, paramParsed.error.message);
    }
    const userId = _userId(req);
    const ok = await _repo(req).deleteDeck(paramParsed.data.deckId, userId);
    if (!ok) return _sendError(res, 404, 'Deck not found');
    await _commit(req);
    return res.status(204).end();
  } catch (e) {
    await _rollback(req);
    return _sendError(res, e.status || 500, e.message || String(e));
  }
});


router.post('/decks/:deckId/generate', getCurrentUser, async (req, res, next) => {
  try {
    const paramParsed = DeckIdParam.safeParse(req.params);
    if (!paramParsed.success) {
      return _sendError(res, 400, paramParsed.error.message);
    }
    const bodyParsed = GenerateCardsRequest.safeParse(req.body || {});
    if (!bodyParsed.success) {
      return _sendError(res, 400, bodyParsed.error.message);
    }
    const userId = _userId(req);


    const ownerRes = await (req.db || pool).query(
      `SELECT user_id FROM flashcard_decks WHERE id = $1`,
      [paramParsed.data.deckId],
    );
    if (ownerRes.rows.length === 0) {
      return _sendError(res, 404, 'Deck not found');
    }
    if (ownerRes.rows[0].user_id !== userId) {
      return _sendError(res, 403, 'Forbidden');
    }
    const agent = getSrsAgent();
    const result = await agent.generateCards({
      userId,
      deckId: paramParsed.data.deckId,
      pool: req.db || pool,
      ...bodyParsed.data,
    });
    await _commit(req);
    return res.json({
      inserted: result.inserted,
      cards: result.cards.map(_shapeCard),
      generatedBy: result.generatedBy,
    });
  } catch (e) {
    await _rollback(req);
    logger.error(`SRS generateCards error: ${e.message || e}`);
    return _sendError(res, e.status || 500, e.message || String(e));
  }
});


router.get('/decks/:deckId/stats', getCurrentUser, async (req, res, next) => {
  try {
    const paramParsed = DeckIdParam.safeParse(req.params);
    if (!paramParsed.success) {
      return _sendError(res, 400, paramParsed.error.message);
    }
    const userId = _userId(req);
    const stats = await _repo(req).getDeckStats(paramParsed.data.deckId, userId);
    return res.json(stats);
  } catch (e) {
    return _sendError(res, e.status || 500, e.message || String(e));
  }
});






router.get('/due', getCurrentUser, async (req, res, next) => {
  try {
    const parsed = DueQuery.safeParse(req.query);
    if (!parsed.success) {
      return _sendError(res, 400, parsed.error.message);
    }
    const userId = _userId(req);
    const { deckId, limit } = parsed.data;
    const cards = await _repo(req).getDueCards(userId, { deckId, limit });
    return res.json({
      cards: cards.map(_shapeCard),
      total: cards.length,
    });
  } catch (e) {
    return _sendError(res, e.status || 500, e.message || String(e));
  }
});


router.post('/review', getCurrentUser, async (req, res, next) => {
  try {
    const parsed = ReviewRequest.safeParse(req.body || {});
    if (!parsed.success) {
      return _sendError(res, 400, parsed.error.message);
    }
    const userId = _userId(req);
    const agent = getSrsAgent();
    const { card, review } = await agent.review({
      userId,
      cardId: parsed.data.cardId,
      rating: parsed.data.rating,
      pool: req.db || pool,
    });

    await awardXpSafely(req, 'srs_review', {
      metadata: { cardId: parsed.data.cardId, rating: parsed.data.rating },
    });
    await _commit(req);
    return res.json({
      card: _shapeCard(card),
      review: _shapeReview(review),
    });
  } catch (e) {
    await _rollback(req);
    logger.error(`SRS review error: ${e.message || e}`);
    return _sendError(res, e.status || 500, e.message || String(e));
  }
});


router.get('/cards/:cardId', getCurrentUser, async (req, res, next) => {
  try {
    const paramParsed = CardIdParam.safeParse(req.params);
    if (!paramParsed.success) {
      return _sendError(res, 400, paramParsed.error.message);
    }
    const userId = _userId(req);
    const card = await _repo(req).getCard(paramParsed.data.cardId, userId);
    if (!card) return _sendError(res, 404, 'Card not found');
    return res.json({ card: _shapeCard(card) });
  } catch (e) {
    return _sendError(res, e.status || 500, e.message || String(e));
  }
});


router.delete('/cards/:cardId', getCurrentUser, async (req, res, next) => {
  try {
    const paramParsed = CardIdParam.safeParse(req.params);
    if (!paramParsed.success) {
      return _sendError(res, 400, paramParsed.error.message);
    }
    const userId = _userId(req);
    const ok = await _repo(req).deleteCard(paramParsed.data.cardId, userId);
    if (!ok) return _sendError(res, 404, 'Card not found');



    await _commit(req);
    return res.status(204).end();
  } catch (e) {
    await _rollback(req);
    return _sendError(res, e.status || 500, e.message || String(e));
  }
});






router.get('/health', async (_req, res, next) => {
  try {
    res.json({ status: 'ok', service: 'srs' });
  } catch (e) {
    next(e);
  }
});

export default router;
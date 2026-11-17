

import express from 'express';

import { getCurrentUser } from '../middlewares/auth.js';
import { logger } from '../utils/logger.js';
import { pool } from '../config/database.js';
import { mindmapRepository } from '../models/mindmap.js';
import { getMindMapAgent } from './agent.js';
import { awardXpSafely } from '../gamification_agent/hook.js';
import {
  CreateMindMapRequest,
  GenerateMindMapRequest,
  MindMapIdParam,
  PaginationQuery,
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
  return mindmapRepository(client);
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

function _shapeMap(m) {
  return m ? m.toDict() : m;
}






router.get('/health', async (_req, res, next) => {
  try {
    res.json({ status: 'ok', service: 'mindmaps' });
  } catch (e) {
    next(e);
  }
});






router.post('/', getCurrentUser, async (req, res, next) => {
  try {
    const parsed = CreateMindMapRequest.safeParse(req.body || {});
    if (!parsed.success) {
      return _sendError(res, 400, parsed.error.message);
    }
    const userId = _userId(req);
    const { title, description, sourceType, sourceId } = parsed.data;


    const mindMap = await _repo(req).createMindMap({
      userId,
      title,
      description: description ?? null,
      sourceType: sourceType ?? null,
      sourceId: sourceId ?? null,
      rootConcept: title,
    });
    await _commit(req);
    return res.status(201).json({ mindMap: _shapeMap(mindMap) });
  } catch (e) {
    await _rollback(req);
    logger.error(`MindMap createMindMap error: ${e.message || e}`);
    return _sendError(res, e.status || 500, e.message || String(e));
  }
});


router.get('/', getCurrentUser, async (req, res, next) => {
  try {
    const parsed = PaginationQuery.safeParse(req.query);
    if (!parsed.success) {
      return _sendError(res, 400, parsed.error.message);
    }
    const userId = _userId(req);
    const { page, pageSize } = parsed.data;
    const { items, total } = await _repo(req).listMindMaps(userId, { page, pageSize });
    return res.json({
      mindMaps: items.map(_shapeMap),
      total,
      page,
      pageSize,
    });
  } catch (e) {
    return _sendError(res, e.status || 500, e.message || String(e));
  }
});


router.get('/:mindMapId', getCurrentUser, async (req, res, next) => {
  try {
    const paramParsed = MindMapIdParam.safeParse(req.params);
    if (!paramParsed.success) {
      return _sendError(res, 400, paramParsed.error.message);
    }
    const userId = _userId(req);
    const mindMap = await _repo(req).getMindMap(paramParsed.data.mindMapId, userId);
    if (!mindMap) return _sendError(res, 404, 'Mind map not found');
    return res.json({ mindMap: _shapeMap(mindMap) });
  } catch (e) {
    return _sendError(res, e.status || 500, e.message || String(e));
  }
});


router.delete('/:mindMapId', getCurrentUser, async (req, res, next) => {
  try {
    const paramParsed = MindMapIdParam.safeParse(req.params);
    if (!paramParsed.success) {
      return _sendError(res, 400, paramParsed.error.message);
    }
    const userId = _userId(req);
    const ok = await _repo(req).deleteMindMap(paramParsed.data.mindMapId, userId);
    if (!ok) return _sendError(res, 404, 'Mind map not found');
    await _commit(req);
    return res.status(204).end();
  } catch (e) {
    await _rollback(req);
    return _sendError(res, e.status || 500, e.message || String(e));
  }
});


router.post('/:mindMapId/generate', getCurrentUser, async (req, res, next) => {
  try {
    const paramParsed = MindMapIdParam.safeParse(req.params);
    if (!paramParsed.success) {
      return _sendError(res, 400, paramParsed.error.message);
    }
    const bodyParsed = GenerateMindMapRequest.safeParse(req.body || {});
    if (!bodyParsed.success) {
      return _sendError(res, 400, bodyParsed.error.message);
    }
    const userId = _userId(req);


    const ownerRes = await (req.db || pool).query(
      `SELECT user_id FROM mind_maps WHERE id = $1`,
      [paramParsed.data.mindMapId],
    );
    if (ownerRes.rows.length === 0) {
      return _sendError(res, 404, 'Mind map not found');
    }
    if (ownerRes.rows[0].user_id !== userId) {
      return _sendError(res, 403, 'Forbidden');
    }
    const agent = getMindMapAgent();
    const result = await agent.generateMindMap({
      userId,
      mindMapId: paramParsed.data.mindMapId,
      pool: req.db || pool,
      ...bodyParsed.data,
    });

    await awardXpSafely(req, 'mindmap_generated', {
      metadata: {
        mindMapId: paramParsed.data.mindMapId,
        nodeCount: result.nodeCount,
      },
    });
    await _commit(req);
    return res.json({
      inserted: result.inserted,
      nodeCount: result.nodeCount,
      graph: result.graph,
      mindMap: _shapeMap(result.mindMap),
      generatedBy: result.generatedBy,
    });
  } catch (e) {
    await _rollback(req);
    logger.error(`MindMap generateMindMap error: ${e.message || e}`);
    return _sendError(res, e.status || 500, e.message || String(e));
  }
});

export default router;


import express from 'express';

import { CommunityService } from './service.js';
import {
  PostCreate,
  PostUpdate,
  PostListResponse,
  PostDetailResponse,
  PostResponse,
  CommentCreate,
  CommentResponse,
  PostCategory,
  UserPresenceList,
} from './schemas.js';
import { logger } from '../utils/logger.js';
import { getCurrentUser, getCurrentUserOptional } from '../middlewares/auth.js';
import { pool } from '../config/database.js';
import { CommunityBot } from './bot.js';

const router = express.Router();


function _getUserId(req) {
  const u = req.user || {};
  const id = u.id || u.user_id || u.sub;
  if (id) return id;
  const err = new Error('Not authenticated');
  err.status = 401;
  throw err;
}

function _service(req) {


  return new CommunityService(req.db);
}


async function _commit(req) {
  if (req.dbCommit) await req.dbCommit();
}


async function _rollback(req) {
  if (req.dbRollback) {
    try { await req.dbRollback(); } catch (_) {  }
  }
}


function _triggerBotReply(kind, payload) {



  void (async () => {
    try {
      const bot = new CommunityBot(pool);
      if (kind === 'post') {
        await bot.generatePostReply(payload);
      } else {
        await bot.generateReply(payload);
      }
      logger.info(`Bot ${kind} reply generated for ${payload.postId}`);
    } catch (e) {
      logger.error(`Error generating bot ${kind} reply: ${e.message || e}`);
    }
  })();
}


function _parseCategory(raw) {
  if (raw === undefined || raw === null || raw === '') return null;

  const upper = String(raw).toUpperCase();
  if (upper === 'THEORY' || upper === 'LAB' || upper === 'GENERAL') {
    return PostCategory[upper];
  }
  const lower = String(raw).toLowerCase();
  if (lower === 'theory' || lower === 'lab' || lower === 'general') {
    return lower;
  }
  return null;
}

function _parseBoolean(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const v = String(raw).toLowerCase();
  if (v === 'true' || v === '1') return true;
  if (v === 'false' || v === '0') return false;
  return null;
}

function _parseInt(raw, fallback) {
  if (raw === undefined || raw === null || raw === '') return fallback;
  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? fallback : n;
}






router.get('/posts', async (req, res, next) => {
  try {
    const category = _parseCategory(req.query.category);
    const isResolved = _parseBoolean(req.query.isResolved);
    const page = _parseInt(req.query.page, 1);
    const pageSize = _parseInt(req.query.pageSize, 20);

    const result = await _service(req).listPosts({
      category: category || null,
      courseTopic: req.query.courseTopic || null,
      isResolved: typeof isResolved === 'boolean' ? isResolved : null,
      search: req.query.search || null,
      page,
      pageSize,
    });
    return res.json(result.toDict());
  } catch (e) {
    next(e);
  }
});


router.post('/posts', getCurrentUser, async (req, res, next) => {
  try {
    const userId = _getUserId(req);
    const parsed = PostCreate.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.message });
    }
    const result = await _service(req).createPost({
      userId,
      postData: parsed.data,
    });
    await _commit(req);


    _triggerBotReply('post', {
      postId: result.id,
      title: parsed.data.title,
      content: parsed.data.content,
      category: parsed.data.category || 'general',
      courseTopic: parsed.data.courseTopic || null,
    });
    return res.status(201).json(result.toDict());
  } catch (e) {
    await _rollback(req);
    logger.error(`Error creating post: ${e.message || e}`);
    return res.status(500).json({ detail: e.message || String(e) });
  }
});


router.get('/posts/:postId', getCurrentUserOptional, async (req, res, next) => {
  try {
    const wantsTrack = String(req.query.track_view || '').toLowerCase() === 'true';



    const authUserId = req.user && (req.user.id || req.user.user_id || req.user.sub);
    const trackView = wantsTrack && Boolean(authUserId);

    const result = await _service(req).getPostWithComments(req.params.postId, {
      trackView,
    });
    if (!result) return res.status(404).json({ detail: 'Post not found' });



    if (trackView) await _commit(req);
    return res.json(result.toDict());
  } catch (e) {
    await _rollback(req);
    next(e);
  }
});


router.patch('/posts/:postId', getCurrentUser, async (req, res, next) => {
  try {
    const userId = _getUserId(req);
    const parsed = PostUpdate.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.message });
    }
    const result = await _service(req).updatePost(
      req.params.postId,
      userId,
      parsed.data,
    );
    if (!result) {
      return res
        .status(404)
        .json({ detail: 'Post not found or not authorized' });
    }
    await _commit(req);
    return res.json(result.toDict());
  } catch (e) {
    await _rollback(req);
    next(e);
  }
});


router.delete('/posts/:postId', getCurrentUser, async (req, res, next) => {
  try {
    const userId = _getUserId(req);
    const ok = await _service(req).deletePost(req.params.postId, userId);
    if (!ok) {
      return res
        .status(404)
        .json({ detail: 'Post not found or not authorized' });
    }
    await _commit(req);
    return res.status(204).end();
  } catch (e) {
    await _rollback(req);
    next(e);
  }
});


router.patch('/posts/:postId/resolve', getCurrentUser, async (req, res, next) => {
  try {
    const userId = _getUserId(req);
    const result = await _service(req).toggleResolved(
      req.params.postId,
      userId,
    );
    if (!result) {
      return res
        .status(404)
        .json({ detail: 'Post not found or not authorized' });
    }
    await _commit(req);
    return res.json(result.toDict());
  } catch (e) {
    await _rollback(req);
    next(e);
  }
});






router.post('/posts/:postId/comments', getCurrentUser, async (req, res, next) => {
  try {
    const userId = _getUserId(req);
    const parsed = CommentCreate.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.message });
    }
    const { comment, botReply } = await _service(req).createComment({
      postId: req.params.postId,
      userId,
      commentData: parsed.data,
    });
    await _commit(req);


    if (botReply) _triggerBotReply('comment', botReply);
    return res.status(201).json(comment.toDict());
  } catch (e) {
    await _rollback(req);
    if (e instanceof TypeError || (e.message && /invalid/i.test(e.message))) {
      return res.status(400).json({ detail: e.message || String(e) });
    }
    logger.error(`Error creating comment: ${e.message || e}`);
    return res.status(500).json({ detail: e.message || String(e) });
  }
});


router.delete('/comments/:commentId', getCurrentUser, async (req, res, next) => {
  try {
    const userId = _getUserId(req);
    const ok = await _service(req).deleteComment(
      req.params.commentId,
      userId,
    );
    if (!ok) {
      return res
        .status(404)
        .json({ detail: 'Comment not found or not authorized' });
    }
    await _commit(req);
    return res.status(204).end();
  } catch (e) {
    await _rollback(req);
    next(e);
  }
});






router.post('/presence/heartbeat', getCurrentUser, async (req, res, next) => {
  try {
    const userId = _getUserId(req);
    const result = await _service(req).updatePresence(userId);
    await _commit(req);
    return res.json(result.toDict());
  } catch (e) {
    await _rollback(req);
    next(e);
  }
});


router.get('/presence/users', getCurrentUser, async (req, res, next) => {
  try {
    const authUserId =
      req.user && (req.user.id || req.user.user_id || req.user.sub);
    if (!authUserId) {
      return res.status(401).json({ detail: 'Not authenticated' });
    }

    const statuses = await _service(req).getUsersPresence([authUserId]);
    const wrapped = new UserPresenceList({ users: statuses });
    return res.json(wrapped.toDict());
  } catch (e) {
    next(e);
  }
});

export default router;


import express from 'express';

import { getCurrentUser } from '../middlewares/auth.js';
import { logger } from '../utils/logger.js';
import { pool } from '../config/database.js';
import * as usersService from './service.js';
import { UpdateProfileRequest, DeleteProfileRequest } from './schemas.js';

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






router.patch('/me', getCurrentUser, async (req, res, next) => {
  try {
    const parsed = UpdateProfileRequest.safeParse(req.body || {});
    if (!parsed.success) {
      return _sendError(res, 400, parsed.error.message);
    }
    const userId = _userId(req);
    const result = await usersService.updateProfile(
      req.db || pool,
      userId,
      parsed.data,
    );
    if (result.error) {
      if (req.dbRollback) {
        try { await req.dbRollback(); } catch (_) {  }
      }
      return _sendError(res, 400, result.error);
    }









    if (req.dbCommit) {
      await req.dbCommit();
    }
    return res.json({ data: result.data });
  } catch (e) {
    if (req.dbRollback) {
      try { await req.dbRollback(); } catch (_) {  }
    }
    logger.error(`users updateProfile error: ${e.message || e}`);
    return _sendError(res, e.status || 500, e.message || String(e));
  }
});


router.delete('/me', getCurrentUser, async (req, res, next) => {
  try {
    const parsed = DeleteProfileRequest.safeParse(req.body || {});
    if (!parsed.success) {
      return _sendError(res, 400, parsed.error.message);
    }
    const userId = _userId(req);
    const result = await usersService.deleteProfile(
      req.db || pool,
      { ...parsed.data, userId },
      res,
    );
    if (result.error) {
      if (req.dbRollback) {
        try { await req.dbRollback(); } catch (_) {  }
      }
      return _sendError(res, 400, result.error);
    }




    if (req.dbCommit) {
      await req.dbCommit();
    }
    return res.json({ data: result.data });
  } catch (e) {
    if (req.dbRollback) {
      try { await req.dbRollback(); } catch (_) {  }
    }
    logger.error(`users deleteProfile error: ${e.message || e}`);
    return _sendError(res, e.status || 500, e.message || String(e));
  }
});

export default router;


import express from 'express';

import { logger } from '../utils/logger.js';
import { adminAuthLimiter } from '../config/limiter.js';

import { toHttpResponse } from './errors.js';
import {
  requireAdminMember,
  requireAdminRole,
  requirePermission,
} from './middleware.js';
import * as service from './service.js';

const router = express.Router();

function _sendError(res, err) {
  const { statusCode, body } = toHttpResponse(err);
  return res.status(statusCode).json(body);
}






router.post('/auth/login', adminAuthLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    const result = await service.loginAdmin(
      req.db,
      { email, password },
      req,
      res,
    );




    if (req.dbCommit) {
      await req.dbCommit();
    }
    return res.status(200).json({ data: { member: result.member } });
  } catch (e) {
    if (req.dbRollback) {
      try { await req.dbRollback(); } catch (_) {  }
    }
    logger.warn?.(`[admin] /auth/login failed: ${e?.message || e}`);
    return _sendError(res, e);
  }
});


router.post('/auth/forgot', adminAuthLimiter, async (req, res, next) => {
  try {
    const { email } = req.body || {};
    await service.forgotPassword(req.db, { email });
    if (req.dbCommit) {
      await req.dbCommit();
    }
    return res.status(200).json({ data: { ok: true } });
  } catch (e) {
    if (req.dbRollback) {
      try { await req.dbRollback(); } catch (_) {  }
    }
    return _sendError(res, e);
  }
});


router.post('/auth/logout', requireAdminMember(), async (req, res, next) => {
  try {
    await service.logoutAdmin(req.db, req.adminMember.id, req, res);
    if (req.dbCommit) {
      await req.dbCommit();
    }
    return res.status(200).json({ data: { ok: true } });
  } catch (e) {
    if (req.dbRollback) {
      try { await req.dbRollback(); } catch (_) {  }
    }
    return _sendError(res, e);
  }
});


router.get('/me', requireAdminMember(), async (req, res, next) => {
  try {
    if (req.dbCommit) {
      await req.dbCommit();
    }
    return res.status(200).json({ data: { member: req.adminMember } });
  } catch (e) {
    if (req.dbRollback) {
      try { await req.dbRollback(); } catch (_) {  }
    }
    return _sendError(res, e);
  }
});


router.post(
  '/auth/change-password',
  requireAdminMember(),
  async (req, res, next) => {
    try {
      const { currentPassword, newPassword } = req.body || {};
      await service.changeOwnPassword(
        req.db,
        req.adminMember,
        { currentPassword, newPassword },
        req,
      );
      if (req.dbCommit) {
        await req.dbCommit();
      }
      return res.status(200).json({ data: { ok: true } });
    } catch (e) {
      if (req.dbRollback) {
        try { await req.dbRollback(); } catch (_) {  }
      }
      return _sendError(res, e);
    }
  },
);






router.get(
  '/members',
  requireAdminMember(),
  requireAdminRole('admin'),
  async (req, res, next) => {
    try {



      const rawStatus = String(req.query.status || '').trim().toLowerCase();
      const rawRole = String(req.query.role || '').trim().toLowerCase();
      const status = ['active', 'suspended', 'removed'].includes(rawStatus) ? rawStatus : null;
      const role = ['admin', 'moderator'].includes(rawRole) ? rawRole : null;


      const parsedLimit = parseInt(req.query.limit, 10);
      const parsedOffset = parseInt(req.query.offset, 10);
      const limit = Math.min(Math.max(Number.isFinite(parsedLimit) ? parsedLimit : 50, 1), 200);
      const offset = Number.isFinite(parsedOffset) ? Math.max(parsedOffset, 0) : 0;
      const result = await service.listMembersForAdmin(
        req.db,
        req.adminMember,
        { status, role, limit, offset },
      );
      if (req.dbCommit) {
        await req.dbCommit();
      }
      return res.status(200).json({ data: result });
    } catch (e) {
      if (req.dbRollback) {
        try { await req.dbRollback(); } catch (_) {  }
      }
      return _sendError(res, e);
    }
  },
);


router.get(
  '/members/:id',
  requireAdminMember(),
  async (req, res, next) => {
    try {
      const member = await service.getMemberForAdmin(
        req.db,
        req.adminMember,
        req.params.id,
      );
      if (req.dbCommit) {
        await req.dbCommit();
      }
      return res.status(200).json({ data: { member } });
    } catch (e) {
      if (req.dbRollback) {
        try { await req.dbRollback(); } catch (_) {  }
      }
      return _sendError(res, e);
    }
  },
);


router.post(
  '/members',
  requireAdminMember(),
  requirePermission('can_manage_members'),
  async (req, res, next) => {
    try {
      const { email, password, role, permissions } = req.body || {};
      const member = await service.createMemberForAdmin(
        req.db,
        req.adminMember,
        { email, password, role, permissions },
        req,
      );
      if (req.dbCommit) {
        await req.dbCommit();
      }
      return res.status(201).json({ data: { member } });
    } catch (e) {
      if (req.dbRollback) {
        try { await req.dbRollback(); } catch (_) {  }
      }
      return _sendError(res, e);
    }
  },
);


router.delete(
  '/members/:id',
  requireAdminMember(),
  requirePermission('can_manage_members'),
  async (req, res, next) => {
    try {
      const member = await service.softDeleteMemberForAdmin(
        req.db,
        req.adminMember,
        req.params.id,
        req,
      );
      if (req.dbCommit) {
        await req.dbCommit();
      }
      return res.status(200).json({ data: { member } });
    } catch (e) {
      if (req.dbRollback) {
        try { await req.dbRollback(); } catch (_) {  }
      }
      return _sendError(res, e);
    }
  },
);


router.put(
  '/members/:id',
  requireAdminMember(),
  requirePermission('can_manage_members'),
  async (req, res, next) => {
    try {
      const { role, status } = req.body || {};
      const member = await service.updateMemberForAdmin(
        req.db,
        req.adminMember,
        req.params.id,
        { role, status },
        req,
      );
      if (req.dbCommit) {
        await req.dbCommit();
      }
      return res.status(200).json({ data: { member } });
    } catch (e) {
      if (req.dbRollback) {
        try { await req.dbRollback(); } catch (_) {  }
      }
      return _sendError(res, e);
    }
  },
);


router.put(
  '/members/:id/permissions',
  requireAdminMember(),
  requirePermission('can_manage_members'),
  async (req, res, next) => {
    try {
      const { permissions } = req.body || {};
      const member = await service.updatePermissionsForAdmin(
        req.db,
        req.adminMember,
        req.params.id,
        permissions,
        req,
      );
      if (req.dbCommit) {
        await req.dbCommit();
      }
      return res.status(200).json({ data: { member } });
    } catch (e) {
      if (req.dbRollback) {
        try { await req.dbRollback(); } catch (_) {  }
      }
      return _sendError(res, e);
    }
  },
);


function _pagination(rawLimit, rawOffset, fallbackLimit = 50, maxLimit = 200) {
  const parsedLimit = parseInt(rawLimit, 10);
  const parsedOffset = parseInt(rawOffset, 10);
  const limit = Math.min(
    Math.max(Number.isFinite(parsedLimit) ? parsedLimit : fallbackLimit, 1),
    maxLimit,
  );
  const offset = Number.isFinite(parsedOffset) ? Math.max(parsedOffset, 0) : 0;
  return { limit, offset };
}


router.get(
  '/members/:id/activity',
  requireAdminMember(),
  async (req, res, next) => {
    try {
      const result = await service.getActivityForAdmin(
        req.db,
        req.adminMember,
        req.params.id,
        _pagination(req.query.limit, req.query.offset),
      );
      if (req.dbCommit) {
        await req.dbCommit();
      }
      return res.status(200).json({ data: result });
    } catch (e) {
      if (req.dbRollback) {
        try { await req.dbRollback(); } catch (_) {  }
      }
      return _sendError(res, e);
    }
  },
);


router.get(
  '/members/:id/audit',
  requireAdminMember(),
  requirePermission('can_view_audit'),
  async (req, res, next) => {
    try {
      const result = await service.getAuditForAdmin(
        req.db,
        req.adminMember,
        req.params.id,
        _pagination(req.query.limit, req.query.offset),
      );
      if (req.dbCommit) {
        await req.dbCommit();
      }
      return res.status(200).json({ data: result });
    } catch (e) {
      if (req.dbRollback) {
        try { await req.dbRollback(); } catch (_) {  }
      }
      return _sendError(res, e);
    }
  },
);

export default router;

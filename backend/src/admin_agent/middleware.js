

import { getCurrentUserOptional } from '../middlewares/auth.js';
import { logger } from '../utils/logger.js';

import {
  toHttpResponse,
  NotAdminMemberError,
  InsufficientPermissionsError,
} from './errors.js';
import * as service from './service.js';

function _sendError(res, err) {
  const { statusCode, body } = toHttpResponse(err);
  return res.status(statusCode).json(body);
}


export function requireAdminMember() {
  return [
    getCurrentUserOptional,
    async (req, res, next) => {
      try {
        const userId = req.user && (req.user.id || req.user.user_id || req.user.sub);
        if (!userId) {
          throw new NotAdminMemberError('Not authenticated');
        }
        const member = await service.getMe(req.db, userId);
        req.adminMember = member;
        return next();
      } catch (e) {
        logger.warn?.(
          `[admin] requireAdminMember failed: ${e?.message || e}`,
        );
        return _sendError(res, e);
      }
    },
  ];
}


export function requireAdminRole(role) {
  return (req, res, next) => {
    if (!req.adminMember) {
      return _sendError(res, new NotAdminMemberError('Not authenticated'));
    }
    if (req.adminMember.role !== role) {
      return _sendError(
        res,
        new InsufficientPermissionsError(`Requires role: ${role}`),
      );
    }
    return next();
  };
}


export function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.adminMember) {
      return _sendError(res, new NotAdminMemberError('Not authenticated'));
    }
    const perms = req.adminMember.permissions || [];
    if (!perms.includes(permission)) {
      return _sendError(
        res,
        new InsufficientPermissionsError(`Missing permission: ${permission}`),
      );
    }
    return next();
  };
}

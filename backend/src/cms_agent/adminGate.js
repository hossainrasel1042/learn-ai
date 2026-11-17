

import { getCurrentUser } from '../middlewares/auth.js';
import { logger } from '../utils/logger.js';
import * as adminService from '../admin_agent/service.js';
import { pool } from '../config/database.js';
import {
  NotAdminMemberError,
  InsufficientPermissionsError,
} from '../admin_agent/errors.js';


export const MANAGE_COURSES_PERMISSION = 'can_manage_courses';


function _toCmsError(err) {
  if (err instanceof NotAdminMemberError) {
    return { status: 401, detail: 'Not an admin member' };
  }
  if (err instanceof InsufficientPermissionsError) {
    return { status: 403, detail: err.message || 'Insufficient permissions' };
  }
  if (err && err.statusCode) {
    return { status: err.statusCode, detail: err.message || 'Forbidden' };
  }
  if (err && err.status) {
    return { status: err.status, detail: err.detail || err.message || 'Forbidden' };
  }
  return { status: 403, detail: 'Forbidden' };
}


export function requireCourseAdmin(permission = MANAGE_COURSES_PERMISSION) {
  return [getCurrentUser, _adminGuard(permission)];
}


function _adminGuard(permission) {
  return async (req, res, next) => {
    try {
      const userId = req.user && (req.user.id || req.user.user_id || req.user.sub);
      if (!userId) {
        throw new NotAdminMemberError('Not authenticated');
      }






      const db = req.db || pool;


      const member = await adminService.getMe(db, userId);
      req.adminMember = member;

      const perms = member.permissions || [];
      if (!perms.includes(permission)) {
        throw new InsufficientPermissionsError(`Missing permission: ${permission}`);
      }

      return next();
    } catch (e) {
      const { status, detail } = _toCmsError(e);
      logger.warn?.(
        `[cms] admin gate rejected ${req.method} ${req.originalUrl || req.url}: ${detail}`,
      );
      return res.status(status).json({ detail });
    }
  };
}

export default {
  requireCourseAdmin,
  MANAGE_COURSES_PERMISSION,
};

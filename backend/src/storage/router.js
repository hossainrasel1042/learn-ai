

import express from 'express';
import multer from 'multer';

import { getCurrentUser } from '../middlewares/auth.js';
import { logger } from '../utils/logger.js';
import { settings } from '../config/settings.js';
import {
  uploadAvatar,
  deleteAvatar,
  extractPathFromUrl,
} from './service.js';
import { DeleteAvatarRequest } from './schemas.js';

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

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
];






const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: settings.STORAGE_MAX_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return cb(null, true);
    }
    const err = new Error('File type must be JPEG, PNG, WebP, or GIF');
    err.status = 400;
    return cb(err);
  },
});






router.post(
  '/avatars',
  getCurrentUser,
  avatarUpload.single('file'),
  async (req, res, next) => {
    try {
      const userId = _userId(req);

      if (!req.file) {
        return _sendError(res, 400, 'File is required');
      }

      const result = await uploadAvatar({
        userId,
        fileBuffer: req.file.buffer,
        mimeType: req.file.mimetype,
        originalName: req.file.originalname,
      });

      if (result.error) {
        return _sendError(res, 400, result.error);
      }
      return res.json({ data: result.data });
    } catch (e) {
      logger.error(`storage uploadAvatar error: ${e.message || e}`);
      return _sendError(res, e.status || 500, e.message || String(e));
    }
  }
);


router.delete('/avatars', getCurrentUser, async (req, res, next) => {
  try {
    const parsed = DeleteAvatarRequest.safeParse(req.body || {});
    if (!parsed.success) {
      return _sendError(res, 400, parsed.error.message);
    }

    const userId = _userId(req);
    const objectPath = extractPathFromUrl(parsed.data.avatarUrl, userId);
    if (!objectPath) {
      return _sendError(res, 400, 'Invalid avatar URL');
    }

    const result = await deleteAvatar({
      userId,
      path: objectPath,
    });

    if (result.error) {
      const status = result.error === 'Unauthorized to delete this file' ? 403 : 500;
      return _sendError(res, status, result.error);
    }
    return res.json(result.data);
  } catch (e) {
    logger.error(`storage deleteAvatar error: ${e.message || e}`);
    return _sendError(res, e.status || 500, e.message || String(e));
  }
});

export default router;

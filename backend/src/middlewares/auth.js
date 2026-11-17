

import { verifyAccessToken, payloadToUser } from '../services/tokenService.js';


const extractBearer = (req) => {
  const cookies = req.cookies || {};
  if (cookies['sb-access-token']) {
    return cookies['sb-access-token'];
  }

  const header = req.headers?.authorization;
  if (!header || typeof header !== 'string') return null;
  const parts = header.split(' ');
  if (parts.length !== 2) return null;
  if (parts[0].toLowerCase() !== 'bearer') return null;
  return parts[1];
};


export const authMiddleware = ({ required = true } = {}) => {
  return async (req, res, next) => {
    try {
      const token = extractBearer(req);
      if (!token) {
        if (required) {
          return res
            .status(401)
            .json({ detail: 'Not authenticated', request_id: req.requestId || '-' });
        }
        req.user = null;
        return next();
      }

      const payload = verifyAccessToken(token);
      const user = payloadToUser(payload);

      if (!user) {
        if (required) {
          return res
            .status(401)
            .json({
              detail: 'Invalid authentication credentials',
              request_id: req.requestId || '-',
            });
        }
        req.user = null;
        return next();
      }

      req.user = user;
      next();
    } catch (e) {
      next(e);
    }
  };
};

export const getCurrentUser = authMiddleware({ required: true });
export const getCurrentUserOptional = authMiddleware({ required: false });

export { extractBearer };

export default {
  authMiddleware,
  getCurrentUser,
  getCurrentUserOptional,
  extractBearer,
};

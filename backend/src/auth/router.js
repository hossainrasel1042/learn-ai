

import express from 'express';

import { getCurrentUser } from '../middlewares/auth.js';
import { logger } from '../utils/logger.js';
import { pool } from '../config/database.js';
import {
  authLimiter,
  sendOtpLimiter,
  verifyOtpLimiter,
  verifyOtpIpLimiter,
  verifyEmailLimiter,
} from '../config/limiter.js';
import * as authService from './service.js';
import {
  SignUpRequest,
  SignInRequest,
  ForgotPasswordRequest,
  ResendOtpRequest,
  VerifyOtpRequest,
  ResetPasswordRequest,
  ChangePasswordRequest,
  VerifyEmailRequest,
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

function _sendError(res, status, detail) {
  return res.status(status).json({ detail });
}






router.post('/signup', authLimiter, async (req, res, next) => {
  try {
    const parsed = SignUpRequest.safeParse(req.body || {});
    if (!parsed.success) {
      return _sendError(res, 400, parsed.error.message);
    }
    const result = await authService.signUp(req.db || pool, parsed.data);
    if (result.error) {
      return _sendError(res, 400, result.error);
    }
    if (req.dbCommit) {
      await req.dbCommit();
    }
    if (result.mail) {
      await authService.deliverOtpMail(result.mail);
    }
    return res.json({ data: result.data });
  } catch (e) {
    logger.error(`auth signup error: ${e.message || e}`);
    if (req.dbRollback) {
      try { await req.dbRollback(); } catch (_) {  }
    }
    return _sendError(res, e.status || 500, e.message || String(e));
  }
});


router.post('/signin', authLimiter, async (req, res, next) => {
  try {
    const parsed = SignInRequest.safeParse(req.body || {});
    if (!parsed.success) {
      return _sendError(res, 400, parsed.error.message);
    }
    const result = await authService.signIn(req.db || pool, parsed.data, res);
    if (result.error) {
      if (result.code === 'email_not_verified') {
        if (req.dbRollback) {
          try { await req.dbRollback(); } catch (_) {  }
        }
        try {
          const link = await authService.issueVerificationLink({
            userId: result.userId,
            email: result.email,
          });
          if (link.mail) {
            await authService.deliverOtpMail(link.mail);
          }
        } catch (e) {
          logger.error(
            `auth signin: failed to re-issue a verification link: ${e?.message || e}`,
          );
        }
        return _sendError(res, 403, result.error);
      }
      return _sendError(res, 401, result.error);
    }









    if (req.dbCommit) {
      await req.dbCommit();
    }
    return res.json({ data: { success: true } });
  } catch (e) {
    logger.error(`auth signin error: ${e.message || e}`);
    if (req.dbRollback) {
      try { await req.dbRollback(); } catch (_) {  }
    }
    return _sendError(res, e.status || 500, e.message || String(e));
  }
});


router.post('/verify-email', verifyEmailLimiter, async (req, res, next) => {
  try {
    const parsed = VerifyEmailRequest.safeParse(req.body || {});
    if (!parsed.success) {
      return _sendError(res, 400, 'Invalid or expired verification link');
    }
    const result = await authService.verifyEmail(req.db || pool, parsed.data);
    if (result.error) {
      return _sendError(res, 400, result.error);
    }
    if (req.dbCommit) {
      await req.dbCommit();
    }
    return res.json({ data: result.data });
  } catch (e) {
    logger.error(`auth verify-email error: ${e.message || e}`);
    if (req.dbRollback) {
      try { await req.dbRollback(); } catch (_) {  }
    }
    return _sendError(res, e.status || 500, e.message || String(e));
  }
});


router.post('/signout', getCurrentUser, async (req, res, next) => {
  try {
    const result = await authService.signOut(res);
    return res.json({ data: result.data });
  } catch (e) {
    logger.error(`auth signout error: ${e.message || e}`);
    return _sendError(res, e.status || 500, e.message || String(e));
  }
});


router.post('/forgot-password', authLimiter, async (req, res, next) => {
  try {
    const parsed = ForgotPasswordRequest.safeParse(req.body || {});
    if (!parsed.success) {
      return _sendError(res, 400, parsed.error.message);
    }
    const result = await authService.forgotPassword(req.db || pool, parsed.data);
    if (result.error) {
      return _sendError(res, 400, result.error);
    }
    if (req.dbCommit) {
      await req.dbCommit();
    }
    if (result.mail) {
      await authService.deliverOtpMail(result.mail);
    }
    return res.json({ data: result.data });
  } catch (e) {
    logger.error(`auth forgot-password error: ${e.message || e}`);
    if (req.dbRollback) {
      try { await req.dbRollback(); } catch (_) {  }
    }
    return _sendError(res, e.status || 500, e.message || String(e));
  }
});


router.post('/resend-otp', sendOtpLimiter, async (req, res, next) => {
  try {
    const parsed = ResendOtpRequest.safeParse(req.body || {});
    if (!parsed.success) {
      return _sendError(res, 400, parsed.error.message);
    }
    const result = await authService.forgotPassword(req.db || pool, parsed.data);
    if (result.error) {
      return _sendError(res, 400, result.error);
    }
    if (req.dbCommit) {
      await req.dbCommit();
    }
    if (result.mail) {
      await authService.deliverOtpMail(result.mail);
    }
    return res.json({ data: result.data });
  } catch (e) {
    logger.error(`auth resend-otp error: ${e.message || e}`);
    if (req.dbRollback) {
      try { await req.dbRollback(); } catch (_) {  }
    }
    return _sendError(res, e.status || 500, e.message || String(e));
  }
});


router.post('/verify-otp', verifyOtpLimiter, verifyOtpIpLimiter, async (req, res, next) => {
  try {
    const parsed = VerifyOtpRequest.safeParse(req.body || {});
    if (!parsed.success) {
      return _sendError(res, 400, parsed.error.message);
    }
    const result = await authService.verifyOtp(req.db || pool, parsed.data);
    if (result.error) {
      return _sendError(res, 400, result.error);
    }
    if (req.dbCommit) {
      await req.dbCommit();
    }
    return res.json({ data: result.data });
  } catch (e) {
    logger.error(`auth verify-otp error: ${e.message || e}`);
    if (req.dbRollback) {
      try { await req.dbRollback(); } catch (_) {  }
    }
    return _sendError(res, e.status || 500, e.message || String(e));
  }
});


router.post('/reset-password', authLimiter, async (req, res, next) => {
  try {
    const parsed = ResetPasswordRequest.safeParse(req.body || {});
    if (!parsed.success) {
      return _sendError(res, 400, parsed.error.message);
    }
    const result = await authService.resetPassword(req.db || pool, parsed.data);
    if (result.error) {
      return _sendError(res, 400, result.error);
    }
    if (req.dbCommit) {
      await req.dbCommit();
    }
    return res.json({ data: result.data });
  } catch (e) {
    logger.error(`auth reset-password error: ${e.message || e}`);
    if (req.dbRollback) {
      try { await req.dbRollback(); } catch (_) {  }
    }
    return _sendError(res, e.status || 500, e.message || String(e));
  }
});


router.post('/change-password', getCurrentUser, async (req, res, next) => {
  try {
    const parsed = ChangePasswordRequest.safeParse(req.body || {});
    if (!parsed.success) {
      return _sendError(res, 400, parsed.error.message);
    }
    const userId = _userId(req);
    const result = await authService.changePassword(req.db || pool, {
      ...parsed.data,
      userId,
    });
    if (result.error) {
      return _sendError(res, 400, result.error);
    }
    if (req.dbCommit) {
      await req.dbCommit();
    }
    return res.json({ data: result.data });
  } catch (e) {
    logger.error(`auth change-password error: ${e.message || e}`);
    return _sendError(res, e.status || 500, e.message || String(e));
  }
});


router.get('/me', getCurrentUser, async (req, res, next) => {
  try {
    const userId = _userId(req);
    const result = await authService.me(req.db || pool, userId);
    return res.json({ data: result.data });
  } catch (e) {
    logger.error(`auth me error: ${e.message || e}`);
    if (req.dbRollback) {
      try { await req.dbRollback(); } catch (_) {  }
    }
    return _sendError(res, e.status || 500, e.message || String(e));
  }
});

export default router;

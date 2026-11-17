import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import IORedis from 'ioredis';
import { settings } from './settings.js';


export const parseLimit = (str) => {
  if (!str || typeof str !== 'string') {
    return { max: 100, windowMs: 60_000 };
  }
  const parts = str.split('/');
  const max = parseInt(parts[0], 10) || 100;
  const unit = (parts[1] || 'minute').toLowerCase().trim();

  const unitMap = {
    second: 1000,
    sec: 1000,
    s: 1000,
    minute: 60_000,
    min: 60_000,
    m: 60_000,
    hour: 3_600_000,
    hr: 3_600_000,
    h: 3_600_000,
    day: 86_400_000,
    d: 86_400_000,
  };

  const windowMs = unitMap[unit] !== undefined ? unitMap[unit] : 60_000;
  return { max, windowMs };
};


export const createLimiter = (options = {}) => {
  const opts = {
    windowMs: options.windowMs ?? 60_000,
    max: options.max ?? 100,
    standardHeaders: options.standardHeaders ?? true,
    legacyHeaders: options.legacyHeaders ?? false,
    ...options,
  };


  if (
    settings.is_production &&
    settings.RATE_LIMIT_ENABLED &&
    !opts.store
  ) {
    try {
      const redisClient = new IORedis(settings.REDIS_URL, {
        lazyConnect: false,





        maxRetriesPerRequest: null,





        enableOfflineQueue: true,


        retryStrategy: (times) => Math.min(times * 200, 2000),
      });
      redisClient.on('error', () => {

      });
      opts.store = new RedisStore({
        sendCommand: (...args) => redisClient.call(...args),
      });
    } catch (e) {

      opts.store = undefined;
    }
  }

  return rateLimit(opts);
};


export const createFailureLimiter = (options = {}) => {
  const {
    max = 10,
    windowMs = 15 * 60_000,
    isFailure = (req, res) => res.statusCode === 401 || res.statusCode === 403,
    keyPrefix = 'authfail',
    ...rest
  } = options;



  let _redis = null;
  const _getRedis = () => {
    if (_redis !== null) return _redis || undefined;
    try {
      const client = new IORedis(settings.REDIS_URL, {
        maxRetriesPerRequest: null,
        enableOfflineQueue: true,
        retryStrategy: (times) => Math.min(times * 200, 2000),
        lazyConnect: true,
      });
      client.on('error', () => {  });
      _redis = client;
      return client;
    } catch (e) {
      _redis = false;
      return undefined;
    }
  };


  const local = new Map();

  const _redisKey = (key) => `${keyPrefix}:${key}`;

  const _readCount = async (key) => {
    const redis = _getRedis();
    if (redis) {
      try {
        const raw = await redis.get(_redisKey(key));
        return raw ? parseInt(raw, 10) || 0 : 0;
      } catch (e) {

      }
    }
    const entry = local.get(key);
    if (!entry) return 0;
    if (Date.now() - entry.startedAt >= windowMs) {
      local.delete(key);
      return 0;
    }
    return entry.count;
  };

  const _recordFailure = async (key) => {
    const redis = _getRedis();
    if (redis) {
      try {
        const redisKey = _redisKey(key);

        const count = await redis.incr(redisKey);
        if (count === 1) await redis.expire(redisKey, Math.ceil(windowMs / 1000));
        return;
      } catch (e) {

      }
    }
    const entry = local.get(key);
    if (!entry || Date.now() - entry.startedAt >= windowMs) {
      local.set(key, { startedAt: Date.now(), count: 1 });
    } else {
      entry.count += 1;
    }
  };

  const _keyFor = (req) => req.ip || req.socket?.remoteAddress || 'unknown';

  return async (req, res, next) => {
    if (_hasValidBypass(req)) return next();

    const key = _keyFor(req);
    const count = await _readCount(key);

    if (count >= max) {
      const retryAfter = Math.ceil(windowMs / 1000);
      res.setHeader?.('Retry-After', String(retryAfter));
      res.setHeader?.('X-RateLimit-Limit', String(max));
      res.setHeader?.('X-RateLimit-Remaining', '0');
      return res.status(429).json({
        error: {
          code: 'rate_limited',
          message: 'Too many attempts. Please try again in a few minutes.',
        },
      });
    }

    res.on('finish', () => {
      if (!isFailure(req, res)) return;
      void _recordFailure(key);
    });

    return next();
  };
};


export const limiter = settings.RATE_LIMIT_ENABLED
  ? createLimiter(parseLimit(settings.RATE_LIMIT_DEFAULT))
  : (req, res, next) => next();


export const RATE_LIMIT_BYPASS_HEADER = 'x-rate-limit-bypass';


function _hasValidBypass(req) {
  const secret = settings.RATE_LIMIT_TEST_BYPASS_SECRET;
  if (!secret) return false;
  const provided = req.headers?.[RATE_LIMIT_BYPASS_HEADER];
  if (typeof provided !== 'string' || !provided) return false;


  if (provided.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i++) {
    diff |= provided.charCodeAt(i) ^ secret.charCodeAt(i);
  }
  return diff === 0;
}


export const authLimiter = settings.RATE_LIMIT_ENABLED
  ? createFailureLimiter({
      windowMs: 15 * 60_000,
      max: 10,
      keyPrefix: 'authfail',
      isFailure: (req, res) => res.statusCode === 401,
    })
  : (req, res, next) => next();


export const adminAuthLimiter = settings.RATE_LIMIT_ENABLED
  ? createFailureLimiter({
      windowMs: 15 * 60_000,
      max: 10,
      keyPrefix: 'adminfail',
    })
  : (req, res, next) => next();




export const sendOtpLimiter = settings.RATE_LIMIT_ENABLED
  ? createLimiter({
      windowMs: 60_000,
      max: 1,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req) =>
        `otp-send:${String(req.body?.email || '').trim().toLowerCase()}`,
    })
  : (req, res, next) => next();

export const verifyOtpLimiter = settings.RATE_LIMIT_ENABLED
  ? createLimiter({
      windowMs: 15 * 60_000,
      max: 10,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req) =>
        `otp-verify:${String(req.body?.email || '').trim().toLowerCase()}`,
    })
  : (req, res, next) => next();

export const verifyOtpIpLimiter = settings.RATE_LIMIT_ENABLED
  ? createLimiter({
      windowMs: 15 * 60_000,
      max: 30,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req) =>
        `otp-verify-ip:${req.headers?.['x-forwarded-for'] || req.ip || 'unknown'}`,
    })
  : (req, res, next) => next();

export const sendBattleInviteLimiter = settings.RATE_LIMIT_ENABLED
  ? createLimiter({
      windowMs: 60_000,
      max: 10,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req) =>
        `battle-invite-send:${String(req.user?.id || req.user?.sub || req.ip || 'unknown')}`,
    })
  : (req, res, next) => next();

export const battleInviteRespondLimiter = settings.RATE_LIMIT_ENABLED
  ? createLimiter({
      windowMs: 60_000,
      max: 20,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req) =>
        `battle-invite-respond:${String(req.user?.id || req.user?.sub || req.ip || 'unknown')}`,
    })
  : (req, res, next) => next();

export const verifyEmailLimiter = settings.RATE_LIMIT_ENABLED
  ? createLimiter({
      windowMs: 15 * 60_000,
      max: 30,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req) =>
        `verify-email:${req.headers?.['x-forwarded-for'] || req.ip || 'unknown'}`,
    })
  : (req, res, next) => next();

export default {
  limiter,
  authLimiter,
  adminAuthLimiter,
  sendOtpLimiter,
  verifyOtpLimiter,
  verifyOtpIpLimiter,
  sendBattleInviteLimiter,
  battleInviteRespondLimiter,
  verifyEmailLimiter,
  createLimiter,
  createFailureLimiter,
  parseLimit,
  RATE_LIMIT_BYPASS_HEADER,
};
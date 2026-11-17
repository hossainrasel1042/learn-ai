import { createHash, randomInt } from 'node:crypto';

import IORedisBase from 'ioredis';

import { settings } from '../config/settings.js';
import { logger } from '../utils/logger.js';




const OTP_TTL_SECONDS = 10 * 60;
const TOKEN_TTL_SECONDS = 60 * 60;
const MAX_ATTEMPTS = 5;
const KEY_PREFIX = 'learnai:otp';




const TOKEN_INDEX_PREFIX = `${KEY_PREFIX}:token`;




let _redis = null;

function _client() {
  if (!_redis) {
    _redis = new IORedisBase(settings.REDIS_URL, { maxRetriesPerRequest: null });
    _redis.on('error', () => {  });
  }
  return _redis;
}




function _emailKey(email) {
  return String(email || '').trim().toLowerCase();
}

function _codeKey(email) {
  return `${KEY_PREFIX}:code:${_emailKey(email)}`;
}

function _linkKey(email) {
  return `${KEY_PREFIX}:link:${_emailKey(email)}`;
}

function _tokenIndexKey(tokenHash) {
  return `${TOKEN_INDEX_PREFIX}:${tokenHash}`;
}




export function generateOtpCode() {
  return String(randomInt(0, 1000000)).padStart(6, '0');
}

export function hashOtpCode(code) {
  return createHash('sha256').update(String(code)).digest('hex');
}

export function otpTtlSeconds() {
  return OTP_TTL_SECONDS;
}

export function resetTokenTtlSeconds() {
  return TOKEN_TTL_SECONDS;
}






export async function storeOtp({ email, userId, token }) {
  const redis = _client();
  const code = generateOtpCode();
  const rawToken = String(token);
  const tokenHash = hashOtpCode(rawToken);

  const linkKey = _linkKey(email);
  const indexKey = _tokenIndexKey(tokenHash);

  await redis
    .multi()
    .set(_codeKey(email), JSON.stringify({ hash: hashOtpCode(code), attempts: 0 }), 'EX', OTP_TTL_SECONDS)
    .set(linkKey, JSON.stringify({ tokenHash, token: rawToken, userId: String(userId) }), 'EX', TOKEN_TTL_SECONDS)
    .set(indexKey, linkKey, 'EX', TOKEN_TTL_SECONDS)
    .exec();

  return { code, token: rawToken, tokenHash };
}




export async function consumeOtp({ email, code }) {
  const redis = _client();
  const key = _codeKey(email);
  const raw = await redis.get(key);
  if (!raw) {
    return { ok: false, reason: 'expired' };
  }

  let record = null;
  try {
    record = JSON.parse(raw);
  } catch (e) {
    await redis.del(key);
    return { ok: false, reason: 'invalid' };
  }

  const attempts = Number(record?.attempts || 0);
  if (attempts >= MAX_ATTEMPTS) {
    await redis.del(key);
    return { ok: false, reason: 'too_many_attempts' };
  }

  const expected = String(record?.hash || '');
  if (!expected || hashOtpCode(code) !== expected) {
    const next = attempts + 1;
    if (next >= MAX_ATTEMPTS) {
      await redis.del(key);
    } else {
      const ttl = await redis.ttl(key);
      await redis.set(key, JSON.stringify({ hash: expected, attempts: next }), 'EX', ttl > 0 ? ttl : OTP_TTL_SECONDS);
    }
    return { ok: false, reason: 'mismatch', attempts: next };
  }

  await redis.del(key);

  const linkRaw = await redis.get(_linkKey(email));
  if (!linkRaw) {
    return { ok: false, reason: 'expired' };
  }

  let link = null;
  try {
    link = JSON.parse(linkRaw);
  } catch (e) {
    return { ok: false, reason: 'invalid' };
  }

  const tokenHash = String(link?.tokenHash || '');
  const rawToken = String(link?.token || '');
  if (!tokenHash || !rawToken) {
    return { ok: false, reason: 'invalid' };
  }

  return { ok: true, tokenHash, token: rawToken, userId: link?.userId || null };
}




export async function consumeToken(token) {
  return consumeTokenByHash(hashOtpCode(token));
}




async function consumeTokenByHash(tokenHash) {
  const redis = _client();
  const indexKey = _tokenIndexKey(tokenHash);

  const linkKey = await redis.get(indexKey);
  if (!linkKey) {
    return { ok: false, reason: 'expired' };
  }

  const removed = await redis.getdel(linkKey);
  await redis.del(indexKey);
  if (!removed) {
    return { ok: false, reason: 'expired' };
  }

  let record = null;
  try {
    record = JSON.parse(removed);
  } catch (e) {
    return { ok: false, reason: 'invalid' };
  }

  return { ok: true, userId: record?.userId || null };
}






export async function readOtpState(email) {
  const redis = _client();
  const codeRaw = await redis.get(_codeKey(email));
  const linkRaw = await redis.get(_linkKey(email));
  const codeTtl = await redis.ttl(_codeKey(email));
  const linkTtl = await redis.ttl(_linkKey(email));

  let code = null;
  let link = null;
  try { code = codeRaw ? JSON.parse(codeRaw) : null; } catch (e) { code = null; }
  try { link = linkRaw ? JSON.parse(linkRaw) : null; } catch (e) { link = null; }

  return { code, link, codeTtl, linkTtl };
}

export async function clearOtpState(email) {
  const redis = _client();
  const linkRaw = await redis.get(_linkKey(email));
  const keys = [_codeKey(email), _linkKey(email)];
  if (linkRaw) {
    try {
      const record = JSON.parse(linkRaw);
      if (record?.tokenHash) keys.push(_tokenIndexKey(record.tokenHash));
    } catch (e) {  }
  }
  await redis.del(...keys);
}

export async function closeOtpRedis() {
  if (_redis) {
    try { await _redis.quit(); } catch (e) {  }
    _redis = null;
  }
}

logger.info('[otp] reset-token store ready');

export default {
  generateOtpCode,
  hashOtpCode,
  storeOtp,
  consumeOtp,
  consumeToken,
  readOtpState,
  clearOtpState,
  closeOtpRedis,
  otpTtlSeconds,
  resetTokenTtlSeconds,
};

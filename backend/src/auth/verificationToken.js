import { createHash, randomBytes } from 'node:crypto';

import IORedisBase from 'ioredis';

import { settings } from '../config/settings.js';
import { logger } from '../utils/logger.js';




const VERIFICATION_TTL_SECONDS = 10 * 60;
const ISSUE_LIMIT_PER_HOUR = 10;
const ISSUE_LIMIT_WINDOW_SECONDS = 60 * 60;

const KEY_PREFIX = 'learnai:verify';




const TOKEN_PREFIX = `${KEY_PREFIX}:token`;
const INDEX_PREFIX = `${KEY_PREFIX}:index`;
const EMAIL_PREFIX = `${KEY_PREFIX}:email`;
const ISSUE_COUNTER_PREFIX = `${KEY_PREFIX}:issued`;




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

function _tokenKey(tokenHash) {
  return `${TOKEN_PREFIX}:${tokenHash}`;
}

function _indexKey(tokenHash) {
  return `${INDEX_PREFIX}:${tokenHash}`;
}

function _emailIndexKey(email) {
  return `${EMAIL_PREFIX}:${_emailKey(email)}`;
}

function _issueCounterKey(email) {
  return `${ISSUE_COUNTER_PREFIX}:${_emailKey(email)}`;
}

export function hashVerificationToken(token) {
  return createHash('sha256').update(String(token || '')).digest('hex');
}

export function verificationTokenTtlSeconds() {
  return VERIFICATION_TTL_SECONDS;
}




async function _issueCount(email) {
  const redis = _client();
  try {
    const raw = await redis.get(_issueCounterKey(email));
    return raw ? parseInt(raw, 10) || 0 : 0;
  } catch (e) {
    return 0;
  }
}




export async function issueVerificationToken({ userId, email }) {
  const normalisedEmail = _emailKey(email);
  if (!normalisedEmail || !userId) {
    return { ok: false, reason: 'invalid' };
  }

  const redis = _client();

  let overLimit = false;
  try {
    const counterKey = _issueCounterKey(normalisedEmail);
    const count = await redis.incr(counterKey);
    if (count === 1) await redis.expire(counterKey, ISSUE_LIMIT_WINDOW_SECONDS);
    overLimit = count > ISSUE_LIMIT_PER_HOUR;
  } catch (e) {
    overLimit = false;
  }

  const rawToken = randomBytes(32).toString('hex');
  const tokenHash = hashVerificationToken(rawToken);

  const tokenKey = _tokenKey(tokenHash);
  const indexKey = _indexKey(tokenHash);
  const emailIndexKey = _emailIndexKey(normalisedEmail);

  const previousHash = await redis.get(emailIndexKey).catch(() => null);
  if (previousHash && previousHash !== tokenHash) {
    try {
      await redis.del(_tokenKey(previousHash), _indexKey(previousHash));
    } catch (e) {  }
  }

  const payload = JSON.stringify({ userId: String(userId), email: normalisedEmail });

  const results = await redis
    .multi()
    .set(tokenKey, payload, 'EX', VERIFICATION_TTL_SECONDS)
    .set(indexKey, tokenKey, 'EX', VERIFICATION_TTL_SECONDS)
    .set(emailIndexKey, tokenHash, 'EX', VERIFICATION_TTL_SECONDS)
    .exec();

  const failure = (results || []).find((entry) => entry && entry[0]);
  if (failure) {
    logger.error(
      `[verify] failed to store the verification token for ${normalisedEmail}: ${failure[0]?.message || failure[0]}`,
    );
    return { ok: false, reason: 'store_failed' };
  }

  return { ok: true, token: rawToken, tokenHash, overLimit };
}




export async function consumeVerificationToken(token) {
  const raw = String(token || '').trim();
  if (!raw) return { ok: false, reason: 'invalid' };

  const redis = _client();
  const tokenHash = hashVerificationToken(raw);
  const indexKey = _indexKey(tokenHash);

  const tokenKey = await redis.get(indexKey).catch(() => null);
  if (!tokenKey) {
    return { ok: false, reason: 'expired' };
  }

  const removed = await redis.getdel(tokenKey);
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

  if (!record?.userId) {
    return { ok: false, reason: 'invalid' };
  }

  try {
    const currentHash = await redis.get(_emailIndexKey(record.email));
    if (currentHash === tokenHash) {
      await redis.del(_emailIndexKey(record.email));
    }
  } catch (e) {  }

  return { ok: true, userId: String(record.userId), email: record.email || null };
}




export async function readVerificationState(email) {
  const redis = _client();
  const emailKey = _emailIndexKey(email);
  const tokenHash = await redis.get(emailKey).catch(() => null);
  const ttl = tokenHash ? await redis.ttl(emailKey).catch(() => -2) : -2;
  const issued = await _issueCount(email);
  return { tokenHash: tokenHash || null, ttl, issued };
}




export async function clearVerificationTokensForEmail(email) {
  const redis = _client();
  const emailKey = _emailIndexKey(email);
  const keys = [emailKey];

  const tokenHash = await redis.get(emailKey).catch(() => null);
  if (tokenHash) {
    keys.push(_tokenKey(tokenHash), _indexKey(tokenHash));
  }

  try {
    await redis.del(...keys);
  } catch (e) {  }
}




export async function closeVerificationRedis() {
  if (_redis) {
    try { await _redis.quit(); } catch (e) {  }
    _redis = null;
  }
}

logger.info('[verify] email verification token store ready');

export default {
  hashVerificationToken,
  issueVerificationToken,
  consumeVerificationToken,
  readVerificationState,
  clearVerificationTokensForEmail,
  closeVerificationRedis,
  verificationTokenTtlSeconds,
};



import { logger } from '../utils/logger.js';

import * as matchState from './matchState.js';




let _pool = null;
let _quizBattleService = null;

const queues = new Map();


const failedPairs = new Map();


const retryTimers = new Map();


const expiryTimers = new Map();


const widenTimers = new Map();


export const QUEUE_TTL_MS = 60_000;


export const WIDEN_AFTER_MS = 10_000;

export function init({ pool, quizBattleService }) {
    _pool = pool;
    _quizBattleService = quizBattleService;
}


export function enqueue(courseId, player) {
    if (!courseId || !player || !player.userId) return;
    const list = queues.get(courseId) || [];









    if (list.some((e) => e.userId === player.userId)) {
        logger.info?.(
            `[realtime] enqueue ignored — user=${player.userId} is already queued for course=${courseId}`,
        );
        _notifyDuplicate?.(courseId, player);
        return;
    }








    if (matchState.findLiveMatchForUser(player.userId)) {
        logger.info?.(
            `[realtime] enqueue ignored — user=${player.userId} is already in a live match`,
        );
        _notifyDuplicate?.(courseId, player);
        return;
    }
    list.push({ ...player, joinedAt: Date.now() });
    queues.set(courseId, list);
    logger.info?.(
        `[realtime] enqueue course=${courseId} user=${player.userId} queueSize=${list.length}`,
    );

    setTimeout(() => {
        tryMatch(courseId).catch((e) =>
            logger.error?.(`[realtime] tryMatch failed: ${e?.message || e}`),
        );
    }, 1000);

    _armWidenCheck(courseId);
    _armExpiry(courseId, player.userId);
}


function _armWidenCheck(courseId) {
    const list = queues.get(courseId);
    if (!list || list.length < 2) return;

    const now = Date.now();
    const joinTimes = list.map((e) => e.joinedAt).sort((x, y) => x - y);
    const secondOldest = joinTimes[1];
    const eligibleAt = secondOldest + WIDEN_AFTER_MS;
    if (eligibleAt <= now) return;
    const delay = eligibleAt - now;

    const existing = widenTimers.get(courseId);
    if (existing) {
        if (existing.eligibleAt <= eligibleAt) return;
        clearTimeout(existing.timer);
    }

    const timer = setTimeout(() => {
        widenTimers.delete(courseId);
        tryMatch(courseId)
            .then(() => {
                if (queues.has(courseId)) _armWidenCheck(courseId);
            })
            .catch((e) =>
                logger.error?.(`[realtime] widen tryMatch failed: ${e?.message || e}`),
            );
    }, delay);

    timer.unref?.();
    widenTimers.set(courseId, { timer, eligibleAt });
}


function _widenEligible(entry, now) {
    return now - entry.joinedAt >= WIDEN_AFTER_MS;
}


function _armExpiry(courseId, userId) {
    const timer = setTimeout(() => {
        const removed = removeEntry(courseId, (e) => e.userId === userId);
        if (!removed) return;
        logger.info?.(
            `[realtime] queue expired course=${courseId} user=${userId} after ${QUEUE_TTL_MS}ms`,
        );
        _notifyTimeout?.(removed, courseId);
    }, QUEUE_TTL_MS);

    timer.unref?.();
    expiryTimers.set(`${courseId}:${userId}`, timer);
}


let _notifyDuplicate = null;

export function setDuplicateNotifier(fn) {
    _notifyDuplicate = fn;
}


export function dequeueBySocket(socketId) {
    for (const [courseId, list] of queues.entries()) {

        const kept = list.filter((e) => e.socketId !== socketId);
        if (kept.length === list.length) continue;
        for (const e of list) {
            if (e.socketId !== socketId) continue;
            _clearExpiry(courseId, e.userId);
        }
        if (kept.length === 0) {
            queues.delete(courseId);
            _clearWiden(courseId);
        } else queues.set(courseId, kept);
        logger.info?.(
            `[realtime] dequeue course=${courseId} socket=${socketId} removed=${list.length - kept.length}`,
        );
    }
}

function _clearExpiry(courseId, userId) {
    const key = `${courseId}:${userId}`;
    const timer = expiryTimers.get(key);
    if (!timer) return;
    clearTimeout(timer);
    expiryTimers.delete(key);
}

function removeEntry(courseId, predicate) {
    const list = queues.get(courseId);
    if (!list) return null;
    const idx = list.findIndex(predicate);
    if (idx === -1) return null;
    const [entry] = list.splice(idx, 1);
    _clearExpiry(courseId, entry.userId);
    if (list.length === 0) {
        queues.delete(courseId);
        _clearWiden(courseId);
    }
    return entry;
}


function _clearWiden(courseId) {
    const entry = widenTimers.get(courseId);
    if (!entry) return;
    clearTimeout(entry.timer);
    widenTimers.delete(courseId);
}

function groupBy(arr, keyFn) {
    const out = new Map();
    for (const item of arr) {
        const k = keyFn(item);
        if (!out.has(k)) out.set(k, []);
        out.get(k).push(item);
    }
    return out;
}


export async function tryMatch(courseId) {
    if (!_pool || !_quizBattleService) {
        logger.warn?.(`[realtime] matchmaker not initialized yet`);
        return;
    }
    const list = queues.get(courseId);
    if (!list || list.length < 2) return;

    _pruneFailedPairs();


    const byLevel = groupBy(list, (e) => e.levelScore);
    for (const [level, bucket] of byLevel.entries()) {
        if (bucket.length >= 2) {





















            const chosen = _pickPair(bucket);
            if (!chosen) continue;
            const a = removeEntry(courseId, (e) => e === chosen[0]);
            const b = removeEntry(courseId, (e) => e === chosen[1]);
            if (!a || !b) continue;
            if (a.userId === b.userId) {





                logger.warn?.(
                    `[realtime] refusing self-match user=${a.userId} — re-queued`,
                );
                _requeue(courseId, a);
                return;
            }
            await _commitMatch(courseId, a, b);
            return;
        }
    }


    const now = Date.now();
    const candidates = list
        .filter((e) => _widenEligible(e, now))
        .sort((x, y) => x.levelScore - y.levelScore);
    if (candidates.length < 2) return;




    let bestGap = Infinity;
    let bestPair = null;
    for (let i = 0; i < candidates.length - 1; i++) {
        for (let j = i + 1; j < candidates.length; j++) {
            const a = candidates[i];
            const b = candidates[j];
            if (a.userId === b.userId) continue;
            if (_pairFailedRecently(a, b)) continue;
            const gap = Math.abs(b.levelScore - a.levelScore);
            if (gap < bestGap) {
                bestGap = gap;
                bestPair = [a, b];
            }
        }
    }
    if (!bestPair) return;
    removeEntry(courseId, (e) => e === bestPair[0]);
    removeEntry(courseId, (e) => e === bestPair[1]);
    if (bestPair[0].userId === bestPair[1].userId) {

        logger.warn?.(
            `[realtime] refusing self-match user=${bestPair[0].userId} — re-queued`,
        );
        _requeue(courseId, bestPair[0]);
        return;
    }
    await _commitMatch(courseId, bestPair[0], bestPair[1]);
}


function _requeue(courseId, entry) {
    const list = queues.get(courseId) || [];
    list.unshift({ ...entry, joinedAt: Date.now() });
    queues.set(courseId, list);
    _armExpiry(courseId, entry.userId);
}


const FAILED_PAIR_COOLDOWN_MS = 30_000;


function _pairKey(a, b) {
    return [a.userId, b.userId].sort().join('|');
}


function _pairFailedRecently(a, b) {
    const entry = failedPairs.get(_pairKey(a, b));
    if (!entry) return false;
    if (Date.now() - entry.at > FAILED_PAIR_COOLDOWN_MS) {
        failedPairs.delete(_pairKey(a, b));
        return false;
    }
    return true;
}


function _pruneFailedPairs() {
    const now = Date.now();
    for (const [key, entry] of failedPairs.entries()) {
        if (now - entry.at > FAILED_PAIR_COOLDOWN_MS) {
            failedPairs.delete(key);
        }
    }
}


function _pickPair(candidates) {
    if (!candidates || candidates.length < 2) return null;
    for (let i = 0; i < candidates.length - 1; i += 1) {
        for (let j = i + 1; j < candidates.length; j += 1) {
            const a = candidates[i];
            const b = candidates[j];
            if (a.userId === b.userId) continue;
            if (_pairFailedRecently(a, b)) continue;
            return [a, b];
        }
    }
    return null;
}


function _armRetry(courseId) {
    const timer = setTimeout(() => {
        retryTimers.delete(courseId);
        tryMatch(courseId).catch((e) =>
            logger.error?.(`[realtime] retry tryMatch failed: ${e?.message || e}`),
        );
    }, FAILED_PAIR_COOLDOWN_MS);

    timer.unref?.();
    retryTimers.set(courseId, timer);
}

async function _commitMatch(courseId, a, b) {
    if (a.userId === b.userId) {

        logger.warn?.(`[realtime] refusing self-match user=${a.userId}`);
        return;
    }
    logger.info?.(
        `[realtime] pairing course=${courseId} ${a.userId} (lvl=${a.levelScore}) vs ${b.userId} (lvl=${b.levelScore})`,
    );
    try {
        await _quizBattleService.createMatchAndDispatch(courseId, a, b);
    } catch (e) {
        logger.error?.(`[realtime] createMatchAndDispatch failed: ${e?.message || e}`);
















        failedPairs.set(_pairKey(a, b), { at: Date.now(), error: e?.message || String(e) });
        _requeue(courseId, a);
        _requeue(courseId, b);
        _notifyFailure?.(a, e);
        _notifyFailure?.(b, e);


        _armRetry(courseId);
    }
}


let _notifyFailure = null;

export function setFailureNotifier(fn) {
    _notifyFailure = fn;
}


let _notifyTimeout = null;

export function setTimeoutNotifier(fn) {
    _notifyTimeout = fn;
}





export function getQueueSize(courseId) {
    const list = queues.get(courseId);
    return list ? list.length : 0;
}

export function _reset() {
    queues.clear();
    failedPairs.clear();
    for (const timer of retryTimers.values()) clearTimeout(timer);
    retryTimers.clear();
    for (const timer of expiryTimers.values()) clearTimeout(timer);
    expiryTimers.clear();
    for (const entry of widenTimers.values()) clearTimeout(entry.timer);
    widenTimers.clear();
}

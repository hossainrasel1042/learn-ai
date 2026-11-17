

import { logger } from '../utils/logger.js';

export const MATCH_DURATION_MS = 10 * 60 * 1000;
export const INACTIVITY_BUDGET_MS = 60 * 1000;
const TICK_INTERVAL_MS = 1000;

const runtimes = new Map();



let _endMatchFn = null;
let _tickerHandle = null;
let _tickerIo = null;

export function setEndMatchFn(fn) {
    _endMatchFn = fn;
}


export function createRuntime({
    matchId,
    courseId,
    playerIds,
    playerSockets,
    levelScores,
    questionCount,
    durationMs = MATCH_DURATION_MS,
}) {
    if (runtimes.has(matchId)) return runtimes.get(matchId);
    const now = Date.now();
    const rt = {
        matchId,
        courseId,
        playerIds: [...playerIds],
        playerSockets: { ...playerSockets },
        scores: { [playerIds[0]]: 0, [playerIds[1]]: 0 },
        answeredCount: { [playerIds[0]]: 0, [playerIds[1]]: 0 },

        currentPosition: { [playerIds[0]]: 1, [playerIds[1]]: 1 },
        answeredQuestionIds: { [playerIds[0]]: [], [playerIds[1]]: [] },

        lastActiveAt: { [playerIds[0]]: now, [playerIds[1]]: now },

        lastTickAt: { [playerIds[0]]: now, [playerIds[1]]: now },

        inactiveSince: { [playerIds[0]]: now, [playerIds[1]]: now },
        inactivityAccumMs: { [playerIds[0]]: 0, [playerIds[1]]: 0 },
        questionCount,
        startedAt: now,
        durationMs,
        ended: false,
    };
    runtimes.set(matchId, rt);
    return rt;
}

export function getRuntime(matchId) {
    return runtimes.get(matchId);
}

export function deleteRuntime(matchId) {
    runtimes.delete(matchId);
}

export function listRuntimes() {
    return Array.from(runtimes.values());
}


export function getInactivitySeconds(matchId) {
    const rt = runtimes.get(matchId);
    if (!rt) return null;
    const out = {};
    for (const userId of rt.playerIds) {
        out[userId] = Math.floor((rt.inactivityAccumMs[userId] || 0) / 1000);
    }
    return out;
}


export function findLiveMatchForUser(userId) {
    for (const rt of runtimes.values()) {
        if (rt.ended) continue;
        if (rt.playerIds.includes(userId)) return rt;
    }
    return null;
}


export function bumpScore(matchId, userId, correct) {
    const rt = runtimes.get(matchId);
    if (!rt || rt.ended) return;
    if (!(userId in rt.scores)) return;
    if (correct) rt.scores[userId] += 1;
    rt.answeredCount[userId] = (rt.answeredCount[userId] || 0) + 1;
}


export function advanceQuestion(matchId, userId, questionId, position) {
    const rt = runtimes.get(matchId);
    if (!rt || rt.ended) return;
    if (!(userId in rt.currentPosition)) return;
    rt.answeredQuestionIds[userId].push(questionId);
    rt.currentPosition[userId] = position + 1;
}


export function isCurrentQuestion(matchId, userId, questionId, position) {
    const rt = runtimes.get(matchId);
    if (!rt || rt.ended) return null;
    if (!(userId in rt.currentPosition)) return null;
    if (rt.answeredQuestionIds[userId].includes(questionId)) return false;
    return rt.currentPosition[userId] === position;
}


export function markActive(matchId, userId, at = Date.now()) {
    const rt = runtimes.get(matchId);
    if (!rt || rt.ended) return;
    if (userId in rt.lastActiveAt) {
        rt.lastActiveAt[userId] = at;



        rt.inactiveSince[userId] = null;
        rt.inactivityAccumMs[userId] = 0;
    }
}


export function markDisconnected(matchId, userId) {








    const rt = runtimes.get(matchId);
    if (!rt || rt.ended) return;
}


export function setSocket(matchId, userId, socketId) {
    const rt = runtimes.get(matchId);
    if (!rt || rt.ended) return;
    if (!rt.playerIds.includes(userId)) return;
    rt.playerSockets[userId] = socketId;
    rt.lastActiveAt[userId] = Date.now();
}


export function startMatchTicker(io) {
    _tickerIo = io;
    if (_tickerHandle) return;
    _tickerHandle = setInterval(() => {
        const now = Date.now();
        for (const rt of runtimes.values()) {
            if (rt.ended) continue;
            _tickRuntime(io, rt, now);
        }
    }, TICK_INTERVAL_MS);

    if (_tickerHandle.unref) _tickerHandle.unref();
}


export function accumulateInactivity(rt, userId, now) {
    const lastActive = rt.lastActiveAt[userId] || now;

    if (!rt.inactiveSince || rt.inactiveSince[userId] == null) {
        rt.inactiveSince[userId] = now;
        rt.lastTickAt[userId] = now;
        return 0;
    }


    if (lastActive > rt.lastTickAt[userId]) {
        rt.inactiveSince[userId] = lastActive;
        rt.lastTickAt[userId] = now;
        rt.inactivityAccumMs[userId] = 0;
        return 0;
    }
    const accum = now - rt.inactiveSince[userId];
    rt.lastTickAt[userId] = now;
    rt.inactivityAccumMs[userId] = accum;
    return accum;
}

function _tickRuntime(io, rt, now) {

    for (const userId of rt.playerIds) {
        const accum = accumulateInactivity(rt, userId, now);
        if (accum >= INACTIVITY_BUDGET_MS && !rt.ended) {

            const opponent = rt.playerIds.find((u) => u !== userId);
            logger.info?.(
                `[realtime] inactivity forfeit match=${rt.matchId} loser=${userId}`,
            );
            _scheduleEnd(io, rt, opponent, 'inactivity_forfeit');
            return;
        }
    }









    io.to(`match:${rt.matchId}`).emit('battle:inactivity', {
        matchId: rt.matchId,
        inactivitySec: getInactivitySeconds(rt.matchId),
    });









    if (rt.questionCount > 0 && _allAnswered(rt)) {
        const [a, b] = rt.playerIds;
        const winner = rt.scores[a] > rt.scores[b] ? a : rt.scores[b] > rt.scores[a] ? b : null;
        logger.info?.(
            `[realtime] all questions answered match=${rt.matchId} winner=${winner || 'draw'}`,
        );
        _scheduleEnd(io, rt, winner, 'completed');
        return;
    }


    if (now - rt.startedAt >= rt.durationMs && !rt.ended) {
        const [a, b] = rt.playerIds;
        const winner = rt.scores[a] > rt.scores[b] ? a : rt.scores[b] > rt.scores[a] ? b : null;
        logger.info?.(
            `[realtime] time-up match=${rt.matchId} winner=${winner || 'draw'}`,
        );
        _scheduleEnd(io, rt, winner, 'time_up');
    }
}


function _allAnswered(rt) {
    return rt.playerIds.every(
        (userId) => (rt.answeredQuestionIds[userId] || []).length >= rt.questionCount,
    );
}

function _scheduleEnd(io, rt, winner, reason) {
    if (rt.ended) return;
    rt.ended = true;

    setImmediate(async () => {
        try {
            let result = null;
            if (_endMatchFn) {
                result = await _endMatchFn({
                    matchId: rt.matchId,
                    winner,
                    reason,
                });
            }















            const payload = {
                matchId: rt.matchId,
                winner: result?.winner ?? winner,
                reason,
                scores: result?.scores ?? rt.scores,
            };
            io.to(`match:${rt.matchId}`).emit('battle:ended', payload);











            for (const userId of rt.playerIds) {
                const sid = rt.playerSockets[userId];
                if (!sid) continue;
                const sock = io.sockets?.sockets?.get?.(sid);
                if (sock?.rooms?.has?.(`match:${rt.matchId}`)) continue;
                io.to(sid).emit('battle:ended', payload);
            }
        } catch (e) {
            logger.error?.(`[realtime] end match failed: ${e?.message || e}`);
        } finally {
            runtimes.delete(rt.matchId);
        }
    });
}

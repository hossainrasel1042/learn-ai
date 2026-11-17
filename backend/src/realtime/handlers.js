

import { logger } from '../utils/logger.js';

import * as matchmaker from './matchmaker.js';
import * as matchState from './matchState.js';
import { rateLimit, releaseSocket } from './rateLimit.js';

let _quizBattleService = null;

export function init({ quizBattleService }) {
    _quizBattleService = quizBattleService;
}


const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value) {
    return typeof value === 'string' && UUID_RE.test(value);
}


function clampSeconds(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    return Math.max(0, Math.min(Math.round(value), 3600));
}


export function registerHandlers(io, socket) {
    const userId = socket.data.userId;

    socket.on('battle:queue', rateLimit(socket, 'battle:queue', async (payload = {}) => {
        try {
            const courseId = String(payload.courseId || '').trim();
            if (!courseId) {
                return socket.emit('battle:error', { message: 'courseId required' });
            }





            if (!isUuid(courseId)) {
                return socket.emit('battle:error', {
                    message: 'courseId required',
                    fatal: false,
                });
            }
            const profile = await _quizBattleService.getOrCreateProfile(userId);
            logger.info?.(
                `[realtime] enqueue user=${userId} course=${courseId} level=${profile.levelScore}`,
            );
            matchmaker.enqueue(courseId, {
                socketId: socket.id,
                userId,
                levelScore: profile.levelScore,
            });
        } catch (e) {
            logger.warn?.(`[realtime] battle:queue failed: ${e?.message || e}`);
            socket.emit('battle:error', { message: e.message || 'queue failed' });
        }
    }));

    socket.on('battle:cancel', rateLimit(socket, 'battle:cancel', () => {
        matchmaker.dequeueBySocket(socket.id);
    }));


    socket.on('battle:join', rateLimit(socket, 'battle:join', async (payload = {}) => {
        try {
            const matchId = payload && payload.matchId;
            if (!matchId) return socket.emit('battle:error', { message: 'matchId required' });
            if (!isUuid(matchId)) {


                return socket.emit('battle:error', {
                    message: 'matchId required',
                    fatal: false,
                });
            }

            const detail = await _quizBattleService.getMatchDetail(matchId, userId);
            if (!detail) {
                return socket.emit('battle:error', { message: 'Match not found' });
            }
            const match = detail.match;
            if (match.status !== 'in_progress') {
                return socket.emit('battle:error', { message: 'Match is not in progress' });
            }


            socket.join(`match:${matchId}`);

            const opponentId =
                match.player_one === userId ? match.player_two : match.player_one;
            const opponentScore =
                detail.scores[opponentId] ?? 0;
            const myScore = detail.scores[userId] ?? 0;

            const rt = matchState.getRuntime(matchId);
            socket.emit('battle:matched', {
                matchId: match.id,
                courseId: match.course_id,
                questionCount: detail.questions.length,
                durationMs: rt?.durationMs ?? 10 * 60 * 1000,








                startedAt: rt?.startedAt ?? new Date(match.started_at).getTime(),
                questions: detail.questions.map((q) => ({
                    id: q.id,
                    matchId: q.match_id,
                    position: q.position,
                    prompt: q.prompt,
                    optionA: q.option_a,
                    optionB: q.option_b,
                    optionC: q.option_c,
                    optionD: q.option_d,
                    tags: q.tags || [],
                    difficulty: q.difficulty,
                })),
                opponent: {
                    id: opponentId,
                    levelScore:
                        match.player_one === userId
                            ? match.level_at_match_two
                            : match.level_at_match_one,
                },
                you: userId,


                scores: { [userId]: myScore, [opponentId]: opponentScore },





                answeredPositions: detail.answeredPositions || [],



                inactivitySec: matchState.getInactivitySeconds(matchId) || undefined,
            });
        } catch (e) {
            logger.error?.(`[realtime] battle:join failed: ${e?.message || e}`);

            socket.emit('battle:error', {
                message: 'The match could not be loaded. Try again.',
                fatal: false,
            });
        }
    }));

    socket.on('battle:answer', rateLimit(socket, 'battle:answer', async (payload = {}) => {
        try {
            const { matchId, questionId, selected, timeSeconds } = payload;
            if (!matchId || !questionId || !selected) {


                return socket.emit('battle:error', {
                    message: 'bad answer payload',
                    fatal: false,
                });
            }




            if (!isUuid(matchId) || !isUuid(questionId)) {
                return socket.emit('battle:error', {
                    message: 'bad answer payload',
                    fatal: false,
                });
            }




            if (!/^[ABCD]$/.test(String(selected))) {
                return socket.emit('battle:error', {
                    message: 'bad answer payload',
                    fatal: false,
                });
            }




            const result = await _quizBattleService.recordMatchAnswer({
                matchId,
                userId,
                questionId,
                selected,
                timeSeconds: clampSeconds(timeSeconds),
            });
            if (!result.ok) {










                const fatal = [
                    'Match not found',
                    'Match is not in progress',
                    'Not a player in this match',
                ].includes(result.message);
                return socket.emit('battle:error', {
                    message: result.message,
                    fatal,
                });
            }
            const rt = matchState.getRuntime(matchId);
            if (rt && !rt.ended) {
                matchState.bumpScore(matchId, userId, result.isCorrect);
                matchState.advanceQuestion(matchId, userId, questionId, result.position);
                matchState.markActive(matchId, userId);
            }

            io.to(`match:${matchId}`).emit('battle:score', {
                matchId,
                scores: result.scores,
                lastAnswer: { userId, questionId, isCorrect: result.isCorrect },




                inactivitySec: matchState.getInactivitySeconds(matchId) || undefined,
            });
        } catch (e) {
            logger.error?.(`[realtime] battle:answer failed: ${e?.message || e}`);










            socket.emit('battle:error', {
                message: 'The answer could not be recorded. Try again.',
                fatal: false,
            });
        }
    }));



    socket.on('battle:ping', (payload = {}) => {
        const matchId = payload && payload.matchId;
        if (!matchId) return;
        matchState.markActive(matchId, userId);


        const rt = matchState.getRuntime(matchId);
        if (rt) matchState.setSocket(matchId, userId, socket.id);
    });

    socket.on('battle:leave', rateLimit(socket, 'battle:leave', async (payload = {}) => {
        let matchId = null;
        try {
            matchId = payload && payload.matchId;
            if (!matchId) return;
            const rt = matchState.getRuntime(matchId);
            if (!rt || rt.ended) return;





            if (!rt.playerIds.includes(userId)) return;
            const opponent = rt.playerIds.find((u) => u !== userId);
            if (!opponent) return;
            rt.ended = true;
            const ended = await _quizBattleService.endMatch({
                matchId,
                winner: opponent,
                reason: 'player_left',
            });







            io.to(`match:${matchId}`).emit('battle:ended', {
                matchId,
                winner: ended?.winner ?? opponent,
                reason: 'player_left',
                scores: ended?.scores ?? rt.scores,
            });
        } catch (e) {
            logger.error?.(`[realtime] battle:leave failed: ${e?.message || e}`);
        } finally {






            if (matchId) matchState.deleteRuntime(matchId);
        }
    }));

    socket.on('disconnect', async () => {
        logger.info?.(`[realtime] socket disconnected: user=${userId} sid=${socket.id}`);
        releaseSocket(socket.id);
        matchmaker.dequeueBySocket(socket.id);
        for (const rt of matchState.listRuntimes()) {
            if (rt.ended) continue;
            if (!rt.playerIds.includes(userId)) continue;
            matchState.markDisconnected(rt.matchId, userId);
        }
    });
}


export function broadcastMatchStart(io, matchId, playerSocketIds, payloadsByUser) {
    for (const [userId, sid] of Object.entries(playerSocketIds || {})) {
        if (!sid) continue;
        const sock = io.sockets.sockets.get(sid);
        if (!sock) continue;
        sock.join(`match:${matchId}`);
        const payload = payloadsByUser?.[userId] || { matchId };
        sock.emit('battle:matched', payload);
    }
}
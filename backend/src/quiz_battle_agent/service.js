

import { logger } from '../utils/logger.js';

import { generateBattleQuestions, QUESTION_COUNT } from '../realtime/questions.js';
import * as matchState from '../realtime/matchState.js';
import { broadcastMatchStart } from '../realtime/handlers.js';
import { resolveSocketId } from '../realtime/socketRegistry.js';

import { quizBattleRepository } from './repository.js';
import { quizBattleInviteRepository } from './inviteRepository.js';
import { profileRepository } from '../models/profile.js';
import { isValidFriendCode } from './friendCode.js';




export const INVITE_TTL_MS = 10 * 60 * 1000;

export function quizBattleService({ pool, io }) {
    return {

        async getOrCreateProfile(userId, client = pool) {
            const repo = quizBattleRepository(client);
            const row = await repo.getOrCreateProfile(userId);
            return {
                userId: row.user_id,
                wins: row.wins,
                losses: row.losses,
                draws: row.draws,
                levelScore: row.level_score,
                lastMatchAt: row.last_match_at,
                tier: tierFor(row.level_score),
            };
        },

        async getProfile(userId) {
            const repo = quizBattleRepository(pool);
            const row = await repo.getProfile(userId);
            if (!row) {

                return this.getOrCreateProfile(userId);
            }
            return {
                userId: row.user_id,
                wins: row.wins,
                losses: row.losses,
                draws: row.draws,
                levelScore: row.level_score,
                lastMatchAt: row.last_match_at,
                tier: tierFor(row.level_score),
            };
        },


        async createMatchAndDispatch(courseId, playerA, playerB) {
            const repo = quizBattleRepository(pool);


            const match = await repo.createMatch({
                courseId,
                playerOne: playerA.userId,
                playerTwo: playerB.userId,
                levelOne: playerA.levelScore,
                levelTwo: playerB.levelScore,
            });
            if (!match) {
                throw new Error('Failed to create match row');
            }



            let questions;
            try {
                questions = await generateBattleQuestions({
                    courseId,
                    userId: playerA.userId,
                    pool,
                });
            } catch (e) {
                logger.error?.(`[battle] question generation failed: ${e?.message || e}`);

                await pool.query(
                    `UPDATE public.quiz_battle_matches
                        SET status = 'cancelled',
                            ended_reason = 'generation_failed',
                            finished_at = now()
                      WHERE id = $1`,
                    [match.id],
                );

















                throw e;
            }




            const insertedQuestions = await repo.insertQuestions(match.id, questions);


            const rt = matchState.createRuntime({
                matchId: match.id,
                courseId,
                playerIds: [playerA.userId, playerB.userId],
                playerSockets: { [playerA.userId]: playerA.socketId, [playerB.userId]: playerB.socketId },
                levelScores: { [playerA.userId]: playerA.levelScore, [playerB.userId]: playerB.levelScore },
                questionCount: insertedQuestions.length,
            });


            const clientQuestions = insertedQuestions.map((q) => ({
                id: q.id,
                matchId: match.id,
                position: q.position,
                prompt: q.prompt,
                optionA: q.option_a,
                optionB: q.option_b,
                optionC: q.option_c,
                optionD: q.option_d,
                tags: q.tags || [],
                difficulty: q.difficulty,
            }));


            const dataA = {
                matchId: match.id,
                courseId,
                questionCount: questions.length,
                durationMs: rt.durationMs,



                startedAt: rt.startedAt,
                questions: clientQuestions,
                opponent: {
                    id: playerB.userId,
                    levelScore: playerB.levelScore,
                },
                you: playerA.userId,
            };
            const dataB = {
                ...dataA,
                opponent: { id: playerA.userId, levelScore: playerA.levelScore },
                you: playerB.userId,
            };







            broadcastMatchStart(
                io,
                match.id,
                {
                    [playerA.userId]: playerA.socketId,
                    [playerB.userId]: playerB.socketId,
                },
                {
                    [playerA.userId]: dataA,
                    [playerB.userId]: dataB,
                },
            );




            try {
                await this.notifyPlayers({
                    matchId: match.id,
                    players: [playerA.userId, playerB.userId],
                    kind: 'matched',
                    payload: { courseId, questionCount: questions.length },
                });
            } catch (e) {
                logger.warn?.(`[battle] notifyPlayers(matched) failed: ${e?.message || e}`);
            }

            return { matchId: match.id, questions: clientQuestions };
        },


        async recordMatchAnswer({ matchId, userId, questionId, selected, timeSeconds }) {
            const repo = quizBattleRepository(pool);

            const match = await repo.getMatch(matchId);
            if (!match) return { ok: false, message: 'Match not found' };
            if (match.status !== 'in_progress') {
                return { ok: false, message: 'Match is not in progress' };
            }
            if (match.player_one !== userId && match.player_two !== userId) {
                return { ok: false, message: 'Not a player in this match' };
            }









            if (!/^[ABCD]$/.test(String(selected ?? ''))) {
                return { ok: false, message: 'Invalid option' };
            }

            const question = await repo.getQuestionForMatch(matchId, questionId);
            if (!question) return { ok: false, message: 'Question not in match' };











            const rt = matchState.getRuntime(matchId);
            if (rt) {
                if (Date.now() - rt.startedAt >= rt.durationMs) {
                    return { ok: false, message: 'The match is over' };
                }
            } else if (match.started_at) {
                const started = new Date(match.started_at).getTime();
                const MATCH_DURATION_MS = 10 * 60 * 1000;
                if (!Number.isNaN(started) && Date.now() - started >= MATCH_DURATION_MS) {
                    return { ok: false, message: 'The match is over' };
                }
            }

            const current = matchState.isCurrentQuestion(
                matchId,
                userId,
                questionId,
                question.position,
            );
            if (current === false) {
                return { ok: false, message: 'That is not the current question' };
            }










            if (current === null) {
                const nextAllowed = await repo.getNextAllowedPosition(matchId, userId);
                if (nextAllowed !== question.position) {
                    return { ok: false, message: 'That is not the current question' };
                }
            }

            const isCorrect = question.correct === selected;
            const inserted = await repo.recordAnswer({
                matchId,
                userId,
                questionId,
                selected,
                isCorrect,
                timeSeconds,
            });







            if (!inserted) {
                return { ok: false, message: 'Question already answered' };
            }
            const aScore = await repo.getUserScore(matchId, match.player_one);
            const bScore = await repo.getUserScore(matchId, match.player_two);
            return {
                ok: true,
                isCorrect,


                position: question.position,
                scores: { [match.player_one]: aScore, [match.player_two]: bScore },
            };
        },


        async endMatch({ matchId, winner, reason }) {
            const repo = quizBattleRepository(pool);
            const match = await repo.getMatch(matchId);
            if (!match) return null;










            if (match.status === 'finished' || match.status === 'cancelled') {


                const fa = await repo.getUserScore(matchId, match.player_one);
                const fb = await repo.getUserScore(matchId, match.player_two);
                return {
                    matchId,
                    winner: match.winner ?? winner ?? null,
                    reason: match.ended_reason || reason,
                    scores: { [match.player_one]: fa, [match.player_two]: fb },
                };
            }















            const a = await repo.getUserScore(matchId, match.player_one);
            const b = await repo.getUserScore(matchId, match.player_two);
            let resolvedWinner = winner;















            const SCORE_DECIDES = reason === 'completed' || reason === 'time_up';
            if (SCORE_DECIDES) {
                if (a > b) {
                    resolvedWinner = match.player_one;
                } else if (b > a) {
                    resolvedWinner = match.player_two;
                } else if (a === b && (a > 0 || b > 0)) {


                    resolvedWinner = null;
                }
            }






            const ended = await repo.setMatchWinner(matchId, resolvedWinner, reason);
            if (!ended) {
                logger.info?.(
                    `[battle] match=${matchId} was already ended by another path — skipping the profile update`,
                );


                return {
                    matchId,
                    winner: resolvedWinner,
                    reason,
                    scores: { [match.player_one]: a, [match.player_two]: b },
                };
            }
            const isDraw = resolvedWinner === null;
            const loser = isDraw ? null : (resolvedWinner === match.player_one ? match.player_two : match.player_one);
            if (isDraw) {
                await repo.applyMatchResult(match.player_one, match.player_two, true);
            } else if (loser) {
                await repo.applyMatchResult(resolvedWinner, loser, false);
            }
            logger.info?.(`[battle] ended match=${matchId} winner=${resolvedWinner || 'draw'} reason=${reason}`);








            try {
                await this.notifyPlayers({
                    matchId,
                    players: [match.player_one, match.player_two],
                    kind: 'ended',
                    payload: { reason, winner: resolvedWinner },
                });
            } catch (e) {
                logger.warn?.(`[battle] notifyPlayers(ended) failed: ${e?.message || e}`);
            }


            return {
                matchId,
                winner: resolvedWinner,
                reason,
                scores: { [match.player_one]: a, [match.player_two]: b },
            };
        },

        async getMatchDetail(matchId, userId) {
            const repo = quizBattleRepository(pool);
            const match = await repo.getMatch(matchId);
            if (!match) return null;
            if (match.player_one !== userId && match.player_two !== userId) {
                return null;
            }
            const questions = await repo.listQuestions(matchId);
            const answers = await repo.listAllAnswers(matchId);
            const aScore = await repo.getUserScore(matchId, match.player_one);
            const bScore = await repo.getUserScore(matchId, match.player_two);



            const answeredPositions = await repo.listAnsweredPositions(matchId, userId);
            return {
                match,
                answeredPositions,
                questions: questions.map((q) => ({
                    id: q.id,
                    matchId: q.match_id,
                    position: q.position,
                    prompt: q.prompt,
                    optionA: q.option_a,
                    optionB: q.option_b,
                    optionC: q.option_c,
                    optionD: q.option_d,
                    explanation: q.explanation,
                    tags: q.tags || [],
                    difficulty: q.difficulty,
                    correct: q.correct,
                })),
                answers,
                scores: { [match.player_one]: aScore, [match.player_two]: bScore },
            };
        },

        async listMatches(userId, page, pageSize) {
            const repo = quizBattleRepository(pool);
            return repo.listMatchesByUser(userId, { page, pageSize });
        },







        async getMyFriendCode(userId) {
            const repo = profileRepository(pool);
            const friendCode = await repo.ensureFriendCode(userId);
            return { friendCode };
        },

        async regenerateMyFriendCode(userId) {
            const repo = profileRepository(pool);
            const friendCode = await repo.regenerateFriendCode(userId);
            return { friendCode };
        },

        async sendInvite({ senderId, courseId, friendCode, client = pool }) {
            const code = String(friendCode || '').trim();
            if (!isValidFriendCode(code)) {
                return { ok: false, error: 'Friend code must be 8 digits', status: 400 };
            }

            const profileRepo = profileRepository(client);
            const sender = await profileRepo.getById(senderId);
            if (!sender) {
                return { ok: false, error: 'Sender profile not found', status: 404 };
            }

            const { rows: inviteeRows } = await client.query(
                `SELECT id, name FROM public.profiles WHERE friend_code = $1`,
                [code],
            );
            const invitee = inviteeRows[0];
            if (!invitee) {
                return { ok: false, error: 'No user has that friend code', status: 404 };
            }
            if (invitee.id === senderId) {
                return { ok: false, error: 'You cannot invite yourself', status: 400 };
            }

            const { rows: courseRows } = await client.query(
                `SELECT id, name FROM public.courses WHERE id = $1`,
                [courseId],
            );
            const course = courseRows[0];
            if (!course) {
                return { ok: false, error: 'Unknown course', status: 400 };
            }

            if (matchState.findLiveMatchForUser(senderId)) {
                return { ok: false, error: 'You are already in a match', status: 409 };
            }

            const inviteRepo = quizBattleInviteRepository(client);

            await this.sweepExpiredInvites(client);

            const existing = await inviteRepo.getPendingInviteForPair(senderId, invitee.id);
            if (existing) {
                return {
                    ok: false,
                    error: 'You already sent an invitation to this user',
                    status: 409,
                };
            }

            const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
            const invite = await inviteRepo.createInvite({
                senderId,
                inviteeId: invitee.id,
                courseId,
                inviteeFriendCode: code,
                expiresAt,
            });
            if (!invite) {
                return { ok: false, error: 'Could not create the invitation', status: 500 };
            }

            const inviteePayload = {
                inviteId: invite.id,
                courseId,
                courseName: course.name,
                senderId,
                senderName: sender.name,
                senderFriendCode: sender.friendCode ?? null,
                expiresAt: expiresAt.toISOString(),
            };
            const senderPayload = {
                inviteId: invite.id,
                inviteeId: invitee.id,
                inviteeName: invitee.name,
                courseId,
                courseName: course.name,
                expiresAt: expiresAt.toISOString(),
            };

            const inviteeNotification = await inviteRepo.createInviteNotification({
                userId: invitee.id,
                inviteId: invite.id,
                kind: 'invite',
                payload: inviteePayload,
            });
            const senderNotification = await inviteRepo.createInviteNotification({
                userId: senderId,
                inviteId: invite.id,
                kind: 'invite_sent',
                payload: senderPayload,
            });

            return {
                ok: true,
                inviteId: invite.id,
                invitee: { id: invitee.id, name: invitee.name },
                expiresAt: expiresAt.toISOString(),
                notificationsToEmit: [
                    {
                        userId: invitee.id,
                        notification: inviteeNotification,
                        kind: 'invite',
                        payload: inviteePayload,
                    },
                    {
                        userId: senderId,
                        notification: senderNotification,
                        kind: 'invite_sent',
                        payload: senderPayload,
                    },
                ],
            };
        },

        async notifyInvite({ userId, inviteId, kind, payload, client = pool }) {
            const repo = quizBattleInviteRepository(client);
            const row = await repo.createInviteNotification({
                userId,
                inviteId,
                kind,
                payload,
            });
            if (row && io) {
                io.to(`user:${userId}`).emit('battle:invite', {
                    id: row.id,
                    inviteId,
                    kind,
                    payload,
                    createdAt: row.created_at,
                });
            }
            return row;
        },

        async declineInvite({ inviteId, inviteeId, client = pool }) {
            const repo = quizBattleInviteRepository(client);
            const invite = await repo.getInviteById(inviteId);
            if (!invite) {
                return { ok: false, error: 'Invitation not found', status: 404 };
            }
            if (invite.invitee_id !== inviteeId) {
                return { ok: false, error: 'This invitation is not for you', status: 403 };
            }
            if (invite.status !== 'pending') {
                return { ok: false, error: 'Invitation already handled', status: 409 };
            }

            const expired = new Date(invite.expires_at).getTime() <= Date.now();
            const claimed = expired
                ? await repo.markInviteExpired(inviteId, inviteeId)
                : await repo.claimInvite(inviteId, {
                    status: 'declined',
                    declineReason: 'declined',
                    decidedBy: inviteeId,
                });
            if (!claimed) {
                return { ok: false, error: 'Invitation already handled', status: 409 };
            }

            const profileRepo = profileRepository(client);
            const invitee = await profileRepo.getById(inviteeId);
            const { rows: courseRows } = await client.query(
                `SELECT name FROM public.courses WHERE id = $1`,
                [invite.course_id],
            );
            await this.notifyInvite({
                userId: invite.sender_id,
                inviteId: invite.id,
                kind: 'invite_declined',
                payload: {
                    inviteId: invite.id,
                    inviteeId,
                    inviteeName: invitee?.name ?? null,
                    courseId: invite.course_id,
                    courseName: courseRows[0]?.name ?? null,
                },
                client,
            });

            return { ok: true };
        },

        async claimInviteForAccept({ inviteId, inviteeId, client = pool }) {
            const repo = quizBattleInviteRepository(client);
            const invite = await repo.getInviteById(inviteId);
            if (!invite) {
                return { ok: false, error: 'Invitation not found', status: 404 };
            }
            if (invite.invitee_id !== inviteeId) {
                return { ok: false, error: 'This invitation is not for you', status: 403 };
            }
            if (invite.status !== 'pending') {
                return { ok: false, error: 'Invitation already handled', status: 409 };
            }
            if (!(await repo.isInviteClaimable(inviteId))) {
                const current = await repo.getInviteById(inviteId);
                const isExpired =
                    current
                    && current.status === 'pending'
                    && new Date(current.expires_at).getTime() <= Date.now();
                if (isExpired) {
                    await repo.markInviteExpired(inviteId, inviteeId);
                    await this.notifyInvite({
                        userId: invite.sender_id,
                        inviteId: invite.id,
                        kind: 'invite_expired',
                        payload: { inviteId: invite.id, reason: 'expired' },
                        client,
                    });
                    return {
                        ok: false,
                        decided: true,
                        error: 'Invitation expired',
                        status: 410,
                    };
                }
                return { ok: false, error: 'Invitation already handled', status: 409 };
            }

            if (matchState.findLiveMatchForUser(inviteeId)) {
                await this._markUnavailable(invite, inviteeId, 'in_match', client);
                return {
                    ok: false,
                    decided: true,
                    error: 'You are already in a match',
                    status: 409,
                };
            }
            const inviteeSocketId = await resolveSocketId(io, inviteeId);
            if (!inviteeSocketId) {
                await this._markUnavailable(invite, inviteeId, 'offline', client);
                return {
                    ok: false,
                    decided: true,
                    error: 'You are not available right now — try later',
                    status: 409,
                };
            }

            const senderProfile = await this.getOrCreateProfile(invite.sender_id, client);
            const inviteeProfile = await this.getOrCreateProfile(inviteeId, client);
            const claimed = await repo.claimInvite(inviteId, {
                status: 'accepted',
                senderLevelScore: senderProfile.levelScore,
                inviteeLevelScore: inviteeProfile.levelScore,
                decidedBy: inviteeId,
            });
            if (!claimed) {
                const current = await repo.getInviteById(inviteId);
                const isExpired =
                    current
                    && current.status === 'pending'
                    && new Date(current.expires_at).getTime() <= Date.now();
                if (isExpired) {
                    await repo.markInviteExpired(inviteId, inviteeId);
                    await this.notifyInvite({
                        userId: invite.sender_id,
                        inviteId: invite.id,
                        kind: 'invite_expired',
                        payload: { inviteId: invite.id, reason: 'expired' },
                        client,
                    });
                    return {
                        ok: false,
                        decided: true,
                        error: 'Invitation expired',
                        status: 410,
                    };
                }
                return { ok: false, error: 'Invitation already handled', status: 409 };
            }

            return {
                ok: true,
                invite: claimed,
                senderLevelScore: senderProfile.levelScore,
                inviteeLevelScore: inviteeProfile.levelScore,
                inviteeSocketId,
                senderSocketId: await resolveSocketId(io, invite.sender_id),
            };
        },

        async startAcceptedMatch(claim) {
            const { invite } = claim;
            const repo = quizBattleInviteRepository(pool);

            const sender = {
                userId: invite.sender_id,
                levelScore: claim.senderLevelScore,
                socketId: claim.senderSocketId,
            };
            const invitee = {
                userId: invite.invitee_id,
                levelScore: claim.inviteeLevelScore,
                socketId: claim.inviteeSocketId,
            };

            let matchId = null;
            try {
                const created = await this.createMatchAndDispatch(invite.course_id, sender, invitee);
                matchId = created.matchId;
            } catch (e) {
                logger.error?.(`[battle] could not start the invited match: ${e?.message || e}`);
                await repo.claimInvite(invite.id, {
                    status: 'unavailable',
                    declineReason: 'generation_failed',
                    decidedBy: invite.invitee_id,
                });
                await this.notifyInvite({
                    userId: invite.sender_id,
                    inviteId: invite.id,
                    kind: 'invite_unavailable',
                    payload: { reason: 'generation_failed', inviteId: invite.id },
                });
                await this.notifyInvite({
                    userId: invite.invitee_id,
                    inviteId: invite.id,
                    kind: 'invite_unavailable',
                    payload: { reason: 'generation_failed', inviteId: invite.id },
                });
                throw e;
            }

            try {
                await repo.setInviteMatchId(invite.id, matchId);
            } catch (e) {
                logger.warn?.(`[battle] could not link invite ${invite.id} to match ${matchId}: ${e?.message || e}`);
            }

            await this.notifyInvite({
                userId: invite.sender_id,
                inviteId: invite.id,
                kind: 'invite_accepted',
                payload: { inviteId: invite.id, matchId, courseId: invite.course_id },
            });

            return { ok: true, matchId, courseId: invite.course_id };
        },

        async _markUnavailable(invite, inviteeId, reason, client = pool) {
            const repo = quizBattleInviteRepository(client);
            await repo.claimInvite(invite.id, {
                status: 'unavailable',
                declineReason: reason,
                decidedBy: inviteeId,
            });
            await this.notifyInvite({
                userId: invite.sender_id,
                inviteId: invite.id,
                kind: 'invite_unavailable',
                payload: { reason, inviteId: invite.id },
                client,
            });
        },

        async sweepExpiredInvites(client = pool) {
            const repo = quizBattleInviteRepository(client);
            const expired = await repo.expireStaleInvites();
            for (const inviteId of expired) {
                try {
                    const invite = await repo.getInviteById(inviteId);
                    if (!invite) continue;
                    await this.notifyInvite({
                        userId: invite.sender_id,
                        inviteId,
                        kind: 'invite_expired',
                        payload: { inviteId, reason: 'expired' },
                        client,
                    });
                } catch (e) {
                    logger.warn?.(`[battle] could not notify about expired invite ${inviteId}: ${e?.message || e}`);
                }
            }
            return expired;
        },

        async listInviteNotifications(userId, limit) {
            const repo = quizBattleInviteRepository(pool);
            return repo.listInviteNotificationsForUser(userId, { limit });
        },

        async getInviteStatus(inviteId) {
            const repo = quizBattleInviteRepository(pool);
            const invite = await repo.getInviteById(inviteId);
            if (!invite) return null;
            return {
                status: invite.status,
                expiresAt: invite.expires_at,
                expired:
                    invite.status === 'expired'
                    || new Date(invite.expires_at).getTime() <= Date.now(),
            };
        },

        async markInviteNotificationRead(userId, notificationId) {
            const repo = quizBattleInviteRepository(pool);
            return repo.markInviteNotificationRead(userId, notificationId);
        },

        async notifyPlayers({ matchId, players, kind, payload }) {
            const repo = quizBattleRepository(pool);
            const promises = [];
            for (const userId of players) {
                promises.push(
                    repo.createNotification({
                        userId,
                        matchId,
                        kind,
                        payload,
                    }).then((r) => {
                        if (r && io) {
                            io.to(`user:${userId}`).emit('battle:notification', {
                                id: r.id,
                                matchId,
                                kind,
                                payload,
                                createdAt: r.created_at,
                            });
                        }
                        return r;
                    }),
                );
            }
            return Promise.all(promises);
        },

        async listNotifications(userId, limit) {
            const repo = quizBattleRepository(pool);
            return repo.listNotificationsForUser(userId, { limit });
        },

        async markNotificationRead(userId, notificationId) {
            const repo = quizBattleRepository(pool);
            return repo.markNotificationRead(userId, notificationId);
        },
    };
}





export function tierFor(levelScore) {
    if (levelScore >= 1650) return 'Diamond';
    if (levelScore >= 1400) return 'Platinum';
    if (levelScore >= 1200) return 'Gold';
    if (levelScore >= 1000) return 'Silver';
    return 'Bronze';
}

export { QUESTION_COUNT };


import express from 'express';

import { getCurrentUser } from '../middlewares/auth.js';
import { logger } from '../utils/logger.js';
import { pool } from '../config/database.js';
import { cmsRepository } from '../cms_agent/models.js';
import {
    sendBattleInviteLimiter,
    battleInviteRespondLimiter,
} from '../config/limiter.js';

import { quizBattleService } from './service.js';
import {
    MatchIdParam,
    PaginationQuery,
    shapeProfile,
    shapeMatchSummary,
    shapeAnswer,
    SendInviteRequest,
    InviteIdParam,
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

function _service() {



    return quizBattleService({ pool, io: _io });
}

let _io = null;
export function attachIo(io) {
    _io = io;
}

function _sendError(res, status, detail) {
    return res.status(status).json({ detail });
}





router.get('/profile', getCurrentUser, async (req, res, next) => {
    try {
        const userId = _userId(req);
        const profile = await _service().getProfile(userId);
        return res.json({ profile: shapeProfile({
            user_id: profile.userId,
            wins: profile.wins,
            losses: profile.losses,
            draws: profile.draws,
            level_score: profile.levelScore,
            last_match_at: profile.lastMatchAt,
        }) });
    } catch (e) {
        logger.error?.(`[battle] /profile error: ${e.message || e}`);
        return _sendError(res, e.status || 500, e.message || String(e));
    }
});





router.get('/matches', getCurrentUser, async (req, res, next) => {
    try {
        const parsed = PaginationQuery.safeParse(req.query);
        if (!parsed.success) return _sendError(res, 400, parsed.error.message);
        const userId = _userId(req);
        const { page, pageSize } = parsed.data;
        const { items, total } = await _service().listMatches(userId, page, pageSize);
        return res.json({
            matches: items.map(shapeMatchSummary),
            total,
            page,
            pageSize,
        });
    } catch (e) {
        return _sendError(res, e.status || 500, e.message || String(e));
    }
});

router.get('/matches/:matchId', getCurrentUser, async (req, res, next) => {
    try {
        const parsed = MatchIdParam.safeParse(req.params);
        if (!parsed.success) return _sendError(res, 400, parsed.error.message);
        const userId = _userId(req);
        const detail = await _service().getMatchDetail(parsed.data.matchId, userId);
        if (!detail) return _sendError(res, 404, 'Match not found');











        const live = detail.match.status === 'in_progress' || detail.match.status === 'queued';
        return res.json({
            match: shapeMatchSummary(detail.match),






            you: userId,
            questions: live
                ? detail.questions.map((q) => {
                    const { correct, explanation, ...rest } = q;
                    return rest;
                })
                : detail.questions,

















            answers: live
                ? detail.answers.map((a) => {
                    const shaped = shapeAnswer(a);
                    return {
                        id: shaped.id,
                        matchId: shaped.matchId,
                        userId: shaped.userId,
                        questionId: shaped.questionId,
                        selected: null,
                        isCorrect: null,
                        timeSeconds: shaped.timeSeconds,
                        answeredAt: shaped.answeredAt,
                    };
                })
                : detail.answers.map(shapeAnswer),
            scores: detail.scores,
        });
    } catch (e) {
        return _sendError(res, e.status || 500, e.message || String(e));
    }
});





router.get('/courses', getCurrentUser, async (_req, res, next) => {
    try {
        const repo = cmsRepository(pool);
        const courses = await repo.listCourses();
        return res.json({
            courses: (courses || []).map((c) => ({
                id: c.id,
                name: c.name,
                courseNo: c.courseNo || c.course_no,
                description: c.description,
            })),
        });
    } catch (e) {
        return _sendError(res, e.status || 500, e.message || String(e));
    }
});





router.get('/health', async (_req, res, next) => {
    res.json({ status: 'ok', service: 'quiz-battle' });
});





router.get('/notifications', getCurrentUser, async (req, res, next) => {
    try {
        const userId = _userId(req);
        const limit = Math.max(1, Math.min(parseInt(req.query.limit, 10) || 50, 200));
        const rows = await _service().listNotifications(userId, limit);
        return res.json({
            notifications: rows.map((r) => ({
                id: r.id,
                matchId: r.match_id,
                kind: r.kind,
                payload: r.payload || {},
                createdAt: r.created_at,
                readAt: r.read_at,
            })),
        });
    } catch (e) {
        logger.error?.(`[battle] /notifications error: ${e.message || e}`);
        return _sendError(res, e.status || 500, e.message || String(e));
    }
});

router.post('/notifications/:id/read', getCurrentUser, async (req, res, next) => {
    try {
        const userId = _userId(req);
        const id = String(req.params.id || '').trim();
        if (!id) return _sendError(res, 400, 'notification id required');
        const row = await _service().markNotificationRead(userId, id);
        if (!row) return _sendError(res, 404, 'Notification not found');
        return res.json({ ok: true });
    } catch (e) {
        logger.error?.(`[battle] /notifications/:id/read error: ${e.message || e}`);
        return _sendError(res, e.status || 500, e.message || String(e));
    }
});


router.get('/friend-code', getCurrentUser, async (req, res, next) => {
    try {
        const userId = _userId(req);
        const { friendCode } = await _service().getMyFriendCode(userId);
        if (!friendCode) return _sendError(res, 500, 'Could not generate a friend code');
        return res.json({ friendCode });
    } catch (e) {
        logger.error?.(`[battle] /friend-code error: ${e.message || e}`);
        return _sendError(res, e.status || 500, e.message || String(e));
    }
});

router.post('/friend-code/regenerate', getCurrentUser, async (req, res, next) => {
    try {
        const userId = _userId(req);
        const { friendCode } = await _service().regenerateMyFriendCode(userId);
        if (!friendCode) return _sendError(res, 500, 'Could not regenerate a friend code');
        return res.json({ friendCode });
    } catch (e) {
        logger.error?.(`[battle] /friend-code/regenerate error: ${e.message || e}`);
        return _sendError(res, e.status || 500, e.message || String(e));
    }
});

router.post('/invites', getCurrentUser, sendBattleInviteLimiter, async (req, res, next) => {
    try {
        const parsed = SendInviteRequest.safeParse(req.body || {});
        if (!parsed.success) return _sendError(res, 400, parsed.error.message);
        const senderId = _userId(req);
        const result = await _service().sendInvite({
            senderId,
            courseId: parsed.data.courseId,
            friendCode: parsed.data.friendCode,
            client: req.db || pool,
        });
        if (!result.ok) return _sendError(res, result.status || 400, result.error);

        if (req.dbCommit) await req.dbCommit();

        for (const item of result.notificationsToEmit || []) {
            if (!_io) continue;
            _io.to(`user:${item.userId}`).emit('battle:invite', {
                id: item.notification?.id,
                inviteId: item.notification?.invite_id,
                kind: item.kind,
                payload: item.payload,
                createdAt: item.notification?.created_at,
            });
        }

        return res.status(201).json({
            inviteId: result.inviteId,
            invitee: result.invitee,
            expiresAt: result.expiresAt,
        });
    } catch (e) {
        if (req.dbRollback) { try { await req.dbRollback(); } catch (_) { } }
        logger.error?.(`[battle] POST /invites error: ${e.message || e}`);
        return _sendError(res, e.status || 500, e.message || String(e));
    }
});

router.post('/invites/:inviteId/accept', getCurrentUser, battleInviteRespondLimiter, async (req, res, next) => {
    const inviteId = String(req.params.inviteId || '').trim();
    if (!InviteIdParam.safeParse(inviteId).success) {
        return _sendError(res, 400, 'Invalid invitation id');
    }
    try {
        const inviteeId = _userId(req);

        const claim = await _service().claimInviteForAccept({
            inviteId,
            inviteeId,
            client: req.db || pool,
        });
        if (!claim.ok) {
            if (claim.decided) {
                if (req.dbCommit) await req.dbCommit();
            } else if (req.dbRollback) {
                try { await req.dbRollback(); } catch (_) { }
            }
            return _sendError(res, claim.status || 409, claim.error);
        }

        if (req.dbCommit) await req.dbCommit();

        const result = await _service().startAcceptedMatch(claim);
        return res.json({ matchId: result.matchId, courseId: result.courseId });
    } catch (e) {
        if (req.dbRollback) { try { await req.dbRollback(); } catch (_) { } }
        logger.error?.(`[battle] POST /invites/:inviteId/accept error: ${e.message || e}`);
        return _sendError(res, e.status || 503, e.message || 'Could not start the match');
    }
});

router.post('/invites/:inviteId/decline', getCurrentUser, battleInviteRespondLimiter, async (req, res, next) => {
    const inviteId = String(req.params.inviteId || '').trim();
    if (!InviteIdParam.safeParse(inviteId).success) {
        return _sendError(res, 400, 'Invalid invitation id');
    }
    try {
        const inviteeId = _userId(req);
        const result = await _service().declineInvite({
            inviteId,
            inviteeId,
            client: req.db || pool,
        });
        if (!result.ok) {
            if (req.dbRollback) { try { await req.dbRollback(); } catch (_) { } }
            return _sendError(res, result.status || 400, result.error);
        }
        if (req.dbCommit) await req.dbCommit();
        return res.json({ ok: true });
    } catch (e) {
        if (req.dbRollback) { try { await req.dbRollback(); } catch (_) { } }
        logger.error?.(`[battle] POST /invites/:inviteId/decline error: ${e.message || e}`);
        return _sendError(res, e.status || 500, e.message || String(e));
    }
});

router.get('/invites', getCurrentUser, async (req, res, next) => {
    try {
        const userId = _userId(req);
        const limit = Math.max(1, Math.min(parseInt(req.query.limit, 10) || 50, 200));
        const rows = await _service().listInviteNotifications(userId, limit);
        return res.json({
            notifications: rows.map((r) => ({
                id: r.id,
                inviteId: r.invite_id,
                kind: r.kind,
                payload: r.payload || {},
                createdAt: r.created_at,
                readAt: r.read_at,
                inviteStatus: r.invite_status || null,
                inviteExpiresAt: r.invite_expires_at || null,
            })),
        });
    } catch (e) {
        logger.error?.(`[battle] /invites error: ${e.message || e}`);
        return _sendError(res, e.status || 500, e.message || String(e));
    }
});

router.post('/invites/notifications/:id/read', getCurrentUser, async (req, res, next) => {
    try {
        const userId = _userId(req);
        const id = String(req.params.id || '').trim();
        if (!id) return _sendError(res, 400, 'notification id required');
        const row = await _service().markInviteNotificationRead(userId, id);
        if (!row) return _sendError(res, 404, 'Notification not found');
        return res.json({ ok: true });
    } catch (e) {
        logger.error?.(`[battle] POST /invites/notifications/:id/read error: ${e.message || e}`);
        return _sendError(res, e.status || 500, e.message || String(e));
    }
});

export default router;
export { router };

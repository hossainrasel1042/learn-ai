
export function quizBattleInviteRepository(client) {
    return {

        async createInvite({
            senderId,
            inviteeId,
            courseId,
            inviteeFriendCode,
            expiresAt,
        }) {
            const res = await client.query(
                `INSERT INTO public.quiz_battle_invites
                   (sender_id, invitee_id, course_id, invitee_friend_code, expires_at)
                 VALUES ($1, $2, $3, $4, $5)
                 RETURNING *`,
                [senderId, inviteeId, courseId, inviteeFriendCode, expiresAt],
            );
            return res.rows[0] || null;
        },

        async getInviteById(inviteId) {
            const res = await client.query(
                `SELECT * FROM public.quiz_battle_invites WHERE id = $1`,
                [inviteId],
            );
            return res.rows[0] || null;
        },

        async getPendingInviteForPair(senderId, inviteeId) {
            const res = await client.query(
                `SELECT * FROM public.quiz_battle_invites
                  WHERE sender_id = $1
                    AND invitee_id = $2
                    AND status = 'pending'
                  ORDER BY created_at DESC
                  LIMIT 1`,
                [senderId, inviteeId],
            );
            return res.rows[0] || null;
        },

        async claimInvite(inviteId, {
            status,
            matchId = null,
            senderLevelScore = null,
            inviteeLevelScore = null,
            decidedBy = null,
            declineReason = null,
        }) {
            const res = await client.query(
                `UPDATE public.quiz_battle_invites
                    SET status = $2,
                        match_id = COALESCE($3, match_id),
                        sender_level_score = COALESCE($4, sender_level_score),
                        invitee_level_score = COALESCE($5, invitee_level_score),
                        decided_by = $6,
                        decline_reason = $7,
                        responded_at = now()
                  WHERE id = $1
                    AND status = 'pending'
                    AND expires_at > now()
                  RETURNING *`,
                [
                    inviteId,
                    status,
                    matchId,
                    senderLevelScore,
                    inviteeLevelScore,
                    decidedBy,
                    declineReason,
                ],
            );
            return res.rows[0] || null;
        },

        async isInviteClaimable(inviteId) {
            const res = await client.query(
                `SELECT id FROM public.quiz_battle_invites
                  WHERE id = $1
                    AND status = 'pending'
                    AND expires_at > now()`,
                [inviteId],
            );
            return res.rows.length === 1;
        },

        async markInviteExpired(inviteId, decidedBy = null) {
            const res = await client.query(
                `UPDATE public.quiz_battle_invites
                    SET status = 'expired',
                        decline_reason = 'expired',
                        decided_by = COALESCE($2, decided_by),
                        responded_at = now()
                  WHERE id = $1
                    AND status = 'pending'
                  RETURNING *`,
                [inviteId, decidedBy],
            );
            return res.rows[0] || null;
        },

        async setInviteMatchId(inviteId, matchId) {
            const res = await client.query(
                `UPDATE public.quiz_battle_invites
                    SET match_id = $2
                  WHERE id = $1
                  RETURNING *`,
                [inviteId, matchId],
            );
            return res.rows[0] || null;
        },

        async expireStaleInvites(now = new Date()) {
            const res = await client.query(
                `UPDATE public.quiz_battle_invites
                    SET status = 'expired',
                        decline_reason = 'expired',
                        responded_at = now()
                  WHERE status = 'pending'
                    AND expires_at <= $1
                  RETURNING id`,
                [now],
            );
            return res.rows.map((r) => r.id);
        },

        async createInviteNotification({ userId, inviteId, kind, payload }) {
            const res = await client.query(
                `INSERT INTO public.quiz_battle_invite_notifications
                   (user_id, invite_id, kind, payload)
                 VALUES ($1, $2, $3, $4)
                 RETURNING *`,
                [userId, inviteId, kind, JSON.stringify(payload || {})],
            );
            return res.rows[0] || null;
        },

        async listInviteNotificationsForUser(userId, { limit = 50 } = {}) {
            const res = await client.query(
                `SELECT n.*, i.status AS invite_status, i.expires_at AS invite_expires_at
                   FROM public.quiz_battle_invite_notifications n
                   LEFT JOIN public.quiz_battle_invites i ON i.id = n.invite_id
                  WHERE n.user_id = $1
                  ORDER BY n.created_at DESC
                  LIMIT $2`,
                [userId, limit],
            );
            return res.rows;
        },

        async markInviteNotificationRead(userId, notificationId) {
            const res = await client.query(
                `UPDATE public.quiz_battle_invite_notifications
                    SET read_at = now()
                  WHERE id = $1
                    AND user_id = $2
                    AND read_at IS NULL
                  RETURNING *`,
                [notificationId, userId],
            );
            return res.rows[0] || null;
        },

        async listPendingInvitesForUser(userId) {
            const res = await client.query(
                `SELECT * FROM public.quiz_battle_invites
                  WHERE invitee_id = $1
                    AND status = 'pending'
                    AND expires_at > now()
                  ORDER BY created_at DESC`,
                [userId],
            );
            return res.rows;
        },
    };
}



import { tierFor } from './schemas.js';

export function quizBattleRepository(client) {
    return {

        async getOrCreateProfile(userId) {
            const res = await client.query(
                `INSERT INTO public.quiz_battle_profiles (user_id)
                 VALUES ($1)
                 ON CONFLICT (user_id) DO UPDATE
                   SET updated_at = public.quiz_battle_profiles.updated_at
                 RETURNING *`,
                [userId],
            );
            return res.rows[0] || null;
        },

        async getProfile(userId) {
            const res = await client.query(
                `SELECT * FROM public.quiz_battle_profiles WHERE user_id = $1`,
                [userId],
            );
            return res.rows[0] || null;
        },


        async createMatch({
            courseId,
            playerOne,
            playerTwo,
            levelOne,
            levelTwo,
        }) {
            const res = await client.query(
                `INSERT INTO public.quiz_battle_matches
                   (course_id, player_one, player_two,
                    status, level_at_match_one, level_at_match_two, started_at)
                 VALUES ($1, $2, $3, 'in_progress', $4, $5, now())
                 RETURNING *`,
                [courseId, playerOne, playerTwo, levelOne, levelTwo],
            );
            return res.rows[0] || null;
        },


        async setMatchWinner(matchId, winner, reason) {
            const res = await client.query(
                `UPDATE public.quiz_battle_matches
                    SET status = 'finished',
                        winner = $2,
                        ended_reason = $3,
                        finished_at = now()
                  WHERE id = $1
                    AND status = 'in_progress'
                  RETURNING *`,
                [matchId, winner, reason],
            );
            return res.rows[0] || null;
        },

        async getMatch(matchId) {
            const res = await client.query(
                `SELECT * FROM public.quiz_battle_matches WHERE id = $1`,
                [matchId],
            );
            return res.rows[0] || null;
        },

        async listMatchesByUser(userId, { page = 1, pageSize = 20 }) {
            const offset = (page - 1) * pageSize;
            const totalRes = await client.query(
                `SELECT count(*)::int AS total
                   FROM public.quiz_battle_matches
                  WHERE player_one = $1 OR player_two = $1`,
                [userId],
            );
            const total = totalRes.rows[0]?.total || 0;
            const res = await client.query(
                `SELECT * FROM public.quiz_battle_matches
                  WHERE player_one = $1 OR player_two = $1
                  ORDER BY created_at DESC
                  LIMIT $2 OFFSET $3`,
                [userId, pageSize, offset],
            );
            return { items: res.rows, total };
        },


        async insertQuestions(matchId, questions) {
            if (questions.length === 0) return [];

            const cols = [
                'match_id', 'position', 'prompt', 'option_a', 'option_b',
                'option_c', 'option_d', 'correct', 'explanation', 'tags', 'difficulty',
            ];
            const valuesSql = [];
            const params = [];
            let p = 1;
            for (let i = 0; i < questions.length; i++) {
                const q = questions[i];
                valuesSql.push(
                    `($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}::text[], $${p++})`,
                );
                params.push(
                    matchId,
                    i + 1,
                    q.prompt,
                    q.optionA,
                    q.optionB,
                    q.optionC,
                    q.optionD,
                    q.correct,
                    q.explanation || null,
                    q.tags || [],
                    q.difficulty || null,
                );
            }
            const res = await client.query(
                `INSERT INTO public.quiz_battle_questions (${cols.join(',')})
                 VALUES ${valuesSql.join(',')}
                 RETURNING *`,
                params,
            );
            return res.rows;
        },

        async listQuestions(matchId) {
            const res = await client.query(
                `SELECT * FROM public.quiz_battle_questions
                  WHERE match_id = $1
                  ORDER BY position ASC`,
                [matchId],
            );
            return res.rows;
        },

        async getQuestionForMatch(matchId, questionId) {
            const res = await client.query(
                `SELECT * FROM public.quiz_battle_questions
                  WHERE id = $1 AND match_id = $2`,
                [questionId, matchId],
            );
            return res.rows[0] || null;
        },


        async recordAnswer({
            matchId,
            userId,
            questionId,
            selected,
            isCorrect,
            timeSeconds,
        }) {
            const res = await client.query(
                `INSERT INTO public.quiz_battle_answers
                   (match_id, user_id, question_id, selected, is_correct, time_seconds)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 ON CONFLICT (match_id, user_id, question_id) DO NOTHING
                 RETURNING *`,
                [matchId, userId, questionId, selected, isCorrect, timeSeconds],
            );
            return res.rows[0] || null;
        },

        async listAnswersForUser(matchId, userId) {
            const res = await client.query(
                `SELECT * FROM public.quiz_battle_answers
                  WHERE match_id = $1 AND user_id = $2`,
                [matchId, userId],
            );
            return res.rows;
        },

        async listAllAnswers(matchId) {
            const res = await client.query(
                `SELECT * FROM public.quiz_battle_answers WHERE match_id = $1`,
                [matchId],
            );
            return res.rows;
        },


        async listAnsweredPositions(matchId, userId) {
            const res = await client.query(
                `SELECT q.position
                   FROM public.quiz_battle_answers a
                   JOIN public.quiz_battle_questions q ON q.id = a.question_id
                  WHERE a.match_id = $1 AND a.user_id = $2
                  ORDER BY q.position ASC`,
                [matchId, userId],
            );
            return res.rows.map((r) => r.position);
        },

        async getUserScore(matchId, userId) {
            const res = await client.query(
                `SELECT count(*)::int AS score
                   FROM public.quiz_battle_answers
                  WHERE match_id = $1 AND user_id = $2 AND is_correct = true`,
                [matchId, userId],
            );
            return res.rows[0]?.score || 0;
        },


        async getNextAllowedPosition(matchId, userId) {
            const positions = await this.listAnsweredPositions(matchId, userId);
            for (let i = 0; i < positions.length; i += 1) {
                if (positions[i] !== i + 1) return null;
            }
            return positions.length + 1;
        },


        async applyMatchResult(winnerId, loserId, isDraw) {
            const ops = [];
            if (isDraw) {
                ops.push(
                    client.query(
                        `UPDATE public.quiz_battle_profiles
                            SET draws = draws + 1,
                                last_match_at = now()
                          WHERE user_id = ANY($1::uuid[])`,
                        [[winnerId, loserId]],
                    ),
                );
            } else {
                ops.push(
                    client.query(
                        `UPDATE public.quiz_battle_profiles
                            SET wins = wins + 1,
                                last_match_at = now(),
                                level_score = GREATEST(level_score + 20, 0)
                          WHERE user_id = $1`,
                        [winnerId],
                    ),
                    client.query(
                        `UPDATE public.quiz_battle_profiles
                            SET losses = losses + 1,
                                last_match_at = now(),
                                level_score = GREATEST(level_score - 15, 0)
                          WHERE user_id = $1`,
                        [loserId],
                    ),
                );
            }
            await Promise.all(ops);
        },


        async createNotification({ userId, matchId, kind, payload }) {
            const res = await client.query(
                `INSERT INTO public.quiz_battle_notifications
                   (user_id, match_id, kind, payload)
                 VALUES ($1, $2, $3, $4::jsonb)
                 RETURNING *`,
                [userId, matchId, kind, JSON.stringify(payload || {})],
            );
            return res.rows[0] || null;
        },

        async listNotificationsForUser(userId, { limit = 50 } = {}) {
            const res = await client.query(
                `SELECT * FROM public.quiz_battle_notifications
                  WHERE user_id = $1
                  ORDER BY created_at DESC
                  LIMIT $2`,
                [userId, limit],
            );
            return res.rows;
        },

        async markNotificationRead(userId, notificationId) {
            const res = await client.query(
                `UPDATE public.quiz_battle_notifications
                    SET read_at = now()
                  WHERE id = $1 AND user_id = $2 AND read_at IS NULL
                  RETURNING *`,
                [notificationId, userId],
            );
            return res.rows[0] || null;
        },
    };
}

export default quizBattleRepository;
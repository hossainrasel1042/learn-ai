

import { z } from 'zod';

const uuid = z.string().uuid();

export const MatchIdParam = z.object({ matchId: uuid });

export const PaginationQuery = z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
});



export const FriendCodeParam = z
    .string()
    .trim()
    .regex(/^[0-9]{8}$/, 'Friend code must be 8 digits');

export const SendInviteRequest = z.object({
    courseId: z.string().trim().uuid('courseId must be a UUID'),
    friendCode: FriendCodeParam,
});

export const InviteIdParam = z.string().trim().uuid('Invalid invitation id');





export function shapeProfile(row) {
    if (!row) return null;
    return {
        userId: row.user_id,
        wins: row.wins,
        losses: row.losses,
        draws: row.draws,
        levelScore: row.level_score,
        lastMatchAt: row.last_match_at,
        tier: tierFor(row.level_score),
    };
}

export function shapeMatchSummary(row) {
    if (!row) return null;
    return {
        id: row.id,
        courseId: row.course_id,
        playerOne: row.player_one,
        playerTwo: row.player_two,
        status: row.status,
        winner: row.winner,
        endedReason: row.ended_reason,
        levelAtMatchOne: row.level_at_match_one,
        levelAtMatchTwo: row.level_at_match_two,
        startedAt: row.started_at,
        finishedAt: row.finished_at,
        createdAt: row.created_at,
    };
}

export function shapeQuestion(row) {
    if (!row) return null;
    return {
        id: row.id,
        matchId: row.match_id,
        position: row.position,
        prompt: row.prompt,
        optionA: row.option_a,
        optionB: row.option_b,
        optionC: row.option_c,
        optionD: row.option_d,


        explanation: row.explanation,
        tags: row.tags || [],
        difficulty: row.difficulty,
    };
}

export function shapeAnswer(row) {
    if (!row) return null;
    return {
        id: row.id,
        matchId: row.match_id,
        userId: row.user_id,
        questionId: row.question_id,
        selected: row.selected,
        isCorrect: row.is_correct,
        timeSeconds: row.time_seconds,
        answeredAt: row.answered_at,
    };
}





export function tierFor(levelScore) {
    if (levelScore >= 1650) return 'Diamond';
    if (levelScore >= 1400) return 'Platinum';
    if (levelScore >= 1200) return 'Gold';
    if (levelScore >= 1000) return 'Silver';
    return 'Bronze';
}
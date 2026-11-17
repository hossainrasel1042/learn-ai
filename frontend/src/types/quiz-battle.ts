

export type BattleTier =
    | 'Bronze'
    | 'Silver'
    | 'Gold'
    | 'Platinum'
    | 'Diamond';

export interface BattleProfile {
    userId: string;
    wins: number;
    losses: number;
    draws: number;
    levelScore: number;
    lastMatchAt: string | null;
    tier: BattleTier;
}

export interface BattleMatchSummary {
    id: string;
    courseId: string;
    playerOne: string;
    playerTwo: string;
    status: 'queued' | 'in_progress' | 'finished' | 'cancelled' | 'forfeited';
    winner: string | null;
    endedReason: string | null;
    levelAtMatchOne: number;
    levelAtMatchTwo: number;
    startedAt: string | null;
    finishedAt: string | null;
    createdAt: string;
}

export interface BattleQuestion {
    id: string;
    matchId: string;
    position: number;
    prompt: string;
    optionA: string;
    optionB: string;
    optionC: string;
    optionD: string;

    correct?: 'A' | 'B' | 'C' | 'D';
    explanation?: string | null;
    tags: string[];
    difficulty: 'easy' | 'medium' | 'hard' | null;
}

export interface BattleAnswer {
    id: string;
    matchId: string;
    userId: string;
    questionId: string;
    selected: 'A' | 'B' | 'C' | 'D' | null;
    isCorrect: boolean | null;
    timeSeconds: number | null;
    answeredAt: string;
}

export interface PlayCourse {
    id: string;
    name: string;
    courseNo: string;
    description: string | null;
}

export type BattlePhase =
    | 'idle'
    | 'queued'
    | 'queue_timeout'
    | 'matched'
    | 'countdown'
    | 'in_progress'
    | 'finished'
    | 'error';

export type EndedReason =
    | 'completed'
    | 'time_up'
    | 'inactivity_forfeit'
    | 'player_left'
    | 'cancelled';

export interface MatchDetailResponse {
    match: BattleMatchSummary;

    you: string;
    questions: BattleQuestion[];
    answers: BattleAnswer[];
    scores: Record<string, number>;
}

export interface MatchListResponse {
    matches: BattleMatchSummary[];
    total: number;
    page: number;
    pageSize: number;
}

export function tierFor(levelScore: number): BattleTier {
    if (levelScore >= 1650) return 'Diamond';
    if (levelScore >= 1400) return 'Platinum';
    if (levelScore >= 1200) return 'Gold';
    if (levelScore >= 1000) return 'Silver';
    return 'Bronze';
}

export function tierColor(tier: BattleTier): string {
    switch (tier) {
        case 'Bronze':
            return 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200';
        case 'Silver':
            return 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100';
        case 'Gold':
            return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
        case 'Platinum':
            return 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200';
        case 'Diamond':
            return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200';
    }
}
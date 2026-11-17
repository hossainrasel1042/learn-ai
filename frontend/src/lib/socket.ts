

'use client';

import { io, type Socket } from 'socket.io-client';
import { CLIENT_BACKEND_ORIGIN } from '@/lib/client-api-base';

export interface ServerToClientEvents {
    'battle:matched': (data: {
        matchId: string;
        courseId: string;
        questionCount: number;
        durationMs: number;

        startedAt?: number;
        questions: BattleQuestionPayload[];
        opponent: { id: string; levelScore: number };
        you: string;

        scores?: Record<string, number>;

        answeredPositions?: number[];

        inactivitySec?: Record<string, number>;
    }) => void;
    'battle:score': (data: {
        matchId: string;
        scores: Record<string, number>;
        lastAnswer?: { userId: string; questionId: string; isCorrect: boolean };

        inactivitySec?: Record<string, number>;
    }) => void;

    'battle:inactivity': (data: {
        matchId: string;
        inactivitySec?: Record<string, number>;
    }) => void;
    'battle:ended': (data: {
        matchId: string;
        winner: string | null;
        reason: string;
        scores?: Record<string, number>;
    }) => void;
    'battle:error': (data: {
        message: string;

        fatal?: boolean;
    }) => void;
    'battle:rate-limit-rejected': (data: {
        action: string;
        retryAfterMs: number;
        limit: number;
        windowMs: number;
    }) => void;
    'battle:queue-timeout': (data: {
        courseId?: string;
        waitedMs?: number;
    }) => void;
    'battle:notification': (data: {
        id: string;
        matchId: string;
        kind: 'matched' | 'opponent_answered' | 'opponent_left' | 'ended';
        payload: Record<string, unknown>;
        createdAt: string;
    }) => void;
    'battle:invite': (data: {
        id: string;
        inviteId: string;
        kind:
            | 'invite'
            | 'invite_sent'
            | 'invite_declined'
            | 'invite_unavailable'
            | 'invite_expired'
            | 'invite_accepted';
        payload: Record<string, unknown>;
        createdAt: string;
    }) => void;
}

export interface ClientToServerEvents {
    'battle:queue': (payload: { courseId: string }) => void;
    'battle:cancel': () => void;

    'battle:join': (payload: { matchId: string }) => void;
    'battle:answer': (payload: {
        matchId: string;
        questionId: string;
        selected: 'A' | 'B' | 'C' | 'D';
        timeSeconds?: number;
    }) => void;
    'battle:ping': (payload: { matchId: string }) => void;
    'battle:leave': (payload: { matchId: string }) => void;
}

export interface BattleQuestionPayload {
    id: string;
    matchId: string;
    position: number;
    prompt: string;
    optionA: string;
    optionB: string;
    optionC: string;
    optionD: string;
    tags: string[];
    difficulty: 'easy' | 'medium' | 'hard' | null;
}

let _socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

export function getSocket(): Socket<ServerToClientEvents, ClientToServerEvents> {
    if (typeof window === 'undefined') {
        throw new Error('getSocket() must be called from the client');
    }
    if (!_socket) {
        const url = CLIENT_BACKEND_ORIGIN;
        _socket = io(url, {
            withCredentials: true,
            transports: ['websocket', 'polling'],
            autoConnect: true,
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
        });
    }
    return _socket;
}

export function disconnectSocket() {
    if (_socket) {
        _socket.disconnect();
        _socket = null;
    }
}
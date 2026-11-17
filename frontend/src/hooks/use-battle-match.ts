

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { getSocket } from '@/lib/socket';
import type {
    BattlePhase,
    BattleQuestion,
    EndedReason,
} from '@/types/quiz-battle';

const HEARTBEAT_MS = 5_000;

const QUEUE_TIMEOUT_MS = 60_000;

interface UseBattleMatchOptions {

    matchId?: string;

    you?: string | null;

    durationMs?: number;

    questionCount?: number;

    initialQuestions?: BattleQuestion[];
}

interface MatchedPayload {
    matchId: string;
    courseId: string;
    questionCount: number;
    durationMs: number;

    startedAt?: number;
    questions: BattleQuestion[];
    opponent: { id: string; levelScore: number };
    you: string;

    scores?: Record<string, number>;

    answeredPositions?: number[];

    inactivitySec?: Record<string, number>;
}

interface UseBattleMatchResult {
    phase: BattlePhase;
    matchId: string | null;

    you: string | null;
    opponent: { id: string; levelScore: number } | null;
    questions: BattleQuestion[];
    index: number;
    total: number;
    current: BattleQuestion | null;
    scores: Record<string, number>;
    myScore: number;
    opponentScore: number;
    selected: 'A' | 'B' | 'C' | 'D' | null;
    error: string | null;

    rateLimit: { action: string; retryAfterMs: number } | null;
    result: {
        winner: string | null;
        reason: EndedReason | null;
        scores: Record<string, number>;
    } | null;

    elapsedSec: number;

    queueRemainingSec: number;

    myInactivitySec: number;

    opponentInactivitySec: number;
    startedAt: number;
    select: (letter: 'A' | 'B' | 'C' | 'D') => void;
    enqueue: (courseId: string) => void;
    cancelQueue: () => void;
    retryQueue: () => void;

    joinMatch: (matchId: string, force?: boolean) => void;
    leave: () => void;
}

const EMPTY_RESULT = {
    winner: null as string | null,
    reason: null as EndedReason | null,
    scores: {} as Record<string, number>,
};

export function useBattleMatch(options: UseBattleMatchOptions = {}): UseBattleMatchResult {
    const {
        matchId: initialMatchId,
        you: initialYou,
        durationMs: initialDuration,
        questionCount: initialQuestionCount,
        initialQuestions,
    } = options;

    const [phase, setPhaseState] = useState<BattlePhase>(initialMatchId ? 'matched' : 'idle');
    const [matchId, setMatchId] = useState<string | null>(initialMatchId ?? null);
    const [opponent, setOpponent] = useState<{ id: string; levelScore: number } | null>(null);
    const [questions, setQuestions] = useState<BattleQuestion[]>(initialQuestions ?? []);
    const [index, setIndex] = useState(0);

    const currentIndexRef = useRef(0);
    const [scores, setScores] = useState<Record<string, number>>({});
    const [you, setYou] = useState<string | null>(initialYou ?? null);
    const [selected, setSelected] = useState<'A' | 'B' | 'C' | 'D' | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [rateLimit, setRateLimit] = useState<UseBattleMatchResult['rateLimit']>(null);
    const [result, setResult] = useState<UseBattleMatchResult['result']>(null);
    const [elapsedSec, setElapsedSec] = useState(0);

    const [inactivitySec, setInactivitySec] = useState<Record<string, number>>({});

    const [queueRemainingSec, setQueueRemainingSec] = useState(QUEUE_TIMEOUT_MS / 1000);
    const [queuedCourseId, setQueuedCourseId] = useState<string | null>(null);

    const startedAtRef = useRef<number>(0);
    const [startedAt, setStartedAt] = useState<number>(0);
    const socketRef = useRef(getSocket());
    const inFlightRef = useRef(false);

    const inFlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const countdownTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

    const rateLimitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const queueTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const queueTickRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const matchIdRef = useRef<string | null>(initialMatchId ?? null);
    const youRef = useRef<string | null>(initialYou ?? null);

    const questionsCountRef = useRef<number>(0);

    const deadlineRef = useRef<number>(0);

    const joinedMatchRef = useRef<string | null>(null);

    const inMatchRef = useRef<string | null>(null);

    const hasConnectedRef = useRef(false);

    const leftMatchRef = useRef<string | null>(null);

    const questionShownAtRef = useRef<number>(0);

    const leaveRef = useRef<(id: string) => void>(() => {});

    const phaseRef = useRef<BattlePhase>(initialMatchId ? 'matched' : 'idle');
    const current = index < questions.length ? questions[index] : null;


    const setPhase = useCallback((next: BattlePhase) => {
        phaseRef.current = next;
        setPhaseState(next);
    }, []);


    useEffect(() => {
        if (initialQuestions && initialQuestions.length > 0) {
            questionsCountRef.current = initialQuestions.length;
        }
    }, [initialQuestions]);





    const startHeartbeat = useCallback((mid: string) => {
        if (heartbeatRef.current) clearInterval(heartbeatRef.current);
        heartbeatRef.current = setInterval(() => {
            socketRef.current.emit('battle:ping', { matchId: mid });
        }, HEARTBEAT_MS);
    }, []);

    const stopHeartbeat = useCallback(() => {
        if (heartbeatRef.current) {
            clearInterval(heartbeatRef.current);
            heartbeatRef.current = null;
        }
    }, []);

    const startElapsedTimer = useCallback(() => {
        if (elapsedTimerRef.current) return;











        if (!startedAtRef.current) {
            startedAtRef.current = Date.now();
            setStartedAt(startedAtRef.current);
        }
        elapsedTimerRef.current = setInterval(() => {
            setElapsedSec(Math.floor((Date.now() - startedAtRef.current) / 1000));
        }, 250);
    }, []);

    const stopElapsedTimer = useCallback(() => {
        if (elapsedTimerRef.current) {
            clearInterval(elapsedTimerRef.current);
            elapsedTimerRef.current = null;
        }
    }, []);


    const clearCountdownTimers = useCallback(() => {
        for (const t of countdownTimersRef.current) clearTimeout(t);
        countdownTimersRef.current = [];
    }, []);


    const stopQueueTimers = useCallback(() => {
        if (queueTimeoutRef.current) {
            clearTimeout(queueTimeoutRef.current);
            queueTimeoutRef.current = null;
        }
        if (queueTickRef.current) {
            clearInterval(queueTickRef.current);
            queueTickRef.current = null;
        }
    }, []);


    const startQueueTimers = useCallback(() => {
        stopQueueTimers();
        const deadline = Date.now() + QUEUE_TIMEOUT_MS;
        setQueueRemainingSec(QUEUE_TIMEOUT_MS / 1000);
        queueTickRef.current = setInterval(() => {
            setQueueRemainingSec(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
        }, 250);
        queueTimeoutRef.current = setTimeout(() => {
            stopQueueTimers();
            setQueueRemainingSec(0);
            socketRef.current.emit('battle:cancel');
            setPhase('queue_timeout');
        }, QUEUE_TIMEOUT_MS);
    }, [setPhase, stopQueueTimers]);





    useEffect(() => {
        const socket = socketRef.current;
        if (!socket) return;

        const onMatched = (data: MatchedPayload) => {
            stopQueueTimers();
            setQueuedCourseId(null);
            matchIdRef.current = data.matchId;
            youRef.current = data.you;
            setMatchId(data.matchId);
            setQuestions(data.questions);
            questionsCountRef.current = data.questions.length;
            setOpponent(data.opponent);
            setYou(data.you);


            setScores(data.scores ?? { [data.you]: 0, [data.opponent.id]: 0 });
















            const answered = new Set(data.answeredPositions ?? []);
            const nextUnanswered = data.questions.findIndex(
                (q) => !answered.has(q.position),
            );
            const resumeIndex =
                nextUnanswered === -1
                    ? Math.max(0, data.questions.length - 1)
                    : nextUnanswered;
            currentIndexRef.current = resumeIndex;
            setIndex(resumeIndex);
            setSelected(null);
            setResult(null);
            setError(null);
            if (data.inactivitySec) setInactivitySec(data.inactivitySec);


            questionShownAtRef.current = Date.now();







            const durationMs = data.durationMs || 10 * 60 * 1000;
            const startedAt = data.startedAt ?? Date.now();
            startedAtRef.current = startedAt;
            setStartedAt(startedAt);




            setElapsedSec(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));




            deadlineRef.current = startedAt + durationMs;
            setPhase('matched');


            clearCountdownTimers();
            countdownTimersRef.current = [
                setTimeout(() => setPhase('countdown'), 250),
                setTimeout(() => {
                    setPhase('in_progress');
                    startElapsedTimer();
                }, 3_250),
            ];
            startHeartbeat(data.matchId);
        };

        const onScore = (data: {
            matchId: string;
            scores: Record<string, number>;
            lastAnswer?: { userId: string; questionId: string; isCorrect: boolean };

            inactivitySec?: Record<string, number>;
        }) => {











            const current = matchIdRef.current;
            if (current && data.matchId !== current) return;

            setScores(data.scores);


            if (data.inactivitySec) setInactivitySec(data.inactivitySec);








            const mine =
                data.lastAnswer && data.lastAnswer.userId === youRef.current;
            if (!mine) return;







            inFlightRef.current = false;

            setSelected(null);








            setError(null);















            const last = questionsCountRef.current - 1;





            if (currentIndexRef.current < last) {
                questionShownAtRef.current = Date.now();
                currentIndexRef.current += 1;
            }
            setIndex((i) => (i < last ? i + 1 : i));
        };


        const onInactivity = (data: {
            matchId: string;
            inactivitySec?: Record<string, number>;
        }) => {
            const current = matchIdRef.current;
            if (current && data.matchId !== current) return;
            if (data.inactivitySec) setInactivitySec(data.inactivitySec);
        };

        const onEnded = (data: {
            matchId: string;
            winner: string | null;
            reason: string;
            scores?: Record<string, number>;
        }) => {
            const current = matchIdRef.current;
            if (current && data.matchId !== current) return;
            stopHeartbeat();
            stopElapsedTimer();
            clearCountdownTimers();
            setScores(data.scores || {});
            setResult({
                winner: data.winner,
                reason: (data.reason as EndedReason) || 'completed',
                scores: data.scores || {},
            });
            setPhase('finished');
        };

        const onQueueTimeout = (data: { courseId?: string; waitedMs?: number }) => {
            stopQueueTimers();
            setQueueRemainingSec(0);
            if (data?.courseId) setQueuedCourseId(data.courseId);
            setPhase('queue_timeout');
        };

        const onError = (data: { message: string; fatal?: boolean }) => {
            setError(data.message || 'Realtime error');










            if (data.fatal === false) {


                if (phaseRef.current === 'queued') setPhase('idle');
                return;
            }






            if (!matchIdRef.current) {
                setPhase('idle');
                return;
            }
            setPhase('error');
        };

        const onRateLimit = (data: { action: string; retryAfterMs: number }) => {


            setRateLimit({ action: data.action, retryAfterMs: data.retryAfterMs });
            if (rateLimitTimerRef.current) clearTimeout(rateLimitTimerRef.current);
            rateLimitTimerRef.current = setTimeout(
                () => {
                    rateLimitTimerRef.current = null;
                    setRateLimit((cur) => (cur && cur.action === data.action ? null : cur));
                },
                Math.min(data.retryAfterMs, 4000),
            );
        };


        const onConnect = () => {





            const firstConnect = !hasConnectedRef.current;
            hasConnectedRef.current = true;

            const current = matchIdRef.current;
            if (!current) return;













            if (firstConnect) {


                return;
            }
            joinedMatchRef.current = null;


            inMatchRef.current = current;
            leftMatchRef.current = null;
            socket.emit('battle:join', { matchId: current });
        };

        socket.on('connect', onConnect);
        socket.on('battle:matched', onMatched);
        socket.on('battle:score', onScore);
        socket.on('battle:inactivity', onInactivity);
        socket.on('battle:ended', onEnded);
        socket.on('battle:error', onError);
        socket.on('battle:rate-limit-rejected', onRateLimit);
        socket.on('battle:queue-timeout', onQueueTimeout);

        return () => {
            socket.off('connect', onConnect);
            socket.off('battle:matched', onMatched);
            socket.off('battle:score', onScore);
            socket.off('battle:inactivity', onInactivity);
            socket.off('battle:ended', onEnded);
            socket.off('battle:error', onError);
            socket.off('battle:rate-limit-rejected', onRateLimit);
            socket.off('battle:queue-timeout', onQueueTimeout);
            stopQueueTimers();
            stopHeartbeat();
            stopElapsedTimer();





            clearCountdownTimers();

            if (inFlightTimerRef.current) {
                clearTimeout(inFlightTimerRef.current);
                inFlightTimerRef.current = null;
            }

            if (rateLimitTimerRef.current) {
                clearTimeout(rateLimitTimerRef.current);
                rateLimitTimerRef.current = null;
            }
        };





        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);





    const enqueue = useCallback((courseId: string) => {
        setPhase('queued');
        setError(null);
        setQueuedCourseId(courseId);
        startQueueTimers();
        socketRef.current.emit('battle:queue', { courseId });
    }, [setPhase, startQueueTimers]);

    const cancelQueue = useCallback(() => {
        stopQueueTimers();
        socketRef.current.emit('battle:cancel');
        setQueuedCourseId(null);
        setPhase('idle');
    }, [setPhase, stopQueueTimers]);

    const retryQueue = useCallback(() => {
        const courseId = queuedCourseId;
        if (!courseId) {
            setPhase('idle');
            return;
        }
        setPhase('queued');
        setError(null);
        setQueueRemainingSec(QUEUE_TIMEOUT_MS / 1000);
        startQueueTimers();
        socketRef.current.emit('battle:queue', { courseId });
    }, [queuedCourseId, setPhase, startQueueTimers]);


    const joinMatch = useCallback((id: string, force = false) => {
        if (!id) return;
        const socket = socketRef.current;























        if (!force && joinedMatchRef.current === id) return;
        joinedMatchRef.current = id;
        matchIdRef.current = id;


        inMatchRef.current = id;


        leftMatchRef.current = null;
        socket.emit('battle:join', { matchId: id });
    }, []);

    const select = useCallback(
        (letter: 'A' | 'B' | 'C' | 'D') => {








            if (!current || !matchId || phase !== 'in_progress') return;


            if (deadlineRef.current && Date.now() >= deadlineRef.current) return;
            if (inFlightRef.current) return;
            inFlightRef.current = true;
            setSelected(letter);








            const tSec = questionShownAtRef.current
                ? Math.max(0, Math.round((Date.now() - questionShownAtRef.current) / 1000))
                : 0;
            socketRef.current.emit('battle:answer', {
                matchId,
                questionId: current.id,
                selected: letter,
                timeSeconds: tSec,
            });














            if (inFlightTimerRef.current) clearTimeout(inFlightTimerRef.current);
            inFlightTimerRef.current = setTimeout(() => {
                inFlightRef.current = false;
                inFlightTimerRef.current = null;
            }, 5_000);
        },
        [current, matchId, phase],
    );

    const leave = useCallback(() => {




        const id = inMatchRef.current;
        if (!id) return;




        if (leftMatchRef.current === id) return;
        leftMatchRef.current = id;

        inMatchRef.current = null;
        socketRef.current.emit('battle:leave', { matchId: id });
    }, []);
    leaveRef.current = leave;






    useEffect(() => {
        return () => {






            const id = inMatchRef.current;
            if (id && phaseRef.current !== 'finished') {

                leaveRef.current(id);
            }
        };
    }, []);




    const myScore = you ? scores[you] ?? 0 : 0;
    const opponentScore = opponent ? scores[opponent.id] ?? 0 : 0;




    const myInactivitySec = you ? inactivitySec[you] ?? 0 : 0;
    const opponentInactivitySec = opponent ? inactivitySec[opponent.id] ?? 0 : 0;
    const total = questions.length || initialQuestionCount || 0;

    return {
        phase,
        matchId,
        you,
        opponent,
        questions,
        index,
        total,
        current,
        scores,
        myScore,
        opponentScore,
        selected,
        error,
        rateLimit,
        result: result ?? EMPTY_RESULT,
        elapsedSec,
        queueRemainingSec,
        myInactivitySec,
        opponentInactivitySec,
        startedAt,
        select,
        enqueue,
        cancelQueue,
        retryQueue,
        joinMatch,
        leave,
    };
}


'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  finishAttempt,
  startAttempt,
  submitAnswer,
} from '@/lib/quiz-api';
import type {
  FinishAttemptResponse,
  QuizAttempt,
  QuizLetter,
  QuizQuestion,
  StartAttemptResponse,
  SubmitAnswerResponse,
} from '@/types/quiz';

export type QuizPhase =
  | 'loading'
  | 'intro'
  | 'in_progress'
  | 'feedback'
  | 'submitting'
  | 'finishing'
  | 'done'
  | 'error';

export interface QuizSessionResult {
  score: number;
  correctCount: number;
  total: number;
  weakTopics: string[];
  srsDeckId: string | null;
  wrongQuestions: QuizQuestion[];
  durationSeconds: number | null;
}

interface UseQuizSessionOptions {
  quizSetId: string;
}

interface UseQuizSessionResult {
  phase: QuizPhase;
  attempt: QuizAttempt | null;
  questions: QuizQuestion[];
  current: QuizQuestion | null;
  index: number;
  total: number;
  selected: QuizLetter | null;
  feedback: SubmitAnswerResponse | null;
  result: QuizSessionResult | null;
  error: string | null;
  startedAt: number;

  start: () => void;
  select: (letter: QuizLetter) => void;

  next: () => void;

  finish: () => Promise<void>;
  restart: () => Promise<void>;
}

const EMPTY_RESULT: QuizSessionResult = {
  score: 0,
  correctCount: 0,
  total: 0,
  weakTopics: [],
  srsDeckId: null,
  wrongQuestions: [],
  durationSeconds: null,
};

export function useQuizSession({
  quizSetId,
}: UseQuizSessionOptions): UseQuizSessionResult {
  const [phase, setPhase] = useState<QuizPhase>('loading');
  const [attempt, setAttempt] = useState<QuizAttempt | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<QuizLetter | null>(null);
  const [feedback, setFeedback] = useState<SubmitAnswerResponse | null>(null);
  const [result, setResult] = useState<QuizSessionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const startedAtRef = useRef<number>(Date.now());
  const [startedAt, setStartedAt] = useState<number>(Date.now());
  const inFlightRef = useRef(false);

  const startSession = useCallback(async () => {
    setPhase('loading');
    setError(null);
    try {
      const res: StartAttemptResponse = await startAttempt(quizSetId);
      setAttempt(res.attempt);
      setQuestions(res.questions);
      setIndex(0);
      setSelected(null);
      setFeedback(null);
      setResult(null);
      startedAtRef.current = Date.now();
      setStartedAt(startedAtRef.current);
      setPhase('intro');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start quiz');
      setPhase('error');
    }
  }, [quizSetId]);

  useEffect(() => {
    void startSession();
  }, [startSession]);

  const current = index < questions.length ? questions[index] : null;

  const start = useCallback(() => {
    if (phase === 'intro') setPhase('in_progress');
  }, [phase]);

  const select = useCallback(
    async (letter: QuizLetter) => {
      if (!current || !attempt || inFlightRef.current) return;
      if (phase !== 'in_progress') return;
      inFlightRef.current = true;
      setSelected(letter);
      setPhase('submitting');
      const tSec = Math.max(0, Math.round((Date.now() - startedAtRef.current) / 1000));
      try {
        const res = await submitAnswer(attempt.id, current.id, letter, tSec);
        setFeedback(res);
        setPhase('feedback');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to submit answer');
        setPhase('in_progress');
        setSelected(null);
      } finally {
        inFlightRef.current = false;
      }
    },
    [current, attempt, phase],
  );

  const next = useCallback(() => {
    if (phase !== 'feedback') return;
    setSelected(null);
    setFeedback(null);
    const nextIndex = index + 1;
    if (nextIndex >= questions.length) {

      void finishInternal();
      return;
    }
    setIndex(nextIndex);
    setPhase('in_progress');
  }, [phase, index, questions.length]);

  const finishInternal = useCallback(async () => {
    if (!attempt) return;

    if (phase === 'done' || phase === 'finishing') return;
    setPhase('finishing');
    try {
      const duration = Math.max(0, Math.round((Date.now() - startedAtRef.current) / 1000));
      const res: FinishAttemptResponse = await finishAttempt(attempt.id, duration, true);
      setResult({
        score: res.attempt.score,
        correctCount: res.attempt.correctCount,
        total: res.attempt.total,
        weakTopics: res.weakTopics,
        srsDeckId: res.srsDeck?.id ?? null,
        wrongQuestions: res.wrongQuestions ?? [],
        durationSeconds: duration,
      });
      setAttempt(res.attempt);
      setPhase('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to finish quiz');
      setPhase('done');
    }
  }, [attempt, phase]);

  const finish = useCallback(async () => {
    await finishInternal();
  }, [finishInternal]);

  const restart = useCallback(async () => {
    await startSession();
  }, [startSession]);

  return {
    phase,
    attempt,
    questions,
    current,
    index,
    total: questions.length,
    selected,
    feedback,
    result: result ?? EMPTY_RESULT,
    error,
    startedAt,
    start,
    select,
    next,
    finish,
    restart,
  };
}
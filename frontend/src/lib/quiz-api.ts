

import type {
  CreateQuizSetInput,
  FinishAttemptResponse,
  GenerateQuestionsInput,
  QuizAnswer,
  QuizAttempt,
  QuizQuestion,
  QuizSet,
  QuizSetDetailResponse,
  QuizSetListResponse,
  QuizSetStats,
  StartAttemptResponse,
  SubmitAnswerResponse,
  UserQuizStats,
} from '@/types/quiz';
import { CLIENT_API_BASE_URL } from '@/lib/client-api-base';

const API_BASE_URL = CLIENT_API_BASE_URL;

async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });




  if (response.status === 204) {
    return undefined as unknown as T;
  }
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Request failed' }));
    throw new Error(error.detail || 'Request failed');
  }


  const text = await response.text();
  if (!text) return undefined as unknown as T;
  return JSON.parse(text) as T;
}





export async function createQuizSet(input: CreateQuizSetInput): Promise<{ set: QuizSet }> {
  return apiRequest('/quiz/sets', { method: 'POST', body: JSON.stringify(input) });
}

export async function listQuizSets(page = 1, pageSize = 20): Promise<QuizSetListResponse> {
  const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  return apiRequest(`/quiz/sets?${qs.toString()}`);
}

export async function getQuizSet(quizSetId: string): Promise<QuizSetDetailResponse> {
  return apiRequest(`/quiz/sets/${quizSetId}`);
}

export async function deleteQuizSet(quizSetId: string): Promise<void> {
  await apiRequest<void>(`/quiz/sets/${quizSetId}`, { method: 'DELETE' });
}


export interface GenerateQuestionsResult {
  inserted: number;
  questions: QuizQuestion[];
  generatedBy?: 'ai' | 'local';
}

export async function generateQuestions(
  quizSetId: string,
  input: GenerateQuestionsInput,
): Promise<GenerateQuestionsResult> {
  return apiRequest(`/quiz/sets/${quizSetId}/generate`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function getQuizSetStats(quizSetId: string): Promise<QuizSetStats> {
  return apiRequest(`/quiz/sets/${quizSetId}/stats`);
}





export async function startAttempt(quizSetId: string): Promise<StartAttemptResponse> {
  return apiRequest('/quiz/attempts', {
    method: 'POST',
    body: JSON.stringify({ quizSetId }),
  });
}

export async function submitAnswer(
  attemptId: string,
  questionId: string,
  selected: 'A' | 'B' | 'C' | 'D',
  timeSeconds?: number,
): Promise<SubmitAnswerResponse> {
  return apiRequest(`/quiz/attempts/${attemptId}/answers`, {
    method: 'POST',
    body: JSON.stringify({ questionId, selected, timeSeconds }),
  });
}

export async function finishAttempt(
  attemptId: string,
  durationSeconds?: number,
  createSrsDeck = true,
): Promise<FinishAttemptResponse> {
  return apiRequest(`/quiz/attempts/${attemptId}/finish`, {
    method: 'POST',
    body: JSON.stringify({ durationSeconds, createSrsDeck }),
  });
}

export async function getAttempt(
  attemptId: string,
): Promise<{ attempt: QuizAttempt; answers: QuizAnswer[]; questions: QuizQuestion[] }> {
  return apiRequest(`/quiz/attempts/${attemptId}`);
}

export async function listAttempts(
  quizSetId: string,
  page = 1,
  pageSize = 20,
): Promise<{ attempts: QuizAttempt[]; total: number; page: number; pageSize: number }> {
  const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  return apiRequest(`/quiz/sets/${quizSetId}/attempts?${qs.toString()}`);
}

export async function convertAttemptToSrs(
  attemptId: string,
): Promise<{ srsDeck: { id: string; title: string } | null; inserted: number }> {
  return apiRequest(`/quiz/attempts/${attemptId}/to-srs`, { method: 'POST' });
}

export async function getUserStats(): Promise<UserQuizStats> {
  return apiRequest('/quiz/stats');
}
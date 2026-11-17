

import { z } from 'zod';

const uuid = z.string().uuid();
const SOURCE_TYPES = ['course', 'chat', 'manual'];
const DIFFICULTIES = ['easy', 'medium', 'hard'];
const SELECTED = ['A', 'B', 'C', 'D'];






export const CreateQuizSetRequest = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  sourceType: z.enum(SOURCE_TYPES).optional(),
  sourceId: uuid.optional(),
});


export const GenerateQuestionsRequest = z.object({
  sourceType: z.enum(SOURCE_TYPES).default('manual'),
  sourceId: uuid.optional(),
  text: z.string().min(50).optional(),
  questionCount: z.number().int().min(1).max(30).default(10),
  difficulty: z.enum(DIFFICULTIES).optional(),
});


export const StartAttemptRequest = z.object({
  quizSetId: uuid,
});


export const SubmitAnswerRequest = z.object({
  questionId: uuid,
  selected: z.enum(SELECTED),
  timeSeconds: z.number().int().min(0).max(3600).optional(),
});


export const FinishAttemptRequest = z.object({
  durationSeconds: z.number().int().min(0).max(86400).optional(),
  createSrsDeck: z.boolean().default(true),
});


export const QuizSetIdParam = z.object({ quizSetId: uuid });
export const AttemptIdParam = z.object({ attemptId: uuid });


export const PaginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});





export const QuizSetSchema = z.object({
  id: z.string(),
  userId: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  sourceType: z.string().nullable(),
  sourceId: z.string().nullable(),
  questionCount: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const QuizQuestionSchema = z.object({
  id: z.string(),
  quizSetId: z.string(),
  userId: z.string(),
  position: z.number().int(),
  prompt: z.string(),
  optionA: z.string(),
  optionB: z.string(),
  optionC: z.string(),
  optionD: z.string(),
  correct: z.enum(SELECTED),
  explanation: z.string().nullable(),
  tags: z.array(z.string()),
  difficulty: z.string().nullable(),
  createdAt: z.string(),
});

export const QuizAttemptSchema = z.object({
  id: z.string(),
  quizSetId: z.string(),
  userId: z.string(),
  score: z.number().int(),
  total: z.number().int(),
  correctCount: z.number().int(),
  wrongTopics: z.array(z.string()),
  srsDeckId: z.string().nullable(),
  durationSeconds: z.number().int().nullable(),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
});

export const QuizAnswerSchema = z.object({
  id: z.string(),
  attemptId: z.string(),
  questionId: z.string(),
  userId: z.string(),
  selected: z.enum(SELECTED),
  isCorrect: z.boolean(),
  timeSeconds: z.number().int().nullable(),
  answeredAt: z.string(),
});

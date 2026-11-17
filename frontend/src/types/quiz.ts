

export type SourceType = 'course' | 'chat' | 'manual';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type QuizLetter = 'A' | 'B' | 'C' | 'D';

export interface QuizSet {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  sourceType: string | null;
  sourceId: string | null;
  questionCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface QuizQuestion {
  id: string;
  quizSetId: string;
  userId: string;
  position: number;
  prompt: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correct: QuizLetter;
  explanation: string | null;
  tags: string[];
  difficulty: string | null;
  createdAt: string;
}

export interface QuizAttempt {
  id: string;
  quizSetId: string;
  userId: string;
  score: number;
  total: number;
  correctCount: number;
  wrongTopics: string[];
  srsDeckId: string | null;
  durationSeconds: number | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface QuizAnswer {
  id: string;
  attemptId: string;
  questionId: string;
  userId: string;
  selected: QuizLetter;
  isCorrect: boolean;
  timeSeconds: number | null;
  answeredAt: string;
}

export interface QuizSetStats {
  attempts: number;
  best_score: number;
  avg_score: number;
  total_correct: number;
  total_questions: number;
  last_taken: string | null;
}

export interface UserQuizStats {
  attempts: number;
  avgScore: number;
  accuracy: number | null;
  totalCorrect: number;
  totalQuestions: number;
  lastTaken: string | null;
}

export interface QuizSetListResponse {
  sets: QuizSet[];
  total: number;
  page: number;
  pageSize: number;
}

export interface QuizSetDetailResponse {
  set: QuizSet;
  questions: QuizQuestion[];
  stats: QuizSetStats;
}

export interface StartAttemptResponse {
  attempt: QuizAttempt;
  questions: QuizQuestion[];
}

export interface SubmitAnswerResponse {
  answer: QuizAnswer;
  isCorrect: boolean;
  correct: QuizLetter;
  correctText: string | null;
  explanation: string | null;
}

export interface FinishAttemptResponse {
  attempt: QuizAttempt;
  srsDeck: { id: string; title: string } | null;
  wrongQuestions: QuizQuestion[];
  weakTopics: string[];
}

export interface CreateQuizSetInput {
  title: string;
  description?: string;
  sourceType?: SourceType;
  sourceId?: string;
}

export interface GenerateQuestionsInput {
  sourceType: SourceType;
  sourceId?: string;
  text?: string;
  questionCount?: number;
  difficulty?: Difficulty;
}

export interface QuizSessionResult {
  attempt: QuizAttempt;
  srsDeckId: string | null;
  weakTopics: string[];
}
'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Sparkles,
  Trophy,
  XCircle,
  X as XIcon,
  RotateCcw,
  Brain,
  Circle,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

import { useQuizSession } from '@/hooks/use-quiz-session';
import type { QuizLetter, QuizQuestion } from '@/types/quiz';

const LETTERS: QuizLetter[] = ['A', 'B', 'C', 'D'];

export default function TakeQuizPage() {
  const params = useParams<{ quizSetId: string }>();
  const quizSetId = params.quizSetId;
  const router = useRouter();

  const session = useQuizSession({ quizSetId });

  const {
    phase,
    current,
    index,
    total,
    selected,
    feedback,
    result,
    error,
    start,
    select,
    next,
    restart,
  } = session;


  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (phase === 'intro' && e.key === ' ') {
        e.preventDefault();
        start();
      } else if (phase === 'in_progress' && ['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault();
        const letter = (['A', 'B', 'C', 'D'][Number(e.key) - 1] ?? 'A') as QuizLetter;
        void select(letter);
      } else if (phase === 'feedback' && (e.key === 'Enter' || e.key === 'ArrowRight')) {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [phase, start, select, next]);

  const progressPct = total > 0 ? Math.round(((index + (phase === 'done' ? 1 : 0)) / total) * 100) : 0;

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/quizzes/${quizSetId}`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to quiz
          </Link>
        </Button>
        {total > 0 && (
          <div className="text-sm text-muted-foreground">
            {phase === 'done' ? total : index + 1} / {total}
          </div>
        )}
      </div>

      {total > 0 && phase !== 'loading' && phase !== 'error' && (
        <Progress value={progressPct} className="mb-6" />
      )}

      {phase === 'loading' && (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin mb-3" />
          Preparing your quiz...
        </div>
      )}

      {phase === 'error' && (
        <Card>
          <CardContent className="py-12 text-center">
            <XCircle className="h-10 w-10 mx-auto mb-3 text-destructive" />
            <p className="font-medium mb-4">{error || 'Failed to start quiz'}</p>
            <Button onClick={restart}>Try again</Button>
          </CardContent>
        </Card>
      )}

      {phase === 'intro' && (
        <IntroView total={total} onStart={start} />
      )}

      {(phase === 'in_progress' || phase === 'submitting') && current && (
        <QuestionView
          question={current}
          index={index}
          total={total}
          selected={selected}
          phase={phase}
          onSelect={select}
        />
      )}

      {phase === 'feedback' && current && feedback && (
        <FeedbackView
          question={current}
          selected={feedback.answer.selected}
          isCorrect={feedback.answer.isCorrect}
          correct={feedback.correct}
          correctText={feedback.correctText}
          explanation={feedback.explanation}
          onNext={next}
          isLast={index === total - 1}
        />
      )}

      {(phase === 'finishing' || phase === 'done') && (
        <DoneView
          result={result}
          error={error}
          onRestart={restart}
          onBackToQuiz={() => router.push(`/quizzes/${quizSetId}`)}
        />
      )}
    </div>
  );
}





function IntroView({ total, onStart }: { total: number; onStart: () => void }) {
  return (
    <Card className="learn-slide-up">
      <CardContent className="py-12 text-center">
        <div className="rounded-full bg-primary/10 p-3 w-fit mx-auto mb-4">
          <Brain className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Ready?</h2>
        <p className="text-muted-foreground mb-6">
          {total} multiple-choice questions. After each answer you&apos;ll see if you got it
          right and why.
        </p>
        <Button size="lg" onClick={onStart}>
          Start quiz
          <kbd className="ml-3 text-[10px] opacity-60 font-mono border rounded px-1">Space</kbd>
        </Button>
      </CardContent>
    </Card>
  );
}

function QuestionView({
  question,
  index,
  total,
  selected,
  phase,
  onSelect,
}: {
  question: QuizQuestion;
  index: number;
  total: number;
  selected: QuizLetter | null;
  phase: string;
  onSelect: (l: QuizLetter) => void;
}) {
  const options: Array<{ letter: QuizLetter; text: string }> = [
    { letter: 'A', text: question.optionA },
    { letter: 'B', text: question.optionB },
    { letter: 'C', text: question.optionC },
    { letter: 'D', text: question.optionD },
  ];

  return (
    <Card className="learn-slide-up">
      <CardContent className="p-8">
        <div className="flex items-center justify-between mb-4 text-xs uppercase tracking-wide text-muted-foreground">
          <span>Question {index + 1} of {total}</span>
          {question.difficulty && (
            <Badge variant="secondary" className="capitalize">
              {question.difficulty}
            </Badge>
          )}
        </div>

        <div className="text-xl md:text-2xl font-medium mb-8 leading-snug">
          {question.prompt}
        </div>

        <RadioGroup
          value={selected ?? ''}
          onValueChange={(v) => onSelect(v as QuizLetter)}
          className="space-y-2"
        >
          {options.map(({ letter, text }) => {
            const id = `q-${question.id}-${letter}`;
            const isSelected = selected === letter;
            return (
              <Label
                key={letter}
                htmlFor={id}
                className={cn(
                  'flex items-start gap-3 rounded-lg border p-4 cursor-pointer transition-all',
                  isSelected
                    ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                    : 'hover:border-primary/40 hover:bg-accent/30',
                  phase === 'submitting' && 'pointer-events-none opacity-60',
                )}
              >
                <RadioGroupItem value={letter} id={id} className="mt-0.5" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{letter}.</span>
                    <span>{text}</span>
                  </div>
                </div>
                <kbd className="text-[10px] opacity-40 font-mono border rounded px-1 self-center">
                  {LETTERS.indexOf(letter) + 1}
                </kbd>
              </Label>
            );
          })}
        </RadioGroup>

        {phase === 'submitting' && (
          <div className="mt-4 flex items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Saving answer...
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FeedbackView({
  question,
  selected,
  isCorrect,
  correct,
  correctText,
  explanation,
  onNext,
  isLast,
}: {
  question: QuizQuestion;
  selected: QuizLetter;
  isCorrect: boolean;
  correct: QuizLetter;
  correctText: string | null;
  explanation: string | null;
  onNext: () => void;
  isLast: boolean;
}) {
  const options: Array<{ letter: QuizLetter; text: string }> = [
    { letter: 'A', text: question.optionA },
    { letter: 'B', text: question.optionB },
    { letter: 'C', text: question.optionC },
    { letter: 'D', text: question.optionD },
  ];

  return (
    <Card className="learn-slide-up">
      <CardContent className="p-8">
        <div
          className={cn(
            'rounded-lg p-3 mb-4 flex items-center gap-2 text-sm font-medium',
            isCorrect
              ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100'
              : 'bg-rose-100 text-rose-900 dark:bg-rose-950/40 dark:text-rose-100',
          )}
        >
          {isCorrect ? (
            <CheckCircle2 className="h-5 w-5" />
          ) : (
            <XCircle className="h-5 w-5" />
          )}
          {isCorrect ? 'Correct!' : 'Not quite.'}
          {!isCorrect && correctText && (
            <span className="ml-1 font-normal opacity-80">
              Correct answer: <strong>{correct}</strong> — {correctText}
            </span>
          )}
        </div>

        <div className="text-lg md:text-xl font-medium mb-6 leading-snug">
          {question.prompt}
        </div>

        <div className="space-y-2 mb-6">
          {options.map(({ letter, text }) => {
            const isSelected = letter === selected;
            const isCorrectLetter = letter === correct;
            return (
              <div
                key={letter}
                className={cn(
                  'flex items-start gap-3 rounded-lg border p-3 text-sm',
                  isCorrectLetter
                    ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30'
                    : isSelected
                    ? 'border-rose-300 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/30'
                    : 'border-border bg-muted/30',
                )}
              >
                <div className="mt-0.5">
                  {isCorrectLetter ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  ) : isSelected ? (
                    <XIcon className="h-4 w-4 text-rose-600" />
                  ) : (
                    <Circle className="h-4 w-4 text-muted-foreground/40" />
                  )}
                </div>
                <div className="flex-1">
                  <span className="font-semibold mr-2">{letter}.</span>
                  {text}
                </div>
              </div>
            );
          })}
        </div>

        {explanation && (
          <div className="rounded-md border border-indigo-200 bg-indigo-50 dark:border-indigo-800 dark:bg-indigo-950/30 p-4 mb-6 text-sm">
            <div className="font-medium text-indigo-900 dark:text-indigo-100 mb-1">
              Why?
            </div>
            <p className="text-indigo-900/90 dark:text-indigo-100/90">{explanation}</p>
          </div>
        )}

        <div className="flex justify-end">
          <Button onClick={onNext}>
            {isLast ? 'See results' : 'Next question'}
            <ArrowRight className="ml-2 h-4 w-4" />
            <kbd className="ml-3 text-[10px] opacity-60 font-mono border rounded px-1">
              Enter
            </kbd>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function DoneView({
  result,
  error,
  onRestart,
  onBackToQuiz,
}: {
  result: ReturnType<typeof useQuizSession>['result'];
  error: string | null;
  onRestart: () => void | Promise<void>;
  onBackToQuiz: () => void;
}) {
  if (!result) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin mb-3" />
        Computing your score...
      </div>
    );
  }

  const scoreColor =
    result.score >= 80
      ? 'text-emerald-600'
      : result.score >= 50
      ? 'text-amber-600'
      : 'text-rose-600';

  return (
    <Card className="learn-slide-up">
      <CardContent className="py-12 text-center">
        <div className="rounded-full bg-primary/10 p-3 w-fit mx-auto mb-4">
          <Trophy className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-2xl font-bold mb-1">Quiz complete!</h2>
        <p className="text-muted-foreground mb-6">
          You got <strong className={scoreColor}>{result.correctCount}</strong> out of{' '}
          <strong>{result.total}</strong> correct.
        </p>

        <div className="text-7xl font-bold mb-2">
          <span className={scoreColor}>{result.score}%</span>
        </div>
        {result.durationSeconds !== null && (
          <p className="text-xs text-muted-foreground mb-6">
            Time: {result.durationSeconds}s
          </p>
        )}

        {result.srsDeckId && (
          <div className="rounded-md border border-indigo-200 bg-indigo-50 dark:border-indigo-800 dark:bg-indigo-950/30 p-4 mb-4 text-sm text-left">
            <div className="font-medium text-indigo-900 dark:text-indigo-100 mb-1 flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Auto-created review deck
            </div>
            <p className="text-indigo-900/90 dark:text-indigo-100/90 mb-2">
              We turned the {result.wrongQuestions.length} question
              {result.wrongQuestions.length === 1 ? '' : 's'} you missed into flashcards.
            </p>
            <Button asChild size="sm" variant="outline">
              <Link href={`/flashcards/${result.srsDeckId}`}>
                Review now →
              </Link>
            </Button>
          </div>
        )}

        {result.weakTopics.length > 0 && (
          <div className="mb-6">
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
              Topics to revisit
            </div>
            <div className="flex flex-wrap gap-1.5 justify-center">
              {result.weakTopics.map((t) => (
                <Badge key={t} variant="secondary" className="text-xs">
                  {t}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive mb-4">{error}</p>
        )}

        <div className="flex justify-center gap-2">
          <Button variant="outline" onClick={onRestart}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Try again
          </Button>
          <Button onClick={onBackToQuiz}>
            Back to quiz
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
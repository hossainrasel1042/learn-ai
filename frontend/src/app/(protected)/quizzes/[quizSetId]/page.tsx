'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Brain,
  CheckCircle2,
  Clock,
  Info,
  Loader2,
  Sparkles,
  Target,
  Trash2,
  Trophy,
  TrendingUp,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

import {
  deleteQuizSet,
  generateQuestions,
  getQuizSet,
  listAttempts,
} from '@/lib/quiz-api';
import type {
  QuizAttempt,
  QuizQuestion,
  QuizSet,
  QuizSetStats,
  SourceType,
} from '@/types/quiz';

export default function QuizDetailPage() {
  const params = useParams<{ quizSetId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const quizSetId = params.quizSetId;

  const [set, setSet] = useState<QuizSet | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [stats, setStats] = useState<QuizSetStats | null>(null);
  const [attempts, setAttempts] = useState<QuizAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genCount, setGenCount] = useState(10);



  useEffect(() => {
    if (searchParams.get('generatedBy') === 'local') {
      setNotice(
        'The AI quota for this project is exhausted, so these questions were '
        + 'built directly from your source material. They are still fully '
        + 'answerable — just less polished than AI-written ones.',
      );
    }
  }, [searchParams]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getQuizSet(quizSetId);
      setSet(res.set);
      setQuestions(res.questions);
      setStats(res.stats);

      try {
        const a = await listAttempts(quizSetId, 1, 20);
        setAttempts(a.attempts);
      } catch {

      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load quiz');
    } finally {
      setLoading(false);
    }
  }, [quizSetId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDelete = async () => {
    try {
      await deleteQuizSet(quizSetId);
      router.push('/quizzes');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete');
    }
  };

  const handleGenerateMore = async () => {
    setGenerating(true);
    setNotice(null);
    try {
      const sourceType = (set?.sourceType as SourceType) || 'manual';
      const result = await generateQuestions(quizSetId, {
        sourceType,





        sourceId: sourceType === 'manual' ? undefined : set?.sourceId ?? undefined,
        questionCount: genCount,
      });
      if (result.generatedBy === 'local') {
        setNotice(
          'The AI quota for this project is exhausted, so these questions were '
          + 'built directly from your source material. They are still fully '
          + 'answerable — just less polished than AI-written ones.',
        );
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate questions');
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-16 max-w-5xl flex items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading quiz...
      </div>
    );
  }

  if (error || !set) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <Button asChild variant="ghost" size="sm" className="mb-6">
          <Link href="/quizzes">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to quizzes
          </Link>
        </Button>
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error || 'Quiz not found'}
        </div>
      </div>
    );
  }

  const accuracy =
    stats && stats.total_questions > 0
      ? Math.round((stats.total_correct / stats.total_questions) * 100)
      : 0;

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <Button asChild variant="ghost" size="sm" className="mb-4">
        <Link href="/quizzes">
          <ArrowLeft className="mr-2 h-4 w-4" />
          All quizzes
        </Link>
      </Button>

      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{set.title}</h1>
          {set.description && (
            <p className="text-muted-foreground mt-1">{set.description}</p>
          )}
          {set.sourceType && (
            <Badge variant="outline" className="mt-2 capitalize">
              Source: {set.sourceType}
            </Badge>
          )}
        </div>
        <Button asChild size="lg" disabled={questions.length === 0}>
          <Link href={`/quizzes/${set.id}/take`}>
            <Brain className="mr-2 h-4 w-4" />
            Start Quiz
          </Link>
        </Button>
      </div>

      {notice && (
        <div
          role="status"
          className="mb-6 flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm"
        >
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p>{notice}</p>
        </div>
      )}


      {stats && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
          <StatCard
            icon={<Target className="h-4 w-4" />}
            label="Questions"
            value={set?.questionCount ?? questions.length}
          />
          <StatCard
            icon={<Trophy className="h-4 w-4 text-amber-500" />}
            label="Best score"
            value={`${stats.best_score}%`}
          />
          <StatCard
            icon={<TrendingUp className="h-4 w-4 text-indigo-500" />}
            label="Avg accuracy"
            value={`${accuracy}%`}
          />
          <StatCard
            icon={<Clock className="h-4 w-4 text-emerald-500" />}
            label="Attempts"
            value={stats.attempts}
          />
        </div>
      )}

      <Tabs defaultValue="questions">
        <TabsList>
          <TabsTrigger value="questions">Questions ({questions.length})</TabsTrigger>
          <TabsTrigger value="attempts">Attempts ({attempts.length})</TabsTrigger>
          <TabsTrigger value="generate">Generate more</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="questions" className="mt-6 space-y-3">
          {questions.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Sparkles className="h-8 w-8 mx-auto mb-3 opacity-50" />
                <p>No questions yet. Switch to &ldquo;Generate more&rdquo; to create some.</p>
              </CardContent>
            </Card>
          ) : (
            questions.map((q, i) => (
              <Card key={q.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">
                      Q{i + 1}. {q.prompt}
                    </CardTitle>
                    {q.difficulty && (
                      <Badge variant="secondary" className="capitalize">
                        {q.difficulty}
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid sm:grid-cols-2 gap-2">
                    {(['A', 'B', 'C', 'D'] as const).map((letter) => {
                      const isCorrect = letter === q.correct;
                      return (
                        <div
                          key={letter}
                          className={[
                            'rounded-md border p-2 text-sm',
                            isCorrect
                              ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-100'
                              : 'border-border bg-muted/30',
                          ].join(' ')}
                        >
                          <span className="font-semibold mr-2">{letter}.</span>
                          {q[`option${letter}` as 'optionA' | 'optionB' | 'optionC' | 'optionD']}
                          {isCorrect && <CheckCircle2 className="inline h-4 w-4 ml-2 -mt-0.5" />}
                        </div>
                      );
                    })}
                  </div>
                  {q.explanation && (
                    <p className="text-sm text-muted-foreground mt-3 italic">
                      {q.explanation}
                    </p>
                  )}
                  {q.tags.length > 0 && (
                    <div className="flex gap-1 mt-2">
                      {q.tags.map((t) => (
                        <Badge key={t} variant="outline" className="text-[10px]">
                          {t}
                        </Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="attempts" className="mt-6">
          {attempts.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                You haven&apos;t taken this quiz yet.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b">
                      <th className="py-2">When</th>
                      <th className="py-2">Score</th>
                      <th className="py-2">Correct</th>
                      <th className="py-2">Duration</th>
                      <th className="py-2">SRS deck?</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attempts.map((a) => (
                      <tr key={a.id} className="border-b last:border-0">
                        <td className="py-2">
                          {a.finishedAt ? new Date(a.finishedAt).toLocaleString() : '—'}
                        </td>
                        <td className="py-2 font-semibold">{a.score}%</td>
                        <td className="py-2">
                          {a.correctCount} / {a.total}
                        </td>
                        <td className="py-2">
                          {a.durationSeconds ? `${a.durationSeconds}s` : '—'}
                        </td>
                        <td className="py-2">
                          {a.srsDeckId ? (
                            <Button asChild variant="link" size="sm" className="p-0 h-auto">
                              <Link href={`/flashcards/${a.srsDeckId}`}>
                                Open deck →
                              </Link>
                            </Button>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="generate" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Generate more questions</CardTitle>
              <CardDescription>
                Add more MCQs to this quiz using the same source.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <label className="text-sm font-medium">Questions to add</label>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={genCount}
                  onChange={(e) => setGenCount(Number(e.target.value))}
                  className="w-20 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                />
              </div>
              <Button onClick={handleGenerateMore} disabled={generating}>
                {generating ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 h-4 w-4" />
                )}
                Generate
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Danger zone</CardTitle>
              <CardDescription>
                Deleting this quiz removes all its questions and attempt history.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete quiz
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete &quot;{set.title}&quot;?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete {questions.length} questions and{' '}
                      {attempts.length} attempts.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          {icon}
          {label}
        </div>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}
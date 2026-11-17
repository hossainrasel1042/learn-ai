'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ListChecks,
  Sparkles,
  Trash2,
  Brain,
  Trophy,
  Loader2,
  Clock,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { deleteQuizSet, listQuizSets } from '@/lib/quiz-api';
import type { QuizSet, UserQuizStats } from '@/types/quiz';
import { getUserStats } from '@/lib/quiz-api';

export default function QuizzesPage() {
  const [sets, setSets] = useState<QuizSet[]>([]);
  const [stats, setStats] = useState<UserQuizStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [res, st] = await Promise.all([listQuizSets(1, 50), getUserStats()]);
      setSets(res.sets);
      setStats(st);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load quizzes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDelete = async (id: string) => {
    try {
      await deleteQuizSet(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete');
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <ListChecks className="h-7 w-7 text-primary" />
            Quizzes
          </h1>
          <p className="text-muted-foreground mt-1">
            Test yourself with AI-generated multiple-choice questions.
          </p>
        </div>
        <Button asChild>
          <Link href="/quizzes/new">
            <Sparkles className="mr-2 h-4 w-4" />
            Generate from source
          </Link>
        </Button>
      </div>

      {stats && stats.attempts > 0 && (
        <div className="grid gap-4 sm:grid-cols-3 mb-8">
          <StatCard
            icon={<Trophy className="h-4 w-4 text-amber-500" />}
            label="Average score"
            value={`${stats.avgScore}%`}
          />
          <StatCard
            icon={<Brain className="h-4 w-4 text-indigo-500" />}
            label="Total questions answered"
            value={stats.totalQuestions}
          />
          <StatCard
            icon={<Clock className="h-4 w-4 text-emerald-500" />}
            label="Attempts"
            value={stats.attempts}
          />
        </div>
      )}

      {loading && sets.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading quizzes...
        </div>
      ) : error ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : sets.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sets.map((s) => (
            <Card
              key={s.id}
              className="group hover:border-primary/50 hover:shadow-md transition-all"
            >
              <CardHeader>
                <CardTitle className="line-clamp-2">{s.title}</CardTitle>
                {s.description && (
                  <CardDescription className="line-clamp-2">{s.description}</CardDescription>
                )}
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <ListChecks className="h-4 w-4" />
                    <span>{s.questionCount} questions</span>
                    {s.sourceType && (
                      <Badge variant="outline" className="ml-1 capitalize">
                        {s.sourceType}
                      </Badge>
                    )}
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Delete quiz"
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete quiz?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently remove &quot;{s.title}&quot;,
                          all of its questions, and any previous attempts. This
                          action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDelete(s.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
                <div className="flex gap-2 mt-4">
                  <Button asChild className="flex-1">
                    <Link href={`/quizzes/${s.id}`}>Open</Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href={`/quizzes/${s.id}/take`}>
                      <Brain className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
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

function EmptyState() {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-16 text-center">
        <div className="rounded-full bg-primary/10 p-4 mb-4">
          <ListChecks className="h-8 w-8 text-primary" />
        </div>
        <h3 className="text-lg font-semibold mb-2">No quizzes yet</h3>
        <p className="text-muted-foreground mb-6 max-w-sm">
          Generate your first quiz from a course, chat, or just paste some text.
        </p>
        <Button asChild>
          <Link href="/quizzes/new">
            <Sparkles className="mr-2 h-4 w-4" />
            Generate from source
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
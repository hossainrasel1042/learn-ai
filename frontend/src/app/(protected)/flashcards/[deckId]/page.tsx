'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  BookOpenCheck,
  Brain,
  CheckCircle2,
  Info,
  Loader2,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
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

import { deleteDeck, generateCards, getDeck } from '@/lib/srs-api';
import type {
  Card as FlashCard,
  Deck,
  DeckStats,
  SourceType,
} from '@/types/srs';


const LOCAL_GENERATION_NOTICE =
  'The AI quota for this project is exhausted, so these cards were built '
  + 'directly from your source material. They are still fully answerable — '
  + 'just less polished than AI-written ones.';

export default function DeckDetailPage() {
  const params = useParams<{ deckId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const deckId = params.deckId;

  const [deck, setDeck] = useState<Deck | null>(null);
  const [cards, setCards] = useState<FlashCard[]>([]);
  const [stats, setStats] = useState<DeckStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [generateSourceType, setGenerateSourceType] = useState<SourceType>('manual');
  const [generateText, setGenerateText] = useState('');
  const [generateCount, setGenerateCount] = useState(10);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);



  useEffect(() => {
    if (searchParams.get('generatedBy') === 'local') {
      setNotice(LOCAL_GENERATION_NOTICE);
    }
  }, [searchParams]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getDeck(deckId, 1, 100);
      setDeck(res.deck);
      setCards(res.cards);
      setStats(res.stats);

      if (res.deck.sourceType) {
        setGenerateSourceType(res.deck.sourceType as SourceType);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load deck');
    } finally {
      setLoading(false);
    }
  }, [deckId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleGenerate = async () => {
    if (generateSourceType === 'manual' && generateText.trim().length < 50) {
      setGenerateError('Please paste at least 50 characters of text.');
      return;
    }
    setGenerating(true);
    setGenerateError(null);
    setNotice(null);
    try {
      const result = await generateCards(deckId, {
        sourceType: generateSourceType,





        sourceId:
          generateSourceType === 'manual'
            ? undefined
            : deck?.sourceId ?? undefined,
        text: generateSourceType === 'manual' ? generateText.trim() : undefined,
        cardCount: generateCount,
      });
      if (result.generatedBy === 'local') {
        setNotice(LOCAL_GENERATION_NOTICE);
      }
      await load();
    } catch (e) {
      setGenerateError(e instanceof Error ? e.message : 'Failed to generate cards');
    } finally {
      setGenerating(false);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteDeck(deckId);
      router.push('/flashcards');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete deck');
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-16 max-w-5xl flex items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading deck...
      </div>
    );
  }

  if (error || !deck) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <Button asChild variant="ghost" size="sm" className="mb-6">
          <Link href="/flashcards">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to decks
          </Link>
        </Button>
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error || 'Deck not found'}
        </div>
      </div>
    );
  }

  const dueCount = stats?.due ?? 0;
  const retentionPct = stats?.retention !== null && stats?.retention !== undefined
    ? Math.round(stats.retention * 100)
    : null;

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <Button asChild variant="ghost" size="sm" className="mb-4">
        <Link href="/flashcards">
          <ArrowLeft className="mr-2 h-4 w-4" />
          All decks
        </Link>
      </Button>

      
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{deck.title}</h1>
          {deck.description && (
            <p className="text-muted-foreground mt-1">{deck.description}</p>
          )}
          {deck.sourceType && (
            <Badge variant="outline" className="mt-2 capitalize">
              Source: {deck.sourceType}
            </Badge>
          )}
        </div>
        <Button asChild size="lg" disabled={dueCount === 0}>
          <Link href={`/flashcards/${deck.id}/study`}>
            <Brain className="mr-2 h-4 w-4" />
            {dueCount > 0 ? `Study (${dueCount} due)` : 'No cards due'}
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
            icon={<BookOpenCheck className="h-4 w-4" />}
            label="Total cards"
            value={stats.total}
          />
          <StatCard
            icon={<Target className="h-4 w-4 text-amber-500" />}
            label="Due now"
            value={stats.due}
            highlight={stats.due > 0}
          />
          <StatCard
            icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />}
            label="Learned"
            value={stats.learned}
          />
          <StatCard
            icon={<TrendingUp className="h-4 w-4 text-indigo-500" />}
            label="Retention"
            value={retentionPct !== null ? `${retentionPct}%` : '—'}
          />
        </div>
      )}

      
      <Tabs defaultValue="cards">
        <TabsList>
          <TabsTrigger value="cards">Cards ({cards.length})</TabsTrigger>
          <TabsTrigger value="generate">Generate more</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="cards" className="mt-6">
          {cards.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Sparkles className="h-8 w-8 mx-auto mb-3 opacity-50" />
                <p>This deck is empty. Switch to &ldquo;Generate more&rdquo; to add cards.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {cards.map((card) => (
                <Card key={card.id}>
                  <CardContent className="pt-6 grid md:grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                        Front
                      </div>
                      <p className="text-sm">{card.front}</p>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                        Back
                      </div>
                      <p className="text-sm">{card.back}</p>
                    </div>
                    <div className="md:col-span-2 flex items-center gap-3 text-xs text-muted-foreground">
                      <span>EF {card.easeFactor.toFixed(2)}</span>
                      <span>·</span>
                      <span>Reps {card.repetitions}</span>
                      <span>·</span>
                      <span>Next {new Date(card.dueAt).toLocaleDateString()}</span>
                      {card.tags.length > 0 && (
                        <>
                          <span>·</span>
                          <span className="flex gap-1">
                            {card.tags.map((t) => (
                              <Badge key={t} variant="secondary" className="text-[10px]">
                                {t}
                              </Badge>
                            ))}
                          </span>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="generate" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Generate more cards</CardTitle>
              <CardDescription>
                Use AI to extract additional Q/A pairs from your source material.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Source</Label>
                <div className="flex gap-2 flex-wrap">
                  {(['manual', 'course', 'chat'] as SourceType[]).map((t) => (
                    <Button
                      key={t}
                      type="button"
                      variant={generateSourceType === t ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setGenerateSourceType(t)}
                      className="capitalize"
                    >
                      {t}
                    </Button>
                  ))}
                </div>
              </div>

              {generateSourceType === 'manual' ? (
                <div className="space-y-2">
                  <Label htmlFor="src-text">Paste text</Label>
                  <textarea
                    id="src-text"
                    value={generateText}
                    onChange={(e) => setGenerateText(e.target.value)}
                    rows={8}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    placeholder="Paste additional material here..."
                  />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Will use the deck&apos;s original <strong>{deck.sourceType}</strong> source
                  (id stored on the deck).
                </p>
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Cards to generate</Label>
                  <span className="text-sm font-medium">{generateCount}</span>
                </div>
                <Slider
                  value={[generateCount]}
                  onValueChange={(v) => setGenerateCount(v[0] ?? 10)}
                  min={1}
                  max={30}
                  step={1}
                />
              </div>

              {generateError && (
                <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                  {generateError}
                </div>
              )}

              <Button onClick={handleGenerate} disabled={generating}>
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
                Deleting this deck removes all its cards and review history.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete deck
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete &quot;{deck.title}&quot;?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This action cannot be undone. All {deck.cardCount} cards and review
                      history will be permanently removed.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete}>
                      Delete
                    </AlertDialogAction>
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
  highlight = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  highlight?: boolean;
}) {
  return (
    <Card className={highlight ? 'border-amber-400/50 bg-amber-50/40 dark:bg-amber-950/20' : ''}>
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
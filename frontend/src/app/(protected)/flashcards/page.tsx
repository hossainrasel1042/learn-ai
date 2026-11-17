'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Layers,
  Plus,
  Trash2,
  BookOpenCheck,
  Loader2,
  Sparkles,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useDecks } from '@/hooks/use-decks';
import { createDeck } from '@/lib/srs-api';

export default function FlashcardsPage() {
  const { decks, isLoading, error, refresh, remove } = useDecks();
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!title.trim()) {
      setCreateError('Please enter a deck title.');
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const res = await createDeck({
        title: title.trim(),
        description: description.trim() || undefined,
        sourceType: 'manual',
      });
      setCreateOpen(false);
      setTitle('');
      setDescription('');
      await refresh();

      window.location.href = `/flashcards/${res.deck.id}`;
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Failed to create deck');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Layers className="h-7 w-7 text-primary" />
            Flashcards
          </h1>
          <p className="text-muted-foreground mt-1">
            Review AI-generated flashcards with spaced repetition.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/flashcards/new">
              <Sparkles className="mr-2 h-4 w-4" />
              Generate from source
            </Link>
          </Button>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                New Deck
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create a new deck</DialogTitle>
                <DialogDescription>
                  Start with an empty deck — you can add cards manually or generate them
                  from course material later.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Title</label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Operating Systems Midterm"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Description (optional)</label>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What is this deck about?"
                    rows={3}
                  />
                </div>
                {createError && (
                  <p className="text-sm text-destructive">{createError}</p>
                )}
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setCreateOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreate} disabled={creating}>
                  {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      
      {isLoading && decks.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading decks...
        </div>
      ) : error ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : decks.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {decks.map((deck) => (
            <Card
              key={deck.id}
              className="group hover:border-primary/50 hover:shadow-md transition-all"
            >
              <CardHeader>
                <CardTitle className="line-clamp-2">{deck.title}</CardTitle>
                {deck.description && (
                  <CardDescription className="line-clamp-2">
                    {deck.description}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <BookOpenCheck className="h-4 w-4" />
                    <span>{deck.cardCount} cards</span>
                    {deck.sourceType && (
                      <Badge variant="outline" className="ml-1 capitalize">
                        {deck.sourceType}
                      </Badge>
                    )}
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Delete deck"
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete deck?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently remove &quot;{deck.title}&quot; and
                          all of its flashcards. This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => remove(deck.id)}
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
                    <Link href={`/flashcards/${deck.id}`}>Open</Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href={`/flashcards/${deck.id}/study`}>
                      <BookOpenCheck className="h-4 w-4" />
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

function EmptyState() {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-16 text-center">
        <div className="rounded-full bg-primary/10 p-4 mb-4">
          <Layers className="h-8 w-8 text-primary" />
        </div>
        <h3 className="text-lg font-semibold mb-2">No decks yet</h3>
        <p className="text-muted-foreground mb-6 max-w-sm">
          Create your first deck to start studying. You can generate cards automatically
          from a course, chat, or pasted text.
        </p>
        <div className="flex gap-2">
          <Button asChild>
            <Link href="/flashcards/new">
              <Sparkles className="mr-2 h-4 w-4" />
              Generate from source
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
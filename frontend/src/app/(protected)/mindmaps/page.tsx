'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Loader2,
  Network,
  Plus,
  Sparkles,
  Trash2,
  Brain,
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
import { useMindMaps } from '@/hooks/use-mindmaps';
import { createMindMap } from '@/lib/mindmap-api';

export default function MindMapsPage() {
  const { mindMaps, isLoading, error, refresh, remove } = useMindMaps();
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!title.trim()) {
      setCreateError('Please enter a map title.');
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const res = await createMindMap({
        title: title.trim(),
        description: description.trim() || undefined,
        sourceType: 'manual',
      });
      setCreateOpen(false);
      setTitle('');
      setDescription('');
      await refresh();

      window.location.href = `/mindmaps/${res.mindMap.id}`;
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Failed to create mind map');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Network className="h-7 w-7 text-primary" />
            Mind Maps
          </h1>
          <p className="text-muted-foreground mt-1">
            Visualize any study material as an AI-generated concept map.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/mindmaps/new">
              <Sparkles className="mr-2 h-4 w-4" />
              Generate from source
            </Link>
          </Button>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                New Mind Map
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create a new mind map</DialogTitle>
                <DialogDescription>
                  Start with an empty map — you can generate the concept graph
                  from course material later.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Title</label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Operating Systems Overview"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Description (optional)</label>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What is this mind map about?"
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

      
      {isLoading && mindMaps.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading mind maps...
        </div>
      ) : error ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : mindMaps.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {mindMaps.map((m) => (
            <Card
              key={m.id}
              className="group hover:border-primary/50 hover:shadow-md transition-all"
            >
              <CardHeader>
                <CardTitle className="line-clamp-2">{m.title}</CardTitle>
                {m.description && (
                  <CardDescription className="line-clamp-2">{m.description}</CardDescription>
                )}
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Brain className="h-4 w-4" />
                    <span>{m.nodeCount} concepts</span>
                    {m.sourceType && (
                      <Badge variant="outline" className="ml-1 capitalize">
                        {m.sourceType}
                      </Badge>
                    )}
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Delete mind map"
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete mind map?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently remove &quot;{m.title}&quot; and
                          all of its concept nodes. This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => remove(m.id)}
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
                    <Link href={`/mindmaps/${m.id}`}>Open</Link>
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
          <Network className="h-8 w-8 text-primary" />
        </div>
        <h3 className="text-lg font-semibold mb-2">No mind maps yet</h3>
        <p className="text-muted-foreground mb-6 max-w-sm">
          Generate your first mind map from a course, chat, or pasted text —
          the AI organizes the key concepts into a navigable tree.
        </p>
        <Button asChild>
          <Link href="/mindmaps/new">
            <Sparkles className="mr-2 h-4 w-4" />
            Generate from source
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
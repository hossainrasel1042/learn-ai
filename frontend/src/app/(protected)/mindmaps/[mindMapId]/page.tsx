'use client';

import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Brain,
  Clock,
  Info,
  Layers,
  Loader2,
  Network,
  Sparkles,
  Trash2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
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

import { deleteMindMap, generateMindMap, getMindMap } from '@/lib/mindmap-api';
import { useAuth } from '@/hooks/use-auth';
import type { MindMap, SourceType } from '@/types/mindmap';


const LOCAL_GENERATION_NOTICE =
  'The AI quota for this project is exhausted, so this concept map was built '
  + 'directly from your source material. It is still a working map — just '
  + 'less polished than an AI-drawn one.';


const MindMapCanvas = dynamic(
  () =>
    import('@/components/mindmaps/mind-map-canvas').then((m) => m.MindMapCanvas),
  { ssr: false, loading: () => <CanvasSkeleton /> },
);

function CanvasSkeleton() {
  return (
    <div className="h-[600px] w-full rounded-lg border bg-muted/20 flex items-center justify-center">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading canvas...
      </div>
    </div>
  );
}

export default function MindMapDetailPage() {
  const params = useParams<{ mindMapId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isLoading: authLoading } = useAuth();
  const mindMapId = params.mindMapId;

  const [mindMap, setMindMap] = useState<MindMap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [generateSourceType, setGenerateSourceType] = useState<SourceType>('manual');
  const [generateText, setGenerateText] = useState('');
  const [generateCount, setGenerateCount] = useState(8);
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
      const res = await getMindMap(mindMapId);
      setMindMap(res.mindMap);
      if (res.mindMap.sourceType) {
        setGenerateSourceType(res.mindMap.sourceType as SourceType);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load mind map');
    } finally {
      setLoading(false);
    }
  }, [mindMapId]);

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
      const result = await generateMindMap(mindMapId, {
        sourceType: generateSourceType,





        sourceId:
          generateSourceType === 'manual'
            ? undefined
            : mindMap?.sourceId ?? undefined,
        text: generateSourceType === 'manual' ? generateText.trim() : undefined,
        nodeCount: generateCount,
      });
      if (result.generatedBy === 'local') {
        setNotice(LOCAL_GENERATION_NOTICE);
      }
      setGenerateText('');
      await load();
    } catch (e) {
      setGenerateError(e instanceof Error ? e.message : 'Failed to generate mind map');
    } finally {
      setGenerating(false);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteMindMap(mindMapId);
      router.push('/mindmaps');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete mind map');
    }
  };

  if (loading || authLoading) {
    return (
      <div className="container mx-auto px-4 py-16 max-w-5xl flex items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading mind map...
      </div>
    );
  }

  if (error || !mindMap) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <Button asChild variant="ghost" size="sm" className="mb-6">
          <Link href="/mindmaps">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to mind maps
          </Link>
        </Button>
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error || 'Mind map not found'}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <Button asChild variant="ghost" size="sm" className="mb-4">
        <Link href="/mindmaps">
          <ArrowLeft className="mr-2 h-4 w-4" />
          All mind maps
        </Link>
      </Button>

      
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Network className="h-6 w-6 text-primary" />
            {mindMap.title}
          </h1>
          {mindMap.description && (
            <p className="text-muted-foreground mt-1">{mindMap.description}</p>
          )}
          <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
            {mindMap.sourceType && (
              <Badge variant="outline" className="capitalize">
                Source: {mindMap.sourceType}
              </Badge>
            )}
            <span className="flex items-center gap-1">
              <Brain className="h-3.5 w-3.5" />
              {mindMap.nodeCount} concepts
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              Updated {new Date(mindMap.updatedAt).toLocaleString()}
            </span>
          </div>
        </div>
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

      
      <Tabs defaultValue="map">
        <TabsList>
          <TabsTrigger value="map">Map</TabsTrigger>
          <TabsTrigger value="regenerate">Regenerate</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="map" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-primary" />
                {mindMap.rootConcept || mindMap.title}
              </CardTitle>
              <CardDescription>
                Read-only concept map. Drag to pan, scroll to zoom, use the
                bottom-right minimap to orient yourself.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <MindMapCanvas graph={mindMap.graph} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="regenerate" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Regenerate the concept map</CardTitle>
              <CardDescription>
                Overwrites the current graph with a freshly generated one from
                new source material.
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
                    placeholder="Paste new material here..."
                  />
                  <p className="text-xs text-muted-foreground">
                    {generateText.length} characters
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Will use the map&apos;s original{' '}
                  <strong>{mindMap.sourceType}</strong> source (id stored on the map).
                </p>
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Number of concepts</Label>
                  <span className="text-sm font-medium">{generateCount}</span>
                </div>
                <Slider
                  value={[generateCount]}
                  onValueChange={(v) => setGenerateCount(v[0] ?? 8)}
                  min={3}
                  max={20}
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
                Regenerate
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Danger zone</CardTitle>
              <CardDescription>
                Deleting this mind map permanently removes its concept graph.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete mind map
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete &quot;{mindMap.title}&quot;?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This action cannot be undone. All {mindMap.nodeCount} concept
                      nodes will be permanently removed.
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
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Loader2,
  Sparkles,
  BookOpen,
  MessageSquare,
  Type,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { CourseCodeSelect } from '@/components/common/CourseCodeSelect';
import { ChatSourceSelect } from '@/components/quiz/ChatSourceSelect';
import { createMindMap, generateMindMap } from '@/lib/mindmap-api';
import type { PickerCourse } from '@/lib/api/course-picker';
import type { SourceType } from '@/types/mindmap';


const SOURCE_OPTIONS: Array<{
  value: SourceType;
  title: string;
  description: string;
  icon: React.ReactNode;
}> = [
  {
    value: 'course',
    title: 'Course material',
    description: 'Generate a concept map from a course you have access to.',
    icon: <BookOpen className="h-5 w-5" />,
  },
  {
    value: 'chat',
    title: 'Chat history',
    description: 'Pull concepts from a past conversation with the AI tutor.',
    icon: <MessageSquare className="h-5 w-5" />,
  },
  {
    value: 'manual',
    title: 'Paste text',
    description: 'Paste any study material and we will extract key concepts.',
    icon: <Type className="h-5 w-5" />,
  },
];

export default function NewMindMapPage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [sourceType, setSourceType] = useState<SourceType>('manual');


  const [course, setCourse] = useState<PickerCourse | null>(null);
  const [chatId, setChatId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [nodeCount, setNodeCount] = useState(8);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);


  const sourceId: string | undefined =
    sourceType === 'course'
      ? course?.id
      : sourceType === 'chat'
        ? chatId ?? undefined
        : undefined;

  const handleSourceTypeChange = (next: SourceType) => {
    if (next === sourceType) return;
    setSourceType(next);
    setError(null);


    setCourse(null);
    setChatId(null);
    if (next !== 'manual') {
      setText('');
    }
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError('Please enter a mind map title.');
      return;
    }
    if (sourceType !== 'manual' && !sourceId) {
      setError(
        sourceType === 'course'
          ? 'Please select a course.'
          : 'Please select a conversation.',
      );
      return;
    }
    if (sourceType === 'manual' && text.trim().length < 50) {
      setError('Please paste at least 50 characters of source text.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const { mindMap } = await createMindMap({
        title: title.trim(),
        description: description.trim() || undefined,
        sourceType,
        sourceId: sourceType !== 'manual' ? sourceId : undefined,
      });

      const result = await generateMindMap(mindMap.id, {
        sourceType,
        sourceId: sourceType !== 'manual' ? sourceId : undefined,
        text: sourceType === 'manual' ? text.trim() : undefined,
        nodeCount,
      });



      router.push(
        result.generatedBy === 'local'
          ? `/mindmaps/${mindMap.id}?generatedBy=local`
          : `/mindmaps/${mindMap.id}`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create mind map');
      setSubmitting(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <Button asChild variant="ghost" size="sm" className="mb-6">
        <Link href="/mindmaps">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to mind maps
        </Link>
      </Button>

      <h1 className="text-3xl font-bold tracking-tight mb-1">Create a new mind map</h1>
      <p className="text-muted-foreground mb-8">
        Pick a source and the AI will organize the key concepts into a navigable tree.
      </p>

      <Card>
        <CardHeader>
          <CardTitle>Source</CardTitle>
          <CardDescription>Choose what material to map.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {SOURCE_OPTIONS.map((opt) => {
              const isActive = opt.value === sourceType;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleSourceTypeChange(opt.value)}
                  className={[
                    'text-left rounded-lg border p-4 transition-all',
                    isActive
                      ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                      : 'hover:border-primary/40 hover:bg-accent/40',
                  ].join(' ')}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={[
                        'rounded-md p-2',
                        isActive ? 'bg-primary text-primary-foreground' : 'bg-muted',
                      ].join(' ')}
                    >
                      {opt.icon}
                    </div>
                    <div>
                      <div className="font-medium">{opt.title}</div>
                      <div className="text-sm text-muted-foreground mt-0.5">
                        {opt.description}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {sourceType === 'course' && (
            <div className="space-y-2 pt-2">
              <Label htmlFor="course-id">Course ID</Label>
              <CourseCodeSelect
                id="course-id"
                value={course}
                onChange={setCourse}
                placeholder="Pick a course…"
              />
              <p className="text-xs text-muted-foreground">
                The map is generated from the materials of the selected course.
              </p>
            </div>
          )}

          {sourceType === 'chat' && (
            <div className="space-y-2 pt-2">
              <Label htmlFor="chat-id">Chat history</Label>
              <ChatSourceSelect
                id="chat-id"
                value={chatId}
                onChange={setChatId}
                placeholder="Pick a conversation…"
              />
              <p className="text-xs text-muted-foreground">
                The map is generated from the messages of the selected conversation.
              </p>
            </div>
          )}

          {sourceType === 'manual' && (
            <div className="space-y-2 pt-2">
              <Label htmlFor="text">Paste your study material</Label>
              <textarea
                id="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Paste lecture notes, an article, or any text you want to map. Minimum 50 characters."
                rows={8}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
              <p className="text-xs text-muted-foreground">{text.length} characters</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Map details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Mind map title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Operating Systems Overview"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="desc">Description (optional)</Label>
            <Input
              id="desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short summary"
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Number of concepts</Label>
              <span className="text-sm font-medium">{nodeCount}</span>
            </div>
            <Slider
              value={[nodeCount]}
              onValueChange={(v) => setNodeCount(v[0] ?? 8)}
              min={3}
              max={20}
              step={1}
            />
            <p className="text-xs text-muted-foreground">
              The AI will produce around {nodeCount} concept nodes organized into a 2-3 level tree.
            </p>
          </div>

          {error && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2 mt-6">
        <Button variant="ghost" asChild>
          <Link href="/mindmaps">Cancel</Link>
        </Button>
        <Button onClick={handleSubmit} disabled={submitting}>
          {submitting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-2 h-4 w-4" />
          )}
          Generate mind map
        </Button>
      </div>
    </div>
  );
}
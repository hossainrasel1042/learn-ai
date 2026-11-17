'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { apiFetch, ApiError } from '@/lib/api';
import { MarkdownRenderer } from '@/components/chat/markdown-renderer';
import {
    MessageSquare,
    ArrowLeft,
    CheckCircle,
    CornerDownRight,
    Bot
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Textarea } from '@/components/ui/textarea';








interface Author {
    id: string;
    name: string;
    avatarUrl?: string | null;
}

interface BotMetadata {
    sources?: Array<{ title: string; url?: string }>;
    generatedAt?: string;
    courseContext?: string;
}

interface Comment {
    id: string;
    postId: string;
    author: Author | null;
    parentId?: string | null;
    content: string;
    isBotReply: boolean;
    mentionedUserId?: string | null;
    botMetadata?: BotMetadata | null;
    createdAt: string;
    replies: Comment[];
}

interface PostDetail {
    id: string;
    author: Author;
    title: string;
    content: string;
    category: 'theory' | 'lab' | 'general';
    courseTopic?: string | null;
    isResolved: boolean;
    viewCount: number;
    createdAt: string;
    updatedAt: string;
    comments: Comment[];
}

const CATEGORY_STYLES = {
    theory: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800',
    lab: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 border-green-200 dark:border-green-800',
    general: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300 border-gray-200 dark:border-gray-700'
};

const CATEGORY_LABELS = {
    theory: 'Theory',
    lab: 'Lab',
    general: 'General'
};

export default function PostDetailPage() {
    const params = useParams();
    const { user } = useAuth();
    const postId = params.postId as string;

    const [post, setPost] = useState<PostDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [replyContent, setReplyContent] = useState('');
    const [replyingTo, setReplyingTo] = useState<{ id: string; authorName: string } | null>(null);
    const [submittingReply, setSubmittingReply] = useState(false);

    const replyInputRef = useRef<HTMLTextAreaElement>(null);

    const fetchPost = useCallback(async () => {
        try {


            const data = await apiFetch<PostDetail>(
                `/community/posts/${postId}?track_view=true`
            );
            setPost(data);
        } catch (err) {
            if (err instanceof ApiError && err.status === 404) {
                setError('Post not found');
            } else {
                setError(err instanceof Error ? err.message : 'Failed to load post');
            }
        } finally {
            setLoading(false);
        }
    }, [postId]);

    useEffect(() => {
        if (postId) {
            fetchPost();
        }
    }, [postId, fetchPost]);

    useEffect(() => {

        if (replyingTo && replyInputRef.current) {
            replyInputRef.current.focus();
        }
    }, [replyingTo]);

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const handleSubmitReply = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        if (!replyContent.trim() || !user) return;

        setSubmittingReply(true);
        try {

            const mentionMatch = replyContent.match(/(?:^|\s)@([A-Za-z0-9_]+)/);
            const mentionedUsername = mentionMatch ? mentionMatch[1] : null;

            await apiFetch(`/community/posts/${postId}/comments`, {
                method: 'POST',
                body: {
                    content: replyContent,




                    parentId: replyingTo?.id,
                    mentionedUsername: mentionedUsername ?? undefined,
                },
            });

            setReplyContent('');
            setReplyingTo(null);
            await fetchPost();
        } catch (err) {
            console.error(err);
            const msg = err instanceof ApiError ? err.message : 'Failed to post comment';
            alert(msg);
        } finally {
            setSubmittingReply(false);
        }
    }, [replyContent, user, postId, replyingTo, fetchPost]);

    if (loading) {
        return (
            <div className="flex justify-center items-center min-h-[50vh]">
                 <div className="animate-pulse space-y-4 w-full max-w-3xl">
                    <div className="h-8 bg-muted rounded w-3/4"></div>
                    <div className="h-32 bg-muted rounded"></div>
                 </div>
            </div>
        );
    }

    if (error || !post) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
                <div className="p-4 rounded-full bg-muted">
                    <MessageSquare className="w-8 h-8 text-muted-foreground" />
                </div>
                <h2 className="text-xl font-semibold">{error || 'Post not found'}</h2>
                <Button variant="outline" asChild>
                    <Link href="/community">Back to Community</Link>
                </Button>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-[calc(100vh-4rem)] bg-background">
             
             <div className="border-b border-border px-6 py-4 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                 <div className="max-w-4xl mx-auto flex items-center gap-4">
                    <Button variant="ghost" size="icon" asChild className="-ml-2">
                        <Link href="/community">
                            <ArrowLeft className="w-5 h-5" />
                        </Link>
                    </Button>
                    <div>
                         <h1 className="text-lg font-semibold truncate max-w-md md:max-w-2xl">
                             {post.title}
                         </h1>
                    </div>
                 </div>
             </div>

            <div className="flex-1 overflow-auto p-4 md:p-6">
                <div className="max-w-4xl mx-auto space-y-6">
                    
                    <Card>
                        <CardHeader className="space-y-4">
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex items-center gap-3">
                                    <Avatar className="h-10 w-10">
                                        <AvatarImage src={post.author.avatarUrl ?? undefined} />
                                        <AvatarFallback className="bg-primary/10 text-primary">
                                            {post.author.name.substring(0, 2).toUpperCase()}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="flex flex-col">
                                        <span className="font-semibold text-sm">
                                            {post.author.name}
                                        </span>
                                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                            <span>{formatDate(post.createdAt)}</span>
                                            <span>•</span>
                                            <span>{post.viewCount} views</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                     <Badge variant="outline" className={`${CATEGORY_STYLES[post.category]} border-0`}>
                                        {CATEGORY_LABELS[post.category]}
                                    </Badge>
                                    {post.isResolved && (
                                        <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                                            <CheckCircle className="w-3 h-3 mr-1" />
                                            Resolved
                                        </Badge>
                                    )}
                                </div>
                            </div>

                            <CardTitle className="text-2xl pt-2">
                                {post.title}
                            </CardTitle>

                            {post.courseTopic && (
                                <div className="flex gap-2">
                                    <Badge variant="secondary" className="text-xs">
                                        {post.courseTopic}
                                    </Badge>
                                </div>
                            )}
                        </CardHeader>

                        <CardContent className="prose prose-slate dark:prose-invert max-w-none pb-6">
                            <p className="whitespace-pre-wrap">{post.content}</p>
                        </CardContent>
                    </Card>

                    
                    <div className="space-y-4 pt-4">
                        <h2 className="text-lg font-semibold flex items-center gap-2">
                            <MessageSquare className="w-5 h-5" />
                            {post.comments.length} Comments
                        </h2>

                        
                        <Card>
                            <CardContent className="pt-6">
                                <form onSubmit={handleSubmitReply} className="space-y-4">
                                    {replyingTo && (
                                        <div className="flex items-center justify-between bg-muted/50 p-2 rounded-md text-sm">
                                            <span className="text-muted-foreground">
                                                Replying to <span className="font-medium text-foreground">{replyingTo.authorName}</span>
                                            </span>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setReplyingTo(null)}
                                                className="h-auto p-1 text-muted-foreground hover:text-foreground"
                                                type="button"
                                            >
                                                Cancel
                                            </Button>
                                        </div>
                                    )}
                                    <Textarea
                                        ref={replyInputRef}
                                        value={replyContent}
                                        onChange={(e) => setReplyContent(e.target.value)}
                                        placeholder="Write a comment... (Markdown supported)"
                                        className="min-h-[100px] resize-y"
                                    />
                                    <div className="flex justify-end">
                                        <Button
                                            type="submit"
                                            disabled={submittingReply || !replyContent.trim()}
                                        >
                                            {submittingReply ? 'Posting...' : 'Post Comment'}
                                        </Button>
                                    </div>
                                </form>
                            </CardContent>
                        </Card>

                        
                        <div className="space-y-4">
                            {post.comments.map((comment) => (
                                <CommentCard
                                    key={comment.id}
                                    comment={comment}
                                    onReply={(id, authorName) => setReplyingTo({ id, authorName })}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}


function CommentCard({
    comment,
    onReply,
    depth = 0
}: {
    comment: Comment;
    onReply: (id: string, authorName: string) => void;
    depth?: number;
}) {
    const maxDepth = 3;
    const isNested = depth > 0;

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleDateString();
    };

    return (
        <div className={`${isNested ? 'ml-8 relative' : ''}`}>
            {isNested && (
                <div className="absolute -left-4 top-0 bottom-0 w-px bg-border" />
            )}

            <Card className={`border-l-4 ${
                comment.isBotReply
                    ? 'border-l-purple-500 bg-purple-50/10 dark:bg-purple-900/10'
                    : 'border-l-transparent'
            }`}>
                <CardContent className="pt-6">
                    <div className="flex gap-3">
                        {comment.isBotReply ? (
                            <div className="h-8 w-8 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600 dark:text-purple-400">
                                <Bot className="w-5 h-5" />
                            </div>
                        ) : (
                            <Avatar className="h-8 w-8">
                                <AvatarImage src={comment.author?.avatarUrl ?? undefined} />
                                <AvatarFallback className="bg-muted text-muted-foreground text-xs">
                                    {comment.author?.name?.substring(0, 2).toUpperCase() || 'U'}
                                </AvatarFallback>
                            </Avatar>
                        )}

                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                                <span className={`font-medium text-sm ${comment.isBotReply ? 'text-purple-600 dark:text-purple-400' : ''}`}>
                                    {comment.isBotReply ? 'LearnAI Bot' : (comment.author?.name || 'Unknown')}
                                </span>
                                {comment.isBotReply && (
                                    <Badge variant="secondary" className="bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 text-[10px] h-5">
                                        AI Auto-Reply
                                    </Badge>
                                )}
                                <span className="text-xs text-muted-foreground">
                                    {formatDate(comment.createdAt)}
                                </span>
                            </div>

                            <div className="text-sm text-foreground/90">
                                {comment.isBotReply ? (
                                    <MarkdownRenderer content={comment.content} />
                                ) : (
                                    <p className="whitespace-pre-wrap">{comment.content}</p>
                                )}
                            </div>

                            {comment.isBotReply && comment.botMetadata && (
                                <div className="mt-3 text-xs bg-muted/50 p-2 rounded border border-border">
                                    <p className="flex items-center gap-1 text-muted-foreground italic">
                                        <Bot className="w-3 h-3" />
                                        <span>Generated automatically while user was offline</span>
                                    </p>
                                </div>
                            )}

                            {!comment.isBotReply && depth < maxDepth && (
                                <div className="mt-3">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-auto p-0 text-muted-foreground hover:text-foreground text-xs"
                                        onClick={() => onReply(comment.id, comment.author?.name || 'Unknown')}
                                    >
                                        <CornerDownRight className="w-3 h-3 mr-1" />
                                        Reply
                                    </Button>
                                </div>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>

            {comment.replies && comment.replies.length > 0 && (
                <div className="mt-4 space-y-4">
                    {comment.replies.map((reply) => (
                        <CommentCard
                            key={reply.id}
                            comment={reply}
                            onReply={onReply}
                            depth={depth + 1}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

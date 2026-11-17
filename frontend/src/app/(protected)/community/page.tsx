'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useDebounce } from '@/hooks/use-debounce';
import { apiFetch, ApiError } from '@/lib/api';
import {
    MessageSquare,
    Search,
    Plus,
    CheckCircle,
    Filter,
    MoreHorizontal
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';








interface Author {
    id: string;
    name: string;
    avatarUrl?: string | null;
}

interface Post {
    id: string;
    author: Author;
    title: string;
    content: string;
    category: 'theory' | 'lab' | 'general';
    courseTopic?: string | null;
    isResolved: boolean;
    viewCount: number;
    commentCount: number;
    createdAt: string;
    updatedAt: string;
}

interface PostListResponse {
    posts: Post[];
    total: number;
    page: number;
    pageSize: number;
    hasMore: boolean;
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

const PAGE_SIZE = 20;

export default function CommunityPage() {
    const [posts, setPosts] = useState<Post[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedCategory, setSelectedCategory] = useState<string>('all');
    const [showResolved, setShowResolved] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(false);
    const debouncedSearch = useDebounce(searchQuery, 300);



    const buildParams = useCallback((pageNumber: number) => {
        const params = new URLSearchParams();
        params.append('page', String(pageNumber));
        params.append('pageSize', String(PAGE_SIZE));
        if (selectedCategory !== 'all') {
            params.append('category', selectedCategory);
        }
        if (showResolved !== 'all') {


            params.append('isResolved', showResolved === 'resolved' ? 'true' : 'false');
        }
        if (debouncedSearch) {
            params.append('search', debouncedSearch);
        }
        return params;
    }, [selectedCategory, showResolved, debouncedSearch]);

    const fetchPosts = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await apiFetch<PostListResponse>(
                `/community/posts?${buildParams(1).toString()}`
            );
            setPosts(data.posts);
            setPage(1);
            setHasMore(data.hasMore);
        } catch (err) {
            if (err instanceof ApiError) {
                setError(err.message);
            } else {
                setError(err instanceof Error ? err.message : 'Failed to load posts');
            }
        } finally {
            setLoading(false);
        }
    }, [buildParams]);

    const loadMore = async () => {
        if (loadingMore || !hasMore) return;
        setLoadingMore(true);
        try {
            const next = page + 1;
            const data = await apiFetch<PostListResponse>(
                `/community/posts?${buildParams(next).toString()}`
            );


            setPosts((prev) => {
                const seen = new Set(prev.map((p) => p.id));
                return [...prev, ...data.posts.filter((p) => !seen.has(p.id))];
            });
            setPage(next);
            setHasMore(data.hasMore);
        } catch (err) {
            if (err instanceof ApiError) {
                setError(err.message);
            } else {
                setError(err instanceof Error ? err.message : 'Failed to load more posts');
            }
        } finally {
            setLoadingMore(false);
        }
    };




    useEffect(() => {
        fetchPosts();
    }, [fetchPosts]);

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString();
    };

    return (
        <div className="flex flex-col h-[calc(100vh-65px)] bg-background">
            
            <div className="border-b border-border px-6 py-4 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 max-w-7xl mx-auto">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-primary/10">
                            <MessageSquare className="w-6 h-6 text-primary" />
                        </div>
                        <div>
                            <h1 className="text-xl font-semibold">Community</h1>
                            <p className="text-sm text-muted-foreground">
                                Discuss course topics and get help
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                         <div className="relative">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                type="search"
                                placeholder="Search discussions..."
                                className="pl-8 w-[200px] md:w-[300px]"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>

                        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                            <DialogTrigger asChild>
                                <Button className="gap-2">
                                    <Plus className="w-4 h-4" />
                                    <span className="hidden sm:inline">New Post</span>
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
                                <DialogHeader className="mb-6">
                                    <DialogTitle>Create New Discussion</DialogTitle>
                                    <DialogDescription>
                                        Ask a question or share knowledge with the community.
                                    </DialogDescription>
                                </DialogHeader>
                                <CreatePostForm
                                    onSuccess={() => {
                                        setIsCreateOpen(false);
                                        fetchPosts();
                                    }}
                                />
                            </DialogContent>
                        </Dialog>
                    </div>
                </div>
            </div>

            
            <div className="flex-1 overflow-auto p-4 md:p-6">
                <div className="max-w-7xl mx-auto space-y-6">
                    
                    <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
                        <Tabs defaultValue="all" value={selectedCategory} onValueChange={setSelectedCategory} className="w-full sm:w-auto">
                            <TabsList>
                                <TabsTrigger value="all">All</TabsTrigger>
                                <TabsTrigger value="theory">Theory</TabsTrigger>
                                <TabsTrigger value="lab">Lab</TabsTrigger>
                                <TabsTrigger value="general">General</TabsTrigger>
                            </TabsList>
                        </Tabs>

                        <div className="flex items-center gap-2 w-full sm:w-auto">
                            <Select value={showResolved} onValueChange={setShowResolved}>
                                <SelectTrigger className="w-full sm:w-[150px]">
                                    <Filter className="w-4 h-4 mr-2 text-muted-foreground" />
                                    <SelectValue placeholder="Status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Status</SelectItem>
                                    <SelectItem value="unresolved">Unresolved</SelectItem>
                                    <SelectItem value="resolved">Resolved</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    
                    {loading ? (
                        <div className="space-y-4">
                            {[1, 2, 3].map((i) => (
                                <Card key={i} className="animate-pulse">
                                    <CardHeader className="space-y-2">
                                        <div className="h-4 bg-muted rounded w-1/4"></div>
                                        <div className="h-6 bg-muted rounded w-3/4"></div>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="h-4 bg-muted rounded w-full mb-2"></div>
                                        <div className="h-4 bg-muted rounded w-2/3"></div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    ) : error ? (
                         <div className="flex flex-col items-center justify-center p-8 text-center border border-dashed rounded-lg">
                            <div className="p-3 bg-destructive/10 rounded-full mb-4">
                                <span className="text-2xl">⚠️</span>
                            </div>
                            <h3 className="font-semibold text-lg">Failed to load posts</h3>
                            <p className="text-muted-foreground mb-4">{error}</p>
                            <Button variant="outline" onClick={fetchPosts}>Try Again</Button>
                        </div>
                    ) : posts.length === 0 ? (
                        <div className="flex flex-col items-center justify-center p-12 text-center border border-dashed rounded-lg bg-muted/20">
                            <div className="p-4 bg-background rounded-full mb-4 shadow-sm">
                                <MessageSquare className="w-8 h-8 text-muted-foreground" />
                            </div>
                            <h3 className="font-semibold text-xl mb-2">No discussions found</h3>
                            <p className="text-muted-foreground mb-6 max-w-sm">
                                Be the first to start a conversation in this category.
                            </p>
                            <Button onClick={() => setIsCreateOpen(true)}>
                                <Plus className="w-4 h-4 mr-2" />
                                Start Discussion
                            </Button>
                        </div>
                    ) : (
                        <div className="grid gap-4">
                            {posts.map((post) => (
                                <Link key={post.id} href={`/community/${post.id}`}>
                                    <Card className="hover:border-primary/50 transition-colors cursor-pointer group">
                                        <CardHeader className="pb-3">
                                            <div className="flex justify-between items-start gap-4">
                                                <div className="flex items-center gap-3">
                                                    <Avatar className="h-8 w-8">
                                                        <AvatarImage src={post.author.avatarUrl ?? undefined} />
                                                        <AvatarFallback className="bg-primary/10 text-primary text-xs">
                                                            {post.author.name.substring(0, 2).toUpperCase()}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                    <div className="flex flex-col">
                                                        <span className="text-sm font-medium leading-none">
                                                            {post.author.name}
                                                        </span>
                                                        <span className="text-xs text-muted-foreground">
                                                            {formatDate(post.createdAt)}
                                                        </span>
                                                    </div>
                                                </div>
                                                {post.isResolved && (
                                                    <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/30">
                                                        <CheckCircle className="w-3 h-3 mr-1" />
                                                        Resolved
                                                    </Badge>
                                                )}
                                            </div>
                                            <CardTitle className="text-lg group-hover:text-primary transition-colors mt-2">
                                                {post.title}
                                            </CardTitle>
                                            <div className="flex items-center gap-2 mt-2">
                                                <Badge variant="outline" className={`${CATEGORY_STYLES[post.category]} border-0`}>
                                                    {CATEGORY_LABELS[post.category]}
                                                </Badge>
                                                {post.courseTopic && (
                                                    <Badge variant="outline" className="text-muted-foreground">
                                                        {post.courseTopic}
                                                    </Badge>
                                                )}
                                            </div>
                                        </CardHeader>
                                        <CardContent>
                                            <p className="text-muted-foreground line-clamp-2 text-sm">
                                                {post.content}
                                            </p>
                                        </CardContent>
                                        <CardFooter className="pt-0 text-xs text-muted-foreground flex gap-4">
                                            <div className="flex items-center gap-1">
                                                <MessageSquare className="w-3 h-3" />
                                                {post.commentCount} comments
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <MoreHorizontal className="w-3 h-3" />
                                                {post.viewCount} views
                                            </div>
                                        </CardFooter>
                                    </Card>
                                </Link>
                            ))}
                        </div>
                    )}

                    
                    {!loading && !error && posts.length > 0 && hasMore && (
                        <div className="flex justify-center pt-2">
                            <Button
                                variant="outline"
                                onClick={loadMore}
                                disabled={loadingMore}
                            >
                                {loadingMore ? 'Loading...' : 'Load more discussions'}
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function CreatePostForm({ onSuccess }: { onSuccess: () => void }) {
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [category, setCategory] = useState<string>('general');
    const [courseTopic, setCourseTopic] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);

        try {
            await apiFetch('/community/posts', {
                method: 'POST',
                body: {
                    title,
                    content,
                    category,



                    courseTopic: courseTopic || undefined,
                },
            });

            onSuccess();
        } catch (err) {
            console.error(err);
            alert(err instanceof ApiError ? err.message : 'Failed to create post');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                    id="title"
                    placeholder="What's your question?"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                    className="text-lg font-medium"
                />
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="category">Category</Label>
                    <Select value={category} onValueChange={setCategory}>
                        <SelectTrigger id="category">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="theory">Theory</SelectItem>
                            <SelectItem value="lab">Lab</SelectItem>
                            <SelectItem value="general">General</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-2">
                    <Label htmlFor="topic">Topic (Optional)</Label>
                    <Input
                        id="topic"
                        placeholder="e.g. Data Structures"
                        value={courseTopic}
                        onChange={(e) => setCourseTopic(e.target.value)}
                    />
                </div>
            </div>

            <div className="space-y-2">
                <Label htmlFor="content">Content</Label>
                <Textarea
                    id="content"
                    placeholder="Describe your issue in detail..."
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    className="min-h-[200px] resize-y"
                    required
                />
                <p className="text-xs text-muted-foreground">Markdown is supported.</p>
            </div>

            <div className="flex justify-end gap-3 pt-4">
                <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
                    {submitting ? 'Publishing...' : 'Publish Discussion'}
                </Button>
            </div>
        </form>
    );
}

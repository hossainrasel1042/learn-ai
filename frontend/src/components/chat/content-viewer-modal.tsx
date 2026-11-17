'use client';

import { useState, useEffect } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MarkdownRenderer } from './markdown-renderer';
import { CLIENT_BACKEND_ORIGIN } from '@/lib/client-api-base';
import { Loader2, Download, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ContentViewerModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    contentUrl?: string;
    title?: string;
}

export function ContentViewerModal({
    open,
    onOpenChange,
    contentUrl,
    title = 'Course Content'
}: ContentViewerModalProps) {
    const [content, setContent] = useState<string>('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [baseUrl, setBaseUrl] = useState<string>('');
    const [downloadUrl, setDownloadUrl] = useState<string>('');

    useEffect(() => {
        if (!contentUrl || !open) return;

        const controller = new AbortController();

        const loadContent = async () => {
            setIsLoading(true);
            setError(null);

            try {














                let fetchUrl = '';

                if (contentUrl.startsWith('view-content://')) {
                    const relative = contentUrl.replace('view-content://', '');

                    const rootBase = CLIENT_BACKEND_ORIGIN;
                    fetchUrl = `${rootBase}/contents/${relative}`;
                } else {
                    fetchUrl = contentUrl;
                }

                setDownloadUrl(fetchUrl);




                const lastSlash = fetchUrl.lastIndexOf('/');
                setBaseUrl(fetchUrl.substring(0, lastSlash + 1));

                const response = await fetch(fetchUrl, {
                    credentials: 'include',
                    signal: controller.signal,
                });

                if (!response.ok) {
                    throw new Error(`Failed to load content (${response.status})`);
                }

                const text = await response.text();
                if (!controller.signal.aborted) {
                    setContent(text);
                }
            } catch (err) {
                if ((err as { name?: string })?.name === 'AbortError') {

                    return;
                }
                console.error('Error loading content:', err);
                setError(err instanceof Error ? err.message : 'Unknown error');
            } finally {
                if (!controller.signal.aborted) {
                    setIsLoading(false);
                }
            }
        };

        loadContent();

        return () => controller.abort();
    }, [contentUrl, open]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl h-[85vh] flex flex-col p-0 gap-0">
                <DialogHeader className="px-6 py-4 border-b">
                    <div className="flex items-center justify-between">
                        <DialogTitle>{title}</DialogTitle>
                        {downloadUrl && (
                            <Button variant="ghost" size="sm" asChild>
                                <a href={downloadUrl} download target="_blank" rel="noopener noreferrer">
                                    <Download className="h-4 w-4 mr-2" />
                                    Download
                                </a>
                            </Button>
                        )}
                    </div>
                </DialogHeader>

                <div className="flex-1 overflow-hidden relative bg-white dark:bg-zinc-950">
                    {isLoading ? (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : error ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-destructive p-6 text-center">
                            <AlertCircle className="h-10 w-10 mb-2" />
                            <p className="font-semibold">Failed to load content</p>
                            <p className="text-sm text-balance mt-1 opacity-80">{error}</p>
                        </div>
                    ) : (
                        <ScrollArea className="h-full">
                            <div className="px-8 py-8 max-w-3xl mx-auto">
                                <MarkdownRenderer
                                    content={content}
                                    className="pb-10"
                                    baseImageUrl={baseUrl}
                                />
                            </div>
                        </ScrollArea>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}

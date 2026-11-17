'use client';



import { useEffect, useState } from 'react';
import { Loader2, Search, X } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface MatchmakingOverlayProps {

    onCancel: () => void;

    remainingSec?: number;
}

export function MatchmakingOverlay({ onCancel, remainingSec }: MatchmakingOverlayProps) {
    const [elapsed, setElapsed] = useState(0);

    useEffect(() => {
        const t0 = Date.now();
        const id = setInterval(() => {
            setElapsed(Math.floor((Date.now() - t0) / 1000));
        }, 250);
        return () => clearInterval(id);
    }, []);


    const expandedSearch = elapsed >= 10;
    const encourage = elapsed >= 20;

    return (
        <Card className="border-primary/40 bg-primary/5 p-6">
            <div className="flex flex-col items-center gap-3 text-center">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <div className="font-medium">Searching for an opponent…</div>
                <div className="text-xs text-muted-foreground">
                    Same-level players are matched first.{' '}
                    {expandedSearch
                        ? 'We have widened the search to nearby levels.'
                        : 'We expand the search after 10s.'}
                </div>
                {encourage && (
                    <div className="text-xs text-muted-foreground/80">
                        Still waiting? Share a course with a friend to invite them into
                        a match.
                    </div>
                )}
                <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <Search className="h-3 w-3" />
                    {elapsed}s elapsed
                    {typeof remainingSec === 'number' && (
                        <span className="ml-2">
                            · timeout in {remainingSec}s
                        </span>
                    )}
                </div>

                <Button
                    variant="outline"
                    size="sm"
                    onClick={onCancel}
                    className="mt-3"
                >
                    <X className="mr-1 h-3 w-3" />
                    Cancel search
                </Button>
            </div>
        </Card>
    );
}

export default MatchmakingOverlay;

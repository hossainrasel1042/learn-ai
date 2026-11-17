'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Trophy, Equal, Hand, Repeat2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { EndedReason } from '@/types/quiz-battle';

interface BattleResultCardProps {
    isWinner: boolean;
    isDraw: boolean;
    reason: EndedReason | null;

    opponentEnded: boolean;
    myScore: number;
    opponentScore: number;
    total: number;
    onRematch: () => void;

    replayHref?: string;
}


const OPPONENT_REASON_TEXT: Record<EndedReason, string> = {
    completed: 'All questions answered',
    time_up: 'Time up',
    inactivity_forfeit: 'Opponent forfeited (inactivity)',
    player_left: 'Opponent left the match',
    cancelled: 'Cancelled',
};


const PLAYER_REASON_TEXT: Record<EndedReason, string> = {
    completed: 'All questions answered',
    time_up: 'Time up',
    inactivity_forfeit: 'You forfeited (inactivity)',
    player_left: 'You left the match',
    cancelled: 'Cancelled',
};

export function BattleResultCard({
    isWinner,
    isDraw,
    reason,
    opponentEnded,
    myScore,
    opponentScore,
    total,
    onRematch,
    replayHref,
}: BattleResultCardProps) {
    const Icon = isDraw ? Equal : isWinner ? Trophy : Hand;
    const headline = isDraw ? 'Draw' : isWinner ? 'You win!' : 'You lose';
    const tone = isDraw
        ? 'text-muted-foreground'
        : isWinner
        ? 'text-emerald-600'
        : 'text-red-600';
    const reasonLine = (opponentEnded ? OPPONENT_REASON_TEXT : PLAYER_REASON_TEXT)[
        reason || 'completed'
    ];




    const [revealed, setRevealed] = useState(false);
    useEffect(() => {
        const t = setTimeout(() => setRevealed(true), 350);
        return () => clearTimeout(t);
    }, []);

    return (
        <Card className="relative overflow-hidden p-6 text-center">
            <style>{`
                @keyframes battle-result-pop {
                    0%   { transform: scale(0.4) rotate(-12deg); opacity: 0; }
                    60%  { transform: scale(1.15) rotate(4deg); opacity: 1; }
                    100% { transform: scale(1) rotate(0deg); opacity: 1; }
                }
                @keyframes battle-result-rise {
                    0%   { transform: translateY(24px); opacity: 0; }
                    100% { transform: translateY(0); opacity: 1; }
                }
                .animate-battle-result-pop { animation: battle-result-pop 600ms cubic-bezier(0.34, 1.56, 0.64, 1) both; }
                .animate-battle-result-rise { animation: battle-result-rise 500ms ease-out both; }
            `}</style>

            <div
                className="mx-auto h-16 w-16 rounded-full bg-gradient-to-br from-primary/20 to-primary/5
                           flex items-center justify-center animate-battle-result-pop"
            >
                <Icon className={`h-10 w-10 ${tone}`} />
            </div>

            <div className={`mt-3 text-2xl font-semibold ${tone} animate-battle-result-rise`}>
                {headline}
            </div>
            <div className="mt-1 text-sm text-muted-foreground animate-battle-result-rise">
                {reasonLine}
            </div>

            <div
                className="mt-6 text-4xl font-bold transition-all duration-500"
                style={{ opacity: revealed ? 1 : 0, transform: revealed ? 'scale(1)' : 'scale(0.7)' }}
            >
                <span className="tabular-nums">{myScore}</span>
                <span className="mx-3 text-base font-normal text-muted-foreground">vs</span>
                <span className="tabular-nums">{opponentScore}</span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground transition-opacity duration-500"
                 style={{ opacity: revealed ? 1 : 0 }}>
                out of {total} questions
            </div>

            <div
                className="mt-6 flex flex-wrap justify-center gap-2 transition-all duration-500"
                style={{ opacity: revealed ? 1 : 0, transform: revealed ? 'translateY(0)' : 'translateY(8px)' }}
            >
                <Button onClick={onRematch}>
                    <Repeat2 className="mr-2 h-4 w-4" />
                    Find another match
                </Button>
                {replayHref && (
                    <Button asChild variant="outline">
                        <Link href={replayHref}>Replay</Link>
                    </Button>
                )}
                <Button asChild variant="ghost">
                    <Link href="/play">Back to play</Link>
                </Button>
            </div>
        </Card>
    );
}
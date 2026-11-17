'use client';

import { User } from 'lucide-react';

import { Card } from '@/components/ui/card';

interface OpponentPanelProps {
    opponent: { id: string; levelScore: number };
    myScore: number;
    opponentScore: number;
}

export function OpponentPanel({ opponent, myScore, opponentScore }: OpponentPanelProps) {
    return (
        <Card className="flex items-center justify-between gap-4 p-4">
            <div className="flex items-center gap-3">
                <User className="h-5 w-5" />
                <div>
                    <div className="text-sm font-medium">
                        Opponent {opponent.id.slice(0, 8)}…
                    </div>
                    <div className="text-xs text-muted-foreground">
                        Level {opponent.levelScore}
                    </div>
                </div>
            </div>
            <div className="flex items-center gap-6">
                <div className="text-center">
                    <div className="text-xs text-muted-foreground">You</div>
                    <div className="text-2xl font-semibold text-primary">{myScore}</div>
                </div>
                <div className="text-center">
                    <div className="text-xs text-muted-foreground">Opp</div>
                    <div className="text-2xl font-semibold">{opponentScore}</div>
                </div>
            </div>
        </Card>
    );
}
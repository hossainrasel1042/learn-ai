'use client';

import { Activity, AlertTriangle } from 'lucide-react';

import { Card } from '@/components/ui/card';

interface InactivityBarProps {

    myAccumSec: number;
    opponentAccumSec: number;

    budgetSec?: number;
}

export function InactivityBar({
    myAccumSec,
    opponentAccumSec,
    budgetSec = 60,
}: InactivityBarProps) {










    const mySec = Math.min(budgetSec, Math.max(0, myAccumSec));
    const oppSec = Math.min(budgetSec, Math.max(0, opponentAccumSec));

    const myPct = (mySec / budgetSec) * 100;
    const oppPct = (oppSec / budgetSec) * 100;

    const isWarning = mySec >= budgetSec * 0.5;
    const isCritical = mySec >= budgetSec * (50 / 60);

    return (
        <Card className="p-3">
            <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                    <Activity className="h-3 w-3" />
                    Inactivity budget
                </div>
                <div>
                    {mySec}s / {budgetSec}s
                    {isCritical && (
                        <AlertTriangle className="ml-1 inline h-3 w-3 text-red-500" />
                    )}
                </div>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                    className={`h-full transition-all ${
                        isCritical
                            ? 'bg-red-500'
                            : isWarning
                            ? 'bg-amber-500'
                            : 'bg-emerald-500'
                    }`}
                    style={{ width: `${myPct}%` }}
                />
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                <span>Opponent</span>
                <span>
                    {oppSec}s / {budgetSec}s
                </span>
            </div>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                    className="h-full bg-slate-400"
                    style={{ width: `${oppPct}%` }}
                />
            </div>
        </Card>
    );
}

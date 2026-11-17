'use client';



import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';

import { useBattleMatch } from '@/hooks/use-battle-match';
import { getBattleMatch } from '@/lib/api/quiz-battle-api';
import { BattleQuestionCard } from '@/components/play/BattleQuestionCard';
import { OpponentPanel } from '@/components/play/OpponentPanel';
import { InactivityBar } from '@/components/play/InactivityBar';
import { BattleResultCard } from '@/components/play/BattleResultCard';
import { CountdownOverlay } from '@/components/play/CountdownOverlay';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { BattleQuestion, MatchDetailResponse } from '@/types/quiz-battle';

export default function MatchRoomPage() {
    const params = useParams<{ matchId: string }>();
    const matchId = params?.matchId;
    const router = useRouter();
    const [detail, setDetail] = useState<MatchDetailResponse | null>(null);
    const [error, setError] = useState<string | null>(null);










    const initialQuestions: BattleQuestion[] = useMemo(
        () =>
            (detail?.questions || []).map((q) => ({
                id: q.id,
                matchId: q.matchId,
                position: q.position,
                prompt: q.prompt,
                optionA: q.optionA,
                optionB: q.optionB,
                optionC: q.optionC,
                optionD: q.optionD,
                tags: q.tags || [],
                difficulty: q.difficulty,
            })),
        [detail],
    );

    const battle = useBattleMatch({
        matchId: matchId || undefined,
        durationMs: 10 * 60 * 1000,
        questionCount: initialQuestions.length || 20,
        initialQuestions,
    });

    useEffect(() => {
        if (!matchId) return;
        let mounted = true;
        (async () => {
            try {
                const d = await getBattleMatch(matchId);
                if (!mounted) return;
                setDetail(d);
            } catch (e) {
                if (!mounted) return;
                setError(e instanceof Error ? e.message : 'Failed to load match');
            }
        })();
        return () => {
            mounted = false;
        };
    }, [matchId]);


    useEffect(() => {
        if (!matchId) return;
        battle.joinMatch(matchId);
    }, [matchId, battle.joinMatch]);

    if (error) {
        return (
            <div className="container mx-auto max-w-3xl py-10 text-red-600">
                {error}
            </div>
        );
    }
    if (!detail) {
        return (
            <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading match...
            </div>
        );
    }

    return (
        <div className="container mx-auto max-w-5xl space-y-4 py-6">
            <div className="flex items-center justify-between">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {





                        battle.leave();
                        router.push('/play');
                    }}
                >
                    <ArrowLeft className="h-4 w-4" />
                    Back
                </Button>
                <div className="text-sm text-muted-foreground">
                    Match {matchId?.slice(0, 8)}…
                </div>
            </div>

            
            <InactivityBar
                myAccumSec={battle.myInactivitySec}
                opponentAccumSec={battle.opponentInactivitySec}
                budgetSec={60}
            />

            
            {battle.phase === 'finished' && battle.result ? (
                <BattleResultCard
                    isWinner={
                        battle.result.winner !== null && battle.result.winner === battle.you
                    }
                    isDraw={battle.result.winner === null}
                    reason={battle.result.reason || 'completed'}




                    opponentEnded={
                        battle.result.winner !== null &&
                        battle.result.winner === battle.you
                    }
                    myScore={battle.myScore}
                    opponentScore={battle.opponentScore}
                    total={battle.total}
                    onRematch={() => router.push('/play')}
                    replayHref={matchId ? `/play/match/${matchId}/replay` : undefined}
                />
            ) : (
                <Card className="relative p-4 overflow-hidden">
                    {battle.phase === 'error' ? (




                        <div className="flex h-40 flex-col items-center justify-center gap-2 text-center">
                            <div className="text-lg font-medium text-red-600">
                                {battle.error || 'The match could not be joined.'}
                            </div>
                            <Button
                                variant="outline"
                                size="sm"







                                onClick={() => battle.joinMatch(matchId || '', true)}
                            >
                                Try again
                            </Button>
                        </div>
                    ) : battle.phase === 'countdown' ? (
                        <>
                            <div className="flex h-40 items-center justify-center text-2xl font-bold">
                                Match starting in…
                            </div>
                            <CountdownOverlay seconds={3} />
                        </>
                    ) : battle.phase === 'matched' ? (
                        <div className="flex h-40 items-center justify-center text-muted-foreground">
                            Waiting for the match to start…
                        </div>
                    ) : battle.current ? (
                        <>
                            <div className="mb-3 flex items-center justify-between text-sm text-muted-foreground">
                                <span>
                                    Question {battle.index + 1} / {battle.total}
                                </span>
                                <span>{battle.elapsedSec}s elapsed</span>
                            </div>
                            
                            {battle.error && (
                                <div
                                    role="status"
                                    aria-live="polite"
                                    className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
                                >
                                    {battle.error}
                                </div>
                            )}
                            <BattleQuestionCard
                                question={battle.current}
                                selected={battle.selected}
                                onSelect={battle.select}
                                disabled={battle.phase !== 'in_progress'}
                            />
                        </>
                    ) : (
                        <div className="flex h-40 items-center justify-center text-muted-foreground">
                            Waiting…
                        </div>
                    )}
                </Card>
            )}

            
            {battle.opponent && (
                <OpponentPanel
                    opponent={battle.opponent}
                    myScore={battle.myScore}
                    opponentScore={battle.opponentScore}
                />
            )}
        </div>
    );
}
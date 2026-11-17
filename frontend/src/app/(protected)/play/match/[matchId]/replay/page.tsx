'use client';



import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Check, ChevronLeft, ChevronRight, X } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { getBattleMatch } from '@/lib/api/quiz-battle-api';
import type {
    BattleAnswer,
    BattleQuestion,
    EndedReason,
    MatchDetailResponse,
} from '@/types/quiz-battle';

type Tab = 'mine' | 'opponent' | 'both';


const REASON_TEXT: Record<EndedReason, { opponent: string; player: string }> = {
    completed: {
        opponent: 'All questions answered',
        player: 'All questions answered',
    },
    time_up: { opponent: 'Time up', player: 'Time up' },
    inactivity_forfeit: {
        opponent: 'Opponent forfeited (inactivity)',
        player: 'You forfeited (inactivity)',
    },
    player_left: {
        opponent: 'Opponent left the match',
        player: 'You left the match',
    },
    cancelled: { opponent: 'Cancelled', player: 'Cancelled' },
};

export default function ReplayPage() {
    const params = useParams<{ matchId: string }>();
    const matchId = params?.matchId;
    const router = useRouter();

    const [detail, setDetail] = useState<MatchDetailResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [index, setIndex] = useState(0);
    const [tab, setTab] = useState<Tab>('both');
    const [showAll, setShowAll] = useState(false);

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
                setError(e instanceof Error ? e.message : 'Failed to load replay');
            }
        })();
        return () => { mounted = false; };
    }, [matchId]);

    const myUserId = useMemo(() => {











        if (!detail) return null;
        return detail.you ?? detail.match.playerOne;
    }, [detail]);

    if (error) {
        return (
            <div className="container mx-auto max-w-3xl py-10 text-red-600">{error}</div>
        );
    }
    if (!detail) {
        return (
            <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading replay...
            </div>
        );
    }

    const { match, questions, answers, scores } = detail;
    const opponentId =
        myUserId === match.playerOne ? match.playerTwo : match.playerOne;
    const total = questions.length;
    const q = questions[index] || null;

    const myAnswer = q && myUserId
        ? answers.find((a) => a.questionId === q.id && a.userId === myUserId)
        : undefined;
    const opponentAnswer = q
        ? answers.find((a) => a.questionId === q.id && a.userId === opponentId)
        : undefined;

    const isWinner =
        match.winner !== null && match.winner === myUserId;
    const isDraw = match.winner === null;
    const outcomeLabel = isDraw
        ? 'Draw'
        : isWinner
        ? 'You won'
        : 'You lost';







    const opponentEnded = isWinner;
    const reasonLine = match.endedReason
        ? REASON_TEXT[match.endedReason as EndedReason]?.[
              opponentEnded ? 'opponent' : 'player'
          ] ?? match.endedReason
        : null;

    const goPrev = () => setIndex((i) => Math.max(0, i - 1));








    const goNext = () => setIndex((i) => Math.max(0, Math.min(total - 1, i + 1)));

    if (showAll) {
        return (
            <div className="container mx-auto max-w-4xl space-y-4 py-6">
                <Header
                    match={match}
                    scores={scores}
                    myUserId={myUserId}
                    outcomeLabel={outcomeLabel}
                    reasonLine={reasonLine}
                    onBack={() => router.push(matchId ? `/play/match/${matchId}` : '/play')}
                    onToggleShow={() => setShowAll(false)}
                />
                <div className="space-y-3">
                    {questions.map((qq, i) => {
                        const mine = answers.find((a) => a.questionId === qq.id && a.userId === myUserId);
                        const opp = answers.find((a) => a.questionId === qq.id && a.userId === opponentId);
                        return (
                            <Card key={qq.id} className="p-4 space-y-2">
                                <div className="flex items-center justify-between text-sm text-muted-foreground">
                                    <span>Question {i + 1} / {total}</span>
                                    <Badge variant="outline">{qq.difficulty || '—'}</Badge>
                                </div>
                                <div className="font-semibold">{qq.prompt}</div>
                                <AnswerRow
                                    label="You"
                                    answer={mine}
                                    correct={qq.correct}
                                    options={qq}
                                />
                                <AnswerRow
                                    label="Opponent"
                                    answer={opp}
                                    correct={qq.correct}
                                    options={qq}
                                />
                                {qq.explanation && (
                                    <div className="text-xs text-muted-foreground italic">
                                        {qq.explanation}
                                    </div>
                                )}
                            </Card>
                        );
                    })}
                </div>
            </div>
        );
    }

    return (
        <div className="container mx-auto max-w-4xl space-y-4 py-6">
            <Header
                match={match}
                scores={scores}
                myUserId={myUserId}
                outcomeLabel={outcomeLabel}
                reasonLine={reasonLine}
                onBack={() => router.push(matchId ? `/play/match/${matchId}` : '/play')}
                onToggleShow={() => setShowAll(true)}
            />

            {!q && (


                <Card className="p-6 text-center text-muted-foreground">
                    This match has no questions to review.
                </Card>
            )}

            {q && (
                <Card className="p-6 space-y-4">
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <span>Question {index + 1} / {total}</span>
                        <Badge variant="outline">{q.difficulty || '—'}</Badge>
                    </div>

                    <div className="text-lg font-semibold">{q.prompt}</div>

                    <div className="flex gap-2 border-b pb-2">
                        <TabButton active={tab === 'both'} onClick={() => setTab('both')}>Both</TabButton>
                        <TabButton active={tab === 'mine'} onClick={() => setTab('mine')}>You</TabButton>
                        <TabButton active={tab === 'opponent'} onClick={() => setTab('opponent')}>Opponent</TabButton>
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        {(tab === 'both' || tab === 'mine') && (
                            <AnswerPanel
                                label="You"
                                answer={myAnswer}
                                correct={q.correct}
                                q={q}
                            />
                        )}
                        {(tab === 'both' || tab === 'opponent') && (
                            <AnswerPanel
                                label="Opponent"
                                answer={opponentAnswer}
                                correct={q.correct}
                                q={q}
                            />
                        )}
                    </div>

                    {q.explanation && (
                        <div className="rounded-md bg-muted/50 p-3 text-sm">
                            <span className="font-semibold">Why: </span>
                            {q.explanation}
                        </div>
                    )}

                    <div className="flex items-center justify-between pt-2">
                        <Button variant="outline" onClick={goPrev} disabled={index === 0}>
                            <ChevronLeft className="mr-1 h-4 w-4" />
                            Previous
                        </Button>
                        <div className="text-xs text-muted-foreground">
                            {index + 1} / {total}
                        </div>
                        <Button variant="outline" onClick={goNext} disabled={index === total - 1}>
                            Next
                            <ChevronRight className="ml-1 h-4 w-4" />
                        </Button>
                    </div>
                </Card>
            )}
        </div>
    );
}





function Header({
    match, scores, myUserId, outcomeLabel, reasonLine, onBack, onToggleShow,
}: {
    match: MatchDetailResponse['match'];
    scores: Record<string, number>;
    myUserId: string | null;
    outcomeLabel: string;

    reasonLine: string | null;
    onBack: () => void;
    onToggleShow: () => void;
}) {
    return (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
                <Button variant="ghost" size="sm" onClick={onBack}>
                    <ArrowLeft className="h-4 w-4" />
                    Back
                </Button>
                <div>
                    <div className="text-sm text-muted-foreground">Match replay</div>
                    <div className="font-semibold">{outcomeLabel} · {match.id.slice(0, 8)}</div>
                    {reasonLine && (
                        <div className="text-xs text-muted-foreground">{reasonLine}</div>
                    )}
                </div>
            </div>
            <div className="flex items-center gap-2 text-sm">
                <div className="rounded-md bg-muted px-3 py-1">
                    You: <span className="font-bold">{myUserId ? (scores[myUserId] ?? 0) : 0}</span>
                </div>
                <div className="rounded-md bg-muted px-3 py-1">
                    Opp:{' '}
                    <span className="font-bold">
                        {myUserId === match.playerOne
                            ? (scores[match.playerTwo] ?? 0)
                            : (scores[match.playerOne] ?? 0)}
                    </span>
                </div>
                <Button size="sm" variant="outline" onClick={onToggleShow}>
                    Show all
                </Button>
            </div>
        </div>
    );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`px-3 py-1 text-sm font-medium transition-colors ${
                active
                    ? 'border-b-2 border-primary text-primary'
                    : 'text-muted-foreground hover:text-foreground'
            }`}
        >
            {children}
        </button>
    );
}

function AnswerPanel({
    label, answer, correct, q,
}: {
    label: string;
    answer: BattleAnswer | undefined;
    correct: 'A' | 'B' | 'C' | 'D' | undefined;
    q: BattleQuestion;
}) {
    const isRight = answer && answer.selected === correct;
    const missed = answer && answer.selected !== correct;
    return (
        <div className="rounded-lg border bg-card p-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
                <span className="font-semibold">{label}</span>
                {!answer ? (
                    <Badge variant="outline">No answer</Badge>
                ) : isRight ? (
                    <Badge className="bg-emerald-600 text-white">
                        <Check className="mr-1 h-3 w-3" /> Correct
                    </Badge>
                ) : (
                    <Badge variant="destructive">
                        <X className="mr-1 h-3 w-3" /> Wrong
                    </Badge>
                )}
            </div>
            {answer?.selected ? (
                <div className="text-sm">
                    Answer:{' '}
                    <span className="font-mono font-semibold">{answer.selected}</span>{' '}
                    — {optionText(q, answer.selected)}
                </div>
            ) : (
                <div className="text-sm text-muted-foreground">Did not answer</div>
            )}
            {answer?.timeSeconds != null && (
                <div className="text-xs text-muted-foreground">
                    {answer.timeSeconds}s
                </div>
            )}
            {!missed && !isRight && !answer && correct && (
                <div className="text-xs text-muted-foreground">
                    Correct was <span className="font-mono font-semibold">{correct}</span>
                </div>
            )}
        </div>
    );
}

function AnswerRow({
    label, answer, correct, options,
}: {
    label: string;
    answer: BattleAnswer | undefined;
    correct: 'A' | 'B' | 'C' | 'D' | undefined;
    options: BattleQuestion;
}) {
    const isRight = answer && answer.selected === correct;
    return (
        <div className="flex items-start justify-between gap-2 text-sm">
            <span className="font-medium">{label}:</span>
            {answer ? (
                <span className={isRight ? 'text-emerald-600' : 'text-red-600'}>
                    {answer.selected || '—'} · {optionText(options, answer.selected)}
                </span>
            ) : (
                <span className="text-muted-foreground">No answer</span>
            )}
        </div>
    );
}

function optionText(q: BattleQuestion, letter: 'A' | 'B' | 'C' | 'D' | null | undefined): string {
    if (!letter) return '—';
    return q[`option${letter}` as 'optionA' | 'optionB' | 'optionC' | 'optionD'] || letter;
}

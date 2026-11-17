'use client';



import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Swords, Trophy, History, Loader2, UserPlus } from 'lucide-react';

import {
    getMyBattleProfile,
    listPlayCourses,
    listBattleMatches,
} from '@/lib/api/quiz-battle-api';
import { useBattleMatch } from '@/hooks/use-battle-match';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { CoursePicker } from '@/components/play/CoursePicker';
import { MatchmakingOverlay } from '@/components/play/MatchmakingOverlay';
import { NoOpponentModal } from '@/components/play/NoOpponentModal';
import { PlayWithFriendModal } from '@/components/play/PlayWithFriendModal';
import { tierFor, tierColor } from '@/types/quiz-battle';
import { getSocket } from '@/lib/socket';
import type { BattleProfile, PlayCourse, BattleMatchSummary } from '@/types/quiz-battle';

export default function PlayPage() {
    const router = useRouter();
    const [profile, setProfile] = useState<BattleProfile | null>(null);
    const [courses, setCourses] = useState<PlayCourse[]>([]);
    const [matches, setMatches] = useState<BattleMatchSummary[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedCourse, setSelectedCourse] = useState<PlayCourse | null>(null);
    const [friendModalOpen, setFriendModalOpen] = useState(false);

    const battle = useBattleMatch();

    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                const [p, c, m] = await Promise.all([
                    getMyBattleProfile(),
                    listPlayCourses(),
                    listBattleMatches(1, 10),
                ]);
                if (!mounted) return;
                setProfile(p.profile);
                setCourses(c.courses);
                setMatches(m.matches);
            } catch (e) {
                if (!mounted) return;
                setError(e instanceof Error ? e.message : 'Failed to load play data');
            } finally {
                if (mounted) setIsLoading(false);
            }
        })();
        return () => {
            mounted = false;
        };
    }, []);


    useEffect(() => {
        if (battle.phase === 'matched' && battle.matchId) {
            router.push(`/play/match/${encodeURIComponent(battle.matchId)}`);
        }
    }, [battle.phase, battle.matchId, router]);




    useEffect(() => {
        const socket = getSocket();
        if (!socket) return;
        const onPing = (data: { kind: string; matchId: string }) => {
            if (data.kind === 'matched') {
                router.push(`/play/match/${encodeURIComponent(data.matchId)}`);
            }
        };
        socket.on('battle:notification', onPing);
        const onInvite = (data: {
            kind: string;
            payload?: Record<string, unknown>;
        }) => {
            if (data.kind !== 'invite_accepted') return;
            const matchId =
                typeof data.payload?.matchId === 'string'
                    ? data.payload.matchId
                    : null;
            if (matchId) {
                router.push(`/play/match/${encodeURIComponent(matchId)}`);
            }
        };
        socket.on('battle:invite', onInvite);
        return () => {
            socket.off('battle:notification', onPing);
            socket.off('battle:invite', onInvite);
        };
    }, [router]);

    if (isLoading) {
        return (
            <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading play data...
            </div>
        );
    }

    if (error) {
        return (
            <div className="container mx-auto max-w-3xl py-10 text-red-600">
                {error}
            </div>
        );
    }

    const tier = profile ? tierFor(profile.levelScore) : 'Bronze';

    return (
        <div className="container mx-auto max-w-4xl space-y-6 py-8">
            <div className="flex items-center gap-3">
                <Swords className="h-7 w-7 text-primary" />
                <div>
                    <h1 className="text-2xl font-semibold">Real-time 1v1 Quiz Battle</h1>
                    <p className="text-sm text-muted-foreground">
                        Pick a course. Find an opponent. Race to 20 questions.
                    </p>
                </div>
            </div>

            
            {profile && (
                <Card className="p-4">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <Trophy className="h-5 w-5" />
                            <div>
                                <div className="font-medium">
                                    {profile.wins}W · {profile.losses}L · {profile.draws}D
                                </div>
                                <div className="text-xs text-muted-foreground">
                                    Level score: {profile.levelScore}
                                </div>
                            </div>
                        </div>
                        <Badge className={tierColor(tier)}>{tier}</Badge>
                    </div>
                </Card>
            )}

            
            <Card className="p-4">
                <CoursePicker
                    courses={courses}
                    selected={selectedCourse}
                    onSelect={setSelectedCourse}
                    disabled={battle.phase !== 'idle'}
                />
                <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                        disabled={!selectedCourse || battle.phase !== 'idle'}
                        onClick={() => selectedCourse && battle.enqueue(selectedCourse.id)}
                    >
                        {battle.phase === 'queued' ? 'Searching…' : 'Find opponent'}
                    </Button>
                    <Button
                        variant="outline"
                        disabled={battle.phase !== 'idle'}
                        onClick={() => setFriendModalOpen(true)}
                    >
                        <UserPlus className="mr-2 h-4 w-4" />
                        Play with a friend
                    </Button>
                    {battle.phase === 'queued' && (
                        <Button variant="outline" onClick={battle.cancelQueue}>
                            Cancel
                        </Button>
                    )}
                </div>
            </Card>

            <PlayWithFriendModal
                open={friendModalOpen}
                onOpenChange={setFriendModalOpen}
                courses={courses}
                selectedCourse={selectedCourse}
                onSelectCourse={setSelectedCourse}
            />

            
            {battle.phase === 'queued' && (
                <MatchmakingOverlay
                    onCancel={battle.cancelQueue}
                    remainingSec={battle.queueRemainingSec}
                />
            )}


            <NoOpponentModal
                open={battle.phase === 'queue_timeout'}
                onRetry={battle.retryQueue}
                onCancel={battle.cancelQueue}
            />

            
            {battle.error && (
                <div className="rounded-md border border-red-500/30 bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">
                    {battle.error}
                </div>
            )}

            
            {battle.rateLimit && (
                <div className="rounded-md border border-amber-500/30 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
                    Slow down — please wait a moment before sending another{' '}
                    {battle.rateLimit.action}.
                </div>
            )}

            
            <Card className="p-4">
                <div className="mb-3 flex items-center gap-2 font-medium">
                    <History className="h-4 w-4" />
                    Recent matches
                </div>
                {matches.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No matches yet.</p>
                ) : (
                    <ul className="divide-y text-sm">
                        {matches.map((m) => (
                            <li
                                key={m.id}
                                className="flex items-center justify-between py-2"
                            >
                                <div>
                                    <div className="font-medium">
                                        {m.endedReason || m.status}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                        {new Date(m.createdAt).toLocaleString()}
                                    </div>
                                </div>
                                <Badge variant="outline">
                                    {m.winner ? 'Decisive' : 'Draw'}
                                </Badge>
                            </li>
                        ))}
                    </ul>
                )}
            </Card>
        </div>
    );
}
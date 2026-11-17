'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, X } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
    acceptBattleInvite,
    declineBattleInvite,
    type BattleInviteNotification,
} from '@/lib/api/quiz-battle-api';

interface BattleInviteCardProps {
    notification: BattleInviteNotification;
    onResolved: () => void;
}

function str(value: unknown): string | null {
    return typeof value === 'string' && value.length > 0 ? value : null;
}

export function BattleInviteCard({ notification, onResolved }: BattleInviteCardProps) {
    const router = useRouter();
    const [pending, setPending] = useState<'accept' | 'decline' | null>(null);

    const payload = notification.payload || {};
    const senderName = str(payload.senderName) || 'A friend';
    const courseName = str(payload.courseName) || 'a course';

    const onAccept = async () => {
        setPending('accept');
        try {
            const { matchId } = await acceptBattleInvite(notification.inviteId);
            toast.success('Let the battle begin!');
            onResolved();
            router.push(`/play/match/${encodeURIComponent(matchId)}`);
        } catch (e) {
            const message = e instanceof Error ? e.message : 'Could not join the match';
            toast.error(
                message || 'You are not available right now — try later',
            );
            onResolved();
        } finally {
            setPending(null);
        }
    };

    const onDecline = async () => {
        setPending('decline');
        try {
            await declineBattleInvite(notification.inviteId);
            toast.success('Invitation declined');
            onResolved();
        } catch (e) {
            const message = e instanceof Error ? e.message : 'Could not decline';
            toast.error(message);
            onResolved();
        } finally {
            setPending(null);
        }
    };

    return (
        <div className="mt-2 space-y-2 rounded-md border bg-muted/40 p-2">
            <p className="text-xs text-muted-foreground">
                <strong className="text-foreground">{senderName}</strong> invited you
                to a battle on <strong className="text-foreground">{courseName}</strong>.
                The invitation expires in 10 minutes.
            </p>
            <div className="flex gap-2">
                <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                        e.stopPropagation();
                        void onDecline();
                    }}
                    disabled={pending !== null}
                >
                    {pending === 'decline' ? (
                        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                    ) : (
                        <X className="mr-1 h-3.5 w-3.5" />
                    )}
                    No play
                </Button>
                <Button
                    size="sm"
                    onClick={(e) => {
                        e.stopPropagation();
                        void onAccept();
                    }}
                    disabled={pending !== null}
                >
                    {pending === 'accept' && (
                        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                    )}
                    Let&apos;s play
                </Button>
            </div>
        </div>
    );
}

export default BattleInviteCard;

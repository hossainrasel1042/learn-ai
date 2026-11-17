'use client';



import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Bell, Swords, UserPlus, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
    listBattleNotifications,
    markBattleNotificationRead,
    listBattleInviteNotifications,
    markBattleInviteNotificationRead,
    type BattleNotification,
    type BattleInviteNotification,
    type BattleInviteNotificationKind,
} from '@/lib/api/quiz-battle-api';
import { BattleInviteCard } from '@/components/play/BattleInviteCard';
import { getSocket } from '@/lib/socket';
import { cn } from '@/lib/utils';

const POLL_MS = 30_000;

const KIND_LABEL: Record<BattleNotification['kind'], string> = {
    matched: 'Your battle is starting',
    opponent_answered: 'Opponent answered a question',
    opponent_left: 'Opponent left the match',
    ended: 'Match ended',
};

const INVITE_KIND_LABEL: Record<BattleInviteNotificationKind, string> = {
    invite: 'A friend wants to battle',
    invite_sent: 'Invitation sent',
    invite_declined: 'Your invitation was declined',
    invite_unavailable: 'Your friend is not available',
    invite_expired: 'Your invitation expired',
    invite_accepted: 'Your friend accepted — battle starting',
};

type BellItem =
    | { source: 'battle'; createdAt: string; notification: BattleNotification }
    | { source: 'invite'; createdAt: string; notification: BattleInviteNotification };

function isPendingInvite(n: BattleInviteNotification): boolean {
    if (n.inviteStatus) return n.inviteStatus === 'pending';
    if (n.inviteExpiresAt) {
        return new Date(n.inviteExpiresAt).getTime() > Date.now();
    }
    return true;
}

export function BattleNotificationsBell() {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [battleItems, setBattleItems] = useState<BattleNotification[]>([]);
    const [inviteItems, setInviteItems] = useState<BattleInviteNotification[]>([]);
    const wrapRef = useRef<HTMLDivElement | null>(null);

    const refresh = useCallback(async () => {
        try {
            const [battle, invite] = await Promise.all([
                listBattleNotifications(50).catch(() => ({ notifications: [] as BattleNotification[] })),
                listBattleInviteNotifications(50).catch(() => ({ notifications: [] as BattleInviteNotification[] })),
            ]);
            setBattleItems(battle.notifications || []);
            setInviteItems(invite.notifications || []);
        } catch {

        }
    }, []);


    useEffect(() => {




        Promise.resolve().then(() => { void refresh(); });
        const id = setInterval(refresh, POLL_MS);
        return () => clearInterval(id);
    }, [refresh]);


    useEffect(() => {
        const socket = getSocket();
        if (!socket) return;
        const onPing = () => {

            refresh();
        };
        socket.on('battle:notification', onPing);
        socket.on('battle:invite', onPing);
        return () => {
            socket.off('battle:notification', onPing);
            socket.off('battle:invite', onPing);
        };
    }, [refresh]);


    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (!wrapRef.current?.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const items: BellItem[] = [
        ...battleItems.map((n) => ({
            source: 'battle' as const,
            createdAt: n.createdAt,
            notification: n,
        })),
        ...inviteItems.map((n) => ({
            source: 'invite' as const,
            createdAt: n.createdAt,
            notification: n,
        })),
    ].sort((a, b) => {
        const ta = new Date(a.createdAt).getTime();
        const tb = new Date(b.createdAt).getTime();
        return tb - ta;
    });

    const unread = items.filter((i) => !i.notification.readAt).length;

    const markRead = async (item: BellItem) => {
        if (item.notification.readAt) return;
        try {
            if (item.source === 'battle') {
                await markBattleNotificationRead(item.notification.id);
                setBattleItems((cur) =>
                    cur.map((c) =>
                        c.id === item.notification.id
                            ? { ...c, readAt: new Date().toISOString() }
                            : c,
                    ),
                );
            } else {
                await markBattleInviteNotificationRead(item.notification.id);
                setInviteItems((cur) =>
                    cur.map((c) =>
                        c.id === item.notification.id
                            ? { ...c, readAt: new Date().toISOString() }
                            : c,
                    ),
                );
            }
        } catch {

        }
    };

    const onClickItem = (item: BellItem) => {
        if (item.source === 'battle') {
            const n = item.notification;
            void markRead(item);
            if (n.kind === 'matched') {
                router.push(`/play/match/${encodeURIComponent(n.matchId)}`);
            } else if (n.kind === 'ended' || n.kind === 'opponent_left') {
                router.push(`/play/match/${encodeURIComponent(n.matchId)}/replay`);
            }
            setOpen(false);
            return;
        }

        const n = item.notification;
        const payload = n.payload || {};
        if (n.kind === 'invite') {
            void markRead(item);
            return;
        }
        void markRead(item);
        if (n.kind === 'invite_accepted') {
            const matchId = typeof payload.matchId === 'string' ? payload.matchId : null;
            if (matchId) {
                router.push(`/play/match/${encodeURIComponent(matchId)}`);
                setOpen(false);
                return;
            }
        }
        setOpen(false);
    };

    return (
        <div className="relative" ref={wrapRef}>
            <Button
                variant="ghost"
                size="icon"
                aria-label="Notifications"
                onClick={() => setOpen((v) => !v)}
                className="relative"
            >
                <Bell className="h-5 w-5" />
                {unread > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                        {unread > 9 ? '9+' : unread}
                    </span>
                )}
            </Button>
            {open && (
                <div
                    className={cn(
                        'absolute right-0 mt-2 w-96 max-h-[60vh] overflow-y-auto rounded-lg border bg-card shadow-lg z-50',
                    )}
                    role="menu"
                >
                    <div className="flex items-center justify-between border-b px-3 py-2 text-sm font-medium">
                        <span>Battle notifications</span>
                        <button
                            type="button"
                            onClick={() => setOpen(false)}
                            className="rounded p-1 hover:bg-muted"
                            aria-label="Close"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                    {items.length === 0 ? (
                        <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                            No notifications yet.
                        </div>
                    ) : (
                        <ul className="divide-y">
                            {items.map((item) => {
                                const isInvite = item.source === 'invite';
                                const invite = isInvite ? item.notification : null;
                                const battle = !isInvite ? item.notification : null;
                                const kind = invite
                                    ? invite.kind
                                    : (battle!.kind as string);
                                const label = invite
                                    ? INVITE_KIND_LABEL[invite.kind]
                                    : KIND_LABEL[battle!.kind];
                                return (
                                    <li
                                        key={`${item.source}:${item.notification.id}`}
                                        className={cn(
                                            'flex items-start gap-2 px-3 py-2 text-sm hover:bg-muted/50 cursor-pointer',
                                            !item.notification.readAt && 'bg-primary/5',
                                        )}
                                        onClick={() => onClickItem(item)}
                                    >
                                        {isInvite ? (
                                            <UserPlus className="mt-0.5 h-4 w-4 text-primary" />
                                        ) : (
                                            <Swords className="mt-0.5 h-4 w-4 text-primary" />
                                        )}
                                        <div className="min-w-0 flex-1">
                                            <div className="font-medium">
                                                {label || kind}
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                {new Date(item.createdAt).toLocaleString()}
                                            </div>
                                            {invite?.kind === 'invite'
                                                && isPendingInvite(invite) && (
                                                <BattleInviteCard
                                                    notification={invite}
                                                    onResolved={() => {
                                                        void refresh();
                                                    }}
                                                />
                                            )}
                                        </div>
                                        {!item.notification.readAt && (
                                            <span className="mt-1 h-2 w-2 rounded-full bg-primary" />
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                    <div className="border-t px-3 py-2 text-right">
                        <Button asChild variant="ghost" size="sm">
                            <Link href="/play">Open play</Link>
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default BattleNotificationsBell;

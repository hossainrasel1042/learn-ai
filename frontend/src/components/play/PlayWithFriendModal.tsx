'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Send, UserPlus } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CoursePicker } from '@/components/play/CoursePicker';
import { CopyButton } from '@/components/chat/copy-button';
import {
    getFriendCode,
    sendBattleInvite,
    type SendInviteResponse,
} from '@/lib/api/quiz-battle-api';
import type { PlayCourse } from '@/types/quiz-battle';

interface PlayWithFriendModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    courses: PlayCourse[];
    selectedCourse: PlayCourse | null;
    onSelectCourse: (course: PlayCourse) => void;
}

export function PlayWithFriendModal({
    open,
    onOpenChange,
    courses,
    selectedCourse,
    onSelectCourse,
}: PlayWithFriendModalProps) {
    const [myCode, setMyCode] = useState<string | null>(null);
    const [code, setCode] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isSending, setIsSending] = useState(false);

    const loadMyCode = useCallback(async () => {
        try {
            const { friendCode } = await getFriendCode();
            setMyCode(friendCode);
        } catch {
            setMyCode(null);
        }
    }, []);

    useEffect(() => {
        if (!open) return;
        setError(null);
        setCode('');
        void loadMyCode();
    }, [open, loadMyCode]);

    const onCodeChange = (value: string) => {
        setCode(value.replace(/\D/g, '').slice(0, 8));
        setError(null);
    };

    const canSubmit = Boolean(selectedCourse) && code.length === 8 && !isSending;

    const onSubmit = async () => {
        if (!selectedCourse || code.length !== 8) return;
        setIsSending(true);
        setError(null);
        try {
            const result: SendInviteResponse = await sendBattleInvite(
                selectedCourse.id,
                code,
            );
            toast.success(`Invitation sent to ${result.invitee?.name || 'your friend'}`);
            onOpenChange(false);
        } catch (e) {
            const message =
                e instanceof Error ? e.message : 'Could not send the invitation';
            setError(message);
            toast.error(message);
        } finally {
            setIsSending(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <UserPlus className="h-5 w-5 text-primary" />
                        Play with a friend
                    </DialogTitle>
                    <DialogDescription>
                        Pick a course, then enter your friend&apos;s 8-digit profile
                        code. They will get a notification with{' '}
                        <strong>No play</strong> and <strong>Let&apos;s play</strong>{' '}
                        buttons.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    {myCode && (
                        <div className="rounded-md border bg-muted/40 p-3">
                            <Label className="text-xs text-muted-foreground">
                                Your profile code — share it with your friend
                            </Label>
                            <div className="mt-1 flex items-center gap-2">
                                <span className="font-mono text-xl tracking-widest">
                                    {myCode}
                                </span>
                                <CopyButton text={myCode} />
                            </div>
                        </div>
                    )}

                    <div className="space-y-2">
                        <Label>Course</Label>
                        <CoursePicker
                            courses={courses}
                            selected={selectedCourse}
                            onSelect={onSelectCourse}
                            disabled={isSending}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="friend-code">Friend&apos;s profile code</Label>
                        <Input
                            id="friend-code"
                            inputMode="numeric"
                            maxLength={8}
                            autoComplete="off"
                            placeholder="12345678"
                            value={code}
                            onChange={(e) => onCodeChange(e.target.value)}
                            disabled={!selectedCourse || isSending}
                            className="font-mono tracking-widest"
                        />
                        {error && (
                            <p className="text-xs text-destructive">{error}</p>
                        )}
                    </div>
                </div>

                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={isSending}
                    >
                        Cancel
                    </Button>
                    <Button onClick={onSubmit} disabled={!canSubmit}>
                        {isSending ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Sending...
                            </>
                        ) : (
                            <>
                                <Send className="mr-2 h-4 w-4" />
                                Send invitation
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default PlayWithFriendModal;

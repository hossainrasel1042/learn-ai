'use client';

import { UserX, RefreshCw, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';

interface NoOpponentModalProps {
    open: boolean;
    onRetry: () => void;
    onCancel: () => void;
}

export function NoOpponentModal({ open, onRetry, onCancel }: NoOpponentModalProps) {
    return (
        <Dialog open={open} onOpenChange={(next) => { if (!next) onCancel(); }}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader className="text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                        <UserX className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <DialogTitle className="mt-2">No player available</DialogTitle>
                    <DialogDescription>
                        We could not find an opponent within 60 seconds. No player is
                        available or found for this course right now.
                    </DialogDescription>
                </DialogHeader>

                <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-center">
                    <Button variant="outline" onClick={onCancel}>
                        <X className="mr-2 h-4 w-4" />
                        Cancel
                    </Button>
                    <Button onClick={onRetry}>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Retry
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default NoOpponentModal;

"use client";



import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    updateMember,
    type AdminMember,
    type AdminRole,
    type AdminStatus,
} from "@/lib/api/admin";

interface EditMemberDialogProps {
    member: AdminMember | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onUpdated?: (member: AdminMember) => void;
}

export function EditMemberDialog({
    member,
    open,
    onOpenChange,
    onUpdated,
}: EditMemberDialogProps) {
    const [role, setRole] = useState<AdminRole>("moderator");
    const [status, setStatus] = useState<AdminStatus>("active");
    const [isSubmitting, setIsSubmitting] = useState(false);









    useEffect(() => {
        if (!open) return;
        setRole(member ? member.role : "moderator");
        setStatus(member ? member.status : "active");
    }, [open, member]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!member) return;
        setIsSubmitting(true);
        try {
            const result = await updateMember(member.id, { role, status });
            toast.success("Member updated");
            onUpdated?.(result.member);
            onOpenChange(false);
        } catch (err) {
            const message =
                err instanceof Error ? err.message : "Failed to update member";
            toast.error(message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Edit member</DialogTitle>
                    <DialogDescription>
                        {member
                            ? `Change the role or status of ${member.email}.`
                            : ""}
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid gap-2">
                        <Label htmlFor="member-role">Role</Label>
                        <Select
                            value={role}
                            onValueChange={(v) => setRole(v as AdminRole)}
                        >
                            <SelectTrigger id="member-role">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="admin">Admin</SelectItem>
                                <SelectItem value="moderator">Moderator</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="member-status">Status</Label>
                        <Select
                            value={status}
                            onValueChange={(v) => setStatus(v as AdminStatus)}
                        >
                            <SelectTrigger id="member-status">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="active">Active</SelectItem>
                                <SelectItem value="suspended">Suspended</SelectItem>
                                <SelectItem value="removed">Removed</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={isSubmitting}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" disabled={isSubmitting || !member}>
                            {isSubmitting ? "Saving..." : "Save"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

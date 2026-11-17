"use client";



import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
    ADMIN_PERMISSIONS,
    updateMemberPermissions,
    type AdminMember,
    type AdminPermission,
} from "@/lib/api/admin";
import { useAdminMe } from "@/hooks/use-admin";

interface EditPermissionsDialogProps {
    member: AdminMember | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onUpdated?: (member: AdminMember) => void;
}

export function EditPermissionsDialog({
    member,
    open,
    onOpenChange,
    onUpdated,
}: EditPermissionsDialogProps) {
    const { member: sessionMember } = useAdminMe();
    const [permissions, setPermissions] = useState<AdminPermission[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);




    const isAdminRole = sessionMember?.role === "admin";
    const heldPermissions = (sessionMember?.permissions || []) as AdminPermission[];
    const grantablePermissions = isAdminRole
        ? [...ADMIN_PERMISSIONS]
        : ADMIN_PERMISSIONS.filter((p) => heldPermissions.includes(p));












    const heldButNotGrantable = (
        (member?.permissions || []) as AdminPermission[]
    ).filter((p) => !grantablePermissions.includes(p));









    useEffect(() => {
        if (!open) return;
        setPermissions(member ? ((member.permissions || []) as AdminPermission[]) : []);
    }, [open, member]);

    const toggle = (perm: AdminPermission, checked: boolean) => {
        setPermissions((prev) =>
            checked ? [...new Set([...prev, perm])] : prev.filter((p) => p !== perm),
        );
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!member) return;
        setIsSubmitting(true);
        try {
            const result = await updateMemberPermissions(member.id, permissions);
            toast.success("Permissions updated");
            onUpdated?.(result.member);
            onOpenChange(false);
        } catch (err) {
            const message =
                err instanceof Error ? err.message : "Failed to update permissions";
            toast.error(message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Edit permissions</DialogTitle>
                    <DialogDescription>
                        {member ? `Update permissions for ${member.email}.` : ""}
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid gap-2">
                        <Label id="edit-permissions-label">Permissions</Label>
                        <div
                            className="grid gap-2 rounded-md border p-3"
                            role="group"
                            aria-labelledby="edit-permissions-label"
                        >
                            {grantablePermissions.map((perm) => (
                                <div
                                    key={perm}
                                    className="flex items-center gap-2 text-sm"
                                >
                                    <Checkbox
                                        id={`edit-perm-${perm}`}
                                        aria-label={perm}
                                        checked={permissions.includes(perm)}
                                        onCheckedChange={(c) => toggle(perm, Boolean(c))}
                                    />
                                    <Label
                                        htmlFor={`edit-perm-${perm}`}
                                        className="cursor-pointer font-mono"
                                    >
                                        {perm}
                                    </Label>
                                </div>
                            ))}
                            
                            {heldButNotGrantable.length > 0 && (
                                <div className="mt-2 border-t pt-2">
                                    <p className="mb-2 text-xs text-muted-foreground">
                                        Held by this member (you cannot grant
                                        or revoke these):
                                    </p>
                                    {heldButNotGrantable.map((perm) => (
                                        <div
                                            key={perm}
                                            className="flex items-center gap-2 text-sm"
                                        >
                                            <Checkbox
                                                id={`edit-perm-held-${perm}`}
                                                aria-label={perm}
                                                checked
                                                disabled
                                            />
                                            <Label
                                                htmlFor={`edit-perm-held-${perm}`}
                                                className="font-mono text-muted-foreground"
                                            >
                                                {perm}
                                            </Label>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
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
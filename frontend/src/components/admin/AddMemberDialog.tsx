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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { createMember, ADMIN_PERMISSIONS, type AdminMember, type AdminPermission, type AdminRole } from "@/lib/api/admin";
import { useAdminMe } from "@/hooks/use-admin";

interface AddMemberDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCreated?: (member: AdminMember) => void;
}

export function AddMemberDialog({ open, onOpenChange, onCreated }: AddMemberDialogProps) {
    const { member: sessionMember } = useAdminMe();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [role, setRole] = useState<AdminRole>("moderator");
    const [permissions, setPermissions] = useState<AdminPermission[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);





    const isAdminRole = sessionMember?.role === "admin";




    const heldPermissions = (sessionMember?.permissions || []) as AdminPermission[];
    const grantablePermissions = isAdminRole
        ? [...ADMIN_PERMISSIONS]
        : ADMIN_PERMISSIONS.filter((p) => heldPermissions.includes(p));






    useEffect(() => {
        if (!open) return;
        setEmail("");
        setPassword("");
        setRole("moderator");
        setPermissions([]);
    }, [open]);



    useEffect(() => {
        if (!isAdminRole && role === "admin") setRole("moderator");
    }, [isAdminRole, role]);

    const togglePermission = (perm: AdminPermission, checked: boolean) => {
        setPermissions((prev) =>
            checked ? [...new Set([...prev, perm])] : prev.filter((p) => p !== perm),
        );
    };

    const reset = () => {
        setEmail("");
        setPassword("");
        setRole("moderator");
        setPermissions([]);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            const result = await createMember({
                email: email.trim(),
                password,
                role,
                permissions,
            });
            toast.success("Member created");
            onCreated?.(result.member);
            reset();
            onOpenChange(false);
        } catch (err) {
            const message =
                err instanceof Error ? err.message : "Failed to create member";
            toast.error(message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Add member</DialogTitle>
                    <DialogDescription>
                        Create a new admin or moderator. They&apos;ll be able to
                        log in at /admin/login with the password you set here.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid gap-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                            id="email"
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="password">Initial password</Label>
                        <Input
                            id="password"
                            type="password"
                            required
                            minLength={6}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="role">Role</Label>
                        <Select
                            value={role}
                            onValueChange={(v) => setRole(v as AdminRole)}
                        >
                            <SelectTrigger id="role">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                
                                {isAdminRole && (
                                    <SelectItem value="admin">Admin</SelectItem>
                                )}
                                <SelectItem value="moderator">Moderator</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid gap-2">
                        <Label id="permissions-label">Permissions</Label>
                        <div
                            className="grid gap-2 rounded-md border p-3"
                            role="group"
                            aria-labelledby="permissions-label"
                        >
                            {grantablePermissions.length === 0 ? (
                                <p className="text-xs text-muted-foreground">
                                    You do not hold any permissions you can grant.
                                </p>
                            ) : (
                                grantablePermissions.map((perm) => (
                                    <div
                                        key={perm}
                                        className="flex items-center gap-2 text-sm"
                                    >
                                        <Checkbox
                                            id={`add-perm-${perm}`}
                                            aria-label={perm}
                                            checked={permissions.includes(perm)}
                                            onCheckedChange={(c) => togglePermission(perm, Boolean(c))}
                                        />
                                        <Label
                                            htmlFor={`add-perm-${perm}`}
                                            className="cursor-pointer font-mono"
                                        >
                                            {perm}
                                        </Label>
                                    </div>
                                ))
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
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting ? "Creating..." : "Create"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
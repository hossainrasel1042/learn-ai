"use client";



import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Trash2, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import Link from "next/link";

import { AddMemberDialog } from "@/components/admin/AddMemberDialog";
import { EditPermissionsDialog } from "@/components/admin/EditPermissionsDialog";
import { useAdminMe, useMembers } from "@/hooks/use-admin";
import { deleteMember, type AdminMember } from "@/lib/api/admin";
import { canManageMemberActions } from "@/lib/rbac";

export function MemberList() {
    const [page, setPage] = useState(0);
    const PAGE_SIZE = 50;
    const { data, isLoading, isError, error, refresh } = useMembers({
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
    });
    const { member: currentMember } = useAdminMe();
    const [addOpen, setAddOpen] = useState(false);
    const [editTarget, setEditTarget] = useState<AdminMember | null>(null);
    const [editOpen, setEditOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<AdminMember | null>(null);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);




    const canManageActions = canManageMemberActions(currentMember);

    const handleDelete = async () => {
        if (!deleteTarget || isDeleting) return;
        setIsDeleting(true);
        try {
            await deleteMember(deleteTarget.id);
            toast.success(`Removed ${deleteTarget.email}`);
            setDeleteTarget(null);
            setDeleteOpen(false);








            if (data?.rows.length === 1 && page > 0) {
                setPage((p) => Math.max(0, p - 1));
            }
            await refresh();
        } catch (err) {
            const message =
                err instanceof Error ? err.message : "Failed to remove member";
            toast.error(message);
        } finally {
            setIsDeleting(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
                Loading members...
            </div>
        );
    }

    if (isError) {
        return (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">
                Failed to load members:{" "}
                {error instanceof Error ? error.message : "Unknown error"}
            </div>
        );
    }

    const rows = data?.rows ?? [];
    const total = data?.total ?? 0;
    const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-semibold">Members</h2>
                    <p className="text-sm text-muted-foreground">
                        {total} total
                    </p>
                </div>
                {canManageActions && (
                    <Button onClick={() => setAddOpen(true)} className="gap-1">
                        <Plus className="h-4 w-4" />
                        Add member
                    </Button>
                )}
            </div>

            {rows.length === 0 ? (
                <div className="rounded-md border border-dashed p-12 text-center text-sm text-muted-foreground">
                    No members yet.
                </div>
            ) : (
                <div className="rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Email</TableHead>
                                <TableHead>Role</TableHead>
                                <TableHead>Permissions</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {rows.map((m) => (
                                <TableRow
                                    key={m.id}
                                    className={m.status === "removed" ? "opacity-60" : ""}
                                >
                                    <TableCell>
                                        <Link
                                            href={`/admin/members/${encodeURIComponent(m.id)}`}
                                            className="font-medium hover:underline"
                                        >
                                            {m.email}
                                        </Link>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={m.role === "admin" ? "default" : "secondary"}>
                                            {m.role}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-wrap gap-1">
                                            {(m.permissions || []).length === 0 ? (
                                                <span className="text-xs text-muted-foreground">—</span>
                                            ) : (
                                                m.permissions.map((p) => (
                                                    <Badge key={p} variant="outline" className="font-mono text-xs">
                                                        {p}
                                                    </Badge>
                                                ))
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge
                                            variant={
                                                m.status === "active"
                                                    ? "default"
                                                    : m.status === "removed"
                                                        ? "destructive"
                                                        : "secondary"
                                            }
                                        >
                                            {m.status}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-1">
                                            
                                            {canManageActions && m.id !== currentMember?.id && (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => {
                                                        setEditTarget(m);
                                                        setEditOpen(true);
                                                    }}
                                                    disabled={m.status === "removed"}
                                                    title="Edit permissions"
                                                >
                                                    <Pencil className="h-4 w-4" />
                                                </Button>
                                            )}
                                            {canManageActions && m.id !== currentMember?.id && (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => {
                                                        setDeleteTarget(m);
                                                        setDeleteOpen(true);
                                                    }}
                                                    disabled={m.status === "removed"}
                                                    title="Remove"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            )}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            )}

            
            {pageCount > 1 && (
                <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                        Page {page + 1} of {pageCount}
                    </span>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={page === 0 || isLoading}
                            onClick={() => setPage((p) => Math.max(0, p - 1))}
                        >
                            Previous
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={page >= pageCount - 1 || isLoading}
                            onClick={() => setPage((p) => p + 1)}
                        >
                            Next
                        </Button>
                    </div>
                </div>
            )}

            <AddMemberDialog
                open={addOpen}
                onOpenChange={setAddOpen}
                onCreated={() => void refresh()}
            />
            <EditPermissionsDialog
                member={editTarget}
                open={editOpen}
                onOpenChange={setEditOpen}
                onUpdated={() => void refresh()}
            />
            <AlertDialog
                open={deleteOpen}
                onOpenChange={(open) => {
                    setDeleteOpen(open);




                    if (!open) setDeleteTarget(null);
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Remove member?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {deleteTarget
                                ? `${deleteTarget.email} will be marked as removed and can no longer sign in.`
                                : ""}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        
                        <AlertDialogAction
                            onClick={(e) => {
                                e.preventDefault();
                                void handleDelete();
                            }}
                            disabled={isDeleting}
                        >
                            {isDeleting ? "Removing..." : "Remove"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
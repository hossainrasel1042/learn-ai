"use client";



import { useRouter, useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2, Pencil, Trash2, UserCog } from "lucide-react";
import { toast } from "sonner";

import { AdminLayout } from "@/components/admin/AdminLayout";
import { EditPermissionsDialog } from "@/components/admin/EditPermissionsDialog";
import { EditMemberDialog } from "@/components/admin/EditMemberDialog";
import { MemberActivityList } from "@/components/admin/MemberActivityList";
import { MemberAuditList } from "@/components/admin/MemberAuditList";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { useAdminMe } from "@/hooks/use-admin";
import {
    deleteMember,
    getMember,
    type AdminMember,
} from "@/lib/api/admin";
import { canManageMemberActions, canManageTarget, canViewAudit } from "@/lib/rbac";

interface PageProps {
    params?: { id: string };
}

export default function AdminMemberDetailPage(_: PageProps) {
    const params = useParams<{ id: string }>();
    const id = params?.id ?? '';
    const router = useRouter();
    const { member: sessionMember, isLoading, isError, refresh } = useAdminMe();
    const [target, setTarget] = useState<AdminMember | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [editOpen, setEditOpen] = useState(false);
    const [editMemberOpen, setEditMemberOpen] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);


    useEffect(() => {
        if (!isLoading) {
            if (!sessionMember || isError) {
                router.replace("/admin/login");
            }
        }
    }, [isLoading, sessionMember, isError, router]);






    useEffect(() => {
        if (!sessionMember) return;
        let cancelled = false;
        (async () => {











            setTarget((prev) => (prev && prev.id !== id ? null : prev));








            try {

                if (sessionMember.id === id) {
                    if (!cancelled) {
                        setTarget(sessionMember);
                        setLoadError(null);
                    }
                    return;
                }
                const { member } = await getMember(id);
                if (!cancelled) {
                    setTarget(member);
                    setLoadError(null);
                }
            } catch (e) {
                if (!cancelled) {
                    setLoadError(
                        e instanceof Error ? e.message : "Failed to load member",
                    );
                }
            }
        })();
        return () => {
            cancelled = true;
        };







    }, [sessionMember?.id, id]);

    if (isLoading || !sessionMember || (!target && !loadError)) {
        return (
            <div className="flex min-h-screen items-center justify-center text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading...
            </div>
        );
    }








    const canManage = canManageMemberActions(sessionMember);
    const canManageThis = canManageTarget(sessionMember, target);


    const canChangeRole = sessionMember?.role === "admin";


    const isSelf = sessionMember.id === id;

    const handleDelete = async () => {
        setIsDeleting(true);
        try {
            await deleteMember(id);
            toast.success("Member removed");
            setDeleteOpen(false);
            await refresh();
            router.push("/admin/members");
        } catch (e) {
            const message =
                e instanceof Error ? e.message : "Failed to remove member";
            toast.error(message);
        } finally {
            setIsDeleting(false);
        }
    };

    const handleUpdated = (updated: AdminMember) => {
        setTarget(updated);
        void refresh();
    };

    return (
        <AdminLayout member={sessionMember}>
            <div className="space-y-6">
                <div>
                    <h1 className="text-xl font-semibold">
                        {target ? target.email : "Member"}
                    </h1>
                    {loadError ? (
                        <p className="mt-2 text-sm text-destructive">{loadError}</p>
                    ) : target ? (
                        <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                            <div>
                                Role:{" "}
                                <Badge variant={target.role === "admin" ? "default" : "secondary"}>
                                    {target.role}
                                </Badge>{" "}
                                · Status:{" "}
                                <Badge
                                    variant={
                                        target.status === "active"
                                            ? "default"
                                            : target.status === "removed"
                                                ? "destructive"
                                                : "secondary"
                                    }
                                >
                                    {target.status}
                                </Badge>
                            </div>
                            <div>
                                Permissions:{" "}
                                {(target.permissions || []).length === 0 ? (
                                    <span>none</span>
                                ) : (
                                    target.permissions.map((p) => (
                                        <Badge key={p} variant="outline" className="mr-1 font-mono text-xs">
                                            {p}
                                        </Badge>
                                    ))
                                )}
                            </div>
                            <div>
                                Created: {new Date(target.createdAt).toLocaleString()}
                                {target.lastLoginAt && (
                                    <>
                                        {" · Last sign-in: "}
                                        {new Date(target.lastLoginAt).toLocaleString()}
                                    </>
                                )}
                            </div>
                        </div>
                    ) : null}

                    {canManageThis && target && target.status !== "removed" && (
                        <div className="mt-4 flex gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                className="gap-1"
                                onClick={() => setEditOpen(true)}
                                disabled={isSelf}
                                title={
                                    isSelf
                                        ? "You can't change your own permissions"
                                        : "Edit permissions"
                                }
                            >
                                <Pencil className="h-4 w-4" />
                                Edit permissions
                            </Button>
                            <Button
                                variant="destructive"
                                size="sm"
                                className="gap-1"
                                onClick={() => setDeleteOpen(true)}
                                disabled={isSelf}
                                title={
                                    isSelf
                                        ? "You can't remove yourself"
                                        : "Remove"
                                }
                            >
                                <Trash2 className="h-4 w-4" />
                                Remove
                            </Button>
                        </div>
                    )}


                    {canManage && !canManageThis && target && target.status !== "removed" && (
                        <p className="mt-4 text-sm text-muted-foreground">
                            {target.role === "admin"
                                ? "Only a full admin can change or remove another admin."
                                : "You do not have permission to manage this member."}
                        </p>
                    )}


                    {canManageThis && canChangeRole && target && target.status !== "removed" && (
                        <div className="mt-4 flex gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                className="gap-1"
                                onClick={() => setEditMemberOpen(true)}
                                disabled={isSelf}
                                title={
                                    isSelf
                                        ? "You can't change your own role"
                                        : "Change role or status"
                                }
                            >
                                <UserCog className="h-4 w-4" />
                                Change role / status
                            </Button>
                        </div>
                    )}
                </div>

                <div>
                    <h2 className="mb-2 text-lg font-semibold">Activity</h2>
                    <MemberActivityList memberId={id} />
                </div>


                {canViewAudit(sessionMember) && (
                    <div>
                        <h2 className="mb-2 text-lg font-semibold">Audit log</h2>
                        <MemberAuditList memberId={id} />
                    </div>
                )}
            </div>

            <EditPermissionsDialog
                member={target}
                open={editOpen}
                onOpenChange={setEditOpen}
                onUpdated={handleUpdated}
            />
            <EditMemberDialog
                member={target}
                open={editMemberOpen}
                onOpenChange={setEditMemberOpen}
                onUpdated={handleUpdated}
            />
            <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Remove member?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {target?.email} will be marked as removed and can no
                            longer sign in.
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
        </AdminLayout>
    );
}
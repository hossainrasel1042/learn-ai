"use client";



import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";

import { AdminLayout } from "@/components/admin/AdminLayout";
import { MemberList } from "@/components/admin/MemberList";
import { AddMemberDialog } from "@/components/admin/AddMemberDialog";
import { useAdminMe } from "@/hooks/use-admin";
import { Button } from "@/components/ui/button";
import { canManageMemberActions, canManageMembers } from "@/lib/rbac";

export default function AdminMembersPage() {
    const router = useRouter();
    const { member, isLoading, isError } = useAdminMe();
    const [addOpen, setAddOpen] = useState(false);



    const canList = canManageMembers(member);
    const canManageActions = canManageMemberActions(member);

    useEffect(() => {
        if (!isLoading) {
            if (!member || isError) {
                router.replace("/admin/login");
            } else if (!canList && !canManageActions) {
                router.replace("/admin/dashboard");
            }
        }
    }, [isLoading, member, isError, router, canList, canManageActions]);

    if (isLoading || !member || (!canList && !canManageActions)) {
        return (
            <div className="flex min-h-screen items-center justify-center text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading...
            </div>
        );
    }

    return (
        <AdminLayout member={member}>
            {canList ? (
                <MemberList />
            ) : (
                <div className="space-y-4">
                    <div>
                        <h2 className="text-lg font-semibold">Members</h2>
                        <p className="text-sm text-muted-foreground">
                            Only an admin can see the full member list.
                        </p>
                    </div>
                    <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                        You can add members, but you cannot list the existing
                        ones. Ask an admin if you need to review or change an
                        existing member.
                    </div>
                    <Button onClick={() => setAddOpen(true)} className="gap-1">
                        <Plus className="h-4 w-4" />
                        Add member
                    </Button>
                    <AddMemberDialog
                        open={addOpen}
                        onOpenChange={setAddOpen}
                    />
                </div>
            )}
        </AdminLayout>
    );
}
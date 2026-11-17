"use client";



import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect } from "react";
import { Loader2, Users, History, Shield, FilePlus2 } from "lucide-react";

import { AdminLayout } from "@/components/admin/AdminLayout";
import { Badge } from "@/components/ui/badge";
import { useAdminMe } from "@/hooks/use-admin";
import { canManageMembers, canManageCourses } from "@/lib/rbac";

export default function AdminDashboardPage() {
    const router = useRouter();
    const { member, isLoading, isError } = useAdminMe();

    useEffect(() => {


        if (!isLoading && (!member || isError)) {
            router.replace("/admin/login");
        }
    }, [isLoading, member, isError, router]);

    if (isLoading || !member) {
        return (
            <div className="flex min-h-screen items-center justify-center text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Checking your session...
            </div>
        );
    }

    return (
        <AdminLayout member={member}>
            <div className="space-y-6">
                <div>
                    <h1 className="text-2xl font-semibold">
                        Welcome, {member.email}
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Role: <Badge variant={member.role === "admin" ? "default" : "secondary"}>{member.role}</Badge>
                        {member.lastLoginAt && (
                            <>
                                {" · "}Last sign-in:{" "}
                                {new Date(member.lastLoginAt).toLocaleString()}
                            </>
                        )}
                    </p>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                    <Link
                        href={`/admin/members/${encodeURIComponent(member.id)}`}
                        className="rounded-lg border bg-background p-4 transition hover:bg-muted/40"
                    >
                        <div className="flex items-center gap-2 font-medium">
                            <History className="h-4 w-4" />
                            My activity
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                            See course materials you&apos;ve uploaded.
                        </p>
                    </Link>

                    {canManageMembers(member) && (
                        <Link
                            href="/admin/members"
                            className="rounded-lg border bg-background p-4 transition hover:bg-muted/40"
                        >
                            <div className="flex items-center gap-2 font-medium">
                                <Users className="h-4 w-4" />
                                Manage members
                            </div>
                            <p className="mt-1 text-sm text-muted-foreground">
                                Add, remove, or change permissions for admins and moderators.
                            </p>
                        </Link>
                    )}

                    {canManageCourses(member) && (
                        <Link
                            href="/admin/materials"
                            className="rounded-lg border bg-background p-4 transition hover:bg-muted/40"
                        >
                            <div className="flex items-center gap-2 font-medium">
                                <FilePlus2 className="h-4 w-4" />
                                Add material
                            </div>
                            <p className="mt-1 text-sm text-muted-foreground">
                                Create new courses and upload materials.
                            </p>
                        </Link>
                    )}

                    {!canManageMembers(member) && (
                        <div className="rounded-lg border bg-muted/30 p-4">
                            <div className="flex items-center gap-2 font-medium">
                                <Shield className="h-4 w-4" />
                                Read-only access
                            </div>
                            <p className="mt-1 text-sm text-muted-foreground">
                                Your role doesn&apos;t include member-management
                                permissions. Contact an admin if you need elevated
                                access.
                            </p>
                        </div>
                    )}
                </div>

                <div className="text-xs text-muted-foreground">
                    Signed in as {member.email}. Cookies are session-based —
                    sign out from the top bar when you&apos;re done.
                </div>
            </div>
        </AdminLayout>
    );
}
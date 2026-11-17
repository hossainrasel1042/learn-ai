"use client";



import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Shield, Users, LayoutDashboard, History, FilePlus2, HardDrive, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { useSWRConfig } from "swr";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { logoutAdmin } from "@/lib/api/admin";
import type { AdminMember } from "@/lib/api/admin";
import { canManageCourses, canManageMemberActions, canManageMembers } from "@/lib/rbac";

interface AdminLayoutProps {
    member: AdminMember;
    children: React.ReactNode;
}

export function AdminLayout({ member, children }: AdminLayoutProps) {
    const pathname = usePathname();
    const { mutate } = useSWRConfig();

    const handleLogout = async () => {
        try {
            await logoutAdmin();

            // Clear ALL SWR cache for admin keys BEFORE navigating,
            // so the next login starts with a clean slate.
            await mutate(
                (key) => Array.isArray(key) && key[0] === "admin",
                undefined,
                { revalidate: false },
            );

            toast.success("Signed out");

            // Use window.location to do a hard navigation, which
            // fully clears the Next.js Router Cache (client-side).
            // router.push + router.refresh does NOT reliably bust
            // the cached server-component output from layout.tsx,
            // causing the next login to see stale auth state.
            window.location.href = "/admin/login";
            return;
        } catch {
            toast.error("Could not sign out");
        }
    };

    const isActive = (href: string) =>
        pathname === href || pathname?.startsWith(`${href}/`);

    return (
        <div className="flex min-h-screen flex-col bg-muted/20">
            
            <header className="flex h-14 items-center justify-between border-b bg-background px-4">
                <div className="flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    <span className="font-semibold">Admin Portal</span>
                    <Badge
                        variant={member.role === "admin" ? "default" : "secondary"}
                        className="ml-2"
                    >
                        {member.role}
                    </Badge>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground">
                        {member.email}
                    </span>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleLogout}
                        className="gap-1"
                    >
                        <LogOut className="h-4 w-4" />
                        Logout
                    </Button>
                </div>
            </header>

            <div className="flex flex-1">
                
                <aside className="hidden w-56 border-r bg-background md:block">
                    <nav className="flex flex-col gap-1 p-3 text-sm">
                        <Link
                            href="/admin/dashboard"
                            className={`flex items-center gap-2 rounded-md px-3 py-2 hover:bg-muted ${
                                isActive("/admin/dashboard")
                                    ? "bg-muted font-medium"
                                    : ""
                            }`}
                        >
                            <LayoutDashboard className="h-4 w-4" />
                            Dashboard
                        </Link>
                        {canManageMembers(member) && (
                            <Link
                                href="/admin/members"
                                className={`flex items-center gap-2 rounded-md px-3 py-2 hover:bg-muted ${
                                    isActive("/admin/members")
                                        ? "bg-muted font-medium"
                                        : ""
                                }`}
                            >
                                <Users className="h-4 w-4" />
                                Members
                            </Link>
                        )}
                        
                        {!canManageMembers(member) &&
                            canManageMemberActions(member) && (
                                <Link
                                    href="/admin/members"
                                    className={`flex items-center gap-2 rounded-md px-3 py-2 hover:bg-muted ${
                                        isActive("/admin/members")
                                            ? "bg-muted font-medium"
                                            : ""
                                    }`}
                                >
                                    <Users className="h-4 w-4" />
                                    Add member
                                </Link>
                            )}
                        <Link
                            href={`/admin/members/${encodeURIComponent(member.id)}`}
                            className={`flex items-center gap-2 rounded-md px-3 py-2 hover:bg-muted ${
                                pathname ===
                                `/admin/members/${encodeURIComponent(member.id)}`
                                    ? "bg-muted font-medium"
                                    : ""
                            }`}
                        >
                            <History className="h-4 w-4" />
                            My activity
                        </Link>
                        {canManageCourses(member) && (
                            <Link
                                href="/admin/materials"
                                className={`flex items-center gap-2 rounded-md px-3 py-2 hover:bg-muted ${
                                    isActive("/admin/materials")
                                        ? "bg-muted font-medium"
                                        : ""
                                }`}
                            >
                                <FilePlus2 className="h-4 w-4" />
                                Add material
                            </Link>
                        )}
                        {canManageCourses(member) && (

                            <Link
                                href="/admin/storage"
                                className={`flex items-center gap-2 rounded-md px-3 py-2 hover:bg-muted ${
                                    isActive("/admin/storage")
                                        ? "bg-muted font-medium"
                                        : ""
                                }`}
                            >
                                <HardDrive className="h-4 w-4" />
                                Storage uploads
                            </Link>
                        )}
                        <Link
                            href="/admin/account"
                            className={`flex items-center gap-2 rounded-md px-3 py-2 hover:bg-muted ${
                                isActive("/admin/account")
                                    ? "bg-muted font-medium"
                                    : ""
                            }`}
                        >
                            <KeyRound className="h-4 w-4" />
                            Account
                        </Link>
                    </nav>
                </aside>

                
                <main className="flex-1 p-6">{children}</main>
            </div>
        </div>
    );
}
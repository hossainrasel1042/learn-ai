"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, KeyRound, Check } from "lucide-react";
import { toast } from "sonner";

import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAdminMe } from "@/hooks/use-admin";
import { changeAdminPassword } from "@/lib/api/admin";
import { ApiError } from "@/lib/api";

export default function AdminAccountPage() {
    const router = useRouter();
    const { member, isLoading, isError } = useAdminMe();

    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [isUpdating, setIsUpdating] = useState(false);

    useEffect(() => {
        if (!isLoading && (!member || isError)) {
            router.replace("/admin/login");
        }
    }, [isLoading, member, isError, router]);

    const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        if (newPassword.length < 6) {
            toast.error("The new password must be at least 6 characters");
            return;
        }
        if (newPassword !== confirmPassword) {
            toast.error("The new passwords do not match");
            return;
        }
        if (newPassword === currentPassword) {
            toast.error("The new password must differ from the current one");
            return;
        }

        setIsUpdating(true);
        try {
            await changeAdminPassword({ currentPassword, newPassword });
            toast.success("Password changed successfully");
            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
        } catch (error) {
            if (error instanceof ApiError && error.status === 401) {
                toast.error("Your current password is incorrect");
            } else if (error instanceof ApiError && error.status === 403) {
                toast.error("You are not allowed to do that");
            } else {
                toast.error(
                    error instanceof ApiError
                        ? error.message
                        : "Failed to change the password",
                );
            }
        } finally {
            setIsUpdating(false);
        }
    };

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
            <div className="mx-auto max-w-2xl space-y-6">
                <div>
                    <h1 className="text-2xl font-semibold">Account</h1>
                    <p className="text-sm text-muted-foreground">
                        Signed in as {member.email}
                    </p>
                </div>

                <Card>
                    <CardHeader>
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                                <KeyRound className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                                <CardTitle>Change password</CardTitle>
                                <CardDescription>
                                    Update the password for your admin account
                                </CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="grid gap-2">
                                <Label htmlFor="currentPassword">
                                    Current password
                                </Label>
                                <Input
                                    id="currentPassword"
                                    type="password"
                                    autoComplete="current-password"
                                    placeholder="••••••••"
                                    value={currentPassword}
                                    onChange={(e) =>
                                        setCurrentPassword(e.target.value)
                                    }
                                    disabled={isUpdating}
                                    required
                                />
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="newPassword">
                                    New password
                                </Label>
                                <Input
                                    id="newPassword"
                                    type="password"
                                    autoComplete="new-password"
                                    placeholder="At least 6 characters"
                                    value={newPassword}
                                    onChange={(e) =>
                                        setNewPassword(e.target.value)
                                    }
                                    disabled={isUpdating}
                                    required
                                />
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="confirmPassword">
                                    Confirm new password
                                </Label>
                                <Input
                                    id="confirmPassword"
                                    type="password"
                                    autoComplete="new-password"
                                    placeholder="Repeat the new password"
                                    value={confirmPassword}
                                    onChange={(e) =>
                                        setConfirmPassword(e.target.value)
                                    }
                                    disabled={isUpdating}
                                    required
                                />
                            </div>

                            <Button
                                type="submit"
                                disabled={isUpdating}
                                className="w-full sm:w-auto"
                            >
                                {isUpdating ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Saving...
                                    </>
                                ) : (
                                    <>
                                        <Check className="mr-2 h-4 w-4" />
                                        Change password
                                    </>
                                )}
                            </Button>

                            <p className="text-xs text-muted-foreground">
                                The password set in the server&apos;s{" "}
                                <code>ADMIN_PASS</code> variable is only used
                                the first time the account is created. Changing
                                it here takes effect immediately and survives a
                                restart.
                            </p>
                        </form>
                    </CardContent>
                </Card>
            </div>
        </AdminLayout>
    );
}

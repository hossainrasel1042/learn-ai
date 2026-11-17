"use client";

import { cn } from "@/lib/utils";
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
import Link from "next/link";
import { Suspense, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { toast } from "sonner";
import { useRouter, useSearchParams } from "next/navigation";

function ResetPasswordForm() {
    const searchParams = useSearchParams();




    const token = searchParams.get("token");
    const errorParam = searchParams.get("error");
    const reasonParam = searchParams.get("reason");

    let initialError: string | null = null;
    if (errorParam === "expired" || reasonParam === "otp_expired") {
        initialError =
            "This password reset link has expired or already been used. Please request a new one.";
    } else if (errorParam === "invalid" || reasonParam === "missing_code") {
        initialError =
            "This password reset link is invalid. Please request a new one.";
    } else if (!token) {
        initialError =
            "This password reset link is missing its token. Please request a new one.";
    }

    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!token) {
            toast.error("This password reset link is invalid or has expired.");
            return;
        }

        if (password !== confirmPassword) {
            toast.error("Passwords do not match");
            return;
        }

        if (password.length < 6) {
            toast.error("Password must be at least 6 characters");
            return;
        }

        setIsLoading(true);

        try {
            await apiFetch("/reset-password", {
                method: "POST",
                body: { token, password, confirmPassword },
            });

            toast.success("Password reset successfully");
            router.push("/auth?mode=login");
        } catch (error) {
            toast.error(
                error instanceof ApiError
                    ? error.message
                    : "An unexpected error occurred",
            );
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center px-4">
            <div className={cn("flex w-full max-w-md flex-col gap-6")}>
                <Card>
                    <CardHeader>
                        <CardTitle className="text-2xl">
                            Reset Your Password
                        </CardTitle>
                        <CardDescription>
                            Enter your new password
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {initialError && (
                            <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                                {initialError}
                            </div>
                        )}
                        <form onSubmit={handleResetPassword}>
                            <div className="flex flex-col gap-6">
                                <div className="grid gap-2">
                                    <Label htmlFor="password">
                                        New Password
                                    </Label>
                                    <Input
                                        id="password"
                                        type="password"
                                        placeholder="••••••••"
                                        required
                                        value={password}
                                        onChange={(e) =>
                                            setPassword(e.target.value)
                                        }
                                        disabled={isLoading}
                                        minLength={6}
                                    />
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="confirmPassword">
                                        Confirm Password
                                    </Label>
                                    <Input
                                        id="confirmPassword"
                                        type="password"
                                        placeholder="••••••••"
                                        required
                                        value={confirmPassword}
                                        onChange={(e) =>
                                            setConfirmPassword(
                                                e.target.value,
                                            )
                                        }
                                        disabled={isLoading}
                                        minLength={6}
                                    />
                                </div>

                                <Button
                                    type="submit"
                                    className="w-full"
                                    disabled={isLoading || !token}
                                >
                                    {isLoading
                                        ? "Resetting..."
                                        : "Reset Password"}
                                </Button>
                            </div>
                            <div className="mt-4 text-center text-sm">
                                <Link
                                    href="/auth/forgot-password"
                                    className="underline underline-offset-4"
                                >
                                    Request a new link
                                </Link>
                                {" · "}
                                <Link
                                    href="/auth"
                                    className="underline underline-offset-4"
                                >
                                    Back to login
                                </Link>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

export default function ResetPasswordPage() {
    return (
        <Suspense fallback={null}>
            <ResetPasswordForm />
        </Suspense>
    );
}

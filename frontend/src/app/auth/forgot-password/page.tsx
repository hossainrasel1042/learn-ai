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
import { useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { toast } from "sonner";

const GENERIC_MESSAGE =
    "If an account exists for that email, we sent a reset code and a reset link.";

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [isResending, setIsResending] = useState(false);
    const [success, setSuccess] = useState(false);

    const handleForgotPassword = async (e: React.FormEvent) => {
        e.preventDefault();

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            toast.error("Please enter a valid email");
            return;
        }

        setIsLoading(true);

        try {
            const result = await apiFetch<{ success: boolean; message: string }>(
                "/forgot-password",
                {
                    method: "POST",
                    body: { email },
                },
            );
            setSuccess(true);
            toast.success(result.message || GENERIC_MESSAGE);
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

    const handleResend = async () => {
        if (!email) return;

        setIsResending(true);
        try {
            const result = await apiFetch<{ success: boolean; message: string }>(
                "/resend-otp",
                {
                    method: "POST",
                    body: { email },
                },
            );
            toast.success(result.message || GENERIC_MESSAGE);
        } catch (error) {
            if (error instanceof ApiError && error.status === 429) {
                toast.error("Please wait a minute before requesting another code.");
            } else {
                toast.error(
                    error instanceof ApiError
                        ? error.message
                        : "An unexpected error occurred",
                );
            }
        } finally {
            setIsResending(false);
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center px-4">
            <div className={cn("flex w-full max-w-md flex-col gap-6")}>
                {success ? (
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-2xl">
                                Reset Code Sent
                            </CardTitle>
                            <CardDescription>
                                Password reset instructions created
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground">
                                If an account exists for that email, a reset
                                code and a reset link have been sent to it. Use
                                the link, or enter the code on the reset page,
                                to choose a new password.
                            </p>
                            <Button
                                type="button"
                                variant="outline"
                                className="mt-4 w-full"
                                onClick={handleResend}
                                disabled={isResending}
                            >
                                {isResending ? "Sending..." : "Resend code"}
                            </Button>
                            <div className="mt-4 text-center text-sm">
                                <Link
                                    href="/auth"
                                    className="underline underline-offset-4"
                                >
                                    Back to login
                                </Link>
                            </div>
                        </CardContent>
                    </Card>
                ) : (
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-2xl">
                                Reset Your Password
                            </CardTitle>
                            <CardDescription>
                                Type in your email and we&apos;ll email you a
                                reset code and link
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleForgotPassword}>
                                <div className="flex flex-col gap-6">
                                    <div className="grid gap-2">
                                        <Label htmlFor="email">Email</Label>
                                        <Input
                                            id="email"
                                            type="email"
                                            placeholder="m@example.com"
                                            required
                                            value={email}
                                            onChange={(e) =>
                                                setEmail(e.target.value)
                                            }
                                            disabled={isLoading}
                                        />
                                    </div>
                                    <Button
                                        type="submit"
                                        className="w-full"
                                        disabled={isLoading}
                                    >
                                        {isLoading
                                            ? "Sending..."
                                            : "Send reset code"}
                                    </Button>
                                </div>
                                <div className="mt-4 text-center text-sm">
                                    Already have an account?{" "}
                                    <Link
                                        href="/auth"
                                        className="underline underline-offset-4"
                                    >
                                        Login
                                    </Link>
                                </div>
                            </form>
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    );
}

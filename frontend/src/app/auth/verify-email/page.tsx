"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, MailWarning } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { apiFetch, ApiError } from "@/lib/api";

type VerifyState = "verifying" | "success" | "error";

const MISSING_TOKEN_MESSAGE =
    "This verification link is missing its token. Please request a new one.";

function VerifyEmailInner() {
    const searchParams = useSearchParams();
    const token = searchParams.get("token");

    const [result, setResult] = useState<{
        state: VerifyState;
        message: string;
    } | null>(null);
    const fired = useRef(false);

    useEffect(() => {
        if (fired.current) return;
        fired.current = true;

        if (!token) return;

        let cancelled = false;

        (async () => {
            try {
                const response = await apiFetch<{
                    success: boolean;
                    message: string;
                }>(
                    "/verify-email",
                    {
                        method: "POST",
                        body: { token },
                    },
                );
                if (cancelled) return;
                setResult({
                    state: "success",
                    message:
                        response?.message ||
                        "Your email is verified — you can sign in now.",
                });
            } catch (error) {
                if (cancelled) return;
                setResult({
                    state: "error",
                    message:
                        error instanceof ApiError
                            ? error.message
                            : "This verification link has expired or was already used. Please request a new one.",
                });
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [token]);

    const state: VerifyState = !token
        ? "error"
        : (result?.state ?? "verifying");
    const message = !token ? MISSING_TOKEN_MESSAGE : (result?.message ?? "");

    return (
        <div className="flex min-h-screen items-center justify-center px-4">
            <div className={cn("flex w-full max-w-md flex-col gap-6")}>
                <Card>
                    <CardHeader>
                        <CardTitle className="text-2xl">
                            {state === "success"
                                ? "Email verified"
                                : state === "error"
                                  ? "Verification failed"
                                  : "Verifying your email"}
                        </CardTitle>
                        <CardDescription>
                            {state === "verifying"
                                ? "Please wait a moment."
                                : state === "success"
                                  ? "Your account is now active."
                                  : "We could not verify this link."}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="flex flex-col gap-6">
                            {state === "verifying" && (
                                <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-foreground" />
                            )}

                            {state === "success" && (
                                <>
                                    <div className="flex items-start gap-3 text-sm">
                                        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
                                        <p>{message}</p>
                                    </div>
                                    <Button asChild className="w-full">
                                        <Link href="/auth?mode=login">
                                            Back to login
                                        </Link>
                                    </Button>
                                </>
                            )}

                            {state === "error" && (
                                <>
                                    <div className="flex items-start gap-3 text-sm">
                                        <MailWarning className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                                        <p>{message}</p>
                                    </div>
                                    <div className="text-sm text-muted-foreground">
                                        Signing in again sends a fresh verification
                                        link to your inbox.
                                    </div>
                                    <Button asChild className="w-full">
                                        <Link href="/auth?mode=login">
                                            Back to login
                                        </Link>
                                    </Button>
                                </>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

export default function VerifyEmailPage() {
    return (
        <Suspense fallback={null}>
            <VerifyEmailInner />
        </Suspense>
    );
}

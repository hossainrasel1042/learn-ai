"use client";

import { Suspense, use } from "react";
import LoginForm from "@/components/auth/login-form";
import SignupForm from "@/components/auth/signup-form";
import { useEffect } from "react";
import { toast } from "sonner";

function AuthPageInner({
    searchParams,
}: {
    searchParams: Promise<{ mode?: string; message?: string; q?: string }>;
}) {
    const params = use(searchParams);
    const mode = params?.mode || "login";
    const message = params?.message || params?.q;

    useEffect(() => {
        if (message) {
            switch (message) {
                case "session-expired":
                    toast.error(
                        "Your session has expired. Please sign in again.",
                    );
                    break;
                case "unauthorized-admin":
                    toast.error(
                        "You do not have permission to access that page.",
                    );
                    break;
                case "error-checking-permissions":
                    toast.error(
                        "An error occurred while checking permissions.",
                    );
                    break;
                case "Missing code":


                    toast.error(
                        "Your password reset link is invalid or has expired. Please request a new one.",
                    );
                    break;
                case "verify-email":
                    toast.error(
                        "Your verification link has expired or was already used. Please sign in again to get a new one.",
                    );
                    break;
                default:
                    toast.error(decodeURIComponent(message));
            }
        }
    }, [message]);

    return mode === "signup" ? <SignupForm /> : <LoginForm />;
}

function AuthPageFallback() {
    return (
        <div className="flex items-center justify-center px-4 py-20 sm:px-6 lg:px-8">
            <div className="h-32 w-32 animate-pulse rounded-md bg-muted" />
        </div>
    );
}

export default function AuthPage({
    searchParams,
}: {
    searchParams: Promise<{ mode?: string; message?: string; q?: string }>;
}) {

    return (
        <Suspense fallback={<AuthPageFallback />}>
            <AuthPageInner searchParams={searchParams} />
        </Suspense>
    );
}

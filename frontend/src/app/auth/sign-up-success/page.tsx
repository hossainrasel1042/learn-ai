"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { MailCheck } from "lucide-react";

import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";

function SignUpSuccessInner() {
    const searchParams = useSearchParams();
    const email = searchParams.get("email") || "";

    const [isResending, setIsResending] = useState(false);
    const [resent, setResent] = useState(false);

    async function resend() {
        if (!email) return;
        setIsResending(true);
        try {
            await apiFetch("/signin", {
                method: "POST",
                body: { email, password: "" },
            });
        } catch {
            // The 403 is the expected answer: it means the link was re-sent.
        } finally {
            setIsResending(false);
            setResent(true);
        }
    }

    return (
        <div className="flex h-[calc(100vh-65px)] w-full items-center justify-center p-6 md:p-10">
            <div className="w-full max-w-sm">
                <div className="flex flex-col gap-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-2xl">
                                <MailCheck className="h-6 w-6 text-primary" />
                                Check your email
                            </CardTitle>
                            <CardDescription>
                                One more step to activate your account
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="flex flex-col gap-4 text-sm">
                                <p className="text-muted-foreground">
                                    {email ? (
                                        <>
                                            We have sent a verification link to{" "}
                                            <span className="font-medium text-foreground">
                                                {email}
                                            </span>
                                            . Please click it within 10 minutes to
                                            activate your account.
                                        </>
                                    ) : (
                                        <>
                                            We have sent a verification link to
                                            your email. Please click it within 10
                                            minutes to activate your account.
                                        </>
                                    )}
                                </p>

                                {resent && (
                                    <p className="text-muted-foreground">
                                        We have sent a new verification link —
                                        please click it within 10 minutes.
                                    </p>
                                )}

                                <Button
                                    variant="outline"
                                    className="w-full"
                                    onClick={resend}
                                    disabled={isResending || !email}
                                >
                                    {isResending
                                        ? "Sending..."
                                        : resent
                                          ? "Resend again"
                                          : "Resend verification link"}
                                </Button>

                                <div className="text-center text-sm">
                                    <Link
                                        href="/auth?mode=login"
                                        className="underline underline-offset-4"
                                    >
                                        Back to login
                                    </Link>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}

export default function SignUpSuccessPage() {
    return (
        <Suspense fallback={null}>
            <SignUpSuccessInner />
        </Suspense>
    );
}

"use client";



import Link from "next/link";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

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
import { loginAdmin, forgotAdminPassword } from "@/lib/api/admin";
import { ApiError } from "@/lib/api";

export default function AdminLoginPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            const result = await loginAdmin({ email, password });
            if (result?.member) {
                toast.success("Welcome back");

                // Hard navigation to fully clear the Next.js Router Cache.
                // Using router.push + router.refresh does NOT reliably bust
                // the cached server-component output from layout.tsx, which
                // causes the layout's /admin/me check to use stale auth
                // state from a previous user's session.
                window.location.href = "/admin/dashboard";
                return;
            }
        } catch (err) {









            if (err instanceof ApiError && err.status === 0) {
                toast.error(err.message || "Could not reach the server");
            } else if (err instanceof ApiError && err.status === 429) {
                toast.error("Too many attempts. Please wait a few minutes and try again.");
            } else {
                toast.error("Invalid credentials");
            }
        } finally {
            setIsLoading(false);
        }
    };

    const handleAdminForgotPassword = async () => {
        const email = window.prompt(
            "Admin email — a reset code and link will be emailed to it.",
        );
        if (!email) return;
        try {
            await forgotAdminPassword({ email: email.trim() });


            toast.success("If that account exists, a reset code has been emailed");
        } catch {
            toast.error("Could not start the password reset");
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle className="text-2xl">Admin login</CardTitle>
                    <CardDescription>
                        Sign in with your admin or moderator credentials.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit}>
                        <div className="flex flex-col gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="email">Email</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    placeholder="you@example.com"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    disabled={isLoading}
                                    autoComplete="email"
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="password">Password</Label>
                                <Input
                                    id="password"
                                    type="password"
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    disabled={isLoading}
                                    autoComplete="current-password"
                                />
                            </div>
                            <Button
                                type="submit"
                                className="w-full"
                                disabled={isLoading}
                            >
                                {isLoading ? "Signing in..." : "Sign in"}
                            </Button>
                        </div>
                        <div className="mt-4 text-center text-sm">
                            <Link
                                href="/auth/forgot-password"
                                className="underline underline-offset-4 text-muted-foreground hover:text-foreground"
                            >
                                Forgot password?
                            </Link>
                        </div>
                        
                        <div className="mt-2 text-center text-sm">
                            <button
                                type="button"
                                onClick={handleAdminForgotPassword}
                                disabled={isLoading}
                                className="underline underline-offset-4 text-muted-foreground hover:text-foreground disabled:opacity-50"
                            >
                                Admin password reset
                            </button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
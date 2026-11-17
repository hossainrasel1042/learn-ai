"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { mutate as globalMutate } from "swr";
import { Button } from "@/components/ui/button";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { apiFetch, ApiError } from "@/lib/api";

const loginSchema = z.object({
    email: z.string().email("Please enter a valid email address"),
    password: z.string().min(6, "Password must be at least 6 characters"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginForm() {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);

    const form = useForm<LoginFormValues>({
        resolver: zodResolver(loginSchema),
        defaultValues: {
            email: "",
            password: "",
        },
    });

    async function onSubmit(data: LoginFormValues) {
        setIsLoading(true);

        try {
            await apiFetch("/signin", {
                method: "POST",
                body: { email: data.email, password: data.password },
            });

            toast.success("Signed in successfully");










            await globalMutate(
                (key) =>
                    typeof key === "object" &&
                    Array.isArray(key) &&
                    key[0] === "user",
                undefined,
                { revalidate: true },
            );

            router.push("/dashboard");
            router.refresh();
        } catch (error) {




            if (error instanceof ApiError && error.status === 403) {
                toast.error(
                    error.message ||
                        "Please verify your email. We have sent a new verification link — please click it within 10 minutes.",
                );
                router.push(
                    `/auth/sign-up-success?email=${encodeURIComponent(data.email)}`,
                );
                return;
            }

            if (error instanceof ApiError && error.status === 429) {
                toast.error(
                    "Too many attempts. Please wait a few minutes and try again.",
                );
                return;
            }

            toast.error(
                error instanceof Error
                    ? error.message
                    : "An unexpected error occurred",
            );
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <div className="flex items-center justify-center px-4 py-20 sm:px-6 lg:px-8">
            <div className="w-full max-w-md space-y-8">
                <div className="text-center">
                    <h1 className="text-3xl font-bold">Welcome back</h1>
                    <p className="mt-2 text-sm text-muted-foreground">
                        Sign in to your account
                    </p>
                </div>

                <div className="mt-8">
                    <div className="space-y-6">
                        <Form {...form}>
                            <form
                                onSubmit={form.handleSubmit(onSubmit)}
                                className="space-y-4"
                            >
                                <FormField
                                    control={form.control}
                                    name="email"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Email</FormLabel>
                                            <FormControl>
                                                <Input
                                                    type="email"
                                                    placeholder="name@example.com"
                                                    disabled={isLoading}
                                                    {...field}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="password"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Password</FormLabel>
                                            <FormControl>
                                                <Input
                                                    type="password"
                                                    placeholder="••••••••"
                                                    disabled={isLoading}
                                                    {...field}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <div className="flex items-center justify-between">
                                    <div className="text-sm">
                                        <Link
                                            href="/auth/forgot-password"
                                            className="text-sm text-primary hover:underline"
                                        >
                                            Forgot password?
                                        </Link>
                                    </div>
                                </div>

                                <Button
                                    type="submit"
                                    className="w-full"
                                    disabled={isLoading}
                                >
                                    {isLoading ? "Signing in..." : "Sign in"}
                                </Button>
                            </form>
                        </Form>

                        <div className="text-center text-sm">
                            Don&apos;t have an account?{" "}
                            <Link
                                href="/auth?mode=signup"
                                className="text-primary hover:underline"
                            >
                                Sign up
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
"use client";

import { useRouter } from "next/navigation";
import { mutate as globalMutate } from "swr";
import { AuthContext } from "@/hooks/use-auth";
import { useUser } from "@/hooks/use-user";
import { apiFetch, ApiError } from "@/lib/api";
import { toast } from "sonner";

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const { user, isLoading, mutate } = useUser();
    const router = useRouter();

    const handleSignOut = async () => {
        try {


            await apiFetch('/signout', { method: 'POST' });

            await mutate(null, { revalidate: false });


            await globalMutate(
                () => true,
                undefined,
                { revalidate: true }
            );

            toast.success("See you later!");

            router.push("/auth");
            router.refresh();
        } catch (error) {
            if (error instanceof ApiError) {
                toast.error(error.message);
            } else {
                console.error("Sign out error:", error);
            }


            toast.error("Sign out may have failed; please clear cookies");
        }
    };

    const handleSignIn = async (email: string, password: string) => {
        return apiFetch('/signin', {
            method: 'POST',
            body: { email, password },
        });
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                isLoading,
                signIn: handleSignIn,
                signOut: handleSignOut,
                mutate,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}
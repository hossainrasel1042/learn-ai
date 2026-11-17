import { redirect } from "next/navigation";
import { headers, cookies } from "next/headers";

import type { User } from "@/lib/types";
import { getServerApiBase } from "@/lib/api";


export default async function ProtectedLayout({
    children,
}: {
    children: React.ReactNode;
}) {



    const cookieStore = await cookies();
    const accessToken = cookieStore.get("sb-access-token")?.value;



    const requestHeaders = await headers();
    const cookieHeader = requestHeaders.get("cookie") ?? "";

    let user: User | null = null;
    try {
        const response = await fetch(`${getServerApiBase()}/me`, {
            method: "GET",
            headers: {
                Accept: "application/json",
                ...(cookieHeader ? { cookie: cookieHeader } : {}),
                ...(accessToken
                    ? { Authorization: `Bearer ${accessToken}` }
                    : {}),
            },

            cache: "no-store",
        });

        if (response.ok) {



            const body = await response.json();
            const candidate =
                body && typeof body === "object" && "data" in body
                    ? (body as { data: unknown }).data
                    : body;
            if (candidate && typeof candidate === "object" && "id" in candidate) {
                user = candidate as User;
            }
        }
    } catch (error) {








        console.error(
            "[protected/layout] auth guard could not reach the backend:",
            error instanceof Error ? error.message : error,
        );
    }

    if (!user) {
        redirect("/auth");
    }

    return <>{children}</>;
}

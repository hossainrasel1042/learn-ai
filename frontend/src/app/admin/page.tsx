import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { getServerApiBase } from "@/lib/api";
import type { AdminMember } from "@/lib/api/admin";


export default async function AdminIndexPage() {
    const requestHeaders = await headers();
    const cookieStore = await cookies();
    const accessToken = cookieStore.get("sb-access-token")?.value;
    const cookieHeader = requestHeaders.get("cookie") ?? "";

    let member: AdminMember | null = null;
    try {
        const response = await fetch(`${getServerApiBase()}/admin/me`, {
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
            if (candidate && typeof candidate === "object") {


                const inner =
                    "member" in (candidate as Record<string, unknown>)
                        ? (candidate as { member: unknown }).member
                        : candidate;
                if (
                    inner &&
                    typeof inner === "object" &&
                    "id" in (inner as Record<string, unknown>)
                ) {
                    member = inner as AdminMember;
                }
            }
        }
    } catch (error) {








        console.error(
            "[admin/page] auth guard could not reach the backend:",
            error instanceof Error ? error.message : error,
        );
    }

    redirect(member ? "/admin/dashboard" : "/admin/login");
}

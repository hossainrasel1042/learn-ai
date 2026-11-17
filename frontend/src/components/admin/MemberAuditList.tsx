"use client";



import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAdminMe, useMemberAudit } from "@/hooks/use-admin";
import { canViewAudit } from "@/lib/rbac";

interface MemberAuditListProps {
    memberId: string;
}

const PAGE_SIZE = 50;

export function MemberAuditList({ memberId }: MemberAuditListProps) {
    const { member: sessionMember } = useAdminMe();
    const canView = canViewAudit(sessionMember);

    const [page, setPage] = useState(0);
    const offset = page * PAGE_SIZE;




    useEffect(() => {
        setPage(0);
    }, [memberId]);

    const { data, isLoading, isError, error } = useMemberAudit(
        canView ? memberId : null,
        { limit: PAGE_SIZE, offset },
    );

    if (!canView) {
        return (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                You do not have permission to view the audit log.
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                Loading audit log...
            </div>
        );
    }

    if (isError) {
        return (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">
                Failed to load audit log:{" "}
                {error instanceof Error ? error.message : "Unknown error"}
            </div>
        );
    }

    const rows = data?.rows ?? [];
    const total = data?.total ?? 0;

    if (rows.length === 0) {
        return (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                No audit events recorded.
            </div>
        );
    }

    const first = offset + 1;
    const last = offset + rows.length;
    const hasPrev = offset > 0;
    const hasNext = last < total;

    return (
        <div className="space-y-2">
            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Event</TableHead>
                            <TableHead>IP</TableHead>
                            <TableHead>When</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rows.map((r) => (
                            <TableRow key={r.id}>
                                <TableCell>
                                    <Badge variant="outline" className="font-mono text-xs">
                                        {r.event}
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                    {r.ip ?? "—"}
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                    {new Date(r.createdAt).toLocaleString()}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>

            
            {total > PAGE_SIZE && (
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>
                        Showing {first}–{last} of {total}
                    </span>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={!hasPrev}
                            onClick={() => setPage((p) => Math.max(p - 1, 0))}
                        >
                            <ChevronLeft className="h-4 w-4" />
                            Previous
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={!hasNext}
                            onClick={() => setPage((p) => p + 1)}
                        >
                            Next
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}

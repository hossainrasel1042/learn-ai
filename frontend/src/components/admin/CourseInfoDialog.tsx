"use client";



import * as React from "react";
import { Loader2 } from "lucide-react";

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getCourseStats, type CourseStats } from "@/lib/api/cms";


export function formatBytes(n: number): string {
    if (!Number.isFinite(n) || n < 0) return "0 B";
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(2)} MB`;
    return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

interface CourseInfoDialogProps {

    courseId: string | null;

    courseTitle?: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function CourseInfoDialog({
    courseId,
    courseTitle,
    open,
    onOpenChange,
}: CourseInfoDialogProps) {
    const [stats, setStats] = React.useState<CourseStats | null>(null);
    const [isLoading, setIsLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (!open || !courseId) {
            setStats(null);
            setError(null);
            return;
        }

        let cancelled = false;
        setIsLoading(true);
        setError(null);

        getCourseStats(courseId)
            .then((data) => {
                if (!cancelled) setStats(data);
            })
            .catch((e) => {
                if (!cancelled) {
                    setStats(null);
                    setError(
                        e instanceof Error
                            ? e.message
                            : "Could not load course details"
                    );
                }
            })
            .finally(() => {
                if (!cancelled) setIsLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [open, courseId]);

    const title = stats?.name || courseTitle || "Course";

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>
                        Course details and storage usage.
                    </DialogDescription>
                </DialogHeader>

                {isLoading ? (
                    <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading course details...
                    </div>
                ) : error ? (
                    <p className="py-6 text-sm text-destructive">{error}</p>
                ) : stats ? (
                    <dl className="grid gap-3 py-2 text-sm">
                        <div className="flex items-start justify-between gap-4">
                            <dt className="text-muted-foreground">Title</dt>
                            <dd className="text-right font-medium">
                                {stats.name}
                            </dd>
                        </div>

                        {stats.courseNo && (
                            <div className="flex items-start justify-between gap-4">
                                <dt className="text-muted-foreground">
                                    Course Number
                                </dt>
                                <dd className="text-right font-medium">
                                    {stats.courseNo}
                                </dd>
                            </div>
                        )}

                        <div className="flex items-start justify-between gap-4">
                            <dt className="text-muted-foreground">
                                Total Files
                            </dt>
                            <dd className="text-right font-medium">
                                {stats.totalFiles}
                            </dd>
                        </div>

                        <div className="flex items-start justify-between gap-4">
                            <dt className="text-muted-foreground">
                                Total Size
                            </dt>
                            <dd className="text-right font-medium">
                                {formatBytes(stats.totalSizeBytes)}
                            </dd>
                        </div>

                        <div className="flex items-start justify-between gap-4">
                            <dt className="text-muted-foreground">
                                Course ID
                            </dt>
                            <dd className="text-right font-mono text-xs break-all">
                                {stats.code || stats.courseNo}
                            </dd>
                        </div>

                        {stats.description && (
                            <div className="flex items-start justify-between gap-4">
                                <dt className="text-muted-foreground">
                                    Description
                                </dt>
                                <dd className="text-right text-muted-foreground">
                                    {stats.description}
                                </dd>
                            </div>
                        )}
                    </dl>
                ) : null}

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Close
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default CourseInfoDialog;

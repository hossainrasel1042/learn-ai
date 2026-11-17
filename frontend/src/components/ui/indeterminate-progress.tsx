"use client";

import * as React from "react";
import { cn } from "@/lib/utils";


interface IndeterminateProgressProps {
    value?: number | null;
    className?: string;
    ariaLabel?: string;
}

export function IndeterminateProgress({ value, className, ariaLabel }: IndeterminateProgressProps) {
    const indeterminate = value === null || value === undefined || Number.isNaN(value);

    if (!indeterminate) {




        const v = Math.max(0, Math.min(100, Number(value)));
        return (
            <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={v}
                aria-label={ariaLabel}
                className={cn("bg-primary/20 relative h-2 w-full overflow-hidden rounded-full", className)}
            >
                <div
                    className="bg-primary h-full transition-all"
                    style={{ width: `${v}%` }}
                />
            </div>
        );
    }

    return (
        <div
            role="progressbar"
            aria-label={ariaLabel ?? "Working"}
            className={cn("bg-primary/20 relative h-2 w-full overflow-hidden rounded-full", className)}
        >
            <div className="indeterminate-progress-bar bg-primary absolute inset-y-0 w-1/3" />
        </div>
    );
}
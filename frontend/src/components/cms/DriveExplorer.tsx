"use client";

import * as React from "react";
import { Folder, FileText, FileCode, MoreVertical, Download, Edit2, Trash2, ArrowUpDown, ChevronLeft, ChevronRight, Copy, Check, Info } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { resolveMaterialDownloadUrl, type FileObjectStatus } from "@/lib/api/storage";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Loader2 } from "lucide-react";

export interface FileItem {
    id: string;
    name: string;
    type: "folder" | "file";
    fileType?: "pdf" | "pptx" | "code";
    url?: string;
    updatedAt?: string;
    description?: string;
    size?: string;

    status?: FileObjectStatus;
    errorMessage?: string | null;

    code?: string;

    courseId?: string;
}


function openMaterialDownload(item: FileItem) {
    if (item.status && item.status !== "ready") {
        toast.info("Still uploading — please wait until it's ready");
        return;
    }
    if (!item.url) {
        toast.error("No download URL available");
        return;
    }





    const proxied = item.url.replace(/\/url$/, "/download");
    window.open(proxied, "_blank");
}


function StatusBadge({ status, errorMessage }: { status?: FileItem["status"]; errorMessage?: string | null }) {
    if (!status || status === "ready") return null;
    const labels: Record<NonNullable<FileItem["status"]>, string> = {
        pending: "Queued",
        uploading: "Uploading",
        processing: "Processing",
        ready: "Ready",
        failed: "Failed",
    };
    const isWorking = status === "pending" || status === "uploading" || status === "processing";
    const isFailed = status === "failed";
    return (
        <span
            title={isFailed ? errorMessage || "Upload failed" : labels[status]}
            className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                isWorking && "bg-blue-500/15 text-blue-700 dark:text-blue-300",
                isFailed && "bg-red-500/15 text-red-700 dark:text-red-300",
            )}
        >
            {isWorking && <Loader2 className="h-3 w-3 animate-spin" />}
            {labels[status]}
        </span>
    );
}


function CourseCodeCell({ code }: { code: string }) {
    const [copied, setCopied] = React.useState(false);
    const handleCopy = async (e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
                await navigator.clipboard.writeText(code);
            } else {
                const ta = document.createElement("textarea");
                ta.value = code;
                ta.style.position = "fixed";
                ta.style.opacity = "0";
                ta.style.pointerEvents = "none";
                document.body.appendChild(ta);
                ta.select();
                document.execCommand("copy");
                document.body.removeChild(ta);
            }
            setCopied(true);
            toast.success("Copied course code");
            window.setTimeout(() => setCopied(false), 1500);
        } catch {
            toast.error("Failed to copy course code");
        }
    };
    return (
        <div className="flex items-center gap-1.5 font-mono text-xs">
            <span
                className="select-all rounded bg-muted/60 px-1.5 py-0.5"
                title={code}
            >
                {code}
            </span>
            <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={handleCopy}
                title={copied ? "Copied!" : "Copy course code"}
                aria-label={copied ? "Course code copied" : `Copy course code ${code}`}
            >
                {copied ? (
                    <Check className="h-3.5 w-3.5 text-green-600" />
                ) : (
                    <Copy className="h-3.5 w-3.5" />
                )}
            </Button>
        </div>
    );
}

type SortField = "name" | "updatedAt" | "type";
type SortOrder = "asc" | "desc";

interface DriveExplorerProps {
    items: FileItem[];
    loading?: boolean;
    onNavigate: (item: FileItem) => void;
    onDownload?: (item: FileItem) => void;
    onDelete?: (items: FileItem[]) => void;
    onRename?: (item: FileItem) => void;

    onInfo?: (item: FileItem) => void;
    currentPath: { name: string; id?: string }[];
    onBreadcrumbClick: (index: number) => void;
}

export function DriveExplorer({
    items,
    loading,
    onNavigate,
    onDownload,
    onDelete,
    onRename,
    onInfo,
    currentPath,
    onBreadcrumbClick
}: DriveExplorerProps) {
    const [viewMode, setViewMode] = React.useState<"grid" | "list">("list");
    const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
    const [sortField, setSortField] = React.useState<SortField>("name");
    const [sortOrder, setSortOrder] = React.useState<SortOrder>("asc");
    const [currentPage, setCurrentPage] = React.useState(1);
    const itemsPerPage = 20;


    React.useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {

            const target = e.target as HTMLElement | null;
            if (target) {
                const tag = target.tagName;
                if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable) {
                    return;
                }
            }














            if (document.querySelector('[role="dialog"], [role="menu"], [role="alertdialog"]')) {
                return;
            }

            if (e.key === "Escape") {
                setSelectedIds(new Set());
            } else if ((e.ctrlKey || e.metaKey) && e.key === "a") {
                e.preventDefault();
                setSelectedIds(new Set(items.map(i => i.id)));
            } else if (e.key === "Delete" || e.key === "Backspace") {
                if (selectedIds.size > 0 && onDelete) {
                    const selectedItems = items.filter(i => selectedIds.has(i.id));
                    onDelete(selectedItems);
                }
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [items, selectedIds, onDelete]);


    React.useEffect(() => {
        setSelectedIds(new Set());
        setCurrentPage(1);
    }, [currentPath]);






    React.useEffect(() => {
        setSelectedIds((prev) => {
            if (prev.size === 0) return prev;
            const validIds = new Set(items.map((i) => i.id));
            let changed = false;
            const next = new Set<string>();
            for (const id of prev) {
                if (validIds.has(id)) next.add(id);
                else changed = true;
            }
            return changed ? next : prev;
        });
    }, [items]);


    const sortedItems = React.useMemo(() => {
        return [...items].sort((a, b) => {
            let aVal: string | number = (a[sortField] as string | number) || "";
            let bVal: string | number = (b[sortField] as string | number) || "";

            if (sortField === "updatedAt") {







                aVal = new Date(aVal).getTime() || 0;
                bVal = new Date(bVal).getTime() || 0;
            }

            if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
            if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
            return 0;
        });
    }, [items, sortField, sortOrder]);


    const paginatedItems = sortedItems.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );
    const totalPages = Math.ceil(items.length / itemsPerPage);








    React.useEffect(() => {
        setCurrentPage(prev => (prev > totalPages ? Math.max(totalPages, 1) : prev));
    }, [totalPages]);

    const toggleSelection = (id: string, multi: boolean) => {
        setSelectedIds((prev) => {
            const newSet = new Set(multi ? prev : []);
            if (newSet.has(id)) {
                newSet.delete(id);
            } else {
                newSet.add(id);
            }
            return newSet;
        });
    };

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
        } else {
            setSortField(field);
            setSortOrder("asc");
        }


        setCurrentPage(1);
    };

    const getIcon = (item: FileItem) => {
        if (item.type === "folder") return <Folder className={cn("text-blue-500 fill-blue-500/20", viewMode === "grid" ? "h-12 w-12" : "h-5 w-5")} />;
        if (item.fileType === "code") return <FileCode className={cn("text-green-500", viewMode === "grid" ? "h-12 w-12" : "h-5 w-5")} />;
        if (item.fileType === "pdf") return <FileText className={cn("text-red-500", viewMode === "grid" ? "h-12 w-12" : "h-5 w-5")} />;
        return <FileText className={cn("text-gray-500", viewMode === "grid" ? "h-12 w-12" : "h-5 w-5")} />;
    };

    if (loading) return <ExplorerSkeleton />;

    return (
        <div
            className="w-full space-y-4"
            onClick={(e) => {



                if (e.target === e.currentTarget) {
                    setSelectedIds(new Set());
                }
            }}
        >
            
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b pb-4">
                <div className="flex items-center text-sm text-muted-foreground flex-wrap">
                    {currentPath.map((path, idx) => (
                        <React.Fragment key={idx}>
                            <button
                                onClick={(e) => { e.stopPropagation(); onBreadcrumbClick(idx); }}
                                className={cn("hover:text-foreground transition-colors px-1 rounded hover:bg-muted", idx === currentPath.length - 1 && "font-semibold text-foreground")}
                            >
                                {path.name}
                            </button>
                            {idx < currentPath.length - 1 && <span className="mx-1 text-muted-foreground/50">/</span>}
                        </React.Fragment>
                    ))}
                </div>

                <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                    {selectedIds.size > 0 && onDelete && (
                        <Button variant="destructive" size="sm" onClick={() => {
                            const selected = items.filter(i => selectedIds.has(i.id));
                            onDelete(selected);
                        }}>
                            <Trash2 className="mr-2 h-4 w-4" /> Delete ({selectedIds.size})
                        </Button>
                    )}
                    <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-lg">
                        <Button variant={viewMode === "grid" ? "secondary" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setViewMode("grid")}>
                            <div className="grid grid-cols-2 gap-[1px]">
                                <div className="w-1 h-1 bg-current rounded-[0.5px]" />
                                <div className="w-1 h-1 bg-current rounded-[0.5px]" />
                                <div className="w-1 h-1 bg-current rounded-[0.5px]" />
                                <div className="w-1 h-1 bg-current rounded-[0.5px]" />
                            </div>
                        </Button>
                        <Button variant={viewMode === "list" ? "secondary" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setViewMode("list")}>
                            <div className="flex flex-col gap-[3px]">
                                <div className="w-3 h-[1px] bg-current" />
                                <div className="w-3 h-[1px] bg-current" />
                                <div className="w-3 h-[1px] bg-current" />
                            </div>
                        </Button>
                    </div>
                </div>
            </div>

            {items.length === 0 ? (
                <EmptyState />
            ) : viewMode === "list" ? (
                <div className="border rounded-md">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[30px]">
                                    
                                    <Checkbox
                                        checked={
                                            paginatedItems.length > 0 &&
                                            paginatedItems.every((i) => selectedIds.has(i.id))
                                                ? true
                                                : paginatedItems.some((i) => selectedIds.has(i.id))
                                                    ? "indeterminate"
                                                    : false
                                        }
                                        onCheckedChange={(checked) => {




                                            const next = new Set(selectedIds);
                                            if (checked) {
                                                paginatedItems.forEach((i) => next.add(i.id));
                                            } else {
                                                paginatedItems.forEach((i) => next.delete(i.id));
                                            }
                                            setSelectedIds(next);
                                        }}
                                    />
                                </TableHead>
                                <TableHead className="cursor-pointer" onClick={() => handleSort("name")}>
                                    Name {sortField === "name" && <ArrowUpDown className="ml-2 h-4 w-4 inline" />}
                                </TableHead>
                                <TableHead className="cursor-pointer" onClick={() => handleSort("updatedAt")}>
                                    Date Modified {sortField === "updatedAt" && <ArrowUpDown className="ml-2 h-4 w-4 inline" />}
                                </TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead className="hidden md:table-cell">Course ID</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {paginatedItems.map((item) => (
                                <ContextMenu key={item.id}>
                                    <ContextMenuTrigger asChild>
                                        <TableRow
                                            className={cn("cursor-pointer", selectedIds.has(item.id) && "bg-muted/50")}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (e.ctrlKey || e.metaKey) toggleSelection(item.id, true);
                                                else onNavigate(item);
                                            }}
                                        >
                                            <TableCell onClick={e => e.stopPropagation()}>
                                                <Checkbox
                                                    checked={selectedIds.has(item.id)}
                                                    onCheckedChange={() => toggleSelection(item.id, true)}
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    {getIcon(item)}
                                                    <span className="font-medium">{item.name}</span>
                                                    <StatusBadge status={item.status} errorMessage={item.errorMessage} />
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-muted-foreground text-sm">
                                                {item.updatedAt ? new Date(item.updatedAt).toLocaleDateString() : "-"}
                                            </TableCell>
                                            <TableCell className="text-muted-foreground text-sm">
                                                {item.type === "folder" ? "Folder" : item.fileType?.toUpperCase()}
                                            </TableCell>
                                            <TableCell className="hidden md:table-cell">
                                                {item.code ? (
                                                    <CourseCodeCell code={item.code} />
                                                ) : (
                                                    <span className="text-muted-foreground/60 text-xs">—</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <ActionMenu
                                                    item={item}
                                                    onNavigate={onNavigate}
                                                    onDownload={onDownload}
                                                    onRename={onRename}
                                                    onDelete={onDelete}
                                                    onInfo={onInfo}
                                                />
                                            </TableCell>
                                        </TableRow>
                                    </ContextMenuTrigger>
                                    <ContextMenuContent>
                                        <ContextMenuItem onClick={stop(() => onNavigate(item))}>Open</ContextMenuItem>
                                        {onInfo && item.id !== "theory" && item.id !== "lab" && item.type === "folder" && (
                                            <ContextMenuItem
                                                onClick={stop(() => runOnce(() => onInfo(item), tokenFor(`info:ctx:${item.id}`)))}
                                                onSelect={selectAndRun(() => onInfo(item), tokenFor(`info:ctx:${item.id}`))}
                                            >
                                                Info
                                            </ContextMenuItem>
                                        )}
                                        {item.id !== "theory" && item.id !== "lab" && (
                                            <>
                                                {item.url && <ContextMenuItem onClick={stop(() => openMaterialDownload(item))}>Download</ContextMenuItem>}
                                                {onRename && <ContextMenuItem onClick={stop(() => onRename(item))}>Rename</ContextMenuItem>}
                                                <ContextMenuSeparator />
                                                {onDelete && (
                                                    <ContextMenuItem
                                                        className="text-destructive"
                                                        onClick={stop(() => runOnce(() => onDelete([item]), tokenFor(`delete:ctx:${item.id}`)))}
                                                        onSelect={selectAndRun(() => onDelete([item]), tokenFor(`delete:ctx:${item.id}`))}
                                                    >
                                                        Delete
                                                    </ContextMenuItem>
                                                )}
                                            </>
                                        )}
                                        {(item.id === "theory" || item.id === "lab") && onDelete && (
                                            <ContextMenuItem
                                                className="text-destructive"
                                                onClick={stop(() => runOnce(() => onDelete([item]), tokenFor(`empty:ctx:${item.id}`)))}
                                                onSelect={selectAndRun(() => onDelete([item]), tokenFor(`empty:ctx:${item.id}`))}
                                            >
                                                Empty Folder
                                            </ContextMenuItem>
                                        )}
                                    </ContextMenuContent>
                                </ContextMenu>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                    {paginatedItems.map((item) => (
                        <GridItem
                            key={item.id}
                            item={item}
                            selected={selectedIds.has(item.id)}
                            onToggle={(multi: boolean) => toggleSelection(item.id, multi)}
                            onNavigate={onNavigate}
                            getIcon={getIcon}
                            actions={
                                <ActionMenu
                                    item={item}
                                    onNavigate={onNavigate}
                                    onDownload={onDownload}
                                    onRename={onRename}
                                    onDelete={onDelete}
                                    onInfo={onInfo}
                                />
                            }

                            handlers={{ onRename, onDelete, onDownload, onInfo }}
                        />
                    ))}
                </div>
            )}

            
            {totalPages > 1 && (
                <div className="flex items-center justify-end space-x-2 py-4">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                        disabled={currentPage === 1}
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <div className="text-sm text-muted-foreground">
                        Page {currentPage} of {totalPages}
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                        disabled={currentPage === totalPages}
                    >
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
            )}
        </div>
    );
}


const isSpecialFolder = (item: FileItem) => item.id === "theory" || item.id === "lab";


const stop = (fn: (e: React.SyntheticEvent | Event) => unknown) => (e: React.SyntheticEvent | Event) => {
    e.stopPropagation();
    return fn(e);
};




const ACTION_DEDUPE_WINDOW_MS = 300;


interface ActionToken {
    lastRunAt: number;
    ran: boolean;
}


const createActionToken = (): ActionToken => ({
    lastRunAt: 0,
    ran: false,
});


const runOnce = (fn: () => void, token: ActionToken) => {
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (token.ran && now - token.lastRunAt < ACTION_DEDUPE_WINDOW_MS) return;
    token.ran = true;
    token.lastRunAt = now;
    fn();
};


const actionTokens = new Map<string, ActionToken>();


const tokenFor = (key: string): ActionToken => {
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();

    if (actionTokens.size > 64) {
        for (const [k, t] of actionTokens) {
            if (now - t.lastRunAt > ACTION_DEDUPE_WINDOW_MS * 20) {
                actionTokens.delete(k);
            }
        }
    }
    let token = actionTokens.get(key);
    if (!token) {
        token = createActionToken();
        actionTokens.set(key, token);
    }
    return token;
};


const selectAndRun = (fn: () => void, token: ActionToken) => (e: Event) => {
    e.stopPropagation();
    runOnce(fn, token);
};


interface ActionMenuProps {
    item: FileItem;
    onNavigate: (item: FileItem) => void;
    onDownload?: (item: FileItem) => void;
    onRename?: (item: FileItem) => void;
    onDelete?: (item: FileItem[]) => void;
    onEmpty?: (item: FileItem) => void;
    onInfo?: (item: FileItem) => void;
}

function ActionMenu({ item, onNavigate, onDownload, onRename, onDelete, onEmpty, onInfo }: ActionMenuProps) {
    const isSpecial = isSpecialFolder(item);

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={e => e.stopPropagation()}>
                    <MoreVertical className="h-4 w-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={stop(() => onNavigate(item))}>Open</DropdownMenuItem>

                {!isSpecial && item.type === "file" && item.url && (
                    <DropdownMenuItem onClick={stop(() => {

                        if (onDownload) onDownload(item);
                        else openMaterialDownload(item);
                    })}>
                        <Download className="mr-2 h-4 w-4" /> Download
                    </DropdownMenuItem>
                )}

                
                {onInfo && !isSpecial && item.type === "folder" && (
                    <DropdownMenuItem onClick={stop(() => runOnce(() => onInfo(item), tokenFor(`info:menu:${item.id}`)))} onSelect={selectAndRun(() => onInfo(item), tokenFor(`info:menu:${item.id}`))}>
                        <Info className="mr-2 h-4 w-4" /> Info
                    </DropdownMenuItem>
                )}

                {!isSpecial && onRename && (
                    <DropdownMenuItem onClick={stop(() => runOnce(() => onRename(item), tokenFor(`rename:menu:${item.id}`)))} onSelect={selectAndRun(() => onRename(item), tokenFor(`rename:menu:${item.id}`))}>
                        <Edit2 className="mr-2 h-4 w-4" /> Rename
                    </DropdownMenuItem>
                )}

                {isSpecial && onDelete && (
                    <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={stop(() => runOnce(() => onDelete([item]), tokenFor(`empty:menu:${item.id}`)))}
                        onSelect={selectAndRun(() => onDelete([item]), tokenFor(`empty:menu:${item.id}`))}
                    >
                        <Trash2 className="mr-2 h-4 w-4" /> Empty Folder
                    </DropdownMenuItem>
                )}

                {!isSpecial && onDelete && (
                    <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={stop(() => runOnce(() => onDelete([item]), tokenFor(`delete:menu:${item.id}`)))}
                            onSelect={selectAndRun(() => onDelete([item]), tokenFor(`delete:menu:${item.id}`))}
                        >
                            <Trash2 className="mr-2 h-4 w-4" /> Delete
                        </DropdownMenuItem>
                    </>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

interface GridItemProps {
    item: FileItem;
    selected: boolean;
    onToggle: (multi: boolean) => void;
    onNavigate: (item: FileItem) => void;
    getIcon: (item: FileItem) => React.ReactNode;
    actions: React.ReactNode;
    handlers?: {
        onRename?: (item: FileItem) => void;
        onDelete?: (item: FileItem[]) => void;
        onDownload?: (item: FileItem) => void;
        onInfo?: (item: FileItem) => void;
    };
}

function GridItem({ item, selected, onToggle, onNavigate, getIcon, actions, handlers }: GridItemProps) {
    const isSpecial = isSpecialFolder(item);

    const { onRename, onDelete, onInfo } = handlers || {};

    return (
        <ContextMenu>
            <ContextMenuTrigger>
                <div
                    className={cn(
                        "group relative flex flex-col items-center justify-between p-4 border rounded-lg hover:bg-accent/50 cursor-pointer transition-all hover:shadow-sm bg-card h-40",
                        selected && "border-primary bg-accent/20 ring-1 ring-primary"
                    )}
                    onClick={(e) => {
                        e.stopPropagation();
                        if (e.ctrlKey || e.metaKey) onToggle(true);
                        else onNavigate(item);
                    }}
                >
                    <div className={cn("absolute top-2 left-2 z-10", !selected && "opacity-0 group-hover:opacity-100 transition-opacity")}>
                        <Checkbox
                            checked={selected}
                            onCheckedChange={() => onToggle(true)}
                        />
                    </div>
                    <div className="mb-3 transform group-hover:scale-105 transition-transform">
                        {getIcon(item)}
                    </div>
                    <div className="text-center w-full">
                        <div className="text-sm font-medium truncate" title={item.name}>{item.name}</div>
                        <div className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1">
                            {item.type === "folder" ? item.name === "Theory" || item.name === "Lab" ? "Folder" : "Folder" : item.fileType?.toUpperCase()}
                            {item.status && item.status !== "ready" && (
                                <StatusBadge status={item.status} errorMessage={item.errorMessage} />
                            )}
                        </div>
                    </div>
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        {actions}
                    </div>
                </div>
            </ContextMenuTrigger>
            <ContextMenuContent>
                <ContextMenuItem onClick={stop(() => onNavigate(item))}>Open</ContextMenuItem>
                {!isSpecial && item.type === "file" && (
                    <ContextMenuItem onClick={stop(() => openMaterialDownload(item))}>Download</ContextMenuItem>
                )}
                
                {!isSpecial && onInfo && item.type === "folder" && (
                    <ContextMenuItem onClick={stop(() => onInfo(item))}>Info</ContextMenuItem>
                )}
                {!isSpecial && onRename && <ContextMenuItem onClick={stop(() => onRename(item))}>Rename</ContextMenuItem>}

                {isSpecial && onDelete && (
                    <ContextMenuItem
                        className="text-destructive"
                        onClick={stop(() => runOnce(() => onDelete([item]), tokenFor(`empty:ctx:${item.id}`)))}
                        onSelect={selectAndRun(() => onDelete([item]), tokenFor(`empty:ctx:${item.id}`))}
                    >
                        Empty Folder
                    </ContextMenuItem>
                )}

                {!isSpecial && onDelete && (
                    <>
                        <ContextMenuSeparator />
                        <ContextMenuItem
                            className="text-destructive"
                            onClick={stop(() => runOnce(() => onDelete([item]), tokenFor(`delete:ctx:${item.id}`)))}
                            onSelect={selectAndRun(() => onDelete([item]), tokenFor(`delete:ctx:${item.id}`))}
                        >
                            Delete
                        </ContextMenuItem>
                    </>
                )}
            </ContextMenuContent>
        </ContextMenu>
    );
}

function ExplorerSkeleton() {
    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
                <div className="flex gap-2"><Skeleton className="h-6 w-24" /><Skeleton className="h-6 w-24" /></div>
                <Skeleton className="h-8 w-20" />
            </div>
            <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                ))}
            </div>
        </div>
    );
}

function EmptyState() {
    return (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground border-2 border-dashed rounded-lg bg-muted/5">
            <Folder className="h-10 w-10 mb-2 opacity-50" />
            <p>Folder is empty</p>
        </div>
    );
}

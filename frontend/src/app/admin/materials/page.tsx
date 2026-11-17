"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";

import { DriveExplorer, FileItem } from "@/components/cms/DriveExplorer";
import { TagInput } from "@/components/cms/TagInput";
import { ConfirmDialog } from "@/components/cms/ConfirmDialog";
import { IndeterminateProgress } from "@/components/ui/indeterminate-progress";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { NewCourseDialog } from "@/components/admin/NewCourseDialog";
import { CourseInfoDialog } from "@/components/admin/CourseInfoDialog";
import { useAdminMe } from "@/hooks/use-admin";
import { canManageCourses } from "@/lib/rbac";
import { getCourses, getMaterials, deleteMaterial, updateMaterial, deleteCourseMaterials, deleteCourse, searchTags } from "@/lib/api/cms";
import { apiFetch } from "@/lib/api";
import {
    presignUpload,
    uploadToPresignedUrl,
    finalizeUpload,
    waitForUploadReady,
    type UploadPhase,
} from "@/lib/api/storage";


const FORBIDDEN_EXTENSIONS = ["zip", "rar", "7z", "tar", "gz", "exe", "dll", "bat", "sh", "msi"];

const getFileTypeFromExtension = (filename: string): "pdf" | "pptx" | "code" | null => {
    const ext = filename.split(".").pop()?.toLowerCase() || "";
    if (ext === "pdf") return "pdf";
    if (["pptx", "ppt"].includes(ext)) return "pptx";
    if (["py", "js", "ts", "tsx", "jsx", "cpp", "c", "java", "go", "rs", "md", "txt", "json", "html", "css", "sql"].includes(ext)) return "code";
    return null;
};

const isForbiddenExtension = (filename: string): boolean => {
    const ext = filename.split(".").pop()?.toLowerCase() || "";
    return FORBIDDEN_EXTENSIONS.includes(ext);
};

function formatBytes(n: number): string {
    if (!Number.isFinite(n) || n < 0) return "0 B";
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(2)} MB`;
    return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}


const EMPTY_UPLOAD_DATA = {
    title: "",
    description: "",
    file_type: "pdf" as const,
    week: "",
    tags: [] as string[],
    file: null as File | null,
    fileError: null as string | null,
};

export default function AdminCMSPage() {

    const router = useRouter();
    const { member, isLoading: isMemberLoading, isError: isMemberError } = useAdminMe();






    const canManage = canManageCourses(member);

    React.useEffect(() => {


        if (!isMemberLoading && (!member || isMemberError)) {
            router.replace("/admin/login");
        } else if (!isMemberLoading && member && !canManage) {


            router.replace("/admin/dashboard");
        }
    }, [isMemberLoading, member, isMemberError, canManage, router]);






    const [path, setPath] = React.useState<{ name: string; id?: string; type?: string }[]>([
        { name: "All Courses" }
    ]);


    const [items, setItems] = React.useState<FileItem[]>([]);
    const [loading, setLoading] = React.useState(true);


    const [isUploadOpen, setIsUploadOpen] = React.useState(false);
    const [isRenameOpen, setIsRenameOpen] = React.useState(false);
    const [isDeleteOpen, setIsDeleteOpen] = React.useState(false);
    const [isInfoOpen, setIsInfoOpen] = React.useState(false);


    const [itemToRename, setItemToRename] = React.useState<FileItem | null>(null);
    const [renameValue, setRenameValue] = React.useState("");
    const [itemsToDelete, setItemsToDelete] = React.useState<FileItem[]>([]);
    const [isProcessing, setIsProcessing] = React.useState(false);

    const [isRenaming, setIsRenaming] = React.useState(false);


    const [infoCourse, setInfoCourse] = React.useState<{
        id: string;
        title: string;
    } | null>(null);



    const [uploadPhase, setUploadPhase] = React.useState<UploadPhase>("idle");
    const [uploadProgress, setUploadProgress] = React.useState(0);
    const [uploadStatusMsg, setUploadStatusMsg] = React.useState<string>("");












    const lastSeenUploadStatusRef = React.useRef<string | null>(null);
    const uploadInFlight = uploadPhase !== "idle";


    const [uploadData, setUploadData] = React.useState<{
        title: string;
        description: string;
        file_type: "pdf" | "pptx" | "code";
        week: string;
        tags: string[];
        file: File | null;
        fileError: string | null;
    }>({ ...EMPTY_UPLOAD_DATA });

    const currentLevel = path.length - 1;
    const currentCourseId = path.length > 1 ? path[1].id : null;
    const currentType = path.length > 2 ? path[2].type : null;









    const handleUploadOpenChange = React.useCallback((open: boolean) => {


        if (uploadInFlight && !open) return;
        setIsUploadOpen(open);
        if (!open) {
            setUploadData({ ...EMPTY_UPLOAD_DATA });
            setUploadPhase("idle");
            setUploadProgress(0);
            setUploadStatusMsg("");
        }
    }, [uploadInFlight]);


    const [tagSuggestions, setTagSuggestions] = React.useState<string[]>([]);









    const tagSearchSeq = React.useRef(0);

    const handleTagSearch = async (query: string) => {
        const seq = ++tagSearchSeq.current;
        const isStale = () => seq !== tagSearchSeq.current;
        try {
            if (!query) {
                setTagSuggestions(["vintage", "lecture", "assignment", "reference"]);
                return;
            }
            const found = await searchTags(query);
            if (isStale()) return;
            setTagSuggestions(found.map(t => t.name));
        } catch (error) {



            if (isStale()) return;
            setTagSuggestions([]);
            console.error(error);
        }
    };









    const loadDataSeq = React.useRef(0);

    React.useEffect(() => {
        loadData();
    }, [path]);

    const loadData = async (opts: { silent?: boolean } = {}) => {
        const seq = ++loadDataSeq.current;
        const isStale = () => seq !== loadDataSeq.current;





        if (!opts.silent) {
            setLoading(true);
            setItems([]);
        }
        try {
            if (currentLevel === 0) {

                const courses = await getCourses();
                if (isStale()) return;
                setItems(courses.map(c => {




                    const courseNo = c.courseNo ?? c.course_no ?? "";
                    return {
                        id: c.id,
                        name: `${courseNo} - ${c.name}`,
                        type: "folder",
                        description: c.description,





                        code: c.code,
                    };
                }));
            } else if (currentLevel === 1) {

                if (isStale()) return;
                setItems([
                    { id: "theory", name: "Theory", type: "folder", description: "Course materials and slides" },
                    { id: "lab", name: "Lab", type: "folder", description: "Lab assignments and code" }
                ]);
            } else if (currentLevel === 2 && currentCourseId && currentType) {

                const materials = await getMaterials(currentCourseId, currentType);
                if (isStale()) return;
                setItems(materials.map(m => {



                    const metaStatus = (m.metadata && (m.metadata as Record<string, unknown>)._status) as string | undefined;
                    const metaError = (m.metadata && (m.metadata as Record<string, unknown>)._errorMessage) as string | null | undefined;
                    return {
                        id: m.id,
                        name: m.title,
                        type: "file",
                        fileType: m.fileType,
                        url: m.url,
                        description: m.description,
                        updatedAt: m.updatedAt,
                        courseId: m.courseId,
                        status: metaStatus as FileItem["status"] | undefined,
                        errorMessage: metaError ?? null,
                    };
                }));
            }
        } catch (error) {
            if (isStale()) return;
            console.error(error);
            toast.error("Failed to load content");
        } finally {



            if (!isStale()) setLoading(false);
        }
    };







    const handleNavigate = (item: FileItem) => {
        if (item.type === "folder") {
            if (currentLevel === 0) {
                setPath([...path, { name: item.name, id: item.id }]);
            } else if (currentLevel === 1) {
                setPath([...path, { name: item.name, id: item.id, type: item.id.toLowerCase() }]);
            }
        } else if (item.url) {




            if (item.status && item.status !== "ready") {
                toast.info("Still uploading — please wait until it's ready");
                return;
            }






            const proxied = item.url.replace(/\/url$/, "/download");
            window.open(proxied, "_blank");
        }
    };

    const handleBreadcrumbClick = (index: number) => {


        setPath(path.slice(0, index + 1));
    };

    const handleUpload = async () => {
        try {
            if (!currentCourseId || !currentType) return;
            if (!uploadData.file || !uploadData.title.trim()) {
                toast.error("File and title are required");
                return;
            }
            if (uploadData.fileError) {
                toast.error(uploadData.fileError);
                return;
            }
            if (uploadInFlight) return;

            const file = uploadData.file;





            const title = uploadData.title.trim();





            const weekRaw = uploadData.week.trim();
            let week: number | null = null;
            if (weekRaw !== "") {
                const parsed = Number(weekRaw);
                if (!Number.isInteger(parsed) || parsed < 0) {
                    toast.error("Week must be a positive whole number");
                    return;
                }
                week = parsed;
            }

            const metadata: Record<string, unknown> = {
                title,
                description: uploadData.description.trim(),
                material_type: currentType,
                file_type: uploadData.file_type,
                week,
                tags: uploadData.tags,
            };


            setUploadPhase("presigning");
            setUploadProgress(0);
            setUploadStatusMsg("Signing upload URL…");


            lastSeenUploadStatusRef.current = null;
            const presign = await presignUpload({
                filename: file.name,
                contentType: file.type || "application/octet-stream",
                sizeBytes: file.size,
                category: "course_material",
                courseId: currentCourseId,
                metadata,
            });


            setUploadPhase("uploading");
            setUploadProgress(0);
            setUploadStatusMsg("Uploading…");
            await uploadToPresignedUrl(file, presign, (sent, total) => {
                const pct = total > 0 ? Math.round((sent / total) * 100) : 0;
                setUploadProgress(pct);
                setUploadStatusMsg(`Uploading… ${pct}%`);
            });


            setUploadPhase("finalizing");
            setUploadStatusMsg("Finalizing…");


            await finalizeUpload({
                fileObjectId: presign.fileObjectId,
                sizeBytes: file.size,
                contentType: file.type || "application/octet-stream",
                courseId: currentCourseId,
                metadata,
            });


            setUploadPhase("processing");
            setUploadStatusMsg("Processing on server…");





            loadData({ silent: true });





            const finalStatus = await waitForUploadReady(presign.fileObjectId, (s) => {





                const bytes = s.sizeBytes;
                const processed = s.bytesProcessed;
                if (bytes && processed !== null && processed !== undefined) {
                    setUploadStatusMsg(
                        `Processing… ${formatBytes(processed)} / ${formatBytes(bytes)}`,
                    );
                } else {
                    setUploadStatusMsg(`Processing… (${s.status})`);
                }
















                if (lastSeenUploadStatusRef.current !== s.status) {
                    lastSeenUploadStatusRef.current = s.status;
                    loadData({ silent: true });
                }
            });

            if (finalStatus.status === "failed") {
                throw new Error(finalStatus.errorMessage || "Server-side processing failed");
            }

            setUploadPhase("idle");
            setUploadProgress(0);
            setUploadStatusMsg("");
            toast.success("Material uploaded");
            setIsUploadOpen(false);
            setUploadData({ ...EMPTY_UPLOAD_DATA });
            loadData();
        } catch (error) {
            setUploadPhase("idle");
            setUploadProgress(0);
            setUploadStatusMsg("");








            toast.error(error instanceof Error ? error.message : String(error));
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0] || null;
        if (!file) {
            setUploadData({ ...uploadData, file: null, fileError: null, file_type: "pdf" });
            return;
        }

        if (isForbiddenExtension(file.name)) {
            setUploadData({ ...uploadData, file: null, fileError: `File type not allowed: .${file.name.split(".").pop()}` });
            return;
        }

        const detectedType = getFileTypeFromExtension(file.name);
        if (!detectedType) {
            setUploadData({ ...uploadData, file: null, fileError: `Unsupported file type: .${file.name.split(".").pop()}` });
            return;
        }

        setUploadData({ ...uploadData, file, file_type: detectedType, fileError: null });
    };


    const handleDeleteClick = (items: FileItem[] | FileItem) => {





        const flat: FileItem[] = [];
        const push = (v: unknown): void => {
            if (!v) return;
            if (Array.isArray(v)) {
                (v as unknown[]).forEach(push);
                return;
            }
            if (typeof v === 'object' && v !== null && 'id' in v) {
                flat.push(v as FileItem);
            }
        };
        push(items);
        if (flat.length === 0) {
            toast.error("Nothing selected to delete");
            return;
        }
        setItemsToDelete(flat);
        setIsDeleteOpen(true);
    };

    const handleConfirmDelete = async () => {
        setIsProcessing(true);
        try {



            const queue: FileItem[] = [];
            const push = (v: unknown) => {
                if (!v) return;
                if (Array.isArray(v)) v.forEach(push);
                else if (typeof v === 'object' && 'id' in v) queue.push(v as FileItem);
            };
            push(itemsToDelete);
            if (queue.length === 0) {
                toast.error("Nothing selected to delete");
                return;
            }








            const specialFolders = queue.filter(i => (i.id === "theory" || i.id === "lab") && i.type === "folder");
            const coursesToDelete = queue.filter(
                i => i.type === "folder" && i.id !== "theory" && i.id !== "lab"
            );
            const filesToDelete = queue.filter(i => i.type === "file");









            let deletedCount = 0;
            let failedCount = 0;
            let lastError: string | null = null;

            if (specialFolders.length > 0) {
                if (!currentCourseId) {
                    toast.error("Cannot determine course for folder operation");
                    return;
                }

                for (const folder of specialFolders) {
                    try {
                        await deleteCourseMaterials(currentCourseId, folder.id);
                        deletedCount += 1;
                    } catch (e) {
                        failedCount += 1;
                        lastError = e instanceof Error ? e.message : String(e);
                        console.error("Empty-folder failed for", folder, e);
                    }
                }
            }

            if (coursesToDelete.length > 0) {
                for (const course of coursesToDelete) {
                    try {
                        await deleteCourse(course.id);
                        deletedCount += 1;
                    } catch (e) {
                        failedCount += 1;
                        lastError = e instanceof Error ? e.message : String(e);
                        console.error("Course delete failed for", course, e);
                    }
                }
            }

            if (filesToDelete.length > 0) {
                for (const item of filesToDelete) {
                    try {






                        if (item.status && item.status !== "ready") {
                            await apiFetch(`/storage/files/${item.id}`, { method: "DELETE" });
                            deletedCount += 1;
                            continue;
                        }

                        const cId = item.courseId || currentCourseId;
                        if (!cId) {
                            console.error("Missing course ID for deletion", item);
                            failedCount += 1;
                            lastError = "Missing course ID";
                            continue;
                        }

                        await deleteMaterial(cId, item.id);
                        deletedCount += 1;
                    } catch (e) {
                        failedCount += 1;
                        lastError = e instanceof Error ? e.message : String(e);
                        console.error("Delete failed for item", item, e);
                    }
                }
            }

            if (deletedCount > 0 && failedCount === 0) {
                toast.success(`Deleted ${deletedCount} item(s)`);
            } else if (deletedCount > 0 && failedCount > 0) {
                toast.warning(`Deleted ${deletedCount} item(s), ${failedCount} failed${lastError ? `: ${lastError}` : ""}`);
            } else if (failedCount > 0) {
                toast.error(`Failed to delete ${failedCount} item(s)${lastError ? `: ${lastError}` : ""}`);
            }



            loadData({ silent: true });
            setIsDeleteOpen(false);
            setItemsToDelete([]);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : String(error));
        } finally {
            setIsProcessing(false);
        }
    };


    const handleRenameClick = (item: FileItem) => {
        setItemToRename(item);
        setRenameValue(item.name);
        setIsRenameOpen(true);
    };

    const handleRenameSubmit = async () => {
        if (!itemToRename) return;



        if (isRenaming) return;










        if (itemToRename.type !== "file") {
            toast.info("Renaming courses is not supported yet");
            setIsRenameOpen(false);
            return;
        }

        const cId = itemToRename.courseId || currentCourseId;
        if (!cId) {
            toast.error("Could not determine which course this file belongs to");
            return;
        }

        const title = renameValue.trim();
        if (!title) {
            toast.error("Name cannot be empty");
            return;
        }

        setIsRenaming(true);
        try {
            await updateMaterial(cId, itemToRename.id, { title });
            toast.success("Renamed successfully");
            setIsRenameOpen(false);
            loadData();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : String(error));
        } finally {
            setIsRenaming(false);
        }
    };


    const handleInfoClick = (item: FileItem) => {











        const isVirtualFolder = item.id === "theory" || item.id === "lab";
        if (isVirtualFolder) {
            toast.error("Course details are only available for a real course");
            return;
        }
        if (item.type !== "folder") {
            toast.error("Course details are only available for a real course");
            return;
        }
        setInfoCourse({ id: item.id, title: item.name });
        setIsInfoOpen(true);
    };



    if (isMemberLoading || !member) {
        return (
            <div className="flex min-h-screen items-center justify-center text-muted-foreground">
                Checking your session...
            </div>
        );
    }





    if (!canManage) {
        return (
            <div className="flex min-h-screen items-center justify-center text-muted-foreground">
                Redirecting...
            </div>
        );
    }

    return (


        <AdminLayout member={member}>
        <div className="flex flex-col h-full">
            <div className="flex justify-between items-center mb-6 flex-shrink-0">
                <h1 className="text-2xl font-bold tracking-tight">
                    
                    {path.length > 1 ? path[path.length - 1].name : "All Courses"}
                </h1>

                    {currentLevel === 0 && (
                        <NewCourseDialog onCreated={() => loadData()} />
                    )}

                    {currentLevel === 2 && (
                        <Dialog
                            open={isUploadOpen}
                            onOpenChange={handleUploadOpenChange}
                        >
                            <DialogTrigger asChild>
                                <Button className="shadow-sm" onClick={() => setUploadData({ ...EMPTY_UPLOAD_DATA })}><Upload className="mr-2 h-4 w-4" /> Upload Material</Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-[500px]">
                                <DialogHeader>
                                    <DialogTitle>Upload Material</DialogTitle>
                                    <DialogDescription>
                                        Add content to {path[1].name} / {path[2].name}
                                    </DialogDescription>
                                </DialogHeader>
                                <div className="grid gap-4 py-4">
                                    <div className="grid gap-2">
                                        <Label htmlFor="title">Title</Label>
                                        <Input
                                            id="title"
                                            value={uploadData.title}
                                            disabled={uploadInFlight}
                                            onChange={e => setUploadData({ ...uploadData, title: e.target.value })}
                                            placeholder="Lecture 1 Slides"
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="file">File</Label>
                                        <Input
                                            id="file"
                                            type="file"
                                            disabled={uploadInFlight}
                                            onChange={handleFileChange}
                                        />
                                        {uploadData.fileError && (
                                            <p className="text-sm text-destructive">{uploadData.fileError}</p>
                                        )}
                                        {uploadData.file && !uploadData.fileError && (
                                            <p className="text-sm text-muted-foreground">
                                                Detected type: {uploadData.file_type.toUpperCase()}
                                                {uploadData.file.size > 0 && (
                                                    <> &middot; {(uploadData.file.size / 1024).toFixed(1)} KB</>
                                                )}
                                            </p>
                                        )}
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="week">Week Number (Optional)</Label>
                                        <Input
                                            id="week"
                                            type="number"
                                            disabled={uploadInFlight}
                                            value={uploadData.week}
                                            onChange={e => setUploadData({ ...uploadData, week: e.target.value })}
                                            placeholder="e.g. 1"
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        
                                        <Label htmlFor="tags-input">Tags</Label>
                                        <TagInput
                                            id="tags-input"
                                            value={uploadData.tags}
                                            onChange={tags => setUploadData({ ...uploadData, tags })}
                                            suggestions={tagSuggestions}
                                            onSearch={handleTagSearch}
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="desc">Description</Label>
                                        <Textarea
                                            id="desc"
                                            disabled={uploadInFlight}
                                            value={uploadData.description}
                                            onChange={e => setUploadData({ ...uploadData, description: e.target.value })}
                                        />
                                    </div>
                                    {uploadInFlight && (
                                        <div className="grid gap-2" aria-live="polite">
                                            
                                            <IndeterminateProgress
                                                value={uploadPhase === "uploading" ? uploadProgress : null}
                                                ariaLabel={
                                                    uploadPhase === "uploading"
                                                        ? `Upload ${uploadProgress}%`
                                                        : "Working"
                                                }
                                            />
                                            <p className="text-xs text-muted-foreground">
                                                {uploadStatusMsg || uploadPhase}
                                            </p>
                                        </div>
                                    )}
                                </div>
                                <DialogFooter>
                                    <Button
                                        onClick={handleUpload}
                                        disabled={uploadInFlight}
                                        aria-busy={uploadInFlight}
                                    >
                                        {uploadPhase === "idle" && "Upload"}
                                        {uploadPhase === "presigning" && "Signing…"}
                                        {uploadPhase === "uploading" && `Uploading… ${uploadProgress}%`}
                                        {uploadPhase === "finalizing" && "Finalizing…"}
                                        {uploadPhase === "processing" && "Processing…"}
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    )}
            </div>

                <DriveExplorer
                    items={items}
                    loading={loading}
                    onNavigate={handleNavigate}
                    currentPath={path}
                    onBreadcrumbClick={handleBreadcrumbClick}
                    onDelete={handleDeleteClick}
                    onRename={handleRenameClick}
                    onInfo={handleInfoClick}
                />

                <Dialog open={isRenameOpen} onOpenChange={setIsRenameOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Rename Item</DialogTitle>
                        </DialogHeader>
                        <div className="py-4">
                            <Label htmlFor="rename-input" className="sr-only">New name</Label>
                            <Input id="rename-input" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} disabled={isRenaming} />
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsRenameOpen(false)} disabled={isRenaming}>Cancel</Button>
                            <Button onClick={handleRenameSubmit} disabled={isRenaming} aria-busy={isRenaming}>
                                {isRenaming ? "Saving…" : "Save"}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                <ConfirmDialog
                    open={isDeleteOpen}
                    onOpenChange={setIsDeleteOpen}
                    title="Are you absolutely sure?"
                    description={`This will permanently delete ${Array.isArray(itemsToDelete) ? itemsToDelete.length : 0} item(s). This action cannot be undone.`}
                    onConfirm={handleConfirmDelete}
                    loading={isProcessing}
                />

                <CourseInfoDialog
                    open={isInfoOpen}
                    onOpenChange={setIsInfoOpen}
                    courseId={infoCourse?.id ?? null}
                    courseTitle={infoCourse?.title}
                />
        </div>
        </AdminLayout>
    );
}

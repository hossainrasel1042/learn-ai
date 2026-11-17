"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CMSLayout } from "@/components/cms/CMSLayout";
import { DriveExplorer, FileItem } from "@/components/cms/DriveExplorer";
import { getCourses, getMaterials, getRecentMaterials } from "@/lib/api/cms";
import { resolveMaterialDownloadUrl } from "@/lib/api/storage";
import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";

export default function StudentCMSPage() {
    const router = useRouter();
    const { user, isLoading: authLoading } = useAuth();


    React.useEffect(() => {
        if (!authLoading && !user) {
            router.push("/auth");
        }
    }, [authLoading, user, router]);


    const [view, setView] = React.useState<"all" | "recent" | "starred">("all");
    const [path, setPath] = React.useState<{ name: string; id?: string; type?: string }[]>([
        { name: "My Courses" }
    ]);


    const [items, setItems] = React.useState<FileItem[]>([]);
    const [loading, setLoading] = React.useState(true);

    const currentLevel = view === "all" ? path.length - 1 : -1;
    const currentCourseId = view === "all" && path.length > 1 ? path[1].id : null;
    const currentType = view === "all" && path.length > 2 ? path[2].type : null;


    React.useEffect(() => {

        if (authLoading || !user) return;
        loadData();
    }, [path, view, authLoading, user]);

    const loadData = async () => {
        setLoading(true);
        setItems([]);
        try {
            if (view === "recent") {
                const materials = await getRecentMaterials();
                setItems(materials.map(m => ({
                    id: m.id,
                    name: m.title,
                    type: "file",
                    fileType: m.fileType,
                    url: m.url,
                    description: m.description,
                    updatedAt: m.updatedAt,
                    courseId: m.courseId
                })));
                return;
            }

            if (currentLevel === 0) {

                const courses = await getCourses();
                setItems(courses.map(c => ({
                    id: c.id,
                    name: c.name,
                    type: "folder",
                    description: c.description,






                    code: c.code ?? c.courseNo ?? c.course_no,
                })));
            } else if (currentLevel === 1) {

                setItems([
                    { id: "theory", name: "Theory", type: "folder", description: "Course materials and slides" },
                    { id: "lab", name: "Lab", type: "folder", description: "Lab assignments and code" }
                ]);
            } else if (currentLevel === 2 && currentCourseId && currentType) {

                const materials = await getMaterials(currentCourseId, currentType);
                setItems(materials.map(m => ({
                    id: m.id,
                    name: m.title,
                    type: "file",
                    fileType: m.fileType,
                    url: m.url,
                    description: m.description,
                    updatedAt: m.updatedAt,
                    courseId: m.courseId
                })));
            }
        } catch (error) {
            console.error(error);
            toast.error("Failed to load content");
        } finally {
            setLoading(false);
        }
    };


    const handleSidebarNavigate = (newView: string) => {
        if (newView === "all") {
            setView("all");
            setPath([{ name: "My Courses" }]);
        } else if (newView === "recent") {
            setView("recent");
            setPath([{ name: "Recent Files" }]);
        } else {
            toast.info("Coming soon");
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



            resolveMaterialDownloadUrl(item.url)
                .then((url) => window.open(url, "_blank"))
                .catch((e) => toast.error(e instanceof Error ? e.message : "Download failed"));
        }
    };

    const handleBreadcrumbClick = (index: number) => {
        if (view !== "all") return;
        setPath(path.slice(0, index + 1));
    };




    if (authLoading || !user) {
        return (
            <div className="flex min-h-[calc(100vh-65px)] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin" />
            </div>
        );
    }

    return (
        <CMSLayout onNavigate={handleSidebarNavigate}>
            <div className="flex flex-col h-full">
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-2xl font-bold tracking-tight">
                        {view === "recent" ? "Recent Files" : (path.length > 1 ? path[path.length - 1].name : "My Courses")}
                    </h1>
                </div>

                <DriveExplorer
                    items={items}
                    loading={loading}
                    onNavigate={handleNavigate}
                    currentPath={path}
                    onBreadcrumbClick={handleBreadcrumbClick}
                />
            </div>
        </CMSLayout>
    );
}

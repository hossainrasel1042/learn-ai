import { apiFetch } from '@/lib/api';
import type { FileObjectStatus } from './storage';

export interface Course {
    id: string;
    name: string;




    course_no?: string;
    courseNo?: string;





    code?: string;
    description?: string;
    created_at?: string;
    updated_at?: string;
}

export interface Tag {
    id: string;
    name: string;
}


export interface Material {
    id: string;
    courseId: string;
    title: string;
    description?: string;
    type: "theory" | "lab";
    fileType: "pdf" | "pptx" | "code";
    url: string;
    createdAt: string;
    updatedAt: string;
    tags: Tag[];
    metadata?: MaterialMetadata;

    status?: FileObjectStatus;
    error_message?: string | null;
}


export type MaterialMetadata = Record<string, string | number | boolean | null>;


export async function getCourses(limit = 2000): Promise<Course[]> {
    return apiFetch<Course[]>(`/courses?limit=${encodeURIComponent(limit)}`);
}

export async function createCourse(data: { name: string; course_no: string; description?: string }): Promise<Course> {
    return apiFetch<Course>('/courses', {
        method: 'POST',
        body: data,
    });
}

export async function getMaterials(courseId: string, type?: string): Promise<Material[]> {
    const qs = type ? `?type=${encodeURIComponent(type)}` : '';
    return apiFetch<Material[]>(`/courses/${courseId}/materials${qs}`);
}


export interface CourseStats {
    courseId: string;
    courseNo: string;
    code: string | null;
    name: string;
    description: string | null;

    materialCount: number;

    fileCount: number;
    totalSizeBytes: number;

    totalFiles: number;
}

export async function getCourseStats(courseId: string): Promise<CourseStats> {
    return apiFetch<CourseStats>(`/courses/${courseId}/stats`);
}

export async function getRecentMaterials(): Promise<Material[]> {
    return apiFetch<Material[]>('/materials/recent');
}

export async function uploadMaterial(courseId: string, formData: FormData): Promise<Material> {
    return apiFetch<Material>(`/courses/${courseId}/materials`, {
        method: 'POST',
        formData,
    });
}

export async function updateMaterial(
    courseId: string,
    materialId: string,
    data: Partial<Pick<Material, 'title' | 'description' | 'tags'>> & {
        metadata?: MaterialMetadata;
    },
): Promise<Material> {
    return apiFetch<Material>(`/courses/${courseId}/materials/${materialId}`, {
        method: 'PUT',
        body: data,
    });
}

export async function deleteMaterial(courseId: string, materialId: string): Promise<void> {
    await apiFetch(`/courses/${courseId}/materials/${materialId}`, {
        method: 'DELETE',
    });
}

export async function deleteCourseMaterials(courseId: string, type: string): Promise<void> {
    await apiFetch(`/courses/${courseId}/materials?type=${encodeURIComponent(type)}`, {
        method: 'DELETE',
    });
}

export async function deleteCourse(courseId: string): Promise<void> {
    await apiFetch(`/courses/${courseId}`, {
        method: 'DELETE',
    });
}

export async function searchTags(query: string): Promise<Tag[]> {
    return apiFetch<Tag[]>(`/tags?query=${encodeURIComponent(query)}`);
}



export interface SearchSection {
    content_preview: string;
    location: string;
    location_type: string;
    score: number;
}

export interface SearchResult {
    filename: string;
    filepath: string;
    file_type: string;
    relevance_score: number;
    matching_sections: SearchSection[];
    summary?: string;
}

export interface SearchResponse {
    query: string;
    count: number;
    results: SearchResult[];
}

export interface SearchOptions {
    type?: "pdf" | "pptx" | "code";
    limit?: number;
    signal?: AbortSignal;
}

export async function searchMaterials(query: string, options?: SearchOptions): Promise<SearchResponse> {
    const params: Record<string, string> = { q: query };
    if (options?.type) params.type = options.type;
    if (options?.limit) params.limit = String(options.limit);
    const qs = new URLSearchParams(params).toString();
    return apiFetch<SearchResponse>(`/search?${qs}`, {
        signal: options?.signal,
    });
}

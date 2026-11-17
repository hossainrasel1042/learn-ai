

import { apiFetch } from '@/lib/api';

export interface PickerCourse {
    id: string;
    name: string;

    code: string;

    courseNo: string;
    course_no: string;
    description?: string | null;
}


export async function listCoursesForPicker(
    limit = 500,
    offset = 0,
): Promise<PickerCourse[]> {
    return apiFetch<PickerCourse[]>(
        `/courses/picker?limit=${encodeURIComponent(limit)}&offset=${encodeURIComponent(offset)}`,
    );
}


export async function listAllCoursesForPicker(): Promise<PickerCourse[]> {
    const PAGE = 500;
    const all: PickerCourse[] = [];
    for (let offset = 0; ; offset += PAGE) {
        const rows = await listCoursesForPicker(PAGE, offset);
        all.push(...rows);
        if (rows.length < PAGE) break;


        if (all.length > 10000) break;
    }
    return all;
}

export async function lookupCourseByCode(codeOrUuid: string): Promise<PickerCourse> {
    return apiFetch<PickerCourse>(
        `/courses/lookup?code=${encodeURIComponent(codeOrUuid)}`,
    );
}
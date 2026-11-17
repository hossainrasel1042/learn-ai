'use client';



import { useEffect, useState } from 'react';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    listCoursesForPicker,
    type PickerCourse,
} from '@/lib/api/course-picker';

export interface CourseCodeSelectProps {
    value: PickerCourse | null;
    onChange: (course: PickerCourse | null) => void;
    disabled?: boolean;
    placeholder?: string;
    className?: string;

    id?: string;
}

export function CourseCodeSelect({
    value,
    onChange,
    disabled,
    placeholder = 'Pick a course…',
    className,
    id,
}: CourseCodeSelectProps) {
    const [courses, setCourses] = useState<PickerCourse[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let mounted = true;



        Promise.resolve().then(() => { if (mounted) setLoading(true); });
        listCoursesForPicker()
            .then((rows) => { if (mounted) setCourses(rows || []); })
            .catch((e) => { if (mounted) setError(e instanceof Error ? e.message : 'load failed'); })
            .finally(() => { if (mounted) setLoading(false); });
        return () => { mounted = false; };
    }, []);

    return (
        <div className={className}>
            <Select
                value={value?.id ?? undefined}
                onValueChange={(selectedId) => {
                    const found = courses.find((c) => c.id === selectedId) || null;
                    onChange(found);
                }}
                disabled={disabled || loading}
            >
                <SelectTrigger className="w-full" id={id}>
                    
                    <SelectValue placeholder={loading ? 'Loading courses…' : placeholder} />
                </SelectTrigger>
                <SelectContent>
                    {error && (
                        <div className="px-3 py-2 text-sm text-destructive">
                            {error}
                        </div>
                    )}
                    {!error && courses.length === 0 && !loading && (
                        <div className="px-3 py-2 text-sm text-muted-foreground">
                            No courses available.
                        </div>
                    )}
                    {courses.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                            <span className="font-mono text-xs">{c.code}</span>
                            <span className="ml-2">{c.name}</span>
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}

export default CourseCodeSelect;
'use client';

import { BookOpen } from 'lucide-react';

import type { PlayCourse } from '@/types/quiz-battle';

interface CoursePickerProps {
    courses: PlayCourse[];
    selected: PlayCourse | null;
    onSelect: (course: PlayCourse) => void;
    disabled?: boolean;
}

export function CoursePicker({ courses, selected, onSelect, disabled }: CoursePickerProps) {
    if (courses.length === 0) {
        return (
            <p className="text-sm text-muted-foreground">
                No courses available. Ask an admin to add course material first.
            </p>
        );
    }
    return (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {courses.map((c) => {
                const isActive = selected?.id === c.id;
                return (
                    <li key={c.id}>
                        <button
                            type="button"
                            onClick={() => onSelect(c)}
                            disabled={disabled}
                            className={`w-full rounded-md border p-3 text-left transition hover:bg-muted/40 disabled:opacity-50 ${
                                isActive ? 'border-primary bg-muted' : ''
                            }`}
                        >
                            <div className="flex items-center gap-2 font-medium">
                                <BookOpen className="h-4 w-4" />
                                {c.name}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                                {c.courseNo}
                                {c.description ? ` — ${c.description.slice(0, 80)}` : ''}
                            </div>
                        </button>
                    </li>
                );
            })}
        </ul>
    );
}
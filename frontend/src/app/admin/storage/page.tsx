'use client';



import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

import { AdminLayout } from '@/components/admin/AdminLayout';
import { MinIOUploadForm } from '@/components/admin/MinIOUploadForm';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { listAllCoursesForPicker, type PickerCourse } from '@/lib/api/course-picker';
import { useAdminMe } from '@/hooks/use-admin';
import { canManageCourses } from '@/lib/rbac';

export default function AdminStoragePage() {
    const router = useRouter();
    const { member, isLoading: isMemberLoading, isError: isMemberError } = useAdminMe();
    const [courses, setCourses] = useState<PickerCourse[]>([]);
    const [selected, setSelected] = useState<PickerCourse | null>(null);
    const [loading, setLoading] = useState(true);



    const [coursesError, setCoursesError] = useState<string | null>(null);





    const canManage = canManageCourses(member);

    useEffect(() => {
        if (!isMemberLoading && (!member || isMemberError)) {
            router.replace('/admin/login');
        } else if (!isMemberLoading && member && !canManage) {
            router.replace('/admin/dashboard');
        }
    }, [isMemberLoading, member, isMemberError, canManage, router]);

    useEffect(() => {
        if (!canManage) return;
        listAllCoursesForPicker()
            .then((rows) => {
                setCourses(rows);
                setCoursesError(null);
            })
            .catch((e) => {
                setCourses([]);
                setCoursesError(
                    e instanceof Error ? e.message : 'Could not load the course list',
                );
            })
            .finally(() => setLoading(false));
    }, [canManage]);

    if (isMemberLoading || !member || !canManage) {
        return (
            <div className="flex min-h-screen items-center justify-center text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Checking your session...
            </div>
        );
    }

    return (



        <AdminLayout member={member}>
            <div className="max-w-3xl space-y-6">
                <div>
                    <h1 className="text-2xl font-semibold">Storage (MinIO)</h1>
                    <p className="text-sm text-muted-foreground">
                        Upload course materials to the local MinIO bucket. Files
                        are processed asynchronously via the BullMQ queue —
                        many uploads at once are safe.
                    </p>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Course</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Loading courses…
                            </div>
                        ) : coursesError ? (
                            <p className="text-sm text-destructive">
                                Could not load the course list: {coursesError}
                            </p>
                        ) : courses.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                No courses are available yet. Create a course
                                before uploading materials.
                            </p>
                        ) : (
                            <div className="grid gap-2">
                                <Label htmlFor="storage-course">Course</Label>
                                <div className="flex gap-2">
                                    <Select





                                        value={selected?.id ?? ''}
                                        onValueChange={(id) =>
                                            setSelected(courses.find((c) => c.id === id) || null)
                                        }
                                    >
                                        <SelectTrigger id="storage-course" className="w-full">
                                            <SelectValue placeholder="Pick a course" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {courses.map((c) => (
                                                <SelectItem key={c.id} value={c.id}>
                                                    <span className="font-mono text-xs">{c.code}</span>
                                                    <span className="ml-2">{c.name}</span>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>

                                    {selected && (
                                        <Button
                                            variant="outline"
                                            onClick={() => setSelected(null)}
                                        >
                                            Clear
                                        </Button>
                                    )}
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <MinIOUploadForm
                    courseId={selected?.id}
                    onComplete={() => {





                        listAllCoursesForPicker()
                            .then((rows) => {
                                setCourses(rows);
                                setCoursesError(null);
                            })
                            .catch(() => {


                            });
                    }}
                />
            </div>
        </AdminLayout>
    );
}
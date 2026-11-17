'use client';



import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Upload, File as FileIcon } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    uploadToMinIO,
    waitForUploadReady,
    type JobStatus,
} from '@/lib/api/storage';

export interface MinIOUploadFormProps {

    courseId?: string;

    defaultTitle?: string;

    onComplete?: (status: JobStatus) => void;

    className?: string;
}

type Phase = 'idle' | 'uploading' | 'processing' | 'ready' | 'failed';


const MATERIAL_TYPES = [
    { value: 'theory', label: 'Theory' },
    { value: 'lab', label: 'Lab' },
] as const;


function deriveFileType(file: File | null): string {
    if (!file) return 'pdf';
    const name = file.name || '';
    const i = name.lastIndexOf('.');
    if (i < 0) return 'pdf';
    const ext = name.slice(i + 1).toLowerCase();



    if (!ext || ext.length > 10) return 'pdf';
    return ext;
}

export function MinIOUploadForm({
    courseId,
    defaultTitle = '',
    onComplete,
    className,
}: MinIOUploadFormProps) {
    const inputRef = useRef<HTMLInputElement | null>(null);
    const [file, setFile] = useState<File | null>(null);
    const [title, setTitle] = useState(defaultTitle);
    const [materialType, setMaterialType] = useState<string>('theory');
    const [phase, setPhase] = useState<Phase>('idle');
    const [progress, setProgress] = useState(0);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const inFlightRef = useRef(false);

    const reset = useCallback(() => {
        setFile(null);
        setTitle(defaultTitle);
        setMaterialType('theory');
        setPhase('idle');
        setProgress(0);
        setErrorMsg(null);
        if (inputRef.current) inputRef.current.value = '';
    }, [defaultTitle]);








    useEffect(() => {
        setFile(null);
        setTitle(defaultTitle);
        setPhase('idle');
        setProgress(0);
        setErrorMsg(null);
        if (inputRef.current) inputRef.current.value = '';



        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [courseId]);

    const handleSubmit = useCallback(async () => {








        if (inFlightRef.current) return;
        if (!file) {
            setErrorMsg('Pick a file first.');
            return;
        }
        if (!title.trim()) {
            setErrorMsg('Title is required.');
            return;
        }



        if (!courseId) {
            setErrorMsg('Pick a course before uploading.');
            return;
        }
        inFlightRef.current = true;
        setErrorMsg(null);
        setProgress(0);
        setPhase('uploading');

        try {
            const { fileObjectId } = await uploadToMinIO(file, {
                category: 'course_material',
                courseId,
                metadata: {
                    title: title.trim(),
                    file_type: deriveFileType(file),
                    material_type: materialType,
                },
                onProgress: (sent, total) => {
                    if (total > 0) setProgress(Math.round((sent / total) * 100));
                },
            });
            setPhase('processing');





            const final = await waitForUploadReady(fileObjectId);
            if (final.status === 'ready') {











                setPhase('idle');
                setFile(null);
                setTitle('');
                setProgress(0);
                if (inputRef.current) inputRef.current.value = '';
                toast.success('Upload complete');
                onComplete?.(final);
            } else {
                setPhase('failed');
                setErrorMsg(final.errorMessage || 'Processing failed');
                toast.error(final.errorMessage || 'Processing failed');
            }
        } catch (e) {
            setPhase('failed');
            const msg = e instanceof Error ? e.message : 'upload failed';
            setErrorMsg(msg);
            toast.error(msg);
        } finally {
            inFlightRef.current = false;
        }
    }, [file, title, courseId, materialType, onComplete]);

    const isBusy = phase === 'uploading' || phase === 'processing';

    return (
        <Card className={className}>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Upload className="h-4 w-4" />
                    Upload to MinIO
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="minio-title">Title</Label>
                    <Input
                        id="minio-title"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        disabled={isBusy}
                        placeholder="e.g. Week 1 — Introduction"
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="minio-material-type">Material type</Label>
                    <Select
                        value={materialType}
                        onValueChange={setMaterialType}
                        disabled={isBusy}
                    >
                        <SelectTrigger id="minio-material-type" className="w-full">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {MATERIAL_TYPES.map((t) => (
                                <SelectItem key={t.value} value={t.value}>
                                    {t.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="minio-file">File</Label>
                    <Input
                        id="minio-file"
                        ref={inputRef}
                        type="file"
                        disabled={isBusy}
                        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    />
                    {file && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <FileIcon className="h-4 w-4" />
                            {file.name} ({Math.ceil(file.size / 1024)} KB)
                        </div>
                    )}
                </div>

                {errorMsg && (
                    <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                        {errorMsg}
                    </div>
                )}

                {!courseId && (
                    <p className="text-sm text-muted-foreground">
                        Pick a course above before uploading — a material
                        always belongs to a course.
                    </p>
                )}

                <div className="flex items-center gap-2">

                    <Button
                        onClick={handleSubmit}
                        disabled={isBusy || !file || !courseId}
                    >
                        {isBusy ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                {phase === 'uploading' ? 'Uploading…' : 'Processing…'}
                            </>
                        ) : (
                            <>
                                <Upload className="mr-2 h-4 w-4" />
                                Upload
                            </>
                        )}
                    </Button>
                    <Button variant="outline" onClick={reset} disabled={isBusy}>
                        Reset
                    </Button>
                </div>


                {isBusy && (
                    <div className="rounded-md border bg-muted/30 p-4">
                        <div className="flex items-center gap-2 text-sm">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            {phase === 'uploading' ? 'Uploading file…' : 'Processing on server…'}
                        </div>
                        {phase === 'uploading' && (
                            <Progress value={progress} className="mt-2" />
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

export default MinIOUploadForm;
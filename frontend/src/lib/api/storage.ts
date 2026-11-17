

export type UploadCategory = 'course_material' | 'avatar' | 'course_thumbnail' | 'other';
export type UploadPhase = 'idle' | 'presigning' | 'uploading' | 'finalizing' | 'processing';
export type FileObjectStatus = 'pending' | 'uploading' | 'processing' | 'ready' | 'failed';

export interface PresignRequest {
    filename: string;
    contentType: string;
    sizeBytes: number;
    category: UploadCategory;
    courseId?: string | null;
    metadata?: Record<string, unknown>;
}

export interface PresignResult {
    uploadUrl: string;
    objectKey: string;
    bucket: string;
    fileObjectId: string;
    expiresIn: number;
}

export interface FinalizeRequest {
    fileObjectId: string;
    sizeBytes?: number;
    contentType?: string;
    courseId?: string | null;
    metadata?: Record<string, unknown>;
}

export interface FinalizeResult {
    jobId: string;
    fileObjectId: string;
}

export interface UploadInitResult {
    jobId: string;
    fileObjectId: string;
}

export interface UploadOptions {
    category?: UploadCategory;
    courseId?: string;
    metadata?: Record<string, unknown>;
    onProgress?: (sent: number, total: number) => void;
}

export interface JobStatus {
    status: FileObjectStatus;
    errorMessage: string | null;
    fileObjectId: string;
    materialId: string | null;
    objectKey: string;
    sizeBytes: number | null;

    bytesProcessed?: number | null;
}

function _resolveBase(): string {
    return process.env.NEXT_PUBLIC_API_URL || '/api/v1';
}

function _getCookie(name: string): string | null {
    if (typeof document === 'undefined') return null;
    const m = document.cookie.match(
        new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'),
    );
    return m ? decodeURIComponent(m[1]) : null;
}

async function _postJSON<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${_resolveBase()}${path}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        let detail = res.statusText;
        try {
            const data = await res.json();
            detail = data.detail || detail;
        } catch (_) {  }
        throw new Error(detail || `request failed (${res.status})`);
    }
    return res.json();
}






export async function presignUpload(req: PresignRequest): Promise<PresignResult> {
    return _postJSON<PresignResult>('/storage/presign', req);
}


export function uploadToPresignedUrl(
    file: File,
    presign: PresignResult,
    onProgress?: (sent: number, total: number) => void,
): Promise<void> {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', presign.uploadUrl, true);
        if (file.type) xhr.setRequestHeader('Content-Type', file.type);

        xhr.upload.onprogress = (evt) => {
            if (evt.lengthComputable && onProgress) {
                onProgress(evt.loaded, evt.total);
            }
        };
        xhr.onerror = () => reject(new Error('network error during upload'));
        xhr.onabort = () => reject(new Error('upload aborted'));
        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve();
            } else {
                let detail = xhr.responseText || `upload failed (${xhr.status})`;
                try { detail = JSON.parse(detail).detail || detail; } catch (_) {}
                reject(new Error(detail));
            }
        };

        xhr.send(file);
    });
}


export async function finalizeUpload(req: FinalizeRequest): Promise<FinalizeResult> {
    return _postJSON<FinalizeResult>('/storage/finalize', req);
}






export function uploadToMinIO(
    file: File,
    options: UploadOptions = {},
): Promise<UploadInitResult> {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const url = `${_resolveBase()}/storage/minio-uploads`;
        xhr.open('POST', url, true);

        const token = _getCookie('sb-access-token');
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

        xhr.upload.onprogress = (evt) => {
            if (evt.lengthComputable && options.onProgress) {
                options.onProgress(evt.loaded, evt.total);
            }
        };
        xhr.onerror = () => reject(new Error('network error'));
        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    resolve(JSON.parse(xhr.responseText));
                } catch (_) {
                    reject(new Error('invalid response JSON'));
                }
            } else {
                let detail = xhr.responseText;
                try { detail = JSON.parse(xhr.responseText).detail; } catch (_) {}
                reject(new Error(detail || `upload failed (${xhr.status})`));
            }
        };

        const fd = new FormData();
        fd.append('file', file);
        if (options.category) fd.append('category', options.category);
        if (options.courseId) fd.append('courseId', options.courseId);
        if (options.metadata) fd.append('metadata', JSON.stringify(options.metadata));

        xhr.send(fd);
    });
}






export async function waitForUploadReady(
    fileObjectIdOrJobId: string,
    onUpdate?: (status: JobStatus) => void,
    intervalMs = 1500,
    timeoutMs = 60_000,
): Promise<JobStatus> {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {




        const status = await getStorageJobStatus(fileObjectIdOrJobId);
        if (status) {
            if (onUpdate) onUpdate(status);
            if (status.status === 'ready' || status.status === 'failed') return status;
        }
        await new Promise((r) => setTimeout(r, intervalMs));
    }
    throw new Error('upload timed out');
}

export async function getStorageJobStatus(fileObjectIdOrJobId: string): Promise<JobStatus | null> {
    const res = await fetch(
        `${_resolveBase()}/storage/jobs/${encodeURIComponent(fileObjectIdOrJobId)}`,
        { credentials: 'include' },
    );
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`job status failed (${res.status})`);
    const body = await res.json();
    return {
        status: body.status,
        errorMessage: body.errorMessage ?? null,
        fileObjectId: body.fileObjectId,
        materialId: body.materialId ?? null,
        objectKey: body.objectKey,
        sizeBytes: body.sizeBytes ?? null,
        bytesProcessed: body.bytesProcessed ?? null,
    };
}

export async function getFileDownloadUrl(fileObjectId: string): Promise<string> {
    const res = await fetch(
        `${_resolveBase()}/storage/files/${encodeURIComponent(fileObjectId)}/url`,
        { credentials: 'include' },
    );
    if (!res.ok) throw new Error(`presign failed (${res.status})`);
    const body = await res.json();
    return body.url;
}


export async function resolveMaterialDownloadUrl(materialUrl: string): Promise<string> {
    if (!materialUrl) throw new Error('material has no url');


    if (/^https?:\/\//i.test(materialUrl)) return materialUrl;





    if (materialUrl.startsWith('/contents/') || materialUrl.startsWith('contents/')) {
        const origin = _resolveBase().replace(/\/api\/v\d+\/?$/, '');
        return `${origin}${materialUrl.startsWith('/') ? '' : '/'}${materialUrl}`;
    }





    const cleaned = materialUrl.replace(/^\/api\/v\d+\/?/, '');
    const res = await fetch(`${_resolveBase()}${cleaned}`, { credentials: 'include' });
    if (!res.ok) {
        const detail = res.status === 404 ? 'file not found (404)' : `presign failed (${res.status})`;
        throw new Error(detail);
    }
    const body = await res.json();
    if (!body?.url) throw new Error('presign returned no url');
    return body.url;
}










const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, '') || '/api/v1';


const API_BASE_URL_SERVER = (() => {
  const proxyOrigin = process.env.BACKEND_PROXY_ORIGIN?.replace(/\/+$/, '');
  if (proxyOrigin) return `${proxyOrigin}/api/v1`;

  const publicUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, '');
  if (publicUrl) return publicUrl;

  return 'http://localhost:8000/api/v1';
})();


export function getServerApiBase(): string {
  return API_BASE_URL_SERVER;
}

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export interface ApiFetchOptions extends Omit<RequestInit, 'body'> {

  body?: unknown;

  formData?: FormData;
}

export async function apiFetch<T = unknown>(
  path: string,
  options: ApiFetchOptions = {}
): Promise<T> {
  const { body, formData, headers, ...rest } = options;

  const finalHeaders: Record<string, string> = {
    Accept: 'application/json',
    ...((headers as Record<string, string>) || {}),
  };

  let finalBody: BodyInit | undefined;

  if (formData) {
    finalBody = formData;

  } else if (body !== undefined && body !== null) {
    finalHeaders['Content-Type'] =
      finalHeaders['Content-Type'] || 'application/json';
    finalBody = JSON.stringify(body);
  }

  const url = path.startsWith('http')
    ? path
    : `${API_BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`;

  let response: Response;
  try {
    response = await fetch(url, {
      ...rest,
      headers: finalHeaders,
      body: finalBody,
      credentials: 'include',
    });
  } catch (e) {



    const reason =
      e instanceof Error && e.message ? e.message : 'Network error';
    throw new ApiError(
      `Could not reach the server (${reason}). Please check your connection and try again.`,
      0,
    );
  }



  let parsed: unknown = null;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {


    const text = await response.text();
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }











  if (parsed && typeof parsed === 'object' && 'error' in (parsed as Record<string, unknown>)) {
    const obj = parsed as Record<string, unknown>;
    const rawError = obj.error;

    if (typeof rawError === 'string') {
      const code = rawError;
      const message =
        (typeof obj.message === 'string' && obj.message) ||
        code ||
        'Request failed';
      throw new ApiError(message, response.status, code);
    }

    if (rawError && typeof rawError === 'object') {
      const nested = rawError as Record<string, unknown>;
      const code = typeof nested.code === 'string' ? nested.code : undefined;
      const message =
        (typeof nested.message === 'string' && nested.message) ||
        code ||
        'Request failed';
      throw new ApiError(message, response.status, code);
    }
  }

  if (!response.ok) {
    let detail: string;
    if (
      parsed &&
      typeof parsed === 'object' &&
      'detail' in (parsed as Record<string, unknown>) &&
      typeof (parsed as Record<string, unknown>).detail === 'string'
    ) {
      detail = (parsed as Record<string, string>).detail;
    } else {
      detail = response.statusText || `Request failed with status ${response.status}`;
    }
    throw new ApiError(detail, response.status);
  }


  if (
    parsed &&
    typeof parsed === 'object' &&
    'data' in (parsed as Record<string, unknown>)
  ) {
    return (parsed as { data: T }).data;
  }

  return parsed as T;
}


export async function apiCall<T = unknown>(
  path: string,
  options: ApiFetchOptions = {}
): Promise<{ data?: T; error?: string }> {
  try {
    const data = await apiFetch<T>(path, options);
    return { data };
  } catch (e) {
    if (e instanceof ApiError) {
      return { error: e.message };
    }
    if (e instanceof Error) {
      return { error: e.message };
    }
    if (typeof e === 'string') {
      return { error: e };
    }
    try {
      return { error: JSON.stringify(e) };
    } catch {
      return { error: 'Unknown error' };
    }
  }
}

export default apiFetch;
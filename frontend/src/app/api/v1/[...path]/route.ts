import { NextRequest } from 'next/server';


export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';


const BACKEND_ORIGIN = () => {
  const proxyOrigin = process.env.BACKEND_PROXY_ORIGIN?.replace(/\/+$/, '');
  if (proxyOrigin) return proxyOrigin;

  const publicUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, '');
  if (publicUrl) return publicUrl.replace(/\/api\/v1$/, '');

  return 'http://localhost:8000';
};

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
]);


async function proxy(request: NextRequest, path: string[]) {
  const target = `${BACKEND_ORIGIN()}/api/v1/${path.join('/')}${request.nextUrl.search}`;

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) headers.set(key, value);
  });

  const hasBody = !['GET', 'HEAD'].includes(request.method);
  const body = hasBody ? await request.arrayBuffer() : undefined;

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body: body && body.byteLength > 0 ? body : undefined,
      redirect: 'manual',
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ detail: 'Backend service is unreachable.' }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const outHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) outHeaders.set(key, value);
  });
  // Headers.forEach() skips set-cookie in the Fetch spec.
  // Use getSetCookie() to properly forward cookies (e.g. sb-access-token).
  const setCookies = upstream.headers.getSetCookie?.() ?? [];
  for (const cookie of setCookies) {
    outHeaders.append('set-cookie', cookie);
  }
  if (!outHeaders.has('Content-Type')) {
    outHeaders.set('Content-Type', 'application/json');
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: outHeaders,
  });
}


type Context = { params: Promise<{ path: string[] }> };

export async function GET(request: NextRequest, context: Context) {
  const { path } = await context.params;
  return proxy(request, path);
}

export async function POST(request: NextRequest, context: Context) {
  const { path } = await context.params;
  return proxy(request, path);
}

export async function PUT(request: NextRequest, context: Context) {
  const { path } = await context.params;
  return proxy(request, path);
}

export async function PATCH(request: NextRequest, context: Context) {
  const { path } = await context.params;
  return proxy(request, path);
}

export async function DELETE(request: NextRequest, context: Context) {
  const { path } = await context.params;
  return proxy(request, path);
}

export async function HEAD(request: NextRequest, context: Context) {
  const { path } = await context.params;
  return proxy(request, path);
}

export async function OPTIONS(request: NextRequest, context: Context) {
  const { path } = await context.params;
  return proxy(request, path);
}

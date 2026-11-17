/**
 * Browser-side API base.
 *
 * `NEXT_PUBLIC_API_URL` is inlined at build time, so it may be absent on a
 * deployment where the frontend and backend live on different hosts. When it is
 * absent the browser falls back to the same-origin relative path, which the
 * Next.js runtime proxy at /api/v1 forwards to the backend.
 *
 * The socket.io client is the one exception: it needs a real origin because
 * the proxy cannot carry a WebSocket upgrade. `getSocketOrigin` therefore
 * prefers an absolute URL and only falls back to the page origin.
 */

const configured = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, '');

export const CLIENT_API_BASE_URL = configured || '/api/v1';

export const CLIENT_BACKEND_ORIGIN = (() => {
  if (configured) return configured.replace(/\/api\/v1$/, '');
  if (typeof window !== 'undefined') return window.location.origin;
  return process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/+$/, '') || 'http://localhost:8000';
})();

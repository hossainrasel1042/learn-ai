

import 'dotenv/config';
import pg from 'pg';


function resolveApiBase() {
    const raw = (
        process.env.NEXT_PUBLIC_API_URL ||
        process.env.API_BASE_URL ||
        'http://localhost:8000/api/v1'
    ).replace(/\/+$/, '');
    return raw.endsWith('/api/v1') ? raw : `${raw}/api/v1`;
}

const API_BASE = resolveApiBase();


const RATE_LIMIT_BYPASS_SECRET = process.env.RATE_LIMIT_TEST_BYPASS_SECRET || '';


function bypassHeaders() {
    if (!RATE_LIMIT_BYPASS_SECRET) return {};
    return { 'X-Rate-Limit-Bypass': RATE_LIMIT_BYPASS_SECRET };
}


export function tokenFromSetCookie(res) {
    const raw = res.headers.getSetCookie?.() ?? [];
    for (const cookie of raw) {
        if (cookie.startsWith('sb-access-token=')) {
            return cookie.split(';')[0].replace('sb-access-token=', '');
        }
    }
    throw new Error('sign-in response did not set the sb-access-token cookie');
}


export async function signUp(email, password) {
    const res = await fetch(`${API_BASE}/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...bypassHeaders() },
        body: JSON.stringify({ name: email.split('@')[0], email, password, confirmPassword: password }),
    });
    if (!res.ok) {
        throw new Error(`signUp(${email}) failed: ${res.status} ${await res.text()}`);
    }
    return res.json();
}


export async function signIn(email, password) {
    const res = await fetch(`${API_BASE}/signin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...bypassHeaders() },
        body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
        throw new Error(`signIn(${email}) failed: ${res.status} ${await res.text()}`);
    }
    const token = tokenFromSetCookie(res);

    const meRes = await fetch(`${API_BASE}/me`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!meRes.ok) {
        throw new Error(`GET /me failed for ${email}: ${meRes.status}`);
    }
    const meBody = await meRes.json();
    return { token, user: meBody.data || null };
}


export async function createTestUser(email, password, dbClient) {
    await signUp(email, password);

    const lookup = dbClient || new pg.Client({ connectionString: process.env.DB_URL });
    const ownsClient = !dbClient;
    if (ownsClient) await lookup.connect();
    try {
        await lookup.query(
            'UPDATE public.profiles SET email_confirmed_at = now() WHERE email = $1',
            [email.toLowerCase()],
        );
    } finally {
        if (ownsClient) await lookup.end();
    }

    try {
        const { token } = await signIn(email, password);

        const lookup2 = dbClient || new pg.Client({ connectionString: process.env.DB_URL });
        const ownsClient2 = !dbClient;
        if (ownsClient2) await lookup2.connect();
        try {
            const { rows } = await lookup2.query(
                'SELECT id FROM public.profiles WHERE email = $1',
                [email.toLowerCase()],
            );
            if (!rows[0]) throw new Error(`no profiles row for ${email}`);
            return { token, userId: rows[0].id };
        } finally {
            if (ownsClient2) await lookup2.end();
        }
    } catch (e) {
        const cleanup = dbClient || new pg.Client({ connectionString: process.env.DB_URL });
        const ownsCleanup = !dbClient;
        if (ownsCleanup) await cleanup.connect().catch(() => {});
        try {
            await cleanup.query('DELETE FROM public.profiles WHERE email = $1', [
                email.toLowerCase(),
            ]);
        } catch (_) {
        } finally {
            if (ownsCleanup) await cleanup.end().catch(() => {});
        }
        throw e;
    }
}

export { API_BASE, bypassHeaders, RATE_LIMIT_BYPASS_SECRET };


export const ADMIN_EMAIL = process.env.ADMIN_EMAIL || '';
export const ADMIN_PASSWORD = process.env.ADMIN_PASS || process.env.ADMIN_PASSWORD || '';

export function requireAdminCredentials() {
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
        throw new Error(
            'ADMIN_EMAIL and ADMIN_PASS must be set to run this verification script. ' +
            'They are never baked into the source; export them first, e.g. ' +
            'ADMIN_EMAIL=you@example.com ADMIN_PASS=... node scripts/verify-....mjs',
        );
    }
    return { email: ADMIN_EMAIL, password: ADMIN_PASSWORD };
}

export const S3_ACCESS_KEY = process.env.MINIO_ACCESS_KEY || '';
export const S3_SECRET_KEY = process.env.MINIO_SECRET_KEY || '';

export function requireS3Credentials() {
    if (!S3_ACCESS_KEY || !S3_SECRET_KEY) {
        throw new Error(
            'MINIO_ACCESS_KEY and MINIO_SECRET_KEY must be set to run this verification script.',
        );
    }
    return { accessKeyId: S3_ACCESS_KEY, secretAccessKey: S3_SECRET_KEY };
}

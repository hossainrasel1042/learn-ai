

import 'dotenv/config';
import pg from 'pg';
import { API_BASE, bypassHeaders, requireAdminCredentials } from './_testAuth.js';

const { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } = requireAdminCredentials();

let passed = 0;
let failed = 0;
const failures = [];

function assert(cond, label, detail = '') {
    if (cond) {
        passed += 1;
        console.log(`  ✓ ${label}`);
    } else {
        failed += 1;
        failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
        console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
    }
}

function section(name) {
    console.log(`\n${name}`);
}


const POISONED_IPS = [
    'fe80::1%eth0',
    'fe80::a00:27ff:fe4e:66a1%en0',
    '::1%lo',
];

async function adminToken() {
    const res = await fetch(`${API_BASE}/admin/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...bypassHeaders() },
        body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    });
    if (!res.ok) {
        throw new Error(`admin login failed: ${res.status} ${await res.text()}`);
    }
    const raw = res.headers.getSetCookie?.() ?? [];
    for (const cookie of raw) {
        if (cookie.startsWith('sb-access-token=')) {
            return cookie.split(';')[0].replace('sb-access-token=', '');
        }
    }
    throw new Error('admin login did not set sb-access-token');
}

async function main() {
    const db = new pg.Client({ connectionString: process.env.DB_URL });
    await db.connect();

    const token = await adminToken();
    const auth = { Authorization: `Bearer ${token}` };


    const runId = Date.now();
    const memberEmail = `audit-integrity-${runId}@example.com`;

    section('1. Poisoned client IP must not roll back the member row');
    for (const [i, poison] of POISONED_IPS.entries()) {


        const email = `${memberEmail}-${i}`;
        const res = await fetch(`${API_BASE}/admin/members`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Forwarded-For': poison,
                ...auth,
                ...bypassHeaders(),
            },
            body: JSON.stringify({
                email,
                password: 'IntegrationTest12345',
                name: 'Audit Integrity Probe',
                role: 'moderator',
                permissions: [],
            }),
        });

        const status = res.status;




        const lookup = await db.query(
            'SELECT id, status FROM public.admin_members WHERE email = $1',
            [email],
        );
        const persisted = lookup.rows.length;

        if (status >= 400) {
            assert(
                persisted === 0,
                `poisoned IP ${poison} → HTTP ${status} left no member row`,
                `found ${persisted} row(s)`,
            );
        } else {
            assert(
                persisted === 1,
                `poisoned IP ${poison} → HTTP ${status} persisted the member`,
                `found ${persisted} row(s)`,
            );
        }


        await db.query('DELETE FROM public.admin_members WHERE email = $1', [email]);
    }

    section('2. A poisoned IP must not abort the whole transaction');
    {


        const email = `${memberEmail}-txn`;
        const res = await fetch(`${API_BASE}/admin/members`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Forwarded-For': 'fe80::1%eth0',
                ...auth,
                ...bypassHeaders(),
            },
            body: JSON.stringify({
                email,
                password: 'IntegrationTest12345',
                name: 'Audit Integrity Probe',
                role: 'moderator',
                permissions: [],
            }),
        });
        const status = res.status;
        const lookup = await db.query(
            'SELECT id FROM public.admin_members WHERE email = $1',
            [email],
        );
        assert(
            lookup.rows.length === 1,
            'poisoned IP either persists the member or persists nothing (never a partial)',
            `HTTP ${status}, ${lookup.rows.length} row(s)`,
        );
        await db.query('DELETE FROM public.admin_members WHERE email = $1', [email]);
    }

    section('3. A valid IP persists the member AND writes an audit row');
    {
        const email = `${memberEmail}-ok`;
        const before = await db.query(
            `SELECT count(*)::int AS n FROM public.admin_audit_log
              WHERE event = 'member_created'`,
        );
        const res = await fetch(`${API_BASE}/admin/members`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Forwarded-For': '203.0.113.42',
                ...auth,
                ...bypassHeaders(),
            },
            body: JSON.stringify({
                email,
                password: 'IntegrationTest12345',
                name: 'Audit Integrity Probe',
                role: 'moderator',
                permissions: [],
            }),
        });
        const status = res.status;
        assert(status === 201 || status === 200, `member create returned HTTP ${status}`);

        const member = await db.query(
            'SELECT id FROM public.admin_members WHERE email = $1',
            [email],
        );
        assert(member.rows.length === 1, 'the member row was persisted');





        const after = await db.query(
            `SELECT id, event, ip, metadata FROM public.admin_audit_log
              WHERE event = 'member_created'
              ORDER BY created_at DESC LIMIT 5`,
        );
        const mine = after.rows.find(
            (r) => r.metadata && r.metadata.email === email,
        );
        assert(
            Boolean(mine),
            'an audit row was written for member_created',
            `found ${after.rows.length} recent rows, none for ${email}`,
        );
        if (mine) {





            assert(
                mine.ip !== 'fe80::1%eth0',
                'the stored audit IP is not the poisoned value',
                String(mine.ip),
            );
            assert(
                !String(mine.ip).includes('%'),
                'the stored audit IP has no zone identifier',
                String(mine.ip),
            );
        }

        await db.query('DELETE FROM public.admin_members WHERE email = $1', [email]);
    }

    section('4. The audit IP column rejects poisoned values at the DB level');
    {
        let rejected = false;
        try {
            await db.query(
                `INSERT INTO public.admin_audit_log (event, ip)
                 VALUES ('member_created', $1)`,
                ['fe80::1%eth0'],
            );
            await db.query(
                `DELETE FROM public.admin_audit_log WHERE event = 'member_created' AND ip = $1`,
                ['fe80::1%eth0'],
            );
        } catch (e) {
            rejected = true;
        }
        assert(rejected, 'Postgres inet rejects a zone identifier (22P02)');
    }

    await db.end();

    console.log(`\n${'='.repeat(60)}`);
    console.log(`PASS: ${passed}   FAIL: ${failed}`);
    if (failures.length) {
        console.log('\nFailures:');
        for (const f of failures) console.log(`  - ${f}`);
    }
    console.log('='.repeat(60));
    process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
    console.error('\nSUITE ERROR:', e?.message || e);
    process.exit(1);
});

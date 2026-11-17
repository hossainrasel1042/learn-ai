import 'dotenv/config';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlDir = join(__dirname, '..', 'sql');

if (!process.env.DB_URL) {
  console.error('DB_URL is not set — cannot run migrations.');
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DB_URL });

const TRACKING_TABLE = 'public.schema_migrations';

async function ensureTrackingTable() {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${TRACKING_TABLE} (
      filename    TEXT PRIMARY KEY,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

// Migrations 011-014 declare foreign keys against auth.users, which only
// exists on a database that was originally created by Supabase. On a plain
// Postgres (Render, Neon, RDS) those files fail with
// 'schema "auth" does not exist' and the deploy cannot start.
//
// A compatibility table is created here so the historical migrations apply
// unchanged. Migration 015 then repoints every one of those foreign keys at
// public.profiles and imports any rows that exist.
async function ensureAuthCompatibility() {
  const { rows } = await client.query(
    `SELECT to_regclass('auth.users') IS NOT NULL AS present`,
  );
  if (rows[0].present) {
    console.log('[migrate] auth.users already exists — nothing to bootstrap');
    return;
  }

  console.log('[migrate] auth.users not found — creating the compatibility table');
  await client.query('CREATE SCHEMA IF NOT EXISTS auth');
  await client.query(`
    CREATE TABLE IF NOT EXISTS auth.users (
      id                 UUID PRIMARY KEY,
      aud                TEXT,
      role               TEXT,
      email              TEXT,
      encrypted_password TEXT,
      email_confirmed_at TIMESTAMPTZ,
      invited_at         TIMESTAMPTZ,
      confirmation_token TEXT,
      confirmation_sent_at TIMESTAMPTZ,
      recovery_token     TEXT,
      recovery_sent_at   TIMESTAMPTZ,
      email_change_token_new TEXT,
      email_change       TEXT,
      email_change_sent_at TIMESTAMPTZ,
      last_sign_in_at    TIMESTAMPTZ,
      raw_app_meta_data  JSONB,
      raw_user_meta_data JSONB,
      is_super_admin     BOOLEAN,
      created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
      phone              TEXT,
      phone_confirmed_at TIMESTAMPTZ,
      phone_change       TEXT,
      phone_change_token TEXT,
      phone_change_sent_at TIMESTAMPTZ,
      confirmed_at       TIMESTAMPTZ,
      email_change_token_current TEXT,
      email_change_confirm_status SMALLINT,
      banned_until       TIMESTAMPTZ,
      reauthentication_token TEXT,
      reauthentication_sent_at TIMESTAMPTZ,
      is_sso_user        BOOLEAN,
      deleted_at         TIMESTAMPTZ,
      is_anonymous       BOOLEAN
    )
  `);
}

async function appliedFiles() {
  const { rows } = await client.query(
    `SELECT filename FROM ${TRACKING_TABLE}`,
  );
  return new Set(rows.map((r) => r.filename));
}

async function applyFile(filename) {
  const full = join(sqlDir, filename);
  const ddl = readFileSync(full, 'utf8');
  await client.query('BEGIN');
  try {
    await client.query(ddl);
    await client.query(
      `INSERT INTO ${TRACKING_TABLE} (filename) VALUES ($1) ON CONFLICT DO NOTHING`,
      [filename],
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
}

async function main() {
  await client.connect();
  try {
    await ensureTrackingTable();
    await ensureAuthCompatibility();

    const files = readdirSync(sqlDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    const done = await appliedFiles();
    const pending = files.filter((f) => !done.has(f));
    const skipped = files.length - pending.length;
    let applied = 0;

    // A migration can depend on a table that a later file creates — quiz_schema
    // needs flashcard_decks from srs_schema. Filename order does not express
    // that, so a file that fails is retried after the others have run, until
    // a pass makes no further progress.
    let remaining = pending;
    const failures = new Map();

    while (remaining.length > 0) {
      const stillPending = [];

      for (const file of remaining) {
        try {
          await applyFile(file);
          applied++;
          console.log(`[migrate] applied ${file}`);
          failures.delete(file);
        } catch (e) {
          stillPending.push(file);
          failures.set(file, e);
        }
      }

      if (stillPending.length === remaining.length) {
        break;
      }
      remaining = stillPending;
    }

    for (const [file, e] of failures) {
      console.error(`[migrate] ${file} failed: ${e.message}`);
    }

    if (failures.size > 0) {
      process.exitCode = 1;
    }

    console.log(
      `[migrate] done — ${applied} applied, ${skipped} already applied, ${failures.size} failed`,
    );
    if (process.exitCode) process.exit(process.exitCode);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error('[migrate] fatal:', e?.message || e);
  process.exit(1);
});



import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(__dirname, '..', 'sql', '016_battle_friend_invites.sql');
const ddl = readFileSync(sqlPath, 'utf8');

const client = new pg.Client({ connectionString: process.env.DB_URL });
await client.connect();
console.log(`Applying ${sqlPath} ...`);
try {
    await client.query(ddl);
    console.log('✓ migration applied');
} catch (e) {
    console.error('✗ migration failed:', e.message);
    process.exitCode = 1;
} finally {
    await client.end();
}

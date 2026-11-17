


import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sqlPath = path.resolve(__dirname, '../sql/012_quiz_battle.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

const dbUrl = process.env.DB_URL;
if (!dbUrl) {
    console.error('DB_URL env var not set');
    process.exit(1);
}

const client = new pg.Client({ connectionString: dbUrl });
try {
    await client.connect();
    await client.query(sql);
    console.log('Migration applied successfully');
} catch (e) {
    console.error('Migration failed:', e.message);
    process.exit(2);
} finally {
    await client.end();
}

import 'dotenv/config';
import pg from 'pg';

const dbUrl = process.env.DB_URL;
const client = new pg.Client({ connectionString: dbUrl });
await client.connect();

const tables = ['quiz_battle_profiles', 'quiz_battle_matches', 'quiz_battle_questions', 'quiz_battle_answers'];
for (const t of tables) {
    const r = await client.query(
        `SELECT column_name, data_type FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
        [t],
    );
    console.log(`\n${t}:`);
    for (const row of r.rows) {
        console.log(`  ${row.column_name}: ${row.data_type}`);
    }
}

const enumRes = await client.query(
    `SELECT t.typname, array_agg(e.enumlabel ORDER BY e.enumsortorder) AS values
       FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
       WHERE t.typname = 'quiz_battle_status' GROUP BY t.typname`,
);
console.log('\nquiz_battle_status enum:', enumRes.rows[0]?.values);

await client.end();
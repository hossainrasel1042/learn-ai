
import 'dotenv/config';
import pg from 'pg';

const client = new pg.Client({ connectionString: process.env.DB_URL });
await client.connect();
try {
    const col = await client.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'courses' AND column_name = 'code'
    `);
    console.log('courses.code column:', col.rows[0] || 'MISSING');

    const samples = await client.query(`
        SELECT id, name, course_no, code FROM public.courses ORDER BY created_at DESC LIMIT 5
    `);
    console.log('Sample courses (most recent 5):');
    for (const r of samples.rows) {
        console.log(`  - ${r.course_no}  →  ${r.code}   "${r.name}"`);
    }

    const total = await client.query(`SELECT COUNT(*)::int AS n FROM public.courses WHERE code IS NULL`);
    console.log(`Courses with NULL code: ${total.rows[0].n}`);

    const fo = await client.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'file_objects'
        ORDER BY ordinal_position
    `);
    console.log(`file_objects columns (${fo.rows.length}):`);
    for (const r of fo.rows) console.log(`  - ${r.column_name}  (${r.data_type})`);

    const trg = await client.query(`
        SELECT trigger_name FROM information_schema.triggers
        WHERE event_object_table IN ('courses', 'file_objects')
          AND trigger_schema = 'public'
        ORDER BY event_object_table, trigger_name
    `);
    console.log('Triggers:', trg.rows.map(r => r.trigger_name).join(', '));
} catch (e) {
    console.error('verify failed:', e.message);
    process.exitCode = 1;
} finally {
    await client.end();
}

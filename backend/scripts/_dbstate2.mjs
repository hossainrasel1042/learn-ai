import pg from 'pg';

const c = new pg.Client({
  connectionString: process.env.DB_URL,
  connectionTimeoutMillis: 15000,
});
await c.connect();

const { rows } = await c.query(`
  SELECT datname, usename, state, wait_event_type, wait_event,
         count(*)::int AS n,
         max(now() - state_change)::text AS age,
         max(now() - xact_start)::text AS xact_age
    FROM pg_stat_activity
   WHERE datname = current_database()
   GROUP BY datname, usename, state, wait_event_type, wait_event
   ORDER BY state, n DESC
`);

for (const r of rows) {
  console.log(
    `${(r.state || '').padEnd(20)} wait=${(r.wait_event_type || '-')}/${(r.wait_event || '-')} ` +
    `n=${String(r.n).padStart(3)} age=${r.age} xact_age=${r.xact_age}`,
  );
}

const { rows: det } = await c.query(`
  SELECT pid, state, now() - xact_start AS xact_age,
         left(query, 120) AS q
    FROM pg_stat_activity
   WHERE datname = current_database()
     AND state = 'idle in transaction'
   ORDER BY xact_start
   LIMIT 10
`);
console.log('\n--- idle in transaction ---');
for (const r of det) console.log(`pid=${r.pid} xact_age=${r.xact_age} q=${r.q}`);

await c.end();

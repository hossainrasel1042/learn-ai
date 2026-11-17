import pg from 'pg';

const pool = new pg.Pool({ connectionString: 'postgres://x:y@127.0.0.1:1/z', max: 1 });

console.log('Pool typeof release =', typeof pool.release);
console.log('Pool own keys:', Object.keys(pool).join(', '));
console.log('Pool proto methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(pool)).join(', '));

const client = await pool.connect().catch((e) => ({ err: e.message }));
if (client.err) {
  console.log('connect failed (expected):', client.err);
} else {
  console.log('Client typeof release =', typeof client.release);
  console.log('Client proto methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(client)).join(', '));
}
await pool.end().catch(() => {});

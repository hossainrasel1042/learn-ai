import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const BACKEND = fileURLToPath(new URL('..', import.meta.url));

function sh(cmd, timeout = 60000) {
  try {
    return execFileSync('bash', ['-lc', cmd], { encoding: 'utf8', timeout });
  } catch (e) {
    return `SHERR ${e.message.split('\n')[0]}`;
  }
}

const COUNT_SQL = `SELECT state, count(*)::int FROM pg_stat_activity WHERE datname = current_database() AND state IS NOT NULL GROUP BY state ORDER BY state`;

function states() {
  const out = sh(
    `cd ${BACKEND} && set -a && . ./.env && set +a && node -e "` +
      `const pg=require('pg');const c=new pg.Client({connectionString:process.env.DB_URL});` +
      `c.connect().then(()=>c.query(\\"${COUNT_SQL}\\")).then(r=>{console.log(r.rows.map(x=>x.state+'='+x.count).join(' '));return c.end();}).catch(e=>console.log('ERR '+e.message));"`
  );
  return out.trim();
}

function hit(path) {
  return sh(`curl -s -o /dev/null -w '%{http_code}' -m 25 'http://localhost:8000${path}'`).trim();
}

const routes = [
  '/health',
  '/api/v1/me',
  '/api/v1/courses',
  '/api/v1/community/posts',
  '/api/v1/quiz/attempts',
  '/api/v1/srs/reviews',
  '/api/v1/gamification/me',
  '/api/v1/mindmaps',
  '/api/v1/chat/chats',
  '/api/v1/admin/auth/login',
  '/api/v1/nope-xyz',
  '/contents/',
];

console.log('start:', states());
for (const r of routes) {
  const code = hit(r);
  const s = states();
  console.log(`${r.padEnd(30)} ${code.padEnd(5)} ${s}`);
}

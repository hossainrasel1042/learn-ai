import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const BACKEND = fileURLToPath(new URL('..', import.meta.url));

function sh(cmd) {
  try {
    return execFileSync('bash', ['-lc', cmd], { encoding: 'utf8', timeout: 60000 });
  } catch (e) {
    return `SHERR ${e.message.split('\n')[0]}\n${e.stdout || ''}`;
  }
}

const COUNT_SQL = `SELECT state, count(*)::int FROM pg_stat_activity WHERE datname = current_database() GROUP BY state ORDER BY state`;

console.log('=== restart backend ===');
console.log(sh('docker compose restart backend').trim());
console.log('waiting 20s...');
sh('sleep 20');

console.log('\n=== baseline connection states ===');
console.log(sh(`cd ${BACKEND} && set -a && . ./.env && set +a && node -e "
const pg=require('pg');const c=new pg.Client({connectionString:process.env.DB_URL});
c.connect().then(()=>c.query(\\"${COUNT_SQL}\\")).then(r=>{r.rows.forEach(x=>console.log(x.state,x.count));return c.end();}).catch(e=>{console.log('ERR',e.message);process.exit(1)});
"`).trim());

console.log('\n=== hit /api/v1/me (no auth -> 401) x1 ===');
console.log(sh(`curl -s -o /dev/null -w '%{http_code}\\n' -m 20 http://localhost:8000/api/v1/me`).trim());

console.log('\n=== states after 1 request ===');
console.log(sh(`cd ${BACKEND} && set -a && . ./.env && set +a && node -e "
const pg=require('pg');const c=new pg.Client({connectionString:process.env.DB_URL});
c.connect().then(()=>c.query(\\"${COUNT_SQL}\\")).then(r=>{r.rows.forEach(x=>console.log(x.state,x.count));return c.end();}).catch(e=>{console.log('ERR',e.message);process.exit(1)});
"`).trim());

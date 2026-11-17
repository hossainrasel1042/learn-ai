import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const BACKEND = fileURLToPath(new URL('..', import.meta.url));
const ROOT = fileURLToPath(new URL('../..', import.meta.url));

function sh(cmd, timeout = 90000) {
  try {
    return execFileSync('bash', ['-lc', cmd], { encoding: 'utf8', timeout });
  } catch (e) {
    return `SHERR ${e.message.split('\n')[0]}`;
  }
}

const COUNT_SQL = `SELECT state, count(*)::int FROM pg_stat_activity WHERE datname = current_database() AND state IS NOT NULL GROUP BY state ORDER BY state`;

function states() {
  return sh(
    `cd ${BACKEND} && set -a && . ./.env && set +a && node -e "` +
      `const pg=require('pg');const c=new pg.Client({connectionString:process.env.DB_URL});` +
      `c.connect().then(()=>c.query(\\"${COUNT_SQL}\\")).then(r=>{console.log(r.rows.map(x=>x.state+'='+x.count).join(' '));return c.end();}).catch(e=>console.log('ERR '+e.message));"`
  ).trim();
}

console.log('restart backend...');
sh(`cd ${ROOT} && docker compose restart backend`);
sh('sleep 22');
console.log('start:', states());

const email = `leaktest${Date.now()}@example.com`;
const pass = 'LeakTest12345';

console.log('\n--- signup ---');
console.log(
  sh(
    `curl -s -o /dev/null -w '%{http_code}' -m 30 -X POST http://localhost:8000/api/v1/signup ` +
      `-H 'Content-Type: application/json' --data '{"email":"${email}","password":"${pass}","confirmPassword":"${pass}","name":"Leak Test"}'`
  ).trim()
);
console.log('after signup:', states());

console.log('\n--- verify email via direct DB stamp ---');
sh(
  `cd ${BACKEND} && set -a && . ./.env && set +a && node -e "` +
    `const pg=require('pg');const c=new pg.Client({connectionString:process.env.DB_URL});` +
    `c.connect().then(()=>c.query('UPDATE public.profiles SET email_confirmed_at = now() WHERE email = \\$1',['${email}'])).then(()=>c.end());"`
);
console.log('after stamp:', states());

console.log('\n--- signin ---');
console.log(
  sh(
    `curl -s -o /dev/null -w '%{http_code}' -m 30 -X POST http://localhost:8000/api/v1/signin ` +
      `-H 'Content-Type: application/json' --data '{"email":"${email}","password":"${pass}"}'`
  ).trim()
);
console.log('after signin:', states());

console.log('\n--- create chat (POST /api/v1/chat) ---');
sh(
  `curl -s -c /tmp/ck.txt -o /dev/null -m 30 -X POST http://localhost:8000/api/v1/signin ` +
    `-H 'Content-Type: application/json' --data '{"email":"${email}","password":"${pass}"}'`
);
console.log(
  sh(
    `curl -s -b /tmp/ck.txt -o /tmp/chat.json -w '%{http_code}' -m 30 -X POST http://localhost:8000/api/v1/chat ` +
      `-H 'Content-Type: application/json' --data '{"title":"leak"}'`
  ).trim()
);
console.log('after create chat:', states());
console.log('chat body:', sh('head -c 300 /tmp/chat.json').trim());

const chatId = (() => {
  try {
    return JSON.parse(sh('cat /tmp/chat.json').trim()).id || JSON.parse(sh('cat /tmp/chat.json').trim()).data?.id;
  } catch {
    return null;
  }
})();
console.log('chatId =', chatId);

if (chatId) {
  console.log('\n--- POST message (non-stream) ---');
  console.log(
    sh(
      `curl -s -b /tmp/ck.txt -o /dev/null -w '%{http_code}' -m 60 -X POST 'http://localhost:8000/api/v1/chat/${chatId}/message?stream=false' ` +
        `-H 'Content-Type: application/json' --data '{"content":"hello there"}'`
    ).trim()
  );
  console.log('after non-stream message:', states());

  console.log('\n--- POST message (STREAM / SSE) ---');
  console.log(
    sh(
      `curl -s -b /tmp/ck.txt -o /dev/null -w '%{http_code}' -m 60 -X POST 'http://localhost:8000/api/v1/chat/${chatId}/message?stream=true' ` +
        `-H 'Content-Type: application/json' --data '{"content":"hello again"}'`
    ).trim()
  );
  console.log('after STREAM message:', states());
}

console.log('\n--- final ---');
console.log('states:', states());

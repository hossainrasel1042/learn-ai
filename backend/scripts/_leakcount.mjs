import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const BACKEND = fileURLToPath(new URL('..', import.meta.url));
const ROOT = fileURLToPath(new URL('../..', import.meta.url));

function sh(cmd, timeout = 120000) {
  try {
    return execFileSync('bash', ['-lc', cmd], { encoding: 'utf8', timeout });
  } catch (e) {
    return `SHERR ${e.message.split('\n')[0]}`;
  }
}

const SQL = `SELECT pid, state, now()-xact_start AS xact_age, left(query,90) AS q
             FROM pg_stat_activity
             WHERE datname = current_database() AND state = 'idle in transaction'
             ORDER BY xact_start`;

function iit() {
  const out = sh(
    `cd ${BACKEND} && set -a && . ./.env && set +a && node -e "` +
      `const pg=require('pg');const c=new pg.Client({connectionString:process.env.DB_URL});` +
      `c.connect().then(()=>c.query(\\"${SQL.replace(/\n/g, ' ')}\\")).then(r=>{` +
      `r.rows.forEach(x=>console.log('pid='+x.pid+' age='+x.xact_age+' q='+x.q));` +
      `if(!r.rows.length)console.log('(none)');return c.end();}).catch(e=>console.log('ERR '+e.message));"`
  );
  return out.trim();
}

console.log('restart backend...');
sh(`cd ${ROOT} && docker compose restart backend`);
sh('sleep 22');
console.log('iit after restart:\n' + iit());

const email = `leak2${Date.now()}@example.com`;
const pass = 'LeakTest12345';

sh(
  `curl -s -o /dev/null -m 30 -X POST http://localhost:8000/api/v1/signup ` +
    `-H 'Content-Type: application/json' --data '{"email":"${email}","password":"${pass}","confirmPassword":"${pass}","name":"Leak Test"}'`
);
sh(
  `cd ${BACKEND} && set -a && . ./.env && set +a && node -e "` +
    `const pg=require('pg');const c=new pg.Client({connectionString:process.env.DB_URL});` +
    `c.connect().then(()=>c.query('UPDATE public.profiles SET email_confirmed_at = now() WHERE email = \\$1',['${email}'])).then(()=>c.end());"`
);
sh(
  `curl -s -c /tmp/ck2.txt -o /dev/null -m 30 -X POST http://localhost:8000/api/v1/signin ` +
    `-H 'Content-Type: application/json' --data '{"email":"${email}","password":"${pass}"}'`
);
sh(
  `curl -s -b /tmp/ck2.txt -o /tmp/chat2.json -m 30 -X POST http://localhost:8000/api/v1/chat ` +
    `-H 'Content-Type: application/json' --data '{"title":"leak"}'`
);
const chatId = JSON.parse(sh('cat /tmp/chat2.json').trim()).id;
console.log('chatId', chatId);

console.log('\n--- 3 non-stream messages ---');
for (let i = 0; i < 3; i++) {
  sh(
    `curl -s -b /tmp/ck2.txt -o /dev/null -m 60 -X POST 'http://localhost:8000/api/v1/chat/${chatId}/message?stream=false' ` +
      `-H 'Content-Type: application/json' --data '{"content":"msg ${i}"}'`
  );
  console.log(`after msg ${i}:\n` + iit());
}

console.log('\n--- 3 stream messages ---');
for (let i = 0; i < 3; i++) {
  sh(
    `curl -s -b /tmp/ck2.txt -o /dev/null -m 60 -X POST 'http://localhost:8000/api/v1/chat/${chatId}/message?stream=true' ` +
      `-H 'Content-Type: application/json' --data '{"content":"smsg ${i}"}'`
  );
  console.log(`after smsg ${i}:\n` + iit());
}

console.log('\n--- backend logs (release errors) ---');
console.log(
  sh(`docker logs backend 2>&1 | grep -iE "released|pool client|already a transaction" | tail -20`).trim()
);

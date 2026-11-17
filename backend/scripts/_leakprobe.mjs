import { execFile, execFileSync } from 'node:child_process';

const BASE = 'http://localhost:8000';

function curl(args, timeout = 30000) {
  return new Promise((resolve) => {
    execFile('curl', args, { timeout }, (e, stdout) => {
      resolve(e ? `ERR ${e.code ?? e.message.split('\n')[0]}` : stdout.trim());
    });
  });
}

const W = ['-s', '-o', '/dev/null', '-w', '%{http_code} %{time_total}', '-m', '25'];

console.log('--- single sequential requests ---');
for (const p of ['/health', '/api/v1/me', '/api/v1/courses', '/api/v1/nope-xyz', '/contents/']) {
  console.log(p.padEnd(26), await curl([...W, `${BASE}${p}`]));
}

console.log('\n--- 12 parallel /health ---');
const par = await Promise.all(
  Array.from({ length: 12 }, () => curl([...W, `${BASE}/health`]))
);
par.forEach((r, i) => console.log(`  p${i}:`, r));

console.log('\n--- 20 parallel /api/v1/me ---');
const par2 = await Promise.all(
  Array.from({ length: 20 }, () => curl([...W, `${BASE}/api/v1/me`]))
);
par2.forEach((r, i) => console.log(`  q${i}:`, r));

console.log('\n--- backend health after ---');
try {
  console.log(execFileSync('docker', ['inspect', '--format', '{{.State.Health.Status}}', 'backend'], { encoding: 'utf8' }).trim());
} catch (e) {
  console.log('inspect failed');
}

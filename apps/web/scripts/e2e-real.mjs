// Runs the Playwright suite including the real-API projects (E2E_REAL=1), forwarding any extra arguments.
// Requires the local API (:3000) with Postgres + Redis. Usage: npm run e2e:real -w @smartwallet/web -- --project=real-desktop
import { spawnSync } from 'node:child_process';

try {
  const r = await fetch('http://localhost:3000/health');
  if (!r.ok) throw new Error(String(r.status));
} catch {
  console.error('The API is not answering on http://localhost:3000/health: start it (docker compose up) before running the real-API suite.');
  process.exit(2);
}
const res = spawnSync('npx', ['playwright', 'test', ...process.argv.slice(2)], { stdio: 'inherit', shell: true, env: { ...process.env, E2E_REAL: '1' } });
process.exit(res.status ?? 1);

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Run the maintained navbar verification rather than duplicating browser code.
const cwd = fileURLToPath(new URL('.', import.meta.url));
const env = { ...process.env };
const envFile = new URL('../.env', import.meta.url);
if (!env.NINECUBE_SEED_PASSWORD && existsSync(envFile)) {
  const entry = readFileSync(envFile, 'utf8').split(/\r?\n/)
    .find(line => /^\s*NINECUBE_SEED_PASSWORD\s*=/.test(line));
  if (entry) {
    env.NINECUBE_SEED_PASSWORD = entry.slice(entry.indexOf('=') + 1).trim()
      .replace(/^(['"])(.*)\1$/, '$2');
  }
}
if (!env.NINECUBE_SEED_PASSWORD) {
  console.error('Set NINECUBE_SEED_PASSWORD or configure it in the project .env file.');
  process.exit(1);
}
const cli = fileURLToPath(new URL('./node_modules/@playwright/test/cli.js', import.meta.url));
const result = spawnSync(process.execPath, [cli, 'test', 'e2e/navbar-matched.spec.ts',
  '--trace=off', '--output=artifacts/verify-pills-results', ...process.argv.slice(2)],
{ cwd, env, stdio: 'inherit' });
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);

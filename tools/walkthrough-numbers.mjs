/**
 * Measures the test-suite counts the walkthrough states on screen.
 *
 *   node tools/walkthrough-numbers.mjs
 *
 * Writes docs/walkthrough/numbers.json, which web/scripts/record-walkthrough.mjs reads before it
 * films the closing card. Nothing here is typed by hand: a count that cannot be parsed out of the
 * tool's own output stops the run instead of painting a number nobody checked.
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WEB = join(ROOT, 'web');

// The runners colour their own summary, and the escape sequences land between the number and the word
// that tells us which number it is. Plain text keeps the patterns below honest.
const env = { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' };

function run(command, args, cwd, pattern, label) {
  const started = spawnSync(command, args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env });
  if (started.status !== 0) throw new Error(`${label} exited ${started.status}: ${(started.stderr ?? '').slice(-400)}`);
  // Vitest and Playwright write their summary to whichever stream the runner prefers.
  const output = `${started.stdout ?? ''}\n${started.stderr ?? ''}`.replace(/\u001b\[[0-9;]*m/g, '');
  const matched = pattern.exec(output);
  if (!matched) throw new Error(`${label} produced no count that could be read; refusing to guess one`);
  return Number(matched[1]);
}

const node = process.execPath;

const numbers = {
  measuredAt: new Date().toISOString(),
  backend: run(
    'dotnet', ['test', 'src/NineCube.Tests', '--no-build'], ROOT,
    /Passed:\s+(\d+),\s+Skipped:\s+\d+,\s+Total:\s+\d+/u, 'dotnet test'
  ),
  frontend: run(node, ['node_modules/vitest/vitest.mjs', 'run'], WEB, /Tests\s+(\d+) passed/u, 'vitest run'),
  browser: run(node, ['node_modules/@playwright/test/cli.js', 'test', '--list'], WEB, /Total:\s+(\d+) tests/u, 'playwright test --list')
};

const target = join(ROOT, 'docs', 'walkthrough', 'numbers.json');
writeFileSync(target, JSON.stringify(numbers, null, 2));
console.log(`${numbers.backend} backend · ${numbers.frontend} frontend · ${numbers.browser} browser -> ${target}`);

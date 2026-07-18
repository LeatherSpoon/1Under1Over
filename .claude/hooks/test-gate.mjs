// Stop hook: delivery gate — the turn may not end while the test suite is red.
// Runs tests/runAll.test.js (~1s). Exit 2 blocks the stop and feeds the failure
// back to Claude; stop_hook_active guards against an endless block loop.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

let input = {};
try { input = JSON.parse(readFileSync(0, 'utf8')); } catch {}
if (input.stop_hook_active) process.exit(0);

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const res = spawnSync(process.execPath, ['tests/runAll.test.js'], {
  cwd: projectRoot, encoding: 'utf8', timeout: 90000,
});
if (res.status !== 0) {
  const out = (res.stdout || '') + (res.stderr || '');
  const tail = out.split(/\r?\n/)
    .filter(l => /✖|fail|AssertionError|Error/.test(l))
    .slice(0, 25).join('\n');
  console.error(`Delivery gate: the test suite is failing — fix it before finishing.\n${tail || out.slice(-2000)}`);
  process.exit(2);
}

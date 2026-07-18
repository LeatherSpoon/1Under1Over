// PostToolUse hook (Edit|Write): syntax-check edited .js/.mjs files.
// Enforces the CLAUDE.md "node --check after edits" convention mechanically.
// Exit 2 feeds stderr back to Claude so the syntax error gets fixed immediately.
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

let input = {};
try { input = JSON.parse(readFileSync(0, 'utf8')); } catch { process.exit(0); }

const filePath = input?.tool_input?.file_path || input?.tool_response?.filePath || '';
if (!/\.(js|mjs)$/i.test(filePath) || !existsSync(filePath)) process.exit(0);

const res = spawnSync(process.execPath, ['--check', filePath], { encoding: 'utf8', timeout: 20000 });
if (res.status !== 0) {
  console.error(`node --check failed for ${filePath}:\n${res.stderr || res.stdout || ''}`);
  process.exit(2);
}

import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Comparable form for paths from either platform: on a POSIX host,
// fileURLToPath leaves a Windows file URL as "/D:/..." while argv carries
// "D:\...", so equality must key off the input's shape, not process.platform.
function comparablePath(p) {
  const slashed = String(p).replace(/\\/g, '/');
  const drive = slashed.match(/^\/?([A-Za-z]:\/.*)$/);
  if (drive) return drive[1].toLowerCase();
  const resolved = path.resolve(slashed);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

export function isDirectRun(metaUrl, argvPath = process.argv[1]) {
  if (!argvPath) return false;
  return comparablePath(fileURLToPath(metaUrl)) === comparablePath(argvPath);
}

export async function runCli(task, pool) {
  try {
    await task(pool);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

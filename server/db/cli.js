import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function isDirectRun(metaUrl, argvPath = process.argv[1]) {
  if (!argvPath) return false;

  // Compare by the argv path's style, not process.platform — Windows-shaped
  // paths must resolve under win32 rules even when tests run on POSIX.
  const winStyle = /^[a-zA-Z]:[\\/]/.test(argvPath) || argvPath.startsWith('\\\\');
  if (winStyle || process.platform === 'win32') {
    const modulePath = path.win32.resolve(fileURLToPath(metaUrl, { windows: true }));
    const entryPath = path.win32.resolve(argvPath);
    return modulePath.toLowerCase() === entryPath.toLowerCase();
  }

  return path.resolve(fileURLToPath(metaUrl)) === path.resolve(argvPath);
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

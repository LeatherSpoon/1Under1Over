import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function isDirectRun(metaUrl, argvPath = process.argv[1]) {
  if (!argvPath) return false;

  const modulePath = path.resolve(fileURLToPath(metaUrl));
  const entryPath = path.resolve(argvPath);

  if (process.platform === 'win32') {
    return modulePath.toLowerCase() === entryPath.toLowerCase();
  }
  return modulePath === entryPath;
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

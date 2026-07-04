import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readConfig } from '../config.js';
import { createPool } from './pool.js';
import { isDirectRun, runCli } from './cli.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function runMigrations(pool) {
  const dir = path.join(__dirname, 'migrations');
  const files = (await fs.readdir(dir)).filter(f => f.endsWith('.sql')).sort();

  for (const file of files) {
    const id = file.replace(/\.sql$/, '');
    const applied = await pool
      .query('select 1 from schema_migrations where id = $1', [id])
      .catch(() => ({ rowCount: 0 }));
    if (applied.rowCount > 0) continue;

    const sql = await fs.readFile(path.join(dir, file), 'utf8');
    await pool.query('begin');
    try {
      await pool.query(sql);
      await pool.query('insert into schema_migrations (id) values ($1) on conflict do nothing', [id]);
      await pool.query('commit');
      console.log(`Applied migration ${id}`);
    } catch (error) {
      await pool.query('rollback');
      throw error;
    }
  }
}

if (isDirectRun(import.meta.url)) {
  const config = readConfig();
  const pool = createPool(config.databaseUrl);
  runCli(runMigrations, pool);
}

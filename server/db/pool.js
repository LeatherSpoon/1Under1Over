import pg from 'pg';

const { Pool } = pg;

export function createPool(databaseUrl) {
  const pool = new Pool({ connectionString: databaseUrl });
  pool.on('error', error => {
    console.error('[PostgreSQL] idle client error:', error.message);
  });
  return pool;
}

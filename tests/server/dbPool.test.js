import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPool } from '../../server/db/pool.js';

test('postgres pool installs an idle error listener for local-first fallback', async () => {
  const pool = createPool('postgres://postgres:postgres@localhost:5432/processing_power');
  try {
    assert.ok(pool.listenerCount('error') > 0);
  } finally {
    await pool.end();
  }
});

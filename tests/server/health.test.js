import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApiServer } from '../../server/server.js';

test('GET /api/health returns backend and database status', async () => {
  const server = createApiServer({
    db: {
      async health() {
        return { ok: true };
      }
    }
  });

  await new Promise(resolve => server.listen(0, resolve));
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body, {
      ok: true,
      database: true,
      mode: 'hybrid-local-first'
    });
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('GET /api/health stays available when database health check fails', async () => {
  const server = createApiServer({
    db: {
      async health() {
        throw new Error('connect ECONNREFUSED');
      }
    }
  });

  await new Promise(resolve => server.listen(0, resolve));
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body, {
      ok: true,
      database: false,
      mode: 'hybrid-local-first'
    });
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

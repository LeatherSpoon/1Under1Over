import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SyncClient } from '../../js/sync/SyncClient.js';

function storage() {
  const data = new Map();
  return {
    getItem(key) { return data.get(key) || null; },
    setItem(key, value) { data.set(key, value); },
    removeItem(key) { data.delete(key); }
  };
}

test('sync client queues events when backend is offline', async () => {
  const client = new SyncClient({
    baseUrl: 'http://local',
    playerId: 'local-player',
    storage: storage(),
    fetchImpl: async () => { throw new Error('offline'); }
  });

  await client.recordTransaction('inventory.addMaterial', { itemKey: 'copper', qty: 1 });

  assert.equal(client.status, 'Local');
  assert.equal(client.queue.length, 1);
  assert.equal(client.queue[0].type, 'inventory.addMaterial');
});

test('sync client replays queued events and clears accepted events', async () => {
  const calls = [];
  const client = new SyncClient({
    baseUrl: 'http://local',
    playerId: 'local-player',
    storage: storage(),
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        async json() {
          return { ok: true, player: { version: 1 } };
        }
      };
    }
  });

  await client.recordTransaction('inventory.addMaterial', { itemKey: 'copper', qty: 1 });
  await client.flush();

  assert.equal(client.status, 'Synced');
  assert.equal(client.queue.length, 0);
  assert.equal(calls[0].url, 'http://local/api/sync');
});

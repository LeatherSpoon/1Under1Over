import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SyncClient } from '../../js/sync/SyncClient.js';
import { CloudSaveSystem } from '../../js/systems/CloudSaveSystem.js';
import { createApiServer } from '../../server/server.js';

function storage() {
  const data = new Map();
  return {
    getItem(key) { return data.get(key) || null; },
    setItem(key, value) { data.set(key, value); },
    removeItem(key) { data.delete(key); }
  };
}

function makeClient(fetchImpl) {
  return new SyncClient({
    baseUrl: 'http://local',
    playerId: 'local-player',
    storage: storage(),
    fetchImpl
  });
}

test('uploadSnapshot posts the blob with playerId attached', async () => {
  const calls = [];
  const client = makeClient(async (url, options) => {
    calls.push({ url, options });
    return { ok: true, async json() { return { ok: true }; } };
  });

  const ok = await client.uploadSnapshot({ version: 9, zone: 'mine' });

  assert.equal(ok, true);
  assert.equal(calls[0].url, 'http://local/api/save-snapshot');
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.playerId, 'local-player');
  assert.equal(body.zone, 'mine');
});

test('uploadSnapshot returns false when the server is unreachable', async () => {
  const client = makeClient(async () => { throw new Error('offline'); });
  assert.equal(await client.uploadSnapshot({ version: 9 }), false);
});

test('fetchLatestSnapshot returns the snapshot on 200 and null on 404', async () => {
  const snapshot = { version: 9, zone: 'landingSite', pp: { ppTotal: 500 } };
  let respond = { ok: true, async json() { return snapshot; } };
  const client = makeClient(async () => respond);

  assert.deepEqual(await client.fetchLatestSnapshot(), snapshot);

  respond = { ok: false, async json() { return { ok: false, reason: 'not_found' }; } };
  assert.equal(await client.fetchLatestSnapshot(), null);
});

test('fetchLatestSnapshot returns null when the server is unreachable', async () => {
  const client = makeClient(async () => { throw new Error('offline'); });
  assert.equal(await client.fetchLatestSnapshot(), null);
});

function makeCloud({ uploadResult = true, state } = {}) {
  const uploads = [];
  const cloud = new CloudSaveSystem({
    sync: {
      uploadSnapshot: async snap => { uploads.push(snap); return uploadResult; },
      fetchLatestSnapshot: async () => null,
    },
    saveSystem: {
      buildSaveData: (zone, x, z) => ({
        version: 9, timestamp: Date.now(), zone, playerX: x, playerZ: z, ...state(),
      }),
    },
    getZone: () => 'landingSite',
    getPlayerPos: () => ({ x: 0, z: 0 }),
    storage: storage(),
  });
  return { cloud, uploads };
}

test('uploadIfChanged skips identical state (timestamp excluded) and uploads on change', async () => {
  let ppTotal = 100;
  const { cloud, uploads } = makeCloud({ state: () => ({ pp: ppTotal }) });

  assert.equal(await cloud.uploadIfChanged(), 'saved');
  assert.equal(await cloud.uploadIfChanged(), 'skipped');

  ppTotal = 200;
  assert.equal(await cloud.uploadIfChanged(), 'saved');
  assert.equal(uploads.length, 2);
});

test('uploadIfChanged reports offline and retries the same state next call', async () => {
  const { cloud, uploads } = makeCloud({ uploadResult: false, state: () => ({ pp: 1 }) });

  assert.equal(await cloud.uploadIfChanged(), 'offline');

  // Server comes back — the unchanged state must still upload (nothing cached on failure).
  cloud.sync.uploadSnapshot = async snap => { uploads.push(snap); return true; };
  assert.equal(await cloud.uploadIfChanged(), 'saved');
});

test('disabling cloud saves blocks uploads and persists across instances', async () => {
  const store = storage();
  const sync = { uploadSnapshot: async () => { throw new Error('must not upload'); } };
  const saveSystem = { buildSaveData: () => ({ version: 9, timestamp: 0 }) };
  const opts = { sync, saveSystem, getZone: () => 'landingSite', getPlayerPos: () => ({ x: 0, z: 0 }), storage: store };

  const cloud = new CloudSaveSystem(opts);
  assert.equal(cloud.enabled, true, 'defaults to enabled');
  cloud.setEnabled(false);
  assert.equal(await cloud.uploadIfChanged(), 'disabled');

  const cloud2 = new CloudSaveSystem(opts);
  assert.equal(cloud2.enabled, false, 'toggle survives a reload');
});

test('snapshot round trip through the real API server', async () => {
  let stored = null;
  const server = createApiServer({
    db: {
      async saveSnapshot(snap) { stored = snap; return { ok: true }; },
      async getLatestSnapshot() { return stored; },
    }
  });
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const client = new SyncClient({
    baseUrl: `http://localhost:${port}`,
    playerId: 'local-player',
    storage: storage()
  });

  try {
    assert.equal(await client.fetchLatestSnapshot(), null, '404 before any upload');

    const ok = await client.uploadSnapshot({ version: 9, zone: 'mine', timestamp: 123 });
    assert.equal(ok, true);
    assert.equal(stored.playerId, 'local-player');

    const snap = await client.fetchLatestSnapshot();
    assert.equal(snap.zone, 'mine');

    // The pagehide beacon sends text/plain (CORS-safelisted) — the server
    // must parse the body as JSON regardless of content-type.
    const res = await fetch(`http://localhost:${port}/api/save-snapshot`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: JSON.stringify({ playerId: 'beacon-player', version: 9 })
    });
    assert.equal(res.status, 200);
    assert.equal(stored.playerId, 'beacon-player');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('fetchLatest rejects blobs without a save version', async () => {
  const cloud = new CloudSaveSystem({
    sync: { fetchLatestSnapshot: async () => ({ ok: false, reason: 'not_found' }) },
    saveSystem: {}, getZone: () => '', getPlayerPos: () => ({}), storage: storage(),
  });
  assert.equal(await cloud.fetchLatest(), null);
});

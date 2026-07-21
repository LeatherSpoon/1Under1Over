import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PPSystem } from '../../js/systems/PPSystem.js';
import { InventorySystem } from '../../js/systems/InventorySystem.js';
import { TripartiteSystem } from '../../js/systems/TripartiteSystem.js';
import { OfflineSystem } from '../../js/systems/OfflineSystem.js';

function makeTri() {
  const pp = new PPSystem();
  return { pp, tri: new TripartiteSystem(pp) };
}

// ── Curve shape ────────────────────────────────────────────────────────────────

test('tripartite bonuses keep growing at scale (no log flatline)', () => {
  const { pp, tri } = makeTri();

  tri.invested.capacity = 6000; // ~10h of even-split investment
  tri._applyEffects();
  const at10h = pp.ppCap / 150 - 1;

  tri.invested.capacity = 60000; // ~100h
  tri._applyEffects();
  const at100h = pp.ppCap / 150 - 1;

  // Power curve gives ~2.24x bonus growth per 10x invested; the old log1p
  // curve managed ~1.27x, which read as "finished" within a day.
  assert.ok(at100h / at10h > 2, `bonus must keep scaling: ${at10h} -> ${at100h}`);
});

test('early-game bonus magnitude is preserved (~1h of play)', () => {
  const { pp, tri } = makeTri();
  for (let i = 0; i < 3600; i++) tri.update(1); // 1 hour online, even split
  const capMult = pp.ppCap / 150;
  assert.ok(capMult > 1.1 && capMult < 1.4, `1h capMult in old ballpark, got ${capMult}`);
  assert.ok(tri.currentRateMultiplier > 1.2 && tri.currentRateMultiplier < 1.6);
});

// ── Investment routing ─────────────────────────────────────────────────────────

test('ratios and presence multipliers steer investment flow', () => {
  const { tri } = makeTri();
  tri.setRatio('capacity', 100);
  tri.presenceMultiplier.capacity = 1.5;
  tri.update(10); // flow 0.5/s * 10s = 5 units, all to capacity, x1.5 presence
  assert.ok(Math.abs(tri.invested.capacity - 7.5) < 1e-9);
  assert.equal(tri.invested.power, 0);
  assert.equal(tri.invested.rate, 0);
});

// ── Session momentum ───────────────────────────────────────────────────────────

test('session momentum ramps with live session time and caps', () => {
  const { tri } = makeTri();
  assert.equal(tri.sessionMomentum, 1, 'fresh session starts at x1');
  tri._sessionSeconds = 2 * 3600;
  assert.equal(tri.sessionMomentum, 2, 'x2 after 2h (0.5/hour)');
  tri._sessionSeconds = 10 * 3600;
  assert.equal(tri.sessionMomentum, 4, 'capped at x4');
});

test('momentum multiplies live investment flow', () => {
  const { tri } = makeTri();
  tri.setRatio('capacity', 100);
  tri._sessionSeconds = 6 * 3600; // momentum x4
  tri.update(10);
  assert.ok(Math.abs(tri.invested.capacity - 20) < 1e-9, '0.5/s * 10s * x4 = 20');
});

test('offline investment gets no session momentum', () => {
  const { tri } = makeTri();
  tri._sessionSeconds = 10 * 3600; // would be x4 if it applied
  const summary = tri.simulateOffline(100, 0.5);
  assert.equal(summary.invested, 25, 'throttled 0.5/s * 100s * 0.5, momentum-free');
});

// ── Offline investment ─────────────────────────────────────────────────────────

test('simulateOffline invests at reduced efficiency and applies effects', () => {
  const { pp, tri } = makeTri();
  const summary = tri.simulateOffline(3600, 0.5);
  assert.ok(summary, 'summary produced');
  assert.equal(summary.invested, 900); // 0.5/s * 3600s * 0.5
  const total = tri.invested.capacity + tri.invested.power + tri.invested.rate;
  assert.ok(Math.abs(total - 900) < 1e-6, 'units land in the legs');
  assert.ok(pp.ppCap > 150, 'capacity effect applied');
  assert.ok(tri.currentRateMultiplier > 1, 'rate effect applied');
});

test('offline return summary includes the allocation highlight', () => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
  };
  try {
    const { pp, tri } = makeTri();
    const offline = new OfflineSystem(pp, { drones: [] }, new InventorySystem());
    offline.setReturnContext({ tripartite: tri });
    store.set('pp_last_active', String(Date.now() - 3600_000)); // 1h away

    const summary = offline.applyAndSummarize();
    assert.ok(summary, 'offline summary produced');
    assert.ok(summary.highlights.some(h => h.includes('Allocation')), 'allocation highlight present');
    const total = tri.invested.capacity + tri.invested.power + tri.invested.rate;
    assert.ok(total > 800 && total < 1000, `~900 units invested for 1h away, got ${total}`);
  } finally {
    delete globalThis.localStorage;
  }
});

// ── Save compatibility ─────────────────────────────────────────────────────────

test('legacy leg names (throughput/yield) deserialize onto the new curve', () => {
  const { pp, tri } = makeTri();
  tri.deserialize({ invested: { capacity: 600, throughput: 600, yield: 600 } });
  assert.equal(tri.invested.power, 600);
  assert.equal(tri.invested.rate, 600);
  assert.ok(pp.ppCap > 150, 'effects recomputed on load');
  assert.ok(tri.currentRateMultiplier > 1.3, 'rate leg live from legacy field');
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG, getZoneBounds, getPlayerBounds } from '../../js/config.js';

// World bounds are per-zone (CONFIG.ZONE_BOUNDS) rather than a single global
// GROUND_SIZE clamp, so a biome can be any footprint. These tests pin both the
// "nothing changed for existing zones" guarantee and the "big zones actually
// work" capability that the expanded biomes depend on.

test('an undeclared zone keeps the pre-existing global extent exactly', () => {
  // Before per-zone bounds, Player.js clamped to `GROUND_SIZE / 2 - 1` on every
  // zone. Any zone without a ZONE_BOUNDS entry must still land on that number,
  // or shipping this change would silently resize twelve zones.
  const legacyHalf = CONFIG.GROUND_SIZE / 2 - 1;
  const p = getPlayerBounds('landingSite');
  assert.equal(p.minX, -legacyHalf);
  assert.equal(p.maxX, legacyHalf);
  assert.equal(p.minZ, -legacyHalf);
  assert.equal(p.maxZ, legacyHalf);

  const g = getZoneBounds('landingSite');
  assert.equal(g.maxX - g.minX, CONFIG.GROUND_SIZE);
  assert.equal(g.maxZ - g.minZ, CONFIG.GROUND_SIZE);
});

test('an unknown zone name falls back to the default rather than throwing', () => {
  const p = getPlayerBounds('nonexistentZone');
  assert.equal(p.maxX, CONFIG.GROUND_SIZE / 2 - 1);
});

test('a declared zone can be far larger than the old 80-unit ceiling', () => {
  CONFIG.ZONE_BOUNDS.__test100 = { minX: -50, maxX: 50, minZ: -50, maxZ: 50 };
  try {
    const g = getZoneBounds('__test100');
    assert.equal(g.maxX - g.minX, 100);
    assert.equal(g.maxZ - g.minZ, 100);

    // The player reaches 49 — well past the 39 the old global clamp allowed.
    const p = getPlayerBounds('__test100');
    assert.equal(p.maxX, 50 - CONFIG.WORLD_EDGE_MARGIN);
    assert.equal(p.minZ, -50 + CONFIG.WORLD_EDGE_MARGIN);
    assert.ok(p.maxX > CONFIG.GROUND_SIZE / 2 - 1, 'a declared zone must exceed the old ceiling');
  } finally {
    delete CONFIG.ZONE_BOUNDS.__test100;
  }
});

test('bounds may be asymmetric and off-centre', () => {
  // The Frozen Tundra is already x -30..30, z -24..30 — biomes are not squares.
  CONFIG.ZONE_BOUNDS.__testOffset = { minX: -20, maxX: 80, minZ: -60, maxZ: 40 };
  try {
    const g = getZoneBounds('__testOffset');
    assert.equal(g.maxX - g.minX, 100);
    assert.equal(g.maxZ - g.minZ, 100);

    const p = getPlayerBounds('__testOffset');
    assert.equal(p.minX, -19);
    assert.equal(p.maxX, 79);
    assert.equal(p.minZ, -59);
    assert.equal(p.maxZ, 39);
  } finally {
    delete CONFIG.ZONE_BOUNDS.__testOffset;
  }
});

test('the playable area is always inset from the ground plane', () => {
  // The margin is why the player never stands on the visible edge of the floor.
  for (const zone of ['landingSite', 'mine', 'verdantMaw', 'frozenTundra']) {
    const g = getZoneBounds(zone);
    const p = getPlayerBounds(zone);
    assert.ok(p.minX > g.minX && p.maxX < g.maxX, `${zone} x is not inset`);
    assert.ok(p.minZ > g.minZ && p.maxZ < g.maxZ, `${zone} z is not inset`);
  }
});

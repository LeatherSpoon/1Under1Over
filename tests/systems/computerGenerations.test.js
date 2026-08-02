import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GENERATIONS, CHUNK, chunkKey, worldToChunk, chunkToWorld }
  from '../../js/systems/computerGenerations.js';

test('table covers gens 1-4 contiguously with era-1 invariants', () => {
  assert.equal(GENERATIONS.length, 4);
  GENERATIONS.forEach((row, i) => {
    assert.equal(row.gen, i + 1);
    assert.equal(row.era, 1);
    assert.equal(row.storyHeight, 3);
    assert.equal(typeof row.fillFraction, 'number');
    assert.ok(row.fillFraction > 0 && row.fillFraction <= 0.95);
    assert.equal(typeof row.eligibility, 'number');
  });
  // Era-1 cumulative budget is 2 chunks (addendum §4)
  const total = GENERATIONS.reduce((s, r) => s + r.chunkGrant, 0);
  assert.equal(total, 2);
  // Gen 1 has no schematic (it's the founding), 2-4 do
  assert.equal(GENERATIONS[0].schematic, null);
  for (const r of GENERATIONS.slice(1)) assert.ok(r.schematic && Object.keys(r.schematic).length > 0);
});

test('schematic material keys are proven inventory keys', () => {
  // Keys proven in TrainingAreaSystem.UPGRADE_COSTS — the recipe economy donors.
  const KNOWN = new Set(['iron', 'stone', 'fiber', 'quartz', 'steel_ingot', 'mechanical_servo']);
  for (const r of GENERATIONS.slice(1)) {
    for (const k of Object.keys(r.schematic)) assert.ok(KNOWN.has(k), `unknown material ${k}`);
  }
});

test('chunk grid math round-trips on the 6-unit lattice', () => {
  assert.equal(CHUNK, 6);
  assert.deepEqual(chunkToWorld(2, -1), [12, -6]);
  assert.deepEqual(worldToChunk(13.4, -5.2), [2, -1]);
  assert.equal(chunkKey(2, -1), '2,-1');
});

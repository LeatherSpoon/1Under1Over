import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MineDelveSystem } from '../../js/systems/MineDelveSystem.js';

test('recordMined / isMined track depleted cells', () => {
  const d = new MineDelveSystem();
  assert.equal(d.isMined(3, 4), false);
  d.recordMined(3, 4);
  assert.equal(d.isMined(3, 4), true);
});

test('startNewDelve clears mined cells and disarms', () => {
  const d = new MineDelveSystem();
  d.recordMined(3, 4);
  d.arm();
  assert.equal(d.armed, true);
  d.startNewDelve();
  assert.equal(d.isMined(3, 4), false);
  assert.equal(d.armed, false);
});

test('serialize / load round-trips seed and mined cells', () => {
  const d = new MineDelveSystem();
  d.load({ seed: 123, minedCells: ['4,5', '6,7'] });
  assert.equal(d.seed, 123);
  assert.equal(d.isMined(4, 5), true);
  assert.equal(d.isMined(6, 7), true);
  assert.deepEqual(d.serialize(), { seed: 123, minedCells: ['4,5', '6,7'] });
});

test('load resets armed to false', () => {
  const d = new MineDelveSystem();
  d.arm();
  d.load({ seed: 1, minedCells: [] });
  assert.equal(d.armed, false);
});

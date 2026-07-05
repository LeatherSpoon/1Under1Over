import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  setActiveMineMap,
  getActiveMineMap,
  getMineableWallBlocks,
} from '../../js/scene/zones/Mine/layout.js';

test('setActiveMineMap swaps the grid the getters read, then restores', () => {
  const baseline = getActiveMineMap();
  try {
    // A 3x3 grid with a single tier-1 ore block in the centre.
    setActiveMineMap(['   ', ' 1 ', '   ']);
    const blocks = getMineableWallBlocks();
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].cellC, 1);
    assert.equal(blocks[0].cellR, 1);
  } finally {
    setActiveMineMap(baseline);
  }
});

test('baseline active map exposes the original ore blocks', () => {
  const blocks = getMineableWallBlocks();
  assert.ok(blocks.length > 0, 'baseline map should contain ore blocks');
  assert.ok(blocks.every(b => typeof b.cellC === 'number' && typeof b.cellR === 'number'));
});

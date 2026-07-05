import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  setActiveMineMap, getActiveMineMap, setMineMapCell,
  getMineableWallBlocks, getMineableBlockAt, PLAIN_ROCK_PROPS,
} from '../../js/scene/zones/Mine/layout.js';
import { generateMineMap } from '../../js/scene/zones/Mine/generator.js';

function withMap(map, fn) {
  const prev = getActiveMineMap();
  setActiveMineMap(map);
  try { fn(); } finally { setActiveMineMap(prev); }
}

test('only exposed mineable blocks are returned; digging exposes the next layer', () => {
  withMap([
    '     ',
    ' ... ',
    ' 000 ',
    ' 010 ',
    '     ',
  ], () => {
    // Row 2 touches the floor row (incl. diagonals); row 3 is buried.
    const blocks = getMineableWallBlocks();
    assert.deepEqual(
      blocks.map((b) => `${b.cellC},${b.cellR}`).sort(),
      ['1,2', '2,2', '3,2'],
    );
    assert.ok(blocks.every((b) => b.plain && b.props === PLAIN_ROCK_PROPS));

    // Buried cells still resolve as block descriptors for the dig spawner
    const buriedOre = getMineableBlockAt(2, 3);
    assert.ok(buriedOre && !buriedOre.plain, 'buried ore is a real block');
    assert.equal(buriedOre.props.ore, 'copper');

    // Mine out the middle rock: the cell opens and the layer behind is exposed
    setMineMapCell(2, 2, '.');
    assert.equal(getActiveMineMap()[2], ' 0.0 ');
    const after = getMineableWallBlocks().map((b) => `${b.cellC},${b.cellR}`).sort();
    assert.deepEqual(after, ['1,2', '1,3', '2,3', '3,2', '3,3']);
  });
});

test('plain rock props are one-hit stone diggers', () => {
  assert.equal(PLAIN_ROCK_PROPS.ore, null, 'no ore roll from plain rock');
  assert.ok(PLAIN_ROCK_PROPS.plain);
  assert.ok(PLAIN_ROCK_PROPS.duration < 2.0, 'clearing must feel fast');
  assert.ok(PLAIN_ROCK_PROPS.cost <= 5, 'clearing must stay cheap');
});

test('generated maps have no immortal interior rock — only the shell', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const m = generateMineMap(seed);
    for (let r = 0; r < m.length; r++) {
      for (let c = 0; c < m[r].length; c++) {
        const shell = r === 0 || r === m.length - 1 || c === 0 || c === m[r].length - 1;
        if (shell) {
          assert.equal(m[r][c], ' ', `seed ${seed}: shell breached at ${c},${r}`);
        } else {
          assert.notEqual(m[r][c], ' ', `seed ${seed}: immortal interior rock at ${c},${r}`);
        }
      }
    }
  }
});

test('setMineMapCell ignores out-of-bounds writes', () => {
  withMap(['...', '...'], () => {
    setMineMapCell(-1, 0, 'X');
    setMineMapCell(0, 5, 'X');
    setMineMapCell(5, 0, 'X');
    assert.deepEqual(getActiveMineMap(), ['...', '...']);
  });
});

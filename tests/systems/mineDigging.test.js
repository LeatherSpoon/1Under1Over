import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  setActiveMineMap, getActiveMineMap, setMineMapCell,
  getMineableWallBlocks, getMineableBlockAt, PLAIN_ROCK_PROPS,
  getMineFillCells, getMineWallCells,
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

// ── Interior rock-mass fill ──────────────────────────────────────────────────
// Only *exposed* mineable cells become diggable blocks. Without a visual for the
// rest, the mine renders as a one-cell shell standing on open floor — you see
// past a rock face to the floor behind it, and digging looks like it *creates*
// the next rock. getMineFillCells supplies the interior visuals.

// Careful: a block from getMineableBlockAt carries `r` as its *radius*, not its
// row — cell coords live on cellC/cellR there, and on c/r for wall/fill cells.
const blockKey = (b) => `${b.cellC},${b.cellR}`;
const cellKey = (c) => `${c.c},${c.r}`;

test('fill cells and diggable blocks exactly partition the rock mass', () => {
  withMap([
    '       ',
    ' ..... ',
    ' 00000 ',
    ' 01200 ',
    ' 00000 ',
    '       ',
  ], () => {
    const exposed = new Set(getMineableWallBlocks().map(blockKey));
    const fill = new Set(getMineFillCells().map(cellKey));

    // Disjoint — a cell is either diggable or interior fill, never both.
    for (const k of fill) assert.ok(!exposed.has(k), `${k} is both diggable and fill`);

    // Complete — together they cover every mineable cell, so no cell renders nothing.
    const map = getActiveMineMap();
    for (let r = 0; r < map.length; r++) {
      for (let c = 0; c < map[r].length; c++) {
        const ch = map[r][c];
        if (ch !== '0' && !(ch >= '1' && ch <= '5')) continue;
        assert.ok(exposed.has(`${c},${r}`) || fill.has(`${c},${r}`), `${c},${r} renders nothing`);
      }
    }
    // Row 2 touches the open floor row, so it is diggable; rows 3-4 are buried.
    assert.deepEqual([...exposed].sort(), ['1,2', '2,2', '3,2', '4,2', '5,2']);
    assert.deepEqual([...fill].sort(),
      ['1,3', '1,4', '2,3', '2,4', '3,3', '3,4', '4,3', '4,4', '5,3', '5,4']);
  });
});

test('fill cells never overlap the solid cave walls', () => {
  for (let seed = 1; seed <= 10; seed++) {
    withMap(generateMineMap(seed), () => {
      const walls = new Set(getMineWallCells().map(cellKey));
      for (const f of getMineFillCells()) {
        assert.ok(!walls.has(cellKey(f)), `seed ${seed}: ${cellKey(f)} is both fill and solid wall`);
      }
    });
  }
});

test('a fill cell is never reachable — it always has a diggable block between it and the floor', () => {
  // Fill carries no collision, so the player must never be able to touch one.
  // Guaranteed because fill has no open neighbour by construction.
  for (let seed = 1; seed <= 10; seed++) {
    withMap(generateMineMap(seed), () => {
      const map = getActiveMineMap();
      for (const f of getMineFillCells()) {
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (!dr && !dc) continue;
            const row = map[f.r + dr];
            assert.notEqual(row?.[f.c + dc], '.', `seed ${seed}: fill ${cellKey(f)} touches open floor`);
          }
        }
      }
    });
  }
});

test('digging moves a cell from fill to diggable, never leaving a gap', () => {
  withMap([
    '     ',
    ' ... ',
    ' 000 ',
    ' 000 ',
    '     ',
  ], () => {
    assert.ok(getMineFillCells().some(f => f.c === 2 && f.r === 3), 'row 3 starts as fill');
    assert.ok(!getMineableWallBlocks().some(b => b.cellC === 2 && b.cellR === 3));

    setMineMapCell(2, 2, '.'); // mine out the block in front of it

    assert.ok(!getMineFillCells().some(f => f.c === 2 && f.r === 3), 'no longer fill');
    assert.ok(getMineableWallBlocks().some(b => b.cellC === 2 && b.cellR === 3), 'now diggable');
  });
});

test('ore is never buried — the fill swap depends on it', () => {
  // Fill renders a wall piece; an exposed ore cell renders an ORE_PIECES mesh.
  // For a plain-rock cell those are the same mesh (same cellRng roll), so
  // promoting a filler is invisible. An ore cell would visibly change shape at
  // the moment of exposure — and the block that was hiding it is the one just
  // dug out, so nothing would cover the swap. That case never arises only
  // because the generator places ore adjacent to carved floor. If that ever
  // changes, give fill cells their ore piece up front instead of a wall piece.
  for (let seed = 1; seed <= 60; seed++) {
    const map = generateMineMap(seed);
    const at = (c, r) => map[r]?.[c] ?? ' ';
    for (let r = 0; r < map.length; r++) {
      for (let c = 0; c < map[r].length; c++) {
        const ch = at(c, r);
        if (!(ch >= '1' && ch <= '5')) continue;
        let touchesFloor = false;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if ((dr || dc) && at(c + dc, r + dr) === '.') touchesFloor = true;
          }
        }
        assert.ok(touchesFloor, `seed ${seed}: ore at ${c},${r} is buried`);
      }
    }
  }
});

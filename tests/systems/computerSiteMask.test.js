import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isChunkCellValid } from '../../js/scene/zones/ComputerBuilding/siteMask.js';
import { chunkToWorld } from '../../js/systems/computerGenerations.js';

test('occupied ground rejects, open meadow accepts', () => {
  assert.ok(!isChunkCellValid(0, 0), 'landing pad');
  assert.ok(!isChunkCellValid(2, -2), 'the Starwing');
  assert.ok(!isChunkCellValid(-3, -3), 'mountain');
  assert.ok(!isChunkCellValid(3, 3), 'arena');
  assert.ok(!isChunkCellValid(-1, -1), 'pad→adit corridor');
  assert.ok(!isChunkCellValid(7, 0), 'outside the edge margin');
  // Known-open meadow: south of the pad, east of the corridor
  assert.ok(isChunkCellValid(0, 3), 'open meadow south of the pad');
  assert.ok(isChunkCellValid(-3, 3), 'open meadow SW');
});

test('live collision circles veto', () => {
  assert.ok(isChunkCellValid(0, 3));
  assert.ok(!isChunkCellValid(0, 3, [{ x: 1, z: 19, r: 0.6 }]), 'a rock in the cell');
});

test('clearable small flora does not veto; gameplay circles still do', () => {
  // A decorative small tree (tagged clearable at its push site) is cleared by
  // placement instead of vetoing the whole 6×6 chunk.
  assert.ok(isChunkCellValid(0, 3, [{ x: 1, z: 19, r: 0.6, clearable: true }]),
    'clearable tree in the cell does not veto');
  // Untagged (gameplay) circles — resource nodes, drillable rocks — still veto.
  assert.ok(!isChunkCellValid(0, 3, [{ x: 1, z: 19, r: 0.6 }]),
    'non-clearable circle still vetoes');
  // The building's own shell keeps its flag-skip.
  assert.ok(isChunkCellValid(0, 3, [{ x: 1, z: 19, r: 0.6, computer: true }]),
    'computer shell circle still skipped');
});

test('a valid founding cell exists near spawn given clearable flora', () => {
  // Rig-proven pre-fix defect: every small tree vetoed a whole chunk, so no
  // valid cell was on-screen at spawn (ZONE_SPAWN_POS.landingSite = [0, 0])
  // — all valid cells sat ≥19 units away at the meadow rim. With small flora
  // clearable, at least one founding cell's 6×6 square must reach within ~14
  // units of spawn even when the cell hosts a small tree. (Distance is to the
  // square's nearest edge — that is what "visible from spawn" means; centers
  // sit 3+ units further. The nearer meadow stays vetoed by resource-node
  // keep-outs, which are gameplay and must keep vetoing.)
  let best = Infinity;
  for (let cx = -3; cx <= 3; cx++) {
    for (let cz = -3; cz <= 3; cz++) {
      const [wx, wz] = chunkToWorld(cx, cz);
      if (!isChunkCellValid(cx, cz, [{ x: wx + 1, z: wz + 1, r: 0.6, clearable: true }])) continue;
      const d = Math.hypot(Math.max(Math.abs(wx) - 3, 0), Math.max(Math.abs(wz) - 3, 0));
      if (d < best) best = d;
    }
  }
  assert.ok(best <= 14, `nearest valid founding square edge ${best} > 14 units from spawn`);
});

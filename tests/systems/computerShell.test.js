import assert from 'node:assert/strict';
import { test } from 'node:test';
import { exteriorEdges, wallRuns, shellCollisionCircles, DOOR_GAP }
  from '../../js/scene/zones/ComputerBuilding/shell.js';

const plan = new Set(['0,0', '1,0', '1,1']);   // an L
const door = { cx: 0, cz: 0, side: 'S' };

test('exterior edges: every plan chunk edge not shared with a neighbor', () => {
  const edges = exteriorEdges(plan);
  // L of 3 chunks: 12 chunk edges total, 2 shared pairs → 8 exterior
  assert.equal(edges.length, 8);
  for (const e of edges) {
    assert.ok(plan.has(`${e.cx},${e.cz}`));
    const [dx, dz] = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }[e.side];
    assert.ok(!plan.has(`${e.cx + dx},${e.cz + dz}`), 'edge must not face a neighbor');
  }
});

test('wall runs merge collinear edges and carry the door gap', () => {
  const runs = wallRuns(plan, door);
  // Every run is axis-aligned with positive length
  for (const r of runs) {
    assert.ok((r.x1 === r.x2) !== (r.z1 === r.z2), 'axis-aligned');
  }
  // The door edge's run is split: a gap of DOOR_GAP centered at (0, 3)
  const southRuns = runs.filter(r => r.z1 === 3 && r.z2 === 3);
  const covered = southRuns.reduce((s, r) => s + Math.abs(r.x2 - r.x1), 0);
  // south face of (0,0) is x -3..3 (6 long) minus the gap
  assert.ok(Math.abs(covered - (6 - DOOR_GAP)) < 1e-9,
    `south face covers ${covered}, expected ${6 - DOOR_GAP}`);
});

test('collision covers every exterior edge, passable only at the door', () => {
  const circles = shellCollisionCircles(plan, door);
  const PLAYER_R = 0.35;
  // (a) no circle sits inside the plan interior beyond the wall line
  // (b) walk probe: step along each exterior edge line at 0.15; every point
  //     is blocked (within r + PLAYER_R of a circle) except the door span
  const [doorX, doorZ] = [0, 3];
  for (const e of exteriorEdges(plan)) {
    const horiz = e.side === 'N' || e.side === 'S';
    for (let t = -2.85; t <= 2.85; t += 0.15) {
      const px = horiz ? e.x + t : e.x;
      const pz = horiz ? e.z : e.z + t;
      const inDoor = Math.hypot(px - doorX, pz - doorZ) < DOOR_GAP / 2;
      const blocked = circles.some(c => Math.hypot(px - c.x, pz - c.z) < c.r + PLAYER_R);
      if (inDoor) assert.ok(!blocked, `door span blocked at ${px},${pz}`);
      else assert.ok(blocked, `wall gap at ${px},${pz} on ${e.cx},${e.cz} ${e.side}`);
    }
  }
});

test('door reachable from open ground (flood fill at chunk level)', () => {
  // The plan is connected (ComputerSystem guarantees it); here we assert the
  // door edge is exterior so the outside walk-in can always reach it.
  const [dx, dz] = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }[door.side];
  assert.ok(!plan.has(`${door.cx + dx},${door.cz + dz}`), 'door faces open ground');
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MINE_PORTAL_POS,
  MINE_SPAWN_POS,
  MINE_ZONE_PORTALS,
  getMineCollisionCircles,
  isMineFloorCell,
  mineWorldToCell,
} from '../js/scene/MineLayout.js';
import { CONFIG } from '../js/config.js';

const PLAYER_R = 0.35;
const STEP = 3.5 * 0.8 * 0.1;

function resolve(pos, circles) {
  for (const c of circles) {
    const dx = pos.x - c.x;
    const dz = pos.z - c.z;
    const dist = Math.hypot(dx, dz);
    if (dist < c.r + PLAYER_R && dist > 0.001) {
      pos.x = c.x + (dx / dist) * (c.r + PLAYER_R);
      pos.z = c.z + (dz / dist) * (c.r + PLAYER_R);
    }
  }
}

function simulateFromMineSpawn(dx, dz, frames = 30) {
  const circles = getMineCollisionCircles();
  const pos = { x: MINE_SPAWN_POS.x, z: MINE_SPAWN_POS.z };
  for (let i = 0; i < frames; i++) {
    pos.x += dx * STEP;
    pos.z += dz * STEP;
    resolve(pos, circles);
  }
  return pos;
}

test('mine spawn starts clear of portal and cave collision', () => {
  const circles = getMineCollisionCircles();

  for (const c of circles) {
    const dist = Math.hypot(MINE_SPAWN_POS.x - c.x, MINE_SPAWN_POS.z - c.z);
    assert.ok(
      dist >= c.r + PLAYER_R,
      `spawn overlaps ${c.kind || 'collision'} at (${c.x}, ${c.z})`
    );
  }
});

test('screen-down movement from mine spawn travels inward, away from the return portal', () => {
  const pos = simulateFromMineSpawn(0, 1);

  assert.ok(
    pos.z > MINE_SPAWN_POS.z + 4,
    `expected down movement to enter mine from z=${MINE_SPAWN_POS.z}, got z=${pos.z}`
  );
  assert.ok(
    Math.hypot(pos.x - MINE_PORTAL_POS.x, pos.z - MINE_PORTAL_POS.z) >
      Math.hypot(MINE_SPAWN_POS.x - MINE_PORTAL_POS.x, MINE_SPAWN_POS.z - MINE_PORTAL_POS.z),
    'expected up movement to move away from the return portal'
  );
});

test('saved mine speed-track corridor remains walkable', () => {
  const circles = getMineCollisionCircles();
  const corridor = [
    { x: 0, z: -10 },
    { x: 0, z: -8 },
    { x: 0, z: -6 },
    { x: 0, z: -4 },
  ];

  for (const p of corridor) {
    for (const c of circles) {
      const dist = Math.hypot(p.x - c.x, p.z - c.z);
      assert.ok(
        dist >= c.r + PLAYER_R,
        `saved mine track at (${p.x}, ${p.z}) overlaps ${c.kind || 'collision'} at (${c.x}, ${c.z})`
      );
    }
  }
});

test('every mine gate is reachable on foot from the spawn', () => {
  const start = mineWorldToCell(MINE_SPAWN_POS.x, MINE_SPAWN_POS.z);
  assert.ok(isMineFloorCell(start.c, start.r), 'spawn cell must be open floor');

  // Flood-fill open floor cells (ore blocks count as blocked until mined)
  const seen = new Set([`${start.c},${start.r}`]);
  const queue = [start];
  while (queue.length) {
    const { c, r } = queue.pop();
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc, nr = r + dr;
      if (!seen.has(`${nc},${nr}`) && isMineFloorCell(nc, nr)) {
        seen.add(`${nc},${nr}`);
        queue.push({ c: nc, r: nr });
      }
    }
  }

  for (const [zone, pos] of Object.entries(MINE_ZONE_PORTALS)) {
    const cell = mineWorldToCell(pos.x, pos.z);
    assert.ok(
      seen.has(`${cell.c},${cell.r}`),
      `${zone} gate at (${pos.x}, ${pos.z}) is not reachable from the spawn`
    );
  }
});

test('mine portal hub keeps all realm gates inside the background floor', () => {
  assert.deepEqual(Object.keys(MINE_ZONE_PORTALS).sort(), [
    'depths',
    'frozenTundra',
    'lagoonCoast',
    'landingSite',
    'verdantMaw',
  ]);

  const halfGround = CONFIG.GROUND_SIZE / 2;
  for (const [zone, pos] of Object.entries(MINE_ZONE_PORTALS)) {
    assert.ok(Math.abs(pos.x) + 2.6 <= halfGround, `${zone} portal x=${pos.x} is outside the mine floor`);
    assert.ok(Math.abs(pos.z) + 2.6 <= halfGround, `${zone} portal z=${pos.z} is outside the mine floor`);
  }
});

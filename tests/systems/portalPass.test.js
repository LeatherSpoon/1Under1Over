import test from 'node:test';
import assert from 'node:assert/strict';
import { updatePortalPass, APERTURE_HALF_W, ARM_DIST } from '../../js/scene/portalPass.js';

// Walk a path through the pass detector at a fixed step, returning how many
// times it fired. Steps are 0.3 — an endgame-speed frame is smaller, but a
// coarser stride only makes the test stricter (fewer samples to arm on).
function walk(portal, points, step = 0.3) {
  let fires = 0;
  let [x, z] = points[0];
  for (let i = 1; i < points.length; i++) {
    const [tx, tz] = points[i];
    while (Math.hypot(tx - x, tz - z) > 1e-9) {
      const d = Math.hypot(tx - x, tz - z);
      const t = Math.min(1, step / d);
      const nx = x + (tx - x) * t;
      const nz = z + (tz - z) * t;
      if (updatePortalPass(portal, nx, nz, x, z)) fires++;
      x = nx; z = nz;
    }
  }
  return fires;
}

function gate(x = 0, z = 0, scale = 1) {
  return { position: { x, z }, scale, _armSide: 0 };
}

test('a straight walk through the gate fires exactly once', () => {
  const p = gate(0, -18);
  assert.equal(walk(p, [[0, -15], [0, -21]]), 1);
});

test('walking through and back fires once per traversal', () => {
  const p = gate(0, -18);
  assert.equal(walk(p, [[0, -15], [0, -21], [0, -15]]), 2);
});

test('strolling ALONG the gate row never fires (Breach gallery)', () => {
  // East-west stroll across all five Breach gates' x positions at the gallery
  // row's z, with a little weave that stays shy of the arm distance.
  const gates = [-19.2, -9.6, 0, 9.6, 19.2].map(gx => gate(gx, 28.8));
  let fires = 0;
  for (const g of gates) {
    fires += walk(g, [
      [-22, 28.8], [-10, 29.1], [0, 28.5], [10, 29.1], [22, 28.6],
      [10, 28.9], [-22, 28.8],
    ]);
  }
  assert.equal(fires, 0);
});

test('weaving inside the aperture band without committing does not fire', () => {
  const p = gate(0, 0);
  // Hover around the plane at |dz| < ARM_DIST the whole time.
  const wobble = [];
  for (let i = 0; i < 40; i++) {
    wobble.push([((i % 3) - 1) * 0.5, ((i % 2) ? 1 : -1) * (ARM_DIST - 0.1)]);
  }
  assert.equal(walk(p, wobble), 0);
});

test('crossing outside the aperture does not fire', () => {
  const p = gate(0, 0);
  assert.equal(walk(p, [[APERTURE_HALF_W + 0.4, 3], [APERTURE_HALF_W + 0.4, -3]]), 0);
});

test('leaving the band mid-crossing disarms', () => {
  const p = gate(0, 0);
  // Approach and arm, slide out sideways, come back on the SAME side, then
  // retreat — never a committed traversal.
  assert.equal(walk(p, [[0, 1.2], [0, 0.1], [3, 0.1], [0, 0.6], [0, 2]]), 0);
});

test('a teleport across the plane does not fire', () => {
  const p = gate(0, 0);
  // Arm from the south...
  walk(p, [[0, 2], [0, 0.6]]);
  // ...then a single-frame jump far past the gate (rescue drone, doorstep spawn)
  assert.equal(updatePortalPass(p, 0, -5, 0, 0.6), false);
});

test('scaled-down indoor gates scale the aperture band', () => {
  const p = gate(0, 0, 0.8);
  assert.equal(walk(p, [[APERTURE_HALF_W * 0.8 + 0.2, 3], [APERTURE_HALF_W * 0.8 + 0.2, -3]]), 0);
  const q = gate(0, 0, 0.8);
  assert.equal(walk(q, [[0, 3], [0, -3]]), 1);
});

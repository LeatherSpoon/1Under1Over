import assert from 'node:assert/strict';
import { test } from 'node:test';
import { STEP_UP, resolveHeight } from '../../js/scene/walkableSurfaces.js';
import {
  SURFACES, SHELF_1, SHELF_2, SHELF_3,
  RAMPS_1, RAMPS_2, RAMPS_3, RIFT_DESCENT, BRIDGES,
  BRIDGE_RIFT_S, BRIDGE_RIFT_N, BRIDGE_WEST,
  RIFT_MAIN, RIFT_WEST, ASCENT_ROUTE,
  Y_SHELF_1, Y_SHELF_2, Y_SHELF_3, Z_SHELF_1, Z_SHELF_2, Z_SHELF_3,
  ICE_ARCH, OVERLOOK_MOUTH, GALLERY_MOUTH,
} from '../../js/scene/zones/FrozenTundra/glacier.js';

// A fast player (~17-18 u/s at the 30 fps headless tick) covers 0.6 units per
// frame. Every invariant below is checked at that stride, not at a leisurely
// sample rate — the canopy shipped twice with geometry that walked fine slowly
// and hard-blocked at speed.
const STRIDE = 0.6;

function walk(points, y0) {
  let y = y0, maxStep = 0;
  for (const [x, z] of points) {
    const h = resolveHeight(SURFACES, x, z, y);
    assert.notEqual(h, null, `stride break at (${x.toFixed(2)}, ${z.toFixed(2)}) from y ${y.toFixed(2)}`);
    maxStep = Math.max(maxStep, Math.abs(h - y));
    y = h;
  }
  return { y, maxStep };
}

/** Sample a straight line at 0.6-unit strides, inclusive of both ends. */
function strides(x0, z0, x1, z1) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.max(1, Math.ceil(len / STRIDE));
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push([x0 + (x1 - x0) * (i / n), z0 + (z1 - z0) * (i / n)]);
  return pts;
}

// ── The load-bearing engine constraint ───────────────────────────────────────

test('nothing below ground is reachable — this is why the glacier is raised', () => {
  // If a rift floor were modelled as a surface at negative y, the player could
  // never stand on it: ground(0) is always a candidate and 'highest within
  // step' would pin them to 0 forever. The rift floors here ARE ground.
  const sunken = [{ kind: 'rect', minX: -5, maxX: 5, minZ: -5, maxZ: 5, y: -4 }];
  assert.equal(resolveHeight(sunken, 0, 0, 0), 0, 'a sunken surface must never win');
  // And there is no chain of legal moves down to it: ground is the only height
  // on offer, so every step resolves back to 0 however long the player walks.
  let y = 0;
  for (let i = 0; i < 50; i++) y = resolveHeight(sunken, 0, 0, y);
  assert.equal(y, 0, 'a sunken surface stays unreachable no matter how far you walk');
  // Correspondingly, every surface this zone registers is at or above 0.
  for (const s of SURFACES) {
    const ys = s.kind === 'ramp' ? [s.y0, s.y1] : [s.y];
    for (const y of ys) assert.ok(y >= 0, `surface at y ${y} would be unreachable`);
  }
});

// ── Shelves block like walls ─────────────────────────────────────────────────

test('shelf gaps are far larger than STEP_UP, so edges block instead of tunnelling', () => {
  assert.ok(Y_SHELF_1 - 0 > STEP_UP * 2);
  assert.ok(Y_SHELF_2 - Y_SHELF_1 > STEP_UP * 2);
  assert.ok(Y_SHELF_3 - Y_SHELF_2 > STEP_UP * 2);
});

test('walking off a shelf edge onto open ground is refused', () => {
  // Mid-shelf-1, one stride south of its southern rim, off any ramp.
  const offRamp = 0; // x 0 is between the −6 and +14 approach ramps
  assert.equal(resolveHeight(SURFACES, offRamp, Z_SHELF_1.s + 1, Y_SHELF_1), null,
    'shelf 1 rim should be a wall where no ramp meets it');
  // Stepping into the Blue Rift from the middle shelf's east rim.
  assert.equal(resolveHeight(SURFACES, RIFT_MAIN.minX + 1, -44, Y_SHELF_2), null,
    'the rift should be a wall away from the descent ramp');
});

test('shelf bands abut — no dead seam between consecutive shelves', () => {
  assert.equal(Z_SHELF_1.n, Z_SHELF_2.s);
  assert.equal(Z_SHELF_2.n, Z_SHELF_3.s);
});

// ── Every ramp is walkable at endgame speed, both directions ─────────────────

test('every ramp strides continuously up AND down', () => {
  const all = [...RAMPS_1, ...RAMPS_2, ...RAMPS_3, RIFT_DESCENT];
  for (const r of all) {
    const len = Math.hypot(r.x1 - r.x0, r.z1 - r.z0);
    const grade = Math.abs(r.y1 - r.y0) / len;
    assert.ok(grade < 0.75, `ramp grade ${grade.toFixed(2)} too steep`);
    for (const dir of [1, -1]) {
      const [sx, sz, sy, ex, ez] = dir === 1
        ? [r.x0, r.z0, r.y0, r.x1, r.z1]
        : [r.x1, r.z1, r.y1, r.x0, r.z0];
      const { maxStep } = walk(strides(sx, sz, ex, ez), sy);
      assert.ok(maxStep <= STEP_UP,
        `ramp at x ${r.x0} dir ${dir}: seam ${maxStep.toFixed(3)} exceeds STEP_UP`);
    }
  }
});

test('no ramp covers the Mine Hub portal apron at (0, −18)', () => {
  // The portal and its return beacon sit on the flat; a ramp through them
  // would strand the player above the portal trigger.
  for (const r of RAMPS_1) {
    const coversX = Math.abs(0 - r.x0) <= r.halfW;
    const coversZ = -18 <= Math.max(r.z0, r.z1) && -18 >= Math.min(r.z0, r.z1);
    assert.ok(!(coversX && coversZ), `approach ramp at x ${r.x0} runs over the portal`);
  }
  assert.equal(resolveHeight(SURFACES, 0, -18, 0), 0, 'portal apron must resolve flat');
});

// ── Bridges ──────────────────────────────────────────────────────────────────

test('bridges are flat and overlap both banks', () => {
  for (const b of BRIDGES) {
    assert.equal(b.kind, 'rect');
    const rift = b === BRIDGE_WEST ? RIFT_WEST : RIFT_MAIN;
    assert.ok(b.minX < rift.minX, 'bridge must overlap its west bank');
    assert.ok(b.maxX > rift.maxX, 'bridge must overlap its east bank');
  }
});

test('every bridge crossing strides continuously bank to bank', () => {
  const crossings = [
    [BRIDGE_RIFT_S, Y_SHELF_3, -52],
    [BRIDGE_RIFT_N, Y_SHELF_3, -57],
    [BRIDGE_WEST, Y_SHELF_1, -23],
  ];
  for (const [b, y, z] of crossings) {
    for (const dir of [1, -1]) {
      const [sx, ex] = dir === 1 ? [b.minX - 2, b.maxX + 2] : [b.maxX + 2, b.minX - 2];
      const { maxStep } = walk(strides(sx, z, ex, z), y);
      assert.ok(maxStep <= STEP_UP, `bridge at z ${z} dir ${dir}: seam ${maxStep.toFixed(3)}`);
    }
  }
});

test('the rift descent bottoms out clear of both spans overhead', () => {
  // A bridge within STEP_UP of the descending ramp would snap the player up
  // onto it. The ramp ends at z −48; both spans start at −51 or further north.
  assert.ok(RIFT_DESCENT.z1 > BRIDGE_RIFT_S.maxZ,
    'descent ramp must finish south of the first span');
  for (const b of [BRIDGE_RIFT_S, BRIDGE_RIFT_N]) {
    for (let z = b.minZ; z <= b.maxZ; z += 0.5) {
      const h = resolveHeight(SURFACES, 7, z, 0);
      assert.equal(h, 0, `walking the rift floor at z ${z} should stay at 0, got ${h}`);
    }
  }
});

// ── The full ascent ──────────────────────────────────────────────────────────

test('the ascent walks seam-free from the portal apron to the ice arch', () => {
  const pts = [];
  for (let i = 0; i < ASCENT_ROUTE.length - 1; i++) {
    const [x0, z0] = ASCENT_ROUTE[i], [x1, z1] = ASCENT_ROUTE[i + 1];
    pts.push(...strides(x0, z0, x1, z1));
  }
  const { y, maxStep } = walk(pts, 0);
  assert.ok(maxStep <= STEP_UP, `largest ascent seam ${maxStep.toFixed(3)}`);
  assert.ok(Math.abs(y - Y_SHELF_3) < 0.01, `ascent should end on the arch plaza, got ${y.toFixed(2)}`);
});

test('the ascent is also walkable in reverse', () => {
  const pts = [];
  const rev = [...ASCENT_ROUTE].reverse();
  for (let i = 0; i < rev.length - 1; i++) {
    const [x0, z0] = rev[i], [x1, z1] = rev[i + 1];
    pts.push(...strides(x0, z0, x1, z1));
  }
  const { y, maxStep } = walk(pts, Y_SHELF_3);
  assert.ok(maxStep <= STEP_UP, `largest descent seam ${maxStep.toFixed(3)}`);
  assert.ok(Math.abs(y) < 0.01, `descent should end on the flat, got ${y.toFixed(2)}`);
});

// ── Landmarks sit where the player can actually reach them ───────────────────

test('the arch, the overlook mouth and the gallery mouth are all standable', () => {
  for (const [name, m] of [['ice arch', ICE_ARCH], ['overlook', OVERLOOK_MOUTH], ['gallery', GALLERY_MOUTH]]) {
    const h = resolveHeight(SURFACES, m.x, m.z, m.y);
    assert.notEqual(h, null, `${name} is not standable`);
    assert.ok(Math.abs(h - m.y) < 0.01, `${name} resolves ${h}, expected ${m.y}`);
  }
});

test('the gallery mouth is on the rift floor, reachable by walking down the descent', () => {
  const pts = [
    ...strides(RIFT_DESCENT.x0, RIFT_DESCENT.z0, RIFT_DESCENT.x1, RIFT_DESCENT.z1),
    ...strides(RIFT_DESCENT.x1, RIFT_DESCENT.z1, GALLERY_MOUTH.x, GALLERY_MOUTH.z),
  ];
  const { y } = walk(pts, Y_SHELF_2);
  assert.ok(Math.abs(y - GALLERY_MOUTH.y) < 0.01, `rift walk ended at ${y.toFixed(2)}`);
});

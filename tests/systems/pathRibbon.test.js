import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildPathStripData } from '../../js/scene/pathStrip.js';

// The pure geometry side of PathRibbon (js/scene/PathRibbon.js) — the path
// system that replaced the retired circle-patch trails. The three.js wrapper
// is thin; everything load-bearing (sampling, taper, ground blend, stones)
// lives in buildPathStripData and is exercised here.

const GROUND = [0.1, 0.2, 0.25];
const COLOR = [0.4, 0.5, 0.55];
const STONE = [0.5, 0.6, 0.65];
const POINTS = [[0, -12], [0, -8], [1, -4], [1.5, 0]];

const worn = () => buildPathStripData(POINTS, {
  seed: 7, width: 2.4, color: COLOR, groundColor: GROUND,
});

test('path strip is well-formed and deterministic per seed', () => {
  const a = worn();
  const b = worn();
  assert.deepEqual(a.positions, b.positions, 'same seed must rebuild identical geometry');
  assert.equal(a.positions.length % 3, 0);
  assert.equal(a.colors.length, a.positions.length, 'one RGB per vertex');
  assert.equal(a.indices.length % 3, 0);
  const vcount = a.positions.length / 3;
  for (const i of a.indices) {
    assert.ok(i >= 0 && i < vcount, `index ${i} out of range`);
  }
  for (const v of a.positions) assert.ok(Number.isFinite(v), 'no NaN positions');
  for (const v of a.colors) assert.ok(Number.isFinite(v), 'no NaN colors');
});

test('ribbon edges blend to exactly the ground color (seamless, opaque)', () => {
  const a = worn();
  // Rows are 4 vertices across; columns 0 and 3 are the edges.
  const rows = a.positions.length / 3 / 4;
  assert.ok(Number.isInteger(rows), 'worn ribbon is rows of 4 vertices');
  for (let r = 0; r < rows; r++) {
    for (const c of [0, 3]) {
      const o = (r * 4 + c) * 3;
      assert.deepEqual(a.colors.slice(o, o + 3), GROUND,
        `edge vertex row ${r} col ${c} must equal groundColor`);
    }
  }
});

test('tips taper: end rows are narrow and near the ground color', () => {
  const a = worn();
  const rowW = (r) => {
    const o = r * 4 * 3;
    const e = (r * 4 + 3) * 3;
    return Math.hypot(a.positions[e] - a.positions[o], a.positions[e + 2] - a.positions[o + 2]);
  };
  const rows = a.positions.length / 3 / 4;
  const midW = rowW(Math.floor(rows / 2));
  assert.ok(rowW(0) < midW * 0.55, 'start row much narrower than mid');
  assert.ok(rowW(rows - 1) < midW * 0.55, 'end row much narrower than mid');
  // Inner color at the very tip has fully faded into the ground
  const innerTip = a.colors.slice(3, 6);
  for (let i = 0; i < 3; i++) {
    assert.ok(Math.abs(innerTip[i] - GROUND[i]) < 0.02, 'tip inner color ~ ground');
  }
});

test('paved mode adds flagstone quads above the bedding strip', () => {
  const bare = worn();
  const paved = buildPathStripData(POINTS, {
    seed: 7, width: 2.4, color: COLOR, groundColor: GROUND, stoneColor: STONE,
  });
  assert.ok(paved.positions.length > bare.positions.length, 'stones add vertices');
  assert.equal((paved.positions.length - bare.positions.length) % (4 * 3), 0,
    'stones are quads (4 verts each)');
  // Stones ride slightly above the ribbon y
  const ys = [];
  for (let i = bare.positions.length; i < paved.positions.length; i += 3) {
    ys.push(paved.positions[i + 1]);
  }
  assert.ok(ys.length > 0 && ys.every((v) => v > 0.017), 'stone verts sit above the ribbon');
});

test('every triangle faces up (+Y) — a downward winding backface-culls the path', () => {
  for (const stoneColor of [null, STONE]) {
    const d = buildPathStripData(POINTS, {
      seed: 7, width: 2.4, color: COLOR, groundColor: GROUND, stoneColor,
    });
    for (let t = 0; t < d.indices.length; t += 3) {
      const [i0, i1, i2] = [d.indices[t], d.indices[t + 1], d.indices[t + 2]];
      const ax = d.positions[i0 * 3], az = d.positions[i0 * 3 + 2];
      const bx = d.positions[i1 * 3], bz = d.positions[i1 * 3 + 2];
      const cx = d.positions[i2 * 3], cz = d.positions[i2 * 3 + 2];
      // y-component of (b-a) x (c-a): positive => normal points +Y
      const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
      assert.ok(ny > -1e-9, `triangle ${t / 3} winds downward (stones=${!!stoneColor})`);
    }
  }
});

test('rejects degenerate input', () => {
  assert.throws(() => buildPathStripData([[0, 0]], { color: COLOR, groundColor: GROUND }));
});

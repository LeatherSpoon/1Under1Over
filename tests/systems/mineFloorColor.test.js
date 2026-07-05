import assert from 'node:assert/strict';
import { test } from 'node:test';
import { floorColorAt, FLOOR_RAMPS } from '../../js/scene/zones/Mine/floorColor.js';

test('floor color field is deterministic and in range', () => {
  for (const [x, z] of [[0, 0], [-38, -38], [38, 38], [1.6, -28.8], [0.001, 14.4]]) {
    const a = floorColorAt(x, z);
    const b = floorColorAt(x, z);
    assert.deepEqual(a, b);
    for (const ch of a) assert.ok(ch > 0 && ch <= 1, `channel ${ch} out of range at ${x},${z}`);
  }
});

test('floor color is continuous across cell boundaries and region bands', () => {
  // Sweep across several cell edges (x = ±1.6, ±4.8 …) and through the
  // cavern→passage boundary (z ≈ 14.4). No step may exceed a smooth delta.
  const EPS = 0.02, STEP = 0.01;
  for (let x = -8; x < 8; x += STEP) {
    const a = floorColorAt(x, -2), b = floorColorAt(x + STEP, -2);
    for (let i = 0; i < 3; i++) {
      assert.ok(Math.abs(a[i] - b[i]) < EPS, `x-discontinuity at x=${x.toFixed(2)}`);
    }
  }
  for (let z = 8; z < 22; z += STEP) {
    const a = floorColorAt(3, z), b = floorColorAt(3, z + STEP);
    for (let i = 0; i < 3; i++) {
      assert.ok(Math.abs(a[i] - b[i]) < EPS, `z-discontinuity at z=${z.toFixed(2)}`);
    }
  }
});

test('regions read differently: breach is violet, entrance is warm', () => {
  // Average many samples deep inside each band (away from blend zones).
  const avg = (z) => {
    const sum = [0, 0, 0];
    for (let x = -10; x <= 10; x += 0.7) {
      const c = floorColorAt(x, z);
      for (let i = 0; i < 3; i++) sum[i] += c[i];
    }
    return sum;
  };
  const entrance = avg(-32); // rows 0-4
  const breach = avg(33.6);  // rows 20-24
  assert.ok(entrance[0] > entrance[2] * 1.5, 'entrance should be warm (r >> b)');
  assert.ok(breach[2] > breach[1], 'breach should be violet (b > g)');
});

test('the field actually varies (no flat monotone floor)', () => {
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < 200; i++) {
    const c = floorColorAt(-12 + (i % 20) * 1.3, -10 + Math.floor(i / 20) * 1.1);
    min = Math.min(min, c[0]);
    max = Math.max(max, c[0]);
  }
  assert.ok(max - min > 0.02, `expected tonal variation, got ${max - min}`);
});

test('every region has a dark→mid→light ramp', () => {
  for (const [region, ramp] of Object.entries(FLOOR_RAMPS)) {
    assert.equal(ramp.length, 3, `${region} ramp needs 3 tones`);
    const lum = ramp.map((h) => ((h >> 16) & 255) + ((h >> 8) & 255) + (h & 255));
    assert.ok(lum[0] < lum[1] && lum[1] < lum[2], `${region} ramp must brighten`);
  }
});

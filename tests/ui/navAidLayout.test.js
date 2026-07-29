import assert from 'node:assert/strict';
import { test } from 'node:test';
import { layoutIndicators, MAX_INDICATORS, EDGE_MARGIN } from '../../js/ui/navAidLayout.js';

// The pure screen math behind the off-screen landmark nav aid (js/ui/NavAid.js
// is a thin projection wrapper around this). The three.js side isn't reachable
// from Node, so everything load-bearing is exercised here.

const W = 1000, H = 800;
const target = (over) => ({ id: 'a', label: 'Gate', kind: 'portal', distance: 10, ndcX: 0, ndcY: 0, ...over });
const layout = (list) => layoutIndicators(list, W, H);

test('on-screen landmarks get no chip; off-screen ones do', () => {
  const items = layout([
    target({ id: 'inside', ndcX: 0.5, ndcY: -0.9 }),
    target({ id: 'edge', ndcX: 1, ndcY: 1 }),          // exactly on the boundary
    target({ id: 'outside', ndcX: 1.4, ndcY: 0.2 }),
  ]);
  assert.deepEqual(items.map(i => i.id), ['outside']);
});

// The regression that shipped: distant landmarks project *behind* the camera's
// near plane (the camera is 14 up / 13.5 back, so anything past ~25 units ahead
// in +z lands at ndc z < -1). The layout must not care about depth at all — an
// earlier ndc-z clip made the aid blind at exactly its intended range.
test('depth is irrelevant — a behind-near-plane landmark still gets a chip', () => {
  // The real numbers measured for the Mine's Atlantis gate at 65 units.
  const items = layout([target({ id: 'atlantis', ndcX: -0.91, ndcY: -4.61, ndcZ: -1.25 })]);
  assert.equal(items.length, 1, 'a valid bearing must produce a chip regardless of depth');
  assert.equal(items[0].id, 'atlantis');
});

test('chips pin to the nearer edge and stay inside the viewport', () => {
  // Far below and slightly left → binds on y, so it pins to the bottom edge.
  const [below] = layout([target({ ndcX: -0.91, ndcY: -4.61 })]);
  assert.equal(below.edge, 'y');
  assert.ok(below.y > H / 2 && below.y <= H, `bottom edge, got y=${below.y}`);
  // EDGE_MARGIN insets the binding axis exactly.
  assert.ok(Math.abs(below.y - (1 - (-EDGE_MARGIN * 0.5 + 0.5)) * H) < 1e-6);

  // Far right, mildly high → binds on x, pins to the right edge.
  const [right] = layout([target({ ndcX: 6, ndcY: 0.4 })]);
  assert.equal(right.edge, 'x');
  assert.ok(Math.abs(right.x - (EDGE_MARGIN * 0.5 + 0.5) * W) < 1e-6);

  for (const ndc of [[5, 5], [-5, 5], [-5, -5], [5, -5], [0, -9], [-9, 0]]) {
    const [c] = layout([target({ ndcX: ndc[0], ndcY: ndc[1] })]);
    assert.ok(c.x >= 0 && c.x <= W && c.y >= 0 && c.y <= H, `${ndc} → ${c.x},${c.y}`);
  }
});

test('angle is the true pre-clamp bearing in screen space (y-down)', () => {
  const deg = (ndcX, ndcY) => layout([target({ ndcX, ndcY })])[0].angleDeg;
  assert.ok(Math.abs(deg(3, 0) - 0) < 1e-9, 'due right → 0°');
  assert.ok(Math.abs(deg(0, -3) - 90) < 1e-9, 'below → +90° (screen y grows downward)');
  assert.ok(Math.abs(deg(0, 3) + 90) < 1e-9, 'above → -90°');
  assert.ok(Math.abs(Math.abs(deg(-3, 0)) - 180) < 1e-9, 'due left → ±180°');
  // Clamping to the edge must not bend the arrow: the bearing comes from the
  // raw ndc, so two targets on the same ray share an angle despite different
  // clamped positions.
  assert.ok(Math.abs(deg(2, -4) - deg(4, -8)) < 1e-9);
});

test('sorted nearest-first and capped', () => {
  const many = [];
  for (let i = 0; i < MAX_INDICATORS + 4; i++) {
    many.push(target({ id: `t${i}`, ndcX: 2, ndcY: -3, distance: 100 - i }));
  }
  const items = layout(many);
  assert.equal(items.length, MAX_INDICATORS);
  assert.deepEqual(items.map(i => i.distance), [91, 92, 93, 94, 95, 96]);
});

test('passes through the fields the renderer styles on', () => {
  const [c] = layout([target({ kind: 'boss', locked: true, ndcX: 3, ndcY: 0, label: 'X' })]);
  assert.equal(c.kind, 'boss');
  assert.equal(c.locked, true);
  assert.equal(c.label, 'X');
  // locked defaults to a real boolean so the renderer's class logic is safe.
  const [d] = layout([target({ ndcX: 3, ndcY: 0 })]);
  assert.equal(d.locked, false);
});

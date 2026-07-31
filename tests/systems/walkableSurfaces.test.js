import assert from 'node:assert/strict';
import { test } from 'node:test';
import { STEP_UP, surfaceHeightsAt, resolveHeight } from '../../js/scene/walkableSurfaces.js';
import {
  HELIX, JUNCTION, BRIDGE_A, PAD_BOUGH, BRIDGE_B, PAD_ALTAR, SURFACES,
  LOOP_BRIDGES, EXPANSE_BRIDGES, SPIRE_BRIDGES, SPIRE_HELIXES, SPIRE,
  RIVERS, riverZAt, RIVER_CHAIN, RIVER_XJ, TERMINUS, GROUND_CIRCLES,
  EMBER_TREE, GLADE_ARCHES, ARCH_FEET, GROTTO_TRAIL, SKY_ISLES,
} from '../../js/scene/zones/VerdantMaw/canopy.js';
import { getZoneBounds } from '../../js/config.js';
import {
  KNOLL_HELIX, KNOLL_LEDGE, KNOLL_SURFACES,
} from '../../js/scene/zones/LandingSite/knoll.js';

// ── Surface primitives ────────────────────────────────────────────────────────

test('disc: inside yields its height, outside yields nothing', () => {
  const d = { kind: 'disc', x: 5, z: -3, r: 2, y: 4 };
  assert.deepEqual(surfaceHeightsAt(d, 5, -3), [4]);
  assert.deepEqual(surfaceHeightsAt(d, 6.9, -3), [4]);
  assert.deepEqual(surfaceHeightsAt(d, 7.2, -3), []);
});

test('rect: axis-aligned containment', () => {
  const r = { kind: 'rect', minX: 0, maxX: 4, minZ: -2, maxZ: 2, y: 3 };
  assert.deepEqual(surfaceHeightsAt(r, 2, 0), [3]);
  assert.deepEqual(surfaceHeightsAt(r, 4.1, 0), []);
});

test('ramp: height is linear along the segment, clamped at the ends', () => {
  const r = { kind: 'ramp', x0: 0, z0: 0, y0: 0, x1: 10, z1: 0, y1: 5, halfW: 1 };
  assert.deepEqual(surfaceHeightsAt(r, 0, 0), [0]);
  assert.deepEqual(surfaceHeightsAt(r, 5, 0.5), [2.5]);
  assert.deepEqual(surfaceHeightsAt(r, 10, 0), [5]);
  // Slight overshoot past the end still lands on the clamped end height (seam forgiveness)
  assert.deepEqual(surfaceHeightsAt(r, 10.3, 0), [5]);
  // Off the side
  assert.deepEqual(surfaceHeightsAt(r, 5, 1.4), []);
});

test('helix: a multi-turn point yields one height per pass overhead', () => {
  // Two full turns, y 0 → 8: any point on the band has exactly two heights 4 apart.
  const h = { kind: 'helix', cx: 0, cz: 0, rMid: 3, halfW: 1, th0: 0, th1: 4 * Math.PI, y0: 0, y1: 8 };
  const hs = surfaceHeightsAt(h, 3, 0.01); // just past th=0 so both turns are in range
  assert.equal(hs.length, 3, 'th≈0, 2π and 4π all pass over this point');
  assert.deepEqual(surfaceHeightsAt(h, -3, 0).length, 2, 'th≈π and 3π');
  assert.deepEqual(surfaceHeightsAt(h, 5, 0), [], 'off the band radially');
});

test('resolveHeight picks the candidate nearest the current height', () => {
  const h = { kind: 'helix', cx: 0, cz: 0, rMid: 3, halfW: 1, th0: 0, th1: 4 * Math.PI, y0: 0, y1: 8 };
  const low = resolveHeight([h], -3, 0, 2.1);  // th=π pass ≈ y 2
  const high = resolveHeight([h], -3, 0, 5.8); // th=3π pass ≈ y 6
  assert.ok(Math.abs(low - 2) < 0.05, `expected ≈2, got ${low}`);
  assert.ok(Math.abs(high - 6) < 0.05, `expected ≈6, got ${high}`);
});

test('resolveHeight blocks moves with no reachable surface (platform edges)', () => {
  const pad = { kind: 'disc', x: 0, z: 0, r: 3, y: 6 };
  // Standing on the pad, stepping past the rim: ground(0) is 6 away — blocked.
  assert.equal(resolveHeight([pad], 3.4, 0, 6), null);
  // Standing on the ground under the pad: ground is right there.
  assert.equal(resolveHeight([pad], 0, 0, 0), 0);
  // Standing on the pad well inside: stays at 6.
  assert.equal(resolveHeight([pad], 1, 0, 6), 6);
});

// ── The authored Maw ascent — walk the whole route at 5 cm steps ─────────────

function helixPoint(th) {
  return [HELIX.cx + HELIX.rMid * Math.cos(th), HELIX.cz + HELIX.rMid * Math.sin(th)];
}

/** Sample a straight segment at ~5 cm spacing (inclusive of both ends). */
function lineSamples(x0, z0, x1, z1) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.max(2, Math.ceil(len / 0.05));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push([x0 + t * (x1 - x0), z0 + t * (z1 - z0)]);
  }
  return pts;
}

test('the Hometree ascent is seam-free from jungle floor to Sky Altar', () => {
  const route = [];
  // Ground approach → helix start (south face)
  const [sx, sz] = helixPoint(HELIX.th0);
  route.push(...lineSamples(sx, sz + 1.5, sx, sz));
  // Up the helix along its midline
  for (let th = HELIX.th0; th <= HELIX.th1; th += 0.012) route.push(helixPoint(th));
  // Helix exit → junction → across bridge A → Bough center
  const [ex, ez] = helixPoint(HELIX.th1);
  route.push(...lineSamples(ex, ez, JUNCTION.x, JUNCTION.z));
  route.push(...lineSamples(JUNCTION.x, JUNCTION.z, BRIDGE_A.x0, BRIDGE_A.z0));
  route.push(...lineSamples(BRIDGE_A.x0, BRIDGE_A.z0, BRIDGE_A.x1, BRIDGE_A.z1));
  route.push(...lineSamples(BRIDGE_A.x1, BRIDGE_A.z1, PAD_BOUGH.x, PAD_BOUGH.z));
  // Bough → bridge B → Sky Altar center
  route.push(...lineSamples(PAD_BOUGH.x, PAD_BOUGH.z, BRIDGE_B.x0, BRIDGE_B.z0));
  route.push(...lineSamples(BRIDGE_B.x0, BRIDGE_B.z0, BRIDGE_B.x1, BRIDGE_B.z1));
  route.push(...lineSamples(BRIDGE_B.x1, BRIDGE_B.z1, PAD_ALTAR.x, PAD_ALTAR.z));

  let y = 0;
  let maxStep = 0;
  for (const [x, z] of route) {
    const h = resolveHeight(SURFACES, x, z, y);
    assert.notEqual(h, null, `route breaks at (${x.toFixed(2)}, ${z.toFixed(2)}) from y ${y.toFixed(2)}`);
    maxStep = Math.max(maxStep, Math.abs(h - y));
    y = h;
  }
  assert.ok(maxStep <= STEP_UP, `largest seam ${maxStep.toFixed(3)} exceeds STEP_UP`);
  assert.ok(Math.abs(y - PAD_ALTAR.y) < 0.01, `route should end on the Sky Altar, ended at y ${y.toFixed(2)}`);
});

test('the Sky Altar rim blocks — no walking off the summit into air', () => {
  // Step radially outward past the rim from summit height, several directions.
  // Directions where another surface (a bridge mouth) legitimately adjoins the
  // rim are excused; everywhere else must be a hard edge.
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 7) {
    const x = PAD_ALTAR.x + Math.cos(a) * (PAD_ALTAR.r + 0.5);
    const z = PAD_ALTAR.z + Math.sin(a) * (PAD_ALTAR.r + 0.5);
    const adjoining = SURFACES.some(s => s !== PAD_ALTAR &&
      surfaceHeightsAt(s, x, z).some(h => Math.abs(h - PAD_ALTAR.y) <= STEP_UP));
    if (adjoining) continue;
    assert.equal(resolveHeight(SURFACES, x, z, PAD_ALTAR.y), null,
      `rim leak at angle ${a.toFixed(2)}`);
  }
});

test('ground under the canopy stays ground — no teleporting up through pads', () => {
  assert.equal(resolveHeight(SURFACES, PAD_BOUGH.x, PAD_BOUGH.z, 0), 0);
  assert.equal(resolveHeight(SURFACES, PAD_ALTAR.x, PAD_ALTAR.z, 0), 0);
});

test('the grand loop is seam-free — Sky Altar around the whole zone to the junction', () => {
  // Walk every loop bridge center-to-center through its endpoints.
  let y = PAD_ALTAR.y;
  let maxStep = 0;
  for (const br of LOOP_BRIDGES) {
    const legs = [
      ...lineSamples(br.x0, br.z0, br.x1, br.z1),
    ];
    for (const [x, z] of legs) {
      const h = resolveHeight(SURFACES, x, z, y);
      assert.notEqual(h, null, `loop breaks at (${x.toFixed(2)}, ${z.toFixed(2)}) from y ${y.toFixed(2)}`);
      maxStep = Math.max(maxStep, Math.abs(h - y));
      y = h;
    }
  }
  assert.ok(maxStep <= STEP_UP, `largest loop seam ${maxStep.toFixed(3)}`);
  // The walk order chains the main loop (Altar → … → junction) and then the
  // North Reach arc (junction → Kapok Rise → apex → Fern Shelf → Altar), so
  // a continuous walk of every link ends back on the Sky Altar.
  assert.ok(Math.abs(y - PAD_ALTAR.y) < 0.01, `loop should end at the Sky Altar, got ${y.toFixed(2)}`);
});

test('every bridge is traversable at ENDGAME speed — 0.6-unit strides never break', () => {
  // The invariant that actually matters is per-frame, not per-slope: a fast
  // player (~18 u/s at the 30 fps headless tick) moves 0.6 units per frame,
  // and every stride along a bridge must land within STEP_UP of the last.
  // (The original Bough↔Altar bridge failed exactly this at its mouths —
  // gentle grade, but a cliff notch at the rim crossing.)
  const STRIDE = 0.6;
  for (const br of [BRIDGE_A, BRIDGE_B, ...LOOP_BRIDGES, ...EXPANSE_BRIDGES, ...SPIRE_BRIDGES]) {
    const len = Math.hypot(br.x1 - br.x0, br.z1 - br.z0);
    const grade = Math.abs(br.y1 - br.y0) / len;
    assert.ok(grade < 0.75, `bridge grade ${grade.toFixed(2)} too steep even for a clamber`);
    // Both ends must resolve at their own heights (overlap a pad)
    assert.notEqual(resolveHeight(SURFACES, br.x0, br.z0, br.y0), null);
    assert.notEqual(resolveHeight(SURFACES, br.x1, br.z1, br.y1), null);
    // Stride the crossing both ways, starting a stride before each mouth so
    // the pad→bridge rim transition is part of the walk.
    for (const dir of [1, -1]) {
      const [sx, sz, sy, ex, ez] = dir === 1
        ? [br.x0, br.z0, br.y0, br.x1, br.z1] : [br.x1, br.z1, br.y1, br.x0, br.z0];
      const ux = (ex - sx) / len, uz = (ez - sz) / len;
      let y = sy;
      for (let d = -STRIDE; d <= len + STRIDE; d += STRIDE) {
        const h = resolveHeight(SURFACES, sx + ux * d, sz + uz * d, y);
        if (h === null && (d < 0 || d > len)) continue; // stride landed past the far pad edge
        assert.notEqual(h, null,
          `stride break at d=${d.toFixed(1)} on bridge (${br.x0.toFixed(1)},${br.z0.toFixed(1)})→(${br.x1.toFixed(1)},${br.z1.toFixed(1)}) dir ${dir}`);
        y = h;
      }
    }
  }
});

// ── The River Expanse — four crossings, four spires, one terminus ────────────

test('the expanse walks seam-free from the North Reach apex to Riversend Crown', () => {
  // EXPANSE_BRIDGES is the main chain in walk order; walking every bridge's
  // span in sequence is continuous by construction.
  let y = 6.8; // PAD_NORTH.y — the chain starts at the apex
  let maxStep = 0;
  for (const br of EXPANSE_BRIDGES) {
    for (const [x, z] of lineSamples(br.x0, br.z0, br.x1, br.z1)) {
      const h = resolveHeight(SURFACES, x, z, y);
      assert.notEqual(h, null, `expanse breaks at (${x.toFixed(2)}, ${z.toFixed(2)}) from y ${y.toFixed(2)}`);
      maxStep = Math.max(maxStep, Math.abs(h - y));
      y = h;
    }
  }
  assert.ok(maxStep <= STEP_UP, `largest expanse seam ${maxStep.toFixed(3)}`);
  assert.ok(Math.abs(y - TERMINUS.y) < 0.01, `should end on Riversend Crown, got ${y.toFixed(2)}`);
});

test('every Root Spire climbs seam-free from its foot to its crown', () => {
  for (const H of SPIRE_HELIXES) {
    const route = [];
    const [sx, sz] = [H.cx + H.rMid * Math.cos(H.th0), H.cz + H.rMid * Math.sin(H.th0)];
    route.push(...lineSamples(sx, sz + 1.4, sx, sz));
    for (let th = H.th0; th <= H.th1; th += 0.012) {
      route.push([H.cx + H.rMid * Math.cos(th), H.cz + H.rMid * Math.sin(th)]);
    }
    route.push(...lineSamples(H.cx + H.rMid * Math.cos(H.th1), H.cz + H.rMid * Math.sin(H.th1), H.cx, H.cz));
    let y = 0;
    for (const [x, z] of route) {
      const h = resolveHeight(SURFACES, x, z, y);
      assert.notEqual(h, null, `spire (${H.cx},${H.cz}) breaks at (${x.toFixed(2)}, ${z.toFixed(2)}) from y ${y.toFixed(2)}`);
      assert.ok(Math.abs(h - y) <= STEP_UP);
      y = h;
    }
    assert.ok(Math.abs(y - SPIRE.topY) < 0.01, `spire should end on its crown, got ${y.toFixed(2)}`);
  }
});

test('the snake river is not navigable — gap-free chain, every pocket stays bridge-only', () => {
  // 1. ONE continuous barrier chain rides the serpentine: r 2.6 circles at
  // spacing ≤ 2.55 (the barrier is never narrower than ~2.27 from the
  // centerline), widening to 3.3 through the flank bends so the on-plane
  // apexes (river refine 2026-07-30 — tails and bends now end ON the ground
  // plane instead of floating over the void) still seal the ±39 clamp strip.
  assert.ok(RIVER_CHAIN.length >= 130, `chain has only ${RIVER_CHAIN.length} circles`);
  for (const c of RIVER_CHAIN) {
    assert.ok(c.r >= 2.6 - 1e-9 && c.r <= 3.3 + 1e-9, `chain r ${c.r} out of range`);
    if (Math.abs(c.x) >= 36) assert.ok(c.r >= 3.29, `bend circle at x ${c.x.toFixed(1)} too small to seal`);
  }
  for (let i = 1; i < RIVER_CHAIN.length; i++) {
    const a = RIVER_CHAIN[i - 1], b = RIVER_CHAIN[i];
    assert.ok(Math.hypot(a.x - b.x, a.z - b.z) <= 2.55,
      `gap in the chain near (${a.x.toFixed(1)}, ${a.z.toFixed(1)})`);
  }
  // Tails end at the plane edge (x 40); the chain's last circle sits within
  // one step of the tip, and its widened radius covers the clamp-side strip.
  assert.ok(RIVER_CHAIN[0].x >= 39.4 && RIVER_CHAIN[RIVER_CHAIN.length - 1].x >= 39.4,
    'both tail chains must reach the plane edge');

  // 2. The four corridor crossings still lie exactly on their authored sine
  // courses — pads, bridges and bank keep-outs were all built against them.
  for (const river of RIVERS) {
    for (let x = -RIVER_XJ; x <= RIVER_XJ; x += 2) {
      const z = riverZAt(river, x);
      const d = Math.min(...RIVER_CHAIN.map(c => Math.hypot(c.x - x, c.z - z)));
      assert.ok(d <= 1.3, `crossing at band ${river.z} drifts off the course at x ${x}`);
    }
  }

  // 3. Topology — the real guarantee, independent of the river's shape: BFS
  // the playable ground grid with the river chain as the only obstacle. The
  // south (portal side) must not reach any band pocket, the Riversend bank,
  // or the Emberglade approach — the hairpin bends must seal the flanks
  // exactly as the old full-width rivers did. Ground routes into the pockets
  // exist only via canopy bridges + spires (the seam/stride tests walk those).
  const minX = -39, maxX = 39, minZ = -105, maxZ = 39;
  const W = maxX - minX + 1, H = maxZ - minZ + 1;
  const idx = (x, z) => (x - minX) * H + (z - minZ);
  const open = new Uint8Array(W * H).fill(1);
  for (const c of RIVER_CHAIN) {
    const rr = c.r + 0.35; // barrier + player radius
    for (let x = Math.max(minX, Math.ceil(c.x - rr)); x <= Math.min(maxX, Math.floor(c.x + rr)); x++) {
      for (let z = Math.max(minZ, Math.ceil(c.z - rr)); z <= Math.min(maxZ, Math.floor(c.z + rr)); z++) {
        if (Math.hypot(x - c.x, z - c.z) <= rr) open[idx(x, z)] = 0;
      }
    }
  }
  const seen = new Uint8Array(W * H);
  const queue = [[0, 14]]; // the zone spawn
  seen[idx(0, 14)] = 1;
  while (queue.length) {
    const [x, z] = queue.pop();
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      if (nx < minX || nx > maxX || nz < minZ || nz > maxZ) continue;
      const k = idx(nx, nz);
      if (!open[k] || seen[k]) continue;
      seen[k] = 1;
      queue.push([nx, nz]);
    }
  }
  assert.ok(seen[idx(0, -30)], 'south bank of crossing 1 belongs to the main zone');
  for (const [px, pz, what] of [
    [0, -46, 'band 1 pocket'], [0, -62, 'band 2 pocket'], [0, -79, 'band 3 pocket'],
    [-14, -92, 'the Riversend bank'], [0, -101, 'the Emberglade approach'],
  ]) {
    assert.ok(!seen[idx(px, pz)], `${what} is reachable by ground — the river leaks`);
  }

  // And every main-chain crossing clears the water from the canopy: the
  // bridge over each crossing sits at 6.7+ the whole way.
  for (const br of EXPANSE_BRIDGES) {
    assert.ok(Math.min(br.y0, br.y1) > 5, 'expanse bridges stay canopy-high over the water');
  }
});

test('the Emberglade is reachable — grotto trail clears every circle, gateway straddles it', () => {
  const PLAYER_R = 0.35;
  // Walk the authored trail at 0.25-unit steps; no ground circle (river
  // chains, spire trunks, arch piers, the tree itself) may block the walk-in.
  const samples = [];
  for (let i = 1; i < GROTTO_TRAIL.length; i++) {
    const [ax, az] = GROTTO_TRAIL[i - 1], [bx, bz] = GROTTO_TRAIL[i];
    const L = Math.hypot(bx - ax, bz - az), n = Math.ceil(L / 0.25);
    for (let k = 0; k <= n; k++) samples.push([ax + (bx - ax) * k / n, az + (bz - az) * k / n]);
  }
  for (const [x, z] of samples) {
    for (const c of GROUND_CIRCLES) {
      const d = Math.hypot(x - c.x, z - c.z);
      assert.ok(d > c.r + PLAYER_R,
        `trail blocked at (${x.toFixed(1)},${z.toFixed(1)}) by circle (${c.x.toFixed(1)},${c.z.toFixed(1)} r${c.r})`);
    }
  }
  // The gateway arch's two piers stand on OPPOSITE sides of the trail (the
  // player walks UNDER the arch, not around it) with a person-wide clear gap.
  const [fa, fb] = ARCH_FEET.slice(0, 2);
  const gap = Math.hypot(fa.x - fb.x, fa.z - fb.z) - fa.r - fb.r;
  assert.ok(gap >= 2 * (PLAYER_R + 0.3), `gateway gap ${gap.toFixed(2)} too narrow`);
  const seg = GROTTO_TRAIL.map(([x, z], i, a) => i ? [a[i - 1], [x, z]] : null).filter(Boolean)
    .reduce((best, [[ax, az], [bx, bz]]) => {
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      const d = Math.hypot(mx - (fa.x + fb.x) / 2, mz - (fa.z + fb.z) / 2);
      return d < best.d ? { d, ax, az, bx, bz } : best;
    }, { d: Infinity });
  const side = (px, pz) => Math.sign((seg.bx - seg.ax) * (pz - seg.az) - (seg.bz - seg.az) * (px - seg.ax));
  assert.ok(side(fa.x, fa.z) !== side(fb.x, fb.z), 'gateway piers must straddle the trail');
  // Sanctum shape: arches ring the tree at a respectful distance; the tree
  // stands past the gateway; sky-isles are airborne visuals only.
  for (const f of ARCH_FEET) {
    assert.ok(Math.hypot(f.x - EMBER_TREE.x, f.z - EMBER_TREE.z) > 4,
      'no arch pier crowds the Lantern Tree');
  }
  assert.ok(EMBER_TREE.z < GLADE_ARCHES[0].z - 10, 'the tree stands deep past the gateway');
  for (const isle of SKY_ISLES) assert.ok(isle.y >= 9, 'sky-isles never enter the walk space');
  // Everything the scene needs sits inside the (enlarged) zone bounds.
  const b = getZoneBounds('verdantMaw');
  for (const [x, z] of [...GROTTO_TRAIL, [EMBER_TREE.x, EMBER_TREE.z],
                        ...ARCH_FEET.map(f => [f.x, f.z]), ...SKY_ISLES.map(i => [i.x, i.z])]) {
    assert.ok(x > b.minX + 1 && x < b.maxX - 1 && z > b.minZ + 1 && z < b.maxZ - 1,
      `grotto element (${x},${z}) outside zone bounds`);
  }
});

// ── The Landing Site lookout knoll — same discipline, second zone ────────────

test('the lookout knoll climbs seam-free from meadow to summit ledge', () => {
  const H = KNOLL_HELIX;
  const route = [];
  const [sx, sz] = [H.cx + H.rMid * Math.cos(H.th0), H.cz + H.rMid * Math.sin(H.th0)];
  route.push(...lineSamples(sx, sz + 1.2, sx, sz));
  for (let th = H.th0; th <= H.th1; th += 0.012) {
    route.push([H.cx + H.rMid * Math.cos(th), H.cz + H.rMid * Math.sin(th)]);
  }
  const [ex, ez] = [H.cx + H.rMid * Math.cos(H.th1), H.cz + H.rMid * Math.sin(H.th1)];
  route.push(...lineSamples(ex, ez, KNOLL_LEDGE.x, KNOLL_LEDGE.z));

  let y = 0;
  for (const [x, z] of route) {
    const h = resolveHeight(KNOLL_SURFACES, x, z, y);
    assert.notEqual(h, null, `knoll route breaks at (${x.toFixed(2)}, ${z.toFixed(2)}) from y ${y.toFixed(2)}`);
    assert.ok(Math.abs(h - y) <= STEP_UP);
    y = h;
  }
  assert.ok(Math.abs(y - KNOLL_LEDGE.y) < 0.01, `should end on the ledge, got ${y.toFixed(2)}`);
});

test('the knoll ledge rim blocks except where the shelf exits', () => {
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 9) {
    const x = KNOLL_LEDGE.x + Math.cos(a) * (KNOLL_LEDGE.r + 0.45);
    const z = KNOLL_LEDGE.z + Math.sin(a) * (KNOLL_LEDGE.r + 0.45);
    const h = resolveHeight(KNOLL_SURFACES, x, z, KNOLL_LEDGE.y);
    // The step ramp leaves the rim on the east — reachable heights there are fine.
    if (h !== null) {
      assert.ok(Math.abs(h - KNOLL_LEDGE.y) <= STEP_UP, `leak at angle ${a.toFixed(2)} to y ${h}`);
      continue;
    }
  }
});

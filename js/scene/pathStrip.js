/**
 * pathStrip.js — the PURE geometry side of PathRibbon (no three.js import,
 * so tests run it headlessly — same split as Mine/floorColor.js). The mesh
 * wrapper lives in PathRibbon.js.
 */

/** mulberry32 — module-local copy (Environment's is not exported). */
function seededRandom(seed) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cr(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t
    + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
    + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

function smoothstep(t) { return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t); }

function mix3(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/**
 * Pure geometry builder.
 * @param points [[x,z], ...] centerline waypoints (>= 2)
 * @param opts {
 *   seed, width, y, samplesPerSeg,
 *   color: [r,g,b],        // path albedo (linear)
 *   groundColor: [r,g,b],  // zone ground albedo — edges blend to EXACTLY this
 *   wobble, widthJitter, taperFrac,
 *   stoneColor: [r,g,b]|null, stoneLen, stoneGap, stoneY,
 * }
 * @returns { positions: number[], colors: number[], indices: number[] }
 */
export function buildPathStripData(points, {
  seed = 1, width = 2.2, y = 0.017, samplesPerSeg = 6,
  color, groundColor, wobble = 0.3, widthJitter = 0.22, taperFrac = 0.14,
  strength = 1, // scales how far the inner ribbon pulls toward `color` — raise on bright ground (snow) where the default wear washes out
  stoneColor = null, stoneLen = 1.05, stoneGap = 0.16, stoneY = 0.007,
  // Water look: a luminous centerline band inside the body color (rivers).
  // null keeps the classic 4-column ribbon byte-identical; set → 7 columns
  // with the middle pair blending body → coreColor, meandering per-row.
  coreColor = null, coreFrac = 0.34,
} = {}) {
  if (!points || points.length < 2) throw new Error('PathRibbon needs >= 2 points');
  const rng = seededRandom(seed);

  // Smooth value noise over normalized arc position u (cosine-interpolated
  // seeded tables) — same u always samples the same value, so the path is
  // deterministic per seed.
  const NOISE_N = 32;
  const mkTab = () => Array.from({ length: NOISE_N }, () => (rng() - 0.5) * 2);
  const wobTab = mkTab(), widTab = mkTab(), wearTab = mkTab();
  const noise = (tab, u, freq) => {
    const p = ((u * freq) % 1 + 1) % 1 * NOISE_N;
    const i0 = Math.floor(p) % NOISE_N, i1 = (i0 + 1) % NOISE_N;
    const f = (1 - Math.cos((p - Math.floor(p)) * Math.PI)) / 2;
    return tab[i0] * (1 - f) + tab[i1] * f;
  };

  // Resample the polyline with Catmull-Rom
  const at = (i) => points[Math.max(0, Math.min(points.length - 1, i))];
  const samples = [];
  for (let i = 0; i < points.length - 1; i++) {
    for (let j = 0; j < samplesPerSeg; j++) {
      const t = j / samplesPerSeg;
      samples.push({
        x: cr(at(i - 1)[0], at(i)[0], at(i + 1)[0], at(i + 2)[0], t),
        z: cr(at(i - 1)[1], at(i)[1], at(i + 1)[1], at(i + 2)[1], t),
      });
    }
  }
  samples.push({ x: at(points.length - 1)[0], z: at(points.length - 1)[1] });

  // Arc length, tangents, normals
  let total = 0;
  const arc = [0];
  for (let i = 1; i < samples.length; i++) {
    total += Math.hypot(samples[i].x - samples[i - 1].x, samples[i].z - samples[i - 1].z);
    arc.push(total);
  }
  const rows = [];
  for (let i = 0; i < samples.length; i++) {
    const a = samples[Math.max(0, i - 1)], b = samples[Math.min(samples.length - 1, i + 1)];
    let tx = b.x - a.x, tz = b.z - a.z;
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl; tz /= tl;
    const u = arc[i] / (total || 1);
    const taper = smoothstep(Math.min(u, 1 - u) / taperFrac);       // 0 at tips → 1 mid
    const halfW = (width / 2) * (1 + widthJitter * noise(widTab, u, 5)) * (0.3 + 0.7 * taper);
    const cx = samples[i].x + (-tz) * wobble * noise(wobTab, u, 3) * taper;
    const cz = samples[i].z + tx * wobble * noise(wobTab, u, 3) * taper;
    const wear = (0.55 + 0.3 * noise(wearTab, u, 4)) * strength * taper; // fades out at tips
    rows.push({ cx, cz, nx: -tz, nz: tx, tx, tz, halfW, u, taper, inner: mix3(groundColor, color, Math.max(0, Math.min(1, wear))) });
  }

  const positions = [], colors = [], indices = [];
  const COLS = coreColor ? [-1, -0.55, -coreFrac, 0, coreFrac, 0.55, 1] : [-1, -0.45, 0.45, 1];
  for (const r of rows) {
    // The luminous core wanders in brightness along the run so the water
    // reads as moving light, not a painted stripe.
    const coreMix = coreColor
      ? Math.max(0, Math.min(1, 0.72 + 0.28 * noise(wearTab, r.u, 7)))
      : 0;
    for (let c = 0; c < COLS.length; c++) {
      positions.push(r.cx + r.nx * COLS[c] * r.halfW, y, r.cz + r.nz * COLS[c] * r.halfW);
      let col;
      if (c === 0 || c === COLS.length - 1) col = groundColor;
      else if (!coreColor) col = r.inner;
      else {
        const a = Math.abs(COLS[c]);
        if (a >= 0.55 - 1e-6) col = r.inner;                       // body band
        else if (a >= coreFrac - 1e-6) col = mix3(r.inner, coreColor, 0.55 * coreMix); // core edge
        else col = mix3(r.inner, coreColor, coreMix);              // center line
      }
      colors.push(col[0], col[1], col[2]);
    }
  }
  // Winding: (tangent, side-normal) is a LEFT-handed pair on the XZ plane, so
  // triangles must wind col-then-row to face +Y — the other order backface-culls
  // the whole ribbon from the game camera.
  const W = COLS.length;
  for (let i = 0; i < rows.length - 1; i++) {
    const a = i * W, b = (i + 1) * W;
    for (let c = 0; c < W - 1; c++) {
      indices.push(a + c, a + c + 1, b + c, a + c + 1, b + c + 1, b + c);
    }
  }

  // Flagstones — staggered irregular quads riding the centerline, skipped in
  // the taper zones so paved paths still fade out at their ends.
  if (stoneColor) {
    let next = stoneLen * 0.6;
    let parity = 0;
    for (let i = 1; i < rows.length; i++) {
      if (arc[i] < next) continue;
      next = arc[i] + stoneLen + stoneGap;
      const r = rows[i];
      if (r.taper < 0.75) { parity ^= 1; continue; }
      const spans = parity === 0
        ? [[-0.92, -0.06], [0.06, 0.92]]   // two stones, center seam
        : [[-0.6, 0.6]];                    // one wide stone (staggered joints)
      parity ^= 1;
      for (const [s0, s1] of spans) {
        const jit = () => (rng() - 0.5) * 0.18;
        const halfL = (stoneLen / 2) * (0.92 + rng() * 0.16);
        const bright = 0.88 + rng() * 0.24;
        const base = index => 0.95 + 0.1 * rng() + index * 0; // per-corner variance
        const corners = [
          [-halfL + jit() * stoneLen, (s0 + jit() * 0.2) * r.halfW],
          [-halfL + jit() * stoneLen, (s1 + jit() * 0.2) * r.halfW],
          [halfL + jit() * stoneLen, (s1 + jit() * 0.2) * r.halfW],
          [halfL + jit() * stoneLen, (s0 + jit() * 0.2) * r.halfW],
        ];
        const vi = positions.length / 3;
        for (let k = 0; k < 4; k++) {
          const [along, side] = corners[k];
          positions.push(
            r.cx + r.tx * along + r.nx * side, y + stoneY,
            r.cz + r.tz * along + r.nz * side
          );
          const v = bright * base(k);
          colors.push(stoneColor[0] * v, stoneColor[1] * v, stoneColor[2] * v);
        }
        indices.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
      }
    }
  }

  return { positions, colors, indices };
}


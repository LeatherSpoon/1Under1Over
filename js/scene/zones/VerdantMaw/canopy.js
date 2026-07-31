/**
 * The Verdant Maw's canopy network — pure geometry constants (no three.js, so
 * tests can walk every route headlessly). The zone builder places the GLBs
 * and registers these surfaces; tests/systems/walkableSurfaces.test.js samples
 * the full loop at 5 cm steps and fails if any seam gaps past STEP_UP.
 *
 * The ascent: ground (south face of the Hometree, camera side) → helical ramp
 * 1.25 turns around the trunk → junction ledge (7.2) → the Gathering Bough
 * (6.6, canopy nodes) → the Sky Altar (8.2, Spirit Tree). From the Altar the
 * GRAND LOOP runs on: West Bough (7.4) → Hamlet Overlook (6.8) → Mid-Jungle
 * Bough (6.2) → Idol Watch (6.9) → East Rise (7.6) → Banyan Step (7.0) →
 * back to the junction — a full circuit of the zone in the treetops.
 *
 * Bridges are COMPUTED between pad rims (0.6 inset each side) so adding a pad
 * + a link line is all it takes to grow the network. Spans ≤ 5 use the short
 * bridge GLB (native length 4), longer spans the long one (native 8).
 *
 * Blender mirror: Assets/3D/VerdantMaw/build_canopy.py hardcodes the Hometree
 * helix numbers — change them here and regenerate, or the visible ramp and
 * the walkable ramp drift apart.
 */

// Hometree trunk — the giant the helix wraps. Circle-collides at ground level
// only; above that, the helix band's inner edge is the guardrail.
export const HOMETREE = { x: 13, z: -19, trunkR: 3.2 };

// Helical ramp: SOUTH-WEST face at ground (th0 3π/4 — it began at the south
// face π/2, but every natural approach comes out of the zone's heart to the
// south-west, and the owner's flow note said the entrance belongs on that
// line), 1.125 turns counter-clockwise up the trunk, exiting on the west
// face (th1 unchanged, so the junction ledge never moved). Grade ≈ 0.25.
// Walkable halfW is deliberately a little narrower than the visual ledge
// (2.6..5.35) but wide enough that descending doesn't fight the rim (0.95
// shipped first and felt like a wall on the way down; edge-following in
// main.js is the other half of that fix).
export const HELIX = {
  kind: 'helix',
  cx: 13, cz: -19,
  rMid: 4.15, halfW: 1.08,
  th0: Math.PI * 0.75,
  th1: Math.PI / 2 + 2.5 * Math.PI,
  y0: 0, y1: 7.2,
};

// ── Pads ─────────────────────────────────────────────────────────────────────
export const JUNCTION = { kind: 'disc', x: 7.5, z: -19, r: 2.0, y: 7.2 };
export const PAD_BOUGH = { kind: 'disc', x: 1.5, z: -17, r: 4.0, y: 6.6 };   // the Gathering Bough
// The Sky Altar — still the crown of the network (East Rise is 7.6), but
// 8.2 at (-6.5,-19.5) put 1.6 of height across a 2.2 gap from the Bough:
// no bridge shape survives that at endgame move speed (the stride test
// proves it). 7.8 a little further west gives the crossing 2.9 of run.
export const PAD_ALTAR = { kind: 'disc', x: -7.2, z: -19.8, r: 3.4, y: 7.8 };
// The grand loop
export const PAD_WEST = { kind: 'disc', x: -13, z: -14, r: 3.6, y: 7.4 };    // West Bough
export const PAD_OVERLOOK = { kind: 'disc', x: -16.5, z: -2, r: 3.4, y: 6.8 }; // Hamlet Overlook
export const PAD_MID = { kind: 'disc', x: -6, z: 2.2, r: 3.8, y: 6.2 };      // Mid-Jungle Bough
export const PAD_IDOL = { kind: 'disc', x: 6, z: 5, r: 3.4, y: 6.9 };        // Idol Watch
export const PAD_EAST = { kind: 'disc', x: 13, z: 0, r: 3.6, y: 7.6 };       // East Rise
export const PAD_BANYAN = { kind: 'disc', x: 16, z: -9, r: 3.3, y: 7.0 };    // Banyan Step
// The North Reach — the corridor's second arc (owner request): from the
// junction out over the empty northern jungle and back to the Sky Altar.
export const PAD_NE = { kind: 'disc', x: 4, z: -28.5, r: 3.5, y: 7.4 };      // Kapok Rise
export const PAD_NORTH = { kind: 'disc', x: -4.5, z: -32, r: 3.4, y: 6.8 };  // North Reach (apex blossom)
export const PAD_NW = { kind: 'disc', x: -13.5, z: -28, r: 3.6, y: 7.3 };    // Fern Shelf

// The Great Tree rises mid-arc and is deliberately UNCONNECTED to the canopy
// level — no pad, no bridge, no surface touches it (owner: "a tree that does
// not attach to the second level"). The walkways circle a giant that ignores
// them. Ground trunk collision only; its crown clears every span by ≥ 1.4.
export const GREAT_TREE = { x: -3.8, z: -27, r: 1.5 };

const PADS = [JUNCTION, PAD_BOUGH, PAD_ALTAR, PAD_WEST, PAD_OVERLOOK, PAD_MID, PAD_IDOL, PAD_EAST, PAD_BANYAN,
              PAD_NE, PAD_NORTH, PAD_NW];

// ── Bridges ──────────────────────────────────────────────────────────────────
// A link [a, b, halfW?] becomes a ramp from a's rim toward b's rim (0.6 inset
// inside each rim so seams always overlap the pads).
function bridgeBetween(a, b, halfW = 0.9) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const len = Math.hypot(dx, dz);
  const ux = dx / len, uz = dz / len;
  const ia = a.r - 0.6, ib = b.r - 0.6;
  return {
    kind: 'ramp',
    x0: a.x + ux * ia, z0: a.z + uz * ia, y0: a.y,
    x1: b.x - ux * ib, z1: b.z - uz * ib, y1: b.y,
    halfW,
  };
}

// Junction↔Bough↔Altar — rim-anchored like the loop bridges. These were
// originally hand-authored with endpoints DEEP inside the pads to keep the
// grades gentle; that put the bridge ~0.5 below pad level at the rim
// crossing, and a fast player's single frame jumped past the rim to a spot
// more than STEP_UP below them — hard-stuck at every mouth. Rim anchoring
// plus the Altar's height/position tune (see PAD_ALTAR) keeps every stride
// continuous; the stride test in walkableSurfaces.test.js is the guardian.
export const BRIDGE_A = bridgeBetween(JUNCTION, PAD_BOUGH, 0.9);
export const BRIDGE_B = bridgeBetween(PAD_BOUGH, PAD_ALTAR, 0.85);

// The loop links, in ONE continuous walk order (the seam test walks them in
// sequence): Sky Altar around the main loop to the junction, then out the
// North Reach arc — junction → Kapok Rise → apex → Fern Shelf — and home to
// the Sky Altar.
const LOOP_LINKS = [
  [PAD_ALTAR, PAD_WEST],
  [PAD_WEST, PAD_OVERLOOK],
  [PAD_OVERLOOK, PAD_MID],
  [PAD_MID, PAD_IDOL],
  [PAD_IDOL, PAD_EAST],
  [PAD_EAST, PAD_BANYAN],
  [PAD_BANYAN, JUNCTION],
  [JUNCTION, PAD_NE],
  [PAD_NE, PAD_NORTH],
  [PAD_NORTH, PAD_NW],
  [PAD_NW, PAD_ALTAR],
];
export const LOOP_BRIDGES = LOOP_LINKS.map(([a, b]) => bridgeBetween(a, b));

// ── The River Expanse — the corridor continues north over ONE snaking river ──
// (owner request 2026-07-27: corridor → river crossing → ramp + corridor on
// the far side, repeated three more times; owner request 2026-07-29: "Instead
// of multiple rivers, make it a snakey river.") Each band's UNCROSSABLE
// crossing keeps its original sine course through the corridor, but the four
// courses are now one continuous serpentine — see RIVER_PATH below. Per band:
// the crossing, a crossing pad, a second pad, and a Root Spire: a climbable
// mini-trunk (helix ramp, mossy crown platform) so every far bank keeps its
// own ground access. The chain ends on Riversend Crown.
const disc = (x, z, r, y) => ({ kind: 'disc', x, z, r, y });

// Root Spire walkable numbers — MIRRORED by Assets/3D/VerdantMaw/build_spire.py.
// Spire placements must keep rotY 0 / scale 1.0: the visual ledge is baked to
// a south-facing foot (th0 π/2), exactly like the Hometree convention.
// v2 (owner: "challenging going down those tree ramps"): the band widened
// 0.85 → 1.05 and pushed out (rMid 2.35) — descending a tight curve fights
// the rim exactly as the Hometree once did (its fix was also width), and the
// old walkable outer edge poked 0.05 PAST the visual ledge lip; now the walk
// band sits 0.05 inside the visual on both sides.
export const SPIRE = { rMid: 2.35, halfW: 1.05, topR: 2.3, topY: 7.0 };
const spireHelix = (x, z) => ({ kind: 'helix', cx: x, cz: z, rMid: SPIRE.rMid,
  halfW: SPIRE.halfW, th0: Math.PI / 2, th1: Math.PI / 2 + 2.5 * Math.PI,
  y0: 0, y1: SPIRE.topY });

export const TERMINUS = disc(0, -97, 4.0, 7.5); // Riversend Crown
export const EXPANSE_BANDS = [
  { river: { z: -37.5, amp: 1.9, wave: 0.11, phase: 0.7 },
    pads: [disc(-1, -43, 3.5, 7.2), disc(6, -48, 3.3, 6.7)], spire: [-8.5, -45] },
  { river: { z: -54, amp: 2.2, wave: 0.09, phase: 2.6 },
    pads: [disc(9.5, -59.5, 3.5, 7.3), disc(1, -64, 3.4, 6.8)], spire: [16, -62] },
  { river: { z: -70.5, amp: 2.0, wave: 0.12, phase: 4.4 },
    pads: [disc(-3, -76, 3.5, 7.4), disc(-11, -80.5, 3.3, 6.9)], spire: [4.5, -79] },
  { river: { z: -87, amp: 2.3, wave: 0.10, phase: 1.5 },
    pads: [disc(-7.5, -92.5, 3.5, 7.2), TERMINUS], spire: [-14, -95] },
];
export const RIVERS = EXPANSE_BANDS.map(b => b.river);

/** Crossing centerline z at a given x (the wavy course, shared by visual + collision). */
export const riverZAt = (river, x) => river.z + river.amp * Math.sin(x * river.wave + river.phase);

// ── The snake — the four crossings joined into ONE serpentine river ──────────
// The crossings keep their exact sine courses through the corridor (|x| ≤
// RIVER_XJ, so every pad, bridge, spire and keep-out built against them still
// holds), and hairpin bends in the flank jungle join them tail-to-head:
// in from the eastern jungle across band 1, hairpin west, back east across
// band 2, hairpin east, across band 3, hairpin west, out east past band 4 —
// the player meets the same river four times. Apexes and tails sit ON the
// ground plane (ZONE_BOUNDS x ±40 — the first cut overshot to ±42..46 and
// the lit ribbon floated over the void); the flanks stay sealed because the
// barrier chain WIDENS through the bends (r 2.6 → 3.3 past |x| 28), covering
// the whole clamp-side strip (getPlayerBounds: ±39). Each band pocket stays
// bridge-only — the walkableSurfaces topology test BFS-proves it.
export const RIVER_XJ = 19; // crossing ↔ hairpin handoff |x|
const RIVER_TAIL_X = 40;    // both tails end exactly at the eastern plane edge
const HAIRPINS = [          // hairpin i joins crossing i to crossing i+1
  { side: -1, apexX: -37 },
  { side: 1,  apexX: 37.5 },
  { side: -1, apexX: -37 },
];
/** The whole course as a dense [x, z] polyline (~0.65-unit spacing). */
export const RIVER_PATH = (() => {
  const pts = [];
  const push = (x, z) => {
    const p = pts[pts.length - 1];
    if (!p || Math.hypot(x - p[0], z - p[1]) > 1e-6) pts.push([x, z]);
  };
  const crossing = (r, x0, x1) => {
    const n = Math.max(2, Math.round(Math.abs(x1 - x0) / 0.65));
    for (let i = 0; i <= n; i++) {
      const x = x0 + (x1 - x0) * i / n;
      push(x, riverZAt(r, x));
    }
  };
  // Half-ellipse from (±RIVER_XJ, zA) out to the apex and back to (±RIVER_XJ,
  // zB): tangents at both junctions run along ±x, matching the crossings'
  // near-flat sine ends; θ steps adapt so samples stay ~0.65 apart.
  const hairpin = (h, zA, zB) => {
    const xj = h.side * RIVER_XJ;
    const a = Math.abs(h.apexX - xj), b = (zA - zB) / 2, zm = (zA + zB) / 2;
    for (let th = Math.PI / 2; th < Math.PI * 1.5; ) {
      push(xj - h.side * a * Math.cos(th), zm + b * Math.sin(th));
      th += 0.65 / Math.max(1, Math.hypot(a * Math.sin(th), b * Math.cos(th)));
    }
    push(xj, zB);
  };
  crossing(RIVERS[0], RIVER_TAIL_X, -RIVER_XJ);
  hairpin(HAIRPINS[0], riverZAt(RIVERS[0], -RIVER_XJ), riverZAt(RIVERS[1], -RIVER_XJ));
  crossing(RIVERS[1], -RIVER_XJ, RIVER_XJ);
  hairpin(HAIRPINS[1], riverZAt(RIVERS[1], RIVER_XJ), riverZAt(RIVERS[2], RIVER_XJ));
  crossing(RIVERS[2], RIVER_XJ, -RIVER_XJ);
  hairpin(HAIRPINS[2], riverZAt(RIVERS[2], -RIVER_XJ), riverZAt(RIVERS[3], -RIVER_XJ));
  crossing(RIVERS[3], -RIVER_XJ, RIVER_TAIL_X);
  return pts;
})();
/** Barrier chain — circles at exact 2.35-unit arc steps along the whole
 * course: r 2.6 through the corridor (the water is never narrower than ~2.27
 * from the centerline), widening to 3.3 through the flank bends (|x| past 28)
 * so the on-plane apexes still seal the clamp-side strip (±39). */
const chainR = (x) => {
  const s = Math.min(1, Math.max(0, (Math.abs(x) - 28) / 8));
  return 2.6 + 0.7 * s * s * (3 - 2 * s);
};
export const RIVER_CHAIN = (() => {
  const chain = [{ x: RIVER_PATH[0][0], z: RIVER_PATH[0][1], r: chainR(RIVER_PATH[0][0]) }];
  let acc = 0;
  for (let i = 1; i < RIVER_PATH.length; i++) {
    const [ax, az] = RIVER_PATH[i - 1];
    let [bx, bz] = RIVER_PATH[i];
    let seg = Math.hypot(bx - ax, bz - az), t0 = 0;
    while (acc + (seg - t0) >= 2.35) {
      const t = t0 + (2.35 - acc);
      const f = t / seg;
      const cx = ax + (bx - ax) * f;
      chain.push({ x: cx, z: az + (bz - az) * f, r: chainR(cx) });
      t0 = t; acc = 0;
    }
    acc += seg - t0;
  }
  const last = RIVER_PATH[RIVER_PATH.length - 1];
  if (acc > 0.6) chain.push({ x: last[0], z: last[1], r: chainR(last[0]) });
  return chain;
})();
/** Distance from (x, z) to the river's course (min over the dense polyline —
 * ≤ ~0.02 over the true curve distance). Keep-outs and scatters use this. */
export function riverClearance(x, z) {
  let best = Infinity;
  for (const [px, pz] of RIVER_PATH) {
    const d = Math.hypot(x - px, z - pz);
    if (d < best) best = d;
  }
  return best;
}

export const SPIRE_HELIXES = EXPANSE_BANDS.map(b => spireHelix(...b.spire));
export const SPIRE_TOPS = EXPANSE_BANDS.map(b => disc(b.spire[0], b.spire[1], SPIRE.topR, SPIRE.topY));
export const EXPANSE_PADS = EXPANSE_BANDS.flatMap(b => b.pads);
// Main chain in walk order (the seam test walks it end to end): North Reach
// apex → band 1 → … → Riversend Crown. Every odd bridge is a river crossing.
export const EXPANSE_BRIDGES = (() => {
  const list = [];
  let prev = PAD_NORTH;
  for (const b of EXPANSE_BANDS) {
    for (const p of b.pads) { list.push(bridgeBetween(prev, p)); prev = p; }
  }
  return list;
})();
// Spur bridges: each band's crossing pad ↔ its Root Spire crown.
export const SPIRE_BRIDGES = EXPANSE_BANDS.map((b, i) => bridgeBetween(SPIRE_TOPS[i], b.pads[0]));

// ── The transitional phase — teal → warm golden-green, NORTHWARD ─────────────
// (owner direction 2026-07-27: not a hard cut at the gateway — a gradual
// palette phase inspired by Raya and the Last Dragon / Kumandra, sitting in
// the zone's north.) Pure color math shared by the vertex-colored ground
// (Environment._addGround colorAt) and every ribbon that must blend its
// edges into the LOCAL ground (rivers, grotto trail, ember web). The
// matching fog/light shift is ZONE_AMBIENCE.verdantMaw.zGradient.
const GROUND_STOPS = [
  [-58, 0x1d4636],  // the Maw's teal moss — everything south stays exact
  [-86, 0x265233],  // lush jungle green (bands 2-3)
  [-108, 0x3a5224], // warm olive (band 4 → the gateway)
  [-126, 0x475426], // golden-green (the Emberglade floor)
];
const smoothstep01 = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
const lerpHex = (a, b, t) => {
  const ar = a >> 16 & 255, ag = a >> 8 & 255, ab = a & 255;
  const br = b >> 16 & 255, bg = b >> 8 & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16)
    | (Math.round(ag + (bg - ag) * t) << 8)
    | Math.round(ab + (bb - ab) * t);
};
/** Blended ground hex at a given z (sRGB-space blend, monotone warmer north). */
export function mawGroundHex(z) {
  const s = GROUND_STOPS;
  if (z >= s[0][0]) return s[0][1];
  for (let i = 1; i < s.length; i++) {
    if (z >= s[i][0]) {
      return lerpHex(s[i - 1][1], s[i][1],
        smoothstep01((z - s[i - 1][0]) / (s[i][0] - s[i - 1][0])));
    }
  }
  return s[s.length - 1][1];
}
// The water rides the same phase: teal in the south, jade, then gold-green by
// the fourth crossing (Kumandra water). One stop per crossing z; the snake's
// hairpins blend between neighbouring stops, so the single ribbon grades
// continuously along its whole course (index.js samples this per row via
// pathStrip's colorAt).
const RIVER_WATER_STOPS = [
  [-37.5, 0x1f7a99, 0x7fe8f0],
  [-54,   0x217b8a, 0x7fe8f0],
  [-70.5, 0x25795f, 0x9fe8c8],
  [-87,   0x2e7a4f, 0xc8e8a0],
];
/** { body, core } water hexes at a given z (clamped, smoothstep between stops). */
export function riverWaterHexAt(z) {
  const s = RIVER_WATER_STOPS;
  if (z >= s[0][0]) return { body: s[0][1], core: s[0][2] };
  for (let i = 1; i < s.length; i++) {
    if (z >= s[i][0]) {
      const t = smoothstep01((z - s[i - 1][0]) / (s[i][0] - s[i - 1][0]));
      return { body: lerpHex(s[i - 1][1], s[i][1], t), core: lerpHex(s[i - 1][2], s[i][2], t) };
    }
  }
  return { body: s[s.length - 1][1], core: s[s.length - 1][2] };
}

const srgb1 = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
/** Linear [r,g,b] for the vertex-colored ground; the band boundary wavers
 * with x so the phase never reads as a straight seam. */
export function mawGroundColorAt(x, z) {
  const ze = z + 3 * Math.sin(x * 0.13 + 1.7) + 1.6 * Math.sin(x * 0.31);
  const h = mawGroundHex(ze);
  return [srgb1(h >> 16 & 255), srgb1(h >> 8 & 255), srgb1(h & 255)];
}

// ── The Emberglade — the warm sanctum beyond Riversend ───────────────────────
// (owner direction 2026-07-27: the first cut of this scene recreated Avatar's
// Tree of Souls and was removed as too close to the source material; the
// replacement is ORIGINAL and WARM.) Past the fourth river the corridor's
// GROUND route — spire 4's foot is the only way in, so the whole canopy
// pilgrimage still gates it — passes under a rock-rib gateway arch and the
// teal night gives way to amber: the Lantern Tree (hanging glow-fruit,
// Rodin sculpt) inside an ember root web, ruined arch ribs ringing it, small
// sky-isles adrift overhead. No nodes, no enemies — the glade is the reward.
export const EMBER_TREE = { x: 0, z: -127, r: 2.3 };
// Concentric ember-web ring radii (visual ribbons around the tree)
export const GROTTO_RINGS = [4.5, 7.5, 10.5];
// Rock-rib arches {x,z,rotY,scale}; [0] straddles the walk-in trail as the
// gateway (the literal scene transition), the rest ruin-ring the bowl.
// Native feet sit at local x ±3.2, foot r 0.8 — both scale with the placement.
export const GLADE_ARCHES = [
  { x: -0.5, z: -104.5, rotY: 0.14,  scale: 1.15 }, // gateway over the trail
  { x: -12.6, z: -119,  rotY: -0.62, scale: 1.3 },
  { x: 12.2, z: -122.5, rotY: 0.72,  scale: 1.22 },
  { x: -10.8, z: -136.8, rotY: 0.5,  scale: 1.18 },
  { x: 10.2, z: -138.5, rotY: -0.55, scale: 1.28 },
];
export const ARCH_FEET = GLADE_ARCHES.flatMap(a => {
  const leg = 3.2 * a.scale, c = Math.cos(a.rotY), s = Math.sin(a.rotY);
  return [
    { x: a.x + leg * c, z: a.z - leg * s, r: 0.8 * a.scale },
    { x: a.x - leg * c, z: a.z + leg * s, r: 0.8 * a.scale },
  ];
});
// Ground trail: spire 4's foot (the helix exits south at z −92.75) curving
// east-north through the gateway to the web's outer ring. Pure data — the
// zone builder ribbons it, the grotto test walks it against every circle.
export const GROTTO_TRAIL = [
  [-14, -92.4], [-11.2, -94.6], [-8.4, -96.9], [-5.8, -99.3], [-3.4, -101.7],
  [-1.4, -104.3], [-0.6, -107.4], [-0.3, -110.6], [-0.1, -113.8], [0, -116.6],
];
// Floating islets (Hallelujah outliers) — VISUAL ONLY, y ≥ 9.8 so they never
// collide with anything; hung over the bowl's north rim so their screen
// footprint (ortho camera: ground-equivalent z ≈ z − 0.96·y) always lands
// past the sanctum, never over the tree or the trail.
export const SKY_ISLES = [
  { x: -10.5, z: -134.5, y: 9.8,  rotY: 0.7, scale: 1.5 },
  { x: 1.5,   z: -140.5, y: 12.6, rotY: 2.4, scale: 1.15 },
  { x: 12.5,  z: -136,   y: 10.8, rotY: 4.2, scale: 0.85 },
];

export const SURFACES = [HELIX, BRIDGE_A, BRIDGE_B, ...PADS, ...LOOP_BRIDGES,
  ...SPIRE_HELIXES, ...SPIRE_TOPS, ...EXPANSE_PADS, ...EXPANSE_BRIDGES, ...SPIRE_BRIDGES];

// The Root Gate — an unmissable arch straddling the worn trail on the SW
// approach line, 1.6 out from the helix foot (10.07, −16.07). rotY −π/4 aims
// the passage NE at the foot (fungi face stays toward the camera/approach).
// Native legs sit at local x ±1.45, so world legs = gate ± 1.45·scale rotated.
export const ROOT_GATE = { x: 8.9, z: -14.9, rotY: -Math.PI / 4, scale: 1.25 };
const GATE_LEG = 1.45 * ROOT_GATE.scale;

// ── Collision ────────────────────────────────────────────────────────────────
// Ground level (y 0): the trunk, plus every pad's support stem.
export const GROUND_CIRCLES = [
  { x: HOMETREE.x, z: HOMETREE.z, r: HOMETREE.trunkR },
  ...PADS.filter(p => p !== JUNCTION).map(p => ({ x: p.x, z: p.z, r: 0.9 })),
  { x: GREAT_TREE.x, z: GREAT_TREE.z, r: GREAT_TREE.r },
  // Root Gate legs (local ±x rotated by rotY; the trail passes between)
  { x: ROOT_GATE.x + GATE_LEG * Math.cos(ROOT_GATE.rotY),
    z: ROOT_GATE.z - GATE_LEG * Math.sin(ROOT_GATE.rotY), r: 0.34 },
  { x: ROOT_GATE.x - GATE_LEG * Math.cos(ROOT_GATE.rotY),
    z: ROOT_GATE.z + GATE_LEG * Math.sin(ROOT_GATE.rotY), r: 0.34 },
  // Expanse: pad stems + spire trunks (the climb hugs the trunk above ground —
  // the helix band's inner edge is the guardrail up there, Hometree-style)
  ...EXPANSE_PADS.map(p => ({ x: p.x, z: p.z, r: 0.9 })),
  ...EXPANSE_BANDS.map(b => ({ x: b.spire[0], z: b.spire[1], r: 1.55 })),
  // River barrier — the water is NOT navigable. RIVER_CHAIN follows the whole
  // serpentine centerline with no player-sized gap; circles carry no y, so
  // canopy bridges cross 7 units above them untouched.
  ...RIVER_CHAIN,
  // Emberglade: the tree's trunk + every arch pier (sky-isles add nothing —
  // they are airborne visuals only)
  { x: EMBER_TREE.x, z: EMBER_TREE.z, r: EMBER_TREE.r },
  ...ARCH_FEET,
];

// Canopy-level collision — only bites when the player is up at that height.
export const SPIRIT_TREE = { x: -7.2, z: -20.9 };
export const CANOPY_CIRCLES = [
  { x: SPIRIT_TREE.x, z: SPIRIT_TREE.z, r: 0.7, y: PAD_ALTAR.y },
];

// ── Waymark spores — the route, made legible ─────────────────────────────────
// A dotted string of bioluminescent spores climbs the helix's outer rim and
// marks every bridge mouth, so "where does the path go" is answerable at a
// glance from anywhere on the loop (owner: "Neither is understanding the
// path"). Tiny glow dots, rendered by the zone builder from this data.
export const WAYMARKS = (() => {
  const pts = [];
  const helixString = (H, n) => {
    const r = H.rMid + H.halfW - 0.22;
    for (let i = 0; i <= n; i++) {
      const t = i / n, th = H.th0 + (H.th1 - H.th0) * t;
      pts.push([H.cx + Math.cos(th) * r, H.y0 + (H.y1 - H.y0) * t + 0.12, H.cz + Math.sin(th) * r]);
    }
  };
  helixString(HELIX, 18);
  for (const sh of SPIRE_HELIXES) helixString(sh, 10);
  for (const br of [BRIDGE_A, BRIDGE_B, ...LOOP_BRIDGES, ...EXPANSE_BRIDGES, ...SPIRE_BRIDGES]) {
    pts.push([br.x0, br.y0 + 0.12, br.z0], [br.x1, br.y1 + 0.12, br.z1]);
  }
  return pts;
})();

// ── Bioluminescent accents ───────────────────────────────────────────────────
export const CANOPY_LIGHTS = [
  [9.4, 2.4, -15.4, 0x7fe8d8, 4.5, 12],                    // helix entrance (SW foot) — bright: it's the door
  [7.5, 9.0, -19, 0x9fefe0, 2.5, 9],                       // junction ledge
  [1.5, 8.6, -17, 0xa8f0d8, 3.0, 11],                      // Gathering Bough
  [SPIRIT_TREE.x, 10.2, SPIRIT_TREE.z, 0xffc8ec, 3.5, 12], // Spirit Tree glow
  // One soft glow over each loop pad
  ...[PAD_WEST, PAD_OVERLOOK, PAD_MID, PAD_IDOL, PAD_EAST, PAD_BANYAN,
      PAD_NE, PAD_NORTH, PAD_NW]
    .map(p => [p.x, p.y + 2.3, p.z, 0x9fefe0, 2.2, 9]),
  // The expanse stays light-lean (point lights are a real per-fragment cost;
  // spires carry emissive glow lips instead) — one glow crowns the terminus,
  // already warm-green: Riversend sits deep inside the transitional phase.
  [TERMINUS.x, TERMINUS.y + 2.4, TERMINUS.z, 0xd8e8a0, 2.6, 10],
  // The Emberglade turns WARM — the teal night gives way at the gateway arch
  // to amber lantern-light. This palette shift (cool → warm, complementary to
  // the whole zone), not a fog change, is the scene transition.
  [EMBER_TREE.x, 6.4, EMBER_TREE.z, 0xffc27a, 5.0, 26], // the Lantern Tree's glow
  [-8.5, 2.4, -132, 0xff9a52, 2.4, 13],                 // ember rim, west
  [8.5, 2.4, -122.5, 0xff9a52, 2.2, 13],                // ember rim, east
  [-0.5, 3.2, -104.5, 0xffe0b0, 2.4, 12],               // gateway threshold, pale gold
];

// ── GLB placements (consumed by ZONE_ASSETS.verdantMaw) ──────────────────────
// Two Rodin pad variants alternate along the loop (A: mushroom-table with
// moss drapes and a braided trunk; B: veined lilypad on a twisted vine stem)
// so the corridor never reads as the same disc repeated.
const padPlacement = (p, rotY, variant = 0) => ({
  model: variant ? 'pandoraCanopyPad2' : 'pandoraCanopyPad',
  x: p.x, y: p.y, z: p.z, rotY, scale: p.r / 4.0, reveal: true,
});
const bridgePlacement = (br) => {
  const span = Math.hypot(br.x1 - br.x0, br.z1 - br.z0);
  // The VISUAL span extends 0.7 past each ramp end, along the same 3D line,
  // so the branch tips bury into the pad sculptures at every azimuth — the
  // exact rim of an irregular Rodin pad can fall short of the ideal disc,
  // and a bridge ending in air there reads as "hovering with no purpose"
  // (owner note). The walkable ramp keeps its rim-anchored endpoints.
  const ux = (br.x1 - br.x0) / span, uz = (br.z1 - br.z0) / span;
  const sy = (br.y1 - br.y0) / span, e = 0.7;
  return {
    model: span > 5 ? 'pandoraBranchBridgeLong' : 'pandoraBranchBridge',
    scale: 1.0, reveal: true,
    aim: { x0: br.x0 - ux * e, y0: br.y0 - sy * e, z0: br.z0 - uz * e,
           x1: br.x1 + ux * e, y1: br.y1 + sy * e, z1: br.z1 + uz * e,
           nativeLen: span > 5 ? 8 : 4 },
  };
};
// Corridor enclosure — the loop must read as travel THROUGH a canopy forest,
// not pads floating in dark air. EVERY cloud is anchored to structure (owner
// note: masses hovering in the void layer read as debris): under-pad clouds
// wrap the blossom pads' vine stems so each pad becomes a treetop (top of
// cloud brushes the deck underside, y = pad.y − 0.2 − 3.6·scale); under-
// bridge clouds ride beneath long-span midpoints; grounded mounds (y≈0.15)
// are undergrowth; the northern backdrop is GROUNDED giant clouds (scale ~2,
// tops at pad height) — a real canopy wall, not floating lumps. Low/south
// clouds stay short so they never hide a walkway (tall-thing-south rule).
const FOLIAGE = [
  // under-pad crowns (blossom pads' thin stems need them most)
  [-7.6, -19.2, 3.4, 0.7, 1.15],  // Sky Altar
  [-16.2, -1.6, 2.4, 2.1, 1.15],  // Hamlet Overlook
  [6.4, 5.4, 2.6, 4.0, 1.15],     // Idol Watch
  [15.6, -8.6, 2.7, 1.4, 1.15],   // Banyan Step
  [-4.2, -31.6, 2.5, 3.1, 1.15],  // North Reach apex
  // under-bridge fill at long-span midpoints (tops brush the branch line)
  [-15.9, -4.6, 3.3, 0.3, 1.0],   // West Bough → Overlook
  [-9.2, 1.2, 2.7, 2.6, 1.0],     // Overlook → Mid-Jungle
  [2.8, 4.2, 2.75, 5.0, 1.0],     // Mid-Jungle → Idol Watch
  [9.6, 2.6, 3.45, 1.8, 1.0],     // Idol Watch → East Rise
  [14.5, -4.6, 3.5, 3.3, 1.0],    // East Rise → Banyan Step
  [5.75, -23.75, 3.5, 4.7, 1.0],  // Junction → Kapok Rise
  [-9, -30, 3.25, 2.9, 1.0],      // apex → Fern Shelf
  [-10.35, -23.9, 3.75, 0.6, 1.0],// Fern Shelf → Sky Altar
  // grounded undergrowth mounds (south, frame the trail)
  [5.2, 8.2, 0.15, 2.2, 0.9], [-3.5, 11, 0.15, 4.4, 1.0], [17.5, 6.5, 0.15, 0.9, 0.95],
  // grounded giant backdrop — the jungle's own canopy wall, now BEHIND the
  // North Reach arc (the two that stood at z −25 sat inside the new arc)
  [-5.5, -36, 0, 1.2, 2.0], [5.5, -33.8, 0, 3.6, 2.05],
  [-17.5, -16.8, 0, 5.2, 1.95], [19, -17.3, 0, 2.4, 2.0],
  // …and the wall behind Riversend Crown PARTS at the gateway arch — the
  // giants that used to close the world now flank the walk into the Well of
  // Souls (the trail threads x −1.4..0 through z −104)
  [-8.8, -102.2, 0, 2.8, 2.0], [5.5, -101.4, 0, 0.9, 1.9], [-12.5, -100.8, 0, 4.2, 1.75],
].map(([x, z, y, rotY, scale]) => ({ model: 'jungleCanopyMass', x, y, z, rotY, scale, reveal: true }));

// (No curtain near the Root Gate / helix foot — a curtain at (11.6,−14)
// hung squarely between the camera and the gate, re-burying the entrance
// the gate exists to mark. Entrance sightline stays clear.)
const CURTAINS = [
  [-14.9, -8.2, 2.4, 0.4], [-11.4, 0.3, 1.6, 1.9], [0, 3.6, 1.8, 0.9],
  [-10.2, -16.8, 2.6, 1.2],
  [1.5, -13.4, 1.6, 0.2], [-7.2, -16.6, 2.8, 2.9],
].map(([x, z, y, rotY]) => ({ model: 'pandoraVineCurtain', x, y, z, rotY, scale: 1.0, noOutline: true }));

export const PLACEMENTS = [
  { model: 'pandoraHometree', x: HOMETREE.x, y: 0, z: HOMETREE.z, rotY: 0, scale: 1.0, reveal: true },
  { model: 'pandoraRootGate', x: ROOT_GATE.x, y: 0, z: ROOT_GATE.z, rotY: ROOT_GATE.rotY, scale: ROOT_GATE.scale },
  { model: 'pandoraGreatTree', x: GREAT_TREE.x, y: 0, z: GREAT_TREE.z, rotY: 0.8, scale: 1.0, reveal: true },
  { model: 'pandoraSpiritTree', x: SPIRIT_TREE.x, y: PAD_ALTAR.y, z: SPIRIT_TREE.z, rotY: 0.4, scale: 1.0, noOutline: true },
  ...FOLIAGE,
  ...CURTAINS,
  padPlacement(PAD_BOUGH, 0.7, 0),
  padPlacement(PAD_ALTAR, 3.4, 1),
  padPlacement(PAD_WEST, 1.5, 0),
  padPlacement(PAD_OVERLOOK, 4.2, 1),
  padPlacement(PAD_MID, 2.3, 0),
  padPlacement(PAD_IDOL, 5.0, 1),
  padPlacement(PAD_EAST, 0.9, 0),
  padPlacement(PAD_BANYAN, 2.8, 1),
  padPlacement(PAD_NE, 1.3, 0),
  padPlacement(PAD_NORTH, 2.0, 1),
  padPlacement(PAD_NW, 5.1, 0),
  // River Expanse pads (A/B alternation continues north; Riversend is B)
  padPlacement(EXPANSE_BANDS[0].pads[0], 0.4, 0),
  padPlacement(EXPANSE_BANDS[0].pads[1], 2.9, 1),
  padPlacement(EXPANSE_BANDS[1].pads[0], 4.6, 0),
  padPlacement(EXPANSE_BANDS[1].pads[1], 1.1, 1),
  padPlacement(EXPANSE_BANDS[2].pads[0], 3.7, 0),
  padPlacement(EXPANSE_BANDS[2].pads[1], 5.6, 1),
  padPlacement(EXPANSE_BANDS[3].pads[0], 2.2, 0),
  padPlacement(TERMINUS, 0.9, 1),
  // Root Spires — rotY 0 / scale 1.0 are LOAD-BEARING (see SPIRE note above)
  ...EXPANSE_BANDS.map(b => ({ model: 'pandoraRootSpire', x: b.spire[0], y: 0, z: b.spire[1],
    rotY: 0, scale: 1.0, reveal: true })),
  bridgePlacement(BRIDGE_A),
  bridgePlacement(BRIDGE_B),
  ...LOOP_BRIDGES.map(bridgePlacement),
  ...EXPANSE_BRIDGES.map(bridgePlacement),
  ...SPIRE_BRIDGES.map(bridgePlacement),
  // The Emberglade — Lantern Tree + arch ribs reveal-cut (south ribs stand
  // between the camera and the bowl; the cut opens them around the player),
  // isles plain (they hang north and above — never in the camera-player line).
  { model: 'emberLanternTree', x: EMBER_TREE.x, y: 0, z: EMBER_TREE.z, rotY: 0.3, scale: 1.0, reveal: true },
  ...GLADE_ARCHES.map(a => ({ model: 'emberGladeArch', x: a.x, y: 0, z: a.z,
    rotY: a.rotY, scale: a.scale, reveal: true })),
  ...SKY_ISLES.map(s => ({ model: 'pandoraSkyIsle', x: s.x, y: s.y, z: s.z,
    rotY: s.rotY, scale: s.scale })),
];

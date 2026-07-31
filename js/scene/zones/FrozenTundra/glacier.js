/**
 * The Frozen Tundra's glacier — pure geometry constants (no three.js, so tests
 * can walk every route headlessly), in the same shape as the Verdant Maw's
 * canopy.js. The zone builder places the GLBs and registers these surfaces;
 * tests/systems/glacierSurfaces.test.js strides every route and fails if any
 * seam breaks past STEP_UP.
 *
 * ── Why the glacier is RAISED rather than the crevasses DUG ──────────────────
 * walkableSurfaces.resolveHeight() always considers ground (y = 0) as a
 * candidate and returns the HIGHEST candidate within STEP_UP. Nothing below
 * y = 0 can ever be stood on: a surface at y = −5 is 5 units from a
 * ground-standing player, so it is never even in range. The only way to get a
 * crevasse is therefore to lift the ice ABOVE the base plane and leave gaps —
 * so the rift floors here ARE the zone's ordinary ground, seen from between
 * walls of ice. That also means the whole existing snowfield (every prop, the
 * lake, the cave mouth, the portal, the trodden path) keeps its coordinates:
 * the glacier is new terrain grown into the empty northern band past z −21.5,
 * which held exactly two props before this.
 *
 * ── Reading elevation at a fixed 46° ortho camera ────────────────────────────
 * At 46° a unit of height and a unit of depth project almost identically
 * (sin 46° ≈ 0.72 vs cos 46° ≈ 0.69), which is why the Hometree's climb needed
 * a helix — circling a known trunk is what made the ascent legible. This zone
 * takes the other three routes, none of which wrap (owner call):
 *   1. STACKED RISERS. Three shelves whose risers face the camera as crisp
 *      horizontal edges, each shadowing the shelf below. You read the climb
 *      off the stacked bands, and walking straight north gains height.
 *   2. FRAMING. The rifts are gaps you look down INTO — the near rim occludes
 *      the far wall, so depth reads by occlusion rather than by projection.
 *   3. SCENE SWAP. The overlook and the gallery are their own scenes, where
 *      elevation carries no camera ambiguity at all.
 *
 *   z  +32 ───────────────────────────────────  near camera (bottom of frame)
 *           EXISTING SNOWFIELD  y 0
 *      −21.5 ══ three frontal approach ramps ══
 *           LOWER SHELF   y 3.0   ⟨ rift west ⟩
 *      −34  ══ two ramps ══
 *           MIDDLE SHELF  y 5.5   ⟨ the Blue Rift opens ⟩
 *      −47  ══ two ramps ══
 *           ARCH PLAZA    y 8.0   ⟨ the ice arch; rift bridged twice ⟩
 *      −58 ───────────────────────────────────
 *           aurora curtain backdrop ≈ −61
 *      −62 ── world edge
 */

// ── Shelves ──────────────────────────────────────────────────────────────────
// Heights rise 3.0 / 2.5 / 2.5. Every gap between shelves is ≫ STEP_UP (0.7),
// so a shelf edge blocks like a wall and the ramps are the only way up.
export const Y_SHELF_1 = 3.0;
export const Y_SHELF_2 = 5.5;
export const Y_SHELF_3 = 8.0;

// Shelf bands in z. Consecutive bands ABUT (no gap) so a ramp landing on the
// seam resolves on both.
export const Z_SHELF_1 = { s: -21.5, n: -34 };
export const Z_SHELF_2 = { s: -34, n: -47 };
export const Z_SHELF_3 = { s: -47, n: -58 };

// ── Rifts ────────────────────────────────────────────────────────────────────
// Gaps left in the shelf rects. The floor of each is the base ground plane,
// so their depth is exactly the shelf height above them.
export const RIFT_MAIN = { minX: 3.5, maxX: 10.5, minZ: -58, maxZ: -34 }; // the Blue Rift
export const RIFT_WEST = { minX: -18, maxX: -13, minZ: -34, maxZ: -21.5 };

const rect = (minX, maxX, minZ, maxZ, y) => ({ kind: 'rect', minX, maxX, minZ, maxZ, y });

// Shelf 1 is split by the west rift, shelves 2-3 by the Blue Rift.
//
// Shelves 1 and 2 run the FULL zone width (±34, the declared bounds) rather
// than stopping at ±32. A shelf that stops short of the world edge leaves a
// strip of open ground beside it: from the player's side that strip is an
// invisible wall at the shelf's flank, and from below it is a way in under the
// whole glacier. Running to the bounds hands the job to WORLD_EDGE_MARGIN,
// which every other zone already relies on.
//
// The plaza is the exception — it stays ±26 so the arch reads against open sky
// on both flanks — so it gets real walls on its three open edges instead
// (GLACIER_PROPS, PLAZA_EDGES).
export const SHELF_1 = [
  rect(-34, RIFT_WEST.minX, Z_SHELF_1.n, Z_SHELF_1.s, Y_SHELF_1),
  rect(RIFT_WEST.maxX, 34, Z_SHELF_1.n, Z_SHELF_1.s, Y_SHELF_1),
];
export const SHELF_2 = [
  rect(-34, RIFT_MAIN.minX, Z_SHELF_2.n, Z_SHELF_2.s, Y_SHELF_2),
  rect(RIFT_MAIN.maxX, 34, Z_SHELF_2.n, Z_SHELF_2.s, Y_SHELF_2),
];
export const SHELF_3 = [
  rect(-26, RIFT_MAIN.minX, Z_SHELF_3.n, Z_SHELF_3.s, Y_SHELF_3),
  rect(RIFT_MAIN.maxX, 26, Z_SHELF_3.n, Z_SHELF_3.s, Y_SHELF_3),
];

// ── Ramps ────────────────────────────────────────────────────────────────────
// Straight and frontal: each runs due north (−z) and lands exactly on the
// shelf's south edge, so ramp top and shelf share a height at the seam. None
// wraps or circles anything. halfW 3.5 makes them 7 units wide — generous
// enough that an endgame-speed player doesn't have to aim.
//
// Grades sit at 0.28-0.39, all under the 0.75 the stride test allows and in
// the same band as the canopy's gentlest spans.
const climb = (x, zS, zN, y0, y1, halfW = 3.5) =>
  ({ kind: 'ramp', x0: x, z0: zS, y0, x1: x, z1: zN, y1, halfW });

// Ground → Lower Shelf. Three of them so the shelf is reachable from anywhere
// along the field's width. x is chosen to clear the Mine Hub portal and its
// return beacon at (0, −18): the −6 ramp covers x −9.5..−2.5, the +14 ramp
// covers 10.5..17.5, so the portal apron stays flat.
export const RAMPS_1 = [
  climb(-22, -11.5, Z_SHELF_1.s, 0, Y_SHELF_1),
  climb(-6, -11.5, Z_SHELF_1.s, 0, Y_SHELF_1),
  climb(14, -11.5, Z_SHELF_1.s, 0, Y_SHELF_1),
];
// Lower → Middle. Pushed to the flanks (−24 / +20) so the crossing of shelf 1
// is a lateral walk with the west rift in view, not a straight shot north.
//
// Each ramp lands on the NEXT shelf's SOUTH edge (`.s`) — the near rim, not
// the far one. Landing on `.n` builds a ramp that tunnels the whole band and
// leaves its mouth mid-shelf, where a player at shelf height can never join
// it (the ramp there is already more than STEP_UP overhead). The stride test
// catches it as a break part-way along the descent.
export const RAMPS_2 = [
  climb(-24, -24, Z_SHELF_2.s, Y_SHELF_1, Y_SHELF_2),
  climb(20, -24, Z_SHELF_2.s, Y_SHELF_1, Y_SHELF_2),
];
// Middle → Arch Plaza.
export const RAMPS_3 = [
  climb(-20, -38, Z_SHELF_3.s, Y_SHELF_2, Y_SHELF_3),
  climb(18, -38, Z_SHELF_3.s, Y_SHELF_2, Y_SHELF_3),
];

// The descent into the Blue Rift — the only way down to a rift floor, and the
// steepest thing in the zone (0.39). It fills the rift's full width, so
// stepping off the middle shelf's east edge at x 3.5 lands on it seamlessly.
// It bottoms out at z −48, which is why both rift bridges sit north of −51:
// a bridge overhead while the ramp is still within STEP_UP of it would snap a
// descending player up onto the span.
export const RIFT_DESCENT = {
  kind: 'ramp',
  x0: 7, z0: Z_SHELF_2.s, y0: Y_SHELF_2,
  x1: 7, z1: -48, y1: 0,
  halfW: 3.5,
};

// ── Bridges ──────────────────────────────────────────────────────────────────
// Flat spans, so seams are trivially continuous — both banks are one height.
// Each overlaps its shelves by 0.5 on each side rather than meeting them
// exactly (the canopy's rim-anchoring lesson: hairline seams at a mouth are
// what strand fast players).
const span = (minZ, maxZ, y) => rect(RIFT_MAIN.minX - 0.5, RIFT_MAIN.maxX + 0.5, minZ, maxZ, y);
export const BRIDGE_RIFT_S = span(-53, -51, Y_SHELF_3);
export const BRIDGE_RIFT_N = span(-58, -56, Y_SHELF_3);
// The west span sits at the rift's SOUTH end, where the player first steps onto
// shelf 1 — the crossing has to be on the natural line to the shelf-2 ramp
// mouth at (−24, −24). A span further north would leave the only route west
// running into the rift itself.
export const BRIDGE_WEST = rect(RIFT_WEST.minX - 0.5, RIFT_WEST.maxX + 0.5, -24.5, -22, Y_SHELF_1);

export const BRIDGES = [BRIDGE_RIFT_S, BRIDGE_RIFT_N, BRIDGE_WEST];

// ── Landmarks ────────────────────────────────────────────────────────────────
// The ice arch — the zone's hero silhouette and the thing the whole climb
// points at. Centred on the plaza, on the camera's centre line.
export const ICE_ARCH = { x: 0, z: -54, y: Y_SHELF_3 };
// Walk-in scene swaps (Glacial Hollow pattern — _addCaveEntrance, noGate).
export const OVERLOOK_MOUTH = { x: -20, z: -55, y: Y_SHELF_3 };
export const GALLERY_MOUTH = { x: 7, z: -49.5, y: 0 }; // on the Blue Rift floor

// Everything the builder registers, in one list.
export const SURFACES = [
  ...SHELF_1, ...SHELF_2, ...SHELF_3,
  ...RAMPS_1, ...RAMPS_2, ...RAMPS_3,
  RIFT_DESCENT,
  ...BRIDGES,
];

// ── Visual placement ─────────────────────────────────────────────────────────
// ZoneAssets entries generated from the SAME constants as the surfaces above,
// so the ice you see and the ice you stand on can never drift apart. Spread
// into ZONE_ASSETS.frozenTundra.
//
// Orientation note: glTF maps Blender −Y to game +Z, and every kit piece is
// authored with its exposed face on Blender −Y. So rotY 0 faces the camera,
// +π/2 faces east, −π/2 faces west, π faces away.

/** Tile centres covering [from, to] with pieces `width` wide (they overlap). */
function tiles(from, to, width) {
  const n = Math.max(1, Math.ceil((to - from) / width));
  const step = (to - from) / n;
  return Array.from({ length: n }, (_, i) => from + step * (i + 0.5));
}

const WALL_W = 8, WALL_H = 3, RIFTW_W = 8, RIFTW_H = 4, BRIDGE_L = 9;

/** Split [x0,x1] into sub-runs avoiding each [lo,hi] gap. */
function runsExcluding(x0, x1, gaps) {
  let runs = [[x0, x1]];
  for (const [lo, hi] of gaps) {
    const next = [];
    for (const [a, b] of runs) {
      if (hi <= a || lo >= b) { next.push([a, b]); continue; }
      if (lo - a > 1.5) next.push([a, lo]);
      if (b - hi > 1.5) next.push([hi, b]);
    }
    runs = next;
  }
  return runs;
}

/**
 * The x span each ramp needs kept clear of wall.
 *
 * The margin is 1.8, not a token 0.5, because a run's END TILES overhang it:
 * tiles are WALL_W wide but spaced at step = runLength/ceil(runLength/WALL_W),
 * so whenever step < WALL_W (which is most runs — that overlap is what keeps a
 * wall seamless) the first and last tile stick out by (WALL_W − step)/2, up to
 * ~1 unit. At 0.5 that reached into three ramp mouths and buried the edge of
 * the climb in ice.
 */
const rampGaps = (ramps) => ramps.map(r => [r.x0 - r.halfW - 1.8, r.x0 + r.halfW + 1.8]);

/**
 * One run of riser sections along a shelf's south edge, with the mouths of any
 * ramps that land on it left OPEN — a tile across a ramp mouth buries the top
 * of the climb inside the wall and the ramp appears to emerge from solid ice.
 *
 * Tiles are jittered SOUTH ONLY (+z, toward the camera) and given slightly
 * different widths. Laid flush, the three shelves read as dead-straight
 * parallel stripes — a terraced car park, not a glacier — and the eye reads
 * the repeat instantly. Jittering south rather than both ways matters: a tile
 * pushed north would sit inside the walkable rect, letting the player walk out
 * past the visible wall and stand on thin air.
 */
function riserTiles(x0, x1, z, y, rise, gaps, seed) {
  const rng = scatterRng(seed * 7919 + Math.round(z * 13));
  const out = [];
  for (const [a, b] of runsExcluding(x0, x1, gaps)) {
    // A tile is WALL_W wide whatever its run, so on a run SHORTER than that it
    // overhangs both ends — and a 3-unit run beside the west rift put a full
    // 8-unit wall (and its collision chain) 2.4 units into the rift mouth,
    // sealing the walk-in slot. Clamp the width to the run, and carry the run
    // bounds so the chain can clamp too.
    const fit = Math.min(1, (b - a) / WALL_W);
    for (const x of tiles(a, b, WALL_W)) {
      out.push({
        x, z: z + rng() * 1.7, y, a, b,
        sx: (0.94 + rng() * 0.22) * fit,
        sy: (rise / WALL_H) * (0.94 + rng() * 0.13),
      });
    }
  }
  return out;
}

const riserProp = (t) => ({
  model: 'tundraShelfWall', x: t.x, z: t.z, y: t.y, scale: 1.0,
  scaleXYZ: [t.sx, t.sy, 1],
});

/** Rift flank: `side` −1 lines the west bank (face east), +1 the east bank. */
function riftFlank(x, z0, z1, depth, side) {
  return tiles(z0, z1, RIFTW_W).map(z => ({
    model: 'tundraRiftWall', x, z, y: 0, scale: 1.0,
    rotY: side < 0 ? Math.PI / 2 : -Math.PI / 2,
    scaleXYZ: [1, depth / RIFTW_H, 1],
  }));
}

// ── Ground-level collision ───────────────────────────────────────────────────
// THE bug this fixes: resolveHeight always offers ground (y 0) as a candidate,
// and the ground plane spans the whole zone — so nothing about a shelf stops a
// player at ground level. Before these chains you could walk due north from the
// portal straight THROUGH the riser and keep going under the entire glacier,
// which is both "I can travel on both sides of the wall" and most of "the
// player is hidden with no cue where the upper level is".
//
// Circles carry y: 0, and main.js only tests a circle within LEVEL_BAND (1.6)
// of the player's height — so these are solid to a ground walker, invisible to
// anyone on a shelf, and invisible to a climber, who is already above 1.6 by
// the time they reach the riser line (y 1.6 falls at z −16.8 on a shelf-1
// approach ramp, nearly 5 units short of it).
const CHAIN_R = 1.1, CHAIN_STEP = 1.9;   // step < 2r, so the union has no gap

/** Circles along a line, from (x0,z0) to (x1,z1). */
function chain(x0, z0, x1, z1) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.max(1, Math.ceil(len / CHAIN_STEP));
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push({ x: x0 + (x1 - x0) * t, z: z0 + (z1 - z0) * t, r: CHAIN_R, y: 0 });
  }
  return out;
}

// Where the wall mass sits relative to its placement z, so the chain hugs the
// back of it and the player ends up against the visible face rather than
// stopping a metre short of it in mid-air.
const WALL_BACK = -1.1;
const RIFT_PAD = 0.8;

/** Both flanks and the closed north head of a rift, padded outward. */
function riftChains(r) {
  return [
    ...chain(r.minX - RIFT_PAD, r.maxZ, r.minX - RIFT_PAD, r.minZ - RIFT_PAD),
    ...chain(r.maxX + RIFT_PAD, r.maxZ, r.maxX + RIFT_PAD, r.minZ - RIFT_PAD),
    ...chain(r.minX - RIFT_PAD, r.minZ - RIFT_PAD, r.maxX + RIFT_PAD, r.minZ - RIFT_PAD),
  ];
}

// Riser tiles, computed once so the visible wall and its collision chain can
// never disagree about where the wall actually is.
const TILES_1 = [
  // Shelf 1's run is broken by the west rift, which opens THROUGH the south
  // edge — that gap is the walk-in mouth of the slot canyon, so the riser
  // must not close it (and neither may the chain).
  ...riserTiles(-34, RIFT_WEST.minX, Z_SHELF_1.s, 0, Y_SHELF_1, rampGaps(RAMPS_1), 11),
  ...riserTiles(RIFT_WEST.maxX, 34, Z_SHELF_1.s, 0, Y_SHELF_1, rampGaps(RAMPS_1), 12),
];
const TILES_2 = [
  ...riserTiles(-34, RIFT_MAIN.minX, Z_SHELF_2.s, Y_SHELF_1, Y_SHELF_2 - Y_SHELF_1, rampGaps(RAMPS_2), 21),
  ...riserTiles(RIFT_MAIN.maxX, 34, Z_SHELF_2.s, Y_SHELF_1, Y_SHELF_2 - Y_SHELF_1, rampGaps(RAMPS_2), 22),
];
const TILES_3 = [
  ...riserTiles(-26, RIFT_MAIN.minX, Z_SHELF_3.s, Y_SHELF_2, Y_SHELF_3 - Y_SHELF_2, rampGaps(RAMPS_3), 31),
  ...riserTiles(RIFT_MAIN.maxX, 26, Z_SHELF_3.s, Y_SHELF_2, Y_SHELF_3 - Y_SHELF_2, rampGaps(RAMPS_3), 32),
];

// The arch plaza's three open edges. It stays narrower than the shelves below
// for composition, which would otherwise leave the player walking into thin
// air at ±26 and at its north rim — the "invisible barriers". Walls face
// INWARD so the plaza reads as a bowl the arch stands in.
export const PLAZA_EDGES = [
  ...tiles(Z_SHELF_3.n, Z_SHELF_3.s, WALL_W).map(z =>
    ({ model: 'tundraShelfWall', x: -26.4, z, y: Y_SHELF_3, scale: 1.0, rotY: -Math.PI / 2 })),
  ...tiles(Z_SHELF_3.n, Z_SHELF_3.s, WALL_W).map(z =>
    ({ model: 'tundraShelfWall', x: 26.4, z, y: Y_SHELF_3, scale: 1.0, rotY: Math.PI / 2 })),
  ...tiles(-26, 26, WALL_W).map(x =>
    ({ model: 'tundraShelfWall', x, z: Z_SHELF_3.n - 0.4, y: Y_SHELF_3, scale: 1.0, rotY: Math.PI })),
];

export const GLACIER_PROPS = [
  // ── Shelf risers ─────────────────────────────────────────────────────────
  ...TILES_1.map(riserProp),
  ...TILES_2.map(riserProp),
  ...TILES_3.map(riserProp),
  ...PLAZA_EDGES,

  // ── Rift flanks ──────────────────────────────────────────────────────────
  // The Blue Rift deepens as the shelves climb: 5.5 alongside shelf 2, 8.0
  // alongside the arch plaza. That widening gash IS the depth cue.
  ...riftFlank(RIFT_MAIN.minX, Z_SHELF_2.n, Z_SHELF_2.s, Y_SHELF_2, -1),
  ...riftFlank(RIFT_MAIN.maxX, Z_SHELF_2.n, Z_SHELF_2.s, Y_SHELF_2, +1),
  ...riftFlank(RIFT_MAIN.minX, Z_SHELF_3.n, Z_SHELF_3.s, Y_SHELF_3, -1),
  ...riftFlank(RIFT_MAIN.maxX, Z_SHELF_3.n, Z_SHELF_3.s, Y_SHELF_3, +1),
  ...riftFlank(RIFT_WEST.minX, RIFT_WEST.minZ, RIFT_WEST.maxZ, Y_SHELF_1, -1),
  ...riftFlank(RIFT_WEST.maxX, RIFT_WEST.minZ, RIFT_WEST.maxZ, Y_SHELF_1, +1),
  // Rift head walls — the closed north end of the west slot (faces the
  // camera) and the closed south end of the Blue Rift (faces away).
  { model: 'tundraRiftWall', x: (RIFT_WEST.minX + RIFT_WEST.maxX) / 2, z: RIFT_WEST.minZ, y: 0,
    scale: 1.0, rotY: 0, scaleXYZ: [(RIFT_WEST.maxX - RIFT_WEST.minX) / RIFTW_W, Y_SHELF_1 / RIFTW_H, 1] },
  { model: 'tundraRiftWall', x: (RIFT_MAIN.minX + RIFT_MAIN.maxX) / 2, z: RIFT_MAIN.maxZ, y: 0,
    scale: 1.0, rotY: Math.PI, scaleXYZ: [(RIFT_MAIN.maxX - RIFT_MAIN.minX) / RIFTW_W, Y_SHELF_1 / RIFTW_H, 1] },

  // ── Spans ────────────────────────────────────────────────────────────────
  // y is the walkable height less the deck's own 0.10 rise, so you stand on
  // the snow deck rather than 10 cm inside it.
  { model: 'tundraIceBridge', x: 7, z: -52, y: Y_SHELF_3 - 0.10, scale: 1.0 },
  { model: 'tundraIceBridge', x: 7, z: -57, y: Y_SHELF_3 - 0.10, scale: 1.0 },
  { model: 'tundraIceBridge', x: (RIFT_WEST.minX + RIFT_WEST.maxX) / 2, z: -23.25,
    y: Y_SHELF_1 - 0.10, scale: 1.0,
    scaleXYZ: [(RIFT_WEST.maxX - RIFT_WEST.minX + 1) / BRIDGE_L, 1, 1] },

  // ── The landmark ─────────────────────────────────────────────────────────
  // No `r` here: one circle at the centre would wall off the walk-through.
  // The builder registers a circle per leg instead.
  { model: 'tundraIceArch', x: ICE_ARCH.x, z: ICE_ARCH.z, y: ICE_ARCH.y, scale: 1.0 },
];

// ── Sastrugi field ───────────────────────────────────────────────────────────
// Replaces the 22 CylinderGeometry(w, w*1.1, 0.4, 10) drifts. Those were
// 10-sided discs 0.4 tall: at the fixed camera they read as white poker chips
// on a grey table, hard-edged and all one value. These are authored dunes,
// scattered on every level so the shelves are dressed too — and deliberately
// aligned to a common wind bearing, because real sastrugi all point the same
// way and a random-rotation scatter is what makes snow look like set dressing.
const WIND = -0.42;   // radians; the prevailing bearing all dunes align to

function scatterRng(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Keep-out circles on the flat: the frozen lake, the Glacial Hollow mouth, the
// Mine Hub portal apron, and the trodden path's east run.
const FLAT_CLEAR = [[8, 8, 7.5], [-15, 14, 3.5], [0, -18, 4.5], [2, 19, 4]];

function scatterBand(seed, count, x0, x1, z0, z1, y, clear) {
  const rng = scatterRng(seed);
  const out = [];
  for (let i = 0; i < count * 6 && out.length < count; i++) {
    const x = x0 + rng() * (x1 - x0);
    const z = z0 + rng() * (z1 - z0);
    const long = rng() < 0.38;
    const rad = long ? 6.0 : 3.2;
    if (clear.some(([cx, cz, cr]) => Math.hypot(x - cx, z - cz) < cr)) continue;
    if (out.some(p => Math.hypot(x - p.x, z - p.z) < rad)) continue;
    // Scale per model, not one range for both: the long ridge is authored
    // 11.5 units and the same 0.85–1.55 multiplier made 18-unit dunes that
    // read as beached whales rather than wind-carved snow.
    out.push({
      model: long ? 'tundraSastrugiLong' : 'tundraSastrugi',
      x, z, y,
      scale: long ? 0.42 + rng() * 0.3 : 0.55 + rng() * 0.45,
      rotY: WIND + (rng() - 0.5) * 0.5,
      // Dunes ship without a baked hull (see build_glacierkit.py) — an
      // inflated shell over a soft low-curvature form hatches it with visible
      // triangles. noOutline stops the runtime adding one back.
      noOutline: true,
    });
  }
  return out;
}

// Rift keep-outs for the shelves — a dune hanging over a crevasse edge reads
// as a bug, and the walkable rects stop at the rims anyway.
const riftClear = (r, pad = 3) => [[(r.minX + r.maxX) / 2, (r.minZ + r.maxZ) / 2,
  Math.max(r.maxX - r.minX, r.maxZ - r.minZ) / 2 + pad]];

export const SASTRUGI_FIELD = [
  ...scatterBand(88171, 16, -30, 30, -19, 29, 0, FLAT_CLEAR),
  ...scatterBand(4402, 7, -30, 30, Z_SHELF_1.n + 2, Z_SHELF_1.s - 2, Y_SHELF_1,
    riftClear(RIFT_WEST)),
  ...scatterBand(6613, 6, -30, 30, Z_SHELF_2.n + 2, Z_SHELF_2.s - 2, Y_SHELF_2,
    riftClear(RIFT_MAIN)),
  ...scatterBand(9927, 5, -24, 24, Z_SHELF_3.n + 2, Z_SHELF_3.s - 2, Y_SHELF_3,
    [...riftClear(RIFT_MAIN), [ICE_ARCH.x, ICE_ARCH.z, 8]]),
];

/** Ice-arch leg collision — a circle per foot, height-banded to the plaza. */
export const ICE_ARCH_LEGS = [-9, 9].map(dx =>
  ({ x: ICE_ARCH.x + dx, z: ICE_ARCH.z, r: 1.9, y: ICE_ARCH.y }));

// ── Ground-level colliders ───────────────────────────────────────────────────
// Seal the glacier against a walker at y 0. Only two openings are wanted: the
// west rift's south mouth (a walk-in slot canyon) and the Blue Rift floor,
// which is reached from above by the descent ramp. Everything else is wall.
//
// Note there is deliberately NO chain on the shelf-2 or shelf-3 riser lines:
// once the shelf-1 line and both rifts are sealed, no ground walker can reach
// them, and chains there would only cost frame time.
export const GLACIER_COLLIDERS = [
  // Shelf 1's riser line, following each tile's own jittered z so the player
  // stops against the visible face rather than short of it.
  ...TILES_1.flatMap(t => {
    const half = (WALL_W * t.sx) / 2;
    // Clamped to the tile's own run so a chain can never reach into a rift
    // mouth or a ramp gap that the wall itself leaves open.
    const lo = Math.max(t.x - half, t.a), hi = Math.min(t.x + half, t.b);
    return hi - lo < 0.2 ? [] : chain(lo, t.z + WALL_BACK, hi, t.z + WALL_BACK);
  }),
  // …and straight across every ramp mouth, where the WALL has to be open but
  // the ground does not. A climber is already above y 1.6 long before the
  // riser line, so a y-0 chain here is invisible to them — while a ground
  // walker trying to slip up the side of a ramp is stopped. Without this the
  // only thing closing each mouth is the ~0.5 sliver between the ramp's
  // walkable band and the edge of the wall gap, which is far too fine a
  // margin to be load-bearing.
  ...RAMPS_1.flatMap(r => chain(
    r.x0 - r.halfW - 0.9, Z_SHELF_1.s - 0.2,
    r.x0 + r.halfW + 0.9, Z_SHELF_1.s - 0.2)),
  // The west slot and the Blue Rift floor: both flanks and the closed north
  // head of each, so walking in does not become a way under the shelves.
  //
  // The chains sit OUTSIDE the rift bounds by RIFT_PAD. A chain on the bound
  // itself holds the player 1.55 clear of it, which would leave the 5-wide
  // west slot only 1.9 units of usable floor — a corridor you scrape along.
  // Padded out, it walks at 3.5 and the Blue Rift at 5.5.
  ...riftChains(RIFT_WEST),
  ...riftChains(RIFT_MAIN),
];

// The climb in walk order, as [x, z] waypoints — the route a player actually
// takes from the portal apron to the arch. Used by the seam test and by the
// builder to lay the path ribbon.
export const ASCENT_ROUTE = [
  [-6, -9], [-6, -22],         // flat apron, then the approach ramp (mouth −11.5)
  [-6, -23], [-24, -23],       // west across shelf 1, over the west rift span
  [-24, -35],                  // ramp onto the middle shelf
  [-20, -37], [-20, -48],      // ramp onto the arch plaza
  [-10, -52], [0, -53],        // in to the arch
];

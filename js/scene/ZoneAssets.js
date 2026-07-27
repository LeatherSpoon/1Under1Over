/**
 * ZoneAssets.js — Data-driven GLB prop placements per zone.
 *
 * To add or move an asset in a zone, edit the array for that zone below.
 * Each entry shape: { model, x, z, scale, rotY?, r?, tint? }
 *   model  — key matching a loaded GLB in Environment._glb
 *   x / z  — world-space position on the XZ plane
 *   scale  — uniform scale applied to the cloned model
 *   rotY   — (optional) Y-axis rotation in radians, defaults to 0
 *   r      — (optional) collision circle radius in world units; omit for
 *             purely decorative props the player can walk through
 *   tint   — (optional) hex color multiplied into the model's materials,
 *             e.g. darken bright surface rocks for cave zones
 *   noOutline — (optional) skip the runtime inverted-hull ink line. Needed for
 *             THIN OPEN SHELLS (tent canvas, banners): the hull inflates the
 *             mesh and draws backfaces, which on a one-surface-thick prop land
 *             in front of the real surface and paint it solid black
 *   y      — (optional) lift the prop onto a canopy/platform level; a paired
 *             `r` then registers a height-banded collision circle
 *   reveal — (optional) re-shade with the player-position reveal cut so the
 *             prop opens around a player beneath it (canopy pads, trunks).
 *             Implies noOutline — a plain black hull would fill the hole
 *   aim    — (optional) { x0,y0,z0, x1,y1,z1, nativeLen } — place the prop's
 *             local +x axis along a 3D segment (canopy branch bridges)
 *
 * Typical radii by model type:
 *   boulder  0.75   tower  0.9   rock (cluster)  0.75
 *   tree     0.6    crate  0.5   barrel          0.35   pc  0.5
 *   blueBoulder 0.75   redRock 0.75   firePlant 0.5
 *   mossyBoulder 0.65-0.8   ship 2.1 (grounded scout ship, scale 2.0)
 *   shipPlant 0.45   crateStack 0.55   pipeManifold — (wall-line, no r)
 *   mawCanopyTree 0.7   mawBanyanTree 0.8   mawFernCluster 0.45
 *   mawPlant 0.55   mawMossIdol 0.9   mawMossBoulder 0.7   mawGlowShroom — (walkable)
 *   hollowCaveMouth 2.2 (walk-in entrance — see _addCaveEntrance)
 *   hollowStalagmites 0.9   hollowIceCrystal 0.6   hollowIceRubble 0.5
 *   hollowMammothSkull 1.1   hollowBoneArch — (walk under)   hollowFrostShroom — (walkable)
 *   landAdit 2.0 (walk-in mine mouth — see _addCaveEntrance)   landOutcrop 1.0
 *   landTent 0.9   landCampfire 0.5   landBush 0.5   landLog 0.6
 *   landGrass / landFlowers — (walkable ground cover, scattered not hand-placed)
 *   atlGuardianHead 1.5-1.6   atlTempleDome 2.2   atlCrystalHeart 1.7 (dais)
 *   atlColumn / atlColumnBroken 0.5   atlRuinWall 1.0   atlShipwreck 1.3
 *   atlStele 0.5   atlBrazier 0.35   atlAmphora 0.5   atlStoneFish 0.5
 *   atlArchway — (walk under)   atlKelp / atlCoral — (walkable, noOutline)
 *
 * Ground cover is the one thing here that is generated rather than authored:
 * ~110 grass/flower/bush entries would be unreadable as a literal and pointless
 * to hand-tune. `scatterGroundCover()` below emits ordinary entries from a
 * fixed seed, so the result is still plain data on the normal placement path —
 * it streams, late-attaches and collides exactly like a hand-written row.
 *
 * To add a new model type:
 *   1. Add its GLB to models/ (e.g. models/MyProp.glb) — a failed load is
 *      cached only for the current page's lifetime; reload and it retries
 *   2. Add it to the loadModel() list in Environment constructor (_modelsReady)
 *   3. Add the key to the _glb destructure in the .then() callback
 *   4. Reference the key here with { model: 'myProp', ... }
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

/** Distance from point p to segment a→b on the XZ plane. */
function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const L2 = dx * dx + dz * dz;
  if (L2 < 1e-9) return Math.hypot(px - ax, pz - az);
  let t = ((px - ax) * dx + (pz - az) * dz) / L2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

/**
 * Seeded ground-cover scatter. Emits plain ZONE_ASSETS entries, so the result
 * is indistinguishable from hand-authored rows downstream.
 *
 * All ground cover is walkable (no `r`): a meadow the player has to steer
 * around is worse than one they brush through, and the starting zone is where
 * movement should feel loosest. Keep-out shapes are therefore about *sight*,
 * not collision — grass must not bury a resource node's gather prompt, sit on
 * the landing pad, or clutter a boss arena.
 */
function scatterGroundCover({ seed, count, rMin, rMax, mix, avoidCircles, avoidSegments }) {
  const rng = seededRandom(seed);
  const out = [];
  let guard = 0;
  while (out.length < count && guard++ < count * 40) {
    const ang = rng() * Math.PI * 2;
    // sqrt keeps density even per unit area instead of crowding the centre
    const rad = Math.sqrt(rMin * rMin + rng() * (rMax * rMax - rMin * rMin));
    const x = Math.cos(ang) * rad;
    const z = Math.sin(ang) * rad;
    if (avoidCircles.some(c => Math.hypot(x - c.x, z - c.z) < c.r)) continue;
    if (avoidSegments.some(s => segDist(x, z, s.ax, s.az, s.bx, s.bz) < s.r)) continue;
    if (out.some(e => Math.hypot(x - e.x, z - e.z) < 1.05)) continue;

    let roll = rng(), pick = mix[mix.length - 1];
    for (const m of mix) {
      if (roll < m.p) { pick = m; break; }
      roll -= m.p;
    }
    out.push({
      model: pick.model,
      x: Math.round(x * 100) / 100,
      z: Math.round(z * 100) / 100,
      scale: Math.round((pick.s0 + rng() * (pick.s1 - pick.s0)) * 100) / 100,
      rotY: Math.round(rng() * Math.PI * 2 * 100) / 100,
      // No ink line on ground cover. addOutline floors hull thickness at
      // MIN_OUTLINE_WORLD (0.045) so sub-unit props get a *visible* outline at
      // all — but on a 0.9-unit shrub that is ~5% of its size against ~1% on a
      // 3.6-unit tree, so the cover reads as dark inky blobs instead of soft
      // meadow. Skipping it also drops ~150 draw calls, which the phone build
      // notices and the look does not.
      noOutline: true,
    });
  }
  return out;
}

// Keep-outs for the Landing Site meadow scatter. The mountain radius matches
// the collision circle in the zone builder; the path segment is the tutorial
// walk from the landing pad to the mine adit.
const _LANDING_KEEPOUT = [
  { x: 0, z: 0, r: 3.6 },        // landing pad
  { x: 4, z: -3, r: 2.8 },       // Spaceship gate
  { x: -10, z: -10, r: 2.8 },    // Mine gate
  { x: -18, z: -18, r: 11 },     // mountain footprint
  { x: 6.8, z: -6.2, r: 3.2 },   // grounded scout ship
  { x: 9.4, z: 8.6, r: 4.4 },    // survivor camp clearing
  { x: 18, z: 18, r: 5.0 },      // Scrap Tyrant arena floor
  { x: 14, z: -24, r: 5.5 },     // lookout knoll + shelf ramp
  // Resource nodes — grass must not bury a gather prompt.
  { x: -6, z: -3, r: 1.4 }, { x: 10, z: -8, r: 1.4 }, { x: -8, z: 5, r: 1.4 },
  { x: -10, z: 2, r: 1.4 }, { x: 7, z: 6, r: 1.4 }, { x: -16, z: -9, r: 1.4 },
  { x: -9, z: -16, r: 1.4 }, { x: 3, z: 8, r: 1.4 }, { x: -3, z: 10, r: 1.4 },
  { x: 14, z: -4, r: 1.4 }, { x: -19, z: 9, r: 1.4 }, { x: 21, z: -14, r: 1.4 },
  { x: 24, z: 6, r: 1.4 },
];
const _LANDING_KEEPOUT_SEGS = [
  { ax: 0, az: 0, bx: -11.5, bz: -11.5, r: 1.6 },  // pad → mine gate → adit mouth
];

// The Verdant Maw's canopy structure comes from the same constants the
// walkable surfaces and the Blender export use — one source of truth.
import { PLACEMENTS as MAW_CANOPY_PLACEMENTS, EXPANSE_BANDS as MAW_BANDS,
         RIVERS as MAW_RIVERS, riverZAt as mawRiverZAt,
         EMBER_TREE as MAW_EMBER_TREE, ARCH_FEET as MAW_ARCH_FEET,
         GROTTO_TRAIL as MAW_GROTTO_TRAIL } from './zones/VerdantMaw/canopy.js';
// Same discipline for the Frozen Tundra's glacier: the risers, rift flanks,
// spans, arch and dune field are generated from the constants that define the
// walkable surfaces, so the ice you see is the ice you stand on.
import { GLACIER_PROPS, SASTRUGI_FIELD } from './zones/FrozenTundra/glacier.js';

/**
 * Jungle fill for the Maw's River Expanse (z −36..−100): dense canopy-tree /
 * foliage walls on the flanks (|x| 19..31) so the enlarged ground never reads
 * as blank floor, plus sparse ferns/shrooms on the band floors between the
 * rivers. Same emitted-rows convention as scatterGroundCover. Keeps clear of
 * river courses, pad stems, and spire feet (the ramp approach must stay open).
 */
function scatterMawExpanse(seed) {
  const rng = seededRandom(seed);
  const stems = MAW_BANDS.flatMap(b => [...b.pads.map(p => [p.x, p.z, 2.6]), [b.spire[0], b.spire[1], 4.5]]);
  const clearOfWater = (x, z) => MAW_RIVERS.every(r => Math.abs(z - mawRiverZAt(r, x)) > 4.4);
  const clearOfStems = (x, z) => stems.every(([sx, sz, sr]) => Math.hypot(x - sx, z - sz) > sr);
  const out = [];
  const put = (model, x, z, s0, s1, extra = {}) => {
    if (!clearOfWater(x, z) || !clearOfStems(x, z)) return;
    if (out.some(e => Math.hypot(x - e.x, z - e.z) < 2.2)) return;
    out.push({ model, x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100,
      scale: Math.round((s0 + rng() * (s1 - s0)) * 100) / 100,
      rotY: Math.round(rng() * Math.PI * 2 * 100) / 100, ...extra });
  };
  // Flank jungle walls — a tree or foliage mass every ~5.5 with jitter.
  // North of the transitional line (z < −68, Raya/Kumandra phase) the mix
  // shifts warm: golden bamboo groves and gold-green broadleafs join the
  // rolls, growing more common the deeper north the row sits.
  for (const side of [-1, 1]) {
    for (let z = -37; z > -101; z -= 5.5) {
      const x = side * (19 + rng() * 12), zz = z + (rng() - 0.5) * 3.5;
      const warm = Math.max(0, Math.min(1, (-68 - zz) / 30)); // 0 south → 1 by −98
      const roll = rng();
      if (roll < 0.38 * warm) {
        if (rng() < 0.5) put('jungleBambooGrove', x, zz, 1.0, 1.35, { r: 0.7 });
        else put('jungleGoldTree', x, zz, 1.35, 1.7, { r: 0.7 });
      }
      else if (roll < 0.34) put('mawCanopyTree', x, zz, 1.5, 1.85, { r: 0.7 });
      else if (roll < 0.5) put('mawBanyanTree', x, zz, 1.35, 1.7, { r: 0.7 });
      else if (roll < 0.78) put('jungleCanopyMass', x, zz, 1.6, 2.05, { reveal: true });
      else put('mawFernCluster', x, zz, 1.1, 1.5, { noOutline: true });
    }
  }
  // Band-floor undergrowth — sparse, walkable-through (no r); small bamboo
  // shoots start appearing in the warm half.
  for (let i = 0; i < 34; i++) {
    const x = -16 + rng() * 32, z = -38 - rng() * 60;
    const roll = rng();
    if (z < -68 && roll < 0.18) put('jungleBambooGrove', x, z, 0.5, 0.75, { noOutline: true });
    else if (roll < 0.4) put('mawFernCluster', x, z, 0.9, 1.3, { noOutline: true });
    else if (roll < 0.7) put('mawGlowShroom', x, z, 0.55, 0.9, { noOutline: true });
    else put('mawPlant', x, z, 0.8, 1.15, { noOutline: true });
  }
  return out;
}

/**
 * River-bank dressing for the four expanse rivers: mossy boulders, ferns and
 * glow shrooms hugging each bank (|Δz| 3.3..4.3 off the wavy centerline — a
 * band the flank/undergrowth scatter deliberately leaves empty), plus a few
 * midstream stones ON the centerline (visual only; the collision chain
 * already blocks the water). Sells "river" instead of "painted stripe".
 */
function scatterRiverBanks(seed) {
  const rng = seededRandom(seed);
  const stems = MAW_BANDS.flatMap(b => [...b.pads.map(p => [p.x, p.z, 2.8]), [b.spire[0], b.spire[1], 4.5]]);
  const clearOfStems = (x, z) => stems.every(([sx, sz, sr]) => Math.hypot(x - sx, z - sz) > sr);
  const out = [];
  const put = (model, x, z, s0, s1, extra = {}) => {
    if (!clearOfStems(x, z)) return;
    if (out.some(e => Math.hypot(x - e.x, z - e.z) < 1.7)) return;
    out.push({ model, x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100,
      scale: Math.round((s0 + rng() * (s1 - s0)) * 100) / 100,
      rotY: Math.round(rng() * Math.PI * 2 * 100) / 100, ...extra });
  };
  for (const r of MAW_RIVERS) {
    const warm = r.z < -60; // rivers 3-4 sit inside the transitional phase
    for (let x = -34; x <= 34; x += 4.2) {
      const xx = x + (rng() - 0.5) * 2.4;
      const side = rng() < 0.5 ? -1 : 1;
      const zz = mawRiverZAt(r, xx) + side * (3.3 + rng() * 1.0);
      const roll = rng();
      if (warm && roll < 0.22) put('jungleBambooGrove', xx, zz, 0.5, 0.75, { noOutline: true });
      else if (roll < 0.38) put('mawMossBoulder', xx, zz, 0.55, 0.85, { r: 0.5 });
      else if (roll < 0.72) put('mawFernCluster', xx, zz, 0.8, 1.15, { noOutline: true });
      else put('mawGlowShroom', xx, zz, 0.45, 0.7, { noOutline: true });
    }
    // midstream stones — two or three per river, breaking the surface
    for (let i = 0; i < 3; i++) {
      const xx = -30 + rng() * 60;
      if (i === 2 && rng() < 0.4) continue;
      put('mawMossBoulder', xx, mawRiverZAt(r, xx) + (rng() - 0.5) * 1.2, 0.45, 0.65, {});
    }
  }
  return out;
}

/**
 * The Well of Souls' enclosure (z −104..−147): a jungle ring around the
 * sanctum bowl (parted at the gateway sector where the trail walks in), the
 * world-end wall behind it, dressing in the outer bowl — the web rings
 * (r < 11.5 of the tree) stay clean — and flank fill continuing the expanse
 * walls south of the gateway. Keeps clear of the trail and every arch pier.
 */
function scatterGrottoRim(seed) {
  const rng = seededRandom(seed);
  const T = MAW_EMBER_TREE;
  const trailClear = (x, z) => MAW_GROTTO_TRAIL.every(([tx, tz]) => Math.hypot(x - tx, z - tz) > 2.6);
  const feetClear = (x, z) => MAW_ARCH_FEET.every(f => Math.hypot(x - f.x, z - f.z) > f.r + 1.6);
  const out = [];
  const put = (model, x, z, s0, s1, extra = {}) => {
    if (!trailClear(x, z) || !feetClear(x, z)) return;
    if (out.some(e => Math.hypot(x - e.x, z - e.z) < 2.2)) return;
    out.push({ model, x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100,
      scale: Math.round((s0 + rng() * (s1 - s0)) * 100) / 100,
      rotY: Math.round(rng() * Math.PI * 2 * 100) / 100, ...extra });
  };
  // Enclosure ring — gateway sector (toward +z, where the trail enters) parts
  const GATE_ANG = Math.atan2(-104.5 - T.z, -0.5 - T.x); // ≈ π/2
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * 2 * Math.PI + (rng() - 0.5) * 0.18;
    let d = Math.abs(a - GATE_ANG) % (2 * Math.PI);
    if (d > Math.PI) d = 2 * Math.PI - d;
    if (d < 0.55) continue;
    const r = 16.5 + rng() * 5;
    const x = T.x + Math.cos(a) * r, z = T.z + Math.sin(a) * r;
    if (Math.abs(x) > 38 || z < -145.5 || z > -104.5) continue;
    const roll = rng();
    if (roll < 0.22) put('jungleBambooGrove', x, z, 1.05, 1.4, { r: 0.7 });
    else if (roll < 0.42) put('jungleGoldTree', x, z, 1.4, 1.75, { r: 0.7 });
    else if (roll < 0.62) put('mawCanopyTree', x, z, 1.55, 1.9, { r: 0.7 });
    else if (roll < 0.76) put('mawBanyanTree', x, z, 1.4, 1.7, { r: 0.7 });
    else put('jungleCanopyMass', x, z, 1.7, 2.05, { reveal: true });
  }
  // World-end wall — the zone ends on jungle, never on the ground plane's edge
  for (let x = -36; x <= 36; x += 6) {
    const xx = x + (rng() - 0.5) * 3, zz = -144.5 - rng() * 2;
    if (rng() < 0.6) put('jungleCanopyMass', xx, zz, 1.75, 2.1, { reveal: true });
    else put('mawCanopyTree', xx, zz, 1.6, 1.95, { r: 0.7 });
  }
  // Outer-bowl dressing (between the web and the ring)
  for (let i = 0; i < 14; i++) {
    const a = rng() * 2 * Math.PI, r = 11.5 + rng() * 4;
    const x = T.x + Math.cos(a) * r, z = T.z + Math.sin(a) * r;
    if (z > -105) continue;
    const roll = rng();
    if (roll < 0.45) put('mawGlowShroom', x, z, 0.55, 0.9, { noOutline: true });
    else if (roll < 0.75) put('mawFernCluster', x, z, 0.9, 1.25, { noOutline: true });
    else put('mawPlant', x, z, 0.8, 1.1, { noOutline: true });
  }
  // Flank fill — the expanse's jungle walls continue past the gateway, now
  // fully inside the warm phase: bamboo and gold broadleaf lead the mix
  for (const side of [-1, 1]) {
    for (let z = -105; z > -142; z -= 5.5) {
      const x = side * (20 + rng() * 11), zz = z + (rng() - 0.5) * 3.5;
      const roll = rng();
      if (roll < 0.24) put('jungleBambooGrove', x, zz, 1.0, 1.35, { r: 0.7 });
      else if (roll < 0.46) put('jungleGoldTree', x, zz, 1.35, 1.7, { r: 0.7 });
      else if (roll < 0.6) put('mawCanopyTree', x, zz, 1.5, 1.85, { r: 0.7 });
      else if (roll < 0.82) put('jungleCanopyMass', x, zz, 1.6, 2.05, { reveal: true });
      else put('mawFernCluster', x, zz, 1.1, 1.5, { noOutline: true });
    }
  }
  return out;
}

export const ZONE_ASSETS = {
  // ── Landing Site ────────────────────────────────────────────────────────────
  // The starting zone, and the game's first impression. It carried generic
  // pre-Rodin starter props long after every other zone got a native pack, so
  // the Landing_* set below is its own art: ground cover, a survivor camp, a
  // timber mine adit for the mountain, and outcrops/logs filling the outer ring
  // that used to be bare green out to the ±39 bound.
  landingSite: [
    { model: 'tower',   x: -7,   z: -6,  scale: 1.5,  rotY: Math.PI * 0.75, r: 0.9  },
    { model: 'crate',   x: 2,    z: 3,   scale: 0.55, rotY: 0.4,            r: 0.5  },
    { model: 'crate',   x: -2,   z: 2,   scale: 0.5,  rotY: 1.1,            r: 0.5  },
    // treeH2 = cavity-ink variant of treeH (A/B beside the pool's plain H trees)
    { model: 'treeH2',  x: 6,    z: 10,  scale: 1.6,  rotY: 0.5,            r: 0.6  },
    { model: 'treeI',   x: -5,   z: 12,  scale: 1.7,  rotY: 2.1,            r: 0.6  },
    { model: 'treeD',   x: 11,   z: -2,  scale: 1.6,  rotY: 0.9,            r: 0.6  },
    // Boulders — placed near the forest perimeter and path edges
    { model: 'boulder', x: -4,   z: 7,   scale: 0.85, rotY: 0.3,            r: 0.75 },
    { model: 'boulder', x: 9,    z: 5,   scale: 0.7,  rotY: 1.9,            r: 0.75 },
    { model: 'boulder', x: -8,   z: -5,  scale: 0.65, rotY: 0.8,            r: 0.75 },
    // Grounded scout ship — the site's namesake, parked beside the Spaceship gate
    { model: 'ship',    x: 6.8,  z: -6.2, scale: 2.0, rotY: -0.83,          r: 2.1  },
    { model: 'mossyBoulder', x: -6, z: 9,   scale: 0.8, rotY: 0.7,          r: 0.8  },
    { model: 'mossyBoulder', x: 12, z: 2,   scale: 0.6, rotY: 2.4,          r: 0.65 },
    { model: 'rock',    x: 5,    z: -12, scale: 0.7,  rotY: 1.2,            r: 0.75 },

    // ── Survivor camp ───────────────────────────────────────────────────────
    // Mara and Finch stand here (placed by the zone builder via _addNpc, since
    // NPCs are rigged and need a mixer). Tent faces the fire; the fire is the
    // clearing's centre so the two NPCs read as talking across it.
    // Thin canvas shell — see `noOutline` in the header; with the auto-hull it
    // renders as a solid black triangle.
    { model: 'landTent',     x: 8.0,  z: 10.4, scale: 1.0, rotY: 3.6,  r: 0.9, noOutline: true },
    { model: 'landCampfire', x: 9.6,  z: 8.4,  scale: 1.0, rotY: 0.5,  r: 0.5  },
    { model: 'crate',        x: 12.2, z: 10.6, scale: 0.5, rotY: 2.2,  r: 0.5  },
    { model: 'barrel',       x: 6.4,  z: 8.0,  scale: 0.55, rotY: 0.9, r: 0.35 },
    { model: 'landLog',      x: 11.2, z: 7.0,  scale: 1.0, rotY: 0.35, r: 0.6  },

    // ── Mine adit ───────────────────────────────────────────────────────────
    // Set into the foot of the mountain's east flank, directly behind the Mine
    // gate at (-10,-10) and turned to face it — so the Ancient World Gate now
    // stands in the mouth of a timber-framed mine entrance instead of on blank
    // grass in front of a featureless cone. The gate is still what transports
    // the player; the adit is the reason the gate is standing there.
    // Sits just inside the mountain's skirt cone (radius 8.8 at (-18,-18)) so
    // it reads as cut *into* the hillside rather than propped against it, and
    // is scaled up to 4.5 units tall — at the stock 3.6 it was a doorway lost
    // against a 13.5-unit peak. The Mine gate at (-10,-10) stands ~2.7 in front.
    { model: 'landAdit', x: -11.9, z: -11.9, scale: 1.25, rotY: 0.785, r: 1.9 },

    // ── Outer ring ──────────────────────────────────────────────────────────
    // Everything past the r=14 treeline used to be empty ground out to ±39.
    // These are the landmarks that give the outer meadow somewhere to look.
    { model: 'landOutcrop', x: 22,   z: -6,   scale: 1.2, rotY: 0.4,  r: 1.15 },
    { model: 'landOutcrop', x: -24,  z: 4,    scale: 1.0, rotY: 2.1,  r: 1.0  },
    { model: 'landOutcrop', x: 6,    z: 26,   scale: 1.3, rotY: 3.9,  r: 1.25 },
    { model: 'landOutcrop', x: -14,  z: 24,   scale: 0.9, rotY: 5.1,  r: 0.95 },
    { model: 'landOutcrop', x: 27,   z: 14,   scale: 1.1, rotY: 1.4,  r: 1.1  },
    { model: 'landOutcrop', x: -21,  z: -25,  scale: 1.0, rotY: 2.8,  r: 1.0  },
    { model: 'landLog',     x: -18,  z: 14,   scale: 1.1, rotY: 1.1,  r: 0.6  },
    { model: 'landLog',     x: 16,   z: -20,  scale: 0.9, rotY: 2.7,  r: 0.55 },
    { model: 'landLog',     x: 24,   z: 20,   scale: 1.0, rotY: 0.2,  r: 0.6  },
    { model: 'landLog',     x: -9,   z: 27,   scale: 0.95, rotY: 4.4, r: 0.6  },
    { model: 'mossyBoulder', x: 20,  z: 25,   scale: 0.9, rotY: 1.7,  r: 0.8  },
    { model: 'mossyBoulder', x: -27, z: -12,  scale: 0.85, rotY: 3.3, r: 0.8  },
    { model: 'boulder',     x: 13,   z: 22,   scale: 0.8, rotY: 2.5,  r: 0.75 },
    { model: 'boulder',     x: -22,  z: 18,   scale: 0.9, rotY: 0.6,  r: 0.75 },
    { model: 'rock',        x: 29,   z: -2,   scale: 0.75, rotY: 1.9, r: 0.75 },
    { model: 'rock',        x: -6,   z: -26,  scale: 0.7, rotY: 3.5,  r: 0.75 },
    // Lookout knoll — climbable outcrop; walkable surfaces + collision are
    // registered by the zone builder from zones/LandingSite/knoll.js.
    { model: 'landKnoll',   x: 14,   z: -24,  scale: 1.0, rotY: 0 },

    // ── Ground cover ────────────────────────────────────────────────────────
    ...scatterGroundCover({
      seed: 41207,
      count: 150,
      rMin: 3.6,
      rMax: 31,
      mix: [
        { model: 'landGrass',    p: 0.56, s0: 0.75, s1: 1.5 },
        { model: 'landFlowers',  p: 0.26, s0: 0.8,  s1: 1.4 },
        { model: 'landBush',     p: 0.18, s0: 0.8,  s1: 1.3 },
      ],
      avoidCircles: _LANDING_KEEPOUT,
      avoidSegments: _LANDING_KEEPOUT_SEGS,
    }),
  ],

  // ── The Mine ────────────────────────────────────────────────────────────────
  // Entrance chamber sits around (0,-30); working cavern spans z≈-10…13.
  // Keep the x=0 spine (entrance → shaft → cavern) clear of collision props.
  mine: [
    { model: 'barrel',  x: 3.4,   z: -30.5, scale: 0.6,  rotY: 0.3,  r: 0.35 },
    { model: 'barrel',  x: -3.8,  z: -31,   scale: 0.55, rotY: 1.8,  r: 0.35 },
    { model: 'crate',   x: -4.6,  z: -29,   scale: 0.5,  rotY: 0.9,  r: 0.5  },
    { model: 'barrel',  x: -12.6, z: 1.2,   scale: 0.5,  rotY: 0.9,  r: 0.35 },
    { model: 'rock',    x: 19.2,  z: 0,     scale: 0.7,  rotY: 0.2,  r: 0.75, tint: 0x5f574c },
    { model: 'rock',    x: -16,   z: 3.2,   scale: 0.65, rotY: 1.5,  r: 0.75, tint: 0x5f574c },
    { model: 'boulder', x: -6.4,  z: -8,    scale: 0.8,  rotY: 0.6,  r: 0.75, tint: 0x5f574c },
    { model: 'redRock', x: 15.4,  z: 8.4,   scale: 0.75, rotY: 1.1,  r: 0.75 },
  ],

  // ── Verdant Maw ─────────────────────────────────────────────────────────────
  // Native jungle pack (Jungle_*.glb, source Assets/3D/VerdantMaw). Player
  // spawns at (0,14) by the south portal (0,17) — that corridor stays clear.
  // Resource nodes and enemy spawn posts (see Environment.js) get ≥1.5 units.
  verdantMaw: [
    // Canopy giants — the jungle's outer wall
    { model: 'mawCanopyTree', x: -13, z: -11, scale: 1.75,  rotY: 0.8,  r: 0.7  },
    { model: 'mawCanopyTree', x: 14,  z: 12,  scale: 1.9,  rotY: 2.4,  r: 0.7  },
    { model: 'mawCanopyTree', x: -3,  z: -15, scale: 1.8, rotY: 4.1,  r: 0.7  },
    // was (13,-12), then (6.5,-11) — both parked a jungle-wall giant on the
    // climb's doorstep (the trail now runs the SW approach right past 6.5,-11)
    { model: 'mawCanopyTree', x: -2, z: -13, scale: 1.7, rotY: 1.6,  r: 0.7  },
    { model: 'mawCanopyTree', x: -15, z: 9,   scale: 1.75,  rotY: 5.2,  r: 0.7  },
    { model: 'mawCanopyTree', x: 8,   z: 15,  scale: 1.65,  rotY: 3.3,  r: 0.7  },
    // Banyans — vine-draped mid-ring anchors
    { model: 'mawBanyanTree', x: 15,  z: 2,   scale: 1.55,  rotY: 0.5,  r: 0.8  },
    { model: 'mawBanyanTree', x: -15, z: -12, scale: 1.5, rotY: 2.9,  r: 0.8  },
    { model: 'mawBanyanTree', x: -6,  z: 14,  scale: 1.45,  rotY: 4.6,  r: 0.8  },
    // Understorey ferns
    { model: 'mawFernCluster', x: -2, z: 9,   scale: 1.0,  rotY: 1.1,  r: 0.45 },
    { model: 'mawFernCluster', x: 6,  z: 2,   scale: 0.9,  rotY: 3.8,  r: 0.45 },
    { model: 'mawFernCluster', x: -7, z: -12, scale: 1.05, rotY: 5.5,  r: 0.45 },
    // Carnivorous maw plants — the zone's namesake hazards-in-look
    { model: 'mawPlant',      x: -11, z: 5,   scale: 1.0,  rotY: 0.9,  r: 0.55 },
    { model: 'mawPlant',      x: 9,   z: -10, scale: 0.95, rotY: 2.6,  r: 0.55 },
    // Overgrown idol — gateway landmark on the walk in from the portal
    // (exported facing game +z / the camera, so no flip needed)
    { model: 'mawMossIdol',   x: 0,   z: 8,   scale: 1.0,  rotY: 0, r: 0.9 },
    // Mossy boulders
    { model: 'mawMossBoulder', x: -14, z: 2,  scale: 1.0,  rotY: 0.4,  r: 0.7  },
    { model: 'mawMossBoulder', x: 5,  z: -14, scale: 0.9,  rotY: 2.2,  r: 0.7  },
    { model: 'mawMossBoulder', x: 16, z: 6,   scale: 1.1,  rotY: 4.9,  r: 0.7  },
    // Glow shrooms — the night jungle's own light. The original three accents
    // grew into a constellation when the zone went bioluminescent (they and
    // the point-light presets carry the Pandora look; density is the point).
    { model: 'mawGlowShroom', x: -3,  z: 3,   scale: 0.55,  rotY: 1.3 },
    { model: 'mawGlowShroom', x: 11,  z: 3,   scale: 0.6,  rotY: 3.1 },
    { model: 'mawGlowShroom', x: -9,  z: -11, scale: 0.5, rotY: 5.0 },
    { model: 'mawGlowShroom', x: 5.5, z: 8.5, scale: 0.5,  rotY: 0.4 },
    { model: 'mawGlowShroom', x: -12, z: -2,  scale: 0.65, rotY: 2.2 },
    { model: 'mawGlowShroom', x: 2,   z: -10, scale: 0.45, rotY: 4.1 },
    { model: 'mawGlowShroom', x: 14,  z: -4,  scale: 0.55, rotY: 5.6 },
    { model: 'mawGlowShroom', x: -6,  z: -15, scale: 0.6,  rotY: 1.8 },
    { model: 'mawGlowShroom', x: 9,   z: 12,  scale: 0.5,  rotY: 3.7 },
    { model: 'mawGlowShroom', x: -16, z: 5,   scale: 0.55, rotY: 0.9 },
    // Around the Hometree's root flare and the climb entrance
    { model: 'mawGlowShroom', x: 10.2, z: -14.6, scale: 0.6, rotY: 2.6 },
    { model: 'mawGlowShroom', x: 16.2, z: -16.5, scale: 0.5, rotY: 4.4 },
    { model: 'mawFernCluster', x: 9.2, z: -16.8, scale: 1.1, rotY: 0.6, r: 0.45 },
    { model: 'mawFernCluster', x: 16.6, z: -13.4, scale: 0.95, rotY: 2.9, r: 0.45 },
    // Glow shrooms up in the canopy — placed at pad height via `y`, walkable
    { model: 'mawGlowShroom', x: -12.2, z: -15.3, scale: 0.5, rotY: 1.1, y: 7.4 },
    { model: 'mawGlowShroom', x: -15.6, z: -0.6,  scale: 0.45, rotY: 3.3, y: 6.8 },
    { model: 'mawGlowShroom', x: -7.2,  z: 3.4,   scale: 0.5, rotY: 0.6, y: 6.2 },
    { model: 'mawGlowShroom', x: 5.2,   z: 6.1,   scale: 0.45, rotY: 4.8, y: 6.9 },
    { model: 'mawGlowShroom', x: 12.3,  z: -1.0,  scale: 0.5, rotY: 2.4, y: 7.6 },
    // Rodin Pandora flora — helicoradian spirals + puffball glow trees
    // (exported at true world scale, so scale ≈ 1.0)
    { model: 'pandoraHelicoradian', x: -1.5, z: -8.5, scale: 1.0, rotY: 0.7, r: 0.5 },
    { model: 'pandoraHelicoradian', x: 7.5,  z: 9.5,  scale: 0.85, rotY: 2.9, r: 0.45 },
    { model: 'pandoraHelicoradian', x: 16.8, z: -20.5, scale: 1.1, rotY: 4.6, r: 0.55 },
    // Gate sentinels — a flanking pair at the Root Gate so the ascent
    // entrance reads from across the zone (the arch alone is night-subtle).
    // The gate now sits on the SW approach line, aimed NE at the helix foot,
    // so the sentinels flank along its NW–SE leg axis.
    { model: 'pandoraHelicoradian', x: 11.0, z: -12.8, scale: 0.9,  rotY: 1.8, r: 0.5 },
    { model: 'pandoraHelicoradian', x: 6.8,  z: -17.0, scale: 0.95, rotY: 4.1, r: 0.5 },
    { model: 'pandoraPuffball', x: 5,     z: 13.5, scale: 1.0, rotY: 1.2, r: 0.4 },
    { model: 'pandoraPuffball', x: -16.5, z: -5.5, scale: 0.9, rotY: 3.8, r: 0.4 },
    // Maw-tender hamlet — NW clearing. Homes exported at true world scale
    // (station convention, attach scale 1.0), doors turned toward the zone
    // centre. Their NPCs stand outside, placed by the zone builder (_addNpc).
    { model: 'homeSylva', x: -12,   z: 11,   scale: 1.0, rotY: 2.3,  r: 1.3 },
    { model: 'homeBram',  x: -8.4,  z: 13.2, scale: 1.0, rotY: 2.6,  r: 1.3 },
    { model: 'homeSprig', x: -14.3, z: 14.3, scale: 1.0, rotY: 2.36, r: 1.1 },
    // Pandora canopy structure — Hometree, pads, bridges, Spirit Tree.
    // Placements (with y/reveal/aim) live in zones/VerdantMaw/canopy.js
    // beside the walkable surfaces they must match. Collision comes from
    // canopy.js's circle lists (registered by the zone builder), not here.
    ...MAW_CANOPY_PLACEMENTS,
    // River Expanse jungle fill (flank walls + band-floor undergrowth)
    ...scatterMawExpanse(72027),
    // River-bank dressing + midstream stones (river v2)
    ...scatterRiverBanks(41077),
    // Well of Souls enclosure — sanctum ring, world-end wall, flank fill
    ...scatterGrottoRim(90211),
    // Gateway arch flankers — the scene-transition threshold glows (the
    // violet rock alone is night-subtle from the south approach)
    { model: 'mawGlowShroom', x: -3.4, z: -103.2, scale: 0.65, rotY: 1.9 },
    { model: 'mawGlowShroom', x: 2.5,  z: -105.6, scale: 0.6,  rotY: 4.3 },
  ],

  // ── NPC home interiors (Verdant Maw hamlet) ────────────────────────────────
  // Rooms are 4.3-radius discs (see zones/HomeInteriors); keep the door
  // corridor (x≈0, z 1.5→4.3) clear. Furn_* GLBs export at true world scale.
  homeSylva: [
    { model: 'furnSylvaCot',   x: -2.2, z: -1.7, scale: 1.0,  rotY: 0.9,  r: 0.7  },
    { model: 'furnSylvaRack',  x: 1.9,  z: -2.4, scale: 1.0,  rotY: -0.4, r: 0.6  },
    { model: 'furnSylvaTable', x: 2.3,  z: 0.7,  scale: 1.0,  rotY: 0.3,  r: 0.55 },
    { model: 'shipPlant',      x: -2.9, z: 1.1,  scale: 0.9,  rotY: 1.2,  r: 0.45 },
    { model: 'mawGlowShroom',  x: -0.7, z: -3.3, scale: 0.4,  rotY: 2.1 },
  ],
  homeBram: [
    { model: 'furnBramBench',  x: -2.4, z: -1.8, scale: 1.0,  rotY: 0.55, r: 0.8  },
    { model: 'furnBramBed',    x: 2.3,  z: -1.6, scale: 1.0,  rotY: -0.5, r: 0.7  },
    { model: 'furnBramRack',   x: 2.6,  z: 1.0,  scale: 1.0,  rotY: -2.2, r: 0.6  },
    { model: 'barrel',         x: -3.0, z: 0.9,  scale: 0.55, rotY: 2.0,  r: 0.35 },
  ],
  homeSprig: [
    { model: 'furnSprigBench',   x: -2.1, z: -2.0, scale: 1.0,  rotY: 0.7,  r: 0.7  },
    { model: 'furnSprigHammock', x: 2.2,  z: -1.5, scale: 1.0,  rotY: -0.6, r: 0.65 },
    { model: 'furnSprigPots',    x: -2.7, z: 0.8,  scale: 1.0,  rotY: 1.5,  r: 0.5  },
    { model: 'crateStack',       x: 2.5,  z: 1.0,  scale: 0.45, rotY: 0.3,  r: 0.5  },
  ],

  // ── Lagoon Coast ────────────────────────────────────────────────────────────
  lagoonCoast: [
    { model: 'barrel',  x: 7,    z: 3,   scale: 0.65, rotY: 0.5,  r: 0.35 },
    { model: 'barrel',  x: -4,   z: -8,  scale: 0.6,  rotY: 2.0,  r: 0.35 },
    { model: 'crate',   x: -8,   z: 6,   scale: 0.55, rotY: 1.3,  r: 0.5  },
  ],

  // ── Frozen Tundra ───────────────────────────────────────────────────────────
  // Snow-forest ring around an open center; the frozen lake sits at (8,8) r6
  // (ice crystal at 4.5,7.5 juts from the lake ice on purpose). Shrine faces
  // south so the arch reads at the 46° camera. Portal corridor (0,-18) kept clear.
  //
  // The field runs x -30..30, z -24..30. The camera sits at +z, so HIGH z is
  // the near ground at the bottom of the screen — it used to end at z ~ 17 and
  // read as blank white, so the pine line now carries on down to z ~ 28. Keep
  // the trodden path (z ~ 18-20, laid by the zone builder) walkable: props near
  // it sit off to the sides.
  frozenTundra: [
    { model: 'frozenShrine',  x: 2,    z: 14.5, scale: 1.0,  rotY: Math.PI, r: 0.9  },
    { model: 'snowPine',      x: -14,  z: 2,    scale: 1.0,  rotY: 0.4,  r: 0.5  },
    { model: 'snowPine',      x: -11,  z: 13,   scale: 1.1,  rotY: 2.1,  r: 0.5  },
    { model: 'snowPine',      x: 14,   z: -3,   scale: 0.95, rotY: 3.6,  r: 0.5  },
    { model: 'snowPine',      x: -15,  z: -8,   scale: 1.05, rotY: 5.1,  r: 0.5  },
    { model: 'snowPine',      x: 16,   z: 8,    scale: 0.9,  rotY: 1.2,  r: 0.5  },
    { model: 'snowPine',      x: -4,   z: 16,   scale: 1.0,  rotY: 4.4,  r: 0.5  },
    { model: 'snowPineSquat', x: 12,   z: -12,  scale: 1.0,  rotY: 0.9,  r: 0.6  },
    { model: 'snowPineSquat', x: -16,  z: 6,    scale: 0.9,  rotY: 2.7,  r: 0.6  },
    { model: 'snowPineSquat', x: 6,    z: 16.5, scale: 1.1,  rotY: 5.6,  r: 0.6  },
    { model: 'snowPineSquat', x: 17,   z: 2,    scale: 0.95, rotY: 3.9,  r: 0.6  },
    { model: 'tundraDeadTree', x: -12, z: -14,  scale: 0.85, rotY: 1.5,  r: 0.4  },
    { model: 'tundraDeadTree', x: 4,   z: -12,  scale: 0.75, rotY: 4.7,  r: 0.4  },
    { model: 'tundraDeadTree', x: 15,  z: 15,   scale: 0.9,  rotY: 0.3,  r: 0.4  },
    { model: 'iceCrystal',    x: -7,   z: 10,   scale: 1.0,  rotY: 0.7,  r: 0.55 },
    { model: 'iceCrystal',    x: 10,   z: -7,   scale: 0.85, rotY: 2.4,  r: 0.55 },
    { model: 'iceCrystal',    x: -14,  z: -4,   scale: 1.1,  rotY: 4.1,  r: 0.55 },
    { model: 'iceCrystal',    x: 4.5,  z: 7.5,  scale: 0.8,  rotY: 5.3,  r: 0.55 },
    { model: 'snowBoulder',   x: 16,   z: -8,   scale: 1.0,  rotY: 0.6,  r: 0.7  },
    { model: 'snowBoulder',   x: -3,   z: -13,  scale: 0.85, rotY: 2.9,  r: 0.7  },
    { model: 'snowBoulder',   x: -9,   z: -12,  scale: 1.1,  rotY: 4.8,  r: 0.7  },
    // Glacial Hollow entrance. The builder puts the trigger 1.6 units in FRONT
    // of this prop: collision holds the player at r + PLAYER_R (2.25) from the
    // rock, which would sit outside the portal's 2.5-unit interact radius if
    // the trigger shared the prop's centre — the prompt would never fire.
    { model: 'hollowCaveMouth', x: -15, z: 14,  scale: 1.0,  rotY: 0,    r: 1.9  },
    { model: 'hollowIceRubble', x: -12.2, z: 16.4, scale: 1.0, rotY: 1.4, r: 0.5 },
    { model: 'hollowIceRubble', x: -17.6, z: 11.4, scale: 0.85, rotY: 3.7, r: 0.5 },

    // ── Near ground (z 20+) — the band that used to be empty white ──────────
    // Pines thin out toward the bottom of the frame rather than stopping dead.
    { model: 'snowPine',      x: -22,  z: 21,   scale: 1.15, rotY: 0.7,  r: 0.5  },
    { model: 'snowPine',      x: -8,   z: 23,   scale: 1.05, rotY: 2.9,  r: 0.5  },
    { model: 'snowPine',      x: 3,    z: 22,   scale: 1.2,  rotY: 5.0,  r: 0.5  },
    { model: 'snowPine',      x: 14,   z: 24,   scale: 1.1,  rotY: 1.4,  r: 0.5  },
    { model: 'snowPine',      x: 24,   z: 21.5, scale: 1.0,  rotY: 3.8,  r: 0.5  },
    { model: 'snowPine',      x: -17,  z: 27,   scale: 1.25, rotY: 2.2,  r: 0.5  },
    { model: 'snowPine',      x: 8,    z: 27.5, scale: 1.15, rotY: 4.5,  r: 0.5  },
    { model: 'snowPine',      x: -2,   z: 28.5, scale: 1.05, rotY: 0.2,  r: 0.5  },
    { model: 'snowPine',      x: 20,   z: 28,   scale: 1.2,  rotY: 3.1,  r: 0.5  },
    { model: 'snowPineSquat', x: -12,  z: 21.5, scale: 1.05, rotY: 1.9,  r: 0.6  },
    { model: 'snowPineSquat', x: 18,   z: 22,   scale: 1.15, rotY: 4.2,  r: 0.6  },
    { model: 'snowPineSquat', x: -25,  z: 25,   scale: 1.0,  rotY: 0.6,  r: 0.6  },
    { model: 'snowPineSquat', x: 1,    z: 25.5, scale: 1.1,  rotY: 5.4,  r: 0.6  },
    { model: 'snowPineSquat', x: 27,   z: 25,   scale: 0.95, rotY: 2.5,  r: 0.6  },
    { model: 'tundraDeadTree', x: -20, z: 19,   scale: 0.9,  rotY: 3.3,  r: 0.4  },
    { model: 'tundraDeadTree', x: 11,  z: 21,   scale: 0.8,  rotY: 1.1,  r: 0.4  },
    { model: 'tundraDeadTree', x: 23,  z: 26.5, scale: 0.95, rotY: 4.9,  r: 0.4  },
    { model: 'snowBoulder',   x: -5,   z: 20.5, scale: 0.95, rotY: 1.6,  r: 0.7  },
    { model: 'snowBoulder',   x: 16,   z: 26,   scale: 1.05, rotY: 3.7,  r: 0.7  },
    { model: 'snowBoulder',   x: -27,  z: 19,   scale: 1.0,  rotY: 5.2,  r: 0.7  },
    { model: 'iceCrystal',    x: 6,    z: 23.5, scale: 0.9,  rotY: 2.7,  r: 0.55 },
    { model: 'iceCrystal',    x: -14,  z: 24,   scale: 1.05, rotY: 0.4,  r: 0.55 },

    // ── Widened flanks (|x| 20-30) so the field reads deep, not just tall ───
    { model: 'snowPine',      x: -24,  z: -2,   scale: 1.1,  rotY: 1.3,  r: 0.5  },
    { model: 'snowPine',      x: -21,  z: 9,    scale: 1.0,  rotY: 3.9,  r: 0.5  },
    { model: 'snowPine',      x: 22,   z: -6,   scale: 1.15, rotY: 5.1,  r: 0.5  },
    { model: 'snowPine',      x: 26,   z: 6,    scale: 1.05, rotY: 2.0,  r: 0.5  },
    { model: 'snowPine',      x: -19,  z: -18,  scale: 1.1,  rotY: 4.4,  r: 0.5  },
    { model: 'snowPine',      x: 17,   z: -19,  scale: 1.0,  rotY: 0.9,  r: 0.5  },
    { model: 'snowPineSquat', x: -28,  z: 4,    scale: 1.05, rotY: 2.8,  r: 0.6  },
    { model: 'snowPineSquat', x: 25,   z: 14,   scale: 1.1,  rotY: 5.6,  r: 0.6  },
    { model: 'snowPineSquat', x: -8,   z: -20,  scale: 1.0,  rotY: 1.7,  r: 0.6  },
    { model: 'snowPineSquat', x: 9,    z: -22,  scale: 1.15, rotY: 4.0,  r: 0.6  },
    { model: 'snowBoulder',   x: 24,   z: -14,  scale: 1.0,  rotY: 0.5,  r: 0.7  },
    { model: 'snowBoulder',   x: -23,  z: 14,   scale: 0.9,  rotY: 3.4,  r: 0.7  },
    { model: 'iceCrystal',    x: 20,   z: 10,   scale: 1.0,  rotY: 1.8,  r: 0.55 },
    { model: 'iceCrystal',    x: -22,  z: -9,   scale: 0.95, rotY: 4.6,  r: 0.55 },
    { model: 'tundraDeadTree', x: 27,  z: -3,   scale: 0.85, rotY: 2.3,  r: 0.4  },

    // ── The glacier (generated — see zones/FrozenTundra/glacier.js) ────────
    // Stepped shelf risers, Blue Rift flanks, ice spans, the arch, and the
    // sastrugi dune field that replaced the cylinder drifts.
    ...GLACIER_PROPS,
    ...SASTRUGI_FIELD,
  ],

  // ── Glacial Hollow ──────────────────────────────────────────────────────────
  // Ice cave under the tundra. The builder lays the floor, wall ring, frozen
  // pool, ice pillars and lights; everything below is dressing. Return gate at
  // (0,-16) with the player spawning at (0,-13) — that corridor stays clear,
  // as do the eight creature posts and the ore seams in Environment.js.
  glacialHollow: [
    // Landmarks
    { model: 'hollowMammothSkull', x: 0,    z: 8,    scale: 1.0,  rotY: 0,    r: 1.1  },
    // Bone arch is a doorway you walk under — deliberately no collision
    { model: 'hollowBoneArch',     x: -1,   z: -6.5, scale: 1.0,  rotY: 0 },
    // Stalagmite fields
    { model: 'hollowStalagmites',  x: 7.5,  z: -4,   scale: 1.0,  rotY: 0.5,  r: 0.9  },
    { model: 'hollowStalagmites',  x: -9,   z: -2,   scale: 0.85, rotY: 2.3,  r: 0.9  },
    { model: 'hollowStalagmites',  x: 12,   z: 13,   scale: 1.1,  rotY: 4.4,  r: 0.9  },
    { model: 'hollowStalagmites',  x: -14,  z: -11,  scale: 0.9,  rotY: 1.7,  r: 0.9  },
    // Glowing crystal clusters
    { model: 'hollowIceCrystal',   x: -6,   z: 11,   scale: 1.0,  rotY: 0.8,  r: 0.6  },
    { model: 'hollowIceCrystal',   x: 10,   z: 8,    scale: 0.85, rotY: 2.6,  r: 0.6  },
    { model: 'hollowIceCrystal',   x: -13,  z: 4,    scale: 1.15, rotY: 4.9,  r: 0.6  },
    { model: 'hollowIceCrystal',   x: 5,    z: -13,  scale: 0.9,  rotY: 3.2,  r: 0.6  },
    { model: 'hollowIceCrystal',   x: 15,   z: -11,  scale: 1.0,  rotY: 5.5,  r: 0.6  },
    // Frost shrooms — small luminous accents, walkable
    { model: 'hollowFrostShroom',  x: -3.5, z: 4,    scale: 1.0,  rotY: 1.2 },
    { model: 'hollowFrostShroom',  x: 8,    z: 15,   scale: 0.85, rotY: 3.4 },
    { model: 'hollowFrostShroom',  x: -10,  z: 14,   scale: 1.1,  rotY: 5.1 },
    { model: 'hollowFrostShroom',  x: 13,   z: 1,    scale: 0.9,  rotY: 0.3 },
    { model: 'hollowFrostShroom',  x: -16,  z: -4,   scale: 1.0,  rotY: 2.8 },
    // Rubble
    { model: 'hollowIceRubble',    x: 3,    z: -10,  scale: 1.0,  rotY: 0.6,  r: 0.5  },
    { model: 'hollowIceRubble',    x: -8,   z: -15,  scale: 0.9,  rotY: 2.1,  r: 0.5  },
    { model: 'hollowIceRubble',    x: 16,   z: 3,    scale: 1.1,  rotY: 4.2,  r: 0.5  },
    { model: 'hollowIceRubble',    x: -16,  z: 8,    scale: 0.85, rotY: 5.7,  r: 0.5  },
    // Rift passage frame — narrows the wall-ring gap at +z (past the
    // Rimefather) so the Meltwater Rift trigger at (0,19) catches everyone;
    // the rear rubble seals the gap against wandering out of the ring.
    { model: 'hollowIceCrystal',   x: -3.2, z: 19.3, scale: 1.05, rotY: 1.9,  r: 0.6  },
    { model: 'hollowIceCrystal',   x: 3.2,  z: 19.3, scale: 0.95, rotY: 4.3,  r: 0.6  },
    { model: 'hollowIceRubble',    x: 0,    z: 21.3, scale: 1.15, rotY: 0.9,  r: 0.9  },
    { model: 'hollowIceRubble',    x: -1.9, z: 20.9, scale: 1.0,  rotY: 3.6,  r: 0.8  },
    { model: 'hollowIceRubble',    x: 1.9,  z: 20.9, scale: 0.95, rotY: 5.2,  r: 0.8  },
  ],

  // ── Meltwater Rift ──────────────────────────────────────────────────────────
  // Geothermal rift below the hollow. The builder lays everything warm
  // (columns, vents, terraces, channel, the two sealed gates); this dressing
  // is the cold entry half's leftover glacier ice. Keep the spawn corridor
  // (x -2..2, z -16..-8) and the two path forks clear.
  meltwaterRift: [
    { model: 'hollowIceCrystal',   x: -6,   z: -11,  scale: 1.0,  rotY: 0.7,  r: 0.6  },
    { model: 'hollowIceCrystal',   x: 7,    z: -12,  scale: 0.9,  rotY: 2.9,  r: 0.6  },
    { model: 'hollowIceCrystal',   x: -13,  z: -8,   scale: 1.1,  rotY: 4.6,  r: 0.6  },
    { model: 'hollowIceRubble',    x: -3.5, z: -15,  scale: 1.0,  rotY: 1.4,  r: 0.5  },
    { model: 'hollowIceRubble',    x: 5,    z: -15,  scale: 0.9,  rotY: 3.8,  r: 0.5  },
  ],

  // ── Atlantis ────────────────────────────────────────────────────────────────
  // Drowned city beyond the Breach. The builder makes the grotto (ring, water,
  // plaza, canal, dais, paths, lights); everything the city LEFT is dressed
  // here. GLBs are export-normalized to true world scale, so 1.0 is baseline.
  // Keep clear: spawn corridor (x -2..2, z -16..-6), the four canal bridges at
  // (0,-6.3)/(0,10.3)/(±8.3,2), and the plaza's inner 5 units around (0,2).
  // Kelp/coral are noOutline: thin open fronds ink solid black, and scatter
  // cover reads as blobs (Landing Site ground-cover lesson).
  atlantis: [
    // Landmarks
    { model: 'atlCrystalHeart', x: 0,     z: 2,     scale: 1.0,  rotY: 0.0,  r: 1.7  },
    { model: 'atlGuardianHead', x: -14.5, z: 6.5,   scale: 1.0,  rotY: 0.9,  r: 1.6  }, // half-drowned in the west pool
    { model: 'atlGuardianHead', x: 13,    z: -6,    scale: 0.92, rotY: -1.0, r: 1.5  }, // upright twin, watching the approach
    { model: 'atlTempleDome',   x: -12,   z: 14.5,  scale: 1.0,  rotY: 0.5,  r: 2.2  },
    { model: 'atlShipwreck',    x: 12.5,  z: -11.5, scale: 1.0,  rotY: 0.7,  r: 1.3  },
    // Generated as a squat glyph trilithon (1.8 tall), not a walk-under arch —
    // placed beside the south path as a monument instead of astride it.
    { model: 'atlArchway',      x: 3.6,   z: 14.6,  scale: 1.0,  rotY: 0.4,  r: 1.3  },

    // Processional way — brazier pairs from the gate, stone fish at the south bridge
    { model: 'atlBrazier',      x: -2.2,  z: -11.5, scale: 1.0,  rotY: 0.3,  r: 0.35 },
    { model: 'atlBrazier',      x: 2.2,   z: -11.5, scale: 0.95, rotY: 2.1,  r: 0.35 },
    { model: 'atlBrazier',      x: -2.2,  z: -8.3,  scale: 1.0,  rotY: 4.0,  r: 0.35 },
    { model: 'atlBrazier',      x: 2.2,   z: -8.3,  scale: 1.05, rotY: 1.1,  r: 0.35 },
    { model: 'atlBrazier',      x: -3.4,  z: 13.2,  scale: 0.95, rotY: 2.8,  r: 0.35 },
    { model: 'atlBrazier',      x: 3.6,   z: 12.2,  scale: 1.0,  rotY: 5.0,  r: 0.35 },
    { model: 'atlStoneFish',    x: -2.5,  z: 10.5,  scale: 1.0,  rotY: 2.6,  r: 0.5  },
    { model: 'atlStoneFish',    x: 2.5,   z: 10.5,  scale: 1.0,  rotY: -2.6, r: 0.5  },

    // Ruin quarters — columns, wall fragments, steles, amphorae
    { model: 'atlColumn',       x: -2.9,  z: -6.0,  scale: 1.0,  rotY: 0.2,  r: 0.5  },
    { model: 'atlColumn',       x: 2.9,   z: -6.0,  scale: 0.97, rotY: 3.3,  r: 0.5  },
    { model: 'atlColumn',       x: -8.7,  z: 12.2,  scale: 0.94, rotY: 1.5,  r: 0.5  },
    { model: 'atlColumnBroken', x: -10.2, z: 17.6,  scale: 1.0,  rotY: 0.8,  r: 0.5  },
    { model: 'atlColumnBroken', x: -16,   z: 13.2,  scale: 0.9,  rotY: 2.4,  r: 0.5  },
    { model: 'atlColumnBroken', x: 6.2,   z: -13.4, scale: 1.05, rotY: 4.4,  r: 0.5  },
    { model: 'atlColumnBroken', x: 17.2,  z: -3,    scale: 0.95, rotY: 1.9,  r: 0.5  },
    { model: 'atlColumnBroken', x: -17.5, z: -2.5,  scale: 1.0,  rotY: 5.6,  r: 0.5  },
    { model: 'atlRuinWall',     x: 7.5,   z: 9.2,   scale: 1.0,  rotY: 0.5,  r: 1.0  },
    { model: 'atlRuinWall',     x: -6.5,  z: -10.5, scale: 0.95, rotY: -0.4, r: 1.0  },
    { model: 'atlRuinWall',     x: 16.5,  z: 0.5,   scale: 1.05, rotY: 1.2,  r: 1.0  },
    { model: 'atlStele',        x: -9.2,  z: 15.8,  scale: 1.0,  rotY: 0.4,  r: 0.5  },
    { model: 'atlStele',        x: 14,    z: 8,     scale: 0.95, rotY: 2.2,  r: 0.5  },
    { model: 'atlStele',        x: -16,   z: -8,    scale: 1.0,  rotY: 4.1,  r: 0.5  },
    { model: 'atlAmphora',      x: 9.6,   z: -9.8,  scale: 1.0,  rotY: 1.0,  r: 0.5  },
    { model: 'atlAmphora',      x: -7.6,  z: 13.6,  scale: 0.9,  rotY: 3.2,  r: 0.5  },
    { model: 'atlAmphora',      x: 3.4,   z: -15.4, scale: 0.95, rotY: 5.1,  r: 0.5  },

    // Water flora — kelp in the pools and canal edges, coral accents (walkable)
    { model: 'atlKelp',  x: -12.5, z: 3.5,   scale: 1.0,  rotY: 0.5,  noOutline: true },
    { model: 'atlKelp',  x: -16.8, z: 7.5,   scale: 0.9,  rotY: 2.0,  noOutline: true },
    { model: 'atlKelp',  x: -11.3, z: 8.8,   scale: 1.1,  rotY: 3.7,  noOutline: true },
    { model: 'atlKelp',  x: 13.6,  z: -14,   scale: 0.95, rotY: 1.2,  noOutline: true },
    { model: 'atlKelp',  x: 9.8,   z: -8.6,  scale: 1.0,  rotY: 4.8,  noOutline: true },
    { model: 'atlKelp',  x: 8.9,   z: 3.9,   scale: 0.9,  rotY: 0.9,  noOutline: true },
    { model: 'atlKelp',  x: -8.7,  z: 0.2,   scale: 1.05, rotY: 2.7,  noOutline: true },
    { model: 'atlKelp',  x: 2.6,   z: 9.7,   scale: 0.85, rotY: 5.5,  noOutline: true },
    { model: 'atlKelp',  x: -3.6,  z: 9.5,   scale: 0.9,  rotY: 1.6,  noOutline: true },
    { model: 'atlKelp',  x: 16.4,  z: 6.8,   scale: 1.0,  rotY: 3.1,  noOutline: true },
    { model: 'atlCoral', x: 14.6,  z: -8.4,  scale: 1.0,  rotY: 0.6,  noOutline: true },
    { model: 'atlCoral', x: 9.2,   z: -13.2, scale: 0.9,  rotY: 2.3,  noOutline: true },
    { model: 'atlCoral', x: -12.9, z: 4.4,   scale: 0.95, rotY: 3.9,  noOutline: true },
    { model: 'atlCoral', x: -15.8, z: 4.2,   scale: 0.85, rotY: 1.4,  noOutline: true },
    { model: 'atlCoral', x: 7.9,   z: 10.8,  scale: 1.0,  rotY: 5.2,  noOutline: true },
    { model: 'atlCoral', x: 18,    z: 2.2,   scale: 0.9,  rotY: 0.2,  noOutline: true },
  ],

  // ── Spaceship Interior ──────────────────────────────────────────────────────
  // shipShell = full hull architecture (deck + walls + glow + baked outline
  // hull) authored in Assets/3D/SpaceshipInterior — always at origin, scale 1.
  // Wall-line props (pipe manifolds) sit outside the walkable ring, so no r.
  spaceship: [
    { model: 'shipShell',    x: 0,     z: 0,    scale: 1.0 },
    { model: 'shipPlant',    x: -9.6,  z: 9.2,  scale: 1.0,  rotY: 0.4,             r: 0.45 },
    { model: 'shipPlant',    x: 9.6,   z: 9.2,  scale: 0.9,  rotY: 2.6,             r: 0.45 },
    { model: 'shipPlant',    x: -9.5,  z: -9.3, scale: 1.05, rotY: 1.7,             r: 0.45 },
    { model: 'crateStack',   x: 2.9,   z: -7.8, scale: 1.0,  rotY: 0.35,            r: 0.55 },
    { model: 'crateStack',   x: 8.6,   z: 8.4,  scale: 0.9,  rotY: 1.2,             r: 0.55 },
    { model: 'pipeManifold', x: 10.25, z: 2.5,  scale: 1.0,  rotY: -Math.PI / 2 },
    { model: 'pipeManifold', x: -10.25, z: -3.5, scale: 1.0, rotY: Math.PI / 2 },
  ],
};

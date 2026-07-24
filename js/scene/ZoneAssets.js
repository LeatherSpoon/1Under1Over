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
 *
 * To add a new model type:
 *   1. Add its GLB to models/ (e.g. models/MyProp.glb) — a failed load is
 *      cached only for the current page's lifetime; reload and it retries
 *   2. Add it to the loadModel() list in Environment constructor (_modelsReady)
 *   3. Add the key to the _glb destructure in the .then() callback
 *   4. Reference the key here with { model: 'myProp', ... }
 */

export const ZONE_ASSETS = {
  // ── Landing Site ────────────────────────────────────────────────────────────
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
    { model: 'mawCanopyTree', x: 13,  z: -12, scale: 1.7, rotY: 1.6,  r: 0.7  },
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
    // Glow shrooms — small luminous accents, walkable
    { model: 'mawGlowShroom', x: -3,  z: 3,   scale: 0.55,  rotY: 1.3 },
    { model: 'mawGlowShroom', x: 11,  z: 3,   scale: 0.6,  rotY: 3.1 },
    { model: 'mawGlowShroom', x: -9,  z: -11, scale: 0.5, rotY: 5.0 },
    // Maw-tender hamlet — NW clearing. Homes exported at true world scale
    // (station convention, attach scale 1.0), doors turned toward the zone
    // centre. Their NPCs stand outside, placed by the zone builder (_addNpc).
    { model: 'homeSylva', x: -12,   z: 11,   scale: 1.0, rotY: 2.3,  r: 1.3 },
    { model: 'homeBram',  x: -8.4,  z: 13.2, scale: 1.0, rotY: 2.6,  r: 1.3 },
    { model: 'homeSprig', x: -14.3, z: 14.3, scale: 1.0, rotY: 2.36, r: 1.1 },
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

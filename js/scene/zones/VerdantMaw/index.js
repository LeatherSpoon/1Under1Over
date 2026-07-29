/**
 * Verdant Maw zone — Pandora after dark: a bioluminescent alien jungle under
 * a closed canopy. Towering canopy trees, vine-draped banyans, giant ferns,
 * carnivorous maw plants and an overgrown idol (all GLB props placed via
 * ZoneAssets) glow-lit by shrooms and the verdantMaw ZONE_AMBIENCE preset
 * (deep teal night, pale moon, violet fill — the player's own bio-lamp does
 * the near work).
 *
 * The zone is the game's first MULTI-LEVEL world: the Hometree in the NE
 * carries a helical ramp up its trunk to a canopy layer — junction ledge,
 * branch bridges, the Gathering Bough (canopy nodes) and the Sky Altar
 * (Spirit Tree). All walkable geometry lives in ./canopy.js as pure data:
 * the builder registers it here, tests walk it headlessly, and the Blender
 * script that authored the GLBs mirrors the same numbers.
 *
 * ── Connections ───────────────────────────────────────────────────────────────
 *   mine  →  (0, 17)  always unlocked (return to portal hub)
 */
import * as THREE from 'three';
import { addPathRibbon } from '../../PathRibbon.js';
import { SURFACES, GROUND_CIRCLES, CANOPY_CIRCLES, CANOPY_LIGHTS, WAYMARKS, ROOT_GATE,
         RIVERS, riverPoints, TERMINUS,
         EMBER_TREE, GROTTO_RINGS, GROTTO_TRAIL,
         mawGroundColorAt, mawGroundHex } from './canopy.js';

export function build(env) {
  // Vertex-colored gradient ground: teal moss in the south, phasing to warm
  // golden-green through the northern bands (the transitional phase — see
  // mawGroundColorAt in canopy.js; fog/lights shift via zGradient).
  env._addGround(0x1d4636, { colorAt: mawGroundColorAt });

  // ── Connections ───────────────────────────────────────────────────────────
  env._addPortal(0, 17, 'mine', 0, 'Mine Hub');
  env._addReturnBeacon(0, 17);

  // ── Worn trail: portal → the Hometree's ramp foot ─────────────────────────
  // The climb's entrance was unfindable in the dark (owner note) — the route
  // grammar that says "this way leads somewhere" now leads exactly there,
  // skirting east of the idol.
  const TRAIL = [
    [0, 15], [1.4, 12], [2.8, 9], [4.2, 6], [5.4, 3], [6.2, 0],
    [6.8, -3], [7.3, -6], [7.7, -9], [8.1, -11.6], [8.5, -13.5], [9.4, -15.4],
  ];
  addPathRibbon(env, TRAIL, { width: 2.2, color: 0x4a4034, groundColor: 0x1d4636, seed: 6113 });

  // ── The canopy ascent (see ./canopy.js for the route) ─────────────────────
  for (const s of SURFACES) env.addWalkableSurface(s);
  for (const c of GROUND_CIRCLES) env._collisionCircles.push({ ...c });
  for (const c of CANOPY_CIRCLES) env._collisionCircles.push({ ...c });
  for (const [lx, ly, lz, col, intensity, dist] of CANOPY_LIGHTS) {
    const light = new THREE.PointLight(col, intensity, dist, 1);
    light.position.set(lx, ly, lz);
    env.group.add(light);
  }
  // The ascent is the zone's headline feature and its entrance hid in the
  // dark (owner note) — give it a nav chip like the portals get, anchored at
  // the Root Gate / ramp foot. Riversend gets one too: the expanse's far end
  // should tug at the player from the moment they enter the zone.
  env._addNavLandmark(9.3, 1.2, -15.3, 'Canopy Ascent');
  env._addNavLandmark(TERMINUS.x, TERMINUS.y + 0.5, TERMINUS.z, 'Riversend');
  env._addNavLandmark(EMBER_TREE.x, 4, EMBER_TREE.z, 'The Emberglade');

  // ── The four rivers — glowing water, never walkable ───────────────────────
  // One opaque PathRibbon each (no decal-strobe risk); the collision chain
  // lives in canopy.js GROUND_CIRCLES. Bioluminescent sparks drift the water.
  {
    // Bright: this is bioluminescent water and it must read as a BARRIER at
    // a glance (0x11485e shipped first and vanished into the night ground).
    // v2 (owner: "the river is low quality"): a deep body with a luminous
    // meandering CORE band (pathStrip coreColor — 7-column ribbon) instead of
    // one flat stripe; banks get boulder/fern dressing via scatterRiverBanks.
    // The water rides the transitional phase too — teal in the south, jade
    // then gold-green by river 4 (Kumandra water) — and each river's edges
    // blend into ITS local ground color, not the southern teal.
    const RIVER_BODY = [0x1f7a99, 0x217b8a, 0x25795f, 0x2e7a4f];
    const RIVER_CORE = [0x7fe8f0, 0x7fe8f0, 0x9fe8c8, 0xc8e8a0];
    for (const [i, r] of RIVERS.entries()) {
      addPathRibbon(env, riverPoints(r, -42, 42, 3), {
        width: 5.6, color: RIVER_BODY[i], coreColor: RIVER_CORE[i], strength: 1.15,
        groundColor: mawGroundHex(r.z), seed: 9100 + i * 7,
      });
    }
    let s = 20260727 | 0;
    const rng = () => {
      s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const sparkGeo = new THREE.SphereGeometry(0.08, 6, 4);
    // Spark palettes ride the phase with the water: teal → jade → gold-green
    const SPARK_SETS = [
      [0x5fd8e8, 0x8ff0f0, 0x4fb8d8], [0x5fd8e8, 0x8ff0f0, 0x4fb8d8],
      [0x8fe8c8, 0xb8f0d8, 0x6fd8a8], [0xd8e8a0, 0xe8f0c0, 0xb8d880],
    ].map(set => set.map(c => new THREE.MeshBasicMaterial({ color: c })));
    for (const [ri, r] of RIVERS.entries()) {
      for (let i = 0; i < 11; i++) {
        const x = -38 + rng() * 76;
        const m = new THREE.Mesh(sparkGeo, SPARK_SETS[ri][i % 3]);
        m.position.set(x, 0.07, r.z + r.amp * Math.sin(x * r.wave + r.phase) + (rng() - 0.5) * 2.4);
        env.group.add(m);
      }
    }
  }

  // ── The Emberglade (beyond river 4 — the ground route via spire 4) ────────
  // The scene transition: worn trail through the gateway arch, then the warm
  // sanctum — an ember root-web radiating from the Lantern Tree, and slow-
  // orbiting emberlings. The arches, tree and sky-isles are GLB placements in
  // canopy.js; the amber point lights ride CANOPY_LIGHTS.
  {
    // The web's ribbons overlap each other 24+ times (every spoke crosses every
    // ring, and the trail crosses the rings on its way in). PathRibbons are
    // OPAQUE, so coplanar overlaps have no stable depth winner and strobe as the
    // camera moves — the owner-reported "spider web tree flickers". Each ribbon
    // therefore gets its own y in a fixed stack: trail under, root-spokes over
    // it, glow-rings on top (which is also the right reading order — the rings
    // are light lying across the roots). Steps are ~5e-4, four orders above
    // ortho depth resolution over this frustum, and invisible at the 46° pitch.
    const WEB_Y_TRAIL = 0.016, WEB_Y_SPOKE = 0.020, WEB_Y_RING = 0.026;
    addPathRibbon(env, GROTTO_TRAIL, { width: 2.2, color: 0x4a4034, groundColor: mawGroundHex(-106), seed: 6117, y: WEB_Y_TRAIL });
    let s = 90212 | 0;
    const rng = () => {
      s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    // Ember web: 8 root-spokes out of the trunk flare + the three glow rings
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * 2 * Math.PI + 0.28 + (rng() - 0.5) * 0.2;
      const ux = Math.cos(a), uz = Math.sin(a);
      const bend = (rng() - 0.5) * 1.6;
      addPathRibbon(env, [
        [EMBER_TREE.x + ux * 2.4, EMBER_TREE.z + uz * 2.4],
        [EMBER_TREE.x + ux * 6.8 - uz * bend * 0.5, EMBER_TREE.z + uz * 6.8 + ux * bend * 0.5],
        [EMBER_TREE.x + ux * 11.3 - uz * bend, EMBER_TREE.z + uz * 11.3 + ux * bend],
      ], { width: 0.85, color: 0xcf7f3f, groundColor: mawGroundHex(-122), seed: 9200 + i * 3,
           y: WEB_Y_SPOKE + i * 0.0005 });
    }
    for (const [ri, r] of GROTTO_RINGS.entries()) {
      const pts = [];
      for (let i = 0; i <= 25; i++) {
        const a = i / 24 * 2 * Math.PI;
        pts.push([EMBER_TREE.x + Math.cos(a) * r, EMBER_TREE.z + Math.sin(a) * r]);
      }
      addPathRibbon(env, pts, { width: 1.0, color: 0xe0a055, groundColor: mawGroundHex(-124), seed: 9300 + ri * 7,
        y: WEB_Y_RING + ri * 0.0015 });
    }
    // Spark dots seeded along the web (river-spark grammar, ember-gold)
    const sparkGeo = new THREE.SphereGeometry(0.07, 6, 4);
    const sparkMats = [0xffd9a0, 0xffb866, 0xfff0d8].map(c => new THREE.MeshBasicMaterial({ color: c }));
    for (let i = 0; i < 30; i++) {
      const a = rng() * 2 * Math.PI;
      const r = GROTTO_RINGS[i % 3] + (rng() - 0.5) * 1.4;
      const m = new THREE.Mesh(sparkGeo, sparkMats[i % 3]);
      m.position.set(EMBER_TREE.x + Math.cos(a) * r, 0.07, EMBER_TREE.z + Math.sin(a) * r);
      env.group.add(m);
    }
    // Emberlings — a slow orbit of warm drifting seeds around the tree
    // (env._spinners rotates the group; children ride the orbit)
    const sprites = new THREE.Group();
    sprites.position.set(EMBER_TREE.x, 0, EMBER_TREE.z);
    const sprGeo = new THREE.SphereGeometry(0.065, 6, 4);
    const sprMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.9, depthWrite: false });
    for (let i = 0; i < 10; i++) {
      const a = rng() * 2 * Math.PI, r = 2.2 + rng() * 3.3;
      const m = new THREE.Mesh(sprGeo, sprMat);
      m.position.set(Math.cos(a) * r, 1.2 + rng() * 3.4, Math.sin(a) * r);
      sprites.add(m);
    }
    env.group.add(sprites);
    env._spinners.push({ mesh: sprites, axis: 'y', speed: 0.055 });
    // Waymark spores edging the grotto trail (same grammar as the approach —
    // gold here: this stretch is deep inside the warm phase)
    const wmGeo = new THREE.SphereGeometry(0.11, 6, 4);
    const wmMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
    for (let i = 1; i < GROTTO_TRAIL.length - 1; i += 2) {
      const side = i % 4 === 1 ? 1 : -1;
      const m = new THREE.Mesh(wmGeo, wmMat);
      m.position.set(GROTTO_TRAIL[i][0] + side * 1.25, 0.14, GROTTO_TRAIL[i][1] + side * 0.4);
      env.group.add(m);
    }
  }

  // Glowing threshold mat under the Root Gate — the door-mat grammar the
  // player already knows from the hamlet doorsteps ("glow on the ground =
  // walk in here"). depthWrite off per the translucent-decal rule.
  {
    const mat = new THREE.Mesh(
      new THREE.CircleGeometry(1.35, 24),
      new THREE.MeshBasicMaterial({ color: 0x7fe8d8, transparent: true, opacity: 0.30, depthWrite: false })
    );
    mat.rotation.x = -Math.PI / 2;
    mat.position.set(ROOT_GATE.x, 0.03, ROOT_GATE.z);
    mat.scale.y = 0.72; // squash along z — an oval landing, not a big disc
    env.group.add(mat);
  }

  // ── Waymark spores — one glow language for the whole route: dotted along
  // the approach trail, up the helix's outer rim, and at every bridge mouth.
  {
    const wmGeo = new THREE.SphereGeometry(0.11, 6, 4);
    // The spores ride the transitional phase: teal in the south, pale
    // warm-green through the bands, gold by the gateway — same route
    // grammar, phase-local color.
    const wmTeal = new THREE.MeshBasicMaterial({ color: 0xbdfff0 });
    const wmGreen = new THREE.MeshBasicMaterial({ color: 0xd8f0b0 });
    const wmGold = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
    const wmFor = z => z > -64 ? wmTeal : z > -98 ? wmGreen : wmGold;
    const pts = [...WAYMARKS];
    // trail dots: every other ribbon point, offset off the walk line so the
    // spores edge the path rather than sit in it
    for (let i = 1; i < TRAIL.length - 1; i += 2) {
      const side = i % 4 === 1 ? 1 : -1;
      pts.push([TRAIL[i][0] + side * 1.25, 0.14, TRAIL[i][1] + side * 0.4]);
    }
    for (const [wx, wy, wz] of pts) {
      const m = new THREE.Mesh(wmGeo, wmFor(wz));
      m.position.set(wx, wy, wz);
      env.group.add(m);
    }
  }

  // ── Glow motes — still points of bioluminescent life in the canopy air ────
  // Sparse, static, biased to the treetop layer so bridge crossings feel
  // inhabited. One shared geometry; tiny additive-looking basic materials.
  {
    let s = 20260726 | 0;
    const rng = () => {
      s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const moteGeo = new THREE.SphereGeometry(0.05, 6, 4);
    const moteMats = [0x9ff0dc, 0x7fd8ff, 0xffb8e8].map(c =>
      new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.8, depthWrite: false }));
    for (let i = 0; i < 44; i++) {
      const m = new THREE.Mesh(moteGeo, moteMats[i % 3]);
      m.position.set((rng() - 0.5) * 46, 3.6 + rng() * 6.4, (rng() - 0.5) * 44 - 2);
      env.group.add(m);
    }
  }

  // ── Maw-tender hamlet — the plant-folk who keep the old grove ────────────
  // Homes are ZoneAssets props in the NW clearing; each tender idles beside
  // their door, turned toward the path into the hamlet. (Sprig's seed-drone
  // ring is part of the Npc_Sprig model itself.) Warm doorstep lanterns keep
  // the hamlet reading as home against the cool biolume night.
  env._addNpc('npcSylva', -11.4, 9.0,  { rotY: 2.3 });          // Elder Sylva
  env._addNpc('npcBram',  -6.4,  12.3, { rotY: 2.6 });          // Grovekeeper Bram
  env._addNpc('npcSprig', -15.3, 13.0, { rotY: 2.0, r: 0.35 }); // Sprig
  for (const [lx, lz] of [[-10.6, 9.8], [-7.45, 11.6], [-13.0, 13.0]]) {
    const lamp = new THREE.PointLight(0xffb765, 2.2, 7, 1);
    lamp.position.set(lx, 2.1, lz);
    env.group.add(lamp);
  }

  // Doorsteps — each mat E-prompts into that home's interior zone; the
  // interior's exit doorway spawns the player back on this same doorstep.
  env._addDoorway(-10.6, 9.8,  'homeSylva', "Sylva's Den");
  env._addDoorway(-7.45, 11.6, 'homeBram',  "Bram's Lodge");
  env._addDoorway(-13.0, 13.0, 'homeSprig', "Sprig's Burrow");
}

import * as THREE from 'three';
import { addPathRibbon } from '../../PathRibbon.js';
import { wallCollisionCircles, POIS } from './layout.js';

/**
 * THE CINDERFORGE — the volcanic forge-maze below the Ember Chasm.
 *
 * The Meltwater Rift's eastern threshold always breathed heat; the winch
 * now runs, and it lowers into this: a basalt maze around the ancient forge
 * where the World Gates themselves were cast, lava still standing in the
 * cooling pools. The floor plan lives in ./layout.js as pure data — walls,
 * collision and the ZONE_ASSETS kit rows are all generated from the same
 * 15×15 cell map (the Labyrinth's grammar; the two mazes are siblings),
 * and tests flood-fill it headlessly.
 *
 * The route: entry court (return gate) → braided corridors → the
 * Forgemaster plaza at the heart → the long way around through the vent
 * yard / crucible court → the Great Anvil sanctum in the far north-west.
 * Ingot hoards and lava pools pay out the dead ends. No resident boss —
 * the Forgemaster is a statue. For now.
 *
 * ── Connections ─────────────────────────────────────────────────────────────
 *   meltwaterRift → (0, 26)  always unlocked (returns to the Ember Chasm
 *                   apron via spawnOverride — the winch is one doorway)
 */
export function build(env) {
  env._addGround(0x1d1412); // cooled basalt, near-black warm

  // ── Connections ───────────────────────────────────────────────────────────
  // The return gate lands the player back on the Ember Chasm's apron beside
  // the winch rather than at the Rift's default spawn.
  env._addPortal(POIS.gate[0], POIS.gate[1], 'meltwaterRift', 0, 'Meltwater Rift', 1, [10.4, 8.4]);

  // ── The maze ──────────────────────────────────────────────────────────────
  // Kit slabs are ZONE_ASSETS rows (layout.wallPlacements); collision rides
  // the same slab lines so the player is held at the carved faces.
  for (const c of wallCollisionCircles()) env._collisionCircles.push(c);

  // ArchGate thresholds (their ZONE_ASSETS rows carry no r): the gate is an
  // upright half-buried ring — an unfinished World Gate casting — so each
  // side gets an inner + outer rim circle and the aperture between them
  // stays walkable (the walk line through the ring center is clear; the rim
  // curve is buried there). Plaza north approach + east mouth, sanctum door.
  env._collisionCircles.push(
    { x: -6.25, z: -10, r: 0.4 }, { x: -3.75, z: -10, r: 0.4 },
    { x: -6.85, z: -10, r: 0.35 }, { x: -3.15, z: -10, r: 0.35 },
    { x: 10, z: -1.25, r: 0.4 }, { x: 10, z: 1.25, r: 0.4 },
    { x: 10, z: -1.85, r: 0.35 }, { x: 10, z: 1.85, r: 0.35 },
    { x: -26.25, z: -10, r: 0.4 }, { x: -23.75, z: -10, r: 0.4 },
    { x: -26.85, z: -10, r: 0.35 }, { x: -23.15, z: -10, r: 0.35 },
  );

  env._addNavLandmark(POIS.golem[0], 2.6, POIS.golem[1], 'Forgemaster Plaza');
  env._addNavLandmark(POIS.anvil[0], 1.8, POIS.anvil[1], 'The Great Anvil');

  // ── The residents ─────────────────────────────────────────────────────────
  // Forge-folk who never left when the casting stopped. The Cindersmith — an
  // obsidian salamander-folk smith — keeps the Forgemaster plaza; the Stoker,
  // a soot-freckled newt-folk, feeds the crucible court. Both stand clear of
  // the paved drags, the lava-pool keep-outs and the creature leashes.
  env._addNpc('npcCindersmith', 3.0, 2.2, { rotY: -2.20, r: 0.5,
    name: 'The Cindersmith',
    greeting: 'Mind the sparks, traveler. This forge cast the World Gates themselves.' });
  env._addNpc('npcStoker', 23.5, -13.5, { rotY: 2.36, r: 0.4,
    name: 'The Stoker',
    greeting: "Coals don't feed themselves! …Well. These ones might." });

  // ── Lava pools ────────────────────────────────────────────────────────────
  // Standing melt in the dead-end pockets (the Rift pit recipe: black rim
  // disc over a hot core — MeshBasicMaterial so they read self-lit in the
  // near-dark). Keep-out circles hold the player at the crust line.
  const POOLS = [
    { x: 0, z: -16.3, r: 1.1 },     // north spur pocket, behind the ingots
    { x: 30, z: -5, r: 1.0 },       // crucible-court alcove
    { x: -30, z: 10, r: 0.9 },      // vent yard, between the fumaroles
    { x: 21.5, z: -17.5, r: 0.8 },  // crucible court corner
  ];
  for (const p of POOLS) {
    const rim = new THREE.Mesh(new THREE.CircleGeometry(p.r + 0.35, 24),
      new THREE.MeshBasicMaterial({ color: 0x0a0605 }));
    rim.rotation.x = -Math.PI / 2;
    rim.position.set(p.x, 0.02, p.z);
    env.group.add(rim);
    const melt = new THREE.Mesh(new THREE.CircleGeometry(p.r, 24),
      new THREE.MeshBasicMaterial({ color: 0xff7a26 }));
    melt.rotation.x = -Math.PI / 2;
    melt.position.set(p.x, 0.035, p.z);
    env.group.add(melt);
    const core = new THREE.Mesh(new THREE.CircleGeometry(p.r * 0.45, 20),
      new THREE.MeshBasicMaterial({ color: 0xffc95e }));
    core.rotation.x = -Math.PI / 2;
    core.position.set(p.x, 0.05, p.z);
    env.group.add(core);
    env._collisionCircles.push({ x: p.x, z: p.z, r: p.r + 0.3 });
  }

  // ── Paved processional ────────────────────────────────────────────────────
  // Entry court → the plaza's north-west approach, and the east mouth out
  // toward the crucible court — flagstones on the main drag only; the rest
  // of the maze walks on bare cooled stone.
  const PAVED = { width: 2.4, color: 0x322622, groundColor: 0x1d1412, stoneColor: 0x4a3a30 };
  addPathRibbon(env, [[0, 27], [0, 23.5], [0, 19.5], [0, 15.5], [-2.8, 14.6], [-5, 12],
    [-5, 8.5], [-4.6, 5.5], [-2.4, 2.2], [0, 0.6]], { ...PAVED, seed: 9107 });
  addPathRibbon(env, [[1.8, 0.4], [5, 0.2], [8.5, 0], [12, 0], [15.5, 0]],
    { ...PAVED, width: 2.0, seed: 9109 });

  // ── Light ─────────────────────────────────────────────────────────────────
  // The ambience preset is near-black; lava pools, braziers and the anvil
  // carry the legibility, the player lamp does the near work (cave rule).
  for (const [lx, ly, lz, col, intensity, dist] of [
    [0, 3.2, 0, 0xffa050, 3.2, 17],            // plaza braziers
    [-25, 2.6, -25, 0xff8a3a, 2.6, 13],        // the Great Anvil's forge glow
    [0, 3.0, 25, 0xffb066, 1.8, 12],           // entry court / gate
    [25, 2.4, -15, 0xffc25e, 1.6, 11],         // crucible court
    [-30, 2.2, 10, 0xff6a22, 1.4, 10],         // vent yard melt
    [25, 2.0, -30, 0xffa858, 1.1, 8],          // slag vault
    [0, 1.6, -16, 0xff7a26, 1.2, 8],           // north spur pool
    [30, 1.6, -5, 0xff7a26, 1.1, 8],           // east alcove pool
  ]) {
    const light = new THREE.PointLight(col, intensity, dist, 1);
    light.position.set(lx, ly, lz);
    env.group.add(light);
  }

  // Anvil ember ring — a slow-spinning ring of forge-light over the dais
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.05, 0.05, 8, 36),
    new THREE.MeshBasicMaterial({ color: 0xffb35e, transparent: true, opacity: 0.55 })
  );
  ring.position.set(POIS.anvil[0], 1.5, POIS.anvil[1]);
  ring.rotation.x = Math.PI / 2;
  env.group.add(ring);
  env._spinners.push({ mesh: ring, axis: 'z', speed: 0.5 });

  // Embers rising off the pools — motes that drift up, gutter out and loop
  // (the _spinners update-fn convention, like the tundra spindrift).
  const emberMat = new THREE.MeshBasicMaterial({ color: 0xffa050, transparent: true, opacity: 0.8, depthWrite: false });
  let s = 47119 | 0;
  const rng = () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = 0; i < 12; i++) {
    const pool = POOLS[i % POOLS.length];
    const ember = new THREE.Mesh(new THREE.SphereGeometry(0.035 + rng() * 0.035, 5, 4), emberMat);
    const ox = (rng() - 0.5) * pool.r * 1.6, oz = (rng() - 0.5) * pool.r * 1.6;
    const speed = 0.35 + rng() * 0.4, ceil = 1.6 + rng() * 1.2;
    let h = rng() * ceil;
    ember.position.set(pool.x + ox, h, pool.z + oz);
    env.group.add(ember);
    env._spinners.push({
      mesh: ember, axis: 'y', speed: 0,
      update(delta) {
        h += speed * delta;
        if (h > ceil) h = 0;
        ember.position.y = 0.15 + h;
        ember.scale.setScalar(Math.max(0.25, 1 - h / ceil));
      },
    });
  }
}

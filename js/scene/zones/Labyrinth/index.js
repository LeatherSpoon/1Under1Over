import * as THREE from 'three';
import { addPathRibbon } from '../../PathRibbon.js';
import { wallCollisionCircles, POIS } from './layout.js';

/**
 * THE LABYRINTH — an ancient stone maze behind Atlantis' back door.
 *
 * The drowned city's south corridor always ended on a sealed chamber; the
 * Ancient World Gate standing half-drowned in its pool now opens here: a
 * torchlit maze of carved stone slabs (the Lab_* Rodin kit) under a
 * near-black sky. The floor plan lives in ./layout.js as pure data — walls,
 * collision and the ZONE_ASSETS kit rows are all generated from the same
 * 19×19 cell map, and tests flood-fill it headlessly.
 *
 * The route: entry court (return gate) → braided corridors → the Minotaur
 * plaza at the heart → the long way around through fountain court / well
 * yard → the shrine sanctum on the far north wall. Tomb alcoves and a
 * sprung spike pit pay out the dead ends. Around it all runs the outer walk
 * (see layout.js): an east arc looping tomb-to-entry, and the long dark —
 * the west arc ending on the shrine's hidden back door. No resident boss
 * this round — the Minotaur is a statue. For now.
 *
 * ── Connections ─────────────────────────────────────────────────────────────
 *   atlantis → (0, 26)  always unlocked (returns to the end chamber)
 */
export function build(env) {
  env._addGround(0x27201a); // worn dungeon stone, warm-dark

  // ── Connections ───────────────────────────────────────────────────────────
  // The return gate lands the player back in Atlantis' end chamber rather
  // than the city's north gate — the two gates are one doorway.
  env._addPortal(POIS.gate[0], POIS.gate[1], 'atlantis', 0, 'Atlantis', 1, [0, 28]);

  // ── The maze ──────────────────────────────────────────────────────────────
  // Kit slabs are ZONE_ASSETS rows (layout.wallPlacements); collision rides
  // the same slab lines so the player is held at the carved faces.
  for (const c of wallCollisionCircles()) env._collisionCircles.push(c);

  // ArchGate frames (their ZONE_ASSETS rows carry no r): leg circles only,
  // so the aperture itself stays walkable. The plaza threshold spans x; the
  // sanctum door spans z.
  env._collisionCircles.push(
    { x: -1.25, z: 10, r: 0.4 }, { x: 1.25, z: 10, r: 0.4 },
    { x: -7.5, z: -31.25, r: 0.4 }, { x: -7.5, z: -28.75, r: 0.4 },
  );

  env._addNavLandmark(POIS.statue[0], 2.6, POIS.statue[1], 'Minotaur Plaza');
  env._addNavLandmark(POIS.shrine[0], 1.8, POIS.shrine[1], 'The Shrine');

  // ── The residents ─────────────────────────────────────────────────────────
  // The Warden — an old tortoise-folk keeper — greets arrivals beside the
  // gate; the Delver, a mouse-folk explorer, has made camp at the fountain
  // court and is clearly never finding the way out on his own.
  env._addNpc('npcWarden', -4, 24, { rotY: 1.1, r: 0.5,
    name: 'The Warden', greeting: 'The maze remembers every footstep. Mind yours.' });
  env._addNpc('npcDelver', -22.5, -17, { rotY: -2.45, r: 0.4,
    name: 'The Delver', greeting: "Left, left, then… no. Don't follow my directions." });

  // ── Paved processional ────────────────────────────────────────────────────
  // Entry court → plaza, and the plaza's west/east mouths — flagstones on
  // the main drag only; the rest of the maze walks on bare worn stone.
  const PAVED = { width: 2.4, color: 0x3a322a, groundColor: 0x27201a, stoneColor: 0x554a3c };
  addPathRibbon(env, [[0, 27], [0, 23.5], [0, 19.5], [0, 15], [0, 10.5], [0, 6], [0, 2]],
    { ...PAVED, seed: 7301 });
  addPathRibbon(env, [[-9.5, 0], [-6, 0], [-2, 0.4], [2, 0.4], [6, 0], [9.5, 0]],
    { ...PAVED, width: 2.0, seed: 7303 });

  // ── Light ─────────────────────────────────────────────────────────────────
  // The ambience preset is near-black; braziers and the shrine carry the
  // legibility, the player lamp does the near work (cave rule).
  for (const [lx, ly, lz, col, intensity, dist] of [
    [0, 3.2, 0, 0xffb066, 3.2, 17],            // plaza braziers
    [0, 2.6, -30, 0x7fe8d8, 2.4, 13],          // the shrine's cold glow
    [0, 3.0, 25, 0x66e8e0, 1.8, 12],           // entry court / gate
    [-25, 2.4, -20, 0x6fd8e0, 1.5, 11],        // fountain court
    [20, 2.4, -20, 0xffb066, 1.4, 10],         // well yard
    [-25, 1.6, 30, 0xd86a4a, 1.1, 8],          // spike pit pocket — ember warning
    [30, 2.0, -30, 0xffa858, 1.0, 8],          // NE tomb alcove
    // The outer walk (4 lights: 7 + these + the player lamp fill the
    // 12-light bucket exactly — adding a 12th zone light recompiles shaders)
    [-40, 2.4, 15, 0x66e8e0, 1.2, 10],         // west opening / stele
    [-20, 2.6, -37, 0x7fe8d8, 1.6, 11],        // the shrine's back door
    [-10, 1.6, 40, 0xffa858, 1.0, 8],          // SW stub chest
    [40, 2.0, -40, 0xffa858, 1.0, 8],          // NE corner tomb
  ]) {
    const light = new THREE.PointLight(col, intensity, dist, 1);
    light.position.set(lx, ly, lz);
    env.group.add(light);
  }

  // Shrine orb shimmer — a slow-spinning glow ring over the sanctum floor
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.05, 0.05, 8, 36),
    new THREE.MeshBasicMaterial({ color: 0x8ff0e0, transparent: true, opacity: 0.55 })
  );
  ring.position.set(POIS.shrine[0], 1.35, POIS.shrine[1] + 0.4);
  ring.rotation.x = Math.PI / 2;
  env.group.add(ring);
  env._spinners.push({ mesh: ring, axis: 'z', speed: 0.5 });

  // Dust motes drifting in the torchlight
  const moteMat = new THREE.MeshBasicMaterial({ color: 0xd8c8a8, transparent: true, opacity: 0.4, depthWrite: false });
  let s = 61207 | 0;
  const rng = () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = 0; i < 18; i++) {
    const mote = new THREE.Mesh(new THREE.SphereGeometry(0.04 + rng() * 0.04, 5, 4), moteMat);
    mote.position.set((rng() - 0.5) * 84, 0.5 + rng() * 1.8, (rng() - 0.5) * 84);
    env.group.add(mote);
  }
}

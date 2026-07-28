import * as THREE from 'three';
import { createToonMaterial, addOutline } from '../../ToonMaterials.js';
import { MACHINE_CORE, machineFootprint } from './machineLayout.js';

// The Machine — primitive-stage bodies (DELIBERATE pre-kit fallbacks, station
// convention). Geometry truth lives in ./machineLayout.js.

const TEAL = 0x36e0b8;
const HULL = 0x3c4652;
const DARK = 0x2a3138;

// mulberry32 — house convention: inline copy, seeded per feature
// (Environment.js does not export its own; MineLayout precedent).
function seededRandom(seed) {
  let t = seed >>> 0;
  return function () {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildMachinePlot(env) {
  let group = null;

  const state = () => (env._machineState ? env._machineState() : { gen: -1, minors: 0 });

  function render() {
    const { gen, minors } = state();
    const g = new THREE.Group();

    if (gen < 0) {
      // Pre-Gen0: salvage heap + empty socket ring. The heap is the prompt.
      const heapMat = createToonMaterial(DARK);
      const boxes = [
        [0.9, 0.5, 0.7, -0.3, 0.25, 0.1, 0.4],
        [0.6, 0.4, 0.5, 0.4, 0.2, -0.2, -0.3],
        [0.5, 0.7, 0.5, 0.15, 0.35, 0.45, 0.9],
      ];
      for (const [w, h, d, x, y, z, rot] of boxes) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), heapMat);
        m.position.set(MACHINE_CORE.x + x, y, MACHINE_CORE.z + z);
        m.rotation.y = rot;
        addOutline(m, 0.05);
        g.add(m);
      }
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(1.0, 1.25, 24),
        new THREE.MeshBasicMaterial({ color: TEAL, transparent: true, opacity: 0.5, depthWrite: false })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(MACHINE_CORE.x, 0.02, MACHINE_CORE.z);
      g.add(ring);
    } else {
      const f = machineFootprint(gen, minors);
      const bodyMat = createToonMaterial(HULL);
      const core = new THREE.Mesh(new THREE.BoxGeometry(f.coreW, f.coreH, f.coreD), bodyMat);
      core.position.set(MACHINE_CORE.x, f.coreH / 2, MACHINE_CORE.z);
      addOutline(core, 0.05);
      g.add(core);
      // Teal energy slit up the camera-facing (+z) face — the portal family glow.
      const slit = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, f.coreH * 0.7, 0.05),
        new THREE.MeshBasicMaterial({ color: TEAL })
      );
      slit.position.set(MACHINE_CORE.x - f.coreW * 0.22, f.coreH * 0.45, MACHINE_CORE.z + f.coreD / 2 + 0.03);
      g.add(slit);
      // Antenna
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 6), bodyMat);
      mast.position.set(MACHINE_CORE.x + f.coreW * 0.3, f.coreH + 0.55, MACHINE_CORE.z);
      g.add(mast);
      // Expansion racks — seeded rows marching east; same seed → same layout.
      const rng = seededRandom(90260);
      for (let i = 0; i < minors; i++) {
        const col = Math.floor(i / 3);
        const row = i % 3;
        const rack = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9 + rng() * 0.3, 0.7), bodyMat);
        rack.position.set(
          MACHINE_CORE.x + f.coreW / 2 + 1.2 + col * 0.9 + (rng() - 0.5) * 0.15,
          rack.geometry.parameters.height / 2,
          MACHINE_CORE.z - 1.4 + row * 1.4 + (rng() - 0.5) * 0.2
        );
        addOutline(rack, 0.05);
        g.add(rack);
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.08), new THREE.MeshBasicMaterial({ color: TEAL }));
        lamp.position.set(rack.position.x, rack.geometry.parameters.height - 0.1, rack.position.z + 0.38);
        g.add(lamp);
      }
      // Console pedestal on the west face (dropship side)
      const ped = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.4), createToonMaterial(DARK));
      ped.position.set(MACHINE_CORE.x - f.coreW / 2 - 0.8, 0.45, MACHINE_CORE.z);
      addOutline(ped, 0.05);
      g.add(ped);
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.1, 0), new THREE.MeshBasicMaterial({ color: TEAL }));
      gem.position.set(ped.position.x, 1.25, ped.position.z);
      gem.userData.isIndicator = true;
      g.add(gem);
    }
    return g;
  }

  function pushCircles() {
    const { gen, minors } = state();
    if (gen < 0) {
      env._collisionCircles.push({ x: MACHINE_CORE.x, z: MACHINE_CORE.z, r: 1.0, machine: true });
      return;
    }
    const f = machineFootprint(gen, minors);
    // Core body: one circle sized to the box half-diagonal (small enough here
    // that the face gap is negligible — swap to circle chains with the kit).
    env._collisionCircles.push({
      x: MACHINE_CORE.x, z: MACHINE_CORE.z,
      r: Math.hypot(f.coreW, f.coreD) / 2 + 0.1, machine: true,
    });
    // One shallow circle over the rack field keeps walkers out of the clutter.
    if (minors > 0) {
      const reach = machineFootprint(gen, minors).eastReach;
      env._collisionCircles.push({
        x: MACHINE_CORE.x + reach / 2 + 0.6, z: MACHINE_CORE.z,
        r: reach / 2, machine: true,
      });
    }
  }

  function rebuild() {
    if (group) env.group.remove(group);
    env._collisionCircles = env._collisionCircles.filter(c => !c.machine);
    group = render();
    env.group.add(group);
    pushCircles();
    // Installs are rare (≤ ~20 per playthrough); old primitives are left for
    // GC without a dispose pass — the kit swap in the asset plan replaces this
    // whole path with _registerStationModel.
  }

  rebuild();
  env._machineRefresh = rebuild;
  env._machineConsolePos = { x: MACHINE_CORE.x - 1.6, z: MACHINE_CORE.z };
  env._addNavLandmark(MACHINE_CORE.x, 2.0, MACHINE_CORE.z, 'The Machine');
}

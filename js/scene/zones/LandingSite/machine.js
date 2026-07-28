import * as THREE from 'three';
import { createToonMaterial, addOutline } from '../../ToonMaterials.js';
import {
  MACHINE_CORE, machineFootprint, consolePos, rackSlot, drawnRacks, machineCircles,
} from './machineLayout.js';

// The Machine — primitive-stage bodies (DELIBERATE pre-kit fallbacks, station
// convention). Geometry + collision truth lives in ./machineLayout.js.

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
      const f = machineFootprint(gen);
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
      // Expansion racks — seeded jitter on top of the pure rackSlot() centers
      // (visual only, so collision stays jitter-independent). Racks beyond
      // the draw cap simply aren't drawn — no mesh, no collision circle —
      // bounded rather than sprawling further east; a denser layout for the
      // excess is left to the kit pass.
      const rng = seededRandom(90260);
      const racksToDraw = drawnRacks(minors);
      for (let i = 0; i < racksToDraw; i++) {
        const slot = rackSlot(i);
        const rack = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9 + rng() * 0.3, 0.7), bodyMat);
        rack.position.set(
          slot.x + (rng() - 0.5) * 0.15,
          rack.geometry.parameters.height / 2,
          slot.z + (rng() - 0.5) * 0.2
        );
        addOutline(rack, 0.05);
        g.add(rack);
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.08), new THREE.MeshBasicMaterial({ color: TEAL }));
        lamp.position.set(rack.position.x, rack.geometry.parameters.height - 0.1, rack.position.z + 0.38);
        g.add(lamp);
      }
      // Console pedestal on the west face (dropship side)
      const cPos = consolePos(gen);
      const ped = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.4), createToonMaterial(DARK));
      ped.position.set(cPos.x, 0.45, cPos.z);
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
    env._collisionCircles.push(...machineCircles(gen, minors));
  }

  function rebuild() {
    if (group) env.group.remove(group);
    env._collisionCircles = env._collisionCircles.filter(c => !c.machine);
    group = render();
    env.group.add(group);
    pushCircles();
    // A same-length rebuild (e.g. gen advances but minors doesn't) can't be
    // told apart from "nothing changed" by the sector cache's length-keyed
    // staleness check — force it to recompute once SectorView zones exist.
    env._collisionCacheStatic = -1;
    // Re-track the pedestal on every install, not just the first build.
    env._machineConsolePos = consolePos(state().gen);
    // Rebuilds scale with rack count; accepted leak (~70 geometries at the
    // draw cap) until the kit swap replaces this whole path.
  }

  rebuild();
  env._machineRefresh = rebuild;
  env._addNavLandmark(MACHINE_CORE.x, 2.0, MACHINE_CORE.z, 'The Machine');
}

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createToonMaterial } from '../../ToonMaterials.js';

/**
 * ComputerKit Era-1 GLBs — preloaded once at import (ResourceNode._nodeModels
 * convention: no await, no pop-in handling; consumers clone if present, else
 * keep the procedural fallback). All pieces are exported pre-normalized to
 * true world scale (grounded, base-center origin, front toward +game-z), so
 * attach scale is 1.0 everywhere.
 *
 * Re-shade on clone: material names matching /glow|screen|led/i become
 * self-glow MeshBasicMaterial; everything else becomes MeshToonMaterial
 * keeping the baked diffuse map (the cloneModel() re-shade in Environment.js
 * — kills PBR specular so Rodin exports read flat). Material NAMES are kept
 * intact so a future color-variant round can tint by name.
 */

const KIT_KEYS = [
  'Wall', 'WallDoor', 'RoofPanel',
  'FieldTerminal', 'MissionServer', 'IntegrationBench', 'ExpeditionRack',
  'Pallet',
];

const _kit = {};
let _pending = KIT_KEYS.length;
const _onLoaded = [];
function _settle() {
  if (--_pending > 0) return;
  for (const fn of _onLoaded.splice(0)) {
    try { fn(); } catch (e) { console.warn('[ComputerKit] onKitLoaded callback failed', e); }
  }
}
const _loader = new GLTFLoader();
for (const key of KIT_KEYS) {
  _loader.load(`./models/CK1_${key}.glb`, (gltf) => {
    _kit[key] = gltf.scene;
    _settle();
  }, undefined, _settle);
}

/** True once the shell pieces are in — the exterior swaps as one. */
export function kitReady() {
  return !!(_kit.Wall && _kit.WallDoor && _kit.RoofPanel);
}

/**
 * Fires fn once when every kit load has settled (loaded or failed) — the
 * portal-style late attach: Environment re-runs buildComputerShell so a cold
 * cache still boots on the procedural shell, then swaps in place.
 */
export function onKitLoaded(fn) {
  if (_pending <= 0) fn();
  else _onLoaded.push(fn);
}

// Source material → game material, shared across all clones of all pieces.
// vc: honor baked vertex colors (COLOR_0 — the v2 kit bakes Cycles AO there)
// when the mesh's geometry carries the attribute; glow materials skip it —
// AO would dim the emissive read (Mine/kit.js convention).
const _shaded = new WeakMap();
function _shadeMaterial(mat, vc) {
  if (!mat) return mat;
  let entry = _shaded.get(mat);
  if (!entry) {
    entry = {};
    _shaded.set(mat, entry);
  }
  const key = vc ? 'vc' : 'flat';
  if (!entry[key]) {
    let m;
    if (/glow|screen|led/i.test(mat.name || '')) {
      m = new THREE.MeshBasicMaterial({
        color: mat.color ? mat.color.getHex() : 0xffffff,
        map: mat.map || null,
      });
    } else if (mat.map) {
      m = createToonMaterial(0xffffff, { map: mat.map, vertexColors: vc });
    } else {
      m = createToonMaterial(mat.color ? mat.color.getHex() : 0x8a94a0, { vertexColors: vc });
    }
    m.name = mat.name; // tint-friendly (future color-variant round)
    entry[key] = m;
  }
  return entry[key];
}

/** Re-shaded deep clone of a kit piece, or null (caller keeps its fallback). */
export function getKitPiece(key) {
  const src = _kit[key];
  if (!src) return null;
  const clone = src.clone(true);
  clone.traverse((n) => {
    if (!n.isMesh) return;
    n.castShadow = true;
    n.receiveShadow = true;
    const vc = !!(n.geometry && n.geometry.attributes && n.geometry.attributes.color);
    n.material = Array.isArray(n.material)
      ? n.material.map((m) => _shadeMaterial(m, vc))
      : _shadeMaterial(n.material, vc);
  });
  return clone;
}

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createRevealToonMaterial, createToonMaterial } from '../../ToonMaterials.js';
import { materialKindFor } from './kitRules.js';

// Modular cave kit — preloaded once, cloned per cell. Falls back to the
// procedural primitives in index.js if not loaded yet (no await, no pop-in
// handling — same convention as ResourceNode._nodeModels).
const _kitPieces = {};
new GLTFLoader().load('./models/MineKit.glb', (gltf) => {
  for (const child of [...gltf.scene.children]) {
    _kitPieces[child.name] = child;
  }
}, undefined, () => {});

export function kitReady() {
  return Object.keys(_kitPieces).length > 0;
}

/** Deep clone of a kit piece, or null (caller falls back to primitives). */
export function getKitPiece(name) {
  const piece = _kitPieces[name];
  return piece ? piece.clone(true) : null;
}

// ── Material application ────────────────────────────────────────────────────
// kitMats: per-zone-build cache (env._revealMaterials is reset every switch,
// so materials must be rebuilt per build — pass a fresh {} from build()).

function _revealFor(kitMats, env, color, revealR) {
  const key = `r:${color}:${revealR}`;
  if (!kitMats[key]) {
    const m = createRevealToonMaterial(color, { revealR });
    env._revealMaterials.push(m);
    kitMats[key] = m;
  }
  return kitMats[key];
}

function _basicFor(kitMats, color) {
  const key = `b:${color}`;
  if (!kitMats[key]) kitMats[key] = new THREE.MeshBasicMaterial({ color });
  return kitMats[key];
}

function _toonFor(kitMats, color) {
  const key = `t:${color}`;
  if (!kitMats[key]) kitMats[key] = createToonMaterial(color);
  return kitMats[key];
}

function _mapMaterials(obj, mapFn) {
  obj.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
    if (Array.isArray(node.material)) {
      node.material = node.material.map(mapFn);
    } else {
      node.material = mapFn(node.material);
    }
  });
}

/** Walls: every GLB material → reveal toon of the same color; vein names glow. */
export function applyWallMaterials(obj, env, kitMats, revealR = 2.4) {
  _mapMaterials(obj, (mat) => {
    const color = mat.color ? mat.color.getHex() : 0x5d5348;
    return materialKindFor(mat.name) === 'emissive'
      ? _basicFor(kitMats, color)
      : _revealFor(kitMats, env, color, revealR);
  });
}

/** Ore chunks: rock takes the tier color, veins take the tier's glow color. */
export function applyOreMaterials(obj, env, kitMats, props, revealR = 1.8) {
  _mapMaterials(obj, (mat) =>
    materialKindFor(mat.name) === 'emissive'
      ? _basicFor(kitMats, props.veinColor)
      : _revealFor(kitMats, env, props.color, revealR)
  );
}

/** Dressing: rock parts re-tinted per region, crystal parts glow per region. */
export function applyDressingMaterials(obj, kitMats, palette) {
  _mapMaterials(obj, (mat) =>
    materialKindFor(mat.name) === 'emissive'
      ? _basicFor(kitMats, palette.crystal)
      : _toonFor(kitMats, palette.rock)
  );
}

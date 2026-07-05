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

// vc: honor baked vertex colors (AO + painterly mottle authored in Blender)
// when the mesh's geometry carries a COLOR_0 attribute. Glow materials skip
// it — AO would dim the emissive read.

function _revealFor(kitMats, env, color, revealR, vc) {
  const key = `r:${color}:${revealR}:${vc ? 1 : 0}`;
  if (!kitMats[key]) {
    const m = createRevealToonMaterial(color, { revealR, vertexColors: vc });
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

function _toonFor(kitMats, color, vc) {
  const key = `t:${color}:${vc ? 1 : 0}`;
  if (!kitMats[key]) kitMats[key] = createToonMaterial(color, { vertexColors: vc });
  return kitMats[key];
}

function _mapMaterials(obj, mapFn) {
  obj.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
    const vc = !!node.geometry?.attributes?.color;
    if (Array.isArray(node.material)) {
      node.material = node.material.map((m) => mapFn(m, vc));
    } else {
      node.material = mapFn(node.material, vc);
    }
  });
}

/** Walls: every GLB material → reveal toon of the same color; vein names glow. */
export function applyWallMaterials(obj, env, kitMats, revealR = 2.4) {
  _mapMaterials(obj, (mat, vc) => {
    const color = mat.color ? mat.color.getHex() : 0x5d5348;
    return materialKindFor(mat.name) === 'emissive'
      ? _basicFor(kitMats, color)
      : _revealFor(kitMats, env, color, revealR, vc);
  });
}

/** Ore chunks: rock takes the tier color, veins take the tier's glow color. */
export function applyOreMaterials(obj, env, kitMats, props, revealR = 1.8) {
  _mapMaterials(obj, (mat, vc) =>
    materialKindFor(mat.name) === 'emissive'
      ? _basicFor(kitMats, props.veinColor)
      : _revealFor(kitMats, env, props.color, revealR, vc)
  );
}

/** Dressing: rock parts re-tinted per region, crystal parts glow per region. */
export function applyDressingMaterials(obj, kitMats, palette) {
  _mapMaterials(obj, (mat, vc) =>
    materialKindFor(mat.name) === 'emissive'
      ? _basicFor(kitMats, palette.crystal)
      : _toonFor(kitMats, palette.rock, vc)
  );
}

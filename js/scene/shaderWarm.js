/**
 * shaderWarm.js — boot-time shader pre-compilation.
 *
 * THREE compiles a WebGL program per (material shader × defines × light
 * count) combination the first time it must draw one, and those compiles
 * were the bulk of the first-visit zone-switch delay (0.5–2.5 s per zone).
 * zoneManager pads every zone's point-light count to a bucket (6/12/24) so
 * zones share program sets; this module then pre-compiles the game's common
 * material families against each bucket at boot — in a hidden scene, via
 * renderer.compileAsync, on the driver's parallel threads — so by the time
 * the player reaches their first portal, most switches find every program
 * already in the cache.
 *
 * The families here mirror what the zones actually draw: toon (plain / map /
 * vertex-colored), the reveal variants, outlines, unlit basics, the portal
 * membrane, skinned toon (player, creatures, NPCs), and sprites. A zone's
 * exotic one-offs (aurora curtains, water swirls) still compile on first
 * sight — a few programs, not a whole set.
 */
import * as THREE from 'three';
import {
  createToonMaterial, createRevealToonMaterial, createRevealOutlineMaterial,
  createPortalEnergyMaterial,
} from './ToonMaterials.js';

const LIGHT_BUCKETS = [6, 12, 24];

function whiteTexture() {
  const data = new Uint8Array([255, 255, 255, 255]);
  const tex = new THREE.DataTexture(data, 1, 1);
  // GLB diffuse maps arrive sRGB; the colorSpace is part of the program
  // cache key, so the warm map must match or nothing here pre-compiles the
  // real thing.
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function coloredBox() {
  const geo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
  const colors = new Float32Array(geo.attributes.position.count * 3).fill(1);
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

function skinnedBox() {
  const geo = coloredBox();
  const n = geo.attributes.position.count;
  const idx = new Uint16Array(n * 4);
  const wts = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) wts[i * 4] = 1;
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(idx, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(wts, 4));
  return geo;
}

function buildWarmScene(pointLights) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x000000, 10, 50);
  scene.add(new THREE.AmbientLight(0xffffff, 0.4));
  const sun = new THREE.DirectionalLight(0xffffff, 0.5);
  sun.castShadow = true;
  sun.position.set(3, 8, 3);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xffffff, 0.2);
  fill.position.set(-3, 4, -3);
  scene.add(fill);
  for (let i = 0; i < pointLights; i++) {
    const p = new THREE.PointLight(0xffffff, 0.01, 5, 1);
    p.position.set((i % 5) - 2, 1, ((i / 5) | 0) - 2);
    scene.add(p);
  }

  const map = whiteTexture();
  const mats = [
    createToonMaterial(0xffffff),
    createToonMaterial(0xffffff, { vertexColors: true }),
    createToonMaterial(0xffffff, { map }),
    createToonMaterial(0xffffff, { map, vertexColors: true }),
    createRevealToonMaterial(0xffffff, { revealR: 2.0 }),
    createRevealToonMaterial(0xffffff, { revealR: 2.0, map }),
    createRevealToonMaterial(0xffffff, { revealR: 2.0, vertexColors: true }),
    createRevealOutlineMaterial({ revealR: 2.0 }),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
    new THREE.MeshBasicMaterial({ color: 0xffffff, map }),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 }),
    createPortalEnergyMaterial(1.5),
  ];
  mats.forEach((m, i) => {
    const mesh = new THREE.Mesh(coloredBox(), m);
    mesh.position.set((i % 6) * 0.3 - 1, 0.5, ((i / 6) | 0) * 0.3 - 1);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  });

  // Skinned toon variants (player / creatures / NPCs)
  for (const [i, m] of [
    createToonMaterial(0xffffff, { map }),
    createToonMaterial(0xffffff),
  ].entries()) {
    const mesh = new THREE.SkinnedMesh(skinnedBox(), m);
    const bone = new THREE.Bone();
    mesh.add(bone);
    mesh.bind(new THREE.Skeleton([bone]));
    mesh.position.set(1.5, 0.5, i * 0.3);
    mesh.castShadow = true;
    scene.add(mesh);
  }

  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true }));
  sprite.position.set(-1.5, 1, 0);
  scene.add(sprite);

  return scene;
}

/**
 * Kick the pre-compilation. Returns a promise (resolved when every bucket's
 * programs are in the cache) — callers don't need to await it; it runs on
 * the driver's parallel compile threads and never blocks the main thread.
 * No-op (resolved promise) when compileAsync is unavailable.
 */
export function warmShaderCache(renderer, camera) {
  if (!renderer || !renderer.compileAsync) return Promise.resolve();
  return Promise.all(
    LIGHT_BUCKETS.map(n => renderer.compileAsync(buildWarmScene(n), camera).catch(() => {}))
  );
}

/**
 * Upload every loaded GLB's vertex buffers + textures to the GPU in ONE
 * hidden render, called behind the boot overlay once the models parse.
 * Zone switches then never pay first-sight uploads for kit pieces, props,
 * creatures or portals — only for the zone's own merged meshes. Clones share
 * geometry/materials with the cache, so this touches exactly the real GPU
 * resources; skinned meshes are skipped (plain .clone() can't rebind them —
 * their buffers upload on first spawn instead, which is small).
 */
export function uploadGlbBuffers(renderer, glbMap) {
  if (!renderer) return;
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 1));
  for (const key of Object.keys(glbMap || {})) {
    const g = glbMap[key];
    if (!g || !g.traverse) continue;
    g.traverse(o => {
      if (o.isMesh && !o.isSkinnedMesh) {
        const m = new THREE.Mesh(o.geometry, o.material);
        m.frustumCulled = false; // force the draw — that's the upload
        scene.add(m);
      }
    });
  }
  const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  cam.position.set(0, 0, 50);
  const prevScissor = renderer.getScissorTest();
  renderer.setScissorTest(true);
  renderer.setScissor(0, 0, 1, 1); // 1px of fragment work; uploads still run
  try { renderer.render(scene, cam); } finally {
    renderer.setScissorTest(prevScissor);
  }
}

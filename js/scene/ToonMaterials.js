import * as THREE from 'three';

/**
 * Creates a DataTexture gradient map for MeshToonMaterial.
 * steps=3 gives a clean two-tone cel look.
 */
function makeGradientMap(steps = 3) {
  const colors = new Uint8Array(steps * 4);
  for (let i = 0; i < steps; i++) {
    const v = Math.round((i / (steps - 1)) * 255);
    colors[i * 4] = v;
    colors[i * 4 + 1] = v;
    colors[i * 4 + 2] = v;
    colors[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(colors, steps, 1, THREE.RGBAFormat);
  tex.needsUpdate = true;
  return tex;
}

const gradientMap = makeGradientMap(3);

// Kept as no-ops for backwards compatibility with existing call sites.
// Player visibility is handled via depth-greater ghost meshes in Player.js,
// not via shader-based occlusion cuts.
export const sharedOcclusionUniforms = {
  uPlayerPos: { value: new THREE.Vector3(0, 0, 1e6) },
};
export function updateOcclusionUniforms(_playerPos) {}

export function createToonMaterial(color, options = {}) {
  const { noOcclude: _ignored, ...matOptions } = options;
  return new THREE.MeshToonMaterial({
    color,
    gradientMap,
    ...matOptions,
  });
}

/**
 * Adds a black outline mesh as a child of the given mesh.
 * Uses the inverted-normals (BackSide) trick — no post-processing needed.
 */
export function addOutline(mesh, thickness = 0.04) {
  const outlineMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    side: THREE.BackSide,
  });
  const outline = new THREE.Mesh(mesh.geometry, outlineMat);
  outline.scale.setScalar(1 + thickness);
  outline.renderOrder = -1;
  mesh.add(outline);
  return outline;
}

/**
 * Adds outlines to every Mesh within a Group recursively.
 */
export function addOutlineToGroup(group, thickness = 0.04) {
  group.traverse(child => {
    if (child.isMesh && child.material?.side !== THREE.BackSide) {
      addOutline(child, thickness);
    }
  });
}

/**
 * MeshToonMaterial variant that discards fragments within a world-space XZ
 * circle centred on uPlayerPos. Radius is uRevealR (metres). Used by the
 * mine for fog-of-war reveal — unrelated to player-visibility occlusion.
 *
 * After the material compiles, update the player position each frame via:
 *   mat.userData.shader.uniforms.uPlayerPos.value.copy(playerPos)
 */
export function createRevealToonMaterial(color, options = {}) {
  const mat = new THREE.MeshToonMaterial({ color, gradientMap, ...options });

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uPlayerPos = { value: new THREE.Vector3(0, 0, 1e6) };
    shader.uniforms.uRevealR   = { value: 1.5 };
    mat.userData.shader = shader;

    shader.vertexShader = 'varying vec3 vWorldPos;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      `vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
      #include <project_vertex>`
    );

    shader.fragmentShader = [
      'varying vec3 vWorldPos;',
      'uniform vec3 uPlayerPos;',
      'uniform float uRevealR;',
      shader.fragmentShader,
    ].join('\n');
    shader.fragmentShader = shader.fragmentShader.replace(
      'vec4 diffuseColor = vec4( diffuse, opacity );',
      `{ float _rd = length(vWorldPos.xz - uPlayerPos.xz); if (_rd < uRevealR) discard; }
      vec4 diffuseColor = vec4( diffuse, opacity );`
    );
  };

  return mat;
}

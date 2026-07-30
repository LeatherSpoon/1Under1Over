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
 * Animated energy membrane for the vertical Ancient World Gates. Applied at
 * runtime to the GLB's PortalMembrane disc (whose local XY plane is the gate
 * plane, origin at the disc centre — the shader swirls in polar coords around
 * it). Per-portal instance: refreshPortalAccess() tints `uniforms.uColor`
 * (teal reachable / orange locked) and _attachPortalModel registers a spinner
 * that advances `uniforms.uTime` each frame.
 */
export function createPortalEnergyMaterial(radius = 1.5) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(0x00ffcc) },
      uRadius: { value: radius },
    },
    vertexShader: /* glsl */`
      varying vec2 vP;
      void main() {
        vP = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime;
      uniform float uRadius;
      uniform vec3 uColor;
      varying vec2 vP;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main() {
        float r = length(vP) / uRadius;
        if (r > 1.0) discard;
        float a = atan(vP.y, vP.x);
        // drain-swirl: angular flow accelerates toward the centre
        float swirl = a + uTime * 0.9 + 2.2 / (r + 0.25);
        float bands = 0.5 + 0.5 * sin(swirl * 3.0 + r * 14.0 - uTime * 2.4);
        bands *= bands;
        // dimmer well at the centre, luminous mid-field — floored so the disc
        // always glows (a black core over a dark backdrop read as a hole)
        float well = 0.35 + 0.65 * smoothstep(0.0, 0.45, r);
        // bright event-horizon rim just inside the stone edge
        float rim = smoothstep(0.78, 0.97, r) * (1.0 - smoothstep(0.97, 1.0, r));
        // sparse shimmer sparkles
        float sp = step(0.985, hash(floor(vP * 9.0) + floor(uTime * 3.0)));
        vec3 col = uColor * (0.35 + 0.85 * bands) * well
                 + uColor * rim * 1.6
                 + vec3(1.0) * sp * 0.6;
        float alpha = 0.45 + 0.4 * bands * well + rim * 0.6;
        gl_FragColor = vec4(col, alpha);
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

// Floor for the inverted-hull width in world units. The scale trick makes the
// hull thickness proportional to mesh size, so sub-unit props (resource-node
// stumps, small rocks) used to get sub-pixel — invisible — outlines while
// trees read fine. Raise cautiously: it widens every small prop's outline.
const MIN_OUTLINE_WORLD = 0.045;

/**
 * Adds a black outline mesh as a child of the given mesh.
 * Uses the inverted-normals (BackSide) trick — no post-processing needed.
 * `thickness` is a scale fraction; meshes whose proportional hull would be
 * thinner than MIN_OUTLINE_WORLD world units get bumped up to that floor.
 */
export function addOutline(mesh, thickness = 0.04) {
  const outlineMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    side: THREE.BackSide,
  });
  const outline = new THREE.Mesh(mesh.geometry, outlineMat);
  if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
  const r = mesh.geometry.boundingSphere?.radius || 1;
  outline.scale.setScalar(1 + Math.max(thickness, MIN_OUTLINE_WORLD / r));
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
 * Reveal cut used by the mine so tall rock never hides the player: fragments
 * are discarded only when they sit between the camera and the player — inside
 * a uRevealR circle around the player in view-space XY (world metres under
 * the ortho camera) and closer to the camera than the player. Rock beside the
 * player in an open corridor is NOT cut.
 *
 * After the material compiles, update the player position each frame via:
 *   mat.userData.shader.uniforms.uPlayerPos.value.copy(playerPos)
 * (main.js does this for every material in env._revealMaterials.)
 */
function _addRevealDiscard(mat, revealR) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uPlayerPos = { value: new THREE.Vector3(0, 0, 1e6) };
    shader.uniforms.uRevealR   = { value: revealR };
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
    // Occlusion-aware cut: only open fragments that actually sit between the
    // camera and the player — inside the player's screen-space circle (view
    // XY, world-scaled under the ortho camera) AND nearer the camera than the
    // player's torso. Rock merely *beside* the player stays solid.
    shader.fragmentShader = shader.fragmentShader.replace(
      'vec4 diffuseColor = vec4( diffuse, opacity );',
      `{ vec3 _fv = (viewMatrix * vec4(vWorldPos, 1.0)).xyz;
         vec3 _pv = (viewMatrix * vec4(uPlayerPos + vec3(0.0, 0.9, 0.0), 1.0)).xyz;
         if (distance(_fv.xy, _pv.xy) < uRevealR && _fv.z > _pv.z + 0.3) discard; }
      vec4 diffuseColor = vec4( diffuse, opacity );`
    );
  };
}

export function createRevealToonMaterial(color, options = {}) {
  const { revealR = 1.5, ...matOptions } = options;
  const mat = new THREE.MeshToonMaterial({ color, gradientMap, ...matOptions });
  _addRevealDiscard(mat, revealR);
  return mat;
}

/**
 * Black BackSide outline material whose fragments open around the player in
 * the same circle as the reveal materials. Outlines on reveal meshes MUST use
 * this — a plain black shell doesn't discard, so the reveal hole exposes the
 * shell interior as a solid black blob over the wall.
 */
export function createRevealOutlineMaterial(options = {}) {
  const { revealR = 1.5 } = options;
  const mat = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide });
  _addRevealDiscard(mat, revealR);
  return mat;
}

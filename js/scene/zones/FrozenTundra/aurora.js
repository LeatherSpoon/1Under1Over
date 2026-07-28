import * as THREE from 'three';

/**
 * The aurora — a live curtain standing on the Frozen Tundra's northern horizon.
 *
 * ── Why this shape, and not ribbons overhead ─────────────────────────────────
 * The zone's first aurora was cut because additive sky ribbons read as painted
 * stripes ON THE SNOW. That is a property of the camera, not of auroras: at a
 * fixed 46° ortho view, anything spread across the sky above the player is seen
 * at a glancing angle and projects flat onto the ground plane behind it, so it
 * paints rather than hangs.
 *
 * The fix is to stand the aurora UP and put it far away. These curtains are
 * vertical planes parked just inside the world's north edge, behind everything
 * the player can reach. They occupy the band of frame that used to be empty
 * gradient, they are occluded by the arch plaza and the arch itself (depthTest
 * on, depthWrite off), and because they are seen nearly face-on they can never
 * project onto the floor. It also gives the zone the thing it most lacked:
 * something to walk toward.
 *
 * ── Motion ──────────────────────────────────────────────────────────────────
 * Three layers at different depths, speeds and hues. Each ray is a sum of
 * travelling sines in x, so bands drift, brighten and thin without any texture
 * or noise lookup; a vertical falloff frays the top and grounds the base. The
 * layers move at different rates, which reads as depth.
 */

const VERT = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = `
  uniform float uTime;
  uniform vec3  uLow;
  uniform vec3  uHigh;
  uniform float uSpeed;
  uniform float uScale;
  uniform float uIntensity;
  varying vec2 vUv;

  // Travelling bands: several sines at incommensurate frequencies so the
  // pattern never visibly repeats over a play session.
  float curtain(float x, float t) {
    float v = 0.0;
    v += sin(x * 3.1 + t * 0.55);
    v += 0.7  * sin(x * 5.7 - t * 0.34 + 1.7);
    v += 0.45 * sin(x * 11.3 + t * 0.81 + 4.1);
    v += 0.3  * sin(x * 19.7 - t * 1.20 + 2.3);
    return v / 2.45;                       // → roughly −1..1
  }

  void main() {
    float t = uTime * uSpeed;
    float band = curtain(vUv.x * uScale, t);
    // Rays: keep the crests, drop the troughs, so light hangs in vertical
    // shafts with dark sky between them.
    float ray = smoothstep(0.05, 0.95, band);

    // Vertical shape — grounded and bright at the base, frayed out at the top.
    float base = smoothstep(0.0, 0.16, vUv.y);
    float top  = 1.0 - smoothstep(0.30, 1.0, vUv.y);
    // The fray makes the upper edge ragged instead of a straight cut.
    float fray = 1.0 - smoothstep(0.0, 1.0, vUv.y + 0.34 * band);
    float shape = base * mix(top, fray, 0.6);

    float a = ray * shape * uIntensity;
    if (a < 0.004) discard;
    vec3 col = mix(uLow, uHigh, clamp(vUv.y * 1.35, 0.0, 1.0));
    gl_FragColor = vec4(col * (0.7 + 0.6 * ray), a);
  }
`;

// Layer specs: z depth, size, hue pair, animation rate. Greens near the
// horizon shading to violet up top is the ordinary high-latitude display —
// oxygen low, nitrogen high — and it happens to put the warmest value right
// where the ice arch's silhouette crosses it.
const LAYERS = [
  { z: -59.0, w: 92, h: 30, y: 3.0, low: 0x39f0a8, high: 0x1f6fb0, speed: 0.30, scale: 5.4, intensity: 0.52 },
  { z: -60.5, w: 104, h: 38, y: 2.0, low: 0x6affc0, high: 0x8a52d8, speed: 0.19, scale: 3.7, intensity: 0.40 },
  { z: -61.6, w: 118, h: 46, y: 1.0, low: 0x2fd8e0, high: 0xd45ca8, speed: 0.11, scale: 2.6, intensity: 0.26 },
];

/**
 * Build the curtains and register their per-frame tick.
 * Returns the created meshes (mostly for tests/debugging).
 */
export function addAurora(env) {
  const made = [];
  for (const L of LAYERS) {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: Math.random() * 400 },   // desynchronise the layers
        uLow: { value: new THREE.Color(L.low) },
        uHigh: { value: new THREE.Color(L.high) },
        uSpeed: { value: L.speed },
        uScale: { value: L.scale },
        uIntensity: { value: L.intensity },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      // Additive so it reads as light in the sky rather than a painted sheet —
      // safe here precisely because the curtain is vertical and far away.
      blending: THREE.AdditiveBlending,
      // depthTest ON so the arch plaza and the arch occlude its base (that is
      // what puts it BEHIND the world); depthWrite OFF so the layers blend
      // with each other instead of clipping.
      depthTest: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(L.w, L.h), mat);
    mesh.position.set(0, L.y + L.h / 2, L.z);
    mesh.renderOrder = -1;              // draw before the props that occlude it
    env.group.add(mesh);
    env._spinners.push({
      mesh,
      update: (delta) => { mat.uniforms.uTime.value += delta; },
    });
    made.push(mesh);
  }
  return made;
}

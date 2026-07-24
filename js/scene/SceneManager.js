import * as THREE from 'three';
import { CONFIG } from '../config.js';

/**
 * Per-zone lighting/atmosphere presets. Zones not listed use `default`.
 * Cave zones go dark so lantern/rune point lights (added by the zone builders)
 * carry the mood.
 */
const ZONE_AMBIENCE = {
  default: {
    clear: 0x87ceeb,
    fog: { color: 0x87ceeb, near: 35, far: 70 },
    ambient: { color: 0xfff5e0, intensity: 0.55 },
    sun: { color: 0xfff8dc, intensity: 1.1 },
    fill: { color: 0xb0d8ff, intensity: 0.3 },
  },
  mine: {
    clear: 0x050403,
    fog: { color: 0x060504, near: 16, far: 44 },
    ambient: { color: 0xffd9b0, intensity: 0.28 },
    sun: { color: 0xbfd0e8, intensity: 0.5 },
    fill: { color: 0x6a5cae, intensity: 0.14 },
  },
  depths: {
    clear: 0x030308,
    fog: { color: 0x030308, near: 13, far: 38 },
    ambient: { color: 0x8090ff, intensity: 0.3 },
    sun: { color: 0x9fb4ff, intensity: 0.45 },
    fill: { color: 0x4444aa, intensity: 0.12 },
  },
  // Jungle understorey: green-tinted humid haze, canopy-filtered warm sun,
  // and a lush green fill so shadows read mossy rather than grey.
  verdantMaw: {
    clear: 0xa8d890,
    fog: { color: 0xa8d890, near: 30, far: 72 },
    ambient: { color: 0xeaffdc, intensity: 0.62 },
    sun: { color: 0xfff8c8, intensity: 1.1 },
    fill: { color: 0x8fd87a, intensity: 0.35 },
  },
  // Arctic daylight: pale high sky, cold blue fill in the shadows, and a low
  // warm winter sun so the snow reads white-gold against teal ice.
  frozenTundra: {
    clear: 0xbfd8ee,
    fog: { color: 0xc8dcf0, near: 26, far: 62 },
    ambient: { color: 0xdce8ff, intensity: 0.6 },
    sun: { color: 0xfff2e0, intensity: 0.95 },
    fill: { color: 0x9fb8e8, intensity: 0.35 },
  },
  // Ice cave: near-black cold sky and tight fog so the wall ring reads as
  // enclosure, with a blue-white ambient that keeps the ice legible. The
  // cavern's readable light comes from the point lights its builder places.
  glacialHollow: {
    clear: 0x060a12,
    fog: { color: 0x08101c, near: 15, far: 42 },
    ambient: { color: 0xbcd8ee, intensity: 0.42 },
    sun: { color: 0xcfe4ff, intensity: 0.5 },
    fill: { color: 0x4a7ab0, intensity: 0.22 },
  },
  // Ship cabin: warm lamplight over the wood-and-brass interior, deep space
  // beyond the hull. Fog pushed far out — the room is only 22 units across.
  spaceship: {
    clear: 0x10141f,
    fog: { color: 0x10141f, near: 30, far: 80 },
    ambient: { color: 0xffe2b8, intensity: 0.62 },
    sun: { color: 0xffedd0, intensity: 1.05 },
    fill: { color: 0x8fd8cc, intensity: 0.25 },
  },
  // NPC home interiors (Verdant Maw hamlet) — small lamplit rooms; short fog
  // swallows the void beyond the walls. Each tender gets their own cast:
  // Sylva teal herb-glow, Bram amber hearth, Sprig warm workshop brass.
  homeSylva: {
    clear: 0x121a12,
    fog: { color: 0x121a12, near: 9, far: 24 },
    ambient: { color: 0xd8f2e0, intensity: 0.62 },
    sun: { color: 0xcfeedd, intensity: 0.62 },
    fill: { color: 0x6fd8c0, intensity: 0.32 },
  },
  homeBram: {
    clear: 0x171208,
    fog: { color: 0x171208, near: 9, far: 24 },
    ambient: { color: 0xffe2b0, intensity: 0.6 },
    sun: { color: 0xffd9a0, intensity: 0.65 },
    fill: { color: 0xcc8844, intensity: 0.28 },
  },
  homeSprig: {
    clear: 0x14120c,
    fog: { color: 0x14120c, near: 9, far: 24 },
    ambient: { color: 0xf2ecc8, intensity: 0.62 },
    sun: { color: 0xffeab8, intensity: 0.64 },
    fill: { color: 0xa8d870, intensity: 0.3 },
  },
};

export class SceneManager {
  constructor(canvas) {
    this.canvas = canvas;

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x87ceeb); // sky blue

    // Scene
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x87ceeb, 35, 70);

    // Orthographic camera
    this._aspect = 1;
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
    this._updateCameraFrustum();

    const { x, y, z } = CONFIG.CAMERA_OFFSET;
    this.camera.position.set(x, y, z);
    this.camera.lookAt(0, 0, 0);

    // Lighting — kept as fields so setZoneAmbience() can retune them per zone
    this._ambient = new THREE.AmbientLight(0xfff5e0, 0.55);
    this.scene.add(this._ambient);

    const sun = new THREE.DirectionalLight(0xfff8dc, 1.1);
    sun.position.set(15, 30, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 120;
    sun.shadow.camera.left = -40;
    sun.shadow.camera.right = 40;
    sun.shadow.camera.top = 40;
    sun.shadow.camera.bottom = -40;
    this.scene.add(sun);
    this._sun = sun;

    // Fill light from opposite side
    this._fill = new THREE.DirectionalLight(0xb0d8ff, 0.3);
    this._fill.position.set(-10, 10, -10);
    this.scene.add(this._fill);

    // Target position for camera follow
    this._camTarget = new THREE.Vector3(0, 0, 0);

    // Scroll-wheel zoom — scales the ortho frustum. Listener sits on the
    // canvas only, so wheeling over HUD panels still scrolls their lists.
    this._zoom = 1;
    this._zoomTarget = 1;
    canvas.addEventListener('wheel', (e) => {
      const step = e.deltaY > 0 ? CONFIG.ZOOM_STEP : 1 / CONFIG.ZOOM_STEP;
      this._zoomTarget = Math.min(CONFIG.ZOOM_MAX, Math.max(CONFIG.ZOOM_MIN, this._zoomTarget * step));
    }, { passive: true });

    // Handle resize
    window.addEventListener('resize', () => this._onResize());
    this._onResize();
  }

  /**
   * Swap sky, fog, and global light levels for the given zone.
   * Called by switchZone(); unlisted zones restore the default daylight look.
   */
  setZoneAmbience(zoneName) {
    const p = ZONE_AMBIENCE[zoneName] || ZONE_AMBIENCE.default;
    this.renderer.setClearColor(p.clear);
    this.scene.fog.color.setHex(p.fog.color);
    this.scene.fog.near = p.fog.near;
    this.scene.fog.far = p.fog.far;
    this._ambient.color.setHex(p.ambient.color);
    this._ambient.intensity = p.ambient.intensity;
    this._sun.color.setHex(p.sun.color);
    this._sun.intensity = p.sun.intensity;
    this._fill.color.setHex(p.fill.color);
    this._fill.intensity = p.fill.intensity;
  }

  _updateCameraFrustum() {
    const s = (CONFIG.FRUSTUM_SIZE / 2) * this._zoom;
    this.camera.left = -s * this._aspect;
    this.camera.right = s * this._aspect;
    this.camera.top = s;
    this.camera.bottom = -s;
    this.camera.updateProjectionMatrix();
  }

  _onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this._aspect = w / h;
    this.renderer.setSize(w, h);
    this._updateCameraFrustum();
  }

  /**
   * Smoothly translate camera to follow player position.
   */
  update(playerPos) {
    if (Math.abs(this._zoomTarget - this._zoom) > 0.0005) {
      this._zoom += (this._zoomTarget - this._zoom) * CONFIG.ZOOM_LERP;
      this._updateCameraFrustum();
    }
    const { x, y, z } = CONFIG.CAMERA_OFFSET;
    this._camTarget.set(playerPos.x + x, y, playerPos.z + z);
    this.camera.position.lerp(this._camTarget, CONFIG.CAMERA_LERP);
    // Keep lookAt direction constant
    const lookAt = new THREE.Vector3(
      this.camera.position.x - x,
      0,
      this.camera.position.z - z
    );
    this.camera.lookAt(lookAt);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}

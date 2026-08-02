import * as THREE from 'three';
import { CONFIG } from '../config.js';

/**
 * Per-zone lighting/atmosphere presets. Zones not listed use `default`.
 * Cave zones go dark so lantern/rune point lights (added by the zone builders)
 * carry the mood.
 */
// Height of the player's carried lamp (see _playerLight below).
const PLAYER_LIGHT_Y = 2.4;

const ZONE_AMBIENCE = {
  default: {
    clear: 0x87ceeb,
    fog: { color: 0x87ceeb, near: 35, far: 70 },
    ambient: { color: 0xfff5e0, intensity: 0.55 },
    sun: { color: 0xfff8dc, intensity: 1.1 },
    fill: { color: 0xb0d8ff, intensity: 0.3 },
    // Faint outdoors on purpose — a lamp that reads in daylight blows out
    // everything the player walks past. Presets that omit this inherit it.
    playerLight: { color: 0xffe9c8, intensity: 1.6, distance: 9 },
  },
  mine: {
    clear: 0x050403,
    fog: { color: 0x060504, near: 16, far: 44 },
    ambient: { color: 0xffd9b0, intensity: 0.28 },
    sun: { color: 0xbfd0e8, intensity: 0.5 },
    fill: { color: 0x6a5cae, intensity: 0.14 },
    playerLight: { color: 0xffc27a, intensity: 9, distance: 16 },
  },
  depths: {
    clear: 0x030308,
    fog: { color: 0x030308, near: 13, far: 38 },
    ambient: { color: 0x8090ff, intensity: 0.3 },
    sun: { color: 0x9fb4ff, intensity: 0.45 },
    fill: { color: 0x4444aa, intensity: 0.12 },
    playerLight: { color: 0xa8b8ff, intensity: 9, distance: 16 },
  },
  // Pandora after dark: deep teal-indigo night, a pale moon instead of sun,
  // violet bounce in the shadows. The glow shrooms, canopy lights and the
  // player's own bio-lamp carry the near light — the preset deliberately
  // leaves the jungle dim so the bioluminescence reads.
  verdantMaw: {
    clear: 0x0c1e2e,
    fog: { color: 0x102a3a, near: 24, far: 62 },
    ambient: { color: 0x8fb4d8, intensity: 0.48 },
    sun: { color: 0xbfe0ff, intensity: 0.5 },
    fill: { color: 0x7a5fd8, intensity: 0.32 },
    playerLight: { color: 0xa8f0e0, intensity: 4.2, distance: 12 },
    // The northern TRANSITIONAL PHASE (owner, Raya/Kumandra direction): the
    // teal night lerps toward warm golden-green as the player pushes past the
    // third river; full warmth by the Emberglade approach. Colors only —
    // intensities/fog range stay put. Applied per-frame in update() from the
    // player's z, smoothstepped between z0 and z1.
    zGradient: {
      z0: -64, z1: -102,
      clear: 0x1a2410, fog: 0x2a3a1c,
      ambient: 0xd8cfa0, sun: 0xffe4b8, fill: 0xb08a48,
      playerLight: 0xf2e4b0,
    },
  },
  // Arctic dusk under an aurora. The old preset was near-monochrome — sky
  // 0xbfd8ee, fog 0xc8dcf0 and ground 0xe2ecf5 were the same value, so 55.7%
  // of the frame landed in one 8-level luminance band and nothing had form.
  // Three deliberate changes: the sky goes DARKER than the snow (so there is
  // a horizon at all), the shadow fill goes hard blue-violet (snow is a mirror
  // — it takes the sky in shadow), and the sun drops low and warm so crests
  // catch gold against it. Fog pulled back so the arch is visible from the
  // portal apron 45 units south; it existed to hide an empty north, and the
  // north is no longer empty.
  frozenTundra: {
    clear: 0x5f7ea6,
    fog: { color: 0x89a8c8, near: 46, far: 108 },
    ambient: { color: 0xcfe0f5, intensity: 0.52 },
    sun: { color: 0xffdfae, intensity: 1.25 },
    fill: { color: 0x4a68b4, intensity: 0.55 },
    playerLight: { color: 0xffe2b4, intensity: 2.0, distance: 10 },
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
    playerLight: { color: 0xbfe4ff, intensity: 7, distance: 15 },
  },
  // Geothermal rift under the hollow: same near-black enclosure, but the
  // dark leans warm and the shadow fill is ember instead of glacier blue —
  // the cold-to-warm shift is carried by the builder's cyan/amber lights.
  meltwaterRift: {
    clear: 0x0a0810,
    fog: { color: 0x120c10, near: 15, far: 42 },
    ambient: { color: 0xd8ccc0, intensity: 0.4 },
    sun: { color: 0xe8d8c8, intensity: 0.45 },
    fill: { color: 0xa06a48, intensity: 0.22 },
    playerLight: { color: 0xffcf9a, intensity: 6.5, distance: 14 },
  },
  // Drowned city in a sea-grotto: near-black teal enclosure, dense watery fog,
  // pale blue-green light from everywhere and nowhere. The builder's cyan
  // glyph-lights and the Crystal Heart hub carry the legibility.
  atlantis: {
    clear: 0x061218,
    fog: { color: 0x082028, near: 16, far: 46 },
    ambient: { color: 0xa8d8e0, intensity: 0.42 },
    sun: { color: 0x9fd8e8, intensity: 0.5 },
    fill: { color: 0x2a7a88, intensity: 0.25 },
    playerLight: { color: 0x9fe8ff, intensity: 6.5, distance: 15 },
  },
  // The Labyrinth: buried stone night. The dark leans warm (torch country);
  // braziers and the shrine carry legibility, the lamp does the near work.
  labyrinth: {
    clear: 0x0a0806,
    fog: { color: 0x100c08, near: 15, far: 44 },
    ambient: { color: 0xe0cbb0, intensity: 0.4 },
    sun: { color: 0xffe0b8, intensity: 0.42 },
    fill: { color: 0x8a5a38, intensity: 0.22 },
    playerLight: { color: 0xffd9a8, intensity: 7, distance: 15 },
  },
  // The Cinderforge: volcanic night. Hotter and redder than its Labyrinth
  // sibling — lava pools, braziers and the anvil carry legibility, the fog
  // holds a faint ember cast so the dark never reads cold.
  cinderforge: {
    clear: 0x0c0504,
    fog: { color: 0x160806, near: 15, far: 44 },
    ambient: { color: 0xf0c0a0, intensity: 0.38 },
    sun: { color: 0xffc890, intensity: 0.4 },
    fill: { color: 0x9c3f22, intensity: 0.26 },
    playerLight: { color: 0xffc890, intensity: 7, distance: 15 },
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
  // The computer's machine room — dim interior, lamp-lit (homeSylva's preset).
  computerCore: {
    clear: 0x121a12,
    fog: { color: 0x121a12, near: 9, far: 24 },
    ambient: { color: 0xd8f2e0, intensity: 0.62 },
    sun: { color: 0xcfeedd, intensity: 0.62 },
    fill: { color: 0x6fd8c0, intensity: 0.32 },
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

    // A lamp the player carries. Rides just above head height so it pools on
    // the ground around them rather than only lighting their scalp. Physical
    // units with decay 1, same convention as the mine lanterns (~4.5) — so the
    // daylight default is deliberately faint and the caves carry the real work.
    this._playerLight = new THREE.PointLight(0xffe9c8, 0, 9, 1);
    this._playerLight.position.set(0, PLAYER_LIGHT_Y, 0);
    this.scene.add(this._playerLight);

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
    // Stash for the per-frame z-gradient lerp (zones without zGradient never
    // touch the gradient path); force a re-apply on the next update.
    this._ambPreset = p;
    this._gradT = -1;
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
    const pl = p.playerLight || ZONE_AMBIENCE.default.playerLight;
    this._playerLight.color.setHex(pl.color);
    this._playerLight.intensity = pl.intensity;
    this._playerLight.distance = pl.distance;
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
   * Snap the camera (and player lamp) directly onto the player — used on zone
   * switches, where the follow lerp would otherwise glide visibly across the
   * new zone from wherever the camera sat in the old one.
   */
  snapToPlayer(playerPos) {
    const { x, y, z } = CONFIG.CAMERA_OFFSET;
    this.camera.position.set(playerPos.x + x, playerPos.y + y, playerPos.z + z);
    this.camera.lookAt(playerPos.x, playerPos.y, playerPos.z);
    this._playerLight.position.set(playerPos.x, playerPos.y + PLAYER_LIGHT_Y, playerPos.z);
  }

  /**
   * Smoothly translate camera to follow player position.
   */
  update(playerPos) {
    if (Math.abs(this._zoomTarget - this._zoom) > 0.0005) {
      this._zoom += (this._zoomTarget - this._zoom) * CONFIG.ZOOM_LERP;
      this._updateCameraFrustum();
    }
    // Zone z-gradient: lerp the palette (colors only) from the player's z.
    const g = this._ambPreset && this._ambPreset.zGradient;
    if (g) {
      let t = (playerPos.z - g.z0) / (g.z1 - g.z0);
      t = t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
      if (Math.abs(t - this._gradT) > 0.003) {
        this._gradT = t;
        const p = this._ambPreset;
        if (!this._gradA) { this._gradA = new THREE.Color(); this._gradB = new THREE.Color(); }
        const mix = (baseHex, warmHex, apply) => {
          this._gradA.setHex(baseHex);
          this._gradB.setHex(warmHex);
          apply(this._gradA.lerp(this._gradB, t));
        };
        mix(p.clear, g.clear, c => this.renderer.setClearColor(c));
        mix(p.fog.color, g.fog, c => this.scene.fog.color.copy(c));
        mix(p.ambient.color, g.ambient, c => this._ambient.color.copy(c));
        mix(p.sun.color, g.sun, c => this._sun.color.copy(c));
        mix(p.fill.color, g.fill, c => this._fill.color.copy(c));
        mix((p.playerLight || ZONE_AMBIENCE.default.playerLight).color, g.playerLight,
          c => this._playerLight.color.copy(c));
      }
    }
    this._playerLight.position.set(playerPos.x, playerPos.y + PLAYER_LIGHT_Y, playerPos.z);
    const { x, y, z } = CONFIG.CAMERA_OFFSET;
    // The rig rides the player's height (canopy climbs lift the whole camera),
    // lerping smoothly like the XZ follow always has.
    this._camTarget.set(playerPos.x + x, playerPos.y + y, playerPos.z + z);
    // XZ keeps its long-standing weight; height follows on its own faster lerp
    // (see CONFIG.CAMERA_LERP_Y — level changes snap, so a slow Y follow trails
    // the player for the length of a climb).
    this.camera.position.x += (this._camTarget.x - this.camera.position.x) * CONFIG.CAMERA_LERP;
    this.camera.position.z += (this._camTarget.z - this.camera.position.z) * CONFIG.CAMERA_LERP;
    this.camera.position.y += (this._camTarget.y - this.camera.position.y)
      * (CONFIG.CAMERA_LERP_Y ?? CONFIG.CAMERA_LERP);
    // Keep lookAt direction constant: look from wherever the camera is back
    // along the fixed offset vector (generalizes the old y=0 ground look).
    const lookAt = new THREE.Vector3(
      this.camera.position.x - x,
      this.camera.position.y - y,
      this.camera.position.z - z
    );
    this.camera.lookAt(lookAt);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Queue every texture reachable from the given GLB cache for background
   * GPU upload (main.js calls this once when the models finish parsing).
   * Uploads happen in tickTexturePreload — a budgeted count per frame from
   * the game loop — so a zone's first visit never pays a burst of
   * texture-upload stalls on its warm-up render.
   */
  queueTexturePreload(glbMap) {
    this._texQueue = this._texQueue || [];
    const seen = this._texSeen = this._texSeen || new Set();
    for (const key of Object.keys(glbMap || {})) {
      const g = glbMap[key];
      if (!g || !g.traverse) continue;
      g.traverse(o => {
        const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
        for (const m of mats) {
          for (const slot of ['map', 'emissiveMap']) {
            const tex = m && m[slot];
            if (tex && !seen.has(tex.uuid)) {
              seen.add(tex.uuid);
              this._texQueue.push(tex);
            }
          }
        }
      });
    }
  }

  /** Upload up to n queued textures this frame (no-op once drained). */
  tickTexturePreload(n = 1) {
    if (!this._texQueue || !this._texQueue.length) return;
    for (let i = 0; i < n && this._texQueue.length; i++) {
      try { this.renderer.initTexture(this._texQueue.pop()); } catch { /* disposed */ }
    }
  }

  /**
   * Pad the scene's point-light count up to the next bucket with dead lights
   * (parented into the zone group, so they clear on zone switch). THREE
   * bakes the exact count into every shader program — bucketing the count
   * lets zones share compiled program sets instead of each first visit
   * compiling its own (the zone-switch delay fix; buckets mirror
   * shaderWarm.js, which pre-compiles against these counts at boot).
   */
  padZonePointLights(zoneGroup) {
    const LIGHT_BUCKETS = [6, 12, 24];
    let pt = 0;
    this.scene.traverse(o => { if (o.isPointLight) pt++; });
    const bucket = LIGHT_BUCKETS.find(b => b >= pt) || pt;
    for (let i = pt; i < bucket; i++) {
      const pad = new THREE.PointLight(0x000000, 0, 0.001);
      pad.position.set(0, -50, 0);
      zoneGroup.add(pad);
    }
  }
}

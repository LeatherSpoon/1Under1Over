import * as THREE from 'three';
import { CONFIG } from '../config.js';

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

    // Lighting
    const ambient = new THREE.AmbientLight(0xfff5e0, 0.55);
    this.scene.add(ambient);

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

    // Fill light from opposite side
    const fill = new THREE.DirectionalLight(0xb0d8ff, 0.3);
    fill.position.set(-10, 10, -10);
    this.scene.add(fill);

    // Target position for camera follow
    this._camTarget = new THREE.Vector3(0, 0, 0);

    // Handle resize
    window.addEventListener('resize', () => this._onResize());
    this._onResize();
  }

  _updateCameraFrustum() {
    const s = CONFIG.FRUSTUM_SIZE / 2;
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

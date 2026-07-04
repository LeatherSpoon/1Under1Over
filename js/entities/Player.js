import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createToonMaterial, addOutline } from '../scene/ToonMaterials.js';
import { CONFIG } from '../config.js';

// Rigged player character GLB (armature + Idle/Run clips), preloaded once.
// The procedural capsule body below stays as the fallback until it arrives.
let _playerGLB = null;
let _onPlayerGLB = null;
new GLTFLoader().load('./models/Player.glb', gltf => {
  _playerGLB = gltf;
  if (_onPlayerGLB) _onPlayerGLB();
}, undefined, () => {});

// Natural forward speed of the authored run cycle (units/sec) — used to scale
// the clip so feet don't slide at boosted move speeds.
const RUN_CLIP_SPEED = 3.5;

export class Player {
  constructor(scene, statsSystem) {
    this.stats = statsSystem;
    this.scene = scene;
    this.position = new THREE.Vector3(0, 0, 0);
    this.isInCombat = false;
    this.stepsSinceLast = 0;
    this._totalDist = 0;
    this._facing = 0;

    // Terrain — set by main.js when zone changes
    this.currentTerrain = 'grass';

    // Energy speed multiplier — set by main.js each frame
    this.energySpeedMult = 1.0;

    // Gathering state
    this.isGathering = false;
    this._gatherProgress = 0;
    this._gatherTarget = null; // ResourceNode
    this._gatherDuration = 0;

    this.group = new THREE.Group();
    this._buildMesh();
    scene.add(this.group);

    // Animation state — populated by _attachModel() once the GLB is in
    this._mixer = null;
    this._actions = null;
    this._isMoving = false;
    this._movedThisFrame = false;
    this._lastSpeed = 0;
    if (_playerGLB) this._attachModel();
    else _onPlayerGLB = () => this._attachModel();
  }

  // Swap the procedural capsule for the rigged GLB character.
  _attachModel() {
    const model = _playerGLB.scene;
    let skinned = null;
    model.traverse(n => { if (n.isSkinnedMesh) skinned = n; });
    if (!skinned) return;

    // Re-shade with the game's toon gradient, keeping the baked diffuse atlas
    skinned.material = createToonMaterial(0xffffff, { map: skinned.material.map });
    skinned.castShadow = true;
    skinned.frustumCulled = false; // static bounds vs. animated pose
    skinned.renderOrder = 2;       // after the ghost (see below)

    // Skinning-aware inverted-hull outline: a second SkinnedMesh bound to the
    // same skeleton, inflated along skinned normals in the vertex shader
    // (addOutline's scale trick doesn't follow bone deformation).
    const outlineMat = createToonMaterial(0x000000, { side: THREE.BackSide });
    outlineMat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <project_vertex>',
        'transformed += normalize(objectNormal) * 0.018;\n#include <project_vertex>'
      );
    };
    // Mounted as children of the skinned mesh so their matrixWorld (and thus
    // depth arithmetic) is identical — a sibling's slightly different matrix
    // chain produces FP depth deltas that break the ghost's GreaterDepth test.
    // renderOrder 2 (NOT -1 like static outlines): the outline must draw
    // AFTER the ghost. Drawn before it, its back-hull depth re-enables
    // self-occlusion — inner shells (skull under hair) sit deeper than the
    // outline's back faces and pass GreaterDepth, leaving a faint permanent
    // ghost tint on the head/armor.
    const outline = new THREE.SkinnedMesh(skinned.geometry, outlineMat);
    outline.bind(skinned.skeleton, skinned.bindMatrix);
    outline.renderOrder = 2;
    outline.frustumCulled = false;
    skinned.add(outline);

    // Through-wall ghost silhouette. Unlike the per-part procedural ghosts,
    // a single full-body GreaterDepth mesh self-occludes (torso behind head
    // reads as "occluded"), so it must be depth-tested against the world
    // ONLY: drawn in the opaque pass after world geometry (renderOrder 1) but
    // before the body writes its own depth (renderOrder 2). X-ray ordering —
    // pixels the world hides from the body get a solid silhouette tint.
    const ghostMat = new THREE.MeshBasicMaterial({
      color: 0x88bbee,
      depthFunc: THREE.GreaterDepth,
      depthWrite: false,
    });
    const ghost = new THREE.SkinnedMesh(skinned.geometry, ghostMat);
    ghost.bind(skinned.skeleton, skinned.bindMatrix);
    ghost.renderOrder = 1;
    ghost.frustumCulled = false;
    skinned.add(ghost);

    this.group.clear(); // drop the procedural fallback meshes
    this.group.add(model);

    this._mixer = new THREE.AnimationMixer(model);
    const clips = _playerGLB.animations;
    const idleClip = clips.find(c => /idle/i.test(c.name));
    const runClip = clips.find(c => /run/i.test(c.name));
    this._actions = {
      idle: idleClip ? this._mixer.clipAction(idleClip) : null,
      run: runClip ? this._mixer.clipAction(runClip) : null,
    };
    this._actions.idle?.play();
  }

  // Crossfade between Idle and Run when movement starts/stops.
  _setMoving(moving) {
    if (!this._actions?.idle || !this._actions.run) return;
    if (moving === this._isMoving) return;
    this._isMoving = moving;
    const to = moving ? this._actions.run : this._actions.idle;
    const from = moving ? this._actions.idle : this._actions.run;
    to.reset().play();
    from.crossFadeTo(to, 0.18, false);
  }

  _buildMesh() {
    const bodyGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.7, 10);
    const body = new THREE.Mesh(bodyGeo, createToonMaterial(0x4477cc));
    body.position.y = 0.85;
    body.castShadow = true;
    addOutline(body, 0.06);
    this._addGhost(body, 0x4477cc);
    this.group.add(body);

    const headGeo = new THREE.SphereGeometry(0.28, 10, 8);
    const head = new THREE.Mesh(headGeo, createToonMaterial(0xf5c89a));
    head.position.y = 1.48;
    head.castShadow = true;
    addOutline(head, 0.06);
    this._addGhost(head, 0xf5c89a);
    this.group.add(head);

    const eyeGeo = new THREE.SphereGeometry(0.055, 6, 4);
    const eyeMat = createToonMaterial(0x111111);
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-0.1, 1.52, 0.24);
    this.group.add(eyeL);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeR.position.set(0.1, 1.52, 0.24);
    this.group.add(eyeR);

    // Legs intentionally have no ghost mesh — their bottom dips to y=0 and
    // would z-fight with ground/pad/floor geometry, leaking the ghost through
    // the pad in open scenes.
    const legGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.5, 8);
    const legMat = createToonMaterial(0x22336a);
    const legL = new THREE.Mesh(legGeo, legMat);
    legL.position.set(-0.15, 0.25, 0);
    legL.castShadow = true;
    this.group.add(legL);
    const legR = new THREE.Mesh(legGeo, legMat);
    legR.position.set(0.15, 0.25, 0);
    legR.castShadow = true;
    this.group.add(legR);

    this.group.position.copy(this.position);
  }

  // Ghost mesh: depth-greater pass renders only where the parent mesh is
  // occluded by closer geometry, producing a see-through silhouette of the
  // player through walls/trees/mine blocks. Mounted as a child so it inherits
  // transform automatically.
  _addGhost(parent, color) {
    const ghostMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.45,
      depthFunc: THREE.GreaterDepth,
      depthWrite: false,
      // Push ghost slightly closer in depth so its own geometry fails
      // GreaterDepth against the parent (avoids self-bleed from precision
      // mismatch between the two draw calls).
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const ghost = new THREE.Mesh(parent.geometry, ghostMat);
    ghost.renderOrder = 9999;
    parent.add(ghost);
  }

  update(keysDown, delta, touchInput = null) {
    this._movedThisFrame = false;
    this._updateMovement(keysDown, delta, touchInput);
    this._setMoving(this._movedThisFrame);
    if (this._movedThisFrame && this._actions?.run) {
      this._actions.run.timeScale = this._lastSpeed / RUN_CLIP_SPEED;
    }
    this._mixer?.update(delta);
  }

  _updateMovement(keysDown, delta, touchInput) {
    if (this.isInCombat) return;

    const hasE = keysDown.has('KeyE') || (touchInput?.actionPressed ?? false);

    // Gathering — auto-completes once started; cancel by moving
    if (this.isGathering) {
      const dx = keysDown.has('KeyA') || keysDown.has('ArrowLeft')  ? -1
               : keysDown.has('KeyD') || keysDown.has('ArrowRight') ?  1 : 0;
      const dz = keysDown.has('KeyW') || keysDown.has('ArrowUp')    ? -1
               : keysDown.has('KeyS') || keysDown.has('ArrowDown')  ?  1 : 0;
      const joystickMoving = touchInput?.isMoving ?? false;
      if (dx !== 0 || dz !== 0 || joystickMoving) {
        // Player moved — cancel gather
        this.isGathering = false;
        this._gatherProgress = 0;
        this._gatherTarget = null;
        return;
      }
      this._gatherProgress += delta;
      if (this._gatherProgress >= this._gatherDuration) {
        // Gather complete — handled externally via getGatherResult()
        return;
      }
      return; // Don't move while gathering
    }

    const terrain = CONFIG.TERRAIN[this.currentTerrain] || CONFIG.TERRAIN.grass;
    const speed = this.stats.moveSpeed * terrain.speedMult * this.energySpeedMult;

    // HP drain from hazardous terrain (per second)
    if (terrain.hpCost > 0) {
      this.stats.currentHP = Math.max(1, this.stats.currentHP - terrain.hpCost * delta);
    }

    let dx = 0, dz = 0;

    if (keysDown.has('KeyW') || keysDown.has('ArrowUp'))    dz -= 1;
    if (keysDown.has('KeyS') || keysDown.has('ArrowDown'))  dz += 1;
    if (keysDown.has('KeyA') || keysDown.has('ArrowLeft'))  dx -= 1;
    if (keysDown.has('KeyD') || keysDown.has('ArrowRight')) dx += 1;

    // Virtual joystick overrides keyboard movement when active
    if (touchInput?.isMoving) {
      dx = touchInput.dx;
      dz = touchInput.dz;
    } else if (dx !== 0 && dz !== 0) {
      const inv = 1 / Math.SQRT2;
      dx *= inv;
      dz *= inv;
    }

    if (dx !== 0 || dz !== 0) {
      this._movedThisFrame = true;
      this._lastSpeed = speed;
      this._facing = Math.atan2(dx, dz);
      this.group.rotation.y = this._facing;

      const dist = speed * delta;
      this.position.x += dx * dist;
      this.position.z += dz * dist;

      const half = CONFIG.GROUND_SIZE / 2 - 1;
      this.position.x = Math.max(-half, Math.min(half, this.position.x));
      this.position.z = Math.max(-half, Math.min(half, this.position.z));

      this._totalDist += dist;
      const steps = Math.floor(this._totalDist / CONFIG.STEP_LENGTH);
      if (steps > 0) {
        this.stepsSinceLast += steps;
        this._totalDist -= steps * CONFIG.STEP_LENGTH;
      }
    }

    this.group.position.copy(this.position);
  }

  // ── Gathering ──────────────────────────────────────────────────────────────
  startGathering(resourceNode) {
    this.isGathering = true;
    this._gatherTarget = resourceNode;
    this._gatherProgress = 0;
    this._gatherDuration = resourceNode.gatherTime / this.stats.gatherSpeedMult;
  }

  getGatherResult() {
    if (!this.isGathering || this._gatherProgress < this._gatherDuration) return null;
    const result = this._gatherTarget.gather();
    this.isGathering = false;
    this._gatherProgress = 0;
    this._gatherTarget = null;
    return result;
  }

  get gatherProgress() { return this._gatherProgress; }
  get gatherDuration() { return this._gatherDuration; }

  consumeSteps() {
    const s = this.stepsSinceLast;
    this.stepsSinceLast = 0;
    return s;
  }

  teleportTo(x, z) {
    this.position.set(x, 0, z);
    this.group.position.copy(this.position);
  }
}

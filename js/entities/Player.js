import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createToonMaterial, addOutline } from '../scene/ToonMaterials.js';
import { CONFIG, getPlayerBounds } from '../config.js';

// Rigged player character GLB (armature + Idle/Run clips), preloaded once.
// The procedural capsule body below stays as the fallback until it arrives.
let _playerGLB = null;
let _onPlayerGLB = null;
let _resolvePlayerReady;
// Settles on load success OR failure — main.js gates the boot overlay on it,
// so it must never hang.
export const playerModelReady = new Promise(res => { _resolvePlayerReady = res; });
new GLTFLoader().load('./models/Player.glb', gltf => {
  _playerGLB = gltf;
  _resolvePlayerReady();
  if (_onPlayerGLB) _onPlayerGLB();
}, undefined, () => _resolvePlayerReady());

// Natural forward speed of the authored run cycle (units/sec) — used to scale
// the clip so feet don't slide at boosted move speeds.
const RUN_CLIP_SPEED = 3.5;

// Visible gear: meshes bone-parented inside Player.glb (hand.R weapons/tools,
// forearm.L shield, chest armor + back holsters). Runtime only toggles node
// visibility — no mount math. Names must match the GLB (playerRig test pins them).
const GEAR_NODE_NAMES = [
  'Gear_BladeScrap', 'Gear_BladeBasic', 'Gear_Knuckles', 'Gear_ToolDrill',
  'Gear_ToolCutter', 'Gear_Shield', 'Gear_ArmorChest',
  'Gear_BladeScrapB', 'Gear_BladeBasicB', 'Gear_ShieldB',
];
// Equipment item label -> gear nodes. Bladed weapons ride the back out of
// combat and jump to the fist in combat; knuckles are worn on the fist always.
const GEAR_BY_ITEM = {
  'Scrap Blade':    { hand: 'Gear_BladeScrap', back: 'Gear_BladeScrapB' },
  'Basic Blade':    { hand: 'Gear_BladeBasic', back: 'Gear_BladeBasicB' },
  'Spike Knuckles': { hand: 'Gear_Knuckles', always: true },
  'Basic Shield':   { hand: 'Gear_Shield', back: 'Gear_ShieldB' },
};
// Armor accent tint per equipment tier (provisional defaults — owner lever).
const TIER_ACCENT = {
  Basic: 0xf08a2a, Combat: 0xff5533, Good: 0x39d6c8, Rare: 0xb06cff, Epic: 0xffc21c,
};

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

    // Playable bounds — set by switchZone alongside terrain. Per-zone, so a
    // biome can be any size; see CONFIG.ZONE_BOUNDS.
    this.bounds = getPlayerBounds('landingSite');

    // Energy speed multiplier — set by main.js each frame
    this.energySpeedMult = 1.0;

    // Push direction for this frame (see _updateMovement)
    this.moveDirX = 0;
    this.moveDirZ = 0;

    // Position at the start of this frame's movement — main.js uses it to
    // revert/slide when a move has no walkable surface (multi-level zones).
    this.prevX = 0;
    this.prevZ = 0;

    // Gathering state
    this.isGathering = false;
    this._gatherProgress = 0;
    this._gatherTarget = null; // ResourceNode
    this._gatherDuration = 0;

    // Set per-frame by main.js while the Combat Sim rig trains and the player
    // stands at it — plays the locomotion clip slowly in place (see update()).
    this.trainingPose = false;

    // Task-driven animation state, set per-frame by main.js: 'gather' while a
    // resource-node gather runs, 'swing' while a tree/rock extended gather
    // runs. taskTool ('rock'|'tree') picks the held tool during 'swing'.
    this.taskAnim = null;
    this.taskTool = null;
    // EquipmentSystem ref (set once in main.js) — read each frame for gear visuals.
    this.equipment = null;

    this.group = new THREE.Group();
    this._buildMesh();
    scene.add(this.group);

    // Animation state — populated by _attachModel() once the GLB is in
    this._mixer = null;
    this._actions = null;
    this._loopName = 'idle';   // persistent loop: idle | run | gather | swing
    this._oneShot = null;      // transient action (attack/flinch) riding on top
    this._sparTimer = 0;       // periodic strike while drilling at the sim rig
    this._movedThisFrame = false;
    this._lastSpeed = 0;
    this._gearNodes = null;
    this._gearKey = '';
    this._armorAccents = [];
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
    const mk = (re, once) => {
      const clip = clips.find(c => re.test(c.name));
      if (!clip) return null;
      const a = this._mixer.clipAction(clip);
      if (once) {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true; // hold the final pose for the fade-back
      }
      return a;
    };
    this._actions = {
      idle: mk(/idle/i), run: mk(/run/i),
      gather: mk(/gather/i), swing: mk(/swing/i),
      attack: mk(/attack/i, true), flinch: mk(/flinch/i, true),
    };
    this._actions.idle?.play();
    // One-shots hand back to the active loop when they finish (they are
    // authored to end near the idle stance, so the crossfade is gentle).
    this._mixer.addEventListener('finished', (e) => {
      if (e.action !== this._oneShot) return;
      this._oneShot = null;
      const loop = this._actions[this._loopName] || this._actions.idle;
      if (loop) {
        loop.reset().play();
        e.action.crossFadeTo(loop, 0.15, false);
      }
    });
    this._collectGear(model);
  }

  // Crossfade the persistent loop (idle/run/gather/swing). While a one-shot
  // plays, only record the target — the 'finished' handler resumes it.
  _playLoop(name) {
    if (!this._actions) return;
    if (!this._actions[name]) name = 'idle';
    if (name === this._loopName) return;
    const from = this._actions[this._loopName];
    this._loopName = name;
    if (this._oneShot) return;
    const to = this._actions[name];
    if (!to) return;
    to.reset().play();
    if (from && from !== to) from.crossFadeTo(to, 0.18, false);
  }

  _playOnce(name) {
    const a = this._actions?.[name];
    if (!a) return;
    const cur = this._oneShot || this._actions[this._loopName];
    this._oneShot = a;
    a.reset().play();
    if (cur && cur !== a) cur.crossFadeTo(a, 0.08, false);
  }

  /** Combat: the player lands (or whiffs) a hit — swing the equipped weapon. */
  playStrike() { if (this.isInCombat) this._playOnce('attack'); }

  /** Combat: an enemy hit lands — recoil. */
  playFlinch() { this._playOnce('flinch'); }

  // Collect the Gear_* nodes: re-shade (materials named *Glow* become unlit,
  // the rest toon from their authored color), outline, and hide everything —
  // visibility is state-driven in _updateGear().
  _collectGear(model) {
    this._gearNodes = {};
    this._armorAccents = [];
    for (const name of GEAR_NODE_NAMES) {
      const node = model.getObjectByName(name);
      if (!node) continue;
      this._gearNodes[name] = node;
      node.visible = false;
      // Snapshot BEFORE mutating: addOutline() parents a clone under the mesh,
      // and a live traverse would visit the clone and outline it recursively.
      const meshes = [];
      node.traverse(m => { if (m.isMesh) meshes.push(m); });
      for (const m of meshes) {
        const src = m.material;
        const glow = /glow/i.test(src?.name || '');
        m.material = glow
          ? new THREE.MeshBasicMaterial({ color: src.color })
          : createToonMaterial(src.color.getHex());
        // Nothing player-owned may write depth before the x-ray ghost
        // (renderOrder 1) — see the outline/ghost notes in _attachModel.
        // No outline hulls on gear: the scale-trick displaces radially from
        // the mesh origin (grip/world point, not the center), which shifted
        // black shells over the pauldrons. Gear reads by color at game scale.
        m.renderOrder = 2;
        if (name === 'Gear_ArmorChest' && !glow && /accent/i.test(src?.name || '')) {
          this._armorAccents.push(m.material);
        }
      }
    }
  }

  // Derive which gear nodes show from equipment + combat + task state.
  // Cheap signature compare — real scene changes only happen on transitions.
  _updateGear() {
    if (!this._gearNodes || !this.equipment) return;
    const slots = this.equipment.slots;
    const vis = [];
    let tier = null;
    const weapon = slots.weapon && GEAR_BY_ITEM[slots.weapon.label];
    if (weapon) {
      if (weapon.always) vis.push(weapon.hand);
      else vis.push(this.isInCombat ? weapon.hand : weapon.back);
    }
    const off = slots.offhand && GEAR_BY_ITEM[slots.offhand.label];
    if (off) vis.push(this.isInCombat ? off.hand : off.back);
    if (slots.body) {
      vis.push('Gear_ArmorChest');
      tier = slots.body.tier;
    }
    if (this.taskAnim === 'swing' && !this.isInCombat) {
      vis.push(this.taskTool === 'tree' ? 'Gear_ToolCutter' : 'Gear_ToolDrill');
    }
    const names = vis.filter(Boolean);
    const key = names.slice().sort().join('|') + ':' + (tier || '');
    if (key === this._gearKey) return;
    this._gearKey = key;
    const on = new Set(names);
    for (const [name, node] of Object.entries(this._gearNodes)) {
      node.visible = on.has(name);
    }
    if (tier) {
      const c = TIER_ACCENT[tier] ?? TIER_ACCENT.Basic;
      for (const m of this._armorAccents) m.color.setHex(c);
    }
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
    // Sparring footwork: while trainingPose is set (main.js — standing at the
    // live Combat Sim rig) the locomotion clip runs slowly in place, so the
    // character visibly drills instead of standing frozen.
    const posing = this.trainingPose && !this._movedThisFrame
      && !this.isGathering && !this.isInCombat;
    const task = this.isInCombat ? null : this.taskAnim;
    this._playLoop(
      this._movedThisFrame ? 'run'
      : task === 'gather' ? 'gather'
      : task === 'swing' ? 'swing'
      : posing ? 'run'
      : 'idle'
    );
    if (this._actions?.run) {
      this._actions.run.timeScale = this._movedThisFrame
        ? this._lastSpeed / RUN_CLIP_SPEED
        : posing ? 0.55 : 1;
    }
    // Sparring drill: while posing at the sim rig, throw a practice strike
    // every couple of seconds on top of the slow footwork.
    if (posing) {
      this._sparTimer += delta;
      if (this._sparTimer >= 2.4 && !this._oneShot) {
        this._sparTimer = 0;
        this._playOnce('attack');
      }
    } else {
      this._sparTimer = 0;
    }
    // Smooth shortest-arc turn toward the pushed direction (was an instant snap).
    let dy = this._facing - this.group.rotation.y;
    dy = ((dy % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
    this.group.rotation.y += dy * Math.min(1, delta * 14);
    this._updateGear();
    this._mixer?.update(delta);
  }

  _updateMovement(keysDown, delta, touchInput) {
    // Cleared up front so the early returns below (combat, gathering) can't
    // leave a stale push direction behind for main.js to act on. prevX/prevZ
    // likewise capture the frame-start position on every path, so the height
    // resolver always has a known-good spot to fall back to.
    this.moveDirX = 0;
    this.moveDirZ = 0;
    this.prevX = this.position.x;
    this.prevZ = this.position.z;
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

    // The direction the player is actively pushing this frame, zeroed when
    // idle. main.js reads it during collision resolution to tell "walking into
    // a rock" (mine it) apart from "sliding along one" (don't) — mine corridors
    // are walled with mineable rock, so grazing must not trigger a dig.
    this.moveDirX = dx;
    this.moveDirZ = dz;

    if (dx !== 0 || dz !== 0) {
      this._movedThisFrame = true;
      this._lastSpeed = speed;
      this._facing = Math.atan2(dx, dz); // update() eases rotation toward this

      const dist = speed * delta;
      this.position.x += dx * dist;
      this.position.z += dz * dist;

      // Playable bounds are per-zone (switchZone sets `bounds`); the fallback
      // is the default zone footprint so a zone that never set them still works.
      const b = this.bounds || getPlayerBounds(null);
      this.position.x = Math.max(b.minX, Math.min(b.maxX, this.position.x));
      this.position.z = Math.max(b.minZ, Math.min(b.maxZ, this.position.z));

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

  teleportTo(x, z, y = 0) {
    this.position.set(x, y, z);
    this.group.position.copy(this.position);
  }
}

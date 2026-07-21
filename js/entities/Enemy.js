import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createToonMaterial, addOutline } from '../scene/ToonMaterials.js';
import { CONFIG } from '../config.js';

let enemyIdCounter = 0;

// Object3D.clone(true) doesn't rebind skeletons — SkinnedMesh clones keep
// pointing at the source skeleton's bones, so posing/matrixWorld updates on
// the clone leave the mesh unbound (vertices fly to bind-pose world origin).
// Standard three.js SkeletonUtils.clone algorithm, inlined to avoid vendoring
// another addon file just for this.
function cloneSkinned(source) {
  const sourceLookup = new Map();
  const cloneLookup = new Map();
  const clone = source.clone();
  (function parallelTraverse(a, b) {
    sourceLookup.set(b, a);
    cloneLookup.set(a, b);
    for (let i = 0; i < a.children.length; i++) parallelTraverse(a.children[i], b.children[i]);
  })(source, clone);
  clone.traverse(node => {
    if (!node.isSkinnedMesh) return;
    const sourceMesh = sourceLookup.get(node);
    node.skeleton = sourceMesh.skeleton.clone();
    node.bindMatrix.copy(sourceMesh.bindMatrix);
    node.skeleton.bones = sourceMesh.skeleton.bones.map(bone => cloneLookup.get(bone));
    node.bind(node.skeleton, node.bindMatrix);
  });
  return clone;
}

// GLB replacement for specific boss archetypes — preloaded once, cloned per spawn.
// Falls back to the procedural boxes/cones body below if not loaded yet.
const _bossModelPaths = {
  // All six zone bosses share the Pirate Lizard model.
  boss_landing: './models/Pirate_Lizard.glb',
  boss_mine:    './models/Pirate_Lizard.glb',
  boss_verdant: './models/Pirate_Lizard.glb',
  boss_lagoon:  './models/Pirate_Lizard.glb',
  boss_tundra:  './models/Pirate_Lizard.glb',
  boss_depths:  './models/Pirate_Lizard.glb',
  // Regular creature archetypes, one model each.
  dunkraza:    './models/Dunkraza.glb',
  serpendrill: './models/Serpendrill.glb',
  reptlar:     './models/Reptlar.glb',
  hardlizzy:   './models/Hard_Lizzy.glb',
  cavecrab:    './models/Cave_Crab.glb',
  spoonvark:   './models/Spoonvark.glb',
};
const _bossModels = {};
const _bossAnimations = {};
const _bossLoader = new GLTFLoader();
// Load each unique GLB once, then share the parsed scene across every archetype
// that references it (all bosses point at the same Pirate Lizard file).
for (const path of [...new Set(Object.values(_bossModelPaths))]) {
  _bossLoader.load(path, gltf => {
    for (const [archetype, p] of Object.entries(_bossModelPaths)) {
      if (p === path) {
        _bossModels[archetype] = gltf.scene;
        _bossAnimations[archetype] = gltf.animations;
      }
    }
  }, undefined, () => {});
}

// ── Enemy archetypes ───────────────────────────────────────────────────────────
//
// Attack patterns: 'melee' (repeating hit), 'windup' (charge then massive hit),
// 'burst' (idle then N rapid hits).
//
// Combat mechanic fields (all optional, default off):
//   statusEffect   — key into CONFIG.STATUS_EFFECTS, 30% chance per hit
//   armor          — flat reduction applied to incoming player damage
//   dodgeChance    — chance a player attack misses entirely
//   fpDrainOnHit   — FP stolen from the player on each enemy hit
//   regenOnAttack  — HP the enemy recovers each time it attacks
//   rageRamp       — enemy damage multiplier applied after each attack (compounds)
//   burstCount     — number of rapid hits for 'burst' pattern (default 3)
//   speed          — patrol move speed (world units/s)
//   boss           — unique zone boss: no timed respawn, phase-2 trigger
//   phase2         — { at, damageMult, intervalMult, dodge, regen } applied when
//                    HP falls below `at` fraction of max (bosses only)

const ARCHETYPE_CONFIG = {
  // ── Regular creatures (GLB-modelled) ────────────────────────────────────────
  // Elite guardian — posted at the Mine's Depths-shaft boundary, the toughest
  // regular (non-boss) enemy in the early game.
  dunkraza: {
    name: 'DUNKRAZA',
    hp: 150, damage: 12, attackInterval: 2200, ppReward: 65,
    bodyColor: 0x552244, headColor: 0x663355, visorColor: 0xff2266, threatColor: 0xff2266,
    scale: 0.4, speed: 0.95,
    statusEffect: 'poison',
    armor: 4,
    dodgeChance: 0.2,
    attackPattern: 'burst',
    burstCount: 2,
    visual: 'spikes',
  },

  // Drill-nosed cave serpent — fast venomous striker posted in the Mine.
  serpendrill: {
    name: 'SERPENDRILL',
    hp: 70, damage: 9, attackInterval: 1000, ppReward: 45,
    bodyColor: 0x6b5a2a, headColor: 0x8a7333, visorColor: 0xffcc44, threatColor: 0xffbb22,
    scale: 1.5, speed: 1.7,
    statusEffect: 'poison',
    dodgeChance: 0.18,
    attackPattern: 'burst',
    burstCount: 2,
    visual: 'crest',
  },

  // Crystal-backed jungle reptile — armored melee bruiser in the Verdant Maw.
  reptlar: {
    name: 'REPTLAR',
    hp: 110, damage: 15, attackInterval: 1700, ppReward: 60,
    bodyColor: 0x3a7a3a, headColor: 0x4a8a3a, visorColor: 0xff5544, threatColor: 0x66dd44,
    scale: 1.3, speed: 0.95,
    statusEffect: 'poison',
    armor: 4,
    attackPattern: 'melee',
    visual: 'crest',
  },

  // Armored ankylosaur bulwark — high-armor windup tank in the Frozen Tundra.
  hardlizzy: {
    name: 'HARD LIZZY',
    hp: 200, damage: 26, attackInterval: 3000, ppReward: 120,
    bodyColor: 0x8a8375, headColor: 0x9a9385, visorColor: 0xffcc66, threatColor: 0xccaa66,
    scale: 0.95, speed: 0.5,
    armor: 9,
    attackPattern: 'windup',
    visual: 'plates',
  },

  // Rocky claw brute — corrosive, rage-ramping bruiser deep in the Depths.
  cavecrab: {
    name: 'CAVE CRAB',
    hp: 280, damage: 17, attackInterval: 2400, ppReward: 240,
    bodyColor: 0x55504a, headColor: 0x655e55, visorColor: 0xffaa44, threatColor: 0xdd8844,
    scale: 1.8, speed: 0.4,
    statusEffect: 'corrosion',
    armor: 10,
    rageRamp: 1.05,
    attackPattern: 'windup',
    visual: 'plates',
  },

  // Big-eared shore digger — scoops FP with its spoon snout on the Lagoon Coast.
  spoonvark: {
    name: 'SPOONVARK',
    hp: 160, damage: 18, attackInterval: 2000, ppReward: 90,
    bodyColor: 0x6b4a33, headColor: 0x7a563c, visorColor: 0x221a14, threatColor: 0xcc8844,
    scale: 0.5, speed: 1.1,
    armor: 2,
    fpDrainOnHit: 15,
    attackPattern: 'melee',
    visual: 'crest',
  },

  // ── Zone bosses — unique, no timed respawn, permanent bonus on defeat ─────
  boss_landing: {
    name: 'SCRAP TYRANT',
    hp: 250, damage: 8, attackInterval: 1400, ppReward: 150,
    bodyColor: 0xc45a1a, headColor: 0xff7733, visorColor: 0xff2222, threatColor: 0xff2222,
    scale: 1.8, speed: 0.5,
    statusEffect: null,
    attackPattern: 'melee',
    visual: 'crown',
    boss: true,
    phase2: { at: 0.5, intervalMult: 0.55 },
  },
  boss_mine: {
    name: 'FORGE WARDEN',
    hp: 400, damage: 20, attackInterval: 2800, ppReward: 300,
    bodyColor: 0x884422, headColor: 0xaa5533, visorColor: 0xffaa00, threatColor: 0xffaa00,
    scale: 2.0, speed: 0.4,
    statusEffect: 'burn',
    armor: 4,
    attackPattern: 'windup',
    visual: 'crown',
    boss: true,
    phase2: { at: 0.5, intervalMult: 0.7, damageMult: 1.3 },
  },
  boss_verdant: {
    name: 'MAW SOVEREIGN',
    hp: 550, damage: 12, attackInterval: 1600, ppReward: 500,
    bodyColor: 0x117744, headColor: 0x229955, visorColor: 0xaaff44, threatColor: 0x66ff44,
    scale: 2.0, speed: 0.5,
    statusEffect: 'poison',
    regenOnAttack: 6,
    attackPattern: 'melee',
    visual: 'crown',
    boss: true,
    phase2: { at: 0.5, regen: 12, damageMult: 1.25 },
  },
  boss_lagoon: {
    name: 'TIDE ORACLE',
    hp: 700, damage: 8, attackInterval: 3200, ppReward: 800,
    bodyColor: 0x1155aa, headColor: 0x2277cc, visorColor: 0x66eeff, threatColor: 0x44ccff,
    scale: 1.9, speed: 0.5,
    statusEffect: 'shock',
    fpDrainOnHit: 60,
    attackPattern: 'burst',
    burstCount: 4,
    visual: 'crown',
    boss: true,
    phase2: { at: 0.5, intervalMult: 0.75, damageMult: 1.25 },
  },
  boss_tundra: {
    name: 'CRYO MONARCH',
    hp: 900, damage: 30, attackInterval: 3400, ppReward: 1200,
    bodyColor: 0x88bbee, headColor: 0x99ccff, visorColor: 0xffffff, threatColor: 0xbbeeff,
    scale: 2.1, speed: 0.4,
    statusEffect: null,
    armor: 8,
    dodgeChance: 0.15,
    attackPattern: 'windup',
    visual: 'crown',
    boss: true,
    phase2: { at: 0.5, damageMult: 1.5 },
  },
  boss_depths: {
    name: 'THE UNMAKER',
    hp: 1200, damage: 10, attackInterval: 1200, ppReward: 2000,
    bodyColor: 0x330044, headColor: 0x550066, visorColor: 0xff00ff, threatColor: 0xee44ff,
    scale: 2.2, speed: 0.6,
    statusEffect: 'corrosion',
    rageRamp: 1.08,
    attackPattern: 'melee',
    visual: 'crown',
    boss: true,
    phase2: { at: 0.5, dodge: 0.2, intervalMult: 0.8 },
  },
};

// WoW-style threat tint relative to current player power: compare how fast the
// player kills the enemy (~1 attack/s, after armor and dodge) vs how fast the
// enemy kills the player. Recomputed periodically from main.js as stats grow.
export function threatColorFor(enemy, stats) {
  const hitDmg = Math.max(1, (stats.damage || 1) - (enemy.armor || 0));
  const effHit = hitDmg * (1 - (enemy.dodgeChance || 0));
  const killTime = enemy.maxHP / effHit;
  const enemyDPS = enemy.damage / ((enemy.attackInterval || 2000) / 1000);
  const surviveTime = (stats.maxHP || 1) / Math.max(0.1, enemyDPS);
  const ratio = surviveTime / killTime; // >1 means you win the race
  if (ratio >= 6) return 0x9e9e9e;    // trivial
  if (ratio >= 3) return 0x44dd44;    // easy
  if (ratio >= 1.5) return 0xffee44;  // even
  if (ratio >= 0.75) return 0xff9922; // dangerous
  return 0xff2222;                    // deadly
}

export class Enemy {
  constructor(scene, x = 6, z = 4, archetype = 'serpendrill') {
    this.id = ++enemyIdCounter;
    this.scene = scene;
    this.position = new THREE.Vector3(x, 0, z);
    this.spawnPos = new THREE.Vector3(x, 0, z);
    this.archetype = archetype;

    const cfg = ARCHETYPE_CONFIG[archetype] || ARCHETYPE_CONFIG.serpendrill;
    this.maxHP = cfg.hp;
    this.hp = this.maxHP;
    this.aggroRadius = cfg.boss ? 1.6 : CONFIG.SCRAPPER_AGGRO_RADIUS;
    this.damage = cfg.damage;
    this.attackInterval = cfg.attackInterval;
    this.ppReward = cfg.ppReward;
    this.name = cfg.name;
    this.statusEffect = cfg.statusEffect;
    this.attackPattern = cfg.attackPattern;
    // Combat mechanic fields (see ARCHETYPE_CONFIG docs)
    this.armor = cfg.armor || 0;
    this.dodgeChance = cfg.dodgeChance || 0;
    this.fpDrainOnHit = cfg.fpDrainOnHit || 0;
    this.regenOnAttack = cfg.regenOnAttack || 0;
    this.rageRamp = cfg.rageRamp || 0;
    this.burstCount = cfg.burstCount || 3;
    this.boss = !!cfg.boss;
    this.phase2 = cfg.phase2 || null;
    this._enraged = false;
    this._cfg = cfg;

    // Patrol state
    this._state = 'patrol'; // 'patrol' | 'aggro' | 'dead'
    this._patrolTarget = this.position.clone();
    this._waitTimer = 0;
    this._isWaiting = false;

    // Burst attacker state
    this._burstPhase = 'idle'; // 'idle' | 'burst'
    this._burstCount = 0;

    this.group = new THREE.Group();
    this._buildMesh(cfg);
    scene.add(this.group);

    if (this.boss) {
      // Bosses guard their post — no patrol wander, so one can never drift into
      // a player mid-drill. The floor ring marks the exact engage radius.
      this._isWaiting = true;
      this._waitTimer = Infinity;
      this._addAggroRing();
    }
    this.group.position.copy(this.position);
    this.group.scale.setScalar(cfg.scale);
  }

  _buildMesh(cfg) {
    const bossModel = _bossModels[this.archetype];
    if (bossModel) {
      this._buildBossModelMesh(bossModel, cfg);
      return;
    }

    // Body
    const bodyGeo = new THREE.BoxGeometry(0.55, 0.7, 0.45);
    const body = new THREE.Mesh(bodyGeo, createToonMaterial(cfg.bodyColor));
    body.position.y = 0.85;
    body.castShadow = true;
    addOutline(body, 0.07);
    this.group.add(body);

    // Head
    const headGeo = new THREE.BoxGeometry(0.45, 0.4, 0.4);
    const head = new THREE.Mesh(headGeo, createToonMaterial(cfg.headColor));
    head.position.y = 1.42;
    head.castShadow = true;
    addOutline(head, 0.07);
    this.group.add(head);

    // Visor
    const visorGeo = new THREE.BoxGeometry(0.35, 0.1, 0.08);
    const visor = new THREE.Mesh(visorGeo, createToonMaterial(cfg.visorColor));
    visor.position.set(0, 1.47, 0.22);
    this.group.add(visor);

    // Visual extras keyed by cfg.visual (see ARCHETYPE_CONFIG)
    const visual = cfg.visual || 'spikes';
    if (visual === 'pauldrons') {
      // Large shoulder pauldrons
      for (const side of [-1, 1]) {
        const pGeo = new THREE.BoxGeometry(0.3, 0.35, 0.35);
        const pMesh = new THREE.Mesh(pGeo, createToonMaterial(0x6633aa));
        pMesh.position.set(side * 0.5, 1.1, 0);
        addOutline(pMesh, 0.05);
        this.group.add(pMesh);
      }
    } else if (visual === 'dualVisor') {
      // Dual visors (multi-eye look)
      for (const side of [-1, 1]) {
        const vGeo = new THREE.BoxGeometry(0.12, 0.08, 0.08);
        const vm = new THREE.Mesh(vGeo, createToonMaterial(cfg.visorColor));
        vm.position.set(side * 0.12, 1.47, 0.22);
        this.group.add(vm);
      }
    } else if (visual === 'antenna') {
      // Sensor antenna mast with emitter tip
      const mastGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.45, 5);
      const mast = new THREE.Mesh(mastGeo, createToonMaterial(0x333333));
      mast.position.set(0.14, 1.8, 0);
      this.group.add(mast);
      const tipGeo = new THREE.SphereGeometry(0.07, 6, 6);
      const tip = new THREE.Mesh(tipGeo, createToonMaterial(cfg.visorColor));
      tip.position.set(0.14, 2.05, 0);
      this.group.add(tip);
    } else if (visual === 'crest') {
      // Dorsal crest fin
      const crestGeo = new THREE.ConeGeometry(0.12, 0.45, 4);
      const crest = new THREE.Mesh(crestGeo, createToonMaterial(cfg.visorColor));
      crest.position.set(0, 1.75, -0.08);
      addOutline(crest, 0.04);
      this.group.add(crest);
    } else if (visual === 'plates') {
      // Layered armor slabs front and back
      for (const zSide of [-1, 1]) {
        const plGeo = new THREE.BoxGeometry(0.65, 0.5, 0.08);
        const pl = new THREE.Mesh(plGeo, createToonMaterial(0x333b44));
        pl.position.set(0, 0.9, zSide * 0.28);
        addOutline(pl, 0.04);
        this.group.add(pl);
      }
    } else if (visual === 'crown') {
      // Boss crown — ring of spikes above the head
      const crownMat = createToonMaterial(cfg.visorColor);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const sGeo = new THREE.ConeGeometry(0.06, 0.28, 4);
        const spike = new THREE.Mesh(sGeo, crownMat);
        spike.position.set(Math.cos(a) * 0.22, 1.75, Math.sin(a) * 0.22);
        this.group.add(spike);
      }
    } else {
      // 'spikes' — shoulder spikes
      const spikeMat = createToonMaterial(0x444444);
      for (const side of [-1, 1]) {
        const sGeo = new THREE.ConeGeometry(0.08, 0.3, 5);
        const spike = new THREE.Mesh(sGeo, spikeMat);
        spike.position.set(side * 0.38, 1.05, 0);
        spike.rotation.z = -side * Math.PI / 4;
        this.group.add(spike);
      }
    }

    // Wind-up charge indicator — any windup-pattern enemy (hidden until charging)
    if (cfg.attackPattern === 'windup') {
      const chargeGeo = new THREE.TorusGeometry(0.35, 0.06, 6, 14);
      const chargeMat = createToonMaterial(0xffaa00);
      chargeMat.transparent = true;
      chargeMat.opacity = 0;
      this._chargeRing = new THREE.Mesh(chargeGeo, chargeMat);
      this._chargeRing.position.y = 0.9;
      this._chargeRing.rotation.x = Math.PI / 2;
      this.group.add(this._chargeRing);
    }

    // Legs
    const legGeo = new THREE.BoxGeometry(0.18, 0.45, 0.18);
    const legMat = createToonMaterial(0x8b3300);
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(side * 0.17, 0.22, 0);
      leg.castShadow = true;
      this.group.add(leg);
    }

    // Threat indicator floating above head
    const threatGeo = new THREE.OctahedronGeometry(0.13, 0);
    this._threatIndicator = new THREE.Mesh(threatGeo, createToonMaterial(cfg.threatColor));
    this._threatIndicator.position.y = 2.2;
    this.group.add(this._threatIndicator);
    this._threatBaseY = 2.2;

    // Ground shadow ring
    const ringGeo = new THREE.CircleGeometry(0.55, 12);
    const ring = new THREE.Mesh(ringGeo,
      new THREE.MeshBasicMaterial({ color: cfg.threatColor, transparent: true, opacity: 0.3 })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    this.group.add(ring);
  }

  // GLB-model body for bosses with a matching entry in _bossModelPaths — replaces
  // the procedural body/head/visor/legs but keeps the same gameplay-facing indicators.
  _buildBossModelMesh(src, cfg) {
    let hasSkinned = false;
    src.traverse(n => { if (n.isSkinnedMesh) hasSkinned = true; });
    const model = hasSkinned ? cloneSkinned(src) : src.clone(true);
    model.scale.setScalar(1.4);
    model.traverse(n => { if (n.isMesh) n.castShadow = true; });
    this.group.add(model);

    const clips = _bossAnimations[this.archetype];
    if (clips && clips.length) {
      this._mixer = new THREE.AnimationMixer(model);
      this._idleAction = clips.find(c => /idle/i.test(c.name)) && this._mixer.clipAction(clips.find(c => /idle/i.test(c.name)));
      this._walkAction = clips.find(c => /walk/i.test(c.name)) && this._mixer.clipAction(clips.find(c => /walk/i.test(c.name)));
      this._currentAction = this._idleAction || this._walkAction;
      this._currentAction?.play();
    }

    if (cfg.attackPattern === 'windup') {
      const chargeGeo = new THREE.TorusGeometry(0.35, 0.06, 6, 14);
      const chargeMat = createToonMaterial(0xffaa00);
      chargeMat.transparent = true;
      chargeMat.opacity = 0;
      this._chargeRing = new THREE.Mesh(chargeGeo, chargeMat);
      this._chargeRing.position.y = 0.9;
      this._chargeRing.rotation.x = Math.PI / 2;
      this.group.add(this._chargeRing);
    }

    // Threat indicator floating above head
    const threatGeo = new THREE.OctahedronGeometry(0.13, 0);
    this._threatIndicator = new THREE.Mesh(threatGeo, createToonMaterial(cfg.threatColor));
    this._threatIndicator.position.y = 2.2;
    this.group.add(this._threatIndicator);
    this._threatBaseY = 2.2;

    // Ground shadow ring
    const ringGeo = new THREE.CircleGeometry(0.55, 12);
    const ring = new THREE.Mesh(ringGeo,
      new THREE.MeshBasicMaterial({ color: cfg.threatColor, transparent: true, opacity: 0.3 })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    this.group.add(ring);
  }

  // Tint the overhead threat indicator (bosses keep their authored color).
  setThreatColor(hex) {
    if (this._threatIndicator) this._threatIndicator.material.color.setHex(hex);
  }

  update(delta, playerPos, skipAggro = false, collisionCircles = null, collisionBoxes = null) {
    if (this._state === 'dead' || this._state === 'aggro') return false;

    // Animate threat indicator
    if (this._threatIndicator) {
      this._threatIndicator.position.y = this._threatBaseY + Math.sin(Date.now() * 0.004) * 0.12;
      this._threatIndicator.rotation.y += delta * 2.0;
    }
    if (this._aggroRing) {
      this._aggroRing.material.opacity = 0.3 + Math.sin(Date.now() * 0.003) * 0.15;
    }

    // GLB boss-model Idle/Walk crossfade, keyed off patrol movement state
    if (this._mixer) {
      this._mixer.update(delta);
      if (this._walkAction && this._idleAction) {
        const desired = this._isWaiting ? this._idleAction : this._walkAction;
        if (this._currentAction !== desired) {
          desired.reset().fadeIn(0.3).play();
          this._currentAction?.fadeOut(0.3);
          this._currentAction = desired;
        }
      }
    }

    // Check aggro
    if (!skipAggro) {
      const dist = this.position.distanceTo(playerPos);
      if (dist < this.aggroRadius) {
        this._state = 'aggro';
        return true;
      }
    }

    // Patrol behaviour
    if (this._isWaiting) {
      this._waitTimer -= delta * 1000;
      if (this._waitTimer <= 0) {
        this._isWaiting = false;
        this._pickPatrolTarget(collisionCircles);
      }
      return false;
    }

    const speed = this._cfg.speed ?? 1.2;
    const toTarget = new THREE.Vector3().subVectors(this._patrolTarget, this.position);
    const distToTarget = toTarget.length();
    if (distToTarget < 0.15) {
      this._isWaiting = true;
      const [min, max] = CONFIG.SCRAPPER_PATROL_WAIT;
      this._waitTimer = min + Math.random() * (max - min);
    } else {
      toTarget.normalize().multiplyScalar(speed * delta);
      this.position.add(toTarget);

      // Wall collision — push enemy out of obstacles
      const ENEMY_R = 0.4;
      if (collisionCircles) {
        for (const c of collisionCircles) {
          const dx = this.position.x - c.x;
          const dz = this.position.z - c.z;
          const dist = Math.hypot(dx, dz);
          if (dist < c.r + ENEMY_R && dist > 0.001) {
            const nx = dx / dist, nz = dz / dist;
            this.position.x = c.x + nx * (c.r + ENEMY_R);
            this.position.z = c.z + nz * (c.r + ENEMY_R);
          }
        }
      }
      // AABB collision (mine/depths grid blocks)
      if (collisionBoxes) {
        for (const box of collisionBoxes) {
          const px = this.position.x, pz = this.position.z;
          const clampX = Math.max(box.minX, Math.min(px, box.maxX));
          const clampZ = Math.max(box.minZ, Math.min(pz, box.maxZ));
          const dx = px - clampX, dz = pz - clampZ;
          const dist = Math.hypot(dx, dz);
          if (dist < ENEMY_R) {
            if (dist < 0.001) {
              const exits = [
                { gap: px - box.minX, nx: -1, nz: 0 },
                { gap: box.maxX - px, nx:  1, nz: 0 },
                { gap: pz - box.minZ, nx: 0, nz: -1 },
                { gap: box.maxZ - pz, nx: 0, nz:  1 },
              ];
              const e = exits.reduce((a, b) => a.gap < b.gap ? a : b);
              this.position.x += e.nx * (e.gap + ENEMY_R);
              this.position.z += e.nz * (e.gap + ENEMY_R);
            } else {
              const nx = dx / dist, nz = dz / dist;
              this.position.x = clampX + nx * ENEMY_R;
              this.position.z = clampZ + nz * ENEMY_R;
            }
          }
        }
      }

      this.group.position.copy(this.position);
      this.group.rotation.y = Math.atan2(toTarget.x, toTarget.z);
    }

    return false;
  }

  // Called by CombatSystem before each attack — returns the effective damage(s)
  // Returns array of {damage, delay} objects for burst, or single [{damage, delay:0}]
  getAttackSequence() {
    if (this.attackPattern === 'burst') {
      // N rapid hits at 150ms apart
      const hits = [];
      for (let i = 0; i < this.burstCount; i++) {
        hits.push({ damage: this.damage, delay: i * 150 });
      }
      return hits;
    }
    return [{ damage: this.damage, delay: 0 }];
  }

  // Danger ring on the floor at the aggro radius — step inside to engage
  _addAggroRing() {
    const geo = new THREE.RingGeometry(this.aggroRadius - 0.08, this.aggroRadius, 48);
    this._aggroRing = new THREE.Mesh(geo,
      new THREE.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
    );
    this._aggroRing.rotation.x = -Math.PI / 2;
    this._aggroRing.position.y = 0.03;
    this.group.add(this._aggroRing);
  }

  // Show/hide wind-up charge ring (for swinger archetype)
  setCharging(isCharging) {
    if (this._chargeRing) {
      this._chargeRing.material.opacity = isCharging ? 0.85 : 0;
    }
  }

  _pickPatrolTarget(collisionCircles) {
    const r = CONFIG.SCRAPPER_PATROL_RADIUS;
    // Try up to 8 random positions, pick the first that doesn't overlap a wall
    for (let attempt = 0; attempt < 8; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * r;
      const tx = this.spawnPos.x + Math.cos(angle) * dist;
      const tz = this.spawnPos.z + Math.sin(angle) * dist;

      if (collisionCircles) {
        const blocked = collisionCircles.some(c =>
          Math.hypot(tx - c.x, tz - c.z) < c.r + 0.5
        );
        if (blocked) continue;
      }

      this._patrolTarget.set(tx, 0, tz);
      return;
    }
    // Fallback: stay near spawn
    this._patrolTarget.copy(this.spawnPos);
  }

  die() {
    this._state = 'dead';
    if (this._chargeRing) this._chargeRing.material.opacity = 0;
    this.scene.remove(this.group);
  }

  resetCombatState() {
    this._state = 'patrol';
    if (this._chargeRing) this._chargeRing.material.opacity = 0;
  }
}

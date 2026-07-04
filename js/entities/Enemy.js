import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createToonMaterial, addOutline } from '../scene/ToonMaterials.js';
import { CONFIG } from '../config.js';

let enemyIdCounter = 0;

// GLB replacement for specific boss archetypes — preloaded once, cloned per spawn.
// Falls back to the procedural boxes/cones body below if not loaded yet.
const _bossModelPaths = { boss_lagoon: './models/Pirate_Lizard.glb' };
const _bossModels = {};
const _bossLoader = new GLTFLoader();
for (const [archetype, path] of Object.entries(_bossModelPaths)) {
  _bossLoader.load(path, gltf => { _bossModels[archetype] = gltf.scene; }, undefined, () => {});
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
  rusher: {
    name: 'SCRAPPER',
    hp: 30,
    damage: 3,
    attackInterval: 800,  // ms — attacks every 0.8s
    ppReward: 15,
    bodyColor: 0xc45a1a,
    headColor: 0xd9703a,
    visorColor: 0xff4444,
    threatColor: 0xff2222,
    scale: 1.0,
    speed: 1.2,
    statusEffect: null,
    attackPattern: 'melee',
    visual: 'spikes',
  },
  swinger: {
    name: 'BRUTE',
    hp: 60,
    damage: 18,
    attackInterval: 2400, // 3 ticks of ~800ms each (wind-up)
    ppReward: 25,
    bodyColor: 0x8855cc,
    headColor: 0x9966dd,
    visorColor: 0xffaa00,
    threatColor: 0xaa44ff,
    scale: 1.25,
    speed: 0.8,
    statusEffect: null,
    attackPattern: 'windup', // shows charge animation before hitting
    visual: 'pauldrons',
  },
  burst: {
    name: 'GLITCH',
    hp: 45,
    damage: 5,  // per burst hit (fires 3 times)
    attackInterval: 3200, // 4 idle ticks then rapid burst
    ppReward: 20,
    bodyColor: 0x22ccaa,
    headColor: 0x33ddbb,
    visorColor: 0x00ff88,
    threatColor: 0x00ff88,
    scale: 0.85,
    speed: 1.4,
    statusEffect: null,
    attackPattern: 'burst', // stores burst count on the enemy
    visual: 'dualVisor',
  },

  // ── Expanded roster ────────────────────────────────────────────────────────
  stinger: {
    name: 'VESPID',
    hp: 40, damage: 4, attackInterval: 700, ppReward: 22,
    bodyColor: 0xaacc22, headColor: 0xbbdd33, visorColor: 0xd0ff00, threatColor: 0xccff22,
    scale: 0.8, speed: 1.8,
    statusEffect: 'poison',
    attackPattern: 'melee',
    visual: 'spikes',
  },
  pyro: {
    name: 'CINDERLING',
    hp: 50, damage: 6, attackInterval: 1600, ppReward: 25,
    bodyColor: 0xcc3311, headColor: 0xee5522, visorColor: 0xffcc00, threatColor: 0xff6600,
    scale: 0.95, speed: 1.1,
    statusEffect: 'burn',
    attackPattern: 'melee',
    visual: 'crest',
  },
  arc: {
    name: 'VOLTGEIST',
    hp: 55, damage: 4, attackInterval: 3000, ppReward: 30,
    bodyColor: 0x2266dd, headColor: 0x3388ee, visorColor: 0x88ddff, threatColor: 0x44aaff,
    scale: 0.9, speed: 1.5,
    statusEffect: 'shock',
    attackPattern: 'burst',
    visual: 'antenna',
  },
  corroder: {
    name: 'RUSTMAW',
    hp: 70, damage: 14, attackInterval: 2600, ppReward: 32,
    bodyColor: 0x886633, headColor: 0x997744, visorColor: 0xcc8833, threatColor: 0xbb7722,
    scale: 1.15, speed: 0.9,
    statusEffect: 'corrosion',
    attackPattern: 'windup',
    visual: 'plates',
  },
  bulwark: {
    name: 'BULWARK',
    hp: 120, damage: 10, attackInterval: 2200, ppReward: 40,
    bodyColor: 0x556677, headColor: 0x667788, visorColor: 0xaabbcc, threatColor: 0x8899bb,
    scale: 1.35, speed: 0.6,
    statusEffect: null,
    armor: 6,
    attackPattern: 'melee',
    visual: 'plates',
  },
  siphon: {
    name: 'SIPHON',
    hp: 45, damage: 3, attackInterval: 1200, ppReward: 28,
    bodyColor: 0x7722aa, headColor: 0x8833bb, visorColor: 0xdd66ff, threatColor: 0xcc44ff,
    scale: 0.9, speed: 1.3,
    statusEffect: null,
    fpDrainOnHit: 40,
    attackPattern: 'melee',
    visual: 'antenna',
  },
  regenerator: {
    name: 'MITOGEL',
    hp: 65, damage: 5, attackInterval: 1500, ppReward: 34,
    bodyColor: 0x22aa55, headColor: 0x33bb66, visorColor: 0x88ffaa, threatColor: 0x44ff88,
    scale: 1.05, speed: 1.0,
    statusEffect: null,
    regenOnAttack: 4,
    attackPattern: 'melee',
    visual: 'crest',
  },
  longshot: {
    name: 'LONGSHOT',
    hp: 35, damage: 26, attackInterval: 3600, ppReward: 36,
    bodyColor: 0xbbaa88, headColor: 0xccbb99, visorColor: 0xff8888, threatColor: 0xff9944,
    scale: 0.9, speed: 0.8,
    statusEffect: null,
    attackPattern: 'windup',
    visual: 'antenna',
  },
  rampant: {
    name: 'RAMPANT',
    hp: 80, damage: 4, attackInterval: 1000, ppReward: 38,
    bodyColor: 0xaa2244, headColor: 0xbb3355, visorColor: 0xff4466, threatColor: 0xff2255,
    scale: 1.1, speed: 1.4,
    statusEffect: null,
    rageRamp: 1.15,
    attackPattern: 'melee',
    visual: 'spikes',
  },
  specter: {
    name: 'SPECTER',
    hp: 40, damage: 7, attackInterval: 1400, ppReward: 36,
    bodyColor: 0x445566, headColor: 0x556677, visorColor: 0xccddff, threatColor: 0x99aadd,
    scale: 0.95, speed: 1.6,
    statusEffect: null,
    dodgeChance: 0.25,
    attackPattern: 'melee',
    visual: 'dualVisor',
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

export class Enemy {
  constructor(scene, x = 6, z = 4, archetype = 'rusher') {
    this.id = ++enemyIdCounter;
    this.scene = scene;
    this.position = new THREE.Vector3(x, 0, z);
    this.spawnPos = new THREE.Vector3(x, 0, z);
    this.archetype = archetype;

    const cfg = ARCHETYPE_CONFIG[archetype] || ARCHETYPE_CONFIG.rusher;
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
    const model = src.clone(true);
    model.scale.setScalar(1.4);
    model.traverse(n => { if (n.isMesh) n.castShadow = true; });
    this.group.add(model);

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

  update(delta, playerPos, skipAggro = false, collisionCircles = null, collisionBoxes = null) {
    if (this._state === 'dead' || this._state === 'aggro') return false;

    // Animate threat indicator
    if (this._threatIndicator) {
      this._threatIndicator.position.y = this._threatBaseY + Math.sin(Date.now() * 0.004) * 0.12;
      this._threatIndicator.rotation.y += delta * 2.0;
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

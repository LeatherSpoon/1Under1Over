import * as THREE from 'three';
import { createToonMaterial, addOutline } from '../scene/ToonMaterials.js';
import { CONFIG } from '../config.js';

let enemyIdCounter = 0;

// ── Enemy archetypes ───────────────────────────────────────────────────────────
//
// 'rusher'  — Melee Rusher: low HP, fast attacks, dangerous in numbers
// 'swinger' — Heavy Swinger: 3-tick wind-up then massive hit
// 'burst'   — Burst Attacker: 4 idle ticks then 3 rapid hits

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
    statusEffect: null,
    attackPattern: 'melee',
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
    statusEffect: null,
    attackPattern: 'windup', // shows charge animation before hitting
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
    statusEffect: null,
    attackPattern: 'burst', // stores burst count on the enemy
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
    this.aggroRadius = CONFIG.SCRAPPER_AGGRO_RADIUS;
    this.damage = cfg.damage;
    this.attackInterval = cfg.attackInterval;
    this.ppReward = cfg.ppReward;
    this.name = cfg.name;
    this.statusEffect = cfg.statusEffect;
    this.attackPattern = cfg.attackPattern;
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

    // Archetype-specific visual extras
    if (this.archetype === 'swinger') {
      // Large shoulder pauldrons
      for (const side of [-1, 1]) {
        const pGeo = new THREE.BoxGeometry(0.3, 0.35, 0.35);
        const pMesh = new THREE.Mesh(pGeo, createToonMaterial(0x6633aa));
        pMesh.position.set(side * 0.5, 1.1, 0);
        addOutline(pMesh, 0.05);
        this.group.add(pMesh);
      }
      // Wind-up charge indicator (hidden until charging)
      const chargeGeo = new THREE.TorusGeometry(0.35, 0.06, 6, 14);
      const chargeMat = createToonMaterial(0xffaa00);
      chargeMat.transparent = true;
      chargeMat.opacity = 0;
      this._chargeRing = new THREE.Mesh(chargeGeo, chargeMat);
      this._chargeRing.position.y = 0.9;
      this._chargeRing.rotation.x = Math.PI / 2;
      this.group.add(this._chargeRing);
    } else if (this.archetype === 'burst') {
      // Dual visors (multi-eye look)
      for (const side of [-1, 1]) {
        const vGeo = new THREE.BoxGeometry(0.12, 0.08, 0.08);
        const vm = new THREE.Mesh(vGeo, createToonMaterial(0x00ff88));
        vm.position.set(side * 0.12, 1.47, 0.22);
        this.group.add(vm);
      }
    } else {
      // Rusher — shoulder spikes
      const spikeMat = createToonMaterial(0x444444);
      for (const side of [-1, 1]) {
        const sGeo = new THREE.ConeGeometry(0.08, 0.3, 5);
        const spike = new THREE.Mesh(sGeo, spikeMat);
        spike.position.set(side * 0.38, 1.05, 0);
        spike.rotation.z = -side * Math.PI / 4;
        this.group.add(spike);
      }
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

    const speed = this.archetype === 'swinger' ? 0.8 : (this.archetype === 'burst' ? 1.4 : 1.2);
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
    if (this.archetype === 'burst') {
      // 3 rapid hits at 150ms apart
      return [
        { damage: this.damage, delay: 0 },
        { damage: this.damage, delay: 150 },
        { damage: this.damage, delay: 300 },
      ];
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

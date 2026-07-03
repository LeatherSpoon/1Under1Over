import { ARCHETYPES, DROP_TABLES } from '../entities/archetypes.js';

// ── Adventure System (Idle Combat Simulator) ────────────────────────────────
// NGU-style idle adventure: pick a difficulty tier and the combat sim runs on
// its own — enemies "spawn", get worn down at a rate derived from the player's
// real combat stats, and drop PP + materials while you do anything else.
// Higher tiers are gated behind boss defeats (see BossSystem).
//
// DOM-free: all UI lives in HUD._refreshAdventure().

export const ADVENTURE_TIERS = [
  { id: 1, label: 'Perimeter Patrol',  zone: 'Landing Site',  pool: ['rusher'],                        hpMult: 1.0, ppMult: 1.0, respawn: 1.5 },
  { id: 2, label: 'Collapsed Adit',    zone: 'The Mine',      pool: ['rusher', 'cinder'],              hpMult: 1.6, ppMult: 1.5, respawn: 1.5 },
  { id: 3, label: 'Choked Canopy',     zone: 'Verdant Maw',   pool: ['stinger', 'rusher', 'swinger'],  hpMult: 2.4, ppMult: 2.2, respawn: 2.0 },
  { id: 4, label: 'Drowned Shelf',     zone: 'Lagoon Coast',  pool: ['voltaic', 'rustmaw', 'burst'],   hpMult: 3.6, ppMult: 3.2, respawn: 2.0 },
  { id: 5, label: 'Whiteout Fields',   zone: 'Frozen Tundra', pool: ['wraith', 'swinger', 'colossus'], hpMult: 5.5, ppMult: 4.8, respawn: 2.5 },
  { id: 6, label: 'The Breach Rim',    zone: 'The Depths',    pool: ['warden', 'wraith', 'voltaic'],   hpMult: 8.5, ppMult: 7.5, respawn: 2.5 },
];

export class AdventureSystem {
  constructor(statsSystem, ppSystem, inventorySystem) {
    this.stats = statsSystem;
    this.pp = ppSystem;
    this.inventory = inventorySystem;

    this.activeTier = 0;       // 0 = sim offline; otherwise tier id
    this.maxUnlockedTier = 1;  // raised by BossSystem victories

    // Current simulated encounter
    this._enemyKey = null;
    this._enemyMaxHP = 0;
    this._enemyHP = 0;
    this._respawnTimer = 0;

    // External multipliers (wired from main.js)
    this.damageMult = 1;       // ascension combat multiplier etc.

    // Lifetime + session tallies for the panel
    this.totalKills = 0;
    this.killsByTier = {};
    this.lootTally = {};       // mat -> count (session display, not persisted)
    this.ppEarned = 0;

    this.onKill = null;        // fn(enemyKey, tier) — wired in main.js
  }

  get tiers() { return ADVENTURE_TIERS; }

  tierById(id) { return ADVENTURE_TIERS.find(t => t.id === id) || null; }

  isTierUnlocked(id) { return id <= this.maxUnlockedTier; }

  setTier(id) {
    if (id !== 0 && (!this.tierById(id) || !this.isTierUnlocked(id))) return false;
    if (id === this.activeTier) return true;
    this.activeTier = id;
    this._enemyKey = null;
    this._enemyHP = 0;
    this._respawnTimer = 0;
    return true;
  }

  /** Effective idle damage-per-second: mirrors AutoCombatSystem's basic attack cadence. */
  get dps() {
    return Math.max(1, (this.stats.damage * this.damageMult) / 0.8);
  }

  /** Enemy currently simulated, for the panel. */
  get currentEnemy() {
    if (!this._enemyKey) return null;
    return {
      key: this._enemyKey,
      name: ARCHETYPES[this._enemyKey]?.name || this._enemyKey,
      hp: this._enemyHP,
      maxHP: this._enemyMaxHP,
    };
  }

  update(delta) {
    if (!this.activeTier) return;
    const tier = this.tierById(this.activeTier);
    if (!tier) return;

    if (!this._enemyKey) {
      // Respawn window between kills
      this._respawnTimer -= delta;
      if (this._respawnTimer > 0) return;
      this._spawn(tier);
      return;
    }

    this._enemyHP -= this.dps * delta;
    if (this._enemyHP <= 0) {
      this._onKill(tier);
    }
  }

  _spawn(tier) {
    const key = tier.pool[Math.floor(Math.random() * tier.pool.length)];
    const cfg = ARCHETYPES[key] || ARCHETYPES.rusher;
    this._enemyKey = key;
    this._enemyMaxHP = Math.round(cfg.hp * tier.hpMult);
    this._enemyHP = this._enemyMaxHP;
  }

  _onKill(tier) {
    const key = this._enemyKey;
    const cfg = ARCHETYPES[key] || ARCHETYPES.rusher;

    // PP reward (respects cap, like real combat)
    const ppGain = Math.round(cfg.ppReward * tier.ppMult);
    this.pp.ppTotal = Math.min(this.pp.ppCap, this.pp.ppTotal + ppGain);
    this.ppEarned += ppGain;

    // Drops — same tables as real combat
    for (const { mat, chance } of (DROP_TABLES[key] || [])) {
      if (Math.random() < chance) {
        this.inventory.addMaterial(mat, 1);
        this.lootTally[mat] = (this.lootTally[mat] || 0) + 1;
      }
    }

    this.totalKills++;
    this.killsByTier[tier.id] = (this.killsByTier[tier.id] || 0) + 1;

    this._enemyKey = null;
    this._enemyHP = 0;
    this._respawnTimer = tier.respawn;

    if (this.onKill) this.onKill(key, tier.id);
  }

  serialize() {
    return {
      activeTier: this.activeTier,
      maxUnlockedTier: this.maxUnlockedTier,
      totalKills: this.totalKills,
      killsByTier: { ...this.killsByTier },
      ppEarned: this.ppEarned,
    };
  }

  deserialize(data) {
    if (!data) return;
    this.maxUnlockedTier = data.maxUnlockedTier || 1;
    this.activeTier = data.activeTier || 0;
    if (this.activeTier && !this.isTierUnlocked(this.activeTier)) this.activeTier = 0;
    this.totalKills = data.totalKills || 0;
    this.killsByTier = data.killsByTier || {};
    this.ppEarned = data.ppEarned || 0;
    this._enemyKey = null;
    this._enemyHP = 0;
    this._respawnTimer = 0;
  }
}

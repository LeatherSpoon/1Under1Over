// ── Boss System ─────────────────────────────────────────────────────────────
// Each combat zone hosts a unique boss (spawned via Environment.getEnemySpawns
// entries flagged `boss: true`). Defeating a boss:
//   1. grants a permanent bonus (PP rate / PP cap / damage), and
//   2. grants "clearance" — an alternate unlock path for the next zone's
//      portal, independent of the PP / step gates.
// Defeated bosses never respawn (EntityManager spawnFilter checks isDefeated).

const BOSS_DEFS = [
  {
    id: 'boss_landing', zone: 'landingSite', label: 'Scrap Tyrant',
    bonus: { type: 'ppRate', value: 0.5, label: '+0.5 PP/s' },
    unlocks: 'verdantMaw',
  },
  {
    id: 'boss_mine', zone: 'mine', label: 'Forge Warden',
    bonus: { type: 'ppCap', value: 1.10, label: '+10% PP cap' },
    unlocks: 'depths',
  },
  {
    id: 'boss_verdant', zone: 'verdantMaw', label: 'Maw Sovereign',
    bonus: { type: 'damage', value: 1.10, label: '+10% damage' },
    unlocks: 'lagoonCoast',
  },
  {
    id: 'boss_lagoon', zone: 'lagoonCoast', label: 'Tide Oracle',
    bonus: { type: 'ppRate', value: 1.5, label: '+1.5 PP/s' },
    unlocks: 'frozenTundra',
  },
  {
    id: 'boss_tundra', zone: 'frozenTundra', label: 'Cryo Monarch',
    bonus: { type: 'ppCap', value: 1.15, label: '+15% PP cap' },
    unlocks: null,
  },
  {
    id: 'boss_depths', zone: 'depths', label: 'The Unmaker',
    bonus: { type: 'damage', value: 1.25, label: '+25% damage' },
    unlocks: null,
  },
];

export class BossSystem {
  constructor(ppSystem) {
    this.pp = ppSystem;
    this.defeated = new Set();
    this.onDefeat = null; // fn(def) — wired in main.js for toast + recompute
  }

  static get BOSS_DEFS() { return BOSS_DEFS; }

  getDef(id) { return BOSS_DEFS.find(b => b.id === id) || null; }

  isDefeated(id) { return this.defeated.has(id); }

  /** True if a defeated boss grants clearance into `zoneName`. */
  hasClearance(zoneName) {
    return BOSS_DEFS.some(b => b.unlocks === zoneName && this.defeated.has(b.id));
  }

  /** Called from combatSystem.onBossDefeated. */
  recordDefeat(archetypeId) {
    const def = this.getDef(archetypeId);
    if (!def || this.defeated.has(def.id)) return;
    this.defeated.add(def.id);
    this.applyBonuses();
    if (this.onDefeat) this.onDefeat(def);
  }

  /**
   * (Re-)apply PP-side bonuses for all defeated bosses. Idempotent — uses
   * named modifier keys. Damage bonuses are exposed via `damageMult` and
   * folded into CombatSystem.permDamageMult by main.js.
   */
  applyBonuses() {
    let rateAdd = 0;
    let capMult = 1;
    for (const def of BOSS_DEFS) {
      if (!this.defeated.has(def.id)) continue;
      if (def.bonus.type === 'ppRate') rateAdd += def.bonus.value;
      if (def.bonus.type === 'ppCap')  capMult *= def.bonus.value;
    }
    this.pp.setModifier('bossTrophies', rateAdd);
    this.pp.setCapMultiplier('bossTrophies', capMult);
  }

  /** Product of all defeated-boss damage bonuses. */
  get damageMult() {
    let m = 1;
    for (const def of BOSS_DEFS) {
      if (this.defeated.has(def.id) && def.bonus.type === 'damage') m *= def.bonus.value;
    }
    return m;
  }

  serialize() {
    return { defeated: [...this.defeated] };
  }

  deserialize(data) {
    if (!data) return;
    this.defeated = new Set(data.defeated || []);
  }
}

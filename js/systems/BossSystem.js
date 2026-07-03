// ── Boss System ─────────────────────────────────────────────────────────────
// Each adventure tier ends in a named boss. Bosses are fought in the real
// Pokémon-style combat window (CombatSystem/CombatUI) via a synthetic enemy
// object — no 3D entity needed. Defeating a boss:
//   • permanently unlocks the next adventure tier
//   • grants a permanent, stacking +5% PP rate multiplier
//   • fires a story trigger (StorySystem)
// A boss challenge unlocks after enough sim kills in its tier (KILLS_TO_UNLOCK).

export const KILLS_TO_UNLOCK = 10;

export const BOSSES = [
  {
    id: 'boss1', tier: 1, name: 'JUNKLORD',      archetype: 'rusher',
    hp: 220,  damage: 6,  attackInterval: 700,  attackPattern: 'melee',  statusEffect: null,
    ppReward: 300,
    desc: 'An overgrown scrapper fused from a dozen wrecked frames. Fast, relentless.',
  },
  {
    id: 'boss2', tier: 2, name: 'MAGMA SHELL',   archetype: 'cinder',
    hp: 420,  damage: 12, attackInterval: 1000, attackPattern: 'melee',  statusEffect: 'burn',
    ppReward: 800,
    desc: 'A furnace on legs, leaking slag. Every hit risks setting you alight.',
  },
  {
    id: 'boss3', tier: 3, name: 'THORNMOTHER',   archetype: 'stinger',
    hp: 700,  damage: 14, attackInterval: 800,  attackPattern: 'melee',  statusEffect: 'poison',
    ppReward: 2000,
    desc: 'The canopy hive-queen. Venom in every barb.',
  },
  {
    id: 'boss4', tier: 4, name: 'TIDECALLER',    archetype: 'voltaic',
    hp: 1100, damage: 11, attackInterval: 2600, attackPattern: 'burst',  statusEffect: 'shock',
    ppReward: 5000,
    desc: 'A storm coil dredged from the lagoon floor. Fires in crackling volleys.',
  },
  {
    id: 'boss5', tier: 5, name: 'GLACIER ENGINE', archetype: 'colossus',
    hp: 1800, damage: 55, attackInterval: 3200, attackPattern: 'windup', statusEffect: null,
    ppReward: 12000,
    desc: 'An excavation titan locked in the ice. Its wind-up flattens hills.',
  },
  {
    id: 'boss6', tier: 6, name: 'THE GATEKEEPER', archetype: 'warden',
    hp: 3000, damage: 30, attackInterval: 1400, attackPattern: 'melee',  statusEffect: 'corrosion',
    ppReward: 30000,
    desc: 'It stands where the portal network converges. It has always stood there.',
  },
];

export class BossSystem {
  constructor(ppSystem) {
    this.pp = ppSystem;
    this.defeated = new Set();       // boss ids

    this.onFightRequested = null;    // fn(bossDef) — main.js launches the combat
    this.onVictory = null;           // fn(bossDef) — main.js chains unlocks/toasts
  }

  get bosses() { return BOSSES; }

  bossById(id) { return BOSSES.find(b => b.id === id) || null; }

  isDefeated(id) { return this.defeated.has(id); }

  /** Permanent PP-rate multiplier from boss victories: ×1.05 each. */
  get ppMultiplier() {
    return Math.pow(1.05, this.defeated.size);
  }

  /** A boss can be challenged once the sim has enough kills in its tier. */
  canChallenge(bossId, adventure) {
    const boss = this.bossById(bossId);
    if (!boss) return false;
    if (!adventure.isTierUnlocked(boss.tier)) return false;
    return (adventure.killsByTier[boss.tier] || 0) >= KILLS_TO_UNLOCK;
  }

  killsRemaining(bossId, adventure) {
    const boss = this.bossById(bossId);
    if (!boss) return Infinity;
    return Math.max(0, KILLS_TO_UNLOCK - (adventure.killsByTier[boss.tier] || 0));
  }

  requestFight(bossId, adventure) {
    const boss = this.bossById(bossId);
    if (!boss || !this.canChallenge(bossId, adventure)) return false;
    if (this.onFightRequested) this.onFightRequested(boss);
    return true;
  }

  /**
   * Build a CombatSystem-compatible enemy object for a boss.
   * Duck-types the Enemy entity: maxHP/damage/attackInterval/attackPattern/
   * statusEffect/ppReward/name/archetype/getAttackSequence()/die().
   */
  createBossEnemy(boss) {
    const damage = boss.damage;
    return {
      isBoss: true,
      bossId: boss.id,
      name: boss.name,
      archetype: boss.archetype,
      maxHP: boss.hp,
      damage,
      attackInterval: boss.attackInterval,
      attackPattern: boss.attackPattern,
      statusEffect: boss.statusEffect,
      ppReward: boss.ppReward,
      getAttackSequence() {
        if (this.attackPattern === 'burst') {
          return [
            { damage, delay: 0 },
            { damage, delay: 150 },
            { damage, delay: 300 },
          ];
        }
        return [{ damage, delay: 0 }];
      },
      die() {}, // no 3D entity to remove
    };
  }

  /** Record a victory. Returns the boss def if it was newly defeated. */
  recordVictory(bossId) {
    const boss = this.bossById(bossId);
    if (!boss || this.defeated.has(bossId)) return null;
    this.defeated.add(bossId);
    if (this.onVictory) this.onVictory(boss);
    return boss;
  }

  serialize() {
    return { defeated: [...this.defeated] };
  }

  deserialize(data) {
    if (!data) return;
    this.defeated = new Set(data.defeated || []);
  }
}

import { CONFIG } from '../config.js';

const STAT_NAMES = [
  'strength', 'health', 'defense', 'constitution',
  'dexterity', 'agility', 'perception',
  'focusRate', 'focus', 'crafting', 'craftingSpeed', 'speed', 'energyCap', 'gatherSpeed',
];

const STAT_LABELS = {
  strength: 'Strength',
  health: 'Health',
  defense: 'Defense',
  constitution: 'Constitution',
  dexterity: 'Dexterity',
  agility: 'Agility',
  perception: 'Perception',
  focusRate: 'Focus Rate',
  focus: 'Focus',
  crafting: 'Crafting',
  craftingSpeed: 'Craft Speed',
  speed: 'Speed',
  energyCap: 'Max Energy',
  gatherSpeed: 'Gather Speed',
};

export class StatsSystem {
  constructor() {
    this.stats = {};
    for (const name of STAT_NAMES) {
      this.stats[name] = { level: 1, exp: 0 };
    }
    this._augBonuses = { hp: 0, energy: 0, speed: 0, defense: 0, damage: 0 };
    this.currentHP = this.maxHP;
    this.currentFP = 0;
    this.currentEnergy = this.maxEnergy;
    this._trackBonus = 0;
  }

  addAugBonus(type, amount) {
    if (type in this._augBonuses) this._augBonuses[type] += amount;
  }

  get statNames() { return STAT_NAMES; }
  get statLabels() { return STAT_LABELS; }

  getStat(name) {
    return this.stats[name]?.level || 0;
  }

  getStatLabel(name) {
    return STAT_LABELS[name] || name;
  }

  // ── Derived values ─────────────────────────────────────────────────────────
  get maxHP() {
    return CONFIG.BASE_MAX_HP + this.stats.health.level * CONFIG.MAX_HP_PER_LEVEL + this._augBonuses.hp;
  }
  get maxFP() {
    return CONFIG.BASE_MAX_FP + this.stats.focus.level * CONFIG.FP_PER_FOCUS_LEVEL;
  }
  get fpRate() {
    return CONFIG.BASE_FP_RATE + this.stats.focusRate.level * CONFIG.FP_RATE_PER_LEVEL;
  }
  get maxEnergy() {
    return CONFIG.BASE_MAX_ENERGY + this.stats.constitution.level * 5 + this.stats.energyCap.level * 10 + this._augBonuses.energy;
  }
  get moveSpeed() {
    return CONFIG.BASE_MOVE_SPEED + this.stats.speed.level * 0.15 + this._trackBonus + this._augBonuses.speed;
  }
  get gatherSpeedMult() {
    return 1.0 + (this.stats.gatherSpeed.level - 1) * CONFIG.GATHER_SPEED_PER_LEVEL;
  }

  setTrackBonus(bonus) {
    this._trackBonus = bonus;
  }
  get damage() {
    return this.stats.strength.level * CONFIG.BASE_DAMAGE + this._augBonuses.damage;
  }
  get defense() {
    return this.stats.defense.level + this._augBonuses.defense;
  }
  get agility() {
    return this.stats.agility.level;
  }

  // ── HP management ──────────────────────────────────────────────────────────
  takeDamage(amount) {
    const effective = Math.max(1, amount - Math.floor(this.defense * 0.5));
    this.currentHP = Math.max(0, this.currentHP - effective);
    return effective;
  }

  heal(amount) {
    this.currentHP = Math.min(this.maxHP, this.currentHP + amount);
  }

  rescueDrone() {
    this.currentHP = this.maxHP;
  }

  // ── Energy management ────────────────────────────────────────────────────
  spendEnergy(amount) {
    if (this.currentEnergy < amount) return false;
    this.currentEnergy -= amount;
    return true;
  }

  regenEnergy(delta) {
    this.currentEnergy = Math.min(this.maxEnergy, this.currentEnergy + CONFIG.ENERGY_REGEN_RATE * delta);
  }

  restoreEnergy() {
    this.currentEnergy = this.maxEnergy;
  }

  // ── FP management ─────────────────────────────────────────────────────────
  tickFP(delta) {
    this.currentFP = Math.min(this.maxFP, this.currentFP + this.fpRate * delta);
  }

  spendFP(amount) {
    if (this.currentFP < amount) return false;
    this.currentFP -= amount;
    return true;
  }

  resetFP() {
    this.currentFP = 0;
  }

  // ── Stat leveling ──────────────────────────────────────────────────────────
  upgradeCost(statName) {
    const level = this.stats[statName].level;
    // Near-linear: base * level * scale^(level-1)
    // The linear `level` term drives most of the growth;
    // the mild 1.08 exponent adds a gentle upward curve.
    return Math.ceil(
      CONFIG.STAT_UPGRADE_BASE_COST *
      level *
      Math.pow(CONFIG.STAT_UPGRADE_COST_SCALE, level - 1)
    );
  }

  /**
   * Level up a stat. Returns false if ppSystem cannot afford it.
   */
  levelUp(statName, ppSystem) {
    const cost = this.upgradeCost(statName);
    if (!ppSystem.spend(cost)) return false;
    this.stats[statName].level++;
    // Re-clamp HP if health upgraded
    if (statName === 'health') {
      this.currentHP = Math.min(this.currentHP, this.maxHP);
    }
    return true;
  }

}

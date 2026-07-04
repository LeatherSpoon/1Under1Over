// ── Neural Implant (Idle Skill Training) ────────────────────────────────────
// Route a share of your PP income into training one stat over time instead of
// lump-sum purchases. While a target stat is set, the implant siphons
// DRAIN_FRACTION of the effective PP rate out of the PP pool and banks it as
// training progress; when the bank covers the stat's upgrade cost, the stat
// levels up automatically. Training continues offline at 50% efficiency
// (via OfflineSystem), where it draws on time rather than the PP pool.

const DRAIN_FRACTION = 0.25;

export class NeuralImplantSystem {
  constructor(ppSystem, statsSystem) {
    this.pp = ppSystem;
    this.stats = statsSystem;

    this.target = null;    // stat name or null (training off)
    this.xp = 0;           // banked PP-equivalent toward the next level
    this.totalTrained = 0; // lifetime levels gained via training

    this.onLevelUp = null; // fn(statName, newLevel) — toast in main.js
  }

  static get DRAIN_FRACTION() { return DRAIN_FRACTION; }

  setTarget(statName) {
    if (statName !== null && !this.stats.stats[statName]) return false;
    if (statName !== this.target) this.xp = 0; // switching targets forfeits the bank
    this.target = statName;
    return true;
  }

  get nextCost() {
    return this.target ? this.stats.upgradeCost(this.target) : 0;
  }

  /** PP/s currently being siphoned into training. */
  get drainRate() {
    return this.target ? this.pp.effectiveRate * DRAIN_FRACTION : 0;
  }

  update(delta) {
    if (!this.target) return;
    const want = this.drainRate * delta;
    const take = Math.min(want, this.pp.ppTotal);
    if (take <= 0) return; // PP pool empty — training stalls
    this.pp.ppTotal -= take;
    this.xp += take;
    this._applyLevels();
  }

  /**
   * Offline training at `efficiency` — banks time-based XP without touching
   * the PP pool (offline PP accrual is handled separately by OfflineSystem).
   * Returns levels gained.
   */
  simulateOffline(seconds, efficiency = 0.5) {
    if (!this.target) return 0;
    this.xp += this.pp.effectiveRate * DRAIN_FRACTION * seconds * efficiency;
    return this._applyLevels(true);
  }

  _applyLevels(silent = false) {
    let gained = 0;
    // upgradeCost grows with level, so re-read each iteration
    while (this.target && this.xp >= this.stats.upgradeCost(this.target)) {
      this.xp -= this.stats.upgradeCost(this.target);
      this.stats.stats[this.target].level++;
      this.totalTrained++;
      gained++;
      if (!silent && this.onLevelUp) {
        this.onLevelUp(this.target, this.stats.stats[this.target].level);
      }
    }
    return gained;
  }

  serialize() {
    return { target: this.target, xp: this.xp, totalTrained: this.totalTrained };
  }

  deserialize(data) {
    if (!data) return;
    this.target = data.target || null;
    this.xp = data.xp || 0;
    this.totalTrained = data.totalTrained || 0;
  }
}

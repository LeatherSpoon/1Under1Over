// ── Training System (Idle Skill Training) ──────────────────────────────────
// NGU-style: instead of lump-sum PP purchases, assign stats to training
// slots. Each assigned stat siphons an equal share of your PP income into a
// training pool; when the pool reaches the stat's normal upgrade cost, the
// stat levels up automatically and the pool rolls over. Slots start at 1 and
// grow via Synthesis perks.
//
// The siphon drains real PP (from ppTotal), so training competes with
// spending — same economy, different cadence.

const BASE_SLOTS = 1;
// Fraction of effective PP/s routed into training per assigned stat.
const DRAIN_PER_SLOT = 0.25;

export class TrainingSystem {
  constructor(ppSystem, statsSystem) {
    this.pp = ppSystem;
    this.stats = statsSystem;
    this.assigned = [];          // stat names, max length = slots
    this.pools = {};             // statName -> accumulated PP
    this.bonusSlots = 0;         // raised by Synthesis perk
    this.totalAutoLevels = 0;

    this.onLevelUp = null;       // fn(statName, newLevel)
  }

  get slots() { return BASE_SLOTS + this.bonusSlots; }

  isAssigned(name) { return this.assigned.includes(name); }

  toggle(name) {
    if (!this.stats.stats[name]) return false;
    const idx = this.assigned.indexOf(name);
    if (idx >= 0) {
      this.assigned.splice(idx, 1);
      return true;
    }
    if (this.assigned.length >= this.slots) return false;
    this.assigned.push(name);
    return true;
  }

  update(delta) {
    if (this.assigned.length === 0) return;

    // Each assigned stat siphons DRAIN_PER_SLOT of income, capped by available PP.
    const perStat = this.pp.effectiveRate * DRAIN_PER_SLOT * delta;
    for (const name of this.assigned) {
      const drain = Math.min(perStat, this.pp.ppTotal);
      if (drain <= 0) break;
      this.pp.ppTotal -= drain;
      this.pools[name] = (this.pools[name] || 0) + drain;

      // Level up as many times as the pool affords (usually 0 or 1)
      let cost = this.stats.upgradeCost(name);
      while (this.pools[name] >= cost) {
        this.pools[name] -= cost;
        this.stats.stats[name].level++;
        if (name === 'health') {
          this.stats.currentHP = Math.min(this.stats.currentHP, this.stats.maxHP);
        }
        this.totalAutoLevels++;
        if (this.onLevelUp) this.onLevelUp(name, this.stats.stats[name].level);
        cost = this.stats.upgradeCost(name);
      }
    }
  }

  poolFor(name) {
    const pool = this.pools[name] || 0;
    const cost = this.stats.upgradeCost(name);
    return { pool, cost, pct: Math.min(100, (pool / cost) * 100) };
  }

  serialize() {
    return {
      assigned: [...this.assigned],
      pools: { ...this.pools },
      totalAutoLevels: this.totalAutoLevels,
    };
  }

  deserialize(data) {
    if (!data) return;
    this.assigned = (data.assigned || []).filter(n => this.stats.stats[n]);
    this.pools = data.pools || {};
    this.totalAutoLevels = data.totalAutoLevels || 0;
    // bonusSlots is re-applied by SynthesisSystem.applyPerks() on load
    if (this.assigned.length > this.slots) this.assigned.length = this.slots;
  }
}

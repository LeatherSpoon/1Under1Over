// ── Combat Simulator (Spaceship sparring rig) ───────────────────────────────
// Simulated combat only: no enemies, no drops, no PP cost or reward. While
// enabled it banks time-based XP into Strength and Defense and auto-levels
// each when the bank covers that stat's upgrade cost. Toggled at the sparring
// rig in the Spaceship — real field combat stays fully manual.
import { CONFIG } from '../config.js';

const TRAINED_STATS = ['strength', 'defense'];

export class CombatSimSystem {
  constructor(statsSystem) {
    this.stats = statsSystem;
    this.enabled = false;
    this.xp = { strength: 0, defense: 0 };
    this.totalTrained = 0; // lifetime levels gained via simulation

    this.onLevelUp = null; // fn(statName, newLevel) — toast in main.js
  }

  toggle() {
    this.enabled = !this.enabled;
    return this.enabled;
  }

  update(delta) {
    if (!this.enabled) return;
    for (const stat of TRAINED_STATS) {
      this.xp[stat] += CONFIG.COMBAT_SIM_RATE * delta;
      // upgradeCost grows with level, so re-read each iteration
      while (this.xp[stat] >= this.stats.upgradeCost(stat)) {
        this.xp[stat] -= this.stats.upgradeCost(stat);
        this.stats.stats[stat].level++;
        this.totalTrained++;
        if (this.onLevelUp) this.onLevelUp(stat, this.stats.stats[stat].level);
      }
    }
  }

  serialize() {
    return { enabled: this.enabled, xp: { ...this.xp }, totalTrained: this.totalTrained };
  }

  deserialize(data) {
    if (!data) return;
    this.enabled = !!data.enabled;
    this.xp = {
      strength: data.xp?.strength || 0,
      defense: data.xp?.defense || 0,
    };
    this.totalTrained = data.totalTrained || 0;
  }
}

// ── Training Chamber (Spaceship holodeck) ───────────────────────────────────
// One sim chamber, holodeck-style: the player picks a *program* at the console
// OUTSIDE the chamber, then walks in. While inside, the HUD swaps to a looping
// training-video overlay with elapsed time + stat gains (walk out to end it).
// Basic programs train one stat at 1x; advanced programs train two stats at 2x
// but *drain* a third — an NGU-style real cost: the drain empties that stat's
// banked XP, then eats actual stat levels (floored at Lv 1). XP banks per stat
// and auto-levels when the bank covers the stat's upgradeCost (same convention
// as NeuralImplantSystem). Effectiveness scales with the tripartite POWER leg
// via the getPowerBonus callback wired in main.js — "power" is how hard PP
// works at a sink. Program upgrades are a material sink: recipes of gathered
// and crafted components (adventure feeds the recipes). Trains offline at 50%
// while the player was left standing in the chamber (via OfflineSystem).
//
// Overlay video: drop `Assets/Video/training_<programId>.mp4` (per program) or
// `Assets/Video/training.mp4` (shared); the overlay falls back to an animated
// holo placeholder until a file exists.

import { CONFIG } from '../config.js';

const STATION_DEFS = [
  { id: 'strength_sim',    label: 'Strength Sim',      trains: { strength: 1 } },
  { id: 'endurance_sim',   label: 'Endurance Sim',     trains: { defense: 1 } },
  { id: 'overdrive_arena', label: 'Overdrive Arena',   trains: { strength: 2, dexterity: 2, defense: -1 } },
  { id: 'bulwark_sim',     label: 'Bulwark Simulator', trains: { defense: 2, constitution: 2, strength: -1 } },
];

// Upgrade recipes keyed by target level (2..max — the table defines the cap).
// Early levels cost gathered zone materials; later levels cost crafted
// intermediates from the processing chains.
const UPGRADE_COSTS = {
  strength_sim: {
    2: { iron: 15, stone: 10 },
    3: { steel_ingot: 3, iron: 25 },
    4: { mechanical_servo: 2, steel_ingot: 5 },
    5: { exo_servo_harness: 1, mechanical_servo: 4 },
  },
  endurance_sim: {
    2: { copper: 15, timber: 10 },
    3: { alloy_bar: 3, copper: 25 },
    4: { armorPlate: 2, alloy_bar: 5 },
    5: { aegis_capacitor_bank: 1, armorPlate: 4 },
  },
  overdrive_arena: {
    2: { quartz: 8, iron: 20 },
    3: { silicon_wafer: 3, quartz: 15 },
    4: { logic_processor: 2, silicon_wafer: 5 },
    5: { quantum_processor_ring: 1, logic_processor: 4 },
  },
  bulwark_sim: {
    2: { carbon: 8, stone: 20 },
    3: { synthetic_resin: 3, carbon: 15 },
    4: { energy_capacitor: 2, synthetic_resin: 5 },
    5: { aegis_capacitor_bank: 1, energy_capacitor: 4 },
  },
};

export class TrainingAreaSystem {
  constructor(statsSystem, inventorySystem) {
    this.stats = statsSystem;
    this.inventory = inventorySystem;

    this.levels = {};          // programId -> level (default 1)
    this.bank = {};            // statName -> banked PP-equivalent XP
    this.selectedProgram = null; // chosen at the console before entering (persisted)
    this.activeId = null;      // program running while inside the chamber (persisted for offline)
    this.totalTrained = 0;
    this.stint = { seconds: 0, levels: {} }; // current chamber visit, feeds the overlay

    this.getPowerBonus = () => 0;  // wired in main.js -> tripartite.powerBonus
    this.onLevelUp = null;         // fn(statName, newLevel)
    this.onLevelDown = null;       // fn(statName, newLevel)
  }

  static get STATION_DEFS() { return STATION_DEFS; }

  getDef(id) { return STATION_DEFS.find(s => s.id === id) || null; }
  stationLevel(id) { return this.levels[id] || 1; }

  /** XP/s applied per 1x leg at the station's current level, power included. */
  effectiveRate(id) {
    const base = CONFIG.TRAINING_BASE_XP_RATE ?? 0.5;
    const lvBonus = 1 + (CONFIG.TRAINING_UPGRADE_RATE_BONUS ?? 0.25) * (this.stationLevel(id) - 1);
    return base * lvBonus * (1 + this.getPowerBonus());
  }

  selectProgram(id) {
    if (id !== null && !this.getDef(id)) return false;
    this.selectedProgram = id;
    return true;
  }

  setActive(id) {
    if (id !== this.activeId && id) this.stint = { seconds: 0, levels: {} };
    this.activeId = id;
  }

  update(delta) {
    if (this.activeId) this.stint.seconds += delta;
    this._train(this.activeId, delta);
  }

  /**
   * Offline: the pad keeps running at `efficiency` if the player was parked.
   * Returns { station, deltas: { statName: ±levels } } or null.
   */
  simulateOffline(seconds, efficiency = 0.5) {
    const def = this.activeId && this.getDef(this.activeId);
    if (!def) return null;
    const before = {};
    for (const stat of Object.keys(def.trains)) before[stat] = this.stats.stats[stat]?.level ?? 1;
    this._train(this.activeId, seconds * efficiency, true);
    const deltas = {};
    for (const stat of Object.keys(def.trains)) {
      const d = (this.stats.stats[stat]?.level ?? 1) - before[stat];
      if (d !== 0) deltas[stat] = d;
    }
    return { station: def.label, deltas };
  }

  _train(id, seconds, silent = false) {
    const def = id && this.getDef(id);
    if (!def || seconds <= 0) return;
    const rate = this.effectiveRate(id);
    for (const [stat, mult] of Object.entries(def.trains)) {
      if (!this.stats.stats[stat]) continue;
      this.bank[stat] = (this.bank[stat] || 0) + mult * rate * seconds;
      this._settle(stat, silent);
    }
  }

  _settle(stat, silent) {
    const s = this.stats.stats[stat];
    // upgradeCost grows with level, so re-read each iteration
    while (this.bank[stat] >= this.stats.upgradeCost(stat)) {
      this.bank[stat] -= this.stats.upgradeCost(stat);
      s.level++;
      this.totalTrained++;
      this.stint.levels[stat] = (this.stint.levels[stat] || 0) + 1;
      if (!silent && this.onLevelUp) this.onLevelUp(stat, s.level);
    }
    // Drain: a negative bank eats real levels (the NGU-style cost), floor Lv 1
    while (this.bank[stat] < 0) {
      if (s.level <= 1) { this.bank[stat] = 0; break; }
      s.level--;
      this.bank[stat] += this.stats.upgradeCost(stat); // XP that level was worth
      this.stint.levels[stat] = (this.stint.levels[stat] || 0) - 1;
      if (!silent && this.onLevelDown) this.onLevelDown(stat, s.level);
    }
  }

  /** Material recipe for the next level, or null when maxed. */
  upgradeCost(id) {
    return UPGRADE_COSTS[id]?.[this.stationLevel(id) + 1] || null;
  }

  canUpgrade(id) {
    const cost = this.upgradeCost(id);
    if (!cost) return false;
    return Object.entries(cost).every(([mat, qty]) => (this.inventory.materials[mat] || 0) >= qty);
  }

  upgrade(id) {
    if (!this.canUpgrade(id)) return false;
    const cost = this.upgradeCost(id);
    for (const [mat, qty] of Object.entries(cost)) this.inventory.removeMaterial(mat, qty);
    this.levels[id] = this.stationLevel(id) + 1;
    return true;
  }

  serialize() {
    return {
      levels: { ...this.levels },
      bank: { ...this.bank },
      selectedProgram: this.selectedProgram,
      activeId: this.activeId,
      totalTrained: this.totalTrained,
    };
  }

  deserialize(data) {
    if (!data) return;
    this.levels = data.levels || {};
    this.bank = data.bank || {};
    this.selectedProgram = data.selectedProgram || null;
    this.activeId = data.activeId || null;
    this.totalTrained = data.totalTrained || 0;
  }
}

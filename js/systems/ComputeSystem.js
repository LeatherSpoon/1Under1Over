// ── Compute Allocation System (Phase E, save v14) ───────────────────────────
// Al's attention pool. Units are assigned to automation destinations; a
// destination runs unattended (online AND offline) iff ≥1 unit is assigned —
// this single rule is "only what you stocked runs." Withdrawal is instant and
// lossless. Extra units past the first boost output, amplified by the
// tripartite POWER leg (power = sink-effectiveness) and the Archive shop's
// Compute Amplifier.
//
// Gating only applies once the board is unlocked (chapter level ≥
// CONFIG.COMPUTE_UNLOCK_LEVEL). While locked, gateMult() returns 1 for every
// destination so pre-S2 play is untouched. On the first frame the board is
// unlocked, the pool auto-seeds 1 unit into each destination the player was
// already using (ladder → drones → extractors → holodeck) so nothing that was
// running silently dies — the seeding runs exactly once, ever (serialized).

import { CONFIG } from '../config.js';

export const COMPUTE_DESTINATIONS = [
  { key: 'ladder',             label: 'SIM LADDER',      desc: 'Al pushes/farms the Simulation Ladder' },
  { key: 'drones',             label: 'DRONE ROUTES',    desc: 'Passive drone gathering' },
  { key: 'extractors',         label: 'EXTRACTOR BANK',  desc: 'All installed extractor units' },
  { key: 'holodeck',           label: 'HOLODECK',        desc: 'Runs the loaded training program unattended' },
  { key: 'processing',         label: 'PROCESSING BANK', desc: 'Refinery node queues' },
  { key: 'factory:smelter',    label: 'LINE: ARC SMELTER',    desc: 'Automated smelter line', machine: 'smelter' },
  { key: 'factory:assembler',  label: 'LINE: CONSTRUCTOR',    desc: 'Automated constructor line', machine: 'assembler' },
  { key: 'factory:fabricator', label: 'LINE: FABRICATOR',     desc: 'Automated fabricator line', machine: 'fabricator' },
  { key: 'overflow',           label: 'OVERFLOW ROUTING', desc: 'Converts over-cap PP into implant XP', module: 'overflowRouting' },
];

// Al capability modules (G1/G2): chapters unlock the RIGHT TO BUY; PP +
// materials price them. Triage (W30, auto-shred) ships with the Phase G loot
// layer — its dependency (the shredder) doesn't exist yet.
export const AL_MODULES = [
  {
    id: 'keyTracker', label: 'KEY TRACKER', level: 1,
    pp: 150, mats: { circuitWire: 5, logicChip: 3 },
    desc: 'Flags which field family mints Override Keys for the next warden',
    teach: 'Band telemetry online. I\'ll flag which field creatures mint keys for each warden.',
  },
  {
    id: 'overflowRouting', label: 'OVERFLOW ROUTING', level: 3,
    pp: 600, mats: { data_cable: 2, powerCore: 4 },
    desc: 'Over-cap PP converts into implant XP at 25% × (1 + power) instead of evaporating',
    teach: 'Cap overflow now reroutes into implant training instead of boiling off.',
  },
  {
    id: 'farmDirector', label: 'FARM DIRECTOR', level: 5,
    pp: 2500, mats: { logic_processor: 3, circuit_board: 1 },
    desc: 'Auto-advances the running ladder to the highest safe tier',
    teach: 'I\'ll walk the sim up to the highest safe tier on my own. Point me and forget me.',
  },
  {
    id: 'foreman', label: 'FOREMAN', level: 7,
    pp: 8000, mats: { mechanical_servo: 2, alloy_bar: 2, hull_segment: 1 },
    desc: 'Restocks factory hoppers from your bags automatically',
    teach: 'Machine hoppers restock from your bags while I\'m watching the lines.',
  },
];

export class ComputeSystem {
  constructor(ppSystem, inventorySystem = null) {
    this.pp = ppSystem;
    this.inventory = inventorySystem; // needed for module material prices
    this.capLevel = 0;
    this.assigned = {};           // { destKey: units }
    this.modules = {};            // { moduleId: true } — Al capability modules owned
    this.seeded = false;          // one-time auto-seed done?
    // Live callbacks wired in main.js (TrainingAreaSystem.getPowerBonus
    // pattern) — always current, including during boot/cloud-restore offline
    // resolution before the first frame:
    this.getPowerBonus = () => 0;    // → tripartite.powerBonus
    this.getAmpLevel = () => 0;      // → ascension.computeAmpLevel
    this.getChapterLevel = () => 0;  // → chapterSystem.level
    // Probe bag set in main.js — used only by the one-time auto-seed.
    this.probe = null;            // { ladder, drones, extractors, holodeck } → fns → booleans
  }

  get unlocked() { return this.getChapterLevel() >= CONFIG.COMPUTE_UNLOCK_LEVEL; }

  totalUnits() { return CONFIG.COMPUTE_BASE_UNITS + CONFIG.COMPUTE_CAP_STEP * this.capLevel; }

  assignedTotal() {
    let sum = 0;
    for (const key of Object.keys(this.assigned)) sum += this.assigned[key];
    return sum;
  }

  freeUnits() { return Math.max(0, this.totalUnits() - this.assignedTotal()); }

  unitsOn(key) { return this.assigned[key] || 0; }

  /** Set a destination's units, clamped to [0, current + free]. */
  setUnits(key, n) {
    const raw = Number(n);
    const max = this.unitsOn(key) + this.freeUnits();
    const units = Math.max(0, Math.min(max, Number.isFinite(raw) ? Math.floor(raw) : 0));
    if (units === 0) delete this.assigned[key];
    else this.assigned[key] = units;
    return units;
  }

  adjust(key, delta) { return this.setUnits(key, this.unitsOn(key) + delta); }

  assignMax(key) { return this.setUnits(key, this.unitsOn(key) + this.freeUnits()); }

  /** Output multiplier for an ASSIGNED destination; 0 when unassigned. */
  outputMult(key) {
    const units = this.unitsOn(key);
    if (units <= 0) return 0;
    const extras = units - 1;
    const extraBonus = CONFIG.COMPUTE_EXTRA_OUTPUT * extras * (1 + CONFIG.COMPUTE_POWER_LEVERAGE * this.getPowerBonus());
    const amp = 1 + CONFIG.COMPUTE_AMP_OUTPUT * this.getAmpLevel();
    return (1 + extraBonus) * amp;
  }

  /** The gate systems consume: 1 while the board is locked (v13 behavior),
   *  else outputMult (which is 0 for unassigned destinations). */
  gateMult(key) {
    if (!this.unlocked) return 1;
    return this.outputMult(key);
  }

  capUpgradeCost() {
    return Math.ceil(CONFIG.COMPUTE_CAP_BASE_COST * Math.pow(CONFIG.COMPUTE_CAP_COST_GROWTH, this.capLevel));
  }

  buyCapUpgrade() {
    const cost = this.capUpgradeCost();
    if (!this.pp || !this.pp.spend(cost)) return false;
    this.capLevel++;
    return true;
  }

  /** One-time seeding on the first frame the board is unlocked: 1 unit to each
   *  destination the player was already using, in priority order, so the
   *  stocked-offline gate never silently kills a running system. Covers both
   *  v13 migration and fresh saves crossing S2. */
  maybeSeed() {
    if (this.seeded || !this.unlocked) return;
    this.seeded = true;
    const p = this.probe;
    if (!p) return;
    const order = ['ladder', 'drones', 'extractors', 'holodeck'];
    for (const key of order) {
      if (this.freeUnits() <= 0) break;
      let active = false;
      try { active = !!p[key]?.(); } catch (_) { active = false; }
      if (active && this.unitsOn(key) === 0) this.setUnits(key, 1);
    }
  }

  // ── Al capability modules ──────────────────────────────────────────────────

  hasModule(id) { return !!this.modules[id]; }

  moduleDef(id) { return AL_MODULES.find(m => m.id === id) || null; }

  /** Chapter gate: the RIGHT to buy (G2). */
  moduleAvailable(id) {
    const def = this.moduleDef(id);
    return !!def && this.getChapterLevel() >= def.level;
  }

  canBuyModule(id) {
    const def = this.moduleDef(id);
    if (!def || this.hasModule(id) || !this.moduleAvailable(id)) return false;
    if (!this.pp || this.pp.ppTotal < def.pp) return false;
    if (def.mats && this.inventory) {
      for (const [mat, qty] of Object.entries(def.mats)) {
        if ((this.inventory.materials[mat] || 0) < qty) return false;
      }
    }
    return true;
  }

  buyModule(id) {
    if (!this.canBuyModule(id)) return false;
    const def = this.moduleDef(id);
    if (!this.pp.spend(def.pp)) return false;
    if (def.mats && this.inventory) {
      for (const [mat, qty] of Object.entries(def.mats)) {
        this.inventory.removeMaterial(mat, qty);
      }
    }
    this.modules[id] = true;
    return true;
  }

  /** Overflow Routing conversion: over-cap PP → implant XP at
   *  25% × (1 + powerBonus) × outputMult('overflow'). Requires the module,
   *  ≥1 unit on the overflow row, and an implant target. Returns XP banked. */
  routeOverflow(amount, implant) {
    if (!(amount > 0) || !this.hasModule('overflowRouting')) return 0;
    if (!this.unlocked || this.outputMult('overflow') <= 0) return 0;
    if (!implant || !implant.target) return 0;
    const xp = amount * 0.25 * (1 + this.getPowerBonus()) * this.outputMult('overflow');
    implant.bankXP(xp);
    return xp;
  }

  serialize() {
    return {
      capLevel: this.capLevel,
      assigned: { ...this.assigned },
      modules: { ...this.modules },
      seeded: this.seeded,
    };
  }

  deserialize(data) {
    if (!data) return; // v13 save — maybeSeed() handles first-unlock seeding
    this.capLevel = data.capLevel || 0;
    this.seeded = !!data.seeded;
    this.modules = { ...(data.modules || {}) };
    this.assigned = {};
    const src = data.assigned || {};
    for (const key of Object.keys(src)) {
      this.setUnits(key, src[key]); // clamps to the (possibly smaller) pool
    }
  }
}

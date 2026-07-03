// ── Synthesis System (Third Prestige Layer) ─────────────────────────────────
// Sits above Ascension. Once you've ascended enough times, you can
// Synthesize: sacrifice ALL ascension progress (count, AP, amplifiers) and
// the current run for Synthesis Cores. Cores buy fundamentally new mechanics
// rather than bigger multipliers — auto-offload, extra idle-training slots,
// cap overflow — the layer changes how the game plays, not just how fast.

import { CONFIG } from '../config.js';

export const SYNTHESIS_MIN_ASCENSIONS = 2;

export const SYNTHESIS_PERKS = [
  {
    id: 'autoOffload',
    label: 'Offload Daemon',
    desc: 'A background process offloads automatically the moment PP hits cap.',
    cost: 3, maxLevel: 1,
  },
  {
    id: 'trainingMatrix',
    label: 'Parallel Training Matrix',
    desc: '+1 idle training slot per level.',
    cost: 2, maxLevel: 3,
  },
  {
    id: 'overflowBuffer',
    label: 'Overflow Buffer',
    desc: '+50% PP capacity per level (multiplicative, survives all resets).',
    cost: 2, maxLevel: 5,
  },
  {
    id: 'resonance',
    label: 'Synthesis Resonance',
    desc: '+15% PP rate per level (multiplicative, survives all resets).',
    cost: 1, maxLevel: 10,
  },
];

export class SynthesisSystem {
  constructor(ppSystem, ascensionSystem) {
    this.pp = ppSystem;
    this.ascension = ascensionSystem;
    this.synthesisCount = 0;
    this.cores = 0;
    this.perkLevels = {};       // perkId -> level

    this.onSynthesize = null;   // fn(result)
  }

  get perks() { return SYNTHESIS_PERKS; }

  perkLevel(id) { return this.perkLevels[id] || 0; }

  get autoOffloadEnabled() { return this.perkLevel('autoOffload') > 0; }

  get ppMultiplier() {
    return Math.pow(1.15, this.perkLevel('resonance'));
  }

  canSynthesize() {
    return this.ascension.ascensionCount >= SYNTHESIS_MIN_ASCENSIONS;
  }

  /** Cores earned by synthesizing now: one per ascension, plus one per 5 unspent AP. */
  get corePreview() {
    return this.ascension.ascensionCount + Math.floor(this.ascension.ascensionPoints / 5);
  }

  synthesize() {
    if (!this.canSynthesize()) return null;

    const coresEarned = this.corePreview;
    const prevAscensions = this.ascension.ascensionCount;

    // Burn the ascension layer down to bedrock
    this.ascension.ascensionCount = 0;
    this.ascension.ascensionPoints = 0;
    this.ascension.ppMultiplier = 1.0;
    this.ascension.combatMultiplier = 1.0;
    this.ascension.gatherMultiplier = 1.0;
    this.ascension.droneMultiplier = 1.0;
    this.ascension._upgradeCounts = { ppMult: 0, combatMult: 0, gatherMult: 0, droneMult: 0 };

    // ...and the current run with it
    this.pp.ppTotal = 0;
    this.pp.setBaseCap(CONFIG.INITIAL_PP_CAP);
    this.pp.prestigeCount = 0;

    this.synthesisCount++;
    this.cores += coresEarned;

    const result = { coresEarned, totalCores: this.cores, synthesisCount: this.synthesisCount, prevAscensions };
    if (this.onSynthesize) this.onSynthesize(result);
    return result;
  }

  buyPerk(id) {
    const perk = SYNTHESIS_PERKS.find(p => p.id === id);
    if (!perk) return false;
    const lvl = this.perkLevel(id);
    if (lvl >= perk.maxLevel || this.cores < perk.cost) return false;
    this.cores -= perk.cost;
    this.perkLevels[id] = lvl + 1;
    return true;
  }

  /** Re-apply perk effects to their target systems (after purchase AND on load). */
  applyPerks({ pp = null, training = null } = {}) {
    if (pp) {
      const overflow = this.perkLevel('overflowBuffer');
      if (overflow > 0) pp.setCapMultiplier('synthesis_overflow', Math.pow(1.5, overflow));
      else pp.removeCapMultiplier('synthesis_overflow');
    }
    if (training) {
      training.bonusSlots = this.perkLevel('trainingMatrix');
    }
  }

  serialize() {
    return {
      synthesisCount: this.synthesisCount,
      cores: this.cores,
      perkLevels: { ...this.perkLevels },
    };
  }

  deserialize(data) {
    if (!data) return;
    this.synthesisCount = data.synthesisCount || 0;
    this.cores = data.cores || 0;
    this.perkLevels = data.perkLevels || {};
  }
}

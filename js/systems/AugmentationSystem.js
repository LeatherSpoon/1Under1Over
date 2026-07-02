export const AUGMENTS = [
  // ── Survivability ──────────────────────────────────────────────────────────
  { id: 'reinforcedFrame',  label: 'Reinforced Frame',  category: 'Survivability', desc: '+50 Max HP. Subdermal plating reinforces your chassis.',           cost: 500  },
  { id: 'titaniumPlating',  label: 'Titanium Plating',  category: 'Survivability', desc: '+3 Defense. Ablative nano-layer reduces incoming damage.',          cost: 700  },
  { id: 'adaptiveShielding',label: 'Adaptive Shielding',category: 'Survivability', desc: '+6 Defense. Dynamic field shifts to match threat vectors.',         cost: 1200 },
  // ── Mobility ───────────────────────────────────────────────────────────────
  { id: 'servoLegs',        label: 'Servo Legs',        category: 'Mobility',      desc: '+0.3 Move Speed. Hydraulic assist cuts ground time.',               cost: 400  },
  { id: 'capacitorArray',   label: 'Capacitor Array',   category: 'Mobility',      desc: '+30 Max Energy. High-density cells extend operational range.',       cost: 600  },
  // ── Combat ─────────────────────────────────────────────────────────────────
  { id: 'combatTargeting',  label: 'Combat Targeting',  category: 'Combat',        desc: '+15 flat damage. Targeting overlay improves strike precision.',      cost: 900  },
  // ── Efficiency ─────────────────────────────────────────────────────────────
  { id: 'neuralLink',       label: 'Neural Link',       category: 'Efficiency',    desc: 'Gather re-prompt delay drops from 1.5s to 0.3s.',                   cost: 800  },
  { id: 'overclockModule',  label: 'Overclock Module',  category: 'Efficiency',    desc: '+5 Crafting Speed levels. Fabrication routines run in parallel.',   cost: 1000 },
];

export class AugmentationSystem {
  constructor() {
    this._owned = new Set();
    this.onPurchase = null; // fn(id, augment)
  }

  purchase(id, ppSystem) {
    if (this._owned.has(id)) return false;
    const aug = AUGMENTS.find(a => a.id === id);
    if (!aug) return false;
    if (ppSystem.ppTotal < aug.cost) return false;
    ppSystem.ppTotal -= aug.cost;
    this._owned.add(id);
    if (this.onPurchase) this.onPurchase(id, aug);
    return true;
  }

  has(id) { return this._owned.has(id); }
  get ownedCount() { return this._owned.size; }
  get totalCount() { return AUGMENTS.length; }

  serialize() { return { owned: [...this._owned] }; }

  load(data) { if (data?.owned) this._owned = new Set(data.owned); }

  // Re-apply all stat bonuses to statsSystem after a load
  applyBonuses(statsSystem) {
    if (this._owned.has('reinforcedFrame'))   statsSystem.addAugBonus('hp',      50);
    if (this._owned.has('titaniumPlating'))   statsSystem.addAugBonus('defense',  3);
    if (this._owned.has('adaptiveShielding')) statsSystem.addAugBonus('defense',  6);
    if (this._owned.has('servoLegs'))         statsSystem.addAugBonus('speed',   0.3);
    if (this._owned.has('capacitorArray'))    statsSystem.addAugBonus('energy',  30);
    if (this._owned.has('combatTargeting'))   statsSystem.addAugBonus('damage',  15);
    if (this._owned.has('overclockModule'))   statsSystem.stats.craftingSpeed.level += 5;
  }

  static get ALL() { return AUGMENTS; }
}

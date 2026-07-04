// ── Modifiers System ────────────────────────────────────────────────────────
// Trade-off upgrades: opt-in toggles that boost one stat at the cost of another.
// Up to MAX_ACTIVE can run simultaneously, forcing strategic choice rather than
// "buy everything." Hand-off §3: Trade-off Upgrades.

const MAX_ACTIVE = 2;

const MODIFIERS = [
  {
    id: 'overclock',
    label: 'Overclock',
    desc: '+30% PP rate · −20% gather speed',
    netEstimate: 0.30,
    apply: ({ pp, statsAccum }) => {
      pp.setModifier('mod_overclock', pp.ppRate * 0.30);
      statsAccum.gatherMult *= 0.80;
    },
    revert: ({ pp, statsAccum }) => {
      pp.removeModifier('mod_overclock');
      statsAccum.gatherMult /= 0.80;
    },
  },
  {
    id: 'frugalCircuits',
    label: 'Frugal Circuits',
    desc: '−30% energy cost · −15% PP rate',
    netEstimate: 0.10,
    apply: ({ pp, statsAccum }) => {
      pp.setModifier('mod_frugal', -pp.ppRate * 0.15);
      statsAccum.energyCostMult *= 0.70;
    },
    revert: ({ pp, statsAccum }) => {
      pp.removeModifier('mod_frugal');
      statsAccum.energyCostMult /= 0.70;
    },
  },
  {
    id: 'combatFocus',
    label: 'Combat Focus',
    desc: '+25% damage · −20% drone efficiency',
    netEstimate: 0.05,
    apply: ({ statsAccum }) => {
      statsAccum.damageMult *= 1.25;
      statsAccum.droneMult *= 0.80;
    },
    revert: ({ statsAccum }) => {
      statsAccum.damageMult /= 1.25;
      statsAccum.droneMult /= 0.80;
    },
  },
  {
    id: 'harvestFocus',
    label: 'Harvest Focus',
    desc: '+30% gather speed · −20% damage',
    netEstimate: 0.10,
    apply: ({ statsAccum }) => {
      statsAccum.gatherMult *= 1.30;
      statsAccum.damageMult *= 0.80;
    },
    revert: ({ statsAccum }) => {
      statsAccum.gatherMult /= 1.30;
      statsAccum.damageMult /= 0.80;
    },
  },
  {
    id: 'minimalist',
    label: 'Minimalist',
    desc: '+1.0 PP/s flat · −10% all stat upgrade efficacy',
    netEstimate: 0.15,
    apply: ({ pp }) => { pp.setModifier('mod_minimalist', 1.0); },
    revert: ({ pp }) => { pp.removeModifier('mod_minimalist'); },
  },
];

export class ModifiersSystem {
  constructor(ppSystem) {
    this.pp = ppSystem;
    this.active = new Set();
    this.statsAccum = { gatherMult: 1, energyCostMult: 1, damageMult: 1, droneMult: 1 };
    this.onChange = null;
  }

  get maxActive() { return MAX_ACTIVE; }

  list() {
    return MODIFIERS.map(m => ({ ...m, active: this.active.has(m.id) }));
  }

  toggle(id) {
    const def = MODIFIERS.find(m => m.id === id);
    if (!def) return false;
    if (this.active.has(id)) {
      def.revert({ pp: this.pp, statsAccum: this.statsAccum });
      this.active.delete(id);
    } else {
      if (this.active.size >= MAX_ACTIVE) return false;
      def.apply({ pp: this.pp, statsAccum: this.statsAccum });
      this.active.add(id);
    }
    if (this.onChange) this.onChange(this.statsAccum);
    return true;
  }

  // Read accessors used by other systems to fold modifiers in.
  get gatherMult() { return this.statsAccum.gatherMult; }
  get energyCostMult() { return this.statsAccum.energyCostMult; }
  get damageMult() { return this.statsAccum.damageMult; }
  get droneMult() { return this.statsAccum.droneMult; }

  serialize() {
    return { active: [...this.active] };
  }

  load(data) {
    if (!data) return;
    // Revert all then re-apply from saved set so net multipliers are recomputed.
    for (const id of [...this.active]) {
      const def = MODIFIERS.find(m => m.id === id);
      if (def) def.revert({ pp: this.pp, statsAccum: this.statsAccum });
    }
    this.active.clear();
    this.statsAccum = { gatherMult: 1, energyCostMult: 1, damageMult: 1, droneMult: 1 };
    for (const id of data.active || []) {
      const def = MODIFIERS.find(m => m.id === id);
      if (def) {
        def.apply({ pp: this.pp, statsAccum: this.statsAccum });
        this.active.add(id);
      }
    }
    if (this.onChange) this.onChange(this.statsAccum);
  }
}

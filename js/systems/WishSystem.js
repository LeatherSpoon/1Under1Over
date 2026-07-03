// ── Wish System ─────────────────────────────────────────────────────────────
// NGU-style long-term goals: each wish is a huge PP sink filled gradually.
// While a wish is focused, it siphons a share of your PP total each second
// (never below zero) into the wish's progress pool. Completing a wish grants
// a large permanent bonus. One wish focused at a time; progress persists when
// unfocused, so wishes are hours-to-days investments, not one-shot purchases.

export const WISHES = [
  {
    id: 'wishRate',
    label: 'Wish: Deeper Clockspeed',
    desc: 'Rebuild your core scheduler from first principles.',
    cost: 50000,
    reward: { type: 'ppRate', mult: 1.5, label: '+50% PP rate — permanent' },
  },
  {
    id: 'wishDamage',
    label: 'Wish: Weaponized Chassis',
    desc: 'Re-forge every strut and servo for war.',
    cost: 80000,
    reward: { type: 'damage', mult: 2.0, label: '×2 combat damage — permanent' },
  },
  {
    id: 'wishGather',
    label: 'Wish: Harmonic Extraction',
    desc: 'Tune your manipulators to the planet\'s resonant frequency.',
    cost: 120000,
    reward: { type: 'gather', mult: 1.5, label: '+50% gather speed — permanent' },
  },
  {
    id: 'wishDrones',
    label: 'Wish: Swarm Doctrine',
    desc: 'Teach the drones to think as one organism.',
    cost: 200000,
    reward: { type: 'drone', mult: 2.0, label: '×2 drone efficiency — permanent' },
  },
  {
    id: 'wishCrystals',
    label: 'Wish: Fractured Time',
    desc: 'Fold a sliver of the portal network into your chronometer.',
    cost: 400000,
    reward: { type: 'crystals', amount: 10, label: '+10 Quantum Crystals' },
  },
];

// Fraction of current PP total siphoned per second while focused.
const SIPHON_RATE = 0.02;
// Floor: always make at least this much progress per second when PP > 0.
const SIPHON_MIN = 1;

export class WishSystem {
  constructor(ppSystem) {
    this.pp = ppSystem;
    this.progress = {};        // wishId -> PP invested
    this.completed = new Set();
    this.focusedId = null;

    this.onComplete = null;    // fn(wishDef)
  }

  get wishes() { return WISHES; }
  get focused() { return WISHES.find(w => w.id === this.focusedId) || null; }

  _rewardMult(type) {
    let m = 1;
    for (const w of WISHES) {
      if (this.completed.has(w.id) && w.reward.type === type) m *= (w.reward.mult || 1);
    }
    return m;
  }
  get ppMultiplier()     { return this._rewardMult('ppRate'); }
  get damageMultiplier() { return this._rewardMult('damage'); }
  get gatherMultiplier() { return this._rewardMult('gather'); }
  get droneMultiplier()  { return this._rewardMult('drone'); }

  focus(id) {
    const w = WISHES.find(x => x.id === id);
    if (!w || this.completed.has(id)) return false;
    this.focusedId = (this.focusedId === id) ? null : id; // toggle
    return true;
  }

  update(delta) {
    const w = this.focused;
    if (!w) return;

    const siphon = Math.min(
      this.pp.ppTotal,
      Math.max(SIPHON_MIN, this.pp.ppTotal * SIPHON_RATE) * delta
    );
    if (siphon <= 0) return;

    this.pp.ppTotal -= siphon;
    this.progress[w.id] = (this.progress[w.id] || 0) + siphon;

    if (this.progress[w.id] >= w.cost) {
      this.progress[w.id] = w.cost;
      this.completed.add(w.id);
      this.focusedId = null;
      if (this.onComplete) this.onComplete(w);
    }
  }

  progressFor(w) {
    const invested = Math.min(w.cost, this.progress[w.id] || 0);
    return { invested, cost: w.cost, pct: (invested / w.cost) * 100 };
  }

  serialize() {
    return {
      progress: { ...this.progress },
      completed: [...this.completed],
      focusedId: this.focusedId,
    };
  }

  deserialize(data) {
    if (!data) return;
    this.progress = data.progress || {};
    this.completed = new Set(data.completed || []);
    this.focusedId = data.focusedId || null;
  }
}

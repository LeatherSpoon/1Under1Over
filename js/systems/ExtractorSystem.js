const MAX_SLOTS = 6;

// Per-second yield per extractor type
const RATES = {
  basic:    { copper: 0.030, iron: 0.020, stone: 0.020 },
  advanced: { copper: 0.060, iron: 0.050, stone: 0.040, carbon: 0.020, quartz: 0.015 },
};

export class ExtractorSystem {
  static get RATES()     { return RATES; }
  static get MAX_SLOTS() { return MAX_SLOTS; }

  constructor(inventorySystem) {
    this.inventory = inventorySystem;
    this._slots   = [];   // [{ type: 'basic'|'advanced' }]
    this._accum   = {};   // fractional-material accumulator
    this.onExtract = null; // fn(materialKey, qty) — optional notification hook
    this.computeMult = 1;  // compute gate: 0 pauses the bank, >1 boosts it (set per frame in main.js)
  }

  get slotCount()     { return this._slots.length; }
  get basicCount()    { return this._slots.filter(s => s.type === 'basic').length; }
  get advancedCount() { return this._slots.filter(s => s.type === 'advanced').length; }

  _itemKey(type) {
    return type === 'advanced' ? 'extractor_unit_adv' : 'extractor_unit';
  }

  canInstall(type) {
    if (this._slots.length >= MAX_SLOTS) return false;
    return (this.inventory.materials[this._itemKey(type)] || 0) >= 1;
  }

  install(type) {
    if (!this.canInstall(type)) return false;
    this.inventory.materials[this._itemKey(type)]--;
    this._slots.push({ type });
    return true;
  }

  remove(index) {
    if (index < 0 || index >= this._slots.length) return false;
    const slot = this._slots.splice(index, 1)[0];
    const key  = this._itemKey(slot.type);
    if (key in this.inventory.materials) {
      this.inventory.materials[key] = Math.min(99, (this.inventory.materials[key] || 0) + 1);
    }
    return true;
  }

  // Call each frame with seconds elapsed since last frame
  update(delta) {
    if (this._slots.length === 0 || this.computeMult <= 0) return;
    const effDelta = delta * this.computeMult;
    for (const slot of this._slots) {
      for (const [mat, rate] of Object.entries(RATES[slot.type])) {
        if (!(mat in this.inventory.materials)) continue;
        this._accum[mat] = (this._accum[mat] || 0) + rate * effDelta;
        if (this._accum[mat] >= 1) {
          const qty    = Math.floor(this._accum[mat]);
          this._accum[mat] -= qty;
          const space  = 99 - this.inventory.materials[mat];
          const actual = Math.min(qty, Math.max(0, space));
          if (actual > 0) {
            this.inventory.materials[mat] += actual;
            this.onExtract?.(mat, actual);
          }
        }
      }
    }
  }

  /** Stocked-offline catch-up (v14): closed-form, no internal time cap —
   *  OfflineSystem passes effective seconds (already buffer-capped and scaled
   *  by the compute output multiplier). Returns { mat: added } for the away
   *  report; stacks still clamp at 99. */
  applyOfflineTime(seconds) {
    const gains = {};
    if (seconds <= 0 || this._slots.length === 0) return gains;
    for (const [mat, rate] of Object.entries(this.getRates())) {
      if (!(mat in this.inventory.materials)) continue;
      const qty = Math.floor(rate * seconds);
      const space = Math.max(0, 99 - this.inventory.materials[mat]);
      const actual = Math.min(qty, space);
      if (actual > 0) {
        this.inventory.materials[mat] += actual;
        gains[mat] = actual;
      }
    }
    return gains;
  }

  // Returns combined per-second rates across all installed extractors
  getRates() {
    const totals = {};
    for (const slot of this._slots) {
      for (const [mat, rate] of Object.entries(RATES[slot.type])) {
        totals[mat] = (totals[mat] || 0) + rate;
      }
    }
    return totals;
  }

  serialize() {
    return { slots: this._slots.map(s => ({ ...s })) };
  }

  deserialize(data) {
    this._slots = (data?.slots || []).map(s => ({ ...s }));
    this._accum = {};
  }
}

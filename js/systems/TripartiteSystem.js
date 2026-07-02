// TripartiteSystem.js
// Splits a passive investment flow across three legs:
//   capacity — multiplies ppCap (more held PP during a run)
//   power    — adds to ppRate via PPSystem.setModifier (PP/s)
//   rate     — multiplies offload capGain (better permanent cap conversion)
// Sliders set ratios (0–100, sum to 100). Investment is non-consumptive — PP is not drained;
// the flow is a virtual progression unit routed by ratio. presenceMultiplier is set externally
// by zone-change logic and rotates the bonus per-zone (no UI exposure).

import { CONFIG } from '../config.js';

export class TripartiteSystem {
  constructor(ppSystem) {
    this.pp = ppSystem;

    this.ratios   = { capacity: 34, power: 33, rate: 33 };
    this.invested = { capacity: 0,  power: 0,  rate: 0  };
    this.presenceMultiplier = { capacity: 1.0, power: 1.0, rate: 1.0 };

    this._flowRate     = CONFIG.TRIPARTITE_FLOW_RATE         ?? 0.5;
    this._capScale     = CONFIG.TRIPARTITE_CAPACITY_SCALE    ?? 0.04;
    this._powerScale   = CONFIG.TRIPARTITE_POWER_SCALE       ?? 0.05;
    this._rateScale    = CONFIG.TRIPARTITE_RATE_SCALE        ?? 0.06;

    this._rateMult = 1;
    this._applyEffects();
  }

  update(delta) {
    const flow = this._flowRate * delta;
    if (flow <= 0) return;

    const r = this.ratios;
    const total = r.capacity + r.power + r.rate;
    if (total <= 0) return;

    const m = this.presenceMultiplier;
    this.invested.capacity += (flow * r.capacity / total) * m.capacity;
    this.invested.power    += (flow * r.power    / total) * m.power;
    this.invested.rate     += (flow * r.rate     / total) * m.rate;

    this._applyEffects();
  }

  _applyEffects() {
    // Capacity: multiplicative cap modifier on PPSystem (registry-managed)
    const capMult = 1 + Math.log1p(this.invested.capacity) * this._capScale;
    this.pp.setCapMultiplier('tripartite_capacity', capMult);

    // Power: additive PP/s, routed through existing rate-modifier registry
    const powerBonus = Math.log1p(this.invested.power) * this._powerScale;
    this.pp.setModifier('tripartite_power', powerBonus);

    // Rate: stored, read by PPSystem.offload(rateMult)
    this._rateMult = 1 + Math.log1p(this.invested.rate) * this._rateScale;
  }

  get currentRateMultiplier() { return this._rateMult; }

  _normalizeLeg(leg) {
    if (leg === 'throughput') return 'power';
    if (leg === 'yield') return 'rate';
    return leg;
  }

  _normalizeBag(bag) {
    const normalized = {};
    for (const [key, value] of Object.entries(bag)) {
      normalized[this._normalizeLeg(key)] = value;
    }
    return normalized;
  }

  setRatio(leg, value) {
    leg = this._normalizeLeg(leg);
    if (!Object.hasOwn(this.ratios, leg)) return;

    value = Math.max(0, Math.min(100, Math.round(value)));
    const others = Object.keys(this.ratios).filter(k => k !== leg);
    const remaining = 100 - value;
    const currentOtherTotal = others.reduce((s, k) => s + this.ratios[k], 0);

    this.ratios[leg] = value;

    if (currentOtherTotal === 0) {
      const each = Math.floor(remaining / others.length);
      others.forEach(k => { this.ratios[k] = each; });
    } else {
      others.forEach(k => {
        this.ratios[k] = Math.round((this.ratios[k] / currentOtherTotal) * remaining);
      });
    }

    const drift = 100 - Object.values(this.ratios).reduce((s, v) => s + v, 0);
    this.ratios[others[0]] += drift;
  }

  serialize() {
    return {
      ratios:   { ...this.ratios },
      invested: { ...this.invested },
    };
  }

  deserialize(data) {
    if (!data) return;
    if (data.ratios)   this.ratios   = { ...this.ratios,   ...this._normalizeBag(data.ratios) };
    if (data.invested) this.invested = { ...this.invested, ...this._normalizeBag(data.invested) };
    this._applyEffects();
  }
}

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
    this._curveExp     = CONFIG.TRIPARTITE_CURVE_EXP         ?? 0.35;
    this._capScale     = CONFIG.TRIPARTITE_CAPACITY_SCALE    ?? 0.027;
    this._powerScale   = CONFIG.TRIPARTITE_POWER_SCALE       ?? 0.034;
    this._rateScale    = CONFIG.TRIPARTITE_RATE_SCALE        ?? 0.041;
    this._momentumPerHour = CONFIG.TRIPARTITE_MOMENTUM_PER_HOUR ?? 0.5;
    this._momentumMax     = CONFIG.TRIPARTITE_MOMENTUM_MAX      ?? 4;

    // Not serialized — momentum rewards *maintaining* a session, so it resets
    // on every boot and never accrues offline.
    this._sessionSeconds = 0;

    this._rateMult = 1;
    this._applyEffects();
  }

  /** Live-session flow multiplier: ramps the longer this session runs. */
  get sessionMomentum() {
    const hours = this._sessionSeconds / 3600;
    return Math.min(this._momentumMax, 1 + hours * this._momentumPerHour);
  }

  update(delta) {
    const momentum = this.sessionMomentum; // pre-delta, so a single tick is exact
    this._sessionSeconds += delta;
    this._invest(this._flowRate * delta * momentum);
  }

  /**
   * Investment continues while the player is away (the sliders are the
   * "set it before you log off" dial). Called from OfflineSystem with the
   * shared 50% offline efficiency; presence multipliers are whatever is
   * current at boot (neutral 1.0 — offline apply runs before zone init).
   * Returns { invested } (total units added) or null when nothing accrued.
   */
  simulateOffline(seconds, efficiency = 0.5) {
    const units = this._flowRate * seconds * efficiency;
    if (units <= 0) return null;
    this._invest(units);
    return { invested: units };
  }

  _invest(flow) {
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

  // Power curve invested^exp * scale — grows ~2.2x per 10x invested (no
  // flatline), unlike the old log1p curve which stalled within a day.
  _bonusTerm(invested, scale) {
    return Math.pow(Math.max(0, invested), this._curveExp) * scale;
  }

  _applyEffects() {
    // Capacity: multiplicative cap modifier on PPSystem (registry-managed)
    const capMult = 1 + this._bonusTerm(this.invested.capacity, this._capScale);
    this.pp.setCapMultiplier('tripartite_capacity', capMult);

    // Power: additive PP/s, routed through existing rate-modifier registry
    const powerBonus = this._bonusTerm(this.invested.power, this._powerScale);
    this.pp.setModifier('tripartite_power', powerBonus);

    // Rate: stored, read by PPSystem.offload(rateMult)
    this._rateMult = 1 + this._bonusTerm(this.invested.rate, this._rateScale);
  }

  get currentRateMultiplier() { return this._rateMult; }

  // Public readouts for the HUD — single source of truth for the curve
  // (the allocation panel must never mirror these formulas itself).
  get capacityMultiplier() { return 1 + this._bonusTerm(this.invested.capacity, this._capScale); }
  get powerBonus()         { return this._bonusTerm(this.invested.power, this._powerScale); }

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

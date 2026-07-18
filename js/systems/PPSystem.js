import { CONFIG } from '../config.js';

export class PPSystem {
  constructor() {
    this.ppTotal = 0;
    this._baseCap = CONFIG.INITIAL_PP_CAP;     // raw cap, before multipliers
    this._capMultipliers = {};                 // keyed multipliers (e.g., tripartite_capacity)
    this.ppCap = this._baseCap;                // public, recomputed on changes
    this.ppRate = CONFIG.INITIAL_PP_RATE;
    this._accumulator = 0;
    this.prestigeCount = 0;
    this._rateModifiers = {};
    this.globalMultiplier = 1; // set by AscensionSystem
  }

  /**
   * Offload: sacrifice current PP for a permanent cap increase.
   * capGain = floor(sqrt(pp) * OFFLOAD_CAP_MULTIPLIER * rateMult * fill)
   * where fill = pp / ppCap. The fill factor makes splitting an offload
   * strictly worse than waiting (spam at tiny amounts rounds to 0 gain),
   * so offloading at full cap is always the optimal play.
   * Returns null (and takes nothing) when the gain would round to 0.
   */
  offload(rateMult = 1) {
    const taken = Math.floor(this.ppTotal);
    const capGain = this.previewOffloadGain(rateMult);
    if (taken < 1 || capGain < 1) return null;
    this._baseCap += capGain;
    this._recomputeCap();
    this.ppTotal = 0;
    this.prestigeCount++;
    return { taken, capGain, newCap: this.ppCap, rateMult: rateMult || 1 };
  }

  /** Cap gain the current PP total would yield — shared by the interact hint. */
  previewOffloadGain(rateMult = 1) {
    const taken = Math.floor(this.ppTotal);
    if (taken < 1) return 0;
    const fill = this.ppCap > 0 ? Math.min(1, taken / this.ppCap) : 1;
    return Math.floor(Math.sqrt(taken) * CONFIG.OFFLOAD_CAP_MULTIPLIER * (rateMult || 1) * fill);
  }

  /** Set the raw cap directly (used by AscensionSystem reset, SaveSystem load). */
  setBaseCap(value) {
    this._baseCap = value;
    this._recomputeCap();
  }

  /** Add/remove a named multiplicative cap modifier. */
  setCapMultiplier(key, mult) {
    if (!isFinite(mult) || mult <= 0) mult = 1;
    this._capMultipliers[key] = mult;
    this._recomputeCap();
  }

  removeCapMultiplier(key) {
    if (key in this._capMultipliers) {
      delete this._capMultipliers[key];
      this._recomputeCap();
    }
  }

  _recomputeCap() {
    let m = 1;
    for (const v of Object.values(this._capMultipliers)) m *= v;
    this.ppCap = this._baseCap * m;
  }

  update(delta) {
    const effectiveRate = this.ppRate * (this.globalMultiplier || 1);
    this._accumulator += effectiveRate * delta;
    if (this._accumulator >= 1) {
      const gained = Math.floor(this._accumulator);
      this.ppTotal = Math.min(this.ppCap, this.ppTotal + gained);
      this._accumulator -= gained;
    }
  }

  /** Effective PP/s including ascension/global multiplier — for HUD display. */
  get effectiveRate() {
    return this.ppRate * (this.globalMultiplier || 1);
  }

  addStepPP(steps) {
    this.ppTotal = Math.min(this.ppCap, this.ppTotal + steps * CONFIG.PP_PER_STEP);
  }

  /**
   * Attempt to spend `cost` PP. Returns true on success.
   */
  spend(cost) {
    if (this.ppTotal < cost) return false;
    this.ppTotal -= cost;
    return true;
  }

  /**
   * Add/remove a named rate modifier (delta PP/s).
   */
  setModifier(key, value) {
    const old = this._rateModifiers[key] || 0;
    this._rateModifiers[key] = value;
    this.ppRate += (value - old);
    if (this.ppRate < 0) this.ppRate = 0;
  }

  removeModifier(key) {
    if (key in this._rateModifiers) {
      this.ppRate -= this._rateModifiers[key];
      delete this._rateModifiers[key];
      if (this.ppRate < 0) this.ppRate = 0;
    }
  }

  /**
   * Temporarily boost PP rate by `rate` PP/s for `duration` seconds.
   */
  addTemporaryBoost(rate, duration) {
    const key = `_tempBoost_${Date.now()}`;
    this.setModifier(key, rate);
    setTimeout(() => this.removeModifier(key), duration * 1000);
  }

  get displayTotal() {
    return Math.floor(this.ppTotal);
  }
}

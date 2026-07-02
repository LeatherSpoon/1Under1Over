// ── Time Warp System ────────────────────────────────────────────────────────
// Premium currency: Quantum Crystals. Earned rarely (achievement, ascension,
// first-time material discovery). Spent on instant time-warp boosts that grant
// PP equivalent to N seconds of current rate, plus a temporary rate multiplier.
//
// Hand-off §2: Premium Currency for "Time-Warps" or permanent multipliers.

const WARP_OPTIONS = [
  { id: 'short',  cost: 1, seconds: 600,    multiplier: 2.0, duration: 60,  label: '10-min Warp' },
  { id: 'medium', cost: 3, seconds: 3600,   multiplier: 3.0, duration: 120, label: '1-hour Warp' },
  { id: 'long',   cost: 8, seconds: 21600,  multiplier: 4.0, duration: 180, label: '6-hour Warp' },
];

export class TimeWarpSystem {
  constructor(ppSystem) {
    this.pp = ppSystem;
    this.crystals = 0;
    this.warpsUsed = 0;
    this._activeBoostKey = null;
    this._activeBoostUntil = 0;
  }

  get options() { return WARP_OPTIONS; }
  get activeBoostRemaining() {
    return this._activeBoostUntil > 0 ? Math.max(0, (this._activeBoostUntil - Date.now()) / 1000) : 0;
  }

  award(amount, reason = '') {
    this.crystals += amount;
    return { crystals: this.crystals, reason };
  }

  use(optionId) {
    const opt = WARP_OPTIONS.find(o => o.id === optionId);
    if (!opt) return null;
    if (this.crystals < opt.cost) return null;

    this.crystals -= opt.cost;
    this.warpsUsed++;

    const grantedPP = Math.floor(this.pp.ppRate * opt.seconds);
    this.pp.ppTotal += grantedPP;

    // Stop any prior boost; install new one
    if (this._activeBoostKey) this.pp.removeModifier(this._activeBoostKey);
    const boostRate = this.pp.ppRate * (opt.multiplier - 1);
    const key = `_warpBoost_${Date.now()}`;
    this._activeBoostKey = key;
    this._activeBoostUntil = Date.now() + opt.duration * 1000;
    this.pp.setModifier(key, boostRate);
    setTimeout(() => {
      if (this._activeBoostKey === key) {
        this.pp.removeModifier(key);
        this._activeBoostKey = null;
        this._activeBoostUntil = 0;
      }
    }, opt.duration * 1000);

    return { grantedPP, boostMultiplier: opt.multiplier, boostSeconds: opt.duration };
  }

  serialize() {
    return { crystals: this.crystals, warpsUsed: this.warpsUsed };
  }

  load(data) {
    if (!data) return;
    this.crystals = data.crystals || 0;
    this.warpsUsed = data.warpsUsed || 0;
  }
}

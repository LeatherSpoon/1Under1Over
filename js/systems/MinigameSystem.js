// ── Minigame System ─────────────────────────────────────────────────────────
// Timing-click minigame: hit the sweet spot on a bouncing bar for PP multiplier.

export class MinigameSystem {
  constructor(ppSystem) {
    this.pp = ppSystem;
    this.active = false;
    this.cooldownRemaining = 0;
    this.cooldownDuration = 60;

    this._cursor = 0;
    this._direction = 1;
    this._speed = 1.2;
    this._plays = 0;
    this._result = null;

    this.onStateChange = null;
  }

  canPlay() {
    return !this.active && this.cooldownRemaining <= 0;
  }

  start() {
    if (!this.canPlay()) return false;
    this.active = true;
    this._cursor = 0;
    this._direction = 1;
    this._speed = 1.2 + this._plays * 0.08;
    this._result = null;
    if (this.onStateChange) this.onStateChange();
    return true;
  }

  update(delta) {
    if (this.cooldownRemaining > 0) {
      this.cooldownRemaining = Math.max(0, this.cooldownRemaining - delta);
    }

    if (!this.active) return;

    this._cursor += this._direction * this._speed * delta;
    if (this._cursor >= 1) { this._cursor = 1; this._direction = -1; }
    if (this._cursor <= 0) { this._cursor = 0; this._direction = 1; }

    if (this.onStateChange) this.onStateChange();
  }

  /**
   * Player hits the button — evaluate cursor position.
   * PERFECT 0.45-0.55 = 3x | GOOD 0.30-0.70 = 2x | OK 0.15-0.85 = 1.5x | MISS = 1x
   */
  hit() {
    if (!this.active) return null;
    this.active = false;
    this._plays++;

    const pos = this._cursor;
    let zone, multiplier;

    if (pos >= 0.45 && pos <= 0.55) {
      zone = 'PERFECT'; multiplier = 3.0;
    } else if (pos >= 0.30 && pos <= 0.70) {
      zone = 'GOOD'; multiplier = 2.0;
    } else if (pos >= 0.15 && pos <= 0.85) {
      zone = 'OK'; multiplier = 1.5;
    } else {
      zone = 'MISS'; multiplier = 1.0;
    }

    const basePP = Math.max(10, Math.floor(this.pp.ppRate * 10));
    const ppAwarded = Math.floor(basePP * multiplier);
    this.pp.ppTotal += ppAwarded;

    if (multiplier >= 2.0) {
      const boostRate = this.pp.ppRate * (multiplier - 1) * 0.25;
      this.pp.addTemporaryBoost(boostRate, 30);
    }

    this._result = { zone, multiplier, ppAwarded, cursorPos: pos };
    this.cooldownRemaining = this.cooldownDuration;

    if (this.onStateChange) this.onStateChange();
    return this._result;
  }

  get lastResult() { return this._result; }
  get cursor() { return this._cursor; }
  get plays() { return this._plays; }

  serialize() {
    return { cooldownRemaining: this.cooldownRemaining, plays: this._plays };
  }

  deserialize(data) {
    if (!data) return;
    this.cooldownRemaining = data.cooldownRemaining || 0;
    this._plays = data.plays || 0;
  }
}

// ── Expedition System (Idle Adventure) ──────────────────────────────────────
// NGU-style idle combat: dispatch your Remote Combat Frame into a hostile
// sector. While an expedition runs, enemies are engaged continuously — kills
// accumulate PP and material drops even while you play elsewhere, and at 50%
// efficiency while offline (via OfflineSystem).
//
// Combat model is deterministic: kills/sec = player DPS / enemy HP. A tier is
// too dangerous (no progress) unless the player's effective survivability
// beats the tier's threat. Clearing KILLS_TO_CLEAR kills defeats the sector
// warden and unlocks the next tier.

const KILLS_TO_CLEAR = 50;

const TIERS = [
  {
    id: 0, label: 'Scrapyard Fringe', enemy: 'Feral Scrappers',
    enemyHP: 30, threat: 10, ppPerKill: 6,
    drops: [{ mat: 'circuitWire', chance: 0.35 }, { mat: 'ironSpike', chance: 0.20 }],
  },
  {
    id: 1, label: 'Rustflat Barrens', enemy: 'Oxidized Hulks',
    enemyHP: 100, threat: 30, ppPerKill: 18,
    drops: [{ mat: 'copper', chance: 0.40 }, { mat: 'stone', chance: 0.30 }, { mat: 'powerCore', chance: 0.08 }],
  },
  {
    id: 2, label: 'Fungal Hollow', enemy: 'Spore Stalkers',
    enemyHP: 300, threat: 70, ppPerKill: 45,
    drops: [{ mat: 'fiber', chance: 0.40 }, { mat: 'resin', chance: 0.25 }, { mat: 'timber', chance: 0.30 }],
  },
  {
    id: 3, label: 'Drowned Shelf', enemy: 'Tidal Revenants',
    enemyHP: 900, threat: 150, ppPerKill: 120,
    drops: [{ mat: 'silica', chance: 0.35 }, { mat: 'quartz', chance: 0.20 }, { mat: 'logicChip', chance: 0.10 }],
  },
  {
    id: 4, label: 'Glacier Verge', enemy: 'Cryo Sentinels',
    enemyHP: 2500, threat: 300, ppPerKill: 320,
    drops: [{ mat: 'iron', chance: 0.35 }, { mat: 'silver', chance: 0.20 }, { mat: 'titanium', chance: 0.08 }],
  },
  {
    id: 5, label: 'Breach Perimeter', enemy: 'Gate Wraiths',
    enemyHP: 7000, threat: 600, ppPerKill: 850,
    drops: [{ mat: 'carbon', chance: 0.30 }, { mat: 'burstCapacitor', chance: 0.20 }, { mat: 'tungsten', chance: 0.12 }],
  },
  {
    id: 6, label: 'The Static Wastes', enemy: 'Unmade Echoes',
    enemyHP: 20000, threat: 1200, ppPerKill: 2200,
    drops: [{ mat: 'magnet', chance: 0.20 }, { mat: 'armorPlate', chance: 0.15 }, { mat: 'gold', chance: 0.10 }],
  },
];

export class ExpeditionSystem {
  constructor(ppSystem, statsSystem, inventorySystem) {
    this.pp = ppSystem;
    this.stats = statsSystem;
    this.inventory = inventorySystem;

    this.active = false;
    this.tier = 0;             // currently selected tier
    this.highestCleared = -1;  // highest tier whose warden fell (unlocks tier+1)
    this.kills = {};           // tierId -> kills this ascension era (never reset for now)
    this.totalKills = 0;
    this.totalPP = 0;

    // External damage multiplier (modifiers × boss trophies × challenges),
    // kept in sync by main.js alongside CombatSystem.
    this.damageMult = 1;

    this._killProgress = 0;    // fractional kills carried between frames
    this._log = [];            // rolling event log for the panel (newest first)

    this.onEvent = null;       // fn() — panel refresh hook
    this.onKills = null;       // fn(count) — challenge tracking hook
  }

  static get TIERS() { return TIERS; }
  static get KILLS_TO_CLEAR() { return KILLS_TO_CLEAR; }

  tierUnlocked(tierId) { return tierId <= this.highestCleared + 1; }
  tierCleared(tierId)  { return tierId <= this.highestCleared; }
  killsIn(tierId)      { return this.kills[tierId] || 0; }

  /** Continuous player DPS estimate — auto-frame swings every 0.8s. */
  get playerDPS() {
    return (this.stats.damage * this.damageMult) / 0.8;
  }

  /** Survivability score vs tier threat: HP pool + defense mitigation. */
  get playerSurvival() {
    return this.stats.maxHP + this.stats.defense * 10;
  }

  /** True if the selected tier deals more threat than the frame can absorb. */
  tierTooDangerous(tierId) {
    const t = TIERS[tierId];
    return !t || this.playerSurvival < t.threat * 5;
  }

  /** Kills per second in a tier; 0 when stalled. */
  killRate(tierId) {
    const t = TIERS[tierId];
    if (!t || this.tierTooDangerous(tierId)) return 0;
    return this.playerDPS / t.enemyHP;
  }

  setTier(tierId) {
    if (!this.tierUnlocked(tierId)) return false;
    this.tier = tierId;
    this._killProgress = 0;
    if (this.onEvent) this.onEvent();
    return true;
  }

  start() {
    if (this.tierTooDangerous(this.tier)) return false;
    this.active = true;
    this._pushLog(`Frame dispatched to ${TIERS[this.tier].label}.`);
    if (this.onEvent) this.onEvent();
    return true;
  }

  stop() {
    this.active = false;
    this._killProgress = 0;
    this._pushLog('Frame recalled.');
    if (this.onEvent) this.onEvent();
  }

  update(delta) {
    if (!this.active) return;
    const rate = this.killRate(this.tier);
    if (rate <= 0) return; // stalled — player got weaker (modifier toggled etc.)
    this._killProgress += rate * delta;
    const whole = Math.floor(this._killProgress);
    if (whole >= 1) {
      this._killProgress -= whole;
      this._awardKills(this.tier, whole, 1);
    }
  }

  /**
   * Offline expedition progress at `efficiency` (0..1).
   * Returns { kills, pp, materials } or null when idle/stalled.
   */
  simulateOffline(seconds, efficiency = 0.5) {
    if (!this.active) return null;
    const rate = this.killRate(this.tier);
    if (rate <= 0) return null;
    const kills = Math.floor(rate * seconds * efficiency);
    if (kills < 1) return null;
    return this._awardKills(this.tier, kills, efficiency, true);
  }

  _awardKills(tierId, count, efficiency, collectSummary = false) {
    const t = TIERS[tierId];
    const summary = { kills: count, pp: 0, materials: {} };

    this.kills[tierId] = (this.kills[tierId] || 0) + count;
    this.totalKills += count;
    if (this.onKills) this.onKills(count);

    const pp = Math.floor(t.ppPerKill * count * efficiency);
    this.pp.ppTotal = Math.min(this.pp.ppCap, this.pp.ppTotal + pp);
    this.totalPP += pp;
    summary.pp = pp;

    // Drops: exact rolls for small batches, expectation for offline hauls
    for (const d of t.drops) {
      let qty = 0;
      if (count <= 20) {
        for (let i = 0; i < count; i++) if (Math.random() < d.chance) qty++;
      } else {
        qty = Math.round(count * d.chance);
      }
      if (qty > 0) {
        this.inventory.addMaterial(d.mat, qty);
        summary.materials[d.mat] = qty;
      }
    }

    if (!collectSummary) {
      this._pushLog(`${count > 1 ? count + '× ' : ''}${t.enemy} destroyed — +${pp} PP`);
    }

    // Sector warden falls at the kill threshold — unlock the next tier
    if (this.killsIn(tierId) >= KILLS_TO_CLEAR && this.highestCleared < tierId) {
      this.highestCleared = tierId;
      const wardenPP = t.ppPerKill * 10;
      this.pp.ppTotal = Math.min(this.pp.ppCap, this.pp.ppTotal + wardenPP);
      this.totalPP += wardenPP;
      this._pushLog(`⚑ SECTOR WARDEN DOWN — ${t.label} cleared! +${wardenPP} PP`);
      if (TIERS[tierId + 1]) this._pushLog(`New sector unlocked: ${TIERS[tierId + 1].label}`);
      summary.wardenPP = wardenPP;
    }

    if (this.onEvent) this.onEvent();
    return summary;
  }

  _pushLog(msg) {
    this._log.unshift({ t: Date.now(), msg });
    if (this._log.length > 12) this._log.pop();
  }

  get log() { return this._log; }

  serialize() {
    return {
      active: this.active,
      tier: this.tier,
      highestCleared: this.highestCleared,
      kills: { ...this.kills },
      totalKills: this.totalKills,
      totalPP: this.totalPP,
    };
  }

  deserialize(data) {
    if (!data) return;
    this.active = !!data.active;
    this.tier = data.tier || 0;
    this.highestCleared = data.highestCleared ?? -1;
    this.kills = { ...(data.kills || {}) };
    this.totalKills = data.totalKills || 0;
    this.totalPP = data.totalPP || 0;
  }
}

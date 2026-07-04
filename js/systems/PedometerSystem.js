import { CONFIG } from '../config.js';

export class PedometerSystem {
  constructor(ppSystem) {
    this.ppSystem = ppSystem;
    this.totalSteps = 0;
    this._ppBonusPerStep = CONFIG.PP_PER_STEP;
    this._ppBonusPurchases = 0;
    this._nextBonusCost = CONFIG.PEDOMETER_PP_BONUS_BASE_COST;

    // Speed tracks (stackable, each adds TRACK_SPEED_BONUS to move speed)
    this._trackCount = 20;                           // first 20 are free and granted immediately
    this._nextTrackCost = CONFIG.PEDOMETER_TRACK_BASE_COST;
    this._pendingTracks = 20;                        // all 20 start in the pending pool
    this._placedTracks = [];  // { zone, x, z }
    this.infiniteTracks = false;

    // Stat purchases via steps
    this._statStepPurchases = {};  // statName -> count
    this._nextStatCost = CONFIG.PEDOMETER_STAT_BASE_COST;
    this._totalStatPurchases = 0;

    // Environment unlocks via steps
    this._unlockedZones = new Set();
  }

  update(newSteps) {
    if (newSteps <= 0) return;
    this.totalSteps += newSteps;
    this.ppSystem.addStepPP(newSteps);
  }

  // ── PP Bonus ───────────────────────────────────────────────────────────────
  canBuyPPBonus() {
    return this.totalSteps >= this._nextBonusCost;
  }

  buyPPBonus() {
    if (!this.canBuyPPBonus()) return false;
    this.totalSteps -= this._nextBonusCost;
    this._ppBonusPurchases++;
    this._ppBonusPerStep += CONFIG.PEDOMETER_PP_BONUS_AMOUNT;
    const n = this._ppBonusPurchases; // already incremented
    this._nextBonusCost = Math.ceil(
      CONFIG.PEDOMETER_PP_BONUS_BASE_COST * n *
      Math.pow(CONFIG.STAT_UPGRADE_COST_SCALE, n - 1)
    );
    return true;
  }

  get nextBonusCost() { return this._nextBonusCost; }
  get ppBonusPerStep() { return this._ppBonusPerStep; }

  // ── Speed Tracks ───────────────────────────────────────────────────────────
  get trackCount() { return this._trackCount; }
  get nextTrackCost() { return this._nextTrackCost; }
  get pendingTracks() { return this._pendingTracks; }
  // Speed bonus from tracks placed near the player (checked per-frame in main.js)
  get trackSpeedBonus() { return this._placedTracks.length * CONFIG.PEDOMETER_TRACK_SPEED_BONUS; }

  canBuyTrack() {
    return this.totalSteps >= this._nextTrackCost;
  }

  buyTrack() {
    if (!this.canBuyTrack()) return false;
    this.totalSteps -= this._nextTrackCost;
    this._trackCount++;
    this._pendingTracks++;
    return true;
  }

  placeTrack(zone, x, z, statsSystem) {
    if (!this.infiniteTracks && this._pendingTracks <= 0) return false;
    if (!this.infiniteTracks) this._pendingTracks--;
    this._placedTracks.push({ zone, x, z });
    statsSystem.setTrackBonus(this.trackSpeedBonus);
    return true;
  }

  getPlacedTracksForZone(zone) {
    return this._placedTracks.filter(t => t.zone === zone);
  }

  removeTrack(zone, x, z) {
    const idx = this._placedTracks.findIndex(
      t => t.zone === zone && Math.hypot(t.x - x, t.z - z) < 0.5
    );
    if (idx === -1) return false;
    this._placedTracks.splice(idx, 1);
    this._pendingTracks++; // return to pending; _trackCount unchanged (track still owned)
    return true;
  }

  // ── Stat Level via Steps ───────────────────────────────────────────────────
  get nextStatCost() { return this._nextStatCost; }
  get totalStatPurchases() { return this._totalStatPurchases; }

  canBuyStatLevel() {
    return this.totalSteps >= this._nextStatCost;
  }

  buyStatLevel(statName, statsSystem) {
    if (!this.canBuyStatLevel()) return false;
    this.totalSteps -= this._nextStatCost;
    this._statStepPurchases[statName] = (this._statStepPurchases[statName] || 0) + 1;
    this._totalStatPurchases++;
    const n = this._totalStatPurchases; // already incremented above
    this._nextStatCost = Math.ceil(
      CONFIG.PEDOMETER_STAT_BASE_COST * n *
      Math.pow(CONFIG.STAT_UPGRADE_COST_SCALE, n - 1)
    );
    statsSystem.stats[statName].level++;
    // Re-clamp HP if health upgraded
    if (statName === 'health') {
      statsSystem.currentHP = Math.min(statsSystem.currentHP, statsSystem.maxHP);
    }
    return true;
  }

  // ── Environment Unlock via Steps ───────────────────────────────────────────
  isZoneUnlocked(zoneName) {
    return this._unlockedZones.has(zoneName);
  }

  canUnlockZone(zoneName) {
    const cost = CONFIG.PEDOMETER_ENV_UNLOCK[zoneName];
    if (!cost) return false;
    if (this._unlockedZones.has(zoneName)) return false;
    return this.totalSteps >= cost;
  }

  unlockZone(zoneName) {
    const cost = CONFIG.PEDOMETER_ENV_UNLOCK[zoneName];
    if (!cost || this._unlockedZones.has(zoneName)) return false;
    if (this.totalSteps < cost) return false;
    this.totalSteps -= cost;
    this._unlockedZones.add(zoneName);
    return true;
  }

  getEnvUnlockOptions() {
    return Object.entries(CONFIG.PEDOMETER_ENV_UNLOCK).map(([zone, cost]) => ({
      zone,
      cost,
      unlocked: this._unlockedZones.has(zone),
    }));
  }
}

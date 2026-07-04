// ── Offline Progress System ─────────────────────────────────────────────────
// Calculates and awards progress for time spent away from the game.
// Covers: PP generation, drone gathering, and a "welcome back" summary.

export class OfflineSystem {
  constructor(ppSystem, droneSystem, inventorySystem) {
    this.pp = ppSystem;
    this.drones = droneSystem;
    this.inventory = inventorySystem;
    this._storageKey = 'pp_last_active';
    this._nextStamp = 0;
    this._returnContext = null; // optional: { stats, ascension, timeWarp, expedition, implant }
  }

  setReturnContext(ctx) { this._returnContext = ctx; }

  /** Call on game boot — stamps current time. */
  stamp() {
    try { localStorage.setItem(this._storageKey, Date.now().toString()); } catch (_) {}
  }

  /** Call every frame to keep the timestamp fresh. */
  tick() {
    if (Date.now() > this._nextStamp) {
      this.stamp();
      this._nextStamp = Date.now() + 10000;
    }
  }

  /**
   * Calculate offline gains since last session.
   * Returns null if < 30 seconds away, otherwise { seconds, ppGained, materialsGained }.
   * Cap at 24 hours.
   */
  calculate() {
    let lastActive;
    try { lastActive = parseInt(localStorage.getItem(this._storageKey)); } catch (_) {}
    if (!lastActive || isNaN(lastActive)) return null;

    const elapsed = (Date.now() - lastActive) / 1000;
    if (elapsed < 30) return null;

    const seconds = Math.min(elapsed, 86400);

    // PP gained (50% efficiency offline)
    const ppGained = Math.floor(this.pp.ppRate * seconds * 0.5);

    // Drone gathering
    const materialsGained = {};
    for (const drone of this.drones.drones) {
      if (!drone.assignedMaterial) continue;
      const baseTime = 30 / drone.efficiency;
      const cycles = Math.floor(seconds / baseTime);
      if (cycles > 0) {
        materialsGained[drone.assignedMaterial] = (materialsGained[drone.assignedMaterial] || 0) + cycles;
      }
    }

    return { seconds, ppGained, materialsGained };
  }

  /**
   * Apply offline gains and return a summary for display.
   */
  applyAndSummarize() {
    const result = this.calculate();
    if (!result) return null;

    this.pp.ppTotal = Math.min(this.pp.ppCap, this.pp.ppTotal + result.ppGained);

    for (const [mat, qty] of Object.entries(result.materialsGained)) {
      this.inventory.addMaterial(mat, qty);
    }

    const hours = Math.floor(result.seconds / 3600);
    const mins = Math.floor((result.seconds % 3600) / 60);
    let timeStr = '';
    if (hours > 0) timeStr += `${hours}h `;
    timeStr += `${mins}m`;

    // Return-reward highlights — flag thresholds the player just crossed.
    const highlights = [];
    const ctx = this._returnContext;
    if (ctx) {
      const { stats, ascension, timeWarp, expedition, implant } = ctx;

      // Expedition keeps fighting offline at 50% efficiency
      if (expedition) {
        const ex = expedition.simulateOffline(result.seconds, 0.5);
        if (ex) {
          highlights.push(`✦ Expedition: ${ex.kills} kills, +${ex.pp} PP${ex.wardenPP ? ' — SECTOR CLEARED!' : ''}`);
          for (const [mat, qty] of Object.entries(ex.materials)) {
            result.materialsGained[mat] = (result.materialsGained[mat] || 0) + qty;
          }
        }
      }

      // Neural implant trains offline at 50% efficiency
      if (implant) {
        const levels = implant.simulateOffline(result.seconds, 0.5);
        if (levels > 0) {
          highlights.push(`✦ Neural Implant: +${levels} ${implant.target} level${levels > 1 ? 's' : ''}`);
        }
      }
      if (stats) {
        // Cheapest stat upgrade now affordable that wasn't before
        const ppNow = this.pp.ppTotal;
        let cheapest = null;
        for (const name of stats.statNames) {
          const cost = stats.upgradeCost(name);
          if (cost <= ppNow && (!cheapest || cost < cheapest.cost)) {
            cheapest = { name: stats.getStatLabel(name), cost };
          }
        }
        if (cheapest) highlights.push(`✦ ${cheapest.name} upgrade affordable (${cheapest.cost} PP)`);
      }
      if (ascension && ascension.canAscend()) {
        highlights.push('✦ Ascension threshold reached');
      }
      // Award a Quantum Crystal for sessions over 4 hours away (return reward).
      if (timeWarp && result.seconds >= 14400) {
        timeWarp.award(1, 'long-session');
        highlights.push('✦ +1 Quantum Crystal (long-session bonus)');
      }
    }

    // Built after the ctx block so expedition hauls are included
    const matLines = Object.entries(result.materialsGained)
      .map(([m, q]) => `+${q} ${m}`)
      .join(', ');

    return {
      timeAway: timeStr,
      ppGained: result.ppGained,
      materialsGained: result.materialsGained,
      matSummary: matLines || 'none',
      highlights,
    };
  }
}

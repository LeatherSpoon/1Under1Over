// ── Offline Progress System ─────────────────────────────────────────────────
// Calculates and awards progress for time spent away from the game.
// v14 stocked model: once the Compute board is unlocked, a destination runs
// offline at FULL rate iff ≥1 compute unit is assigned ("only what you
// stocked runs") — otherwise it reports DORMANT. The old flat 50% haircut is
// gone. Before the board unlocks, everything behaves as pre-v14 (ungated).

export class OfflineSystem {
  constructor(ppSystem, droneSystem, inventorySystem) {
    this.pp = ppSystem;
    this.drones = droneSystem;
    this.inventory = inventorySystem;
    this._storageKey = 'pp_last_active';
    this._nextStamp = 0;
    this._returnContext = null; // optional: { stats, ascension, timeWarp, expedition, implant, tripartite, trainingAreas, extractors, compute, factory, processing }
  }

  setReturnContext(ctx) { this._returnContext = ctx; }

  /** Call on game boot — stamps current time. */
  stamp() {
    try { localStorage.setItem(this._storageKey, Date.now().toString()); } catch (_) {}
  }

  /** Rewind the last-active stamp (e.g. to a restored cloud snapshot's
   *  timestamp) so offline gains can be recomputed for the restored state. */
  rewindTo(timestamp) {
    if (!timestamp) return;
    try { localStorage.setItem(this._storageKey, String(timestamp)); } catch (_) {}
  }

  /** Call every frame to keep the timestamp fresh. */
  tick() {
    if (Date.now() > this._nextStamp) {
      this.stamp();
      this._nextStamp = Date.now() + 10000;
    }
  }

  /**
   * Calculate baseline offline gains since last session.
   * Returns null if < 30 seconds away, otherwise { seconds, ppGained, materialsGained }.
   * Buffer: base 12 h, +12 h per Archive-shop Offline Buffer level (no 24 h flat cap).
   * Stocked systems (drones, extractors, ladder, holodeck) are resolved in
   * applyAndSummarize where the compute gate lives.
   */
  calculate() {
    let lastActive;
    try { lastActive = parseInt(localStorage.getItem(this._storageKey)); } catch (_) {}
    if (!lastActive || isNaN(lastActive)) return null;

    const elapsed = (Date.now() - lastActive) / 1000;
    if (elapsed < 30) return null;

    const capSeconds = this._returnContext?.ascension?.offlineCapSeconds ?? 12 * 3600;
    const seconds = Math.min(elapsed, capSeconds);

    // Core PP feed — full rate (the flat 50% offline haircut is gone in v14)
    const ppGained = Math.floor(this.pp.ppRate * seconds);

    return { seconds, ppGained, materialsGained: {} };
  }

  /**
   * Apply offline gains and return a summary for display.
   * `rows` lists each compute destination: what RAN (with gains) and what sat
   * DORMANT (with the reason) — the away report teaches the pre-logout puzzle.
   */
  applyAndSummarize() {
    const result = this.calculate();
    if (!result) return null;

    // Apply the core PP feed, capturing the cap spill for Overflow Routing.
    const ppBefore = this.pp.ppTotal;
    this.pp.ppTotal = Math.min(this.pp.ppCap, ppBefore + result.ppGained);
    const ppSpill = Math.max(0, ppBefore + result.ppGained - this.pp.ppTotal);

    const hours = Math.floor(result.seconds / 3600);
    const mins = Math.floor((result.seconds % 3600) / 60);
    let timeStr = '';
    if (hours > 0) timeStr += `${hours}h `;
    timeStr += `${mins}m`;

    const rows = [];       // [{ label, ran, detail }] — compute destinations
    const highlights = []; // return-reward lines (thresholds crossed etc.)
    const ctx = this._returnContext;
    const boardActive = !!ctx?.compute?.unlocked;
    const gate = (key) => (ctx?.compute ? ctx.compute.gateMult(key) : 1);
    const DORMANT = 'DORMANT — no compute assigned';

    // Drone routes (stocked destination)
    const assignedDrones = this.drones.drones.filter(d => d.assignedMaterial);
    if (assignedDrones.length > 0) {
      const mult = gate('drones');
      if (mult <= 0) {
        rows.push({ label: 'DRONE ROUTES', ran: false, detail: DORMANT });
      } else {
        const droneAmp = ctx?.ascension?.droneMultiplier ?? 1;
        const droneGains = {};
        for (const drone of assignedDrones) {
          const baseTime = 30 / (drone.efficiency * droneAmp);
          const cycles = Math.floor((result.seconds * mult) / baseTime);
          if (cycles > 0) {
            droneGains[drone.assignedMaterial] = (droneGains[drone.assignedMaterial] || 0) + cycles;
          }
        }
        const parts = [];
        for (const [mat, qty] of Object.entries(droneGains)) {
          this.inventory.addMaterial(mat, qty);
          result.materialsGained[mat] = (result.materialsGained[mat] || 0) + qty;
          parts.push(`+${qty} ${mat}`);
        }
        rows.push({ label: 'DRONE ROUTES', ran: true, detail: parts.join(', ') || 'no full cycles' });
      }
    }

    // Queued drone missions run offline too ("drones run exactly the queued
    // missions" — the pre-logout puzzle). Same compute gate as the routes.
    {
      const missionMult = gate('drones');
      const ms = missionMult > 0 ? this.drones.simulateOfflineMissions?.(result.seconds, missionMult) : null;
      if (ms) {
        for (const [mat, qty] of Object.entries(ms.loot)) {
          result.materialsGained[mat] = (result.materialsGained[mat] || 0) + qty;
        }
        rows.push({ label: 'DRONE MISSIONS', ran: true, detail: `${ms.completed} mission${ms.completed > 1 ? 's' : ''} completed` });
      } else if (missionMult <= 0 && this.drones._missionQueues && this.drones.getMissions?.().some(m => !m.done)) {
        rows.push({ label: 'DRONE MISSIONS', ran: false, detail: DORMANT });
      }
    }

    if (ctx) {
      const { stats, ascension, timeWarp, expedition, implant, tripartite, trainingAreas, extractors } = ctx;

      // Extractor bank (stocked destination — installing units IS stocking)
      if (extractors && extractors.slotCount > 0) {
        const mult = gate('extractors');
        if (mult <= 0) {
          rows.push({ label: 'EXTRACTOR BANK', ran: false, detail: DORMANT });
        } else {
          const gains = extractors.applyOfflineTime(result.seconds * mult);
          const parts = [];
          for (const [mat, qty] of Object.entries(gains)) {
            result.materialsGained[mat] = (result.materialsGained[mat] || 0) + qty;
            parts.push(`+${qty} ${mat}`);
          }
          rows.push({ label: 'EXTRACTOR BANK', ran: true, detail: parts.join(', ') || 'storage full' });
        }
      }

      // Allocation legs keep investing offline at 50% efficiency (investment
      // layer — not a compute destination, unchanged from v13)
      if (tripartite) {
        const tri = tripartite.simulateOffline(result.seconds, 0.5);
        if (tri) highlights.push(`✦ Allocation: +${Math.floor(tri.invested)} units invested while away`);
      }

      // Holodeck (stocked destination; pre-board saves still honor "parked
      // inside the chamber")
      if (trainingAreas) {
        const parked = !!trainingAreas.activeId;
        const loaded = parked || !!trainingAreas.selectedProgram;
        const mult = boardActive ? gate('holodeck') : (parked ? 1 : 0);
        if (loaded && mult <= 0) {
          rows.push({ label: 'HOLODECK', ran: false, detail: DORMANT });
        } else if (loaded) {
          const tr = trainingAreas.simulateOffline(result.seconds, mult);
          if (tr) {
            const parts = Object.entries(tr.deltas).map(([s, d]) => `${s} ${d > 0 ? '+' : ''}${d}`).join(', ');
            rows.push({ label: 'HOLODECK', ran: true, detail: `${tr.station}: ${parts || 'XP banked'}` });
          }
        }
      }

      // Simulation Ladder (stocked destination)
      if (expedition) {
        if (expedition.active) {
          const mult = gate('ladder');
          if (mult <= 0) {
            rows.push({ label: 'SIM LADDER', ran: false, detail: DORMANT });
          } else {
            const ex = expedition.simulateOffline(result.seconds, mult);
            if (ex) {
              rows.push({ label: 'SIM LADDER', ran: true, detail: `${ex.kills} kills, +${ex.pp} PP` });
              for (const [mat, qty] of Object.entries(ex.materials)) {
                result.materialsGained[mat] = (result.materialsGained[mat] || 0) + qty;
              }
            } else {
              rows.push({ label: 'SIM LADDER', ran: false, detail: 'stalled — tier too dangerous' });
            }
          }
        } else if (boardActive) {
          rows.push({ label: 'SIM LADDER', ran: false, detail: 'frame halted before logout' });
        }
      }

      // Factory lines (stocked destinations — hoppers are the fuel)
      if (ctx.factory) {
        for (const line of ctx.factory.simulateOffline(result.seconds, gate)) {
          rows.push(line.dormant
            ? { label: `LINE: ${line.name.toUpperCase()}`, ran: false, detail: DORMANT }
            : { label: `LINE: ${line.name.toUpperCase()}`, ran: line.cycles > 0, detail: line.cycles > 0 ? `${line.cycles} cycle${line.cycles > 1 ? 's' : ''} completed` : 'hopper empty — nothing to run' });
        }
      }

      // Processing bank (the queue is the stock — inputs consumed at enqueue)
      if (ctx.processing) {
        const queued = Object.values(ctx.processing._nodes || {}).some(n => n.active || n.queue.length > 0);
        if (queued) {
          const mult = gate('processing');
          if (mult <= 0) {
            rows.push({ label: 'PROCESSING BANK', ran: false, detail: DORMANT });
          } else {
            const jobs = ctx.processing.simulateOffline(result.seconds, mult);
            rows.push({ label: 'PROCESSING BANK', ran: jobs > 0, detail: jobs > 0 ? `${jobs} job${jobs > 1 ? 's' : ''} completed` : 'queue idle' });
          }
        }
      }

      // Overflow Routing (Al module): the core feed's cap spill becomes
      // implant XP instead of evaporating. (Ladder spill routes internally
      // through PPSystem.deposit during simulateOffline.)
      if (ppSpill > 0 && ctx.compute?.hasModule?.('overflowRouting')) {
        const xp = ctx.compute.routeOverflow(ppSpill, implant);
        rows.push(xp > 0
          ? { label: 'OVERFLOW ROUTING', ran: true, detail: `+${Math.floor(xp)} implant XP from ${Math.floor(ppSpill)} over-cap PP` }
          : { label: 'OVERFLOW ROUTING', ran: false, detail: implant?.target ? DORMANT : 'no implant target set' });
      }

      // Neural implant trains offline at 50% efficiency (background flow sink
      // — not a compute destination, unchanged from v13)
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
      rows,
      highlights,
    };
  }
}

// The Machine — the surface computer the game is named for. Chapter-capstone
// parts are built from field findings (computed live from already-persisted
// state — the player is always inspecting just by playing), lab analyses
// (specimens studied at the Analysis Bay), and staged material bills.
// All part CONTENT lives in MACHINE_PARTS (server/definitions/systemsData.js):
// remapping improvements between chapters is a data edit, never code here.
// Spec: docs/superpowers/specs/2026-07-27-physical-computer-design.md
import {
  MACHINE_PARTS, MACHINE_MINOR,
} from '../../server/definitions/systemsData.js';

// Grant keys with a live consumer wired in main.js TODAY. The registry may
// declare more (MACHINE_GRANT_KEYS) for later phases, but a part may only
// USE a key once its consumer exists — pinned by the registry test so a
// data edit can never silently do nothing in-game.
export const CONSUMED_GRANT_KEYS = ['gatherMult', 'craftSpeedMult', 'ppMult'];

export class MachineSystem {
  static get PARTS() { return MACHINE_PARTS; }
  static get MINOR() { return MACHINE_MINOR; }

  constructor(inventorySystem, ppSystem) {
    this.inventory = inventorySystem;
    this.pp = ppSystem;
    // Wired in main.js after construction (ChapterSystem convention):
    this.codex = null;     // CodexSystem — isDiscovered()
    this.bosses = null;    // BossSystem — isDefeated()
    this.chapters = null;  // ChapterSystem — rungCrossed(), wardensCrossedLifetime()

    this.installed = new Set();   // part ids
    this.stagesDelivered = {};    // partId -> stages delivered so far
    this.analysesDone = {};       // partId -> Set of completed analysis ids
    this.analysisJob = null;      // { partId, analysisId, progress, duration } | null
    this.analysisQueue = [];      // [{ partId, analysisId, duration }]
    this.minorsBuilt = 0;

    this.onInstall = null;           // fn(part) — {id, gen, name, minor?} guaranteed;
                                     // registry fields (grants/restore/...) on majors only
    this.onAnalysisComplete = null;  // fn(partId, analysisId)
  }

  // ── Registry lookups ───────────────────────────────────────────────────────
  getPart(id) { return MACHINE_PARTS.find(p => p.id === id) || null; }

  get currentGen() {
    let g = -1;
    for (const p of MACHINE_PARTS) if (this.installed.has(p.id)) g = Math.max(g, p.gen);
    return g;
  }

  hasCapability(cap) {
    return MACHINE_PARTS.some(p => this.installed.has(p.id) && p.capability === cap);
  }

  get analysisUnlocked() { return this.hasCapability('analysisBay'); }

  consoleHint() {
    return this.currentGen < 0
      ? '[E/ACT] Salvage Heap — assemble the Field Core'
      : '[E/ACT] Machine Console';
  }

  // ── Findings — the "always inspecting" contract: computed, never stored ────
  fieldFindings(partId) {
    const p = this.getPart(partId);
    if (!p) return { rows: [], done: 0, total: 0, complete: false };
    const rows = [];
    if (p.findings.zoneLore) {
      rows.push({ label: 'Zone surveyed', done: !!this.codex?.isDiscovered(p.findings.zoneLore) });
    }
    if (p.findings.boss) {
      rows.push({ label: 'Apex threat neutralized', done: !!this.bosses?.isDefeated(p.findings.boss) });
    }
    for (const key of p.findings.codex) {
      const entry = this.codex ? this.codex.constructor.ENTRIES[key] : null;
      rows.push({ label: `Specimen logged: ${entry ? entry.label : key}`, done: !!this.codex?.isDiscovered(key) });
    }
    const done = rows.filter(r => r.done).length;
    return { rows, done, total: rows.length, complete: done === rows.length };
  }

  labFindings(partId) {
    const p = this.getPart(partId);
    if (!p) return { done: 0, total: 0, complete: false };
    const set = this.analysesDone[partId] || new Set();
    const done = p.analyses.filter(a => set.has(a.id)).length;
    return { done, total: p.analyses.length, complete: done >= p.analyses.length };
  }

  // locked → investigating → building → installed
  partState(partId) {
    const p = this.getPart(partId);
    if (!p) return 'unknown';
    if (this.installed.has(p.id)) return 'installed';
    if (p.gen > 0 && !(this.chapters && this.chapters.rungCrossed(p.rung))) return 'locked';
    if (!this.fieldFindings(partId).complete || !this.labFindings(partId).complete) return 'investigating';
    return 'building';
  }

  // ── Analysis Bay (gen0 capability) — processing-node conventions:
  // inputs consumed at enqueue, the queue IS the stock, offline closed form. ──
  analysisDone(partId, analysisId) {
    return (this.analysesDone[partId] || new Set()).has(analysisId);
  }

  analysisQueued(partId, analysisId) {
    if (this.analysisJob && this.analysisJob.partId === partId && this.analysisJob.analysisId === analysisId) return true;
    return this.analysisQueue.some(q => q.partId === partId && q.analysisId === analysisId);
  }

  enqueueAnalysis(partId, analysisId) {
    if (!this.analysisUnlocked) return false;
    const p = this.getPart(partId);
    const a = p ? p.analyses.find(x => x.id === analysisId) : null;
    if (!a) return false;
    if (this.analysisDone(partId, analysisId) || this.analysisQueued(partId, analysisId)) return false;
    if (!this.inventory.hasMaterials(a.input)) return false;
    for (const [mat, qty] of Object.entries(a.input)) this.inventory.removeMaterial(mat, qty);
    const job = { partId, analysisId, duration: a.duration };
    if (this.analysisJob) this.analysisQueue.push(job);
    else this.analysisJob = { ...job, progress: 0 };
    return true;
  }

  update(delta) {
    // Frame-tick path (delta ≤ 0.1 s via main.js clamp). Any future catch-up or time-skip must route through simulateOffline — this path deliberately completes at most one job per call.
    if (!this.analysisJob) return;
    this.analysisJob.progress += delta;
    if (this.analysisJob.progress >= this.analysisJob.duration) this._completeAnalysis();
  }

  _completeAnalysis() {
    const { partId, analysisId } = this.analysisJob;
    if (!this.analysesDone[partId]) this.analysesDone[partId] = new Set();
    this.analysesDone[partId].add(analysisId);
    const next = this.analysisQueue.shift() || null;
    this.analysisJob = next ? { ...next, progress: 0 } : null;
    if (this.onAnalysisComplete) this.onAnalysisComplete(partId, analysisId);
  }

  simulateOffline(seconds) {
    if (!(seconds > 0)) return 0;
    const savedCb = this.onAnalysisComplete;
    this.onAnalysisComplete = null;
    let completed = 0;
    let budget = seconds;
    while (this.analysisJob && budget > 0) {
      const remaining = this.analysisJob.duration - this.analysisJob.progress;
      if (remaining <= budget) {
        budget -= remaining;
        this._completeAnalysis();
        completed++;
      } else {
        this.analysisJob.progress += budget;
        budget = 0;
      }
    }
    this.onAnalysisComplete = savedCb;
    return completed;
  }

  // ── Build stages + install ──────────────────────────────────────────────────
  stageBill(partId) {
    const p = this.getPart(partId);
    if (!p || this.installed.has(partId)) return null;
    return p.stageBills[this.stagesDelivered[partId] || 0] || null;
  }

  canDeliverStage(partId) {
    if (this.partState(partId) !== 'building') return false;
    const bill = this.stageBill(partId);
    return !!bill && this.pp.ppTotal >= bill.pp && this.inventory.hasMaterials(bill.mats);
  }

  deliverStage(partId) {
    if (!this.canDeliverStage(partId)) return false;
    const bill = this.stageBill(partId);
    if (!this.pp.spend(bill.pp)) return false;
    for (const [mat, qty] of Object.entries(bill.mats)) this.inventory.removeMaterial(mat, qty);
    this.stagesDelivered[partId] = (this.stagesDelivered[partId] || 0) + 1;
    const p = this.getPart(partId);
    if (this.stagesDelivered[partId] >= p.stageBills.length) this._install(p);
    return true;
  }

  _install(part) {
    this.installed.add(part.id);
    if (this.onInstall) this.onInstall(part);
  }

  // ── Expansion Racks — one earned per crossed warden rung, forever ──────────
  get minorsAvailable() {
    const crossed = this.chapters ? this.chapters.wardensCrossedLifetime() : 0;
    return Math.max(0, crossed - this.minorsBuilt);
  }

  minorBill() {
    const scale = Math.pow(MACHINE_MINOR.billGrowth, this.minorsBuilt);
    const mats = {};
    for (const [m, q] of Object.entries(MACHINE_MINOR.billBase.mats)) {
      mats[m] = Math.min(MACHINE_MINOR.matCap, Math.ceil(q * scale));
    }
    return { pp: Math.ceil(MACHINE_MINOR.billBase.pp * scale), mats };
  }

  canBuildMinor() {
    if (this.currentGen < 0 || this.minorsAvailable <= 0) return false;
    const bill = this.minorBill();
    return this.pp.ppTotal >= bill.pp && this.inventory.hasMaterials(bill.mats);
  }

  buildMinor() {
    if (!this.canBuildMinor()) return false;
    const bill = this.minorBill();
    if (!this.pp.spend(bill.pp)) return false;
    for (const [mat, qty] of Object.entries(bill.mats)) this.inventory.removeMaterial(mat, qty);
    this.minorsBuilt += 1;
    if (this.onInstall) {
      this.onInstall({
        id: `minor_${this.minorsBuilt}`, gen: this.currentGen,
        name: `${MACHINE_MINOR.name} ${this.minorsBuilt}`, minor: true,
      });
    }
    return true;
  }

  // ── Grants — live getters over the registry (the modularity contract) ──────
  // Live getters — recomputed on every read (BossSystem/ChallengeSystem
  // convention), so direct mutation of `installed`/`minorsBuilt` can never
  // leave a stale cache. Keys listed in CONSUMED_GRANT_KEYS are the ones
  // with live consumers; the registry test pins parts to that list.
  _grantProduct(key) {
    let v = 1;
    for (const p of MACHINE_PARTS) {
      if (this.installed.has(p.id) && p.grants[key]) v *= p.grants[key];
    }
    return v;
  }

  get gatherMult() { return this._grantProduct('gatherMult'); }
  get craftSpeedMult() { return this._grantProduct('craftSpeedMult'); }
  get ppMult() {
    return this._grantProduct('ppMult') * (1 + MACHINE_MINOR.ppMultPerPart * this.minorsBuilt);
  }

  restoreTiers() {
    const out = {};
    // Later generations supersede earlier ones — tiers are cumulative fidelity,
    // not stacking bonuses (last write wins; registry order is gen-ascending, test-pinned).
    for (const p of MACHINE_PARTS) {
      if (!this.installed.has(p.id)) continue;
      for (const [k, v] of Object.entries(p.restore)) out[k] = v;
    }
    return out;
  }

  // Grants are live getters, so there is nothing to re-apply after a load;
  // kept as a documented no-op because SaveSystem.apply() calls it by
  // convention, and phase 4's additive grants (computeUnits) will need it.
  applyBonuses() {}
}

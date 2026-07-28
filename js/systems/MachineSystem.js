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

    this.onInstall = null;           // fn(part) — toast + world refresh in main.js
    this.onAnalysisComplete = null;  // fn(partId, analysisId)
  }

  // ── Registry lookups ───────────────────────────────────────────────────────
  getPart(id) { return MACHINE_PARTS.find(p => p.id === id) || null; }

  get currentGen() {
    let g = -1;
    for (const p of MACHINE_PARTS) if (this.installed.has(p.id)) g = Math.max(g, p.gen);
    return g;
  }

  get analysisUnlocked() { return this.installed.has('gen0'); }

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

  // ── Grants — generic keyed applier (the modularity contract) ───────────────
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
    // Later generations supersede earlier ones — tiers are cumulative fidelity, not stacking bonuses (last write wins; registry order is gen-ascending, test-pinned).
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

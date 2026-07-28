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
    this._mults = null;
    this._recompute();
  }

  // ── Registry lookups ───────────────────────────────────────────────────────
  getPart(id) { return MACHINE_PARTS.find(p => p.id === id) || null; }

  get currentGen() {
    let g = -1;
    for (const p of MACHINE_PARTS) if (this.installed.has(p.id)) g = Math.max(g, p.gen);
    return g;
  }

  get nextPart() { return MACHINE_PARTS.find(p => !this.installed.has(p.id)) || null; }
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
      rows.push({ label: 'Zone surveyed', done: !!(this.codex && this.codex.isDiscovered(p.findings.zoneLore)) });
    }
    if (p.findings.boss) {
      rows.push({ label: 'Apex threat neutralized', done: !!(this.bosses && this.bosses.isDefeated(p.findings.boss)) });
    }
    for (const key of p.findings.codex) {
      rows.push({ label: `Specimen logged: ${key}`, done: !!(this.codex && this.codex.isDiscovered(key)) });
    }
    const done = rows.filter(r => r.done).length;
    return { rows, done, total: rows.length, complete: done === rows.length };
  }

  labFindings(partId) {
    const p = this.getPart(partId);
    if (!p) return { done: 0, total: 0, complete: false };
    const set = this.analysesDone[partId] || new Set();
    return { done: set.size, total: p.analyses.length, complete: set.size >= p.analyses.length };
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
  _recompute() {
    const m = { gatherMult: 1, craftSpeedMult: 1, ppMult: 1 };
    for (const p of MACHINE_PARTS) {
      if (!this.installed.has(p.id)) continue;
      for (const [k, v] of Object.entries(p.grants)) {
        if (k in m) m[k] *= v;
      }
    }
    m.ppMult *= 1 + MACHINE_MINOR.ppMultPerPart * this.minorsBuilt;
    this._mults = m;
  }

  get gatherMult() { return this._mults.gatherMult; }
  get craftSpeedMult() { return this._mults.craftSpeedMult; }
  get ppMult() { return this._mults.ppMult; }

  restoreTiers() {
    const out = {};
    for (const p of MACHINE_PARTS) {
      if (!this.installed.has(p.id)) continue;
      for (const [k, v] of Object.entries(p.restore)) out[k] = v;
    }
    return out;
  }

  applyBonuses() { this._recompute(); }
}

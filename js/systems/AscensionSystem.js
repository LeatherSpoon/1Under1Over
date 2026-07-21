import { CONFIG } from '../config.js';

// ── Recompile (THE rebirth) + Archive Data ──────────────────────────────────
// Absorbs the old Ascension layer (class/save key keep the legacy name).
// Recompiling resets the RUN layer — PP pool, base cap, Simulation Ladder
// position/wardens/keys — and cashes the run out into ARCHIVE DATA, the
// watermarked prestige currency: spendable in the shop below, never lost,
// levels persist forever (FAPI model — resetting only ever gains).
//
// The live NUMBER (NGU): ArchiveNext = ⌊ peakTier/5 × (1 + wardensThisRun) × M ⌋
// M is session momentum — the "now is a good time" whisper. It stays 1.0
// until the knee (2 h ONLINE this run, or a warden beaten this run), then
// jumps to ×1.5 and grows +0.5/hr, capped ×4. Offline time never feeds M.
// A first-ever peak tier pays a watermark bonus (+2 per new tier) on top,
// and Archive Fragments banked by the ladder (failed warden pushes — death-
// as-harvest) are swept into the payout.

const MOMENTUM_KNEE_HOURS = 2;
const MOMENTUM_JUMP = 1.5;
const MOMENTUM_PER_HOUR = 0.5;
const MOMENTUM_CAP = 4;
const AP_TO_ARCHIVE = 3;        // legacy Ascension Points convert 1 → 3
const WATERMARK_PER_TIER = 2;

const SHOP = [
  { id: 'ppMult',        label: 'PP Amplifier',      desc: '+25% PP rate per level' },
  { id: 'combatMult',    label: 'Combat Amplifier',  desc: '×1.15 damage per level' },
  { id: 'gatherMult',    label: 'Harvest Amplifier', desc: '×1.15 gather speed per level' },
  { id: 'droneMult',     label: 'Drone Amplifier',   desc: '×1.15 drone efficiency per level' },
  { id: 'offlineBuffer', label: 'Offline Buffer',    desc: '+12 h offline cap per level' },
];

export class AscensionSystem {
  constructor(ppSystem) {
    this.pp = ppSystem;
    this.expedition = null;    // wired in main.js — the ladder is the run layer
    this.ascensionCount = 0;   // recompile count (legacy name kept for saves/quests/achievements)
    this.archive = 0;          // spendable Archive Data
    this.bestTierEver = 0;     // watermark — never resets
    this.runSeconds = 0;       // ONLINE seconds this run — offline never counts
    this._upgradeCounts = { ppMult: 0, combatMult: 0, gatherMult: 0, droneMult: 0, offlineBuffer: 0 };
  }

  // ── Derived multipliers (recomputed every frame by main.js) ────────────────
  get ppMultiplier()      { return 1 + 0.25 * this._upgradeCounts.ppMult; }
  get combatMultiplier()  { return Math.pow(1.15, this._upgradeCounts.combatMult); }
  get gatherMultiplier()  { return Math.pow(1.15, this._upgradeCounts.gatherMult); }
  get droneMultiplier()   { return Math.pow(1.15, this._upgradeCounts.droneMult); }
  get offlineCapSeconds() { return (24 + 12 * this._upgradeCounts.offlineBuffer) * 3600; }

  update(delta) { this.runSeconds += delta; }

  // ── The live NUMBER ────────────────────────────────────────────────────────
  get runHours()        { return this.runSeconds / 3600; }
  get wardensThisRun()  { return this.expedition?.wardensCleared || 0; }
  get peakTierThisRun() { return this.expedition?.peakTier || 0; }
  get fragmentsBanked() { return this.expedition?.archiveShards || 0; }

  get momentumActive() {
    return this.runHours >= MOMENTUM_KNEE_HOURS || this.wardensThisRun >= 1;
  }
  get momentum() {
    if (!this.momentumActive) return 1;
    return Math.min(
      MOMENTUM_CAP,
      MOMENTUM_JUMP + MOMENTUM_PER_HOUR * Math.max(0, this.runHours - MOMENTUM_KNEE_HOURS)
    );
  }

  /** Recomputed live; the terminal panel shows it ticking. */
  get archiveNext() {
    return Math.floor((this.peakTierThisRun / 5) * (1 + this.wardensThisRun) * this.momentum);
  }
  get watermarkBonus() {
    return Math.max(0, this.peakTierThisRun - this.bestTierEver) * WATERMARK_PER_TIER;
  }
  get recompileGain() {
    return this.archiveNext + this.watermarkBonus + this.fragmentsBanked;
  }

  /** Unlocks at the first warden beaten (this run, or any prior run's watermark). */
  get recompileUnlocked() { return this.wardensThisRun >= 1 || this.bestTierEver >= 10; }

  // Legacy name — OfflineSystem's return banner and old call sites use it.
  canAscend() { return this.recompileUnlocked && this.recompileGain >= 1; }

  /** THE rebirth. Returns a payout summary, or null when there's nothing to gain. */
  recompile() {
    if (!this.canAscend()) return null;
    const summary = {
      gained: this.recompileGain,
      base: this.archiveNext,
      watermark: this.watermarkBonus,
      fragments: this.fragmentsBanked,
      momentum: this.momentum,
      peakTier: this.peakTierThisRun,
      count: this.ascensionCount + 1,
      // legacy fields some callers/toasts may read
      apEarned: this.recompileGain,
      totalAP: this.archive + this.recompileGain,
    };
    this.bestTierEver = Math.max(this.bestTierEver, this.peakTierThisRun);
    this.archive += summary.gained;
    this.ascensionCount++;

    // Reset the RUN layer only — skills, gear, materials, story bosses,
    // tripartite investment and Archive shop levels all persist by design.
    this.pp.ppTotal = 0;
    this.pp.setBaseCap(CONFIG.INITIAL_PP_CAP);
    this.runSeconds = 0;
    if (this.expedition) this.expedition.recompileReset();
    return summary;
  }
  ascend() { return this.recompile(); } // legacy alias (main.js wrap, quests)

  // ── Archive shop (levels persist forever) ──────────────────────────────────
  _cost(id) {
    const n = this._upgradeCounts[id] || 0;
    if (id === 'offlineBuffer') return 5 * Math.pow(2, n);
    return 1 + Math.floor(n * (n + 1) / 2);   // legacy AP curve: 1, 2, 4, 7, 11…
  }

  _valueLabel(id) {
    switch (id) {
      case 'ppMult':        return `${this.ppMultiplier.toFixed(2)}x`;
      case 'combatMult':    return `${this.combatMultiplier.toFixed(2)}x`;
      case 'gatherMult':    return `${this.gatherMultiplier.toFixed(2)}x`;
      case 'droneMult':     return `${this.droneMultiplier.toFixed(2)}x`;
      case 'offlineBuffer': return `${Math.round(this.offlineCapSeconds / 3600)}h`;
      default:              return '';
    }
  }

  getUpgrades() {
    return SHOP.map(s => ({
      id: s.id,
      label: s.label,
      desc: s.desc,
      level: this._upgradeCounts[s.id] || 0,
      value: this._valueLabel(s.id),
      cost: this._cost(s.id),
    }));
  }

  buyUpgrade(id) {
    if (!(id in this._upgradeCounts)) return false;
    const cost = this._cost(id);
    if (this.archive < cost) return false;
    this.archive -= cost;
    this._upgradeCounts[id]++;
    return true;
  }

  serialize() {
    return {
      ascensionCount: this.ascensionCount,
      archive: this.archive,
      bestTierEver: this.bestTierEver,
      runSeconds: this.runSeconds,
      upgradeCounts: { ...this._upgradeCounts },
    };
  }

  deserialize(data) {
    if (!data) return;
    this.ascensionCount = data.ascensionCount || 0;
    const counts = { ppMult: 0, combatMult: 0, gatherMult: 0, droneMult: 0, offlineBuffer: 0 };
    if (data.archive !== undefined || data.bestTierEver !== undefined) {
      // v12+ Archive format
      this.archive = data.archive || 0;
      this.bestTierEver = data.bestTierEver || 0;
      this.runSeconds = data.runSeconds || 0;
      this._upgradeCounts = { ...counts, ...(data.upgradeCounts || {}) };
    } else {
      // Legacy AP-era save: unspent AP converts ×3; shop levels carry 1:1
      // (multiplier VALUES recompute from levels — combat/gather/drone shift
      // from additive to ×1.15/level).
      this.archive = (data.ascensionPoints || 0) * AP_TO_ARCHIVE;
      this.bestTierEver = 0;
      this.runSeconds = 0;
      this._upgradeCounts = { ...counts, ...(data.upgradeCounts || {}) };
    }
  }
}

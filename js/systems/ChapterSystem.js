// ── Chapter Chain (the spine) ───────────────────────────────────────────────
// One number indexes the game: the player's "level" is the latest chapter
// crossed. Rungs interleave beat-once STORY bosses (odd rungs 1-11) with
// re-climbable Simulation Ladder WARDENS (even rungs 2-10; every rung past
// S6 is a warden — the chain is infinite). A rung counts as crossed when:
//   story rung  → that boss has ever been defeated (BossSystem, never resets)
//   warden rung → the LIFETIME tier watermark covers it (max of the
//                 Recompile watermark bestTierEver and the current run's
//                 peakTier — both only ever grow within a run, and the
//                 Recompile watermark persists across runs)
// `current` is the contiguous crossed prefix; `highestEver` watermarks it
// (serialized, monotonic — tab/zone unlocks key off it and never re-lock).

const STORY = [
  { rung: 1,  boss: 'boss_landing', label: 'Scrap Tyrant',  scene: 'The Landing' },
  { rung: 3,  boss: 'boss_mine',    label: 'Forge Warden',  scene: 'The Mine' },
  { rung: 5,  boss: 'boss_verdant', label: 'Maw Sovereign', scene: 'Verdant Maw' },
  { rung: 7,  boss: 'boss_lagoon',  label: 'Tide Oracle',   scene: 'Lagoon Coast' },
  { rung: 9,  boss: 'boss_tundra',  label: 'Cryo Monarch',  scene: 'Frozen Tundra' },
  { rung: 11, boss: 'boss_depths',  label: 'The Unmaker',   scene: 'The Depths' },
];

export class ChapterSystem {
  constructor(bossSystem, ppSystem) {
    this.bosses = bossSystem;
    this.pp = ppSystem;
    this.expedition = null;   // wired in main.js
    this.ascension = null;    // wired in main.js
    this.highestEver = 0;
  }

  static get STORY() { return STORY; }

  /** Lifetime wardens crossed: floor of the best tier ever sat at / 10. */
  wardensCrossedLifetime() {
    const best = Math.max(this.ascension?.bestTierEver || 0, this.expedition?.peakTier || 0);
    return Math.floor(best / 10);
  }

  /** Warden ordinal needed for an even/deep rung: 2→1st … 10→5th, 12+→(r−6)th. */
  _wardenIndexFor(rung) {
    return rung <= 10 ? rung / 2 : rung - 6;
  }

  rungCrossed(rung) {
    if (rung < 1) return true;
    const story = STORY.find(s => s.rung === rung);
    if (story) return this.bosses.isDefeated(story.boss);
    if (rung <= 10 && rung % 2 === 1) return false; // odd story rung missing from data (safety)
    return this.wardensCrossedLifetime() >= this._wardenIndexFor(rung);
  }

  /** Contiguous crossed prefix — the player's level. Watermarks highestEver. */
  get current() {
    let c = 0;
    while (this.rungCrossed(c + 1)) c++;
    if (c > this.highestEver) this.highestEver = c;
    return c;
  }

  /** The player's displayed level: live chain position or migrated watermark. */
  get level() {
    return Math.max(this.current, this.highestEver);
  }

  /** Display info for a rung (1-based chapter number). */
  rungInfo(rung) {
    const story = STORY.find(s => s.rung === rung);
    if (story) return { kind: 'story', label: story.label, scene: story.scene, boss: story.boss };
    const w = this._wardenIndexFor(rung);
    return { kind: 'warden', label: `Sim Warden — Gate T${w * 10 + 1}`, tier: w * 10 };
  }

  /** "CH.3 — Forge Warden" style headline for the HUD. */
  get headline() {
    const c = this.level;
    if (c === 0) return 'PROLOGUE';
    const info = this.rungInfo(c);
    return `CH.${c} — ${info.label}`;
  }

  get nextObjective() {
    const c = this.level;
    const info = this.rungInfo(c + 1);
    return info.kind === 'story'
      ? `Defeat ${info.label} (${info.scene})`
      : `Beat the ${info.label} on the Simulation Ladder`;
  }

  serialize() {
    return { highestEver: Math.max(this.highestEver, this.current) };
  }

  deserialize(data) {
    if (data && data.highestEver !== undefined) {
      this.highestEver = Math.max(this.highestEver, data.highestEver);
      return;
    }
    // v12→v13 seed: chapters must never re-lock what the old prestige-count
    // tab gates had already opened (TECH/IMPLANT/DATA @1 → CH.1, ALLOC/OPT @2
    // → CH.2, TRIALS @3 → CH.4).
    const p = this.pp?.prestigeCount || 0;
    const seed = p >= 3 ? 4 : p >= 2 ? 2 : p >= 1 ? 1 : 0;
    this.highestEver = Math.max(this.highestEver, seed);
  }
}

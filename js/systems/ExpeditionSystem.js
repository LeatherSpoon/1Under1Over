// ── Simulation Ladder (Field Ops) ───────────────────────────────────────────
// Al runs endless combat simulations against ever-stronger creature bands.
// The ladder is infinite: tier t enemies have HP 30×1.18^t; kills/sec stays
// deterministic (player DPS / enemy HP) and a tier is stalled unless the
// player's survivability beats its threat gate. Offline at 50% efficiency
// (via OfflineSystem) while deployed.
//
// Bands of 10 tiers reuse the creature roster with organic rank prefixes
// (Juvenile → Primeval). Every 10th tier is gated by a SECTOR WARDEN:
// attempting one spends Override Keys earned deterministically from FIELD
// kills of that band's creature family (1 key per 5 kills — the unstall path
// is never RNG). Warden resolution is instant and transparent: success iff
// the frame can burn the warden's HP inside a 60 s window AND passes the
// survival gate; a failed push still banks Archive Fragments proportional to
// damage dealt (death-as-harvest — pushing is never wasted). Fragments have
// no sink until the Recompile system lands (build Phase C).

const BAND_SIZE = 10;
const KILLS_PER_KEY = 5;
const WARDEN_WINDOW_S = 60;   // simulated seconds the frame gets per attempt
const WARDEN_HP_MULT = 8;     // warden HP = 8 × the gate tier's enemy HP
const SURVIVAL_GATE = 5;      // stalled when survival < threat × 5 (wardens too)

const HP_BASE = 30,  HP_GROWTH = 1.18;
const THREAT_BASE = 10, THREAT_GROWTH = 1.15;
const PP_BASE = 6,   PP_GROWTH = 1.14;

// Band families ordered by zone accessibility (key-farming never requires a
// zone gated later than the previous band's).
const FAMILIES = [
  { id: 'serpendrill', label: 'Serpendrill' },
  { id: 'reptlar',     label: 'Reptlar' },
  { id: 'dunkraza',    label: 'Dunkraza' },
  { id: 'hardlizzy',   label: 'Hardlizzy' },
  { id: 'cavecrab',    label: 'Cavecrab' },
  { id: 'spoonvark',   label: 'Spoonvark' },
];
const RANKS = ['Juvenile', 'Adult', 'Alpha', 'Elder', 'Apex', 'Primeval'];

// First seven bands keep the legacy sector names; deeper bands are generated.
const BAND_LABELS = [
  'Scrapyard Fringe', 'Rustflat Barrens', 'Fungal Hollow', 'Drowned Shelf',
  'Glacier Verge', 'Breach Perimeter', 'The Static Wastes',
];

// Legacy tier drop tables become band drop tables; bands 7+ cycle the last
// table with a quantity multiplier so deep farming stays worthwhile.
const BAND_DROPS = [
  [{ mat: 'circuitWire', chance: 0.35 }, { mat: 'ironSpike', chance: 0.20 }],
  [{ mat: 'copper', chance: 0.40 }, { mat: 'stone', chance: 0.30 }, { mat: 'powerCore', chance: 0.08 }],
  [{ mat: 'fiber', chance: 0.40 }, { mat: 'resin', chance: 0.25 }, { mat: 'timber', chance: 0.30 }],
  [{ mat: 'silica', chance: 0.35 }, { mat: 'quartz', chance: 0.20 }, { mat: 'logicChip', chance: 0.10 }],
  [{ mat: 'iron', chance: 0.35 }, { mat: 'silver', chance: 0.20 }, { mat: 'titanium', chance: 0.08 }],
  [{ mat: 'carbon', chance: 0.30 }, { mat: 'burstCapacitor', chance: 0.20 }, { mat: 'tungsten', chance: 0.12 }],
  [{ mat: 'magnet', chance: 0.20 }, { mat: 'armorPlate', chance: 0.15 }, { mat: 'gold', chance: 0.10 }],
];

// v10→v11 migration: old 7-tier indices mapped to the nearest new tier by
// enemy HP (t = ln(oldHP/30)/ln(1.18)), wardens by coverage of that tier.
const OLD_TIER_EQUIV = [0, 7, 14, 20, 27, 33, 39];
const OLD_WARDEN_MIGRATION = { '-1': 0, 0: 1, 1: 1, 2: 2, 3: 3, 4: 3, 5: 4, 6: 4 };

export class ExpeditionSystem {
  constructor(ppSystem, statsSystem, inventorySystem) {
    this.pp = ppSystem;
    this.stats = statsSystem;
    this.inventory = inventorySystem;

    this.active = false;
    this.tier = 0;             // tier the frame is currently simulating
    this.peakTier = 0;         // highest tier reached THIS RUN (feeds the Recompile NUMBER)
    this.wardensCleared = 0;   // consecutive wardens beaten → tiers 0..maxTier open
    this.keys = {};            // familyId -> banked Override Keys
    this._killCounters = {};   // familyId -> field kills toward the next key (0..4)
    this.totalKills = 0;
    this.totalPP = 0;
    this.archiveShards = 0;    // Archive Fragments banked for Recompile (Phase C)

    // External damage multiplier (modifiers × boss trophies × challenges),
    // kept in sync by main.js alongside CombatSystem.
    this.damageMult = 1;

    this._killProgress = 0;    // fractional kills carried between frames
    this._log = [];            // rolling event log for the panel (newest first)

    this.onEvent = null;       // fn() — panel refresh hook
    this.onKills = null;       // fn(count) — challenge tracking hook
  }

  static get FAMILIES() { return FAMILIES; }
  static get BAND_SIZE() { return BAND_SIZE; }
  static get KILLS_PER_KEY() { return KILLS_PER_KEY; }

  // ── Tier math (infinite) ───────────────────────────────────────────────────
  enemyHP(t)   { return HP_BASE * Math.pow(HP_GROWTH, t); }
  threat(t)    { return THREAT_BASE * Math.pow(THREAT_GROWTH, t); }
  ppPerKill(t) { return Math.floor(PP_BASE * Math.pow(PP_GROWTH, t)) || 1; }

  band(t)       { return Math.floor(t / BAND_SIZE); }
  bandFamily(b) { return FAMILIES[b % FAMILIES.length]; }
  bandRank(b)   { return RANKS[Math.min(Math.floor(b / FAMILIES.length), RANKS.length - 1)]; }
  bandLabel(b)  { return b < BAND_LABELS.length ? BAND_LABELS[b] : `Deep Sim ${b + 1}`; }
  enemyName(t) {
    const b = this.band(t);
    return `${this.bandRank(b)} ${this.bandFamily(b).label}`;
  }
  bandDrops(b) {
    const table = BAND_DROPS[Math.min(b, BAND_DROPS.length - 1)];
    const qtyMult = 1 + Math.floor(b / BAND_DROPS.length);
    return { table, qtyMult };
  }

  // ── Access & safety ────────────────────────────────────────────────────────
  get maxTier() { return this.wardensCleared * BAND_SIZE + (BAND_SIZE - 1); }
  get nextWardenTier() { return (this.wardensCleared + 1) * BAND_SIZE; }
  isBandCleared(b) { return b < this.wardensCleared; }

  /** Continuous player DPS estimate — auto-frame swings every 0.8s. */
  get playerDPS() {
    return (this.stats.damage * this.damageMult) / 0.8;
  }

  /** Survivability score vs tier threat: HP pool + defense mitigation. */
  get playerSurvival() {
    return this.stats.maxHP + this.stats.defense * 10;
  }

  tierTooDangerous(t) {
    return this.playerSurvival < this.threat(t) * SURVIVAL_GATE;
  }

  /** Kills per second in a tier; 0 when stalled. */
  killRate(t) {
    if (t < 0 || t > this.maxTier || this.tierTooDangerous(t)) return 0;
    return this.playerDPS / this.enemyHP(t);
  }

  /** Highest accessible tier the frame can idle safely at. */
  maxSafeTier() {
    for (let t = this.maxTier; t >= 0; t--) {
      if (!this.tierTooDangerous(t)) return t;
    }
    return -1;
  }

  setTier(t) {
    if (t < 0 || t > this.maxTier) return false;
    this.tier = t;
    if (t > this.peakTier) this.peakTier = t;
    this._killProgress = 0;
    if (this.onEvent) this.onEvent();
    return true;
  }

  start() {
    if (this.tierTooDangerous(this.tier)) return false;
    this.active = true;
    this._pushLog(`Frame dispatched — sim tier ${this.tier + 1} (${this.enemyName(this.tier)}).`);
    if (this.onEvent) this.onEvent();
    return true;
  }

  stop() {
    this.active = false;
    this._killProgress = 0;
    this._pushLog('Frame recalled.');
    if (this.onEvent) this.onEvent();
  }

  // ── Override Keys (deterministic, from FIELD kills) ────────────────────────
  keysFor(familyId) { return this.keys[familyId] || 0; }
  killsTowardKey(familyId) { return this._killCounters[familyId] || 0; }

  /** Called by main.js on every field combat victory. Ignores bosses. */
  recordFieldKill(archetype) {
    if (!FAMILIES.some(f => f.id === archetype)) return;
    const n = (this._killCounters[archetype] || 0) + 1;
    if (n >= KILLS_PER_KEY) {
      this._killCounters[archetype] = 0;
      this.keys[archetype] = (this.keys[archetype] || 0) + 1;
      this._pushLog(`Override Key extracted (${archetype}) — ${this.keys[archetype]} banked.`);
    } else {
      this._killCounters[archetype] = n;
    }
    if (this.onEvent) this.onEvent();
  }

  // ── Wardens ────────────────────────────────────────────────────────────────
  wardenKeysRequired(gateTier = this.nextWardenTier) {
    return 3 + Math.floor(gateTier / 20);
  }
  /** The warden guards the band BELOW the gate — the family you've been fighting. */
  wardenFamily() { return this.bandFamily(this.wardensCleared); }
  wardenShardValue(gateTier) { return 5 + gateTier; }

  /**
   * Transparent preview of the next warden attempt. Success needs BOTH
   * fractions at 1: burn 8×HP within 60 s AND pass the survival gate.
   */
  wardenPreview() {
    const G = this.nextWardenTier;
    const fam = this.wardenFamily();
    const hp = this.enemyHP(G) * WARDEN_HP_MULT;
    const dpsFraction = Math.min(1, (this.playerDPS * WARDEN_WINDOW_S) / hp);
    const survivalFraction = Math.min(1, this.playerSurvival / (this.threat(G) * SURVIVAL_GATE));
    return {
      gateTier: G,
      name: `${this.bandRank(this.wardensCleared)} ${fam.label} WARDEN`,
      family: fam,
      hp,
      keysHave: this.keysFor(fam.id),
      keysNeed: this.wardenKeysRequired(G),
      dpsFraction,
      survivalFraction,
      damageFraction: dpsFraction * survivalFraction,
      shardValue: this.wardenShardValue(G),
    };
  }

  /** Spend keys, resolve instantly. Returns { won, damageFraction, shards } or null without keys. */
  attemptWarden() {
    const p = this.wardenPreview();
    if (p.keysHave < p.keysNeed) return null;
    this.keys[p.family.id] -= p.keysNeed;

    if (p.damageFraction >= 1) {
      this.wardensCleared++;
      const wardenPP = Math.min(
        this.pp.ppCap - this.pp.ppTotal,
        this.ppPerKill(p.gateTier) * 25
      );
      if (wardenPP > 0) { this.pp.ppTotal += wardenPP; this.totalPP += wardenPP; }
      this.archiveShards += p.shardValue;
      this._pushLog(`⚑ ${p.name} DOWN — band ${this.wardensCleared} cleared! +${Math.max(0, Math.floor(wardenPP))} PP, +${p.shardValue} Archive Fragments`);
      this._pushLog(`Sim tiers ${this.maxTier - BAND_SIZE + 2}–${this.maxTier + 1} unlocked; lower bands now FARM sectors.`);
      if (this.onEvent) this.onEvent();
      return { won: true, damageFraction: 1, shards: p.shardValue };
    }

    const shards = Math.floor(0.25 * p.shardValue * p.damageFraction);
    this.archiveShards += shards;
    this._pushLog(`✖ ${p.name} repelled the frame at ${Math.round(p.damageFraction * 100)}% — +${shards} Archive Fragments salvaged.`);
    if (this.onEvent) this.onEvent();
    return { won: false, damageFraction: p.damageFraction, shards };
  }

  // ── Simulation ticks ───────────────────────────────────────────────────────
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
   * Offline ladder progress at `efficiency` (0..1).
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

  _awardKills(t, count, efficiency, collectSummary = false) {
    const summary = { kills: count, pp: 0, materials: {} };
    this.totalKills += count;
    if (this.onKills) this.onKills(count);

    const pp = Math.floor(this.ppPerKill(t) * count * efficiency);
    this.pp.ppTotal = Math.min(this.pp.ppCap, this.pp.ppTotal + pp);
    this.totalPP += pp;
    summary.pp = pp;

    // Drops: exact rolls for small batches, expectation for offline hauls
    const { table, qtyMult } = this.bandDrops(this.band(t));
    for (const d of table) {
      let qty = 0;
      if (count <= 20) {
        for (let i = 0; i < count; i++) if (Math.random() < d.chance) qty++;
      } else {
        qty = Math.round(count * d.chance);
      }
      qty *= qtyMult;
      if (qty > 0) {
        this.inventory.addMaterial(d.mat, qty);
        summary.materials[d.mat] = qty;
      }
    }

    if (!collectSummary) {
      this._pushLog(`${count > 1 ? count + '× ' : ''}${this.enemyName(t)} deleted — +${pp} PP`);
    }

    if (this.onEvent) this.onEvent();
    return summary;
  }

  /** Recompile (rebirth) resets the run layer: position, wardens, keys, fragments. */
  recompileReset() {
    this.active = false;
    this.tier = 0;
    this.peakTier = 0;
    this.wardensCleared = 0;
    this.keys = {};
    this._killCounters = {};
    this.archiveShards = 0;
    this._killProgress = 0;
    this._pushLog('◈ RECOMPILE — ladder re-armed from tier 1; farm sectors reset.');
    if (this.onEvent) this.onEvent();
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
      peakTier: this.peakTier,
      wardensCleared: this.wardensCleared,
      keys: { ...this.keys },
      killCounters: { ...this._killCounters },
      totalKills: this.totalKills,
      totalPP: this.totalPP,
      archiveShards: this.archiveShards,
    };
  }

  deserialize(data) {
    if (!data) return;
    this.active = !!data.active;
    this.totalKills = data.totalKills || 0;
    this.totalPP = data.totalPP || 0;

    if (data.wardensCleared !== undefined) {
      // v11+ ladder format
      this.wardensCleared = data.wardensCleared || 0;
      this.tier = Math.min(data.tier || 0, this.maxTier);
      this.peakTier = Math.max(data.peakTier || 0, this.tier);
      this.keys = { ...(data.keys || {}) };
      this._killCounters = { ...(data.killCounters || {}) };
      this.archiveShards = data.archiveShards || 0;
    } else {
      // v10 legacy 7-tier format: map by enemy-HP equivalence
      const oldCleared = data.highestCleared ?? -1;
      this.wardensCleared = OLD_WARDEN_MIGRATION[oldCleared] ?? 0;
      const oldTier = Math.max(0, Math.min(data.tier || 0, OLD_TIER_EQUIV.length - 1));
      this.tier = Math.min(OLD_TIER_EQUIV[oldTier], this.maxTier);
      this.peakTier = this.tier;
      this.keys = {};
      this._killCounters = {};
      this.archiveShards = 0;
      this._pushLog('Simulation Ladder recalibrated — legacy sector clears mapped to sim bands.');
    }
  }
}

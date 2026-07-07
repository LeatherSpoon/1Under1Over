# NGU-Feel Roadmap — Master Design

**Date:** 2026-07-07
**Status:** Draft — pending user review
**Type:** Master roadmap spec. Each phase below gets its own detailed spec + implementation plan before implementation.

## Problem

Processing Power has many ways to raise player competency (stats, tech, augments, implant,
bosses, challenges, gear, ascension, tripartite) but almost nothing that *consumes* that power
endlessly. The tripartite system — the game's NGU Energy/Magic analog — falls flat: a fixed
0.5/s virtual flow split by sliders into invisible log-curve bonuses, with no cap, no cost, and
no reason to ever revisit it. Players don't understand what it does. The game lacks NGU's
attention-demanding pull: the juggling, the walls, the "one more push" loop.

## Success criteria

1. **Comprehension** — a new player can say what each pool and destination does and why they'd
   reallocate. Al (companion AI) + redesigned UI make systems self-explanatory.
2. **Check-in pull** — there is always a merge, a reallocation, a warden push, or a titan window
   pending. Measured by feel and by the DATA tab's session stats.
3. **Idle respect** — returning after hours always presents meaningful gains and decisions
   (drops to triage, pools worth reassigning, walls newly breakable).
4. **The NGU feeling** — the personal bar: it recreates NGU Idle's fun for the owner.

## Pillars

1. **The Ladder** — endless enemy scaling (the demand side of power; the missing piece).
2. **Allocation pools** — capped, assignable resource pools replacing the tripartite.
3. **Inventory dilemma** — fixed-slot grid, merge/boost, overflow pressure.
4. **Al, the companion** — one AI companion first; teaches every system; broader cast later.
5. **Story bible + lore delivery** — the Kernel Heist arc; Mass Effect vibe, Stargate
   portal-network *concept* (not its lore); landing stays deliberate.
6. **Attention economy** — cadence layered by stage: frequent decisions early, punctuated
   check-ins late. Sinks and demands that scale with endless growth.

---

## 1. Story bible: Al & the Kernel Heist (Phase 0)

### Al

- Holographic companion projected by the ship's AI through the cyborg's optics — only the
  player sees him (Quantum Leap's Al, minus the cigar; PG-13 throughout).
- Carries a **handlink** — a chunky blinking data-pad he smacks when readings misbehave; his
  diegetic excuse for knowing numbers (later ties into the Mathematician/ROI system).
- **Lends a hand** occasionally (Crashlands' Juicebox energy): scripted assists on long
  cooldowns, not a combat pet (see §3 Assists).

### The Kernel Heist arc

1. **Discovery** — deep in the Mine at the Breach, the player uncovers the **Kernel**, an
   ancient computational core. Al's handlink goes haywire.
2. **The return** — quest: carry the Kernel to the spaceship and dock it. Docking **unlocks the
   allocation system** (§4) — the Kernel is the hardware that lets the cyborg route power.
3. **The raid** — scripted event at the Landing Site: space-pirates (PirateLizard cast) portal
   in. A *designed loss*: playable waves scale until overwhelming, Al narrates the futility
   early, then a cutscene shows the seizure — pirates haul the Kernel through a gate. This
   event introduces the portal network.
4. **Aftermath** — Al jury-rigs a partial substitute: allocation stays playable but tier-capped,
   and the jury-rig opens a second channel — the **Bandwidth** pool (§4) — so the designed loss
   also hands the player something new. The stolen Kernel becomes the long-term goal.
5. **Reclamation** — power gates (titans, gear, pool investment) lead to an assault on the
   **pirate world** (new portal-gated zone, PirateLizard boss = Titan #1). Reclaiming the
   Kernel restores full allocation power and unlocks the third pool.

### Acts

*Landing* → *The Kernel* → *The Raid* → *Muster* → *Reclamation* → *Act 6+ seeds* (what the
Kernel really is; broader NPC cast; the deeper network).

### Cutscenes (authored stills, not engine choreography)

Letterboxed, skippable sequences of 2–4 illustrated stills in the established Ghibli/ATLA style
with narration/Al text. Served as compressed derivatives (same decoded-memory discipline as the
icon pipeline). A small `CutsceneSystem` overlay handles sequencing, text, skip, and "seen"
save flags. Cutscene moments:

1. **The Landing** (Act 1 opener) — descent, first boot, Al's first materialization.
2. **Kernel discovery** — the Breach reveal needs awe the fixed ortho camera can't frame.
3. **The seizure** (Act 3 climax) — playable waves cut to stills at the overwhelm threshold;
   converts "I died" into narrative.
4. **The Breach awakens** — the portal network coming alive.
5. **Reclamation** (Act 5 payoff) — taking the Kernel back.
6. **Act 6 stinger** — tease of what the Kernel really is.

Everything between these stays in-engine.

### Phase 0 deliverable

`docs/story/story-bible.md`: Al's character sheet + voice guide with sample lines, act
structure, Kernel/pirate/portal canon, cutscene scripts, zone-lore alignment, PG-13
guardrails, and a casting sheet mapping creature GLBs (CaveCrab, Dunkraza, Reptlar,
Serpendrill, PirateLizard) to roles.

---

## 2. The Ladder: endless enemies for endless growth (Phase 1)

Recontextualize `ExpeditionSystem` (Field Ops) from 7 fixed tiers into an **infinite ladder**.

- **Scaling** — tier N enemy HP/damage scale exponentially (tunable constant, e.g. ×1.18/tier).
  Kills/sec stays deterministic: playerDPS ÷ tier enemy HP; survivability vs tier threat gates
  idling. No amount of growth runs out of wall; "highest idle-safe tier" becomes the single
  legibility number for all power systems.
- **Bands** — tiers group into bands of 10, each themed (scrapyard drones → cave fauna →
  pirate skirmishers → …). A band's roster draws from the 13 existing archetypes + creature
  GLBs, with tier-scaled stats and rank prefixes. Authoring a band = a data entry + at most
  one new model.
- **Family-aware ranks** — mechanical/constructed: *Rusted → Hardened → Overclocked → Prime →
  Quantum*. Organic: *Juvenile → Adult → Alpha → Elder → Apex → Primeval*. Roster entries
  declare family; the generator picks the ladder. Organic creatures never receive
  machine-flavored prefixes.
- **Push vs. idle** — idle at the safe tier accumulating kills/drops; **warden pushes** are a
  deliberate button press. Early game: pushes every few minutes. Later: hours-scale walls.
- **Drops** — the ladder is the drop faucet for the inventory grid (§5): equipment quality
  scales with tier; boost items drop throughout.
- **Titans** — named mega-bosses on real-time respawn windows (hours), fought **manually** in
  the 3D world. First-kills grant permanent bonuses. The pirate arc supplies the first titan
  family; Kernel reclamation wraps Titan #1.
- **Division of labor** — the ladder absorbs infinite scaling; 3D zone enemies stay hand-tuned
  for story/gathering roles; titans + raid events keep the 3D world mattering at endgame.

---

## 3. Al's engine (Phase 2)

- **`AlSystem.js`** — data-driven trigger engine; all content in `js/data/alDialogue.js` so
  later phases add entries without touching the engine. Trigger = event + conditions (`once`,
  cooldown, priority, prerequisites e.g. "act ≥ 2") + lines + optional assist action.
- **Launch trigger coverage** — first offload, first ascension, each panel's first open, zone
  first-visits, low-energy stranding, combat first-blood, idle-return summary (pairs with
  OfflineSystem), quest-chain beats.
- **Two presentation tiers** — (a) in-world **hologram** GLB (existing humanoid-rig recipe;
  fresnel/scanline teal holo treatment, materialize-in) for story beats and unlocks; (b)
  **comms bubble** (portrait + text, HUD corner) for quips — primary tier on the 375px mobile
  layout. Both skippable; a settings toggle tames chattiness.
- **Assists** — registry of scripted helps on long cooldowns, wired through main.js callbacks:
  **Spot** (pings an overlooked lootable/lore pickup), **Jolt** (staggers an enemy at critical
  player HP, once per several minutes), **Jumpstart** (energy top-up when stranded at zero).
- **Teaching layer** — first open of any panel: two-line plain-language explanation + expandable
  "tell me more". Each later phase ships its teaching entries in the same drop.
- **Plumbing** — instantiated in main.js; seen-triggers, cooldowns, act progress serialize via
  SaveSystem (v10). CutsceneSystem (§1) also lands in this phase.

---

## 4. Allocation pools (Phase 3) — the tripartite replacement

### Model

A pool is **N units you assign, not spend**. Assigned units work continuously in a destination;
withdrawal is instant and lossless. Two purchasable stats per pool (both PP sinks, exponential
cost curves): **Cap** (more units) and **Power** (each unit works faster).

### Pools (story-gated)

| Pool | Color | Unlock |
|---|---|---|
| **Compute** | teal | Kernel docks (Act 2) |
| **Bandwidth** | amber | Act 3 aftermath — Al's jury-rigged second channel |
| **Uplink** | gold | Kernel reclaimed (Act 5) |

### Destinations (competing — the juggling)

- **Compute:** *Combat Routines* (ladder DPS) · *Stat Training* (absorbs NeuralImplantSystem —
  one less silo, same mechanic) · *Drone Uplink* (drone efficiency) · *Refinery Overclock*
  (extractor/processing speed).
- **Bandwidth:** *Loot Protocol* (ladder drop quality) · *Shield Matrix* (survivability → tier
  pushing) · *Signal Sweep* (lore/titan-window discovery speed).
- **Uplink:** *Portal Attunement* (zone-wide bonuses) · *Kernel Decryption* (story-meta
  progress; consumes rare materials).

Caps start too small to cover two destinations well; "which two of seven" is the core dilemma,
re-asked at every ladder wall and prestige.

### UI

Replace the ALLOC tab with an **allocation board**: pool bars up top, destination rows with
**+ / − / MAX buttons** and a live rate preview per row ("+2.3 STR/hr", "+0.4 tiers/hr est.").
No sliders. Al teaches on unlock; the Kernel makes the unlock diegetic.

### Migration

`TripartiteSystem` is retired. Prior tripartite investments refund as free starting Cap levels.
Save v11 migration; ALLOC panel replaced (panel wiring tests updated); the hidden zone presence
bonus is removed.

---

## 5. Inventory grid (Phase 4)

- **Grid** — fixed slots, 24 at unlock, upgradeable to 64 (upgrades are PP + material sinks).
  Fills with **equipment and boost drops from the ladder** (plus titans and world bosses).
  Materials stay in the existing flat bags.
- **Items** — slot (the 8 equipment slots), band-themed name, level, rarity.
- **Merge** — two same-name items → one at (higher level + 1). Tap-select/tap-merge on mobile,
  drag on desktop.
- **Boosts** — consumable drops (Power / Guard / Aux) fed permanently into a chosen piece.
- **Overflow** — converts to scrap for a PP trickle: pressure without punishing sleep.
- **QoL sinks** — auto-trash filters and auto-boost are purchasable unlocks.
- **Loop closure** — gear power feeds ladder DPS/survivability: idle → drops → merge → push →
  better drops.
- **Crafting stays** for tools/world gear; a later **reforge bench** (materials + scrap →
  reroll gear) gives gathering an endgame sink.

---

## 6. Economy: sources, sinks, demands (cross-phase; tuned in Phase 6)

Endless growth needs sinks that scale endlessly and *demands* — reasons to show up and decide.

| | Sources | Scaling sinks |
|---|---|---|
| **PP** | passive rate, quests, kills, scrap | pool Cap/Power curves (the big new sink), stats, tech, grid slots, QoL unlocks, TimeWarp |
| **Materials** | gathering, drones, extractor, delves, expedition | reforging, Kernel Decryption, grid-slot upgrades |
| **Attention** | — | warden pushes (chosen), titan windows (hours-scale), pirate raid rematches, pool reallocation at every wall/prestige, inventory triage, challenges |

- **Pirate raid rematches** — recurring incursion events at the Landing Site (defend gear/scrap
  stores); keeps the 3D world demanding after the story raid.
- **Challenges expanded** — TRIALS gains NGU-style named runs, repeatable at rising difficulty
  for stacking permanent multipliers: *No-Offload*, *Frugal* (no PP on stats), *Pacifist
  Ladder* (gear only from world content), *Blind* (Al offline — his absence is the difficulty).

---

## 7. Consistency audit (Phase 0 groundwork + sweep)

- **Verified hole:** surface boulders require the Rock Drill (`main.js` gather path) and
  specialty nodes require zone tools, but Mine tile-rocks (`props`-driven `drillRock` path)
  require **no tool**. Fix: rock drilling requires the Rock Drill everywhere, including the
  Mine; amend the First Contact quest chain so the drill is crafted before "Travel to The
  Mine".
- **Sweep checklist (executed during Phase 0):** tree/terrain-cutter consistency across zones;
  energy-cost parity between surface and mine drilling; portal gate messaging (PP vs pedometer
  unlock paths presented coherently); any other tool/energy asymmetries found while sweeping
  the gather/drill code paths.

---

## Phasing

| Phase | Delivers | Save |
|---|---|---|
| 0 | Story bible (writing) + groundwork consistency fixes | — |
| 1 | The Ladder: endless tiers, bands, family ranks, titan framework | v10 |
| 2 | Al + cutscenes: trigger engine, teaching layer, Landing cutscene | v11 |
| 3 | Allocation pools: Kernel questline, tripartite migration, board UI | v12 |
| 4 | Inventory grid: drops live, merge/boost, overflow scrap | v13 |
| 5 | Raid & Reclamation: raid event, pirate world zone, Titan #1, Uplink pool | v14 |
| 6 | Challenges + economy tuning + lore delivery (data pads, Act 6 seeds) | v15 if schema changes, else v14 |

Mechanics lead (Ladder first) per user feedback; Al arrives before the pools so the teaching
layer exists when the biggest new system lands; story beats land with the systems they unlock.
Each phase gets its own detailed spec and implementation plan before any code.

## Testing

- Node tests: ladder math (tier scaling, seeded drop rolls), pool cost curves + rate-preview
  math, merge logic, Al trigger engine (once/cooldown/priority/prereq), dialogue lint (every
  trigger references a real event).
- Existing wiring tests extend: new zone (pirate world) through `zoneWiring.test.js`; new/replaced
  panels through `panelWiring.test.js`.
- A headless progression sim script to sanity-check wall pacing before each balance pass.

## Out of scope (this roadmap)

Wishes / long-term goal system; third prestige layer; broader NPC cast beyond seeds (deferred
by user choice — Al first); farming/fishing/taming breadth pillars (post-NGU-parity per
`Plans/` priority).

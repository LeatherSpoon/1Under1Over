# STATUS — read me first

Session-start brief for **Processing Power**. CLAUDE.md explains how the project *works*; this file says where things *stand right now*. Any session that changes the project (code, assets, docs, or a decision) must update this file before finishing — rules in CLAUDE.md → "Keeping STATUS.md current".

**Last updated:** 2026-07-20

## Where the work lives (branch map)

- **`remove-old-enemies-creature-assets` ← ACTIVE WORK BRANCH** (tip `2915315`) = master + 5 commits: god-mode Endgame_Test save, Serpendrill re-rig, 5-creature roster replacing robot archetypes, cloud autosave + playtest round, and the **reference-integration build** (saves v10→v13: dead multipliers wired, infinite Simulation Ladder, Recompile/Archive prestige, Chapter Chain level spine, hold-PP zone gates deleted). `ChapterSystem.js` and `TrainingAreaSystem.js` exist only here, as do the mission docs: `Plans/Integration-Design.md` (build order of record), `Plans/DESIGN-DECISIONS.md`, `Plans/ProcessingPower-Systems-Inventory.md`, six design references.
- **`master`** — Mine-overhaul era; tip `1634b7d` (NGU-feel roadmap spec), **1 commit ahead of origin/master (unpushed)**. Currently checked out, which is why none of the above is visible in the working tree.
- `endgame-test-godmode` — points mid-branch (`724a8b4`); superseded by the work branch.

⚠ Before continuing systems work, check out `remove-old-enemies-creature-assets` (or merge it) — building on master forks the reference-integration work.

## Current focus

Executing the 7-phase build order in `Plans/Integration-Design.md` (on the work branch). Done: **A** wire dead multipliers (v10) · **B** Simulation Ladder (v11) · **C** Recompile/Archive (v12) · **D pt 1** Chapter Chain (v13). All shipped in `2915315`, 188/188 tests at last run.

## Next up

1. Phase D remainder — story-boss telegraph/dodge (design §11: every-Nth heavy attack telegraphed, DODGE button in CombatUI; stats = toll baseline, dodge = execution skill).
2. Phase E — Compute/Al board, stocked-offline, factory hoppers (save v14).

## Open threads & standing constraints

- Owner wants **action over questions** — make calls, mark them vetoable, build (`Plans/DESIGN-DECISIONS.md` logs all decisions).
- PP economy = flow-with-bottlenecks, never ambient emission; combat-PP issues ON HOLD; Endgame_Test god save is for feature testing only, never balance numbers.
- Corrosion stays cosmetic (owner vetoed the defense-penalty wiring).
- Leonardo.ai credits lapsing — burn them on game assets whenever art work comes up.

## Doc freshness

Live: this file · `Plans/Integration-Design.md` + `Plans/DESIGN-DECISIONS.md` (work branch). Historical — do **not** trust for current state: `docs/for-future-claude.md` (April 2026; the gotcha/user-style sections are still good), `Plans/game_analysis.md`, `Direction.md`, `implementation_plan.md`, `TRIPARTITE_SESSION_WRITEUP.md`, `docs/superpowers/specs/2026-07-07-ngu-feel-roadmap-design.md` (superseded by Integration-Design).

## Session log (newest first — keep ≤10, prune the rest)

- 2026-07-20 — Built this orientation system (STATUS.md + upkeep rule in CLAUDE.md/AGENTS.md) after mapping the branch split: v10–v13 work lives on `remove-old-enemies-creature-assets`, not master. No game code touched.

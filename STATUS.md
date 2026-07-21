# STATUS — read me first

Session-start brief for **Processing Power**. CLAUDE.md explains how the project *works*; this file says where things *stand right now*. Any session that changes the project (code, assets, docs, or a decision) must update this file before finishing — rules in CLAUDE.md → "Keeping STATUS.md current".

**Trust git over this file for volatile facts.** After reading, run `git status` + `git log --oneline -5`; if they disagree with anything here, fixing this file is the session's first task.

**Last updated:** 2026-07-20

## Where the work lives

- **`main`** — the only work branch (consolidated 2026-07-20: renamed from `remove-old-enemies-creature-assets`, every other branch deleted per owner's single-line-of-work call; origin/main matches). Contains everything, including the **reference-integration build** (`2915315`, saves v10→v13: Simulation Ladder, Recompile/Archive, Chapter Chain).
- **`master` / origin/master** — stable target. Does **not** have the reference build; GitHub's PR #3 merge was an older, pre-build branch tip — don't let it fool you. Don't build here.
- **Pending:** PR `main` → `master`, title "Merge the reference integration build". User creates it at github.com/LeatherSpoon/1Under1Over/compare/master...main (agent browser sign-in timed out).

## Current focus

Executing the 7-phase build order in `Plans/Integration-Design.md`. Done: **A** wire dead multipliers (v10) · **B** Simulation Ladder (v11) · **C** Recompile/Archive (v12) · **D pt 1** Chapter Chain (v13). All in `2915315`, 188/188 tests at last run.

## Next up

1. Phase D remainder — story-boss telegraph/dodge (design §11: every-Nth heavy attack telegraphed, DODGE button in CombatUI; stats = toll baseline, dodge = execution skill).
2. Phase E — Compute/Al board, stocked-offline, factory hoppers (save v14).

## Open threads & standing constraints

- PR main → master not yet created (see above).
- Owner wants **action over questions** — make calls, mark them vetoable, build (`Plans/DESIGN-DECISIONS.md` logs all decisions).
- PP economy = flow-with-bottlenecks, never ambient emission; combat-PP issues ON HOLD; Endgame_Test god save is for feature testing only, never balance numbers.
- Corrosion stays cosmetic (owner vetoed the defense-penalty wiring).
- Leonardo.ai credits lapsing — burn them on game assets whenever art work comes up.

## Doc freshness

Live: this file · `Plans/Integration-Design.md` + `Plans/DESIGN-DECISIONS.md`. `AGENTS.md` is now a stub deferring to CLAUDE.md (its old body had rotted eras stale). Historical — do **not** trust for current state: `docs/for-future-claude.md` (April 2026; the gotcha/user-style sections are still good), `Plans/game_analysis.md`, `Direction.md`, `implementation_plan.md`, `TRIPARTITE_SESSION_WRITEUP.md`, `docs/superpowers/specs/2026-07-07-ngu-feel-roadmap-design.md` (superseded by Integration-Design).

## Session log (newest first — keep ≤10, prune the rest)

- 2026-07-20 — Branch consolidation: work branch renamed → `main`, force-pushed, all other branches deleted; PR main→master pending. Brief rewritten to carry intent instead of volatile git facts; AGENTS.md stubbed; git cross-check added to the session-start rule.
- 2026-07-20 — Built the orientation system (STATUS.md + upkeep rules in CLAUDE.md); committed on master (`ce19b77`), merged into the work branch. No game code touched.

# STATUS — project map (read me first)

One read to see the whole folder: what lives where, which docs are live, and where the work stands. CLAUDE.md (auto-loaded) is the deep guide to *how* systems work — this file is the *where*. Keep-current rules: CLAUDE.md → "Keeping STATUS.md current".

**Last updated:** 2026-07-20 (Phase E shipped)

## Where the work stands

- **Reference-integration build** — phases A–E shipped (saves v10→v14). E (2026-07-20): Compute allocation board in ALLOC (Al's attention pool; 0 units = system paused, extras boost output), Al modules (Key Tracker / Overflow Routing / Farm Director / Foreman), factory input hoppers + processing-queue persistence, drone mission queues, stocked-offline rework (full rate when stocked, DORMANT rows when not; 12 h base buffer). Build calls + deferrals (output buffers, storage caps, Triage) in DESIGN-DECISIONS.md. 229/229 tests at last run.
- **Next:** Phase F — skill web with use-XP, stat-purchase retirement (`Plans/Integration-Design.md` §6/§13, save v15). Riskiest diff of the plan — touches every interaction site.
- **Git:** single work branch `main`; PR #4 (main→master) merged 2026-07-20 — master will want a follow-up merge to pick up Phase E. For anything else about branches, ask git — not this file.

## Folder map

```
index.html            SPA shell — all panel HTML lives here
js/
  main.js             bootstrap, game loop, ALL cross-system wiring (callbacks)
  config.js           every tunable constant
  systems/            41 gameplay systems, one class per file (save, PP, combat,
                      crafting, prestige, ladder, chapters, compute…) — CLAUDE.md's
                      key-files table maps concern → file
  scene/              3D world: Environment.js (all zone building), zones/ (per-zone
                      builders + Mine generator), ToonMaterials.js, SceneManager.js
  entities/           Player, Enemy (archetypes + bosses), ResourceNode, EntityManager
  ui/                 HUD.js (every panel) + CombatUI, SkillsMenu, portraits
  input/ fx/ util/    touch/keys · particles/popups · NumberFormat
  sync/               SyncClient — localStorage queue → optional server
  vendor/             Three.js (importmap target; no build step)
css/                  stylesheets
models/               22 runtime .glb (player, creatures, bosses, portal, MineKit, props)
Assets/               source art: 3D/ (Blender sources), Inventory/ (1024px icon art +
                      icons/ 128px served), Video/ (training chamber), SVG/, fonts/
server/               OPTIONAL Express+Postgres sync API: db/migrations/, definitions/
                      (seed data = content defs), repositories/, services/
tests/                npm test → runAll: wiring enforcers (zoneWiring, panelWiring),
                      mine generator/layout, systems/, ui/, server/, sync/
Sessions/             test saves: Endgame_Test.json (god save — feature testing ONLY),
                      Midgame_Test.json
Plans/                design work — see doc index below
docs/                 for-future-claude.md + superpowers/ (spec-era plans & specs)
start-node.bat        serve :8080 (required — file:// is blocked)
start-mobile.bat      LAN serve for phone + QR; append ?debug for on-device console
```

Root oddballs: `combine-js-to-md.ps1` regenerates the `*_compact.txt` / `all-in-one.txt` source dumps (for pasting into LLMs); `codebase-explainer.html` is an older visual codebase map (unmaintained); `New Text Document.txt` is empty; `Telemetry.txt` is a scratch log.

## Doc index

**Live — trust these**
- `CLAUDE.md` — architecture, wiring checklists, gotchas (auto-loaded every session)
- `Plans/Integration-Design.md` — **build order of record**: 7 phases + formulas
- `Plans/DESIGN-DECISIONS.md` — every design decision and veto, logged
- `Plans/ProcessingPower-Systems-Inventory.md` — code-level inventory of every system: formulas + wiring health

**Stable reference**
- `Plans/*-Design-Reference.md` — six studied games (NGU, FAPI, Idle Spiral, RuneScape, TPT2, Crashlands) that feed Integration-Design
- `docs/for-future-claude.md` — April 2026; gotcha and working-style sections still good, state sections stale

**Historical — do NOT trust for current state**
`Plans/7-21-to-do` (the Phase E kickoff prompt — executed and shipped 2026-07-20) · `Plans/NEXT-SESSION-KICKOFF.md` (mission complete) · `Plans/game_analysis.md` (superseded by Systems-Inventory) · `Direction.md` · `implementation_plan.md` · `TRIPARTITE_SESSION_WRITEUP.md` · `docs/superpowers/specs/2026-07-07-ngu-feel-roadmap-design.md` (superseded by Integration-Design) · `Plans/*.txt` brainstorms · `July3Plan.docx`

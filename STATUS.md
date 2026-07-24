# STATUS — project map (read me first)

One read to see the whole folder: what lives where, which docs are live, and where the work stands. CLAUDE.md (auto-loaded) is the deep guide to *how* systems work — this file is the *where*. Keep-current rules: CLAUDE.md → "Keeping STATUS.md current".

**Last updated:** 2026-07-23 (asset round + boot-render fixes)

## Where the work stands

- **Asset + boot-fix round (2026-07-23):** 8 new Rodin-generated props (hyper3d.ai text-to-3D via blender-mcp free-trial key) — grounded scout ship at the Landing Site, Ghibli_Tree_D, Mossy_Boulder, plus the five formerly-404 slots (Rock_Cluster, Watchtower, Supply_Crate, Fuel_Barrel, Cyborg_PC) now real files. Blender source: `Assets/3D/LandingProps/LandingProps.blend`. Fixed: sticky sessionStorage model-failure cache (portals could vanish forever in a tab), enemies/nodes now rebuild in place when their GLB finishes loading (no more procedural bodies on boot), portals show a teal fallback ring while their model loads, inverted-hull outlines floored at 0.045 world units so small props (nodes, rocks) aren't outline-less. Round 2: boot overlay gates first paint until GLBs parse (no fallback flash), Rodin props re-shaded to toon in `cloneModel` (no PBR shine) + auto-hulled, lump tree replaced by an oak generated from the owner's reference image (image-to-3D). Round 3: old trees A–C retired; baked flipped-normal outline shells replace runtime hulls on trees (runtime hulls speckle on organic meshes). Round 4: camera pitch 69°→46° (`CAMERA_OFFSET`) so the world reads in profile; forest rebuilt from the owner's three reference images (`Ghibli_Tree_D/H/I/J` = oak/broadleaf/windswept/spruce, weighted pool; E–G retired same-day). Rounds 5–9: tree outlines rebuilt — TreeH now uses a strictly-containing low-poly envelope hull (`Assets/3D/LandingProps/hull_envelope.py`: bold continuous band, interior artifacts geometrically impossible from any angle), the multi-lobed trees (I/J/D) keep err-inward smooth cages with per-tree ink weight (`hull_rebake.py`); TreeI's six free-floating canopy islands bridged to the trunk with real modeled branches (the Rodin mesh shipped as 12 disconnected pieces); `Ghibli_Tree_H2.glb` = cavity-ink variant (crevice depth painted into the texture from the distance-to-envelope field, `cavity_ink.py`) placed at the Landing Site path tree for owner A/B — adopt/tune/revert pending.
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
models/               30 runtime .glb (player, creatures, bosses, portal, MineKit, props)
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

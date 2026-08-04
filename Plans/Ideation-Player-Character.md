# Ideation — Player Character

Ledger from the 2026-08-03 player-character round (`/add-assets`): what shipped, and ranked ways to push the character further. Owner picks; nothing below is committed work.

## Shipped this round

- **Task animations**: Gather (crouched collecting at resource nodes), Swing (overhead tool strike while clearing trees / drilling rocks), Attack + Flinch (combat one-shots), all authored on the existing rig inside `models/Player.glb`.
- **Visible equipment**: crafted gear now shows on the body — blades and shield holster on the back out of combat and jump to the fist/forearm in combat; spike knuckles worn on the fist; chest armor with a tier-tinted accent (`TIER_ACCENT` in `js/entities/Player.js` — colors are provisional, the tier→color meaning is an owner lever).
- **Held tools**: the rock drill / energy cutter appear in hand during the matching gather.
- **Sparring drill**: at the Combat Sim rig the character now throws real practice strikes instead of only jogging in place.
- **Smooth turning**: shortest-arc easing replaced the instant facing snap.

## Proposed next (ranked: payoff ÷ effort)

1. **Blob shadow** — a soft dark disc under the character (and maybe enemies/NPCs). The game casts no real shadows, so nothing grounds bodies against the floor at the 46° camera. ~30 lines + a visual pass per floor family (watch reveal-shaded cave floors). Cheap, big read improvement.
2. **Combat uses the 3D actors** — combat resolves in the full-screen overlay, so the new Attack/Flinch clips (and the blade-to-hand swap) are invisible mid-fight today. When **M1 (breakaway combat window)** lands, frame the real player + enemy models in the window (side diorama or lower-third cutout) — the clips are authored, wired, and waiting. This is the natural M1 art payoff.
3. **Low-energy posture** — below ~20% energy, slow the idle/run timeScale slightly and dim the suit's teal glow trims. Telegraphs the energy system on the body itself. Small.
4. **Head slot content** — the equipment system has a `head` slot but no head items exist. One crafted "Scout Visor" (recipe + a small GLB visor on the head bone) makes the slot real and gives another visible progression beat. Medium-small.
5. **Idle fidgets** — a second idle variation (look-around / stretch) every ~20 s so the character feels alive while parked. One more authored clip on the established pipeline.
6. **Hit feedback flash** — on Flinch, pulse the body material's emissive briefly (red tint). Pairs with the flinch clip for future visible combat.
7. **Footstep dust puffs** — small particle puffs on run footfalls (fx/ pool exists). Nice with the smooth turning; tune so it doesn't read as noise.
8. **Suit color customization** — accent recolor lever for the player suit (capability first, owner dictates meaning later — same philosophy as gear tiers). Needs a texture-region mask or material split in Blender first.
9. **Attack variety** — mirror or retime the Attack clip for alternating slash directions per strike once combat is visible.

## Asset-folder housekeeping (flagged, not done)

- `Assets/3D/ArmadillOMG.glb` and `Assets/3D/Hard_Lizzy1.glb` are **unprocessed Rodin creature raws** (17 MB each, no rig) — candidates for a future `/add-assets` creature round (what zone wants an armadillo?).
- `Assets/3D/3DPlayer.glb` and `Assets/3D/Dunkraza1.glb` are the already-shipped sources of `models/Player.glb` / `models/Dunkraza.glb` — archive or move into subfolders so the unprocessed-asset diff stays clean.

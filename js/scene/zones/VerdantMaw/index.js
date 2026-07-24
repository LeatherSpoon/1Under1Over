/**
 * Verdant Maw zone — dense alien jungle under a closed canopy: towering
 * canopy trees, vine-draped banyans, giant ferns, carnivorous maw plants,
 * and an overgrown idol (all GLB props placed via ZoneAssets). The builder
 * itself lays the ground and the Maw-tender NPCs; the zone's humid mood
 * comes from the verdantMaw ZONE_AMBIENCE preset.
 *
 * ── Connections ───────────────────────────────────────────────────────────────
 *   mine  →  (0, 17)  always unlocked (return to portal hub)
 */
export function build(env) {
  env._addGround(0x3f7d2c); // sunlit jungle floor

  // ── Connections ───────────────────────────────────────────────────────────
  env._addPortal(0, 17, 'mine', 0, 'Mine Hub');
  env._addReturnBeacon(0, 17);

  // ── Maw-tender hamlet — the plant-folk who keep the old grove ────────────
  // Homes are ZoneAssets props in the NW clearing; each tender idles beside
  // their door, turned toward the path into the hamlet. (Sprig's seed-drone
  // ring is part of the Npc_Sprig model itself.)
  env._addNpc('npcSylva', -11.4, 9.0,  { rotY: 2.3 });          // Elder Sylva
  env._addNpc('npcBram',  -6.4,  12.3, { rotY: 2.6 });          // Grovekeeper Bram
  env._addNpc('npcSprig', -15.3, 13.0, { rotY: 2.0, r: 0.35 }); // Sprig

  // Doorsteps — each mat E-prompts into that home's interior zone; the
  // interior's exit doorway spawns the player back on this same doorstep.
  env._addDoorway(-10.6, 9.8,  'homeSylva', "Sylva's Den");
  env._addDoorway(-7.45, 11.6, 'homeBram',  "Bram's Lodge");
  env._addDoorway(-13.0, 13.0, 'homeSprig', "Sprig's Burrow");
}

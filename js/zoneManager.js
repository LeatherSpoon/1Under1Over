import { MINE_SPAWN_POS } from './scene/zones/Mine/layout.js';
import { getPlayerBounds } from './config.js';

export const ZONE_TERRAIN = {
  landingSite: 'grass',
  mine: 'rock',
  verdantMaw: 'forest',
  lagoonCoast: 'grass',
  frozenTundra: 'rock',
  glacialHollow: 'rock',
  meltwaterRift: 'rock',
  labyrinth: 'rock',
  cinderforge: 'rock',
  atlantis: 'rock',
  spaceship: 'rock',
  workspace: 'rock',
  depths: 'rock',
  homeSylva: 'rock',
  homeBram: 'rock',
  homeSprig: 'rock',
  computerCore: 'rock',
};

// Per-zone player spawn positions — places player near the entry/exit portal
export const ZONE_SPAWN_POS = {
  landingSite:  [0, 0],
  mine:         [MINE_SPAWN_POS.x, MINE_SPAWN_POS.z],
  verdantMaw:   [0, 14],
  lagoonCoast:  [15, 0],
  frozenTundra: [0, -15],
  glacialHollow: [0, -13],
  meltwaterRift: [0, -13],
  atlantis:     [0, -13],
  labyrinth:    [0, 22],
  cinderforge:  [0, 22],
  spaceship:    [0, -3],
  workspace:    [0, 7],
  depths:       [0, -4],
  homeSylva:    [0, 2.6],
  homeBram:     [0, 2.6],
  homeSprig:    [0, 2.6],
  computerCore: [0, 0], // never-hit fallback — real entry arrives via the door's spawnOverride
};

export function createSwitchZone({
  gameStats, sceneManager, env, player, entityManager, hud, pedometer, ppSystem,
  bossSystem = null,
  mineDelve = null,
  onAfterSwitch,
}) {
  // spawnOverride ([x, z], optional) lands the player somewhere other than the
  // zone default — doorways use it so leaving a home returns to its doorstep.
  return function switchZone(zoneName, spawnOverride = null) {
    // Delve lifecycle: descending into the Mine from the surface re-rolls the
    // cave; surfacing arms the next descent. Entering the Mine from The Depths
    // keeps the same delve. This runs before env.switchZone so the builder sees
    // the correct seed.
    if (mineDelve) {
      if (zoneName === 'mine' && mineDelve.armed) mineDelve.startNewDelve();
      if (zoneName === 'landingSite') mineDelve.arm();
    }

    gameStats.recordZoneVisit(zoneName);
    sceneManager.scene.remove(player.group);
    env.switchZone(zoneName);
    sceneManager.setZoneAmbience(zoneName);
    sceneManager.scene.add(player.group);

    const spawnPos = spawnOverride || ZONE_SPAWN_POS[zoneName] || [0, 0];
    player.teleportTo(spawnPos[0], spawnPos[1]);
    player.currentTerrain = ZONE_TERRAIN[zoneName] || 'grass';
    player.bounds = getPlayerBounds(zoneName);

    // Snap the camera onto the spawn — the follow lerp would otherwise glide
    // visibly from the old zone's camera position across the new zone.
    sceneManager.snapToPlayer(player.position);

    entityManager.spawnForZone(env.getEnemySpawns(), env.getResourceNodeSpawns());
    hud.setZoneLabel(env.getZoneLabel());
    env.refreshTrackMarkers(pedometer);
    env.refreshPortalAccess((portal) =>
      portal.ppRequired === 0
      || pedometer.isZoneUnlocked(portal.targetZone)
      || (bossSystem && bossSystem.hasClearance(portal.targetZone))
    );

    player.isGathering = false;

    // Program-cache bucketing: THREE bakes the scene's point-light COUNT into
    // every shader program, so each distinct count compiles a whole fresh
    // program set on first sight (~2-3 s of shader compiles — the bulk of the
    // first-visit switch cost). Padding every zone's count up to a small set
    // of buckets with dead lights makes zones SHARE compiled programs: once
    // one zone of a bucket has been visited, every other zone in that bucket
    // switches warm. Counted after spawns so nothing shifts the total later.
    // (Lives in SceneManager — this module stays three-import-free for tests.)
    sceneManager.padZonePointLights(env.group);

    if (onAfterSwitch) onAfterSwitch();

    // Warm-up, two tiers (the zone-switch delay fix, 2026-07-29):
    //   1. Render the ARRIVAL view once, synchronously, on this covered
    //      frame — the programs and buffers the player is about to see
    //      compile/upload now. Cheap, because the boot pass pre-compiled the
    //      common program matrix (shaderWarm.js), pre-uploaded every GLB
    //      buffer + texture, and padZonePointLights above keeps this zone on
    //      a shared program bucket.
    //   2. Everything else in the zone compiles ASYNCHRONOUSLY on the
    //      driver's parallel threads — no main-thread freeze, no held-black
    //      cover. Offscreen zone-merged meshes upload as they scroll in
    //      (small, now that their programs are ready).
    // The old zoomed-out sync warm render drew the WHOLE zone here instead:
    // 0.5–2.5 s of frozen main thread on every first visit (owner: "time
    // between changing scenes").
    const cam = sceneManager.camera;
    if (cam && sceneManager.renderer) {
      sceneManager.renderer.render(sceneManager.scene, cam);
      if (sceneManager.renderer.compileAsync) {
        sceneManager.renderer.compileAsync(sceneManager.scene, cam).catch(() => {});
      }
    }
  };
}

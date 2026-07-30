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
  atlantis: 'rock',
  spaceship: 'rock',
  workspace: 'rock',
  depths: 'rock',
  homeSylva: 'rock',
  homeBram: 'rock',
  homeSprig: 'rock',
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
  spaceship:    [0, -3],
  workspace:    [0, 7],
  depths:       [0, -4],
  homeSylva:    [0, 2.6],
  homeBram:     [0, 2.6],
  homeSprig:    [0, 2.6],
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

    // Warm-up render: zoom far out so every object in the new zone passes the
    // frustum once — shader programs compile and textures upload NOW, on this
    // covered frame, instead of hitching one by one as they scroll into view.
    const cam = sceneManager.camera;
    if (cam && sceneManager.renderer) {
      const prevZoom = cam.zoom;
      cam.zoom = 0.02;
      cam.updateProjectionMatrix();
      sceneManager.renderer.render(sceneManager.scene, cam);
      cam.zoom = prevZoom;
      cam.updateProjectionMatrix();
    }

    if (onAfterSwitch) onAfterSwitch();
  };
}

import { MINE_SPAWN_POS } from './scene/zones/Mine/layout.js';

export const ZONE_TERRAIN = {
  landingSite: 'grass',
  mine: 'rock',
  verdantMaw: 'forest',
  lagoonCoast: 'grass',
  frozenTundra: 'rock',
  spaceship: 'rock',
  workspace: 'rock',
  depths: 'rock',
};

// Per-zone player spawn positions — places player near the entry/exit portal
export const ZONE_SPAWN_POS = {
  landingSite:  [0, 0],
  mine:         [MINE_SPAWN_POS.x, MINE_SPAWN_POS.z],
  verdantMaw:   [0, 14],
  lagoonCoast:  [15, 0],
  frozenTundra: [0, -15],
  spaceship:    [0, -3],
  workspace:    [0, 7],
  depths:       [0, -4],
};

export function createSwitchZone({
  gameStats, sceneManager, env, player, entityManager, hud, pedometer, ppSystem,
  onAfterSwitch,
}) {
  return function switchZone(zoneName) {
    gameStats.recordZoneVisit(zoneName);
    sceneManager.scene.remove(player.group);
    env.switchZone(zoneName);
    sceneManager.scene.add(player.group);

    const spawnPos = ZONE_SPAWN_POS[zoneName] || [0, 0];
    player.teleportTo(spawnPos[0], spawnPos[1]);
    player.currentTerrain = ZONE_TERRAIN[zoneName] || 'grass';

    entityManager.spawnForZone(env.getEnemySpawns(), env.getResourceNodeSpawns());
    hud.setZoneLabel(env.getZoneLabel());
    env.refreshTrackMarkers(pedometer);
    env.refreshPortalAccess((portal) =>
      ppSystem.ppTotal >= portal.ppRequired || pedometer.isZoneUnlocked(portal.targetZone)
    );

    player.isGathering = false;
    if (onAfterSwitch) onAfterSwitch();
  };
}

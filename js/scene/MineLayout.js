import {
  MINE_PORTAL_POS,
  MINE_SPAWN_POS,
  MINE_ZONE_PORTALS,
  getMineableWallBlocks,
} from './zones/Mine/layout.js';

export {
  MINE_PORTAL_POS,
  MINE_SPAWN_POS,
  MINE_ZONE_PORTALS,
  getMineableWallBlocks,
};

const PLAYER_R = 0.35;
const MINE_BLOCK_HALF_WIDTH = 1.6;
const MINE_BLOCK_COLLISION_R = (MINE_BLOCK_HALF_WIDTH * Math.SQRT2) - PLAYER_R;

export function getMineCollisionCircles() {
  return getMineableWallBlocks().map(block => ({
    x: block.x,
    z: block.z,
    r: MINE_BLOCK_COLLISION_R,
    kind: block.isBorder ? 'mine-border-wall' : 'mine-wall',
  }));
}

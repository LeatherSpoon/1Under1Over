// Pure lookup rules for the Mine's modular GLB kit (no three import — Node-testable).
// Piece names must match the object names exported in models/MineKit.glb.

export const WALL_REGION_PIECES = {
  entrance: ['wall_worked_a', 'wall_worked_b'],
  shaft:    ['wall_worked_a', 'wall_worked_b'],
  cavern:   ['wall_rock_a', 'wall_rock_b', 'wall_rock_c'],
  passage:  ['wall_passage_a', 'wall_passage_b'],
  breach:   ['wall_breach_a', 'wall_breach_b'],
};

export const ORE_PIECES      = ['ore_rock_a', 'ore_rock_b'];
export const STAL_PIECES     = ['stalagmite_a', 'stalagmite_b'];
export const CRYSTAL_PIECES  = ['crystal_a', 'crystal_b'];
export const RUBBLE_PIECES   = ['rubble_a'];

/** roll in [0,1) → deterministic variant pick. */
export function pickWallPiece(region, roll) {
  const pieces = WALL_REGION_PIECES[region] || WALL_REGION_PIECES.cavern;
  return pieces[Math.min(pieces.length - 1, Math.floor(roll * pieces.length))];
}

/** GLB material name → game shader kind. Glow names stay emissive (MeshBasic). */
export function materialKindFor(name) {
  return /vein|rune|crystal|glow/i.test(name || '') ? 'emissive' : 'reveal';
}

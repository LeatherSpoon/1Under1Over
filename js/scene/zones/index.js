/**
 * Zone barrel — re-exports every world builder under a named alias.
 *
 * Usage in Environment.js:
 *   import { buildLandingSite, buildMine, ... } from './zones/index.js';
 *
 * Adding a new world:
 *   1. Create js/scene/zones/MyWorld/index.js  (export function build(env) {...})
 *   2. Add one line below:  export { build as buildMyWorld } from './MyWorld/index.js';
 *   3. Add one import + one case in Environment.js switchZone()
 */
export { build as buildLandingSite  } from './LandingSite/index.js';
export { build as buildMine         } from './Mine/index.js';
export { build as buildDepths       } from './Depths/index.js';
export { build as buildVerdantMaw   } from './VerdantMaw/index.js';
export { build as buildLagoonCoast  } from './LagoonCoast/index.js';
export { build as buildFrozenTundra } from './FrozenTundra/index.js';
export { build as buildSpaceship    } from './Spaceship/index.js';
export { build as buildWorkspace    } from './Workspace/index.js';

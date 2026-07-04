/**
 * ZoneAssets.js — Data-driven GLB prop placements per zone.
 *
 * To add or move an asset in a zone, edit the array for that zone below.
 * Each entry shape: { model, x, z, scale, rotY?, r? }
 *   model  — key matching a loaded GLB in Environment._glb
 *   x / z  — world-space position on the XZ plane
 *   scale  — uniform scale applied to the cloned model
 *   rotY   — (optional) Y-axis rotation in radians, defaults to 0
 *   r      — (optional) collision circle radius in world units; omit for
 *             purely decorative props the player can walk through
 *
 * Typical radii by model type:
 *   boulder  0.75   tower  0.9   rock (cluster)  0.75
 *   tree     0.6    crate  0.5   barrel          0.35   pc  0.5
 *   blueBoulder 0.75   redRock 0.75   firePlant 0.5
 *
 * To add a new model type:
 *   1. Add its GLB to models/ (e.g. models/MyProp.glb) — if that path 404'd
 *      earlier in the same tab, failures are cached in the 'pp.missingModels'
 *      sessionStorage key; clear it (or use a new tab) so the loader retries
 *   2. Add it to the loadModel() list in Environment constructor (_modelsReady)
 *   3. Add the key to the _glb destructure in the .then() callback
 *   4. Reference the key here with { model: 'myProp', ... }
 */

export const ZONE_ASSETS = {
  // ── Landing Site ────────────────────────────────────────────────────────────
  landingSite: [
    { model: 'tower',   x: -7,   z: -6,  scale: 0.9,  rotY: Math.PI * 0.75, r: 0.9  },
    { model: 'crate',   x: 2,    z: 3,   scale: 0.55, rotY: 0.4,            r: 0.5  },
    { model: 'crate',   x: -2,   z: 2,   scale: 0.5,  rotY: 1.1,            r: 0.5  },
    { model: 'tree',    x: 6,    z: 10,  scale: 0.8,  rotY: 0.5,            r: 0.6  },
    { model: 'tree',    x: -5,   z: 12,  scale: 0.9,  rotY: 2.1,            r: 0.6  },
    { model: 'tree',    x: 11,   z: -2,  scale: 0.75, rotY: 0.9,            r: 0.6  },
    // Boulders — placed near the forest perimeter and path edges
    { model: 'boulder', x: -4,   z: 7,   scale: 0.85, rotY: 0.3,            r: 0.75 },
    { model: 'boulder', x: 9,    z: 5,   scale: 0.7,  rotY: 1.9,            r: 0.75 },
    { model: 'boulder', x: -8,   z: -5,  scale: 0.65, rotY: 0.8,            r: 0.75 },
  ],

  // ── The Mine ────────────────────────────────────────────────────────────────
  // Entrance chamber sits around (0,-30); working cavern spans z≈-10…13.
  // Keep the x=0 spine (entrance → shaft → cavern) clear of collision props.
  mine: [
    { model: 'barrel',  x: 3.4,   z: -30.5, scale: 0.6,  rotY: 0.3,  r: 0.35 },
    { model: 'barrel',  x: -3.8,  z: -31,   scale: 0.55, rotY: 1.8,  r: 0.35 },
    { model: 'crate',   x: -4.6,  z: -29,   scale: 0.5,  rotY: 0.9,  r: 0.5  },
    { model: 'barrel',  x: -12.6, z: 1.2,   scale: 0.5,  rotY: 0.9,  r: 0.35 },
    { model: 'rock',    x: 19.2,  z: 0,     scale: 0.7,  rotY: 0.2,  r: 0.75 },
    { model: 'rock',    x: -16,   z: 3.2,   scale: 0.65, rotY: 1.5,  r: 0.75 },
    { model: 'boulder', x: -6.4,  z: -8,    scale: 0.8,  rotY: 0.6,  r: 0.75 },
    { model: 'redRock', x: 15.4,  z: 8.4,   scale: 0.75, rotY: 1.1,  r: 0.75 },
  ],

  // ── Verdant Maw ─────────────────────────────────────────────────────────────
  verdantMaw: [
    { model: 'tree',    x: -3,   z: -8,  scale: 1.0,  rotY: 1.0,  r: 0.6  },
    { model: 'tree',    x: 8,    z: 2,   scale: 0.85, rotY: 2.5,  r: 0.6  },
    { model: 'tree',    x: -10,  z: -4,  scale: 0.9,  rotY: 0.7,  r: 0.6  },
    { model: 'crate',   x: 2,    z: -4,  scale: 0.5,  rotY: 0.6,  r: 0.5  },
    { model: 'firePlant', x: -6,  z: 4,  scale: 1.8,  rotY: 0.8,  r: 0.5  },
    { model: 'firePlant', x: 10,  z: -6, scale: 1.65, rotY: 2.2,  r: 0.5  },
  ],

  // ── Lagoon Coast ────────────────────────────────────────────────────────────
  lagoonCoast: [
    { model: 'barrel',  x: 7,    z: 3,   scale: 0.65, rotY: 0.5,  r: 0.35 },
    { model: 'barrel',  x: -4,   z: -8,  scale: 0.6,  rotY: 2.0,  r: 0.35 },
    { model: 'crate',   x: -8,   z: 6,   scale: 0.55, rotY: 1.3,  r: 0.5  },
  ],

  // ── Frozen Tundra ───────────────────────────────────────────────────────────
  frozenTundra: [
    { model: 'rock',    x: -7,   z: 4,   scale: 0.8,  rotY: 0.4,  r: 0.75 },
    { model: 'rock',    x: 9,    z: -6,  scale: 0.75, rotY: 1.9,  r: 0.75 },
    { model: 'crate',   x: 4,    z: -5,  scale: 0.5,  rotY: 0.8,  r: 0.5  },
    { model: 'boulder', x: -5,   z: -8,  scale: 0.95, rotY: 0.2,  r: 0.75 },
    { model: 'boulder', x: 7,    z: 7,   scale: 0.7,  rotY: 2.3,  r: 0.75 },
    { model: 'blueBoulder', x: -9,  z: -2, scale: 0.85, rotY: 1.3,  r: 0.75 },
    { model: 'blueBoulder', x: 11,  z: 3,  scale: 0.7,  rotY: 0.6,  r: 0.75 },
  ],

  // ── Spaceship Interior ──────────────────────────────────────────────────────
  spaceship: [
    { model: 'pc',      x: -7,   z: -8,  scale: 0.7,  rotY: 0,         r: 0.5  },
    { model: 'pc',      x: 7,    z: -8,  scale: 0.7,  rotY: Math.PI,   r: 0.5  },
    { model: 'barrel',  x: 8,    z: 8,   scale: 0.65, rotY: 0.3,       r: 0.35 },
    { model: 'barrel',  x: 8.8,  z: 8,   scale: 0.65, rotY: 1.1,       r: 0.35 },
    { model: 'crate',   x: -3,   z: -6,  scale: 0.55, rotY: 0.2,       r: 0.5  },
  ],
};

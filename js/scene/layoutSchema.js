/**
 * layoutSchema.js — the contract between Blender and the game for authored
 * biome layouts.
 *
 * A biome's composition is authored in Blender and exported to
 * `js/scene/zones/<Zone>/layout.generated.js`, which default-exports one
 * object matching the shape below. `validateLayout()` implements the seven
 * rejection rules from Plans/Expanded-Biome-Worlds-Design.md, so a bad export
 * fails `npm test` rather than the browser.
 *
 * ZoneAssets.js still owns the small hand-authored zones. Generated layouts
 * are a separate path on purpose: hand-edited data stays hand-editable, and
 * generated data stays visibly generated.
 *
 * ── Layout shape ────────────────────────────────────────────────────────────
 * {
 *   version: 1,
 *   zone:    'lagoonCoast',
 *   bounds:  { minX, maxX, minZ, maxZ },
 *
 *   districts: [{ id, label, x, z, r, collection: 'Districts' }],
 *
 *   routes: [{                       // authored centrelines, not geometry
 *     id, type,                      // type ∈ ROUTE_TYPES
 *     width,                         // intended clearance in world units
 *     points: [[x, z], …],           // ≥ 2 points
 *     collection: 'Routes',
 *   }],
 *
 *   props: [{                        // one placed GLB
 *     id, model,                     // model ∈ MODEL_KEYS
 *     x, z, scale, rotY,
 *     r,                             // optional collision radius; omit = walkable
 *     tint,                          // optional hex
 *     terrain,                       // 'fixed' | 'soft'  — future terraforming
 *     district,                      // optional district id
 *     collection: 'Terrain_Fixed' | 'Terrain_Soft',   // must agree with terrain
 *   }],
 *
 *   markers: [{ id, kind, x, z, rotY, data, collection: 'Markers' }],
 *
 *   regions: [{                      // deterministic dressing fill
 *     id, seed,                      // own seed → editing one cannot reshuffle another
 *     terrain, density,
 *     models: ['mawFernCluster', …],
 *     shape: { kind: 'circle', x, z, r } | { kind: 'rect', minX, maxX, minZ, maxZ },
 *     collection: 'Regions',
 *   }],
 * }
 */

import { MODEL_KEYS } from './modelKeys.js';

export const LAYOUT_VERSION = 1;

/** Route grammar from the design's traffic hierarchy. */
export const ROUTE_TYPES = Object.freeze([
  'arterial',    // primary outward route from the biome entrance
  'collector',   // substantial branch serving a large place
  'local',       // short trail to a pocket, secret, or vignette
  'express',     // shorter alternate return corridor
  'interchange', // reserved space for a future cross-biome gate
]);

/**
 * Target clearance per route type, in world units. Starting standards from the
 * design — validated against the real camera and player speed in the pilot,
 * not rigid rules. `validateRouteClearance()` reports deviations as warnings.
 */
export const ROUTE_CLEARANCE = Object.freeze({
  arterial:    { min: 6,   max: 9 },
  collector:   { min: 3.5, max: 5 },
  local:       { min: 2,   max: 3 },
  express:     { min: 3.5, max: 9 },
  interchange: { min: 6,   max: 12 },
});

/** Terraforming classification — what a future system may reshape. */
export const TERRAIN_CLASSES = Object.freeze(['fixed', 'soft']);

export const MARKER_KINDS = Object.freeze([
  'entrance', 'portal', 'interchange', 'npc',
  'enemy', 'resource', 'landmark', 'mechanic',
]);

/** Blender collection each array must come from (design: "wrong collection"). */
export const COLLECTIONS = Object.freeze({
  districts: ['Districts'],
  routes:    ['Routes'],
  props:     ['Terrain_Fixed', 'Terrain_Soft'],
  markers:   ['Markers'],
  regions:   ['Regions'],
});

/** Which collection a prop's terrain class must come from. */
const TERRAIN_COLLECTION = Object.freeze({
  fixed: 'Terrain_Fixed',
  soft:  'Terrain_Soft',
});

/** The seven rejection rules, as stable identifiers tests can assert on. */
export const RULES = Object.freeze({
  UNKNOWN_MODEL:      'UNKNOWN_MODEL',
  DUPLICATE_ID:       'DUPLICATE_ID',
  MISSING_PROPERTY:   'MISSING_PROPERTY',
  OUT_OF_BOUNDS:      'OUT_OF_BOUNDS',
  WRONG_COLLECTION:   'WRONG_COLLECTION',
  INVALID_ROUTE_TYPE: 'INVALID_ROUTE_TYPE',
  INVALID_TRANSFORM:  'INVALID_TRANSFORM',
});

const REQUIRED = {
  districts: ['id', 'x', 'z', 'r', 'collection'],
  routes:    ['id', 'type', 'width', 'points', 'collection'],
  props:     ['id', 'model', 'x', 'z', 'scale', 'terrain', 'collection'],
  markers:   ['id', 'kind', 'x', 'z', 'collection'],
  regions:   ['id', 'seed', 'terrain', 'density', 'shape', 'collection'],
};

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Validate an authored layout.
 *
 * @param {object} layout
 * @param {object} [opts]
 * @param {Set<string>|string[]} [opts.knownModels] override the model key set
 * @returns {Array<{rule: string, path: string, message: string}>} empty = valid
 */
export function validateLayout(layout, opts = {}) {
  const errors = [];
  const add = (rule, path, message) => errors.push({ rule, path, message });

  const known = opts.knownModels
    ? (opts.knownModels instanceof Set ? opts.knownModels : new Set(opts.knownModels))
    : new Set(MODEL_KEYS);

  if (!layout || typeof layout !== 'object') {
    add(RULES.MISSING_PROPERTY, '', 'layout is not an object');
    return errors;
  }
  for (const key of ['version', 'zone', 'bounds']) {
    if (layout[key] === undefined) add(RULES.MISSING_PROPERTY, key, `missing ${key}`);
  }

  const b = layout.bounds;
  const boundsOk = b && ['minX', 'maxX', 'minZ', 'maxZ'].every(k => isNum(b[k]));
  if (!boundsOk) {
    add(RULES.MISSING_PROPERTY, 'bounds', 'bounds needs finite minX/maxX/minZ/maxZ');
  } else if (b.maxX <= b.minX || b.maxZ <= b.minZ) {
    add(RULES.INVALID_TRANSFORM, 'bounds', 'bounds are inverted or zero-area');
  }

  const inBounds = (x, z) => !boundsOk
    || (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ);

  // IDs are unique across the whole layout, not per array — a marker and a prop
  // sharing an id makes authoring notes ambiguous.
  const seenIds = new Map();

  for (const group of Object.keys(REQUIRED)) {
    const list = layout[group];
    if (list === undefined) continue;
    if (!Array.isArray(list)) {
      add(RULES.MISSING_PROPERTY, group, `${group} must be an array`);
      continue;
    }

    list.forEach((entry, i) => {
      const path = `${group}[${i}]`;
      if (!entry || typeof entry !== 'object') {
        add(RULES.MISSING_PROPERTY, path, 'entry is not an object');
        return;
      }

      // Rule 3 — missing required custom properties
      for (const key of REQUIRED[group]) {
        if (entry[key] === undefined || entry[key] === null) {
          add(RULES.MISSING_PROPERTY, `${path}.${key}`, `missing required property "${key}"`);
        }
      }

      // Rule 2 — duplicate ids
      if (entry.id !== undefined) {
        const prev = seenIds.get(entry.id);
        if (prev) add(RULES.DUPLICATE_ID, path, `id "${entry.id}" already used at ${prev}`);
        else seenIds.set(entry.id, path);
      }

      // Rule 5 — wrong export collection
      const allowed = COLLECTIONS[group];
      if (entry.collection !== undefined && !allowed.includes(entry.collection)) {
        add(RULES.WRONG_COLLECTION, `${path}.collection`,
          `"${entry.collection}" is not valid for ${group} (expected ${allowed.join(' or ')})`);
      }

      // Rule 7 — non-finite transforms (shared numeric fields)
      for (const key of ['x', 'z', 'rotY', 'r', 'scale', 'width', 'density', 'seed']) {
        if (entry[key] !== undefined && !isNum(entry[key])) {
          add(RULES.INVALID_TRANSFORM, `${path}.${key}`, `"${key}" must be a finite number`);
        }
      }
      if (isNum(entry.scale) && entry.scale <= 0) {
        add(RULES.INVALID_TRANSFORM, `${path}.scale`, 'scale must be positive');
      }

      // Rule 4 — out-of-bounds placement
      if (isNum(entry.x) && isNum(entry.z) && !inBounds(entry.x, entry.z)) {
        add(RULES.OUT_OF_BOUNDS, path,
          `(${entry.x}, ${entry.z}) is outside the scene bounds`);
      }

      if (group === 'props') _validateProp(entry, path, known, add);
      if (group === 'routes') _validateRoute(entry, path, inBounds, add);
      if (group === 'markers') _validateMarker(entry, path, add);
      if (group === 'regions') _validateRegion(entry, path, known, inBounds, add);
    });
  }

  return errors;
}

function _validateProp(entry, path, known, add) {
  // Rule 1 — unknown model keys
  if (entry.model !== undefined && !known.has(entry.model)) {
    add(RULES.UNKNOWN_MODEL, `${path}.model`,
      `"${entry.model}" is not a loaded model key`);
  }
  if (entry.terrain !== undefined && !TERRAIN_CLASSES.includes(entry.terrain)) {
    add(RULES.MISSING_PROPERTY, `${path}.terrain`,
      `terrain must be one of ${TERRAIN_CLASSES.join(', ')}`);
  }
  // A prop's terrain class and its source collection must agree, or the
  // Blender scene and the data disagree about what terraforming may touch.
  const expected = TERRAIN_COLLECTION[entry.terrain];
  if (expected && entry.collection !== undefined && entry.collection !== expected) {
    add(RULES.WRONG_COLLECTION, `${path}.collection`,
      `terrain "${entry.terrain}" must come from ${expected}, not ${entry.collection}`);
  }
}

function _validateRoute(entry, path, inBounds, add) {
  // Rule 6 — invalid route types
  if (entry.type !== undefined && !ROUTE_TYPES.includes(entry.type)) {
    add(RULES.INVALID_ROUTE_TYPE, `${path}.type`,
      `"${entry.type}" is not a route type (${ROUTE_TYPES.join(', ')})`);
  }
  if (entry.points === undefined) return;
  if (!Array.isArray(entry.points) || entry.points.length < 2) {
    add(RULES.MISSING_PROPERTY, `${path}.points`, 'a route needs at least 2 points');
    return;
  }
  entry.points.forEach((p, j) => {
    if (!Array.isArray(p) || p.length < 2 || !isNum(p[0]) || !isNum(p[1])) {
      add(RULES.INVALID_TRANSFORM, `${path}.points[${j}]`, 'point must be [x, z] finite numbers');
      return;
    }
    if (!inBounds(p[0], p[1])) {
      add(RULES.OUT_OF_BOUNDS, `${path}.points[${j}]`,
        `(${p[0]}, ${p[1]}) is outside the scene bounds`);
    }
  });
}

function _validateMarker(entry, path, add) {
  if (entry.kind !== undefined && !MARKER_KINDS.includes(entry.kind)) {
    add(RULES.MISSING_PROPERTY, `${path}.kind`,
      `"${entry.kind}" is not a marker kind (${MARKER_KINDS.join(', ')})`);
  }
}

function _validateRegion(entry, path, known, inBounds, add) {
  if (entry.terrain !== undefined && !TERRAIN_CLASSES.includes(entry.terrain)) {
    add(RULES.MISSING_PROPERTY, `${path}.terrain`,
      `terrain must be one of ${TERRAIN_CLASSES.join(', ')}`);
  }
  if (entry.models !== undefined) {
    if (!Array.isArray(entry.models) || entry.models.length === 0) {
      add(RULES.MISSING_PROPERTY, `${path}.models`, 'a region needs at least one model key');
    } else {
      entry.models.forEach((m, j) => {
        if (!known.has(m)) {
          add(RULES.UNKNOWN_MODEL, `${path}.models[${j}]`, `"${m}" is not a loaded model key`);
        }
      });
    }
  }

  const s = entry.shape;
  if (s === undefined) return;
  if (s.kind === 'circle') {
    if (!isNum(s.x) || !isNum(s.z) || !isNum(s.r) || s.r <= 0) {
      add(RULES.INVALID_TRANSFORM, `${path}.shape`, 'circle needs finite x, z and positive r');
    } else if (!inBounds(s.x, s.z)) {
      add(RULES.OUT_OF_BOUNDS, `${path}.shape`, 'region centre is outside the scene bounds');
    }
  } else if (s.kind === 'rect') {
    const ok = ['minX', 'maxX', 'minZ', 'maxZ'].every(k => isNum(s[k]));
    if (!ok || s.maxX <= s.minX || s.maxZ <= s.minZ) {
      add(RULES.INVALID_TRANSFORM, `${path}.shape`, 'rect needs finite, non-inverted bounds');
    } else if (!inBounds(s.minX, s.minZ) || !inBounds(s.maxX, s.maxZ)) {
      add(RULES.OUT_OF_BOUNDS, `${path}.shape`, 'region rect leaves the scene bounds');
    }
  } else {
    add(RULES.MISSING_PROPERTY, `${path}.shape.kind`, 'shape.kind must be "circle" or "rect"');
  }
}

/**
 * Compare each route's authored width against the design's target clearance.
 * Deviations are deliberate often enough that these are warnings, not errors —
 * the design asks that exceptions be *recorded*, which is what this surfaces.
 *
 * @returns {Array<{id: string, type: string, width: number, message: string}>}
 */
export function validateRouteClearance(layout) {
  const out = [];
  for (const route of layout.routes || []) {
    const band = ROUTE_CLEARANCE[route.type];
    if (!band || !isNum(route.width)) continue;
    if (route.width < band.min || route.width > band.max) {
      out.push({
        id: route.id, type: route.type, width: route.width,
        message: `${route.type} "${route.id}" is ${route.width} units, outside the ${band.min}–${band.max} target`,
      });
    }
  }
  return out;
}

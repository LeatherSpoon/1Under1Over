/**
 * LayoutBuilder.js — turns an authored layout (js/scene/layoutSchema.js) into
 * a live zone.
 *
 * Authored placements define the composition; `regions` fill the connective
 * wilderness deterministically. Everything is routed through a SectorView so a
 * 100×100 biome costs what the player can actually see.
 *
 * A zone builder uses it like this:
 *
 *   import LAYOUT from './layout.generated.js';
 *   export function build(env) {
 *     env._addGround(0xc2b280);
 *     const { markers } = buildLayout(env, LAYOUT);
 *     // …zone-specific work: portals from markers, water, lighting…
 *   }
 *
 * Markers are *returned*, not built: what an entrance or an enemy post means
 * is the zone's business, and spawn getters still live in Environment.js.
 */

import { SectorView, spatialRng } from './SectorView.js';

/**
 * Props big enough to serve as navigation silhouettes stay materialized at any
 * distance (the design's "landmarks remain legible at distance"). Anything
 * marked as a landmark district-side, or any fixed prop at or above this
 * scale, is treated as persistent.
 */
const LANDMARK_SCALE = 2.5;

/**
 * @param {Environment} env
 * @param {object} layout   a layout that has passed validateLayout()
 * @param {object} [opts]
 * @param {number} [opts.sectorSize]
 * @param {number} [opts.activateR]
 * @param {number} [opts.deactivateR]
 * @returns {{ sectors: SectorView, markers: object[], districts: object[], routes: object[] }}
 */
export function buildLayout(env, layout, opts = {}) {
  const sectors = new SectorView({
    group: env.group,
    ...(opts.sectorSize !== undefined ? { sectorSize: opts.sectorSize } : {}),
    ...(opts.activateR !== undefined ? { activateR: opts.activateR } : {}),
    ...(opts.deactivateR !== undefined ? { deactivateR: opts.deactivateR } : {}),
  });

  const landmarkIds = new Set(
    (layout.markers || []).filter(m => m.kind === 'landmark' && m.propId).map(m => m.propId)
  );

  for (const p of layout.props || []) {
    const persistent = landmarkIds.has(p.id)
      || (p.terrain === 'fixed' && p.scale >= LANDMARK_SCALE);
    sectors.add({
      x: p.x, z: p.z, r: p.r, persistent,
      // Deterministic: the same prop rebuilds identically every time, because
      // everything it needs comes from the authored record.
      materialize: () => env.buildPropMesh({
        model: p.model, x: p.x, z: p.z,
        scale: p.scale, rotY: p.rotY || 0, tint: p.tint,
      }),
    });
  }

  for (const region of layout.regions || []) {
    for (const item of expandRegion(region)) {
      sectors.add({
        x: item.x, z: item.z, r: item.r,
        materialize: () => env.buildPropMesh(item),
      });
    }
  }

  env._sectors = sectors;
  return {
    sectors,
    markers: layout.markers || [],
    districts: layout.districts || [],
    routes: layout.routes || [],
  };
}

/**
 * Expand one procedural dressing region into concrete placements.
 *
 * Pure and deterministic: same region record → same placements, every time,
 * with no dependence on any other region. That independence is the point —
 * the design requires that editing one district cannot reshuffle another.
 *
 * @returns {Array<{model, x, z, scale, rotY, r}>}
 */
export function expandRegion(region) {
  const { shape, seed, models, density } = region;
  const out = [];
  if (!shape || !models?.length) return out;

  // Area × density = count, so density reads the same at any region size.
  const area = shape.kind === 'circle'
    ? Math.PI * shape.r * shape.r
    : (shape.maxX - shape.minX) * (shape.maxZ - shape.minZ);
  const count = Math.max(0, Math.round(area * density));

  const rng = spatialRng(seed, 0, 0);
  for (let i = 0; i < count; i++) {
    let x, z;
    if (shape.kind === 'circle') {
      // sqrt keeps the distribution even instead of clumping at the centre.
      const a = rng() * Math.PI * 2;
      const rr = Math.sqrt(rng()) * shape.r;
      x = shape.x + Math.cos(a) * rr;
      z = shape.z + Math.sin(a) * rr;
    } else {
      x = shape.minX + rng() * (shape.maxX - shape.minX);
      z = shape.minZ + rng() * (shape.maxZ - shape.minZ);
    }
    const model = models[Math.floor(rng() * models.length)];
    out.push({
      model, x, z,
      scale: (region.scale || 1) * (1 + (rng() - 0.5) * (region.scaleJitter || 0)),
      rotY: rng() * Math.PI * 2,
      r: region.r,
    });
  }
  return out;
}

/**
 * Distance along a route's centreline, in world units. The design's pacing
 * target ("40–65 units to the first district") is measured along the route the
 * player actually walks, not straight-line, so this is what checks it.
 */
export function routeLength(route) {
  let total = 0;
  const pts = route.points || [];
  for (let i = 1; i < pts.length; i++) {
    total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  }
  return total;
}

/**
 * Shortest route-network distance from an entrance marker to a district
 * centre, walking only along authored routes. Used to check the first-district
 * pacing target and to prove every destination is connected.
 *
 * Routes join where their endpoints coincide within `joinTolerance`.
 *
 * @returns {number|null} distance, or null when no route path exists
 */
export function routeDistance(layout, fromXZ, toXZ, joinTolerance = 2) {
  const nodes = [];
  const nodeAt = (x, z) => {
    for (let i = 0; i < nodes.length; i++) {
      if (Math.hypot(nodes[i].x - x, nodes[i].z - z) <= joinTolerance) return i;
    }
    nodes.push({ x, z });
    return nodes.length - 1;
  };

  // Every route segment becomes an edge; shared endpoints collapse to one node.
  const edges = [];
  for (const route of layout.routes || []) {
    const pts = route.points || [];
    for (let i = 1; i < pts.length; i++) {
      const a = nodeAt(pts[i - 1][0], pts[i - 1][1]);
      const b = nodeAt(pts[i][0], pts[i][1]);
      if (a === b) continue;
      const w = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      edges.push({ a, b, w });
    }
  }
  if (!nodes.length) return null;

  const start = nearestNode(nodes, fromXZ, joinTolerance);
  const goal = nearestNode(nodes, toXZ, joinTolerance);
  if (start === -1 || goal === -1) return null;

  const adj = nodes.map(() => []);
  for (const e of edges) {
    adj[e.a].push({ to: e.b, w: e.w });
    adj[e.b].push({ to: e.a, w: e.w });
  }

  // Dijkstra. Route graphs are tiny (tens of nodes), so a linear scan for the
  // next node is cheaper than maintaining a heap.
  const dist = nodes.map(() => Infinity);
  const done = nodes.map(() => false);
  dist[start] = 0;
  for (;;) {
    let u = -1, best = Infinity;
    for (let i = 0; i < nodes.length; i++) {
      if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
    }
    if (u === -1) break;
    if (u === goal) return dist[u];
    done[u] = true;
    for (const { to, w } of adj[u]) {
      if (dist[u] + w < dist[to]) dist[to] = dist[u] + w;
    }
  }
  return Number.isFinite(dist[goal]) ? dist[goal] : null;
}

function nearestNode(nodes, [x, z], tolerance) {
  let best = -1, bestD = Infinity;
  for (let i = 0; i < nodes.length; i++) {
    const d = Math.hypot(nodes[i].x - x, nodes[i].z - z);
    if (d < bestD) { bestD = d; best = i; }
  }
  // A destination far from every route is not connected by route, which is
  // exactly what the caller wants to hear.
  return bestD <= Math.max(tolerance, 6) ? best : -1;
}

/**
 * Generation Engine — the single source of truth for the computer's growth.
 * Zone builder, shell generation, interior dressing, door record, and
 * ComputerSystem all read this table + the player's plan; no coordinate or
 * pacing number lives in two files (addendum §5.1).
 *
 * Round 1 ships Era 1 only. Later eras append rows; `floors`, `kitSet`,
 * `slotVariants`, `provenancePalette` are carried now so era rounds are data
 * changes. Eligibility thresholds are stubbed to 0 (owner tunes; see
 * Plans/DESIGN-DECISIONS.md 2026-08-02).
 */

export const CHUNK = 6;           // world units per chunk = 3×3 track cells on the 2-unit grid

export const chunkKey = (cx, cz) => `${cx},${cz}`;
export const worldToChunk = (x, z) => [Math.round(x / CHUNK), Math.round(z / CHUNK)];
export const chunkToWorld = (cx, cz) => [cx * CHUNK, cz * CHUNK];

export const GENERATIONS = [
  { gen: 1, era: 1, chunkGrant: 1, fillFraction: 0.15, interiorSet: 'fieldTerminal',
    storyHeight: 3, floors: 1, kitSet: 'placeholder', eligibility: 0, schematic: null },
  { gen: 2, era: 1, chunkGrant: 1, fillFraction: 0.40, interiorSet: 'missionServers',
    storyHeight: 3, floors: 1, kitSet: 'placeholder', eligibility: 0,
    schematic: { iron: 20, stone: 15 } },
  { gen: 3, era: 1, chunkGrant: 0, fillFraction: 0.70, interiorSet: 'integrationBench',
    storyHeight: 3, floors: 1, kitSet: 'placeholder', eligibility: 0,
    schematic: { steel_ingot: 4, iron: 30, fiber: 10 } },
  { gen: 4, era: 1, chunkGrant: 0, fillFraction: 0.95, interiorSet: 'expeditionRack',
    storyHeight: 3, floors: 1, kitSet: 'placeholder', eligibility: 0,
    schematic: { mechanical_servo: 2, steel_ingot: 8, quartz: 6 } },
];

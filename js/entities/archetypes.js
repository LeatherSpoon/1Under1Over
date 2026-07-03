// ── Enemy archetype definitions ────────────────────────────────────────────
// Shared by Enemy.js (3D entities), CombatSystem (drop tables), and
// AdventureSystem / BossSystem (simulated combat). Keep this module DOM- and
// Three.js-free so Node tests and headless systems can import it.
//
// attackPattern: 'melee' (repeating hit) | 'windup' (charge then slam) |
//                'burst' (idle ticks then 3 rapid hits)
// visual:        which mesh build Enemy.js uses ('rusher' | 'swinger' | 'burst')

export const ARCHETYPES = {
  // ── Original three ──
  rusher: {
    name: 'SCRAPPER',
    hp: 30, damage: 3, attackInterval: 800, ppReward: 15,
    bodyColor: 0xc45a1a, headColor: 0xd9703a, visorColor: 0xff4444, threatColor: 0xff2222,
    scale: 1.0, statusEffect: null, attackPattern: 'melee', visual: 'rusher',
    combatLabel: 'SCRAPPER',
  },
  swinger: {
    name: 'BRUTE',
    hp: 60, damage: 18, attackInterval: 2400, ppReward: 25,
    bodyColor: 0x8855cc, headColor: 0x9966dd, visorColor: 0xffaa00, threatColor: 0xaa44ff,
    scale: 1.25, statusEffect: null, attackPattern: 'windup', visual: 'swinger',
    combatLabel: 'BRUTE [Wind-Up]',
  },
  burst: {
    name: 'GLITCH',
    hp: 45, damage: 5, attackInterval: 3200, ppReward: 20,
    bodyColor: 0x22ccaa, headColor: 0x33ddbb, visorColor: 0x00ff88, threatColor: 0x00ff88,
    scale: 0.85, statusEffect: null, attackPattern: 'burst', visual: 'burst',
    combatLabel: 'GLITCH [Burst]',
  },

  // ── Expansion archetypes ──
  stinger: {
    name: 'STINGER',
    hp: 25, damage: 4, attackInterval: 700, ppReward: 22,
    bodyColor: 0x557711, headColor: 0x77aa22, visorColor: 0xccff44, threatColor: 0xaaee22,
    scale: 0.8, statusEffect: 'poison', attackPattern: 'melee', visual: 'rusher',
    combatLabel: 'STINGER [Poison]',
  },
  cinder: {
    name: 'CINDER',
    hp: 40, damage: 6, attackInterval: 1100, ppReward: 26,
    bodyColor: 0x882211, headColor: 0xaa3311, visorColor: 0xff6622, threatColor: 0xff5511,
    scale: 0.95, statusEffect: 'burn', attackPattern: 'melee', visual: 'rusher',
    combatLabel: 'CINDER [Burn]',
  },
  voltaic: {
    name: 'VOLTAIC',
    hp: 55, damage: 6, attackInterval: 2800, ppReward: 32,
    bodyColor: 0x2244aa, headColor: 0x3355cc, visorColor: 0x66ccff, threatColor: 0x44aaff,
    scale: 0.9, statusEffect: 'shock', attackPattern: 'burst', visual: 'burst',
    combatLabel: 'VOLTAIC [Shock Burst]',
  },
  rustmaw: {
    name: 'RUSTMAW',
    hp: 85, damage: 22, attackInterval: 2600, ppReward: 40,
    bodyColor: 0x775533, headColor: 0x886644, visorColor: 0xddaa44, threatColor: 0xcc8833,
    scale: 1.3, statusEffect: 'corrosion', attackPattern: 'windup', visual: 'swinger',
    combatLabel: 'RUSTMAW [Corrosion]',
  },
  wraith: {
    name: 'WRAITH',
    hp: 70, damage: 7, attackInterval: 2400, ppReward: 45,
    bodyColor: 0x445566, headColor: 0x556677, visorColor: 0xaaddff, threatColor: 0x88bbdd,
    scale: 0.9, statusEffect: 'shock', attackPattern: 'burst', visual: 'burst',
    combatLabel: 'WRAITH [Phase Burst]',
  },
  warden: {
    name: 'WARDEN',
    hp: 140, damage: 12, attackInterval: 1600, ppReward: 55,
    bodyColor: 0x336655, headColor: 0x447766, visorColor: 0x88ffcc, threatColor: 0x55ddaa,
    scale: 1.35, statusEffect: 'corrosion', attackPattern: 'melee', visual: 'swinger',
    combatLabel: 'WARDEN [Bulwark]',
  },
  colossus: {
    name: 'COLOSSUS',
    hp: 200, damage: 34, attackInterval: 3000, ppReward: 80,
    bodyColor: 0x333a44, headColor: 0x444c58, visorColor: 0xff8844, threatColor: 0xff6633,
    scale: 1.55, statusEffect: null, attackPattern: 'windup', visual: 'swinger',
    combatLabel: 'COLOSSUS [Siege]',
  },
};

// Drop tables per archetype — material keys must exist in InventorySystem.MATERIAL_NAMES.
export const DROP_TABLES = {
  rusher:   [{ mat: 'circuitWire',    label: 'Circuit Wire',    chance: 0.60 },
             { mat: 'ironSpike',      label: 'Iron Spike',      chance: 0.30 }],
  swinger:  [{ mat: 'powerCore',      label: 'Power Core',      chance: 0.40 },
             { mat: 'armorPlate',     label: 'Armor Plate',     chance: 0.20 }],
  burst:    [{ mat: 'burstCapacitor', label: 'Burst Capacitor', chance: 0.60 },
             { mat: 'logicChip',      label: 'Logic Chip',      chance: 0.30 }],
  stinger:  [{ mat: 'resin',          label: 'Resin',           chance: 0.55 },
             { mat: 'fiber',          label: 'Fiber',           chance: 0.35 }],
  cinder:   [{ mat: 'carbon',         label: 'Carbon',          chance: 0.60 },
             { mat: 'ironSpike',      label: 'Iron Spike',      chance: 0.25 }],
  voltaic:  [{ mat: 'burstCapacitor', label: 'Burst Capacitor', chance: 0.50 },
             { mat: 'magnet',         label: 'Magnet',          chance: 0.30 }],
  rustmaw:  [{ mat: 'armorPlate',     label: 'Armor Plate',     chance: 0.45 },
             { mat: 'iron',           label: 'Iron',            chance: 0.45 }],
  wraith:   [{ mat: 'logicChip',      label: 'Logic Chip',      chance: 0.55 },
             { mat: 'quartz',         label: 'Quartz',          chance: 0.30 }],
  warden:   [{ mat: 'armorPlate',     label: 'Armor Plate',     chance: 0.60 },
             { mat: 'titanium',       label: 'Titanium',        chance: 0.25 }],
  colossus: [{ mat: 'powerCore',      label: 'Power Core',      chance: 0.65 },
             { mat: 'tungsten',       label: 'Tungsten',        chance: 0.35 }],
};

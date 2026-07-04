const GRID_SIZE = 5;

// Schematics — spatial patterns for one-time assembly builds.
// Each cell is a material key or null. Grid is row-major [row][col].
const SCHEMATICS = [
  {
    id: 'basicExtractor',
    label: 'Basic Extractor',
    description: 'A passive ore harvester. Produces an extractor unit for field deployment.',
    grid: [
      [null,       null,       'iron',        null,       null      ],
      [null,       'copper',   'iron_dust',   'copper',   null      ],
      ['iron',     'iron_dust','metal_strut', 'iron_dust','iron'    ],
      [null,       'copper',   'iron_dust',   'copper',   null      ],
      [null,       null,       'iron',        null,       null      ],
    ],
    output: { key: 'extractor_unit', qty: 1 },
  },
  {
    id: 'advancedExtractor',
    label: 'Advanced Extractor',
    description: 'High-efficiency harvester with multi-spectrum material coverage.',
    grid: [
      [null,         'alloy_bar',   null,        'alloy_bar',   null         ],
      ['alloy_bar',  'hull_plating','data_cable','hull_plating','alloy_bar'  ],
      [null,         'data_cable',  'powerCore', 'data_cable',  null         ],
      ['alloy_bar',  'hull_plating','data_cable','hull_plating','alloy_bar'  ],
      [null,         'alloy_bar',   null,        'alloy_bar',   null         ],
    ],
    output: { key: 'extractor_unit_adv', qty: 1 },
  },
  {
    id: 'circuitBoard',
    label: 'Circuit Board',
    description: 'Multi-layer logic board used in advanced ship computing modules.',
    grid: [
      ['copper',  null,             'copper',    null,             'copper' ],
      [null,      'micro_fastener', 'data_cable','micro_fastener', null     ],
      ['copper',  'data_cable',     'logicChip', 'data_cable',     'copper' ],
      [null,      'micro_fastener', 'data_cable','micro_fastener', null     ],
      ['copper',  null,             'copper',    null,             'copper' ],
    ],
    output: { key: 'circuit_board', qty: 1 },
  },
  {
    id: 'hullSegment',
    label: 'Hull Segment',
    description: 'Reinforced structural frame for ship hull expansion.',
    grid: [
      ['hull_plating','metal_strut','hull_plating','metal_strut','hull_plating'],
      ['metal_strut', null,         null,          null,         'metal_strut' ],
      ['hull_plating',null,         'alloy_bar',   null,         'hull_plating'],
      ['metal_strut', null,         null,          null,         'metal_strut' ],
      ['hull_plating','metal_strut','hull_plating','metal_strut','hull_plating'],
    ],
    output: { key: 'hull_segment', qty: 1 },
  },
];

export class AssemblySystem {
  static get SCHEMATICS() { return SCHEMATICS; }
  static get GRID_SIZE() { return GRID_SIZE; }

  constructor(inventorySystem) {
    this.inventory = inventorySystem;
    this._grid = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(null));

    this.onAssemblyComplete = null;  // fn(schematicId, outputKey, qty)
    this.onGridUpdate = null;        // fn()
  }

  getGrid() {
    return this._grid;
  }

  // Return the material in (row,col) to inventory and clear the cell.
  clearCell(row, col) {
    const mat = this._grid[row][col];
    if (!mat) return;
    this.inventory.addMaterial(mat, 1);
    this._grid[row][col] = null;
    this.onGridUpdate?.();
  }

  // Return all grid contents to inventory.
  clearAll() {
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (this._grid[r][c]) {
          this.inventory.addMaterial(this._grid[r][c], 1);
          this._grid[r][c] = null;
        }
      }
    }
    this.onGridUpdate?.();
  }

  // True when the grid exactly matches the schematic.
  checkMatch(schematicId) {
    const sch = SCHEMATICS.find(s => s.id === schematicId);
    if (!sch) return false;
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (sch.grid[r][c] !== this._grid[r][c]) return false;
      }
    }
    return true;
  }

  // True when inventory has enough to fill all schematic cells not yet correct.
  canAutoRoute(schematicId) {
    const sch = SCHEMATICS.find(s => s.id === schematicId);
    if (!sch) return false;
    const needed = {};
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const want = sch.grid[r][c];
        if (want && want !== this._grid[r][c]) {
          needed[want] = (needed[want] || 0) + 1;
        }
      }
    }
    return this.inventory.hasMaterials(needed);
  }

  // Clear wrong cells back to inventory, then fill schematic from inventory.
  // Returns false if inventory is insufficient after clearing wrong cells.
  autoRoute(schematicId) {
    const sch = SCHEMATICS.find(s => s.id === schematicId);
    if (!sch) return false;

    // Return mismatched cells to inventory first
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const have = this._grid[r][c];
        if (have && have !== sch.grid[r][c]) {
          this.inventory.addMaterial(have, 1);
          this._grid[r][c] = null;
        }
      }
    }

    // Check we have what remains
    const needed = {};
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const want = sch.grid[r][c];
        if (want && !this._grid[r][c]) {
          needed[want] = (needed[want] || 0) + 1;
        }
      }
    }
    if (!this.inventory.hasMaterials(needed)) return false;

    // Place materials into empty target cells
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const want = sch.grid[r][c];
        if (want && !this._grid[r][c]) {
          this.inventory.removeMaterial(want, 1);
          this._grid[r][c] = want;
        }
      }
    }

    this.onGridUpdate?.();
    return true;
  }

  // Consume matching grid and deliver output. Returns false if not matched.
  executeAssembly(schematicId) {
    if (!this.checkMatch(schematicId)) return false;
    const sch = SCHEMATICS.find(s => s.id === schematicId);

    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        this._grid[r][c] = null;
      }
    }

    this.inventory.addMaterial(sch.output.key, sch.output.qty);
    this.onAssemblyComplete?.(schematicId, sch.output.key, sch.output.qty);
    this.onGridUpdate?.();
    return true;
  }

  // Aggregate material cost for a schematic (total cells by material key).
  getMaterialCost(schematicId) {
    const sch = SCHEMATICS.find(s => s.id === schematicId);
    if (!sch) return {};
    const cost = {};
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const mat = sch.grid[r][c];
        if (mat) cost[mat] = (cost[mat] || 0) + 1;
      }
    }
    return cost;
  }

  serialize() {
    return {
      grid: this._grid.map(row => [...row]),
    };
  }

  deserialize(data) {
    if (!data?.grid) return;
    for (let r = 0; r < GRID_SIZE; r++) {
      if (data.grid[r]) {
        for (let c = 0; c < GRID_SIZE; c++) {
          this._grid[r][c] = data.grid[r][c] ?? null;
        }
      }
    }
  }
}

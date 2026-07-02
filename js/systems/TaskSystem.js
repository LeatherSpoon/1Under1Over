// Mission sequences that guide the player through game capabilities.
// Events are recorded by main.js after successful actions; TaskSystem
// decides which steps complete and fires onUpdate for HUD refresh.

const SEQUENCES = [
  {
    id: 'terrainCutter',
    label: 'Terrain Cutter',
    steps: [
      { id: 'upgradeCrafting',     desc: 'Upgrade the Crafting stat' },
      { id: 'collectMaterials',    desc: 'Collect Stone ×1 and Copper ×1' },
      { id: 'craftTerrainCutter',  desc: 'Craft a Terrain Cutter' },
    ],
  },
  {
    id: 'speedTrackPlace',
    label: 'Speed Track: Free Allocation',
    steps: [
      { id: 'place20', desc: 'Place all 20 free Speed Tracks' },
    ],
  },
  {
    id: 'speedTrackExpand',
    label: 'Speed Track: Expand',
    steps: [
      { id: 'buyAndPlace5', desc: 'Purchase and place 5 additional Speed Tracks' },
    ],
  },
  {
    id: 'speedTrackClear',
    label: 'Speed Track: Clear',
    steps: [
      { id: 'removeAll', desc: 'Remove all placed Speed Tracks' },
    ],
  },
  {
    id: 'equipmentBuild',
    label: 'Equipment Build',
    steps: [
      { id: 'collectCopperRingMats', desc: 'Collect Copper ×4 for a Copper Ring' },
      { id: 'craftCopperRing',       desc: 'Craft a Copper Ring' },
      { id: 'equipCopperRing',       desc: 'Equip the Copper Ring' },
    ],
  },
  {
    id: 'droneDispatch',
    label: 'Drone Dispatch',
    steps: [
      { id: 'assignDrone',  desc: 'Assign a drone to gather materials' },
      { id: 'sendMission',  desc: 'Send a drone on a mission' },
    ],
  },
  {
    id: 'mineExploration',
    label: 'Mine Exploration',
    steps: [
      { id: 'drillMine', desc: 'Drill a rock in The Mine' },
    ],
  },
  {
    id: 'verdantMawExploration',
    label: 'Verdant Maw Expedition',
    steps: [
      { id: 'gatherVerdant', desc: 'Gather resources in the Verdant Maw' },
    ],
  },
  {
    id: 'lagoonCoastExploration',
    label: 'Lagoon Coast Survey',
    steps: [
      { id: 'gatherLagoon', desc: 'Gather resources at the Lagoon Coast' },
    ],
  },
  {
    id: 'frozenTundraExploration',
    label: 'Frozen Tundra Survey',
    steps: [
      { id: 'gatherTundra', desc: 'Gather resources in the Frozen Tundra' },
    ],
  },
  {
    id: 'spaceshipStation',
    label: 'Spaceship: Core Systems',
    steps: [
      { id: 'useAscension', desc: 'Access the Ascension Terminal in the Spaceship' },
    ],
  },
];

export class TaskSystem {
  constructor() {
    this._sequences = SEQUENCES.map(seq => ({
      ...seq,
      done: false,
      steps: seq.steps.map(s => ({ ...s, done: false })),
    }));
    this.onUpdate = null;
  }

  // ── Public queries ─────────────────────────────────────────────────────────

  get currentSequence() {
    return this._sequences.find(s => !s.done) || null;
  }

  // Returns { label, steps } for HUD rendering; label is null when all done.
  currentSequenceForDisplay() {
    const seq = this.currentSequence;
    if (!seq) return { label: null, steps: [] };
    return {
      label: seq.label,
      steps: seq.steps.map(s => ({ desc: s.desc, done: s.done })),
    };
  }

  // ── Event recording ────────────────────────────────────────────────────────

  recordStatUpgrade(statName) {
    if (statName === 'crafting') {
      this._completeStep('terrainCutter', 'upgradeCrafting');
    }
  }

  // materials is the full current inventory map { stone: N, copper: N, ... }
  recordMaterialAdded(materials) {
    if ((materials.stone || 0) >= 1 && (materials.copper || 0) >= 1) {
      this._completeStep('terrainCutter', 'collectMaterials');
    }
    if ((materials.copper || 0) >= 4) {
      this._completeStep('equipmentBuild', 'collectCopperRingMats');
    }
  }

  recordCraftComplete(recipeId) {
    if (recipeId === 'terrainCutter') this._completeStep('terrainCutter', 'craftTerrainCutter');
    if (recipeId === 'copperRing')    this._completeStep('equipmentBuild', 'craftCopperRing');
  }

  // Called when an equipment item is auto-equipped after crafting.
  recordEquipItem(recipeId) {
    if (recipeId === 'copperRing') this._completeStep('equipmentBuild', 'equipCopperRing');
  }

  // totalPlaced = pedometer._placedTracks.length after the place succeeded.
  recordTrackPlaced(totalPlaced) {
    if (totalPlaced >= 20) this._completeStep('speedTrackPlace', 'place20');
    // 25+ placed implies at least 5 purchased (player starts with 20 free).
    if (totalPlaced >= 25) this._completeStep('speedTrackExpand', 'buyAndPlace5');
  }

  // totalOwned = pedometer._trackCount after the purchase succeeded.
  // Completion lives in recordTrackPlaced; this hook exists for future use.
  recordTrackPurchased(_totalOwned) {}

  // totalPlaced = pedometer._placedTracks.length after the removal succeeded.
  recordTrackRemoved(totalPlaced) {
    const expandSeq = this._sequences.find(s => s.id === 'speedTrackExpand');
    if (totalPlaced === 0 && expandSeq?.done) {
      this._completeStep('speedTrackClear', 'removeAll');
    }
  }

  recordDroneAssigned() {
    this._completeStep('droneDispatch', 'assignDrone');
  }

  recordDroneDispatched() {
    this._completeStep('droneDispatch', 'sendMission');
  }

  // zone = env.currentZone string at the time the gather completed.
  recordGather(zone) {
    if (zone === 'verdantMaw')   this._completeStep('verdantMawExploration', 'gatherVerdant');
    if (zone === 'lagoonCoast')  this._completeStep('lagoonCoastExploration', 'gatherLagoon');
    if (zone === 'frozenTundra') this._completeStep('frozenTundraExploration', 'gatherTundra');
  }

  // zone = env.currentZone string at the time the drill completed.
  recordDrill(zone) {
    if (zone === 'mine') this._completeStep('mineExploration', 'drillMine');
  }

  // Generic zone-specific action (e.g. opening a station).
  recordZoneAction(zone, action) {
    if (zone === 'spaceship' && action === 'ascensionTerminal') {
      this._completeStep('spaceshipStation', 'useAscension');
    }
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  _completeStep(seqId, stepId) {
    const seq = this._sequences.find(s => s.id === seqId);
    if (!seq || seq.done) return false;

    const step = seq.steps.find(s => s.id === stepId);
    if (!step || step.done) return false;

    step.done = true;
    if (seq.steps.every(s => s.done)) seq.done = true;

    this._notify();
    return true;
  }

  _notify() {
    this.onUpdate?.();
  }

  // ── Persistence ────────────────────────────────────────────────────────────

  serialize() {
    return this._sequences.map(seq => ({
      id: seq.id,
      done: seq.done,
      steps: seq.steps.map(s => ({ id: s.id, done: s.done })),
    }));
  }

  load(data) {
    if (!Array.isArray(data)) return;
    for (const saved of data) {
      const seq = this._sequences.find(s => s.id === saved.id);
      if (!seq) continue;
      seq.done = !!saved.done;
      for (const savedStep of (saved.steps || [])) {
        const step = seq.steps.find(s => s.id === savedStep.id);
        if (step) step.done = !!savedStep.done;
      }
    }
    this._notify();
  }
}

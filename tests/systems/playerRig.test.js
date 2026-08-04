// Guards the Player.glb contract the runtime relies on: the six animation
// clips (Idle/Run + the task set) and the ten Gear_* nodes bone-parented into
// the rig. A re-export that drops an NLA track or renames a gear object fails
// here instead of silently shipping a player with missing animations/gear.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function glbJson(file) {
  const buf = fs.readFileSync(file);
  assert.equal(buf.readUInt32LE(0), 0x46546c67, 'GLB magic');
  const len = buf.readUInt32LE(12);
  assert.equal(buf.readUInt32LE(16), 0x4e4f534a, 'first chunk is JSON');
  return JSON.parse(buf.subarray(20, 20 + len).toString('utf8'));
}

// Must mirror GEAR_NODE_NAMES in js/entities/Player.js (that file imports
// three.js, so it cannot be imported under Node — the source check below
// keeps the two lists honest).
const GEAR_NODES = [
  'Gear_BladeScrap', 'Gear_BladeBasic', 'Gear_Knuckles', 'Gear_ToolDrill',
  'Gear_ToolCutter', 'Gear_Shield', 'Gear_ArmorChest',
  'Gear_BladeScrapB', 'Gear_BladeBasicB', 'Gear_ShieldB',
];
const CLIPS = ['Idle', 'Run', 'Gather', 'Swing', 'Attack', 'Flinch'];

test('Player.glb carries the full clip set and bone-parented gear nodes', () => {
  const js = glbJson(path.join(__dirname, '..', '..', 'models', 'Player.glb'));
  const anims = (js.animations || []).map(a => a.name);
  for (const c of CLIPS) assert.ok(anims.includes(c), `missing clip ${c} (have: ${anims})`);

  const names = (js.nodes || []).map(n => n.name);
  for (const g of GEAR_NODES) assert.ok(names.includes(g), `missing gear node ${g}`);

  // Every gear node must hang off a rig joint — that is what makes the gear
  // follow the hands/chest through animation with no runtime mount math.
  const parentOf = new Map();
  js.nodes.forEach((n, i) => (n.children || []).forEach(c => parentOf.set(c, i)));
  const joints = new Set((js.skins && js.skins[0] && js.skins[0].joints) || []);
  for (const g of GEAR_NODES) {
    const idx = names.indexOf(g);
    const p = parentOf.get(idx);
    assert.ok(p !== undefined && joints.has(p), `${g} is not parented to a rig joint`);
  }
});

test('Player.js gear tables stay in sync with the GLB and item labels', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', '..', 'js', 'entities', 'Player.js'), 'utf8');
  for (const g of GEAR_NODES) {
    assert.ok(src.includes(`'${g}'`), `Player.js GEAR_NODE_NAMES lost '${g}'`);
  }
  // Item labels the visuals key off: the starter blade (main.js) + crafted gear.
  const crafting = fs.readFileSync(
    path.join(__dirname, '..', '..', 'js', 'systems', 'CraftingSystem.js'), 'utf8');
  const mainSrc = fs.readFileSync(
    path.join(__dirname, '..', '..', 'js', 'main.js'), 'utf8');
  for (const label of ['Basic Blade', 'Spike Knuckles', 'Basic Shield']) {
    assert.ok(src.includes(`'${label}'`), `Player.js gear map lost '${label}'`);
    assert.ok(crafting.includes(`'${label}'`), `CraftingSystem lost recipe label '${label}'`);
  }
  assert.ok(src.includes(`'Scrap Blade'`) && mainSrc.includes(`'Scrap Blade'`),
    'starter Scrap Blade label out of sync');
});

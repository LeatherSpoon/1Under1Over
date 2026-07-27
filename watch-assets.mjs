// watch-assets.mjs — edit a .blend, save it, and the game's GLBs update.
//
// Run via watch-assets.bat (or `node watch-assets.mjs`). Watches the .blend
// sources listed below; on save, runs headless Blender with
// Assets/3D/export_blend.py, which re-exports every marked collection to
// models/. Reload the game tab afterwards and the change is live — no
// Claude session needed.
//
// To enroll another .blend: give each exportable asset a top-level collection
// named exactly like its output GLB (e.g. 'Pandora_Hometree') with an
// 'export_offset' custom property ([0,0,0] if it sits at origin), then add
// the file to WATCHED here.
import { spawn } from 'node:child_process';
import { watchFile } from 'node:fs';
import { existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const BLENDER = process.env.BLENDER_EXE
  || 'C:\\Program Files\\Blender Foundation\\Blender 5.1\\blender.exe';
const EXPORTER = path.join(ROOT, 'Assets', '3D', 'export_blend.py');

const WATCHED = [
  'Assets/3D/VerdantMaw/Canopy.blend',
  'Assets/3D/VerdantMaw/Duskdart.blend',
  'Assets/3D/VerdantMaw/PandoraFlora.blend',
  'Assets/3D/VerdantMaw/PandoraBridges.blend',
  'Assets/3D/VerdantMaw/PandoraPads.blend',
  'Assets/3D/VerdantMaw/PandoraDressing.blend',
  'Assets/3D/VerdantMaw/CanopyGate.blend',
  'Assets/3D/VerdantMaw/GreatTree.blend',
  'Assets/3D/VerdantMaw/RootSpire.blend',
  'Assets/3D/VerdantMaw/LanternTree.blend',
  'Assets/3D/VerdantMaw/GladeArch.blend',
  'Assets/3D/VerdantMaw/SkyIsle.blend',
  'Assets/3D/VerdantMaw/BambooGrove.blend',
  'Assets/3D/VerdantMaw/GoldTree.blend',
  'Assets/3D/LandingSite/Knoll.blend',
  // Frozen Tundra glacier round. GlacierKit holds five collections side by
  // side (sastrugi ×2, shelf wall, rift wall, ice bridge) — the exporter
  // handles that via each collection's export_offset.
  'Assets/3D/FrozenTundra/GlacierKit.blend',
  'Assets/3D/FrozenTundra/IceArch.blend',
];

const busy = new Set();
const queued = new Set();

function ts() { return new Date().toLocaleTimeString(); }

function exportBlend(rel) {
  if (busy.has(rel)) { queued.add(rel); return; }
  busy.add(rel);
  const file = path.join(ROOT, rel);
  console.log(`[${ts()}] ${rel} changed — exporting…`);
  const proc = spawn(BLENDER, ['-b', file, '--python', EXPORTER], { windowsHide: true });
  let out = '';
  proc.stdout.on('data', d => { out += d; });
  proc.stderr.on('data', d => { out += d; });
  proc.on('close', (code) => {
    const line = out.split('\n').find(l => l.startsWith('EXPORTED:'));
    if (code === 0 && line) console.log(`[${ts()}] ${rel} → ${line.trim()}`);
    else console.log(`[${ts()}] ${rel} export FAILED (exit ${code}):\n${out.slice(-800)}`);
    busy.delete(rel);
    if (queued.delete(rel)) exportBlend(rel); // a save landed mid-export
  });
}

let watching = 0;
for (const rel of WATCHED) {
  const file = path.join(ROOT, rel);
  if (!existsSync(file)) { console.log(`(skipping missing ${rel})`); continue; }
  watchFile(file, { interval: 1000 }, (curr, prev) => {
    if (curr.mtimeMs !== prev.mtimeMs && curr.size > 0) exportBlend(rel);
  });
  watching++;
}
console.log(`Asset watcher: ${watching} .blend source(s) watched.`);
console.log('Edit in Blender, save, then reload the game tab. Ctrl+C to stop.');

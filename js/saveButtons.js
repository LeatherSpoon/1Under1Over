import { SaveSystem } from './systems/SaveSystem.js';
import { isMineFloorCell, mineWorldToCell, MINE_SPAWN_POS } from './scene/MineLayout.js';

/**
 * Apply a parsed save blob and move the player into it. Shared by the LOAD
 * button and the cloud-save boot restore. Returns the apply() result or null.
 */
export function applySessionData(data, { saveSystem, player, hud, switchZone }) {
  const result = saveSystem.apply(data);
  if (!result) return null;
  switchZone(result.zone);
  // Saves from before the mine redesign can point inside the new cave
  // walls — snap those to the mine spawn instead of restoring into rock.
  let px = result.playerX, pz = result.playerZ;
  if (result.zone === 'mine') {
    const { c, r } = mineWorldToCell(px, pz);
    if (!isMineFloorCell(c, r)) ({ x: px, z: pz } = MINE_SPAWN_POS);
  }
  player.teleportTo(px, pz);
  hud._buildStatList();
  hud._refreshTabUnlocks({ silent: true });
  return result;
}

export function initSaveButtons({ saveSystem, env, player, hud, switchZone, cloudSaves = null }) {
  const saveBtn = document.getElementById('btn-save');
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      const name = prompt('Session name:', `Session_${new Date().toISOString().slice(0,10)}`);
      if (!name) return;
      const filename = saveSystem.saveToFile(
        env.currentZone, player.position.x, player.position.z, name
      );
      saveBtn.textContent = 'SAVED!';
      setTimeout(() => { saveBtn.textContent = 'SAVE'; }, 1500);
      console.log(`%cSession saved: ${filename}`, 'color:#ff8800');
    });
  }

  const loadBtn = document.getElementById('btn-load');
  if (loadBtn) {
    const fileInput = document.getElementById('session-file-input');

    loadBtn.addEventListener('click', () => {
      if (fileInput) fileInput.click();
    });

    if (fileInput) {
      fileInput.addEventListener('change', async () => {
        const file = fileInput.files[0];
        if (!file) return;

        const data = await saveSystem.loadFromFile(file);
        if (!data) {
          loadBtn.textContent = 'FAIL';
          setTimeout(() => { loadBtn.textContent = 'LOAD'; }, 1500);
          return;
        }

        const result = applySessionData(data, { saveSystem, player, hud, switchZone });
        if (result) {
          const info = SaveSystem.getSaveInfo(data);
          loadBtn.textContent = 'LOADED!';
          setTimeout(() => { loadBtn.textContent = 'LOAD'; }, 1500);
          console.log(`%cSession loaded: ${info.sessionName} (${info.zone}, ${info.pp} PP)`, 'color:#44ff88');
        }

        fileInput.value = '';
      });
    }
  }

  // Cloud autosave toggle — pause before loading god-mode test sessions so
  // they don't overwrite the real cloud save.
  const cloudBtn = document.getElementById('btn-cloud');
  if (cloudBtn && cloudSaves) {
    const paint = () => {
      const on = cloudSaves.enabled;
      cloudBtn.textContent = on ? 'CLOUD' : 'CLOUD✕';
      cloudBtn.style.opacity = on ? '' : '0.45';
      cloudBtn.title = on
        ? 'Cloud autosave ON — click to pause (for test sessions)'
        : 'Cloud autosave OFF — click to resume';
    };
    cloudBtn.addEventListener('click', () => {
      cloudSaves.setEnabled(!cloudSaves.enabled);
      paint();
      if (cloudSaves.enabled) cloudSaves.uploadIfChanged();
    });
    paint();
  }
}

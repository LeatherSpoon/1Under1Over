import { SaveSystem } from './systems/SaveSystem.js';

export function initSaveButtons({ saveSystem, env, player, hud, switchZone }) {
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

        const result = saveSystem.apply(data);
        if (result) {
          switchZone(result.zone);
          player.teleportTo(result.playerX, result.playerZ);
          hud._buildStatList();
          const info = SaveSystem.getSaveInfo(data);
          loadBtn.textContent = 'LOADED!';
          setTimeout(() => { loadBtn.textContent = 'LOAD'; }, 1500);
          console.log(`%cSession loaded: ${info.sessionName} (${info.zone}, ${info.pp} PP)`, 'color:#44ff88');
        }

        fileInput.value = '';
      });
    }
  }
}

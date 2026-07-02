// Standalone panels have their own full-screen backdrop and must NOT show
// #menu-screen alongside them — menu-screen z-index 155 sits above these panels
// (z-index 150) and its transparent backdrop would capture all clicks, closing them.
const STANDALONE_PANEL_IDS = new Set([
  'inventory-panel', 'crafting-panel', 'drone-panel', 'ascension-panel', 'drill-panel'
]);

export const MENU_PANEL_IDS = [
  'inventory-panel', 'crafting-panel', 'drone-panel', 'equipment-panel',
  'pedometer-panel', 'tech-panel', 'mastery-panel', 'achievements-panel',
  'ascension-panel', 'codex-panel', 'augmentations-panel',
  'optimization-panel', 'allocation-panel', 'settings-panel', 'stat-sidebar',
  'workshop-panel', 'constructor-panel', 'fabrication-panel', 'assembly-matrix-panel',
  'refinery-panel',
];

export function initMenuController({ hud, telemetry, env }) {
  const menuBtn = document.getElementById('menu-toggle-btn');
  const menuScreen = document.getElementById('menu-screen');
  const menuBackdrop = document.getElementById('menu-backdrop');
  const menuTabs = Array.from(document.querySelectorAll('.menu-tab'));

  function openMenuScreen(initialTab = 'stat-sidebar') {
    if (!menuScreen) return;
    menuScreen.hidden = false;
    activateTab(initialTab);
  }

  function closeMenuScreen() {
    if (!menuScreen) return;
    menuScreen.hidden = true;
    for (const id of MENU_PANEL_IDS) {
      const p = document.getElementById(id);
      if (p) p.hidden = true;
    }
    menuTabs.forEach(t => t.classList.remove('active'));
  }

  function activateTab(panelId) {
    for (const id of MENU_PANEL_IDS) {
      const p = document.getElementById(id);
      if (p) p.hidden = (id !== panelId);
    }
    menuTabs.forEach(t => t.classList.toggle('active', t.dataset.tab === panelId));
    if (hud?._refreshPanel) hud._refreshPanel(panelId);
  }

  if (menuBtn) {
    menuBtn.addEventListener('click', () => {
      if (menuScreen?.hidden) openMenuScreen();
      else closeMenuScreen();
    });
  }

  menuTabs.forEach(t => {
    t.addEventListener('click', () => activateTab(t.dataset.tab));
  });

  if (menuBackdrop) {
    menuBackdrop.addEventListener('click', () => {
      // If any panel-overlay panel is currently visible, leave it open — the panel
      // has its own close button. Backdrop clicks would otherwise pass through the
      // panel-overlay (pointer-events:none) and unintentionally close the menu.
      for (const id of MENU_PANEL_IDS) {
        const p = document.getElementById(id);
        if (p && !p.hidden && p.classList.contains('panel-overlay')) return;
      }
      closeMenuScreen();
    });
  }

  document.addEventListener('keydown', e => {
    if (e.code === 'Escape') {
      if (menuScreen && !menuScreen.hidden) closeMenuScreen();
      const cp = document.getElementById('construct-panel');
      if (cp && !cp.hidden) {
        cp.hidden = true;
        document.getElementById('btn-construct')?.classList.remove('active');
      }
    }
  });

  const constructBtn = document.getElementById('btn-construct');
  if (constructBtn) {
    constructBtn.addEventListener('click', () => {
      const panel = document.getElementById('construct-panel');
      if (!panel) return;
      const opening = panel.hidden;
      panel.hidden = !opening;
      constructBtn.classList.toggle('active', opening);
      if (opening) hud._refreshConstructPanel();
    });
  }

  // Sync grid visibility with construct panel open/closed state (handles all
  // code paths: the BUILD button, the ↩ RETURN button, and any other close).
  if (env) {
    const constructPanel = document.getElementById('construct-panel');
    if (constructPanel) {
      new MutationObserver(() => {
        env.setGridVisible(!constructPanel.hidden);
      }).observe(constructPanel, { attributeFilter: ['hidden'] });
    }
  }

  // Settings buttons forward to existing handlers (which live on hidden legacy buttons)
  function wireSettingsForward(srcId, dstId) {
    const src = document.getElementById(srcId);
    const dst = document.getElementById(dstId);
    if (src && dst) src.addEventListener('click', () => dst.click());
  }
  wireSettingsForward('btn-settings-save', 'btn-save');
  wireSettingsForward('btn-settings-load', 'btn-load');
  wireSettingsForward('btn-settings-achievements', 'btn-toggle-achievements');
  wireSettingsForward('btn-settings-augmentations', 'btn-toggle-augmentations-panel');
  wireSettingsForward('btn-settings-pedometer', 'btn-toggle-pedometer-panel');
  wireSettingsForward('btn-settings-minigame', 'btn-toggle-minigame');

  document.addEventListener('click', e => {
    if (e.target.tagName === 'BUTTON') {
      setTimeout(() => document.body.focus(), 0);
    }
  });
  document.body.tabIndex = -1;

  function togglePanel(panelId) {
    const panel = document.getElementById(panelId);
    if (!panel) return;
    const wasHidden = panel.hidden;
    for (const id of MENU_PANEL_IDS) {
      if (id === panelId) continue;
      const p = document.getElementById(id);
      if (p) p.hidden = true;
    }
    if (wasHidden) {
      if (STANDALONE_PANEL_IDS.has(panelId)) {
        if (menuScreen) menuScreen.hidden = true;
        menuTabs.forEach(t => t.classList.remove('active'));
      } else {
        if (menuScreen) menuScreen.hidden = false;
        menuTabs.forEach(t => t.classList.toggle('active', t.dataset.tab === panelId));
      }
      panel.hidden = false;
      hud._refreshPanel(panelId);
      const name = panelId.replace('-panel', '');
      telemetry.trackPanelOpen(name);
    } else {
      panel.hidden = true;
      if (!STANDALONE_PANEL_IDS.has(panelId)) closeMenuScreen();
    }
  }

  window.togglePanel = togglePanel;
  return { togglePanel, closeMenuScreen };
}

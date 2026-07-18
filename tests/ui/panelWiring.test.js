import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import { MENU_PANEL_IDS } from '../../js/menuController.js';

// Enforces the "adding a panel" checklist in CLAUDE.md. When a named assertion
// fails, the fix is to add the missing entry it names (or, for a deliberate
// divergence, add it to the exception list here with a comment).

const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const indexSrc = read('../../index.html');
const hudSrc = read('../../js/ui/HUD.js');

test('every MENU_PANEL_IDS entry has a matching element in index.html', () => {
  for (const id of MENU_PANEL_IDS) {
    assert.ok(indexSrc.includes(`id="${id}"`),
      `panel id '${id}' is in MENU_PANEL_IDS (js/menuController.js) but has no element in index.html`);
  }
});

test('every menu-tab data-tab in index.html targets a known panel', () => {
  const tabs = [...indexSrc.matchAll(/class="menu-tab[^"]*"[^>]*data-tab="([\w-]+)"/g)].map(m => m[1]);
  assert.ok(tabs.length > 0, 'could not locate any .menu-tab data-tab attributes in index.html');
  for (const tab of tabs) {
    assert.ok(MENU_PANEL_IDS.includes(tab),
      `menu tab data-tab="${tab}" in index.html is not listed in MENU_PANEL_IDS (js/menuController.js)`);
  }
});

test('MENU_PANEL_IDS and HUD._closeCommandPanels stay in sync', () => {
  const start = hudSrc.indexOf('_closeCommandPanels(exceptId = null) {');
  assert.ok(start !== -1, 'could not locate _closeCommandPanels in js/ui/HUD.js');
  const end = hudSrc.indexOf('];', start);
  const closeIds = [...hudSrc.slice(start, end).matchAll(/'([\w-]+)'/g)].map(m => m[1]);

  // Known divergences between the two lists. A new panel must appear in BOTH
  // lists (CLAUDE.md checklist step 4) unless deliberately added here.
  const MENU_ONLY = new Set(['crafting-panel', 'drone-panel', 'settings-panel']);
  const CLOSE_ONLY = new Set(['statistics-panel', 'drill-panel']); // HUD-button panels, not menu tabs

  for (const id of MENU_PANEL_IDS) {
    if (MENU_ONLY.has(id)) continue;
    assert.ok(closeIds.includes(id),
      `panel '${id}' is in MENU_PANEL_IDS but missing from _closeCommandPanels in js/ui/HUD.js — ` +
      `add it there (or to MENU_ONLY in this test with a comment)`);
  }
  for (const id of closeIds) {
    if (CLOSE_ONLY.has(id)) continue;
    assert.ok(MENU_PANEL_IDS.includes(id),
      `panel '${id}' is in _closeCommandPanels (js/ui/HUD.js) but missing from MENU_PANEL_IDS ` +
      `(js/menuController.js) — add it there (or to CLOSE_ONLY in this test with a comment)`);
  }
});

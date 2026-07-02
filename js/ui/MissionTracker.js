// Tracks the player's Main objective (story-driven, automatic) and Side objective (Codex-driven, player-chosen).
// Phase 1: dumb display + side picker driven by codex entries. Story progression hooks come later.

export class MissionTracker {
  constructor({ codexSystem = null } = {}) {
    this.codex = codexSystem;
    this.mainText = document.getElementById('mission-main-text');
    this.sideText = document.getElementById('mission-side-text');
    this.pickBtn = document.getElementById('mission-side-pick');

    this.main = { id: 'intro', text: 'Awaiting transmission…' };
    this.side = null; // { id, text }
    this._steps = null; // [{ desc, done }] — set by setSequence

    if (this.pickBtn) {
      this.pickBtn.addEventListener('click', () => this.openSidePicker());
    }
    this._render();
  }

  setMain(text, id = null) {
    this.main = { id, text };
    this._steps = null;
    this._render();
  }

  // Display a mission sequence with ordered steps and completion checkmarks.
  // steps: [{ desc: string, done: boolean }]
  setSequence(label, steps) {
    this.main = { id: null, text: label };
    this._steps = steps.map(s => ({ ...s }));
    this._render();
  }

  setSide(entry) {
    this.side = entry; // { id, text } or null
    this._render();
  }

  openSidePicker() {
    // Phase 1: cycle through discovered codex entries as side objectives.
    // A proper picker UI lives inside the Codex tab in a later phase.
    const entries = this._codexEntries();
    if (!entries.length) {
      this._flash(this.sideText, 'No codex entries discovered yet');
      return;
    }
    const curIdx = this.side ? entries.findIndex(e => e.id === this.side.id) : -1;
    const next = entries[(curIdx + 1) % entries.length];
    this.setSide({ id: next.id, text: next.text });
  }

  _codexEntries() {
    if (!this.codex) return [];
    if (typeof this.codex.getEntries === 'function') {
      return this.codex.getEntries()
        .filter(e => e.discovered)
        .map(e => ({
          id: e.key,
          text: `Research: ${e.label}`
        }));
    }
    const src = this.codex.entries || this.codex.discovered || this.codex.unlocked || [];
    const list = Array.isArray(src) ? src : Object.values(src);
    return list
      .filter(e => e && (e.discovered || e.unlocked || e.known))
      .map(e => ({
        id: e.id || e.key || e.name,
        text: e.objective || e.summary || e.title || e.name || String(e.id || 'Unknown')
      }));
  }

  _flash(el, text) {
    if (!el) return;
    const prev = el.textContent;
    el.textContent = text;
    setTimeout(() => { el.textContent = prev; }, 1500);
  }

  _render() {
    if (this.mainText) {
      if (this._steps) {
        this.mainText.innerHTML = '';
        const title = document.createElement('div');
        title.className = 'mission-seq-title';
        title.textContent = this.main.text;
        this.mainText.appendChild(title);
        for (const step of this._steps) {
          const row = document.createElement('div');
          row.className = step.done ? 'mission-step mission-step-done' : 'mission-step';
          row.textContent = step.desc;
          this.mainText.appendChild(row);
        }
      } else {
        this.mainText.textContent = this.main?.text || '—';
      }
    }
    if (this.sideText) this.sideText.textContent = this.side?.text || 'No side objective';
  }

  serialize() {
    return { main: this.main, side: this.side };
  }
  load(data) {
    if (!data) return;
    if (data.main) this.main = data.main;
    if (data.side !== undefined) this.side = data.side;
    this._render();
  }
}

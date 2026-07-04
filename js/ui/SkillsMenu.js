import { CONFIG } from '../config.js';

export class SkillsMenu {
  constructor(combatSystem, statsSystem) {
    this.combat = combatSystem;
    this.stats = statsSystem;
    this.el = document.getElementById('skills-list');
    this._build();
  }

  _build() {
    this.el.innerHTML = '';
    for (const [key, skill] of Object.entries(CONFIG.SKILLS)) {
      const btn = document.createElement('button');
      btn.className = 'skill-btn action-btn';
      btn.dataset.key = key;
      btn.innerHTML = `<span class="skill-name">${skill.label}</span><span class="skill-fp">${skill.fp} FP</span>`;
      btn.onclick = () => {
        this.combat.useSkill(key);
        // Close skills menu and return to main actions
        window.combatUI.closeSkills();
      };
      this.el.appendChild(btn);
    }
  }

  /**
   * Update enabled/disabled state based on current FP.
   */
  update(currentFP) {
    const btns = this.el.querySelectorAll('.skill-btn');
    btns.forEach(btn => {
      const key = btn.dataset.key;
      const cost = CONFIG.SKILLS[key]?.fp ?? 0;
      btn.disabled = currentFP < cost;
      btn.classList.toggle('fp-locked', currentFP < cost);
    });
  }
}

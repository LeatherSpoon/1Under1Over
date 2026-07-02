// ── Mathematician System ────────────────────────────────────────────────────
// Spend PP for a limited window during which the UI reveals "gains-per-resource"
// ratios across upgrades. Transforms upgrading from random clicking into ROI math.
//
// Hand-off §3: Purchase Efficiency and Strategic Reveal.

const HIRE_COST_BASE = 250;
const HIRE_COST_GROWTH = 1.6;
const HIRE_DURATION_SEC = 90;

export class MathematicianSystem {
  constructor(ppSystem) {
    this.pp = ppSystem;
    this.timeRemaining = 0;
    this.hires = 0;
  }

  get isActive() { return this.timeRemaining > 0; }
  get hireCost() { return Math.ceil(HIRE_COST_BASE * Math.pow(HIRE_COST_GROWTH, this.hires)); }

  hire() {
    if (this.isActive) return false;
    if (!this.pp.spend(this.hireCost)) return false;
    this.timeRemaining = HIRE_DURATION_SEC;
    this.hires++;
    return true;
  }

  update(delta) {
    if (this.timeRemaining > 0) {
      this.timeRemaining = Math.max(0, this.timeRemaining - delta);
    }
  }

  // Compute ROI rows. Returns ordered array (best ROI first).
  // Each row: { label, source, cost, gainPerSec, ratio, note }
  // ratio = gainPerSec / cost (PP/s gained per PP spent)
  analyze({ stats, ascension, techTree, modifiers }) {
    const rows = [];

    // Stat upgrades — PP rate impact via globalMultiplier-relevant stats.
    // We approximate gain by mapping each stat's effect onto current PP rate.
    const baseRate = this.pp.ppRate || 0.0001;

    for (const name of stats.statNames) {
      const cost = stats.upgradeCost(name);
      const lvl = stats.stats[name].level;
      let gainPerSec = 0;
      let note = '';

      switch (name) {
        case 'gatherSpeed':
          // 8% faster gathering — approximate as 8% of current rate's gather contribution.
          gainPerSec = baseRate * 0.08;
          note = '+8% gather speed';
          break;
        case 'craftingSpeed':
          gainPerSec = baseRate * 0.04;
          note = 'Faster craft cycles';
          break;
        case 'speed':
          gainPerSec = baseRate * 0.03;
          note = 'More steps → more PP';
          break;
        case 'strength':
          gainPerSec = baseRate * 0.05;
          note = '+2 dmg → faster combat';
          break;
        case 'health':
        case 'defense':
        case 'constitution':
          gainPerSec = baseRate * 0.02;
          note = 'Survival; indirect PP';
          break;
        case 'focus':
        case 'focusRate':
          gainPerSec = baseRate * 0.03;
          note = 'More skill uptime';
          break;
        case 'energyCap':
          gainPerSec = baseRate * 0.02;
          note = 'Longer gather sessions';
          break;
        case 'crafting':
          gainPerSec = baseRate * 0.03;
          note = 'Higher tier recipes';
          break;
        default:
          gainPerSec = baseRate * 0.01;
          note = 'Marginal';
      }

      rows.push({
        label: `${stats.getStatLabel(name)} Lv${lvl + 1}`,
        source: 'Stat',
        cost,
        gainPerSec,
        ratio: gainPerSec / cost,
        note,
      });
    }

    // Ascension upgrades — shown when affordable in AP terms.
    if (ascension && ascension.ascensionPoints > 0) {
      for (const upg of ascension.getUpgrades()) {
        const apCost = upg.cost;
        const equivalentPP = apCost * 5000;
        const pct = upg.id === 'ppMult' ? 0.25 : upg.id === 'gatherMult' ? 0.25 : upg.id === 'combatMult' ? 0.20 : 0.30;
        const gainPerSec = baseRate * pct;
        rows.push({
          label: upg.label,
          source: `Asc·${apCost} AP`,
          cost: equivalentPP,
          gainPerSec,
          ratio: gainPerSec / Math.max(1, equivalentPP),
          note: upg.desc,
        });
      }
    }

    rows.sort((a, b) => b.ratio - a.ratio);
    return rows;
  }

  serialize() {
    return { hires: this.hires, timeRemaining: this.timeRemaining };
  }

  load(data) {
    if (!data) return;
    this.hires = data.hires || 0;
    this.timeRemaining = data.timeRemaining || 0;
  }
}

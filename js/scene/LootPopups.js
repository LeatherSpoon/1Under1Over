import * as THREE from 'three';

/**
 * World-space floating loot text ("+2 Stone") — a canvas-texture sprite that
 * rises and fades above the gathered object, so rewards read at a glance
 * without watching the interact hint. One instance lives in main.js; call
 * spawn() on gather completion and update(dt) every frame.
 */
export class LootPopups {
  constructor(scene) {
    this.scene = scene;
    this._live = [];
  }

  /** line staggers stacked popups from one gather (0 = bottom). */
  spawn(x, z, text, color = 0xffffff, line = 0) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const g = canvas.getContext('2d');
    g.font = 'bold 42px "Courier New", monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 9;
    g.strokeStyle = 'rgba(0, 0, 0, 0.85)';
    g.strokeText(text, 128, 32);
    g.fillStyle = '#' + new THREE.Color(color).getHexString();
    g.fillText(text, 128, 32);

    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(canvas),
      transparent: true,
      depthTest: false, // always readable, even against tall rock behind
    }));
    sprite.scale.set(3.4, 0.85, 1);
    sprite.position.set(x, 2.1 + line * 0.75, z);
    sprite.renderOrder = 10;
    this.scene.add(sprite);
    this._live.push({ sprite, t: 0 });
  }

  update(dt) {
    for (let i = this._live.length - 1; i >= 0; i--) {
      const p = this._live[i];
      p.t += dt;
      p.sprite.position.y += dt * 0.9;
      p.sprite.material.opacity = p.t < 1.1 ? 1 : Math.max(0, 1 - (p.t - 1.1) / 0.7);
      if (p.t >= 1.8) {
        this.scene.remove(p.sprite);
        p.sprite.material.map.dispose();
        p.sprite.material.dispose();
        this._live.splice(i, 1);
      }
    }
  }
}

// WorldEffects.js
// Lightweight world-space particle bursts. Currently used for the offload burst at
// the Offload Chamber. Future: secret-unlock bursts (deferred — see TODO in main.js).

import * as THREE from 'three';

export class WorldEffects {
  constructor(scene) {
    this.scene = scene;
    this._bursts = [];
  }

  triggerOffload(position) {
    this._spawnBurst(position, 0x44ffaa, 32, 0.12, 2.2);
  }

  // Reserved for future secret-unlock visuals (currently unused; see SECRET_UNLOCKS TODO).
  triggerSecretUnlock(position) {
    this._spawnBurst(position, 0xffdd00, 24, 0.08, 1.8);
  }

  _spawnBurst(position, color, count, speed, lifetime) {
    if (!position) return;
    const group = new THREE.Group();
    group.position.copy(position);
    group.position.y = 0.5;

    const geo = new THREE.SphereGeometry(0.08, 4, 4);
    // Shared material per burst so opacity fade applies to all particles
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true });

    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(geo, mat);
      const angle = (i / count) * Math.PI * 2;
      mesh.userData.vx = Math.cos(angle) * speed;
      mesh.userData.vz = Math.sin(angle) * speed;
      mesh.userData.vy = (Math.random() - 0.5) * speed * 0.5;
      group.add(mesh);
    }

    this.scene.add(group);
    this._bursts.push({ group, mat, lifetime, elapsed: 0 });
  }

  update(delta) {
    for (let i = this._bursts.length - 1; i >= 0; i--) {
      const b = this._bursts[i];
      b.elapsed += delta;
      const t = Math.min(1, b.elapsed / b.lifetime);

      for (const mesh of b.group.children) {
        mesh.position.x += mesh.userData.vx * delta;
        mesh.position.z += mesh.userData.vz * delta;
        mesh.position.y += mesh.userData.vy * delta;
      }
      b.mat.opacity = 1 - t;

      if (b.elapsed >= b.lifetime) {
        this.scene.remove(b.group);
        b.mat.dispose();
        this._bursts.splice(i, 1);
      }
    }
  }
}

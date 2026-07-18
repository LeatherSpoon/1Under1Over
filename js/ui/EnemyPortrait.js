// EnemyPortrait.js — snapshots the live enemy through a temporary close-up
// camera on the main renderer, giving the combat overlay a real portrait of
// the exact mesh (procedural or GLB) in its current pose and habitat.
// One extra frame is drawn on the main canvas at combat start; the combat
// overlay covers it before the next visible repaint. Returns a data URL, or
// null on any failure — callers keep the CSS placeholder as fallback.
import * as THREE from 'three';

const PORTRAIT_PX = 240;

export function renderEnemyPortrait(enemy, renderer, scene, hideDuringShot = []) {
  if (!enemy?.group || !renderer || !scene) return null;
  const hidden = [];
  try {
    // Frame only the enemy's body meshes — floor rings (aggro zone, ground
    // shadow) and the floating threat indicator would inflate the bounding
    // sphere and shrink the subject.
    enemy.group.updateWorldMatrix(true, true);
    const box = new THREE.Box3();
    const tmp = new THREE.Box3();
    enemy.group.traverse((o) => {
      if (!o.isMesh || !o.visible || o === enemy._threatIndicator) return;
      const t = o.geometry?.type;
      if (t === 'RingGeometry' || t === 'CircleGeometry') return;
      tmp.setFromObject(o);
      box.union(tmp);
    });
    if (box.isEmpty()) return null;
    const center = box.getCenter(new THREE.Vector3());
    const sphere = box.getBoundingSphere(new THREE.Sphere());

    const src = renderer.domElement;
    const cam = new THREE.PerspectiveCamera(32, src.width / src.height, 0.1, 60);
    // High 3/4 hero angle — steep enough that cave walls beside the enemy
    // don't block the shot — framed so the sphere fits the center-square crop.
    const fitR = Math.max(sphere.radius, 0.5) * 1.3;
    const dist = fitR / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const dir = new THREE.Vector3(0.55, 1.25, 0.75).normalize();
    cam.position.copy(center).addScaledVector(dir, dist);
    cam.lookAt(center);

    // The player stands adjacent when combat starts — keep them (and any other
    // passed objects) plus the enemy's own markers out of the shot.
    const toHide = [...hideDuringShot, enemy._aggroRing, enemy._threatIndicator];
    for (const obj of toHide) {
      if (obj && obj.visible) { obj.visible = false; hidden.push(obj); }
    }

    // Fill light so cave enemies aren't pitch black in the shot
    const fill = new THREE.PointLight(0xffffff, 1.3, fitR * 14);
    fill.position.copy(cam.position);
    fill.position.y += 1.5;
    scene.add(fill);
    renderer.render(scene, cam);
    scene.remove(fill);
    for (const obj of hidden) obj.visible = true;

    // Copy the center square of the frame into the portrait canvas.
    // (Synchronous copy in the same task — no preserveDrawingBuffer needed.)
    const side = Math.min(src.width, src.height);
    const out = document.createElement('canvas');
    out.width = out.height = PORTRAIT_PX;
    out.getContext('2d').drawImage(
      src, (src.width - side) / 2, (src.height - side) / 2, side, side,
      0, 0, PORTRAIT_PX, PORTRAIT_PX
    );
    return out.toDataURL('image/jpeg', 0.9);
  } catch {
    for (const obj of hidden) obj.visible = true;
    return null; // portrait is decorative — never let it break combat
  }
}

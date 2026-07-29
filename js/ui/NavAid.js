import * as THREE from 'three';
import { layoutIndicators } from './navAidLayout.js';

// Off-screen landmark indicators (D2 of the Expanded Biome Worlds plan —
// Plans/Expanded-Biome-Worlds-Implementation.md §2): rather than keep every
// landmark within the camera's ~14-21 unit reach, point at the ones that
// have scrolled off it. The camera never rotates (SceneManager.js applies a
// fixed CAMERA_OFFSET and always looks at the player), so a target's screen
// position is a pure function of the live camera + its world position —
// THREE.Vector3.project() gives that directly from the camera's actual
// projection/view matrices, so this stays correct if zoom, aspect, or the
// frustum size ever change.
//
// This file is only the projection step; all the screen math lives in the
// three-free navAidLayout.js so it can be unit-tested.

const _v = new THREE.Vector3();

/**
 * @param {THREE.Camera} camera
 * @param {number} viewportW
 * @param {number} viewportH
 * @param {{x:number, z:number, y?:number, id:string, label:string, kind:string, locked?:boolean, distance:number}[]} targets
 */
export function computeOffscreenIndicators(camera, viewportW, viewportH, targets) {
  const projected = [];
  for (const t of targets) {
    _v.set(t.x, t.y ?? 0, t.z);
    _v.project(camera);
    projected.push({ ...t, ndcX: _v.x, ndcY: _v.y });
  }
  return layoutIndicators(projected, viewportW, viewportH);
}

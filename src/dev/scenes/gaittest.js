// Foot-slip check: ?scene=gaittest — simulates straight runs / walks and reports how fast the planted foot
// moves in world space during stance (0 = perfectly planted). Results in window.__gait and the info line.
import * as THREE from 'three';
import { createFighter } from '../../entities/fighter.js';
import { preloadPlayerModel } from '../../entities/playerModel.js';

export default async function (ctx) {
  await preloadPlayerModel();
  const res = {};
  for (const [v, st] of [[6.2, 'sword'], [2.4, 'sword'], [1.2, 'sword'], [6.2, 'dual'], [3.7, 'back']]) {
    const f = createFighter();
    const a = f.anim;
    a.speed = v > 3 ? 1 : 0.39; a.groundSpeed = v;
    if (st === 'dual') a.setStyle('dual');
    const dir = st === 'back' ? -1 : 1;
    a.moveDir = dir;
    const dt = 1 / 240, out = [];
    const foot = f.rig.bones.Bone_013;
    let z = 0;
    for (let i = 0; i < 480; i++) {
      z += dir * v * dt;
      f.root.position.z = z;
      a.update(dt, f.root.position);
      f.root.updateMatrixWorld(true);
      const p = new THREE.Vector3().setFromMatrixPosition(foot.matrixWorld);
      if (i >= 240) out.push([p.y, p.z]);
    }
    const minY = Math.min(...out.map((o) => o[0]));
    const sp = [];
    for (let i = 1; i < out.length; i++) if (out[i][0] < minY + 0.01 && out[i - 1][0] < minY + 0.01) sp.push((out[i][1] - out[i - 1][1]) / dt);
    res[v + st] = {
      minY: +minY.toFixed(3), maxY: +Math.max(...out.map((o) => o[0])).toFixed(3), stance: sp.length,
      avg: sp.length ? +(sp.reduce((s, x) => s + x, 0) / sp.length).toFixed(2) : null,
      max: sp.length ? +Math.max(...sp.map(Math.abs)).toFixed(2) : null,
    };
  }
  window.__gait = res;
  ctx.info(JSON.stringify(res));
}

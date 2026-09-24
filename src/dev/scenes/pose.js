// Pose tuner: ?scene=pose&base=idle|battle|sit|run&var=handR:-0.4,0.5,0.3;armR:..|handR:...
import * as THREE from 'three';
import { createFighter } from '../../entities/fighter.js';
import { P_IDLE, P_BATTLE, P_SIT, fullPose } from '../../entities/anim.js';

export default function (ctx) {
  const { scene, q } = ctx;
  const baseName = q.get('base') || 'idle';
  const base = { idle: P_IDLE, battle: P_BATTLE, sit: P_SIT, run: P_IDLE }[baseName];
  const vars = (q.get('var') || '').split('|');
  const n = vars.length;
  const list = [];
  vars.forEach((v, i) => {
    const pose = JSON.parse(JSON.stringify(base));
    for (const part of v.split(';').filter(Boolean)) {
      const [k, vals] = part.split(':');
      pose[k] = vals.split(',').map(Number);
    }
    const f = createFighter();
    f.anim.idlePose = fullPose(pose);
    if (baseName === 'run') {
      f.anim.speed = 1;
      f.anim.runOverride = pose;
    }
    f.root.position.x = (i - (n - 1) / 2) * 1.5;
    f.root.rotation.y = Number(q.get('rot') || 0);
    scene.add(f.root);
    for (let k = 0; k < Math.ceil(Number(q.get('time') || 0.3) / 0.01); k++) f.anim.update(0.01, f.root.position);
    list.push(f);
  });
  ctx.info(vars.map((v, i) => `${i}: ${v}`).join('\n'));
}

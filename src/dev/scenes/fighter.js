// Fighter model preview: ?scene=fighter&anim=attack1&time=0.25&speed=1&battle=1&sit=0 (&model=0 = procedural chibi)
import * as THREE from 'three';
import { createFighter } from '../../entities/fighter.js';
import { preloadPlayerModel } from '../../entities/playerModel.js';

export default async function (ctx) {
  const { scene, q } = ctx;
  if (q.get('model') !== '0') await preloadPlayerModel();
  const f = createFighter();
  scene.add(f.root);
  const others = [];
  if (q.get('lineup')) {
    for (const [i, cfg] of [[-1.6, { battle: 1 }], [1.6, { speed: 1 }]]) {
      const g = createFighter();
      g.root.position.x = i;
      scene.add(g.root);
      if (cfg.battle) g.anim.battleTarget = g.anim.battle = 1;
      if (cfg.speed) g.anim.speed = 1;
      others.push(g);
    }
  }
  const anim = q.get('anim');
  const time = Number(q.get('time') || 0);
  f.anim.speed = Number(q.get('speed') || 0);
  f.anim.battle = f.anim.battleTarget = Number(q.get('battle') || 0);
  f.anim.sit = f.anim.sitTarget = Number(q.get('sit') || 0);
  f.root.rotation.y = Number(q.get('rot') || 0);
  if (anim) {
    f.anim.play(anim);
    // step to requested time
    const steps = Math.ceil(time / 0.01);
    for (let i = 0; i < steps; i++) f.anim.update(0.01, f.root.position);
    if (q.get('freeze')) { f.anim.action.speed = 0; }
  } else if (time) {
    const steps = Math.ceil(time / 0.01);
    for (let i = 0; i < steps; i++) f.anim.update(0.01, f.root.position);
  }
  const frozen = !!q.get('freeze');
  ctx.onUpdate((dt) => {
    if (!frozen) f.anim.update(dt, f.root.position);
    else f.anim.update(0, f.root.position);
    for (const o of others) o.anim.update(dt, o.root.position);
  });
  let tris = 0, meshes = 0;
  f.root.traverse((o) => { if (o.isMesh) { meshes++; tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; } });
  ctx.info(`fighter: ${meshes} meshes, ${Math.round(tris)} tris  anim=${anim || '-'} t=${time}`);
}

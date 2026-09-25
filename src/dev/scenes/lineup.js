// Animation filmstrip: ?scene=lineup&items=idle,battle,run@0,run@0.25,walk@0.5&dual=1&rot=1.57&gap=1.4
//   run@p / walk@p = locomotion frozen at cycle phase p (0..1); clip:name@t = clip frozen at time t
//   &ovs=armL:-0.3,0,0.1;elbowL:-1.6,-1.2,0|armL:... = one figure per run-override variant (at the first item)
import { createFighter } from '../../entities/fighter.js';
import { preloadPlayerModel } from '../../entities/playerModel.js';
import { preloadDualBlades, attachDualBlades, bladeTime } from '../../entities/weapons.js';
import { preloadNpcModel, createNpcRig } from '../../entities/npcModels.js';
import { Animator } from '../../entities/anim.js';
import { P_RATMOB } from '../../entities/monsters/skinned.js';

export default async function (ctx) {
  const { scene, q } = ctx;
  await preloadPlayerModel();
  const dual = !!q.get('dual');
  if (dual) await preloadDualBlades();
  let items = (q.get('items') || 'idle,run@0,run@0.25,run@0.5,run@0.75').split(',');
  const ovs = q.get('ovs') ? q.get('ovs').split('|').map((v) => {
    const o = {};
    for (const part of v.split(';').filter(Boolean)) { const [k, vals] = part.split(':'); o[k] = vals.split(',').map(Number); }
    return o;
  }) : null;
  if (ovs) items = ovs.map(() => items[0]);
  const gap = Number(q.get('gap') || 1.4);
  const rot = Number(q.get('rot') || 0);
  const figs = [];
  const npcId = q.get('npc');
  if (npcId) await preloadNpcModel(npcId);
  items.forEach((it, i) => {
    let f;
    if (npcId) {
      const rig = createNpcRig(npcId, {});
      f = { rig, root: rig.root, anim: new Animator(rig, { gait: 'free', idlePose: npcId === 'ratman_mob' ? P_RATMOB : undefined }) };
    } else f = createFighter();
    if (ovs) f.anim.runOverride = ovs[i];
    if (dual) {
      if (f.rig.weapon) f.rig.weapon.visible = false;
      attachDualBlades(f.rig, {});
      f.anim.setStyle('dual');
    }
    if (ovs && it.startsWith('idle')) f.anim.idlePose = { ...f.anim.idlePose, ...ovs[i] };
    f.root.position.x = (i - (items.length - 1) / 2) * gap;
    f.root.rotation.y = rot;
    scene.add(f.root);
    const [kind, arg] = it.split('@');
    const a = f.anim;
    if (kind === 'battle') a.battle = a.battleTarget = 1;
    if (kind === 'run' || kind === 'walk') {
      a.speed = kind === 'run' ? 1 : 0.4;
      a.groundSpeed = Number(q.get('v')) || (kind === 'run' ? 6.2 : 2.4);
      for (let k = 0; k < 20; k++) a.update(0.01, f.root.position);
      a.phase = Number(arg || 0) * Math.PI * 2;
      a.groundSpeed = 0;
      a.update(0, f.root.position);
    } else if (kind.startsWith('clip:')) {
      a.play(kind.slice(5));
      const steps = Math.ceil(Number(arg || 0) / 0.01);
      for (let k = 0; k < steps; k++) a.update(0.01, f.root.position);
      a.action.speed = 0;
    } else {
      for (let k = 0; k < 30; k++) a.update(0.01, f.root.position);
    }
    figs.push(f);
  });
  ctx.onUpdate((dt, t) => { bladeTime.value = t; for (const f of figs) f.anim.update(0, f.root.position); });
  ctx.info(items.join('  |  '));
}

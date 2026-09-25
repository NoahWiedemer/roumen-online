// Mount preview: ?scene=mounts&speed=0&rot=1.57&rider=1&phase=0 — raccoon and donkey side by side, optionally with
// a rider in the saddle; speed in m/s (0 = idle), phase freezes the gait (0..1) when given
import { createFighter } from '../../entities/fighter.js';
import { preloadPlayerModel } from '../../entities/playerModel.js';
import { createMount } from '../../entities/mounts.js';

export default async function (ctx) {
  const { scene, q, THREE } = ctx;
  await preloadPlayerModel();
  const speed = Number(q.get('speed') || 0);
  const rot = Number(q.get('rot') || 0);
  const rider = q.get('rider') !== '0';
  const list = [];
  ['raccoon', 'donkey'].forEach((kind, i) => {
    const m = createMount(kind);
    m.root.position.x = (i - 0.5) * 2.6;
    m.root.rotation.y = rot;
    scene.add(m.root);
    let f = null;
    if (rider) {
      f = createFighter();
      if (f.rig.weapon) f.rig.weapon.visible = false;
      f.anim.ride = f.anim.rideTarget = 1;
      scene.add(f.root);
    }
    list.push({ m, f });
  });
  const v = new THREE.Vector3();
  const frozen = q.has('phase');
  const place = (dt) => {
    for (const { m, f } of list) {
      m.update(frozen ? 0 : dt, speed);
      if (!f) continue;
      m.root.updateMatrixWorld(true);
      m.seat.getWorldPosition(v);
      f.root.position.set(v.x, v.y - f.rig.legGeo.top, v.z);
      f.root.rotation.set(m.body.rotation.x, rot, 0, 'YXZ');
      f.anim.update(dt, f.root.position);
    }
  };
  if (frozen) {
    // advance the gait to the requested phase at this speed, then hold it
    for (const { m } of list) { const steps = Math.round(Number(q.get('phase')) * m.def.stride / Math.max(0.1, speed) * 60); for (let k = 0; k < Math.max(steps, 30); k++) m.update(1 / 60, speed); }
  }
  ctx.onUpdate((dt) => place(dt));
  ctx.info(`mounts speed=${speed}`);
}

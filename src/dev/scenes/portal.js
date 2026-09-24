import { createPortal } from '../../world/portal.js';
import { Effects } from '../../entities/effects.js';

export default function (ctx) {
  const fx = new Effects(ctx.scene);
  const p = createPortal({ id: 'test', name: 'Forest of Tides', x: 0, y: 0, z: 0, rotY: 0 });
  ctx.scene.add(p.group);
  const t0 = Number(ctx.q.get('time') || 2);
  let t = t0;
  for (let i = 0; i < 60; i++) { p.update(1 / 60, t, fx); fx.update(1 / 60, ctx.camera); t += 1 / 60; }
  ctx.onUpdate((dt) => { t += dt; p.update(dt, t, fx); fx.update(dt, ctx.camera); });
  ctx.info('portal');
}

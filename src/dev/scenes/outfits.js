// Outfit preview: ?scene=outfits&rot=0.4 — one hero per armour set side by side (&sets=knight,ranger&mocap=1)
import { createFighter } from '../../entities/fighter.js';
import { preloadPlayerModel } from '../../entities/playerModel.js';
import { applyOutfit } from '../../entities/outfit.js';
import { preloadMocap } from '../../entities/mocap.js';

const SETS = {
  none: {},
  traveler: { armor: 'traveler_tunic', pants: 'traveler_pants', boots: 'traveler_shoes' },
  leather: { armor: 'armor_leather', pants: 'pants_leather', boots: 'boots_leather', gloves: 'gloves_leather' },
  ranger: { armor: 'ranger_vest', pants: 'ranger_pants', boots: 'ranger_boots', gloves: 'gloves_leather' },
  crimson: { armor: 'armor_plate', pants: 'pants_plate', boots: 'boots_plate', gloves: 'gloves_plate' },
  knight: { armor: 'knight_plate', pants: 'knight_greaves', boots: 'knight_boots', gloves: 'gloves_plate' },
};

export default async function (ctx) {
  const { scene, q } = ctx;
  await preloadPlayerModel();
  const mocap = q.has('mocap') ? await preloadMocap() : null;
  const names = (q.get('sets') || 'none,traveler,leather,ranger,crimson,knight').split(',');
  const gap = Number(q.get('gap') || 1.1);
  const figs = [];
  names.forEach((n, i) => {
    const f = createFighter();
    if (f.rig.weapon) f.rig.weapon.visible = false;
    if (mocap) f.anim.useMocap(mocap);
    applyOutfit(f.rig, SETS[n] || {}, {});
    f.root.position.x = (i - (names.length - 1) / 2) * gap;
    f.root.rotation.y = Number(q.get('rot') || 0);
    scene.add(f.root);
    for (let k = 0; k < 30; k++) f.anim.update(0.02, f.root.position);
    figs.push(f);
  });
  ctx.onUpdate((dt) => { for (const f of figs) f.anim.update(dt, f.root.position); });
  ctx.info(names.join('  |  '));
}

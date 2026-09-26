// Cumbot 9000 preview: ?scene=boss&act=punchR|slam|mortar|beam|stomp|summon|intro|walk|die&time=0.7&freeze=1&loop=1
//   &weights=1 -> colour each vertex by its strongest bone (skinning check)   &rot=0.5 -> turn the model
import * as THREE from 'three';
import { preloadCumbot, CumbotModel, ACTIONS } from '../../entities/bosses/cumbotModel.js';

const PALETTE = ['#ffffff', '#ff4040', '#ff9a30', '#ffe040', '#8aff40', '#30ff9a', '#30e0ff', '#3080ff', '#9a50ff', '#ff50e0',
  '#a0a0a0', '#ff8080', '#ffd0a0', '#c0ff80', '#80ffe0', '#80b0ff', '#e0a0ff', '#ffa0d0', '#606060'];

export default async function (ctx) {
  const { scene, q } = ctx;
  await preloadCumbot();
  const m = new CumbotModel('cumbot');
  m.root.rotation.y = Number(q.get('rot') || 0);
  scene.add(m.root);
  if (q.get('weights')) {
    const g = m.skinned.geometry, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
    const col = new Float32Array(si.count * 3), c = new THREE.Color();
    for (let i = 0; i < si.count; i++) {
      let best = 0, bw = -1;
      for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; best = si.getComponent(i, k); } }
      c.set(PALETTE[best % PALETTE.length]);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    m.skinned.material = new THREE.MeshLambertMaterial({ vertexColors: true });
  }
  const act = q.get('act');
  const time = Number(q.get('time') || 0);
  const freeze = !!q.get('freeze'), loop = !!q.get('loop');
  const start = () => {
    if (act === 'walk') m.setMoving(1);
    else if (act === 'die') m.die();
    else if (act && ACTIONS[act]) m.play(act);
  };
  start();
  if (time) m.update(time);
  window.__boss = m;
  let t = 0;
  ctx.onUpdate((dt) => {
    if (freeze) return;
    m.update(dt);
    t += dt;
    if (loop && act && ACTIONS[act] && !m.act) { m.update(0.4); start(); }
  });
  ctx.info(`cumbot ${act || 'idle'} t=${time}  tris=${Math.round(m.skinned.geometry.index.count / 3)}`);
}

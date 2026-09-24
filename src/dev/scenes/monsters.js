// Monster line-up for the dev viewer.
//   /viewer.html?scene=monsters&cam=0,2.2,7&target=0,0.8,0
// Query params:
//   state=idle|walk|attack|hit|die   animation to show (live: loops attack/hit/die)
//   time=<s>      jump to <s> seconds after the state was triggered and freeze there (for key-pose screenshots)
//   only=a,b      only these monster types (single one is placed at the origin)
//   rot=<deg>     rotate models around Y (e.g. 35 for 3/4 view)
//   move=<0..1>   walk speed for state=walk (default 1)
//   hl=1          hover highlight on;  tint=1  random per-instance tints
//   count=<n>     spawn a crowd of n random monsters (perf test)
//   labels=0      hide name labels;  freeze=0 keep animating after a time jump
//   stretch=1     (with time=) report the most stretched skinned triangles vs bind pose (imp rig check)
import * as THREE from 'three';
import { createMonsterModel, MONSTER_TYPES, warmupMonsters, preloadMonsterAssets } from '../../entities/monsterModels.js';
import { makeCanvas, toTexture } from '../../core/textures.js';

function label(text, sub) {
  const c = makeCanvas(512, 128);
  const g = c.getContext('2d');
  g.font = 'bold 54px sans-serif';
  g.textAlign = 'center';
  g.lineWidth = 10; g.strokeStyle = 'rgba(20,30,50,0.85)';
  g.strokeText(text, 256, 62); g.fillStyle = '#ffffff'; g.fillText(text, 256, 62);
  if (sub) {
    g.font = 'bold 30px monospace';
    g.lineWidth = 7; g.strokeText(sub, 256, 108); g.fillStyle = '#ffe98a'; g.fillText(sub, 256, 108);
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: toTexture(c, { repeat: false }), depthWrite: false }));
  s.scale.set(1.6, 0.4, 1);
  return s;
}

function stats(m) {
  let tris = 0, meshes = 0;
  const mats = new Set();
  m.root.traverse((o) => {
    if (!o.isMesh) return;
    meshes++;
    const g = o.geometry;
    tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
    (Array.isArray(o.material) ? o.material : [o.material]).forEach((x) => mats.add(x));
  });
  return { tris: Math.round(tris), meshes, mats: mats.size };
}

const LAYOUT = {
  slime: [-4.1, 0, 0.4],
  mushroom: [-2.2, 0, 0.4],
  imp: [0.0, 0, 0.4],
  kingslime: [3.6, 0, -1.2],
  bee: [-0.8, 0, 2.2],
  boar: [1.4, 0, 2.2],
};

export default async function (ctx) {
  const { scene, q, info, onUpdate, engine, camera } = ctx;
  const errors = [];
  const report = (e) => { errors.push(String(e && e.stack ? e.stack : e)); info(errors.join('\n')); };
  window.addEventListener('error', (e) => report(e.error || e.message));
  window.addEventListener('unhandledrejection', (e) => report(e.reason));
  try {
    await preloadMonsterAssets();
    const only = q.get('only');
    const types = only ? only.split(',') : MONSTER_TYPES;
    const state = q.get('state') || 'idle';
    const time = q.has('time') ? Number(q.get('time')) : null;
    const freeze = q.get('freeze') !== '0';
    const rot = (Number(q.get('rot') || 0) * Math.PI) / 180;
    const moveAmt = q.has('move') ? Number(q.get('move')) : 1;
    const showLabels = q.get('labels') !== '0';
    const count = Number(q.get('count') || 0);

    if (q.get('warmup') === '1') warmupMonsters(engine.renderer, camera, scene);

    const entries = [];
    const spawn = (type, pos) => {
      const tint = q.get('tint') === '1' ? new THREE.Color().setHSL(Math.random(), 0.7, 0.6) : undefined;
      const m = createMonsterModel(type, { tint });
      m.root.position.set(...pos);
      m.root.rotation.y = rot;
      scene.add(m.root);
      if (q.get('hl') === '1') m.setHighlight(true);
      return m;
    };
    const place = (type, i) => (types.length === 1 && !count ? [0, 0, 0] : LAYOUT[type] || [i * 2 - 4, 0, 0]);

    if (count) {
      const n = Math.ceil(Math.sqrt(count));
      for (let i = 0; i < count; i++) {
        const type = MONSTER_TYPES[i % MONSTER_TYPES.length];
        const pos = [((i % n) - n / 2) * 2.2, 0, (Math.floor(i / n) - n / 2) * 2.2];
        const m = spawn(type, pos);
        m.root.rotation.y = Math.random() * Math.PI * 2;
        m.setMoving(Math.random() < 0.5 ? 1 : 0);
        entries.push({ type, m, pos, lbl: null });
      }
    } else {
      types.forEach((type, i) => {
        const pos = place(type, i);
        const m = spawn(type, pos);
        let lbl = null;
        if (showLabels) {
          const s = stats(m);
          lbl = label(type, `${s.tris} tris · ${s.meshes} meshes`);
          lbl.position.set(pos[0], m.height + 0.35, pos[2]);
          scene.add(lbl);
        }
        entries.push({ type, m, pos, lbl });
      });
    }

    const lines = entries.slice(0, 6).map(({ type, m }) => {
      const s = stats(m);
      return `${type.padEnd(10)} tris ${String(s.tris).padStart(6)}  meshes ${String(s.meshes).padStart(2)}  mats ${s.mats}  h ${m.height}  r ${m.radius}  headY ${m.headY.toFixed(2)}  impact ${m.impactTime}s`;
    });
    const baseInfo = `monsters · state=${state}${time !== null ? ' t=' + time : ''}\n` + lines.join('\n');
    info(baseInfo);

    const trigger = (m) => {
      if (state === 'walk') m.setMoving(moveAmt);
      else if (state === 'attack') m.attack();
      else if (state === 'hit') m.hit();
      else if (state === 'die') m.die();
    };

    if (time !== null) {
      for (const e of entries) {
        e.m.update(1.0); // settle
        trigger(e.m);
        e.m.update(time);
      }
      if (q.get('stretch') === '1') {
        // debug: report the most stretched triangles of skinned models vs bind pose
        const out = [];
        for (const e of entries) {
          e.m.root.updateMatrixWorld(true);
          e.m.root.traverse((o) => {
            if (!o.isSkinnedMesh) return;
            o.skeleton.update();
            const pos = o.geometry.attributes.position, idx = o.geometry.index.array;
            const sk = [], v = new THREE.Vector3();
            for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); o.applyBoneTransform(i, v); sk.push(v.clone()); }
            const rest = (i) => new THREE.Vector3().fromBufferAttribute(pos, i);
            const bad = [];
            for (let t = 0; t < idx.length; t += 3) {
              for (let k = 0; k < 3; k++) {
                const a = idx[t + k], b = idx[t + (k + 1) % 3];
                const r = rest(a).distanceTo(rest(b)), d = sk[a].distanceTo(sk[b]);
                if (d > r * 3 && d > 0.08) bad.push([d / r, a, b]);
              }
            }
            bad.sort((x, y) => y[0] - x[0]);
            const si = o.geometry.attributes.skinIndex, sw = o.geometry.attributes.skinWeight, bn = o.skeleton.bones.map((b) => b.name);
            const desc = (i) => `${i}@${rest(i).toArray().map((x) => x.toFixed(2))} ${[0, 1, 2, 3].map((k) => bn[si.getComponent(i, k)] + ':' + sw.getComponent(i, k).toFixed(2)).join(',')}`;
            out.push(`${e.type}: ${bad.length} stretched edges`);
            for (const [r, a, b] of bad.slice(0, 8)) out.push(`  x${r.toFixed(1)} ${desc(a)} | ${desc(b)}`);
          });
        }
        info(out.join('\n'));
      }
      if (freeze) {
        onUpdate(() => {});
        return;
      }
    } else {
      for (const e of entries) if (!count) trigger(e.m);
    }

    const period = { attack: 2.4, hit: 1.1, die: 3.2 }[state] || 0;
    let acc = 0;
    onUpdate((dt) => {
      try {
        dt = Math.min(dt, 0.05);
        acc += dt;
        for (const e of entries) {
          e.m.update(dt);
          if (e.m.dead) {
            e.m.dispose();
            e.m = spawn(e.type, e.pos);
            if (state === 'die') acc = 0;
          }
        }
        if (period && acc >= period && !count) {
          acc = 0;
          for (const e of entries) trigger(e.m);
        }
      } catch (err) {
        report(err);
      }
    });
  } catch (err) {
    report(err);
  }
}

// Dev scene: the harbour town of Roumen.  viewer.html?scene=town&terrain=1
//   &test=house  -> sample houses on flat ground (no terrain needed)
//   &debug=1     -> show colliders, NPC points and portals
//   &nomodel=1   -> skip the imported house model (procedural fallback)
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createWorldContext, placeholderTrees } from '../../world/worldctx.js';
import { buildTown } from '../../world/town.js';
import { NPC_POINTS, PORTALS } from '../../world/layout.js';

export default async function (ctx) {
  const { scene, q } = ctx;
  if (q.get('test') === 'house') {
    const { testHouses } = await import('../../world/town/testbed.js');
    ctx.info(testHouses(ctx));
    return;
  }
  const terrain = ctx.terrain;
  if (!terrain) { ctx.info('town scene needs &terrain=1'); return; }
  const wctx = createWorldContext(scene, terrain);
  if (q.get('nomodel') !== '1') {
    try {
      const gltf = await new GLTFLoader().loadAsync('/models/house.glb');
      wctx.assets = { house: gltf.scene };
    } catch (e) { console.warn('house model not loaded', e); }
  }
  const t0 = performance.now();
  const town = buildTown(wctx);
  const tBuild = performance.now() - t0;
  placeholderTrees(wctx);
  const meshes = wctx.batcher.build(scene);
  for (const f of wctx.updaters) ctx.onUpdate(f);
  ctx.onUpdate((dt, t) => town.update(dt, t));

  if (q.get('hide')) {
    const keys = q.get('hide').split(',');
    scene.traverse((o) => {
      const n = (o.name || '') + '|' + ((o.material && o.material.name) || '');
      if (keys.some((k) => n.includes(k))) o.visible = false;
    });
  }
  let tris = 0, calls = 0;
  scene.traverse((o) => {
    if ((o.isMesh || o.isPoints) && o.name !== 'terrain' && o.visible && o.geometry && !(o.parent && o.parent.name === 'sky')) {
      const g = o.geometry;
      const n = g.index ? g.index.count / 3 : g.attributes.position.count / 3;
      tris += o.isInstancedMesh ? n * o.count : o.isPoints ? 0 : n;
      calls++;
    }
  });
  const txt = `town build ${tBuild.toFixed(0)} ms  objects≈${calls}  tris≈${(tris / 1000).toFixed(0)}k  batched=${meshes.length}  colliders=${wctx.colliders.boxes.length}b/${wctx.colliders.circles.length}c  trees=${wctx.treeRequests.length}\n${town.stats}`;
  ctx.info(txt);
  window.__townStats = txt;
  window.__dev = { THREE, engine: ctx.engine, scene, camera: ctx.camera, town };

  if (q.get('debug') === '1') {
    const g = new THREE.Group();
    const lm = new THREE.LineBasicMaterial({ color: 0xff2255, depthTest: false });
    const gy = (x, z) => terrain.groundAt(x, z) + 0.3;
    for (const b of wctx.colliders.boxes) {
      const pts = [[-b.hw, -b.hd], [b.hw, -b.hd], [b.hw, b.hd], [-b.hw, b.hd], [-b.hw, -b.hd]].map(([lx, lz]) => {
        const x = b.x + lx * b.cos + lz * b.sin, z = b.z - lx * b.sin + lz * b.cos;
        return new THREE.Vector3(x, gy(x, z), z);
      });
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lm));
    }
    for (const c of wctx.colliders.circles) {
      const pts = [];
      for (let i = 0; i <= 16; i++) { const a = (i / 16) * Math.PI * 2, x = c.x + Math.cos(a) * c.r, z = c.z + Math.sin(a) * c.r; pts.push(new THREE.Vector3(x, gy(x, z), z)); }
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lm));
    }
    const sm = new THREE.MeshBasicMaterial({ color: 0x22ddff, depthTest: false });
    for (const [x, z] of Object.values(NPC_POINTS)) {
      const m = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.8, 8), sm);
      m.position.set(x, gy(x, z) + 0.6, z);
      g.add(m);
    }
    const pmat = new THREE.MeshBasicMaterial({ color: 0x33ff66, depthTest: false, wireframe: true });
    for (const p of PORTALS) {
      const m = new THREE.Mesh(new THREE.TorusGeometry(2, 0.15, 6, 24), pmat);
      m.position.set(p.x, gy(p.x, p.z) + 2, p.z);
      m.rotation.y = p.rotY;
      g.add(m);
    }
    g.renderOrder = 999;
    scene.add(g);
  }
}

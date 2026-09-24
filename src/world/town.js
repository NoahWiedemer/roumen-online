// Roumen harbour town, built procedurally on the map layout (layout.js):
//  - houses on every map footprint (+ infill), a third of them using the imported house model
//    (ctx.assets.house, instanced) when available,
//  - main street lamps + pennant garlands, retaining wall along the northern cliff, steps down
//    to the plaza, the grand east staircase, ramp gates, planters, round tower,
//  - harbour plaza: market square with the tiered fountain, stalls, wagon, statue, quay walls
//    with bollards/ladders, moored boats, crane + cargo,
//  - decks: wooden bridge to the island, cliff boardwalk stairs, stone pier + lighthouse,
//  - island: octagonal pavilion, benches, lamps, planters; teleport-gate exedra.
// buildTown(ctx) is synchronous; all static geometry goes to ctx.batcher (merged per material).
// Returns { update(dt, time), npcSpots: {}, houses }.
import * as THREE from 'three';
import { GeoBuilder, pm, U } from './town/builder.js';
import { townMaterials, townTime } from './town/materials.js';
import { planTown, keepClearList } from './town/plan.js';
import { Occupancy } from './town/occupancy.js';
import { buildHouse } from './town/house.js';
import { ROOF_COLORS } from './town/styles.js';
import { dressHouse, streetLamps, cliffWall, townStep, eastStairs, rampGates, townSquares, houseToWorld } from './town/street.js';
import { quayWalls, boats, boatSpots, crane, boardwalk, stonePier, lighthousePlatform, islandDressing, planter, addParapets } from './town/harbour.js';
import { marketSquare, plazaExtras, cargo } from './town/market.js';
import { portalExedra, roundTower } from './town/landmarks.js';
import { tex } from '../core/textures.js';
import { mulberry32 } from '../core/utils.js';
import { DECKS, PORTALS, ROUND_TOWER } from './layout.js';

export function buildTown(ctx) {
  const T = ctx.terrain;
  const M = townMaterials();
  const b = new GeoBuilder();
  const rng = mulberry32(2024);
  const dyn = { time: { value: 0 }, updaters: [], halos: [] };
  const hasModel = !!(ctx.assets && ctx.assets.house);

  // ---------------------------------------------------------------- houses
  const plan = planTown(T, { glb: hasModel, modelSize: hasModel ? modelSize(ctx.assets.house) : null });
  const houses = plan.houses;
  const occ = new Occupancy(T, houses);
  const glbList = [];
  for (const S of houses) {
    if (S.glb) glbList.push(S);
    else buildHouse(b, M, S, dyn.halos);
    ctx.colliders.addBox(S.x, S.z, S.w / 2 + 0.2, S.d / 2 + 0.2, S.rotY);
    ctx.minimap.addRect(S.x, S.z, S.w + 0.8, S.d + 0.9, S.rotY, S.glb ? ROOF_COLORS.roofRed : ROOF_COLORS[S.roofKey]);
    if (S.turret && !S.glb) {
      const [tx, tz] = houseToWorld(S, S.turret * (S.w / 2 + 0.05), S.d / 2 + S.jetty * Math.min(S.floors - 1, 2) + 0.05);
      ctx.minimap.addCircle(tx, tz, 1.3, ROOF_COLORS[S.turretRoofMat === M.roofBlue ? 'roofBlue' : S.roofKey]);
    }
    ctx.addNoScatter(S.x, S.z, Math.hypot(S.w, S.d) / 2 + 0.8);
  }
  if (glbList.length) modelHouses(ctx, b, M, glbList);

  // ---------------------------------------------------------------- landmarks
  const gatePortal = PORTALS.find((p) => p.id === 'teleport_gate');
  if (gatePortal) {
    portalExedra(ctx, b, M, dyn, gatePortal.x, T.heightAt(gatePortal.x, gatePortal.z), gatePortal.z, gatePortal.rotY);
    occ.reserve(gatePortal.x - Math.sin(gatePortal.rotY) * 5.4, gatePortal.z - Math.cos(gatePortal.rotY) * 5.4, 3);
  }
  {
    const [x, z] = ROUND_TOWER;
    roundTower(ctx, b, M, dyn, x, T.heightAt(x, z), z, Math.PI * 0.85);
    occ.reserve(x, z, 4);
  }
  const lh = lighthousePlatform(ctx, b, M, dyn, occ);

  // ---------------------------------------------------------------- harbour + decks
  const edges = quayWalls(ctx, b, M, occ);
  for (const d of DECKS) {
    if (d.kind === 'stone') stonePier(ctx, b, M, dyn, d, occ);
    else boardwalk(ctx, b, M, dyn, d, { lanterns: d.id === 'bridge' ? 2 : 3 });
  }
  islandDressing(ctx, b, M, dyn, edges, occ, rng);
  // crane + cargo on the southern quay tip
  {
    let best = null;
    for (const e of edges) {
      if (Math.hypot(e.x - 20, e.z - 50) > 45 || e.z < 40) continue;
      const x = e.x - e.nx * 2.2, z = e.z - e.nz * 2.2;
      if (!occ.free(x, z, 3.2)) continue;
      const score = e.z;
      if (!best || score > best.score) best = { x, z, rot: Math.atan2(e.nx, e.nz), score };
    }
    if (best) {
      crane(ctx, b, M, best.x, T.heightAt(best.x, best.z), best.z, best.rot);
      occ.reserve(best.x, best.z, 2.2);
      cargo(ctx, b, M, occ, rng, best.x - Math.sin(best.rot) * 3, best.z - Math.cos(best.rot) * 3, best.rot);
    }
  }
  b.resetFrame();
  boats(ctx, M, dyn, boatSpots(ctx, edges, 4), b);
  addParapets(ctx, b, M, edges.filter((e) => e.x < -95 && e.z > 20 && e.z < 45), occ); // west quay by the teleport gate

  // ---------------------------------------------------------------- market square + plaza
  marketSquare(ctx, b, M, dyn, occ, rng);
  plazaExtras(ctx, b, M, dyn, occ, rng);
  eastStairs(ctx, b, M, dyn, occ, rng);

  // ---------------------------------------------------------------- town band
  cliffWall(ctx, b, M, dyn, occ);
  townStep(ctx, b, M, houses);
  rampGates(ctx, b, M, dyn, occ);
  for (const S of houses) dressHouse(ctx, b, M, S, dyn, occ, rng);
  streetLamps(ctx, b, M, dyn, occ, rng);
  townSquares(ctx, b, M, dyn, occ, rng, planter);
  // noScatter over the flat plaza (vegetation module skips paved zones anyway)
  ctx.addNoScatter(-30, 36, 26);

  // ---------------------------------------------------------------- flush static geometry
  const tris = b.triangleCount();
  const stats = b.flush(ctx.batcher);

  // ---------------------------------------------------------------- lamp halos (one Points draw)
  ctx.scene.add(makeHalos(dyn.halos, dyn.time));

  const update = (dt, time) => {
    dyn.time.value = time;
    townTime.value = time;
    for (const f of dyn.updaters) f(dt, time);
  };
  return {
    update,
    npcSpots: {},
    houses,
    stats: `houses ${houses.length} (${glbList.length} model), town tris ${(tris / 1000).toFixed(0)}k, materials ${stats.length}`,
  };
}

// ------------------------------------------------------------------ imported house model (instanced)
function modelHouses(ctx, b, M, list) {
  const src = ctx.assets.house;
  src.updateMatrixWorld(true);
  let mesh = null;
  src.traverse((o) => { if (!mesh && o.isMesh) mesh = o; });
  if (!mesh) return;
  const geo = mesh.geometry.clone();
  geo.applyMatrix4(mesh.matrixWorld);
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const size = new THREE.Vector3(), ctr = new THREE.Vector3();
  bb.getSize(size); bb.getCenter(ctr);
  geo.translate(-ctr.x, -bb.min.y, -ctr.z);
  // explicit (sanitised) tangents: derivative-based normal mapping produced NaN pixels on some
  // degenerate UV triangles, which the bloom pass then spread over the whole screen
  const mat = mesh.material.clone();
  if (mat.normalMap && geo.index && geo.attributes.uv) {
    geo.computeTangents();
    const tg = geo.attributes.tangent.array;
    for (let i = 0; i < tg.length; i += 4) {
      if (!(Number.isFinite(tg[i]) && Number.isFinite(tg[i + 1]) && Number.isFinite(tg[i + 2])) || tg[i] * tg[i] + tg[i + 1] * tg[i + 1] + tg[i + 2] * tg[i + 2] < 1e-8) {
        tg[i] = 1; tg[i + 1] = 0; tg[i + 2] = 0; tg[i + 3] = 1;
      }
    }
  } else mat.normalMap = null;
  const inst = new THREE.InstancedMesh(geo, mat, list.length);
  inst.castShadow = true;
  inst.receiveShadow = true;
  inst.name = 'townHouseModel';
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  const col = new THREE.Color();
  list.forEach((S, i) => {
    // the planner sized the footprint for the model (keeps its proportions)
    const k = S.modelK || Math.min(S.w / size.x, S.d / size.z);
    const y = S.floorY - 0.12;
    p.set(S.x, y, S.z);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), S.rotY);
    s.set(k, k * (0.95 + (i % 3) * 0.05), k);
    m.compose(p, q, s);
    inst.setMatrixAt(i, m);
    const t = 0.92 + ((i * 37) % 9) * 0.015;
    inst.setColorAt(i, col.setRGB(t, t * (0.98 + (i % 2) * 0.02), t * 0.97));
    // stone plinth under the model
    const pw = size.x * k + 0.3, pd = size.z * k + 0.3;
    b.resetFrame();
    b.box(M.stone, pm(S.x, (y + S.groundMin - 0.5) / 2 + 0.06, S.z, 0, S.rotY, 0), pw, y - S.groundMin + 0.62, pd, { uv: 'frame', uvs: 0.45, color: [1.05, 1.02, 0.98], skip: ['ny'] });
    // door step
    const [dx, dz] = houseToWorld(S, 0, pd / 2 + 0.3);
    b.box(M.stone, pm(dx, (y + 0.06 + S.groundMin - 0.4) / 2, dz, 0, S.rotY, 0), 1.6, y + 0.06 - S.groundMin + 0.4, 0.6, { uv: 'frame', uvs: 0.6, color: LIGHT_STEP });
    S.modelScale = k;
  });
  inst.instanceMatrix.needsUpdate = true;
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  inst.computeBoundingSphere();
  ctx.scene.add(inst);
}
const LIGHT_STEP = [1.14, 1.1, 1.04];
function modelSize(src) {
  const box = new THREE.Box3().setFromObject(src);
  const v = box.getSize(new THREE.Vector3());
  return { x: v.x, z: v.z, y: v.y };
}

// ------------------------------------------------------------------ lamp halos (single Points draw)
function makeHalos(list, time) {
  const n = list.length;
  const pos = new Float32Array(n * 3), size = new Float32Array(n), phase = new Float32Array(n);
  list.forEach((h, i) => { pos[i * 3] = h.x; pos[i * 3 + 1] = h.y; pos[i * 3 + 2] = h.z; size[i] = h.s; phase[i] = (i * 0.618) % 1; });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: time, uScale: { value: 900 }, uColor: { value: new THREE.Color(1.0, 0.78, 0.45) }, uMap: { value: tex('glow') } },
    vertexShader: `
      attribute float aSize; attribute float aPhase;
      uniform float uTime; uniform float uScale;
      varying float vF;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        float depth = -mv.z;
        float f = 0.86 + 0.14 * sin(uTime * 7.0 + aPhase * 40.0) * sin(uTime * 2.3 + aPhase * 17.0);
        vF = f * (1.0 - smoothstep(40.0, 170.0, depth));
        // bounded sprite size; nothing for points at / behind the camera
        gl_PointSize = clamp(aSize * uScale / max(depth, 1.0) * (0.9 + 0.1 * f), 0.0, 200.0);
        if (depth < 1.0) { gl_PointSize = 0.0; vF = 0.0; gl_Position = vec4(2.0, 2.0, 2.0, 1.0); }
      }`,
    fragmentShader: `
      uniform vec3 uColor; uniform sampler2D uMap;
      varying float vF;
      void main(){
        float a = texture2D(uMap, gl_PointCoord).a;
        gl_FragColor = vec4(uColor * clamp(a * 0.55 * vF, 0.0, 1.0), 1.0);
      }`,
  });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  p.renderOrder = 5;
  p.name = 'lampHalos';
  p.onBeforeRender = (renderer) => {
    const s = new THREE.Vector2();
    renderer.getDrawingBufferSize(s);
    m.uniforms.uScale.value = s.y * 0.6;
  };
  return p;
}

export { keepClearList };

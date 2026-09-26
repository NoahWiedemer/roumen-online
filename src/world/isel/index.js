// Tower of Isel world: the dungeon behind the portal at the end of the Windward Glade. Builds the floors / halls /
// stairwells (architecture.js), the furnishings (decor.js), the outer stair with the view down onto Cyclone Hill and
// the Forest of Mist (outside.js), the portal back and the lighting, and returns a world object for world/worlds.js.
import * as THREE from 'three';
import { StaticBatcher } from '../../core/batcher.js';
import { Colliders, NavGrid } from '../colliders.js';
import { MinimapShapes } from '../worldctx.js';
import { createPortal } from '../portal.js';
import { IselTerrain } from './terrain.js';
import { buildArchitecture, DOOR_H } from './architecture.js';
import { buildDecor } from './decor.js';
import { buildOutside } from './outside.js';
import { MAP, ROOMS, SPAWN, PORTAL_BACK, MAP_LABELS, ZONE, CORE, deg } from './layout.js';
import { lerp } from '../../core/utils.js';

const noop = async () => {};
const C = (h) => new THREE.Color(h);

// lighting: dim, warm-and-blue inside; open daylight on the outer stair (blended by where the hero is)
const INSIDE = {
  fog: C('#1b2029'), near: 34, far: 150, hemiSky: C('#9fb4dc'), hemiGround: C('#4a3526'), hemi: 0.72,
  sun: C('#ffe2b8'), sunI: 0.85, sunDir: new THREE.Vector3(0.28, 0.92, 0.26).normalize(), exposure: 1.12,
};
const OUTSIDE = {
  fog: C('#b2dcdc'), near: 120, far: 1100, hemiSky: C('#e4f4ff'), hemiGround: C('#6a7a58'), hemi: 1.1,
  sun: C('#fff1d6'), sunI: 2.4, sunDir: new THREE.Vector3(-0.55, 0.62, 0.3).normalize(), exposure: 1.04,
};

export async function buildIselWorld({ engine, progress = noop } = {}) {
  const root = new THREE.Group();
  root.name = 'world:isel';
  await progress(10, 'Climbing the Tower of Isel…');
  const terrain = new IselTerrain();
  root.add(terrain.mesh);
  // visibility zones (layout.ZONE) plus the outer stair and the view: each has its own group and batchers
  const zones = {};
  for (const z of ['core', 'east', 'outside']) {
    const group = new THREE.Group();
    group.name = 'isel-' + z;
    root.add(group);
    zones[z] = { group, batcher: new StaticBatcher(), batcherNoShadow: new StaticBatcher() };
  }
  const ctx = {
    scene: root, terrain, zones, colliders: new Colliders(MAP.playable), minimap: new MinimapShapes(),
    updaters: [], onUpdate(fn) { ctx.updaters.push(fn); },
  };

  const ms = {}, t0 = performance.now();
  let tl = t0;
  const lap = (k) => { const n = performance.now(); ms[k] = Math.round(n - tl); tl = n; };
  await progress(30, 'Laying old stone and timber…');
  const arch = buildArchitecture(ctx);
  lap('arch');
  await progress(50, 'Carving statues…');
  const decor = await buildDecor(ctx, arch);
  lap('decor');
  await progress(70, 'Opening the outer stair…');
  const outside = buildOutside(ctx);
  lap('outside');

  // the portal back to Cyclone Hill
  const P = PORTAL_BACK;
  const portal = createPortal({ id: 'to_cyclone', name: 'Cyclone Hill', x: P.x, y: terrain.groundAt(P.x, P.z), z: P.z, rotY: P.rotY });
  portal.dest = 'cyclone';
  zones.east.group.add(portal.group);
  const c = Math.cos(P.rotY), s = Math.sin(P.rotY);
  for (const sx of [-1, 1]) ctx.colliders.addCircle(P.x + c * sx * 2.35, P.z - s * sx * 2.35, 0.6);

  await progress(82, 'Merging geometry…');
  for (const [z, Z] of Object.entries(zones)) {
    Z.batcher.build(Z.group);
    Z.batcherNoShadow.build(Z.group, { castShadow: false, name: 'isel-shell-' + z });
  }
  lap('merge');
  await progress(90, 'Mapping the floors…');
  const nav = new NavGrid(terrain, ctx.colliders, 1);
  lap('nav');

  // atmosphere: 0 inside .. 1 on the outer stair
  let k = 0;
  const cur = { fog: new THREE.Color() };
  const apply = (eng, kk) => {
    const A = INSIDE, B = OUTSIDE, sc = eng.scene;
    cur.fog.copy(A.fog).lerp(B.fog, kk);
    if (!sc.fog || !sc.fog.isFog) sc.fog = new THREE.Fog(cur.fog, 10, 100);
    sc.fog.color.copy(cur.fog);
    sc.fog.near = lerp(A.near, B.near, kk); sc.fog.far = Math.exp(lerp(Math.log(A.far), Math.log(B.far), kk));
    if (!sc.background || !sc.background.isColor) sc.background = new THREE.Color();
    sc.background.copy(cur.fog);
    eng.hemi.color.copy(A.hemiSky).lerp(B.hemiSky, kk); eng.hemi.groundColor.copy(A.hemiGround).lerp(B.hemiGround, kk);
    eng.hemi.intensity = lerp(A.hemi, B.hemi, kk);
    eng.sun.color.copy(A.sun).lerp(B.sun, kk); eng.sun.intensity = lerp(A.sunI, B.sunI, kk);
    eng.sunDir.copy(A.sunDir).lerp(B.sunDir, kk).normalize();
    eng.renderer.toneMappingExposure = lerp(A.exposure, B.exposure, kk);
  };
  const outsideness = (w) => (w === 'outer' ? 1 : w === 'out' || w === 'in' ? 0.6 : 0);
  // out on the stair the east halls are hidden (they lie outside the tower's silhouette); in the east halls the
  // view outside is (it is never visible from there)
  let lastWhere = null;
  const showZones = (w) => {
    if (!w) return;
    lastWhere = w;
    zones.east.group.visible = outsideness(w) === 0;
    zones.outside.group.visible = ZONE[w] !== 'east';
  };
  const focus = new THREE.Vector3(SPAWN.x, 0, SPAWN.z);
  const areaNameAt = (x, z) => {
    const w = terrain.where(x, z);
    const r = ROOMS.find((q) => q.id === w);
    if (r) return r.name;
    if (w === 'outer' || w === 'out' || w === 'in') return 'Outer Stair';
    return 'Tower of Isel';
  };

  // follow camera: it stays under the roof of the hall the hero is in, and the walls around doorways (seen from the
  // side they face) pull it in instead of hiding the hero who just walked through
  const camBlockers = [];
  const doorBlockers = (x, z, nx, nz, hw, y, yTop) => {
    const tx = -nz, tz = nx, box = (ox, hwb, y0) => ({ x: x + tx * ox, z: z + tz * ox, cos: tx, sin: -tz, hw: hwb, hd: 0.45, y0, y1: yTop, nx, nz });
    camBlockers.push(box(0, hw + 0.5, y + DOOR_H - 0.15), box(hw + 2.5, 2.2, y - 1), box(-(hw + 2.5), 2.2, y - 1));
  };
  for (const { room: r, doors } of arch.rooms) for (const d of doors) doorBlockers(d.x, d.z, -d.dx, -d.dz, d.hw, r.y, r.y + r.h);
  for (const [a, y] of [[deg(110), 22], [deg(270), 42]]) {
    const nx = Math.cos(a), nz = Math.sin(a);
    doorBlockers(CORE.x + nx * CORE.r, CORE.z + nz * CORE.r, nx, nz, 2.75, y, y + 60);
  }
  const cameraCeiling = (pos) => {
    const r = ROOMS.find((q) => q.id === terrain.where(pos.x, pos.z));
    return r ? r.y + r.h - 0.9 : null;
  };

  const world = {
    id: 'isel', name: 'Tower of Isel', root, terrain, colliders: ctx.colliders, nav, minimap: ctx.minimap,
    portals: [portal], spawn: SPAWN, areaNameAt, mapLabels: MAP_LABELS, camBlockers, cameraCeiling,
    stats: `arch ${arch.stats.tris} tris, decor ${decor.stats}, outside ${outside.stats} | ms ${JSON.stringify(ms)}`,
    activate(eng = engine, pos = focus) {
      const w = pos ? terrain.where(pos.x, pos.z) : null;
      showZones(w || 'hall');
      k = outsideness(lastWhere);
      apply(eng, k);
    },
    update(dt, t, camera, pos, fx = null) {
      const w = pos ? terrain.where(pos.x, pos.z) : null;
      showZones(w);
      k += (outsideness(lastWhere) - k) * (1 - Math.exp(-2.5 * dt));
      apply(engine, k);
      portal.update(dt, t, fx);
      decor.update(dt, t, camera, pos);
      outside.update(dt, t, camera);
      for (const f of ctx.updaters) f(dt, t);
    },
  };
  return world;
}

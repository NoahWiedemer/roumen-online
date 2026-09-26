// Cyclone Hill world: builds terrain, water, structures, vegetation and atmosphere into one root group and
// returns a world object for the world switcher (see world/worlds.js).
import * as THREE from 'three';
import { StaticBatcher } from '../../core/batcher.js';
import { Colliders, NavGrid } from '../colliders.js';
import { MinimapShapes } from '../worldctx.js';
import { createPortal } from '../portal.js';
import { CycloneTerrain } from './terrain.js';
import { CycloneAtmosphere } from './atmosphere.js';
import { buildWater } from './water.js';
import { buildFlora } from './flora.js';
import { buildStructures } from './structures.js';
import { buildIselTower } from './tower.js';
import { MAP, ARRIVAL, SPAWN, MAP_LABELS, areaNameAt } from './layout.js';

const noop = async () => {};

export async function buildCycloneWorld({ engine, progress = noop } = {}) {
  const t0 = performance.now();
  const times = {};
  const mark = (k) => { times[k] = Math.round(performance.now() - t0); };
  const root = new THREE.Group();
  root.name = 'world:cyclone';

  await progress(8, 'Shaping Cyclone Hill…');
  const terrain = new CycloneTerrain();
  root.add(terrain.mesh);
  mark('terrain');
  const ctx = {
    scene: root, terrain, batcher: new StaticBatcher(), colliders: new Colliders(MAP.playable), minimap: new MinimapShapes(),
    noScatter: [], addNoScatter(x, z, r) { ctx.noScatter.push({ x, z, r }); },
    updaters: [], onUpdate(fn) { ctx.updaters.push(fn); },
  };

  await progress(28, 'Letting the waterfalls run…');
  const water = buildWater(ctx);
  mark('water');

  await progress(40, 'Raising bridges and towers…');
  const structures = buildStructures(ctx);
  mark('structures');

  await progress(48, 'Raising the Tower of Isel…');
  const isel = await buildIselTower(ctx);
  mark('tower');

  // the portal back to Roumen at the south end of the forest
  const portal = createPortal({ id: 'to_roumen', name: 'Roumen', x: ARRIVAL.x, y: terrain.groundAt(ARRIVAL.x, ARRIVAL.z), z: ARRIVAL.z, rotY: ARRIVAL.rotY });
  portal.dest = 'roumen';
  root.add(portal.group);
  const c = Math.cos(ARRIVAL.rotY), s = Math.sin(ARRIVAL.rotY);
  for (const sx of [-1, 1]) ctx.colliders.addCircle(ARRIVAL.x + c * sx * 2.35, ARRIVAL.z - s * sx * 2.35, 0.6);
  ctx.addNoScatter(ARRIVAL.x, ARRIVAL.z, 5);
  ctx.minimap.addCircle(ARRIVAL.x, ARRIVAL.z, 2.2, '#4dff9a');

  await progress(55, 'Growing trees and bamboo…');
  const flora = buildFlora(ctx);
  mark('flora');

  await progress(75, 'Merging geometry…');
  ctx.batcher.build(root);
  const atmosphere = new CycloneAtmosphere(root, terrain, water.mistSpots);
  mark('batch+atmo');

  await progress(88, 'Mapping paths…');
  const nav = new NavGrid(terrain, ctx.colliders, 1);
  mark('nav');

  const focus = new THREE.Vector3(SPAWN.x, terrain.groundAt(SPAWN.x, SPAWN.z), SPAWN.z);
  const world = {
    id: 'cyclone', name: 'Cyclone Hill', root, terrain, colliders: ctx.colliders, nav, minimap: ctx.minimap,
    portals: [portal, isel.portal], spawn: SPAWN, areaNameAt, mapLabels: MAP_LABELS, atmosphere, flora,
    stats: `ms ${JSON.stringify(times)} | flora ${JSON.stringify(flora.stats)} | structures ${JSON.stringify(structures.stats)}`,
    // put fog, lights, sky and exposure into the state for the given focus position right away
    activate(eng = engine, pos = focus) {
      atmosphere.update(0, 0, eng, eng.camera, pos, true);
      water.setSun(eng.sunDir);
    },
    update(dt, t, camera, pos, fx = null) {
      atmosphere.update(dt, t, engine, camera, pos);
      water.setSun(engine.sunDir);
      water.update(dt, t);
      structures.update(dt, t, camera.position);
      flora.update(dt, t);
      portal.update(dt, t, fx);
      isel.portal.update(dt, t, fx);
      for (const f of ctx.updaters) f(dt, t);
    },
  };
  return world;
}

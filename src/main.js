// Roumen Online — bootstrap, input handling and main loop
import * as THREE from 'three';
import { Engine } from './core/engine.js';
import { Input } from './core/input.js';
import { FollowCamera } from './core/camera.js';
import { Audio } from './core/audio.js';
import { G } from './game/game.js';
import { Terrain } from './world/terrain.js';
import { Sky } from './world/sky.js';
import { createSea } from './world/sea.js';
import { createPortal } from './world/portal.js';
import { PORTALS, SPAWN_ZONES, TOWN, MAP_LABELS, areaNameAt } from './world/layout.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as MonsterModels from './entities/monsterModels.js';
import { createWorldContext } from './world/worldctx.js';
import { buildVegetation } from './world/vegetation.js';
import { NavGrid } from './world/colliders.js';
import { registerWorld, registerBuilder, captureAtmosphere, restoreAtmosphere, getWorld, enterWorld, travel, addPortalBlockers, curtain } from './world/worlds.js';
import { initSlots, loadSlot, getActiveSlot, setActiveSlot, WORLD_NAMES } from './game/saves.js';
import { fadeScreen } from './title/ui.js';
import { preloadReko } from './title/reko.js';
import { runTitle } from './title/titleScreen.js';
import { runCharSelect } from './title/charSelect.js';
import { Effects } from './entities/effects.js';
import { Player } from './entities/player.js';
import { preloadPlayerModel } from './entities/playerModel.js';
import { preloadNpcModels } from './entities/npcModels.js';
import { preloadDualBlades } from './entities/weapons.js';
import { preloadMocap } from './entities/mocap.js';
import { MonsterManager } from './entities/monsters.js';
import { NpcManager } from './entities/npcs.js';
import { LootManager } from './entities/loot.js';
import { createMiniHouse } from './entities/minihouse.js';
import { QuestLog } from './game/quests.js';
import { NPCS } from './game/data.js';
import { HUD, SLOT_CODES } from './ui/hud.js';

const loadFill = document.getElementById('loadFill');
const loadText = document.getElementById('loadText');
let _stepT = performance.now(), _stepName = 'start';
const timings = [];
const step = async (pct, text) => {
  const now = performance.now();
  timings.push(`${_stepName}: ${Math.round(now - _stepT)}ms`);
  _stepT = now; _stepName = text;
  window.__loadTimings = timings;
  loadFill.style.width = pct + '%';
  loadText.textContent = text;
  // yield so the loading bar can paint (setTimeout fallback keeps loading going in hidden tabs)
  await new Promise((r) => { let done = false; const fin = () => { if (!done) { done = true; r(); } }; requestAnimationFrame(() => setTimeout(fin, 0)); setTimeout(fin, 60); });
};

// ------------------------------------------------------------------ options
const OPT_KEY = 'roumen-online-options-v1';
G.options = { shadows: true, bloom: true, pixelRatio: Math.min(window.devicePixelRatio, 2) > 1.4 ? 1.5 : 1, sfx: 0.5, music: 0.22 };
try { Object.assign(G.options, JSON.parse(localStorage.getItem(OPT_KEY) || '{}')); } catch { /* ignore */ }
G.saveOptions = () => { try { localStorage.setItem(OPT_KEY, JSON.stringify(G.options)); } catch { /* ignore */ } };
G.applyOptions = () => {
  const o = G.options, e = G.engine;
  e.renderer.setPixelRatio(o.pixelRatio);
  e.resize();
  e.useBloom = o.bloom;
  if (e.renderer.shadowMap.enabled !== o.shadows) {
    e.renderer.shadowMap.enabled = o.shadows;
    e.sun.castShadow = o.shadows;
    G.scene.traverse((m) => { if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => { x.needsUpdate = true; }); });
  }
  G.saveOptions();
};
// back to the character-select terrace (saves, then reloads straight into the selection without the intro)
const SKIP_INTRO_KEY = 'scamigo-skip-intro';
G.toCharSelect = () => {
  if (G.player) G.player.save();
  try { sessionStorage.setItem(SKIP_INTRO_KEY, '1'); } catch { /* ignore */ }
  const q = new URLSearchParams(location.search);
  q.delete('autostart');
  location.search = q.toString();
};

async function init() {
  await step(4, 'Preparing renderer…');
  const canvas = document.getElementById('game');
  const engine = new Engine(canvas, { bloom: G.options.bloom });
  G.engine = engine; G.scene = engine.scene; G.camera = engine.camera;
  engine.renderer.setPixelRatio(G.options.pixelRatio);
  engine.resize();
  G.audio = new Audio();
  G.audio.sfxVol = G.options.sfx; G.audio.musicVol = G.options.music;

  await step(7, 'Loading models…');
  const assets = {};
  try { assets.house = (await new GLTFLoader().loadAsync('/models/house.glb')).scene; } catch (e) { console.warn('house model', e); }
  if (MonsterModels.preloadMonsterAssets) { try { await MonsterModels.preloadMonsterAssets(); } catch (e) { console.warn('monster assets', e); } }
  try { await preloadPlayerModel(); } catch (e) { console.warn('player model (falling back to the procedural fighter)', e); }
  try { await preloadDualBlades(); } catch (e) { console.warn('dual blades model', e); }
  try { await preloadMocap(); } catch (e) { console.warn('motion clips (falling back to procedural locomotion)', e); }

  const roumen = await buildRoumen(engine, assets);
  registerWorld(roumen);
  // other worlds are built on their first visit (see world/worlds.js)
  registerBuilder('cyclone', async (progress) => {
    await progress(2, 'Summoning the locals…');
    try { await preloadNpcModels(['ratman', 'robo', 'ratman_mob', 'eber']); } catch (e) { console.warn('NPC models', e); }
    try { const { preloadCumbot } = await import('./entities/bosses/cumbot.js'); await preloadCumbot(); } catch (e) { console.warn('Cumbot 9000', e); }
    const { buildCycloneWorld } = await import('./world/cyclone/index.js');
    const { SPAWN_ZONES: CYCLONE_SPAWNS } = await import('./world/cyclone/layout.js');
    const w = await buildCycloneWorld({ engine, progress });
    w.root.visible = false;
    engine.scene.add(w.root);
    w.npcs = new NpcManager(NPCS.filter((n) => n.world === 'cyclone'), { parent: w.root, terrain: w.terrain, colliders: w.colliders });
    w.monsters = new MonsterManager(CYCLONE_SPAWNS, w.root);   // spawned on the first visit (worlds.enterWorld)
    return w;
  });
  registerBuilder('isel', async (progress) => {
    await progress(2, 'Something stirs on the throne…');
    let vagel = false;
    try { const { preloadVagel, vagelReady } = await import('./entities/bosses/vagel.js'); await preloadVagel(); vagel = vagelReady(); } catch (e) { console.warn('Vagel', e); }
    const { buildIselWorld } = await import('./world/isel/index.js');
    const { SPAWN_ZONES: ISEL_SPAWNS } = await import('./world/isel/layout.js');
    const w = await buildIselWorld({ engine, progress });
    w.root.visible = false;
    engine.scene.add(w.root);
    w.npcs = new NpcManager([], { parent: w.root, terrain: w.terrain, colliders: w.colliders });
    w.monsters = new MonsterManager(vagel ? ISEL_SPAWNS : [], w.root);   // (Vagel on her throne; spawned on the first visit)
    return w;
  });
  G.travel = travel;
  G.usePortal = (portal) => { if (portal.onUse) portal.onUse(); else if (portal.dest) travel(portal.dest); };
  G.world = roumen;
  G.terrain = roumen.terrain; G.colliders = roumen.colliders; G.nav = roumen.nav; G.portals = roumen.portals;

  await step(78, 'Waking up the townsfolk…');
  G.fx = new Effects(engine.scene);
  G.loot = new LootManager();
  G.quests = new QuestLog();

  await step(86, 'Spawning monsters…');
  roumen.monsters = new MonsterManager(SPAWN_ZONES, roumen.root);
  G.monsters = roumen.monsters;
  G.monsters.spawnAll();
  try { MonsterModels.warmupMonsters && MonsterModels.warmupMonsters(engine.renderer, engine.camera, engine.scene); } catch (e) { console.warn(e); }

  await step(94, 'Waking up the dragon…');
  try { await preloadReko(); } catch (e) { console.warn('reko model', e); }
  initSlots();
  window.G = G; // debug handle

  // title screen -> character select terrace -> game (dev: ?autostart skips straight into the last hero)
  const q = new URLSearchParams(location.search);
  let slot = getActiveSlot();
  if (!q.has('autostart')) {
    let skipIntro = q.has('select');
    try { skipIntro = skipIntro || sessionStorage.getItem(SKIP_INTRO_KEY) === '1'; sessionStorage.removeItem(SKIP_INTRO_KEY); } catch { /* ignore */ }
    await step(100, 'Ready!');
    const hideLoading = () => document.getElementById('loading').classList.add('done');
    if (!skipIntro) await runTitle(engine, { onShown: hideLoading });
    slot = await runCharSelect(engine, { onShown: hideLoading, preselect: slot });
  } else {
    await step(100, 'Ready!');
  }
  await startGame(engine, roumen, slot, q);
}

// ------------------------------------------------------------------ enter the game with the hero of `slot`
async function startGame(engine, roumen, slot, q) {
  const auto = q.has('autostart');
  const data = loadSlot(slot);
  if (!auto) {
    // the terrace faded to black; the travel curtain takes over underneath while the world is prepared
    curtain.show(WORLD_NAMES[(data && !data.fresh && data.world) || 'roumen'] || 'Roumen');
    setTimeout(() => fadeScreen(false, 0), 500);
  }
  setActiveSlot(slot);
  const player = new Player((data && data.name) || 'Ryou', (data && data.look) || {}, slot);
  const loaded = player.load(data);
  G.player = player;
  player.attach(engine.scene);
  const startWorld = loaded && player._savedWorld && player._savedWorld !== 'roumen' ? player._savedWorld : 'roumen';
  if (startWorld === 'roumen') {
    if (!G.nav.isWalkable(player.pos.x, player.pos.z)) { const w = G.nav.nearestWalkable(player.pos.x, player.pos.z, 20); if (w) player.pos.set(w[0], 0, w[1]); }
    player.pos.y = roumen.terrain.groundAt(player.pos.x, player.pos.z);
  }
  roumen.npcs = new NpcManager(undefined, { parent: roumen.root });
  G.npcs = roumen.npcs;
  if (player._savedQuests) G.quests.load(player._savedQuests);

  const canvas = engine.canvas;
  G.input = new Input(canvas);
  G.cam = new FollowCamera(engine.camera, roumen.terrain);
  G.cam.setBlockers(roumen.colliders, roumen.terrain);
  addPortalBlockers(G.cam, roumen.portals);
  G.cam.yaw = player.rotY + Math.PI;
  G.cam.snap(player.pos);
  const hud = new HUD();
  G.ui = hud;
  hud.setWorld(roumen);
  hud.renderSkillbars();
  hud.renderBuffs();
  G.quests.refresh();
  player.recalc();
  // a save made inside another world continues there
  if (startWorld !== 'roumen') {
    try {
      const at = { x: player.pos.x, z: player.pos.z, rotY: player.rotY };
      const w = await getWorld(startWorld, auto ? (pct, text) => step(100, text) : (pct, text) => curtain.progress(pct, text));
      if (!w.nav.isWalkable(at.x, at.z)) Object.assign(at, w.spawn);
      enterWorld(w, at);
    } catch (e) { console.error('could not restore world', startWorld, e); enterWorld(roumen); }
  }
  // warm up: compile shaders by rendering once
  engine.setShadowFocus(player.pos);
  engine.render();
  hud.refreshPortrait();

  G.audio.unlock();
  if (auto) { document.getElementById('loading').style.transition = 'none'; document.getElementById('loading').classList.add('done'); }
  else curtain.hide();
  if (!loaded) {
    G.msg(`Welcome to Roumen, ${player.name}! Talk to Town Chief Oswin on the plaza (look for the ! marker).`, 'quest');
    G.msg('Left-click to move · double-click monsters to attack · right-drag to rotate the camera.', 'sys');
  }
  player.save();
  hud.centerMsg(G.world.areaNameAt(player.pos.x, player.pos.z), 3);

  // ------------------------------------------------------------------ main loop
  const clock = new THREE.Clock();
  let saveT = 0;
  const loop = () => {
    requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.05);
    G.time += dt;
    if (!G.cutscene || !G.cutscene.locked) handleInput(dt);
    player.update(dt);
    updateHouse(dt);
    G.monsters.update(dt);
    G.npcs.update(dt);
    G.loot.update(dt);
    G.cam.update(dt, player.pos, G.input);
    const cs = G.cutscene;
    if (cs) { cs.update(dt); cs.applyCamera(dt); }       // (a cutscene takes the camera and the clicks)
    engine.setShadowFocus(player.pos);
    G.world.update(dt, G.time, engine.camera, player.pos, G.fx);
    G.fx.update(dt, engine.camera);
    hud.update(dt);
    engine.render();
    G.input.endFrame();
    saveT += dt;
    if (saveT > 30) { saveT = 0; player.save(); }
  };
  loop();
  window.addEventListener('beforeunload', () => player.save());
  const fitHud = () => {
    const k = Math.min(window.innerWidth / 1360, window.innerHeight / 780);
    G.uiScale = k < 1 ? Math.max(0.4, k) : 1;
    document.getElementById('hud').style.zoom = k < 1 ? G.uiScale.toFixed(3) : '';
  };
  window.addEventListener('resize', fitHud);
  fitHud();
  if (auto) setTimeout(() => applyDebugParams(q), 10);
}

// ------------------------------------------------------------------ Roumen (the start world)
async function buildRoumen(engine, assets) {
  await step(12, 'Shaping the land…');
  const root = new THREE.Group();
  root.name = 'world:roumen';
  engine.scene.add(root);
  const terrain = new Terrain();
  root.add(terrain.mesh);
  const sky = new Sky(root, engine.sunDir);
  const sea = createSea(terrain, engine.sunDir);
  root.add(sea.mesh);

  await step(28, 'Building Roumen…');
  const ctx = createWorldContext(root, terrain);
  ctx.assets = assets;
  let town;
  try { const { buildTown } = await import('./world/town.js'); town = buildTown(ctx); }
  catch (e) { console.error('town build failed', e); town = { update() {}, npcSpots: {} }; }
  // portals: dest = world id to travel to; the others are sealed for now
  const portals = PORTALS.map((p) => {
    const portal = createPortal({ ...p, y: terrain.groundAt(p.x, p.z) });
    portal.dest = p.dest || null;
    root.add(portal.group);
    const c = Math.cos(p.rotY), s = Math.sin(p.rotY);
    for (const sx of [-1, 1]) ctx.colliders.addCircle(p.x + c * sx * 2.35, p.z - s * sx * 2.35, 0.6);
    ctx.addNoScatter(p.x, p.z, 4);
    ctx.minimap.addCircle(p.x, p.z, 2.2, '#4dff9a');
    return portal;
  });

  await step(48, 'Growing trees and flowers…');
  buildVegetation(ctx);

  await step(60, 'Merging geometry…');
  ctx.batcher.build(root);

  await step(68, 'Mapping paths…');
  const nav = new NavGrid(terrain, ctx.colliders, 1);
  const atmosphere = captureAtmosphere(engine);
  return {
    id: 'roumen', name: 'Roumen', root, terrain, colliders: ctx.colliders, nav, minimap: ctx.minimap, portals,
    spawn: { x: TOWN.spawn.x, z: TOWN.spawn.z, rotY: -0.52 }, areaNameAt, mapLabels: MAP_LABELS,
    activate(eng) { restoreAtmosphere(eng, atmosphere); },
    update(dt, t, camera, pos, fx) {
      for (const f of ctx.updaters) f(dt, t);
      sea.update(t);
      for (const p of portals) p.update(dt, t, fx);
      if (town.update) town.update(dt, t);
      sky.update(dt, camera.position);
    },
  };
}

// dev URL params for ?autostart: &map=cyclone &pos=x,z &rot= &yaw= &pitch= &dist= &hideui &win=inv,char &target
async function applyDebugParams(q) {
  if (q.get('map') && q.get('map') !== G.world.id) await G.travel(q.get('map'));
  if (q.get('pos')) { const [x, z] = q.get('pos').split(',').map(Number); G.player.teleport(x, z); }
  if (q.get('rot')) G.player.rotY = Number(q.get('rot'));
  if (q.get('yaw')) G.cam.yaw = Number(q.get('yaw'));
  if (q.get('pitch')) G.cam.pitch = Number(q.get('pitch'));
  if (q.get('dist')) { G.cam.targetDist = G.cam.dist = Number(q.get('dist')); G.cam.maxDist = Math.max(G.cam.maxDist, G.cam.dist); }
  if (q.has('hideui')) document.getElementById('hud').style.display = 'none';
  if (q.get('win')) q.get('win').split(',').forEach((w) => G.ui.win.open(w));
  if (q.get('target')) { const t = G.monsters.nearestTarget(G.player.pos, 60); if (t) G.player.setTarget(t); }
  G.cam.snap(G.player.pos);
}

// ------------------------------------------------------------------ picking
const ray = new THREE.Raycaster();
const tmpSphere = new THREE.Sphere();
function pickEntity(mx, my) {
  ray.setFromCamera(new THREE.Vector2(mx, my), G.camera);
  let best = null, bd = Infinity;
  const hit = new THREE.Vector3();
  const test = (ent, cx, cy, cz, r) => {
    tmpSphere.center.set(cx, cy, cz); tmpSphere.radius = r;
    if (ray.ray.intersectSphere(tmpSphere, hit)) {
      const d = hit.distanceTo(ray.ray.origin);
      if (d < bd) { bd = d; best = ent; }
    }
  };
  for (const m of G.monsters.list) if (!m.dead) test(m, m.pos.x, m.groundY + m.height * 0.5, m.pos.z, Math.max(m.radius * 1.1, m.height * 0.55));
  for (const n of G.npcs.list) test(n, n.pos.x, n.pos.y + n.height * 0.5, n.pos.z, 0.75);
  for (const l of G.loot.list) test(l, l.pos.x, l.pos.y + 0.25, l.pos.z, 0.55);
  for (const p of G.portals) test(p, p.pos.x, p.pos.y + 2.6, p.pos.z, 1.9);
  return best;
}
function pickGround(mx, my) {
  ray.setFromCamera(new THREE.Vector2(mx, my), G.camera);
  const o = ray.ray.origin, d = ray.ray.direction;
  let prev = 0;
  for (let t = 0.5; t < 320; t += 0.6) {
    const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
    if (y < Math.max(G.terrain.heightAt(x, z), 0)) {
      let a = prev, b = t;
      for (let i = 0; i < 12; i++) {
        const m = (a + b) / 2;
        const yy = o.y + d.y * m;
        if (yy < Math.max(G.terrain.heightAt(o.x + d.x * m, o.z + d.z * m), 0)) b = m; else a = m;
      }
      return new THREE.Vector3(o.x + d.x * b, o.y + d.y * b, o.z + d.z * b);
    }
    prev = t;
  }
  return null;
}

// ------------------------------------------------------------------ input handling
function handleInput(dt) {
  const inp = G.input, p = G.player, ui = G.ui;
  // hover
  if (inp.mouse.overCanvas) {
    const h = pickEntity(inp.mouse.nx, inp.mouse.ny);
    G.hovered = h;
    if (h && h.setHighlight === undefined && h.model) h.model.setHighlight && h.model.setHighlight(true);
    if (G._lastHover && G._lastHover !== h && G._lastHover.model) G._lastHover.model.setHighlight && G._lastHover.model.setHighlight(false);
    if (h && h.model) h.model.setHighlight && h.model.setHighlight(true);
    G._lastHover = h;
    G.engine.canvas.style.cursor = h ? (h.isNpc || h.isPortal ? 'help' : h.isLoot ? 'grab' : 'crosshair') : 'default';
  } else G.hovered = null;

  for (const c of inp.consumeClicks()) {
    G.audio.unlock();
    const nx = (c.x / window.innerWidth) * 2 - 1, ny = -(c.y / window.innerHeight) * 2 + 1;
    const ent = pickEntity(nx, ny);
    if (p.dead) continue;
    if (ent && ent.isNpc) {
      p.setTarget(ent);
      p.autoAttack = false;
      p.pending = { kind: 'npc', npc: ent };
      p.pathTimer = 0;
      p.exitHouse && p.exitHouse();
      continue;
    }
    if (ent && ent.isLoot) { p.pending = { kind: 'loot', loot: ent }; p.moveTo(ent.pos.x, ent.pos.z); continue; }
    if (ent && ent.isPortal) {
      p.exitHouse && p.exitHouse();
      if (ent.locked && ent.locked()) { G.msg(ent.lockedMsg, 'warn'); G.audio.play('error'); continue; }
      if (ent.dest) { p.autoAttack = false; p.pending = { kind: 'portal', portal: ent }; p.path = null; continue; }
      const d = Math.hypot(ent.pos.x - p.pos.x, ent.pos.z - p.pos.z);
      if (d > 6) { p.moveTo(ent.pos.x + Math.sin(ent.group.rotation.y) * 3.5, ent.pos.z + Math.cos(ent.group.rotation.y) * 3.5); }
      else { G.msg(`The way to ${ent.name} is sealed for now. (Coming soon)`, 'warn'); G.audio.play('teleport'); }
      continue;
    }
    if (ent && !ent.isNpc) {
      if (c.button === 2 || c.double || p.target === ent) p.attackTarget(ent);
      else p.setTarget(ent);
      continue;
    }
    if (c.button !== 0) continue;
    const g = pickGround(nx, ny);
    if (g) {
      p.autoAttack = false;
      p.pending = null;
      p.exitHouse && p.exitHouse();
      if (p.moveTo(g.x, g.z)) G.fx.showClick(g);
    }
  }

  // hotkeys
  const shift = inp.down('ShiftLeft') || inp.down('ShiftRight');
  SLOT_CODES.forEach((code, i) => { if (inp.wasPressed(code)) ui.activateSlot(shift ? 1 : 0, i); });
  if (inp.wasPressed('Tab')) { const t = G.monsters.cycleTarget(p.pos, p.target); if (t) p.setTarget(t); }
  if (inp.wasPressed('KeyQ')) p.useStone('hp');
  if (inp.wasPressed('KeyE')) p.useStone('sp');
  if (inp.wasPressed('Home')) p.toggleSit();
  if (inp.wasPressed('KeyH')) p.toggleHouse();
  if (inp.wasPressed('KeyU')) ui.toggleHidden();
  const winKeys = { KeyC: 'character', KeyI: 'inventory', KeyK: 'skills', KeyL: 'quests', KeyM: 'map', KeyV: 'actions', KeyF: 'community', KeyX: 'store', F10: 'help' };
  for (const [k, w] of Object.entries(winKeys)) if (inp.wasPressed(k)) ui.win.toggle(w);
  if (inp.wasPressed('Escape')) {
    if (!ui.win.closeTop()) {
      if (p.target) p.setTarget(null);
      else ui.win.toggle('options');
    }
  }
  if (p.inHouse && (inp.down('KeyW') || inp.down('KeyA') || inp.down('KeyS') || inp.down('KeyD'))) p.exitHouse();
}

// ------------------------------------------------------------------ mini house resting
let house = null, smokeT = 0;
Player.prototype.toggleHouse = function () {
  if (this.inHouse) { this.exitHouse(); return; }
  if (this.dead || this.anim.busy || this.inCombatT > 0) { G.msg('You cannot rest while in combat.', 'warn'); return; }
  if (G.npcs.list.some((n) => Math.hypot(n.pos.x - this.pos.x, n.pos.z - this.pos.z) < 4)) { G.msg('Too close to someone to set up your mini house.', 'warn'); return; }
  this.stopActions();
  this.standUp();
  if (this.mount) this.dismount();
  this.inHouse = true;
  this.sitting = true;
  if (!house) house = createMiniHouse();
  house.position.copy(this.pos);
  house.rotation.y = this.rotY;
  house.scale.setScalar(0.01);
  G.scene.add(house);
  this.root.visible = false;
  G.fx.poof(this.pos, '#ffffff', 22);
  G.audio.play('pickup');
  G.emit('buffs');
};
Player.prototype.exitHouse = function () {
  if (!this.inHouse) return;
  this.inHouse = false;
  this.sitting = false;
  this.anim.sitTarget = 0; this.anim.sit = 0;
  this.root.visible = true;
  if (house) G.scene.remove(house);
  G.fx.poof(this.pos, '#ffffff', 22);
  G.emit('buffs');
};
function updateHouse(dt) {
  const p = G.player;
  if (!p.inHouse || !house) return;
  const s = house.scale.x;
  if (s < 1) house.scale.setScalar(Math.min(1, s + dt * 4 * (1.2 - s) + 0.01));
  house.rotation.y = p.rotY;
  // extra regen while resting in the house
  p.hp = Math.min(p.stats.maxHp, p.hp + p.stats.maxHp * 0.05 * dt);
  p.sp = Math.min(p.stats.maxSp, p.sp + p.stats.maxSp * 0.06 * dt);
  smokeT += dt;
  if (smokeT > 0.35) {
    smokeT = 0;
    const c = house.userData.chimney.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), house.rotation.y).add(house.position);
    G.fx.particles.emit({ x: c.x, y: c.y, z: c.z, vx: 0.2, vy: 0.8, life: 2.2, size: 0.35, endSize: 0.9, color: new THREE.Color('#d8d8d8'), drag: 0.5, grav: 0, alpha: 0.35 });
  }
}

window.addEventListener('error', (e) => { const t = document.getElementById('loadText'); if (t) t.textContent = 'Error: ' + (e.error ? e.error.stack : e.message); });
init().catch((e) => {
  console.error(e);
  loadText.textContent = 'Error: ' + (e.stack || e.message);
  loadText.style.color = '#ffb0a0';
});

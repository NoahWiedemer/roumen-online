// World registry and travel between maps (Roumen <-> Cyclone Hill).
// A world owns a root group with all of its content plus its own terrain / colliders / nav grid / minimap
// shapes / portals / NPCs / monsters, an atmosphere it writes into the engine (activate) and a per-frame update.
// Only the active world is visible and updated; G.terrain / G.nav / G.npcs / ... always point at it.
import { G } from '../game/game.js';

export const WORLDS = {};
const builders = {};

export function registerWorld(world) { WORLDS[world.id] = world; }
export function registerBuilder(id, build) { builders[id] = build; }

// ------------------------------------------------------------------ engine atmosphere snapshot (Roumen's defaults)
export function captureAtmosphere(engine) {
  const s = engine.scene;
  return {
    fog: s.fog ? { color: s.fog.color.clone(), near: s.fog.near, far: s.fog.far } : null,
    bg: s.background && s.background.isColor ? s.background.clone() : null,
    hemiSky: engine.hemi.color.clone(), hemiGround: engine.hemi.groundColor.clone(), hemi: engine.hemi.intensity,
    sun: engine.sun.color.clone(), sunI: engine.sun.intensity, sunDir: engine.sunDir.clone(), exposure: engine.renderer.toneMappingExposure,
  };
}
export function restoreAtmosphere(engine, a) {
  const s = engine.scene;
  if (a.fog && s.fog) { s.fog.color.copy(a.fog.color); s.fog.near = a.fog.near; s.fog.far = a.fog.far; }
  if (a.bg && s.background && s.background.isColor) s.background.copy(a.bg);
  engine.hemi.color.copy(a.hemiSky); engine.hemi.groundColor.copy(a.hemiGround); engine.hemi.intensity = a.hemi;
  engine.sun.color.copy(a.sun); engine.sun.intensity = a.sunI;
  engine.sunDir.copy(a.sunDir);
  engine.renderer.toneMappingExposure = a.exposure;
}

// ------------------------------------------------------------------ switching
// portal arches become camera occluders so the follow camera never ends up inside the stone arch
export function addPortalBlockers(cam, portals) {
  if (!cam.blockers) cam.blockers = [];
  for (const pt of portals) {
    const r = pt.group.rotation.y;
    cam.blockers.push({ x: pt.pos.x, z: pt.pos.z, cos: Math.cos(r), sin: Math.sin(r), hw: 3.4, hd: 1.0, y0: pt.pos.y - 1, y1: pt.pos.y + 6.8 });
  }
}

export async function getWorld(id, progress) {
  if (!WORLDS[id]) {
    if (!builders[id]) throw new Error(`unknown world "${id}"`);
    registerWorld(await builders[id](progress));
  }
  return WORLDS[id];
}

// where to appear in `world` when arriving from world `fromId`: in front of the portal that leads back
// (portal.arriveDist metres out, 8 by default)
export function arrivalPoint(world, fromId) {
  const back = (world.portals || []).find((p) => p.dest === fromId);
  if (back) {
    const r = back.group.rotation.y, d = back.arriveDist ?? 8;
    return { x: back.pos.x + Math.sin(r) * d, z: back.pos.z + Math.cos(r) * d, rotY: r, camYaw: r + Math.PI + 0.55 };
  }
  return { ...world.spawn };
}

export function enterWorld(world, at = null) {
  const p = G.player;
  const prev = G.world;
  if (prev && prev !== world) prev.root.visible = false;
  world.root.visible = true;
  G.world = world;
  G.terrain = world.terrain; G.colliders = world.colliders; G.nav = world.nav; G.portals = world.portals || [];
  G.npcs = world.npcs; G.monsters = world.monsters;
  // monsters need the world's nav grid / terrain in G, so a world populates on its first visit
  if (world.monsters && !world.monsters.spawned) world.monsters.spawnAll();
  if (p) {
    p.setTarget(null);
    p.stopActions();
    if (p.inHouse) p.exitHouse();
    p.standUp();
    const s = at || world.spawn;
    p.teleport(s.x, s.z);
    if (s.rotY !== undefined) { p.rotY = s.rotY; p.faceGoal = s.rotY; }
  }
  if (G.cam) {
    G.cam.terrain = world.terrain;
    G.cam.setBlockers(world.colliders, world.terrain);
    addPortalBlockers(G.cam, world.portals || []);
    if (world.camBlockers) G.cam.blockers.push(...world.camBlockers);
    G.cam.ceiling = world.cameraCeiling || null;
    if (p) { G.cam.yaw = at && at.camYaw !== undefined ? at.camYaw : p.rotY + Math.PI; G.cam.snap(p.pos); }
  }
  if (G.loot) G.loot.clear();
  world.activate(G.engine, p ? p.pos : null);
  if (G.ui && G.ui.setWorld) G.ui.setWorld(world);
  if (G.quests) G.quests.refresh();
  G.emit('world', world);
}

// travel with a fade-out / loading text / fade-in; builds the target world on first visit
let overlay = null;
function fader() {
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.id = 'travel-fade';
  overlay.innerHTML = '<div class="tf-name"></div><div class="tf-text"></div><div class="tf-bar"><i></i></div>';
  document.body.appendChild(overlay);
  return overlay;
}
// the same black curtain for other long switches (character select -> game)
export const curtain = {
  show(title = '') {
    const o = fader();
    o.querySelector('.tf-name').textContent = title;
    o.querySelector('.tf-text').textContent = '';
    o.querySelector('.tf-bar i').style.width = '0%';
    o.classList.add('show');
  },
  async progress(pct, text) {
    const o = fader();
    o.querySelector('.tf-text').textContent = text;
    o.querySelector('.tf-bar i').style.width = pct + '%';
    await frame();
  },
  hide() { if (overlay) overlay.classList.remove('show'); },
};
// yield so the overlay can paint (the timeout fallback keeps going in hidden tabs, where rAF never fires)
const frame = () => new Promise((r) => { let done = false; const fin = () => { if (!done) { done = true; r(); } }; requestAnimationFrame(() => setTimeout(fin, 0)); setTimeout(fin, 60); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export async function travel(id, { at = null, title = null } = {}) {
  if (G.traveling || (G.world && G.world.id === id && !at)) return;
  G.traveling = true;
  const from = G.world ? G.world.id : null;
  const o = fader();
  o.querySelector('.tf-name').textContent = title || '';
  o.querySelector('.tf-text').textContent = '';
  o.querySelector('.tf-bar i').style.width = '0%';
  o.classList.add('show');
  G.audio && G.audio.play('teleport');
  await wait(450);
  try {
    const world = await getWorld(id, async (pct, text) => {
      o.querySelector('.tf-text').textContent = text;
      o.querySelector('.tf-bar i').style.width = pct + '%';
      await frame();
    });
    o.querySelector('.tf-name').textContent = world.name;
    o.querySelector('.tf-bar i').style.width = '100%';
    enterWorld(world, at || arrivalPoint(world, from));
    G.engine.render();              // compile the new world's shaders while the screen is still covered
    await frame();
    if (G.player) G.player.save();
    o.classList.remove('show');
    if (G.ui) G.ui.centerMsg(world.areaNameAt(G.player.pos.x, G.player.pos.z), 3);
  } catch (e) {
    console.error('travel failed', e);
    o.classList.remove('show');
    G.msg && G.msg('The portal flickers... something went wrong.', 'warn');
  }
  G.traveling = false;
}

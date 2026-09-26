// Dev-only test harness for the running game (the browser pane may be hidden, so nothing advances on its own):
//   const h = await import('/src/dev/harness.js'); h.step(30); await h.film([...]); h.foot(...)
// Steps the same systems as the main loop, renders on demand and composes film strips from a fixed camera.
import * as THREE from 'three';
import { G } from '../game/game.js';

export function step(n, dt = 1 / 30) {
  for (let i = 0; i < n; i++) {
    G.time += dt;
    G.player.update(dt);
    G.monsters.update(dt); G.npcs.update(dt); G.loot.update(dt);
    G.cam.update(dt, G.player.pos, G.input);
    const cs = G.cutscene;
    if (cs) { cs.update(dt); cs.applyCamera(dt); }
    G.engine.setShadowFocus(G.player.pos);
    G.world.update(dt, G.time, G.engine.camera, G.player.pos, G.fx);
    G.fx.update(dt, G.engine.camera);
    G.ui.update(dt);
    G.input.endFrame();
  }
}

function overlay(src) {
  let img = document.getElementById('__filmimg');
  if (!img) { img = document.createElement('img'); img.id = '__filmimg'; document.body.appendChild(img); }
  img.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;width:100%;height:100%;object-fit:contain;object-position:left top;pointer-events:none;background:#000';
  img.src = src;
}
export function snap() { G.engine.render(); overlay(G.engine.renderer.domElement.toDataURL()); }

// renders one follow-camera frame per setup call into a labelled grid: sheet([[label, () => {...}], ...])
export function sheet(shots, { cols = 3, w = 400, h = 300, settle = 2 } = {}) {
  const cv = document.createElement('canvas');
  cv.width = cols * w; cv.height = Math.ceil(shots.length / cols) * h;
  const g = cv.getContext('2d');
  g.font = '18px sans-serif';
  shots.forEach(([label, setup], i) => {
    setup();
    step(settle);
    G.engine.render();
    const src = G.engine.renderer.domElement, x = (i % cols) * w, y = Math.floor(i / cols) * h;
    g.drawImage(src, 0, 0, src.width, src.height, x, y, w, h);
    g.fillStyle = '#ff0'; g.fillText(label, x + 8, y + 22);
  });
  overlay(cv.toDataURL());
}

// script: [{ keys: ['KeyW'], frames: 30, label, each(i) }], camera beside the hero (side metres to its right)
export function film(script, { every = 2, cols = 8, w = 150, h = 170, side = 5, camH = 1.0, look = 0.85, zoom = 0.5, view = 'side' } = {}) {
  const p = G.player, cam = G.engine.camera, frames = [];
  const r0 = p.rotY;             // 'world*' views keep the camera direction of the start
  const shot = (label) => {
    // 'side': from the hero's right; 'front' / 'back' along its facing; 'worldSide': from the right of where it
    // faced at the start; 'game': the follow camera as the player sees it
    const world = view === 'worldSide', mode = world ? 'side' : view;
    const r = world ? r0 : p.rotY, fx = Math.sin(r), fz = Math.cos(r);
    if (mode !== 'game') {
      let cx, cz;
      if (mode === 'side') { cx = p.pos.x - fz * side; cz = p.pos.z + fx * side; }
      else if (mode === 'front') { cx = p.pos.x + fx * side; cz = p.pos.z + fz * side; }
      else { cx = p.pos.x - fx * side; cz = p.pos.z - fz * side; }
      cam.position.set(cx, p.pos.y + camH, cz);
      cam.lookAt(p.pos.x, p.pos.y + look, p.pos.z);
      cam.updateMatrixWorld();
    }
    G.engine.render();
    const src = G.engine.renderer.domElement, sw = src.width, sh = src.height;
    const ch = sh * zoom, cw = ch * (w / h);
    const tc = document.createElement('canvas');
    tc.width = w; tc.height = h;
    tc.getContext('2d').drawImage(src, sw / 2 - cw / 2, sh * 0.5 - ch * 0.55, cw, ch, 0, 0, w, h);
    frames.push({ c: tc, label });
  };
  let n = 0;
  for (const seg of script) {
    G.input.keys.clear();
    for (const k of seg.keys || []) G.input.keys.add(k);
    for (let i = 0; i < seg.frames; i++) {
      if (seg.each) seg.each(i);
      step(1);
      if (n++ % every === 0) shot(seg.label || '');
    }
  }
  G.input.keys.clear();
  const rows = Math.ceil(frames.length / cols), cv = document.createElement('canvas');
  cv.width = cols * w; cv.height = rows * h;
  const g = cv.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, cv.width, cv.height);
  g.font = '12px sans-serif';
  frames.forEach((f, i) => {
    const x = (i % cols) * w, y = Math.floor(i / cols) * h;
    g.drawImage(f.c, x, y);
    g.fillStyle = '#ff0'; g.fillText(`${i} ${f.label}`, x + 3, y + 13);
    g.strokeStyle = '#333'; g.strokeRect(x, y, w, h);
  });
  overlay(cv.toDataURL());
  return frames.length;
}

// foot skating: world-space horizontal speed of each foot bone while it is the lower one (planted), per frame
export function footTrace(frames, keys = ['KeyW'], dt = 1 / 30) {
  const p = G.player, B = p.rig.bones, map = { L: 'Bone_013', R: 'Bone_008' };
  const prev = {}, out = [];
  const wp = (b) => B[b].getWorldPosition(new THREE.Vector3());
  G.input.keys.clear();
  for (const k of keys) G.input.keys.add(k);
  for (let i = 0; i < frames; i++) {
    step(1, dt);
    p.root.updateMatrixWorld(true);
    const L = wp(map.L), R = wp(map.R);
    const low = L.y < R.y ? 'L' : 'R', f = low === 'L' ? L : R;
    const pv = prev[low];
    out.push({ i, low, y: +(Math.min(L.y, R.y) - p.pos.y).toFixed(3), v: pv ? +(Math.hypot(f.x - pv.x, f.z - pv.z) / dt).toFixed(2) : null, body: +p.anim.speed.toFixed(2) });
    prev.L = L; prev.R = R;
  }
  G.input.keys.clear();
  return out;
}

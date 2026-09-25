// Character select: a terrace high above a sea of clouds at dusk with six fixed seats. Every saved hero sits on
// their own seat (chair, benches, floor cushion, barrel); clicking one makes them stand up and wave, empty seats
// offer "Create" (name + hair / outfit colours, previewed live on the seat). Resolves with the chosen slot.
import * as THREE from 'three';
import { G } from '../game/game.js';
import { createFighter } from '../entities/fighter.js';
import { applyPlayerTint } from '../entities/playerModel.js';
import { applyOutfit } from '../entities/outfit.js';
import { dualBladesReady, attachDualBlades, bladeTime } from '../entities/weapons.js';
import { P_IDLE, P_DUAL_IDLE, P_SIT, fullPose, legIK } from '../entities/anim.js';
import { JOINTS } from '../entities/humanoid.js';
import { ITEMS, STARTING } from '../game/data.js';
import { SLOT_COUNT, listSlots, saveSlot, deleteSlot, newCharacter, tintOf, HAIR_COLORS, OUTFIT_COLORS, WORLD_NAMES } from '../game/saves.js';
import { skyDome, mountainLayer, cloud, mat, blob, limb, disposeTree } from './scenery.js';
import { Particles } from './particles.js';
import { fadeScreen } from './ui.js';
import { LOGO_SVG } from './titleScreen.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const CHANNELS = [...JOINTS, 'pos', 'root'];
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (x) => x * x * (3 - 2 * x);

// seat layout: an arc facing the camera, each with its own furniture and sitting style
const SEATS = [
  { x: -3.75, z: -0.45, type: 'chair', pose: 'upright' },
  { x: -2.25, z: -1.15, type: 'bench', pose: 'lean' },
  { x: -0.76, z: -1.5, type: 'cushion', pose: 'cross' },
  { x: 0.76, z: -1.5, type: 'barrel', pose: 'chin' },
  { x: 2.25, z: -1.15, type: 'bench', pose: 'upright' },
  { x: 3.75, z: -0.45, type: 'chair', pose: 'lean' },
];
const SEAT_H = { chair: 0.44, bench: 0.44, barrel: 0.52, cushion: 0.13 };
const CAM = V(0, 1.95, 6.9), LOOK = V(0, 0.98, -0.7);

export function runCharSelect(engine, { onShown, preselect = 0 } = {}) {
  return new Promise((resolve) => {
    const S = buildTerrace(engine);
    const slots = listSlots();
    const chars = new Array(SLOT_COUNT).fill(null);
    const markers = [];
    for (let i = 0; i < SLOT_COUNT; i++) {
      markers.push(makeEmptyMarker(S, i));
      if (slots[i]) chars[i] = spawnHero(S, i, slots[i]);
    }
    const ui = buildUi();
    let selected = -1, creating = null, done = false, shown = false, last = performance.now(), t = 0;
    let hover = -1;
    const camX = { pos: 0, look: 0 };
    let camOverride = null;
    window.__charSelect = { S, chars, setCam: (pos, look) => { camOverride = pos ? [V(...pos), V(...look)] : null; } };   // dev handle

    // ---- selection / UI state
    const select = (i) => {
      if (creating) cancelCreate();
      if (selected === i) return;
      if (selected >= 0 && chars[selected]) chars[selected].stand = false;
      selected = i;
      G.audio.play('click');
      const c = chars[i];
      if (c) { c.stand = true; c.waveT = 0.55; }
      renderPanel();
    };
    const renderPanel = () => {
      const c = chars[selected];
      const p = ui.panel;
      if (selected < 0) { p.innerHTML = '<div class="cs-empty">Choose a seat</div>'; return; }
      if (!c) {
        p.innerHTML = `<div class="cs-name">Empty seat</div><div class="cs-sub">A new hero could sit here.</div>
          <div class="cs-btns"><button class="cs-btn gold" data-a="create">Create Character</button></div>`;
        return;
      }
      const d = c.data;
      p.innerHTML = `<div class="cs-name">${esc(d.name)}</div>
        <div class="cs-sub">Level ${d.level || 1} Fighter · ${WORLD_NAMES[d.world] || 'Roumen'}</div>
        <div class="cs-btns"><button class="cs-btn gold" data-a="enter">Enter World</button><button class="cs-btn red" data-a="delete">Delete</button></div>`;
    };
    const confirmDelete = () => {
      const c = chars[selected];
      ui.panel.innerHTML = `<div class="cs-name">Delete ${esc(c.data.name)}?</div><div class="cs-sub">This hero and all progress are gone for good.</div>
        <div class="cs-btns"><button class="cs-btn red" data-a="delete-yes">Delete forever</button><button class="cs-btn" data-a="back">Keep</button></div>`;
    };
    const doDelete = () => {
      deleteSlot(selected);
      const c = chars[selected];
      S.scene.remove(c.root);
      chars[selected] = null;
      G.audio.play('close');
      renderPanel();
    };
    // ---- creation: a preview hero stands on the seat while name / colours are picked
    const startCreate = () => {
      const look = { hair: null, outfit: null };
      const hero = spawnHero(S, selected, newCharacter('', look));
      hero.stand = true; hero.standK = 1; hero.preview = true;
      chars[selected] = hero;
      creating = { look, hero };
      ui.create.classList.toggle('left', SEATS[selected].x > 0);    // keep the preview hero visible
      ui.create.classList.add('shown');
      ui.panel.classList.add('hidden');
      const input = ui.create.querySelector('input');
      input.value = '';
      input.focus();
      paintSwatches();
      G.audio.play('open');
    };
    const paintSwatches = () => {
      const sw = (list, key) => list.map((c, k) => `<button class="cs-sw${creating.look[key] === c ? ' on' : ''}" data-sw="${key}:${k}" style="background:${c || 'linear-gradient(135deg,#6b8cff,#f3f3f3)'}" title="${c ? '' : 'Original'}"></button>`).join('');
      ui.create.querySelector('.cs-hair').innerHTML = sw(HAIR_COLORS, 'hair');
      ui.create.querySelector('.cs-outfit').innerHTML = sw(OUTFIT_COLORS, 'outfit');
    };
    const cancelCreate = () => {
      if (!creating) return;
      S.scene.remove(creating.hero.root);
      chars[selected] = null;
      creating = null;
      ui.create.classList.remove('shown');
      ui.panel.classList.remove('hidden');
      renderPanel();
    };
    const finishCreate = () => {
      const input = ui.create.querySelector('input');
      const name = input.value.trim().slice(0, 14);
      if (!name) { input.classList.add('err'); G.audio.play('error'); setTimeout(() => input.classList.remove('err'), 500); return; }
      const data = newCharacter(name, creating.look);
      saveSlot(selected, data);
      const hero = creating.hero;
      hero.data = data;
      hero.preview = false;
      hero.waveT = 0.3;
      creating = null;
      ui.create.classList.remove('shown');
      ui.panel.classList.remove('hidden');
      G.audio.play('levelup');
      renderPanel();
    };
    const enter = async () => {
      if (done || selected < 0 || !chars[selected] || chars[selected].preview) return;
      done = true;
      G.audio.unlock();
      G.audio.play('teleport');
      ui.root.classList.add('leaving');
      await fadeScreen(true, 450);
      cleanup();
      resolve(selected);
    };

    ui.root.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      e.stopPropagation();
      G.audio.unlock();
      const a = b.dataset.a;
      if (a === 'enter') enter();
      else if (a === 'delete') confirmDelete();
      else if (a === 'delete-yes') doDelete();
      else if (a === 'back') renderPanel();
      else if (a === 'create') startCreate();
      else if (a === 'create-ok') finishCreate();
      else if (a === 'create-cancel') cancelCreate();
      else if (b.dataset.sw) {
        const [key, k] = b.dataset.sw.split(':');
        creating.look[key] = (key === 'hair' ? HAIR_COLORS : OUTFIT_COLORS)[Number(k)];
        applyPlayerTint(creating.hero.rig, tintOf(creating.look));
        G.audio.play('click');
        paintSwatches();
      }
    });
    ui.create.querySelector('input').addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') finishCreate();
      if (e.key === 'Escape') cancelCreate();
    });

    // ---- picking seats in 3D
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), sph = new THREE.Sphere();
    const pick = (ev) => {
      ndc.set((ev.clientX / window.innerWidth) * 2 - 1, -(ev.clientY / window.innerHeight) * 2 + 1);
      ray.setFromCamera(ndc, S.camera);
      let best = -1, bd = Infinity;
      for (let i = 0; i < SLOT_COUNT; i++) {
        sph.center.set(SEATS[i].x, 0.85, SEATS[i].z); sph.radius = 0.8;
        const hit = ray.ray.intersectSphere(sph, new THREE.Vector3());
        if (hit) { const d = hit.distanceTo(ray.ray.origin); if (d < bd) { bd = d; best = i; } }
      }
      return best;
    };
    const canvas = engine.canvas;
    const onMove = (ev) => { hover = pick(ev); canvas.style.cursor = hover >= 0 ? 'pointer' : ''; };
    let lastClick = 0;
    const onClick = (ev) => {
      G.audio.unlock();
      const i = pick(ev);
      if (i < 0 || creating) return;
      const now = performance.now();
      if (i === selected && chars[i] && now - lastClick < 350) enter();
      lastClick = now;
      select(i);
    };
    const onKey = (e) => {
      if (creating || done) return;
      if (e.key === 'ArrowLeft') select((Math.max(0, selected) + SLOT_COUNT - 1) % SLOT_COUNT);
      else if (e.key === 'ArrowRight') select((selected + 1) % SLOT_COUNT);
      else if (e.key === 'Enter') { if (chars[selected]) enter(); else if (selected >= 0) startCreate(); }
    };
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('click', onClick);
    window.addEventListener('keydown', onKey);
    const cleanup = () => {
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('click', onClick);
      window.removeEventListener('keydown', onKey);
      canvas.style.cursor = '';
      ui.root.remove();
      S.dispose();
    };

    // ---- labels above the seats
    const tags = [];
    for (let i = 0; i < SLOT_COUNT; i++) {
      const el = document.createElement('div');
      el.className = 'cs-tag';
      ui.root.appendChild(el);
      tags.push(el);
    }
    const tmp = new THREE.Vector3();
    const updateTags = () => {
      for (let i = 0; i < SLOT_COUNT; i++) {
        const c = chars[i], el = tags[i];
        const html = c ? (c.preview ? `<b>${esc(ui.create.querySelector('input').value || 'New hero')}</b>` : `<b>${esc(c.data.name)}</b><i>Lv ${c.data.level || 1}</i>`) : '<b class="plus">+</b><i>Create</i>';
        if (el._html !== html) { el.innerHTML = html; el._html = html; }
        el.classList.toggle('sel', i === selected);
        el.classList.toggle('hov', i === hover);
        el.classList.toggle('empty', !c);
        const y = c ? (c.standK > 0.5 ? 2.05 : SEAT_H[SEATS[i].type] + 1.25) : 1.55;
        tmp.set(SEATS[i].x + (c ? c.fwd.x * c.standK * 0.5 : 0), y, SEATS[i].z + (c ? c.fwd.z * c.standK * 0.5 : 0)).project(S.camera);
        el.style.transform = `translate(${((tmp.x + 1) / 2) * window.innerWidth}px, ${((1 - tmp.y) / 2) * window.innerHeight}px) translate(-50%, -100%)`;
      }
    };

    select(chars[preselect] ? preselect : chars.findIndex(Boolean));
    if (selected < 0) select(0);

    const frame = (now) => {
      if (done) return;
      requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;
      bladeTime.value = t;
      const w = window.innerWidth, h = window.innerHeight;
      if (S.camera.aspect !== w / h) { S.camera.aspect = w / h; S.camera.updateProjectionMatrix(); }
      const sx = selected >= 0 ? SEATS[selected].x : 0;
      camX.pos += (sx * 0.18 - camX.pos) * (1 - Math.exp(-2.5 * dt));
      camX.look += (sx * 0.3 - camX.look) * (1 - Math.exp(-2.5 * dt));
      S.camera.position.set(CAM.x + camX.pos + Math.sin(t * 0.2) * 0.06, CAM.y + Math.sin(t * 0.27) * 0.03, CAM.z);
      S.camera.lookAt(LOOK.x + camX.look, LOOK.y, LOOK.z);
      if (camOverride) { S.camera.position.copy(camOverride[0]); S.camera.lookAt(camOverride[1]); }
      const selC = selected >= 0 ? chars[selected] : null;
      for (let i = 0; i < SLOT_COUNT; i++) {
        const c = chars[i];
        markers[i].visible = !c;
        markers[i].userData.update(t, i === hover || i === selected);
        if (c) updateHero(c, dt, selC && selC !== c ? selC : null);
      }
      S.circle.visible = !!selC;
      if (selC) {
        S.circle.position.set(selC.root.position.x, 0.02, selC.root.position.z);
        S.circle.rotation.z = t * 0.4;
        S.circle.material.opacity = 0.55 + 0.2 * Math.sin(t * 3);
        S.spot.position.set(selC.root.position.x, 5, selC.root.position.z + 1.5);
        S.spot.target.position.copy(selC.root.position);
      }
      S.update(dt, t, h * engine.renderer.getPixelRatio());
      engine.renderWith(S.scene, S.camera);
      updateTags();
      if (!shown) { shown = true; if (onShown) onShown(); fadeScreen(false, 500); }
    };
    requestAnimationFrame(frame);
  });
}

// ------------------------------------------------------------------ heroes on their seats
function sitPose(rig, seat) {
  const G_ = rig.legGeo;
  const ks = rig.hipY / 0.64;
  if (seat.pose === 'cross') {
    const p = fullPose(JSON.parse(JSON.stringify(P_SIT)));
    p.pos = [0, P_SIT.pos[1] + (SEAT_H.cushion - 0.02) / ks, 0];
    p.armR = [-0.55, 0, -0.2]; p.elbowR = [-0.9, 0, 0]; p.handR = [0.1, 0, 0];
    p.armL = [-0.55, 0, 0.2]; p.elbowL = [-0.9, 0, 0];
    return p;
  }
  const seatH = SEAT_H[seat.type];
  const hipJ = seatH + 0.075;                     // hip joint a little above the seat surface
  const p = fullPose({});
  p.pos = [0, (hipJ - (G_ ? G_.top : 0.85)) / ks, 0];
  // feet on the floor a bit in front of the knees
  const ik = G_ ? legIK(0.36, G_.ankle - hipJ, G_.thigh, G_.shin) : [-1.5, 1.5];
  p.legL = [ik[0], 0.08, 0.1]; p.kneeL = [ik[1], 0, 0]; p.footL = [-(ik[0] + ik[1]), 0, -0.05];
  p.legR = [ik[0], -0.08, -0.1]; p.kneeR = [ik[1], 0, 0]; p.footR = [-(ik[0] + ik[1]), 0, 0.05];
  p.spine = [0.06, 0, 0]; p.chest = [0.02, 0, 0]; p.head = [0.06, 0, 0];
  // hands resting on the thighs
  p.armL = [-0.55, 0, 0.14]; p.elbowL = [-0.75, 0, 0]; p.handL = [0.2, 0, 0];
  p.armR = [-0.55, 0, -0.14]; p.elbowR = [-0.75, 0, 0]; p.handR = [0.2, 0, 0];
  if (seat.pose === 'lean') {
    // leaning back on straight arms, legs stretched a little further
    p.spine = [-0.2, 0, 0]; p.chest = [-0.06, 0, 0]; p.head = [0.18, 0, 0];
    p.armL = [0.6, 0, 0.3]; p.elbowL = [-0.1, 0, 0]; p.handL = [-0.6, 0, 0];
    p.armR = [0.6, 0, -0.3]; p.elbowR = [-0.1, 0, 0]; p.handR = [-0.6, 0, 0];
    const ik2 = G_ ? legIK(0.5, G_.ankle - hipJ, G_.thigh, G_.shin) : [-1.5, 1.3];
    p.legL[0] = p.legR[0] = ik2[0]; p.kneeL[0] = p.kneeR[0] = ik2[1];
    p.footL[0] = p.footR[0] = -(ik2[0] + ik2[1]);
  } else if (seat.pose === 'chin') {
    // elbow on the knee, chin in the hand
    p.spine = [0.38, 0, 0]; p.chest = [0.12, 0, 0]; p.neck = [-0.1, 0, 0]; p.head = [-0.25, 0, 0];
    p.armR = [-0.9, 0.1, -0.05]; p.elbowR = [-2.2, 0, 0]; p.handR = [0.4, 0, 0];
    p.armL = [-0.75, 0, 0.2]; p.elbowL = [-1.0, 0, 0]; p.handL = [0.2, 0, 0];
  }
  return p;
}

function spawnHero(S, i, data) {
  const seat = SEATS[i];
  const f = createFighter(tintOf(data.look));
  const rig = f.rig, anim = f.anim;
  const root = f.root;
  applyOutfit(rig, data.equipment || STARTING.equipment, tintOf(data.look));   // visible armour on the terrace too
  const weaponId = (data.equipment && data.equipment.weapon) || STARTING.equipment.weapon;
  const dual = ITEMS[weaponId] && ITEMS[weaponId].weaponClass === 'dual';
  let blades = null;
  if (dual && dualBladesReady()) {
    blades = attachDualBlades(rig, ITEMS[weaponId].look);
    anim.setStyle('dual');
  }
  if (rig.weapon) rig.weapon.visible = false;
  const sit = sitPose(rig, seat);
  const stand = fullPose(JSON.parse(JSON.stringify(dual ? P_DUAL_IDLE : P_IDLE)));
  const pose = fullPose(JSON.parse(JSON.stringify(sit)));
  anim.idlePose = pose;
  anim.baseIdlePose = pose;
  const yaw = Math.atan2(CAM.x - seat.x, CAM.z - seat.z);
  root.rotation.y = yaw;
  // seated with the pelvis over the back half of the seat
  const fwd = V(Math.sin(yaw), 0, Math.cos(yaw));
  root.position.set(seat.x - fwd.x * 0.06, 0, seat.z - fwd.z * 0.06);
  S.scene.add(root);
  const c = { i, data, rig, anim, root, sit, standPose: stand, pose, fwd, yaw, seat, blades, weaponShown: true, standK: 0, stand: false, waveT: -1, idleT: 4 + Math.random() * 4, lookYaw: 0, preview: false };
  for (let k = 0; k < 20; k++) anim.update(0.02, root.position);
  setWeapons(c, false);
  return c;
}

function setWeapons(c, on) {
  if (c.weaponShown === on) return;
  c.weaponShown = on;
  if (c.blades) { c.blades.right.visible = c.blades.left.visible = on; }
  else if (c.rig.weapon) c.rig.weapon.visible = on;
}

const _tq = new THREE.Vector3();
function updateHero(c, dt, lookAt) {
  // stand up / sit down (pose blend + a step forward off the seat)
  c.standK = clamp(c.standK + (c.stand ? dt : -dt) / 0.55, 0, 1);
  const k = smooth(c.standK);
  for (const ch of CHANNELS) {
    const a = c.sit[ch], b = c.standPose[ch], o = c.pose[ch];
    o[0] = a[0] + (b[0] - a[0]) * k; o[1] = a[1] + (b[1] - a[1]) * k; o[2] = a[2] + (b[2] - a[2]) * k;
  }
  // seated heroes turn their heads towards the selected one
  let yawT = 0;
  if (lookAt && c.standK < 0.5) {
    _tq.subVectors(lookAt.root.position, c.root.position);
    let d = Math.atan2(_tq.x, _tq.z) - c.yaw;
    while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
    yawT = clamp(d, -0.7, 0.7);
  }
  c.lookYaw += (yawT - c.lookYaw) * (1 - Math.exp(-3 * dt));
  c.pose.head[1] += c.lookYaw * 0.7; c.pose.neck[1] += c.lookYaw * 0.3;
  const step = k * 0.5;
  c.root.position.set(c.seat.x + c.fwd.x * (step - 0.06), 0, c.seat.z + c.fwd.z * (step - 0.06));
  setWeapons(c, c.standK > 0.6);
  // a wave when picked, then now and then a little showpiece
  if (c.waveT >= 0) { c.waveT -= dt; if (c.waveT < 0 && c.standK > 0.9) { c.anim.play('wave'); c.waveT = -1; } else if (c.waveT < 0) c.waveT = 0.1; }
  if (c.standK >= 1 && !c.anim.busy) {
    c.idleT -= dt;
    if (c.idleT < 0) { c.anim.play(['flex', 'stretch', 'lookout', 'wave'][Math.floor(Math.random() * 4)]); c.idleT = 6 + Math.random() * 5; }
  }
  if (c.standK < 1 && c.anim.action && !c.stand) c.anim.stop();
  c.anim.update(dt, c.root.position);
}

// glowing ring + floating "+" over an empty seat
function makeEmptyMarker(S, i) {
  const seat = SEATS[i];
  const g = new THREE.Group();
  g.position.set(seat.x, 0, seat.z);
  const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 1.4, 2.0), transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 40).rotateX(-Math.PI / 2), ringMat);
  ring.position.y = SEAT_H[seat.type] + 0.02;
  g.add(ring);
  const plus = new THREE.Sprite(new THREE.SpriteMaterial({ map: plusTexture(), transparent: true, depthWrite: false, opacity: 0.75 }));
  plus.scale.set(0.42, 0.42, 1);
  g.add(plus);
  g.userData.update = (t, hot) => {
    plus.position.y = SEAT_H[seat.type] + 0.75 + Math.sin(t * 2 + i) * 0.06;
    plus.material.opacity = hot ? 1 : 0.6;
    const s = hot ? 0.52 : 0.42;
    plus.scale.set(s, s, 1);
    ringMat.opacity = (hot ? 0.8 : 0.35) + 0.15 * Math.sin(t * 3 + i);
  };
  S.scene.add(g);
  return g;
}
let plusTex = null;
function plusTexture() {
  if (plusTex) return plusTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 10, 64, 64, 62);
  grd.addColorStop(0, 'rgba(140,200,255,0.55)'); grd.addColorStop(1, 'rgba(140,200,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 5;
  g.beginPath(); g.arc(64, 64, 40, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 10; g.lineCap = 'round';
  g.beginPath(); g.moveTo(64, 44); g.lineTo(64, 84); g.moveTo(44, 64); g.lineTo(84, 64); g.stroke();
  plusTex = new THREE.CanvasTexture(c);
  plusTex.colorSpace = THREE.SRGBColorSpace;
  return plusTex;
}

// ------------------------------------------------------------------ the terrace
function buildTerrace(engine) {
  const scene = new THREE.Scene();
  scene.environment = engine.scene.environment;
  scene.environmentIntensity = 0.3;
  scene.fog = new THREE.Fog('#a37a98', 80, 560);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 2500);
  camera.position.copy(CAM);
  camera.lookAt(LOOK);

  const sunDir = V(-0.55, 0.1, -1).normalize();
  scene.add(skyDome({ top: '#1a2358', mid: '#5f519c', horizon: '#e8917a', glow: '#ffc890', sunDir }));
  scene.add(mountainLayer({ z: -420, width: 1500, base: -60, height: 150, color: '#8a74b0', haze: '#f3b39a', seed: 5, peaks: 8, snow: '#ffe8e4' }));
  scene.add(mountainLayer({ z: -260, width: 900, base: -50, height: 60, color: '#6a5d9c', haze: '#e5a6a4', seed: 13, peaks: 10 }));
  // sea of clouds below the terrace
  const clouds = [];
  for (let k = 0; k < 16; k++) {
    const x = (k % 8 - 3.5) * 70 + (k * 37 % 30), z = -60 - Math.floor(k / 8) * 110 - (k * 53 % 40);
    const s = cloud({ x, y: -18 - (k % 3) * 6, z, w: 90 + (k % 4) * 25, color: k % 2 ? '#ffd3c4' : '#f4c1c9', opacity: 0.9 });
    scene.add(s); clouds.push(s);
  }
  for (const [x, y, z, w] of [[-160, 70, -380, 140], [120, 90, -400, 160], [30, 50, -300, 90]]) { const s = cloud({ x, y, z, w, color: '#ffd9c8', opacity: 0.7 }); scene.add(s); clouds.push(s); }

  const hemi = new THREE.HemisphereLight('#ffd2c0', '#4a3a5a', 0.5);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffbd88', 1.8);
  sun.position.set(-6, 9, -6);
  sun.castShadow = engine.renderer.shadowMap.enabled;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 40 });
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight('#b8c6ff', 0.6);
  fill.position.set(3, 5, 10);
  scene.add(fill);
  const spot = new THREE.SpotLight('#fff0d8', 30, 12, 0.5, 0.6, 1.5);
  scene.add(spot, spot.target);

  // ---- terrace floor: stone tiles with a gold trim
  const floorTex = tileTexture();
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(7.5, 7.2, 0.6, 72), [
    mat('#8c7f78', { roughness: 0.9 }),
    new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.75 }),
    mat('#6c625e'),
  ]);
  floor.position.y = -0.3;
  floor.receiveShadow = true;
  scene.add(floor);
  const trim = new THREE.Mesh(new THREE.TorusGeometry(7.45, 0.08, 6, 96).rotateX(Math.PI / 2), mat('#d6b36a', { metalness: 0.6, roughness: 0.35 }));
  trim.position.y = 0.01;
  scene.add(trim);
  const inlay = new THREE.Mesh(new THREE.RingGeometry(2.3, 2.42, 64).rotateX(-Math.PI / 2), mat('#d6b36a', { metalness: 0.6, roughness: 0.35 }));
  inlay.position.set(0, 0.012, -0.6);
  scene.add(inlay);

  // ---- balustrade around the back half, pillars with lanterns
  const R = 7.15;
  const stoneW = mat('#e8ddd0', { roughness: 0.7 });
  const balGeo = new THREE.LatheGeometry([V(0.07, 0, 0), V(0.1, 0.06, 0), V(0.05, 0.16, 0), V(0.1, 0.38, 0), V(0.05, 0.6, 0), V(0.08, 0.68, 0), V(0.08, 0.72, 0), V(0, 0.72, 0)].map((p) => new THREE.Vector2(p.x, p.y)), 8);
  const a0 = Math.PI * 0.56, a1 = Math.PI * 1.44;
  const n = Math.floor(((a1 - a0) * R) / 0.3);
  const bal = new THREE.InstancedMesh(balGeo, stoneW, n);
  const m4 = new THREE.Matrix4();
  for (let k = 0; k < n; k++) {
    const a = a0 + ((a1 - a0) * (k + 0.5)) / n;
    m4.makeTranslation(Math.sin(a) * R, 0.08, Math.cos(a) * R);
    bal.setMatrixAt(k, m4);
  }
  bal.castShadow = true;
  scene.add(bal);
  const railGeo = new THREE.TorusGeometry(R, 0.1, 6, 80, a1 - a0);
  for (const y of [0.86, 0.06]) {
    const rail = new THREE.Mesh(railGeo, stoneW);
    rail.rotation.set(Math.PI / 2, 0, Math.PI / 2 - a1);
    rail.scale.set(1, 1, 0.55);
    rail.position.y = y;
    rail.castShadow = true;
    scene.add(rail);
  }
  const lanternGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.0, 0.8) });
  const pillarLights = [];
  for (let k = 0; k <= 4; k++) {
    const a = a0 + ((a1 - a0) * k) / 4;
    const px = Math.sin(a) * R, pz = Math.cos(a) * R;
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.1, 0.42).translate(0, 0.55, 0), stoneW);
    pillar.position.set(px, 0, pz);
    pillar.rotation.y = a;
    pillar.castShadow = true;
    scene.add(pillar);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.1, 0.52), stoneW);
    cap.position.set(px, 1.15, pz);
    cap.rotation.y = a;
    scene.add(cap);
    const lamp = new THREE.Group();
    lamp.position.set(px, 1.2, pz);
    lamp.add(blob(lanternGlow, 0.1, 0.14, 0.1, 0, 0.2, 0, true));
    const frameM = mat('#3a2a22', { roughness: 0.6, metalness: 0.4 });
    for (const [x, z] of [[-0.11, -0.11], [0.11, -0.11], [-0.11, 0.11], [0.11, 0.11]]) lamp.add(limb(frameM, V(x, 0, z), V(x, 0.4, z), 0.015, 0.015, 4));
    lamp.add(new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.16, 4).rotateY(Math.PI / 4).translate(0, 0.48, 0), frameM));
    scene.add(lamp);
    if (k === 0 || k === 4) { const pl = new THREE.PointLight('#ffb862', 6, 7, 1.6); pl.position.set(px, 1.5, pz); scene.add(pl); pillarLights.push(pl); }
  }

  // ---- string lights above the seats
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff' }), 34);
  const poleM = mat('#4a3528', { roughness: 0.8 });
  for (const sx of [-1, 1]) scene.add(limb(poleM, V(sx * 6.1, 0, -2.6), V(sx * 6.1, 3.7, -2.6), 0.06, 0.05));
  const wirePts = [];
  const bulbCols = ['#ffd58a', '#ffb3c8', '#bfe3ff', '#fff2b0'];
  const tc = new THREE.Color();
  for (let k = 0; k < 34; k++) {
    const u = k / 33, x = -6.1 + u * 12.2, y = 3.6 - Math.sin(u * Math.PI) * 0.75, z = -2.6 - Math.sin(u * Math.PI) * 0.4;
    m4.makeTranslation(x, y - 0.06, z);
    bulbs.setMatrixAt(k, m4);
    bulbs.setColorAt(k, tc.set(bulbCols[k % 4]).multiplyScalar(2.6));
    wirePts.push(V(x, y, z));
  }
  scene.add(bulbs);
  scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(wirePts), new THREE.LineBasicMaterial({ color: '#2a1e18' })));

  // ---- blossom tree on the left, pots on the right
  const tree = new THREE.Group();
  tree.position.set(-6.3, 0, -3.1);
  const bark = mat('#5d3d2c', { roughness: 0.95 });
  tree.add(limb(bark, V(0, 0, 0), V(0.3, 2.6, 0.1), 0.3, 0.18));
  tree.add(limb(bark, V(0.3, 2.4, 0.1), V(1.4, 3.6, 0.4), 0.15, 0.07));
  tree.add(limb(bark, V(0.25, 2.2, 0.1), V(-0.8, 3.5, -0.3), 0.14, 0.06));
  const pink1 = mat('#f4a6c4', { roughness: 0.85 }), pink2 = mat('#ffc4d8', { roughness: 0.85 }), pink3 = mat('#e9859f', { roughness: 0.85 });
  for (const [x, y, z, r, m] of [[0.3, 3.7, 0, 1.4, pink1], [1.5, 3.6, 0.5, 1.0, pink2], [-0.9, 3.6, -0.2, 1.05, pink3], [0.5, 4.5, 0.2, 0.95, pink2], [-0.3, 3.2, 0.8, 0.8, pink1], [1.2, 3.0, -0.4, 0.7, pink3]]) tree.add(blob(m, r, r * 0.8, r, x, y, z, true));
  scene.add(tree);
  const potM = mat('#b8643e', { roughness: 0.8 });
  for (const [x, z] of [[6.4, 1.2], [5.6, -3.4], [-6.6, 1.4]]) {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.25, 0.55, 12).translate(0, 0.275, 0), potM);
    pot.position.set(x, 0, z);
    pot.castShadow = true;
    scene.add(pot);
    scene.add(blob(mat('#4f8a3c'), 0.45, 0.45, 0.45, x, 0.85, z, true));
    for (let k = 0; k < 5; k++) scene.add(blob(mat(['#ffe066', '#ff8fb1', '#ffffff'][k % 3]), 0.07, 0.07, 0.07, x + Math.cos(k * 1.3) * 0.35, 1.0 + (k % 2) * 0.15, z + Math.sin(k * 1.3) * 0.35, true));
  }

  // ---- seats
  const wood = mat('#8a5a36', { roughness: 0.8 }), woodD = mat('#5e3b22', { roughness: 0.85 });
  const cushionMats = [mat('#b8323c', { roughness: 0.95 }), mat('#3d5fae', { roughness: 0.95 }), mat('#5d9448', { roughness: 0.95 }), mat('#d9a441', { roughness: 0.95 })];
  SEATS.forEach((s, i) => {
    const g = new THREE.Group();
    g.position.set(s.x, 0, s.z);
    g.rotation.y = Math.atan2(CAM.x - s.x, CAM.z - s.z);
    const cm = cushionMats[i % 4];
    if (s.type === 'chair') {
      for (const [x, z] of [[-0.22, -0.2], [0.22, -0.2], [-0.22, 0.2], [0.22, 0.2]]) g.add(limb(woodD, V(x, 0, z), V(x, 0.4, z), 0.035, 0.03, 6));
      const seatB = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.06, 0.52), wood); seatB.position.y = 0.41; g.add(seatB);
      g.add(blob(cm, 0.24, 0.035, 0.22, 0, 0.45, 0.01));
      for (const x of [-0.22, 0.22]) g.add(limb(woodD, V(x, 0.4, -0.23), V(x, 1.1, -0.28), 0.03, 0.03, 6));
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.36, 0.05), wood); back.position.set(0, 0.88, -0.27); back.rotation.x = -0.08; g.add(back);
    } else if (s.type === 'bench') {
      for (const x of [-0.45, 0.45]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.4, 0.4), stoneW); leg.position.set(x, 0.2, 0); g.add(leg); }
      const top = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.5), stoneW); top.position.y = 0.4; g.add(top);
      g.add(blob(cm, 0.55, 0.035, 0.21, 0, 0.45, 0));
    } else if (s.type === 'cushion') {
      g.add(blob(cm, 0.52, 0.09, 0.52, 0, 0.07, 0));
      g.add(blob(cushionMats[(i + 1) % 4], 0.2, 0.2, 0.08, -0.45, 0.2, -0.35));
      const rug = new THREE.Mesh(new THREE.CircleGeometry(0.85, 32).rotateX(-Math.PI / 2), mat('#6a2f4a', { roughness: 1 })); rug.position.y = 0.006; g.add(rug);
    } else if (s.type === 'barrel') {
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.5, 14).translate(0, 0.25, 0), wood); g.add(barrel);
      for (const y of [0.1, 0.4]) { const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.305, 0.015, 4, 20).rotateX(Math.PI / 2), mat('#444048', { metalness: 0.6, roughness: 0.4 })); hoop.position.y = y; g.add(hoop); }
      g.add(blob(cm, 0.26, 0.03, 0.26, 0, 0.52, 0));
    }
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    scene.add(g);
  });

  // ---- magic circle under the selected hero
  const circle = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.8), new THREE.MeshBasicMaterial({ map: runeTexture(), color: new THREE.Color(1.3, 1.6, 2.4), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  circle.rotation.x = -Math.PI / 2;
  scene.add(circle);

  // ---- drifting petals + rising sky lanterns
  const petals = new Particles(160, { additive: false, renderOrder: 5 });
  scene.add(petals.points);
  const lanterns = [];
  const lanternM = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 1.3, 0.5) });
  for (let k = 0; k < 9; k++) {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.4, 0.9, 8), lanternM);
    l.position.set((k - 4) * 22 + (k * 13 % 9), -20 + k * 7, -70 - (k * 29 % 60));
    scene.add(l);
    lanterns.push(l);
  }
  const petalCol = new THREE.Color('#ffc2d6');
  return {
    scene, camera, circle, spot,
    update(dt, t, pxH) {
      for (const c of clouds) { c.position.x += dt * 1.5; if (c.position.x > 320) c.position.x = -320; }
      for (const l of lanterns) { l.position.y += dt * 0.9; l.position.x += Math.sin(t * 0.3 + l.position.z) * dt * 0.3; if (l.position.y > 70) l.position.y = -30; }
      for (const pl of pillarLights) pl.intensity = 5.5 + Math.sin(t * 7 + pl.position.x) * 0.4;
      if (Math.random() < dt * 5) petals.emit({ pos: V(-6.3 + (Math.random() - 0.5) * 3, 4 + Math.random(), -3 + (Math.random() - 0.5) * 2), vel: V(0.5 + Math.random() * 0.6, -0.5, 0.4 + Math.random() * 0.4), life: 7, size: 0.07, size1: 0.07, c0: petalCol, c1: petalCol, alpha: 0.95, fadeIn: 0.05 });
      petals.update(dt, camera, pxH);
    },
    dispose() { disposeTree(scene); },
  };
}

function tileTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const g = c.getContext('2d');
  g.fillStyle = '#6f645e';
  g.fillRect(0, 0, 1024, 1024);
  let s = 11;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const n = 16, w = 1024 / n;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const l = 44 + r() * 12, hue = 22 + r() * 16;
      g.fillStyle = `hsl(${hue}, ${10 + r() * 8}%, ${l}%)`;
      const off = (y % 2) * w * 0.5;
      g.fillRect(((x * w + off) % 1024) + 3, y * w + 3, w - 6, w - 6);
      if (r() < 0.3) { g.fillStyle = 'rgba(80,70,60,0.12)'; g.beginPath(); g.arc(((x * w + off) % 1024) + r() * w, y * w + r() * w, 4 + r() * 10, 0, Math.PI * 2); g.fill(); }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  tex.anisotropy = 8;
  return tex;
}

function runeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.translate(256, 256);
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  g.lineWidth = 6;
  for (const rr of [240, 200, 120]) { g.beginPath(); g.arc(0, 0, rr, 0, Math.PI * 2); g.stroke(); }
  g.lineWidth = 4;
  g.beginPath();
  for (let k = 0; k <= 6; k++) { const a = (k / 6) * Math.PI * 2 * 2; const p = [Math.cos(a) * 200, Math.sin(a) * 200]; if (k === 0) g.moveTo(...p); else g.lineTo(...p); }
  g.stroke();
  g.beginPath();
  for (let k = 0; k <= 6; k++) { const a = (k / 6) * Math.PI * 2 * 2 + Math.PI / 6 * 2; const p = [Math.cos(a) * 200, Math.sin(a) * 200]; if (k === 0) g.moveTo(...p); else g.lineTo(...p); }
  g.stroke();
  g.font = 'bold 26px serif';
  g.fillStyle = 'rgba(255,255,255,0.9)';
  const runes = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ';
  for (let k = 0; k < 24; k++) {
    g.save(); g.rotate((k / 24) * Math.PI * 2); g.fillText(runes[k % runes.length], -8, -212); g.restore();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ------------------------------------------------------------------ HTML overlay
function buildUi() {
  const root = document.createElement('div');
  root.id = 'select-ui';
  root.innerHTML = `
    <div class="cs-top"><div class="cs-logo">${LOGO_SVG}</div><div class="cs-title">Choose your hero</div></div>
    <div class="cs-panel"></div>
    <div class="cs-create">
      <div class="cs-name">New hero</div>
      <label>Name<input maxlength="14" placeholder="Your name" spellcheck="false"></label>
      <div class="cs-lbl">Hair</div><div class="cs-swatches cs-hair"></div>
      <div class="cs-lbl">Outfit</div><div class="cs-swatches cs-outfit"></div>
      <div class="cs-sub">Class: Fighter</div>
      <div class="cs-btns"><button class="cs-btn gold" data-a="create-ok">Create</button><button class="cs-btn" data-a="create-cancel">Cancel</button></div>
    </div>
    <div class="cs-help">Click a seat · ← → to switch · Enter to play</div>`;
  document.body.appendChild(root);
  return { root, panel: root.querySelector('.cs-panel'), create: root.querySelector('.cs-create') };
}
function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// Cumbot 9000 — model. The user's static /models/cumbot.glb (a Santa mech with a lime slime tank on its back and
// fur-trimmed cannon cuffs) is rigged at preload like the imp: a skeleton from a hand-measured joint table, skin
// weights from distance-to-bone segments with a steep falloff (it is a robot: parts stay rigid) plus region rules by
// position and texture colour (grey metal arms, white fur, the lime tank). The bones are animated procedurally:
// idle, a heavy stomping walk and the boss actions (see ACTIONS) that the AI in cumbot.js plays.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { MonsterBase, Spring, track, ease, seg, bump, clamp, lerp, smoothstep, envTexture, TAU } from '../monsters/common.js';
import { tex } from '../../core/textures.js';

const BASE = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '/';
const MODEL_URL = BASE + 'models/cumbot.glb';
export const GAME_HEIGHT = 5.2;

// Joint positions in raw model space (feet at y = -0.945, facing +Z, the mech's left side = +X)
const J = {
  hips: [0, -0.2, 0.17], spine: [0, 0.0, 0.14], chest: [0, 0.24, 0.1], neck: [0, 0.44, 0.18],
  head: [0, 0.52, 0.24], headEnd: [0, 0.8, 0.28],
  tank: [0.02, 0.18, -0.24], tankEnd: [0.03, 0.92, -0.3],
  shoulderL: [0.5, 0.37, 0.03], elbowL: [0.65, 0.12, -0.02], handL: [0.73, -0.15, 0.08], handLEnd: [0.75, -0.26, 0.17],
  shoulderR: [-0.5, 0.37, 0.03], elbowR: [-0.65, 0.12, -0.02], handR: [-0.73, -0.15, 0.08], handREnd: [-0.75, -0.26, 0.17],
  thighL: [0.22, -0.3, 0.19], kneeL: [0.27, -0.55, 0.19], ankleL: [0.31, -0.8, 0.19], toeL: [0.32, -0.89, 0.45],
  thighR: [-0.22, -0.3, 0.19], kneeR: [-0.27, -0.55, 0.19], ankleR: [-0.31, -0.8, 0.19], toeR: [-0.32, -0.89, 0.45],
};
const ROOT = [0, -0.945, 0.17];
const PARENT = {
  hips: 'root', spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck', tank: 'chest',
  shoulderL: 'chest', elbowL: 'shoulderL', handL: 'elbowL', shoulderR: 'chest', elbowR: 'shoulderR', handR: 'elbowR',
  thighL: 'hips', kneeL: 'thighL', ankleL: 'kneeL', thighR: 'hips', kneeR: 'thighR', ankleR: 'kneeR',
};
export const RIG = { J, PARENT };
const SEG = {
  hips: [['hips', 'spine'], ['hips', 'thighL'], ['hips', 'thighR']],
  spine: [['spine', 'chest']],
  chest: [['chest', 'neck'], ['chest', 'shoulderL'], ['chest', 'shoulderR']],
  neck: [['neck', 'head']], head: [['head', 'headEnd']],
  shoulderL: [['shoulderL', 'elbowL']], elbowL: [['elbowL', 'handL']], handL: [['handL', 'handLEnd']],
  shoulderR: [['shoulderR', 'elbowR']], elbowR: [['elbowR', 'handR']], handR: [['handR', 'handREnd']],
  thighL: [['thighL', 'kneeL']], kneeL: [['kneeL', 'ankleL']], ankleL: [['ankleL', 'toeL']],
  thighR: [['thighR', 'kneeR']], kneeR: [['kneeR', 'ankleR']], ankleR: [['ankleR', 'toeR']],
};
const BONES = ['root', ...Object.keys(PARENT)];

// ------------------------------------------------------------------ boss actions (durations + event times, seconds)
export const ACTIONS = {
  intro: { dur: 2.6 },                                   // "HO HO HO" belly laugh when the fight starts
  punchL: { dur: 1.45, hit: 0.7 }, punchR: { dur: 1.45, hit: 0.7 },   // overhead cuff hammer, one arm
  slam: { dur: 2.1, hit: 1.15 },                         // both cuffs smash the ground in front
  mortar: { dur: 3.4, shots: [1.0, 1.55, 2.1] },         // the slime tank lobs three volleys
  beam: { dur: 3.9, fire: 1.9, end: 3.4 },               // hypno cannon: charge, fire, recover
  stomp: { dur: 3.1, land: 1.75 },                       // jump and quake
  summon: { dur: 2.6, pulse: 1.15 },                     // hypnotic call for the rat-men
};

// ------------------------------------------------------------------ skinning
// colour classes from the base colour texture (sRGB 0..1)
function classify(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), sat = mx > 0.01 ? (mx - mn) / mx : 0;
  if (g > 0.5 && r > 0.3 && b < g * 0.55 && g > r) return 'lime';
  if (sat < 0.16 && mx > 0.78) return 'white';
  if (sat < 0.2 && mx > 0.18) return 'grey';
  return 'other';
}

function computeSkin(pos, uv, pixels) {
  const n = pos.count;
  const B = BONES.length;
  const bi = (name) => BONES.indexOf(name);
  const segs = [];
  for (const [bone, list] of Object.entries(SEG)) for (const [a, b] of list) segs.push([bi(bone), ...J[a], ...J[b]]);
  const skinIndex = new Uint16Array(n * 4), skinWeight = new Float32Array(n * 4), tank = new Float32Array(n);
  const dist = new Float32Array(B), w = new Float32Array(B);
  const ARM = { L: ['shoulderL', 'elbowL', 'handL'].map(bi), R: ['shoulderR', 'elbowR', 'handR'].map(bi) };
  const LEG = { L: ['thighL', 'kneeL', 'ankleL'].map(bi), R: ['thighR', 'kneeR', 'ankleR'].map(bi) };
  const HIPS = bi('hips'), HEAD = bi('head'), TANK = bi('tank'), CHEST = bi('chest');
  const TORSO = ['hips', 'spine', 'chest', 'neck', 'head'].map(bi);
  const S = pixels ? pixels.size : 0;
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    let cls = 'other';
    if (pixels && uv) {
      const px = Math.min(S - 1, Math.max(0, Math.floor(uv.getX(i) * S))), py = Math.min(S - 1, Math.max(0, Math.floor(uv.getY(i) * S)));
      const k = (py * S + px) * 4, d = pixels.data;
      cls = classify(d[k] / 255, d[k + 1] / 255, d[k + 2] / 255);
    }
    w.fill(0);
    // the slime tank on the back: rigid on its own bone
    if (cls === 'lime' && z < 0.02 && y > 0.0) { tank[i] = 1; skinIndex[i * 4] = TANK; skinWeight[i * 4] = 1; continue; }
    dist.fill(1e9);
    for (const s of segs) {
      const ax = s[1], ay = s[2], az = s[3], dx = s[4] - ax, dy = s[5] - ay, dz = s[6] - az;
      let t = ((x - ax) * dx + (y - ay) * dy + (z - az) * dz) / (dx * dx + dy * dy + dz * dz);
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const dd = Math.hypot(x - ax - dx * t, y - ay - dy * t, z - az - dz * t);
      if (dd < dist[s[0]]) dist[s[0]] = dd;
    }
    for (let b = 1; b < B; b++) if (b !== TANK) w[b] = dist[b] > 1e8 ? 0 : 1 / Math.pow(dist[b] + 0.015, 6);
    const side = x >= 0 ? 'L' : 'R', other = x >= 0 ? 'R' : 'L';
    for (const k of ARM[other]) w[k] = 0;
    for (const k of LEG[other]) w[k] = 0;
    const ax = Math.abs(x);
    // arms: grey metal / fur cuff outside the torso; the shoulder pads (red, spiked) stay on the chest
    const armZone = (ax > 0.56) || (ax > 0.44 && y < 0.36 && cls !== 'other');
    if (!armZone) for (const k of ARM[side]) w[k] = 0;
    else for (const k of TORSO) w[k] *= ax > 0.6 ? 0 : 0.05;
    // legs: below the coat hem (the white fur hem itself stays on the hips)
    const legZone = y < -0.42 || (y < -0.3 && cls === 'grey');
    if (!legZone) for (const k of LEG[side]) w[k] = 0;
    else { for (const k of TORSO) w[k] = 0; }
    // beard and hat move with the head (the spikes on the shoulder pads are just as high, but further out)
    const beard = cls === 'white' && z > 0.26 && ax < 0.24 && y > 0.1;
    if (beard || (y > 0.56 && ax < 0.3)) { w.fill(0); w[HEAD] = 1; }
    // the fur cuff around the cannon is one rigid piece with the hand
    const hj = J['hand' + side];
    if (armZone && Math.hypot(x - hj[0], y - hj[1], z - hj[2]) < 0.17) { w.fill(0); w[bi('hand' + side)] = 1; }
    if (y < -0.1 && !legZone && ax < 0.5) { /* coat skirt: hips only */ for (const k of TORSO) if (k !== HIPS) w[k] *= 0.1; }
    // top 4
    let sum = 0;
    for (let k = 0; k < 4; k++) {
      let best = -1, bw = 0;
      for (let b = 0; b < B; b++) if (w[b] > bw) { bw = w[b]; best = b; }
      if (best < 0) { skinIndex[i * 4 + k] = k === 0 ? CHEST : 0; skinWeight[i * 4 + k] = k === 0 ? 1 : 0; if (k === 0) sum = 1; continue; }
      skinIndex[i * 4 + k] = best; skinWeight[i * 4 + k] = bw; sum += bw; w[best] = 0;
    }
    for (let k = 0; k < 4; k++) skinWeight[i * 4 + k] /= sum || 1;
  }
  return { skinIndex, skinWeight, tank };
}

// read the base colour texture back into pixels (downscaled) for the colour rules
function texturePixels(image, size = 512) {
  if (!image) return null;
  try {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(image, 0, 0, size, size);
    return { size, data: g.getImageData(0, 0, size, size).data };
  } catch (e) { console.warn('cumbot texture read', e); return null; }
}

// ------------------------------------------------------------------ template
let template = null;
let loading = null;
export function cumbotReady() { return !!template; }
export function preloadCumbot() {
  if (template) return Promise.resolve(template);
  if (loading) return loading;
  loading = new GLTFLoader().loadAsync(MODEL_URL).then((gltf) => {
    let src = null;
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((o) => { if (!src && o.isMesh) src = o; });
    if (!src) throw new Error('cumbot.glb: no mesh');
    const geo = src.geometry.clone();
    geo.applyMatrix4(src.matrixWorld);
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    const s = GAME_HEIGHT / (bb.max.y - bb.min.y), y0 = bb.min.y;
    const pixels = texturePixels(src.material.map && src.material.map.image);
    const { skinIndex, skinWeight, tank } = computeSkin(geo.attributes.position, geo.attributes.uv, pixels);
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
    geo.setAttribute('aTank', new THREE.Float32BufferAttribute(tank, 1));
    geo.translate(0, -y0, 0);
    geo.scale(s, s, s);
    const toGame = (p) => new THREE.Vector3(p[0] * s, (p[1] - y0) * s, p[2] * s);
    const bones = {};
    const list = [];
    for (const name of BONES) { const b = new THREE.Bone(); b.name = name; bones[name] = b; list.push(b); }
    bones.root.position.copy(toGame(ROOT));
    for (const name of BONES) {
      if (name === 'root') continue;
      const p = PARENT[name];
      bones[name].position.copy(toGame(J[name]).sub(toGame(p === 'root' ? ROOT : J[p])));
      bones[p].add(bones[name]);
    }
    // sockets: points the AI needs in world space (muzzles, tank top, eyes)
    const socket = (bone, p, name) => { const o = new THREE.Object3D(); o.name = name; o.position.copy(toGame(p).sub(toGame(J[bone]))); bones[bone].add(o); };
    socket('handL', J.handLEnd, 'muzzleL');
    socket('handR', J.handREnd, 'muzzleR');
    socket('tank', J.tankEnd, 'tankTop');
    socket('head', [0.05, 0.585, 0.37], 'eyeL');
    socket('head', [-0.05, 0.585, 0.37], 'eyeR');
    const mat = src.material.clone();
    mat.envMap = envTexture();
    mat.envMapIntensity = 0.6;
    const mesh = new THREE.SkinnedMesh(geo, mat);
    mesh.name = 'cumbot';
    mesh.add(bones.root);
    mesh.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton(list));
    const group = new THREE.Group();
    group.add(mesh);
    template = { group, material: mat, scale: s, tris: geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3 };
    return template;
  });
  return loading;
}

// tank glow: emissive where the aTank attribute is set (plus the rim shader MonsterBase adds)
function patchTankGlow(mat, uniform) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = function (sh, r) {
    if (prev) prev.call(this, sh, r);
    sh.uniforms.uTankGlow = uniform;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aTank;\nvarying float vTank;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTank = aTank;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTankGlow;\nvarying float vTank;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vTank * uTankGlow;');
  };
  mat.customProgramCacheKey = () => 'cumbot-v1';
}

// soft additive glow sprite
function glowSprite(color, size) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex('glow'), color: new THREE.Color(color), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
  s.scale.setScalar(size);
  s.renderOrder = 6;
  return s;
}

// ------------------------------------------------------------------ model
export class CumbotModel extends MonsterBase {
  constructor(type, opts) {
    super(type, opts);
    const T = template;
    if (!T) throw new Error('Cumbot model not loaded yet — await preloadCumbot() first');
    this.height = GAME_HEIGHT; this.radius = 1.6; this.headY = GAME_HEIGHT * 0.86;
    this.collapseDur = 16; this.fadeDur = 2.5;          // shuts down, stays slumped for a while, then fades
    this.lingerTime = this.collapseDur;                  // (monsters.js removes the body only after linger + fade)
    this.impactTime = ACTIONS.punchR.hit; this.attackDur = ACTIONS.punchR.dur;
    this.tankGlow = { value: 0.15 };
    const mat = this.inst(T.material, { rim: ['#ffe8f0', 0.18, 2.6] });
    patchTankGlow(mat, this.tankGlow);
    this.mover = new THREE.Group();
    this.root.add(this.mover);
    const obj = SkeletonUtils.clone(T.group);
    this.mover.add(obj);
    obj.traverse((o) => {
      if (o.isSkinnedMesh) {
        o.material = mat;
        o.castShadow = true;
        o.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, GAME_HEIGHT * 0.5, 0), GAME_HEIGHT * 0.8);
        this.skinned = o;
      }
    });
    this.b = {};
    for (const bone of this.skinned.skeleton.bones) { this.b[bone.name] = bone; bone.userData.base = bone.position.clone(); }
    this.sock = {};
    this.skinned.traverse((o) => { if (['muzzleL', 'muzzleR', 'tankTop', 'eyeL', 'eyeR'].includes(o.name)) this.sock[o.name] = o; });
    // glows: pink eyes and cuffs (hypno cannon), lime tank
    this.eyeGlow = [glowSprite('#ff4ad8', 1.1), glowSprite('#ff4ad8', 1.1)];
    this.sock.eyeL.add(this.eyeGlow[0]); this.sock.eyeR.add(this.eyeGlow[1]);
    this.cuffGlow = [glowSprite('#ff5ae0', 2.4), glowSprite('#ff5ae0', 2.4)];
    this.sock.muzzleL.add(this.cuffGlow[0]); this.sock.muzzleR.add(this.cuffGlow[1]);
    this.tankSprite = glowSprite('#9dff4a', 3.2);
    this.sock.tankTop.add(this.tankSprite);
    this.tankSprite.position.y = -0.9;

    this.act = null; this.actT = 0;       // current boss action (name) + time
    this.phase = 0; this.lastStepPh = 0;
    this.onStep = null;                   // callback(side) on each heavy footfall
    this.look = new Spring(30, 8); this._lookT = 0; this._lookTarget = 0;
    this.tankSpring = new Spring(70, 5);
    this.bodySpring = new Spring(90, 9);
    this.hitSpring = new Spring(120, 10);
    this.prevY = 0;
    this.eyes = 0; this.cuffs = 0;        // glow levels (set by actions)
    this.animate(0);
    this._applyMaterials();
  }

  play(name) { this.act = name; this.actT = 0; }
  stopAction() { this.act = null; }
  hit() {
    if (this.deathT >= 0) return;
    this.flash = 1;
    this.hitSpring.kick(-2.2);
  }
  socketWorld(name, out = new THREE.Vector3()) {
    this.root.updateMatrixWorld(true);
    return this.sock[name].getWorldPosition(out);
  }

  dispose() {
    this.skinned?.skeleton?.dispose();
    for (const s of [...this.eyeGlow, ...this.cuffGlow, this.tankSprite]) s.material.dispose();
    super.dispose();
  }

  animate(dt) {
    const b = this.b, t = this.t;
    const dying = this.deathT >= 0;
    const act = dying ? null : this.act;
    if (act) { this.actT += dt; if (this.actT >= ACTIONS[act].dur) { this.act = null; } }
    const at = this.actT;
    const a = smoothstep(0.02, 0.4, this.move) * (dying || act ? 0 : 1);
    const idle = 1 - a;

    const P = {
      y: 0, z: 0, hipsP: 0, hipsY: 0, hipsR: 0, spineP: 0, chestP: 0, chestY: 0, chestR: 0,
      neckP: 0, headP: 0, headY: 0, headR: 0, tankP: 0, tankR: 0,
      shL: 0, outL: 0, elL: 0, hdL: 0, shR: 0, outR: 0, elR: 0, hdR: 0,
      thL: 0, knL: 0, anL: 0, thR: 0, knR: 0, anR: 0, legOutL: 0, legOutR: 0,
    };
    let eyes = 0, cuffs = 0, tankGlow = 0.12 + 0.05 * Math.sin(t * 2.2);

    // --- idle: heavy breathing, weight shift, looking around, tank sloshing
    const br = Math.sin(t * 1.5);
    P.chestP += 0.025 * br; P.y += 0.02 * br;
    P.shL += 0.03 * br; P.shR += 0.03 * br;
    P.outL += 0.12 + 0.02 * br; P.outR += 0.12 + 0.02 * br;
    P.elL -= 0.25; P.elR -= 0.25;
    const shift = Math.sin(t * 0.55);
    P.hipsR += 0.035 * shift * idle; P.chestR -= 0.025 * shift * idle;
    P.legOutL -= 0.03 * shift * idle; P.legOutR -= 0.03 * shift * idle;
    this._lookT -= dt;
    if (this._lookT <= 0) { this._lookT = 1.5 + Math.random() * 3; this._lookTarget = (Math.random() - 0.5) * 0.8; }
    P.headY += this.look.step(this._lookTarget * idle * (act ? 0 : 1), dt);
    P.tankR += 0.025 * Math.sin(t * 1.1);

    // --- walk: heavy mech stomp
    const freq = 0.85;
    const prevPh = this.phase;
    if (a > 0.01) this.phase += dt * freq * TAU;
    const ph = this.phase;
    if (a > 0.3 && Math.floor((prevPh + Math.PI / 2) / Math.PI) !== Math.floor((ph + Math.PI / 2) / Math.PI)) {
      this.onStep?.(Math.floor((ph + Math.PI / 2) / Math.PI) % 2 ? 'L' : 'R');
      this.bodySpring.kick(-1.2);
    }
    if (a > 0) {
      const s = Math.sin(ph), c = Math.cos(ph);
      P.thL += -0.45 * a * s; P.thR += 0.45 * a * s;
      P.knL += 0.7 * a * Math.max(0, c); P.knR += 0.7 * a * Math.max(0, -c);
      P.y += (0.12 * (1 - Math.abs(s)) - 0.06) * a;      // lowest with the legs spread (footfall)
      P.hipsY += 0.12 * a * s; P.chestY -= 0.16 * a * s;
      P.hipsR += 0.06 * a * c; P.chestR -= 0.04 * a * c;
      P.spineP += 0.08 * a; P.headP -= 0.06 * a;
      P.shL += 0.4 * a * s; P.shR -= 0.4 * a * s;
      P.elL -= 0.2 * a * (0.5 + 0.5 * s); P.elR -= 0.2 * a * (0.5 - 0.5 * s);
    }

    // --- boss actions
    if (act) {
      const A = ACTIONS[act];
      if (act === 'punchL' || act === 'punchR') {
        const L = act === 'punchL';
        const sh = track([[0, 0], [0.5, -2.5, ease.outQuad], [0.6, -2.6], [A.hit, -0.95, ease.inCubic], [0.95, -0.85], [A.dur, 0]])(at);
        const el = track([[0, -0.25], [0.5, -1.3], [A.hit, -0.15, ease.inQuad], [0.95, -0.2], [A.dur, -0.25]])(at);
        const out = track([[0, 0.12], [0.5, 0.35], [A.hit, 0.05], [A.dur, 0.12]])(at);
        // the striking shoulder winds back, then drives forward (+yaw brings the right shoulder forward)
        const twist = track([[0, 0], [0.5, -0.35, ease.outQuad], [A.hit, 0.3, ease.inCubic], [0.95, 0.25], [A.dur, 0]])(at) * (L ? -1 : 1);
        const lean = track([[0, 0], [0.5, -0.15], [A.hit, 0.32, ease.inCubic], [0.95, 0.28], [A.dur, 0]])(at);
        if (L) { P.shL += sh; P.elL += el + 0.25; P.outL += out - 0.12; } else { P.shR += sh; P.elR += el + 0.25; P.outR += out - 0.12; }
        P.chestY += twist; P.hipsY += twist * 0.35;
        P.spineP += lean * 0.6; P.chestP += lean * 0.5; P.headP -= lean * 0.5;
        P.z += track([[0, 0], [0.5, -0.1], [A.hit, 0.45, ease.inQuad], [1.0, 0.4], [A.dur, 0]])(at);
        const cr = track([[0, 0], [0.5, 0.03], [A.hit, 0.2], [1.0, 0.15], [A.dur, 0]])(at);
        P.y -= cr; P.knL += cr * 2.2; P.knR += cr * 2.2; P.thL -= cr * 1.1; P.thR -= cr * 1.1;
        (L ? (P.shR += 0.4 * bump(at, 0.1, 1.1)) : (P.shL += 0.4 * bump(at, 0.1, 1.1)));
      } else if (act === 'slam') {
        const sh = track([[0, 0], [0.75, -2.75, ease.outQuad], [0.9, -2.85], [A.hit, -0.7, ease.inCubic], [1.5, -0.6], [A.dur, 0]])(at);
        const el = track([[0, -0.25], [0.75, -1.0], [A.hit, -0.05, ease.inQuad], [A.dur, -0.25]])(at);
        const out = track([[0, 0.12], [0.75, 0.3], [A.hit, -0.12], [1.5, -0.1], [A.dur, 0.12]])(at);
        P.shL += sh; P.shR += sh; P.elL += el + 0.25; P.elR += el + 0.25; P.outL += out - 0.12; P.outR += out - 0.12;
        const lean = track([[0, 0], [0.75, -0.3], [0.9, -0.35], [A.hit, 0.5, ease.inCubic], [1.5, 0.42], [A.dur, 0]])(at);
        P.spineP += lean * 0.55; P.chestP += lean * 0.5; P.headP -= lean * 0.45;
        P.y += track([[0, 0], [0.75, 0.2], [0.9, 0.25], [A.hit, -0.55, ease.inQuad], [1.6, -0.45], [A.dur, 0]])(at);
        const kn = track([[0, 0], [0.75, 0], [A.hit, 0.6, ease.inQuad], [1.6, 0.5], [A.dur, 0]])(at);
        P.knL += kn * 1.4; P.knR += kn * 1.4; P.thL -= kn * 0.8; P.thR -= kn * 0.8;
        P.z += track([[0, 0], [0.75, -0.2], [A.hit, 0.5], [A.dur, 0]])(at);
        P.tankP += 0.3 * bump(at, A.hit - 0.05, A.hit + 0.5);
      } else if (act === 'mortar') {
        // brace, lean forward so the tank points up and back, pump three volleys
        const brace = smoothstep(0, 0.6, at) * (1 - smoothstep(A.dur - 0.6, A.dur, at));
        P.spineP += 0.3 * brace; P.chestP += 0.25 * brace; P.headP -= 0.35 * brace;
        P.knL += 0.5 * brace; P.knR += 0.5 * brace; P.thL -= 0.3 * brace; P.thR -= 0.3 * brace; P.y -= 0.2 * brace;
        P.outL += 0.45 * brace; P.outR += 0.45 * brace; P.shL -= 0.3 * brace; P.shR -= 0.3 * brace; P.elL -= 0.6 * brace; P.elR -= 0.6 * brace;
        P.legOutL += 0.08 * brace; P.legOutR += 0.08 * brace;
        let kick = 0;
        for (const s of A.shots) kick += bump(at, s - 0.02, s + 0.3) * (at > s ? 1 : 0.3);
        P.tankP -= 0.25 * kick; P.y -= 0.12 * kick; P.chestP += 0.08 * kick;
        P.tankR += 0.05 * Math.sin(at * 22) * brace;
        tankGlow = 0.2 + 1.3 * brace * (0.6 + 0.4 * Math.sin(at * 14)) + kick * 1.5;
      } else if (act === 'beam') {
        // arms up to point both cannon cuffs forward, charge (eyes + cuffs glow), fire with recoil
        const aim = smoothstep(0.1, 0.8, at) * (1 - smoothstep(A.end, A.dur, at));
        P.shL -= 1.45 * aim; P.shR -= 1.45 * aim; P.elL += 0.15 * aim; P.elR += 0.15 * aim;
        P.outL -= 0.05 * aim; P.outR -= 0.05 * aim;
        P.hdL -= 0.25 * aim; P.hdR -= 0.25 * aim;
        const charge = smoothstep(0.3, A.fire, at) * (at < A.fire ? 1 : 0);
        const firing = at >= A.fire && at < A.end ? 1 : 0;
        const tremble = (charge * 0.5 + firing) * 0.03;
        P.shL += Math.sin(at * 53) * tremble; P.shR += Math.sin(at * 47 + 1) * tremble;
        P.chestP -= 0.12 * charge + 0.08 * firing; P.headP += 0.15 * aim;
        P.y += 0.06 * charge - 0.05 * firing;
        P.knL += 0.25 * aim; P.knR += 0.25 * aim; P.thL -= 0.12 * aim; P.thR -= 0.12 * aim;
        P.thL -= 0.2 * aim; P.thR += 0.15 * aim;       // wide braced stance
        P.z -= 0.25 * firing * (0.8 + 0.2 * Math.sin(at * 30));
        eyes = Math.max(charge, firing);
        cuffs = charge * (0.5 + 0.5 * charge) + firing * (0.85 + 0.15 * Math.sin(at * 40));
      } else if (act === 'stomp') {
        // crouch (bells jingling), jump, land with a quake
        const crouch = track([[0, 0], [1.1, 1, ease.outQuad], [1.2, 1], [1.3, -0.3, ease.outQuad], [A.land - 0.05, -0.1], [A.land, 1.1, ease.outQuad], [2.3, 0.8], [A.dur, 0]])(at);
        const air = at > 1.28 && at < A.land ? Math.sin(((at - 1.28) / (A.land - 1.28)) * Math.PI) : 0;
        P.y += -0.55 * Math.max(0, crouch) + 1.9 * air;
        P.knL += 1.0 * Math.max(0, crouch) + 0.7 * air; P.knR += 1.0 * Math.max(0, crouch) + 0.7 * air;
        P.thL -= 0.6 * Math.max(0, crouch) + 0.4 * air; P.thR -= 0.6 * Math.max(0, crouch) + 0.4 * air;
        P.anL += 0.2 * crouch; P.anR += 0.2 * crouch;
        const arms = track([[0, 0], [1.1, -2.4], [1.3, -2.9], [A.land, -1.1, ease.inQuad], [2.4, -0.6], [A.dur, 0]])(at);
        P.shL += arms; P.shR += arms; P.outL += 0.5 * bump(at, 0, A.dur); P.outR += 0.5 * bump(at, 0, A.dur);
        P.elL -= 0.7 * bump(at, 0, 1.4); P.elR -= 0.7 * bump(at, 0, 1.4);
        const shake = bump(at, 0.1, 1.2) * 0.06;
        P.chestR += Math.sin(at * 38) * shake; P.headR += Math.sin(at * 31) * shake;
        P.spineP += 0.3 * Math.max(0, crouch) - 0.15 * air; P.headP -= 0.2 * Math.max(0, crouch);
        P.tankP += 0.35 * bump(at, A.land - 0.05, A.land + 0.6);
        tankGlow += 0.4 * bump(at, 0, A.land);
      } else if (act === 'summon') {
        const up = smoothstep(0.1, 0.8, at) * (1 - smoothstep(A.dur - 0.5, A.dur, at));
        P.shL -= 2.6 * up; P.shR -= 2.6 * up; P.outL += 0.55 * up; P.outR += 0.55 * up; P.elL += 0.1 * up; P.elR += 0.1 * up;
        P.headP -= 0.55 * up; P.chestP -= 0.25 * up; P.spineP -= 0.1 * up;
        const tr = bump(at, 0.8, 2.2) * 0.04;
        P.shL += Math.sin(at * 45) * tr; P.shR += Math.sin(at * 41) * tr; P.headR += Math.sin(at * 23) * tr;
        eyes = bump(at, 0.5, 2.3); cuffs = bump(at, 0.8, 2.0) * 0.7;
      } else if (act === 'intro') {
        // "HO HO HO!": hands on the belly, three big laughs
        const on = smoothstep(0, 0.4, at) * (1 - smoothstep(A.dur - 0.4, A.dur, at));
        P.shL -= 0.55 * on; P.shR -= 0.55 * on; P.elL -= 1.25 * on; P.elR -= 1.25 * on; P.outL -= 0.1 * on; P.outR -= 0.1 * on;
        const ho = Math.max(0, Math.sin(Math.max(0, at - 0.35) * Math.PI * 2 / 0.62)) * on;
        P.y += 0.12 * ho; P.chestP -= 0.2 * on + 0.12 * ho; P.headP -= 0.35 * on + 0.15 * ho;
        P.hipsP -= 0.05 * on; P.tankP -= 0.1 * ho;
        eyes = 0.35 * on;
      }
    }

    // --- hit flinch (additive, never interrupts an action)
    const hs = this.hitSpring.step(0, dt);
    P.chestP += hs * 0.08; P.headP += hs * 0.1;

    // --- death: sparks are spawned by the AI; here: stagger, kneel, slump, power down
    if (dying) {
      const d = this.deathT;
      const stag = track([[0, 0], [0.25, 1, ease.outQuad], [0.7, 0.6], [1.2, 0]])(d);
      P.chestP -= 0.35 * stag; P.headP -= 0.5 * stag; P.shL -= 0.6 * stag; P.shR -= 0.8 * stag; P.outL += 0.5 * stag; P.outR += 0.6 * stag;
      P.z -= 0.35 * stag;
      const kneel = track([[0, 0], [0.6, 0], [1.5, 1, ease.inQuad], [1.65, 0.93, ease.outQuad], [1.8, 1]])(d);
      P.y -= 1.45 * kneel;
      P.thL -= 1.35 * kneel; P.knL += 2.5 * kneel; P.anL -= 0.9 * kneel;
      P.thR -= 1.2 * kneel; P.knR += 2.45 * kneel; P.anR -= 0.9 * kneel;
      P.legOutL += 0.12 * kneel; P.legOutR += 0.12 * kneel;
      const slump = track([[0, 0], [1.4, 0], [2.4, 1, ease.inOutSine], [2.6, 0.94], [2.8, 1]])(d);
      P.spineP += 0.45 * slump; P.chestP += 0.3 * slump; P.headP += 0.65 * slump; P.headR += 0.25 * slump;
      P.shL += 0.3 * slump; P.shR += 0.25 * slump; P.elL += 0.2 * slump; P.elR += 0.2 * slump; P.outL -= 0.02 * slump; P.outR += 0.05 * slump;
      P.tankP += 0.15 * slump; P.z += 0.35 * slump;
      tankGlow = Math.max(0, 0.6 * (1 - d / 2.5)) * (0.5 + 0.5 * Math.sin(d * 30));
      eyes = d < 2 ? Math.max(0, Math.sin(d * 25)) * (1 - d / 2) : 0;
    }

    // follow-through springs
    const vy = dt > 1e-5 ? (P.y - this.prevY) / dt : 0;
    this.prevY = P.y;
    const tankLag = this.tankSpring.step(clamp(-vy * 0.35, -0.5, 0.5), dt);
    const body = this.bodySpring.step(0, dt);
    P.y += body * 0.05; P.chestP += body * 0.02;

    // glow levels
    this.eyes += (eyes - this.eyes) * (1 - Math.exp(-12 * dt));
    this.cuffs += (cuffs - this.cuffs) * (1 - Math.exp(-14 * dt));
    for (const g of this.eyeGlow) { g.material.opacity = this.eyes * 0.95; g.scale.setScalar(0.6 + this.eyes * 0.9); }
    for (const g of this.cuffGlow) { g.material.opacity = this.cuffs * 0.85; g.scale.setScalar(0.6 + this.cuffs * 1.5); }
    this.tankSprite.material.opacity = clamp((tankGlow - 0.15) * 0.45, 0, 0.7);
    this.tankGlow.value = tankGlow * (this.fade ?? 1);

    // --- apply to bones
    const set = (name, x, y, z) => b[name].rotation.set(x, y, z);
    b.hips.position.copy(b.hips.userData.base);
    b.hips.position.y += P.y;
    set('hips', P.hipsP, P.hipsY, P.hipsR);
    set('spine', P.spineP, 0, 0);
    set('chest', P.chestP, P.chestY, P.chestR);
    set('neck', P.neckP + 0.3 * P.headP, 0.3 * P.headY, 0);
    set('head', 0.7 * P.headP, 0.7 * P.headY, P.headR);
    set('tank', P.tankP + tankLag, 0, P.tankR);
    set('shoulderL', P.shL, 0, P.outL);
    set('elbowL', P.elL, 0, 0);
    set('handL', P.hdL, 0, 0);
    set('shoulderR', P.shR, 0, -P.outR);
    set('elbowR', P.elR, 0, 0);
    set('handR', P.hdR, 0, 0);
    // legs counter the hip pitch so the feet stay planted
    set('thighL', P.thL - P.hipsP, 0, P.legOutL);
    set('kneeL', P.knL, 0, 0);
    set('ankleL', P.anL - (P.thL + P.knL) * 0.9, 0, 0);
    set('thighR', P.thR - P.hipsP, 0, -P.legOutR);
    set('kneeR', P.knR, 0, 0);
    set('ankleR', P.anR - (P.thR + P.knR) * 0.9, 0, 0);
    this.mover.position.set(0, 0, P.z);
  }
}

// Fat fuzzy bumble-bee: striped velvet abdomen, fluffy collar ruff, big glossy eyes, iridescent
// fast-flapping wings, springy antennae and a stinger. Hovers ~1 m up; attack = sting dive.
import * as THREE from 'three';
import { makeCanvas, toTexture } from '../../core/textures.js';
import {
  MonsterBase, once, spherePatch, eyeDomeGeo, placeEye, faceCanvas, eyeTexture, draw, envTexture, Spring, track, ease,
  seg, clamp, lerp, merge, planarUV, smoothstep, furStrokes, furBump, TAU,
} from './common.js';

const HOVER = 1.0;
const HEAD_R = 0.2;
const HEAD_POS = [0, 0.05, 0.15];
const FACE_BOUNDS = { x0: -0.21, x1: 0.21, y0: -0.21, y1: 0.21 };
const EYE_X = 0.078, EYE_Y = 0.018;
const EYE_SIZE = [0.064, 0.08, 0.045];

// ------------------------------------------------------------------ geometry
const headGeo = once(() => new THREE.SphereGeometry(HEAD_R, 30, 22));
const faceGeo = once(() => spherePatch(HEAD_R + 0.0025, 1.15, 0.55, 2.35, FACE_BOUNDS, 24, 18));
const abdomenGeo = once(() => {
  const g = new THREE.SphereGeometry(1, 30, 24);
  g.rotateX(Math.PI / 2); // poles on Z, uv.v = 1 at the front
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    // pear shape: fuller at the back, slight point at the tail
    const z = p.getZ(i);
    const k = 1 + 0.1 * Math.max(0, -z) * (1 + z) - 0.06 * Math.max(0, z);
    p.setX(i, p.getX(i) * 0.265 * k);
    p.setY(i, p.getY(i) * 0.252 * k);
    p.setZ(i, z * 0.31);
  }
  g.computeVertexNormals();
  return g;
});
const ruffGeo = once(() => {
  const list = [];
  const ball = new THREE.SphereGeometry(1, 9, 7);
  const N = 16;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU;
    const r = 0.056 + 0.01 * Math.sin(i * 2.7);
    list.push(ball.clone().scale(r, r, r * 0.9).translate(Math.cos(a) * 0.152, Math.sin(a) * 0.15, 0));
  }
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU + 0.3;
    list.push(ball.clone().scale(0.05, 0.05, 0.045).translate(Math.cos(a) * 0.11, Math.sin(a) * 0.11, 0.035));
  }
  return merge(list);
});
const stingerGeo = once(() => new THREE.ConeGeometry(0.05, 0.18, 12).rotateX(-Math.PI / 2).translate(0, 0.0, -0.37));
const wingGeo = once(() => {
  const mk = (len, wid, sweep) => {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.bezierCurveTo(len * 0.25, wid * 0.55, len * 0.8, wid * 0.75, len, wid * 0.15);
    s.bezierCurveTo(len * 1.05, -wid * 0.25, len * 0.55, -wid * 0.45, 0, -wid * 0.08);
    const g = new THREE.ShapeGeometry(s, 16);
    planarUV(g, 0, len * 1.05, -wid * 0.5, wid * 0.8);
    g.rotateX(-Math.PI / 2); // lie in XZ plane (shape +y → -z... i.e. leading edge forward after flip below)
    g.scale(1, 1, -1);
    g.rotateY(sweep);
    return g;
  };
  const upper = mk(0.4, 0.22, -0.18).translate(0, 0.005, 0);
  const lower = mk(0.26, 0.15, -0.62).translate(-0.01, -0.005, -0.04);
  const right = merge([upper, lower]);
  const left = right.clone().scale(-1, 1, 1);
  return { right, left };
});
const antennaGeo = once(() => {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.015, 0.07, 0.01), new THREE.Vector3(0.05, 0.14, 0.04), new THREE.Vector3(0.1, 0.17, 0.09),
  ]);
  const tube = new THREE.TubeGeometry(curve, 14, 0.011, 6, false);
  const ball = new THREE.SphereGeometry(0.032, 12, 9).translate(0.1, 0.17, 0.09);
  const right = merge([tube, ball]);
  const left = right.clone().scale(-1, 1, 1);
  return { right, left };
});
const legsGeo = once(() => {
  const list = [];
  const leg = new THREE.CapsuleGeometry(0.02, 0.06, 4, 8);
  for (const [x, z] of [[0.07, 0.07], [0.09, -0.02], [0.08, -0.1]]) {
    for (const s of [-1, 1]) list.push(leg.clone().rotateZ(s * 0.35).rotateX(0.25).translate(s * x, -0.19, z));
  }
  return merge(list);
});

// ------------------------------------------------------------------ textures
const abdomenTex = once(() => {
  const W = 256, H = 256;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  // canvas top = front (towards head), bottom = tail tip
  const Y = '#ffc42a', Yd = '#f0a71c', B = '#4b2c1d';
  const bands = [[0, 0.2, Y], [0.2, 0.36, B], [0.36, 0.52, Y], [0.52, 0.68, B], [0.68, 0.84, Y], [0.84, 1.0, Yd]];
  for (const [a, b, col] of bands) { g.fillStyle = col; g.fillRect(0, a * H, W, (b - a) * H + 1); }
  furStrokes(g, W, H, 2600, ['rgba(255,230,140,0.35)', 'rgba(120,70,20,0.25)', 'rgba(255,245,200,0.25)'], 7);
  // fuzzy band edges
  for (const [a, , col] of bands.slice(1)) {
    const y0 = a * H;
    g.strokeStyle = col === B ? 'rgba(75,44,29,0.8)' : 'rgba(255,196,42,0.8)';
    for (let x = 0; x < W; x += 2) {
      g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(x, y0 + 2); g.lineTo(x + (Math.random() - 0.5) * 3, y0 - 3 - Math.random() * 5); g.stroke();
    }
  }
  const t = toTexture(c);
  return t;
});
const headTex = once(() => {
  const W = 256, H = 128;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, '#ffb414'); gr.addColorStop(0.5, '#ffc125'); gr.addColorStop(1, '#ffcf45');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  furStrokes(g, W, H, 900, ['rgba(255,225,120,0.35)', 'rgba(200,120,20,0.14)'], 5);
  return toTexture(c);
});
const wingTex = once(() => {
  const W = 256, H = 256;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  // uv (0..1) spans the wing bounding box; draw membrane everywhere (shape clips it), veins on top
  const gr = g.createLinearGradient(0, 0, W, 0);
  gr.addColorStop(0, 'rgba(220,240,255,0.85)');
  gr.addColorStop(0.5, 'rgba(235,248,255,0.6)');
  gr.addColorStop(1, 'rgba(255,245,255,0.7)');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(90,120,170,0.75)';
  g.lineWidth = 3;
  const cy = H * (0.8 / 1.3);
  for (const [dy, ex] of [[-60, 0.95], [-25, 1.0], [15, 0.9], [45, 0.7]]) {
    g.beginPath(); g.moveTo(0, cy); g.quadraticCurveTo(W * 0.4, cy + dy * 0.4, W * ex, cy + dy); g.stroke();
  }
  g.lineWidth = 1.6;
  for (let i = 0; i < 7; i++) {
    const x = W * (0.3 + i * 0.1);
    g.beginPath(); g.moveTo(x, cy - 70); g.quadraticCurveTo(x + 10, cy, x - 4, cy + 60); g.stroke();
  }
  // sparkle dots
  g.fillStyle = 'rgba(255,255,255,0.8)';
  for (let i = 0; i < 12; i++) { g.beginPath(); g.arc(Math.random() * W, Math.random() * H, 1.5 + Math.random() * 2, 0, TAU); g.fill(); }
  return toTexture(c, { repeat: false });
});

function beeFaces() {
  const ink = '#3a1a10';
  const mk = (fn) => faceCanvas(FACE_BOUNDS, fn);
  const blush = (g) => { for (const s of [-1, 1]) draw.blush(g, s * 0.128, -0.045, 0.045, 0.026, '255,100,90', 0.65); };
  return {
    normal: mk((g) => {
      blush(g);
      draw.catMouth(g, 0, -0.062, 0.06, ink, 0.011);
    }),
    angry: mk((g) => {
      blush(g);
      draw.brow(g, -EYE_X - 0.004, EYE_Y + 0.078, 0.06, -0.5, 0.02, ink);
      draw.brow(g, EYE_X + 0.004, EYE_Y + 0.078, 0.06, 0.5, 0.02, ink);
      draw.openMouth(g, 0, -0.055, 0.075, 0.06, { lip: ink, fangs: 2 });
    }),
    hurt: mk((g) => {
      blush(g);
      draw.squint(g, -EYE_X, EYE_Y, 0.056, 1, ink, 0.017);
      draw.squint(g, EYE_X, EYE_Y, 0.056, -1, ink, 0.017);
      draw.wobblyMouth(g, 0, -0.07, 0.06, ink, 0.011);
      draw.sweat(g, 0.15, 0.1, 0.03);
    }),
    dead: mk((g) => {
      draw.cross(g, -EYE_X, EYE_Y, 0.05, ink, 0.016);
      draw.cross(g, EYE_X, EYE_Y, 0.05, ink, 0.016);
      g.strokeStyle = ink; g.lineWidth = 0.011;
      g.beginPath(); g.ellipse(0, -0.07, 0.018, 0.022, 0, 0, TAU); g.stroke();
    }),
  };
}

const assets = once(() => {
  const env = envTexture();
  const fur = { roughness: 0.85, sheen: 1, sheenRoughness: 0.45, bumpMap: furBump(), bumpScale: 0.6 };
  const a = {
    head: new THREE.MeshPhysicalMaterial({ map: headTex(), sheenColor: new THREE.Color('#fff2b0'), ...fur }),
    abdomen: new THREE.MeshPhysicalMaterial({ map: abdomenTex(), sheenColor: new THREE.Color('#ffe7a0'), ...fur }),
    ruff: new THREE.MeshPhysicalMaterial({ color: '#fff3b8', roughness: 0.9, sheen: 1, sheenRoughness: 0.4, sheenColor: new THREE.Color('#ffffff'), bumpMap: furBump(), bumpScale: 1.5 }),
    dark: new THREE.MeshStandardMaterial({ color: '#3d2418', roughness: 0.4, envMap: env, envMapIntensity: 0.4 }),
    wing: new THREE.MeshPhysicalMaterial({
      map: wingTex(), transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 0.15, metalness: 0,
      iridescence: 1, iridescenceIOR: 1.35, iridescenceThicknessRange: [200, 500], envMap: env, envMapIntensity: 1.0,
      emissive: '#bfe6ff', emissiveIntensity: 0.25,
    }),
    face: new THREE.MeshStandardMaterial({ transparent: true, depthWrite: false, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    eye: new THREE.MeshStandardMaterial({ roughness: 0.1, envMap: env, envMapIntensity: 0.7, emissive: '#ffffff', emissiveIntensity: 0.28 }),
    faces: beeFaces(),
  };
  a.eye.map = a.eye.emissiveMap = eyeTexture('#3b7be0');
  a.head.emissive = new THREE.Color(0, 0, 0); a.head.emissiveMap = a.head.map;
  a.abdomen.emissive = new THREE.Color(0, 0, 0); a.abdomen.emissiveMap = a.abdomen.map;
  return a;
});

// ------------------------------------------------------------------ model
export class BeeMonster extends MonsterBase {
  constructor(type, opts) {
    super(type, opts);
    const A = (this.A = assets());
    this.height = 1.42; this.radius = 0.4; this.headY = HOVER + HEAD_POS[1] + EYE_Y;
    this.impactTime = 0.55; this.attackDur = 1.15; this.hitDur = 0.55; this.collapseDur = 0.95;
    this.impactStrength = 0.6;

    const headMat = this.inst(A.head, { tint: 0.2, rim: ['#fff0a0', 0.35, 2.0] });
    const abdMat = this.inst(A.abdomen, { tint: 0.2, rim: ['#fff0a0', 0.35, 2.0] });
    const ruffMat = this.inst(A.ruff, { rim: ['#ffffff', 0.25, 2.0] });
    const darkMat = this.inst(A.dark, { rim: ['#ffcf90', 0.2, 2.5] });
    const wingMat = this.inst(A.wing, { glow: '#000000', noFlash: true });
    this.faceMat = this.inst(A.face, { glow: '#000000', noFlash: true });
    this.faceMat.map = A.faces.normal;
    const eyeMat = this.inst(A.eye, { glow: '#000000', noFlash: true });

    this.mover = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.mover);
    this.mover.add(this.body);

    // head
    this.head = new THREE.Group();
    this.head.position.set(...HEAD_POS);
    this.head.add(this.mesh(headGeo(), headMat, { name: 'head' }));
    this.face = this.mesh(faceGeo(), this.faceMat, { shadow: false, name: 'face' });
    this.face.renderOrder = 2;
    this.head.add(this.face);
    this.eyes = [];
    for (const s of [-1, 1]) {
      const e = this.mesh(eyeDomeGeo(), eyeMat, { shadow: false, name: 'eye' });
      const x = s * EYE_X, y = EYE_Y;
      const z = Math.sqrt(HEAD_R * HEAD_R - x * x - y * y);
      const pos = new THREE.Vector3(x, y, z);
      placeEye(e, pos, pos.clone().normalize(), EYE_SIZE, 0.3, 0.3);
      this.head.add(e);
      this.eyes.push(e);
    }
    this.antennae = [];
    const ag = antennaGeo();
    for (const s of [-1, 1]) {
      const piv = new THREE.Group();
      piv.position.set(s * 0.07, 0.17, 0.04);
      piv.add(this.mesh(s > 0 ? ag.right : ag.left, darkMat, { shadow: false, name: 'antenna' }));
      piv.userData.side = s;
      piv.userData.sx = new Spring(90, 5); piv.userData.sz = new Spring(90, 5);
      this.head.add(piv);
      this.antennae.push(piv);
    }
    this.body.add(this.head);

    this.ruff = this.mesh(ruffGeo(), ruffMat, { name: 'ruff' });
    this.ruff.position.set(0, 0.02, -0.01);
    this.body.add(this.ruff);

    // abdomen (pivot at the waist for sway / sting curl)
    this.abd = new THREE.Group();
    this.abd.position.set(0, 0.01, -0.07);
    const ab = this.mesh(abdomenGeo(), abdMat, { name: 'abdomen' });
    ab.position.set(0, -0.02, -0.26);
    const st = this.mesh(stingerGeo(), darkMat, { shadow: false, name: 'stinger' });
    st.position.set(0, -0.02, -0.26);
    this.abd.add(ab, st);
    this.body.add(this.abd);

    this.legs = this.mesh(legsGeo(), darkMat, { shadow: false, name: 'legs' });
    this.body.add(this.legs);

    // wings
    this.wings = [];
    const wg = wingGeo();
    for (const s of [-1, 1]) {
      const piv = new THREE.Group();
      piv.position.set(s * 0.08, 0.16, -0.08);
      const w = this.mesh(s > 0 ? wg.right : wg.left, wingMat, { shadow: false, name: 'wing' });
      w.renderOrder = 3;
      piv.add(w);
      piv.userData.side = s;
      this.body.add(piv);
      this.wings.push(piv);
    }

    // animation state
    this.flapPh = Math.random() * TAU;
    this.abdSpring = new Spring(70, 6);
    this.pitchSpring = new Spring(170, 17);
    this.prevY = HOVER;
    this.vy = 0;
    this.trk = {
      y: track([[0, 0], [0.33, 0.3, ease.outQuad], [0.55, -0.05, ease.inCubic], [0.7, 0.02], [1.15, 0]]),
      z: track([[0, 0], [0.33, -0.28, ease.outQuad], [0.55, 0.52, ease.inCubic], [0.7, 0.42], [1.15, 0]]),
      pitch: track([[0, 0], [0.3, -0.75, ease.outQuad], [0.5, -0.85], [0.62, -0.7], [0.9, 0.1], [1.15, 0]]),
      curl: track([[0, 0], [0.3, -1.05, ease.outQuad], [0.5, -1.25], [0.64, -1.1], [0.9, -0.2], [1.15, 0]]),
      stretch: track([[0, 1], [0.3, 0.94], [0.48, 1.1], [0.56, 0.84], [0.7, 1.05], [1.15, 1]]),
    };
    this.hitTrk = track([[0, 0], [0.08, 1, ease.outQuad], [0.55, 0]]);
    const C = this.collapseDur, F = C + this.fadeDur;
    this.dieTrk = {
      y: track([[0, HOVER], [0.18, HOVER + 0.12, ease.outQuad], [0.6, 0.235, ease.inQuad], [0.72, 0.36, ease.outQuad], [0.84, 0.235, ease.inQuad], [C, 0.235], [F, -0.1, ease.inQuad]]),
      roll: track([[0, 0], [0.2, 0.4], [0.62, Math.PI * 0.97, ease.inOutSine], [F, Math.PI]]),
      spin: track([[0, 0], [0.6, 0.7, ease.outQuad], [F, 0.75]]),
    };
    this.animate(0);
    this._applyMaterials();
  }

  onHitStart() { this.abdSpring.kick(4); this.pitchSpring.kick(-3); }

  applyFace(name) {
    this.faceMat.map = this.A.faces[name] || this.A.faces.normal;
    const show = name === 'normal' || name === 'angry';
    for (const e of this.eyes) e.visible = show;
  }

  animate(dt) {
    const t = this.t;
    const dying = this.deathT >= 0;
    const m = this.move;
    let y = HOVER + 0.065 * Math.sin(t * 5.2) + 0.02 * Math.sin(t * 2.1 + 1);
    let z = 0, x = 0;
    let pitch = 0.22 * m + 0.05 * Math.sin(t * 2.6 + 0.6);
    let roll = 0.06 * Math.sin(t * 1.7) + 0.08 * m * Math.sin(t * 3.1);
    let yaw = 0.07 * Math.sin(t * 0.9);
    let curl = 0.06 * Math.sin(t * 5.2 - 1.0);
    let stretch = 1;
    let flapSpeed = lerp(11, 14, m), flapAmp = 0.6, flapBase = 0.5;
    y += 0.03 * m * Math.sin(t * 7.0);

    if (this.attackT >= 0 && !dying) {
      const T = this.trk, a = this.attackT;
      y += T.y(a); z += T.z(a); pitch += T.pitch(a); curl += T.curl(a); stretch = T.stretch(a);
      flapSpeed *= 1.4;
    }
    if (this.hitT >= 0 && !dying) {
      const h = this.hitTrk(this.hitT);
      z -= 0.22 * h; y += 0.06 * h; pitch -= 0.35 * h;
      roll += 0.55 * Math.sin(this.hitT * 26) * (1 - this.hitT / this.hitDur);
    }
    let legKick = 0;
    if (dying) {
      const D = this.dieTrk, d = this.deathT;
      y = D.y(d);
      roll = D.roll(d); yaw = D.spin(d); pitch = 0.2 * Math.sin(d * 7) * (1 - seg(d, 0, 0.7));
      flapAmp = 0.62 * (1 - seg(d, 0, 0.4)); flapBase = lerp(0.3, -0.35, seg(d, 0.2, 0.7));
      flapSpeed = lerp(14, 3, seg(d, 0, 0.5));
      curl = 0.3 * Math.sin(d * 3);
      legKick = seg(d, 0.6, 0.8);
    }

    // follow-through: abdomen lags body vertical velocity
    const vy = dt > 1e-5 ? (y - this.prevY) / dt : 0;
    this.prevY = y;
    const lag = this.abdSpring.step(clamp(vy * 0.25, -0.6, 0.6), dt);
    const pitchS = this.pitchSpring.step(pitch, dt);

    this.mover.position.set(x, y, z);
    this.body.rotation.set(dying ? pitch : pitchS, yaw, roll, 'YXZ');
    const sx = 1 / Math.sqrt(stretch);
    this.body.scale.set(sx, stretch, sx);
    this.abd.rotation.set(curl + lag, 0.1 * Math.sin(t * 1.8), 0);
    this.head.rotation.set(-0.08 * lag, 0.12 * Math.sin(t * 0.7), 0.08 * Math.sin(t * 0.8 + 2));
    this.legs.rotation.x = 0.18 * Math.sin(t * 3.3) - 0.25 * m + (legKick ? 0.35 * Math.sin(this.t * 22) * legKick : 0);

    // wings
    this.flapPh += dt * flapSpeed * TAU;
    const f = Math.sin(this.flapPh);
    for (const w of this.wings) {
      const s = w.userData.side;
      w.rotation.set(0, s * 0.25 * Math.cos(this.flapPh), s * (flapBase + flapAmp * f), 'XYZ');
    }
    // antennae: springy lag vs body motion + idle wiggle
    for (const a of this.antennae) {
      const s = a.userData.side;
      const rx = a.userData.sx.step(-lag * 0.6 - 0.25 * pitchS + 0.1 * Math.sin(t * 3 + s), dt);
      const rz = a.userData.sz.step(0.08 * Math.sin(t * 2.3 + s * 1.3) - roll * 0.3, dt);
      a.rotation.set(rx, 0, rz);
    }

    let face = 'normal';
    if (dying) face = 'dead';
    else if (this.hitT >= 0 && this.hitT < 0.42) face = 'hurt';
    else if (this.attackT >= 0 && this.attackT < this.impactTime + 0.3) face = 'angry';
    this.setFace(face);
    this.applyEyes(this.eyes);
  }
}

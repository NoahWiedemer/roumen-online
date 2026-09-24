// Walking mushroom: spotted red/orange cap with gilled underside, chubby stem body with a face,
// tiny arms and feet. Waddle cycle with cap follow-through; attack = cap slam headbutt.
import * as THREE from 'three';
import { makeCanvas, toTexture } from '../../core/textures.js';
import {
  MonsterBase, once, smoothProfile, latheSurface, lathePatch, eyeDomeGeo, placeEye, faceCanvas, eyeTexture, draw,
  envTexture, weldNormals, Spring, track, ease, seg, bump, clamp, lerp, merge, orientedCopy, smoothstep, TAU,
} from './common.js';

const STEM = once(() =>
  smoothProfile(
    [[0, 0.07], [0.15, 0.072], [0.214, 0.108], [0.243, 0.2], [0.247, 0.3], [0.232, 0.4], [0.21, 0.5], [0.19, 0.58], [0.176, 0.66], [0.1, 0.69], [0, 0.695]],
    40
  )
);
const CAP_Y = 0.635;
const CAP = once(() =>
  smoothProfile(
    [[0.37, -0.012], [0.45, -0.03], [0.505, -0.005], [0.522, 0.05], [0.505, 0.135], [0.455, 0.245], [0.37, 0.34], [0.25, 0.415], [0.125, 0.455], [0, 0.468]],
    36
  )
);
const FACE_BOUNDS = { x0: -0.27, x1: 0.27, y0: 0.08, y1: 0.66 };
const EYE_X = 0.1, EYE_Y = 0.41;
const EYE_SIZE = [0.066, 0.086, 0.048];

const stemGeo = once(() => new THREE.LatheGeometry(STEM(), 36, Math.PI, TAU));
const faceGeo = once(() => lathePatch(STEM(), 0.12, 0.6, 1.2, 0.0025, FACE_BOUNDS, 26));
const capGeo = once(() => new THREE.LatheGeometry(CAP(), 40, Math.PI, TAU));
const gillGeo = once(() => {
  const pts = smoothProfile([[0.15, 0.075], [0.26, 0.045], [0.33, 0.012], [0.375, -0.012]], 8);
  return new THREE.LatheGeometry(pts, 44, Math.PI, TAU);
});
const spotGeo = once(() => {
  const prof = CAP();
  const n = prof.length - 1;
  const base = new THREE.SphereGeometry(1, 12, 5, 0, TAU, 0, Math.PI / 2); // dome
  const list = [];
  const at = (t, phi, s) => {
    const i = Math.round(clamp(t, 0, 1) * n);
    const p = prof[i], a = prof[Math.max(0, i - 1)], b = prof[Math.min(n, i + 1)];
    const dr = b.x - a.x, dy = b.y - a.y;
    const nr = dy, ny = -dr; // outward normal of the profile (rim→top)
    const l = Math.hypot(nr, ny) || 1;
    const pos = new THREE.Vector3(p.x * Math.sin(phi), p.y, p.x * Math.cos(phi));
    const nor = new THREE.Vector3((nr / l) * Math.sin(phi), ny / l, (nr / l) * Math.cos(phi));
    if (p.x < 0.01) nor.set(0, 1, 0);
    pos.addScaledVector(nor, -0.012);
    list.push(orientedCopy(base, pos, nor, [s, s * 0.32, s], phi));
  };
  at(1.0, 0, 0.1);
  for (const [t, phi, s] of [
    [0.66, 0.35, 0.085], [0.64, 1.55, 0.075], [0.68, 2.7, 0.09], [0.63, 3.85, 0.075], [0.67, 5.05, 0.08],
    [0.32, 0.95, 0.065], [0.3, 2.1, 0.07], [0.34, 3.25, 0.06], [0.3, 4.45, 0.07], [0.33, 5.6, 0.062], [0.3, -0.25, 0.055],
  ]) at(t, phi, s);
  return merge(list);
});
const armGeo = once(() => new THREE.CapsuleGeometry(0.046, 0.085, 6, 12).translate(0, -0.075, 0));
const footGeo = once(() => new THREE.SphereGeometry(1, 16, 10).scale(0.078, 0.052, 0.105));

// ------------------------------------------------------------------ textures
const capTex = once(() => {
  const W = 8, H = 256;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  // v: 0 (under-rim, bottom of canvas) → 1 (top, canvas top)
  const gr = g.createLinearGradient(0, H, 0, 0);
  gr.addColorStop(0, '#ffb36b');
  gr.addColorStop(0.06, '#ff8a3d');
  gr.addColorStop(0.2, '#f25a2c');
  gr.addColorStop(0.55, '#ee3d2a');
  gr.addColorStop(1, '#ff5238');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  return toTexture(c);
});
const gillTex = once(() => {
  const W = 512, H = 64;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, '#fff1d8'); gr.addColorStop(1, '#d9b48a');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 72; i++) {
    const x = (i / 72) * W;
    g.strokeStyle = i % 2 ? 'rgba(150,100,60,0.55)' : 'rgba(170,120,80,0.35)';
    g.lineWidth = i % 2 ? 2 : 1.2;
    g.beginPath(); g.moveTo(x, i % 3 === 0 ? 0 : H * 0.3); g.lineTo(x, H); g.stroke();
  }
  return toTexture(c);
});
const stemTex = once(() => {
  const W = 256, H = 256;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, H, 0, 0);
  gr.addColorStop(0, '#e9c393'); gr.addColorStop(0.25, '#f8dfb5'); gr.addColorStop(1, '#fff0d4');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 140; i++) {
    const x = Math.random() * W, y = Math.random() * H, l = 10 + Math.random() * 40;
    g.strokeStyle = `rgba(200,150,100,${0.06 + Math.random() * 0.08})`;
    g.lineWidth = 1 + Math.random() * 2;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 3, y + l); g.stroke();
  }
  return toTexture(c);
});

function mushroomFaces() {
  const ink = '#4a2014';
  const mk = (fn) => faceCanvas(FACE_BOUNDS, fn);
  const blush = (g) => { for (const s of [-1, 1]) draw.blush(g, s * 0.158, 0.335, 0.05, 0.028, '255,105,105', 0.65); };
  return {
    normal: mk((g) => {
      blush(g);
      draw.brow(g, -EYE_X - 0.004, EYE_Y + 0.085, 0.05, 0.2, 0.014, ink);
      draw.brow(g, EYE_X + 0.004, EYE_Y + 0.085, 0.05, -0.2, 0.014, ink);
      draw.openMouth(g, 0, 0.32, 0.085, 0.06, { lip: ink });
    }),
    angry: mk((g) => {
      blush(g);
      draw.brow(g, -EYE_X - 0.002, EYE_Y + 0.075, 0.064, -0.45, 0.02, ink);
      draw.brow(g, EYE_X + 0.002, EYE_Y + 0.075, 0.064, 0.45, 0.02, ink);
      draw.openMouth(g, 0, 0.325, 0.105, 0.08, { lip: ink, fangs: 2 });
    }),
    hurt: mk((g) => {
      blush(g);
      draw.squint(g, -EYE_X, EYE_Y, 0.058, 1, ink, 0.018);
      draw.squint(g, EYE_X, EYE_Y, 0.058, -1, ink, 0.018);
      draw.wobblyMouth(g, 0, 0.31, 0.075, ink, 0.012);
      draw.sweat(g, 0.19, 0.49, 0.03);
    }),
    dead: mk((g) => {
      draw.cross(g, -EYE_X, EYE_Y, 0.05, ink, 0.017);
      draw.cross(g, EYE_X, EYE_Y, 0.05, ink, 0.017);
      g.strokeStyle = ink; g.lineWidth = 0.012;
      g.beginPath(); g.ellipse(0, 0.31, 0.022, 0.026, 0, 0, TAU); g.stroke();
    }),
  };
}

const assets = once(() => {
  const env = envTexture();
  const a = {
    stem: new THREE.MeshStandardMaterial({ map: stemTex(), roughness: 0.75, emissive: '#000000' }),
    cap: new THREE.MeshStandardMaterial({ map: capTex(), roughness: 0.34, envMap: env, envMapIntensity: 0.4, emissive: '#000000', shadowSide: THREE.DoubleSide }),
    gills: new THREE.MeshStandardMaterial({ map: gillTex(), roughness: 0.85, side: THREE.DoubleSide, emissive: '#000000' }),
    spots: new THREE.MeshStandardMaterial({ color: '#fff8ee', roughness: 0.55, emissive: '#1a1612' }),
    feet: new THREE.MeshStandardMaterial({ color: '#c98f5e', roughness: 0.7 }),
    face: new THREE.MeshStandardMaterial({ transparent: true, depthWrite: false, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    eye: new THREE.MeshStandardMaterial({ roughness: 0.1, envMap: env, envMapIntensity: 0.7, emissive: '#ffffff', emissiveIntensity: 0.28 }),
    faces: mushroomFaces(),
  };
  a.eye.map = a.eye.emissiveMap = eyeTexture('#c27a2c');
  a.stem.emissiveMap = a.stem.map;
  a.cap.emissiveMap = a.cap.map;
  a.gills.emissiveMap = a.gills.map;
  return a;
});

export class MushroomMonster extends MonsterBase {
  constructor(type, opts) {
    super(type, opts);
    const A = (this.A = assets());
    this.height = 1.1; this.radius = 0.5; this.headY = EYE_Y;
    this.impactTime = 0.42; this.attackDur = 0.95; this.hitDur = 0.5; this.collapseDur = 0.85;
    this.impactStrength = 0.8;

    const stemMat = this.inst(A.stem, { rim: ['#fff4dc', 0.28, 2.4] });
    const capMat = this.inst(A.cap, { tint: 0.3, rim: ['#ffb08a', 0.22, 2.6] });
    const gillMat = this.inst(A.gills);
    const spotMat = this.inst(A.spots, { rim: ['#ffffff', 0.2, 2.5] });
    const feetMat = this.inst(A.feet, { rim: ['#ffd9b0', 0.2, 2.5] });
    this.faceMat = this.inst(A.face, { glow: '#000000', noFlash: true });
    this.faceMat.map = A.faces.normal;
    const eyeMat = this.inst(A.eye, { glow: '#000000', noFlash: true });

    this.mover = new THREE.Group();
    this.hips = new THREE.Group();
    this.root.add(this.mover);
    this.mover.add(this.hips);

    this.stem = this.mesh(stemGeo(), stemMat, { name: 'stem' });
    this.face = this.mesh(faceGeo(), this.faceMat, { shadow: false, name: 'face' });
    this.face.renderOrder = 2;
    this.hips.add(this.stem, this.face);

    this.eyes = [];
    for (const s of [-1, 1]) {
      const e = this.mesh(eyeDomeGeo(), eyeMat, { shadow: false, name: 'eye' });
      const { pos, normal } = latheSurface(STEM(), s * EYE_X, EYE_Y);
      placeEye(e, pos, normal, EYE_SIZE, 0.4, 0.3);
      this.hips.add(e);
      this.eyes.push(e);
    }
    this.arms = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(s * 0.222, 0.36, 0.025);
      const arm = this.mesh(armGeo(), stemMat, { name: 'arm' });
      pivot.add(arm);
      pivot.userData.side = s;
      this.hips.add(pivot);
      this.arms.push(pivot);
    }
    this.capPivot = new THREE.Group();
    this.capPivot.position.y = CAP_Y;
    this.capPivot.add(
      this.mesh(capGeo(), capMat, { name: 'cap' }),
      this.mesh(gillGeo(), gillMat, { name: 'gills' }),
      this.mesh(spotGeo(), spotMat, { shadow: false, name: 'spots' })
    );
    this.hips.add(this.capPivot);

    this.feet = [];
    for (const s of [-1, 1]) {
      const f = this.mesh(footGeo(), feetMat, { name: 'foot' });
      f.position.set(s * 0.105, 0.048, 0.03);
      f.rotation.y = s * 0.15;
      f.userData.side = s;
      this.mover.add(f);
      this.feet.push(f);
    }

    // animation state
    this.phase = Math.random() * TAU;
    this.capRoll = new Spring(140, 7);
    this.capPitch = new Spring(140, 7);
    this.capSq = new Spring(260, 9, 1);
    this.lean = new Spring(650, 34);
    this.trk = {
      lean: track([[0, 0], [0.27, -0.42, ease.outQuad], [0.4, 0.7, ease.inCubic], [0.56, 0.52], [0.95, 0]]),
      z: track([[0, 0], [0.28, -0.07], [0.42, 0.24, ease.inQuad], [0.62, 0.2], [0.95, 0]]),
      y: track([[0, 0], [0.15, 0], [0.3, 0.06, ease.outQuad], [0.4, 0, ease.inQuad], [0.95, 0]]),
      sq: track([[0, 1], [0.26, 0.86], [0.36, 1.1], [0.44, 0.9], [0.6, 1.03], [0.95, 1]]),
      arms: track([[0, 0], [0.26, -2.6, ease.outQuad], [0.42, -0.4, ease.inQuad], [0.6, -0.6], [0.95, 0]]),
    };
    this.hitTrk = track([[0, 0], [0.07, 1, ease.outQuad], [0.5, 0]]);
    const C = this.collapseDur, F = C + this.fadeDur;
    this.dieTrk = {
      y: track([[0, 0], [0.14, 0.12, ease.outQuad], [0.3, 0.0, ease.inQuad], [C, 0], [F, -0.35, ease.inQuad]]),
      lean: track([[0, 0], [0.14, 0.12], [0.5, -1.2, ease.inQuad], [0.62, -1.02, ease.outQuad], [0.74, -1.2, ease.inQuad], [F, -1.2]]),
      lift: track([[0, 0], [0.3, 0], [0.5, 0.2, ease.inQuad], [F, 0.2]]),
      sq: track([[0, 1], [0.1, 0.85], [0.18, 1.15], [0.5, 1.0], [0.56, 0.8], [0.7, 1.0], [F, 1]]),
      spin: track([[0, 0], [0.4, 1.2, ease.outQuad], [F, 1.3]]),
    };
    this.animate(0);
    this._applyMaterials();
  }

  onHitStart() { this.capPitch.kick(-5); this.capSq.kick(-2); }
  onDieStart() { this.capSq.kick(3); }

  applyFace(name) {
    this.faceMat.map = this.A.faces[name] || this.A.faces.normal;
    const show = name === 'normal' || name === 'angry';
    for (const e of this.eyes) e.visible = show;
  }

  animate(dt) {
    const dying = this.deathT >= 0;
    const a = smoothstep(0.02, 0.4, this.move) * (dying ? 0 : 1);
    const freq = 1.85 * lerp(0.75, 1.05, this.move);
    this.phase += dt * freq * TAU * (a > 0.01 ? 1 : 0.0);
    const ph = this.phase;
    const t = this.t;

    // --- base waddle + idle
    const idle = 1 - a;
    let lean = 0.07 * a + 0.015 * Math.sin(t * 1.1) * idle;
    let roll = -0.11 * a * Math.cos(ph) + 0.025 * Math.sin(t * 0.9) * idle;
    let yaw = 0.09 * a * Math.sin(ph);
    let y = 0.032 * a * Math.abs(Math.cos(ph));
    let z = 0;
    let sq = 1 + 0.022 * Math.sin(t * 2.2) * idle + 0.03 * a * Math.sin(ph * 2 + 1.0);
    let armSwing = 0, armRaise = 0;
    for (const f of this.feet) {
      const p = ph + (f.userData.side < 0 ? 0 : Math.PI);
      f.position.z = 0.03 + 0.085 * a * Math.sin(p);
      f.position.y = 0.048 + 0.05 * a * Math.max(0, Math.cos(p));
      f.rotation.x = -0.5 * a * Math.max(0, Math.cos(p)) * Math.sin(p + 0.6);
    }
    armSwing = 0.65 * a * Math.sin(ph);

    // --- attack
    if (this.attackT >= 0 && !dying) {
      const T = this.trk, at = this.attackT;
      lean += T.lean(at); z += T.z(at); y += T.y(at); sq *= T.sq(at);
      armRaise = T.arms(at);
      if (this._lat !== undefined && this._lat < this.impactTime && at >= this.impactTime) {
        this.capSq.kick(-5.5); this.capPitch.kick(4);
      }
      this._lat = at;
    } else this._lat = undefined;

    // --- hit
    if (this.hitT >= 0 && !dying) {
      const h = this.hitTrk(this.hitT);
      lean -= 0.32 * h; z -= 0.09 * h; sq *= 1 - 0.08 * h;
      armRaise -= 1.2 * h;
    }

    // --- death
    let lift = 0;
    if (dying) {
      const D = this.dieTrk, dt2 = this.deathT;
      y = D.y(dt2); lean = D.lean(dt2); lift = D.lift(dt2); sq = D.sq(dt2);
      yaw = D.spin(dt2) * 0.5; roll = 0.12 * Math.sin(dt2 * 9) * (1 - seg(dt2, 0, 0.6));
      armRaise = -2.4 * seg(dt2, 0.3, 0.6);
      for (const f of this.feet) { f.rotation.x = -1.0 * seg(dt2, 0.3, 0.6); f.position.y = 0.048 + 0.1 * seg(dt2, 0.3, 0.6); }
    }

    const leanS = dying ? lean : this.lean.step(lean, dt);
    this.mover.position.set(0, y + lift, z);
    this.hips.rotation.set(leanS, yaw, roll, 'YXZ');
    this.hips.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
    this.hips.position.z = dying ? 0.25 * Math.sin(-leanS) * 0.6 : 0;

    // cap follow-through (springs lag behind the body motion)
    const cr = this.capRoll.step(-roll * 0.6 + 0.04 * Math.sin(t * 1.3) * idle, dt);
    const leanVel = dt > 1e-5 ? (leanS - (this._prevLean ?? leanS)) / dt : 0;
    const cpch = this.capPitch.step(clamp(-leanVel * 0.09, -0.6, 0.6) + 0.05 * a, dt);
    this._prevLean = leanS;
    const cs = this.capSq.step(1, dt);
    this.capPivot.rotation.set(cpch * 0.5 + (dying ? 0.1 : 0), 0, cr);
    const csq = clamp(cs, 0.6, 1.4);
    // counter the hips squash so the cap keeps its own shape
    this.capPivot.scale.set(Math.sqrt(sq) / Math.sqrt(csq), csq / sq, Math.sqrt(sq) / Math.sqrt(csq));

    for (const arm of this.arms) {
      const s = arm.userData.side;
      arm.rotation.set(s * armSwing + armRaise, 0, s * (0.5 + 0.05 * Math.sin(t * 2 + s)) + (armRaise < -1 ? s * 0.4 : 0));
    }

    let face = 'normal';
    if (dying) face = 'dead';
    else if (this.hitT >= 0 && this.hitT < 0.4) face = 'hurt';
    else if (this.attackT >= 0 && this.attackT < this.impactTime + 0.3) face = 'angry';
    this.setFace(face);
    this.applyEyes(this.eyes);
  }
}

// Chubby wild-boar piglet: striped bristly body, dark mane ridge, big head with pink snout,
// small tusks, floppy ears, angry brows, stubby legs with hooves and a curly tail.
// Trot cycle with head/ear/tail follow-through; attack = paw-the-ground + charge headbutt.
import * as THREE from 'three';
import { makeCanvas, toTexture } from '../../core/textures.js';
import {
  MonsterBase, once, spherePatch, eyeDomeGeo, placeEye, faceCanvas, eyeTexture, draw, envTexture, Spring, track, ease,
  seg, bump, clamp, lerp, merge, mergeGroups, furStrokes, furBump, smoothstep, weldNormals, TAU,
} from './common.js';

const TORSO_Y = 0.47, TORSO_Z = -0.12;
const BODY_R = [0.4, 0.34, 0.54];
const HEAD_R = 0.3;
const HEAD_POS = [0, 0.1, 0.5]; // relative to torso pivot
const FACE_BOUNDS = { x0: -0.31, x1: 0.31, y0: -0.31, y1: 0.31 };
const EYE_X = 0.118, EYE_Y = 0.062;
const EYE_SIZE = [0.062, 0.074, 0.045];

// ------------------------------------------------------------------ geometry
const torsoGeo = once(() => {
  const g = new THREE.SphereGeometry(1, 34, 24, Math.PI / 2); // seam on the belly
  g.rotateX(Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    // chubbier hams at the back, slightly flatter belly
    const k = 1 + 0.08 * Math.max(0, -z) - 0.04 * Math.max(0, z);
    if (y < 0) y *= 0.92;
    p.setXYZ(i, x * BODY_R[0] * k, y * BODY_R[1] * k, z * BODY_R[2]);
  }
  g.computeVertexNormals();
  return g;
});
const headGeo = once(() => new THREE.SphereGeometry(HEAD_R, 32, 24).scale(1.0, 0.94, 0.96));
const faceGeo = once(() => spherePatch(HEAD_R + 0.003, 1.2, 0.45, 2.45, FACE_BOUNDS, 24, 18).scale(1.0, 0.94, 0.96));
const snoutGeo = once(() => {
  const prof = [[0.1, -0.02], [0.118, 0.05], [0.126, 0.1], [0.12, 0.13], [0.095, 0.148], [0.05, 0.154], [0, 0.155]].map((p) => new THREE.Vector2(p[0], p[1]));
  const s = new THREE.LatheGeometry(prof, 28).rotateX(Math.PI / 2).scale(1.18, 0.86, 1);
  const nostrils = [];
  for (const sx of [-1, 1]) nostrils.push(new THREE.SphereGeometry(1, 12, 8).scale(0.026, 0.034, 0.014).translate(sx * 0.046, 0.0, 0.152));
  return mergeGroups([s, merge(nostrils)]);
});
const tuskGeo = once(() => {
  const list = [];
  for (const s of [-1, 1]) {
    const c = new THREE.ConeGeometry(0.034, 0.13, 10);
    c.translate(0, 0.065, 0).rotateZ(-s * 0.4).rotateX(-0.15).translate(s * 0.14, -0.14, 0.24);
    list.push(c);
  }
  return merge(list);
});
const earGeo = once(() => {
  const leaf = (sx, sy, sz) => {
    const g = new THREE.SphereGeometry(1, 16, 12);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y01 = p.getY(i) * 0.5 + 0.5;
      const w = Math.pow(1 - y01, 0.75) * (0.6 + 0.4 * Math.min(1, y01 * 4)) * 1.6;
      p.setXYZ(i, p.getX(i) * sx * w, y01 * sy, p.getZ(i) * sz * Math.max(0.3, w));
    }
    g.computeVertexNormals();
    return g;
  };
  const outer = leaf(0.1, 0.26, 0.035);
  const inner = leaf(0.064, 0.19, 0.02).translate(0, 0.02, 0.022);
  const right = mergeGroups([outer, inner]);
  return right;
});
const maneGeo = once(() => {
  const list = [];
  const N = 9;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const z = lerp(0.42, -0.22, t);
    const yTop = BODY_R[1] * Math.sqrt(Math.max(0, 1 - (z / BODY_R[2]) ** 2));
    const h = lerp(0.2, 0.1, t), r = lerp(0.07, 0.045, t);
    const c = new THREE.ConeGeometry(r, h, 8);
    c.translate(0, h / 2, 0).rotateX(-0.65 - 0.2 * t).translate(0, yTop - 0.03, z);
    list.push(c);
    if (i % 2 === 0) {
      for (const s of [-1, 1]) {
        const c2 = new THREE.ConeGeometry(r * 0.7, h * 0.7, 7);
        c2.translate(0, h * 0.35, 0).rotateX(-0.75).rotateZ(-s * 0.45).translate(s * 0.05, yTop - 0.04, z - 0.03);
        list.push(c2);
      }
    }
  }
  return merge(list);
});
const forelockGeo = once(() => {
  const list = [];
  for (const [x, z, h, rz] of [[0, 0.02, 0.14, 0], [-0.05, -0.03, 0.11, 0.35], [0.05, -0.03, 0.11, -0.35], [0, -0.1, 0.1, 0]]) {
    const c = new THREE.ConeGeometry(0.045, h, 8);
    c.translate(0, h / 2, 0).rotateX(-0.5).rotateZ(rz).translate(x, HEAD_R * 0.9, z);
    list.push(c);
  }
  return merge(list);
});
const legGeo = once(() => {
  const leg = new THREE.CapsuleGeometry(0.082, 0.12, 6, 14).translate(0, -0.14, 0);
  const hoof = new THREE.CylinderGeometry(0.078, 0.086, 0.07, 14).translate(0, -0.27, 0.004);
  return mergeGroups([leg, hoof]);
});
const tailGeo = once(() => {
  const pts = [];
  const axis = new THREE.Vector3(0, 0.55, -0.83).normalize();
  const e1 = new THREE.Vector3(1, 0, 0), e2 = new THREE.Vector3().crossVectors(axis, e1).normalize();
  for (let i = 0; i <= 24; i++) {
    const t = i / 24, a = t * TAU * 1.6;
    const r = 0.04 * (1 - 0.35 * t) * Math.min(1, t * 4);
    pts.push(axis.clone().multiplyScalar(t * 0.1).addScaledVector(e1, Math.sin(a) * r).addScaledVector(e2, (1 - Math.cos(a)) * r));
  }
  const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.017, 7, false);
  const tip = new THREE.SphereGeometry(0.02, 8, 6).translate(pts[24].x, pts[24].y, pts[24].z);
  return merge([tube, tip]);
});

// ------------------------------------------------------------------ textures
const bodyTex = once(() => {
  const W = 512, H = 256;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  // u: 0/1 belly, 0.5 spine;  v (canvas top) = front
  const gr = g.createLinearGradient(0, 0, W, 0);
  gr.addColorStop(0, '#d8a979'); gr.addColorStop(0.18, '#a8703f'); gr.addColorStop(0.36, '#8e5732'); gr.addColorStop(0.5, '#6b3d22');
  gr.addColorStop(0.64, '#8e5732'); gr.addColorStop(0.82, '#a8703f'); gr.addColorStop(1, '#d8a979');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  // piglet stripes along the body (own layer, faded towards both ends so the poles stay clean)
  const sc = makeCanvas(W, H);
  const sg = sc.getContext('2d');
  sg.lineCap = 'round';
  for (const off of [0.075, 0.155, 0.235]) {
    for (const s of [-1, 1]) {
      const u = 0.5 + s * off;
      sg.strokeStyle = 'rgba(245,214,160,0.9)';
      sg.lineWidth = 10 - off * 16;
      sg.beginPath();
      for (let y = H * 0.1; y <= H * 0.9; y += 8) {
        const x = u * W + Math.sin(y * 0.05 + off * 20) * 3;
        if (y === H * 0.1) sg.moveTo(x, y); else sg.lineTo(x, y);
      }
      sg.stroke();
    }
  }
  sg.globalCompositeOperation = 'destination-in';
  const mask = sg.createLinearGradient(0, 0, 0, H);
  mask.addColorStop(0.08, 'rgba(0,0,0,0)'); mask.addColorStop(0.3, 'rgba(0,0,0,1)');
  mask.addColorStop(0.68, 'rgba(0,0,0,1)'); mask.addColorStop(0.88, 'rgba(0,0,0,0)');
  sg.fillStyle = mask; sg.fillRect(0, 0, W, H);
  g.drawImage(sc, 0, 0);
  furStrokes(g, W, H, 3500, ['rgba(60,30,15,0.16)', 'rgba(240,190,130,0.16)', 'rgba(90,50,25,0.16)'], 10);
  return toTexture(c);
});
const headTex = once(() => {
  const W = 256, H = 256;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, '#6b3d22'); gr.addColorStop(0.35, '#91593a'); gr.addColorStop(0.62, '#b07a48'); gr.addColorStop(1, '#e0b486');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  furStrokes(g, W, H, 1800, ['rgba(60,30,15,0.14)', 'rgba(240,190,130,0.14)'], 8);
  return toTexture(c);
});

function boarFaces() {
  const ink = '#2a140c';
  const mk = (fn) => faceCanvas(FACE_BOUNDS, fn);
  const blush = (g) => { for (const s of [-1, 1]) draw.blush(g, s * 0.18, -0.03, 0.05, 0.03, '255,110,110', 0.55); };
  const brows = (g, ang, dy = 0.075, th = 0.03) => {
    draw.brow(g, -EYE_X - 0.01, EYE_Y + dy, 0.09, -ang, th, ink);
    draw.brow(g, EYE_X + 0.01, EYE_Y + dy, 0.09, ang, th, ink);
  };
  const mouth = (g, open) => {
    if (open) draw.openMouth(g, 0, -0.165, 0.11, 0.07, { lip: ink, fangs: 0 });
    else {
      g.strokeStyle = ink; g.lineWidth = 0.014;
      g.beginPath(); g.moveTo(-0.07, -0.16); g.quadraticCurveTo(0, -0.19, 0.07, -0.16); g.stroke();
    }
  };
  return {
    normal: mk((g) => { blush(g); brows(g, 0.38); mouth(g, false); }),
    angry: mk((g) => { blush(g); brows(g, 0.62, 0.066, 0.036); mouth(g, true); }),
    hurt: mk((g) => {
      blush(g);
      draw.squint(g, -EYE_X, EYE_Y, 0.062, 1, ink, 0.02);
      draw.squint(g, EYE_X, EYE_Y, 0.062, -1, ink, 0.02);
      brows(g, -0.25, 0.09, 0.026);
      draw.wobblyMouth(g, 0, -0.17, 0.1, ink, 0.013);
      draw.sweat(g, 0.23, 0.14, 0.04);
    }),
    dead: mk((g) => {
      draw.cross(g, -EYE_X, EYE_Y, 0.055, ink, 0.02);
      draw.cross(g, EYE_X, EYE_Y, 0.055, ink, 0.02);
      draw.wobblyMouth(g, 0, -0.17, 0.1, ink, 0.013);
    }),
  };
}

const assets = once(() => {
  const env = envTexture();
  const bump = furBump();
  const a = {
    body: new THREE.MeshStandardMaterial({ map: bodyTex(), roughness: 0.9, bumpMap: bump, bumpScale: 0.7, emissive: '#000000' }),
    head: new THREE.MeshStandardMaterial({ map: headTex(), roughness: 0.9, bumpMap: bump, bumpScale: 0.6, emissive: '#000000' }),
    leg: new THREE.MeshStandardMaterial({ color: '#7d4a2a', roughness: 0.85, bumpMap: bump, bumpScale: 0.5 }),
    snout: new THREE.MeshStandardMaterial({ color: '#f39c8a', roughness: 0.45, envMap: env, envMapIntensity: 0.3 }),
    dark: new THREE.MeshStandardMaterial({ color: '#3b2216', roughness: 0.75 }),
    tusk: new THREE.MeshStandardMaterial({ color: '#fffbf0', roughness: 0.3, envMap: env, envMapIntensity: 0.5, emissive: '#2a2620' }),
    face: new THREE.MeshStandardMaterial({ transparent: true, depthWrite: false, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    eye: new THREE.MeshStandardMaterial({ roughness: 0.1, envMap: env, envMapIntensity: 0.7, emissive: '#ffffff', emissiveIntensity: 0.28 }),
    faces: boarFaces(),
  };
  a.body.emissiveMap = a.body.map;
  a.head.emissiveMap = a.head.map;
  a.eye.map = a.eye.emissiveMap = eyeTexture('#c0502a');
  return a;
});

// ------------------------------------------------------------------ model
export class BoarMonster extends MonsterBase {
  constructor(type, opts) {
    super(type, opts);
    const A = (this.A = assets());
    this.height = 0.92; this.radius = 0.55; this.headY = TORSO_Y + HEAD_POS[1] + EYE_Y;
    this.impactTime = 0.5; this.attackDur = 1.05; this.hitDur = 0.5; this.collapseDur = 0.9;
    this.impactStrength = 1;

    const bodyMat = this.inst(A.body, { tint: 0.22, rim: ['#ffd7a8', 0.3, 2.2] });
    const headMat = this.inst(A.head, { tint: 0.22, rim: ['#ffd7a8', 0.3, 2.2] });
    const snoutMat = this.inst(A.snout, { rim: ['#ffd0c8', 0.25, 2.4] });
    const darkMat = this.inst(A.dark, { rim: ['#c98a60', 0.3, 2.2] });
    const legMat = this.inst(A.leg, { tint: 0.15, rim: ['#ffc8a0', 0.25, 2.2] });
    const tuskMat = this.inst(A.tusk, { rim: ['#ffffff', 0.2, 2.5] });
    this.faceMat = this.inst(A.face, { glow: '#000000', noFlash: true });
    this.faceMat.map = A.faces.normal;
    const eyeMat = this.inst(A.eye, { glow: '#000000', noFlash: true });

    this.mover = new THREE.Group();
    this.root.add(this.mover);
    this.torso = new THREE.Group();
    this.torso.position.set(0, TORSO_Y, TORSO_Z);
    this.mover.add(this.torso);
    this.torsoMesh = this.mesh(torsoGeo(), bodyMat, { name: 'torso' });
    this.mane = this.mesh(maneGeo(), darkMat, { name: 'mane' });
    this.torso.add(this.torsoMesh, this.mane);

    // head
    this.head = new THREE.Group();
    this.head.position.set(...HEAD_POS);
    this.torso.add(this.head);
    this.headMesh = this.mesh(headGeo(), headMat, { name: 'head' });
    this.face = this.mesh(faceGeo(), this.faceMat, { shadow: false, name: 'face' });
    this.face.renderOrder = 2;
    this.snout = this.mesh(snoutGeo(), [snoutMat, darkMat], { name: 'snout' });
    this.snout.position.set(0, -0.075, 0.2);
    this.tusks = this.mesh(tuskGeo(), tuskMat, { shadow: false, name: 'tusks' });
    this.forelock = this.mesh(forelockGeo(), darkMat, { shadow: false, name: 'forelock' });
    this.head.add(this.headMesh, this.face, this.snout, this.tusks, this.forelock);
    this.eyes = [];
    for (const s of [-1, 1]) {
      const e = this.mesh(eyeDomeGeo(), eyeMat, { shadow: false, name: 'eye' });
      const x = s * EYE_X, y = EYE_Y;
      const z = Math.sqrt(HEAD_R * HEAD_R - x * x - y * y) * 0.96;
      const pos = new THREE.Vector3(x, y * 0.94, z);
      placeEye(e, pos, new THREE.Vector3(x, y, z).normalize(), EYE_SIZE, 0.35, 0.32);
      this.head.add(e);
      this.eyes.push(e);
    }
    this.ears = [];
    for (const s of [-1, 1]) {
      const piv = new THREE.Group();
      piv.position.set(s * 0.19, 0.2, -0.04);
      const ear = this.mesh(earGeo(), [headMat, snoutMat], { name: 'ear' });
      ear.rotation.set(0.35, s * -0.35, s * -0.75);
      piv.add(ear);
      piv.userData.side = s;
      piv.userData.spring = new Spring(110, 6);
      this.head.add(piv);
      this.ears.push(piv);
    }

    // legs (children of torso so they follow pitch/roll)
    this.legs = [];
    const lg = legGeo();
    for (const [sx, lz, ph] of [[-1, 0.3, 0], [1, 0.3, Math.PI], [-1, -0.3, Math.PI], [1, -0.3, 0]]) {
      const piv = new THREE.Group();
      piv.position.set(sx * 0.2, -0.18, lz);
      piv.add(this.mesh(lg, [legMat, darkMat], { name: 'leg' }));
      piv.userData = { side: sx, front: lz > 0, ph, baseY: -0.18 };
      this.torso.add(piv);
      this.legs.push(piv);
    }
    // tail
    this.tail = new THREE.Group();
    this.tail.position.set(0, 0.12, -0.52);
    this.tail.add(this.mesh(tailGeo(), headMat, { shadow: false, name: 'tail' }));
    this.torso.add(this.tail);

    // animation state
    this.phase = Math.random() * TAU;
    this.headPitch = new Spring(260, 17);
    this.headYaw = new Spring(40, 8);
    this.sq = new Spring(260, 12, 1);
    this.prevY = 0;
    this._lookT = 0; this._look = 0;
    this.trk = {
      z: track([[0, 0], [0.3, -0.13, ease.outQuad], [0.5, 0.6, ease.inQuad], [0.62, 0.52], [1.05, 0]]),
      pitch: track([[0, 0], [0.28, -0.2, ease.outQuad], [0.46, 0.14], [0.56, 0.1], [1.05, 0]]),
      head: track([[0, 0], [0.28, -0.28], [0.45, 0.62, ease.inQuad], [0.6, 0.4], [1.05, 0]]),
      y: track([[0, 0], [0.3, 0], [0.42, 0.08, ease.outQuad], [0.5, 0, ease.inQuad], [1.05, 0]]),
    };
    this.hitTrk = track([[0, 0], [0.07, 1, ease.outQuad], [0.5, 0]]);
    const C = this.collapseDur, F = C + this.fadeDur;
    this.dieTrk = {
      roll: track([[0, 0], [0.15, -0.2, ease.outQuad], [0.55, Math.PI / 2, ease.inQuad], [0.66, Math.PI / 2 - 0.2, ease.outQuad], [0.78, Math.PI / 2, ease.inQuad], [F, Math.PI / 2]]),
      y: track([[0, 0], [0.15, 0.12, ease.outQuad], [0.55, -0.07, ease.inQuad], [C, -0.07], [F, -0.5, ease.inQuad]]),
      legs: track([[0, 0], [0.5, 1], [F, 1]]),
    };
    this.animate(0);
    this._applyMaterials();
  }

  onHitStart() { this.headPitch.kick(-4); for (const e of this.ears) e.userData.spring.kick(6); this.sq.kick(-1.5); }

  applyFace(name) {
    this.faceMat.map = this.A.faces[name] || this.A.faces.normal;
    const show = name === 'normal' || name === 'angry';
    for (const e of this.eyes) e.visible = show;
  }

  animate(dt) {
    const t = this.t;
    const dying = this.deathT >= 0;
    const a = smoothstep(0.02, 0.4, this.move) * (dying ? 0 : 1);
    let freq = 2.5 * lerp(0.7, 1.08, this.move);
    let legAmp = 0.6 * a;
    const idle = 1 - a;

    let y = 0, z = 0, pitch = 0, roll = 0, yaw = 0, headP = 0, legOverride = null;
    let sqT = 1 + 0.018 * Math.sin(t * 2.4) * idle;

    // idle "look around" + sniff
    this._lookT -= dt;
    if (this._lookT <= 0) { this._lookT = 1.5 + Math.random() * 3; this._look = (Math.random() - 0.5) * 0.7; }
    let headY = this.headYaw.step(this._look * idle, dt);
    headP += 0.05 * Math.sin(t * 1.3) * idle + (Math.sin(t * 9) > 0.93 ? 0.03 : 0) * idle;

    if (this.attackT >= 0 && !dying) {
      const T = this.trk, at = this.attackT;
      z += T.z(at); pitch += T.pitch(at); headP += T.head(at); y += T.y(at);
      if (at > 0.3 && at < 0.55) { freq = 4.5; legAmp = 0.8; }
      if (at < 0.3) {
        // paw the ground with the front-right leg
        legOverride = { idx: 1, rot: -0.7 + 0.8 * Math.max(0, Math.sin(at * 38)) };
      }
      if (this._lat !== undefined && this._lat < this.impactTime && at >= this.impactTime) { this.sq.kick(-3); this.headPitch.kick(-5); for (const e of this.ears) e.userData.spring.kick(-8); }
      this._lat = at;
    } else this._lat = undefined;
    const charging = this.attackT > 0.3 && this.attackT < 0.55;

    this.phase += dt * freq * TAU * (a > 0.01 || charging ? 1 : 0);
    const ph = this.phase;
    const amp = charging ? 1 : a;

    y += 0.035 * amp * Math.abs(Math.sin(ph));
    pitch += 0.04 * amp * Math.sin(ph * 2 + 0.6) + 0.03 * a;
    roll += 0.045 * amp * Math.sin(ph);
    yaw += 0.03 * amp * Math.sin(ph);

    if (this.hitT >= 0 && !dying) {
      const h = this.hitTrk(this.hitT);
      z -= 0.1 * h; pitch -= 0.14 * h; headP -= 0.18 * h;
    }

    let legSplay = 0;
    if (dying) {
      const D = this.dieTrk, d = this.deathT;
      roll = D.roll(d); y = D.y(d); pitch = 0; yaw = 0; headP = 0.15 * seg(d, 0.4, 0.7);
      legSplay = D.legs(d);
      headY = 0;
    }

    // follow-through
    const vy = dt > 1e-5 ? (y - this.prevY) / dt : 0;
    this.prevY = y;
    const hp = this.headPitch.step(headP + clamp(vy * 0.12, -0.3, 0.3), dt);
    const sq = this.sq.step(sqT, dt);

    this.mover.position.set(0, y, z);
    this.torso.rotation.set(pitch, yaw, roll, 'YXZ');
    this.torso.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
    this.head.rotation.set(hp, headY, 0.05 * Math.sin(t * 0.8) * idle - roll * 0.4, 'YXZ');

    this.legs.forEach((l, i) => {
      const u = l.userData;
      let r = legAmp * Math.sin(ph + u.ph);
      if (legOverride && legOverride.idx === i) r = legOverride.rot;
      l.rotation.set(r * (1 - legSplay), 0, legSplay * u.side * (0.5 + 0.12 * Math.sin(this.t * 20) * seg(this.deathT, 0.6, 0.9) * (1 - seg(this.deathT, 1.2, 1.6))));
      l.position.y = u.baseY + 0.03 * amp * Math.max(0, Math.cos(ph + u.ph));
    });
    for (const e of this.ears) {
      const s = e.userData.side;
      const flop = e.userData.spring.step(-vy * 0.6 + 0.12 * Math.sin(ph * 2) * amp, dt);
      e.rotation.set(clamp(flop, -0.8, 0.8) * 0.6, 0, s * (-clamp(flop, -0.8, 0.8) * 0.5 + 0.06 * Math.sin(t * 1.7 + s)));
    }
    this.tail.rotation.set(0.2 * Math.sin(t * 3), 0, 0.5 * Math.sin(t * (a > 0.1 ? 14 : 5)) * (0.5 + 0.5 * amp));
    this.snout.scale.setScalar(1 + 0.04 * Math.max(0, Math.sin(t * 9) - 0.6) * idle);

    let face = 'normal';
    if (dying) face = 'dead';
    else if (this.hitT >= 0 && this.hitT < 0.4) face = 'hurt';
    else if (this.attackT >= 0 && this.attackT < this.impactTime + 0.3) face = 'angry';
    this.setFace(face);
    this.applyEyes(this.eyes, face === 'angry' ? 0.12 : 0);
  }
}

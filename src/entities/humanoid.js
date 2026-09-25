// Procedural chibi humanoid (player fighter + NPC variants).
// Rig: root → hips → spine → chest → neck → head, chest → shoulders → arms, hips → legs.
// Character faces +Z, right hand side is -X.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../core/utils.js';

// ------------------------------------------------------------------ geometry helpers
function lathe(profile, segs = 20, phiStart = 0, phiLen = Math.PI * 2) {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segs, phiStart, phiLen);
}

// tapered, curved spike along a quadratic bezier (for hair / horns / ribbon tips)
function spikeGeometry(p0, p1, p2, r0, { segs = 7, radial = 6, flat = 0.55, tipPow = 0.9, twistUp = null } = {}) {
  const pts = [], tans = [];
  const q0 = new THREE.Vector3(), q1 = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, it = 1 - t;
    pts.push(new THREE.Vector3().addScaledVector(p0, it * it).addScaledVector(p1, 2 * it * t).addScaledVector(p2, t * t));
    q0.copy(p1).sub(p0).multiplyScalar(2 * it);
    q1.copy(p2).sub(p1).multiplyScalar(2 * t);
    tans.push(q0.clone().add(q1).normalize());
  }
  const up = twistUp ? twistUp.clone() : new THREE.Vector3(0, 1, 0);
  const pos = [], idx = [], cols = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const T = tans[i];
    let N = new THREE.Vector3().crossVectors(T, up);
    if (N.lengthSq() < 1e-6) N.set(1, 0, 0);
    N.normalize();
    const B = new THREE.Vector3().crossVectors(N, T).normalize();
    const r = r0 * Math.pow(1 - t, tipPow) + 0.0005;
    for (let k = 0; k < radial; k++) {
      const a = (k / radial) * Math.PI * 2;
      const v = pts[i].clone().addScaledVector(N, Math.cos(a) * r).addScaledVector(B, Math.sin(a) * r * flat);
      pos.push(v.x, v.y, v.z);
      const c = 0.55 + t * 0.55;
      cols.push(c, c, c);
    }
  }
  for (let i = 0; i < segs; i++) for (let k = 0; k < radial; k++) {
    const a = i * radial + k, b = i * radial + ((k + 1) % radial), c = (i + 1) * radial + k, d = (i + 1) * radial + ((k + 1) % radial);
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function roundedBox(w, h, d, r = 0.02, s = 3) {
  // simple rounded box via sphere-projected box
  const g = new THREE.BoxGeometry(w, h, d, s * 2, s * 2, s * 2);
  const p = g.attributes.position;
  const v = new THREE.Vector3(), inner = new THREE.Vector3();
  const hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    inner.set(THREE.MathUtils.clamp(v.x, -hx, hx), THREE.MathUtils.clamp(v.y, -hy, hy), THREE.MathUtils.clamp(v.z, -hz, hz));
    const n = v.clone().sub(inner);
    if (n.lengthSq() > 0) n.normalize().multiplyScalar(r);
    p.setXYZ(i, inner.x + n.x, inner.y + n.y, inner.z + n.z);
  }
  g.computeVertexNormals();
  return g;
}

function ellipsoid(rx, ry, rz, ws = 16, hs = 12) {
  const g = new THREE.SphereGeometry(1, ws, hs);
  g.scale(rx, ry, rz);
  return g;
}

function capsule(r, len, rs = 12, cs = 6) {
  return new THREE.CapsuleGeometry(r, len, cs, rs);
}

function mesh(geo, mat, parent, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = null, shadow = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  if (s) Array.isArray(s) ? m.scale.set(s[0], s[1], s[2]) : m.scale.setScalar(s);
  m.castShadow = shadow;
  m.receiveShadow = false;
  parent.add(m);
  return m;
}

function joint(name, parent, x = 0, y = 0, z = 0) {
  const j = new THREE.Group();
  j.name = name;
  j.position.set(x, y, z);
  parent.add(j);
  return j;
}

// ------------------------------------------------------------------ face texture atlas
// 2x2 atlas: [open | blink] / [angry | hurt]
function drawFaceAtlas(o) {
  const S = 512, F = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  const frames = [
    { fx: 0, fy: 0, mode: 'open' }, { fx: 1, fy: 0, mode: 'blink' },
    { fx: 0, fy: 1, mode: 'angry' }, { fx: 1, fy: 1, mode: 'hurt' },
  ];
  for (const fr of frames) {
    ctx.save();
    ctx.translate(fr.fx * F, fr.fy * F);
    ctx.beginPath(); ctx.rect(2, 2, F - 4, F - 4); ctx.clip();
    drawFace(ctx, F, fr.mode, o);
    ctx.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.repeat.set(0.5, 0.5);
  t.anisotropy = 4;
  return t;
}

function drawFace(ctx, F, mode, o) {
  const cx = F / 2;
  const eyeY = F * (o.eyeY ?? 0.56), eyeDX = F * (o.eyeSpacing ?? 0.165);
  const ew = F * 0.085 * (o.eyeScale ?? 1), eh = F * 0.125 * (o.eyeScale ?? 1) * (o.eyeAspect ?? 1);
  // blush
  if (o.blush !== false) {
    for (const s of [-1, 1]) {
      const g = ctx.createRadialGradient(cx + s * eyeDX * 1.25, eyeY + eh * 1.25, 1, cx + s * eyeDX * 1.25, eyeY + eh * 1.25, F * 0.07);
      g.addColorStop(0, 'rgba(255,120,120,0.42)'); g.addColorStop(1, 'rgba(255,120,120,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(cx + s * eyeDX * 1.25, eyeY + eh * 1.25, F * 0.075, F * 0.04, 0, 0, Math.PI * 2); ctx.fill();
    }
  }
  const lash = o.lashColor || '#2a1410';
  for (const s of [-1, 1]) {
    const ex = cx + s * eyeDX;
    // eyebrows
    ctx.strokeStyle = o.browColor || '#8a2a1a';
    ctx.lineWidth = F * (o.browWidth ?? 0.018);
    ctx.lineCap = 'round';
    ctx.beginPath();
    const browY = eyeY - eh * 1.25;
    if (mode === 'angry') {
      ctx.moveTo(ex + s * ew * 1.2, browY - eh * 0.25); ctx.lineTo(ex - s * ew * 0.9, browY + eh * 0.28);
    } else if (mode === 'hurt') {
      ctx.moveTo(ex + s * ew * 1.1, browY + eh * 0.1); ctx.lineTo(ex - s * ew * 0.9, browY - eh * 0.2);
    } else {
      const tilt = o.browTilt ?? 0.12;
      ctx.moveTo(ex + s * ew * 1.15, browY - eh * tilt); ctx.quadraticCurveTo(ex, browY - eh * 0.28, ex - s * ew * 1.0, browY + eh * tilt);
    }
    ctx.stroke();

    if (mode === 'blink') {
      ctx.strokeStyle = lash; ctx.lineWidth = F * 0.016;
      ctx.beginPath(); ctx.moveTo(ex - ew * 1.05, eyeY + eh * 0.15); ctx.quadraticCurveTo(ex, eyeY + eh * 0.55, ex + ew * 1.05, eyeY + eh * 0.15); ctx.stroke();
      continue;
    }
    if (mode === 'hurt') {
      ctx.strokeStyle = lash; ctx.lineWidth = F * 0.018;
      ctx.beginPath();
      ctx.moveTo(ex - s * ew, eyeY - eh * 0.45); ctx.lineTo(ex + s * ew * 0.9, eyeY); ctx.lineTo(ex - s * ew, eyeY + eh * 0.45);
      ctx.stroke();
      continue;
    }
    const squint = mode === 'angry' ? 0.72 : 1;
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(ex, eyeY, ew, eh * squint, 0, 0, Math.PI * 2);
    ctx.clip();
    // sclera
    ctx.fillStyle = '#fffaf6';
    ctx.fillRect(ex - ew * 2, eyeY - eh * 2, ew * 4, eh * 4);
    // iris
    const ir = o.irisColor || ['#ffcf5a', '#d9731f', '#6b2a0c'];
    const ig = ctx.createLinearGradient(0, eyeY - eh, 0, eyeY + eh);
    ig.addColorStop(0, ir[2]); ig.addColorStop(0.45, ir[1]); ig.addColorStop(1, ir[0]);
    ctx.fillStyle = ig;
    const irx = ex - s * ew * 0.08;
    ctx.beginPath(); ctx.ellipse(irx, eyeY + eh * 0.08, ew * 0.82, eh * 0.9, 0, 0, Math.PI * 2); ctx.fill();
    // pupil
    ctx.fillStyle = ir[2];
    ctx.beginPath(); ctx.ellipse(irx, eyeY + eh * 0.12, ew * 0.38, eh * 0.45, 0, 0, Math.PI * 2); ctx.fill();
    // upper shade from lid
    const sg = ctx.createLinearGradient(0, eyeY - eh, 0, eyeY);
    sg.addColorStop(0, 'rgba(40,15,10,0.55)'); sg.addColorStop(1, 'rgba(40,15,10,0)');
    ctx.fillStyle = sg; ctx.fillRect(ex - ew * 2, eyeY - eh * 1.2, ew * 4, eh * 1.2);
    // highlights
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath(); ctx.ellipse(irx - ew * 0.3, eyeY - eh * 0.3, ew * 0.28, eh * 0.2, -0.4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(irx + ew * 0.32, eyeY + eh * 0.42, ew * 0.13, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // upper lash line (thick) + wing
    ctx.strokeStyle = lash;
    ctx.lineWidth = F * 0.024;
    ctx.beginPath();
    ctx.ellipse(ex, eyeY, ew * 1.04, eh * squint * 1.02, 0, Math.PI * 1.08, Math.PI * 1.92);
    ctx.stroke();
    ctx.lineWidth = F * 0.014;
    ctx.beginPath();
    ctx.moveTo(ex + s * ew * 0.95, eyeY - eh * squint * 0.35);
    ctx.lineTo(ex + s * ew * 1.35, eyeY - eh * squint * 0.6);
    ctx.stroke();
    if (o.lashes) {
      ctx.beginPath();
      ctx.moveTo(ex + s * ew * 0.7, eyeY - eh * squint * 0.8);
      ctx.lineTo(ex + s * ew * 1.2, eyeY - eh * squint * 1.05);
      ctx.stroke();
    }
    // lower line
    ctx.lineWidth = F * 0.008;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.ellipse(ex, eyeY, ew * 0.95, eh * squint, 0, Math.PI * 0.25, Math.PI * 0.75);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // nose
  ctx.fillStyle = 'rgba(200,120,100,0.5)';
  ctx.beginPath(); ctx.ellipse(cx, eyeY + eh * 1.05, F * 0.008, F * 0.006, 0, 0, Math.PI * 2); ctx.fill();
  // mouth
  const my = eyeY + eh * 1.6;
  ctx.strokeStyle = '#8a3a2a'; ctx.lineWidth = F * 0.012; ctx.lineCap = 'round';
  ctx.beginPath();
  if (mode === 'angry') {
    ctx.fillStyle = '#7a2020';
    ctx.moveTo(cx - F * 0.035, my); ctx.quadraticCurveTo(cx, my + F * 0.045, cx + F * 0.035, my); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillRect(cx - F * 0.025, my, F * 0.05, F * 0.008);
  } else if (mode === 'hurt') {
    ctx.moveTo(cx - F * 0.025, my + F * 0.01); ctx.quadraticCurveTo(cx, my - F * 0.015, cx + F * 0.025, my + F * 0.01); ctx.stroke();
  } else {
    const smile = o.smile ?? 0.012;
    ctx.moveTo(cx - F * 0.028, my); ctx.quadraticCurveTo(cx, my + F * smile * 1.6, cx + F * 0.028, my); ctx.stroke();
  }
}

// deform a unit-ish sphere into a cute chibi head (wide cranium, soft narrower chin)
function deformHead(geo, R) {
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const ny = v.y / R;
    if (ny < 0) {
      const k = Math.min(1, -ny);
      const narrow = 1 - 0.22 * k * k;
      v.x *= narrow;
      v.z *= 1 - 0.1 * k * k;
      v.z += 0.04 * R * k * k * Math.max(0, v.z / R); // chin forward
      v.y *= 0.96;
    } else {
      v.x *= 1.02;
    }
    v.z *= 0.97;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

// ------------------------------------------------------------------ materials
export function makeMats(o) {
  const std = (color, rough = 0.7, metal = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
  return {
    skin: std(o.skin || '#ffdcc4', 0.62, 0, { }),
    hair: std(o.hairColor || '#d8322a', 0.48, 0.05, { vertexColors: true }),
    armor: std(o.armorColor || '#c3262c', 0.38, 0.35),
    armorDark: std(o.armorDark || '#7d1519', 0.45, 0.3),
    gold: std(o.trimColor || '#e8b44a', 0.28, 0.92),
    cloth: std(o.clothColor || '#2c2433', 0.85, 0),
    cloth2: std(o.cloth2Color || '#efe6d8', 0.8, 0),
    leather: std(o.leatherColor || '#6a3e22', 0.7, 0.05),
    boot: std(o.bootColor || '#b22228', 0.42, 0.3),
    steel: std('#d9e0ea', 0.22, 0.95),
    gem: std(o.gemColor || '#3aa0ff', 0.1, 0.2, { emissive: new THREE.Color(o.gemColor || '#3aa0ff'), emissiveIntensity: 0.6 }),
    eyeWhite: std('#ffffff', 0.3, 0),
    ribbon: std(o.ribbonColor || '#f4f0e6', 0.75, 0, { side: THREE.DoubleSide }),
  };
}

// ------------------------------------------------------------------ weapon builders
export function buildSword(mats, style = 'broad') {
  const g = new THREE.Group();
  g.name = 'sword';
  // blade profile (along +Y), grip centre at origin
  const L = style === 'broad' ? 1.02 : 0.85, W = style === 'broad' ? 0.075 : 0.05;
  const s = new THREE.Shape();
  s.moveTo(-W, 0);
  s.lineTo(-W * 1.05, L * 0.55);
  s.quadraticCurveTo(-W * 1.1, L * 0.86, -W * 0.25, L * 0.98);
  s.lineTo(0, L);
  s.lineTo(W * 0.25, L * 0.98);
  s.quadraticCurveTo(W * 1.1, L * 0.86, W * 1.05, L * 0.55);
  s.lineTo(W, 0);
  s.lineTo(-W, 0);
  const blade = new THREE.ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.014, bevelSegments: 2, curveSegments: 10 });
  blade.translate(0, 0, -0.006);
  mesh(blade, mats.steel, g, { y: 0.1 });
  // fuller (groove) — darker inset strip on both faces
  const fullerMat = new THREE.MeshStandardMaterial({ color: '#8c97a8', roughness: 0.3, metalness: 0.9 });
  const fuller = roundedBox(W * 0.5, L * 0.62, 0.02, 0.008, 1);
  mesh(fuller, fullerMat, g, { y: 0.1 + L * 0.36, s: [1, 1, 1.35] });
  // engraved runes glow line
  const rune = new THREE.MeshStandardMaterial({ color: '#ff9a3a', emissive: '#ff6a1a', emissiveIntensity: 1.6, roughness: 0.4 });
  for (const zz of [-1, 1]) mesh(roundedBox(W * 0.16, L * 0.45, 0.004, 0.002, 1), rune, g, { y: 0.1 + L * 0.34, z: zz * 0.0145 });
  // crossguard with curled ends
  const guard = roundedBox(0.34, 0.055, 0.075, 0.02, 2);
  mesh(guard, mats.gold, g, { y: 0.085 });
  for (const sx of [-1, 1]) {
    const curl = new THREE.TorusGeometry(0.035, 0.016, 8, 16, Math.PI * 1.4);
    mesh(curl, mats.gold, g, { x: sx * 0.18, y: 0.115, rz: sx > 0 ? -0.2 : Math.PI + 0.2 - Math.PI * 0.4 });
  }
  mesh(ellipsoid(0.05, 0.055, 0.03), mats.gem, g, { y: 0.09, z: 0.035 });
  mesh(ellipsoid(0.05, 0.055, 0.03), mats.gem, g, { y: 0.09, z: -0.035 });
  // grip with wraps
  mesh(new THREE.CylinderGeometry(0.026, 0.028, 0.2, 10), mats.leather, g, { y: -0.02 });
  for (let i = 0; i < 5; i++) mesh(new THREE.TorusGeometry(0.029, 0.006, 5, 12), mats.leather, g, { y: -0.1 + i * 0.043, rx: Math.PI / 2 + 0.25 });
  // pommel
  mesh(new THREE.SphereGeometry(0.042, 12, 10), mats.gold, g, { y: -0.14 });
  mesh(ellipsoid(0.02, 0.02, 0.02), mats.gem, g, { y: -0.14, z: 0.036 });
  g.userData.tipLocal = new THREE.Vector3(0, 0.1 + L, 0);
  g.userData.baseLocal = new THREE.Vector3(0, 0.2, 0);
  return g;
}

function buildSpear(mats) {
  const g = new THREE.Group();
  mesh(new THREE.CylinderGeometry(0.022, 0.022, 2.1, 8), mats.leather, g, { y: 0.35 });
  mesh(new THREE.ConeGeometry(0.05, 0.3, 4), mats.steel, g, { y: 1.55 });
  mesh(new THREE.TorusGeometry(0.03, 0.01, 6, 10), mats.gold, g, { y: 1.4, rx: Math.PI / 2 });
  return g;
}

// ------------------------------------------------------------------ main builder
export const JOINTS = ['hips', 'spine', 'chest', 'neck', 'head', 'armL', 'elbowL', 'handL', 'armR', 'elbowR', 'handR', 'legL', 'kneeL', 'footL', 'legR', 'kneeR', 'footR'];

export function createHumanoid(o = {}) {
  const mats = makeMats(o);
  const root = new THREE.Group();
  root.name = o.name || 'humanoid';
  const S = o.scale || 1;
  const body = new THREE.Group();
  body.scale.setScalar(S);
  root.add(body);

  const J = {};
  const LS = o.legScale || 1, AS = o.armScale || 1, SW = o.shoulderW || 0.175;
  const HIP_Y = 0.08 + 0.56 * LS;
  const sy = (prof, k) => prof.map(([r, y]) => [r, y * k]);
  J.hips = joint('hips', body, 0, HIP_Y, 0);
  J.spine = joint('spine', J.hips, 0, 0.07, 0);
  J.chest = joint('chest', J.spine, 0, 0.15, 0);
  J.neck = joint('neck', J.chest, 0, 0.17, 0);
  J.head = joint('head', J.neck, 0, 0.06, 0);
  J.armL = joint('armL', J.chest, SW, 0.115, 0);
  J.elbowL = joint('elbowL', J.armL, 0, -0.19 * AS, 0);
  J.handL = joint('handL', J.elbowL, 0, -0.17 * AS, 0);
  J.armR = joint('armR', J.chest, -SW, 0.115, 0);
  J.elbowR = joint('elbowR', J.armR, 0, -0.19 * AS, 0);
  J.handR = joint('handR', J.elbowR, 0, -0.17 * AS, 0);
  J.legL = joint('legL', J.hips, 0.085, -0.03, 0);
  J.kneeL = joint('kneeL', J.legL, 0, -0.29 * LS, 0);
  J.footL = joint('footL', J.kneeL, 0, -0.27 * LS, 0);
  J.legR = joint('legR', J.hips, -0.085, -0.03, 0);
  J.kneeR = joint('kneeR', J.legR, 0, -0.29 * LS, 0);
  J.footR = joint('footR', J.kneeR, 0, -0.27 * LS, 0);

  const outfit = o.outfit || 'fighter';
  const isArmor = outfit === 'fighter' || outfit === 'guard';

  // ---------------- pelvis / torso
  mesh(ellipsoid(0.135, 0.09, 0.1), mats.cloth, J.hips, { y: -0.01 });
  const torsoProfile = [[0.001, -0.02], [0.115, -0.02], [0.12, 0.04], [0.112, 0.1], [0.125, 0.18], [0.14, 0.26], [0.135, 0.31], [0.1, 0.35], [0.05, 0.37], [0.001, 0.37]];
  const torso = lathe(torsoProfile, 22);
  torso.scale(1, 1, 0.78);
  mesh(torso, outfit === 'fighter' ? mats.cloth : mats.cloth2, J.spine, { y: -0.03 });

  if (isArmor) {
    // breastplate (front + back shell)
    const bp = lathe([[0.118, 0.1], [0.133, 0.16], [0.152, 0.24], [0.15, 0.3], [0.125, 0.345], [0.08, 0.37]], 24);
    bp.scale(1.02, 1, 0.84);
    mesh(bp, mats.armor, J.spine, { y: -0.03 });
    // gold trim bands
    const band = new THREE.TorusGeometry(0.121, 0.011, 6, 28); band.rotateX(Math.PI / 2); band.scale(1.02, 1, 0.86);
    mesh(band, mats.gold, J.spine, { y: 0.07 });
    const band2 = new THREE.TorusGeometry(0.13, 0.009, 6, 28); band2.rotateX(Math.PI / 2); band2.scale(0.98, 1, 0.8);
    mesh(band2, mats.gold, J.spine, { y: 0.305 });
    // chest emblem
    const em = new THREE.OctahedronGeometry(0.04, 0); em.scale(0.8, 1.1, 0.35);
    mesh(em, mats.gold, J.spine, { y: 0.2, z: 0.128 });
    mesh(ellipsoid(0.018, 0.022, 0.012), mats.gem, J.spine, { y: 0.2, z: 0.14 });
    // abdomen plates
    for (let i = 0; i < 2; i++) {
      const ab = lathe([[0.118 - i * 0.004, 0], [0.122 - i * 0.004, 0.035], [0.114 - i * 0.004, 0.045]], 22, -1.3, 2.6 + Math.PI);
      ab.scale(1, 1, 0.82);
      mesh(ab, mats.armorDark, J.spine, { y: 0.0 + i * 0.045 - 0.02, ry: Math.PI / 2 });
    }
    // collar
    const collar = lathe([[0.075, 0], [0.082, 0.04], [0.09, 0.075]], 18);
    collar.scale(1, 1, 0.9);
    mesh(collar, mats.armor, J.chest, { y: 0.12 });
    const ctrim = new THREE.TorusGeometry(0.09, 0.008, 6, 20); ctrim.rotateX(Math.PI / 2);
    mesh(ctrim, mats.gold, J.chest, { y: 0.196, s: [1, 1, 0.9] });
  } else if (outfit === 'robe' || outfit === 'merchant' || outfit === 'dress') {
    const robeCol = outfit === 'merchant' ? mats.cloth : mats.cloth;
    const robe = lathe([[0.13, 0.33], [0.15, 0.22], [0.14, 0.1], [0.15, 0.0], [0.2, -0.25], [0.26, -0.55], [0.27, -0.6]], 24);
    robe.scale(1, 1, 0.9);
    mesh(robe, robeCol, J.spine, { y: 0 });
    const hem = new THREE.TorusGeometry(0.265, 0.012, 6, 28); hem.rotateX(Math.PI / 2); hem.scale(1, 1, 0.9);
    mesh(hem, mats.gold, J.spine, { y: -0.595 });
    const sash = new THREE.TorusGeometry(0.15, 0.02, 6, 24); sash.rotateX(Math.PI / 2); sash.scale(1, 1, 0.9);
    mesh(sash, mats.leather, J.spine, { y: 0.02 });
  }
  // belt
  const belt = new THREE.TorusGeometry(0.128, 0.022, 8, 28); belt.rotateX(Math.PI / 2); belt.scale(1.02, 1, 0.84);
  mesh(belt, mats.leather, J.hips, { y: 0.045 });
  mesh(roundedBox(0.06, 0.048, 0.02, 0.008), mats.gold, J.hips, { y: 0.045, z: 0.112 });
  const flaps = [];
  if (o.tabard) {
    const tabMat = new THREE.MeshStandardMaterial({ color: o.tabardColor || '#8e1a22', roughness: 0.8, side: THREE.DoubleSide });
    for (const [zz, dir] of [[0.118, 1], [-0.112, -1]]) {
      const pivot = new THREE.Group();
      pivot.position.set(0, 0.03, zz);
      J.hips.add(pivot);
      const len = 0.3 * LS;
      const g = new THREE.PlaneGeometry(0.15, len, 2, 6);
      g.translate(0, -len / 2, 0);
      const gp = g.attributes.position;
      for (let i = 0; i < gp.count; i++) { const yy = gp.getY(i), xx = gp.getX(i); gp.setX(i, xx * (1 + (-yy / len) * 0.25)); gp.setZ(i, dir * (Math.cos(xx * 12) * 0.006)); }
      g.computeVertexNormals();
      const fm = mesh(g, tabMat, pivot);
      const trim = roundedBox(0.19, 0.022, 0.012, 0.006, 1);
      mesh(trim, mats.gold, pivot, { y: -len + 0.012 });
      const em = new THREE.CircleGeometry(0.03, 12);
      mesh(em, mats.gold, pivot, { y: -len * 0.45, z: dir * 0.004, ry: dir < 0 ? Math.PI : 0 });
      flaps.push({ pivot, dir });
    }
  }

  // ---------------- tassets (hang from thighs so they move with the legs)
  if (isArmor) {
    for (const [jn, sx] of [['legL', 1], ['legR', -1]]) {
      const plate = roundedBox(0.11, 0.13, 0.022, 0.012, 2);
      const t1 = mesh(plate, mats.armor, J[jn], { x: sx * 0.02, y: -0.02, z: 0.1, rx: -0.12 });
      const trim = roundedBox(0.115, 0.018, 0.026, 0.008, 1);
      mesh(trim, mats.gold, t1, { y: -0.062 });
      const side = mesh(plate, mats.armorDark, J[jn], { x: sx * 0.1, y: -0.01, z: 0.0, ry: sx * Math.PI / 2, rz: sx * 0.12, s: [0.9, 0.95, 1] });
      mesh(trim, mats.gold, side, { y: -0.062 });
    }
    const back = roundedBox(0.2, 0.12, 0.022, 0.012, 2);
    const bk = mesh(back, mats.armorDark, J.hips, { y: -0.06, z: -0.105, rx: 0.15 });
    mesh(roundedBox(0.205, 0.018, 0.026, 0.008, 1), mats.gold, bk, { y: -0.058 });
  }

  // ---------------- legs
  for (const [side, sx] of [['L', 1], ['R', -1]]) {
    const leg = J['leg' + side], knee = J['knee' + side], foot = J['foot' + side];
    const thighMat = outfit === 'dress' ? mats.cloth2 : mats.cloth;
    mesh(lathe(sy([[0.001, 0.01], [0.07, 0.0], [0.072, -0.06], [0.064, -0.2], [0.056, -0.29], [0.001, -0.3]], LS), 14), thighMat, leg);
    mesh(lathe(sy([[0.001, 0.0], [0.056, -0.01], [0.052, -0.12], [0.044, -0.24], [0.001, -0.27]], LS), 14), thighMat, knee);
    // boots
    const bootMat = isArmor ? mats.boot : mats.leather;
    const shin = lathe(sy([[0.058, 0.0], [0.062, -0.06], [0.058, -0.16], [0.056, -0.22], [0.066, -0.27]], LS), 16);
    mesh(shin, bootMat, knee, { y: -0.02 });
    if (isArmor) {
      // shin guard + knee cop
      const guard = lathe(sy([[0.001, 0.02], [0.05, 0.0], [0.062, -0.08], [0.055, -0.17], [0.001, -0.2]], LS), 12, -1.2, 2.4);
      guard.rotateY(Math.PI / 2);
      guard.scale(1.2, 1, 0.9);
      mesh(guard, mats.armor, knee, { y: -0.03, z: 0.012 });
      const kc = new THREE.SphereGeometry(0.058, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5);
      kc.rotateX(Math.PI / 2 - 0.15);
      mesh(kc, mats.gold, knee, { y: 0.01, z: 0.02, s: [1.05, 1.15, 0.55] });
      const cuff = new THREE.TorusGeometry(0.064, 0.011, 6, 18); cuff.rotateX(Math.PI / 2);
      mesh(cuff, mats.gold, knee, { y: -0.06 });
    }
    // foot
    const footG = roundedBox(0.12, 0.085, 0.22, 0.04, 3);
    const fm = mesh(footG, bootMat, foot, { y: -0.025, z: 0.045 });
    if (isArmor) {
      mesh(roundedBox(0.125, 0.04, 0.09, 0.02, 2), mats.gold, foot, { y: -0.005, z: 0.12, rx: 0.25 });
      mesh(roundedBox(0.128, 0.022, 0.226, 0.01, 1), mats.armorDark, foot, { y: -0.062, z: 0.045 });
    } else {
      mesh(roundedBox(0.126, 0.02, 0.226, 0.01, 1), mats.cloth, foot, { y: -0.062, z: 0.045 });
    }
  }

  // ---------------- arms
  for (const [side, sx] of [['L', 1], ['R', -1]]) {
    const arm = J['arm' + side], elbow = J['elbow' + side], hand = J['hand' + side];
    const sleeveMat = outfit === 'fighter' ? mats.cloth : outfit === 'guard' ? mats.cloth : mats.cloth2;
    mesh(lathe(sy([[0.001, 0.03], [0.05, 0.02], [0.052, -0.06], [0.046, -0.17], [0.001, -0.2]], AS), 12), sleeveMat, arm);
    mesh(ellipsoid(0.042, 0.042, 0.042), sleeveMat, elbow);
    const fore = lathe(sy([[0.001, 0.0], [0.044, -0.01], [0.046, -0.06], [0.04, -0.15], [0.001, -0.17]], AS), 12);
    mesh(fore, outfit === 'fighter' || outfit === 'guard' ? mats.cloth : mats.skin, elbow);
    if (isArmor) {
      // gauntlet
      const gaunt = lathe(sy([[0.048, 0.0], [0.058, -0.04], [0.054, -0.1], [0.05, -0.155]], AS), 14);
      mesh(gaunt, mats.armor, elbow, { y: -0.01 });
      const gc = new THREE.TorusGeometry(0.06, 0.012, 6, 16); gc.rotateX(Math.PI / 2);
      mesh(gc, mats.gold, elbow, { y: -0.04 });
      // pauldron (on shoulder joint so it follows the arm)
      const pd = new THREE.SphereGeometry(0.1, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55);
      pd.scale(1.05, 0.85, 1.0);
      const pm = mesh(pd, mats.armor, arm, { x: sx * 0.018, y: 0.02, rz: sx * -0.35 });
      const pd2 = new THREE.SphereGeometry(0.1, 18, 8, 0, Math.PI * 2, Math.PI * 0.36, Math.PI * 0.2);
      pd2.scale(1.12, 0.9, 1.08);
      mesh(pd2, mats.armorDark, pm, { y: -0.02 });
      const rim = new THREE.TorusGeometry(0.083, 0.011, 6, 22); rim.rotateX(Math.PI / 2);
      mesh(rim, mats.gold, pm, { y: -0.005 });
      const spike = new THREE.ConeGeometry(0.02, 0.05, 8);
      mesh(spike, mats.gold, pm, { y: 0.09 });
      mesh(ellipsoid(0.022, 0.022, 0.012), mats.gem, pm, { y: 0.045, x: sx * 0.07, ry: sx * Math.PI / 2 });
    } else {
      const cuff = new THREE.TorusGeometry(0.046, 0.012, 6, 16); cuff.rotateX(Math.PI / 2);
      mesh(cuff, mats.gold, elbow, { y: -0.14 });
    }
    // hand (mitten fist + thumb)
    const handMat = isArmor ? mats.leather : mats.skin;
    mesh(roundedBox(0.075, 0.08, 0.07, 0.03, 2), handMat, hand, { y: -0.035 });
    mesh(ellipsoid(0.02, 0.032, 0.02), handMat, hand, { x: sx * 0.035, y: -0.03, z: 0.028, rz: sx * 0.5 });
  }

  // ---------------- head
  const R = o.headR || 0.265;
  J.head.position.y = 0.05;
  const headPivot = new THREE.Group();
  headPivot.position.y = R * 0.92;
  J.head.add(headPivot);
  mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.1, 10), mats.skin, J.neck, { y: 0.02 });
  const headGeo = deformHead(new THREE.SphereGeometry(R, 36, 28), R);
  const headMesh = mesh(headGeo, mats.skin, headPivot);
  // ears
  for (const sx of [-1, 1]) mesh(ellipsoid(0.035, 0.055, 0.03), mats.skin, headPivot, { x: sx * R * 0.98, y: -0.02, z: -0.01, rz: sx * 0.2 });
  // face decal
  const faceTex = drawFaceAtlas(o.face || {});
  const faceMat = new THREE.MeshStandardMaterial({ map: faceTex, transparent: true, roughness: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const faceGeo = new THREE.SphereGeometry(R * 1.004, 32, 24, Math.PI / 2 - 1.05, 2.1, Math.PI * 0.3, Math.PI * 0.5);
  deformHead(faceGeo, R * 1.004);
  const face = mesh(faceGeo, faceMat, headPivot, { shadow: false });
  face.renderOrder = 2;
  const setExpression = (mode) => {
    const map = { open: [0, 0.5], blink: [0.5, 0.5], angry: [0, 0], hurt: [0.5, 0] };
    const [ox, oy] = map[mode] || map.open;
    faceTex.offset.set(ox, oy);
  };
  setExpression('open');

  // ---------------- hair
  const hair = buildHair(o.hair || 'spiky', R, mats.hair, o);
  headPivot.add(hair);

  // headband with ribbon tails (secondary motion)
  const tails = [];
  if (o.headband !== false && (o.hair || 'spiky') === 'spiky') {
    const hb = new THREE.TorusGeometry(R * 1.015, 0.024, 6, 36, Math.PI * 1.25);
    hb.rotateX(Math.PI / 2);
    hb.rotateY(Math.PI * 0.62);
    hb.scale(1.02, 1, 0.98);
    mesh(hb, mats.ribbon, headPivot, { y: R * 0.26, rx: -0.2 });
    const knot = new THREE.Group();
    knot.position.set(0, R * 0.25, -R * 0.98);
    headPivot.add(knot);
    mesh(ellipsoid(0.03, 0.035, 0.025), mats.ribbon, knot);
    for (const sx of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(sx * 0.02, 0, -0.01);
      knot.add(pivot);
      const segs = [];
      let parent = pivot;
      for (let i = 0; i < 4; i++) {
        const seg = new THREE.Group();
        seg.position.y = i === 0 ? 0 : -0.075;
        parent.add(seg);
        const plane = new THREE.PlaneGeometry(0.05 - i * 0.006, 0.08);
        plane.translate(0, -0.04, 0);
        mesh(plane, mats.ribbon, seg, { shadow: true });
        segs.push(seg);
        parent = seg;
      }
      tails.push({ segs, side: sx });
    }
  }

  // ---------------- extras per outfit
  if (o.hat === 'guard') {
    const helm = new THREE.SphereGeometry(R * 1.1, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.5);
    mesh(helm, mats.armor, headPivot, { y: R * 0.05 });
    const brim = new THREE.TorusGeometry(R * 1.08, 0.02, 6, 30); brim.rotateX(Math.PI / 2);
    mesh(brim, mats.gold, headPivot, { y: R * 0.08 });
    mesh(new THREE.ConeGeometry(0.03, 0.12, 8), mats.gold, headPivot, { y: R * 1.15 });
  } else if (o.hat === 'wizard') {
    const cone = new THREE.ConeGeometry(R * 0.9, R * 2.2, 20, 4, true);
    const hm = mesh(cone, mats.armor, headPivot, { y: R * 1.4, rx: -0.15 });
    hm.material = mats.armor;
    const brim = new THREE.CylinderGeometry(R * 1.6, R * 1.6, 0.02, 28);
    mesh(brim, mats.armor, headPivot, { y: R * 0.45 });
  } else if (o.hat === 'cap') {
    const cap = new THREE.SphereGeometry(R * 1.06, 24, 10, 0, Math.PI * 2, 0, Math.PI * 0.42);
    mesh(cap, mats.armorDark, headPivot, { y: R * 0.12 });
    const vis = new THREE.CylinderGeometry(R * 0.6, R * 0.6, 0.015, 20, 1, false, -Math.PI / 2, Math.PI);
    mesh(vis, mats.armorDark, headPivot, { y: R * 0.42, z: R * 0.5, rx: 0.2, s: [1, 1, 0.7] });
  }
  if (o.beard) {
    const b = new THREE.SphereGeometry(R * 0.7, 18, 12, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.5);
    b.scale(1, 1.25, 0.85);
    mesh(b, mats.hair, headPivot, { y: -R * 0.35, z: R * 0.25 });
  }
  if (o.apron) {
    const ap = roundedBox(0.2, 0.38, 0.015, 0.01, 1);
    mesh(ap, mats.leather, J.spine, { y: -0.08, z: 0.13, rx: 0.12 });
  }
  if (o.cape) {
    const capeGeo = new THREE.PlaneGeometry(0.34, 0.62, 6, 8);
    capeGeo.translate(0, -0.31, 0);
    const cp = capeGeo.attributes.position;
    for (let i = 0; i < cp.count; i++) { const x = cp.getX(i); cp.setZ(i, -Math.cos((x / 0.17) * 1.2) * 0.04); }
    capeGeo.computeVertexNormals();
    const capeMat = new THREE.MeshStandardMaterial({ color: o.capeColor || '#2a4fa8', roughness: 0.8, side: THREE.DoubleSide });
    const cape = mesh(capeGeo, capeMat, J.chest, { y: 0.15, z: -0.11, rx: 0.08 });
    root.userData.cape = cape;
  }

  // ---------------- weapon
  let weapon = null;
  const weaponHolder = new THREE.Group();
  weaponHolder.position.set(0, -0.045, 0.0);
  weaponHolder.rotation.x = Math.PI / 2;
  J.handR.add(weaponHolder);
  if (o.weapon === 'sword') weapon = buildSword(mats, o.swordStyle || 'broad');
  else if (o.weapon === 'spear') weapon = buildSpear(mats);
  if (weapon) weaponHolder.add(weapon);
  // off-hand holder (dual blades)
  const weaponHolderL = new THREE.Group();
  weaponHolderL.position.set(0, -0.045, 0.0);
  weaponHolderL.rotation.x = Math.PI / 2;
  J.handL.add(weaponHolderL);

  root.traverse((ob) => { if (ob.isMesh) ob.frustumCulled = true; });

  const rigOut = {
    root, body, joints: J, mats, weapon, weaponHolder, weaponHolderL, headPivot, headMesh, face, hair,
    tails, flaps, setExpression, hipY: HIP_Y, headRadius: R, scale: S,
    height: (HIP_Y + 0.5 + R * 2) * S,
  };
  optimizeRig(rigOut);
  return rigOut;
}

// Merge rigid meshes that share a joint + material into single meshes (fewer draw calls)
function optimizeRig(rig) {
  const jointSet = new Set(Object.values(rig.joints));
  const animated = new Set();
  for (const t of rig.tails) for (const sg of t.segs) animated.add(sg);
  for (const f of rig.flaps || []) animated.add(f.pivot);
  const roots = [...jointSet, rig.headPivot];
  if (rig.weapon) roots.push(rig.weapon);
  const stop = (o) => jointSet.has(o) || o === rig.headPivot || o === rig.weaponHolder || o === rig.weaponHolderL || o === rig.weapon || animated.has(o);
  rig.root.updateMatrixWorld(true);
  for (const j of roots) {
    const inv = new THREE.Matrix4().copy(j.matrixWorld).invert();
    const buckets = new Map();
    const victims = [];
    const visit = (o) => {
      for (const c of [...o.children]) {
        if (stop(c)) continue;
        if (c.isMesh && c !== rig.face && c !== rig.hair && !c.material.transparent) {
          const m = new THREE.Matrix4().multiplyMatrices(inv, c.matrixWorld);
          const key = c.material.uuid + (c.castShadow ? 's' : 'n');
          if (!buckets.has(key)) buckets.set(key, { mat: c.material, shadow: c.castShadow, geos: [] });
          let g = c.geometry.index ? c.geometry.toNonIndexed() : c.geometry.clone();
          for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
          if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
          if (!g.attributes.normal) g.computeVertexNormals();
          g.applyMatrix4(m);
          buckets.get(key).geos.push(g);
          victims.push(c);
        }
        visit(c);
      }
    };
    visit(j);
    for (const v of victims) {
      // keep any non-merged children (e.g. animated groups) attached to the parent
      for (const ch of [...v.children]) if (!victims.includes(ch)) v.parent.attach(ch);
      v.parent.remove(v);
    }
    for (const { mat, shadow, geos } of buckets.values()) {
      const merged = mergeGeometries(geos, false);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = shadow;
      j.add(mesh);
    }
  }
}

// ------------------------------------------------------------------ hair styles
function buildHair(style, R, mat, o) {
  const rng = mulberry32(o.hairSeed || 7);
  const geos = [];
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  // hair cap covering the skull (top + back), slightly bigger than the head
  const capR = style === 'spiky' ? R * 1.035 : R * 1.07;
  const cap = new THREE.SphereGeometry(capR, 32, 20, 0, Math.PI * 2, 0, Math.PI * (style === 'long' || style === 'bob' ? 0.62 : 0.58));
  deformHead(cap, capR);
  // push the front of the cap up so the forehead shows
  const cp = cap.attributes.position;
  const cols = [];
  for (let i = 0; i < cp.count; i++) {
    const x = cp.getX(i), y = cp.getY(i), z = cp.getZ(i);
    const front = Math.max(0, z / capR);
    const lift = front * front * R * 0.35 * Math.max(0, 1 - y / R);
    cp.setY(i, y + lift * 0.9);
    cp.setZ(i, z - lift * 0.25);
    const c = 0.7 + (y / R) * 0.3;
    cols.push(c, c, c);
  }
  cap.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  cap.computeVertexNormals();
  geos.push(cap);

  const onHead = (theta, phi, r = R * 1.02) => V(Math.sin(theta) * Math.sin(phi) * r, Math.cos(theta) * r, Math.sin(theta) * Math.cos(phi) * r);

  const addSpike = (theta, phi, len, rad, dir, bend, flat = 0.55) => {
    const p0 = onHead(theta, phi, R * 0.96);
    const d = dir.clone().normalize();
    const p2 = p0.clone().addScaledVector(d, len).add(bend.clone().multiplyScalar(len));
    const p1 = p0.clone().addScaledVector(d, len * 0.55);
    geos.push(spikeGeometry(p0, p1, p2, rad, { flat, segs: 7, radial: 6 }));
  };

  if (style === 'spiky') {
    const clump = (theta, phi, len, rad, dir, bend, flat = 0.42) => addSpike(theta, phi, R * len, R * rad, dir, bend, flat);
    // crown clumps sweeping up & back like flames
    const crown = [[0.18, 0.0, 1.05], [0.3, 0.9, 0.95], [0.3, -0.9, 0.95], [0.42, 2.0, 0.9], [0.42, -2.0, 0.9], [0.35, Math.PI, 1.0], [0.55, 2.6, 0.85], [0.55, -2.6, 0.85]];
    for (const [th, ph, l] of crown) {
      const n = onHead(th, ph).normalize();
      clump(th, ph, l * (0.9 + rng() * 0.2), 0.36, n.clone().add(V(0, 0.55, -0.75)).normalize(), V(0, -0.12, -0.25));
    }
    // front top spikes flicking up & back from the hairline
    for (const ph of [-0.55, -0.15, 0.25, 0.62]) {
      clump(0.48, ph, 0.85 + rng() * 0.2, 0.3, V(Math.sin(ph) * 0.3, 1, -0.2).normalize(), V(Math.sin(ph) * 0.2, -0.2, -0.45));
    }
    // side clumps over the ears, sweeping back & out
    for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) {
      const ph = sx * (1.25 + i * 0.32), th = 0.95 + i * 0.22;
      const n = onHead(th, ph).normalize();
      clump(th, ph, 0.62 + rng() * 0.15, 0.3, n.clone().add(V(0, -0.35, -0.55)).normalize(), V(sx * 0.12, -0.12, -0.1));
    }
    // back clumps pointing down/back
    for (let i = 0; i < 11; i++) {
      const ph = Math.PI + (i - 5) * 0.27, th = 0.8 + (i % 3) * 0.3;
      const n = onHead(th, ph).normalize();
      clump(th, ph, 0.7 + rng() * 0.2, 0.32, n.clone().add(V(0, -0.55, 0)).normalize(), V(0, -0.2, -0.05));
    }
    // bangs falling over the forehead
    const bangs = [[-0.72, 0.62], [-0.4, 0.82], [-0.08, 0.9], [0.26, 0.84], [0.58, 0.72], [0.82, 0.55]];
    for (const [ph, l] of bangs) {
      const th = 0.5 + Math.abs(ph) * 0.18;
      clump(th, ph, l, 0.27, V(Math.sin(ph) * 0.25, -0.62, 0.72).normalize(), V(Math.sin(ph) * 0.22 + (rng() - 0.5) * 0.12, -0.28, 0.02), 0.38);
    }
    // ahoge
    addSpike(0.08, 0.3, R * 0.65, R * 0.1, V(0.15, 1, 0.55), V(0.1, -0.4, 0.3), 0.35);
  } else if (style === 'long' || style === 'bob' || style === 'ponytail') {
    const long = style === 'long';
    // curtain strands around sides/back
    const n = 22;
    for (let i = 0; i < n; i++) {
      const phi = Math.PI * 0.35 + (i / (n - 1)) * Math.PI * 1.3;
      const theta = 0.9 + rng() * 0.2;
      const base = onHead(theta, phi).normalize();
      const len = style === 'bob' ? R * 0.75 : long ? R * (1.8 + rng() * 0.4) : R * 0.6;
      const dir = V(base.x * 0.25, -1, base.z * 0.25).normalize();
      addSpike(theta, phi, len, R * 0.3, dir, V(base.x * 0.2, 0, base.z * 0.2), 0.5);
    }
    const bangs = [[-0.5, 0.5], [-0.2, 0.6], [0.1, 0.62], [0.4, 0.55]];
    for (const [phi, len] of bangs) {
      const dir = V(Math.sin(phi) * 0.3, -0.8, 0.5).normalize();
      addSpike(0.62, phi, R * len, R * 0.24, dir, V(0, -0.05, 0.1), 0.45);
    }
    if (style === 'ponytail') {
      const p0 = V(0, R * 0.55, -R * 0.95);
      geos.push(spikeGeometry(p0, V(0, R * 0.9, -R * 1.6), V(0, -R * 0.6, -R * 1.7), R * 0.35, { flat: 0.8, segs: 10 }));
    }
  } else if (style === 'short') {
    for (let i = 0; i < 16; i++) {
      const phi = (i / 16) * Math.PI * 2;
      const theta = 0.5 + rng() * 0.6;
      const base = onHead(theta, phi).normalize();
      addSpike(theta, phi, R * 0.3, R * 0.25, base.clone().add(V(0, -0.2, -0.2)).normalize(), V(0, -0.1, 0));
    }
  } else if (style === 'bald') {
    geos.length = 0;
  }
  if (!geos.length) return new THREE.Group();
  const merged = mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => {
    if (!g.attributes.color) {
      const c = new Float32Array(g.attributes.position.count * 3).fill(1);
      g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    }
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
    return g;
  }));
  const m = new THREE.Mesh(merged, mat);
  m.castShadow = true;
  m.name = 'hair';
  return m;
}

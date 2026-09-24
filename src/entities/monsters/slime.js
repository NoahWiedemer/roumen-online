// Slime + King Slime — ONE shared model/animation code path.
// Classic MMO field slime: plump opaque glossy teardrop with a pointed, curled tip, cheeky toothy grin,
// big round eyes with small pupils and a polka-dot headband (own design) whose knot tails flutter.
// King Slime = same model with { ~3.2× scale, royal purple, jewelled crown, goo cape + ermine collar, heavy timings }.
import * as THREE from 'three';
import { tex, makeCanvas, toTexture } from '../../core/textures.js';
import {
  MonsterBase, once, smoothProfile, latheSurface, lathePatch, eyeDomeGeo, placeEye, faceCanvas, draw,
  envTexture, weldNormals, setShearTransform, Spring, track, ease, seg, bump, clamp, lerp, merge, profileRadius,
  RingFx, colorize, mergeColored, orientedCopy, TAU,
} from './common.js';

// ------------------------------------------------------------------ shared shape (unit slime, 0.8 m tall)
const PROFILE = once(() =>
  smoothProfile(
    [
      [0.0, 0.0], [0.29, 0.004], [0.405, 0.028], [0.468, 0.085], [0.488, 0.17], [0.478, 0.27], [0.44, 0.37],
      [0.365, 0.468], [0.265, 0.552], [0.165, 0.622], [0.092, 0.678], [0.046, 0.724], [0.018, 0.764], [0.0, 0.8],
    ],
    48
  )
);
const FACE_BOUNDS = { x0: -0.5, x1: 0.5, y0: 0.0, y1: 0.8 };
const EYE_X = 0.142, EYE_Y = 0.365;
const EYE_SIZE = [0.098, 0.1, 0.06];
const BAND = { y: 0.548, tilt: 0.026, half: 0.025, knotPhi: 2.35 };
const bandY = (phi) => BAND.y + BAND.tilt * Math.sin(phi);

// curl of the pointed tip (applied to body + anything following the surface above y=0.5)
function curl(x, y, z) {
  if (y <= 0.5) return [x, y, z];
  const t = (y - 0.5) / 0.3;
  return [x + 0.12 * t * t * t, y - 0.012 * t * t * t, z - 0.045 * t * t];
}

const bodyGeo = once(() => {
  const g = new THREE.LatheGeometry(PROFILE(), 40, Math.PI, TAU);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const [x, y, z] = curl(p.getX(i), p.getY(i), p.getZ(i));
    p.setXYZ(i, x, y, z);
  }
  return weldNormals(g);
});
const faceGeo = once(() => {
  const g = lathePatch(PROFILE(), 0.05, 0.7, 1.35, 0.003, FACE_BOUNDS, 28);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const [x, y, z] = curl(p.getX(i), p.getY(i), p.getZ(i)); p.setXYZ(i, x, y, z); }
  return g; // uvs were computed before the curl → texture stays put
});

// headband: tilted strip hugging the body + knot; tails are a separate animated mesh
const bandGeo = once(() => {
  const prof = PROFILE();
  const U = 64, V = 6;
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= V; j++) {
    for (let i = 0; i <= U; i++) {
      const u = i / U, v = j / V, phi = u * TAU;
      const y = bandY(phi) + (v - 0.5) * 2 * BAND.half;
      const r = profileRadius(prof, y) + 0.005 + 0.007 * Math.sin(Math.PI * v);
      const [x, yy, z] = curl(r * Math.sin(phi), y, r * Math.cos(phi));
      pos.push(x, yy, z);
      uv.push(u * 11, v);
    }
  }
  for (let j = 0; j < V; j++)
    for (let i = 0; i < U; i++) {
      const a = j * (U + 1) + i, b = a + 1, c = a + U + 1, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  weldNormals(g);
  const k = knotFrame();
  const knot = orientedCopy(new THREE.SphereGeometry(1, 14, 10), k.pos.clone().addScaledVector(k.normal, 0.012), k.normal, [0.042, 0.03, 0.036]);
  knot.attributes.uv.array.forEach((_, i, a) => { a[i] = i % 2 ? 0.5 : a[i] * 3; });
  return merge([g.toNonIndexed(), knot]);
});
function knotFrame() {
  const phi = BAND.knotPhi, y = bandY(phi);
  const r = profileRadius(PROFILE(), y) + 0.012;
  const [x, yy, z] = curl(r * Math.sin(phi), y, r * Math.cos(phi));
  return { pos: new THREE.Vector3(x, yy, z), normal: new THREE.Vector3(Math.sin(phi), 0.25, Math.cos(phi)).normalize() };
}
const tailsGeo = once(() => {
  const list = [];
  for (const [rz, len, tw] of [[0.5, 0.21, 0.5], [-0.32, 0.18, -0.4]]) {
    const g = new THREE.PlaneGeometry(0.06, len, 1, 8).translate(0, -len / 2, 0);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = -p.getY(i) / len; // 0 at knot → 1 at tip
      const x = p.getX(i);
      // flare the tip a little, bend outwards, twist
      const w = 1 + 0.35 * y;
      const a = tw * y;
      p.setXYZ(i, x * w * Math.cos(a), p.getY(i), 0.1 * y * y + x * w * Math.sin(a));
    }
    // notched (swallow-tail) ends
    for (let i = 0; i < p.count; i++) if (-p.getY(i) >= len - 1e-4) p.setY(i, p.getY(i) + (p.getX(i) > 0 === rz > 0 ? 0.012 : -0.004));
    g.rotateZ(rz);
    list.push(g);
  }
  const g = merge(list);
  g.computeVertexNormals();
  return g;
});
// ------------------------------------------------------------------ king extras
const crownGeo = once(() => {
  const parts = [];
  const prof = [
    [0.43, 0.0], [0.5, 0.0], [0.53, 0.028], [0.51, 0.055], [0.545, 0.19], [0.575, 0.21], [0.56, 0.24], [0.52, 0.225], [0.43, 0.0],
  ].map((p) => new THREE.Vector2(p[0], p[1]));
  parts.push(new THREE.LatheGeometry(prof, 44));
  const N = 6;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU;
    const sx = Math.sin(a), cz = Math.cos(a);
    const spike = new THREE.ConeGeometry(0.085, 0.26, 12, 1);
    spike.rotateX(0.22).rotateY(a).translate(sx * 0.535, 0.345, cz * 0.535);
    // (rotateX tilts outward along +Z, then rotateY turns it to angle a)
    parts.push(spike);
    const ball = new THREE.SphereGeometry(0.045, 12, 9).translate(sx * 0.565, 0.49, cz * 0.565);
    parts.push(ball);
  }
  return weldNormals(merge(parts));
});
const gemGeo = once(() => {
  const list = [];
  const big = new THREE.OctahedronGeometry(0.085, 0).scale(0.9, 1.15, 0.5).translate(0, 0.115, 0.535);
  list.push(colorize(big, '#ff2d63'));
  const N = 6;
  for (let i = 1; i < N; i++) {
    const a = (i / N) * TAU;
    const g = new THREE.OctahedronGeometry(0.05, 0).scale(0.9, 1.1, 0.5).rotateY(a).translate(Math.sin(a) * 0.54, 0.115, Math.cos(a) * 0.54);
    list.push(colorize(g, i % 2 ? '#3aa8ff' : '#35e08f'));
  }
  // small gems at the spike bases
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU + Math.PI / N;
    const g = new THREE.SphereGeometry(0.028, 8, 6).translate(Math.sin(a) * 0.56, 0.2, Math.cos(a) * 0.56);
    list.push(colorize(g, '#ffffff'));
  }
  return mergeColored(list);
});
const mantleGeo = once(() => {
  const prof = PROFILE();
  const U = 40, V = 20;
  const phi0 = Math.PI - 1.3, phi1 = Math.PI + 1.3;
  const drips = [[0.06, 0.035], [0.19, 0.075], [0.33, 0.05], [0.5, 0.095], [0.66, 0.05], [0.8, 0.075], [0.93, 0.04]];
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= V; j++) {
    for (let i = 0; i <= U; i++) {
      const u = i / U, v = j / V;
      let drip = 0;
      for (const [cu, d] of drips) {
        const w = 0.045;
        const x = (u - cu) / w;
        if (Math.abs(x) < 1) drip = Math.max(drip, d * Math.sqrt(1 - x * x));
      }
      const yTop = 0.545 + 0.012 * Math.cos(u * TAU * 4);
      const yBot = 0.13 - drip;
      const y = lerp(yTop, yBot, v);
      const phi = lerp(phi0, phi1, u);
      const edge = Math.min(u, 1 - u);
      const r = profileRadius(prof, Math.max(y, 0.01)) + 0.014 + drip * 0.08 * v + 0.006 * Math.min(1, edge * 12);
      pos.push(r * Math.sin(phi), y, r * Math.cos(phi));
      uv.push(u, 1 - v);
    }
  }
  for (let j = 0; j < V; j++)
    for (let i = 0; i < U; i++) {
      const a = j * (U + 1) + i, b = a + 1, c = a + U + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
});
const collarGeo = once(() => {
  const R = profileRadius(PROFILE(), 0.548) + 0.014, r = 0.036;
  const g = new THREE.TorusGeometry(R, r, 10, 60);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const th = Math.atan2(y, x);
    const cx = Math.cos(th) * R, cy = Math.sin(th) * R;
    const puff = 1 + 0.22 * Math.pow(Math.abs(Math.sin(th * 11)), 0.6) + 0.06 * Math.sin(th * 37);
    p.setXYZ(i, cx + (x - cx) * puff, cy + (y - cy) * puff, z * puff);
  }
  g.rotateX(Math.PI / 2);
  g.translate(0, 0.548, 0);
  return weldNormals(g);
});
const collarTex = once(() => {
  const W = 512, H = 64;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  g.fillStyle = '#fff8f4'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * W, y = Math.random() * H;
    g.fillStyle = Math.random() < 0.5 ? 'rgba(230,215,225,0.6)' : 'rgba(255,255,255,0.8)';
    g.fillRect(x, y, 2, 5);
  }
  // ermine tails on the outer equator of the tube (v≈0 ≡ 1 wraps)
  g.fillStyle = '#241a28';
  for (let i = 0; i < 11; i++) {
    const x = ((i + 0.25) / 11) * W;
    for (const y of [0, H]) {
      g.beginPath(); g.moveTo(x, y - 7); g.quadraticCurveTo(x + 6, y, x, y + 7); g.quadraticCurveTo(x - 6, y, x, y - 7); g.fill();
    }
  }
  return toTexture(c);
});


// ------------------------------------------------------------------ textures
// Vertical body gradient (luminance; multiplied by the variant colour): deeper base, bright top, lit rim at the bottom edge
const bodyGradTex = once(() => {
  const c = makeCanvas(8, 256);
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 256, 0, 0); // canvas bottom = uv.v 0 = slime bottom
  gr.addColorStop(0, '#d8d8d8');
  gr.addColorStop(0.035, '#f2f2f2');
  gr.addColorStop(0.09, '#b4b4b4');
  gr.addColorStop(0.35, '#d6d6d6');
  gr.addColorStop(0.7, '#ffffff');
  gr.addColorStop(1, '#ffffff');
  g.fillStyle = gr; g.fillRect(0, 0, 8, 256);
  const t = toTexture(c, { repeat: false });
  return t;
});
const dotsTex = once(() => {
  const W = 128, H = 64;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  g.fillStyle = '#e63b35'; g.fillRect(0, 0, W, H);
  const sh = g.createLinearGradient(0, 0, 0, H);
  sh.addColorStop(0, 'rgba(90,0,0,0.45)'); sh.addColorStop(0.18, 'rgba(90,0,0,0)'); sh.addColorStop(0.82, 'rgba(90,0,0,0)'); sh.addColorStop(1, 'rgba(90,0,0,0.45)');
  g.fillStyle = sh; g.fillRect(0, 0, W, H);
  g.fillStyle = '#fff6ea';
  for (const [x, y, r] of [[32, 22, 9], [96, 42, 9], [0, 42, 6], [128, 42, 6], [64, 44, 5], [64, 12, 4]]) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.setLineDash([4, 4]); g.lineWidth = 1.5;
  for (const y of [5, H - 5]) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  return toTexture(c);
});
// big round cartoon eye: white sclera, dark rim, small side-glancing pupil
const roundEyeTex = once(() => {
  const S = 256;
  const c = makeCanvas(S);
  const g = c.getContext('2d');
  g.setTransform(S / 2, 0, 0, -S / 2, S / 2, S / 2);
  const circ = (x, y, rx, ry = rx) => { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); };
  g.fillStyle = '#12202a'; circ(0, 0, 1.02); g.fill();
  const sg = g.createRadialGradient(-0.1, -0.2, 0.1, 0, 0, 0.9);
  sg.addColorStop(0, '#ffffff'); sg.addColorStop(0.75, '#f2f7fb'); sg.addColorStop(1, '#c9d6e2');
  g.fillStyle = sg; circ(0, 0, 0.86); g.fill();
  // lid shadow
  const ls = g.createLinearGradient(0, 0.86, 0, 0.3);
  ls.addColorStop(0, 'rgba(60,90,110,0.45)'); ls.addColorStop(1, 'rgba(60,90,110,0)');
  g.fillStyle = ls; circ(0, 0, 0.86); g.fill();
  // small pupil glancing to the side
  g.fillStyle = '#0c1418'; circ(0.2, 0.02, 0.29, 0.33); g.fill();
  g.fillStyle = '#ffffff'; circ(0.1, 0.16, 0.1); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.9)'; circ(0.3, -0.12, 0.045); g.fill();
  return toTexture(c, { repeat: false });
});

// ------------------------------------------------------------------ faces
function paintGloss(g) {
  // strong glossy "window" highlight on the upper left + small sparkle, soft reflected light lower right
  g.save();
  g.translate(-0.25, 0.5); g.rotate(0.75);
  const hg = g.createRadialGradient(0, 0, 0, 0, 0, 0.09);
  hg.addColorStop(0, 'rgba(255,255,255,0.95)'); hg.addColorStop(0.55, 'rgba(255,255,255,0.8)'); hg.addColorStop(1, 'rgba(255,255,255,0)');
  g.scale(1, 0.42); g.fillStyle = hg; g.beginPath(); g.arc(0, 0, 0.09, 0, TAU); g.fill();
  g.restore();
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.beginPath(); g.arc(-0.345, 0.405, 0.016, 0, TAU); g.fill();
  g.save();
  g.translate(-0.11, 0.645); g.rotate(0.35); g.scale(1, 0.45);
  const hg2 = g.createRadialGradient(0, 0, 0, 0, 0, 0.05);
  hg2.addColorStop(0, 'rgba(255,255,255,0.85)'); hg2.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = hg2; g.beginPath(); g.arc(0, 0, 0.05, 0, TAU); g.fill();
  g.restore();
  g.strokeStyle = 'rgba(255,255,255,0.3)'; g.lineWidth = 0.018;
  g.beginPath(); g.arc(0.0, 0.25, 0.42, Math.PI * 0.03, Math.PI * 0.17); g.stroke();
}
// wide cheeky grin with a row of small pointed teeth
function grin(g, cx, cy, w, h, ink, { open = 0, lowerTeeth = false } = {}) {
  const L = [cx - w / 2, cy + h * 0.3], R = [cx + w / 2, cy + h * 0.3];
  const topC = [cx, cy - h * 0.12], botC = [cx, cy - h * (1.25 + open)];
  const q = (a, c, b, t) => [(1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0], (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1]];
  const path = () => { g.beginPath(); g.moveTo(...L); g.quadraticCurveTo(...topC, ...R); g.quadraticCurveTo(...botC, ...L); g.closePath(); };
  g.save();
  path(); g.fillStyle = '#420f1d'; g.fill();
  g.clip();
  g.fillStyle = '#ff7b93';
  g.beginPath(); g.ellipse(cx + w * 0.06, cy - h * (1.0 + open), w * 0.24, h * 0.42, 0, 0, TAU); g.fill();
  // teeth
  const row = (a, c, b, dir, n, size) => {
    g.fillStyle = '#ffffff'; g.strokeStyle = 'rgba(40,20,30,0.55)'; g.lineWidth = w * 0.008;
    for (let i = 0; i < n; i++) {
      const t0 = (i + 0.08) / n, t1 = (i + 0.92) / n, tm = (i + 0.5) / n;
      const s = 0.55 + 0.45 * Math.sin(Math.PI * tm);
      const p0 = q(a, c, b, t0), p1 = q(a, c, b, t1), pm = q(a, c, b, tm);
      g.beginPath(); g.moveTo(p0[0], p0[1] + dir * 0.004); g.lineTo(p1[0], p1[1] + dir * 0.004); g.lineTo(pm[0], pm[1] - dir * size * s); g.closePath();
      g.fill(); g.stroke();
    }
  };
  row(L, topC, R, 1, 9, h * 0.34);
  if (lowerTeeth) row(L, botC, R, -1, 6, h * 0.3);
  g.restore();
  path(); g.strokeStyle = ink; g.lineWidth = h * 0.13; g.stroke();
  // cheeky dimples
  g.lineWidth = h * 0.1;
  for (const s of [-1, 1]) { g.beginPath(); g.arc(cx + s * (w / 2 + h * 0.05), cy + h * 0.3, h * 0.22, s > 0 ? -0.9 : Math.PI - 0.6, s > 0 ? 0.6 : Math.PI + 0.9); g.stroke(); }
}

function slimeFaces(v) {
  const ink = v.ink;
  const mk = (fn) => faceCanvas(FACE_BOUNDS, (g) => { paintGloss(g); fn(g); });
  const blush = (g) => { for (const s of [-1, 1]) draw.blush(g, s * 0.245, 0.285, 0.058, 0.032, v.blush, 0.5); };
  const browY = EYE_Y + 0.118;
  return {
    normal: mk((g) => {
      blush(g);
      // mischievous: one brow cocked up, the other tilted down
      draw.brow(g, -EYE_X - 0.01, browY + 0.012, 0.075, 0.28, 0.02, ink);
      draw.brow(g, EYE_X + 0.012, browY - 0.004, 0.075, 0.12, 0.02, ink);
      grin(g, 0, 0.262, 0.27, 0.085, ink);
    }),
    angry: mk((g) => {
      blush(g);
      draw.brow(g, -EYE_X - 0.004, browY - 0.006, 0.085, -0.45, 0.024, ink);
      draw.brow(g, EYE_X + 0.004, browY - 0.006, 0.085, 0.45, 0.024, ink);
      grin(g, 0, 0.268, 0.28, 0.085, ink, { open: 0.55, lowerTeeth: true });
    }),
    hurt: mk((g) => {
      blush(g);
      draw.squint(g, -EYE_X, EYE_Y, 0.075, 1, ink, 0.022);
      draw.squint(g, EYE_X, EYE_Y, 0.075, -1, ink, 0.022);
      draw.wobblyMouth(g, 0, 0.255, 0.13, ink, 0.017);
      draw.sweat(g, 0.3, 0.46, 0.045);
    }),
    dead: mk((g) => {
      draw.cross(g, -EYE_X, EYE_Y, 0.065, ink, 0.022);
      draw.cross(g, EYE_X, EYE_Y, 0.065, ink, 0.022);
      g.strokeStyle = ink; g.lineWidth = 0.016;
      draw.wobblyMouth(g, 0, 0.25, 0.12, ink, 0.016);
    }),
  };
}

// ------------------------------------------------------------------ variants (same model, different options)
const VARIANTS = {
  slime: {
    S: [1, 1, 1], height: 0.8, radius: 0.48,
    color: '#25c6c2', emissive: '#053a3c', rim: '#aefcff', ink: '#0d2c33', blush: '255,120,150',
    accessory: 'bandana', hopDur: 0.64, hopH: 0.3,
  },
  kingslime: {
    S: [3.2, 3.1, 3.2], height: 2.8, radius: 1.5,
    color: '#a43fe0', emissive: '#2c0948', rim: '#ffc2ff', ink: '#2a0838', blush: '255,110,190',
    accessory: 'crown', cape: true, hopDur: 1.3, hopH: 0.34,
  },
};

const assetsFor = (() => {
  const cache = {};
  return (type) => {
    if (cache[type]) return cache[type];
    const v = VARIANTS[type];
    const env = envTexture();
    const a = {
      shell: new THREE.MeshPhysicalMaterial({
        color: v.color, map: bodyGradTex(), emissive: v.emissive, roughness: 0.3, metalness: 0,
        clearcoat: 1, clearcoatRoughness: 0.07, envMap: env, envMapIntensity: 0.9, shadowSide: THREE.FrontSide,
      }),
      face: new THREE.MeshStandardMaterial({ transparent: true, depthWrite: false, roughness: 0.3, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      eye: new THREE.MeshStandardMaterial({ map: roundEyeTex(), roughness: 0.08, envMap: env, envMapIntensity: 0.8, emissive: '#ffffff', emissiveIntensity: 0.22 }),
      faces: slimeFaces(v),
    };
    a.eye.emissiveMap = a.eye.map;
    if (v.accessory === 'bandana') {
      a.band = new THREE.MeshStandardMaterial({ map: dotsTex(), roughness: 0.75, side: THREE.DoubleSide, emissive: '#000000' });
      a.band.emissiveMap = a.band.map;
    }
    if (v.accessory === 'crown') {
      a.gold = new THREE.MeshStandardMaterial({ color: '#ffc02e', metalness: 0.85, roughness: 0.26, envMap: env, envMapIntensity: 1.35, emissive: '#3a2000' });
      a.gem = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.06, metalness: 0.15, flatShading: true, envMap: env, envMapIntensity: 1.2, emissive: '#1a0510' });
    }
    if (v.cape) {
      a.mantle = new THREE.MeshPhysicalMaterial({ color: '#5a1296', emissive: '#1a0430', roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.1, envMap: env, envMapIntensity: 0.7, side: THREE.DoubleSide });
      a.collar = new THREE.MeshStandardMaterial({ map: collarTex(), roughness: 0.85, emissive: '#000000' });
    }
    return (cache[type] = a);
  };
})();

// ------------------------------------------------------------------ model
export class SlimeMonster extends MonsterBase {
  constructor(type, opts) {
    super(type, opts);
    const v = VARIANTS[type];
    const king = v.accessory === 'crown';
    this.v = v; this.king = king;
    const A = (this.A = assetsFor(type));
    const S = v.S;
    this.height = v.height; this.radius = v.radius; this.headY = EYE_Y * S[1];

    this.mover = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.mover);
    this.mover.add(this.body);

    const shellMat = this.inst(A.shell, { tint: 0.3, glow: v.color, rim: [v.rim, 0.34, 2.4] });
    this.faceMat = this.inst(A.face, { glow: '#000000', noFlash: true });
    this.faceMat.map = A.faces.normal;
    const eyeMat = this.inst(A.eye, { glow: '#000000', noFlash: true });

    this.shell = this.mesh(bodyGeo(), shellMat, { name: 'shell' });
    this.face = this.mesh(faceGeo(), this.faceMat, { shadow: false, name: 'face' });
    this.face.renderOrder = 2;
    this.body.add(this.shell, this.face);

    this.eyes = [];
    for (const s of [-1, 1]) {
      const e = this.mesh(eyeDomeGeo(), eyeMat, { shadow: false, name: 'eye' });
      const { pos, normal } = latheSurface(PROFILE(), s * EYE_X, EYE_Y);
      placeEye(e, pos, normal, EYE_SIZE, 0.45, 0.38);
      e.userData.baseQuat = e.quaternion.clone();
      this.body.add(e);
      this.eyes.push(e);
    }
    this.look = new THREE.Vector2(); this.lookTarget = new THREE.Vector2(); this._lookT = 1;

    if (v.accessory === 'bandana') {
      const bandMat = this.inst(A.band, { tint: 0 });
      this.band = this.mesh(bandGeo(), bandMat, { name: 'bandana' });
      this.tails = new THREE.Group();
      const k = knotFrame();
      this.tails.position.copy(k.pos).addScaledVector(k.normal, 0.02);
      const flat = new THREE.Vector3(k.normal.x, 0, k.normal.z).normalize();
      this.tails.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), flat);
      this.tailMesh = this.mesh(tailsGeo(), bandMat, { name: 'bandanaTails' });
      this.tails.add(this.tailMesh);
      this.tailBase = this.tails.quaternion.clone();
      this.tailSwing = new Spring(60, 4); this.tailFlap = new Spring(60, 4);
      this.body.add(this.band, this.tails);
    }
    if (v.cape) {
      const mantleMat = this.inst(A.mantle, { tint: 0.2, rim: ['#ff9cff', 0.4, 2.2] });
      const collarMat = this.inst(A.collar, { rim: ['#ffffff', 0.25, 2.5] });
      this.mantle = this.mesh(mantleGeo(), mantleMat, { name: 'mantle' });
      this.collar = this.mesh(collarGeo(), collarMat, { name: 'collar' });
      this.body.add(this.mantle, this.collar);
    }
    if (king) {
      const goldMat = this.inst(A.gold, { rim: ['#fff0b0', 0.35, 2.0] });
      const gemMat = this.inst(A.gem, { glow: '#ffffff' });
      this.crown = new THREE.Group();
      this.crown.add(this.mesh(crownGeo(), goldMat, { name: 'crown' }), this.mesh(gemGeo(), gemMat, { shadow: false, name: 'gems' }));
      this.mover.add(this.crown);
      this.crownY = new Spring(320, 20, 0.6 * S[1]);
      this.crownTiltX = new Spring(90, 7);
      this.crownTiltZ = new Spring(90, 7);
      this.ring = new RingFx(this.root, '#e6a8ff', tex('ring'));
      this.dust = new RingFx(this.root, '#fff2d8', tex('ring'));
    }

    // animation state
    this.sq = new Spring(380, 13, 1);
    this.shx = new Spring(150, 5.5);
    this.shz = new Spring(150, 5.5);
    this.hopP = 0; this.hopAmp = 1; this.hopSide = 1;
    this.impactTime = king ? 0.95 : 0.42;
    this.attackDur = king ? 1.75 : 0.95;
    this.impactStrength = king ? 2 : 0.6;
    this.hitDur = king ? 0.6 : 0.5;
    this.collapseDur = king ? 0.9 : 0.7;

    this.trk = king
      ? {
          z: track([[0, 0], [0.5, -0.18], [0.95, 0.45, ease.inQuad], [1.2, 0.4], [1.75, 0]]),
          y: track([[0, 0], [0.5, 0], [0.78, 1.25, ease.outQuad], [0.95, 0, ease.inCubic], [1.75, 0]]),
          sq: track([[0, 1], [0.48, 0.6], [0.58, 1.3, ease.outQuad], [0.78, 1.0], [0.88, 1.2], [0.94, 0.6, ease.outQuad], [1.2, 1.06], [1.75, 1]]),
          shz: track([[0, 0], [0.5, -0.14], [0.7, 0.08], [0.95, 0.14], [1.1, -0.04], [1.75, 0]]),
        }
      : {
          z: track([[0, 0], [0.25, -0.1], [0.42, 0.42, ease.inQuad], [0.6, 0.36], [0.95, 0]]),
          y: track([[0, 0], [0.25, 0], [0.33, 0.17, ease.outQuad], [0.42, 0.02, ease.inQuad], [0.95, 0]]),
          sq: track([[0, 1], [0.22, 0.7], [0.29, 1.26, ease.outQuad], [0.37, 1.12], [0.42, 0.74, ease.outQuad], [0.56, 1.06], [0.95, 1]]),
          shz: track([[0, 0], [0.24, -0.24], [0.35, 0.3], [0.44, 0.4], [0.62, 0.02], [0.95, 0]]),
        };
    this.hitTrk = track([[0, 0], [0.08, 1, ease.outQuad], [king ? 0.6 : 0.5, 0]]);
    this.dieTrk = {
      sq: track([[0, 1], [0.1, 1.3, ease.outQuad], [0.34, 0.3, ease.inQuad], [this.collapseDur, 0.3], [this.collapseDur + this.fadeDur, 0.14]]),
      y: track([[0, 0], [0.1, 0.07], [0.34, 0], [this.collapseDur, 0], [this.collapseDur + this.fadeDur, -0.2, ease.inQuad]]),
    };
    this.animate(0);
    this._applyMaterials();
  }

  onHitStart() {
    this.shz.kick(-2.4);
    this.sq.kick(-2.6);
    this.shx.kick((Math.random() - 0.5) * 1.5);
    this.tailFlap?.kick(6);
  }
  onDieStart() {
    this.hopP = 0;
    this.sq.kick(1.5);
    if (this.king) this._crownFall = { x: Math.random() < 0.5 ? -1 : 1 };
  }

  applyFace(name) {
    this.faceMat.map = this.A.faces[name] || this.A.faces.normal;
    const show = name === 'normal' || name === 'angry';
    for (const e of this.eyes) e.visible = show;
  }

  animate(dt) {
    const v = this.v, K = this.king, S = v.S;
    const dying = this.deathT >= 0;
    let y = 0, z = 0, sqT = 1, shxT = 0, shzT = 0;

    // idle breathing / sway
    const idle = 1 - clamp(this.move * 1.6, 0, 1);
    const tt = this.t * (K ? 0.65 : 1);
    sqT += 0.035 * Math.sin(tt * 2.3) * idle;
    shxT += 0.035 * Math.sin(tt * 1.25) * idle;
    shzT += 0.025 * Math.sin(tt * 0.95 + 1.3) * idle;

    // hop cycle (always completes a hop once started)
    let landed = false;
    if (!dying && this.attackT < 0 && (this.hopP > 0 || this.move > 0.08)) {
      if (this.hopP === 0) { this.hopAmp = clamp(0.45 + this.move * 0.65, 0.45, 1); this.hopSide = -this.hopSide; }
      const prev = this.hopP;
      this.hopP += dt / (v.hopDur * lerp(1.3, 1, this.move));
      const p = Math.min(this.hopP, 1), a = this.hopAmp;
      if (p < 0.2) { sqT = lerp(1, 1 - 0.27 * a, ease.inOutSine(p / 0.2)); shzT = -0.06 * a * (p / 0.2); }
      else if (p < 0.3) { const x = (p - 0.2) / 0.1; sqT = lerp(1 - 0.27 * a, 1 + 0.22 * a, ease.outQuad(x)); shzT = -0.14 * a; }
      else if (p < 0.8) {
        const x = (p - 0.3) / 0.5;
        sqT = 1 + a * lerp(0.2, 0.1, x) - a * 0.2 * Math.sin(Math.PI * x);
        shzT = lerp(-0.1, 0.1, x) * a;
        shxT += this.hopSide * 0.05 * a * Math.sin(Math.PI * x);
      } else { sqT = 1 - 0.18 * a * bump(p, 0.8, 1.0); }
      const ax = seg(p, 0.24, 0.8);
      y += v.hopH * a * 4 * ax * (1 - ax);
      if (prev < 0.8 && this.hopP >= 0.8) {
        landed = true;
        this.sq.kick(-3.6 * a * (K ? 1.25 : 1));
        this.shz.kick(1.3 * a);
        if (K) { this.dust.trigger(0, 0, 4.2, 0.55, 0.35 * a); this.onStep?.(0.4 * a); }
        else this.onStep?.(0.1 * a);
      }
      if (this.hopP >= 1) this.hopP = 0;
    }

    // attack
    if (this.attackT >= 0 && !dying) {
      const t = this.attackT, T = this.trk;
      z += T.z(t); y += T.y(t);
      sqT = T.sq(t); shzT = T.shz(t);
      if (K && t > 0.15 && t < 0.5) shxT += 0.03 * Math.sin(t * 70);
      if (this._lastAtkT !== undefined && this._lastAtkT < this.impactTime && t >= this.impactTime) {
        this.sq.kick(K ? -4.5 : -1.2);
        if (K) this.ring.trigger(0, T.z(t), 8, 0.7, 1);
      }
      this._lastAtkT = t;
    } else this._lastAtkT = undefined;

    // hit recoil
    if (this.hitT >= 0 && !dying) {
      z -= (K ? 0.18 : 0.13) * this.hitTrk(this.hitT);
      shzT -= 0.18 * this.hitTrk(this.hitT);
    }

    // death
    if (dying) {
      sqT = this.dieTrk.sq(this.deathT);
      y = this.dieTrk.y(this.deathT) * S[1];
      shxT = 0; shzT = 0;
    }

    const sq = this.sq.step(sqT, dt);
    const shx = this.shx.step(shxT, dt);
    const shz = this.shz.step(shzT, dt);
    const sy = clamp(sq, 0.1, 1.6);
    const sxz = 1 / Math.sqrt(sy);
    this.mover.position.set(0, y, z);
    setShearTransform(this.body, 0, 0, 0, S[0] * sxz, S[1] * sy, S[2] * sxz, shx, shz);

    // face + eyes (cheeky glances)
    let face = 'normal';
    if (dying) face = 'dead';
    else if (this.hitT >= 0 && this.hitT < 0.4) face = 'hurt';
    else if (this.attackT >= 0 && this.attackT < this.impactTime + 0.3) face = 'angry';
    this.setFace(face);
    this._lookT -= dt;
    if (this._lookT <= 0) {
      this._lookT = 0.8 + Math.random() * 2.5;
      this.lookTarget.set((Math.random() - 0.5) * 0.5, (Math.random() - 0.3) * 0.25);
      if (Math.random() < 0.35) this.lookTarget.set(0, 0);
    }
    if (face === 'angry') this.lookTarget.set(-0.12, -0.05);
    this.look.x += (this.lookTarget.x - this.look.x) * Math.min(1, dt * 14);
    this.look.y += (this.lookTarget.y - this.look.y) * Math.min(1, dt * 14);
    for (const e of this.eyes) {
      e.quaternion.copy(e.userData.baseQuat);
      e.rotateY(this.look.x); e.rotateX(-this.look.y);
    }
    this.applyEyes(this.eyes, face === 'angry' ? 0.12 : 0);

    // bandana tails flutter (follow-through on hops / hits); the bandana slips off when the slime splats
    if (this.band) this.band.visible = this.tails.visible = !(this.deathT > 0.3);
    if (this.tails) {
      const vy = dt > 1e-5 ? (y - (this._py ?? y)) / dt : 0;
      this._py = y;
      const sw = this.tailSwing.step(-shx * 3 + 0.12 * Math.sin(this.t * 3.1), dt);
      const fl = this.tailFlap.step(clamp(vy * 0.35, -1, 1) + (landed ? 0 : 0) + 0.1 * Math.sin(this.t * 4.3 + 1) * (0.4 + this.move), dt);
      this.tails.quaternion.copy(this.tailBase);
      this.tails.rotateX(-clamp(0.3 + fl, -0.5, 1.3));
      this.tails.rotateZ(clamp(sw, -0.8, 0.8));
    }

    if (K) this._animateKing(dt, sy, sxz, shx, shz);
  }

  _animateKing(dt, sy, sxz, shx, shz) {
    const S = this.v.S;
    if (this.collar) this.collar.visible = !(this.deathT > 0.3);
    const ay = 0.6 * S[1] * sy;
    if (this.deathT >= 0 && this._crownFall) {
      // crown pops off and tumbles to the ground
      const t = this.deathT, s = this._crownFall.x;
      const up = track([[0, ay], [0.25, ay + 0.9, ease.outQuad], [0.7, 0.28, ease.inQuad], [0.82, 0.42, ease.outQuad], [0.95, 0.28, ease.inQuad]])(t);
      this.crown.position.set(s * 1.5 * ease.outQuad(seg(t, 0, 0.8)), up, 0.3 * seg(t, 0, 0.8));
      this.crown.rotation.set(0.25 * seg(t, 0, 0.7), 0, -s * 1.25 * ease.outBack(seg(t, 0.05, 0.75)));
    } else {
      const cy = this.crownY.step(ay, dt);
      const tx = this.crownTiltX.step(Math.atan(shz) * 1.15, dt);
      const tz = this.crownTiltZ.step(-Math.atan(shx) * 1.15, dt);
      this.crown.position.set(shx * ay, clamp(cy, ay - 0.03, ay + 0.3), shz * ay);
      this.crown.rotation.set(tx, 0.12, tz + 0.08);
      const cs = Math.pow(sy, 0.2);
      this.crown.scale.set(1.3 / Math.sqrt(cs), 1.3 * cs, 1.3 / Math.sqrt(cs));
    }
    this.ring.update(dt);
    this.dust.update(dt);
  }

  dispose() {
    this.ring?.dispose();
    this.dust?.dispose();
    super.dispose();
  }
}

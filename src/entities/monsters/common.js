// Shared helpers for procedural monster models: geometry/material caches, rim-light shader patch,
// cute eye & face-decal textures, springs/easing and the MonsterBase state machine
// (idle/move blend, attack timeline, hit flinch, death + fade, hover highlight).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeCanvas, toTexture } from '../../core/textures.js';
import { clamp, lerp, damp, smoothstep } from '../../core/utils.js';

export { clamp, lerp, damp, smoothstep, mergeGeometries };
export const TAU = Math.PI * 2;

// ------------------------------------------------------------------ small utils
export function once(fn) {
  let v;
  return () => (v === undefined ? (v = fn()) : v);
}

export const ease = {
  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutSine: (t) => 0.5 - 0.5 * Math.cos(Math.PI * t),
  outBack: (t, s = 1.7) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2),
  outElastic: (t) => (t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, -9 * t) * Math.sin((t * 10 - 0.75) * (TAU / 3)) + 1),
  outBounce: (t) => {
    const n = 7.5625, d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
    return n * (t -= 2.625 / d) * t + 0.984375;
  },
};
// 0..1 progress of t inside [a,b]
export const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
// bump: 0 → 1 → 0 across [a,b] with smooth ends
export const bump = (t, a, b) => { const x = seg(t, a, b); return Math.sin(Math.PI * x); };

// Damped spring (semi-implicit Euler, stable for dt ≤ 1/60 with k ≤ ~900)
export class Spring {
  constructor(k = 120, c = 9, x = 0) { this.k = k; this.c = c; this.x = x; this.v = 0; }
  step(target, dt) {
    this.v += ((target - this.x) * this.k - this.v * this.c) * dt;
    this.x += this.v * dt;
    return this.x;
  }
  kick(v) { this.v += v; }
}

// ------------------------------------------------------------------ geometry helpers
export function smoothProfile(pts, n = 32) {
  const curve = new THREE.SplineCurve(pts.map((p) => new THREE.Vector2(p[0], p[1])));
  const out = curve.getSpacedPoints(n);
  for (const p of out) p.x = Math.max(0, p.x);
  return out;
}

// Radius of a lathe profile at height y (profile must be monotonic in y over the queried range)
export function profileRadius(profile, y) {
  for (let i = 0; i < profile.length - 1; i++) {
    const a = profile[i], b = profile[i + 1];
    if ((y >= a.y && y <= b.y) || (y <= a.y && y >= b.y)) {
      const t = b.y === a.y ? 0 : (y - a.y) / (b.y - a.y);
      return lerp(a.x, b.x, t);
    }
  }
  return 0;
}

// Surface point + outward normal on a lathe body (axis = Y, front = +Z) at local (x, y)
export function latheSurface(profile, x, y) {
  const r = profileRadius(profile, y);
  const dy = 0.01;
  const dr = (profileRadius(profile, y + dy) - profileRadius(profile, y - dy)) / (2 * dy);
  const phi = Math.asin(clamp(x / Math.max(r, 1e-4), -1, 1));
  const n2 = new THREE.Vector2(1, -dr).normalize();
  const pos = new THREE.Vector3(r * Math.sin(phi), y, r * Math.cos(phi));
  const normal = new THREE.Vector3(n2.x * Math.sin(phi), n2.y, n2.x * Math.cos(phi)).normalize();
  return { pos, normal };
}

// Front-projected (planar XY) UVs, mapping [x0,x1]×[y0,y1] → [0,1]²
export function planarUV(geo, x0, x1, y0, y1) {
  const p = geo.attributes.position;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = (p.getX(i) - x0) / (x1 - x0);
    uv[i * 2 + 1] = (p.getY(i) - y0) / (y1 - y0);
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

// Decal patch following a lathe profile (front centred), slightly inflated
export function lathePatch(profile, y0, y1, phiHalf, inflate, bounds, segs = 24) {
  const pts = [];
  const n = 28;
  for (let i = 0; i <= n; i++) {
    const y = lerp(y0, y1, i / n);
    pts.push(new THREE.Vector2(profileRadius(profile, y) + inflate, y));
  }
  const g = new THREE.LatheGeometry(pts, segs, -phiHalf, phiHalf * 2);
  return planarUV(g, bounds.x0, bounds.x1, bounds.y0, bounds.y1);
}

// Decal patch on a sphere of radius r (front = +Z)
export function spherePatch(r, phiHalf, thetaTop, thetaBottom, bounds, ws = 20, hs = 16) {
  // three.js sphere: +Z is at phi = PI/2
  const g = new THREE.SphereGeometry(r, ws, hs, Math.PI / 2 - phiHalf, phiHalf * 2, thetaTop, thetaBottom - thetaTop);
  return planarUV(g, bounds.x0, bounds.x1, bounds.y0, bounds.y1);
}

// Unit eye dome: front hemisphere of a sphere, flattened in Z, planar UVs over [-1,1]²
export const eyeDomeGeo = once(() => {
  const g = new THREE.SphereGeometry(1, 22, 16, 0, Math.PI);
  g.scale(1, 1, 0.55);
  return planarUV(g, -1, 1, -1, 1);
});

// Orient + place an eye on a surface point: normal gets biased towards +Z so eyes look forward
export function placeEye(mesh, pos, normal, size, forwardBias = 0.35, sink = 0.3) {
  const n = normal.clone().lerp(new THREE.Vector3(0, 0, 1), forwardBias).normalize();
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
  mesh.scale.set(size[0], size[1], size[2]);
  mesh.position.copy(pos).addScaledVector(n, -size[2] * sink);
  mesh.userData.basePos = mesh.position.clone();
  mesh.userData.baseScale = mesh.scale.clone();
}

// Place geometry copies (already built) oriented along a normal at a point
export function orientedCopy(geo, pos, normal, scale = [1, 1, 1], spin = 0) {
  const g = geo.clone();
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal.clone().normalize());
  if (spin) q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), spin));
  m.compose(pos, q, new THREE.Vector3(...scale));
  g.applyMatrix4(m);
  return g;
}

// Strip to position/normal/uv so merges don't fail on attribute mismatch
export function clean(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  return g;
}
export function merge(list) {
  return mergeGeometries(list.map(clean), false);
}
export function mergeGroups(list) {
  return mergeGeometries(list.map(clean), true);
}

// Add a per-vertex colour attribute to a geometry (for merged multi-colour parts)
export function colorize(geo, color) {
  const g = clean(geo);
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}
export function mergeColored(list) {
  return mergeGeometries(list, false);
}

// Compose an object's matrix with a shear (x += shx*y, z += shz*y) — used for jelly lean
const _m = new THREE.Matrix4(), _s = new THREE.Matrix4();
export function setShearTransform(obj, px, py, pz, sx, sy, sz, shx, shz, rotY = 0) {
  obj.matrixAutoUpdate = false;
  // M = T * R(y) * Shear * S
  const m = obj.matrix;
  m.makeTranslation(px, py, pz);
  if (rotY) m.multiply(_m.makeRotationY(rotY));
  _s.set(1, shx, 0, 0, 0, 1, 0, 0, 0, shz, 1, 0, 0, 0, 0, 1);
  m.multiply(_s);
  m.multiply(_m.makeScale(sx, sy, sz));
  obj.matrixWorldNeedsUpdate = true;
}

// ------------------------------------------------------------------ textures
// Soft studio/sky environment for glossy bits (no scene.environment in the game)
export const envTexture = once(() => {
  const W = 256, H = 128;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, '#9fd0ff');
  grd.addColorStop(0.42, '#eaf6ff');
  grd.addColorStop(0.5, '#fff6df');
  grd.addColorStop(0.56, '#9bbf73');
  grd.addColorStop(1, '#4f6b3a');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  // soft "windows" for cartoon speculars
  for (const [x, y, r, a] of [[70, 30, 26, 0.95], [190, 36, 18, 0.7], [130, 18, 12, 0.6]]) {
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, `rgba(255,255,255,${a})`); rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const t = toTexture(c, { repeat: false });
  t.mapping = THREE.EquirectangularReflectionMapping;
  return t;
});

export function furStrokes(g, W, H, n, cols, len = 7, dir = Math.PI / 2) {
  for (let i = 0; i < n; i++) {
    const x = Math.random() * W, y = Math.random() * H;
    const a = dir + (Math.random() - 0.5) * 0.8, l = len * (0.5 + Math.random());
    g.strokeStyle = cols[(Math.random() * cols.length) | 0];
    g.lineWidth = 0.8 + Math.random() * 1.4;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
}
export const furBump = once(() => {
  const S = 256;
  const c = makeCanvas(S);
  const g = c.getContext('2d');
  g.fillStyle = '#808080'; g.fillRect(0, 0, S, S);
  furStrokes(g, S, S, 5000, ['rgba(255,255,255,0.35)', 'rgba(0,0,0,0.35)'], 6);
  const t = toTexture(c, { srgb: false });
  return t;
});
// Canvas whose drawing coordinates are body-local metres (x right, y up) inside the bounds
export function faceCanvas(bounds, draw, W = 512, H = 512) {
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  const sx = W / (bounds.x1 - bounds.x0), sy = H / (bounds.y1 - bounds.y0);
  g.setTransform(sx, 0, 0, -sy, -sx * bounds.x0, H + sy * bounds.y0);
  g.lineCap = 'round'; g.lineJoin = 'round';
  draw(g);
  return toTexture(c, { repeat: false });
}

// Cute glossy anime eye (drawn in unit circle coords, y up) → used on eye domes
export function eyeTexture(iris = '#3a8f9a', { pupil = '#140a18', base = '#2a1830', lash = false } = {}) {
  const S = 256;
  const c = makeCanvas(S);
  const g = c.getContext('2d');
  g.setTransform(S / 2, 0, 0, -S / 2, S / 2, S / 2);
  const circ = (x, y, rx, ry = rx) => { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); };
  g.fillStyle = base; circ(0, 0, 1.02); g.fill();
  // iris gradient (lower part glows with colour)
  const ig = g.createLinearGradient(0, 0.7, 0, -0.9);
  ig.addColorStop(0, 'rgba(0,0,0,0)');
  ig.addColorStop(0.45, iris);
  ig.addColorStop(1, lighten(iris, 0.45));
  g.fillStyle = ig; circ(0, -0.08, 0.84, 0.86); g.fill();
  // pupil
  g.fillStyle = pupil; circ(0, 0.02, 0.5, 0.56); g.fill();
  // ring
  g.strokeStyle = 'rgba(10,5,15,0.9)'; g.lineWidth = 0.12; circ(0, 0, 0.95); g.stroke();
  // highlights
  g.fillStyle = '#ffffff';
  g.save(); g.translate(-0.33, 0.38); g.rotate(-0.5); circ(0, 0, 0.34, 0.25); g.fill(); g.restore();
  circ(0.36, -0.42, 0.14); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.8)'; circ(0.1, 0.6, 0.07); g.fill();
  if (lash) {
    g.strokeStyle = base; g.lineWidth = 0.14;
    g.beginPath(); g.moveTo(0.75, 0.62); g.lineTo(1.0, 0.85); g.stroke();
  }
  return toTexture(c, { repeat: false });
}

export function lighten(hex, t) {
  return '#' + new THREE.Color(hex).lerp(new THREE.Color('#ffffff'), t).getHexString();
}
export function darken(hex, t) {
  return '#' + new THREE.Color(hex).lerp(new THREE.Color('#000000'), t).getHexString();
}

// Common face drawing primitives (in metres, y up)
export const draw = {
  blush(g, x, y, rx, ry, col = '255,120,140', a = 0.55) {
    g.save(); g.translate(x, y); g.scale(1, ry / rx);
    const rg = g.createRadialGradient(0, 0, 0, 0, 0, rx);
    rg.addColorStop(0, `rgba(${col},${a})`); rg.addColorStop(0.6, `rgba(${col},${a * 0.6})`); rg.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = rg; g.beginPath(); g.arc(0, 0, rx, 0, TAU); g.fill();
    g.restore();
    // anime hatch lines
    g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = rx * 0.1;
    for (let i = -1; i <= 1; i++) {
      const cx = x + i * rx * 0.32;
      g.beginPath(); g.moveTo(cx - rx * 0.08, y - ry * 0.28); g.lineTo(cx + rx * 0.08, y + ry * 0.28); g.stroke();
    }
  },
  // "> <" squint eye; dir = +1 for left eye ('>'), -1 for right eye ('<')
  squint(g, x, y, s, dir, col = '#2a1422', lw) {
    g.strokeStyle = col; g.lineWidth = lw || s * 0.32;
    g.beginPath(); g.moveTo(x - dir * s * 0.6, y + s * 0.55); g.lineTo(x + dir * s * 0.55, y); g.lineTo(x - dir * s * 0.6, y - s * 0.55); g.stroke();
  },
  cross(g, x, y, s, col = '#2a1422', lw) {
    g.strokeStyle = col; g.lineWidth = lw || s * 0.3;
    g.beginPath(); g.moveTo(x - s * 0.6, y - s * 0.6); g.lineTo(x + s * 0.6, y + s * 0.6);
    g.moveTo(x - s * 0.6, y + s * 0.6); g.lineTo(x + s * 0.6, y - s * 0.6); g.stroke();
  },
  // happy closed eye (arc ^)
  arcEye(g, x, y, s, col = '#2a1422', lw) {
    g.strokeStyle = col; g.lineWidth = lw || s * 0.3;
    g.beginPath(); g.arc(x, y - s * 0.3, s * 0.6, Math.PI * 0.15, Math.PI * 0.85); g.stroke();
  },
  // open mouth "D" shape with tongue; w,h in metres, open = 0..1
  openMouth(g, x, y, w, h, { lip = '#3a1020', inner = '#7a1f33', tongue = '#ff7f96', fang = false, fangs = 0 } = {}) {
    g.save();
    g.beginPath();
    g.moveTo(x - w / 2, y);
    g.quadraticCurveTo(x, y + h * 0.18, x + w / 2, y);
    g.bezierCurveTo(x + w * 0.45, y - h * 0.9, x - w * 0.45, y - h * 0.9, x - w / 2, y);
    g.closePath();
    g.fillStyle = inner; g.fill();
    g.clip();
    g.fillStyle = tongue;
    g.beginPath(); g.ellipse(x, y - h * 0.78, w * 0.32, h * 0.38, 0, 0, TAU); g.fill();
    g.restore();
    g.strokeStyle = lip; g.lineWidth = Math.min(w, h) * 0.12;
    g.beginPath();
    g.moveTo(x - w / 2, y);
    g.quadraticCurveTo(x, y + h * 0.18, x + w / 2, y);
    g.bezierCurveTo(x + w * 0.45, y - h * 0.9, x - w * 0.45, y - h * 0.9, x - w / 2, y);
    g.closePath(); g.stroke();
    if (fang || fangs) {
      g.fillStyle = '#ffffff';
      const fs = [fangs === 2 ? -1 : null, 1].filter((v) => v !== null);
      for (const sgn of fs) {
        const fx = x + sgn * w * 0.24;
        g.beginPath(); g.moveTo(fx - w * 0.08, y + h * 0.1); g.lineTo(fx + w * 0.08, y + h * 0.1); g.lineTo(fx, y - h * 0.3); g.closePath(); g.fill();
      }
    }
  },
  // small "w" cat mouth
  catMouth(g, x, y, w, col = '#3a1020', lw) {
    g.strokeStyle = col; g.lineWidth = lw || w * 0.14;
    g.beginPath();
    g.moveTo(x - w / 2, y + w * 0.12);
    g.quadraticCurveTo(x - w / 4, y - w * 0.3, x, y + w * 0.05);
    g.quadraticCurveTo(x + w / 4, y - w * 0.3, x + w / 2, y + w * 0.12);
    g.stroke();
  },
  wobblyMouth(g, x, y, w, col = '#3a1020', lw) {
    g.strokeStyle = col; g.lineWidth = lw || w * 0.13;
    g.beginPath(); g.moveTo(x - w / 2, y);
    for (let i = 1; i <= 6; i++) g.lineTo(x - w / 2 + (w * i) / 6, y + (i % 2 ? w * 0.12 : -w * 0.02));
    g.stroke();
  },
  brow(g, x, y, len, angle, thick, col = '#2a1422') {
    g.save(); g.translate(x, y); g.rotate(angle);
    g.fillStyle = col;
    g.beginPath(); g.ellipse(0, 0, len / 2, thick / 2, 0, 0, TAU); g.fill();
    g.restore();
  },
  sweat(g, x, y, s) {
    g.fillStyle = 'rgba(160,220,255,0.9)';
    g.beginPath(); g.moveTo(x, y + s); g.quadraticCurveTo(x + s * 0.7, y - s * 0.2, x, y - s * 0.5); g.quadraticCurveTo(x - s * 0.7, y - s * 0.2, x, y + s); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.arc(x - s * 0.15, y - s * 0.1, s * 0.15, 0, TAU); g.fill();
  },
};

// ------------------------------------------------------------------ rim-light shader patch
// Adds a view-dependent rim (emissive) and optional fresnel alpha (centre → edge) to standard materials.
const RIM_KEY = 'monster-rim-v1';
function rimOnBeforeCompile(shader) {
  const u = this.userData;
  shader.uniforms.uRimColor = u.uRimColor;
  shader.uniforms.uRimPower = u.uRimPower;
  shader.uniforms.uFresAlpha = u.uFresAlpha;
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform vec3 uRimColor;\nuniform float uRimPower;\nuniform vec2 uFresAlpha;')
    .replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      {
        float nv = saturate(dot(normal, normalize(vViewPosition)));
        float fr = pow(1.0 - nv, uRimPower);
        totalEmissiveRadiance += uRimColor * fr;
        diffuseColor.a *= mix(uFresAlpha.x, uFresAlpha.y, pow(1.0 - nv, 1.6));
      }`
    );
}
function rimCacheKey() { return RIM_KEY; }

export function applyRim(mat, color, power = 2.5, fresAlpha = null) {
  mat.userData.uRimColor = { value: new THREE.Color(color) };
  mat.userData.uRimPower = { value: power };
  mat.userData.uFresAlpha = { value: new THREE.Vector2(fresAlpha ? fresAlpha[0] : 1, fresAlpha ? fresAlpha[1] : 1) };
  mat.onBeforeCompile = rimOnBeforeCompile;
  mat.customProgramCacheKey = rimCacheKey;
  return mat;
}

// ------------------------------------------------------------------ base class
const FLASH = new THREE.Color(1.0, 0.5, 0.45);
const HL_RIM = new THREE.Color(1.0, 0.95, 0.8);

// Piecewise keyframe track: keys = [[t, v, easeFn?], ...] (ease applies to the segment ending at that key)
export function track(keys) {
  return (t) => {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      const k = keys[i];
      if (t <= k[0]) {
        const p = keys[i - 1];
        const x = (t - p[0]) / (k[0] - p[0] || 1);
        return p[1] + (k[1] - p[1]) * (k[2] ? k[2](x) : ease.inOutSine(x));
      }
    }
    return keys[keys.length - 1][1];
  };
}

// Recompute normals and average them across vertices sharing a position (lathe seams, poles)
export function weldNormals(geo) {
  geo.computeVertexNormals();
  const p = geo.attributes.position, n = geo.attributes.normal;
  const map = new Map();
  const key = (i) => `${Math.round(p.getX(i) * 1e4)},${Math.round(p.getY(i) * 1e4)},${Math.round(p.getZ(i) * 1e4)}`;
  for (let i = 0; i < p.count; i++) {
    const k = key(i);
    let e = map.get(k);
    if (!e) map.set(k, (e = { x: 0, y: 0, z: 0, ids: [] }));
    e.x += n.getX(i); e.y += n.getY(i); e.z += n.getZ(i); e.ids.push(i);
  }
  for (const e of map.values()) {
    if (e.ids.length < 2) continue;
    const l = Math.hypot(e.x, e.y, e.z) || 1;
    for (const i of e.ids) n.setXYZ(i, e.x / l, e.y / l, e.z / l);
  }
  n.needsUpdate = true;
  return geo;
}

// Expanding ground shock-ring effect (per instance, not affected by highlight/fade)
export class RingFx {
  constructor(parent, color = '#ffffff', texture) {
    this.mat = new THREE.MeshBasicMaterial({ map: texture, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
    this.mesh = new THREE.Mesh(RingFx.geo(), this.mat);
    this.mesh.visible = false;
    this.mesh.renderOrder = 3;
    parent.add(this.mesh);
    this.t = -1; this.size = 1; this.dur = 0.6; this.strength = 1;
  }
  static geo = once(() => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));
  trigger(x, z, size = 4, dur = 0.6, strength = 1) {
    this.t = 0; this.size = size; this.dur = dur; this.strength = strength;
    this.mesh.position.set(x, 0.03, z);
    this.mesh.visible = true;
  }
  update(dt) {
    if (this.t < 0) return;
    this.t += dt;
    const x = this.t / this.dur;
    if (x >= 1) { this.t = -1; this.mesh.visible = false; return; }
    const s = this.size * (0.25 + 0.75 * ease.outCubic(x));
    this.mesh.scale.set(s, 1, s);
    this.mat.opacity = (1 - x) * (1 - x) * this.strength;
  }
  dispose() { this.mat.dispose(); }
}

export class MonsterBase {
  constructor(type, opts = {}) {
    this.type = type;
    this._tint = opts.tint ? new THREE.Color(opts.tint) : null;
    this.root = new THREE.Group();
    this.root.name = 'monster:' + type;
    this.height = 1; this.radius = 0.5; this.headY = 0.5;
    this.dead = false;
    this.mats = [];
    this.ownedGeos = [];
    this.t = Math.random() * 100;
    this.seed = Math.random();
    this.moveTarget = 0; this.move = 0;
    this.attackT = -1; this.hitT = -1; this.deathT = -1;
    this.impactTime = 0.4; this.attackDur = 1.0; this.hitDur = 0.5;
    this.collapseDur = 0.7; this.fadeDur = 1.5;
    this.hl = 0; this.hlTarget = 0; this.flash = 0; this.fade = 1;
    this._fadeMode = false; this._matKey = null;
    this.blink = 0; this._blinkT = -1; this._nextBlink = 0.5 + Math.random() * 3;
    this.face = 'normal'; // current face expression
    this.onImpact = null; // optional callback(strength) fired on the attack impact frame
    this._impactFired = false;
    for (const k of ['update', 'setMoving', 'attack', 'hit', 'die', 'setHighlight', 'dispose']) this[k] = this[k].bind(this);
  }

  // Per-instance material from a template.
  // o.rim: [color, strength, power]  o.fres: [centreAlpha, edgeAlpha]  o.glow: highlight emissive colour
  // o.tint: amount of tint to apply  o.noFlash: skip hit flash
  inst(template, o = {}) {
    const m = template.clone();
    m.userData = {};
    const e = { m, baseEmissive: m.emissive ? m.emissive.clone() : null, baseOpacity: m.opacity, glow: null, rim: null, rimBase: null, flash: o.noFlash ? 0 : 1 };
    if (o.tint && this._tint && m.color) {
      // near-white tints act as multipliers (e.g. Color(1, .92, .95)); saturated tints are blended in by o.tint
      const t = this._tint;
      if (Math.min(t.r, t.g, t.b) > 0.7) m.color.multiply(t);
      else m.color.lerp(t, o.tint);
    }
    if (m.emissive) {
      e.glow = o.glow !== undefined ? new THREE.Color(o.glow) : m.map ? new THREE.Color(0.9, 0.9, 0.9) : m.color.clone();
    }
    if (o.rim) {
      const c = new THREE.Color(o.rim[0]).multiplyScalar(o.rim[1] ?? 0.4);
      applyRim(m, c, o.rim[2] ?? 2.5, o.fres || null);
      e.rim = m.userData.uRimColor.value;
      e.rimBase = c.clone();
    }
    this.mats.push(e);
    return m;
  }

  mesh(geo, mat, { shadow = true, receive = false, name } = {}) {
    const me = new THREE.Mesh(geo, mat);
    me.castShadow = shadow;
    me.receiveShadow = receive;
    if (name) me.name = name;
    return me;
  }

  setMoving(v) { this.moveTarget = clamp(+v || 0, 0, 1); }
  attack() {
    if (this.deathT >= 0) return 0;
    this.attackT = 0;
    this._impactFired = false;
    this.onAttackStart?.();
    return this.impactTime;
  }
  hit() {
    if (this.deathT >= 0) return;
    this.hitT = 0;
    this.flash = 1;
    this.onHitStart?.();
  }
  die() {
    if (this.deathT >= 0) return;
    this.deathT = 0;
    this.attackT = -1;
    this.flash = 0.8;
    this.onDieStart?.();
  }
  setHighlight(on) { this.hlTarget = on ? 1 : 0; }

  update(dt) {
    if (this.dead) return;
    let rem = Math.max(0, Math.min(dt || 0, 10));
    // sub-step for stable springs (also allows big jumps for previews)
    while (rem > 1e-6) {
      const h = Math.min(rem, 1 / 60);
      this._step(h);
      rem -= h;
      if (this.dead) break;
    }
    this._applyMaterials();
  }

  _step(dt) {
    this.t += dt;
    this.move = damp(this.move, this.moveTarget, 5, dt);
    if (this.attackT >= 0) {
      this.attackT += dt;
      if (!this._impactFired && this.attackT >= this.impactTime) {
        this._impactFired = true;
        this.onImpact?.(this.impactStrength || 1);
      }
      if (this.attackT >= this.attackDur) this.attackT = -1;
    }
    if (this.hitT >= 0) { this.hitT += dt; if (this.hitT >= this.hitDur) this.hitT = -1; }
    this.flash = Math.max(0, this.flash - dt * 5.5);
    this.hl = damp(this.hl, this.hlTarget, 14, dt);
    // blinking
    if (this._blinkT >= 0) {
      this._blinkT += dt;
      this.blink = bump(this._blinkT, 0, 0.16);
      if (this._blinkT > 0.16) { this._blinkT = -1; this.blink = 0; }
    } else {
      this._nextBlink -= dt;
      if (this._nextBlink <= 0) { this._blinkT = 0; this._nextBlink = 1.8 + Math.random() * 3.5; if (Math.random() < 0.2) this._nextBlink = 0.25; }
    }
    if (this.deathT >= 0) {
      this.deathT += dt;
      const f = seg(this.deathT, this.collapseDur, this.collapseDur + this.fadeDur);
      this.fade = 1 - f * f * (3 - 2 * f);
      if (this.deathT >= this.collapseDur + this.fadeDur) {
        this.fade = 0;
        this.animate(dt);
        this.dead = true;
        this.root.visible = false;
        return;
      }
    }
    this.animate(dt);
  }

  // expression: 'normal' | 'hurt' | 'dead' | 'angry' ... subclasses map to textures
  setFace(name) {
    if (this.face === name) return;
    this.face = name;
    this.applyFace?.(name);
  }

  _applyMaterials() {
    const k = this._matKey;
    if (k && Math.abs(k[0] - this.hl) < 1e-3 && Math.abs(k[1] - this.flash) < 1e-3 && Math.abs(k[2] - this.fade) < 1e-3) return;
    this._matKey = [this.hl, this.flash, this.fade];
    if (this.fade < 1 && !this._fadeMode) {
      this._fadeMode = true;
      for (const e of this.mats) {
        if (!e.m.transparent) { e.m.transparent = true; e.m.needsUpdate = true; }
      }
    }
    const h = this.hl, f = this.flash;
    for (const e of this.mats) {
      const m = e.m;
      if (e.baseEmissive) {
        const g = e.glow, be = e.baseEmissive, fl = f * e.flash * 0.5, k = h * 0.2;
        m.emissive.setRGB(be.r + g.r * k + FLASH.r * fl, be.g + g.g * k + FLASH.g * fl, be.b + g.b * k + FLASH.b * fl);
      }
      if (e.rim) {
        const b = e.rimBase, k = h * 0.55, fl = f * 0.5;
        e.rim.setRGB(b.r + HL_RIM.r * k + FLASH.r * fl, b.g + HL_RIM.g * k + FLASH.g * fl, b.b + HL_RIM.b * k + FLASH.b * fl);
      }
      if (this._fadeMode) m.opacity = e.baseOpacity * this.fade;
    }
    if (this._fadeMode && this.fade < 0.35 && !this._shadowOff) {
      this._shadowOff = true;
      this.root.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    }
  }

  // Blink/eyes helper: scales eye meshes (userData.baseScale) by blink
  applyEyes(eyes, extraSquash = 0) {
    const s = clamp(1 - this.blink * 0.9 - extraSquash, 0.08, 1.2);
    for (const e of eyes) e.scale.set(e.userData.baseScale.x, e.userData.baseScale.y * s, e.userData.baseScale.z);
  }

  dispose() {
    for (const e of this.mats) e.m.dispose();
    for (const g of this.ownedGeos) g.dispose();
    this.mats.length = 0;
    this.root.parent?.remove(this.root);
  }
}

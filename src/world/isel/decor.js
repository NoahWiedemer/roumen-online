// Tower of Isel — furnishings: stone statues of heroes, blue crystal sconces, fire braziers, iron chandeliers, banners,
// carpets and colonnades; the Clockwork Chamber (turning gears, a great clock with a pendulum, an orrery), the Arcane
// Sanctum (a glowing rune circle, orbiting crystals, bookshelves, floating books) and the Throne Room (dais, throne,
// giant statues, stained glass with light shafts). Static parts go into the batchers; moving parts are meshes
// animated in update(). A small pool of point lights follows the hero from lamp to lamp.
import * as THREE from 'three';
import { GeoBuilder, pm, U } from '../town/builder.js';
import { townMaterials, townTime } from '../town/materials.js';
import { marbleTex } from '../town/textures.js';
import { FireSystem } from '../cyclone/structures.js';
import { glowDotTex } from '../cyclone/textures.js';
import { iselMaterials } from './architecture.js';
import { ROOMS, PATHS, CORE, DAIS, SEAT, PORTAL_BACK, ZONE, inRoom } from './layout.js';
import { bannerTex, stainedTex, runeTex, booksTex, clockTex } from './textures.js';
import { statueUnit } from './statues.js';
import { mulberry32 } from '../../core/utils.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;
const BLUE = '#5ac8ff', WARM = '#ffa050', CANDLE = '#ffc070';

// ------------------------------------------------------------------ materials
let DM = null;
function decorMaterials() {
  if (DM) return DM;
  const std = (name, o) => { const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, ...o }); m.name = name; return m; };
  const banner = std('isel_banner', { map: bannerTex(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9 });
  banner.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = townTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        { float ww = clamp(1.0 - uv.y, 0.0, 1.0);
          float ph = position.x * 0.37 + position.z * 0.29;
          transformed += normal * sin(uTime * 1.4 - ww * 3.0 + ph) * ww * 0.07; }`);
  };
  banner.customProgramCacheKey = () => 'isel-banner';
  DM = {
    statue: std('isel_statue', { map: marbleTex(), color: 0xc6d2cc, roughness: 0.72 }),
    crystal: std('isel_crystal', { color: 0x9fe8ff, emissive: 0x2ab8ff, emissiveIntensity: 1.7, roughness: 0.15, metalness: 0.1 }),
    orb: std('isel_orb', { color: 0xfff0c8, emissive: 0xffb050, emissiveIntensity: 2.2, roughness: 0.3 }),
    banner,
    books: std('isel_books', { map: booksTex(), roughness: 0.9 }),
    stained: std('isel_stained', { map: stainedTex(), emissive: 0xffffff, emissiveMap: stainedTex(), emissiveIntensity: 1.25, roughness: 0.4 }),
    clock: std('isel_clock', { map: clockTex(), roughness: 0.5, emissive: 0x2a2010, emissiveIntensity: 0.4 }),
    brass: std('isel_brass', { color: 0xd8a650, metalness: 0.55, roughness: 0.36 }),
    copper: std('isel_copper', { color: 0xc8744a, metalness: 0.5, roughness: 0.42 }),
    velvet: std('isel_velvet', { color: 0x9a1c34, roughness: 0.95 }),
    page: std('isel_page', { color: 0xf4ead0, roughness: 0.9 }),
  };
  return DM;
}
// the same material for a standalone mesh (no vertex colours: those only come with the batched geometry)
const soloCache = new Map();
function solo(mat) {
  let m = soloCache.get(mat);
  if (!m) { m = mat.clone(); m.vertexColors = false; if (mat.onBeforeCompile) { m.onBeforeCompile = mat.onBeforeCompile; m.customProgramCacheKey = mat.customProgramCacheKey; } soloCache.set(mat, m); }
  return m;
}

// ------------------------------------------------------------------ glow halos (static, additive points)
export class Glow {
  constructor() { this.list = []; }
  add(x, y, z, color, size, flicker = 0) { this.list.push({ x, y, z, c: new THREE.Color(color), s: size, f: flicker }); }
  build(parent) {
    const n = this.list.length;
    this.uniforms = { map: { value: glowDotTex() }, time: { value: 0 } };
    if (!n) return;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), s = new Float32Array(n), ph = new Float32Array(n), fl = new Float32Array(n);
    const rng = mulberry32(5150);
    this.list.forEach((g, i) => { pos.set([g.x, g.y, g.z], i * 3); col.set([g.c.r, g.c.g, g.c.b], i * 3); s[i] = g.s; ph[i] = rng() * 20; fl[i] = g.f; });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('gcol', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('gs', new THREE.BufferAttribute(s, 1));
    geo.setAttribute('ph', new THREE.BufferAttribute(ph, 1));
    geo.setAttribute('fl', new THREE.BufferAttribute(fl, 1));
    this.points = new THREE.Points(geo, new THREE.ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute vec3 gcol; attribute float gs; attribute float ph; attribute float fl; uniform float time; varying vec3 vC;
        void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float f = 1.0 + fl * (0.14 * sin(time * 9.0 + ph) + 0.08 * sin(time * 23.0 + ph * 2.0)) + (1.0 - fl) * 0.08 * sin(time * 1.3 + ph);
          vC = gcol * f * smoothstep(150.0, 12.0, -mv.z);
          gl_PointSize = gs * f * 300.0 / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; varying vec3 vC;
        void main(){ float a = texture2D(map, gl_PointCoord).a; gl_FragColor = vec4(vC * a, a);
        #include <colorspace_fragment>
        }`,
    }));
    this.points.frustumCulled = false;
    parent.add(this.points);
  }
}

// a few real point lights hop to the lamps nearest to the hero (a constant light count: no shader recompiles)
class LightPool {
  constructor(parent, n) {
    this.src = [];
    this.lights = [];
    for (let i = 0; i < n; i++) { const l = new THREE.PointLight(0xffffff, 0, 14, 1.6); l.castShadow = false; parent.add(l); this.lights.push(l); }
  }
  // (lamps belong to the zone group current at the time they are added: hidden zones do not get lights)
  add(x, y, z, color, intensity, dist, fire = false) { this.src.push({ x, y, z, c: new THREE.Color(color), i: intensity, d: dist, fire, ph: this.src.length * 1.7, k: 0, g: this.cur }); }
  update(t, dt, focus) {
    if (!focus) return;
    for (const s of this.src) s.dd = (s.g && !s.g.visible ? 1e9 : 0) + (s.x - focus.x) ** 2 + ((s.y - focus.y) * 1.6) ** 2 + (s.z - focus.z) ** 2;
    const near = this.src.slice().sort((a, b) => a.dd - b.dd).slice(0, this.lights.length);
    // each lamp fades in / out as it joins or leaves the pool
    for (const s of this.src) s.k += ((near.includes(s) ? 1 : 0) - s.k) * (1 - Math.exp(-6 * dt));
    near.sort((a, b) => a.ph - b.ph);
    this.lights.forEach((l, i) => {
      const s = near[i];
      if (!s) { l.intensity = 0; return; }
      l.position.set(s.x, s.y, s.z);
      l.color.copy(s.c);
      l.distance = s.d;
      const f = s.fire ? 0.86 + 0.1 * Math.sin(t * 11 + s.ph) + 0.06 * Math.sin(t * 27 + s.ph * 2) : 1 + 0.05 * Math.sin(t * 1.3 + s.ph);
      l.intensity = s.i * f * s.k;
    });
  }
}

// ------------------------------------------------------------------ small helpers
// point on the wall of a round room at angle a, `inset` metres inside; (nx, nz) = into the room
function onWall(r, a, inset) { const rr = r.r - inset; return { x: r.x + Math.cos(a) * rr, z: r.z + Math.sin(a) * rr, nx: -Math.cos(a), nz: -Math.sin(a) }; }
// is angle a of a round room clear of its doors (pad = extra metres on each side)?
function angleFree(r, doors, a, pad = 1) {
  return !doors.some((d) => {
    const da = Math.atan2(d.z - r.z, d.x - r.x);
    return Math.abs(Math.atan2(Math.sin(a - da), Math.cos(a - da))) < (d.hw + pad) / r.r;
  });
}
const faceTo = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);   // rotY that turns +z towards (tx, tz)

function carpet(K, ax, az, bx, bz, y, w) {
  const L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L, nx = -uz * w / 2, nz = ux * w / 2;
  K.bn.quadN(K.M.carpet, V(ax + nx, y, az + nz), V(bx + nx, y, bz + nz), V(bx - nx, y, bz - nz), V(ax - nx, y, az - nz),
    [0, 0], [0, L / w], [1, L / w], [1, 0], [1, 1, 1], V(0, 1, 0), false);
}

function sconce(K, x, y, z, nx, nz) {
  const { b, M, D } = K, rot = Math.atan2(nx, nz);
  b.box(M.iron, pm(x + nx * 0.04, y - 0.25, z + nz * 0.04, 0, rot, 0), 0.36, 0.7, 0.07, {});
  b.box(M.iron, pm(x + nx * 0.24, y - 0.12, z + nz * 0.24, 0, rot, 0), 0.1, 0.1, 0.46, {});
  const cx = x + nx * 0.46, cz = z + nz * 0.46;
  b.geo(M.gold, U.frustum(1.7, 8), pm(cx, y + 0.02, cz, 0, 0, 0, 0.11, 0.14, 0.11), {});
  b.geo(K.D.crystal, U.ico(0), pm(cx, y + 0.34, cz, 0, rot + 0.4, 0, 0.13, 0.3, 0.13), { flat: true });
  K.glow.add(cx, y + 0.34, cz, BLUE, 2.3, 0);
  K.lights.add(cx, y + 0.2, cz, BLUE, 5, 12);
}

function brazier(K, x, y, z, s = 1) {
  const { b, M, T } = K;
  b.geo(M.stone, U.lathe('isel_ped', [[0, 0], [0.44, 0], [0.44, 0.12], [0.32, 0.2], [0.23, 0.3], [0.2, 0.84], [0.3, 0.94], [0.36, 1.0], [0, 1.0]], 12),
    pm(x, y, z, 0, 0, 0, s, s, s), { uv: 'frame', uvs: 0.45, color: [0.84, 0.9, 0.92], ao: false });
  b.geo(M.iron, U.hemi(12, 4), pm(x, y + 1.3 * s, z, Math.PI, 0, 0, 0.56 * s, 0.32 * s, 0.56 * s), {});
  b.geo(M.gold, U.torus(1, 0.05, 5, 20), pm(x, y + 1.3 * s, z, Math.PI / 2, 0, 0, 0.56 * s, 0.56 * s, 0.56 * s), {});
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU;
    b.box(M.iron, pm(x + Math.cos(a) * 0.4 * s, y + 1.1 * s, z + Math.sin(a) * 0.4 * s, 0, -a, 0.5), 0.08 * s, 0.4 * s, 0.08 * s, {});
  }
  b.geo(T.ember, U.circle(12), pm(x, y + 1.27 * s, z, 0, 0, 0, 0.5 * s, 1, 0.5 * s), {});
  K.fire.addEmitter(x, y + 1.32 * s, z, 1.25 * s);
  K.lights.add(x, y + 2.0 * s, z, WARM, 16 * s, 17, true);
  K.col.addCircle(x, z, 0.5 * s);
}

// round stone column with a plinth, gold bands and a capital, from y up to y + h
function pillar(K, x, y, z, h, r) {
  const { b, M } = K;
  b.box(M.stone, pm(x, y + 0.4, z), r * 2.8, 0.8, r * 2.8, { uv: 'frame', uvs: 0.3, color: [0.74, 0.8, 0.82], ao: false });
  b.geo(M.stone, U.lathe('isel_col', [[0, 0], [1.22, 0], [1.22, 0.02], [1.1, 0.035], [1.0, 0.05], [0.94, 0.5], [0.9, 0.94], [1.0, 0.96], [1.18, 0.985], [1.3, 1], [0, 1]], 16),
    pm(x, y + 0.8, z, 0, 0, 0, r, h - 1.8, r), { uvScale: [r * TAU * 0.19, (h - 1.8) * 0.19], color: [0.9, 0.95, 0.97], ao: false });
  b.box(M.stone, pm(x, y + h - 0.5, z), r * 2.9, 1.0, r * 2.9, { uv: 'frame', uvs: 0.3, color: [0.8, 0.86, 0.88], ao: false });
  b.box(M.timber, pm(x, y + h - 1.1, z), r * 2.7, 0.22, r * 2.7, { uv: 'grain', uvs: 0.6, color: [0.8, 0.64, 0.52], ao: false });
  for (const fy of [2.2, h - 1.9]) b.geo(M.gold, U.torus(1, 0.07, 5, 24), pm(x, y + fy, z, Math.PI / 2, 0, 0, r * 0.97, r * 0.97, r * 0.97), {});
  K.col.addCircle(x, z, r * 1.25);
}

// iron ring chandelier with candles and a blue crystal, hanging from the ceiling at yc
function chandelier(K, x, yc, z, R, drop) {
  // its own meshes (no shadows: the long thin chains only drew flickering lines across the floor), hidden while the
  // camera looks down on it from above (it would hang right in front of the view)
  const { M, T, D } = K, b = new GeoBuilder(), glow = new Glow(), y = yc - drop;
  b.geo(M.iron, U.cyl(6), pm(x, (yc + y + 1.3) / 2, z, 0, 0, 0, 0.05, yc - y - 1.3, 0.05), {});
  b.geo(M.iron, U.sphere(10, 7), pm(x, y + 1.3, z, 0, 0, 0, 0.32, 0.32, 0.32), {});
  const tube = Math.round((0.075 / R) * 1000) / 1000;
  b.geo(M.gold, U.torus(1, tube, 5, 40), pm(x, y, z, Math.PI / 2, 0, 0, R, R, R), {});
  b.geo(M.iron, U.torus(1, tube * 1.3, 5, 28), pm(x, y + 0.55, z, Math.PI / 2, 0, 0, R * 0.55, R * 0.55, R * 0.55), {});
  b.geo(M.iron, U.torus(1, tube * 0.8, 4, 40), pm(x, y - 0.05, z, Math.PI / 2, 0, 0, R * 1.02, R * 1.02, R * 1.02), {});
  const spokes = 6;
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * TAU, ex = x + Math.cos(a) * R, ez = z + Math.sin(a) * R;
    const mid = V((x + ex) / 2, y + 0.65, (z + ez) / 2), len = Math.hypot(R, 1.3);
    const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), V(ex - x, -1.3, ez - z).normalize());
    b.geo(M.iron, U.cyl(5), new THREE.Matrix4().compose(mid, q, V(0.05, len, 0.05)), {});
  }
  const n = Math.round(R * 4.5);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU, cx = x + Math.cos(a) * R, cz = z + Math.sin(a) * R;
    b.geo(M.cream, U.cyl(6), pm(cx, y + 0.2, cz, 0, 0, 0, 0.055, 0.34, 0.055), { color: [1, 0.96, 0.86] });
    b.geo(T.lamp, U.sphere(6, 4), pm(cx, y + 0.45, cz, 0, 0, 0, 0.045, 0.1, 0.045), {});
    glow.add(cx, y + 0.47, cz, CANDLE, 0.8, 1);
  }
  b.geo(D.crystal, U.ico(0), pm(x, y + 0.6, z, 0, 0.3, 0, 0.3, 0.7, 0.3), { flat: true });
  glow.add(x, y + 0.5, z, BLUE, 3.5, 0);
  K.lights.add(x, y + 0.2, z, CANDLE, 20, 22, true);
  const group = new THREE.Group();
  group.name = 'chandelier';
  for (const mat of [...b.acc.keys()]) group.add(new THREE.Mesh(b.toGeometry(mat), mat));
  glow.build(group);
  K.group.add(group);
  K.chandeliers.push({ group, glow, y: y + 1.6 });
}

// indigo tower banner on an iron rod held off the wall; (x, z) on the wall face, (nx, nz) into the room, top at y
function banner(K, x, y, z, nx, nz, w, h) {
  const { b, bn, M, D } = K, tx = -nz, tz = nx, rot = Math.atan2(nx, nz);
  const px = x + nx * 0.3, pz = z + nz * 0.3;
  b.box(M.iron, pm(px, y + 0.05, pz, 0, rot, 0), w + 0.5, 0.08, 0.08, {});
  for (const s of [-1, 1]) {
    b.geo(M.gold, U.sphere(8, 6), pm(px + tx * s * (w / 2 + 0.28), y + 0.05, pz + tz * s * (w / 2 + 0.28), 0, 0, 0, 0.09, 0.09, 0.09), {});
    b.box(M.iron, pm(x + nx * 0.15 + tx * s * (w / 2 + 0.1), y + 0.05, z + nz * 0.15 + tz * s * (w / 2 + 0.1), 0, rot, 0), 0.05, 0.05, 0.3, {});
  }
  const hw = w / 2;
  bn.quadN(D.banner, V(px - tx * hw, y - h, pz - tz * hw), V(px + tx * hw, y - h, pz + tz * hw), V(px + tx * hw, y, pz + tz * hw), V(px - tx * hw, y, pz - tz * hw),
    [0, 0], [1, 0], [1, 1], [0, 1], [1, 1, 1], V(nx, 0, nz), false);
}

// a hero of stone on a plinth; returns the hands in world space
async function statue(K, key, x, y, z, rotY, s = 1.9, ph = 1.3) {
  const { b, M, D } = K;
  const st = await statueUnit(key);
  const w = 0.5 * s + 0.4;
  b.box(M.stone, pm(x, y + 0.14, z, 0, rotY, 0), w + 0.4, 0.28, w + 0.4, { uv: 'frame', uvs: 0.3, color: [0.7, 0.76, 0.78], ao: false });
  b.box(M.stone, pm(x, y + ph / 2, z, 0, rotY, 0), w, ph - 0.3, w, { uv: 'frame', uvs: 0.3, color: [0.86, 0.9, 0.92], ao: false });
  b.box(M.stone, pm(x, y + ph - 0.12, z, 0, rotY, 0), w + 0.24, 0.24, w + 0.24, { uv: 'frame', uvs: 0.3, color: [0.76, 0.82, 0.84], ao: false });
  const fx = Math.sin(rotY), fz = Math.cos(rotY);
  b.box(M.gold, pm(x + fx * (w / 2 + 0.02), y + ph * 0.55, z + fz * (w / 2 + 0.02), 0, rotY, 0), w * 0.5, 0.24, 0.04, {});
  K.col.addCircle(x, z, w * 0.72 + 0.1);
  if (!st) return null;
  const m = new THREE.Matrix4().compose(V(x, y + ph, z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), rotY), V(s, s, s));
  b.geo(D.statue, st.unit, m, { uv: 'frame', uvs: 0.4, ao: false });
  const hand = (side) => st.hands[side].clone().applyMatrix4(m);
  // what the statue holds: a burning torch, a glowing orb
  if (key === 'torch') {
    const h = hand('L');
    b.geo(M.timber, U.cyl(6), pm(h.x, h.y + 0.12 * s, h.z, 0, 0, 0, 0.045 * s, 0.42 * s, 0.045 * s), { color: [0.7, 0.62, 0.55] });
    b.geo(M.iron, U.frustum(1.8, 8), pm(h.x, h.y + 0.36 * s, h.z, 0, 0, 0, 0.07 * s, 0.1 * s, 0.07 * s), {});
    K.fire.addEmitter(h.x, h.y + 0.42 * s, h.z, 0.55 * s / 1.9);
    K.lights.add(h.x, h.y + 0.8, h.z, WARM, 9, 13, true);
  } else if (key === 'mage') {
    const h = hand('L').add(V(fx, 0, fz).multiplyScalar(0.12 * s));
    b.geo(D.crystal, U.sphere(12, 9), pm(h.x, h.y, h.z, 0, 0, 0, 0.12 * s, 0.12 * s, 0.12 * s), {});
    K.glow.add(h.x, h.y, h.z, BLUE, 2.6, 0);
  } else if (key === 'invoke') {
    const h = hand('L').add(hand('R')).multiplyScalar(0.5).add(V(0, 0.2 * s, 0));
    b.geo(D.orb, U.sphere(14, 10), pm(h.x, h.y, h.z, 0, 0, 0, 0.2 * s, 0.2 * s, 0.2 * s), {});
    K.glow.add(h.x, h.y, h.z, '#ffc870', 4.5, 0);
    K.lights.add(h.x, h.y, h.z, '#ffc870', 8, 12);
  }
  return { hand, st };
}

// window light: an additive prism extruded from a window rectangle along dir
function lightShaft(K, c, t, w, h, dir, len, color, alpha) {
  const hw = w / 2, hh = h / 2;
  const P = [V(c.x - t.x * hw, c.y - hh, c.z - t.z * hw), V(c.x + t.x * hw, c.y - hh, c.z + t.z * hw), V(c.x + t.x * hw, c.y + hh, c.z + t.z * hw), V(c.x - t.x * hw, c.y + hh, c.z - t.z * hw)];
  const d = dir.clone().normalize().multiplyScalar(len);
  const pos = [], al = [], ed = [];
  for (let i = 0; i < 4; i++) {
    const p0 = P[i], p1 = P[(i + 1) % 4], q0 = p0.clone().add(d), q1 = p1.clone().add(d);
    for (const [p, a, e] of [[p0, 0, 0], [p1, 0, 1], [q1, 1, 1], [p0, 0, 0], [q1, 1, 1], [q0, 1, 0]]) { pos.push(p.x, p.y, p.z); al.push(a); ed.push(e); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('along', new THREE.Float32BufferAttribute(al, 1));
  g.setAttribute('edge', new THREE.Float32BufferAttribute(ed, 1));
  const m = new THREE.Mesh(g, new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(color) }, alpha: { value: alpha }, time: K.shaftTime },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `attribute float along; attribute float edge; varying float vA; varying float vE; varying vec3 vW;
      void main(){ vA = along; vE = edge; vW = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0); }`,
    fragmentShader: `uniform vec3 color; uniform float alpha; uniform float time; varying float vA; varying float vE; varying vec3 vW;
      void main(){
        // (clamped: at the prism's edges the interpolated values overshoot a hair, and pow() of a negative number is
        // NaN, which rendered as thin black lines along the beams)
        float a = alpha * pow(max(1.0 - vA, 0.0), 1.3) * smoothstep(0.0, 0.08, vA) * pow(max(sin(3.14159 * clamp(vE, 0.0, 1.0)), 0.0), 1.5);
        a *= 0.8 + 0.2 * sin(time * 0.6 + vW.x * 0.3 + vW.z * 0.2);
        a *= smoothstep(4.0, 16.0, length(vW - cameraPosition));   // (no milky veil with the camera inside a beam)
        gl_FragColor = vec4(color, a);
        #include <colorspace_fragment>
      }`,
  }));
  m.renderOrder = 3;
  m.frustumCulled = false;
  K.group.add(m);
}

// ------------------------------------------------------------------ 1 Entrance Hall
async function entranceHall(K, { room: r, doors }) {
  const y = r.y;
  // carpet from the portal to the stairs, around the stone medallion
  carpet(K, r.x, PORTAL_BACK.z - 2, r.x, r.z + 3.45, y + 0.03, 3.4);
  carpet(K, r.x, r.z - 3.45, r.x, r.z - r.r + 0.3, y + 0.03, 3.4);
  // lamps and banners in the wall bays (not over the stairs or behind the portal)
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * TAU;
    if (!angleFree(r, doors, a, 1.5) || Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2))) < 0.35) continue;
    const w = onWall(r, a, 0.02);
    sconce(K, w.x, y + 4.4, w.z, w.nx, w.nz);
    banner(K, w.x, y + 12.9, w.z, w.nx, w.nz, 2.1, 5.6);
  }
  // four heroes guard the hall
  const poses = [['vigil', 40], ['vigil', 140], ['salute', 220], ['salute', 320]];
  for (const [key, deg] of poses) {
    const a = (deg * Math.PI) / 180, p = onWall(r, a, 3.6);
    await statue(K, key, p.x, y, p.z, faceTo(p.x, p.z, r.x, r.z), 1.9, 1.3);
  }
  const d = doors[0];
  for (const s of [-1, 1]) {
    brazier(K, d.x + s * (d.hw + 1.6), y, d.z + 2.2);
    brazier(K, PORTAL_BACK.x + s * 5.6, y, PORTAL_BACK.z - 2.4);
  }
  chandelier(K, r.x, y + r.h, r.z, 3.2, 4.4);
}

// ------------------------------------------------------------------ 2 Hall of Statues
async function statueHall(K, { room: r, doors, windows }) {
  const y = r.y, cx = (r.x0 + r.x1) / 2;
  const west = doors.find((d) => d.path === 'stair2');
  carpet(K, cx, r.z1 - 0.3, cx, r.z0 + 6.5, y + 0.03, 3.4);
  carpet(K, r.x0 + 0.3, west.z, cx - 1.7, west.z, y + 0.035, 3.0);
  // two colonnades along the hall (open around the west door)
  for (const px of [-9.5, 3.5]) for (const pz of [-9, -3, 5, 11, 17, 23]) pillar(K, px, y, pz, r.h, 0.62);
  // heroes along both walls, facing the aisle
  const cycle = ['guard', 'mage', 'torch', 'strike', 'invoke', 'vigil', 'salute'];
  let i = 0;
  for (const z of [-8, 11, 17, 23]) await statue(K, cycle[i++ % cycle.length], r.x0 + 1.7, y, z, Math.PI / 2, 1.8, 1.2);
  for (const z of [-8, 4, 12, 20]) await statue(K, cycle[i++ % cycle.length], r.x1 - 1.7, y, z, -Math.PI / 2, 1.8, 1.2);
  // the great statue at the north end
  await statue(K, 'salute', cx, y, r.z0 + 3.4, 0, 2.7, 2.2);
  for (const s of [-1, 1]) brazier(K, cx + s * 4.2, y, r.z0 + 5.5, 1.15);
  // lamps between the pilasters, banners behind the great statue and beside the south door
  for (const z of [-11, -4, 2.5, 9, 15, 21, 27]) {
    if (Math.abs(z - west.z) > west.hw + 1) sconce(K, r.x0, y + 5.6, z, 1, 0);
    if (!windows.some((w) => Math.abs(w.z - z) < 2.2)) sconce(K, r.x1, y + 5.6, z, -1, 0);
  }
  for (const s of [-1, 1]) {
    banner(K, cx + s * 6, y + 13, r.z0, 0, 1, 2.6, 7.2);
    banner(K, cx + s * 7.5, y + 12.5, r.z1, 0, -1, 2.2, 6);
  }
  chandelier(K, cx, y + r.h, 2, 2.6, 4.4);
  chandelier(K, cx, y + r.h, 18, 2.6, 4.4);
  // morning light through the east windows
  for (const w of windows) lightShaft(K, V(w.x - 0.1, (w.y0 + w.y1) / 2, w.z), V(0, 0, 1), w.w * 0.9, w.y1 - w.y0, V(-1, -0.72, 0.18), 17, '#fff0c8', 0.7);
}

// ------------------------------------------------------------------ gears (moving parts)
function gearMesh(K, R, teeth, thick) {
  const g = new GeoBuilder(), mat = K.D.brass;
  const n = teeth, rimW = Math.max(0.16, R * 0.14);
  for (let k = 0; k < n; k++) {
    const a = (k / n) * TAU, ca = Math.cos(a), sa = Math.sin(a);
    const chord = 2 * (R - rimW / 2) * Math.sin(Math.PI / n) + 0.02;
    g.box(mat, pm(ca * (R - rimW / 2), sa * (R - rimW / 2), 0, 0, 0, a + Math.PI / 2), chord, rimW, thick, {});
    g.box(mat, pm(ca * (R + rimW * 0.45), sa * (R + rimW * 0.45), 0, 0, 0, a + Math.PI / 2), chord * 0.5, rimW * 0.95, thick * 0.9, {});
  }
  const spokes = R > 2 ? 6 : 4;
  for (let k = 0; k < spokes; k++) {
    const a = (k / spokes) * TAU + 0.3;
    g.box(mat, pm(Math.cos(a) * R * 0.45, Math.sin(a) * R * 0.45, 0, 0, 0, a), R * 0.9, rimW * 0.8, thick * 0.7, {});
  }
  g.geo(mat, U.cyl(14), pm(0, 0, 0, Math.PI / 2, 0, 0, R * 0.2, thick * 1.6, R * 0.2), {});
  g.geo(mat, U.cyl(10), pm(0, 0, 0, Math.PI / 2, 0, 0, R * 0.07, thick * 2.4, R * 0.07), { color: [0.6, 0.55, 0.5] });
  const mesh = new THREE.Mesh(g.toGeometry(mat), mat);
  mesh.castShadow = true;
  return mesh;
}

// ------------------------------------------------------------------ 3 Clockwork Chamber
function clockwork(K, { room: r, doors }) {
  const { b, M, D } = K, y = r.y;
  // gears on the walls, each turning at its own pace
  const gears = [[35, 2.2, 9], [62, 3.0, 10.5], [145, 2.4, 8.5], [222, 3.3, 10], [250, 1.9, 7.4], [292, 2.8, 9.5], [322, 1.7, 7.0]];
  for (const [deg, R, gy] of gears) {
    const a = (deg * Math.PI) / 180;
    if (!angleFree(r, doors, a, R - 1)) continue;
    const w = onWall(r, a, 0.55);
    const m = gearMesh(K, R, Math.round(R * 9), 0.3);
    const holder = new THREE.Group();
    holder.position.set(w.x, y + gy, w.z);
    holder.rotation.y = Math.atan2(w.nx, w.nz);
    holder.add(m);
    K.group.add(holder);
    const speed = (0.9 / R) * (deg % 2 ? 1 : -1);
    K.dyn.push((dt) => { m.rotation.z += speed * dt; });
    // axle into the wall
    b.geo(M.iron, U.cyl(8), new THREE.Matrix4().compose(V(w.x - w.nx * 0.25, y + gy, w.z - w.nz * 0.25),
      new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), V(w.nx, 0, w.nz)), V(0.16, 0.7, 0.16)), {});
  }
  // copper pipes running up the walls
  for (const deg of [155, 203, 271, 336]) {
    const a = (deg * Math.PI) / 180;
    if (!angleFree(r, doors, a, 1)) continue;
    for (let i = -1; i <= 1; i++) {
      const aa = a + (i * 0.45) / r.r, w = onWall(r, aa, 0.45);
      b.geo(D.copper, U.cyl(8), pm(w.x, y + r.h / 2, w.z, 0, 0, 0, 0.14, r.h, 0.14), {});
      for (const fy of [2.5, 7.5, 12.5]) b.geo(M.iron, U.cyl(8), pm(w.x, y + fy + i * 0.6, w.z, 0, 0, 0, 0.19, 0.18, 0.19), {});
    }
  }
  // the great clock in a tall timber case against the west wall, its pendulum swinging below the dial
  const a = Math.PI, w = onWall(r, a, 1.0), rot = Math.atan2(w.nx, w.nz);
  b.push(pm(w.x, y, w.z, 0, rot, 0));
  b.box(M.timber, pm(0, 6.8, -0.2), 5.2, 13.6, 1.4, { uv: 'grain', uvs: 0.5, color: [0.82, 0.66, 0.54], skip: ['pz'] });
  b.box(M.timber, pm(0, 13.9, 0), 5.8, 0.6, 1.9, { uv: 'grain', uvs: 0.5, color: [0.7, 0.55, 0.45] });
  b.box(M.timber, pm(0, 0.3, 0.1), 5.8, 0.6, 1.9, { uv: 'grain', uvs: 0.5, color: [0.7, 0.55, 0.45] });
  for (const s of [-1, 1]) b.box(M.timber, pm(s * 2.45, 6.8, 0.4), 0.4, 13, 0.5, { uv: 'grain', uvs: 0.5, color: [0.78, 0.62, 0.5] });
  b.box(M.timber, pm(0, 5.3, 0.4), 4.6, 0.4, 0.5, { uv: 'grain', uvs: 0.5, color: [0.78, 0.62, 0.5] });
  b.box(M.stone, pm(0, 2.8, 0.45), 4.5, 4.6, 0.02, { color: [0.35, 0.3, 0.3] });  // dark back of the pendulum bay
  b.geo(M.gold, U.torus(1, 0.1, 6, 40), pm(0, 9.4, 0.55, 0, 0, 0, 2.15, 2.15, 2.15), {});
  b.geo(M.gold, U.coneCap(8), pm(0, 14.6, 0, 0, 0, 0, 0.5, 0.9, 0.5), {});
  b.pop();
  K.col.addBox(w.x - w.nx * 0.2, w.z - w.nz * 0.2, 2.9, 0.95, rot);
  const face = new THREE.Mesh(new THREE.CircleGeometry(2.1, 40), solo(D.clock));
  const clockG = new THREE.Group();
  clockG.position.set(w.x, y, w.z);
  clockG.rotation.y = rot;
  face.position.set(0, 9.4, 0.53);
  clockG.add(face);
  const handMat = solo(M.iron);
  const hour = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.2, 0.05).translate(0, 0.5, 0), handMat);
  const minute = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.75, 0.05).translate(0, 0.75, 0), handMat);
  hour.position.set(0, 9.4, 0.6); minute.position.set(0, 9.4, 0.64);
  const pend = new THREE.Group();
  pend.position.set(0, 5.0, 0.6);
  const rod = new THREE.Mesh(new THREE.BoxGeometry(0.1, 3.4, 0.06).translate(0, -1.7, 0), solo(D.brass));
  const bob = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.14, 24).rotateX(Math.PI / 2).translate(0, -3.5, 0), solo(D.brass));
  pend.add(rod, bob);
  clockG.add(hour, minute, pend);
  K.group.add(clockG);
  K.dyn.push((dt, t) => {
    minute.rotation.z = -t * 0.35;
    hour.rotation.z = -t * 0.35 / 12 - 1.2;
    pend.rotation.z = Math.sin(t * 2.2) * 0.22;
  });
  // the orrery in the middle: a glowing sun, three brass rings with planets turning around it
  b.geo(M.stone, U.lathe('isel_orr', [[0, 0], [1.4, 0], [1.4, 0.25], [1.05, 0.4], [0.6, 0.6], [0.45, 1.5], [0.8, 1.75], [0, 1.75]], 16), pm(r.x, y, r.z, 0, 0, 0, 1, 1, 1), { uv: 'frame', uvs: 0.4, color: [0.8, 0.86, 0.88], ao: false });
  b.geo(M.gold, U.torus(1, 0.06, 5, 30), pm(r.x, y + 1.7, r.z, Math.PI / 2, 0, 0, 0.8, 0.8, 0.8), {});
  K.col.addCircle(r.x, r.z, 1.55);
  const oy = y + 4.1;
  const sun = new THREE.Mesh(new THREE.IcosahedronGeometry(0.62, 2), solo(D.orb));
  sun.position.set(r.x, oy, r.z);
  K.group.add(sun);
  b.geo(M.iron, U.cyl(8), pm(r.x, y + 2.6, r.z, 0, 0, 0, 0.08, 2.0, 0.08), {});
  K.glow.add(r.x, oy, r.z, '#ffc060', 7, 0);
  K.lights.add(r.x, oy, r.z, '#ffc060', 18, 20);
  const rings = [];
  for (const [R, tilt, spd, pr] of [[1.5, 0.3, 0.5, 0.16], [2.1, -0.45, -0.32, 0.22], [2.75, 0.15, 0.2, 0.28]]) {
    const g = new THREE.Group();
    g.position.set(r.x, oy, r.z);
    g.rotation.x = tilt;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(R, 0.045, 6, 64).rotateX(Math.PI / 2), solo(D.brass));
    const planet = new THREE.Mesh(new THREE.IcosahedronGeometry(pr, 1), solo(pr > 0.2 ? D.crystal : D.brass));
    planet.position.set(R, 0, 0);
    g.add(ring, planet);
    K.group.add(g);
    rings.push({ g, spd });
  }
  K.dyn.push((dt, t) => { sun.rotation.y = t * 0.3; for (const q of rings) q.g.rotation.y += q.spd * dt; });
  // lamps between the gears
  for (let k = 0; k < 12; k++) {
    const aa = (k / 12) * TAU + Math.PI / 12;
    if (!angleFree(r, doors, aa, 1.2) || Math.abs(Math.atan2(Math.sin(aa - Math.PI), Math.cos(aa - Math.PI))) < 0.4) continue;
    const ww = onWall(r, aa, 0.02);
    sconce(K, ww.x, y + 4.2, ww.z, ww.nx, ww.nz);
  }
  for (const d of doors) for (const s of [-1, 1]) {
    const tx = -d.dz, tz = d.dx;
    brazier(K, d.x - d.dx * 2.2 + tx * s * (d.hw + 1.5), y, d.z - d.dz * 2.2 + tz * s * (d.hw + 1.5), 0.9);
  }
}

// ------------------------------------------------------------------ 4 Arcane Sanctum
function sanctum(K, { room: r, doors }) {
  const { b, M, D } = K, y = r.y;
  // the rune circle: two glowing rings turning against each other
  const runeMat = (op) => new THREE.MeshBasicMaterial({ map: runeTex(), color: 0x2a9cff, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(12.5, 12.5).rotateX(-Math.PI / 2), runeMat(0.9));
  const inner = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 5.2).rotateX(-Math.PI / 2), runeMat(0.8));
  outer.position.set(r.x, y + 0.04, r.z); inner.position.set(r.x, y + 0.05, r.z);
  outer.renderOrder = inner.renderOrder = 2;
  K.group.add(outer, inner);
  K.dyn.push((dt, t) => {
    outer.rotation.y = t * 0.05; inner.rotation.y = -t * 0.12;
    outer.material.opacity = 0.7 + 0.25 * Math.sin(t * 1.3);
    inner.material.opacity = 0.65 + 0.3 * Math.sin(t * 1.3 + 1.5);
  });
  // a great crystal floating over the circle, smaller ones orbiting it
  const big = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0).scale(0.7, 1.6, 0.7), solo(D.crystal));
  big.castShadow = true;
  K.group.add(big);
  const halo = (size, color) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowDotTex(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.8 })); s.scale.setScalar(size); return s; };
  const bigHalo = halo(6, BLUE);
  K.group.add(bigHalo);
  const orbit = [];
  for (let i = 0; i < 6; i++) {
    const c = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0).scale(0.22, 0.5, 0.22), solo(D.crystal));
    const h = halo(1.8, BLUE);
    K.group.add(c, h);
    orbit.push({ c, h, a: (i / 6) * TAU, yo: (i % 2) * 0.8 });
  }
  K.lights.add(r.x, y + 3.6, r.z, BLUE, 16, 18);
  K.dyn.push((dt, t) => {
    big.position.set(r.x, y + 3.8 + Math.sin(t * 0.9) * 0.25, r.z);
    big.rotation.y = t * 0.4;
    bigHalo.position.copy(big.position);
    for (const o of orbit) {
      const a = o.a + t * 0.35;
      o.c.position.set(r.x + Math.cos(a) * 3.3, y + 3.2 + o.yo + Math.sin(t * 1.4 + o.a * 2) * 0.3, r.z + Math.sin(a) * 3.3);
      o.c.rotation.y = t * 1.2 + o.a;
      o.h.position.copy(o.c.position);
    }
  });
  // stone posts with crystals around the circle
  for (const deg of [45, 110, 165, 225]) {
    const a = (deg * Math.PI) / 180, px = r.x + Math.cos(a) * 7.6, pz = r.z + Math.sin(a) * 7.6;
    b.geo(M.stone, U.lathe('isel_post', [[0, 0], [0.5, 0], [0.5, 0.2], [0.34, 0.3], [0.3, 1.0], [0.42, 1.1], [0.42, 1.2], [0, 1.2]], 10), pm(px, y, pz), { uv: 'frame', uvs: 0.45, color: [0.84, 0.9, 0.92], ao: false });
    b.geo(D.crystal, U.ico(0), pm(px, y + 1.55, pz, 0, a, 0, 0.2, 0.45, 0.2), { flat: true });
    K.glow.add(px, y + 1.55, pz, BLUE, 2.4, 0);
    K.col.addCircle(px, pz, 0.55);
  }
  // bookshelves around the walls, lamps above them
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * TAU;
    if (!angleFree(r, doors, a, 2.5)) continue;
    const w = onWall(r, a, 0.85), rot = Math.atan2(w.nx, w.nz);
    bookshelf(K, w.x, y, w.z, rot, 4.4, 4.4);
    const s = onWall(r, a, 0.02);
    sconce(K, s.x, y + 6.0, s.z, s.nx, s.nz);
  }
  // two lecterns with open books and candles
  for (const deg of [135, 200]) {
    const a = (deg * Math.PI) / 180, px = r.x + Math.cos(a) * 9.6, pz = r.z + Math.sin(a) * 9.6, rot = faceTo(px, pz, r.x, r.z);
    b.push(pm(px, y, pz, 0, rot, 0));
    b.box(M.timber, pm(0, 0.55, 0), 0.4, 1.1, 0.4, { uv: 'grain', uvs: 0.6, color: [0.8, 0.64, 0.52] });
    b.box(M.timber, pm(0, 0.06, 0), 0.9, 0.12, 0.7, { uv: 'grain', uvs: 0.6, color: [0.7, 0.55, 0.45] });
    b.box(M.timber, pm(0, 1.18, 0), 0.9, 0.08, 0.6, { uv: 'grain', uvs: 0.6, color: [0.8, 0.64, 0.52] });
    b.box(D.page, pm(-0.2, 1.25, 0.02, 0, 0, 0.08), 0.38, 0.03, 0.5, {});
    b.box(D.page, pm(0.2, 1.25, 0.02, 0, 0, -0.08), 0.38, 0.03, 0.5, {});
    b.geo(M.cream, U.cyl(6), pm(0.42, 1.36, -0.2, 0, 0, 0, 0.04, 0.28, 0.04), { color: [1, 0.96, 0.86] });
    b.pop();
    const cx = px + Math.cos(rot) * 0.42 - Math.sin(rot) * 0.2, cz = pz - Math.sin(rot) * 0.42 - Math.cos(rot) * 0.2;
    K.glow.add(cx, y + 1.58, cz, CANDLE, 0.8, 1);
    K.col.addCircle(px, pz, 0.5);
  }
  // a few books drift through the air
  const bookG = [];
  const rng = mulberry32(4242);
  for (let i = 0; i < 6; i++) {
    const g = new THREE.Group();
    const cover = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.36), new THREE.MeshStandardMaterial({ color: ['#6a2a2a', '#2a4a6a', '#2a5a3a', '#4a2a5a'][i % 4], roughness: 0.8 }));
    const pages = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.05, 0.32), solo(D.page));
    pages.position.y = 0.04;
    g.add(cover, pages);
    K.group.add(g);
    bookG.push({ g, a: rng() * TAU, rr: 5 + rng() * 5, h: 3 + rng() * 5, sp: 0.08 + rng() * 0.1, ph: rng() * 10 });
  }
  K.dyn.push((dt, t) => {
    for (const q of bookG) {
      const a = q.a + t * q.sp;
      q.g.position.set(r.x + Math.cos(a) * q.rr, y + q.h + Math.sin(t * 0.8 + q.ph) * 0.4, r.z + Math.sin(a) * q.rr);
      q.g.rotation.set(Math.sin(t * 0.6 + q.ph) * 0.3, -a, Math.sin(t * 0.7 + q.ph) * 0.2);
    }
  });
  for (const d of doors) for (const s of [-1, 1]) {
    const tx = -d.dz, tz = d.dx;
    brazier(K, d.x - d.dx * 2 + tx * s * (d.hw + 1.4), y, d.z - d.dz * 2 + tz * s * (d.hw + 1.4), 0.9);
  }
}

function bookshelf(K, x, y, z, rot, w, h) {
  const { b, bn, M, D } = K;
  const F = pm(x, y, z, 0, rot, 0);
  b.push(F);
  bn.setFrame(F);
  const dep = 0.7;
  for (const s of [-1, 1]) b.box(M.timber, pm(s * (w / 2 - 0.08), h / 2, 0), 0.16, h, dep, { uv: 'grain', uvs: 0.6, color: [0.72, 0.56, 0.44] });
  b.box(M.timber, pm(0, h - 0.08, 0), w + 0.3, 0.2, dep + 0.1, { uv: 'grain', uvs: 0.6, color: [0.66, 0.5, 0.4] });
  b.box(M.timber, pm(0, h / 2, -dep / 2 + 0.03), w, h, 0.06, { uv: 'grain', uvs: 0.6, color: [0.5, 0.38, 0.3] });
  const rows = 5, rh = (h - 0.3) / rows;
  for (let i = 0; i < rows; i++) {
    const sy = 0.1 + i * rh;
    b.box(M.timber, pm(0, sy, 0), w - 0.3, 0.07, dep, { uv: 'grain', uvs: 0.6, color: [0.78, 0.6, 0.48] });
    // a row of book spines (a quad with the spine texture, a little in front of the back board)
    const u0 = (i * 0.37) % 1;
    bn.quad(D.books, V(-w / 2 + 0.17, sy + 0.04, 0.1), V(w / 2 - 0.17, sy + 0.04, 0.1), V(w / 2 - 0.17, sy + rh * 0.86, 0.1), V(-w / 2 + 0.17, sy + rh * 0.86, 0.1),
      [u0, 0], [u0 + w / 4.5, 0], [u0 + w / 4.5, 1], [u0, 1], [1, 1, 1], V(0, 0, 1), false);
    b.box(D.books, pm(0, sy + rh * 0.43, -0.12), w - 0.34, rh * 0.8, 0.42, { color: [0.4, 0.3, 0.26] });
  }
  b.pop();
  bn.resetFrame();
  K.col.addBox(x, z, w / 2, dep / 2 + 0.1, rot);
}

// ------------------------------------------------------------------ 5 Throne Room
async function throneRoom(K, { room: r, doors, windows }) {
  const { b, bn, M, D } = K, y = r.y, cz = (r.z0 + r.z1) / 2;
  const door = doors[0];
  // the dais: three broad steps up to the throne, gold on every nosing, the carpet running up
  const Dd = DAIS;
  for (let k = 1; k <= Dd.steps; k++) {
    const x0 = Dd.x0 + (k - 1) * Dd.run, top = y + k * Dd.rise;
    b.box(M.stone, pm((x0 + Dd.x1) / 2, top - Dd.rise / 2, cz), Dd.x1 - x0, Dd.rise, Dd.z1 - Dd.z0 - (k - 1) * 0.6,
      { uv: 'frame', uvs: 0.3, color: [0.86 + k * 0.03, 0.9, 0.92], ao: false, faces: { py: M.parquet } });
    b.box(M.gold, pm(x0 + 0.04, top - 0.02, cz), 0.08, 0.06, Dd.z1 - Dd.z0 - (k - 1) * 0.6, {});
    carpet(K, x0, cz, Math.min(Dd.x1 - 1.5, x0 + Dd.run), cz, top + 0.02, 4);
    bn.quadN(M.carpet, V(x0 - 0.01, top - Dd.rise, cz - 2), V(x0 - 0.01, top - Dd.rise, cz + 2), V(x0 - 0.01, top, cz + 2), V(x0 - 0.01, top, cz - 2),
      [0, 0], [1, 0], [1, 0.1], [0, 0.1], [0.85, 0.85, 0.85], V(-1, 0, 0), false);
  }
  const topY = y + Dd.steps * Dd.rise;
  carpet(K, Dd.x0 + Dd.steps * Dd.run, cz, Dd.x1 - 2.2, cz, topY + 0.02, 4);
  carpet(K, r.x0 + 0.3, cz, Dd.x0 - 0.02, cz, y + 0.03, 5);
  // the throne, facing down the hall (Vagel sits on it: layout.SEAT)
  throne(K, SEAT.x, topY, SEAT.z, SEAT.rotY, SEAT.scale);
  K.col.addBox(SEAT.x, SEAT.z, 2.0, 2.0, 0);
  // stained glass behind the throne, light pouring through it
  const gw = 7.2, gy0 = y + 4.6, gy1 = y + 18.6;
  bn.quadN(D.stained, V(r.x1 - 0.05, gy0, cz + gw / 2), V(r.x1 - 0.05, gy0, cz - gw / 2), V(r.x1 - 0.05, gy1, cz - gw / 2), V(r.x1 - 0.05, gy1, cz + gw / 2),
    [0, 0], [1, 0], [1, 1], [0, 1], [1, 1, 1], V(-1, 0, 0), false);
  for (const s of [-1, 1]) b.box(M.stone, pm(r.x1 - 0.3, (gy0 + gy1) / 2, cz + s * (gw / 2 + 0.35)), 0.6, gy1 - gy0 + 0.4, 0.7, { uv: 'frame', uvs: 0.3, color: [0.8, 0.86, 0.9] });
  b.box(M.stone, pm(r.x1 - 0.3, gy0 - 0.3, cz), 0.8, 0.6, gw + 1.4, { uv: 'frame', uvs: 0.3, color: [0.8, 0.86, 0.9] });
  lightShaft(K, V(r.x1 - 0.2, (gy0 + gy1) / 2 + 1, cz), V(0, 0, 1), gw * 0.8, (gy1 - gy0) * 0.7, V(-1, -0.42, 0), 26, '#ffd8e8', 0.55);
  // sunlight through the south windows
  for (const w of windows) lightShaft(K, V(w.x, (w.y0 + w.y1) / 2, w.z - 0.1), V(1, 0, 0), w.w * 0.9, w.y1 - w.y0, V(0.12, -0.75, -1), 22, '#fff0c8', 0.6);
  // two giants of stone flank the throne
  for (const s of [-1, 1]) await statue(K, 'salute', Dd.x1 - 5, y, cz + s * 12.2, -Math.PI / 2 - s * 0.35, 3.3, 2.2);
  // colonnades, banners on the pillars facing the aisle, braziers between them
  for (const px of [-14, -5, 4, 13, 22]) for (const s of [-1, 1]) {
    const pz = cz + s * 8.5;
    pillar(K, px, y, pz, r.h, 0.85);
    banner(K, px, y + 14, pz - s * 1.15, 0, -s, 1.9, 6.5);
  }
  for (const px of [-9.5, 8.5]) for (const s of [-1, 1]) brazier(K, px, y, cz + s * 4.6, 1.1);
  for (const s of [-1, 1]) brazier(K, Dd.x0 - 1.4, y, cz + s * 6.4, 1.3);
  // lamps along the long walls, banners flanking the door
  for (let x = -18; x <= 32; x += 6.25) {
    sconce(K, x, y + 5.4, r.z0, 0, 1);
    if (!windows.some((w) => Math.abs(w.x - x) < 2.6)) sconce(K, x, y + 5.4, r.z1, 0, -1);
  }
  for (const s of [-1, 1]) banner(K, r.x0, y + 13.5, door.z + s * 6.5, 1, 0, 2.4, 7);
  for (const x of [-10, 3, 16]) chandelier(K, x, y + r.h, cz, 3.4, 6);
}

function throne(K, x, y, z, rot, sc = 1) {
  const { b, M, D } = K;
  b.push(pm(x, y, z, 0, rot, 0, sc, sc, sc));
  const tim = { uv: 'grain', uvs: 0.6, color: [0.62, 0.44, 0.36] };
  b.box(M.stone, pm(0, 0.3, -0.1), 3.0, 0.6, 2.6, { uv: 'frame', uvs: 0.3, color: [0.8, 0.86, 0.9] });
  b.box(M.timber, pm(0, 0.9, 0.05), 2.2, 0.6, 1.8, tim);
  b.box(D.velvet, pm(0, 1.28, 0.12), 1.8, 0.18, 1.5, {});
  b.box(D.velvet, pm(0, 2.02, -0.3), 1.56, 1.3, 0.36, {});          // a plush cushion against the back
  b.box(M.timber, pm(0, 3.4, -0.72), 2.3, 4.8, 0.4, tim);
  b.box(D.velvet, pm(0, 3.1, -0.5), 1.6, 3.4, 0.06, {});
  b.box(M.gold, pm(0, 5.95, -0.72), 2.5, 0.3, 0.5, {});
  b.geo(M.gold, U.coneCap(4), pm(0, 6.6, -0.72, 0, Math.PI / 4, 0, 0.5, 1.1, 0.5), {});
  b.geo(K.D.crystal, U.ico(0), pm(0, 5.1, -0.46, 0, 0, 0, 0.26, 0.4, 0.14), { flat: true });
  for (const s of [-1, 1]) {
    b.box(M.timber, pm(s * 1.3, 3.0, -0.72), 0.36, 6.0, 0.5, tim);
    b.geo(M.gold, U.coneCap(4), pm(s * 1.3, 6.45, -0.72, 0, Math.PI / 4, 0, 0.3, 0.9, 0.3), {});
    b.box(M.timber, pm(s * 1.15, 1.75, 0.2), 0.36, 0.2, 1.8, tim);
    b.box(M.timber, pm(s * 1.15, 1.4, 0.95), 0.32, 0.7, 0.32, tim);
    b.box(M.gold, pm(s * 1.15, 1.88, 1.1), 0.4, 0.08, 0.4, {});
    b.geo(M.gold, U.sphere(8, 6), pm(s * 1.15, 1.95, 1.05, 0, 0, 0, 0.14, 0.14, 0.14), {});
  }
  b.pop();
  const c = V(0, 5.1, -0.46).multiplyScalar(sc).applyAxisAngle(V(0, 1, 0), rot).add(V(x, y, z));
  K.glow.add(c.x, c.y, c.z, BLUE, 2.5, 0);
}

// ------------------------------------------------------------------ lamps along the stairwells
function stairLamps(K) {
  for (const p of PATHS) {
    if (!p.steps && !p.core) continue;
    useZone(K, ZONE[p.id]);
    let side = 1;
    for (let i = 0; i < p.pts.length - 1; i++) {
      const [ax, az, ay] = p.pts[i], [bx, bz, by] = p.pts[i + 1];
      const L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L, nx = -uz, nz = ux;
      for (let t = 3; t < L - 1; t += 7) {
        const mx = ax + ux * t, mz = az + uz * t, my = ay + (by - ay) * (t / L);
        if (ROOMS.some((r) => inRoom(r, mx, mz, -0.5))) continue;
        if (p.core && Math.hypot(mx - CORE.x, mz - CORE.z) > CORE.r - 1) continue;
        const wx = mx + nx * (p.w / 2) * side, wz = mz + nz * (p.w / 2) * side;
        sconce(K, wx, my + 3.5, wz, -nx * side, -nz * side);
        side = -side;
      }
    }
  }
}

// ------------------------------------------------------------------ build
// everything of a room goes to its visibility zone (see layout.ZONE): builders, fire, halos and moving parts
function useZone(K, zone) { Object.assign(K, K.Z[zone]); K.lights.cur = K.group; }

export async function buildDecor(ctx, arch) {
  const Z = {};
  for (const [zone, z] of Object.entries(ctx.zones)) Z[zone] = { b: new GeoBuilder(), bn: new GeoBuilder(), fire: new FireSystem(zone === 'east' ? 1400 : 700), glow: new Glow(), group: z.group };
  const K = {
    Z, M: iselMaterials(), T: townMaterials(), D: decorMaterials(),
    lights: new LightPool(ctx.scene, 5), col: ctx.colliders, dyn: [], shaftTime: { value: 0 }, chandeliers: [],
  };
  const R = (id) => { useZone(K, ZONE[id]); return arch.rooms.find((q) => q.room.id === id); };
  await entranceHall(K, R('hall'));
  await statueHall(K, R('statues'));
  clockwork(K, R('clock'));
  sanctum(K, R('sanctum'));
  await throneRoom(K, R('throne'));
  stairLamps(K);

  let tris = 0;
  for (const [zone, z] of Object.entries(Z)) {
    z.fire.buildHalos();
    z.group.add(z.fire.points, z.fire.haloPoints);
    z.glow.build(z.group);
    tris += z.b.triangleCount() + z.bn.triangleCount();
    z.b.flush(ctx.zones[zone].batcher);
    z.bn.flush(ctx.zones[zone].batcherNoShadow);
  }
  const zones = Object.values(Z);
  return {
    stats: `${Math.round(tris)} tris, ${K.lights.src.length} lamps`,
    lights: K.lights,          // (the vault adds its own lamps to the pool)
    update(dt, t, camera, pos) {
      townTime.value = t;
      K.shaftTime.value = t;
      for (const z of zones) {
        if (!z.group.visible) continue;
        z.fire.update(dt, camera ? camera.position : null);
        z.fire.haloUniforms.time.value = t;
        if (z.glow.uniforms) z.glow.uniforms.time.value = t;
      }
      K.lights.update(t, dt, pos || (camera && camera.position));
      for (const c of K.chandeliers) {
        c.group.visible = !camera || camera.position.y < c.y;
        c.glow.uniforms.time.value = t;
      }
      for (const f of K.dyn) f(dt, t);
    },
  };
}

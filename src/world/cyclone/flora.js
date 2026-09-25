// Vegetation for Cyclone Hill / Forest of Mist, all instanced:
//   broadleaf trees (gnarly trunk + painted leaf-clump cards), blossom / autumn / dead variants,
//   bamboo groves (swaying stalks + leaf sprays), ferns, grass tufts, flowers, mushrooms, rocks
//   and glowing healing herbs. Placement respects paths, water, bridges, slopes and noScatter circles.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32, makeFbm, smoothstep, lerp, clamp } from '../../core/utils.js';
import { tex } from '../../core/textures.js';
import {
  leafClumpTex, leafClumpDarkTex, blossomClumpTex, autumnClumpTex, bambooLeafTex, fernTex, herbLeafTex, barkTex, glowDotTex,
} from './textures.js';
import { MAP, BAMBOO_GROVES, HEALING_HERB_SPOTS, TOWER_SITE, GLADE, ARRIVAL, SPAWN } from './layout.js';

export const floraTime = { value: 0 };

// ------------------------------------------------------------------ wind shader injection
// sway grows with height above the instance root; aRoot (optional per-instance attribute) overrides the root
function addWind(mat, { amp = 0.004, key, useRoot = false, cards = false }) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = floraTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nuniform float uTime;\n${useRoot ? 'attribute vec3 aRoot;' : ''}`)
      .replace('#include <project_vertex>', `
        vec4 mvPosition = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
          vec3 root = ${useRoot ? 'aRoot' : 'instanceMatrix[3].xyz'};
        #else
          vec3 root = vec3(0.0);
        #endif
        {
          float hh = max(mvPosition.y - root.y, 0.0);
          float ph = root.x * 0.37 + root.z * 0.23;
          float gust = 0.6 + 0.4 * sin(uTime * 0.35 + root.x * 0.02);
          float sw = hh * hh * ${amp.toFixed(5)} * gust;
          mvPosition.x += sin(uTime * 1.25 + ph) * sw;
          mvPosition.z += cos(uTime * 1.05 + ph * 1.3) * sw * 0.7;
          ${cards ? 'mvPosition.y += sin(uTime * 2.3 + ph + mvPosition.x) * 0.03 * min(hh, 1.0);' : ''}
        }
        mvPosition = modelViewMatrix * mvPosition;
        gl_Position = projectionMatrix * mvPosition;`);
  };
  mat.customProgramCacheKey = () => 'cyclone-wind-' + key;
  return mat;
}

// ------------------------------------------------------------------ geometry builders
// flat vertex colour given in sRGB (vertex colours are linear in three.js)
function setColor(g, c) {
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  const l = c.map((v) => Math.pow(v, 2.2));
  for (let i = 0; i < n; i++) { a[i * 3] = l[0]; a[i * 3 + 1] = l[1]; a[i * 3 + 2] = l[2]; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
const strip = (g) => { const o = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(o.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) o.deleteAttribute(k); return o; };

// gnarly trunk: flared, buttress roots, slight lean; returns {geo, fork (Vector3), rFork}
function trunkGeometry(rng, { height = 4.2, r0 = 0.42, roots = 5, lean = 0.25 }) {
  const seg = 12, rows = 14;
  const pos = [], uv = [], idx = [];
  const ph = rng() * 6, lx = (rng() - 0.5) * lean, lz = (rng() - 0.5) * lean;
  for (let j = 0; j <= rows; j++) {
    const t = j / rows, y = t * height;
    const cx = lx * t * t * height, cz = lz * t * t * height;
    let r = r0 * (1 + 1.1 * Math.exp(-t * 7)) * (1 - 0.28 * t);
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const root = 1 + 0.55 * Math.exp(-t * 9) * Math.max(0, Math.cos(a * roots + ph)) ** 2;
      const bump = 1 + 0.06 * Math.sin(a * 3 + t * 9 + ph);
      const rr = r * root * bump;
      pos.push(cx + Math.cos(a) * rr, y - (t === 0 ? 0.15 : 0), cz + Math.sin(a) * rr);
      uv.push(i / seg * 2, y / 2.5);
    }
  }
  for (let j = 0; j < rows; j++) for (let i = 0; i < seg; i++) {
    const a = j * (seg + 1) + i, b = a + 1, c = a + seg + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return { geo: g, fork: new THREE.Vector3(lx * height, height, lz * height), rFork: r0 * 0.72 };
}

function branchGeometry(from, ctrl, to, r0, r1) {
  const curve = new THREE.QuadraticBezierCurve3(from, ctrl, to);
  const g = new THREE.TubeGeometry(curve, 6, 1, 7, false);
  // taper the unit-radius tube along its length
  const p = g.attributes.position, n = g.attributes.normal;
  const tmp = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    const t = Math.floor(i / 8) / 6;
    curve.getPoint(Math.min(1, t), c);
    tmp.fromBufferAttribute(p, i).sub(c);
    tmp.multiplyScalar(lerp(r0, r1, t));
    p.setXYZ(i, c.x + tmp.x, c.y + tmp.y, c.z + tmp.z);
  }
  g.computeVertexNormals();
  n.needsUpdate = true;
  // tube uvs run along the length in u; swap so the bark fibres follow the branch like on the trunk
  const uv = g.attributes.uv, len = curve.getLength();
  for (let i = 0; i < uv.count; i++) { const u = uv.getX(i), v = uv.getY(i); uv.setXY(i, v * 2, u * len / 2.5); }
  return g;
}

// leaf cards around clump centres; normals point away from the canopy centre for soft rounded shading
function canopyGeometry(rng, clumps, center) {
  const quads = [];
  const addCard = (c, w, h, yaw, pitch) => {
    const g = new THREE.PlaneGeometry(w, h);
    g.rotateX(pitch); g.rotateY(yaw);
    g.translate(c.x, c.y, c.z);
    quads.push(g);
  };
  for (const cl of clumps) {
    const R = cl.r;
    const base = rng() * Math.PI;
    for (let k = 0; k < 3; k++) addCard(cl.c, R * 2.3, R * 1.9, base + k * Math.PI / 3, (rng() - 0.5) * 0.3);
    addCard(new THREE.Vector3(cl.c.x, cl.c.y + R * 0.35, cl.c.z), R * 2.1, R * 2.1, rng() * Math.PI, -Math.PI / 2 + 0.35);
    // small satellite cards break up the silhouette
    for (let k = 0; k < 3; k++) {
      const a = rng() * Math.PI * 2, e = (rng() - 0.3) * 1.2;
      const p = new THREE.Vector3(cl.c.x + Math.cos(a) * R * 0.95, cl.c.y + e * R * 0.6, cl.c.z + Math.sin(a) * R * 0.95);
      addCard(p, R * 1.2, R * 1.0, a + Math.PI / 2 + (rng() - 0.5), (rng() - 0.5) * 0.6);
    }
  }
  const g = mergeGeometries(quads.map((q) => q.toNonIndexed()), false);
  const p = g.attributes.position, n = g.attributes.normal;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).sub(center);
    v.y *= 0.6; v.y += 0.35 * v.length();
    v.normalize();
    n.setXYZ(i, v.x, v.y, v.z);
  }
  return g;
}

function treeVariant(seed, { height = 4.2, spread = 3.2, clumpR = 2.4, clumps = 4, r0 = 0.42, lean = 0.3, leaves = true, twigs = 0 } = {}) {
  const rng = mulberry32(seed);
  const t = trunkGeometry(rng, { height, r0, lean });
  const parts = [t.geo];
  const cl = [];
  const f = t.fork;
  for (let i = 0; i < clumps; i++) {
    const a = (i / clumps) * Math.PI * 2 + rng() * 0.6;
    const out = spread * (0.75 + rng() * 0.45), up = 2.2 + rng() * 2.2;
    const end = new THREE.Vector3(f.x + Math.cos(a) * out, f.y + up, f.z + Math.sin(a) * out);
    const ctrl = new THREE.Vector3(f.x + Math.cos(a) * out * 0.3, f.y + up * 0.85, f.z + Math.sin(a) * out * 0.3);
    parts.push(branchGeometry(f.clone().add(new THREE.Vector3(0, -0.3, 0)), ctrl, end, t.rFork * 0.72, t.rFork * 0.18));
    cl.push({ c: end.clone().add(new THREE.Vector3(0, clumpR * 0.35, 0)), r: clumpR * (0.85 + rng() * 0.3) });
  }
  // extra twigs (dead trees get more, thinner branches)
  for (let i = 0; i < twigs; i++) {
    const a = rng() * Math.PI * 2, s = f.clone().add(new THREE.Vector3(0, -rng() * 1.2, 0));
    const end = s.clone().add(new THREE.Vector3(Math.cos(a) * 2.2, 1.2 + rng() * 1.8, Math.sin(a) * 2.2));
    parts.push(branchGeometry(s, s.clone().lerp(end, 0.5).add(new THREE.Vector3(0, 0.6, 0)), end, t.rFork * 0.35, 0.03));
  }
  cl.push({ c: new THREE.Vector3(f.x, f.y + 4.2 + rng(), f.z), r: clumpR * 1.1 });
  const center = cl.reduce((a, c) => a.add(c.c), new THREE.Vector3()).divideScalar(cl.length);
  const trunk = mergeGeometries(parts.map(strip), false);
  const leavesGeo = leaves ? canopyGeometry(rng, cl, center) : null;
  return { trunk, leaves: leavesGeo, top: center.y + clumpR };
}

// bamboo stalk: unit height, radius ~1, node rings every 1/22 of the height, light-green gradient
function bambooStalkGeometry() {
  const pts = [];
  const nodes = 22;
  for (let i = 0; i <= nodes * 4; i++) {
    const y = i / (nodes * 4);
    const k = (i % 4);
    const bulge = k === 0 ? 1.18 : k === 1 || k === 3 ? 1.04 : 1.0;
    pts.push(new THREE.Vector2(bulge * (1 - y * 0.35), y));
  }
  const g = new THREE.LatheGeometry(pts, 7);
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  const lo = new THREE.Color('#4e8a2a'), hi = new THREE.Color('#a8d060'), node = new THREE.Color('#3c5e22');
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    c.copy(lo).lerp(hi, y);
    const ring = Math.round(y * nodes * 4) % 4 === 0;
    if (ring) c.lerp(node, 0.55);
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// crossed vertical cards (grass tufts, ferns, flowers); origin at the bottom centre
function crossedCards(n, w, h, tilt = 0) {
  const list = [];
  for (let i = 0; i < n; i++) {
    const g = new THREE.PlaneGeometry(w, h);
    g.translate(0, h / 2, 0);
    if (tilt) g.rotateX(-tilt);
    g.rotateY((i / n) * Math.PI);
    list.push(g.toNonIndexed());
  }
  const g = mergeGeometries(list, false);
  // normals mostly up so cards shade like the ground they stand on
  const nrm = g.attributes.normal;
  for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, nrm.getX(i) * 0.3, 0.95, nrm.getZ(i) * 0.3);
  return g;
}

// fern / herb rosette: cards leaning outward from the centre
function rosette(n, w, h, lean) {
  const list = [];
  for (let i = 0; i < n; i++) {
    const g = new THREE.PlaneGeometry(w, h);
    g.translate(0, h / 2, 0);
    g.rotateX(lean);
    g.rotateY((i / n) * Math.PI * 2);
    list.push(g.toNonIndexed());
  }
  const g = mergeGeometries(list, false);
  const nrm = g.attributes.normal;
  for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, nrm.getX(i) * 0.4, 0.9, nrm.getZ(i) * 0.4);
  return g;
}

function rockGeometry(seed) {
  const fb = makeFbm(seed, 3);
  const g = new THREE.IcosahedronGeometry(1, 3);
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = fb(v.x * 1.3 + 3, v.z * 1.3 + v.y * 0.7 + 3);
    const s = 0.78 + n * 0.55;
    v.multiplyScalar(s);
    v.y = v.y * 0.68 + (v.y < -0.2 ? (v.y + 0.2) * 0.4 : 0);
    p.setXYZ(i, v.x, v.y, v.z);
    const k = Math.pow(0.62 + clamp((v.y + 0.5) * 0.3, 0, 0.3) + (n - 0.5) * 0.16, 2.2); // sRGB shade -> linear
    col.set([k, k, k], i * 3);
  }
  g.computeVertexNormals();
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

function mushroomGeometry() {
  const cap = new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.5);
  cap.scale(0.22, 0.14, 0.22); cap.translate(0, 0.2, 0);
  setColor(cap, [1, 0.42, 0.18]);
  const stem = new THREE.CylinderGeometry(0.06, 0.08, 0.22, 7);
  stem.translate(0, 0.11, 0);
  setColor(stem, [0.96, 0.9, 0.78]);
  return mergeGeometries([strip(cap), strip(stem)], false);
}

// ------------------------------------------------------------------ placement helpers
class Scatter {
  constructor(ctx) {
    this.T = ctx.terrain;
    this.noScatter = ctx.noScatter;
    this.cell = 4;
    this.grid = new Map();
  }
  key(x, z) { return Math.floor(x / this.cell) * 7919 + Math.floor(z / this.cell); }
  blocked(x, z, r) {
    for (const c of this.noScatter) if (Math.hypot(x - c.x, z - c.z) < c.r + r) return true;
    return false;
  }
  near(x, z, r) {
    const R = Math.ceil(r / this.cell);
    const ix = Math.floor(x / this.cell), iz = Math.floor(z / this.cell);
    for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) {
      const arr = this.grid.get((ix + a) * 7919 + (iz + b));
      if (!arr) continue;
      for (const o of arr) if (Math.hypot(o.x - x, o.z - z) < r + o.r) return true;
    }
    return false;
  }
  reserve(x, z, r) {
    const k = this.key(x, z);
    if (!this.grid.has(k)) this.grid.set(k, []);
    this.grid.get(k).push({ x, z, r });
  }
  // standard ground test for plants
  ok(x, z, { slope = 0.25, path = 1, water = 1.5, deck = true } = {}) {
    const T = this.T, P = MAP.half - 3;
    if (Math.abs(x) > P || Math.abs(z) > P) return false;
    if (T.isWater(x, z)) return false;
    if (water > 0) {
      const w = T.forestWaterAt(x, z);
      if (w !== null && T.heightAt(x, z) < w + 0.25) return false;
      if (T.heightAt(x, z) < -2) return false;
    }
    if (deck && T.deckAt(x, z) !== null) return false;
    if (T.slopeAt(x, z) > slope) return false;
    if (path >= 0 && T.onPath(x, z, path)) return false;
    return true;
  }
}

function instanced(geo, mat, list, { shadow = true, receive = false, color = null, name } = {}) {
  const m = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
  m.count = list.length;
  const M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const c = new THREE.Color();
  list.forEach((o, i) => {
    p.set(o.x, o.y, o.z);
    q.setFromEuler(e.set(o.rx || 0, o.ry || 0, o.rz || 0, 'YXZ'));
    s.set(o.sx ?? o.s ?? 1, o.sy ?? o.s ?? 1, o.sz ?? o.s ?? 1);
    m.setMatrixAt(i, M.compose(p, q, s));
    // tints are authored as sRGB multipliers; instance colours live in linear space
    if (color) m.setColorAt(i, c.setRGB(...(o.col || [1, 1, 1]), THREE.SRGBColorSpace));
  });
  m.instanceMatrix.needsUpdate = true;
  if (m.instanceColor) m.instanceColor.needsUpdate = true;
  m.castShadow = shadow;
  m.receiveShadow = receive;
  m.name = name || 'flora';
  m.computeBoundingSphere();
  return m;
}

// ------------------------------------------------------------------ main
export function buildFlora(ctx) {
  const T = ctx.terrain;
  const group = new THREE.Group();
  group.name = 'cyclone-flora';
  ctx.scene.add(group);
  const S = new Scatter(ctx);
  const rng = mulberry32(7501);
  const fbDens = makeFbm(7502, 3), fbPatch = makeFbm(7503, 3);
  const stats = {};

  // keep the arrival area clear
  ctx.addNoScatter(ARRIVAL.x, ARRIVAL.z, 7);
  ctx.addNoScatter(SPAWN.x, SPAWN.z, 5);
  ctx.addNoScatter(TOWER_SITE.x, TOWER_SITE.z, TOWER_SITE.r + 2);

  // ---------------- materials
  const barkMat = new THREE.MeshStandardMaterial({ map: barkTex(), roughness: 0.95, color: 0xd8c8b8 });
  const leafMat = (map, key) => addWind(new THREE.MeshStandardMaterial({ map, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85 }), { amp: 0.0016, key, cards: true });
  const leafMats = {
    green: leafMat(leafClumpTex(), 'leafG'), dark: leafMat(leafClumpDarkTex(), 'leafD'),
    blossom: leafMat(blossomClumpTex(), 'leafB'), autumn: leafMat(autumnClumpTex(), 'leafA'),
  };

  // ---------------- tree variants
  const variants = {
    oakA: treeVariant(11, { height: 4.4, spread: 3.2, clumpR: 2.5, clumps: 4 }),
    oakB: treeVariant(23, { height: 5.2, spread: 3.6, clumpR: 2.7, clumps: 5, r0: 0.48 }),
    oakC: treeVariant(37, { height: 3.8, spread: 2.8, clumpR: 2.2, clumps: 4, r0: 0.38, lean: 0.5 }),
    tall: treeVariant(41, { height: 6.4, spread: 2.6, clumpR: 2.3, clumps: 4, r0: 0.4 }),
    blossom: treeVariant(53, { height: 3.4, spread: 2.6, clumpR: 2.1, clumps: 5, r0: 0.3, lean: 0.4 }),
    dry: treeVariant(67, { height: 3.6, spread: 2.2, clumpR: 1.4, clumps: 3, r0: 0.3, lean: 0.6 }),
    dead: treeVariant(71, { height: 3.2, spread: 2.0, clumpR: 1.2, clumps: 3, r0: 0.28, lean: 0.7, leaves: false, twigs: 6 }),
  };
  const treeLists = {}; for (const k of Object.keys(variants)) treeLists[k] = [];
  const addTree = (kind, x, z, s, leaf) => {
    const y = T.heightAt(x, z);
    treeLists[kind].push({ x, y: y - 0.1, z, ry: rng() * Math.PI * 2, s, leaf, col: [0.88 + rng() * 0.2, 0.88 + rng() * 0.2, 0.85 + rng() * 0.15] });
    S.reserve(x, z, 2.2 * s);
    if (T.heightAt(x, z) < 20 && ctx.colliders) ctx.colliders.addCircle(x, z, 0.55 * s);
  };

  // forest trees (dense but with glades); valley rim / cliff-top trees for the silhouette
  for (let i = 0; i < 9000; i++) {
    const x = (rng() - 0.5) * (MAP.size - 8), z = (rng() - 0.5) * (MAP.size - 8);
    const hill = T.hillWeight(x, z), glade = T.gladeWeight(x, z);
    const h = T.heightAt(x, z);
    const dens = fbDens(x * 0.03, z * 0.03);
    if (glade > 0.1) continue;
    let kind = null, s = 0.9 + rng() * 0.45, min = 6.5;
    if (hill < 0.35) {
      if (dens < 0.36 && h < 8) continue;                       // clearings
      kind = rng() < 0.08 ? 'blossom' : rng() < 0.2 ? 'tall' : ['oakA', 'oakB', 'oakC'][(rng() * 3) | 0];
      if (h > 10) { min = 8; s *= 1.1; }
    } else {
      if (rng() > 0.05 && h > 5) continue;                       // hill: only a few dry / dead trees
      if (rng() > 0.25) continue;
      kind = rng() < 0.55 ? 'dry' : 'dead';
      min = 12; s *= 0.9;
    }
    if (!S.ok(x, z, { slope: 0.22, path: 3, water: 1 }) || S.blocked(x, z, 2) || S.near(x, z, min * 0.5 * s)) continue;
    addTree(kind, x, z, s, kind);
  }
  // Windward Glade: a ring of big trees around the clearing + blossom trees
  for (let i = 0; i < 70; i++) {
    const a = rng() * Math.PI * 2, r = GLADE.r * (0.62 + rng() * 0.38);
    const x = GLADE.x + Math.cos(a) * r, z = GLADE.z + Math.sin(a) * r;
    if (x < GLADE.x - GLADE.r + 9 && Math.abs(z - GLADE.z) < 8) continue; // keep the bridge landing open
    if (!S.ok(x, z, { slope: 0.25, path: -1 }) || S.blocked(x, z, 2) || S.near(x, z, 3.6)) continue;
    addTree(rng() < 0.35 ? 'blossom' : ['oakA', 'oakB', 'tall'][(rng() * 3) | 0], x, z, 1 + rng() * 0.35);
  }
  for (const [k, list] of Object.entries(treeLists)) {
    if (!list.length) continue;
    const v = variants[k];
    group.add(instanced(v.trunk, barkMat, list, { name: 'trunk-' + k }));
    if (v.leaves) {
      const mat = k === 'blossom' ? leafMats.blossom : k === 'dry' ? leafMats.autumn : k === 'oakB' ? leafMats.dark : leafMats.green;
      group.add(instanced(v.leaves, mat, list, { color: true, name: 'leaves-' + k }));
    }
    stats['tree_' + k] = list.length;
  }

  // ---------------- bamboo groves
  const stalks = [], sprays = [];
  for (const gv of BAMBOO_GROVES) {
    for (let i = 0; i < gv.n * 2 && stalks.length < 2400; i++) {
      const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * gv.r;
      const x = gv.x + Math.cos(a) * r, z = gv.z + Math.sin(a) * r;
      if (!S.ok(x, z, { slope: 0.3, path: 1.5 }) || S.blocked(x, z, 0.4)) continue;
      const y = T.heightAt(x, z) - 0.2, H = 9 + rng() * 7, rad = 0.075 + rng() * 0.05;
      const rx = (rng() - 0.5) * 0.12, rz = (rng() - 0.5) * 0.12;
      stalks.push({ x, y, z, rx, rz, ry: rng() * 6, sx: rad, sy: H, sz: rad });
      const tip = new THREE.Vector3(Math.sin(rz) * -H, 0, Math.sin(rx) * H); // approximate lean offset
      for (let k = 0; k < 6; k++) {
        const t = 0.55 + (k / 6) * 0.45 + rng() * 0.05;
        sprays.push({ x: x + tip.x * t * t, y: y + H * t, z: z + tip.z * t * t, ry: rng() * Math.PI * 2, rx: (rng() - 0.5) * 0.5, s: 1.4 + rng() * 1.1, root: [x, y, z] });
      }
      if (i % 5 === 0) S.reserve(x, z, 0.8);
    }
  }
  if (stalks.length) {
    const stalkMat = addWind(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 }), { amp: 0.0022, key: 'bamboo' });
    group.add(instanced(bambooStalkGeometry(), stalkMat, stalks, { name: 'bamboo' }));
    const sprayGeo = crossedCards(2, 1.6, 1.8);
    sprayGeo.translate(0, -0.6, 0);
    const root = new Float32Array(sprays.length * 3);
    sprays.forEach((s, i) => root.set(s.root, i * 3));
    const sprayMat = addWind(new THREE.MeshStandardMaterial({ map: bambooLeafTex(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 }), { amp: 0.0022, key: 'bambooLeaf', useRoot: true, cards: true });
    const sm = instanced(sprayGeo, sprayMat, sprays, { name: 'bamboo-leaves' });
    sm.geometry = sm.geometry.clone();
    sm.geometry.setAttribute('aRoot', new THREE.InstancedBufferAttribute(root, 3));
    group.add(sm);
    stats.bamboo = stalks.length;
  }

  // ---------------- rocks
  const rockGeos = [rockGeometry(7511), rockGeometry(7512), rockGeometry(7513)];
  const rockLists = [[], [], []];
  for (let i = 0; i < 2600; i++) {
    const x = (rng() - 0.5) * (MAP.size - 10), z = (rng() - 0.5) * (MAP.size - 10);
    const h = T.heightAt(x, z);
    if (h > 40) continue;
    const hill = T.hillWeight(x, z);
    const nearCliff = T.slopeAt(x + 2, z) > 0.3 || T.slopeAt(x - 2, z) > 0.3 || T.slopeAt(x, z + 2) > 0.3 || T.slopeAt(x, z - 2) > 0.3;
    if (!nearCliff && rng() > 0.18) continue;
    if (!S.ok(x, z, { slope: 0.45, path: 1.2, water: 0 }) || S.blocked(x, z, 1)) continue;
    const s = (nearCliff ? 0.9 + rng() * 1.8 : 0.4 + rng() * 0.9) * (rng() < 0.08 ? 1.8 : 1);
    if (S.near(x, z, s * 0.9)) continue;
    const tint = hill > 0.5 ? [1.0, 0.56 + rng() * 0.08, 0.34 + rng() * 0.06] : [0.92 + rng() * 0.06, 0.8, 0.62 + rng() * 0.06];
    rockLists[i % 3].push({ x, y: T.heightAt(x, z) - s * 0.25, z, ry: rng() * 6, rx: (rng() - 0.5) * 0.3, s, sy: s * (0.8 + rng() * 0.4), col: tint });
    S.reserve(x, z, s * 0.9);
    if (s > 1.2 && h < 30 && ctx.colliders) ctx.colliders.addCircle(x, z, s * 0.8);
  }
  const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, color: 0xffffff });
  rockGeos.forEach((g, k) => { if (rockLists[k].length) group.add(instanced(g, rockMat, rockLists[k], { color: true, receive: true, name: 'rocks' })); });
  stats.rocks = rockLists.reduce((a, l) => a + l.length, 0);

  // ---------------- ferns, grass, flowers, mushrooms
  const ferns = [], grass = [], flowers = [], shrooms = [];
  for (let i = 0; i < 60000 && grass.length < 16000; i++) {
    const x = (rng() - 0.5) * (MAP.size - 10), z = (rng() - 0.5) * (MAP.size - 10);
    const h = T.heightAt(x, z);
    if (h > 44) continue;
    const hill = T.hillWeight(x, z), glade = T.gladeWeight(x, z);
    const patch = fbPatch(x * 0.06, z * 0.06);
    if (hill > 0.5 && glade < 0.5 && (rng() > 0.18 || patch < 0.45)) continue;   // dry hill: sparse clumps
    if (!S.ok(x, z, { slope: 0.3, path: 0.3 }) || S.blocked(x, z, 0.2)) continue;
    const y = h - 0.05;
    if (glade > 0.5) {
      if (patch > 0.55 && rng() < 0.4) flowers.push({ x, y, z, ry: rng() * 6, s: 0.8 + rng() * 0.5 });
      else grass.push({ x, y, z, ry: rng() * 6, s: 0.9 + rng() * 0.6, col: [0.9 + rng() * 0.15, 1.05, 0.8] });
    } else if (hill > 0.5) {
      grass.push({ x, y, z, ry: rng() * 6, s: 0.7 + rng() * 0.5, col: [1.25, 1.0, 0.55] });
    } else {
      const r = rng();
      if (r < 0.1) ferns.push({ x, y, z, ry: rng() * 6, s: 0.8 + rng() * 0.7, col: [0.9 + rng() * 0.2, 1, 0.9] });
      else if (r < 0.14 && patch > 0.55) flowers.push({ x, y, z, ry: rng() * 6, s: 0.7 + rng() * 0.4 });
      else if (r < 0.16) shrooms.push({ x, y, z, ry: rng() * 6, s: 0.6 + rng() * 0.9 });
      else grass.push({ x, y, z, ry: rng() * 6, s: 0.8 + rng() * 0.6, col: [0.95 + rng() * 0.1, 1.0, 0.75] });
    }
  }
  const cardMat = (map, key, amp = 0.05) => addWind(new THREE.MeshStandardMaterial({ map, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.95 }), { amp, key, cards: true });
  if (grass.length) group.add(instanced(crossedCards(2, 1.1, 0.75), cardMat(tex('grassBlades'), 'grass', 0.12), grass, { shadow: false, color: true, name: 'grass' }));
  if (ferns.length) group.add(instanced(rosette(6, 0.9, 1.3, 0.75), cardMat(fernTex(), 'fern', 0.04), ferns, { shadow: false, color: true, name: 'ferns' }));
  if (flowers.length) group.add(instanced(crossedCards(2, 0.9, 0.7), cardMat(tex('flowers'), 'flowers', 0.1), flowers, { shadow: false, name: 'flowers' }));
  if (shrooms.length) group.add(instanced(mushroomGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }), shrooms, { shadow: false, name: 'mushrooms' }));
  Object.assign(stats, { grass: grass.length, ferns: ferns.length, flowers: flowers.length, mushrooms: shrooms.length });

  // ---------------- healing herbs (glowing)
  const herbs = [];
  for (const hs of HEALING_HERB_SPOTS) {
    for (let i = 0, n = 0; i < 60 && n < hs.n; i++) {
      const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * hs.r;
      const x = hs.x + Math.cos(a) * r, z = hs.z + Math.sin(a) * r;
      if (!S.ok(x, z, { slope: 0.3, path: 0.5 }) || S.near(x, z, 0.8)) continue;
      herbs.push({ x, y: T.heightAt(x, z) - 0.02, z, ry: rng() * 6, s: 0.8 + rng() * 0.4, ph: rng() * 10 });
      S.reserve(x, z, 0.6);
      n++;
    }
  }
  let herbGlow = null;
  if (herbs.length) {
    const leafM = addWind(new THREE.MeshStandardMaterial({ map: herbLeafTex(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.5 }), { amp: 0.05, key: 'herb', cards: true });
    group.add(instanced(rosette(5, 0.34, 0.62, 0.9), leafM, herbs, { shadow: false, name: 'herb-leaves' }));
    const stem = new THREE.CylinderGeometry(0.012, 0.018, 0.55, 5); stem.translate(0, 0.27, 0);
    group.add(instanced(stem, new THREE.MeshStandardMaterial({ color: '#3f8a4a', roughness: 0.7 }), herbs, { shadow: false, name: 'herb-stems' }));
    const bulb = new THREE.IcosahedronGeometry(0.075, 1); bulb.translate(0, 0.58, 0);
    const bulbMat = new THREE.MeshStandardMaterial({ color: '#d8fff0', emissive: '#6affd0', emissiveIntensity: 2.2, roughness: 0.3 });
    group.add(instanced(bulb, bulbMat, herbs, { shadow: false, name: 'herb-bulbs' }));
    // soft pulsing glow sprites
    const gp = new Float32Array(herbs.length * 3), gph = new Float32Array(herbs.length);
    herbs.forEach((hb, i) => { gp.set([hb.x, hb.y + 0.6 * hb.s, hb.z], i * 3); gph[i] = hb.ph; });
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.BufferAttribute(gp, 3));
    gg.setAttribute('ph', new THREE.BufferAttribute(gph, 1));
    const gm = new THREE.ShaderMaterial({
      uniforms: { map: { value: glowDotTex() }, time: floraTime, color: { value: new THREE.Color('#7affd6') } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute float ph; uniform float time; varying float vA;
        void main(){ vec4 mv = modelViewMatrix * vec4(position + vec3(0.0, sin(time * 1.7 + ph) * 0.05, 0.0), 1.0);
        vA = 0.55 + 0.45 * sin(time * 2.2 + ph); gl_PointSize = (1.6 + vA) * 240.0 / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; uniform vec3 color; varying float vA;
        void main(){ float a = texture2D(map, gl_PointCoord).a * vA * 0.8; gl_FragColor = vec4(color * a, a);
        #include <colorspace_fragment>
        }`,
    });
    herbGlow = new THREE.Points(gg, gm);
    herbGlow.frustumCulled = false;
    group.add(herbGlow);
    stats.herbs = herbs.length;
  }

  return {
    group, stats, herbs,
    update(dt, t) { floraTime.value = t; },
  };
}

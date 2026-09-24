// Heightmap terrain for Roumen built from the zone map (sea / plaza / town / grassy loop / forest hills),
// plus authored ramps and walkable decks (bridges, piers, wooden stairs) over the water.
import * as THREE from 'three';
import { makeFbm, smoothstep, lerp, clamp } from '../core/utils.js';
import { tex } from '../core/textures.js';
import {
  WORLD, Z, zoneAt, HEIGHTS, RAMPS, DECKS, DECK_DISCS, LOOP_PATH, LOOP_PATH_WIDTH,
  MAIN_STREET, MAIN_STREET_WIDTH, TERRACE_LANE, SOUTH_LANE, WEST_WALK, LANE_WIDTH,
} from './layout.js';

// ------------------------------------------------------------ polyline helpers
export function sampleSpline(points, step = 0.5) {
  const pts = points.map(([x, z]) => new THREE.Vector3(x, 0, z));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const len = curve.getLength();
  const n = Math.max(2, Math.ceil(len / step));
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = curve.getPointAt(t);
    const d = curve.getTangentAt(t);
    out.push({ x: p.x, z: p.z, tx: d.x, tz: d.z, t, s: t * len, h: 0 });
  }
  out.len = len;
  return out;
}

// nearest point on a polyline → { d, t (0..1 along total length), x, z, tx, tz }
export function polyNearest(pts, x, z, cum, total) {
  let best = { d: Infinity };
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-9;
    const u = clamp(((x - ax) * dx + (z - az) * dz) / L2, 0, 1);
    const px = ax + dx * u, pz = az + dz * u;
    const d = Math.hypot(x - px, z - pz);
    if (d < best.d) {
      const L = Math.sqrt(L2);
      best = { d, t: (cum[i] + u * L) / total, x: px, z: pz, tx: dx / L, tz: dz / L };
    }
  }
  return best;
}
export function prepPoly(p) {
  const cum = [0];
  for (let i = 1; i < p.pts.length; i++) cum.push(cum[i - 1] + Math.hypot(p.pts[i][0] - p.pts[i - 1][0], p.pts[i][1] - p.pts[i - 1][1]));
  p.cum = cum; p.total = cum[cum.length - 1];
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const [x, z] of p.pts) { minX = Math.min(minX, x); minZ = Math.min(minZ, z); maxX = Math.max(maxX, x); maxZ = Math.max(maxZ, z); }
  const pad = (p.width || 4) / 2 + 8;
  p.bbox = [minX - pad, minZ - pad, maxX + pad, maxZ + pad];
  return p;
}
const inBox = (b, x, z) => x >= b[0] && x <= b[2] && z >= b[1] && z <= b[3];

// Spatial hash over path samples for fast "distance to nearest path" queries
class SampleGrid {
  constructor(cell = 8) { this.cell = cell; this.map = new Map(); }
  key(ix, iz) { return ix * 100003 + iz; }
  add(s) {
    const ix = Math.floor(s.x / this.cell), iz = Math.floor(s.z / this.cell);
    const k = this.key(ix, iz);
    if (!this.map.has(k)) this.map.set(k, []);
    this.map.get(k).push(s);
  }
  nearest(x, z, maxR) {
    const r = Math.ceil(maxR / this.cell);
    const ix = Math.floor(x / this.cell), iz = Math.floor(z / this.cell);
    let best = null, bd = maxR * maxR;
    for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) {
      const arr = this.map.get(this.key(ix + a, iz + b));
      if (!arr) continue;
      for (const s of arr) {
        const dx = s.x - x, dz = s.z - z, dd = dx * dx + dz * dz;
        if (dd < bd) { bd = dd; best = s; }
      }
    }
    return best ? { s: best, d: Math.sqrt(bd) } : null;
  }
}

const fbmA = makeFbm(1234, 5);
const fbmB = makeFbm(987, 4);

export class Terrain {
  constructor() {
    this.size = WORLD.size;
    this.res = 321;
    this.cell = this.size / (this.res - 1);
    this.heights = new Float32Array(this.res * this.res);
    this.ramps = RAMPS.map((r) => prepPoly({ ...r }));
    this.decks = DECKS.map((d) => prepPoly({ ...d }));
    this.discs = DECK_DISCS;
    // path samples (streets, lanes, ramps, loop trail) for vegetation / prop exclusion
    this.pathGrid = new SampleGrid(8);
    this.paths = [
      { pts: MAIN_STREET, width: MAIN_STREET_WIDTH, kind: 'street' },
      { pts: TERRACE_LANE, width: LANE_WIDTH, kind: 'lane' }, { pts: SOUTH_LANE, width: LANE_WIDTH, kind: 'lane' },
      { pts: WEST_WALK, width: LANE_WIDTH, kind: 'lane' }, { pts: LOOP_PATH, width: LOOP_PATH_WIDTH, kind: 'trail' },
      ...RAMPS.map((r) => ({ pts: r.pts, width: r.width, kind: r.kind })),
    ].map((p) => ({ ...p, samples: sampleSpline(p.pts, 0.7) }));
    for (const p of this.paths) for (const s of p.samples) { s.w = p.width; s.kind = p.kind; this.pathGrid.add(s); }
    this.streetSamples = this.paths[0].samples;
    this.build();
  }

  // --------------------------------------------------------------- height field
  build() {
    const { res, cell, size } = this;
    const half = size / 2;
    const N = res * res;
    const zone = new Uint8Array(N);
    for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) zone[j * res + i] = zoneAt(-half + i * cell, -half + j * cell);
    this.zoneGrid = zone;
    // chamfer distance (in cells) from cells inside a class to the nearest cell outside it
    const dist = (isInside) => {
      const D = new Float32Array(N);
      for (let k = 0; k < N; k++) D[k] = isInside(zone[k]) ? 1e9 : 0;
      const d1 = 1, d2 = Math.SQRT2;
      for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) {
        const k = j * res + i; let v = D[k]; if (!v) continue;
        if (i > 0) v = Math.min(v, D[k - 1] + d1);
        if (j > 0) { v = Math.min(v, D[k - res] + d1); if (i > 0) v = Math.min(v, D[k - res - 1] + d2); if (i < res - 1) v = Math.min(v, D[k - res + 1] + d2); }
        D[k] = v;
      }
      for (let j = res - 1; j >= 0; j--) for (let i = res - 1; i >= 0; i--) {
        const k = j * res + i; let v = D[k]; if (!v) continue;
        if (i < res - 1) v = Math.min(v, D[k + 1] + d1);
        if (j < res - 1) { v = Math.min(v, D[k + res] + d1); if (i < res - 1) v = Math.min(v, D[k + res + 1] + d2); if (i > 0) v = Math.min(v, D[k + res - 1] + d2); }
        D[k] = v;
      }
      return D;
    };
    const forestD = dist((z) => z === Z.FOREST);
    const seaD = dist((z) => z === Z.SEA);
    // 1. target heights per zone
    const T = new Float32Array(N);
    for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) {
      const k = j * res + i, x = -half + i * cell, z = -half + j * cell;
      const zn = zone[k];
      const n = fbmA(x * 0.02 + 10, z * 0.02 + 10) - 0.5;
      const edge = Math.max(Math.abs(x), Math.abs(z));
      let h;
      if (zn === Z.SEA) h = -1.4 - Math.min(seaD[k] * cell, 30) * 0.2 + n * 0.8;
      else if (zn === Z.SAND) h = HEIGHTS.plaza;
      else if (zn === Z.TOWN) h = HEIGHTS.town;
      else if (zn === Z.FIELD) h = HEIGHTS.field + n * 2.2 + (fbmB(x * 0.07, z * 0.07) - 0.5) * 0.6;
      else h = HEIGHTS.field + 1 + Math.min(forestD[k] * cell * 0.8, 26) + n * 6 + smoothstep(150, 200, edge) * 20;
      T[k] = h;
    }
    // 2. blur (separable gaussian) and keep the flat plaza / town exact
    const blur = (src, r) => {
      const w = []; let ws = 0;
      for (let t = -r; t <= r; t++) { const v = Math.exp(-(t * t) / (2 * (r / 2) ** 2)); w.push(v); ws += v; }
      const tmp = new Float32Array(N), out = new Float32Array(N);
      for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) {
        let s = 0; for (let t = -r; t <= r; t++) s += src[j * res + clamp(i + t, 0, res - 1)] * w[t + r]; tmp[j * res + i] = s / ws;
      }
      for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) {
        let s = 0; for (let t = -r; t <= r; t++) s += tmp[clamp(j + t, 0, res - 1) * res + i] * w[t + r]; out[j * res + i] = s / ws;
      }
      return out;
    };
    const B = blur(T, 3);
    const H = this.heights;
    for (let k = 0; k < N; k++) {
      const zn = zone[k];
      H[k] = zn === Z.SAND || zn === Z.TOWN ? T[k] : zn === Z.SEA ? Math.min(B[k], -1.0) : B[k];
    }
    // 3. ramps (paths up to the grassy loop) override the height field
    for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) {
      const x = -half + i * cell, z = -half + j * cell, k = j * res + i;
      for (const r of this.ramps) {
        if (!inBox(r.bbox, x, z)) continue;
        const p = polyNearest(r.pts, x, z, r.cum, r.total);
        const w = 1 - smoothstep(r.width / 2, r.width / 2 + 7, p.d);
        if (w <= 0) continue;
        const rh = lerp(r.h0, r.h1, smoothstep(0, 1, p.t));
        H[k] = lerp(H[k], rh, w);
      }
    }
    this.buildSplat();
    this.buildMesh();
  }

  // raw terrain surface
  heightAt(x, z) {
    const { res, cell } = this;
    const half = this.size / 2;
    const fx = clamp((x + half) / cell, 0, res - 1.001), fz = clamp((z + half) / cell, 0, res - 1.001);
    const i = Math.floor(fx), j = Math.floor(fz);
    const u = fx - i, v = fz - j;
    const H = this.heights;
    const a = H[j * res + i], b = H[j * res + i + 1], c = H[(j + 1) * res + i], d = H[(j + 1) * res + i + 1];
    if (u + v <= 1) return a + (b - a) * u + (c - a) * v;
    return d + (c - d) * (1 - u) + (b - d) * (1 - v);
  }

  // walkable deck (bridge / pier / wooden stairs) height at x,z or null
  deckAt(x, z) {
    for (const d of this.decks) {
      if (!inBox(d.bbox, x, z)) continue;
      const p = polyNearest(d.pts, x, z, d.cum, d.total);
      if (p.d <= d.width / 2) return lerp(d.h0, d.h1, p.t) + (d.arch ? Math.sin(p.t * Math.PI) * d.arch : 0);
    }
    for (const c of this.discs) if (Math.hypot(x - c.x, z - c.z) <= c.r) return c.h;
    return null;
  }
  // what entities stand on (deck if above the terrain)
  groundAt(x, z) {
    const d = this.deckAt(x, z);
    const h = this.heightAt(x, z);
    return d !== null && d > h - 0.3 ? Math.max(d, h) : h;
  }
  normalAt(x, z, out = new THREE.Vector3()) {
    const e = 0.6;
    const hx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const hz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    return out.set(-hx, 2 * e, -hz).normalize();
  }
  slopeAt(x, z) { return 1 - this.normalAt(x, z).y; }
  isWater(x, z) { return this.heightAt(x, z) < -0.25 && this.deckAt(x, z) === null; }
  zoneAt(x, z) { return zoneAt(x, z); }
  // nearest street / lane / trail / ramp sample ({s, d}); s.w = path width
  nearestPath(x, z, maxR = 30) { return this.pathGrid.nearest(x, z, maxR); }
  onPath(x, z, pad = 0) { const p = this.pathGrid.nearest(x, z, 14); return !!(p && p.d < p.s.w / 2 + pad); }

  // --------------------------------------------------------------- splat maps
  buildSplat() {
    const S = 1024;
    const half = this.size / 2;
    const k = S / this.size;
    const mk = () => { const c = document.createElement('canvas'); c.width = c.height = S; return c; };
    // paths are drawn as thick strokes (fast), then read back as coverage
    const pathCoverage = (list) => {
      const c = mk(), ctx = c.getContext('2d');
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#fff';
      for (const p of list) {
        ctx.lineWidth = p.width * k;
        ctx.beginPath();
        p.samples.forEach((s, i) => (i ? ctx.lineTo((s.x + half) * k, (s.z + half) * k) : ctx.moveTo((s.x + half) * k, (s.z + half) * k)));
        ctx.stroke();
      }
      const b = mk(), bctx = b.getContext('2d');
      bctx.filter = 'blur(2px)';
      bctx.drawImage(c, 0, 0);
      return bctx.getImageData(0, 0, S, S).data;
    };
    const dirtPaths = pathCoverage(this.paths.filter((p) => p.kind === 'trail' || p.kind === 'dirt'));
    const stonePaths = pathCoverage(this.paths.filter((p) => p.kind === 'stairs'));
    const cA = mk(), cB = mk();
    const iA = cA.getContext('2d').createImageData(S, S), iB = cB.getContext('2d').createImageData(S, S);
    const A = iA.data, Bd = iB.data;
    const nz = makeFbm(55, 4);
    const res = this.res, Hh = this.heights, cell = this.cell;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const wx = -half + (x + 0.5) / S * this.size, wz = -half + (y + 0.5) / S * this.size;
        const i4 = (y * S + x) * 4;
        const zn = zoneAt(wx, wz);
        const n = nz(wx * 0.15, wz * 0.15);
        let dirt = smoothstep(0.25 + (n - 0.5) * 0.4, 0.75, dirtPaths[i4] / 255);
        let cob = zn === Z.TOWN ? 1 : 0;
        const plaza = zn === Z.SAND ? 1 : 0;
        const sand = zn === Z.SEA ? 1 : 0;
        const forest = zn === Z.FOREST ? 1 : 0;
        cob = Math.max(cob, stonePaths[i4] / 255);
        if (zn === Z.FIELD) dirt = Math.max(dirt, smoothstep(0.62, 0.8, nz(wx * 0.05 + 3, wz * 0.05)) * 0.5);
        // slope → rock
        const gi = clamp(Math.round((wx + half) / cell), 1, res - 2), gj = clamp(Math.round((wz + half) / cell), 1, res - 2);
        const hx = (Hh[gj * res + gi + 1] - Hh[gj * res + gi - 1]) / (2 * cell), hz = (Hh[(gj + 1) * res + gi] - Hh[(gj - 1) * res + gi]) / (2 * cell);
        const slope = 1 - 1 / Math.sqrt(1 + hx * hx + hz * hz);
        const rock = smoothstep(0.22, 0.42, slope + (n - 0.5) * 0.08) * (1 - cob) * (1 - plaza);
        A[i4] = dirt * 255; A[i4 + 1] = cob * 255; A[i4 + 2] = plaza * 255; A[i4 + 3] = 255 - rock * 255;
        Bd[i4] = forest * 255; Bd[i4 + 1] = sand * 255; Bd[i4 + 2] = 0; Bd[i4 + 3] = 255;
      }
    }
    cA.getContext('2d').putImageData(iA, 0, 0);
    cB.getContext('2d').putImageData(iB, 0, 0);
    const soften = (c) => { const t = mk(), ctx = t.getContext('2d'); ctx.filter = 'blur(1.2px)'; ctx.drawImage(c, 0, 0); return t; };
    this.splatCanvas = soften(cA);
    this.splat2Canvas = soften(cB);
    const toTex = (c) => {
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.NoColorSpace; t.premultiplyAlpha = false; t.flipY = false;
      t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
      return t;
    };
    this.splatTex = toTex(this.splatCanvas);
    this.splat2Tex = toTex(this.splat2Canvas);
  }

  buildMesh() {
    const { res, size } = this;
    const geo = new THREE.PlaneGeometry(size, size, res - 1, res - 1);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      const i = k % res, j = Math.floor(k / res);
      pos.setY(k, this.heights[j * res + i]);
    }
    geo.computeVertexNormals();
    geo.computeBoundingSphere();

    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 });
    const uniforms = {
      grassMap: { value: tex('grass') }, dirtMap: { value: tex('dirt') }, cobbleMap: { value: tex('cobble') },
      rockMap: { value: tex('stoneWall') }, plazaMap: { value: tex('plazaStone') }, sandMap: { value: tex('sand') },
      splatMap: { value: this.splatTex }, splat2Map: { value: this.splat2Tex }, worldSize: { value: size },
    };
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNorm;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed,1.0)).xyz;\nvWNorm = normalize(mat3(modelMatrix) * objectNormal);');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec3 vWPos; varying vec3 vWNorm;
          uniform sampler2D grassMap, dirtMap, cobbleMap, rockMap, plazaMap, sandMap, splatMap, splat2Map;
          uniform float worldSize;`)
        .replace('#include <map_fragment>', `
          vec2 wuv = vWPos.xz;
          vec2 suv = (vWPos.xz + worldSize*0.5) / worldSize;
          vec4 sp = texture2D(splatMap, suv);
          vec4 sp2 = texture2D(splat2Map, suv);
          vec3 g1 = texture2D(grassMap, wuv / 7.0).rgb;
          vec3 g2 = texture2D(grassMap, wuv / 29.0 + 0.37).rgb;
          vec3 grassC = mix(g1, g2, 0.45);
          grassC = mix(grassC, grassC * vec3(1.08, 1.04, 0.85), smoothstep(0.4, 0.9, g2.g - g2.b));
          grassC = mix(grassC, grassC * vec3(0.62, 0.72, 0.58), sp2.r);
          vec3 dirtC = texture2D(dirtMap, wuv / 5.5).rgb;
          vec3 cobC = texture2D(cobbleMap, wuv / 2.3).rgb;
          vec3 plzC = texture2D(plazaMap, wuv / 6.0).rgb * vec3(0.84, 0.78, 0.74);
          vec3 sandC = texture2D(sandMap, wuv / 6.0).rgb;
          vec3 rockC = texture2D(rockMap, vec2(wuv.x + wuv.y, vWPos.y * 1.3) / 6.0).rgb * vec3(0.95, 0.92, 0.85);
          float macro = texture2D(grassMap, wuv / 97.0).g;
          vec3 col = grassC;
          col = mix(col, sandC, sp2.g);
          col = mix(col, dirtC, sp.r);
          col = mix(col, plzC, sp.b);
          col = mix(col, cobC, sp.g);
          float rockW = clamp(1.0 - sp.a + smoothstep(0.7, 0.5, vWNorm.y) * (1.0 - sp2.g), 0.0, 1.0) * (1.0 - sp.g) * (1.0 - sp.b);
          col = mix(col, rockC, rockW);
          col *= 0.86 + macro * 0.32;
          col *= mix(1.0, 0.72, smoothstep(0.3, -1.5, vWPos.y));
          diffuseColor.rgb *= col;
        `);
    };
    mat.customProgramCacheKey = () => 'terrain-v2';
    this.material = mat;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.name = 'terrain';
    mesh.matrixAutoUpdate = false;
    this.mesh = mesh;
  }

  // float height texture (for the sea shader: shoreline foam / depth colour)
  heightTexture() {
    const res = this.res;
    const t = new THREE.DataTexture(new Float32Array(this.heights), res, res, THREE.RedFormat, THREE.FloatType);
    t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter;
    t.needsUpdate = true;
    return t;
  }
}

// Heightmap terrain for Cyclone Hill / Forest of Mist. Same interface as the Roumen Terrain
// (heightAt / groundAt / deckAt / normalAt / slopeAt / isWater / mesh) so player, monsters, camera
// and nav grid work unchanged. The height field is analytic: valley + tiered hill + cliffs, then carved
// gorges / chasm / river / pools, then ramps override it. A splat-mapped painterly shader colours it.
import * as THREE from 'three';
import { makeFbm, smoothstep, lerp, clamp } from '../../core/utils.js';
import { prepPoly, polyNearest, sampleSpline } from '../terrain.js';
import {
  MAP, HILL, TIERS, TIER_H, TIER_WALL, RING_SOUTH, GORGES, GLADE, CHASM, VALLEY, MOUNDS, POOLS, RIVER,
  FOREST_PATH, PATH_WIDTH, RAMPS, BRIDGES,
} from './layout.js';
import { forestFloorTex, meadowTex, clayTex, swirlRockTex, earthCliffTex, trailTex, mudTex } from './textures.js';

const fbBase = makeFbm(7101, 4), fbMound = makeFbm(7102, 3), fbTier = makeFbm(7103, 3), fbWarp = makeFbm(7104, 3);
const fbMount = makeFbm(7105, 4), fbDetail = makeFbm(7106, 4), fbGorge = makeFbm(7107, 3), fbGlade = makeFbm(7108, 3);

const inBox = (b, x, z) => x >= b[0] && x <= b[2] && z >= b[1] && z <= b[3];

// signed distance to a rounded rectangle (negative inside)
function sdRoundRect(x, z, x0, z0, x1, z1, r) {
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, hx = (x1 - x0) / 2 - r, hz = (z1 - z0) / 2 - r;
  const qx = Math.abs(x - cx) - hx, qz = Math.abs(z - cz) - hz;
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - r;
}

// 0..1 "north-ness" of a direction around the hill (1 = the tiers merge into the northern cliffs)
const northness = (a) => smoothstep(0.05, -0.45, Math.sin(a));

export class CycloneTerrain {
  constructor() {
    this.size = MAP.size;
    this.playable = MAP.playable;
    this.res = 451;
    this.cell = this.size / (this.res - 1);
    this.heights = new Float32Array(this.res * this.res);
    this.ramps = RAMPS.map((r) => prepPoly({ ...r }));
    this.decks = BRIDGES.map((d) => prepPoly({ ...d }));
    this.chasm = prepPoly({ pts: CHASM.pts, width: CHASM.halfWidth * 2 + 12 });
    this.river = prepPoly({ pts: RIVER.pts, width: RIVER.halfWidth * 2 + 8 });
    this.trail = prepPoly({ pts: FOREST_PATH, width: PATH_WIDTH + 6 });
    this.discs = [];
    this.build();
  }

  // outer radius of tier k (0..3) in direction a (radians around HILL); the wall is centred on it
  tierRadius(k, a) {
    const n = fbTier(Math.cos(a) * 1.6 + k * 5.3, Math.sin(a) * 1.6 + k * 2.1) - 0.5;
    return TIERS[k].r * (1 + n * 0.1);
  }
  isNorth(a) { return northness(a); }

  // ---------------------------------------------------------------- analytic height
  rawHeight(x, z) {
    // gentle undulating ground + earthen mounds in the forest
    let h = (fbBase(x * 0.03 + 5, z * 0.03 + 5) - 0.5) * 1.8;
    for (const m of MOUNDS) {
      const d = Math.hypot(x - m.x, z - m.z) / m.r;
      if (d < 1.4) h += m.h * smoothstep(1.3, 0.25, d + (fbMound(x * 0.1, z * 0.1) - 0.5) * 0.35);
    }
    // tiered hill ("layered cake")
    const dx = x - HILL.x, dz = z - HILL.z, r = Math.hypot(dx, dz), a = Math.atan2(dz, dx);
    const north = northness(a);
    for (let k = 0; k < TIERS.length; k++) {
      const R = this.tierRadius(k, a) + (k === 0 ? north * 40 : 0); // tier 1 runs into the northern cliffs
      h += TIER_H * smoothstep(R + TIER_WALL / 2, R - TIER_WALL / 2, r);
    }
    // outside the playable region the ground climbs into steep cliffs
    const dValley = sdRoundRect(x, z, VALLEY.x0, VALLEY.z0, VALLEY.x1, VALLEY.z1, 18);
    const ringR = TIERS[0].r + north * 6 + (1 - north) * RING_SOUTH;
    const dHill = r - ringR;
    let d = Math.min(dValley, dHill) + (fbWarp(x * 0.022, z * 0.022) - 0.5) * 14;
    if (d > 0) {
      const nm = fbMount(x * 0.018, z * 0.018);
      const base = TIER_H * north; // the northern cliffs start at tier-1 height
      const mount = base + (26 + nm * 22) * smoothstep(0, 9, d) + Math.max(0, d - 9) * 0.45
        + (fbDetail(x * 0.09, z * 0.09) - 0.5) * 5 * smoothstep(1, 8, d);
      h = Math.max(h, mount);
    }
    // Windward Glade: a flat clearing cut into the cliffs, rim at least a few metres higher all around
    const gr = Math.hypot(x - GLADE.x, z - GLADE.z) * (1 + (fbGlade(x * 0.04, z * 0.04) - 0.5) * 0.12);
    if (gr < GLADE.r + 22) {
      h = Math.max(h, (GLADE.h + 5 + fbGlade(x * 0.07, z * 0.07) * 6) * smoothstep(GLADE.r + 20, GLADE.r + 5, gr));
      const gm = smoothstep(GLADE.r + 3, GLADE.r - 1, gr);
      h = lerp(h, GLADE.h + (fbBase(x * 0.08, z * 0.08) - 0.5) * 0.9, gm);
    }
    // gorges through the lower tiers
    for (const g of GORGES) {
      const ux = Math.cos(g.angle), uz = Math.sin(g.angle);
      const along = dx * ux + dz * uz, across = -dx * uz + dz * ux;
      if (along < g.r0 - 3 || along > g.r1 + 8) continue;
      const wig = (fbGorge(along * 0.04, g.angle * 3) - 0.5) * 5;
      const hw = g.halfWidth * (1 + (fbGorge(along * 0.08 + 7, g.angle) - 0.5) * 0.3);
      const m = smoothstep(hw + 4, hw, Math.abs(across - wig)) * smoothstep(g.r0 - 1.2, g.r0 + 1.8, along) * smoothstep(g.r1 + 8, g.r1, along);
      if (m > 0) h = lerp(h, g.floor + (fbDetail(x * 0.1, z * 0.1) - 0.5) * 1.5, m);
    }
    // the misty chasm between hill and glade
    if (inBox(this.chasm.bbox, x, z)) {
      const p = polyNearest(this.chasm.pts, x, z, this.chasm.cum, this.chasm.total);
      const hw = CHASM.halfWidth * (1 + (fbGorge(p.t * 9, 11) - 0.5) * 0.35);
      const m = smoothstep(hw + 4.5, hw, p.d);
      if (m > 0) h = lerp(h, CHASM.floor + (fbDetail(x * 0.1, z * 0.1) - 0.5) * 1.5, m);
    }
    // forest river + pools
    if (inBox(this.river.bbox, x, z)) {
      const p = polyNearest(this.river.pts, x, z, this.river.cum, this.river.total);
      const m = smoothstep(RIVER.halfWidth + 2.6, RIVER.halfWidth * 0.55, p.d);
      if (m > 0) h = Math.min(h, lerp(h, RIVER.depth, m));
    }
    for (const pl of POOLS) {
      const d2 = Math.hypot(x - pl.x, z - pl.z) / (pl.r * (1 + (fbMound(x * 0.12, z * 0.12) - 0.5) * 0.3));
      if (d2 < 1.5) h = Math.min(h, lerp(h, pl.depth, smoothstep(1.3, 0.75, d2)));
    }
    // forest trail: slightly sunken and smoothed
    if (inBox(this.trail.bbox, x, z)) {
      const p = polyNearest(this.trail.pts, x, z, this.trail.cum, this.trail.total);
      h -= 0.18 * smoothstep(PATH_WIDTH / 2 + 1, PATH_WIDTH / 2 - 1, p.d);
    }
    return h;
  }

  build() {
    const { res, cell, size } = this;
    const half = size / 2;
    const H = this.heights;
    for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) H[j * res + i] = this.rawHeight(-half + i * cell, -half + j * cell);
    // ramps override the height field (paths winding up along the tier walls)
    for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) {
      const x = -half + i * cell, z = -half + j * cell, k = j * res + i;
      for (const r of this.ramps) {
        if (!inBox(r.bbox, x, z)) continue;
        const p = polyNearest(r.pts, x, z, r.cum, r.total);
        const w = 1 - smoothstep(r.width / 2, r.width / 2 + 3, p.d);
        if (w <= 0) continue;
        H[k] = lerp(H[k], lerp(r.h0, r.h1, smoothstep(0, 1, p.t)), w);
      }
    }
    this.buildSplat();
    this.buildMesh();
  }

  // ---------------------------------------------------------------- queries (same API as Terrain)
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
  deckAt(x, z) {
    for (const d of this.decks) {
      if (!inBox(d.bbox, x, z)) continue;
      const p = polyNearest(d.pts, x, z, d.cum, d.total);
      if (p.d <= d.width / 2) return lerp(d.h0, d.h1, p.t) + (d.arch ? Math.sin(p.t * Math.PI) * d.arch : 0);
    }
    return null;
  }
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
  // water level of the forest pools / river at x,z (null if none); gorges and chasm are always water below -2.8
  forestWaterAt(x, z) {
    for (const pl of POOLS) if (Math.hypot(x - pl.x, z - pl.z) < pl.r * 1.45) return pl.level;
    if (inBox(this.river.bbox, x, z)) {
      const p = polyNearest(this.river.pts, x, z, this.river.cum, this.river.total);
      if (p.d < RIVER.halfWidth + 3) return RIVER.level;
    }
    return null;
  }
  isWater(x, z) {
    if (this.deckAt(x, z) !== null) return false;
    const h = this.heightAt(x, z);
    if (h < -2.8) return true;
    const w = this.forestWaterAt(x, z);
    return w !== null && h < w - 0.25;
  }
  zoneAt() { return 0; }
  onPath(x, z, pad = 0) {
    const p = polyNearest(this.trail.pts, x, z, this.trail.cum, this.trail.total);
    if (p.d < PATH_WIDTH / 2 + pad) return true;
    for (const r of this.ramps) { const q = polyNearest(r.pts, x, z, r.cum, r.total); if (q.d < r.width / 2 + pad) return true; }
    return false;
  }

  // ---------------------------------------------------------------- region weights (also used by flora / minimap)
  // hill-ness: 0 in the Forest of Mist, 1 on and around Cyclone Hill / chasm
  hillWeight(x, z) {
    const r = Math.hypot(x - HILL.x, z - HILL.z) + (fbWarp(x * 0.05 + 3, z * 0.05) - 0.5) * 18;
    return Math.max(smoothstep(122, 88, r), smoothstep(62, 78, x) * smoothstep(70, 20, z) * smoothstep(-150, -110, z));
  }
  gladeWeight(x, z) { return smoothstep(GLADE.r + 2, GLADE.r - 4, Math.hypot(x - GLADE.x, z - GLADE.z)); }

  // ---------------------------------------------------------------- splat maps
  buildSplat() {
    const S = 1024;
    const half = this.size / 2;
    const k = S / this.size;
    const mk = () => { const c = document.createElement('canvas'); c.width = c.height = S; return c; };
    // paths / ramps / bridge approaches are stroked, blurred, then read back as coverage
    const strokes = (list, blur = 2) => {
      const c = mk(), ctx = c.getContext('2d');
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#fff'; ctx.fillStyle = '#fff';
      for (const p of list) {
        const pts = sampleSpline(p.pts, 0.8);
        ctx.lineWidth = p.width * k;
        ctx.beginPath();
        pts.forEach((s, i) => (i ? ctx.lineTo((s.x + half) * k, (s.z + half) * k) : ctx.moveTo((s.x + half) * k, (s.z + half) * k)));
        ctx.stroke();
      }
      const b = mk(), bctx = b.getContext('2d');
      bctx.filter = `blur(${blur}px)`;
      bctx.drawImage(c, 0, 0);
      return bctx.getImageData(0, 0, S, S).data;
    };
    const trail = strokes([
      { pts: FOREST_PATH, width: PATH_WIDTH },
      ...RAMPS.map((r) => ({ pts: r.pts, width: r.width - 0.5 })),
    ]);
    const wet = strokes([{ pts: RIVER.pts, width: RIVER.halfWidth * 2 + 5 }], 4);
    const cA = mk(), cB = mk();
    const iA = cA.getContext('2d').createImageData(S, S), iB = cB.getContext('2d').createImageData(S, S);
    const A = iA.data, B = iB.data;
    const nz = makeFbm(7120, 4);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const wx = -half + (x + 0.5) / S * this.size, wz = -half + (y + 0.5) / S * this.size;
        const i4 = (y * S + x) * 4;
        const n = nz(wx * 0.12, wz * 0.12);
        const hill = this.hillWeight(wx, wz), glade = this.gladeWeight(wx, wz);
        const h = this.heightAt(wx, wz);
        let mud = wet[i4] / 255;
        for (const pl of POOLS) mud = Math.max(mud, smoothstep(1.55, 1.05, Math.hypot(wx - pl.x, wz - pl.z) / pl.r));
        mud = Math.max(mud * (1 - hill), smoothstep(-3, -8, h) * 0.8);            // gorge / chasm floors
        const tr = smoothstep(0.2 + (n - 0.5) * 0.3, 0.7, trail[i4] / 255);
        const clay = hill * (1 - glade);
        // alpha stores 1 - mud: a canvas keeps premultiplied alpha, so a zero alpha would wipe the colour channels
        A[i4] = tr * 255; A[i4 + 1] = clay * 255; A[i4 + 2] = glade * 255; A[i4 + 3] = 255 - mud * 255;
        B[i4] = hill * 255; B[i4 + 1] = smoothstep(0.55, 0.8, n) * 255; B[i4 + 2] = 0; B[i4 + 3] = 255;
      }
    }
    cA.getContext('2d').putImageData(iA, 0, 0);
    cB.getContext('2d').putImageData(iB, 0, 0);
    this.splatCanvas = cA; this.splat2Canvas = cB;
    this.splatData = A;
    this.splatSize = S;
    const toTex = (c) => {
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.NoColorSpace; t.premultiplyAlpha = false; t.flipY = false;
      t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
      return t;
    };
    this.splatTex = toTex(cA);
    this.splat2Tex = toTex(cB);
  }

  // colour for the HUD minimap (approximates the terrain shader)
  minimapColor(wx, wz) {
    const S = this.splatSize, half = this.size / 2;
    const sx = clamp(Math.floor((wx + half) / this.size * S), 0, S - 1), sy = clamp(Math.floor((wz + half) / this.size * S), 0, S - 1);
    const i4 = (sy * S + sx) * 4, A = this.splatData;
    const tr = A[i4] / 255, clay = A[i4 + 1] / 255, glade = A[i4 + 2] / 255, mud = 1 - A[i4 + 3] / 255;
    const hill = this.hillWeight(wx, wz);
    let c = [104, 128, 52];
    c = mix(c, [214, 142, 76], clay);
    c = mix(c, [118, 184, 70], glade);
    c = mix(c, [120, 104, 76], mud);
    c = mix(c, [168, 118, 70], tr);
    const n = this.normalAt(wx, wz);
    const steep = smoothstep(0.8, 0.6, n.y);
    c = mix(c, hill > 0.5 ? [176, 92, 46] : [96, 70, 46], steep);
    return c;
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
      forestMap: { value: forestFloorTex() }, meadowMap: { value: meadowTex() }, clayMap: { value: clayTex() },
      swirlMap: { value: swirlRockTex() }, cliffMap: { value: earthCliffTex() }, trailMap: { value: trailTex() }, mudMap: { value: mudTex() },
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
          uniform sampler2D forestMap, meadowMap, clayMap, swirlMap, cliffMap, trailMap, mudMap, splatMap, splat2Map;
          uniform float worldSize;
          vec3 biplanar(sampler2D t, vec3 p, vec3 n, float s) {
            vec3 a = texture2D(t, vec2(p.x, p.y) / s).rgb;
            vec3 b = texture2D(t, vec2(p.z, p.y) / s).rgb;
            float w = smoothstep(0.25, 0.75, abs(n.x) / (abs(n.x) + abs(n.z) + 1e-4));
            return mix(a, b, w);
          }`)
        .replace('#include <map_fragment>', `
          vec2 wuv = vWPos.xz;
          vec2 suv = (vWPos.xz + worldSize * 0.5) / worldSize;
          vec4 sp = texture2D(splatMap, suv);
          vec4 sp2 = texture2D(splat2Map, suv);
          vec3 forest = mix(texture2D(forestMap, wuv / 7.0).rgb, texture2D(forestMap, wuv / 23.0 + 0.31).rgb, 0.4);
          forest = mix(forest, forest * vec3(0.78, 0.86, 0.7), sp2.g * 0.6);
          vec3 meadow = texture2D(meadowMap, wuv / 6.5).rgb;
          vec3 clay = mix(texture2D(clayMap, wuv / 6.0).rgb, texture2D(clayMap, wuv / 17.0 + 0.5).rgb, 0.3);
          vec3 trail = texture2D(trailMap, wuv / 5.0).rgb;
          vec3 mud = texture2D(mudMap, wuv / 4.0).rgb;
          vec3 col = forest;
          col = mix(col, clay, sp.g);
          col = mix(col, meadow, sp.b);
          col = mix(col, mud, 1.0 - sp.a);
          col = mix(col, trail * mix(vec3(1.0), vec3(1.1, 0.92, 0.8), sp.g), sp.r * 0.92);
          // steep faces: swirling orange strata on the hill, mossy earth in the forest
          float steep = smoothstep(0.8, 0.58, vWNorm.y);
          vec3 rockH = biplanar(swirlMap, vWPos, vWNorm, 26.0);
          vec3 rockF = biplanar(cliffMap, vWPos, vWNorm, 14.0);
          col = mix(col, mix(rockF, rockH, sp2.r), steep);
          float macro = texture2D(forestMap, wuv / 91.0).g;
          col *= 0.84 + macro * 0.34;
          // darken deep gorges, warm the rim light a touch
          col *= mix(1.0, 0.6, smoothstep(-2.0, -12.0, vWPos.y));
          diffuseColor.rgb *= col;
        `);
    };
    mat.customProgramCacheKey = () => 'cyclone-terrain-v1';
    this.material = mat;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.name = 'cyclone-terrain';
    mesh.matrixAutoUpdate = false;
    this.mesh = mesh;
  }
}

function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

// Tower of Isel — the outer stair and the view. Broad stone steps wind half around the outside of the tower in the
// open air (balustrade with crystal lamps, corbels underneath), the tower's outer wall rises above (buttresses,
// windows, cornices, orange pent roofs, a crenellated top) and falls away below. Far down lies a model landscape
// matching the world outside: the Windward Glade at the foot of the tower, the terraces of Cyclone Hill stepping down
// to the west with autumn trees and windmills, the Forest of Mist around it under drifting turquoise mist, far hills,
// a sky dome, clouds sailing past at eye level and a few birds circling the tower.
import * as THREE from 'three';
import { GeoBuilder, pm, U } from '../town/builder.js';
import { townMaterials } from '../town/materials.js';
import { tex } from '../../core/textures.js';
import { beam } from '../cyclone/structures.js';
import { mistPuffTex } from '../cyclone/textures.js';
import { iselMaterials, DOOR_H } from './architecture.js';
import { Glow } from './decor.js';
import { CORE, OUTER, OUTER_PROFILE, deg } from './layout.js';
import { outerHeight } from './terrain.js';
import { makeFbm, mulberry32, smoothstep, lerp } from '../../core/utils.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;
const WALL_UVS = 0.19;
// the outer wall of the round tower is built where it can be seen from the stair
const WALL_A0 = deg(66), WALL_A1 = deg(294), WALL_TOP = 96;
// the model landscape: the glade plateau west of the tower, Cyclone Hill's terraces below it, the forest below that
const BASE_Y = -122, TIER = 26, EDGES = [1, 1.45, 1.9, 2.35, 2.8];
const GL = { x: CORE.x - 70, z: CORE.z, ax: 110, az: 80 };
// the doors out onto the stair (angle, floor height)
const DOORS = [{ a: deg(110), y: 22 }, { a: deg(270), y: 42 }];
const DOOR_HW = 2.75;

const P = (a, r, y) => V(CORE.x + Math.cos(a) * r, y, CORE.z + Math.sin(a) * r);
const hexRgb = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

// ------------------------------------------------------------------ the stair
function stairTreads() {
  const out = [];
  const Pf = OUTER_PROFILE;
  for (let i = 0; i < Pf.length - 1; i++) {
    const [a0, y0] = Pf[i], [a1, y1] = Pf[i + 1];
    if (Math.abs(y1 - y0) < 0.01) { out.push({ a0, a1, y: y0, landing: true }); continue; }
    const n = Math.round(Math.abs(y1 - y0) / 0.28), da = (a1 - a0) / n, dy = (y1 - y0) / n;
    for (let s = 0; s < n; s++) out.push({ a0: a0 + s * da, a1: a0 + (s + 1) * da, y: y0 + dy * (s + 0.5) });
  }
  return out;
}

function outerStair(ctx, b, M, glow) {
  const Rin = CORE.r - 0.15, Rout = OUTER.rail + 0.45, RAIL = OUTER.rail;
  const treads = stairTreads();
  const soffit = (a) => outerHeight(a) - 1.6;
  const topAt = (a) => { const t = treads.find((q) => a >= q.a0 - 1e-6 && a <= q.a1 + 1e-6); return t ? t.y : outerHeight(a); };
  let prevY = null;
  treads.forEach((t, i) => {
    const segs = Math.max(1, Math.ceil((t.a1 - t.a0) / deg(1.5)));
    const tint = t.landing ? [0.9, 0.95, 0.97] : i % 2 ? [0.94, 0.98, 1] : [0.86, 0.91, 0.94];
    for (let k = 0; k < segs; k++) {
      const a0 = t.a0 + ((t.a1 - t.a0) * k) / segs, a1 = t.a0 + ((t.a1 - t.a0) * (k + 1)) / segs, am = (a0 + a1) / 2;
      const q = [P(a0, Rin, t.y), P(a1, Rin, t.y), P(a1, Rout, t.y), P(a0, Rout, t.y)];
      b.quadN(M.stone, ...q, ...q.map((v) => [v.x * 0.22, v.z * 0.22]), tint, V(0, 1, 0), false);
      const s0 = soffit(a0), s1 = soffit(a1);
      b.quadN(M.stone, P(a0, Rout, t.y), P(a1, Rout, t.y), P(a1, Rout, s1), P(a0, Rout, s0),
        [a0 * Rout * WALL_UVS, t.y * WALL_UVS], [a1 * Rout * WALL_UVS, t.y * WALL_UVS], [a1 * Rout * WALL_UVS, s1 * WALL_UVS], [a0 * Rout * WALL_UVS, s0 * WALL_UVS],
        [0.8, 0.85, 0.88], V(Math.cos(am), 0, Math.sin(am)), false);
      b.quadN(M.stone, P(a0, Rin, s0), P(a1, Rin, s1), P(a1, Rout, s1), P(a0, Rout, s0),
        [a0 * 8, 0], [a1 * 8, 0], [a1 * 8, 1.4], [a0 * 8, 1.4], [0.62, 0.66, 0.7], V(0, -1, 0), false);
    }
    // riser (the stair climbs with the angle: risers face back down it)
    if (prevY !== null && Math.abs(t.y - prevY) > 0.01) {
      const a = t.a0, lo = Math.min(prevY, t.y), hi = Math.max(prevY, t.y);
      b.quadN(M.stone, P(a, Rin, lo), P(a, Rout, lo), P(a, Rout, hi), P(a, Rin, hi), [0, 0], [2, 0], [2, 0.1], [0, 0.1], [0.66, 0.72, 0.76], V(Math.sin(a), 0, -Math.cos(a)), false);
      b.box(M.stone, pm(...P(a + 0.0015, (Rin + Rout) / 2, hi - 0.04).toArray(), 0, -a, 0), Rout - Rin, 0.08, 0.12, { color: [0.95, 1, 1], ao: false });
    }
    prevY = t.y;
  });
  // closed ends
  for (const [a, dir] of [[OUTER.a0, -1], [OUTER.a1, 1]]) {
    const y = outerHeight(a), s = soffit(a);
    b.quadN(M.stone, P(a, Rin, s), P(a, Rout, s), P(a, Rout, y), P(a, Rin, y), [0, 0], [1.5, 0], [1.5, 0.4], [0, 0.4], [0.8, 0.85, 0.88], V(-Math.sin(a) * dir, 0, Math.cos(a) * dir), false);
  }
  // corbels under the stair
  for (let a = OUTER.a0 + deg(2.5); a < OUTER.a1; a += deg(5)) {
    const s = soffit(a);
    b.box(M.stone, pm(...P(a, 45.4, s - 0.45).toArray(), 0, -a, 0), 7.0, 0.9, 0.9, { uv: 'frame', uvs: 0.3, color: [0.72, 0.77, 0.8], ao: false });
    b.box(M.stone, pm(...P(a, 43.8, s - 1.5).toArray(), 0, -a, 0), 3.8, 1.2, 0.8, { uv: 'frame', uvs: 0.3, color: [0.68, 0.73, 0.76], ao: false });
    b.box(M.stone, pm(...P(a, 42.8, s - 2.7).toArray(), 0, -a, 0), 1.8, 1.2, 0.7, { uv: 'frame', uvs: 0.3, color: [0.64, 0.69, 0.72], ao: false });
  }
  // balustrade: posts, a handrail following the stair, balusters on a curb; crystal lamps on every sixth post
  const railY = (a) => outerHeight(a) + 1.15;
  const nPosts = Math.round((OUTER.a1 - OUTER.a0) / (2.6 / RAIL));
  const posts = [];
  for (let i = 0; i <= nPosts; i++) posts.push(OUTER.a0 + ((OUTER.a1 - OUTER.a0) * i) / nPosts);
  const BAL = [[0, 0], [1, 0], [1, 0.08], [0.6, 0.14], [0.55, 0.3], [0.95, 0.5], [0.55, 0.72], [0.5, 0.86], [0.9, 0.92], [1, 1], [0, 1]];
  posts.forEach((a, i) => {
    const p = P(a, RAIL, 0), y = topAt(a), ry = railY(a);
    b.box(M.stone, pm(p.x, (y + ry) / 2, p.z, 0, -a, 0), 0.5, ry - y + 0.1, 0.5, { uv: 'frame', uvs: 0.4, color: [0.84, 0.9, 0.92], ao: false });
    b.box(M.stone, pm(p.x, ry + 0.15, p.z, 0, -a, 0), 0.64, 0.2, 0.64, { uv: 'frame', uvs: 0.4, color: [0.92, 0.96, 0.98], ao: false });
    if (i % 6 === 3) {
      b.geo(M.gold, U.frustum(1.7, 8), pm(p.x, ry + 0.3, p.z, 0, 0, 0, 0.12, 0.14, 0.12), {});
      b.geo(iselCrystal(), U.ico(0), pm(p.x, ry + 0.62, p.z, 0, a, 0, 0.14, 0.32, 0.14), { flat: true });
      glow.add(p.x, ry + 0.62, p.z, '#5ac8ff', 2.4, 0);
    } else b.geo(M.gold, U.sphere(8, 6), pm(p.x, ry + 0.33, p.z, 0, 0, 0, 0.12, 0.12, 0.12), {});
    ctx.colliders.addCircle(p.x, p.z, 0.45);
  });
  for (let i = 0; i < posts.length - 1; i++) {
    const a0 = posts[i], a1 = posts[i + 1];
    const A = P(a0, RAIL, railY(a0)), Bp = P(a1, RAIL, railY(a1));
    beam(b, M.stone, A, Bp, 0.34, { d: 0.26, color: [0.9, 0.95, 0.97] });
    const n = 6;
    for (let j = 1; j <= n; j++) {
      const a = lerp(a0, a1, j / (n + 1)), p = P(a, RAIL, 0), yb = topAt(a) + 0.2, yr = railY(a) - 0.14;
      b.geo(M.stone, U.lathe('isel_bal', BAL, 8), pm(p.x, yb, p.z, 0, 0, 0, 0.12, yr - yb, 0.12), { uv: 'frame', uvs: 0.5, color: [0.88, 0.93, 0.95], ao: false });
    }
    // the curb the balusters stand on
    for (const t of treads) {
      const lo = Math.max(t.a0, a0), hi = Math.min(t.a1, a1);
      if (hi - lo < 1e-5) continue;
      const m = (lo + hi) / 2, len = (hi - lo) * RAIL + 0.02, p = P(m, RAIL, t.y + 0.1);
      b.box(M.stone, pm(p.x, p.y, p.z, 0, -m + Math.PI / 2, 0), len, 0.2, 0.5, { uv: 'frame', uvs: 0.4, color: [0.8, 0.86, 0.88], ao: false });
    }
    const mid = P((a0 + a1) / 2, RAIL, 0);
    ctx.colliders.addCircle(mid.x, mid.z, 0.45);
  }
  // end walls across the stair's two landings
  for (const a of [OUTER.a0, OUTER.a1]) {
    const y = outerHeight(a);
    for (let r = Rin + 0.5; r < RAIL; r += 0.8) { const p = P(a, r, 0); ctx.colliders.addCircle(p.x, p.z, 0.4); }
    const p = P(a, (Rin + RAIL) / 2, 0);
    b.box(M.stone, pm(p.x, y + 0.6, p.z, 0, -a, 0), RAIL - Rin, 1.2, 0.5, { uv: 'frame', uvs: 0.4, color: [0.84, 0.9, 0.92], ao: false });
    b.box(M.stone, pm(p.x, y + 1.28, p.z, 0, -a, 0), RAIL - Rin + 0.2, 0.18, 0.64, { uv: 'frame', uvs: 0.4, color: [0.92, 0.96, 0.98], ao: false });
  }
}

let crystalMat = null;
function iselCrystal() {
  if (!crystalMat) crystalMat = new THREE.MeshStandardMaterial({ vertexColors: true, color: 0x9fe8ff, emissive: 0x2ab8ff, emissiveIntensity: 1.7, roughness: 0.15, metalness: 0.1, name: 'isel_crystal_out' });
  return crystalMat;
}

// ------------------------------------------------------------------ the tower's outer wall
function towerWall(ctx, b, M, T, glow) {
  const R = CORE.r;
  const N = Math.round((WALL_A1 - WALL_A0) / deg(1.5));
  const bands = [BASE_Y - 6, -60, 0, 50, WALL_TOP];
  const shade = (y) => lerp(0.55, 1, smoothstep(BASE_Y, 10, y));
  const door = (a) => DOORS.find((d) => Math.abs(a - d.a) < DOOR_HW / R);
  for (let k = 0; k < N; k++) {
    const a0 = WALL_A0 + ((WALL_A1 - WALL_A0) * k) / N, a1 = WALL_A0 + ((WALL_A1 - WALL_A0) * (k + 1)) / N, am = (a0 + a1) / 2;
    const d = door(am);
    const n = V(Math.cos(am), 0, Math.sin(am));
    const uv = (a, y) => [a * R * WALL_UVS, y * WALL_UVS];
    for (let i = 0; i < bands.length - 1; i++) {
      const lo = bands[i], hi = bands[i + 1];
      const pieces = d && d.y < hi && d.y + DOOR_H > lo ? [[lo, d.y], [d.y + DOOR_H, hi]] : [[lo, hi]];
      for (const [y0, y1] of pieces) {
        if (y1 - y0 < 0.01) continue;
        const c0 = shade(y0), c1 = shade(y1), k0 = [c0, c0, c0], k1 = [c1, c1, c1];
        // (wound to face outwards)
        b.triC(M.stone, P(a0, R, y0), P(a1, R, y1), P(a1, R, y0), uv(a0, y0), uv(a1, y1), uv(a1, y0), k0, k1, k0, n);
        b.triC(M.stone, P(a0, R, y0), P(a0, R, y1), P(a1, R, y1), uv(a0, y0), uv(a0, y1), uv(a1, y1), k0, k1, k1, n);
      }
    }
  }
  // the doorways out onto the stair: stone jambs, a lintel with a gilded keystone, a little tiled roof, two lamps
  for (const d of DOORS) {
    const tx = -Math.sin(d.a), tz = Math.cos(d.a), nx = Math.cos(d.a), nz = Math.sin(d.a);
    const c = P(d.a, R + 0.35, 0);
    for (const s of [-1, 1]) {
      const jx = c.x + tx * s * (DOOR_HW + 0.45), jz = c.z + tz * s * (DOOR_HW + 0.45);
      b.box(M.stone, pm(jx, d.y + DOOR_H / 2, jz, 0, -d.a, 0), 0.9, DOOR_H, 0.9, { uv: 'frame', uvs: 0.3, color: [0.82, 0.88, 0.9] });
      const lx = c.x + tx * s * (DOOR_HW + 1.3) + nx * 0.3, lz = c.z + tz * s * (DOOR_HW + 1.3) + nz * 0.3;
      b.geo(M.gold, U.frustum(1.7, 8), pm(lx, d.y + 3.3, lz, 0, 0, 0, 0.12, 0.14, 0.12), {});
      b.geo(iselCrystal(), U.ico(0), pm(lx, d.y + 3.62, lz, 0, 0, 0, 0.14, 0.32, 0.14), { flat: true });
      glow.add(lx, d.y + 3.62, lz, '#5ac8ff', 2.4, 0);
    }
    // (front and underside only, like the lintels inside: from above the follow camera looks through it)
    const only = { skip: ['px', 'nx', 'py', 'nz'] };
    b.box(M.timber, pm(c.x, d.y + DOOR_H + 0.35, c.z, 0, -d.a + Math.PI / 2, 0), 2 * DOOR_HW + 2.4, 0.7, 1.0, { uv: 'grain', uvs: 0.6, color: [0.85, 0.7, 0.58], ...only });
    b.box(M.gold, pm(c.x + nx * 0.55, d.y + DOOR_H + 0.4, c.z + nz * 0.55, 0, -d.a + Math.PI / 2, 0), 0.7, 0.9, 0.2, only);
    pentRoof(b, T, d.a - (DOOR_HW + 1.6) / R, d.a + (DOOR_HW + 1.6) / R, d.y + DOOR_H + 1.0, 2.2, 1.6);
  }
  // buttresses between the stair and the top, and down the base
  for (let a = WALL_A0 + deg(11); a < WALL_A1; a += deg(22.5)) {
    if (DOORS.some((d) => Math.abs(a - d.a) < (DOOR_HW + 2) / R)) continue;
    const y0 = BASE_Y - 4, y1 = WALL_TOP - 4, p = P(a, R + 0.6, 0);
    b.box(M.stone, pm(p.x, (y0 + y1) / 2, p.z, 0, -a, 0), 1.2, y1 - y0, 1.8, { uv: 'frame', uvs: WALL_UVS, color: [0.78, 0.84, 0.86], ao: false });
    const q = P(a, R + 1.1, 0);
    b.box(M.stone, pm(q.x, BASE_Y + 8, q.z, 0, -a, 0), 2.2, 28, 2.4, { uv: 'frame', uvs: WALL_UVS, color: [0.66, 0.72, 0.74], ao: false });
  }
  // cornices (skipping the band the stair runs along), orange pent roofs higher up
  for (const cy of [-70, -30, 8, 54, 72, 90]) ring(b, M, R, cy, 0.5, 0.7);
  pentRoof(b, T, WALL_A0, WALL_A1, 64, 3.2, 2.4);
  pentRoof(b, T, WALL_A0, WALL_A1, 82, 3.2, 2.4);
  // windows: warm light behind leaded glass in stone frames
  const rows = [{ y: -44, h: 7 }, { y: -14, h: 7 }, { y: 57, h: 5 }, { y: 73, h: 6 }];
  rows.forEach((row, ri) => {
    for (let a = WALL_A0 + deg(8 + (ri % 2) * 11); a < WALL_A1 - deg(4); a += deg(22)) {
      const cx = P(a, R + 0.06, 0), tx = -Math.sin(a), tz = Math.cos(a), w = 2.2;
      b.quadN(T.glassLit, V(cx.x - tx * w / 2, row.y, cx.z - tz * w / 2), V(cx.x + tx * w / 2, row.y, cx.z + tz * w / 2),
        V(cx.x + tx * w / 2, row.y + row.h, cx.z + tz * w / 2), V(cx.x - tx * w / 2, row.y + row.h, cx.z - tz * w / 2),
        [0, 0], [1, 0], [1, 1], [0, 1], [1, 1, 1], V(Math.cos(a), 0, Math.sin(a)), false);
      const f = P(a, R + 0.25, 0);
      b.box(M.stone, pm(f.x, row.y - 0.2, f.z, 0, -a, 0), 0.6, 0.4, w + 1.0, { uv: 'frame', uvs: 0.3, color: [0.86, 0.92, 0.94] });
      b.box(M.stone, pm(f.x, row.y + row.h + 0.3, f.z, 0, -a, 0), 0.6, 0.6, w + 0.8, { uv: 'frame', uvs: 0.3, color: [0.86, 0.92, 0.94] });
      for (const s of [-1, 1]) b.box(M.stone, pm(f.x + tx * s * (w / 2 + 0.25), row.y + row.h / 2, f.z + tz * s * (w / 2 + 0.25), 0, -a, 0), 0.5, row.h, 0.5, { uv: 'frame', uvs: 0.3, color: [0.8, 0.86, 0.88] });
    }
  });
  // the crown: corbelled parapet with merlons and the eaves of the great roof above
  ring(b, M, R, WALL_TOP - 1, 1.2, 1.4);
  for (let a = WALL_A0; a < WALL_A1; a += deg(2.2)) {
    const p = P(a, R + 1.05, 0);
    b.box(M.stone, pm(p.x, WALL_TOP + 1.4, p.z, 0, -a, 0), 0.7, 2.8, 1.72, { uv: 'frame', uvs: 0.3, color: [0.84, 0.9, 0.92], ao: false });
    if (Math.round(a / deg(2.2)) % 2) continue;
    b.box(M.stone, pm(p.x, WALL_TOP + 3.3, p.z, 0, -a, 0), 0.7, 1.2, 1.35, { uv: 'frame', uvs: 0.3, color: [0.9, 0.95, 0.97], ao: false });
  }
  pentRoof(b, T, WALL_A0, WALL_A1, WALL_TOP + 9, 7, 5.5);
  // the base: a battered plinth where the tower meets the rock of the glade
  for (let k = 0; k < N; k++) {
    const a0 = WALL_A0 + ((WALL_A1 - WALL_A0) * k) / N, a1 = WALL_A0 + ((WALL_A1 - WALL_A0) * (k + 1)) / N, am = (a0 + a1) / 2;
    const y0 = BASE_Y - 4, y1 = BASE_Y + 14, r0 = R + 5, r1 = R + 0.2;
    b.quadN(M.stone, P(a0, r0, y0), P(a1, r0, y0), P(a1, r1, y1), P(a0, r1, y1),
      [a0 * R * WALL_UVS, y0 * WALL_UVS], [a1 * R * WALL_UVS, y0 * WALL_UVS], [a1 * R * WALL_UVS, y1 * WALL_UVS], [a0 * R * WALL_UVS, y1 * WALL_UVS],
      [0.55, 0.6, 0.62], V(Math.cos(am), 0.25, Math.sin(am)), false);
  }
}

// a protruding stone band around the tower at height y
function ring(b, M, R, y, depth, h) {
  for (let a = WALL_A0; a < WALL_A1 - 1e-4; a += deg(3)) {
    const am = a + deg(1.5), p = P(am, R + depth / 2, y), len = 2 * (R + depth) * Math.sin(deg(1.5)) + 0.05;
    b.box(M.stone, pm(p.x, p.y, p.z, 0, -am + Math.PI / 2, 0), len, h, depth, { uv: 'frame', uvs: 0.3, color: [0.86, 0.92, 0.94], ao: false });
  }
}

// orange tiled pent roof along the wall from angle a0 to a1: top edge at the wall at y + h, eaves `out` metres out at y
function pentRoof(b, T, a0, a1, y, h, out) {
  const R = CORE.r, n = Math.max(2, Math.round((a1 - a0) / deg(2)));
  for (let k = 0; k < n; k++) {
    const b0 = a0 + ((a1 - a0) * k) / n, b1 = a0 + ((a1 - a0) * (k + 1)) / n, bm = (b0 + b1) / 2;
    const u0 = b0 * R * 0.33, u1 = b1 * R * 0.33, sl = Math.hypot(out, h) * 0.33;
    b.quadN(T.roofRed, P(b0, R, y + h), P(b1, R, y + h), P(b1, R + out, y), P(b0, R + out, y), [u0, sl], [u1, sl], [u1, 0], [u0, 0], [1, 0.9, 0.82], V(Math.cos(bm) * h, out, Math.sin(bm) * h), false);
    b.quadN(T.timber, P(b0, R, y - 0.05), P(b1, R, y - 0.05), P(b1, R + out, y - 0.05), P(b0, R + out, y - 0.05), [0, 0], [1, 0], [1, 1], [0, 1], [0.55, 0.45, 0.4], V(0, -1, 0), false);
    b.quadN(T.timber, P(b0, R + out, y), P(b1, R + out, y), P(b1, R + out, y - 0.35), P(b0, R + out, y - 0.35), [0, 0], [1, 0], [1, 0.2], [0, 0.2], [0.7, 0.56, 0.46], V(Math.cos(bm), 0, Math.sin(bm)), false);
  }
  // brackets under the eaves
  for (let a = a0 + deg(1.5); a < a1; a += deg(4.5)) {
    const p = P(a, R + out * 0.45, y - 0.5);
    b.box(T.timber, pm(p.x, p.y, p.z, 0, -a, 0), out * 0.9, 0.3, 0.3, { uv: 'grain', uvs: 0.6, color: [0.7, 0.56, 0.46], ao: false });
  }
}

// ------------------------------------------------------------------ the model landscape
const fbCliff = makeFbm(7301, 3), fbRelief = makeFbm(7302, 4), fbCol = makeFbm(7303, 3);
// river through the forest (a polyline in world x/z)
const RIVER = (() => {
  const pts = [];
  for (let i = 0; i <= 60; i++) {
    const t = i / 60, a = lerp(deg(100), deg(290), t), d = 3.6 + Math.sin(t * 11) * 0.35 + t * 0.6;
    pts.push([GL.x + Math.cos(a) * d * GL.ax, GL.z + Math.sin(a) * d * GL.az]);
  }
  return pts;
})();
function riverDist(x, z) {
  let best = Infinity;
  for (let i = 0; i < RIVER.length - 1; i++) {
    const [ax, az] = RIVER[i], [bx, bz] = RIVER[i + 1];
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}
// d: normalized distance from the glade centre (1 = the plateau's rim), a: angle around it
function landHeight(d, a, x, z) {
  const dd = d + (fbCliff(Math.cos(a) * 3 + 10, Math.sin(a) * 3 + 10) - 0.5) * 0.24;
  let h = BASE_Y;
  for (const e of EDGES) h -= TIER * smoothstep(e - 0.035, e + 0.035, dd);
  h += (fbRelief(x * 0.012, z * 0.012) - 0.5) * (dd > 2.9 ? 9 : 2.5);
  h += smoothstep(6, 13, d) * (40 + fbRelief(x * 0.0022 + 5, z * 0.0022) * 300);
  return { h, dd };
}

function landscape(group, rng) {
  const rings = [];
  for (let d = 0.04; d < 3.4; d += 0.025) rings.push(d);
  for (let d = 3.4; d < 26; d *= 1.08) rings.push(d);
  const NA = 200, NR = rings.length;
  const pos = new Float32Array((NR + 1) * NA * 3), col = new Float32Array((NR + 1) * NA * 3);
  const C = {
    glade: hexRgb('#8ccc5a'), grass: hexRgb('#6cb83e'), grassLt: hexRgb('#a6d85a'), clay: hexRgb('#c0682f'), clayLt: hexRgb('#dd9450'),
    forest: hexRgb('#1c3a2c'), forestLt: hexRgb('#2c5a3e'), water: hexRgb('#58c4c4'), far: hexRgb('#6f9a8a'),
  };
  const ring = [0, ...rings];
  const H = [];
  for (let i = 0; i <= NR; i++) {
    const d = ring[i];
    for (let j = 0; j < NA; j++) {
      const a = (j / NA) * TAU, x = GL.x + Math.cos(a) * d * GL.ax, z = GL.z + Math.sin(a) * d * GL.az;
      let { h, dd } = landHeight(d, a, x, z);
      const rd = d > 3 && d < 5.4 ? riverDist(x, z) : Infinity;
      if (rd < 16) h -= 3 * smoothstep(16, 5, rd);
      const k = (i * NA + j) * 3;
      pos[k] = x; pos[k + 1] = h; pos[k + 2] = z;
      // colour: grass on the flats, clay on the cliffs, forest floor below the hill, water in the river
      const { h: h2 } = landHeight(d + 0.012, a, x, z);
      const slope = Math.abs(h2 - landHeight(Math.max(0, d - 0.012), a, x, z).h) / (0.024 * GL.ax * 0.85);
      const n = fbCol(x * 0.03, z * 0.03);
      let c = dd < 1 ? mix(C.glade, C.grassLt, n * 0.6) : dd < 2.9 ? mix(C.grass, C.grassLt, n) : mix(C.forest, C.forestLt, n);
      const stripes = 0.5 + 0.5 * Math.sin(h * 1.1 + n * 4);
      c = mix(c, mix(C.clay, C.clayLt, stripes), smoothstep(0.7, 1.5, slope));
      if (rd < 9) c = mix(c, C.water, smoothstep(9, 5, rd));
      c = mix(c, C.far, smoothstep(6, 14, d) * 0.8);
      col[k] = c[0]; col[k + 1] = c[1]; col[k + 2] = c[2];
      H.push(h);
    }
  }
  const idx = [];
  for (let i = 0; i < NR; i++) for (let j = 0; j < NA; j++) {
    const j1 = (j + 1) % NA, a = i * NA + j, b = i * NA + j1, c = (i + 1) * NA + j, d = (i + 1) * NA + j1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const land = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
  land.name = 'isel-valley';
  group.add(land);

  // trees: autumn crowns on the hill's terraces, the dark teal canopy of the Forest of Mist around it
  const heightAt = (d, a) => { const x = GL.x + Math.cos(a) * d * GL.ax, z = GL.z + Math.sin(a) * d * GL.az; return { x, z, ...landHeight(d, a, x, z) }; };
  const trees = [];
  const autumn = ['#d8742a', '#c2552a', '#e39a3a', '#b8452a', '#d6b03e', '#6cb83e'].map((h) => new THREE.Color(h));
  const teal = ['#1f4a3a', '#2a6a4a', '#23584a', '#2f7a5a', '#1a4f48', '#3a8a5a'].map((h) => new THREE.Color(h));
  // (autumn trees stand in small groves; the forest is dense near the hill and thins out into the distance)
  for (let g = 0; g < 70; g++) {
    const d0 = 0.75 + rng() * 2.0, a0 = rng() * TAU;
    for (let i = 0; i < 7; i++) {
      const d = d0 + (rng() - 0.5) * 0.12, a = a0 + (rng() - 0.5) * 0.12, p = heightAt(d, a);
      if (EDGES.some((e) => Math.abs(p.dd - e) < 0.08)) continue;
      const s = 2.2 + rng() * 1.8;
      trees.push({ x: p.x, y: p.h + s * 0.9, z: p.z, s, sy: s * 1.15, c: autumn[Math.floor(rng() * autumn.length)] });
    }
  }
  for (let g = 0; g < 900; g++) {
    const d0 = 2.95 + Math.pow(rng(), 1.5) * 4.2, a0 = rng() * TAU;
    const x0 = GL.x + Math.cos(a0) * d0 * GL.ax, z0 = GL.z + Math.sin(a0) * d0 * GL.az;
    const spread = 14 + d0 * 4, n = 6 + Math.floor(rng() * 6);
    for (let i = 0; i < n; i++) {
      const x = x0 + (rng() - 0.5) * spread * 2, z = z0 + (rng() - 0.5) * spread * 2;
      const dx = (x - GL.x) / GL.ax, dz = (z - GL.z) / GL.az, d = Math.hypot(dx, dz), a = Math.atan2(dz, dx);
      const p = landHeight(d, a, x, z);
      if (p.dd < 2.9 || (d < 5.4 && riverDist(x, z) < 11)) continue;
      const s = 4 + rng() * 3.5 + (d - 3) * 0.8;
      trees.push({ x, y: p.h + s * 0.45, z, s, sy: s * 0.8, c: teal[Math.floor(rng() * teal.length)] });
    }
  }
  const crown = new THREE.IcosahedronGeometry(1, 0);
  const inst = new THREE.InstancedMesh(crown, new THREE.MeshLambertMaterial({ flatShading: true }), trees.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion();
  trees.forEach((t, i) => {
    q.setFromAxisAngle(V(0, 1, 0), rng() * TAU);
    inst.setMatrixAt(i, m.compose(V(t.x, t.y, t.z), q, V(t.s, t.sy, t.s)));
    inst.setColorAt(i, t.c);
  });
  inst.instanceMatrix.needsUpdate = true;
  inst.instanceColor.needsUpdate = true;
  inst.name = 'isel-valley-trees';
  group.add(inst);

  // windmills on the terraces (their sails turn)
  const sails = [];
  const white = new THREE.MeshLambertMaterial({ color: '#efe6d6' }), roof = new THREE.MeshLambertMaterial({ color: '#c9503a' }), wood = new THREE.MeshLambertMaterial({ color: '#8a5a34' });
  for (const [d, deg0] of [[1.2, 175], [1.65, 150], [2.1, 205], [1.25, 230]]) {
    const p = heightAt(d, deg(deg0));
    const wm = new THREE.Group();
    wm.position.set(p.x, p.h, p.z);
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.2, 11, 10), white);
    tower.position.y = 5.5;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(3.0, 3.2, 10), roof);
    cap.position.y = 12.6;
    const hub = new THREE.Group();
    hub.position.set(0, 10.4, 3.4);
    for (let k = 0; k < 4; k++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(1.4, 8.5, 0.15).translate(0, 4.6, 0), wood);
      s.rotation.z = (k / 4) * TAU;
      hub.add(s);
    }
    wm.add(tower, cap, hub);
    wm.rotation.y = Math.atan2(CORE.x - p.x, CORE.z - p.z) + 0.6;   // (sails roughly facing the tower)
    group.add(wm);
    sails.push({ hub, sp: 0.5 + rng() * 0.4 });
  }
  return { sails };
}

// ------------------------------------------------------------------ sky, far hills, clouds, mist, birds
function skyDome() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color('#3f86d8') }, mid: { value: new THREE.Color('#86c2ee') }, horizon: { value: new THREE.Color('#c4e6e4') },
      sunDir: { value: new THREE.Vector3(-0.55, 0.62, 0.3).normalize() },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }`,
    fragmentShader: `uniform vec3 top, mid, horizon, sunDir; varying vec3 vDir;
      void main(){
        float h = vDir.y;
        vec3 c = mix(horizon, mid, smoothstep(-0.02, 0.2, h));
        c = mix(c, top, smoothstep(0.2, 0.8, h));
        float s = max(dot(vDir, sunDir), 0.0);
        c += vec3(1.0, 0.92, 0.7) * (pow(s, 700.0) * 3.0 + pow(s, 14.0) * 0.22);
        c = mix(c, horizon * 0.97, smoothstep(0.0, -0.2, h));
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1700, 40, 20), mat);
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  return dome;
}

function farHills() {
  const fb = makeFbm(7311, 4);
  const g = new THREE.CylinderGeometry(1500, 1500, 1, 180, 4, true);
  const p = g.attributes.position, cols = [];
  const lo = new THREE.Color('#5f8f84'), hi = new THREE.Color('#a9ccd0');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), yN = p.getY(i) + 0.5, a = Math.atan2(z, x);
    const hgt = 90 + fb(Math.cos(a) * 3 + 5, Math.sin(a) * 3 + 5) * 330;
    p.setY(i, BASE_Y - 150 + yN * hgt);
    const c = lo.clone().lerp(hi, 0.35 + yN * 0.55);
    cols.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false }));
  m.frustumCulled = false;
  return m;
}

// ------------------------------------------------------------------ build
export function buildOutside(ctx) {
  const Z = ctx.zones.outside, group = Z.group;
  const M = iselMaterials(), T = townMaterials();
  const rng = mulberry32(7300);
  const b = new GeoBuilder();
  const glow = new Glow();
  outerStair(ctx, b, M, glow);
  towerWall(ctx, b, M, T, glow);
  const tris = b.triangleCount();
  b.flush(Z.batcher);
  glow.build(group);

  const view = new THREE.Group();
  view.name = 'isel-view';
  group.add(view);
  const { sails } = landscape(view, rng);
  const dome = skyDome();
  const hills = farHills();
  view.add(dome, hills);

  // clouds drifting around the tower, some below the stair
  const clouds = [];
  const cloudTex = tex('cloud');
  for (let i = 0; i < 26; i++) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, depthWrite: false, opacity: 0.7 + rng() * 0.3 }));
    const s = 70 + rng() * 150;
    m.scale.set(s, s * 0.45, 1);
    view.add(m);
    clouds.push({ m, a: rng() * TAU, r: 170 + rng() * 520, y: -90 + rng() * 210, sp: (0.004 + rng() * 0.006) * (rng() < 0.5 ? 1 : -1) });
  }
  // turquoise mist drifting over the Forest of Mist
  const mist = [];
  const mistTex = mistPuffTex();
  for (let i = 0; i < 40; i++) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: mistTex, color: '#d4fff2', transparent: true, depthWrite: false, opacity: 0.35 + rng() * 0.2 }));
    const s = 120 + rng() * 160;
    m.scale.set(s, s * 0.35, 1);
    view.add(m);
    mist.push({ m, a: rng() * TAU, d: 3.1 + rng() * 3.5, y: BASE_Y - 4 * TIER - 20 + rng() * 30, sp: 0.004 + rng() * 0.004, ph: rng() * 10 });
  }
  // birds circling the tower
  const birds = [];
  const birdMat = new THREE.MeshBasicMaterial({ color: '#2a2e3a', side: THREE.DoubleSide });
  const wingGeo = new THREE.BufferGeometry();
  wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.25, 0, 0, 0.3, 1.3, 0, 0.05], 3));
  wingGeo.computeVertexNormals();
  for (let i = 0; i < 8; i++) {
    const bird = new THREE.Group();
    const wl = new THREE.Mesh(wingGeo, birdMat), wr = new THREE.Mesh(wingGeo, birdMat);
    wr.scale.x = -1;
    bird.add(wl, wr);
    bird.scale.setScalar(1.4);
    view.add(bird);
    birds.push({ bird, wl, wr, a: rng() * TAU, r: 70 + rng() * 80, y: -10 + rng() * 70, sp: (0.07 + rng() * 0.05) * (i % 3 ? 1 : -1), ph: rng() * 10 });
  }

  return {
    stats: `${Math.round(tris)} tris`,
    update(dt, t, camera) {
      if (!group.visible) return;
      if (camera) { dome.position.copy(camera.position); hills.position.set(camera.position.x, 0, camera.position.z); }
      for (const c of clouds) {
        c.a += c.sp * dt;
        c.m.position.set(CORE.x + Math.cos(c.a) * c.r, c.y, CORE.z + Math.sin(c.a) * c.r);
      }
      for (const m of mist) {
        const a = m.a + t * m.sp * 0.2;
        m.m.position.set(GL.x + Math.cos(a) * m.d * GL.ax, m.y + Math.sin(t * 0.2 + m.ph) * 4, GL.z + Math.sin(a) * m.d * GL.az);
      }
      for (const s of sails) s.hub.rotation.z += s.sp * dt;
      for (const q of birds) {
        q.a += q.sp * dt;
        const x = CORE.x + Math.cos(q.a) * q.r, z = CORE.z + Math.sin(q.a) * q.r;
        q.bird.position.set(x, q.y + Math.sin(t * 0.5 + q.ph) * 3, z);
        q.bird.rotation.y = -q.a + (q.sp > 0 ? 0 : Math.PI);
        // flap in bursts, glide in between
        const flap = Math.sin(t * 0.7 + q.ph) > 0.2 ? Math.sin(t * 9 + q.ph) * 0.6 : 0.12;
        q.wl.rotation.z = flap; q.wr.rotation.z = -flap;
      }
    },
  };
}

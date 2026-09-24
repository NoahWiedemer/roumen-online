// Street furniture and props. Each prop pushes its own local frame (x,y,z,rotY) on top of the
// builder's current frame (normally world/identity).
import * as THREE from 'three';
import { pm, U } from './builder.js';
import { PALETTE } from './parts.js';
import { gableRoof } from './roofs.js';

const CREAM = [1.08, 1.05, 0.98];
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// ------------------------------------------------------------------ street lamp (cream post, glowing lantern)
const LAMP_BASE = [[0.001, 0], [0.3, 0], [0.31, 0.08], [0.25, 0.14], [0.21, 0.4], [0.25, 0.46], [0.25, 0.52], [0.15, 0.62], [0.09, 0.72]];
export function lampPost(b, M, x, y, z, rot, halos, o = {}) {
  b.push(pm(x, y, z, 0, rot, 0));
  const H = o.h ?? 3.4;
  b.geo(M.cream, U.lathe('lampbase', LAMP_BASE, 12), pm(0, -0.2, 0), { uv: 'keep', uvScale: [1, 0.4], color: CREAM });
  b.geo(M.cream, U.cyl(10), pm(0, 0.5 + (H - 0.5) / 2, 0, 0, 0, 0, 0.07, H - 0.5, 0.07), { uv: 'keep', uvScale: [0.5, 1], color: CREAM });
  for (const yy of [0.95, 1.9, H - 0.55]) b.geo(M.cream, U.cyl(10), pm(0, yy, 0, 0, 0, 0, 0.1, 0.07, 0.1), { color: CREAM });
  // flared collar
  b.geo(M.cream, U.lathe('lampcollar', [[0.07, 0], [0.09, 0.08], [0.14, 0.18], [0.2, 0.24], [0.2, 0.28], [0.001, 0.28]], 10), pm(0, H - 0.3, 0), { color: CREAM });
  if (o.double) {
    // cross arm with two hanging lanterns
    b.box(M.cream, pm(0, H - 0.1, 0), 1.7, 0.08, 0.08, { color: CREAM });
    for (const s of [-1, 1]) {
      b.geo(M.cream, U.torus(1, 0.08, 4, 10, Math.PI / 2), pm(s * 0.45, H - 0.45, 0, 0, s > 0 ? 0 : Math.PI, 0, 0.35), { color: CREAM });
      lantern(b, M, s * 0.8, H - 0.75, 0, 0.8, halos);
      b.box(M.iron, pm(s * 0.8, H - 0.2, 0), 0.03, 0.18, 0.03);
    }
    lantern(b, M, 0, H, 0, 0.9, halos);
  } else {
    // scroll brackets
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2 + Math.PI / 4;
      b.geo(M.cream, U.torus(1, 0.1, 4, 8, Math.PI), pm(Math.cos(a) * 0.17, H - 0.2, Math.sin(a) * 0.17, 0, -a + Math.PI / 2, 0, 0.12), { color: CREAM });
    }
    lantern(b, M, 0, H, 0, 1, halos);
  }
  b.pop();
}

function lantern(b, M, x, y, z, s, halos) {
  // bottom tray, hex glass, bars, roof, finial
  b.geo(M.cream, U.frustum(1.25, 6), pm(x, y + 0.03 * s, z, 0, Math.PI / 6, 0, 0.17 * s, 0.08 * s, 0.17 * s), { color: CREAM });
  b.geo(M.lamp, U.frustum(1.25, 6), pm(x, y + 0.3 * s, z, 0, Math.PI / 6, 0, 0.17 * s, 0.46 * s, 0.17 * s), { ao: false });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    b.box(M.cream, pm(x + Math.cos(a) * 0.19 * s, y + 0.3 * s, z + Math.sin(a) * 0.19 * s, 0, -a, -0.05 * 0), 0.03 * s, 0.48 * s, 0.03 * s, { color: CREAM });
  }
  b.geo(M.cream, U.frustum(1, 6), pm(x, y + 0.56 * s, z, 0, Math.PI / 6, 0, 0.25 * s, 0.06 * s, 0.25 * s), { color: CREAM });
  b.geo(M.cream, U.coneCap(6), pm(x, y + 0.72 * s, z, 0, Math.PI / 6, 0, 0.25 * s, 0.28 * s, 0.25 * s), { color: CREAM });
  b.geo(M.gold, U.sphere(8, 6), pm(x, y + 0.9 * s, z, 0, 0, 0, 0.055 * s), {});
  if (halos) {
    const p = V3(x, y + 0.3 * s, z).applyMatrix4(b.F);
    halos.push({ x: p.x, y: p.y, z: p.z, s: 2.4 * s });
  }
}

// ------------------------------------------------------------------ barrels, crates, sacks
const BARREL = [[0.001, 0], [0.26, 0], [0.3, 0.12], [0.33, 0.4], [0.3, 0.68], [0.26, 0.8], [0.001, 0.8]];
export function barrel(b, M, x, y, z, rot = 0, s = 1, o = {}) {
  b.push(pm(x, y, z, 0, rot, 0, s));
  b.geo(M.wood, U.lathe('barrel', BARREL, 12), pm(0, 0, 0), { uv: 'keep', uvScale: [2, 0.8], color: o.col || [1, 1, 1] });
  for (const [yy, r] of [[0.12, 0.305], [0.68, 0.305], [0.3, 0.33], [0.5, 0.33]]) b.geo(M.iron, U.cyl(12, true), pm(0, yy, 0, 0, 0, 0, r, 0.05, r), {});
  if (o.water) b.geo(M.color, U.circle(12), pm(0, 0.76, 0, 0, 0, 0, 0.25, 1, 0.25), { color: [0.3, 0.55, 0.8] });
  if (o.apples) for (let i = 0; i < 7; i++) {
    const a = i * 2.4, r = i ? 0.15 : 0;
    b.geo(M.color, U.sphere(6, 4), pm(Math.cos(a) * r, 0.8, Math.sin(a) * r, 0, 0, 0, 0.08), { color: o.apples });
  }
  b.pop();
}
export function barrelLying(b, M, x, y, z, rot = 0) {
  b.push(pm(x, y + 0.33, z, 0, rot, Math.PI / 2));
  b.geo(M.wood, U.lathe('barrel', BARREL, 12), pm(0, -0.4, 0), { uv: 'keep', uvScale: [2, 0.8] });
  for (const [yy, r] of [[-0.28, 0.305], [0.28, 0.305]]) b.geo(M.iron, U.cyl(12, true), pm(0, yy, 0, 0, 0, 0, r, 0.05, r), {});
  b.pop();
}
export function crate(b, M, x, y, z, rot = 0, s = 0.7, o = {}) {
  b.push(pm(x, y, z, 0, rot, 0));
  const c = o.col || [1, 1, 1];
  b.box(M.wood, pm(0, s / 2, 0), s, s, s, { uvs: 1.2, color: c });
  const e = 0.07;
  const dk = [c[0] * 0.75, c[1] * 0.75, c[2] * 0.75];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(M.wood, pm(sx * (s / 2 - e / 2 + 0.01), s / 2, sz * (s / 2 - e / 2 + 0.01)), e, s + 0.01, e, { uv: 'grain', color: dk });
  for (const yy of [e / 2, s - e / 2]) {
    b.box(M.wood, pm(0, yy, s / 2 + 0.01), s, e, 0.03, { uv: 'grain', color: dk });
    b.box(M.wood, pm(0, yy, -s / 2 - 0.01), s, e, 0.03, { uv: 'grain', color: dk });
    b.box(M.wood, pm(s / 2 + 0.01, yy, 0), 0.03, e, s, { uv: 'grain', color: dk });
    b.box(M.wood, pm(-s / 2 - 0.01, yy, 0), 0.03, e, s, { uv: 'grain', color: dk });
  }
  const dl = Math.hypot(s, s) - 0.15;
  b.box(M.wood, pm(0, s / 2, s / 2 + 0.015, 0, 0, Math.PI / 4), dl, e, 0.03, { uv: 'grain', color: dk });
  b.box(M.wood, pm(s / 2 + 0.015, s / 2, 0, -Math.PI / 4, Math.PI / 2, 0), dl, e, 0.03, { uv: 'grain', color: dk });
  if (o.goods) {
    for (let i = 0; i < 9; i++) {
      const gx = ((i % 3) - 1) * s * 0.28, gz = (Math.floor(i / 3) - 1) * s * 0.28;
      b.geo(M.color, U.sphere(7, 5), pm(gx, s + 0.02, gz, 0, 0, 0, s * 0.15), { color: o.goods });
    }
  }
  b.pop();
}
export function sack(b, M, x, y, z, rot = 0, s = 1, col = [0.92, 0.84, 0.66]) {
  b.push(pm(x, y, z, 0, rot, 0, s));
  b.geo(M.fabric, U.sphere(10, 8), pm(0, 0.3, 0, 0, 0, 0, 0.3, 0.32, 0.26), { uv: 'keep', uvScale: [2, 1], color: col });
  b.geo(M.fabric, U.frustum(0.5, 8), pm(0, 0.62, 0, 0, 0, 0, 0.12, 0.12, 0.12), { color: col });
  b.geo(M.rope, U.cyl(8), pm(0, 0.58, 0, 0, 0, 0, 0.1, 0.04, 0.1), {});
  b.pop();
}
export function clutter(b, M, x, y, z, rot, rng, T) {
  // a small pile of barrels / crates / sacks around a point
  const n = 2 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    const a = rot + (i - n / 2) * 0.8, r = 0.35 + rng() * 0.5;
    const px = x + Math.sin(a) * r, pz = z + Math.cos(a) * r;
    const py = T ? T.heightAt(px, pz) : y;
    const k = rng();
    if (k < 0.4) barrel(b, M, px, py - 0.02, pz, rng() * 3, 0.9 + rng() * 0.2, { apples: rng() < 0.3 ? [0.9, 0.2, 0.15] : null });
    else if (k < 0.75) crate(b, M, px, py - 0.02, pz, rng() * 3, 0.55 + rng() * 0.25, { goods: rng() < 0.3 ? PALETTE.flowers[Math.floor(rng() * 7)] : null });
    else sack(b, M, px, py - 0.03, pz, rng() * 3, 0.9 + rng() * 0.2);
  }
}

// ------------------------------------------------------------------ bench (wood slats, cream iron frame)
export function bench(b, M, x, y, z, rot, o = {}) {
  b.push(pm(x, y, z, 0, rot, 0));
  const L = o.len ?? 1.8;
  for (let i = 0; i < 3; i++) b.box(M.wood, pm(0, 0.46, -0.12 + i * 0.13), L, 0.05, 0.11, { uv: 'grain', uvs: 1 });
  for (let i = 0; i < 2; i++) b.box(M.wood, pm(0, 0.68 + i * 0.16, -0.25, -0.18, 0, 0), L, 0.1, 0.04, { uv: 'grain', uvs: 1 });
  for (const s of [-1, 1]) {
    const xx = s * (L / 2 - 0.12);
    b.box(M.iron, pm(xx, 0.23, 0.12), 0.06, 0.46, 0.06);
    b.box(M.iron, pm(xx, 0.5, -0.24, -0.18, 0, 0), 0.06, 1.0, 0.06);
    b.box(M.iron, pm(xx, 0.44, -0.04), 0.06, 0.05, 0.4);
    b.box(M.iron, pm(xx, 0.66, 0.02), 0.05, 0.05, 0.34);
    b.box(M.iron, pm(xx, 0.56, 0.17), 0.05, 0.22, 0.05);
  }
  b.pop();
}

// table + stools (inn)
export function tableSet(b, M, x, y, z, rot, rng) {
  b.push(pm(x, y, z, 0, rot, 0));
  b.geo(M.wood, U.cyl(12), pm(0, 0.76, 0, 0, 0, 0, 0.55, 0.07, 0.55), { uv: 'keep', uvScale: [2, 0.1] });
  b.geo(M.wood, U.cyl(8), pm(0, 0.38, 0, 0, 0, 0, 0.08, 0.74, 0.08), {});
  b.box(M.wood, pm(0, 0.03, 0), 0.7, 0.06, 0.12, { uv: 'grain' });
  b.box(M.wood, pm(0, 0.03, 0), 0.12, 0.06, 0.7, { uv: 'grain' });
  // mugs
  for (let i = 0; i < 2; i++) b.geo(M.color, U.cyl(8), pm(-0.15 + i * 0.3, 0.87, (rng() - 0.5) * 0.3, 0, 0, 0, 0.06, 0.14, 0.06), { color: [0.95, 0.75, 0.3] });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    const sx = Math.cos(a) * 0.85, sz = Math.sin(a) * 0.85;
    b.geo(M.wood, U.cyl(10), pm(sx, 0.44, sz, 0, 0, 0, 0.2, 0.06, 0.2), { uv: 'keep', uvScale: [1, 0.1] });
    for (let k = 0; k < 3; k++) {
      const la = (k / 3) * Math.PI * 2;
      b.box(M.wood, pm(sx + Math.cos(la) * 0.12, 0.21, sz + Math.sin(la) * 0.12), 0.05, 0.44, 0.05, { uv: 'grain' });
    }
  }
  b.pop();
}

// ------------------------------------------------------------------ flower bed (rectangular or ring sector)
export function flowerClump(b, M, x, y, z, rng, cols, s = 1) {
  b.geo(M.leaf, U.sphere(7, 5), pm(x, y + 0.12 * s, z, 0, rng() * 3, 0, 0.42 * s, 0.26 * s, 0.42 * s), { uv: 'keep', uvScale: [1.5, 1], color: [1.05, 1.12, 1] });
  const c = cols[Math.floor(rng() * cols.length)];
  const n = 5 + Math.floor(rng() * 4);
  for (let i = 0; i < n; i++) {
    const a = rng() * 6.28, r = rng() * 0.32 * s;
    b.geo(M.color, U.ico(0), pm(x + Math.cos(a) * r, y + (0.3 + rng() * 0.12) * s, z + Math.sin(a) * r, rng(), rng(), 0, 0.075 * s), { color: c, flat: true });
  }
  // a crossed flower card for extra stems
  const cr = rng() * 3;
  for (const k of [0, Math.PI / 2]) b.geo(M.flowerCard, U.plane(), pm(x, y + 0.28 * s, z, 0, cr + k, 0, 0.7 * s, 0.56 * s, 1), { uv: 'keep' });
}

// ------------------------------------------------------------------ terrain-following walls / fences
// stone wall from (x0,z0) to (x1,z1), height above ground h, thickness t
export function stoneWall(b, M, T, x0, z0, x1, z1, h = 1.0, t = 0.45, o = {}) {
  const L = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.max(1, Math.round(L / 1.6));
  const rot = Math.atan2(x1 - x0, z1 - z0);
  for (let i = 0; i < n; i++) {
    const a = i / n, c = (i + 1) / n;
    const xa = x0 + (x1 - x0) * a, za = z0 + (z1 - z0) * a, xb = x0 + (x1 - x0) * c, zb = z0 + (z1 - z0) * c;
    const ha = T.heightAt(xa, za), hb = T.heightAt(xb, zb), hm = T.heightAt((xa + xb) / 2, (za + zb) / 2);
    const lo = Math.min(ha, hb, hm) - 0.4, hi = Math.max(ha, hb, hm) + h;
    const seg = L / n + 0.02;
    b.box(M.stone, pm((xa + xb) / 2, (lo + hi) / 2, (za + zb) / 2, 0, rot, 0), t, hi - lo, seg, { uv: 'frame', uvs: 0.42, color: o.col });
    b.box(M.stone, pm((xa + xb) / 2, hi + 0.07, (za + zb) / 2, 0, rot, 0), t + 0.14, 0.14, seg + 0.01, { uv: 'frame', uvs: 0.6, color: [1.12, 1.1, 1.04] });
  }
}
export function picketFence(b, M, T, x0, z0, x1, z1, col = [1.05, 1.03, 0.98]) {
  const L = Math.hypot(x1 - x0, z1 - z0);
  const rot = Math.atan2(x1 - x0, z1 - z0);
  const nPost = Math.max(2, Math.round(L / 1.6) + 1);
  for (let i = 0; i < nPost; i++) {
    const a = i / (nPost - 1);
    const px = x0 + (x1 - x0) * a, pz = z0 + (z1 - z0) * a, py = T.heightAt(px, pz);
    b.box(M.paint, pm(px, py + 0.45, pz, 0, rot, 0), 0.1, 1.0, 0.1, { color: col });
    b.geo(M.paint, U.coneCap(4), pm(px, py + 1.02, pz, 0, rot + Math.PI / 4, 0, 0.08, 0.1, 0.08), { color: col });
  }
  const nP = Math.max(2, Math.round(L / 0.2));
  for (let i = 0; i < nP; i++) {
    const a = (i + 0.5) / nP;
    const px = x0 + (x1 - x0) * a, pz = z0 + (z1 - z0) * a, py = T.heightAt(px, pz);
    b.box(M.paint, pm(px, py + 0.38, pz, 0, rot, 0), 0.02, 0.8, 0.09, { color: col });
    b.geo(M.paint, U.coneCap(4), pm(px, py + 0.84, pz, 0, rot + Math.PI / 4, 0, 0.065, 0.1, 0.065), { color: col });
  }
  for (const hh of [0.28, 0.62]) {
    for (let i = 0; i < nPost - 1; i++) {
      const a = i / (nPost - 1), c = (i + 1) / (nPost - 1);
      const xa = x0 + (x1 - x0) * a, za = z0 + (z1 - z0) * a, xb = x0 + (x1 - x0) * c, zb = z0 + (z1 - z0) * c;
      const ya = T.heightAt(xa, za) + hh, yb = T.heightAt(xb, zb) + hh;
      const seg = Math.hypot(xb - xa, zb - za, yb - ya);
      b.box(M.paint, pm((xa + xb) / 2, (ya + yb) / 2, (za + zb) / 2, -Math.atan2(yb - ya, Math.hypot(xb - xa, zb - za)), rot, 0), 0.05, 0.08, seg, { color: col });
    }
  }
}

// ------------------------------------------------------------------ market stall
export function marketStall(b, M, x, y, z, rot, rng, scheme = 0) {
  b.push(pm(x, y, z, 0, rot, 0));
  const W = 3.2, D = 1.8;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(M.wood, pm(sx * (W / 2 - 0.08), (sz > 0 ? 2.3 : 2.7) / 2, sz * (D / 2 - 0.08)), 0.12, sz > 0 ? 2.3 : 2.7, 0.12, { uv: 'grain' });
  // counter
  b.box(M.wood, pm(0, 0.9, D / 2 - 0.35), W - 0.1, 0.1, 0.8, { uvs: 0.8 });
  b.box(M.paint, pm(0, 0.45, D / 2 - 0.05), W - 0.2, 0.85, 0.06, { color: [0.62, 0.42, 0.26] });
  for (let i = 0; i < 5; i++) b.box(M.paint, pm(-W / 2 + 0.3 + i * ((W - 0.6) / 4), 0.45, D / 2 - 0.01), 0.08, 0.85, 0.04, { color: [0.5, 0.33, 0.2] });
  // back shelf
  b.box(M.wood, pm(0, 1.3, -D / 2 + 0.25), W - 0.2, 0.06, 0.4, { uvs: 0.8 });
  // canopy (fabric, sloping forward) + valance
  const v0 = 1 - (scheme + 1) / 4 + 0.01, v1 = 1 - scheme / 4 - 0.01;
  const fy = 2.35, by = 2.85;
  const us = W / 0.9;
  b.quadN(M.awning, V3(-W / 2 - 0.15, fy, D / 2 + 0.25), V3(W / 2 + 0.15, fy, D / 2 + 0.25), V3(W / 2 + 0.15, by, -D / 2 - 0.1), V3(-W / 2 - 0.15, by, -D / 2 - 0.1), [0, v0], [us, v0], [us, v1], [0, v1], [1, 1, 1], V3(0, 1, 0.3));
  const n = 10;
  for (let i = 0; i < n; i++) {
    const xa = -W / 2 - 0.15 + (i / n) * (W + 0.3), xb = -W / 2 - 0.15 + ((i + 1) / n) * (W + 0.3);
    const ua = (i / n) * us, ub = ((i + 1) / n) * us;
    b.quadN(M.awning, V3(xa, fy - 0.22, D / 2 + 0.25), V3(xb, fy - 0.22, D / 2 + 0.25), V3(xb, fy, D / 2 + 0.25), V3(xa, fy, D / 2 + 0.25), [ua, v0], [ub, v0], [ub, v1], [ua, v1], [0.92, 0.92, 0.92], V3(0, 0, 1));
    b.triN(M.awning, V3(xa, fy - 0.22, D / 2 + 0.25), V3((xa + xb) / 2, fy - 0.34, D / 2 + 0.25), V3(xb, fy - 0.22, D / 2 + 0.25), [ua, v0], [(ua + ub) / 2, v0], [ub, v0], [0.9, 0.9, 0.9], V3(0, 0, 1));
  }
  // goods
  const goods = [[0.95, 0.2, 0.15], [1, 0.75, 0.2], [0.55, 0.8, 0.25], [0.95, 0.5, 0.15], [0.6, 0.3, 0.7]];
  for (let k = 0; k < 3; k++) {
    const gx = -W / 2 + 0.6 + k * 1.0;
    b.box(M.wood, pm(gx, 1.0, D / 2 - 0.35), 0.8, 0.14, 0.55, { uvs: 1.2 });
    const gc = goods[Math.floor(rng() * goods.length)];
    for (let i = 0; i < 8; i++) b.geo(M.color, U.sphere(7, 5), pm(gx - 0.27 + (i % 4) * 0.18, 1.13, D / 2 - 0.47 + Math.floor(i / 4) * 0.22, 0, 0, 0, 0.085), { color: gc });
  }
  for (let k = 0; k < 5; k++) {
    const jc = [[0.9, 0.35, 0.4], [0.35, 0.6, 0.9], [0.95, 0.8, 0.3], [0.5, 0.8, 0.5]][k % 4];
    b.geo(M.color, U.lathe('jar', [[0.001, 0], [0.08, 0], [0.1, 0.1], [0.06, 0.2], [0.05, 0.26], [0.001, 0.26]], 8), pm(-W / 2 + 0.4 + k * 0.6, 1.33, -D / 2 + 0.25), { color: jc });
  }
  b.pop();
}

// ------------------------------------------------------------------ smithy props
export function anvil(b, M, x, y, z, rot) {
  b.push(pm(x, y, z, 0, rot, 0));
  b.geo(M.wood, U.cyl(10), pm(0, 0.3, 0, 0, 0, 0, 0.32, 0.6, 0.32), { uv: 'keep', uvScale: [2, 0.6], color: [0.8, 0.7, 0.6] });
  b.box(M.iron, pm(0, 0.65, 0), 0.34, 0.1, 0.3);
  b.box(M.iron, pm(0, 0.75, 0), 0.2, 0.14, 0.18);
  b.box(M.iron, pm(0.02, 0.88, 0), 0.62, 0.14, 0.26);
  b.geo(M.iron, U.coneCap(8), pm(0.48, 0.88, 0, 0, 0, -Math.PI / 2, 0.1, 0.36, 0.1), {});
  // hammer
  b.box(M.wood, pm(-0.05, 0.99, 0.05, 0, 0.5, 0), 0.4, 0.04, 0.04, { uv: 'grain' });
  b.box(M.iron, pm(0.12, 0.99, 0.15, 0, 0.5, 0), 0.08, 0.08, 0.16);
  b.pop();
}
export function forge(b, M, x, y, z, rot, topY) {
  b.push(pm(x, y, z, 0, rot, 0));
  b.box(M.stone, pm(0, 0.5, 0), 1.6, 1.0, 1.3, { uv: 'frame', uvs: 0.6 });
  b.box(M.stone, pm(0, 1.02, 0), 1.75, 0.08, 1.45, { uv: 'frame', uvs: 0.6, color: [1.1, 1.08, 1.02] });
  b.box(M.ember, pm(0, 1.06, 0.05), 1.0, 0.06, 0.8, { ao: false });
  for (let i = 0; i < 6; i++) b.geo(M.iron, U.ico(0), pm(-0.35 + (i % 3) * 0.35, 1.1, -0.2 + Math.floor(i / 3) * 0.4, i, i * 2, 0, 0.12), { color: [0.5, 0.45, 0.45], flat: true });
  // hood + chimney
  b.geo(M.stone, U.frustum(0.35, 4), pm(0, 2.2, -0.1, 0, Math.PI / 4, 0, 1.05, 0.9, 0.9), { uv: 'frame', uvs: 0.6 });
  const ch = (topY ?? 5.2) - 2.6;
  b.box(M.stone, pm(0, 2.6 + ch / 2, -0.1), 0.6, ch, 0.6, { uv: 'frame', uvs: 0.6 });
  b.box(M.stone, pm(0, 2.6 + ch + 0.06, -0.1), 0.78, 0.12, 0.78, { uv: 'frame', uvs: 0.6, color: [1.1, 1.08, 1.02] });
  // bellows
  b.box(M.wood, pm(1.05, 0.8, 0.1, 0, 0, 0.2), 0.6, 0.08, 0.5, { uvs: 1 });
  b.box(M.color, pm(1.05, 0.9, 0.1, 0, 0, 0.2), 0.55, 0.12, 0.45, { color: [0.45, 0.3, 0.2] });
  b.pop();
}
export function weaponRack(b, M, x, y, z, rot) {
  b.push(pm(x, y, z, 0, rot, 0));
  for (const s of [-1, 1]) b.box(M.wood, pm(s * 0.8, 0.8, 0), 0.1, 1.6, 0.1, { uv: 'grain' });
  b.box(M.wood, pm(0, 1.4, 0), 1.7, 0.08, 0.12, { uv: 'grain' });
  b.box(M.wood, pm(0, 0.3, 0.12), 1.7, 0.06, 0.2, { uv: 'grain' });
  for (let i = 0; i < 5; i++) {
    const xx = -0.6 + i * 0.3;
    if (i % 2 === 0) {
      // sword
      b.box(M.metal || M.iron, pm(xx, 0.95, 0.08, -0.1, 0, 0), 0.07, 0.95, 0.015, { color: [2.2, 2.3, 2.5] });
      b.box(M.gold, pm(xx, 0.42, 0.13, -0.1, 0, 0), 0.26, 0.05, 0.05);
      b.box(M.wood, pm(xx, 0.3, 0.14, -0.1, 0, 0), 0.05, 0.2, 0.05, { color: [0.6, 0.35, 0.25] });
    } else {
      // axe
      b.box(M.wood, pm(xx, 0.85, 0.08, -0.1, 0, 0), 0.05, 1.2, 0.05, { uv: 'grain' });
      b.box(M.iron, pm(xx + 0.1, 1.32, 0.03, -0.1, 0, 0), 0.22, 0.24, 0.03, { color: [2, 2, 2.2] });
    }
  }
  // spear leaning
  b.box(M.wood, pm(0.95, 1.1, 0.2, 0, 0, -0.12), 0.05, 2.3, 0.05, { uv: 'grain' });
  b.geo(M.iron, U.coneCap(4), pm(0.95 + 0.14, 2.35, 0.2, 0, 0, -0.12, 0.06, 0.3, 0.02), { color: [2, 2, 2.2] });
  b.pop();
}
export function armorStand(b, M, x, y, z, rot, col = [1.6, 1.65, 1.8]) {
  b.push(pm(x, y, z, 0, rot, 0));
  b.geo(M.wood, U.cyl(8), pm(0, 0.03, 0, 0, 0, 0, 0.3, 0.06, 0.3), {});
  b.box(M.wood, pm(0, 0.7, 0), 0.07, 1.4, 0.07, { uv: 'grain' });
  b.box(M.wood, pm(0, 1.35, 0), 0.8, 0.07, 0.07, { uv: 'grain' });
  // breastplate
  b.geo(M.iron, U.sphere(12, 8), pm(0, 1.1, 0.02, 0, 0, 0, 0.3, 0.38, 0.2), { color: col });
  b.geo(M.iron, U.sphere(8, 6), pm(-0.33, 1.3, 0, 0, 0, 0.3, 0.14, 0.1, 0.14), { color: col });
  b.geo(M.iron, U.sphere(8, 6), pm(0.33, 1.3, 0, 0, 0, -0.3, 0.14, 0.1, 0.14), { color: col });
  b.geo(M.gold, U.cyl(10, true), pm(0, 0.8, 0.02, 0, 0, 0, 0.26, 0.08, 0.18), {});
  // helmet
  b.geo(M.iron, U.hemi(10, 5), pm(0, 1.58, 0, 0, 0, 0, 0.2, 0.24, 0.2), { color: col });
  b.geo(M.iron, U.cyl(10, true), pm(0, 1.52, 0, 0, 0, 0, 0.2, 0.12, 0.2), { color: col });
  b.geo(M.color, U.sphere(6, 4), pm(0, 1.86, 0, 0, 0, 0, 0.05, 0.12, 0.05), { color: [0.9, 0.2, 0.25] });
  b.pop();
}
export function shield(b, M, x, y, z, rot, tilt, col = [0.3, 0.45, 0.9]) {
  b.push(pm(x, y, z, tilt, rot, 0));
  b.geo(M.color, U.cyl(14), pm(0, 0, 0, Math.PI / 2, 0, 0, 0.4, 0.06, 0.4), { color: col });
  b.geo(M.iron, U.torus(1, 0.06, 4, 16), pm(0, 0, 0.03, 0, 0, 0, 0.4), { color: [1.6, 1.6, 1.7] });
  b.geo(M.gold, U.sphere(8, 6), pm(0, 0, 0.05, 0, 0, 0, 0.09, 0.09, 0.05), {});
  b.pop();
}
export function grindstone(b, M, x, y, z, rot) {
  b.push(pm(x, y, z, 0, rot, 0));
  for (const s of [-1, 1]) b.box(M.wood, pm(s * 0.25, 0.4, 0), 0.08, 0.8, 0.5, { uvs: 1 });
  b.geo(M.stone, U.cyl(16), pm(0, 0.72, 0, 0, 0, Math.PI / 2, 0.4, 0.14, 0.4), { uv: 'keep', uvScale: [2, 0.2], color: [1.1, 1.05, 1] });
  b.box(M.iron, pm(0, 0.72, 0), 0.7, 0.04, 0.04);
  b.box(M.wood, pm(0.37, 0.6, 0, 0, 0, 0), 0.04, 0.26, 0.04);
  b.pop();
}

// ------------------------------------------------------------------ well (gap filler)
export function well(b, M, x, y, z, rot, roofMat) {
  b.push(pm(x, y, z, 0, rot, 0));
  b.geo(M.stone, U.cyl(16), pm(0, 0.35, 0, 0, 0, 0, 0.95, 1.1, 0.95), { uv: 'keep', uvScale: [2.5, 0.45] });
  b.geo(M.stone, U.cyl(16, true), pm(0, 0.94, 0, 0, 0, 0, 1.02, 0.12, 1.02), { uv: 'keep', uvScale: [3, 0.1], color: [1.1, 1.08, 1.02] });
  b.geo(M.color, U.circle(16), pm(0, 0.8, 0, 0, 0, 0, 0.8, 1, 0.8), { color: [0.12, 0.2, 0.3] });
  for (const s of [-1, 1]) b.box(M.wood, pm(s * 0.85, 1.35, 0), 0.14, 1.9, 0.14, { uv: 'grain' });
  b.geo(M.wood, U.cyl(8), pm(0, 1.6, 0, 0, 0, Math.PI / 2, 0.08, 1.7, 0.08), { uv: 'keep' });
  b.box(M.rope, pm(0, 1.3, 0), 0.03, 0.6, 0.03);
  b.geo(M.wood, U.frustum(1.2, 8), pm(0, 0.92, 0.0, 0, 0, 0, 0.14, 0.22, 0.14), { uv: 'keep' });
  b.push(pm(0, 0, 0, 0, Math.PI / 2, 0));
  gableRoof(b, M, roofMat, { x0: -0.95, x1: 0.95, zb: -0.95, zf: 0.95, y: 2.3, pitch: 0.75, ovE: 0.25, ovG: 0.2, t: 0.12, knobs: false });
  b.pop();
  b.pop();
}

// water trough for horses
export function trough(b, M, x, y, z, rot) {
  b.push(pm(x, y, z, 0, rot, 0));
  b.box(M.wood, pm(0, 0.3, 0), 1.6, 0.5, 0.6, { uvs: 1 });
  b.box(M.color, pm(0, 0.52, 0), 1.45, 0.02, 0.45, { color: [0.3, 0.55, 0.8] });
  for (const s of [-1, 1]) b.box(M.wood, pm(s * 0.6, 0.15, 0), 0.12, 0.3, 0.75, { uv: 'grain' });
  b.pop();
}

export function hayBale(b, M, x, y, z, rot) {
  b.push(pm(x, y, z, 0, rot, 0));
  b.geo(M.fabric, U.cyl(12), pm(0, 0.4, 0, 0, 0, Math.PI / 2, 0.42, 0.9, 0.42), { uv: 'keep', uvScale: [3, 2], color: [1.2, 0.86, 0.3] });
  for (const s of [-0.25, 0.25]) b.geo(M.rope, U.cyl(12, true), pm(s, 0.4, 0, 0, 0, Math.PI / 2, 0.43, 0.04, 0.43), {});
  b.pop();
}

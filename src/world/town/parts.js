// Facade parts drawn in a "facade frame": facade plane at z=0, +z out of the wall,
// x to the right when looking at the wall from outside, y up.
import * as THREE from 'three';
import { pm, U } from './builder.js';
import { signUV } from './textures.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export const PALETTE = {
  shutters: [[0.32, 0.52, 0.9], [0.36, 0.66, 0.4], [0.86, 0.32, 0.3], [0.28, 0.66, 0.7], [0.95, 0.72, 0.3], [0.55, 0.38, 0.72], [0.62, 0.4, 0.24]],
  doors: [[0.55, 0.34, 0.2], [0.72, 0.3, 0.25], [0.3, 0.52, 0.35], [0.3, 0.45, 0.75], [0.45, 0.3, 0.2]],
  flowers: [[1, 0.35, 0.5], [0.95, 0.2, 0.25], [1, 0.85, 0.25], [1, 1, 1], [0.7, 0.45, 1], [1, 0.6, 0.2], [1, 0.55, 0.75]],
  frames: [1.05, 1.02, 0.95],
};

// ------------------------------------------------------------------ window
// opts: lit, shutters (colour or null), box (flower colour set or null), arch, frameMat, frameCol,
//       sillMat, mull (bool), header (mat)
export function windowAt(b, M, x, y, w, h, o = {}) {
  const fm = o.frameMat || M.paint;
  const fc = o.frameCol || [1, 0.98, 0.94];
  const fw = 0.09, fd = 0.12;
  // glass
  const gm = o.lit ? M.glassLit : M.glass;
  b.quad(gm, V(x - w / 2, y, 0.03), V(x + w / 2, y, 0.03), V(x + w / 2, y + h, 0.03), V(x - w / 2, y + h, 0.03), [0, 0], [1, 0], [1, 1], [0, 1], [1, 1, 1], V(0, 0, 1), false);
  // frame
  b.box(fm, pm(x - w / 2 - fw / 2, y + h / 2, fd / 2), fw, h + fw * 2, fd, { color: fc, skip: ['nz'] });
  b.box(fm, pm(x + w / 2 + fw / 2, y + h / 2, fd / 2), fw, h + fw * 2, fd, { color: fc, skip: ['nz'] });
  b.box(fm, pm(x, y + h + fw / 2, fd / 2), w, fw, fd, { color: fc, skip: ['nz'] });
  if (o.arch) {
    // semicircular fanlight above
    const r = w / 2;
    const cy = y + h + fw;
    const seg = 8;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI, a1 = ((i + 1) / seg) * Math.PI;
      b.tri(gm, V(x, cy, 0.03), V(x + Math.cos(a0) * r, cy + Math.sin(a0) * r, 0.03), V(x + Math.cos(a1) * r, cy + Math.sin(a1) * r, 0.03),
        [0.5, 0.95], [0.5 + Math.cos(a0) * 0.5, 0.95 + Math.sin(a0) * 0.05], [0.5 + Math.cos(a1) * 0.5, 0.95 + Math.sin(a1) * 0.05], [1, 1, 1], V(0, 0, 1), false);
      const am = (a0 + a1) / 2;
      const len = r * (a1 - a0) + 0.02;
      b.box(fm, pm(x + Math.cos(am) * (r + fw / 2), cy + Math.sin(am) * (r + fw / 2), fd / 2, 0, 0, am + Math.PI / 2), len, fw, fd, { color: fc, skip: ['nz'] });
    }
    b.box(fm, pm(x, cy - fw / 2 + 0.01, fd / 2), w, fw * 0.7, fd * 0.8, { color: fc, skip: ['nz'] });
    if (o.archStone) {
      // voussoirs
      const n = 7;
      for (let i = 0; i < n; i++) {
        const a = ((i + 0.5) / n) * Math.PI;
        const big = i === (n - 1) / 2;
        b.box(M.stone, pm(x + Math.cos(a) * (r + 0.28), cy + Math.sin(a) * (r + 0.28), 0.05, 0, 0, a - Math.PI / 2), big ? 0.34 : 0.26, big ? 0.46 : 0.36, 0.12, { color: [1.12, 1.1, 1.05], uvs: 0.8 });
      }
    }
  }
  if (o.mull !== false) {
    b.box(fm, pm(x, y + h / 2, 0.06), 0.05, h, 0.05, { color: fc, skip: ['nz'] });
    b.box(fm, pm(x, y + h * 0.62, 0.06), w, 0.05, 0.05, { color: fc, skip: ['nz'] });
  }
  // sill
  b.box(o.sillMat || M.stone, pm(x, y - 0.05, 0.1), w + 0.34, 0.1, 0.22, { color: [1.1, 1.08, 1.02], uvs: 1 });
  if (o.header) b.box(o.header, pm(x, y + h + fw + 0.08, 0.06), w + 0.3, 0.16, 0.14, { uv: 'grain', color: o.headerCol });
  // shutters
  if (o.shutters) {
    const sc = o.shutters;
    const dk = [sc[0] * 0.7, sc[1] * 0.7, sc[2] * 0.7];
    for (const s of [-1, 1]) {
      const sx = x + s * (w / 2 + fw + w / 4 + 0.02);
      b.box(M.paint, pm(sx, y + h / 2, 0.05), w / 2, h + 0.08, 0.05, { color: sc });
      // cross battens
      b.box(M.paint, pm(sx, y + h * 0.22, 0.085), w / 2 - 0.06, 0.07, 0.03, { color: dk, skip: ['nz'] });
      b.box(M.paint, pm(sx, y + h * 0.78, 0.085), w / 2 - 0.06, 0.07, 0.03, { color: dk, skip: ['nz'] });
      const dl = Math.hypot(w / 2 - 0.1, h * 0.56);
      const ang = Math.atan2(h * 0.56, w / 2 - 0.1) * s;
      b.box(M.paint, pm(sx, y + h / 2, 0.085, 0, 0, ang), dl, 0.06, 0.03, { color: dk, skip: ['nz'] });
    }
  }
  if (o.box) flowerBox(b, M, x, y - 0.22, 0.2, w + 0.2, o.box, o.rng || Math.random);
}

// ------------------------------------------------------------------ flower box
export function flowerBox(b, M, x, y, z, w, flowers, rng, boxCol = [0.62, 0.42, 0.26]) {
  b.box(M.paint, pm(x, y, z), w, 0.22, 0.26, { color: boxCol });
  b.box(M.paint, pm(x, y + 0.1, z + 0.135), w + 0.04, 0.05, 0.02, { color: [boxCol[0] * 0.75, boxCol[1] * 0.75, boxCol[2] * 0.75], skip: ['nz'] });
  b.geo(M.leaf, U.hemi(8, 3), pm(x, y + 0.09, z + 0.02, 0, 0, 0, w * 0.52, 0.2, 0.17), { uv: 'keep', uvScale: [2, 0.6], color: [1.05, 1.1, 1] });
  // trailing leaves in front
  b.geo(M.leaf, U.hemi(6, 2), pm(x, y + 0.05, z + 0.12, Math.PI / 2 + 0.3, 0, 0, w * 0.45, 0.1, 0.18), { uv: 'keep', uvScale: [2, 0.4] });
  const n = Math.max(3, Math.round(w / 0.22));
  for (let i = 0; i < n; i++) {
    const c = flowers[Math.floor(rng() * flowers.length)];
    const fx = x - w / 2 + 0.1 + (i + 0.5) * ((w - 0.2) / n) + (rng() - 0.5) * 0.06;
    const s = 0.065 + rng() * 0.03;
    b.geo(M.color, U.ico(0), pm(fx, y + 0.24 + rng() * 0.07, z + (rng() - 0.3) * 0.12, rng(), rng(), 0, s), { color: c, flat: true });
  }
}

// ------------------------------------------------------------------ door
// opts: col, arch, frameMat, frameCol, step (height of step below floor), canopy (roof mat), window
export function doorAt(b, M, x, w, h, o = {}) {
  const col = o.col || PALETTE.doors[0];
  const fm = o.frameMat || M.timber;
  const fc = o.frameCol || [1, 1, 1];
  const fwid = 0.16;
  // recess shadow
  b.box(M.timber, pm(x, h / 2, 0.015), w + 0.04, h, 0.03, { color: [0.3, 0.25, 0.22], skip: ['nz'] });
  // leaf with planks
  b.box(M.paint, pm(x, h / 2, 0.06), w, h, 0.06, { color: col, skip: ['nz'], uvs: 1.2 });
  // hinges
  for (const hy of [0.35, h - 0.45]) b.box(M.iron, pm(x - w * 0.12, hy, 0.1), w * 0.72, 0.07, 0.02, { skip: ['nz'] });
  // knob + plate
  b.box(M.iron, pm(x + w * 0.34, h * 0.48, 0.1), 0.08, 0.22, 0.02, { skip: ['nz'] });
  b.geo(M.gold, U.sphere(8, 6), pm(x + w * 0.34, h * 0.48, 0.14, 0, 0, 0, 0.045), {});
  if (o.window) {
    const wy0 = h * 0.66, wy1 = h * 0.86;
    b.quad(M.glass, V(x - 0.17, wy0, 0.095), V(x + 0.17, wy0, 0.095), V(x + 0.17, wy1, 0.095), V(x - 0.17, wy1, 0.095), [0.3, 0.45], [0.7, 0.45], [0.7, 0.7], [0.3, 0.7], [1, 1, 1], V(0, 0, 1), false);
    b.box(M.paint, pm(x, (wy0 + wy1) / 2, 0.1), 0.03, wy1 - wy0, 0.02, { skip: ['nz'], color: col });
    b.box(M.paint, pm(x, (wy0 + wy1) / 2, 0.1), 0.34, 0.03, 0.02, { skip: ['nz'], color: col });
    b.box(M.paint, pm(x, wy0 - 0.02, 0.1), 0.42, 0.04, 0.03, { skip: ['nz'], color: [col[0] * 0.8, col[1] * 0.8, col[2] * 0.8] });
    b.box(M.paint, pm(x, wy1 + 0.02, 0.1), 0.42, 0.04, 0.03, { skip: ['nz'], color: [col[0] * 0.8, col[1] * 0.8, col[2] * 0.8] });
  }
  // frame
  if (o.arch) {
    const r = w / 2 + fwid / 2;
    const seg = 7;
    for (let i = 0; i < seg; i++) {
      const a = ((i + 0.5) / seg) * Math.PI;
      const big = i === 3;
      b.box(fm, pm(x + Math.cos(a) * r, h + Math.sin(a) * r, 0.08, 0, 0, a - Math.PI / 2), big ? 0.3 : 0.26, fwid + (big ? 0.12 : 0.04), 0.16, { color: fc, uvs: 0.8 });
    }
    // arched leaf top
    const seg2 = 8;
    for (let i = 0; i < seg2; i++) {
      const a0 = (i / seg2) * Math.PI, a1 = ((i + 1) / seg2) * Math.PI;
      b.tri(M.paint, V(x, h, 0.09), V(x + Math.cos(a0) * w / 2, h + Math.sin(a0) * w / 2, 0.09), V(x + Math.cos(a1) * w / 2, h + Math.sin(a1) * w / 2, 0.09),
        [0.5, 0.5], [0.5 + Math.cos(a0) * 0.5, 0.5 + Math.sin(a0) * 0.5], [0.5 + Math.cos(a1) * 0.5, 0.5 + Math.sin(a1) * 0.5], col, V(0, 0, 1));
    }
  } else {
    b.box(fm, pm(x, h + fwid / 2, 0.08), w + fwid * 2 + 0.1, fwid + 0.04, 0.16, { color: fc, uv: 'grain' });
  }
  b.box(fm, pm(x - w / 2 - fwid / 2, h / 2, 0.08), fwid, h, 0.16, { color: fc, uv: 'grain' });
  b.box(fm, pm(x + w / 2 + fwid / 2, h / 2, 0.08), fwid, h, 0.16, { color: fc, uv: 'grain' });
  // threshold / steps
  const st = o.step ?? 0.3;
  const nSteps = Math.max(1, Math.round(st / 0.22));
  for (let i = 0; i < nSteps; i++) {
    const top = -i * (st / nSteps);
    const bot = -st - 0.5;
    b.box(M.stone, pm(x, (top + bot) / 2, 0.22 + i * 0.32), w + 0.7 + i * 0.2, top - bot, 0.45 + i * 0.32 * 0 + 0.001, { color: [1.08, 1.05, 1], uvs: 0.8 });
  }
  if (o.canopy) {
    // little shed roof on brackets
    const cw = w + 0.9, cd = 0.9, cy = h + (o.arch ? w / 2 + 0.35 : 0.35);
    b.box(o.canopy, pm(x, cy + 0.2, cd / 2, 0.5, 0, 0), cw, 0.08, cd + 0.1, { faces: { ny: M.timber }, uvs: 0.42 });
    for (const s of [-1, 1]) {
      b.box(M.timber, pm(x + s * (cw / 2 - 0.12), cy - 0.2, 0.4, -0.8, 0, 0), 0.09, 0.09, 0.8, { uv: 'grain' });
      b.box(M.timber, pm(x + s * (cw / 2 - 0.12), cy + 0.08, 0.35), 0.1, 0.1, 0.7, { uv: 'grain' });
    }
  }
}

// ------------------------------------------------------------------ hanging sign on a bracket
// sign hangs perpendicular to the wall (visible from along the street); y = bracket height
export function hangingSign(b, M, x, y, signIdx, size = 0.95, side = 1) {
  const L = size + 0.55;
  // wall plate + arm
  b.box(M.iron, pm(x, y, 0.03), 0.12, 0.34, 0.06);
  b.box(M.iron, pm(x, y, L / 2), 0.06, 0.06, L, {});
  // diagonal brace
  const dl = Math.hypot(0.5, 0.45);
  b.box(M.iron, pm(x, y - 0.22, 0.26, -Math.atan2(0.45, 0.5), 0, 0), 0.04, 0.04, dl, {});
  // curl
  b.geo(M.iron, U.torus(1, 0.18, 4, 12, Math.PI * 1.5), pm(x, y - 0.14, 0.42, 0, Math.PI / 2, 0, 0.12), {});
  b.geo(M.gold, U.sphere(6, 4), pm(x, y, L + 0.03, 0, 0, 0, 0.05), {});
  // rings
  const z0 = 0.35, z1 = 0.35 + size * 0.85;
  for (const zz of [z0, z1]) b.geo(M.iron, U.torus(1, 0.25, 4, 8), pm(x, y - 0.08, zz, 0, Math.PI / 2, 0, 0.06), {});
  // sign quad (single double-sided plane in the y-z plane)
  const [u0, v0, u1, v1] = signUV(signIdx);
  const zc = (z0 + z1) / 2, top = y - 0.13, bot = top - size;
  const hs = size / 2;
  const za = zc + hs, zb = zc - hs;
  b.quad(M.signs, V(x, bot, za), V(x, bot, zb), V(x, top, zb), V(x, top, za), [u0, v0], [u1, v0], [u1, v1], [u0, v1], [1, 1, 1], null, false);
}

// wall-mounted lantern
export function wallLantern(b, M, x, y, halos) {
  b.box(M.iron, pm(x, y, 0.04), 0.1, 0.24, 0.06);
  b.box(M.iron, pm(x, y + 0.05, 0.2), 0.04, 0.04, 0.34);
  b.geo(M.iron, U.frustum(0.2, 6), pm(x, y + 0.02, 0.36, 0, Math.PI / 6, 0, 0.16, 0.08, 0.16), {});
  b.geo(M.lamp, U.cyl(6), pm(x, y - 0.14, 0.36, 0, Math.PI / 6, 0, 0.1, 0.26, 0.1), { ao: false });
  b.geo(M.iron, U.coneCap(6), pm(x, y + 0.12, 0.36, 0, Math.PI / 6, 0, 0.16, 0.18, 0.16), {});
  b.geo(M.iron, U.frustum(1, 6), pm(x, y - 0.29, 0.36, 0, Math.PI / 6, 0, 0.12, 0.04, 0.12), {});
  if (halos) {
    const p = new THREE.Vector3(x, y - 0.14, 0.36).applyMatrix4(b.F);
    halos.push({ x: p.x, y: p.y, z: p.z, s: 1.3 });
  }
}

// striped awning over a shop window: width w, projecting depth d, at height y (top edge on wall)
export function awning(b, M, x, y, w, d, scheme = 0) {
  const drop = d * 0.55;
  const v0 = 1 - (scheme + 1) / 4 + 0.01, v1 = 1 - scheme / 4 - 0.01;
  const us = w / 0.9;
  b.quad(M.awning, V(x - w / 2, y - drop, d), V(x + w / 2, y - drop, d), V(x + w / 2, y, 0.02), V(x - w / 2, y, 0.02), [0, v0], [us, v0], [us, v1], [0, v1]);
  // scalloped valance
  const n = Math.max(3, Math.round(w / 0.3));
  for (let i = 0; i < n; i++) {
    const xa = x - w / 2 + (i / n) * w, xb = x - w / 2 + ((i + 1) / n) * w;
    const ua = (i / n) * us, ub = ((i + 1) / n) * us;
    b.quad(M.awning, V(xa, y - drop - 0.18, d), V(xb, y - drop - 0.18, d), V(xb, y - drop, d), V(xa, y - drop, d), [ua, v0], [ub, v0], [ub, v1], [ua, v1], [0.92, 0.92, 0.92], V(0, 0, 1));
    b.tri(M.awning, V(xa, y - drop - 0.18, d), V((xa + xb) / 2, y - drop - 0.3, d), V(xb, y - drop - 0.18, d), [ua, v0], [(ua + ub) / 2, v0], [ub, v0], [0.9, 0.9, 0.9], V(0, 0, 1));
  }
  // side triangles
  for (const s of [-1, 1]) {
    const xx = x + s * w / 2;
    if (s > 0) b.tri(M.awning, V(xx, y, 0.02), V(xx, y - drop, d), V(xx, y - drop - 0.18, d), [0, v1], [1, v0], [1.1, v0], [0.85, 0.85, 0.85]);
    else b.tri(M.awning, V(xx, y, 0.02), V(xx, y - drop - 0.18, d), V(xx, y - drop, d), [0, v1], [1.1, v0], [1, v0], [0.85, 0.85, 0.85]);
  }
  // iron rods
  for (const s of [-1, 1]) {
    const xx = x + s * (w / 2 - 0.05);
    const L = Math.hypot(d, drop);
    b.box(M.iron, pm(xx, y - drop / 2 - 0.03, d / 2, Math.atan2(drop, d), 0, 0), 0.03, 0.03, L);
  }
}

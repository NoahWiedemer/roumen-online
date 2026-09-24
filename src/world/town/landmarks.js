// Landmarks of the harbour town: lighthouse (with rotating beam), octagonal island pavilion,
// the stone exedra behind the teleport gate, the round tower, plus banner / flag helpers.
import * as THREE from 'three';
import { pm, U } from './builder.js';
import { windowAt, doorAt, wallLantern, PALETTE } from './parts.js';
import { coneRoof, pyramidRoof } from './roofs.js';
import { signUV, bannerUV } from './textures.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const LIGHT = [1.14, 1.1, 1.04];

// hanging banner quad in the current frame: top centre (x,y,z), facing +z (normal), w x h
export function banner(b, M, x, y, z, w, h, idx, rodMat) {
  const [u0, , u1] = bannerUV(idx);
  b.quad(M.banner, V3(x - w / 2, y - h, z), V3(x + w / 2, y - h, z), V3(x + w / 2, y, z), V3(x - w / 2, y, z), [u0, 0], [u1, 0], [u1, 1], [u0, 1], [1, 1, 1], V3(0, 0, 1), false);
  b.geo(rodMat || M.gold, U.cyl(8), pm(x, y + 0.03, z, 0, 0, Math.PI / 2, 0.035, w + 0.3, 0.035), {});
  for (const s of [-1, 1]) b.geo(rodMat || M.gold, U.sphere(6, 4), pm(x + s * (w / 2 + 0.17), y + 0.03, z, 0, 0, 0, 0.06), {});
}

// flag on a pole (pole base at x,y,z), flag attached along the pole, flying towards +x (local)
export function flagPole(b, M, x, y, z, rotY, h, idx, fw = 1.6, fh = 1.0) {
  b.push(pm(x, y, z, 0, rotY, 0));
  b.geo(M.cream, U.cyl(8), pm(0, h / 2, 0, 0, 0, 0, 0.05, h, 0.05), { color: [1.05, 1.03, 1], ao: false });
  b.geo(M.gold, U.sphere(8, 6), pm(0, h + 0.08, 0, 0, 0, 0, 0.1), { ao: false });
  const [u0, , u1] = bannerUV(idx);
  const top = h - 0.1;
  b.quad(M.banner, V3(0.05, top - fh, 0), V3(0.05 + fw, top - fh, 0), V3(0.05 + fw, top, 0), V3(0.05, top, 0), [u0, 1], [u0, 0], [u1, 0], [u1, 1], [1, 1, 1], V3(0, 0, 1), false);
  b.pop();
}

// ------------------------------------------------------------------ lighthouse
// tower centre (x,z), base platform top at y0. Returns the lantern position.
export function lighthouse(ctx, b, M, dyn, x, y0, z, faceRot) {
  b.push(pm(x, y0, z, 0, faceRot, 0));
  // stone foundation drum (reaches into the sea)
  b.geo(M.stone, U.cyl(28), pm(0, -3.2, 0, 0, 0, 0, 3.3, 6.8, 3.3), { uv: 'keep', uvScale: [8.6, 2.8] });
  b.geo(M.stone, U.cyl(28, true), pm(0, 0.05, 0, 0, 0, 0, 3.42, 0.3, 3.42), { uv: 'keep', uvScale: [9, 0.1], color: LIGHT });
  b.geo(M.plaza, U.circle(28), pm(0, 0.2, 0, 0, 0, 0, 3.4, 1, 3.4), { uv: 'frame', uvs: 1 / 3 });
  // tapered tower with red bands
  const H = 12.5;
  const prof = [[2.45, 0], [2.4, 0.5], [2.1, 4], [1.85, 8], [1.7, H]];
  b.geo(M.plaster, U.lathe('lh_tower', prof.map(([r, y]) => [r, y / H]), 24), pm(0, 0.2, 0, 0, 0, 0, 1, H, 1), { uv: 'keep', uvScale: [6, 4], color: [1.06, 1.05, 1.02] });
  const band = (y, h) => {
    const r0 = 2.45 - (y / H) * 0.75 + 0.03, r1 = 2.45 - ((y + h) / H) * 0.75 + 0.03;
    b.geo(M.color, U.frustum(r1 / r0, 24), pm(0, 0.2 + y + h / 2, 0, 0, 0, 0, r0, h, r0), { color: [0.85, 0.2, 0.2] });
  };
  band(2.6, 1.4); band(6.4, 1.4); band(10.0, 1.2);
  // stone plinth ring + door + small windows
  b.geo(M.stone, U.frustum(0.93, 24), pm(0, 0.2 + 0.6, 0, 0, 0, 0, 2.62, 1.2, 2.62), { uv: 'keep', uvScale: [6, 0.5], color: LIGHT });
  b.push(pm(0, 0.2, 2.42));
  doorAt(b, M, 0, 1.05, 2.0, { arch: true, col: [0.3, 0.45, 0.72], frameMat: M.stone, frameCol: LIGHT, step: 0.2 });
  b.pop();
  for (const [yy, a] of [[4.6, 0.4], [8.3, -2.4], [8.3, 1.2]]) {
    const r = 2.45 - (yy / H) * 0.75;
    b.push(pm(Math.sin(a) * r, 0.2, Math.cos(a) * r, 0, a, 0));
    windowAt(b, M, 0, yy, 0.45, 0.8, { lit: true, arch: true, mull: false });
    b.pop();
  }
  // gallery
  const gy = 0.2 + H;
  b.geo(M.stone, U.lathe('lh_corbel', [[1.7, 0], [2.0, 0.25], [2.5, 0.5], [2.6, 0.62], [0.001, 0.62]], 24), pm(0, gy - 0.4, 0), { uv: 'keep', uvScale: [6, 0.4], color: LIGHT });
  const rr = 2.45;
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    b.box(M.iron, pm(Math.sin(a) * rr, gy + 0.72, Math.cos(a) * rr), 0.05, 0.95, 0.05);
  }
  b.geo(M.iron, U.torus(1, 0.02, 4, 32), pm(0, gy + 1.2, 0, Math.PI / 2, 0, 0, rr), {});
  b.geo(M.iron, U.torus(1, 0.015, 4, 32), pm(0, gy + 0.7, 0, Math.PI / 2, 0, 0, rr), {});
  // lantern room
  b.geo(M.color, U.cyl(10), pm(0, gy + 0.4, 0, 0, 0, 0, 1.35, 0.35, 1.35), { color: [0.85, 0.2, 0.2] });
  b.geo(M.lamp, U.cyl(10, true), pm(0, gy + 1.35, 0, 0, 0, 0, 1.15, 1.6, 1.15), { ao: false });
  b.geo(M.gold, U.sphere(10, 8), pm(0, gy + 1.3, 0, 0, 0, 0, 0.55), { ao: false });
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    b.box(M.color, pm(Math.sin(a) * 1.17, gy + 1.35, Math.cos(a) * 1.17, 0, a, 0), 0.08, 1.65, 0.08, { color: [0.95, 0.95, 0.95] });
  }
  b.geo(M.roofRed, U.cyl(16, true), pm(0, gy + 2.2, 0, 0, 0, 0, 1.45, 0.14, 1.45), { uv: 'keep', uvScale: [3, 0.05], color: [0.8, 0.7, 0.7] });
  const tip = coneRoof(b, M, M.roofRed, 0, gy + 2.25, 0, 1.55, 2.2, {});
  // weather vane
  b.box(M.gold, pm(0.25, tip + 0.1, 0), 0.6, 0.03, 0.2, {});
  b.pop();
  const lantern = V3(0, gy + 1.35, 0).applyMatrix4(pm(x, y0, z, 0, faceRot, 0));
  dyn.halos.push({ x: lantern.x, y: lantern.y, z: lantern.z, s: 7 });
  ctx.colliders.addCircle(x, z, 2.7);
  ctx.minimap.addCircle(x, z, 2.6, '#f2eee6');
  // rotating beams (additive, separate mesh)
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff1c0, transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: true });
  const cone = new THREE.ConeGeometry(1.8, 26, 16, 1, true);
  cone.translate(0, -13, 0);
  cone.rotateZ(Math.PI / 2);
  const g = new THREE.Group();
  g.name = 'lighthouseBeam';
  for (const s of [1, -1]) {
    const m = new THREE.Mesh(cone, beamMat);
    m.rotation.y = s > 0 ? 0 : Math.PI;
    g.add(m);
  }
  g.position.copy(lantern);
  g.renderOrder = 6;
  ctx.scene.add(g);
  dyn.updaters.push((dt, t) => { g.rotation.y = t * 0.45; });
  return lantern;
}

// ------------------------------------------------------------------ octagonal pavilion (island centre)
export function octagonPavilion(ctx, b, M, dyn, x, y0, z, R) {
  b.push(pm(x, y0, z, 0, Math.PI / 8, 0));
  const n = 8;
  const corner = (i, r) => { const a = (i / n) * Math.PI * 2; return [Math.cos(a) * r, Math.sin(a) * r]; };
  // stepped octagonal platform
  for (const [r, h, y] of [[R + 1.2, 0.25, 0], [R + 0.6, 0.25, 0.25], [R, 0.3, 0.5]]) {
    b.geo(M.stone, U.cyl(8), pm(0, y + h / 2 - (y === 0 ? 0.2 : 0), 0, 0, 0, 0, r, h + (y === 0 ? 0.4 : 0), r), { uv: 'frame', uvs: 0.5, color: LIGHT });
  }
  b.geo(M.plaza, U.circle(8), pm(0, 0.81, 0, 0, 0, 0, R - 0.05, 1, R - 0.05), { uv: 'frame', uvs: 1 / 3 });
  const fy = 0.8, ch = 4.2;
  // columns at the corners + arches between them
  const cr = R - 0.45;
  for (let i = 0; i < n; i++) {
    const [px, pz] = corner(i, cr);
    b.geo(M.marble, U.lathe('col_base', [[0.001, 0], [0.42, 0], [0.42, 0.22], [0.32, 0.32], [0.28, 0.45], [0.001, 0.45]], 10), pm(px, fy, pz), { uv: 'keep' });
    b.geo(M.marble, U.cyl(12), pm(px, fy + ch / 2, pz, 0, 0, 0, 0.26, ch, 0.26), { uv: 'keep', uvScale: [1, 2] });
    b.geo(M.marble, U.lathe('col_cap', [[0.26, 0], [0.34, 0.12], [0.44, 0.24], [0.44, 0.36], [0.001, 0.36]], 10), pm(px, fy + ch - 0.1, pz), { uv: 'keep' });
    // arch to the next column
    const [qx, qz] = corner(i + 1, cr);
    const mx = (px + qx) / 2, mz = (pz + qz) / 2, span = Math.hypot(qx - px, qz - pz);
    const rot = Math.atan2(qx - px, qz - pz) + Math.PI / 2;
    b.push(pm(mx, fy + ch + 0.25, mz, 0, rot, 0));
    const ar = span / 2 - 0.3;
    for (let k = 0; k < 7; k++) {
      const a = ((k + 0.5) / 7) * Math.PI;
      b.box(M.stone, pm(Math.cos(a) * (ar + 0.2), -0.95 + Math.sin(a) * 0.9, 0, 0, 0, a - Math.PI / 2), 0.5, 0.36, 0.42, { color: LIGHT, uvs: 0.7 });
    }
    b.box(M.plaster, pm(0, 0.35, 0), span + 0.5, 0.7, 0.42, { uv: 'frame', uvs: 0.33, color: [1.04, 1.0, 0.94] });
    b.pop();
  }
  // entablature ring + roof
  b.geo(M.stone, U.cyl(8), pm(0, fy + ch + 1.05, 0, 0, 0, 0, R + 0.1, 0.35, R + 0.1), { uv: 'frame', uvs: 0.5, color: LIGHT });
  const apex = pyramidRoofN(b, M, M.roofBlue, 0, fy + ch + 1.2, 0, R + 0.6, 5.2, n);
  b.geo(M.gold, U.sphere(10, 8), pm(0, apex + 0.2, 0, 0, 0, 0, 0.3), {});
  b.geo(M.gold, U.coneCap(6), pm(0, apex + 0.9, 0, 0, 0, 0, 0.08, 1.0, 0.08), {});
  // hanging lantern in the centre + round bench
  b.box(M.iron, pm(0, fy + ch + 0.4, 0), 0.04, 1.3, 0.04);
  b.geo(M.lamp, U.frustum(1.3, 6), pm(0, fy + ch - 0.55, 0, 0, 0, 0, 0.25, 0.5, 0.25), { ao: false });
  b.geo(M.iron, U.coneCap(6), pm(0, fy + ch - 0.2, 0, 0, 0, 0, 0.34, 0.25, 0.34), {});
  b.geo(M.wood, U.cyl(16, true), pm(0, fy + 0.25, 0, 0, 0, 0, 1.6, 0.5, 1.6), { uv: 'keep', uvScale: [6, 0.3] });
  b.geo(M.wood, U.ring(0.7, 16), pm(0, fy + 0.5, 0, 0, 0, 0, 1.7, 1, 1.7), { uv: 'frame', uvs: 0.8 });
  b.geo(M.leaf, U.sphere(10, 8), pm(0, fy + 0.7, 0, 0, 0, 0, 1.0, 0.55, 1.0), { uv: 'keep', uvScale: [2, 1] });
  for (let i = 0; i < 12; i++) b.geo(M.color, U.ico(0), pm(Math.cos(i * 0.52) * 0.8, fy + 1.1 + (i % 3) * 0.06, Math.sin(i * 0.52) * 0.8, i, i, 0, 0.11), { color: PALETTE.flowers[i % 7], flat: true });
  b.pop();
  const lp = V3(x, y0 + fy + ch - 0.55, z);
  dyn.halos.push({ x: lp.x, y: lp.y, z: lp.z, s: 2.2 });
  // columns as colliders (the pavilion interior stays walkable)
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.PI / 8;
    // pm rotation is YXZ with ry=PI/8: local (cos a', sin a') -> world rotate by -PI/8 about y? use explicit transform
    const [px, pz] = corner(i, cr);
    const c = Math.cos(Math.PI / 8), s = Math.sin(Math.PI / 8);
    ctx.colliders.addCircle(x + px * c + pz * s, z - px * s + pz * c, 0.45);
  }
  ctx.colliders.addCircle(x, z, 1.8);
  ctx.minimap.addCircle(x, z, R + 0.6, '#3f6cc0');
  ctx.addNoScatter(x, z, R + 2);
}

// n-sided pyramid roof with thickness band
function pyramidRoofN(b, M, mat, cx, y, cz, R, h, n) {
  const apex = V3(cx, y + h, cz);
  const TS = 1 / 2.4;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
    const p0 = V3(cx + Math.cos(a0) * R, y, cz + Math.sin(a0) * R), p1 = V3(cx + Math.cos(a1) * R, y, cz + Math.sin(a1) * R);
    const ww = p0.distanceTo(p1), mid = p0.clone().add(p1).multiplyScalar(0.5), sl = mid.distanceTo(apex);
    const out = V3(mid.x - cx, 0, mid.z - cz).normalize().add(V3(0, 0.6, 0));
    b.triN(mat, p0, p1, apex, [0, 0], [ww * TS, 0], [ww * TS * 0.5, sl * TS], [1, 1, 1], out, false);
    const q0 = p0.clone(), q1 = p1.clone(); q0.y -= 0.2; q1.y -= 0.2;
    b.quadN(mat, q0, q1, p1, p0, [0, 0], [ww * TS, 0], [ww * TS, 0.06], [0, 0.06], [0.78, 0.68, 0.66], V3(mid.x - cx, 0, mid.z - cz), false);
    b.triN(M.timber, q0, q1, V3(cx, y - 0.2, cz), [0, 0], [1, 0], [0.5, 1], [0.7, 0.7, 0.7], V3(0, -1, 0), false);
    // hip ridge
    const dir = apex.clone().sub(p0).normalize(), L = p0.distanceTo(apex);
    const q = new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), dir);
    b.geo(mat, U.cyl(6), new THREE.Matrix4().compose(p0.clone().add(apex).multiplyScalar(0.5), q, V3(0.1, L, 0.1)), { uv: 'keep', uvScale: [0.3, L * TS], color: [0.78, 0.68, 0.66], ao: false });
  }
  return y + h;
}

// ------------------------------------------------------------------ exedra behind the teleport gate
// portal at (x,z) facing rotY; the half-ring wall stands behind it at radius R, leaving the front open
export function portalExedra(ctx, b, M, dyn, x, y0, z, rotY, R = 5.9) {
  const back = rotY + Math.PI; // direction behind the portal
  const span = 2.3; // half angle of the wall arc
  const n = 11;
  const H = 4.4;
  for (let i = 0; i < n; i++) {
    const a0 = back - span + (i / n) * span * 2, a1 = back - span + ((i + 1) / n) * span * 2;
    const am = (a0 + a1) / 2;
    const px = x + Math.sin(am) * R, pz = z + Math.cos(am) * R;
    const seg = R * (a1 - a0) + 0.05;
    const h = H + Math.cos((i - (n - 1) / 2) / ((n - 1) / 2) * Math.PI / 2) * 1.8; // taller in the middle
    b.box(M.stone, pm(px, y0 + h / 2 - 0.4, pz, 0, am, 0), seg, h + 0.4, 0.9, { uv: 'part', uvs: 0.42 });
    b.box(M.stone, pm(px, y0 + h + 0.08, pz, 0, am, 0), seg + 0.02, 0.2, 1.15, { uv: 'part', uvs: 0.6, color: LIGHT });
    if (i % 2 === 0) b.box(M.stone, pm(x + Math.sin(am) * (R - 0.5), y0 + h / 2, z + Math.cos(am) * (R - 0.5), 0, am, 0), 0.5, h, 0.2, { color: LIGHT, uvs: 0.6 });
    ctx.colliders.addBox(px, pz, seg / 2, 0.5, am);
  }
  // end pillars with braziers
  for (const s of [-1, 1]) {
    const a = back + s * (span + 0.08);
    const px = x + Math.sin(a) * R, pz = z + Math.cos(a) * R;
    b.box(M.stone, pm(px, y0 + 1.6, pz, 0, a, 0), 1.2, 3.6, 1.2, { uv: 'frame', uvs: 0.45, color: LIGHT });
    b.box(M.stone, pm(px, y0 + 3.5, pz, 0, a, 0), 1.45, 0.25, 1.45, { color: LIGHT });
    b.geo(M.iron, U.lathe('brazier', [[0.001, 0], [0.16, 0], [0.12, 0.15], [0.45, 0.45], [0.5, 0.52], [0.001, 0.4]], 10), pm(px, y0 + 3.62, pz), {});
    b.geo(M.ember, U.sphere(8, 5), pm(px, y0 + 4.08, pz, 0, 0, 0, 0.38, 0.18, 0.38), { ao: false });
    dyn.halos.push({ x: px, y: y0 + 4.3, z: pz, s: 3.2 });
    ctx.colliders.addCircle(px, pz, 0.85);
  }
  // crest over the back wall + inlaid floor ring
  const [u0, v0, u1, v1] = signUV(7);
  const bx = x + Math.sin(back) * (R - 0.47), bz = z + Math.cos(back) * (R - 0.47);
  b.push(pm(bx, y0 + H + 0.6, bz, 0, rotY, 0));
  b.quad(M.signs, V3(-0.9, -0.9, 0), V3(0.9, -0.9, 0), V3(0.9, 0.9, 0), V3(-0.9, 0.9, 0), [u0, v0], [u1, v0], [u1, v1], [u0, v1], [1, 1, 1], V3(0, 0, 1), false);
  b.pop();
  b.geo(M.stone, U.ring(0.9, 48), pm(x, y0 + 0.04, z, 0, 0, 0, R - 0.6, 1, R - 0.6), { uv: 'frame', uvs: 0.5, color: [1.2, 1.12, 1.06] });
  ctx.minimap.addCircle(x + Math.sin(back) * R, z + Math.cos(back) * R, 1.5, '#b8ae9c');
}

// ------------------------------------------------------------------ round tower
export function roundTower(ctx, b, M, dyn, x, y0, z, faceRot) {
  const R = 2.9, H = 11.5;
  b.push(pm(x, y0, z, 0, faceRot, 0));
  b.geo(M.stone, U.cyl(24), pm(0, H / 2 - 0.6, 0, 0, 0, 0, R, H + 1.2, R), { uv: 'keep', uvScale: [7.6, 4.8] });
  for (const yy of [0.3, 4.2, 8.1]) b.geo(M.stone, U.cyl(24, true), pm(0, yy, 0, 0, 0, 0, R + 0.06, 0.24, R + 0.06), { uv: 'keep', uvScale: [8, 0.1], color: LIGHT });
  b.geo(M.stone, U.lathe('tw_corbel', [[1.0, 0], [1.08, 0.2], [1.12, 0.5], [0.001, 0.5]], 24), pm(0, H - 0.6, 0, 0, 0, 0, R, 1, R), { uv: 'keep', uvScale: [8, 0.3], color: LIGHT });
  b.push(pm(0, 0, R - 0.02));
  doorAt(b, M, 0, 1.2, 2.1, { arch: true, col: [0.55, 0.32, 0.2], frameMat: M.stone, frameCol: LIGHT, step: 0.25 });
  wallLantern(b, M, 1.1, 2.3, dyn.halos);
  b.pop();
  for (const [yy, a] of [[5.0, 0.2], [5.0, 2.4], [8.8, -1.1], [8.8, 1.5], [5.0, -2.2]]) {
    b.push(pm(Math.sin(a) * (R - 0.02), 0, Math.cos(a) * (R - 0.02), 0, a, 0));
    windowAt(b, M, 0, yy, 0.55, 1.0, { lit: a === 0.2, arch: true, archStone: true, mull: false, box: yy < 6 ? PALETTE.flowers : null, rng: Math.random });
    b.pop();
  }
  b.push(pm(0, 0, R + 0.12));
  banner(b, M, 0, H - 1.2, 0, 1.2, 3.6, 0);
  b.pop();
  const tip = coneRoof(b, M, M.roofBlue, 0, H, 0, R + 0.55, 7.0, {});
  b.pop();
  flagPole(b, M, x, y0 + tip - 0.3, z, faceRot - Math.PI / 2, 2.4, 1, 1.4, 0.8);
  ctx.colliders.addCircle(x, z, R + 0.15);
  ctx.minimap.addCircle(x, z, R, '#3f6cc0');
  ctx.addNoScatter(x, z, R + 1.5);
}

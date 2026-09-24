// Roof builders: thick tiled gable roofs with ridge caps, barge boards and soffits,
// flared conical turret roofs, and gable-end triangles.
import * as THREE from 'three';
import { pm, U } from './builder.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const TS = 1 / 2.4; // tile texture repeats per metre

// Gable roof with the ridge along local x. Walls end at height y, eaves at z = zb / zf.
// Returns profile info so callers can place dormers/chimneys.
export function gableRoof(b, M, mat, o) {
  const p = o.pitch, tp = Math.tan(p), cp = Math.cos(p), sp = Math.sin(p);
  const ovE = o.ovE ?? 0.5, ovG = o.ovG ?? 0.4, t = o.t ?? 0.22;
  const ovG0 = o.ovG0 ?? ovG, ovG1 = o.ovG1 ?? ovG;
  const zc = (o.zb + o.zf) / 2, a = (o.zf - o.zb) / 2;
  const hr = a * tp;
  const xa = o.x0 - ovG0, xb = o.x1 + ovG1;
  const col = o.col || [1, 1, 1];
  const edge = [col[0] * 0.78, col[1] * 0.68, col[2] * 0.66];
  const P = (x, v) => V3(x, v.y, v.z);
  const rU = V3(0, o.y + hr, zc), rT = V3(0, o.y + hr + t / cp, zc);
  for (const sg of [1, -1]) {
    const eU = V3(0, o.y - ovE * tp, zc + sg * (a + ovE));
    const eT = V3(0, eU.y + t * cp, eU.z + sg * t * sp);
    const L = Math.hypot(rT.z - eT.z, rT.y - eT.y);
    const up = V3(0, cp, sg * sp);
    const uo = o.uo || 0;
    b.quadN(mat, P(xa, eT), P(xb, eT), P(xb, rT), P(xa, rT), [xa * TS + uo, 0], [xb * TS + uo, 0], [xb * TS + uo, L * TS], [xa * TS + uo, L * TS], col, up, false);
    // soffit (dark wood)
    const Lu = Math.hypot(rU.z - eU.z, rU.y - eU.y);
    b.quadN(M.timber, P(xa, eU), P(xb, eU), P(xb, rU), P(xa, rU), [xa * 0.6, 0], [xb * 0.6, 0], [xb * 0.6, Lu * 0.6], [xa * 0.6, Lu * 0.6], [0.8, 0.8, 0.8], up.clone().negate(), false);
    // eave edge (tile thickness)
    const down = V3(0, -sp, sg * cp);
    b.quadN(mat, P(xa, eU), P(xb, eU), P(xb, eT), P(xa, eT), [xa * TS, 0], [xb * TS, 0], [xb * TS, 0.06], [xa * TS, 0.06], edge, down, false);
    // gable edges
    if (!o.noGableEdge0) b.quadN(mat, P(xa, eU), P(xa, eT), P(xa, rT), P(xa, rU), [0, 0], [0.06, 0], [0.06, L * TS], [0, L * TS], edge, V3(-1, 0, 0), false);
    if (!o.noGableEdge1) b.quadN(mat, P(xb, eU), P(xb, eT), P(xb, rT), P(xb, rU), [0, 0], [0.06, 0], [0.06, L * TS], [0, L * TS], edge, V3(1, 0, 0), false);
    // barge boards under the gable overhang
    if (o.barge !== false) {
      const dz = rU.z - eU.z, dy = rU.y - eU.y;
      const th = Math.atan2(-dy, dz);
      const mz = (eU.z + rU.z) / 2 - up.z * 0.12, my = (eU.y + rU.y) / 2 - up.y * 0.12;
      const bc = o.bargeCol || [1, 1, 1];
      if (!o.noBarge0) b.box(M.timber, pm(xa + 0.06, my, mz, th, 0, 0), 0.08, 0.26, Lu, { uv: 'grain', color: bc, ao: false });
      if (!o.noBarge1) b.box(M.timber, pm(xb - 0.06, my, mz, th, 0, 0), 0.08, 0.26, Lu, { uv: 'grain', color: bc, ao: false });
    }
  }
  // ridge cap + end knobs
  if (o.ridge !== false) {
    const len = xb - xa + 0.08;
    b.geo(mat, U.cyl(8), pm((xa + xb) / 2, rT.y - 0.03, zc, 0, 0, Math.PI / 2, 0.17, len, 0.17), { uv: 'keep', uvScale: [0.5, len * TS], color: edge, ao: false });
    if (o.knobs !== false) {
      for (const xx of [xa - 0.04, xb + 0.04]) b.geo(mat, U.sphere(8, 6), pm(xx, rT.y + 0.02, zc, 0, 0, 0, 0.21), { uv: 'keep', uvScale: [0.5, 0.3], color: edge, ao: false });
    }
  }
  return {
    zc, a, hr, tp, ridgeTop: rT.y, xa, xb,
    // height of the roof top surface at z (front/back slope)
    topAt: (z) => rT.y - Math.abs(z - zc) * tp,
  };
}

// Gable triangle wall in a facade frame (plane z=0, base centred at x=cx, y=y0)
export function gableTri(b, mat, cx, y0, hw, h, col, uvs = 0.33) {
  const a = V3(cx - hw, y0, 0), c = V3(cx + hw, y0, 0), t = V3(cx, y0 + h, 0);
  b.triN(mat, a, c, t, [(cx - hw) * uvs, y0 * uvs], [(cx + hw) * uvs, y0 * uvs], [cx * uvs, (y0 + h) * uvs], col, V3(0, 0, 1));
}

// timber decoration on a gable triangle (facade frame)
export function gableTimber(b, M, cx, y0, hw, h, tc, withWindow) {
  const tw = 0.2, z = 0.035;
  const box = (x, y, w, hh, rz = 0, dz = 0) => b.box(M.timber, pm(x, y, z + dz, 0, 0, rz), w, hh, 0.07, { uv: 'grain', color: tc, skip: ['nz'] });
  box(cx, y0 + tw / 2, hw * 2, tw);
  const yc = y0 + h * 0.42;
  const wc = hw * 2 * (1 - 0.42) - 0.3;
  box(cx, yc, wc, tw * 0.9);
  // king post above collar
  box(cx, (yc + y0 + h) / 2 - 0.15, tw, y0 + h - yc - 0.3);
  // struts
  const sl = Math.hypot(wc * 0.28, h * 0.3);
  const sa = Math.atan2(h * 0.3, wc * 0.28);
  box(cx - wc * 0.16, yc + h * 0.14, sl, 0.16, sa, 0.004);
  box(cx + wc * 0.16, yc + h * 0.14, sl, 0.16, -sa, 0.004);
  if (!withWindow) {
    // posts below collar
    for (const s of [-1, 1]) box(cx + s * hw * 0.45, (y0 + yc) / 2, tw, yc - y0 - 0.1);
    box(cx, (y0 + yc) / 2, tw, yc - y0 - 0.1);
  }
  return yc;
}

// conical turret roof with flared eave (centre cx,cz; base at y; radius R; height Hc)
const CONE_PROFILE = [[1.0, 0], [0.8, 0.12], [0.58, 0.33], [0.36, 0.58], [0.18, 0.8], [0.06, 0.95], [0.0, 1.0]];
export function coneRoof(b, M, mat, cx, y, cz, R, Hc, o = {}) {
  const unit = U.lathe('cone', CONE_PROFILE, 18);
  const slant = Math.hypot(R, Hc) * 1.05;
  const col = o.col || [1, 1, 1];
  const edge = [col[0] * 0.78, col[1] * 0.68, col[2] * 0.66];
  b.geo(mat, unit, pm(cx, y, cz, 0, 0, 0, R, Hc, R), { uv: 'keep', uvScale: [Math.round(2 * Math.PI * R * TS * 1.2), slant * TS], color: col, ao: false });
  b.geo(mat, U.cyl(18, true), pm(cx, y - 0.07, cz, 0, 0, 0, R, 0.14, R), { uv: 'keep', uvScale: [Math.round(2 * Math.PI * R * TS), 0.05], color: edge, ao: false });
  b.geo(M.timber, U.circle(18), pm(cx, y - 0.14, cz, 0, 0, 0, R, -1, R), { uv: 'frame', uvs: 0.6, color: [0.8, 0.8, 0.8], ao: false });
  // finial
  const top = y + Hc;
  b.geo(M.gold, U.sphere(8, 6), pm(cx, top + 0.1, cz, 0, 0, 0, 0.14), { ao: false });
  b.geo(M.gold, U.coneCap(6), pm(cx, top + 0.5, cz, 0, 0, 0, 0.06, 0.7, 0.06), { ao: false });
  b.geo(M.gold, U.sphere(6, 4), pm(cx, top + 0.3, cz, 0, 0, 0, 0.08), { ao: false });
  return top + 0.85;
}

// square pyramid roof (4 slopes) centred at cx,cz; half size hx,hz; base y; height h
export function pyramidRoof(b, M, mat, cx, y, cz, hx, hz, h, o = {}) {
  const col = o.col || [1, 1, 1];
  const edge = [col[0] * 0.78, col[1] * 0.68, col[2] * 0.66];
  const apex = V3(cx, y + h, cz);
  const c = [V3(cx - hx, y, cz + hz), V3(cx + hx, y, cz + hz), V3(cx + hx, y, cz - hz), V3(cx - hx, y, cz - hz)];
  for (let i = 0; i < 4; i++) {
    const a = c[i], bb = c[(i + 1) % 4];
    const ww = a.distanceTo(bb);
    const mid = a.clone().add(bb).multiplyScalar(0.5);
    const sl = mid.distanceTo(apex);
    const out = V3(mid.x - cx, 0, mid.z - cz).normalize().add(V3(0, 0.5, 0));
    b.triN(mat, a, bb, apex, [0, 0], [ww * TS, 0], [ww * TS * 0.5, sl * TS], col, out, false);
    // thickness band
    const a2 = a.clone(), b2 = bb.clone(); a2.y -= 0.16; b2.y -= 0.16;
    b.quadN(mat, a2, b2, bb, a, [0, 0], [ww * TS, 0], [ww * TS, 0.05], [0, 0.05], edge, V3(mid.x - cx, 0, mid.z - cz), false);
  }
  b.quadN(M.timber, V3(cx - hx, y - 0.16, cz + hz), V3(cx + hx, y - 0.16, cz + hz), V3(cx + hx, y - 0.16, cz - hz), V3(cx - hx, y - 0.16, cz - hz), [0, 0], [1, 0], [1, 1], [0, 1], [0.7, 0.7, 0.7], V3(0, -1, 0), false);
  // ridges along the hips
  for (const cc of c) {
    const L = cc.distanceTo(apex);
    const mid = cc.clone().add(apex).multiplyScalar(0.5);
    const dir = apex.clone().sub(cc).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), dir);
    const m = new THREE.Matrix4().compose(mid, q, V3(0.12, L, 0.12));
    b.geo(mat, U.cyl(6), m, { uv: 'keep', uvScale: [0.3, L * TS], color: edge, ao: false });
  }
  return y + h;
}

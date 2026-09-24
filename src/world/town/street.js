// Town-band dressing: shop extras, street lamps + pennant garlands along the main street, the
// retaining wall at the foot of the northern cliff, the stone step between town and plaza,
// the grand east staircase, ramp entrance pillars and planters / benches in open squares.
import * as THREE from 'three';
import { pm, U } from './builder.js';
import { PALETTE, hangingSign, wallLantern } from './parts.js';
import { lampPost, barrel, barrelLying, crate, sack, bench, armorStand, shield, clutter, flowerClump, well } from './props.js';
import { flowerPot } from './house.js';
import { isoLines, simplify, resample, polyLength } from './contour.js';
import { distToObb } from './plan.js';
import { banner, flagPole } from './landmarks.js';
import { RAMPS, PORTALS, Z, zoneAt } from '../layout.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const LIGHT = [1.14, 1.1, 1.04];

// local (house frame at ground floor level) -> world
export function houseToWorld(S, lx, lz) {
  const c = Math.cos(S.rotY), s = Math.sin(S.rotY);
  return [S.x + lx * c + lz * s, S.z - lx * s + lz * c];
}

// ------------------------------------------------------------------ per-house extras
export function dressHouse(ctx, b, M, S, dyn, occ, rng) {
  const T = ctx.terrain;
  const nb = Math.max(2, Math.round(S.w / 2.05));
  const bw = S.w / nb;
  const doorX = S.glb ? 0 : -S.w / 2 + (S.doorBay + 0.5) * bw;
  const front = S.d / 2;
  b.resetFrame();
  const at = (lx, lz) => houseToWorld(S, lx, lz);
  const tryPut = (lx, lz, r, fn) => {
    const [x, z] = at(lx, lz);
    if (!occ.free(x, z, r, { houseMargin: -0.1, paths: true, pathPad: 0.1 })) return false;
    fn(x, T.heightAt(x, z) - 0.02, z);
    ctx.colliders.addCircle(x, z, r * 0.8);
    occ.reserve(x, z, r);
    return true;
  };
  const side = doorX < 0 ? 1 : -1; // free side of the facade
  if (S.kind === 'armor') {
    tryPut(side * S.w * 0.22, front + 0.55, 0.5, (x, y, z) => armorStand(b, M, x, y, z, S.rotY));
    tryPut(side * S.w * 0.38, front + 0.55, 0.5, (x, y, z) => armorStand(b, M, x, y, z, S.rotY, [1.7, 1.5, 1.2]));
    b.push(pm(S.x, S.floorY, S.z, 0, S.rotY, 0));
    shield(b, M, doorX + side * 1.05, 1.5, front + 0.12, 0, 0, [0.85, 0.3, 0.3]);
    b.pop();
  } else if (S.kind === 'potion') {
    tryPut(doorX + side * 1.2, front + 0.45, 0.5, (x, y, z) => {
      b.push(pm(x, y, z, 0, S.rotY, 0));
      crate(b, M, 0, 0, 0, 0.1, 0.62);
      const bc = [[0.9, 0.2, 0.3], [0.3, 0.45, 0.95], [0.3, 0.8, 0.4], [0.95, 0.75, 0.2]];
      for (let i = 0; i < 6; i++) {
        const bx = -0.18 + (i % 3) * 0.18, bz = -0.1 + Math.floor(i / 3) * 0.2;
        b.geo(M.color, U.sphere(8, 6), pm(bx, 0.72, bz, 0, 0, 0, 0.075), { color: bc[i % 4] });
        b.geo(M.color, U.cyl(6), pm(bx, 0.82, bz, 0, 0, 0, 0.025, 0.1, 0.025), { color: [0.85, 0.95, 1] });
      }
      b.pop();
    });
    tryPut(doorX + side * 2.0, front + 0.4, 0.42, (x, y, z) => barrel(b, M, x, y, z, 0.4, 0.95, { apples: [0.9, 0.2, 0.2] }));
  } else if (S.kind === 'storage') {
    for (const lx of [doorX - 2.2, doorX + 2.2]) {
      if (Math.abs(lx) > S.w / 2 - 0.4) continue;
      tryPut(lx, front + 0.55, 0.75, (x, y, z) => {
        crate(b, M, x, y, z, S.rotY + 0.1, 0.8);
        crate(b, M, x, y + 0.8, z, S.rotY - 0.2, 0.6, { col: [1.1, 1, 0.9] });
      });
    }
  } else if (S.kind === 'inn') {
    tryPut(doorX + side * 2.2, front + 0.45, 0.95, (x, y, z) => bench(b, M, x, y, z, S.rotY));
    tryPut(doorX - side * 1.8, front + 0.4, 0.42, (x, y, z) => barrel(b, M, x, y, z, 0));
  } else if (S.kind === 'bakery') {
    tryPut(doorX + side * 1.8, front + 0.45, 0.8, (x, y, z) => bench(b, M, x, y, z, S.rotY, { len: 1.5 }));
  } else if (rng() < (S.glb ? 0.7 : 0.35)) {
    const lx = side * (S.w / 2 - 0.6);
    tryPut(lx, front + 0.5, 0.8, (x, y, z) => clutter(b, M, x, y, z, S.rotY, rng, T));
  }
  if (S.glb) {
    // flower pots either side of the model's door
    for (const s of [-1, 1]) tryPut(s * 1.3, front + 0.35, 0.35, (x, y, z) => flowerPot(b, M, x, z, rng, 1.1, y));
  }
}

// ------------------------------------------------------------------ pennant garlands
const FLAG_COLS = [[1.1, 0.12, 0.12], [1.15, 0.85, 0.08], [0.12, 0.4, 1.15], [0.15, 0.85, 0.25], [1.15, 0.35, 0.7], [1.15, 1.15, 1.15], [1.15, 0.5, 0.05], [0.55, 0.25, 1.1]];
export function garland(b, M, A, B, sag, rng, spacing = 0.44) {
  const pts = [];
  const L0 = A.distanceTo(B);
  const n = Math.max(4, Math.ceil(L0 / 0.35));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push(V3(A.x + (B.x - A.x) * t, A.y + (B.y - A.y) * t - 4 * sag * t * (1 - t), A.z + (B.z - A.z) * t));
  }
  const lens = [0];
  for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const L = lens[lens.length - 1];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], c = pts[i + 1];
    const mid = a.clone().add(c).multiplyScalar(0.5);
    const dir = c.clone().sub(a);
    const len = dir.length();
    const q = new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), dir.normalize());
    b.geo(M.rope, U.cyl(4), new THREE.Matrix4().compose(mid, q, V3(0.02, len + 0.01, 0.02)), { ao: false });
  }
  const at = (d) => {
    let i = 1;
    while (i < lens.length - 1 && lens[i] < d) i++;
    const t = (d - lens[i - 1]) / (lens[i] - lens[i - 1] || 1);
    return [pts[i - 1].clone().lerp(pts[i], t), pts[i].clone().sub(pts[i - 1]).normalize()];
  };
  let k = Math.floor(rng() * FLAG_COLS.length);
  for (let d = 0.35; d < L - 0.3; d += spacing) {
    const [p, tan] = at(d);
    const fw = 0.17, fh = 0.46;
    const a = p.clone().addScaledVector(tan, -fw), c = p.clone().addScaledVector(tan, fw);
    const tip = p.clone().add(V3(0, -fh, 0));
    const nrm = new THREE.Vector3().crossVectors(tan, V3(0, -1, 0)).normalize();
    b.triN(M.pennant, a, c, tip, [0, 1], [1, 1], [0.5, 0], FLAG_COLS[k++ % FLAG_COLS.length], nrm, false);
  }
}

// ------------------------------------------------------------------ main street lamps + garlands, lane lamps
export function streetLamps(ctx, b, M, dyn, occ, rng) {
  const T = ctx.terrain;
  const street = T.paths[0];
  const S = street.samples, len = S[S.length - 1].s;
  const off = street.width / 2 + 0.85;
  let pairs = 0;
  for (let s = 6; s < len - 4; s += 15) {
    const p = S[Math.round((s / len) * (S.length - 1))];
    const nx = -p.tz, nz = p.tx;
    const pos = [-1, 1].map((sd) => [p.x + nx * sd * off, p.z + nz * sd * off]);
    const ok = pos.map(([x, z]) => occ.free(x, z, 0.45, { paths: true, pathPad: -0.05 }) && zoneAt(x, z) === Z.TOWN);
    const tops = [];
    pos.forEach(([x, z], i) => {
      if (!ok[i]) return;
      const y = T.heightAt(x, z);
      lampPost(b, M, x, y, z, Math.atan2(-nx * (i ? 1 : -1), -nz * (i ? 1 : -1)), dyn.halos, { h: 3.8 });
      ctx.colliders.addCircle(x, z, 0.25);
      occ.reserve(x, z, 0.7);
      tops.push(V3(x, y + 4.1, z));
    });
    if (tops.length === 2) { garland(b, M, tops[0], tops[1], 1.0, rng); pairs++; }
  }
  // lanes: single lamps
  for (const lane of [T.paths[2], T.paths[1], T.paths[3]]) {
    const L = lane.samples, ll = L[L.length - 1].s;
    let sd = 1;
    for (let s = 8; s < ll - 4; s += 17) {
      const p = L[Math.round((s / ll) * (L.length - 1))];
      const nx = -p.tz * sd, nz = p.tx * sd;
      const x = p.x + nx * (lane.width / 2 + 0.75), z = p.z + nz * (lane.width / 2 + 0.75);
      sd = -sd;
      if (zoneAt(x, z) !== Z.TOWN && zoneAt(x, z) !== Z.SAND) continue;
      if (T.heightAt(x, z) > 2.5 || T.heightAt(x, z) < 1.6) continue;
      if (!occ.free(x, z, 0.45, { paths: true, pathPad: -0.05 })) continue;
      lampPost(b, M, x, T.heightAt(x, z), z, 0, dyn.halos);
      ctx.colliders.addCircle(x, z, 0.25);
      occ.reserve(x, z, 0.7);
    }
  }
  return pairs;
}

// ------------------------------------------------------------------ retaining wall at the foot of the cliff
export function cliffWall(ctx, b, M, dyn, occ) {
  const T = ctx.terrain;
  const pathGap = occ.pathGap;
  const lines = isoLines((x, z) => T.heightAt(x, z), [-118, -64, 100, 6], 3.2, 0.5);
  const ramps = RAMPS.map((r) => r);
  const nearRamp = (x, z) => ramps.some((r) => {
    for (let i = 0; i < r.pts.length - 1; i++) {
      const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1];
      const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
      const u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
      if (Math.hypot(x - ax - dx * u, z - az - dz * u) < r.width / 2 + (r.kind === 'stairs' ? 3 : 7.8)) return true;
    }
    return false;
  });
  const grad = (x, z) => {
    const e = 1.0;
    const gx = T.heightAt(x + e, z) - T.heightAt(x - e, z), gz = T.heightAt(x, z + e) - T.heightAt(x, z - e);
    const l = Math.hypot(gx, gz) || 1;
    return [gx / l, gz / l];
  };
  let segs = 0;
  b.resetFrame();
  for (const line of lines) {
    if (polyLength(line) < 6) continue;
    const S = resample(simplify(line, 0.35), 1.6);
    // per-sample wall top (smoothed)
    const info = S.map((p) => {
      const [gx, gz] = grad(p.x, p.z);
      const up = T.heightAt(p.x + gx * 3, p.z + gz * 3), down = T.heightAt(p.x - gx * 2.5, p.z - gz * 2.5);
      const okp = up > 4.6 && down < 2.5 && down > 1.5 && !nearRamp(p.x, p.z) && !PORTALS.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 7);
      // keep lanes / streets fully walkable: slide the wall face uphill if needed
      let push = 0;
      for (let k = 0; k < 12; k++) {
        const g = pathGap(p.x - gx * 0.35 + gx * push, p.z - gz * 0.35 + gz * push).gap;
        if (g >= 0.1) break;
        push += 0.3;
      }
      const px = p.x + gx * push, pz = p.z + gz * push;
      return { ...p, x: px, z: pz, gx, gz, top: Math.min(7.6, Math.max(3.8, T.heightAt(px + gx * 2.2, pz + gz * 2.2) + 0.4)), down, ok: okp && push < 3.4 };
    });
    for (let i = 0; i < info.length; i++) {
      let s = 0, n = 0;
      for (let k = -2; k <= 2; k++) { const q = info[i + k]; if (q) { s += q.top; n++; } }
      info[i].st = Math.round((s / n) / 0.35) * 0.35;
    }
    let run = [];
    const flushRun = () => {
      if (run.length >= 2) {
        const a = run[0], c = run[run.length - 1];
        const mx = (a.x + c.x) / 2, mz = (a.z + c.z) / 2, L = Math.hypot(c.x - a.x, c.z - a.z);
        const gx = (a.gx + c.gx) / 2, gz = (a.gz + c.gz) / 2;
        ctx.colliders.addBox(mx + gx * 0.8, mz + gz * 0.8, L / 2 + 0.3, 1.2, Math.atan2(c.x - a.x, c.z - a.z) + Math.PI / 2);
      }
      run = [];
    };
    for (let i = 0; i < info.length - 1; i++) {
      const a = info[i], c = info[i + 1];
      if (!a.ok || !c.ok) { flushRun(); continue; }
      const mx = (a.x + c.x) / 2, mz = (a.z + c.z) / 2;
      const gx = (a.gx + c.gx) / 2, gz = (a.gz + c.gz) / 2;
      const L = Math.hypot(c.x - a.x, c.z - a.z) + 0.1;
      const rot = Math.atan2(c.x - a.x, c.z - a.z);
      const top = Math.max(a.st, c.st);
      const bot = Math.min(a.down, c.down) - 0.5;
      const fx = mx - gx * 0.35, fz = mz - gz * 0.35; // face slightly in front of the contour
      const cx = fx + gx * 1.2, cz = fz + gz * 1.2;
      b.box(M.stone, pm(cx, (top + bot) / 2, cz, 0, rot, 0), 2.4, top - bot, L, { uv: 'part', uvs: 0.42, color: [0.96, 0.94, 0.9] });
      b.box(M.stone, pm(fx + gx * 0.35, top + 0.1, fz + gz * 0.35, 0, rot, 0), 1.0, 0.2, L + 0.04, { uv: 'part', uvs: 0.9, color: LIGHT });
      segs++;
      run.push(a);
      if (run.length >= 4) { run.push(c); flushRun(); run.push(c); }
      if (segs % 5 === 0) b.box(M.stone, pm(fx - gx * 0.2, (top - 0.4 + bot) / 2, fz - gz * 0.2, 0, rot, 0), 0.7, top - 0.4 - bot, 1.0, { uv: 'part', uvs: 0.45, color: [1.03, 1.01, 0.97] });
      if (segs % 11 === 6) {
        b.push(pm(fx - gx * 0.02, a.down, fz - gz * 0.02, 0, Math.atan2(-gx, -gz), 0));
        wallLantern(b, M, 0, 2.8, dyn.halos);
        b.pop();
      }
      if (segs % 4 === 1) {
        // ivy draping over the top
        b.geo(M.leaf, U.sphere(8, 6), pm(fx - gx * 0.05, top - 0.55, fz - gz * 0.05, 0, rot, 0, 0.3, 0.9, 1.1), { uv: 'keep', uvScale: [1.5, 1.5], color: [0.9, 1.0, 0.85] });
        b.geo(M.leaf, U.sphere(8, 6), pm(fx + gx * 0.5, top + 0.02, fz + gz * 0.5, 0, rot, 0, 0.75, 0.18, 1.5), { uv: 'keep', uvScale: [1.5, 1], color: [0.95, 1.05, 0.9] });
      }
    }
    flushRun();
  }
  return segs;
}

// ------------------------------------------------------------------ stone step where the town (2.2) drops to the plaza (1.8)
export function townStep(ctx, b, M, houses) {
  const T = ctx.terrain;
  const lines = isoLines((x, z) => T.heightAt(x, z), [-112, -22, 100, 34], 2.0, 0.5);
  const grad = (x, z) => {
    const e = 1.0;
    const gx = T.heightAt(x + e, z) - T.heightAt(x - e, z), gz = T.heightAt(x, z + e) - T.heightAt(x, z - e);
    const l = Math.hypot(gx, gz) || 1;
    return [gx / l, gz / l];
  };
  b.resetFrame();
  let n = 0;
  for (const line of lines) {
    if (polyLength(line) < 3) continue;
    const S = resample(simplify(line, 0.2), 1.2);
    for (let i = 0; i < S.length - 1; i++) {
      const a = S[i], c = S[i + 1];
      const mx = (a.x + c.x) / 2, mz = (a.z + c.z) / 2;
      const [gx, gz] = grad(mx, mz); // towards the town (higher)
      const up = T.heightAt(mx + gx * 1.6, mz + gz * 1.6), dn = T.heightAt(mx - gx * 1.6, mz - gz * 1.6);
      if (up < 2.12 || up > 2.4 || dn < 1.7 || dn > 1.9) continue;
      if (houses.some((h) => distToObb(h.obb, mx, mz) < 0.4)) continue;
      const L = Math.hypot(c.x - a.x, c.z - a.z) + 0.06;
      const rot = Math.atan2(c.x - a.x, c.z - a.z);
      b.box(M.stone, pm(mx + gx * 0.15, 1.9, mz + gz * 0.15, 0, rot, 0), 0.6, 0.62, L, { uv: 'part', uvs: 0.8, color: LIGHT, faces: { py: M.plaza } });
      b.box(M.stone, pm(mx - gx * 0.42, 1.8, mz - gz * 0.42, 0, rot, 0), 0.6, 0.42, L, { uv: 'part', uvs: 0.8, color: [1.08, 1.05, 1.0], faces: { py: M.plaza } });
      n++;
    }
  }
  return n;
}

// ------------------------------------------------------------------ grand east staircase (plaza -> grassy loop)
export function eastStairs(ctx, b, M, dyn, occ, rng) {
  const T = ctx.terrain;
  const R = RAMPS.find((r) => r.kind === 'stairs');
  const pts = R.pts;
  const S = resample(pts, 0.3);
  const W = R.width;
  b.resetFrame();
  // centreline heights, quantised into steps
  const hs = S.map((p) => T.heightAt(p.x, p.z));
  let runStart = 0;
  const stepH = (h) => Math.round(h / 0.19) * 0.19;
  const flush = (i0, i1) => {
    const a = S[i0], c = S[i1];
    const mx = (a.x + c.x) / 2, mz = (a.z + c.z) / 2;
    const L = Math.hypot(c.x - a.x, c.z - a.z) + 0.3;
    const rot = Math.atan2(c.x - a.x, c.z - a.z);
    const top = stepH(hs[i0]);
    b.box(M.stone, pm(mx, top - 0.9, mz, 0, rot, 0), W + 0.3, 1.8, L, { uv: 'part', uvs: 0.6, color: LIGHT, faces: { py: M.plaza } });
  };
  for (let i = 1; i < S.length; i++) {
    if (stepH(hs[i]) !== stepH(hs[runStart]) || i === S.length - 1) { flush(runStart, Math.max(runStart, i - 1)); runStart = i; }
  }
  // balustrades on both sides following the steps
  for (const side of [-1, 1]) {
    const P = S.map((p, i) => ({ x: p.x + p.tz * side * (W / 2 + 0.35), z: p.z - p.tx * side * (W / 2 + 0.35), y: hs[i] }));
    for (let i = 0; i < P.length - 3; i += 3) {
      const a = P[i], c = P[i + 3];
      const mx = (a.x + c.x) / 2, mz = (a.z + c.z) / 2, L = Math.hypot(c.x - a.x, c.z - a.z) + 0.05;
      const rot = Math.atan2(c.x - a.x, c.z - a.z);
      const y = (a.y + c.y) / 2;
      b.box(M.stone, pm(mx, y - 0.2, mz, -Math.atan2(c.y - a.y, L), rot, 0), 0.55, 2.4, L, { uv: 'part', uvs: 0.45 });
      b.box(M.marble, pm(mx, y + 1.02, mz, -Math.atan2(c.y - a.y, L), rot, 0), 0.7, 0.12, L + 0.02, { uv: 'part', uvs: 0.6 });
      ctx.colliders.addBox(mx, mz, 0.32, L / 2, rot);
      if (i % 12 === 0) {
        b.box(M.stone, pm(a.x, a.y + 0.55, a.z, 0, rot, 0), 0.85, 1.3, 0.85, { color: LIGHT, uvs: 0.6 });
        b.box(M.stone, pm(a.x, a.y + 1.25, a.z, 0, rot, 0), 1.0, 0.14, 1.0, { color: LIGHT });
        if (i % 24 === 0) {
          lanternOnPost(b, M, a.x, a.y + 1.32, a.z, dyn);
        } else b.geo(M.marble, U.lathe('urn', [[0.001, 0], [0.2, 0], [0.14, 0.12], [0.26, 0.38], [0.3, 0.5], [0.001, 0.5]], 12), pm(a.x, a.y + 1.32, a.z), { uv: 'keep' });
      }
    }
  }
  // big pedestals with banners at the foot, flag pillars at the top
  const p0 = S[0], pN = S[S.length - 1];
  for (const side of [-1, 1]) {
    const x = p0.x + p0.tz * side * (W / 2 + 0.9) - p0.tx * 0.6, z = p0.z - p0.tx * side * (W / 2 + 0.9) - p0.tz * 0.6;
    const y = T.heightAt(x, z);
    b.box(M.stone, pm(x, y + 1.1, z, 0, Math.atan2(p0.tx, p0.tz), 0), 1.5, 2.6, 1.5, { uv: 'frame', uvs: 0.45, color: LIGHT });
    b.box(M.stone, pm(x, y + 2.45, z, 0, Math.atan2(p0.tx, p0.tz), 0), 1.75, 0.2, 1.75, { color: LIGHT });
    lanternOnPost(b, M, x, y + 2.55, z, dyn, 1.2);
    b.push(pm(x, y, z, 0, Math.atan2(-p0.tx, -p0.tz), 0));
    banner(b, M, 0, 2.3, 0.77, 1.0, 2.0, side > 0 ? 0 : 1);
    b.pop();
    ctx.colliders.addBox(x, z, 0.8, 0.8, Math.atan2(p0.tx, p0.tz));
    occ.reserve(x, z, 1.4);
    const tx = pN.x + pN.tz * side * (W / 2 + 0.8), tz = pN.z - pN.tx * side * (W / 2 + 0.8);
    const ty = T.heightAt(tx, tz);
    b.box(M.stone, pm(tx, ty + 0.9, tz, 0, Math.atan2(pN.tx, pN.tz), 0), 1.2, 2.2, 1.2, { uv: 'frame', uvs: 0.45, color: LIGHT });
    flagPole(b, M, tx, ty + 2.0, tz, Math.atan2(pN.tx, pN.tz) + Math.PI / 2 * side, 4.5, side > 0 ? 0 : 3, 1.6, 1.0);
    ctx.colliders.addCircle(tx, tz, 0.8);
  }
  ctx.minimap.addRect((pts[0][0] + pts[2][0]) / 2, (pts[0][1] + pts[2][1]) / 2, W, polyLength(pts), Math.atan2(pts[2][0] - pts[0][0], pts[2][1] - pts[0][1]), '#e6ded0');
}

function lanternOnPost(b, M, x, y, z, dyn, s = 1) {
  b.geo(M.cream, U.cyl(8), pm(x, y + 0.35 * s, z, 0, 0, 0, 0.06 * s, 0.7 * s, 0.06 * s), { color: [1.08, 1.05, 0.98] });
  b.geo(M.lamp, U.frustum(1.25, 6), pm(x, y + 0.92 * s, z, 0, Math.PI / 6, 0, 0.16 * s, 0.42 * s, 0.16 * s), { ao: false });
  b.geo(M.cream, U.coneCap(6), pm(x, y + 1.27 * s, z, 0, Math.PI / 6, 0, 0.24 * s, 0.28 * s, 0.24 * s), { color: [1.08, 1.05, 0.98] });
  b.geo(M.gold, U.sphere(6, 4), pm(x, y + 1.44 * s, z, 0, 0, 0, 0.05 * s), {});
  dyn.halos.push({ x, y: y + 0.92 * s, z, s: 2.2 * s });
}

// ------------------------------------------------------------------ pillars at the ramp entrances up to the grassy loop
export function rampGates(ctx, b, M, dyn, occ) {
  const T = ctx.terrain;
  for (const R of RAMPS.filter((r) => r.kind === 'dirt')) {
    const [ax, az] = R.pts[0], [bx, bz] = R.pts[1];
    const L = Math.hypot(bx - ax, bz - az), tx = (bx - ax) / L, tz = (bz - az) / L;
    // first distance along the ramp where both pillars are clear of the main street
    const street = T.paths[0].samples;
    const dStreet = (x, z) => { let m = 1e9; for (let i = 0; i < street.length; i += 2) m = Math.min(m, Math.hypot(street[i].x - x, street[i].z - z)); return m; };
    let d = 3;
    for (; d < 16; d += 0.5) {
      const ok = [-1, 1].every((side) => dStreet(ax + tx * d + tz * side * (R.width / 2 + 0.9), az + tz * d - tx * side * (R.width / 2 + 0.9)) > 5.5 + 1.2);
      if (ok) break;
    }
    for (const side of [-1, 1]) {
      const x = ax + tx * d + tz * side * (R.width / 2 + 0.9), z = az + tz * d - tx * side * (R.width / 2 + 0.9);
      const y = T.heightAt(x, z);
      b.box(M.stone, pm(x, y + 1.2, z, 0, Math.atan2(tx, tz), 0), 1.1, 2.8, 1.1, { uv: 'frame', uvs: 0.45, color: LIGHT });
      b.box(M.stone, pm(x, y + 2.7, z, 0, Math.atan2(tx, tz), 0), 1.35, 0.22, 1.35, { color: LIGHT });
      lanternOnPost(b, M, x, y + 2.8, z, dyn);
      ctx.colliders.addBox(x, z, 0.6, 0.6, Math.atan2(tx, tz));
      occ.reserve(x, z, 1.2);
    }
    // wooden signpost with arrow boards
    const sx = ax + tx * (d - 1.2) + tz * (R.width / 2 + 2.2), sz = az + tz * (d - 1.2) - tx * (R.width / 2 + 2.2);
    if (occ.free(sx, sz, 0.5)) {
      const y = T.heightAt(sx, sz);
      b.box(M.wood, pm(sx, y + 1.3, sz), 0.14, 2.6, 0.14, { uv: 'grain' });
      for (const [yy, a] of [[2.2, Math.atan2(tx, tz) - 0.2], [1.8, Math.atan2(tx, tz) + 2.6]]) {
        b.push(pm(sx, y + yy, sz, 0, a, 0));
        b.box(M.paint, pm(0.55, 0, 0), 1.0, 0.24, 0.05, { color: [0.95, 0.85, 0.6] });
        b.geo(M.paint, U.coneCap(3), pm(1.12, 0, 0, 0, 0, -Math.PI / 2, 0.18, 0.16, 0.03), { color: [0.95, 0.85, 0.6] });
        b.pop();
      }
      ctx.colliders.addCircle(sx, sz, 0.2);
      occ.reserve(sx, sz, 0.6);
    }
  }
}

// ------------------------------------------------------------------ planters / benches / wells in open town squares
export function townSquares(ctx, b, M, dyn, occ, rng, planterFn) {
  const T = ctx.terrain;
  const out = [];
  let k = 0;
  for (let z = -40; z <= 20; z += 7) for (let x = -104; x <= 50; x += 7) {
    const jx = x + (rng() - 0.5) * 3, jz = z + (rng() - 0.5) * 3;
    if (zoneAt(jx, jz) !== Z.TOWN) continue;
    const h = T.heightAt(jx, jz);
    if (h < 2.15 || h > 2.25) continue;
    if (!occ.free(jx, jz, 2.8, { paths: true, pathPad: 0.6, houseMargin: 1.2 })) continue;
    const kind = k++ % 4;
    if (kind === 0 || kind === 2) planterFn(ctx, b, M, jx, h, jz, rng, kind === 0 ? 'round' : 'blossom');
    else if (kind === 1) {
      const rot = rng() * Math.PI * 2;
      bench(b, M, jx, h, jz, rot);
      ctx.colliders.addBox(jx, jz, 0.95, 0.35, rot);
      barrel(b, M, jx + Math.cos(rot) * 1.4, h, jz - Math.sin(rot) * 1.4, 0.2, 0.85, { apples: [0.95, 0.3, 0.2] });
      flowerPot(b, M, jx - Math.cos(rot) * 1.4, jz + Math.sin(rot) * 1.4, rng, 1.2, h);
    } else {
      well(b, M, jx, h, jz, rng() * 3, M.roofRed);
      ctx.colliders.addCircle(jx, jz, 1.15);
      ctx.minimap.addCircle(jx, jz, 1.1, '#9a9a9a');
    }
    occ.reserve(jx, jz, 3.2);
    out.push([jx, jz]);
    if (out.length > 16) return out;
  }
  return out;
}

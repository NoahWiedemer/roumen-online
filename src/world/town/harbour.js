// Harbour: stone quay walls (wherever the plaza / island meets the sea), bollards, ladders,
// moored boats (bobbing), a cargo crane, the stone pier with the lighthouse platform, the
// wooden bridge to the island and the wooden boardwalk / stairs along the east cliff.
import * as THREE from 'three';
import { GeoBuilder, pm, U } from './builder.js';
import { isoLines, simplify, resample, polyLength } from './contour.js';
import { lampPost, barrel, crate, sack, bench, flowerClump } from './props.js';
import { PALETTE } from './parts.js';
import { lighthouse, octagonPavilion, flagPole } from './landmarks.js';
import { DECKS, DECK_DISCS, ISLAND, OCTAGON, LIGHTHOUSE, PORTALS } from '../layout.js';
import { lerp } from '../../core/utils.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const LIGHT = [1.14, 1.1, 1.04];
const QUAY_TOP = 1.84;

// polyline samples with arc-length parameter t (0..1)
export function polySamples(pts, step) {
  const total = polyLength(pts);
  const out = resample(pts, step);
  let acc = 0;
  for (let i = 0; i < out.length; i++) {
    if (i) acc += Math.hypot(out[i].x - out[i - 1].x, out[i].z - out[i - 1].z);
    out[i].s = acc; out[i].t = total ? acc / total : 0;
  }
  out.total = total;
  return out;
}
export const deckHeight = (d, t) => lerp(d.h0, d.h1, t) + (d.arch ? Math.sin(t * Math.PI) * d.arch : 0);

// ------------------------------------------------------------------ quay walls
export function quayWalls(ctx, b, M, occ) {
  const T = ctx.terrain;
  const lines = isoLines((x, z) => T.heightAt(x, z), [-118, -25, 128, 130], 0.45, 0.5);
  const grad = (x, z) => {
    const e = 1.2;
    const gx = T.heightAt(x + e, z) - T.heightAt(x - e, z), gz = T.heightAt(x, z + e) - T.heightAt(x, z - e);
    const l = Math.hypot(gx, gz) || 1;
    return [gx / l, gz / l];
  };
  const deckEnds = [];
  for (const d of DECKS) for (const p of [d.pts[0], d.pts[d.pts.length - 1]]) deckEnds.push({ x: p[0], z: p[1], r: d.width / 2 + 0.6 });
  const edges = []; // for bollards / ladders / parapets: {x,z,nx,nz (towards the sea), tx,tz}
  b.resetFrame();
  b.ao = { y0: -0.4, h: 1.4, min: 0.5 };
  for (const line of lines) {
    if (polyLength(line) < 4) continue;
    const pts = simplify(line, 0.25);
    const S = resample(pts, 1.5);
    for (let i = 0; i < S.length - 1; i++) {
      const a = S[i], c = S[i + 1];
      const mx = (a.x + c.x) / 2, mz = (a.z + c.z) / 2;
      const [gx, gz] = grad(mx, mz); // towards land
      const land = T.heightAt(mx + gx * 2.5, mz + gz * 2.5), sea = T.heightAt(mx - gx * 2.5, mz - gz * 2.5);
      if (land < 1.5 || land > 2.6 || sea > -0.15) continue;
      if (T.deckAt(mx - gx * 1.2, mz - gz * 1.2) !== null && deckEnds.some((e) => Math.hypot(e.x - mx, e.z - mz) < e.r + 1.5)) continue;
      const L = Math.hypot(c.x - a.x, c.z - a.z) + 0.12;
      const rot = Math.atan2(c.x - a.x, c.z - a.z);
      // wall body: outer face on the contour, extends 1.8 m inland
      const cx = mx + gx * 0.9, cz = mz + gz * 0.9;
      b.box(M.stone, pm(cx, (QUAY_TOP - 3.6) / 2, cz, 0, rot, 0), 1.8, QUAY_TOP + 3.6, L, { uv: 'part', uvs: 0.42, color: [0.95, 0.93, 0.9], skip: ['ny'] });
      // capstone (overhangs the sea side a little)
      b.box(M.stone, pm(mx + gx * 0.45, QUAY_TOP + 0.07, mz + gz * 0.45, 0, rot, 0), 1.05, 0.2, L + 0.02, { uv: 'part', uvs: 0.9, color: LIGHT, skip: ['ny'] });
      edges.push({ x: mx, z: mz, nx: -gx, nz: -gz, tx: (c.x - a.x) / (L - 0.12), tz: (c.z - a.z) / (L - 0.12) });
    }
  }
  b.ao = null;
  // pilasters / ladders / bollards along the edges
  let k = 0;
  for (const e of edges) {
    k++;
    const rot = Math.atan2(e.tx, e.tz);
    if (k % 5 === 0) b.box(M.stone, pm(e.x + e.nx * 0.12, -1.0, e.z + e.nz * 0.12, 0, rot, 0), 0.4, 5.6, 0.9, { uv: 'part', uvs: 0.5, color: [1.02, 1.0, 0.96] });
    const bx = e.x - e.nx * 0.5, bz = e.z - e.nz * 0.5;
    if (k % 6 === 3 && occ.free(bx, bz, 0.6, { paths: true, pathPad: 0.1 })) {
      bollard(b, M, bx, QUAY_TOP + 0.17, bz, k % 12 === 3);
      ctx.colliders.addCircle(bx, bz, 0.3);
      occ.reserve(bx, bz, 0.6);
      e.bollard = [bx, bz];
    }
    if (k % 27 === 13) ladder(b, M, e.x + e.nx * 0.1, e.z + e.nz * 0.1, Math.atan2(e.nx, e.nz));
  }
  return edges;
}

export function bollard(b, M, x, y, z, rope) {
  b.geo(M.iron, U.lathe('bollard', [[0.001, 0], [0.26, 0], [0.22, 0.08], [0.17, 0.35], [0.2, 0.5], [0.28, 0.58], [0.24, 0.66], [0.001, 0.68]], 12), pm(x, y, z), { color: [1.1, 1.1, 1.2] });
  if (rope) {
    for (let i = 0; i < 3; i++) b.geo(M.rope, U.torus(1, 0.12, 5, 12), pm(x, y + 0.2 + i * 0.07, z, Math.PI / 2, 0, 0, 0.26 + i * 0.01), { color: [1.5, 1.3, 1.0] });
  }
}
function ladder(b, M, x, z, rot) {
  b.push(pm(x, 0, z, 0, rot, 0));
  for (const s of [-1, 1]) {
    b.box(M.iron, pm(s * 0.28, 0.2, 0.06), 0.05, 3.6, 0.05, { color: [1.3, 1.3, 1.4] });
    b.geo(M.iron, U.torus(1, 0.12, 4, 10, Math.PI), pm(s * 0.28, QUAY_TOP + 0.05, -0.2, 0, Math.PI / 2, 0, 0.26), { color: [1.3, 1.3, 1.4] });
  }
  for (let y = -1.4; y < QUAY_TOP; y += 0.32) b.box(M.iron, pm(0, y, 0.06), 0.56, 0.04, 0.04, { color: [1.3, 1.3, 1.4] });
  b.pop();
}

// ------------------------------------------------------------------ boats (separate meshes, bob in update)
function boatGeometry(M, L, W, H, colHull, colStripe, mast) {
  const b = new GeoBuilder();
  const N = 14; // sections along the length
  const half = (u) => (W / 2) * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(u), 2.6)), 0.55);
  const sheer = (u) => H + Math.abs(u) ** 2 * 0.35; // gunwale rises to bow & stern
  const prof = (u) => { // cross-section points (x,y) from keel up to gunwale (one side)
    const hw = half(u), top = sheer(u);
    return [[0, 0.02], [hw * 0.45, 0.06], [hw * 0.85, top * 0.35], [hw, top * 0.8], [hw * 0.98, top]];
  };
  const sec = [];
  for (let i = 0; i <= N; i++) { const u = -1 + (2 * i) / N; sec.push({ z: u * L / 2, p: prof(u) }); }
  for (const s of [-1, 1]) {
    for (let i = 0; i < N; i++) {
      const A = sec[i], B = sec[i + 1];
      for (let k = 0; k < 4; k++) {
        const a0 = V3(s * A.p[k][0], A.p[k][1], A.z), a1 = V3(s * A.p[k + 1][0], A.p[k + 1][1], A.z);
        const b0 = V3(s * B.p[k][0], B.p[k][1], B.z), b1 = V3(s * B.p[k + 1][0], B.p[k + 1][1], B.z);
        const col = k === 3 ? colStripe : colHull;
        const out = V3(s, k < 1 ? -1 : 0.2, 0);
        b.quadN(M.paint, a0, b0, b1, a1, [A.z * 0.5, k * 0.3], [B.z * 0.5, k * 0.3], [B.z * 0.5, k * 0.3 + 0.3], [A.z * 0.5, k * 0.3 + 0.3], col, out, false);
        // inside planks
        b.quadN(M.wood, a0, a1, b1, b0, [A.z * 0.6, k * 0.3], [A.z * 0.6, k * 0.3 + 0.3], [B.z * 0.6, k * 0.3 + 0.3], [B.z * 0.6, k * 0.3], [0.8, 0.75, 0.7], V3(-s, 0.6, 0), false);
      }
    }
  }
  // gunwale rail + floor + benches
  for (const s of [-1, 1]) for (let i = 0; i < N; i++) {
    const A = sec[i], B = sec[i + 1];
    const a = V3(s * A.p[4][0], A.p[4][1], A.z), c = V3(s * B.p[4][0], B.p[4][1], B.z);
    const mid = a.clone().add(c).multiplyScalar(0.5), dir = c.clone().sub(a), len = dir.length();
    const q = new THREE.Quaternion().setFromUnitVectors(V3(0, 0, 1), dir.normalize());
    b.box(M.wood, new THREE.Matrix4().compose(mid, q, V3(1, 1, 1)), 0.1, 0.08, len + 0.04, { uv: 'grain', color: [0.9, 0.7, 0.55] });
  }
  b.box(M.wood, pm(0, 0.12, 0), W * 0.55, 0.04, L * 0.7, { uvs: 1.2, color: [0.9, 0.8, 0.7] });
  for (const zz of [-L * 0.2, L * 0.15]) b.box(M.wood, pm(0, H * 0.62, zz), half(zz / (L / 2)) * 1.9, 0.06, 0.32, { uv: 'grain', color: [0.95, 0.8, 0.65] });
  if (mast) {
    b.geo(M.wood, U.cyl(8), pm(0, H + 2.4, L * 0.12, 0, 0, 0, 0.07, 5.0, 0.07), { uv: 'keep', uvScale: [0.3, 2] });
    b.geo(M.wood, U.cyl(8), pm(0, H + 1.0, L * -0.12, Math.PI / 2, 0, 0, 0.05, L * 0.5, 0.05), { uv: 'keep' });
    // furled sail along the boom
    b.geo(M.fabric, U.cyl(10), pm(0, H + 1.12, L * -0.12, Math.PI / 2, 0, 0, 0.14, L * 0.46, 0.12), { uv: 'keep', uvScale: [1, 2], color: [1.05, 1.0, 0.92] });
    b.geo(M.gold, U.sphere(6, 4), pm(0, H + 4.95, L * 0.12, 0, 0, 0, 0.08), {});
    // little pennant on top
    b.tri(M.pennant, V3(0, H + 4.8, L * 0.12), V3(0, H + 4.5, L * 0.12), V3(0, H + 4.65, L * 0.12 - 0.7), [0, 1], [0, 1], [1, 0], [1.1, 0.15, 0.15], V3(1, 0, 0), false);
  } else {
    // oars
    for (const s of [-1, 1]) b.box(M.wood, pm(s * W * 0.25, H * 0.75, 0, 0, s * 0.25, 0), 0.06, 0.05, L * 0.62, { uv: 'grain', color: [0.95, 0.8, 0.6] });
  }
  const mats = [M.paint, M.wood, M.fabric, M.gold, M.pennant];
  const out = [];
  for (const m of mats) { const g = b.toGeometry(m); if (g) out.push([g, m]); }
  return out;
}

export function boats(ctx, M, dyn, spots, b) {
  const defs = [
    { L: 4.6, W: 1.7, H: 0.75, hull: [0.3, 0.5, 0.85], stripe: [1.1, 1.05, 1.0], mast: false },
    { L: 7.2, W: 2.5, H: 1.0, hull: [0.95, 0.95, 0.92], stripe: [0.85, 0.22, 0.2], mast: true },
    { L: 4.2, W: 1.6, H: 0.7, hull: [0.85, 0.35, 0.28], stripe: [1.1, 1.05, 0.95], mast: false },
    { L: 5.6, W: 2.0, H: 0.85, hull: [0.3, 0.62, 0.45], stripe: [1.1, 1.05, 0.95], mast: false },
  ];
  spots.forEach((s, i) => {
    const d = defs[i % defs.length];
    const g = new THREE.Group();
    g.name = 'boat';
    for (const [geo, mat] of boatGeometry(M, d.L, d.W, d.H, d.hull, d.stripe, d.mast)) {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true; m.receiveShadow = true;
      g.add(m);
    }
    g.position.set(s.x, -0.28, s.z);
    g.rotation.y = s.rot;
    ctx.scene.add(g);
    // mooring ropes from the quay to bow and stern
    if (b && s.edge) {
      const e = s.edge;
      for (const end of [-1, 1]) {
        const bx = s.x + Math.sin(s.rot) * end * d.L * 0.42, bz = s.z + Math.cos(s.rot) * end * d.L * 0.42;
        const qx = e.x - e.nx * 0.45 + e.tx * end * 2.2, qz = e.z - e.nz * 0.45 + e.tz * end * 2.2;
        ropeLine(b, M, new THREE.Vector3(qx, QUAY_TOP + 0.35, qz), new THREE.Vector3(bx, d.H + 0.1, bz), 0.35);
        bollard(b, M, qx, QUAY_TOP + 0.17, qz, true);
        ctx.colliders.addCircle(qx, qz, 0.3);
      }
    }
    const ph = i * 1.9;
    dyn.updaters.push((dt, t) => {
      g.position.y = -0.3 + Math.sin(t * 1.1 + ph) * 0.07;
      g.rotation.z = Math.sin(t * 0.9 + ph) * 0.035;
      g.rotation.x = Math.sin(t * 0.7 + ph * 1.3) * 0.02;
    });
  });
}

function ropeLine(b, M, A, B, sag) {
  const n = 8;
  let prev = A;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const p = new THREE.Vector3(A.x + (B.x - A.x) * t, A.y + (B.y - A.y) * t - 4 * sag * t * (1 - t), A.z + (B.z - A.z) * t);
    const mid = prev.clone().add(p).multiplyScalar(0.5), dir = p.clone().sub(prev), len = dir.length();
    const q = new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), dir.normalize());
    b.geo(M.rope, U.cyl(4), new THREE.Matrix4().compose(mid, q, V3(0.03, len + 0.01, 0.03)), { ao: false, color: [1.4, 1.25, 1.0] });
    prev = p;
  }
}

// pick boat moorings along quay edges (away from decks/portals)
export function boatSpots(ctx, edges, n) {
  const T = ctx.terrain;
  const out = [];
  const cand = edges.filter((e, i) => i % 7 === 0).filter((e) => e.z > 30 || e.x > 40);
  for (const e of cand) {
    if (out.length >= n) break;
    const off = 2.4;
    const x = e.x + e.nx * off, z = e.z + e.nz * off;
    if (T.heightAt(x, z) > -1.2 || T.deckAt(x, z) !== null) continue;
    if (DECKS.some((d) => d.pts.some((p) => Math.hypot(p[0] - x, p[1] - z) < 12))) continue;
    if (out.some((o) => Math.hypot(o.x - x, o.z - z) < 25)) continue;
    if (PORTALS.some((p) => Math.hypot(p.x - x, p.z - z) < 8)) continue;
    out.push({ x, z, rot: Math.atan2(e.tx, e.tz), edge: e });
  }
  return out;
}

// ------------------------------------------------------------------ cargo crane
export function crane(ctx, b, M, x, y, z, rot) {
  b.push(pm(x, y, z, 0, rot, 0));
  b.box(M.stone, pm(0, 0.35, 0), 2.6, 0.7, 2.6, { uv: 'frame', uvs: 0.5, color: LIGHT });
  b.geo(M.wood, U.cyl(10), pm(0, 3.6, 0, 0, 0, 0, 0.28, 6.0, 0.28), { uv: 'keep', uvScale: [1, 2.5] });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    b.box(M.wood, pm(Math.sin(a) * 0.75, 1.5, Math.cos(a) * 0.75, 0, a, 0).multiply(pm(0, 0, 0, -0.5, 0, 0)), 0.14, 0.14, 2.2, { uv: 'grain' });
  }
  // jib arm reaching out over the water (+z)
  const jl = 7.5;
  b.push(pm(0, 6.2, 0, -0.32, 0, 0));
  b.box(M.wood, pm(0, 0, jl / 2 - 0.5), 0.3, 0.34, jl, { uv: 'grain' });
  b.pop();
  b.box(M.wood, pm(0, 4.6, 1.6, 0.55, 0, 0), 0.18, 0.18, 3.6, { uv: 'grain' });
  const tipY = 6.2 + Math.sin(0.32) * (jl - 0.5), tipZ = Math.cos(0.32) * (jl - 0.5);
  b.geo(M.wood, U.cyl(10), pm(0, tipY + 0.05, tipZ, 0, 0, Math.PI / 2, 0.22, 0.22, 0.22), {});
  // rope + hook + cargo net with crates
  const ropeL = tipY - 3.2;
  b.box(M.rope, pm(0, tipY - ropeL / 2, tipZ), 0.04, ropeL, 0.04);
  b.geo(M.iron, U.torus(1, 0.2, 5, 10, Math.PI * 1.4), pm(0, 3.1, tipZ, 0, 0, 0, 0.18), {});
  for (const [cx, cy, cz, s] of [[-0.3, 1.9, -0.1, 0.62], [0.35, 1.95, 0.15, 0.55], [0, 2.45, 0, 0.5]]) crate(b, M, cx, cy, tipZ + cz, 0.3, s);
  for (const s of [-1, 1]) b.box(M.rope, pm(s * 0.45, 2.55, tipZ, 0, 0, s * 0.45), 0.03, 1.3, 0.03);
  // wheel + counterweight
  b.geo(M.wood, U.torus(1, 0.08, 5, 16), pm(0.4, 1.8, -0.6, 0, Math.PI / 2, 0, 0.8), {});
  b.box(M.stone, pm(0, 5.2, -1.2), 0.8, 0.8, 0.8, { color: [0.9, 0.9, 0.9] });
  b.pop();
  ctx.colliders.addBox(x, z, 1.4, 1.4, rot);
  ctx.minimap.addRect(x, z, 2.6, 2.6, rot, '#8a6a4a');
}

// ------------------------------------------------------------------ wooden boardwalks (bridge, cliff stairs, link)
export function boardwalk(ctx, b, M, dyn, deck, o = {}) {
  const T = ctx.terrain;
  const S = polySamples(deck.pts, 0.5);
  const W = deck.width;
  const stairs = deck.kind === 'wood_stairs';
  const yAt = (t) => { const h = deckHeight(deck, t); return stairs ? Math.round(h / 0.22) * 0.22 : h; };
  const perp = (s) => [s.tz, -s.tx]; // local +x (right of travel)
  b.resetFrame();
  // planks
  for (let i = 0; i < S.length - 1; i++) {
    const a = S[i], c = S[i + 1];
    const ya = yAt(a.t), yc = yAt(c.t);
    const mx = (a.x + c.x) / 2, mz = (a.z + c.z) / 2;
    const rot = Math.atan2(c.x - a.x, c.z - a.z);
    const L = Math.hypot(c.x - a.x, c.z - a.z) + 0.02;
    const pitch = stairs ? 0 : -Math.atan2(yc - ya, L);
    const y = stairs ? Math.max(ya, yc) : (ya + yc) / 2;
    const tint = 0.9 + ((i * 7) % 5) * 0.04;
    b.box(M.wood, pm(mx, y - 0.06, mz, pitch, rot, 0), W, 0.12, L - 0.04, { uv: 'grain', uvs: 0.8, color: [tint, tint * 0.97, tint * 0.94] });
    if (stairs && Math.abs(ya - yc) > 0.01) {
      // riser board
      const top = Math.max(ya, yc), bot = Math.min(ya, yc);
      b.box(M.wood, pm(mx, (top + bot) / 2 - 0.06, mz, 0, rot, 0), W, top - bot + 0.02, 0.06, { uv: 'grain', color: [0.75, 0.68, 0.6] });
    }
  }
  // stringers, posts and railings on both sides
  const postEvery = 2.4;
  let nextPost = 0;
  const railPts = { '-1': [], '1': [] };
  for (let i = 0; i < S.length; i++) {
    const s = S[i];
    const [px, pz] = perp(s);
    const y = yAt(s.t);
    for (const side of [-1, 1]) {
      const ex = s.x + px * side * (W / 2 - 0.08), ez = s.z + pz * side * (W / 2 - 0.08);
      railPts[side].push(V3(ex, y, ez));
    }
    if (s.s >= nextPost || i === S.length - 1) {
      nextPost = s.s + postEvery;
      for (const side of [-1, 1]) {
        const ex = s.x + px * side * (W / 2 - 0.08), ez = s.z + pz * side * (W / 2 - 0.08);
        const g = T.heightAt(ex, ez);
        // support pile down into the water (only where the ground is below the deck)
        if (g < y - 0.6) {
          const bot = Math.max(g - 0.5, -6);
          b.geo(M.wood, U.cyl(8), pm(ex, (y - 0.12 + bot) / 2, ez, 0, 0, 0, 0.14, y - 0.12 - bot, 0.14), { uv: 'keep', uvScale: [0.5, 1.5], color: [0.72, 0.62, 0.52] });
        }
        // railing post
        if (o.rails !== false) b.box(M.wood, pm(ex, y + 0.5, ez, 0, Math.atan2(s.tx, s.tz), 0), 0.12, 1.05, 0.12, { uv: 'grain', color: [0.95, 0.85, 0.75] });
        if (o.lanterns && (Math.round(s.s / postEvery) % o.lanterns === 0) && side === (Math.round(s.s / postEvery / o.lanterns) % 2 ? 1 : -1)) {
          b.geo(M.lamp, U.frustum(1.2, 6), pm(ex, y + 1.28, ez, 0, 0, 0, 0.12, 0.3, 0.12), { ao: false });
          b.geo(M.iron, U.coneCap(6), pm(ex, y + 1.52, ez, 0, 0, 0, 0.17, 0.18, 0.17), {});
          dyn.halos.push({ x: ex, y: y + 1.28, z: ez, s: 1.6 });
        }
      }
      // cross beam under the deck
      const y0 = yAt(s.t);
      b.box(M.timber, pm(s.x, y0 - 0.22, s.z, 0, Math.atan2(s.tx, s.tz), 0), W + 0.2, 0.18, 0.2, { uv: 'grain' });
    }
  }
  const beam = (p, q, sz, mat, col, yOff) => {
    const a = p.clone(), c = q.clone(); a.y += yOff; c.y += yOff;
    const mid = a.clone().add(c).multiplyScalar(0.5), dir = c.clone().sub(a), len = dir.length();
    if (len < 1e-4) return;
    const qq = new THREE.Quaternion().setFromUnitVectors(V3(0, 0, 1), dir.normalize());
    b.box(mat, new THREE.Matrix4().compose(mid, qq, V3(1, 1, 1)), sz[0], sz[1], len + 0.02, { uv: 'grain', color: col });
  };
  for (const side of [-1, 1]) {
    const P = railPts[side];
    for (let i = 0; i < P.length - 1; i += 2) {
      const j = Math.min(P.length - 1, i + 2);
      beam(P[i], P[j], [0.12, 0.22], M.timber, [1, 1, 1], -0.2);
      if (o.rails !== false) {
        beam(P[i], P[j], [0.1, 0.08], M.wood, [1.0, 0.9, 0.8], 1.02);
        beam(P[i], P[j], [0.06, 0.06], M.wood, [0.95, 0.85, 0.75], 0.55);
      }
    }
  }
  // colliders along the railings (keep walkers on the deck)
  if (o.rails !== false && o.colliders !== false) {
    for (const side of [-1, 1]) {
      const P = railPts[side];
      for (let i = 0; i < P.length - 1; i += 6) {
        const j = Math.min(P.length - 1, i + 6);
        const skipEnd = (i < 3 && o.openStart) || (j > P.length - 4 && o.openEnd);
        if (skipEnd) continue;
        const mx = (P[i].x + P[j].x) / 2, mz = (P[i].z + P[j].z) / 2;
        const L = Math.hypot(P[j].x - P[i].x, P[j].z - P[i].z);
        const nx = S[Math.min(S.length - 1, i)].tz * side * 0.18, nz = -S[Math.min(S.length - 1, i)].tx * side * 0.18;
        ctx.colliders.addBox(mx + nx, mz + nz, 0.1, L / 2, Math.atan2(P[j].x - P[i].x, P[j].z - P[i].z));
      }
    }
  }
  return S;
}

// ------------------------------------------------------------------ stone pier + lighthouse platform
export function stonePier(ctx, b, M, dyn, deck, occ) {
  const T = ctx.terrain;
  const S = polySamples(deck.pts, 2.0);
  const W = deck.width;
  const portal = PORTALS.find((p) => p.id === 'sea_of_greed');
  b.resetFrame();
  b.ao = { y0: -0.4, h: 1.4, min: 0.5 };
  for (let i = 0; i < S.length - 1; i++) {
    const a = S[i], c = S[i + 1];
    const mx = (a.x + c.x) / 2, mz = (a.z + c.z) / 2;
    const rot = Math.atan2(c.x - a.x, c.z - a.z);
    const L = Math.hypot(c.x - a.x, c.z - a.z) + 0.1;
    const y = deckHeight(deck, (a.t + c.t) / 2);
    b.box(M.stone, pm(mx, (y - 5.5) / 2, mz, 0, rot, 0), W, y + 5.5, L, { uv: 'part', uvs: 0.42, color: [0.95, 0.93, 0.9], faces: { py: M.plaza } });
    for (const side of [-1, 1]) {
      const ex = mx + c.tz * side * (W / 2 - 0.2), ez = mz - c.tx * side * (W / 2 - 0.2);
      b.box(M.stone, pm(ex, y + 0.08, ez, 0, rot, 0), 0.62, 0.2, L + 0.01, { uv: 'part', uvs: 0.9, color: LIGHT });
    }
    // buttresses
    if (i % 3 === 1) for (const side of [-1, 1]) {
      const ex = mx + c.tz * side * (W / 2 + 0.2), ez = mz - c.tx * side * (W / 2 + 0.2);
      b.box(M.stone, pm(ex, (y - 5.5) / 2 - 0.2, ez, 0, rot, 0), 0.6, y + 5.1, 1.0, { uv: 'part', uvs: 0.45, color: [1.02, 1.0, 0.96] });
    }
  }
  b.ao = null;
  // lamps + bollards along the pier (clear of the portal)
  S.forEach((s, i) => {
    const y = deckHeight(deck, s.t);
    const side = i % 2 ? 1 : -1;
    const ex = s.x + s.tz * side * (W / 2 - 0.45), ez = s.z - s.tx * side * (W / 2 - 0.45);
    if (portal && Math.hypot(portal.x - ex, portal.z - ez) < 5.8) return;
    if (i % 4 === 2 && occ.free(ex, ez, 0.6)) {
      lampPost(b, M, ex, y + 0.02, ez, Math.atan2(s.tx, s.tz), dyn.halos);
      ctx.colliders.addCircle(ex, ez, 0.25);
      occ.reserve(ex, ez, 0.8);
    } else if (i % 4 === 0 && i > 0 && occ.free(ex, ez, 0.5)) {
      bollard(b, M, ex, y + 0.17, ez, i % 8 === 0);
      ctx.colliders.addCircle(ex, ez, 0.28);
      occ.reserve(ex, ez, 0.5);
    }
  });
  ctx.minimap.addRect((deck.pts[0][0] + deck.pts[deck.pts.length - 1][0]) / 2, (deck.pts[0][1] + deck.pts[deck.pts.length - 1][1]) / 2, W, S.total, Math.atan2(deck.pts[deck.pts.length - 1][0] - deck.pts[0][0], deck.pts[deck.pts.length - 1][1] - deck.pts[0][1]), '#cfc6b6');
  return S;
}

export function lighthousePlatform(ctx, b, M, dyn, occ) {
  const D = DECK_DISCS[0];
  const y = D.h;
  b.resetFrame();
  b.ao = { y0: -0.4, h: 1.4, min: 0.5 };
  b.geo(M.stone, U.cyl(40), pm(D.x, (y - 5.5) / 2, D.z, 0, 0, 0, D.r + 0.1, y + 5.5, D.r + 0.1), { uv: 'keep', uvScale: [17, 3.1], color: [0.95, 0.93, 0.9] });
  b.ao = null;
  b.geo(M.plaza, U.circle(40), pm(D.x, y + 0.01, D.z, 0, 0, 0, D.r, 1, D.r), { uv: 'frame', uvs: 1 / 3 });
  b.geo(M.stone, U.ring(0.9, 40), pm(D.x, y + 0.02, D.z, 0, 0, 0, D.r + 0.15, 1, D.r + 0.15), { uv: 'frame', uvs: 0.6, color: LIGHT });
  b.geo(M.stone, U.cyl(40, true), pm(D.x, y + 0.1, D.z, 0, 0, 0, D.r + 0.25, 0.2, D.r + 0.25), { uv: 'keep', uvScale: [17, 0.1], color: LIGHT });
  // tower on the far (north-west) edge, away from the basement portal and the pier
  const portal = PORTALS.find((p) => p.id === 'secret_basement');
  const pier = DECKS.find((d) => d.id === 'pier');
  const pe = pier.pts[pier.pts.length - 1];
  let best = null;
  for (let a = 0; a < Math.PI * 2; a += 0.1) {
    const r = D.r - 1.6;
    const x = D.x + Math.cos(a) * r, z = D.z + Math.sin(a) * r;
    const dp = portal ? Math.hypot(portal.x - x, portal.z - z) : 99, dq = Math.hypot(pe[0] - x, pe[1] - z);
    const score = Math.min(dp - 8.2, dq - 6.2);
    if (!best || score > best.score) best = { x, z, score };
  }
  const faceRot = Math.atan2(D.x - best.x, D.z - best.z);
  lighthouse(ctx, b, M, dyn, best.x, y, best.z, faceRot);
  ctx.minimap.addCircle(D.x, D.z, D.r, '#cfc6b6');
  // low parapet on the side facing the open sea (behind the tower)
  const back = Math.atan2(best.z - D.z, best.x - D.x);
  for (let k = -5; k <= 5; k++) {
    const a = back + k * 0.2;
    const x = D.x + Math.cos(a) * (D.r - 0.1), z = D.z + Math.sin(a) * (D.r - 0.1);
    if (portal && Math.hypot(portal.x - x, portal.z - z) < 5.5) continue;
    if (Math.hypot(pe[0] - x, pe[1] - z) < 3.5) continue;
    b.box(M.stone, pm(x, y + 0.35, z, 0, -a, 0), 0.4, 0.7, D.r * 0.21, { uv: 'part', uvs: 0.6, color: LIGHT });
    ctx.colliders.addBox(x, z, 0.25, D.r * 0.105, -a);
  }
  occ.reserve(best.x, best.z, 3);
  return best;
}

// ------------------------------------------------------------------ island dressing
export function islandDressing(ctx, b, M, dyn, edges, occ, rng) {
  const T = ctx.terrain;
  const I = ISLAND, O = OCTAGON;
  const y = T.heightAt(O.x, O.z);
  octagonPavilion(ctx, b, M, dyn, O.x, y, O.z, O.r);
  occ.reserve(O.x, O.z, O.r + 1.5);
  // paved ring around the pavilion
  b.resetFrame();
  b.geo(M.stone, U.ring(0.92, 48), pm(O.x, y + 0.03, O.z, 0, 0, 0, O.r + 5, 1, O.r + 5), { uv: 'frame', uvs: 0.5, color: [1.2, 1.12, 1.06] });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    b.box(M.stone, pm(O.x + Math.cos(a) * (O.r + 8), y + 0.035, O.z + Math.sin(a) * (O.r + 8), 0, -a, 0), 6, 0.02, 0.4, { uv: 'frame', uvs: 0.5, color: [1.2, 1.12, 1.06] });
  }
  // benches, lamps, planters with trees in a ring
  const ring = O.r + 11;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.26;
    const x = O.x + Math.cos(a) * ring, z = O.z + Math.sin(a) * ring;
    if (T.heightAt(x, z) < 1.7) continue;
    const kind = i % 3;
    if (kind === 0 && occ.free(x, z, 1.2)) {
      const rot = Math.atan2(O.x - x, O.z - z);
      bench(b, M, x, T.heightAt(x, z), z, rot);
      ctx.colliders.addBox(x, z, 0.95, 0.35, rot);
      occ.reserve(x, z, 1.3);
    } else if (kind === 1 && occ.free(x, z, 0.8)) {
      lampPost(b, M, x, T.heightAt(x, z), z, 0, dyn.halos, { double: true });
      ctx.colliders.addCircle(x, z, 0.3);
      occ.reserve(x, z, 0.8);
    } else if (kind === 2 && occ.free(x, z, 2)) {
      planter(ctx, b, M, x, T.heightAt(x, z), z, rng, 'blossom');
      occ.reserve(x, z, 2);
    }
  }
  // flower beds and trees further out
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.1;
    const r = I.r - 9 - (i % 2) * 5;
    const x = I.x + Math.cos(a) * r, z = I.z + Math.sin(a) * r;
    if (T.heightAt(x, z) < 1.7 || T.heightAt(x, z) > 1.95 || !occ.free(x, z, 2.5)) continue;
    if (i % 2) { ctx.addTree(x, z, 0.9 + rng() * 0.3, i % 4 === 1 ? 'blossom' : 'round'); occ.reserve(x, z, 2.5); }
    else { planter(ctx, b, M, x, T.heightAt(x, z), z, rng, null); occ.reserve(x, z, 2.2); }
  }
  // low rim wall on top of the island quay (openings where the decks arrive)
  addParapets(ctx, b, M, edges.filter((e) => Math.hypot(e.x - I.x, e.z - I.z) < I.r + 6), occ);
  ctx.addNoScatter(I.x, I.z, I.r);
}

export function addParapets(ctx, b, M, edges, occ) {
  const deckEnds = [];
  for (const d of DECKS) for (const p of [d.pts[0], d.pts[d.pts.length - 1]]) deckEnds.push(p);
  for (const e of edges) {
    if (e.bollard) continue;
    if (deckEnds.some((p) => Math.hypot(p[0] - e.x, p[1] - e.z) < 5)) continue;
    const px = e.x - e.nx * 0.35, pz = e.z - e.nz * 0.35;
    if (!occ.free(px, pz, 0.3, { ignoreProps: true })) continue;
    const rot = Math.atan2(e.tx, e.tz);
    b.box(M.stone, pm(px, QUAY_TOP + 0.4, pz, 0, rot, 0), 0.42, 0.55, 1.56, { uv: 'part', uvs: 0.6, color: [1.05, 1.03, 1.0] });
    b.box(M.stone, pm(px, QUAY_TOP + 0.72, pz, 0, rot, 0), 0.55, 0.1, 1.58, { uv: 'part', uvs: 0.9, color: LIGHT });
    ctx.colliders.addBox(px, pz, 0.25, 0.8, rot);
  }
}

// round stone planter with a small tree (or flowers)
export function planter(ctx, b, M, x, y, z, rng, tree = 'round') {
  b.geo(M.stone, U.cyl(16), pm(x, y + 0.25, z, 0, 0, 0, 1.2, 0.6, 1.2), { uv: 'keep', uvScale: [3, 0.3], color: LIGHT });
  b.geo(M.stone, U.cyl(16, true), pm(x, y + 0.58, z, 0, 0, 0, 1.3, 0.1, 1.3), { uv: 'keep', uvScale: [3, 0.05], color: [1.2, 1.15, 1.08] });
  b.geo(M.dirt, U.circle(16), pm(x, y + 0.5, z, 0, 0, 0, 1.12, 1, 1.12), { uv: 'frame', uvs: 0.5 });
  if (tree) ctx.addTree(x, z, 0.75 + rng() * 0.2, tree);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + rng();
    flowerClump(b, M, x + Math.cos(a) * 0.72, y + 0.5, z + Math.sin(a) * 0.72, rng, [PALETTE.flowers[i % 7], PALETTE.flowers[(i + 3) % 7]], 0.7);
  }
  ctx.colliders.addCircle(x, z, 1.3);
  ctx.addNoScatter(x, z, 1.5);
}

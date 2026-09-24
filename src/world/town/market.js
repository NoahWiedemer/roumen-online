// Market square on the harbour plaza: the tiered fountain, a ring of colourful stalls, benches,
// lamps with garlands, a notice board, the horse wagon and the winged guardian statue.
import * as THREE from 'three';
import { pm, U } from './builder.js';
import { PALETTE } from './parts.js';
import { lampPost, bench, marketStall, barrel, crate, sack, clutter, flowerClump, hayBale } from './props.js';
import { fountain, statue, buildWagon } from './plaza.js';
import { garland } from './street.js';
import { planter } from './harbour.js';
import { FOUNTAIN, RAMPS, TOWN } from '../layout.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const LIGHT = [1.14, 1.1, 1.04];

export function marketSquare(ctx, b, M, dyn, occ, rng) {
  const T = ctx.terrain;
  const cx = FOUNTAIN.x, cz = FOUNTAIN.z, cy = T.heightAt(cx, cz);
  b.resetFrame();
  // decorative pavement around the fountain
  b.geo(M.plaza, U.circle(56), pm(cx, cy + 0.03, cz, 0, 0, 0, 9, 1, 9), { uv: 'frame', uvs: 1 / 3, color: [1.04, 1.0, 0.98] });
  b.geo(M.stone, U.ring(0.94, 56), pm(cx, cy + 0.04, cz, 0, 0, 0, 9.2, 1, 9.2), { uv: 'frame', uvs: 0.5, color: [1.2, 1.12, 1.06] });
  b.geo(M.stone, U.ring(0.9, 56), pm(cx, cy + 0.04, cz, 0, 0, 0, 5.2, 1, 5.2), { uv: 'frame', uvs: 0.5, color: [1.25, 1.12, 1.08] });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    b.box(M.stone, pm(cx + Math.cos(a) * 7.1, cy + 0.04, cz + Math.sin(a) * 7.1, 0, -a, 0), 3.6, 0.03, 0.35, { uv: 'frame', uvs: 0.5, color: [1.25, 1.12, 1.08] });
  }
  fountain(ctx, b, M, cx, cy + 0.04, cz, dyn);
  ctx.colliders.addCircle(cx, cz, 3.65);
  ctx.minimap.addCircle(cx, cz, 9, '#e7b8a8');
  ctx.minimap.addCircle(cx, cz, 3.5, '#6cc6ec');
  ctx.addNoScatter(cx, cz, 10);
  occ.reserve(cx, cz, 4.2);

  // the approach from the town / spawn stays open
  const openA = Math.atan2(TOWN.spawn.z - cz, TOWN.spawn.x - cx);
  const angOpen = (a) => Math.abs(((a - openA + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.55;

  // benches facing the fountain
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    if (angOpen(a)) continue;
    const x = cx + Math.cos(a) * 6.4, z = cz + Math.sin(a) * 6.4;
    if (!occ.free(x, z, 1.0)) continue;
    const rot = Math.atan2(cx - x, cz - z);
    bench(b, M, x, cy, z, rot);
    ctx.colliders.addBox(x, z, 0.95, 0.35, rot);
    occ.reserve(x, z, 1.1);
  }
  // double lamps + garlands between them
  const lamps = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const x = cx + Math.cos(a) * 8.6, z = cz + Math.sin(a) * 8.6;
    if (!occ.free(x, z, 0.6)) continue;
    lampPost(b, M, x, cy, z, a, dyn.halos, { double: true });
    ctx.colliders.addCircle(x, z, 0.3);
    occ.reserve(x, z, 0.8);
    lamps.push(V3(x, cy + 3.8, z));
  }
  for (let i = 0; i < lamps.length; i++) {
    const a = lamps[i], c = lamps[(i + 1) % lamps.length];
    if (a.distanceTo(c) < 12) garland(b, M, a, c, 0.8, rng);
    // every other lamp: garland up to the fountain finial
    if (i % 2 === 0) garland(b, M, a, V3(cx, cy + 4.6, cz), 0.5, rng);
  }
  // ring of market stalls
  let stalls = 0;
  const stallSpots = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.15;
    if (angOpen(a)) continue;
    const r = 13 + (i % 2) * 1.2;
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    if (T.heightAt(x, z) < 1.7 || T.heightAt(x, z) > 1.9) continue;
    if (!occ.free(x, z, 2.4)) continue;
    const rot = Math.atan2(cx - x, cz - z);
    marketStall(b, M, x, T.heightAt(x, z) - 0.02, z, rot, rng, i % 4);
    ctx.colliders.addBox(x, z, 1.75, 1.05, rot);
    ctx.minimap.addRect(x, z, 3.4, 2.1, rot, ['#d8343f', '#2f6fd0', '#3c9a4c', '#e0628a'][i % 4]);
    occ.reserve(x, z, 2.6);
    stalls++;
    stallSpots.push({ x, z, rot });
    // goods around the stall (behind / beside)
    const bx = x - Math.sin(rot) * 1.6 + Math.cos(rot) * 2.2, bz = z - Math.cos(rot) * 1.6 - Math.sin(rot) * 2.2;
    if (occ.free(bx, bz, 0.9)) {
      clutter(b, M, bx, T.heightAt(bx, bz), bz, rot, rng, T);
      ctx.colliders.addCircle(bx, bz, 0.75);
      occ.reserve(bx, bz, 1);
    }
  }
  // notice board near the open side
  {
    const a = openA + 0.75;
    const x = cx + Math.cos(a) * 10.5, z = cz + Math.sin(a) * 10.5;
    if (occ.free(x, z, 1.2)) {
      noticeBoard(b, M, x, T.heightAt(x, z), z, Math.atan2(TOWN.spawn.x - x, TOWN.spawn.z - z), rng);
      ctx.colliders.addBox(x, z, 1.0, 0.3, Math.atan2(TOWN.spawn.x - x, TOWN.spawn.z - z));
      occ.reserve(x, z, 1.3);
    }
  }
  // flower planters a bit further out
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.4;
    if (angOpen(a)) continue;
    const x = cx + Math.cos(a) * 18, z = cz + Math.sin(a) * 18;
    const h = T.heightAt(x, z);
    if (h < 1.7 || h > 1.9 || !occ.free(x, z, 1.8)) continue;
    planter(ctx, b, M, x, h, z, rng, i % 2 ? null : 'round');
    occ.reserve(x, z, 1.8);
  }
  return { stalls, stallSpots };
}

function noticeBoard(b, M, x, y, z, rot, rng) {
  b.push(pm(x, y, z, 0, rot, 0));
  for (const s of [-1, 1]) b.box(M.wood, pm(s * 0.85, 1.1, 0), 0.14, 2.2, 0.14, { uv: 'grain' });
  b.box(M.wood, pm(0, 1.45, 0), 1.9, 1.2, 0.08, { uvs: 0.9, color: [0.9, 0.75, 0.6] });
  // little roof
  b.box(M.roofRed, pm(0, 2.3, 0.12, 0.45, 0, 0), 2.1, 0.08, 0.6, { faces: { ny: M.timber }, uvs: 0.42 });
  b.box(M.roofRed, pm(0, 2.3, -0.12, -0.45, 0, 0), 2.1, 0.08, 0.6, { faces: { ny: M.timber }, uvs: 0.42 });
  // papers
  const cols = [[1.1, 1.08, 1.0], [1.1, 1.02, 0.8], [1.0, 1.05, 1.1], [1.1, 0.95, 0.95]];
  for (let i = 0; i < 6; i++) {
    const px = -0.65 + (i % 3) * 0.62 + (rng() - 0.5) * 0.08, py = 1.72 - Math.floor(i / 3) * 0.55;
    b.box(M.paint, pm(px, py, 0.06, 0, 0, (rng() - 0.5) * 0.15), 0.42, 0.44, 0.01, { color: cols[i % 4], skip: ['nz'] });
    b.geo(M.color, U.sphere(4, 3), pm(px, py + 0.18, 0.08, 0, 0, 0, 0.03), { color: [0.9, 0.2, 0.2] });
  }
  b.pop();
}

// wagon with horses + hay on the plaza, statue near the east staircase
export function plazaExtras(ctx, b, M, dyn, occ, rng) {
  const T = ctx.terrain;
  // wagon: first free candidate
  const wagonCands = [[-52, 30, Math.PI / 2 - 0.2], [-48, 24, Math.PI / 2], [-56, 36, Math.PI / 2 + 0.3], [-10, 42, -Math.PI / 2]];
  for (const [x, z, rot] of wagonCands) {
    const c = Math.cos(rot), s = Math.sin(rot);
    const pts = [-2, 0, 2, 4, 6].map((lz) => [x + lz * s, z + lz * c]);
    if (!pts.every(([px, pz]) => occ.free(px, pz, 2.4) && Math.abs(T.heightAt(px, pz) - 1.8) < 0.05)) continue;
    buildWagon(ctx, b, M, dyn, T, x, z, rot);
    for (const [px, pz] of pts) occ.reserve(px, pz, 2.6);
    break;
  }
  // statue near the foot of the east staircase, facing the plaza
  const R = RAMPS.find((r) => r.kind === 'stairs');
  const [sx0, sz0] = R.pts[0];
  const cands = [[sx0 - 11, sz0 + 9], [sx0 - 14, sz0 + 5], [sx0 - 9, sz0 + 13], [sx0 - 18, sz0 + 10]];
  for (const [x, z] of cands) {
    if (!occ.free(x, z, 3.6) || Math.abs(T.heightAt(x, z) - 1.8) > 0.05 || Math.abs(T.heightAt(x + 3, z + 3) - 1.8) > 0.05) continue;
    const rot = Math.atan2(FOUNTAIN.x - x, FOUNTAIN.z - z);
    statue(ctx, b, M, x, T.heightAt(x, z), z, rot);
    occ.reserve(x, z, 4);
    break;
  }
}

// cargo stacks around the crane
export function cargo(ctx, b, M, occ, rng, x0, z0, rot) {
  const T = ctx.terrain;
  const spots = [[-3, -1.5], [3.2, -1.2], [-3.6, 1.8], [3.8, 2.2], [0.5, -3.4]];
  const c = Math.cos(rot), s = Math.sin(rot);
  for (const [lx, lz] of spots) {
    const x = x0 + lx * c + lz * s, z = z0 - lx * s + lz * c;
    if (!occ.free(x, z, 1.1)) continue;
    const y = T.heightAt(x, z);
    const k = rng();
    if (k < 0.4) {
      crate(b, M, x, y, z, rot, 0.9);
      crate(b, M, x + 0.1, y + 0.9, z - 0.05, rot + 0.3, 0.7, { col: [1.1, 1.0, 0.9] });
      crate(b, M, x + 0.95 * c, y, z - 0.95 * s, rot - 0.2, 0.75);
    } else if (k < 0.7) {
      for (let i = 0; i < 3; i++) barrel(b, M, x + (i - 1) * 0.72 * c, y, z - (i - 1) * 0.72 * s, i, 1);
      barrel(b, M, x, y + 0.82, z, 0.5, 0.95);
    } else {
      for (let i = 0; i < 4; i++) sack(b, M, x + ((i % 2) - 0.5) * 0.6 * c, y + Math.floor(i / 2) * 0.45, z - ((i % 2) - 0.5) * 0.6 * s, i, 1.1);
      hayBale(b, M, x + 1.2 * s, y - 0.05, z + 1.2 * c, rot);
    }
    ctx.colliders.addCircle(x, z, 1.0);
    occ.reserve(x, z, 1.2);
  }
}

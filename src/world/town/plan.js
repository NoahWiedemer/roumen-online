// Town layout planning (pure data) for the Roumen harbour town:
//  - one house per map footprint (HOUSES), slightly enlarged and nudged so that streets, lanes,
//    ramps, NPC points and portals stay clear,
//  - infill houses along the main street and the south lane so the town feels dense,
//  - roughly a third of the houses use the imported house model (spec.glb).
import { HOUSES, NPC_POINTS, PORTALS, ROUND_TOWER, TOWN, Z, zoneAt } from '../layout.js';
import { mulberry32, clamp } from '../../core/utils.js';
import { makeHouseSpec } from './styles.js';

// ---------------------------------------------------------------- OBB helpers (three.js rotation.y convention)
export function obbCorners(o) {
  const c = Math.cos(o.rot), s = Math.sin(o.rot);
  return [[-o.hw, -o.hd], [o.hw, -o.hd], [o.hw, o.hd], [-o.hw, o.hd]].map(([lx, lz]) => [o.x + lx * c + lz * s, o.z - lx * s + lz * c]);
}
export function obbPoints(o, step = 0.9) {
  const c = Math.cos(o.rot), s = Math.sin(o.rot);
  const pts = [];
  const nx = Math.max(1, Math.ceil((o.hw * 2) / step)), nz = Math.max(1, Math.ceil((o.hd * 2) / step));
  for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) {
    if (i !== 0 && i !== nx && j !== 0 && j !== nz && (i % 3 || j % 3)) continue;
    const lx = -o.hw + (i / nx) * o.hw * 2, lz = -o.hd + (j / nz) * o.hd * 2;
    pts.push([o.x + lx * c + lz * s, o.z - lx * s + lz * c]);
  }
  return pts;
}
export function obbOverlap(a, b, margin = 0) {
  const A = obbCorners({ ...a, hw: a.hw + margin, hd: a.hd + margin }), B = obbCorners(b);
  const axes = [];
  for (const o of [a, b]) { const c = Math.cos(o.rot), s = Math.sin(o.rot); axes.push([c, -s], [s, c]); }
  for (const [ax, az] of axes) {
    let amin = 1e9, amax = -1e9, bmin = 1e9, bmax = -1e9;
    for (const [x, z] of A) { const p = x * ax + z * az; amin = Math.min(amin, p); amax = Math.max(amax, p); }
    for (const [x, z] of B) { const p = x * ax + z * az; bmin = Math.min(bmin, p); bmax = Math.max(bmax, p); }
    if (amax < bmin || bmax < amin) return false;
  }
  return true;
}
export function pointInObb(o, x, z, margin = 0) {
  const c = Math.cos(o.rot), s = Math.sin(o.rot);
  const dx = x - o.x, dz = z - o.z;
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  return Math.abs(lx) <= o.hw + margin && Math.abs(lz) <= o.hd + margin;
}
// distance from a point to an OBB (0 inside)
export function distToObb(o, x, z) {
  const c = Math.cos(o.rot), s = Math.sin(o.rot);
  const dx = x - o.x, dz = z - o.z;
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  const ex = Math.max(0, Math.abs(lx) - o.hw), ez = Math.max(0, Math.abs(lz) - o.hd);
  return Math.hypot(ex, ez);
}

// ---------------------------------------------------------------- path clearance
// min over paths of (distance to centreline - half width); paths: terrain.paths (+ decks/ramps)
export function makePathTester(T) {
  const polys = T.paths.filter((p) => p.kind !== 'trail').map((p) => {
    let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
    for (const s of p.samples) { x0 = Math.min(x0, s.x); z0 = Math.min(z0, s.z); x1 = Math.max(x1, s.x); z1 = Math.max(z1, s.z); }
    return { ...p, bb: [x0 - 12, z0 - 12, x1 + 12, z1 + 12] };
  });
  return (x, z) => {
    let best = 1e9, kind = null;
    for (const p of polys) {
      if (x < p.bb[0] || x > p.bb[2] || z < p.bb[1] || z > p.bb[3]) continue;
      let dmin = 1e9;
      const S = p.samples;
      for (let i = 0; i < S.length; i += 3) { const d = (S[i].x - x) ** 2 + (S[i].z - z) ** 2; if (d < dmin) dmin = d; }
      const g = Math.sqrt(dmin) - p.width / 2 - 0.35; // coarse sampling correction
      if (g < best) { best = g; kind = p.kind; }
    }
    return { gap: best, kind };
  };
}

// points that must stay clear of buildings / props
export function keepClearList() {
  const out = [];
  for (const [x, z] of Object.values(NPC_POINTS)) out.push({ x, z, r: 1.6, kind: 'npc' });
  for (const p of PORTALS) out.push({ x: p.x, z: p.z, r: 5, kind: 'portal' });
  out.push({ x: TOWN.spawn.x, z: TOWN.spawn.z, r: 2.5, kind: 'spawn' });
  return out;
}

// ---------------------------------------------------------------- planner
export function planTown(T, opts = {}) {
  const rng = mulberry32(777);
  const pathGap = makePathTester(T);
  const clear = keepClearList();
  const houses = [];
  const yards = []; // front yards of map houses (kept free of infill)
  const tower = { x: ROUND_TOWER[0], z: ROUND_TOWER[1], r: 4.2 };

  // minimum clearance (m) from each path kind's edge
  const GAPS = { street: 0.4, lane: 0.3, dirt: 0.6, stairs: 0.6 };
  const valid = (o, { laneSlack = 0, margin = 0.9, useYards = false, zones = [Z.TOWN], maxH = 2.7 } = {}) => {
    for (const [x, z] of obbPoints(o)) {
      if (!zones.includes(zoneAt(x, z))) return 'zone';
      const h = T.heightAt(x, z);
      if (h > maxH || h < 1.6) return 'height';
      const pg = pathGap(x, z);
      if (pg.gap < (GAPS[pg.kind] ?? 0.4) - (pg.kind === 'lane' ? laneSlack : 0)) return 'path:' + pg.kind;
    }
    for (const c of clear) if (distToObb(o, c.x, c.z) < c.r) return 'clear:' + c.kind;
    if (distToObb(o, tower.x, tower.z) < tower.r) return 'tower';
    for (const h of houses) if (obbOverlap(o, h.obb, margin)) return 'house';
    if (useYards) for (const y of yards) if (obbOverlap(o, y, 0.2)) return 'yard';
    return null;
  };

  let seed = 11;
  // ---- 1. map footprints
  HOUSES.forEach((H, idx) => {
    let rot = -H.angle * Math.PI / 180;
    if (H.face === 'n') rot += Math.PI;
    const c = Math.cos(rot), s = Math.sin(rot);
    let placed = null;
    const grow = [[1.18, 1.12], [1.12, 1.08], [1.05, 1.0], [1.0, 0.95], [0.92, 0.9], [0.85, 0.85], [0.78, 0.8]];
    const shifts = [[0, 0], [0, 0.6], [0, -0.6], [0.8, 0], [-0.8, 0], [0, 1.2], [0, -1.2], [1.6, 0], [-1.6, 0], [1.2, 1.2], [-1.2, 1.2], [1.2, -1.2], [-1.2, -1.2], [0, 2], [0, -2], [2.4, 0], [-2.4, 0], [0, 2.8], [0, -2.8], [3.2, 0], [-3.2, 0]];
    const tries = [{ laneSlack: 0, margin: 0.4 }, { laneSlack: 0.6, margin: 0.3, zones: [Z.TOWN, Z.FOREST, Z.FIELD, Z.SAND], maxH: 3.6 }, { laneSlack: 1.2, margin: 0.3, zones: [Z.TOWN, Z.FOREST, Z.FIELD, Z.SAND], maxH: 3.6 }];
    outer: for (const opt of tries) for (const [gw, gd] of grow) {
      for (const [sx, sz] of shifts) {
        const w = H.w * gw, d = H.d * gd;
        const o = { x: H.x + sx * c + sz * s, z: H.z - sx * s + sz * c, hw: w / 2 + 0.15, hd: d / 2 + 0.15, rot };
        if (!valid(o, opt)) { placed = { o, w, d }; break outer; }
      }
    }
    if (!placed) {
      if (globalThis.__planLog) globalThis.__planLog.push('map house ' + idx + ' unplaced: ' + valid({ x: H.x, z: H.z, hw: H.w / 2, hd: H.d / 2, rot }, { laneSlack: 1.3, zones: [3, 4, 5, 2], maxH: 3.6 }));
      return;
    }
    const { o, w, d } = placed;
    const kind = ['plain', 'inn', 'potion', 'plain', 'armor', 'plain', 'storage', 'plain', 'smithy', 'plain', 'bakery', 'plain', 'plain', 'potion', 'plain', 'plain', 'plain'][idx] || 'plain';
    const spec = makeHouseSpec(seed++ * 37 + idx, kind === 'smithy' ? 'armor' : kind, { w, d, floors: w > 10 ? 3 : undefined });
    if (kind === 'smithy') spec.sign = 1; // weapon sign
    finalize(spec, o, 'map', idx);
    // front yard (keeps the view / access to the facade open)
    yards.push({ x: o.x + s * (d / 2 + 3.2), z: o.z + c * (d / 2 + 3.2), hw: w / 2 + 0.5, hd: 3, rot });
  });

  function finalize(spec, o, src, idx) {
    spec.x = o.x; spec.z = o.z; spec.rotY = o.rot; spec.obb = o; spec.src = src; spec.mapIndex = idx;
    let hmin = 1e9, hmax = -1e9;
    for (const [x, z] of obbPoints(o)) { const h = T.heightAt(x, z); hmin = Math.min(hmin, h); hmax = Math.max(hmax, h); }
    spec.groundMin = hmin; spec.groundMax = hmax;
    spec.floorY = Math.max(hmax, 2.2) + 0.28;
    const nb = Math.max(2, Math.round(spec.w / 2.05));
    const dx = -spec.w / 2 + (spec.doorBay + 0.5) * (spec.w / nb);
    const c = Math.cos(o.rot), s = Math.sin(o.rot);
    const px = o.x + dx * c + (spec.d / 2 + 0.5) * s, pz = o.z - dx * s + (spec.d / 2 + 0.5) * c;
    spec.stepH = Math.max(0.15, spec.floorY - T.heightAt(px, pz));
    spec.turret = spec.turret && spec.w > 7.5 ? spec.turret : 0;
    houses.push(spec);
  }

  // ---- 2. infill along street lines
  const lines = [
    { samples: T.paths[0].samples, half: T.paths[0].width / 2, side: -1, face: 'toward' }, // north side of main street
    { samples: T.paths[0].samples, half: T.paths[0].width / 2, side: 1, face: 'toward' },  // south side
    { samples: T.paths[2].samples, half: T.paths[2].width / 2, side: 1, face: 'away' }, // south lane, facing the plaza
  ];
  for (const Ln of lines) {
    const S = Ln.samples, len = S[S.length - 1].s;
    for (let s = 4; s < len - 4; s += 1.0) {
      const w = 6.0 + rng() * 3, d = Ln.side < 0 ? 4.6 + rng() * 1.4 : 5.2 + rng() * 1.8;
      const i = Math.min(S.length - 1, Math.round(((s + w / 2) / len) * (S.length - 1)));
      const p = S[i];
      // outward normal on the chosen side (side=+1 -> +z-ish (south) for an eastward street)
      let nx = -p.tz, nz = p.tx;
      if (nz * Ln.side < 0) { nx = -nx; nz = -nz; }
      const off = Ln.half + 0.9 + d / 2 + rng() * 0.5;
      const cx = p.x + nx * off, cz = p.z + nz * off;
      const rot = Ln.face === 'toward' ? Math.atan2(-nx, -nz) : Math.atan2(nx, nz);
      const o = { x: cx, z: cz, hw: w / 2 + 0.15, hd: d / 2 + 0.15, rot };
      const why = valid(o, { margin: 1.1, useYards: true });
      if (globalThis.__planLog) globalThis.__planLog.push('infill ' + lines.indexOf(Ln) + ' s' + s.toFixed(0) + ' ' + (why || 'ok'));
      if (why) continue;
      const spec = makeHouseSpec(seed++ * 41 + 3, 'plain', { w, d, floors: rng() < 0.3 ? 3 : 2 });
      finalize(spec, o, 'infill', -1);
      s += w + 1.8 + rng() * 2.5;
    }
  }

  // ---- 3. which houses use the imported model: about a third, mid-sized, varied positions.
  //         The model keeps its proportions, so its footprint is re-validated at the new size.
  if (opts.glb) {
    const ms = opts.modelSize || { x: 1.9, z: 1.25 };
    const target = Math.round(houses.length / 3);
    const cand = houses.filter((h) => !h.shop && h.kind === 'plain' && h.w >= 5.5 && h.w <= 13);
    // spread the choice along the town (alternate candidates sorted by x)
    cand.sort((a, c) => a.x - c.x);
    const order = cand.filter((h, i) => i % 2 === 0).concat(cand.filter((h, i) => i % 2 === 1));
    let n = 0;
    for (const h of order) {
      if (n >= target) break;
      const others = houses.filter((o) => o !== h);
      const saved = houses.splice(0, houses.length, ...others);
      let ok = null;
      for (const k of [6.0, 5.6, 5.2, 4.8, 4.4]) {
        const w = ms.x * k, d = ms.z * k;
        for (const [sx, sz] of [[0, 0], [0, -0.8], [0, 0.8], [0.8, 0], [-0.8, 0], [0, -1.6]]) {
          const c = Math.cos(h.rotY), s = Math.sin(h.rotY);
          const o = { x: h.x + sx * c + sz * s, z: h.z - sx * s + sz * c, hw: w / 2 + 0.15, hd: d / 2 + 0.15, rot: h.rotY };
          if (!valid(o, { laneSlack: 0.3, margin: 0.5, zones: [Z.TOWN, Z.SAND], maxH: 2.8 })) { ok = { o, w, d, k }; break; }
        }
        if (ok) break;
      }
      houses.splice(0, houses.length, ...saved);
      if (!ok) continue;
      h.glb = true; h.w = ok.w; h.d = ok.d; h.x = ok.o.x; h.z = ok.o.z; h.obb = ok.o; h.modelK = ok.k;
      h.turret = 0; h.shop = null; h.sign = null;
      let hmin = 1e9, hmax = -1e9;
      for (const [x, z] of obbPoints(ok.o)) { const hh = T.heightAt(x, z); hmin = Math.min(hmin, hh); hmax = Math.max(hmax, hh); }
      h.groundMin = hmin; h.groundMax = hmax; h.floorY = Math.max(hmax, 2.2) + 0.28;
      n++;
    }
  }
  return { houses, yards };
}

export { clamp };

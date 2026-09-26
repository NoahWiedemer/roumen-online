// Tower of Isel — architecture: parquet floors (laid in rings in the round halls), sea-green stone walls with a
// wooden wainscot, pilasters and a timber ring beam, timber ceilings on heavy beams, door arches where the stairs
// come in, and the enclosed stairwells (wooden steps, stone side walls, beamed ceiling, golden handrails).
// Walls and ceilings face inwards only: from the follow camera outside a room they are invisible, so the camera
// never gets blocked. They do not cast shadows (they would black out the rooms); props do.
import * as THREE from 'three';
import { GeoBuilder, pm, U } from '../town/builder.js';
import { townMaterials } from '../town/materials.js';
import { ROOMS, PATHS, CORE, ZONE, inRoom } from './layout.js';
import { stoneTex, stoneNormal, parquetTex, parquetNormal, carpetTex, windowTex } from './textures.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const DOOR_H = 5.6;           // clear height of a doorway
export const WAIN = 2.3;             // height of the wooden wainscot
const WALL_UVS = 0.19;               // stone texture repeats per metre
// ceiling beams have no top faces: a follow camera zoomed out above a room looks through them
const CEIL_SKIP = ['py'];

let MATS = null;
export function iselMaterials() {
  if (MATS) return MATS;
  const T = townMaterials();
  const std = (name, o) => { const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, ...o }); m.name = name; return m; };
  MATS = {
    stone: std('isel_stone', { map: stoneTex(), normalMap: stoneNormal(), normalScale: new THREE.Vector2(1.1, 1.1), roughness: 0.9 }),
    parquet: std('isel_parquet', { map: parquetTex(), normalMap: parquetNormal(), normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.62 }),
    carpet: std('isel_carpet', { map: carpetTex(), roughness: 0.95 }),
    window: std('isel_window', { map: windowTex(), emissive: 0xffffff, emissiveMap: windowTex(), emissiveIntensity: 0.9, roughness: 0.4 }),
    wood: T.wood, timber: T.timber, gold: T.gold, iron: T.iron, plaster: T.plaster, cream: T.cream, color: T.color,
  };
  return MATS;
}

// door openings of a room: where a path starts / ends inside it (angle for round rooms, point + normal for rects)
export function roomDoors(room) {
  const doors = [];
  for (const p of PATHS) {
    const ends = [[p.pts[0], p.pts[1]], [p.pts[p.pts.length - 1], p.pts[p.pts.length - 2]]];
    for (const [a, b] of ends) {
      if (!inRoom(room, a[0], a[1])) continue;
      // where the path leaves the room: walk from the inner end towards the next point until outside
      const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
      let t = 0;
      while (t < L && inRoom(room, a[0] + dx / L * t, a[1] + dz / L * t)) t += 0.1;
      doors.push({ x: a[0] + dx / L * t, z: a[1] + dz / L * t, dx: dx / L, dz: dz / L, hw: p.w / 2 + 0.25, y: a[2], path: p.id });
    }
  }
  return doors;
}

// ------------------------------------------------------------------ helpers
// vertical wall quad from (ax,az) to (bx,bz), from y0 to y1, facing `n` (inwards)
function wallQuad(b, mat, ax, az, bx, bz, y0a, y1a, y0b = y0a, y1b = y1a, col = [1, 1, 1], nx = 0, nz = 0) {
  b.quadN(mat, V(ax, y0a, az), V(bx, y0b, bz), V(bx, y1b, bz), V(ax, y1a, az),
    uvW(ax, az, y0a), uvW(bx, bz, y0b), uvW(bx, bz, y1b), uvW(ax, az, y1a), col, V(nx, 0, nz), false);
}
// wall uv: horizontal distance along the wall is approximated by x+z (walls are axis aligned or short segments)
function uvW(x, z, y) { return [(x + z) * WALL_UVS, y * WALL_UVS]; }

// ------------------------------------------------------------------ round hall
function circleRoom(b, M, r, doors) {
  const N = 72, R = r.r, y = r.y, H = r.h;
  const cx = r.x, cz = r.z;
  const doorAt = (a) => doors.find((d) => {
    const da = Math.atan2(d.z - cz, d.x - cx);
    return Math.abs(Math.atan2(Math.sin(a - da), Math.cos(a - da))) < d.hw / R;
  });
  // floor: parquet in rings (planks follow the circles), a stone medallion in the middle
  const rings = Math.ceil(R / 1.4);
  for (let i = 0; i < rings; i++) {
    const r0 = (i / rings) * R, r1 = ((i + 1) / rings) * R;
    for (let k = 0; k < N; k++) {
      const a0 = (k / N) * Math.PI * 2, a1 = ((k + 1) / N) * Math.PI * 2;
      const P = (a, rr) => V(cx + Math.cos(a) * rr, y, cz + Math.sin(a) * rr);
      const T = (a, rr) => [a * Math.max(rr, 1.5) / 1.3, rr / 1.3];
      b.quadN(M.parquet, P(a0, r0), P(a1, r0), P(a1, r1), P(a0, r1), T(a0, r0), T(a1, r0), T(a1, r1), T(a0, r1), [1, 1, 1], V(0, 1, 0), false);
    }
  }
  b.geo(M.stone, U.circle(40), pm(cx, y + 0.02, cz, 0, 0, 0, 3.4, 1, 3.4), { uv: 'frame', uvs: 0.35, color: [0.95, 1, 1.02] });
  b.geo(M.gold, U.torus(1, 0.035, 6, 48), pm(cx, y + 0.03, cz, Math.PI / 2, 0, 0, 3.45, 3.45, 3.45), {});
  b.geo(M.gold, U.torus(1, 0.03, 6, 40), pm(cx, y + 0.03, cz, Math.PI / 2, 0, 0, 1.6, 1.6, 1.6), {});
  // wall: stone above a wooden wainscot, openings for the doors (the lintel above a door stays)
  for (let k = 0; k < N; k++) {
    const a0 = (k / N) * Math.PI * 2, a1 = ((k + 1) / N) * Math.PI * 2, am = (a0 + a1) / 2;
    const ax = cx + Math.cos(a0) * R, az = cz + Math.sin(a0) * R, bx = cx + Math.cos(a1) * R, bz = cz + Math.sin(a1) * R;
    const nx = -Math.cos(am), nz = -Math.sin(am);
    const door = doorAt(am);
    const yb = door ? y + DOOR_H : y;
    wallQuad(b, M.stone, ax, az, bx, bz, yb, y + H, yb, y + H, [1, 1, 1], nx, nz);
    if (!door) {
      const wr = R - 0.06;
      const wx0 = cx + Math.cos(a0) * wr, wz0 = cz + Math.sin(a0) * wr, wx1 = cx + Math.cos(a1) * wr, wz1 = cz + Math.sin(a1) * wr;
      b.quadN(M.wood, V(wx0, y, wz0), V(wx1, y, wz1), V(wx1, y + WAIN, wz1), V(wx0, y + WAIN, wz0),
        [a0 * R * 0.5, 0], [a1 * R * 0.5, 0], [a1 * R * 0.5, 1.2], [a0 * R * 0.5, 1.2], [0.72, 0.6, 0.52], V(nx, 0, nz), false);
    }
  }
  // wainscot cap rail + ring beam under the ceiling, pilasters between the doors
  ringBeams(b, M, cx, cz, R, y, H, doorAt);
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2 + Math.PI / 12;
    if (doorAt(a) || doorAt(a + 0.06) || doorAt(a - 0.06)) continue;
    const px = cx + Math.cos(a) * (R - 0.35), pz = cz + Math.sin(a) * (R - 0.35);
    b.box(M.stone, pm(px, y + H / 2, pz, 0, -a + Math.PI / 2, 0), 1.1, H, 0.7, { uv: 'frame', uvs: WALL_UVS, color: [0.86, 0.92, 0.94], ao: false });
    b.box(M.timber, pm(px, y + 0.3, pz, 0, -a + Math.PI / 2, 0), 1.3, 0.6, 0.9, { uv: 'grain', uvs: 0.8, color: [0.9, 0.8, 0.7], ao: false });
  }
  // ceiling: timber planks on radial beams with a carved boss in the middle
  for (let k = 0; k < N; k++) {
    const a0 = (k / N) * Math.PI * 2, a1 = ((k + 1) / N) * Math.PI * 2;
    b.triN(M.timber, V(cx, y + H, cz), V(cx + Math.cos(a0) * R, y + H, cz + Math.sin(a0) * R), V(cx + Math.cos(a1) * R, y + H, cz + Math.sin(a1) * R),
      [0, 0], [a0 * R * 0.3, R * 0.3], [a1 * R * 0.3, R * 0.3], [0.62, 0.52, 0.46], V(0, -1, 0), false);
  }
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    const mx = cx + Math.cos(a) * R / 2, mz = cz + Math.sin(a) * R / 2;
    b.box(M.timber, pm(mx, y + H - 0.35, mz, 0, -a, 0), R, 0.6, 0.55, { uv: 'grain', uvs: 0.6, color: [0.8, 0.66, 0.55], ao: false, skip: CEIL_SKIP });
  }
  b.geo(M.timber, U.cyl(16), pm(cx, y + H - 0.6, cz, 0, 0, 0, 1.6, 1.2, 1.6), { color: [0.85, 0.7, 0.58] });
  b.geo(M.gold, U.torus(1, 0.12, 6, 24), pm(cx, y + H - 1.2, cz, Math.PI / 2, 0, 0, 1.6, 1.6, 1.6), {});
}

function ringBeams(b, M, cx, cz, R, y, H, doorAt) {
  const N = 48;
  for (let k = 0; k < N; k++) {
    const a0 = (k / N) * Math.PI * 2, a1 = ((k + 1) / N) * Math.PI * 2, am = (a0 + a1) / 2;
    const len = 2 * (R - 0.25) * Math.sin(Math.PI / N) + 0.05;
    const px = cx + Math.cos(am) * (R - 0.25), pz = cz + Math.sin(am) * (R - 0.25);
    if (!doorAt(am)) b.box(M.timber, pm(px, y + WAIN + 0.06, pz, 0, -am + Math.PI / 2, 0), len, 0.16, 0.34, { uv: 'grain', uvs: 0.8, color: [0.78, 0.62, 0.5], ao: false });
    b.box(M.timber, pm(px, y + H - 1.3, pz, 0, -am + Math.PI / 2, 0), len, 0.7, 0.5, { uv: 'grain', uvs: 0.6, color: [0.72, 0.58, 0.48], ao: false, skip: CEIL_SKIP });
  }
}

// ------------------------------------------------------------------ long hall
function rectRoom(b, M, r, doors, { windows = [] } = {}) {
  const { x0, x1, z0, z1, y, h: H } = r;
  // floor: parquet, world aligned planks running along the hall
  b.quadN(M.parquet, V(x0, y, z0), V(x1, y, z0), V(x1, y, z1), V(x0, y, z1), [x0 / 1.3, z0 / 1.3], [x1 / 1.3, z0 / 1.3], [x1 / 1.3, z1 / 1.3], [x0 / 1.3, z1 / 1.3], [1, 1, 1], V(0, 1, 0), false);
  // walls, per side in 1 m pieces so the doors can cut openings
  const sides = [
    { ax: x0, az: z1, bx: x0, bz: z0, nx: 1, nz: 0 },   // west
    { ax: x1, az: z0, bx: x1, bz: z1, nx: -1, nz: 0 },  // east
    { ax: x0, az: z0, bx: x1, bz: z0, nx: 0, nz: 1 },   // north
    { ax: x1, az: z1, bx: x0, bz: z1, nx: 0, nz: -1 },  // south
  ];
  const doorNear = (x, z) => doors.find((d) => Math.hypot(x - d.x, z - d.z) < d.hw);
  const winNear = (x, z) => windows.find((w) => Math.hypot(x - w.x, z - w.z) < w.w / 2);
  for (const s of sides) {
    const L = Math.hypot(s.bx - s.ax, s.bz - s.az), n = Math.ceil(L), ux = (s.bx - s.ax) / L, uz = (s.bz - s.az) / L;
    for (let i = 0; i < n; i++) {
      const t0 = (i / n) * L, t1 = ((i + 1) / n) * L;
      const ax = s.ax + ux * t0, az = s.az + uz * t0, bx = s.ax + ux * t1, bz = s.az + uz * t1;
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      const door = doorNear(mx, mz), win = !door && winNear(mx, mz);
      const yb = door ? y + DOOR_H : y;
      if (win) {
        wallQuad(b, M.stone, ax, az, bx, bz, y, win.y0, y, win.y0, [1, 1, 1], s.nx, s.nz);
        wallQuad(b, M.stone, ax, az, bx, bz, win.y1, y + H, win.y1, y + H, [1, 1, 1], s.nx, s.nz);
      } else wallQuad(b, M.stone, ax, az, bx, bz, yb, y + H, yb, y + H, [1, 1, 1], s.nx, s.nz);
      if (!door) {
        const ox = s.nx * 0.06, oz = s.nz * 0.06;
        b.quadN(M.wood, V(ax + ox, y, az + oz), V(bx + ox, y, bz + oz), V(bx + ox, y + WAIN, bz + oz), V(ax + ox, y + WAIN, az + oz),
          [t0 * 0.5, 0], [t1 * 0.5, 0], [t1 * 0.5, 1.2], [t0 * 0.5, 1.2], [0.72, 0.6, 0.52], V(s.nx, 0, s.nz), false);
        b.box(M.timber, pm(mx + s.nx * 0.2, y + WAIN + 0.06, mz + s.nz * 0.2, 0, Math.atan2(ux, uz) + Math.PI / 2, 0), 1.02, 0.16, 0.34, { uv: 'grain', uvs: 0.8, color: [0.78, 0.62, 0.5], ao: false });
      }
      b.box(M.timber, pm(mx + s.nx * 0.25, y + H - 1.3, mz + s.nz * 0.25, 0, Math.atan2(ux, uz) + Math.PI / 2, 0), 1.02, 0.7, 0.5, { uv: 'grain', uvs: 0.6, color: [0.72, 0.58, 0.48], ao: false, skip: CEIL_SKIP });
    }
    // pilasters every ~6.5 m
    const np = Math.floor(L / 6.5);
    for (let i = 1; i < np; i++) {
      const t = (i / np) * L, px = s.ax + ux * t + s.nx * 0.35, pz = s.az + uz * t + s.nz * 0.35;
      if (doorNear(px, pz) || winNear(px, pz)) continue;
      b.box(M.stone, pm(px, y + H / 2, pz, 0, Math.atan2(ux, uz), 0), 0.7, H, 1.1, { uv: 'frame', uvs: WALL_UVS, color: [0.86, 0.92, 0.94], ao: false });
      b.box(M.timber, pm(px, y + 0.3, pz, 0, Math.atan2(ux, uz), 0), 0.9, 0.6, 1.3, { uv: 'grain', uvs: 0.8, color: [0.9, 0.8, 0.7], ao: false });
    }
  }
  // windows: glowing daylight panes set into the wall, with a stone sill
  for (const w of windows) {
    const tx = -w.nz, tz = w.nx, hw = w.w / 2;       // along the wall
    const px = w.x - w.nx * 0.05, pz = w.z - w.nz * 0.05;
    b.quadN(M.window, V(px - tx * hw, w.y0, pz - tz * hw), V(px + tx * hw, w.y0, pz + tz * hw), V(px + tx * hw, w.y1, pz + tz * hw), V(px - tx * hw, w.y1, pz - tz * hw),
      [0, 0], [1, 0], [1, 1], [0, 1], [1, 1, 1], V(w.nx, 0, w.nz), false);
    b.box(M.stone, pm(w.x + w.nx * 0.2, w.y0 - 0.12, w.z + w.nz * 0.2, 0, Math.atan2(-tz, tx), 0), w.w + 0.6, 0.24, 0.5, { uv: 'frame', uvs: 0.4, color: [0.9, 0.95, 0.97] });
  }
  // ceiling: planks on cross beams
  b.quadN(M.timber, V(x0, y + H, z0), V(x1, y + H, z0), V(x1, y + H, z1), V(x0, y + H, z1), [x0 * 0.3, z0 * 0.3], [x1 * 0.3, z0 * 0.3], [x1 * 0.3, z1 * 0.3], [x0 * 0.3, z1 * 0.3], [0.62, 0.52, 0.46], V(0, -1, 0), false);
  const alongX = (x1 - x0) > (z1 - z0);
  const span = alongX ? x1 - x0 : z1 - z0, n = Math.floor(span / 4.2);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (alongX) b.box(M.timber, pm(x0 + (x1 - x0) * t, y + H - 0.4, (z0 + z1) / 2), 0.6, 0.7, z1 - z0, { uv: 'grain', uvs: 0.6, color: [0.8, 0.66, 0.55], ao: false, skip: CEIL_SKIP });
    else b.box(M.timber, pm((x0 + x1) / 2, y + H - 0.4, z0 + (z1 - z0) * t), x1 - x0, 0.7, 0.6, { uv: 'grain', uvs: 0.6, color: [0.8, 0.66, 0.55], ao: false, skip: CEIL_SKIP });
  }
  if (alongX) b.box(M.timber, pm((x0 + x1) / 2, y + H - 0.9, (z0 + z1) / 2), x1 - x0, 0.5, 0.5, { uv: 'grain', uvs: 0.6, color: [0.75, 0.6, 0.5], ao: false, skip: CEIL_SKIP });
  else b.box(M.timber, pm((x0 + x1) / 2, y + H - 0.9, (z0 + z1) / 2), 0.5, 0.5, z1 - z0, { uv: 'grain', uvs: 0.6, color: [0.75, 0.6, 0.5], ao: false, skip: CEIL_SKIP });
}

// ------------------------------------------------------------------ door frames (seen from inside the room)
function doorFrame(b, M, d, roomY) {
  const nx = -d.dx, nz = -d.dz;                  // pointing back into the room
  const tx = -nz, tz = nx;                        // along the wall
  const y = roomY;
  const rot = Math.atan2(-tz, tx);               // box local x along the wall
  for (const s of [-1, 1]) {
    const jx = d.x + tx * s * (d.hw + 0.35) + nx * 0.2, jz = d.z + tz * s * (d.hw + 0.35) + nz * 0.2;
    b.box(M.stone, pm(jx, y + DOOR_H / 2, jz, 0, rot, 0), 0.9, DOOR_H, 0.9, { uv: 'frame', uvs: 0.3, color: [0.8, 0.86, 0.9] });
    b.box(M.stone, pm(jx, y + 0.25, jz, 0, rot, 0), 1.1, 0.5, 1.1, { uv: 'frame', uvs: 0.3, color: [0.7, 0.76, 0.8] });
  }
  // lintel beam with a gilded keystone: only its room side and underside are built (seen from the stairwell the
  // follow camera looks over it, and a solid beam there would hide the hero)
  const lx = d.x + nx * 0.2, lz = d.z + nz * 0.2, only = { skip: ['px', 'nx', 'py', 'pz'] };
  b.box(M.timber, pm(lx, y + DOOR_H + 0.3, lz, 0, rot, 0), 2 * d.hw + 2.2, 0.7, 1.0, { uv: 'grain', uvs: 0.6, color: [0.85, 0.7, 0.58], ...only });
  b.box(M.gold, pm(lx + nx * 0.5, y + DOOR_H + 0.35, lz + nz * 0.5, 0, rot, 0), 0.7, 0.9, 0.2, only);
}

// ------------------------------------------------------------------ stairwells and corridors
// Walls / ceiling / rails are laid where the path centre is outside every room (the rooms bring their own)
function pathWell(b, bp, M, p) {
  const W = p.w, hw = W / 2, WALL = 7.2;
  const pts = p.pts;
  // (the tunnels out to the outer stair end at the core's outer wall; the stair itself is built by outside.js)
  const inCore = (x, z) => !p.core || Math.hypot(x - CORE.x, z - CORE.z) < CORE.r + 0.2;
  const outside = (x, z) => inCore(x, z) && !ROOMS.some((r) => inRoom(r, x, z, -0.2));
  let dist = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az, ay] = pts[i], [bx, bz, by] = pts[i + 1];
    const L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L, nx = -uz, nz = ux;
    const rise = by - ay;
    // floor: thick stone steps where it climbs (a pale slab on each), planks where it is flat
    if (Math.abs(rise) > 0.01 && p.steps) {
      const nSteps = Math.max(1, Math.round(Math.abs(rise) / 0.28));
      const run = L / nSteps, dy = rise / nSteps;
      for (let s = 0; s < nSteps; s++) {
        const t = (s + 0.5) * run, cxs = ax + ux * t, czs = az + uz * t;
        const top = ay + dy * (s + 0.5) + Math.abs(dy) * 0.5;
        const hStep = Math.abs(dy) * (s + 1) + 0.6;
        bp.box(M.stone, pm(cxs, top - hStep / 2 - 0.05, czs, 0, Math.atan2(ux, uz), 0), W, hStep, run + 0.02, { uv: 'frame', uvs: 0.3, color: [0.74, 0.8, 0.82], ao: false });
        bp.box(M.stone, pm(cxs, top - 0.07, czs, 0, Math.atan2(ux, uz), 0), W - 0.2, 0.14, run + 0.1, { uv: 'frame', uvs: 0.5, color: [0.97, 1, 1.02], ao: false });
      }
    } else {
      // flat floor, clipped to the core for the tunnels out to / in from the outer stair (the part of the segment
      // inside the round tower, whichever end the path starts from)
      let t0 = 0, t1 = L;
      if (p.core) {
        const inside = (t) => Math.hypot(ax + ux * t - CORE.x, az + uz * t - CORE.z) < CORE.r;
        while (t0 < L && !inside(t0)) t0 += 0.05;
        t1 = t0;
        while (t1 < L && inside(t1)) t1 += 0.05;
        t1 = Math.min(t1, L);
      }
      const sx = ax + ux * t0, sz = az + uz * t0, sy = ay + rise * (t0 / L);
      const ex = ax + ux * t1, ez = az + uz * t1, ey = ay + rise * (t1 / L);
      if (t1 - t0 > 0.01) {
        b.quadN(M.wood, V(sx + nx * hw, sy, sz + nz * hw), V(ex + nx * hw, ey, ez + nz * hw), V(ex - nx * hw, ey, ez - nz * hw), V(sx - nx * hw, sy, sz - nz * hw),
          [0, (dist + t0) * 0.6], [0, (dist + t1) * 0.6], [W * 0.6, (dist + t1) * 0.6], [W * 0.6, (dist + t0) * 0.6], [0.95, 0.82, 0.66], V(0, 1, 0), false);
      }
    }
    // walls, ceiling, rails and lamps in 1 m pieces
    const n = Math.ceil(L);
    for (let k = 0; k < n; k++) {
      const t0 = (k / n) * L, t1 = ((k + 1) / n) * L, tm = (t0 + t1) / 2;
      const mx = ax + ux * tm, mz = az + uz * tm;
      if (!outside(mx, mz)) continue;
      const y0 = ay + rise * (t0 / L), y1 = ay + rise * (t1 / L);
      const px0 = ax + ux * t0, pz0 = az + uz * t0, px1 = ax + ux * t1, pz1 = az + uz * t1;
      for (const s of [-1, 1]) {
        const ox = nx * hw * s, oz = nz * hw * s;
        wallQuad(b, M.stone, px0 + ox, pz0 + oz, px1 + ox, pz1 + oz, y0 - 1.5, y0 + WALL, y1 - 1.5, y1 + WALL, [0.9, 0.95, 0.97], -nx * s, -nz * s);
      }
      b.quadN(M.timber, V(px0 + nx * hw, y0 + WALL, pz0 + nz * hw), V(px1 + nx * hw, y1 + WALL, pz1 + nz * hw), V(px1 - nx * hw, y1 + WALL, pz1 - nz * hw), V(px0 - nx * hw, y0 + WALL, pz0 - nz * hw),
        [0, (dist + t0) * 0.3], [0, (dist + t1) * 0.3], [W * 0.3, (dist + t1) * 0.3], [W * 0.3, (dist + t0) * 0.3], [0.6, 0.5, 0.44], V(0, -1, 0), false);
    }
    // cross beams under the ceiling (their undersides only: from above the follow camera looks through them),
    // handrails on posts along both walls
    for (let t = 1.5; t < L; t += 3) {
      const mx = ax + ux * t, mz = az + uz * t;
      if (!outside(mx, mz)) continue;
      const yy = ay + rise * (t / L);
      b.box(M.timber, pm(mx, yy + WALL - 0.35, mz, 0, Math.atan2(ux, uz), 0), W, 0.55, 0.45, { uv: 'grain', uvs: 0.6, color: [0.8, 0.66, 0.55], ao: false, skip: ['px', 'nx', 'py', 'pz', 'nz'] });
    }
    for (const s of [-1, 1]) {
      const inset = hw - 0.35;
      let prev = null;
      for (let t = 0; t <= L + 1e-6; t += Math.min(2.4, L)) {
        const mx = ax + ux * t + nx * inset * s, mz = az + uz * t + nz * inset * s;
        const yy = ay + rise * (t / L);
        const cur = V(mx, yy + 1.05, mz);
        if (outside(ax + ux * t, az + uz * t)) {
          bp.geo(M.gold, U.cyl(8), pm(mx, yy + 0.52, mz, 0, 0, 0, 0.07, 1.05, 0.07), { color: [0.9, 0.72, 0.4] });
          bp.geo(M.gold, U.sphere(8, 6), pm(mx, yy + 1.08, mz, 0, 0, 0, 0.1, 0.1, 0.1), {});
          if (prev) {
            const mid = prev.clone().add(cur).multiplyScalar(0.5), len = prev.distanceTo(cur);
            const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), cur.clone().sub(prev).normalize());
            bp.geo(M.gold, U.cyl(8), new THREE.Matrix4().compose(mid, q, V(0.055, len, 0.055)), { color: [0.95, 0.76, 0.42] });
          }
          prev = cur;
        } else prev = null;
      }
    }
    dist += L;
  }
}

// ------------------------------------------------------------------ build everything
// returns { rooms: [{room, doors, windows}], stats }; geometry goes to the batchers of each room's / path's zone
export function buildArchitecture(ctx) {
  const M = iselMaterials();
  const B = {};
  // walls / floors / ceilings (no shadows) and frames, steps, rails (cast shadows), per visibility zone
  const zb = (id) => (B[ZONE[id]] ||= { walls: new GeoBuilder(), props: new GeoBuilder() });
  const out = [];
  for (const r of ROOMS) {
    const doors = roomDoors(r), { walls, props } = zb(r.id);
    const windows = r.style === 'statues'
      ? [6, 14, 22].flatMap((z) => [{ x: r.x1, z: z - 6, w: 2.6, y0: r.y + 4.2, y1: r.y + 10.5, nx: -1, nz: 0 }])
      : r.style === 'throne' ? [-6, 6, 18, 28].map((x) => ({ x, z: r.z1, w: 3, y0: r.y + 6, y1: r.y + 15, nx: 0, nz: -1 })) : [];
    if (r.shape === 'circle') circleRoom(walls, M, r, doors);
    else rectRoom(walls, M, r, doors, { windows });
    for (const d of doors) doorFrame(props, M, d, r.y);
    out.push({ room: r, doors, windows });
  }
  for (const p of PATHS) { const { walls, props } = zb(p.id); pathWell(walls, props, M, p); }
  let tris = 0;
  for (const [zone, { walls, props }] of Object.entries(B)) {
    tris += walls.triangleCount() + props.triangleCount();
    walls.flush(ctx.zones[zone].batcherNoShadow);
    props.flush(ctx.zones[zone].batcher);
  }
  return { rooms: out, stats: { tris: Math.round(tris) } };
}

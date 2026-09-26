// Tower of Isel — walkable surfaces as an analytic height field with the terrain interface the game expects
// (heightAt / groundAt / deckAt / normalAt / slopeAt / isWater / isVoid / minimapColor / mesh). Floors, stair ramps
// and the outer stair are exact; everything else is "void" (far below, never walkable). The visible floors are
// built as meshes by architecture.js; this object only answers questions.
import * as THREE from 'three';
import { MAP, ROOMS, PATHS, CORE, OUTER, OUTER_PROFILE, VAULT, inRoom, daisHeight } from './layout.js';

const VOID_Y = -40;

// nearest point on a polyline of [x, z, y]: distance across and height there
function onPath(p, x, z) {
  let best = null;
  for (let i = 0; i < p.pts.length - 1; i++) {
    const [ax, az, ay] = p.pts[i], [bx, bz, by] = p.pts[i + 1];
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
    let t = ((x - ax) * dx + (z - az) * dz) / L2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
    if (!best || d < best.d) best = { d, y: ay + (by - ay) * t, t: i + t };
  }
  return best;
}
// height of the outer stair at angle a (piecewise linear profile)
export function outerHeight(a) {
  const P = OUTER_PROFILE;
  if (a <= P[0][0]) return P[0][1];
  for (let i = 1; i < P.length; i++) if (a <= P[i][0]) { const [a0, y0] = P[i - 1], [a1, y1] = P[i]; return y0 + (y1 - y0) * (a - a0) / (a1 - a0); }
  return P[P.length - 1][1];
}
// the outer stair band: angle in [a0, a1] (angles 0..2pi measured around the core)
export function outerAngle(x, z) {
  let a = Math.atan2(z - CORE.z, x - CORE.x);
  if (a < 0) a += Math.PI * 2;
  return a;
}

export class IselTerrain {
  constructor() {
    this.size = MAP.size;
    this.playable = MAP.playable;
    this.mesh = new THREE.Group();          // (the floors are real meshes built elsewhere)
    this.mesh.name = 'isel-terrain';
    this.paths = PATHS.map((p) => {
      const xs = p.pts.map((q) => q[0]), zs = p.pts.map((q) => q[1]);
      return { ...p, bbox: [Math.min(...xs) - p.w, Math.min(...zs) - p.w, Math.max(...xs) + p.w, Math.max(...zs) + p.w] };
    });
  }
  // floor at x,z: { y, where } or null (void)
  floor(x, z) {
    for (const r of ROOMS) if (inRoom(r, x, z, 0.4)) return { y: r.y + (r.id === 'throne' ? daisHeight(x, z) : 0), where: r.id };
    for (const p of this.paths) {
      if (x < p.bbox[0] || z < p.bbox[1] || x > p.bbox[2] || z > p.bbox[3]) continue;
      const q = onPath(p, x, z);
      if (q.d < p.w / 2) return { y: q.y, where: p.id };
    }
    const dr = Math.hypot(x - CORE.x, z - CORE.z);
    if (Math.abs(dr - OUTER.r) < OUTER.hw) {
      const a = outerAngle(x, z);
      if (a >= OUTER.a0 - 0.01 && a <= OUTER.a1 + 0.01) return { y: outerHeight(a), where: 'outer' };
    }
    if (Math.hypot(x - VAULT.x, z - VAULT.z) < VAULT.walk) return { y: VAULT.y, where: 'vault' };
    return null;
  }
  heightAt(x, z) { const f = this.floor(x, z); return f ? f.y : VOID_Y; }
  groundAt(x, z) { return this.heightAt(x, z); }
  deckAt() { return null; }
  normalAt(x, z, out = new THREE.Vector3()) {
    // slope of the floor itself (stair ramps); edges towards the void do not count
    const f = this.floor(x, z);
    if (!f) return out.set(0, 1, 0);
    const e = 0.4;
    const h = (xx, zz) => { const g = this.floor(xx, zz); return g ? g.y : f.y; };
    const hx = h(x + e, z) - h(x - e, z), hz = h(x, z + e) - h(x, z - e);
    return out.set(-hx, 2 * e, -hz).normalize();
  }
  slopeAt(x, z) { return 1 - this.normalAt(x, z).y; }
  isVoid(x, z) { return !this.floor(x, z); }
  // the void is "water" for the nav grid (never walkable)
  isWater(x, z) { return this.isVoid(x, z); }
  zoneAt() { return 0; }
  where(x, z) { const f = this.floor(x, z); return f ? f.where : null; }
  minimapColor(x, z) {
    const f = this.floor(x, z);
    if (!f) return [22, 20, 30];
    if (f.where === 'outer') return [150, 170, 175];
    if (f.where === 'vault') return Math.hypot(x - VAULT.x, z - VAULT.z) < 12 ? [196, 150, 70] : [96, 70, 128];
    const room = ROOMS.find((r) => r.id === f.where);
    if (room) return room.style === 'throne' ? [150, 60, 70] : [172, 120, 76];
    return [120, 128, 136];                 // stairs
  }
}

// Third-person orbit camera: right-drag rotates, wheel / PgUp / PgDn zooms, smooth follow.
// Dragging the pitch below level lowers the camera behind the hero down to the ground and tilts the view up, so
// towers, ceilings and the sky can be looked at. A world may keep the camera under a roof (ceiling(pos) -> max y)
// and add one-sided blockers (e.g. the wall above a doorway, which only hides the hero from the room side).
import * as THREE from 'three';
import { clamp, damp } from './utils.js';

const PITCH_MIN = -0.72, PITCH_MAX = 1.35;
const LOOK_UP = 0.9;       // extra upward tilt per radian of pitch below level

export class FollowCamera {
  constructor(camera, terrain) {
    this.cam = camera;
    this.terrain = terrain;
    this.yaw = Math.PI;        // camera behind the player looking north by default
    this.pitch = 0.58;
    this.dist = 11;
    this.targetDist = 11;
    this.focus = new THREE.Vector3();
    this.shake = 0;
    this._shakeT = 0;
    this.minDist = 3.5; this.maxDist = 26;
    this.blockers = null;   // [{x,z,cos,sin,hw,hd,y0,y1, nx?,nz?}] (nx/nz: one-sided, see occlusion)
    this.occDist = Infinity; // distance allowed by occlusion (smoothed)
    this.ceiling = null;    // optional (pos) => highest camera y, or null
    this.ceilDist = Infinity;
  }
  // Build 3D occluder boxes from 2D building colliders (extruded upwards)
  setBlockers(colliders, terrain) {
    this.blockers = [];
    for (const b of colliders.boxes) {
      if (b.hw * b.hd < 3) continue; // skip small props
      const h = terrain.heightAt(b.x, b.z);
      this.blockers.push({ ...b, hw: b.hw + 1.1, hd: b.hd + 1.1, y0: h - 6, y1: h + 8 + Math.min(8, Math.max(b.hw, b.hd)) });
    }
  }
  // distance along the ray (origin o, unit dir d, max len) to the first blocker, or len
  occlusion(o, d, len) {
    if (!this.blockers) return len;
    let best = len;
    for (const b of this.blockers) {
      const rx = o.x - b.x, rz = o.z - b.z;
      if (rx * rx + rz * rz > (len + b.hw + b.hd) ** 2) continue;
      // one-sided blocker: only while the camera is on the side (nx, nz) points to and the hero is not
      if (b.nx !== undefined) {
        const sc = (o.x + d.x * len - b.x) * b.nx + (o.z + d.z * len - b.z) * b.nz, so = rx * b.nx + rz * b.nz;
        if (!(sc > 0 && so < 0)) continue;
      }
      // into box space (inverse of the collider rotation)
      const lox = rx * b.cos - rz * b.sin, loz = rx * b.sin + rz * b.cos;
      const ldx = d.x * b.cos - d.z * b.sin, ldz = d.x * b.sin + d.z * b.cos;
      let t0 = 0, t1 = best;
      const slab = (oo, dd, mn, mx) => {
        if (Math.abs(dd) < 1e-6) return oo >= mn && oo <= mx;
        let a = (mn - oo) / dd, c = (mx - oo) / dd;
        if (a > c) { const tmp = a; a = c; c = tmp; }
        t0 = Math.max(t0, a); t1 = Math.min(t1, c);
        return t0 <= t1;
      };
      if (!slab(lox, ldx, -b.hw, b.hw)) continue;
      if (!slab(o.y, d.y, b.y0, b.y1)) continue;
      if (!slab(loz, ldz, -b.hd, b.hd)) continue;
      if (t0 < best) best = t0;
    }
    return best;
  }
  // distance along the ray to where it first dips below the terrain (+ margin), or len
  terrainOcclusion(o, d, len) {
    const T = this.terrain;
    if (!T) return len;
    for (let t = 0.8; t < len; t += 0.45) {
      if (T.heightAt(o.x + d.x * t, o.z + d.z * t) + 0.45 > o.y + d.y * t) return Math.max(0, t - 0.5);
    }
    return len;
  }
  snap(pos) {
    this.focus.copy(pos);
    this.update(0, pos, null, true);
  }
  addShake(v) { this.shake = Math.max(this.shake, v); }
  update(dt, targetPos, input, instant = false) {
    if (input) {
      if (input.rightDragging || input.dragDX || input.dragDY) {
        this.yaw -= input.dragDX * 0.0055;
        this.pitch = clamp(this.pitch + input.dragDY * 0.0045, PITCH_MIN, PITCH_MAX);
      }
      if (input.wheel) this.targetDist = clamp(this.targetDist * (1 + input.wheel * 0.12), this.minDist, this.maxDist);
      if (input.down('PageUp')) this.targetDist = clamp(this.targetDist - 12 * dt, this.minDist, this.maxDist);
      if (input.down('PageDown')) this.targetDist = clamp(this.targetDist + 12 * dt, this.minDist, this.maxDist);
      if (input.down('ArrowLeft')) this.yaw += 1.8 * dt;
      if (input.down('ArrowRight')) this.yaw -= 1.8 * dt;
    }
    this.dist = instant ? this.targetDist : damp(this.dist, this.targetDist, 10, dt);
    const f = instant ? 1 : 1 - Math.exp(-12 * dt);
    this.focus.lerp(targetPos, f);
    const lookY = this.focus.y + 1.15 + this.dist * 0.02;
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    // occlusion: pull the camera in front of buildings between it and the player
    const dir = { x: Math.sin(this.yaw) * cp, y: sp, z: Math.cos(this.yaw) * cp };
    const origin = { x: this.focus.x, y: lookY, z: this.focus.z };
    // (below level the ray runs into the ground: the camera slides in along it and rests just above the floor)
    let free = Math.max(1.6, Math.min(this.occlusion(origin, dir, this.dist) - 0.35, this.terrainOcclusion(origin, dir, this.dist)));
    // (and never lower than the floor the hero stands on: over a drop there is no ground to stop it)
    if (sp < 0) free = Math.min(free, Math.max(1.6, (lookY - this.focus.y - 0.45) / -sp));
    if (instant || free < this.occDist) this.occDist = free;
    else this.occDist = damp(this.occDist, free, 3, dt);
    // under a roof: no higher than the ceiling allows (eased both ways, so walking in under it does not jolt)
    let roof = Infinity;
    const top = this.ceiling ? this.ceiling(targetPos) : null;
    if (top !== null && top !== undefined && sp > 0.02) roof = Math.max(1.6, (top - lookY) / sp);
    if (instant) this.ceilDist = roof;
    else {
      const from = Number.isFinite(this.ceilDist) ? this.ceilDist : Math.min(this.dist, this.occDist);
      if (Number.isFinite(roof)) this.ceilDist = damp(from, roof, 5, dt);
      else this.ceilDist = from >= this.dist - 0.05 ? Infinity : damp(from, this.dist + 0.2, 5, dt);   // out again
    }
    const d = Math.min(this.dist, this.occDist, this.ceilDist);
    let x = this.focus.x + dir.x * d;
    let z = this.focus.z + dir.z * d;
    let y = lookY + sp * d;
    // keep above terrain
    const gh = this.terrain ? this.terrain.heightAt(x, z) + 0.6 : -Infinity;
    if (y < gh) y = gh;
    this.cam.position.set(x, y, z);
    if (this.shake > 0.001) {
      this._shakeT += dt * 40;
      this.cam.position.x += Math.sin(this._shakeT * 1.3) * this.shake * 0.12;
      this.cam.position.y += Math.sin(this._shakeT * 1.7) * this.shake * 0.12;
      this.shake *= Math.exp(-6 * dt);
    }
    if (this.pitch >= 0) this.cam.lookAt(this.focus.x, lookY, this.focus.z);
    else {
      // looking up: aim past the look point, tilted further up the lower the pitch goes
      const p = this.cam.position, hx = this.focus.x - p.x, hz = this.focus.z - p.z, hl = Math.max(0.05, Math.hypot(hx, hz));
      const el = Math.min(1.45, Math.atan2(lookY - p.y, hl) - this.pitch * LOOK_UP);
      this.cam.lookAt(p.x + (hx / hl) * Math.cos(el), p.y + Math.sin(el), p.z + (hz / hl) * Math.cos(el));
    }
  }
  // forward direction on the ground plane (from camera towards focus)
  forward(out = new THREE.Vector3()) {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }
}

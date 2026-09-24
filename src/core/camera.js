// Third-person orbit camera: right-drag rotates, wheel / PgUp / PgDn zooms, smooth follow
import * as THREE from 'three';
import { clamp, damp } from './utils.js';

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
    this.blockers = null;   // [{x,z,cos,sin,hw,hd,y0,y1}]
    this.occDist = Infinity; // distance allowed by occlusion (smoothed)
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
  snap(pos) {
    this.focus.copy(pos);
    this.update(0, pos, null, true);
  }
  addShake(v) { this.shake = Math.max(this.shake, v); }
  update(dt, targetPos, input, instant = false) {
    if (input) {
      if (input.rightDragging || input.dragDX || input.dragDY) {
        this.yaw -= input.dragDX * 0.0055;
        this.pitch = clamp(this.pitch + input.dragDY * 0.0045, 0.08, 1.35);
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
    const free = Math.max(1.6, this.occlusion(origin, dir, this.dist) - 0.35);
    if (instant || free < this.occDist) this.occDist = free;
    else this.occDist = damp(this.occDist, free, 3, dt);
    const d = Math.min(this.dist, this.occDist);
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
    this.cam.lookAt(this.focus.x, lookY, this.focus.z);
  }
  // forward direction on the ground plane (from camera towards focus)
  forward(out = new THREE.Vector3()) {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }
}

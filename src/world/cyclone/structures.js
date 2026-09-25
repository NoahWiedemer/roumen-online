// Built structures of Cyclone Hill, merged through the town GeoBuilder into the static batcher:
// plank bridges with rope rails, the tall trestle sky bridge, lattice lookout towers, rim fences, the summit
// palisade with gate, war-drum stage and a spinning wind totem, windmills, cottages, torches, campfires,
// ramp stairs, arrows stuck in the cliffs, forest lanterns and the glade's standing stones.
// Moving parts (windmill sails, wind totem) are separate meshes; fire, embers, halos and smoke are particles.
import * as THREE from 'three';
import { GeoBuilder, pm, U } from '../town/builder.js';
import { townMaterials, townTime } from '../town/materials.js';
import { barrel, crate, sack, clutter } from '../town/props.js';
import { mulberry32, lerp, clamp, angleDiff } from '../../core/utils.js';
import { prepPoly, polyNearest, sampleSpline } from '../terrain.js';
import { glowDotTex, mistPuffTex } from './textures.js';
import {
  HILL, TIERS, TIER_WALL, RAMPS, BRIDGES, SUMMIT, PALISADE_GATE, WINDMILLS, COTTAGES, LOOKOUTS, CAMPFIRES,
  FOREST_PATH, TOWER_SITE, polar,
} from './layout.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const _up = V(0, 1, 0), _d = new THREE.Vector3(), _q = new THREE.Quaternion(), _c = new THREE.Vector3(), _one = V(1, 1, 1);

// box spanning from a to c (its long axis), cross-section w x d
function beam(b, mat, a, c, w, opt = {}) {
  _d.subVectors(c, a);
  const len = _d.length();
  if (len < 1e-4) return;
  _d.divideScalar(len);
  _q.setFromUnitVectors(_up, _d);
  if (opt.twist) _q.multiply(new THREE.Quaternion().setFromAxisAngle(_up, opt.twist));
  _c.addVectors(a, c).multiplyScalar(0.5);
  b.box(mat, new THREE.Matrix4().compose(_c, _q, _one), w, len, opt.d ?? w, { uv: 'grain', uvs: 0.9, color: opt.color, ao: false });
}
// local (lx, lz) around (x, z) rotated by rot (three.js yaw convention)
const L = (x, z, rot, lx, lz) => [x + lx * Math.cos(rot) + lz * Math.sin(rot), z - lx * Math.sin(rot) + lz * Math.cos(rot)];
const WOOD_DK = [0.78, 0.72, 0.66], WOOD_LT = [1.08, 1.02, 0.94];

// ------------------------------------------------------------------ lattice tower (trestle bent)
// footprint w (local x) x d (local z) at the top, splaying out towards the base
function trestle(b, M, x, z, yBase, yTop, rot, w, d, rng) {
  const H = yTop - yBase;
  const splay = 1 + Math.min(0.5, H * 0.011);
  const P = (sx, sz, y) => {
    const k = lerp(splay, 1, clamp((y - yBase) / H, 0, 1));
    const [px, pz] = L(x, z, rot, sx * w / 2 * k, sz * d / 2 * k);
    return V(px, y, pz);
  };
  const C = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (const [sx, sz] of C) beam(b, M.timber, P(sx, sz, yBase - 1.2), P(sx, sz, yTop), 0.3, { color: WOOD_DK });
  const bays = Math.max(1, Math.round(H / 4.2));
  const lv = [];
  for (let i = 0; i <= bays; i++) lv.push(yBase + (H * i) / bays);
  for (let i = 1; i <= bays; i++) for (let k = 0; k < 4; k++) {
    const [ax, az] = C[k], [cx, cz] = C[(k + 1) % 4];
    beam(b, M.timber, P(ax, az, lv[i]), P(cx, cz, lv[i]), 0.2, { color: WOOD_LT });
  }
  for (let i = 0; i < bays; i++) for (let k = 0; k < 4; k++) {
    const [ax, az] = C[k], [cx, cz] = C[(k + 1) % 4];
    const col = [0.82 + rng() * 0.1, 0.78, 0.7];
    beam(b, M.timber, P(ax, az, lv[i] + 0.2), P(cx, cz, lv[i + 1] - 0.2), 0.14, { color: col });
    beam(b, M.timber, P(cx, cz, lv[i] + 0.2), P(ax, az, lv[i + 1] - 0.2), 0.14, { color: col });
  }
  return { w: w * splay, d: d * splay };
}

// ------------------------------------------------------------------ bridges
function samplePoly(pts, step) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / step));
    for (let k = 0; k < n; k++) out.push({ x: lerp(ax, bx, k / n), z: lerp(az, bz, k / n), tx: (bx - ax) / len, tz: (bz - az) / len });
  }
  const [lx, lz] = pts[pts.length - 1];
  const last = out[out.length - 1];
  out.push({ x: lx, z: lz, tx: last.tx, tz: last.tz });
  let s = 0;
  out.forEach((p, i) => { if (i) s += Math.hypot(p.x - out[i - 1].x, p.z - out[i - 1].z); p.s = s; });
  out.forEach((p) => { p.t = p.s / s; });
  return out;
}

function bridge(ctx, b, M, br, rng, fire) {
  const T = ctx.terrain;
  const deckH = (t) => lerp(br.h0, br.h1, t) + (br.arch ? Math.sin(t * Math.PI) * br.arch : 0);
  const pts = samplePoly(br.pts, 0.46);
  const hw = br.width / 2;
  // planks
  for (const p of pts) {
    const y = deckH(p.t);
    const rot = Math.atan2(-p.tz, p.tx);
    const m = pm(p.x, y - 0.06, p.z, 0, rot + (rng() - 0.5) * 0.05, (rng() - 0.5) * 0.02);
    const tint = 0.86 + rng() * 0.22;
    b.box(M.wood, m, 0.4, 0.1, br.width + 0.3 + rng() * 0.15, { uv: 'grain', uvs: 1, color: [tint, tint * 0.97, tint * 0.92], ao: false });
  }
  // stringers under the deck + rails
  const side = (p, o, y) => V(p.x - p.tz * o, y, p.z + p.tx * o);
  for (let i = 0; i < pts.length - 1; i += 3) {
    const a = pts[i], c = pts[Math.min(pts.length - 1, i + 3)];
    for (const o of [-hw + 0.3, 0, hw - 0.3]) beam(b, M.timber, side(a, o, deckH(a.t) - 0.25), side(c, o, deckH(c.t) - 0.25), 0.26, { color: WOOD_DK });
  }
  // posts every ~2.3 m with sagging ropes between them
  const posts = [[], []];
  for (let s = 0; s <= pts[pts.length - 1].s + 0.01; s += 2.3) {
    const p = pts.reduce((best, q) => (Math.abs(q.s - s) < Math.abs(best.s - s) ? q : best), pts[0]);
    for (const [k, sg] of [[0, -1], [1, 1]]) {
      const base = side(p, sg * (hw + 0.08), deckH(p.t) - 0.3);
      const top = base.clone(); top.y += 1.55;
      beam(b, M.timber, base, top, 0.16, { color: WOOD_DK });
      b.geo(M.timber, U.sphere(6, 4), pm(top.x, top.y + 0.04, top.z, 0, 0, 0, 0.1), { color: WOOD_DK, ao: false });
      posts[k].push(top);
    }
  }
  for (const side2 of posts) for (let i = 0; i < side2.length - 1; i++) {
    for (const dy of [-0.05, -0.55]) {
      const a = side2[i].clone(), c = side2[i + 1].clone(); a.y += dy; c.y += dy;
      const mid = a.clone().lerp(c, 0.5); mid.y -= 0.16;
      beam(b, M.rope, a, mid, 0.045); beam(b, M.rope, mid, c, 0.045);
    }
  }
  // supports: trestle bents where the ground drops away (sky bridge, gorge bridges), piles for the low river bridge
  const L0 = pts[pts.length - 1].s;
  const every = br.kind === 'trestle' ? 11.5 : 8.5;
  for (let s = every * 0.7; s < L0 - every * 0.5; s += every) {
    const p = pts.reduce((best, q) => (Math.abs(q.s - s) < Math.abs(best.s - s) ? q : best), pts[0]);
    const g = T.heightAt(p.x, p.z), y = deckH(p.t) - 0.3;
    const rot = Math.atan2(-p.tz, p.tx);
    if (g < y - 4.5) trestle(b, M, p.x, p.z, g, y, rot, 1.8, br.width + 0.8, rng);
    else if (g < y - 0.6) for (const sg of [-1, 1]) beam(b, M.timber, side(p, sg * (hw - 0.2), g - 1), side(p, sg * (hw - 0.2), y), 0.28, { color: WOOD_DK });
  }
  // torches at both ends
  for (const p of [pts[0], pts[pts.length - 1]]) {
    const dir = p === pts[0] ? -1 : 1;
    for (const sg of br.kind === 'trestle' ? [-1, 1] : [1]) {
      const q = side(p, sg * (hw + 0.9), 0);
      const tx = q.x + p.tx * dir * 1.2, tz = q.z + p.tz * dir * 1.2;
      torch(ctx, b, M, tx, T.heightAt(tx, tz), tz, rng, fire);
    }
  }
  ctx.minimap.addRect((br.pts[0][0] + br.pts[br.pts.length - 1][0]) / 2, (br.pts[0][1] + br.pts[br.pts.length - 1][1]) / 2,
    Math.hypot(br.pts[br.pts.length - 1][0] - br.pts[0][0], br.pts[br.pts.length - 1][1] - br.pts[0][1]), br.width,
    -Math.atan2(br.pts[br.pts.length - 1][1] - br.pts[0][1], br.pts[br.pts.length - 1][0] - br.pts[0][0]), '#a8743e');
  for (const p of [br.pts[0], br.pts[br.pts.length - 1]]) ctx.addNoScatter(p[0], p[1], 3.5);
}

// ------------------------------------------------------------------ fire: torches, campfires (particles + halos)
class FireSystem {
  constructor(max = 900) {
    this.max = max;
    this.emitters = [];
    this.halos = [];
    this.p = [];
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    g.setDrawRange(0, 0);
    this.points = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: { map: { value: glowDotTex() } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true,
      vertexShader: `attribute float size; varying vec3 vC; void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * 300.0 / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; varying vec3 vC; void main(){ float a = texture2D(map, gl_PointCoord).a; gl_FragColor = vec4(vC * a, a);
        #include <colorspace_fragment>
        }`,
    }));
    this.points.frustumCulled = false;
    this.rng = mulberry32(7601);
  }
  addEmitter(x, y, z, strength = 1) { this.emitters.push({ x, y, z, s: strength, acc: 0 }); this.halos.push({ x, y: y + 0.25 * strength, z, s: strength }); }
  buildHalos() {
    const n = this.halos.length;
    const pos = new Float32Array(n * 3), s = new Float32Array(n), ph = new Float32Array(n);
    this.halos.forEach((h, i) => { pos.set([h.x, h.y, h.z], i * 3); s[i] = h.s; ph[i] = this.rng() * 20; });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('hs', new THREE.BufferAttribute(s, 1));
    g.setAttribute('ph', new THREE.BufferAttribute(ph, 1));
    this.haloUniforms = { map: { value: glowDotTex() }, time: { value: 0 } };
    this.haloPoints = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: this.haloUniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute float hs; attribute float ph; uniform float time; varying float vA;
        void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0);
          float f = 0.8 + 0.12 * sin(time * 9.0 + ph) + 0.08 * sin(time * 23.0 + ph * 2.0);
          vA = f * smoothstep(160.0, 20.0, -mv.z);
          gl_PointSize = hs * 5.5 * f * 300.0 / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; varying float vA; void main(){ float a = texture2D(map, gl_PointCoord).a * 0.42 * vA; gl_FragColor = vec4(vec3(1.0, 0.62, 0.28) * a, a);
        #include <colorspace_fragment>
        }`,
    }));
    this.haloPoints.frustumCulled = false;
  }
  update(dt, camPos) {
    const r = this.rng;
    for (const e of this.emitters) {
      if (camPos && Math.hypot(e.x - camPos.x, e.z - camPos.z) > 110) continue;
      e.acc += dt * 26 * e.s;
      while (e.acc > 1) {
        e.acc -= 1;
        if (this.p.length >= this.max) this.p.shift();
        this.p.push({ x: e.x + (r() - 0.5) * 0.18 * e.s, y: e.y, z: e.z + (r() - 0.5) * 0.18 * e.s, vx: (r() - 0.5) * 0.3, vy: 1.1 + r() * 0.9, vz: (r() - 0.5) * 0.3, life: 0, max: 0.45 + r() * 0.4, s: (0.5 + r() * 0.35) * e.s, ember: r() < 0.06 });
      }
    }
    let n = 0;
    for (let i = this.p.length - 1; i >= 0; i--) {
      const q = this.p[i];
      q.life += dt;
      if (q.life > (q.ember ? q.max * 3 : q.max)) { this.p.splice(i, 1); continue; }
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      q.vx *= 0.96; q.vz *= 0.96;
      const k = q.life / q.max;
      this.pos[n * 3] = q.x; this.pos[n * 3 + 1] = q.y; this.pos[n * 3 + 2] = q.z;
      if (q.ember) { this.col[n * 3] = 1; this.col[n * 3 + 1] = 0.55; this.col[n * 3 + 2] = 0.15; this.size[n] = 0.07; }
      else {
        const f = 1 - k;
        this.col[n * 3] = f; this.col[n * 3 + 1] = f * (0.75 - k * 0.5); this.col[n * 3 + 2] = f * 0.25 * (1 - k);
        this.size[n] = q.s * (1 - k * 0.6);
      }
      n++;
    }
    const g = this.points.geometry;
    g.setDrawRange(0, n);
    g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true; g.attributes.size.needsUpdate = true;
  }
}

// soft grey smoke puffs rising from campfires / chimneys
class Smoke {
  constructor(sources) {
    this.group = new THREE.Group();
    this.list = [];
    const tex = mistPuffTex();
    const rng = mulberry32(7602);
    for (const s of sources) for (let i = 0; i < 6; i++) {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, color: 0xcfc8c0, opacity: 0.4 }));
      this.group.add(m);
      this.list.push({ m, s, ph: i / 6 + rng() * 0.1, drift: (rng() - 0.5) * 2 });
    }
  }
  update(t) {
    for (const f of this.list) {
      const k = (t * 0.12 + f.ph) % 1;
      f.m.position.set(f.s.x + f.drift * k * 1.5 + k * 1.2, f.s.y + k * 7, f.s.z + f.drift * k);
      const sz = (0.8 + k * 3.2) * f.s.k;
      f.m.scale.set(sz, sz, 1);
      f.m.material.opacity = Math.sin(k * Math.PI) * 0.35;
    }
  }
}

function torch(ctx, b, M, x, y, z, rng, fire) {
  // tripod of three sticks crossing below an iron fire bowl
  const H = 1.7;
  const a0 = rng() * Math.PI * 2;
  for (let i = 0; i < 3; i++) {
    const a = a0 + (i / 3) * Math.PI * 2;
    beam(b, M.timber, V(x + Math.cos(a) * 0.55, y - 0.2, z + Math.sin(a) * 0.55), V(x - Math.cos(a) * 0.12, y + H + 0.1, z - Math.sin(a) * 0.12), 0.08, { color: WOOD_DK });
  }
  b.geo(M.rope, U.cyl(8), pm(x, y + H - 0.15, z, 0, 0, 0, 0.12, 0.12, 0.12), {});
  b.geo(M.iron, U.frustum(1.4, 10), pm(x, y + H + 0.08, z, 0, 0, 0, 0.2, 0.22, 0.2), {});
  b.geo(M.ember, U.hemi(8, 3), pm(x, y + H + 0.18, z, Math.PI, 0, 0, 0.22, 0.08, 0.22), {});
  fire.addEmitter(x, y + H + 0.22, z, 0.9);
  ctx.colliders.addCircle(x, z, 0.35);
  ctx.addNoScatter(x, z, 1);
}

function campfire(ctx, b, M, x, z, rng, fire, smokeSrc) {
  const T = ctx.terrain, y = T.heightAt(x, z);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    b.geo(M.stone, U.ico(1), pm(x + Math.cos(a) * 0.85, y + 0.05, z + Math.sin(a) * 0.85, rng(), rng(), 0, 0.22 + rng() * 0.08, 0.16, 0.2), { uv: 'frame', uvs: 1.5, color: [0.78, 0.74, 0.7] });
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI + rng() * 0.3;
    b.geo(M.timber, U.cyl(7), pm(x, y + 0.18, z, 0, a, 1.2, 0.09, 1.2, 0.09), { color: WOOD_DK });
  }
  b.geo(M.ember, U.circle(10), pm(x, y + 0.08, z, 0, 0, 0, 0.55, 1, 0.55), {});
  fire.addEmitter(x, y + 0.25, z, 1.8);
  smokeSrc.push({ x, y: y + 1.6, z, k: 1 });
  // log benches around the fire
  for (let i = 0; i < 3; i++) {
    const a = rng() * 0.5 + (i / 3) * Math.PI * 2;
    const bx = x + Math.cos(a) * 2.4, bz = z + Math.sin(a) * 2.4;
    b.geo(M.timber, U.cyl(9), pm(bx, T.heightAt(bx, bz) + 0.22, bz, 0, -a, Math.PI / 2, 0.24, 1.6, 0.24), { color: [0.9, 0.82, 0.72] });
  }
  ctx.colliders.addCircle(x, z, 1.1);
  ctx.addNoScatter(x, z, 4);
}

// ------------------------------------------------------------------ buildings
function cottage(ctx, b, M, c, rng, smokeSrc, fire) {
  const T = ctx.terrain;
  const W = 5.2 * c.s, D = 4.2 * c.s, H = 2.8 * c.s;
  const y = T.heightAt(c.x, c.z) - 0.1;
  b.push(pm(c.x, y, c.z, 0, c.rot, 0));
  b.box(M.stone, pm(0, 0.25, 0), W + 0.4, 0.6, D + 0.4, { uv: 'frame', uvs: 0.7, color: [0.85, 0.78, 0.7] });
  b.box(M.plaster, pm(0, 0.55 + H / 2, 0), W, H, D, { uvs: 0.35, color: [1.02, 0.98, 0.92] });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(M.timber, pm(sx * W / 2, 0.55 + H / 2, sz * D / 2), 0.24, H + 0.05, 0.24, { uv: 'grain', color: WOOD_DK });
  for (const yy of [0.55, 0.55 + H]) for (const sz of [-1, 1]) b.box(M.timber, pm(0, yy, sz * D / 2), W + 0.1, 0.2, 0.2, { uv: 'grain', color: WOOD_DK });
  // door + windows on the front (+z)
  b.box(M.timber, pm(0, 0.55 + 1.0, D / 2 + 0.04), 1.0, 2.0, 0.1, { uv: 'grain', color: [0.9, 0.7, 0.55] });
  for (const sx of [-1, 1]) {
    b.box(M.glassLit, pm(sx * W * 0.3, 0.55 + 1.6, D / 2 + 0.03), 0.8, 0.8, 0.06, {});
    b.box(M.timber, pm(sx * W * 0.3, 0.55 + 1.15, D / 2 + 0.08), 1.0, 0.1, 0.16, { uv: 'grain', color: WOOD_DK });
  }
  // gable roof along x
  const ov = 0.5, rh = 1.9 * c.s, top = 0.55 + H;
  for (const sz of [-1, 1]) {
    const a = V(-W / 2 - ov, top - 0.25, sz * (D / 2 + ov)), bb = V(W / 2 + ov, top - 0.25, sz * (D / 2 + ov));
    const cc = V(W / 2 + ov, top + rh, 0), d = V(-W / 2 - ov, top + rh, 0);
    b.quadN(M.roofRed, a, bb, cc, d, [0, 0], [W * 0.5, 0], [W * 0.5, 1.4], [0, 1.4], [1, 1, 1], V(0, 1, sz));
    b.quadN(M.roofRed, d, cc, bb, a, [0, 1.4], [W * 0.5, 1.4], [W * 0.5, 0], [0, 0], [0.7, 0.7, 0.7], V(0, -1, -sz));
  }
  for (const sx of [-1, 1]) b.triN(M.plaster, V(sx * W / 2, top, -D / 2), V(sx * W / 2, top, D / 2), V(sx * W / 2, top + rh * 0.92, 0), [0, 0], [1, 0], [0.5, 0.6], [1, 0.95, 0.9], V(sx, 0, 0));
  b.box(M.stone, pm(W * 0.28, top + rh * 0.7, -D * 0.2), 0.6, 1.8, 0.6, { uv: 'frame', uvs: 0.8, color: [0.8, 0.74, 0.7] });
  b.pop();
  const [cx, cz] = L(c.x, c.z, c.rot, W * 0.28, -D * 0.2);
  smokeSrc.push({ x: cx, y: y + top + rh * 0.7 + 1.1, z: cz, k: 0.6 });
  ctx.colliders.addBox(c.x, c.z, W / 2 + 0.3, D / 2 + 0.3, c.rot);
  ctx.minimap.addRect(c.x, c.z, W + 1, D + 1, c.rot, '#c9503a');
  ctx.addNoScatter(c.x, c.z, Math.max(W, D) * 0.8 + 1.5);
  const [lx, lz] = L(c.x, c.z, c.rot, W * 0.5 + 1.4, D / 2 + 1.2);
  torch(ctx, b, M, lx, T.heightAt(lx, lz), lz, rng, fire);
  const [kx, kz] = L(c.x, c.z, c.rot, -W / 2 - 1.2, D / 2 - 0.5);
  clutter(b, M, kx, T.heightAt(kx, kz), kz, c.rot, rng, T);
}

function windmill(ctx, b, M, wm, rng, movers) {
  const T = ctx.terrain;
  const y = T.heightAt(wm.x, wm.z);
  const H = 8.5 * wm.s;
  // tapered lattice tower
  const P = (sx, sz, t) => { const k = lerp(1.7, 0.75, t); const [px, pz] = L(wm.x, wm.z, wm.rot, sx * k, sz * k); return V(px, y - 0.5 + t * (H + 0.5), pz); };
  const C = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (const [sx, sz] of C) beam(b, M.timber, P(sx, sz, 0), P(sx, sz, 1), 0.26, { color: WOOD_DK });
  for (let i = 1; i <= 3; i++) for (let k = 0; k < 4; k++) {
    const [ax, az] = C[k], [cx, cz] = C[(k + 1) % 4];
    beam(b, M.timber, P(ax, az, i / 3), P(cx, cz, i / 3), 0.16, { color: WOOD_LT });
    beam(b, M.timber, P(ax, az, (i - 1) / 3 + 0.02), P(cx, cz, i / 3 - 0.02), 0.11, { color: [0.85, 0.8, 0.72] });
  }
  // cabin + roof on top
  b.push(pm(wm.x, y + H, wm.z, 0, wm.rot, 0, wm.s));
  b.box(M.wood, pm(0, 0.9, 0), 2.0, 1.8, 2.2, { uv: 'grain', uvs: 1, color: [0.95, 0.85, 0.7] });
  b.geo(M.roofRed, U.coneCap(4), pm(0, 2.3, 0, 0, Math.PI / 4, 0, 1.9, 1.2, 1.9), { uv: 'frame', uvs: 0.8 });
  b.box(M.timber, pm(0, 1.1, 1.25), 0.3, 0.3, 0.5, { color: WOOD_DK });
  b.pop();
  // sails: separate mesh spinning around the hub (local +z)
  const sb = new GeoBuilder();
  const n = 8, R = 4.2 * wm.s;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    beam(sb, M.timber, V(0, 0, 0), V(ca * R, sa * R, 0), 0.12, { color: WOOD_DK });
    const q0 = V(ca * R * 0.3, sa * R * 0.3, 0.04), q1 = V(ca * R, sa * R, 0.04);
    const px = -sa * 0.75 * wm.s, py = ca * 0.75 * wm.s;
    const q2 = V(q1.x + px * 1.2, q1.y + py * 1.2, 0.04), q3 = V(q0.x + px * 0.6, q0.y + py * 0.6, 0.04);
    sb.quadN(M.fabric, q0, q1, q2, q3, [0, 0], [1, 0], [1, 1], [0, 1], [1.05, 0.98, 0.86], V(0, 0, 1));
    sb.quadN(M.fabric, q3, q2, q1, q0, [0, 1], [1, 1], [1, 0], [0, 0], [0.8, 0.75, 0.66], V(0, 0, -1));
    beam(sb, M.timber, q1, q2, 0.06, { color: WOOD_DK });
  }
  sb.geo(M.iron, U.cyl(10), pm(0, 0, 0, Math.PI / 2, 0, 0, 0.3, 0.4, 0.3), {});
  const rotor = new THREE.Group();
  for (const mat of [M.timber, M.fabric, M.iron]) {
    const g = sb.toGeometry(mat);
    if (g) { const me = new THREE.Mesh(g, mat); me.castShadow = true; rotor.add(me); }
  }
  const [hx, hz] = L(wm.x, wm.z, wm.rot, 0, 1.55 * wm.s);
  rotor.position.set(hx, y + H + 1.1 * wm.s, hz);
  rotor.rotation.y = wm.rot;
  ctx.scene.add(rotor);
  movers.push((dt) => { rotor.rotation.z -= dt * 0.55; });
  ctx.colliders.addBox(wm.x, wm.z, 1.9, 1.9, wm.rot);
  ctx.minimap.addRect(wm.x, wm.z, 3.4, 3.4, wm.rot, '#b07a40');
  ctx.addNoScatter(wm.x, wm.z, 3.5);
}

function lookout(ctx, b, M, lo, rng) {
  const T = ctx.terrain;
  const y = T.heightAt(lo.x, lo.z);
  const top = y + lo.h;
  trestle(b, M, lo.x, lo.z, y, top, lo.rot, 3.2, 3.2, rng);
  // platform + railing
  b.push(pm(lo.x, top, lo.z, 0, lo.rot, 0));
  for (let i = -5; i <= 5; i++) b.box(M.wood, pm(i * 0.42, 0.06, 0), 0.4, 0.12, 4.6, { uv: 'grain', color: [0.9 + rng() * 0.15, 0.88, 0.82] });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(M.timber, pm(sx * 2.2, 1.6, sz * 2.2), 0.18, 3.2, 0.18, { color: WOOD_DK });
  for (const [sx, sz, rot] of [[0, 1, 0], [0, -1, 0], [1, 0, Math.PI / 2], [-1, 0, Math.PI / 2]]) {
    b.box(M.timber, pm(sx * 2.2, 1.05, sz * 2.2, 0, rot, 0), 4.4, 0.12, 0.12, { uv: 'grain', color: WOOD_LT });
  }
  b.geo(M.roofRed, U.coneCap(4), pm(0, 4.1, 0, 0, Math.PI / 4, 0, 3.6, 1.6, 3.6), { uv: 'frame', uvs: 0.8 });
  b.pop();
  // ladder on one face
  const [ax, az] = L(lo.x, lo.z, lo.rot, 0, 2.1), [bx, bz] = L(lo.x, lo.z, lo.rot, 0, 1.75);
  for (const s of [-0.3, 0.3]) {
    const [p0x, p0z] = L(ax, az, lo.rot, s, 0), [p1x, p1z] = L(bx, bz, lo.rot, s, 0);
    beam(b, M.timber, V(p0x, y - 0.2, p0z), V(p1x, top + 0.9, p1z), 0.08, { color: WOOD_DK });
  }
  for (let yy = y + 0.4; yy < top; yy += 0.45) {
    const t = (yy - y) / (top - y);
    const [cx, cz] = L(lerp(ax, bx, t), lerp(az, bz, t), lo.rot, 0, 0);
    const [l0x, l0z] = L(cx, cz, lo.rot, -0.3, 0), [l1x, l1z] = L(cx, cz, lo.rot, 0.3, 0);
    beam(b, M.timber, V(l0x, yy, l0z), V(l1x, yy, l1z), 0.05);
  }
  ctx.colliders.addBox(lo.x, lo.z, 2.0, 2.0, lo.rot);
  ctx.minimap.addRect(lo.x, lo.z, 3.6, 3.6, lo.rot, '#8a5a30');
  ctx.addNoScatter(lo.x, lo.z, 4);
  const [kx, kz] = L(lo.x, lo.z, lo.rot, 2.6, -1);
  clutter(b, M, kx, T.heightAt(kx, kz), kz, lo.rot, rng, T);
}

// ------------------------------------------------------------------ fences
function postAndRail(b, M, pts, rng) {
  // pts: [{x,y,z}] consecutive post positions; null entries break the fence
  let prev = null;
  for (const p of pts) {
    if (!p) { prev = null; continue; }
    const h = 1.05 + rng() * 0.2;
    const tip = V(p.x + (rng() - 0.5) * 0.18, p.y + h, p.z + (rng() - 0.5) * 0.18);
    beam(b, M.timber, V(p.x, p.y - 0.3, p.z), tip, 0.15, { color: [0.8 + rng() * 0.15, 0.74, 0.66] });
    if (prev) {
      for (const f of [0.78, 0.4]) {
        const a = prev.base.clone().lerp(prev.tip, f), c = V(p.x, p.y - 0.3, p.z).lerp(tip, f);
        a.y += (rng() - 0.5) * 0.06;
        beam(b, M.wood, a, c, 0.09, { d: 0.14, color: [0.88 + rng() * 0.12, 0.82, 0.72] });
      }
    }
    prev = { base: V(p.x, p.y - 0.3, p.z), tip };
  }
}

// ------------------------------------------------------------------ main
export function buildStructures(ctx) {
  const T = ctx.terrain;
  const M = townMaterials();
  const b = new GeoBuilder();
  const rng = mulberry32(7700);
  const fire = new FireSystem();
  const smokeSrc = [];
  const movers = [];
  const ramps = RAMPS.map((r) => prepPoly({ ...r }));
  const nearRamp = (x, z, pad) => ramps.some((r) => polyNearest(r.pts, x, z, r.cum, r.total).d < r.width / 2 + pad);
  const nearDeck = (x, z, pad) => BRIDGES.some((br) => { const p = prepPoly({ pts: br.pts }); return polyNearest(p.pts, x, z, p.cum, p.total).d < br.width / 2 + pad; });

  // ---- bridges
  for (const br of BRIDGES) bridge(ctx, b, M, br, rng, fire);

  // ---- rim fences on tiers 1-3 (skipped at ramps, bridges, gorges and where tier 1 runs into the cliffs)
  for (let k = 0; k < 3; k++) {
    const h = TIERS[k].h;
    const R0 = TIERS[k].r;
    const n = Math.round((R0 * Math.PI * 2) / 2.35);
    const posts = [];
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2 - Math.PI;
      if (k === 0 && T.isNorth(a) > 0.2) { posts.push(null); continue; }
      const r = T.tierRadius(k, a) - TIER_WALL / 2 - 0.7;
      const [x, z] = polar(a, r);
      const y = T.heightAt(x, z);
      if (Math.abs(y - h) > 0.7 || nearRamp(x, z, 2) || nearDeck(x, z, 2.5) || T.slopeAt(x, z) > 0.3) { posts.push(null); continue; }
      posts.push({ x, y, z });
    }
    postAndRail(b, M, posts, rng);
  }
  // ---- fences along the outer (drop) side of the dirt ramps
  for (const r of RAMPS.slice(0, 3)) {
    const pr = prepPoly({ ...r });
    const posts = [];
    for (let s = 1.5; s < pr.total - 1.5; s += 2.35) {
      // point at arclength s and its tangent
      let acc = 0, i = 0;
      while (i < pr.pts.length - 2 && acc + (pr.cum[i + 1] - pr.cum[i]) < s) { acc = pr.cum[i + 1]; i++; }
      const [ax, az] = pr.pts[i], [bx, bz] = pr.pts[i + 1];
      const seg = pr.cum[i + 1] - pr.cum[i], u = (s - pr.cum[i]) / seg;
      const px = lerp(ax, bx, u), pz = lerp(az, bz, u);
      let nx = -(bz - az) / seg, nz = (bx - ax) / seg;
      if (nx * (px - HILL.x) + nz * (pz - HILL.z) < 0) { nx = -nx; nz = -nz; }  // outward = away from the hill
      const x = px + nx * (r.width / 2 + 0.3), z = pz + nz * (r.width / 2 + 0.3);
      const t = s / pr.total;
      posts.push({ x, y: lerp(r.h0, r.h1, t * t * (3 - 2 * t)), z });
    }
    postAndRail(b, M, posts, rng);
  }

  // ---- ramp 4: wooden stairs up to the summit
  {
    const r = ramps[3];
    const steps = sampleSpline(RAMPS[3].pts, 0.62);
    for (const s of steps) {
      const y = T.heightAt(s.x, s.z);
      const rot = Math.atan2(s.tx, s.tz);
      b.box(M.wood, pm(s.x, y + 0.02, s.z, 0, rot, 0), r.width - 0.4, 0.14, 0.42, { uv: 'grain', color: [0.95 + rng() * 0.1, 0.9, 0.8], ao: false });
    }
    for (const sg of [-1, 1]) {
      const posts = steps.filter((_, i) => i % 4 === 0).map((s) => { const x = s.x - s.tz * sg * (r.width / 2 - 0.1), z = s.z + s.tx * sg * (r.width / 2 - 0.1); return { x, y: T.heightAt(x, z), z }; });
      postAndRail(b, M, posts, rng);
    }
  }

  // ---- torches at the ramp ends
  for (const r of RAMPS) {
    for (const [px, pz] of [r.pts[0], r.pts[r.pts.length - 1]]) {
      const nx = px - HILL.x, nz = pz - HILL.z, l = Math.hypot(nx, nz);
      const x = px + (nx / l) * (r.width / 2 + 1.4), z = pz + (nz / l) * (r.width / 2 + 1.4);
      if (T.slopeAt(x, z) > 0.3) continue;
      torch(ctx, b, M, x, T.heightAt(x, z), z, rng, fire);
    }
  }

  // ---- summit: palisade ring with a gate, war-drum stage, spinning wind totem
  const topY = TIERS[3].h;
  {
    const R = SUMMIT.r;
    const gateHalf = 3.2 / R;
    const step = 0.56 / R;
    let lastCol = null;
    for (let a = -Math.PI; a < Math.PI; a += step) {
      if (Math.abs(angleDiff(a, PALISADE_GATE)) < gateHalf) continue;
      const [x, z] = polar(a, R + (rng() - 0.5) * 0.15);
      const y = T.heightAt(x, z) - 0.5;
      const h = 3.9 + rng() * 1.5, rr = 0.26 + rng() * 0.07;
      b.push(pm(x, y, z, (rng() - 0.5) * 0.06, -a, 0.05 + (rng() - 0.5) * 0.05));
      const tint = [0.72 + rng() * 0.12, 0.62 + rng() * 0.08, 0.52];
      b.geo(M.timber, U.cyl(8), pm(0, h / 2, 0, 0, 0, 0, rr, h, rr), { uv: 'keep', uvScale: [1, 2], color: tint });
      b.geo(M.wood, U.coneCap(8), pm(0, h + 0.4, 0, 0, 0, 0, rr, 0.8, rr), { color: [1.1, 0.95, 0.75] });
      b.pop();
      if (!lastCol || Math.hypot(x - lastCol[0], z - lastCol[1]) > 1.0) { ctx.colliders.addCircle(x, z, 0.5); lastCol = [x, z]; }
    }
    // binding beams on the inside
    for (let a = -Math.PI; a < Math.PI; a += 2.4 / R) {
      const a2 = a + 2.4 / R;
      if (Math.abs(angleDiff(a, PALISADE_GATE)) < gateHalf + 0.05 || Math.abs(angleDiff(a2, PALISADE_GATE)) < gateHalf + 0.05) continue;
      for (const hy of [1.2, 3.0]) {
        const [x0, z0] = polar(a, R - 0.35), [x1, z1] = polar(a2, R - 0.35);
        beam(b, M.timber, V(x0, topY + hy - 0.4, z0), V(x1, topY + hy - 0.4, z1), 0.14, { color: WOOD_DK });
      }
    }
    // gate posts + lintel + torches outside
    const gp = [];
    for (const sg of [-1, 1]) {
      const a = PALISADE_GATE + sg * (gateHalf + 0.02);
      const [x, z] = polar(a, R);
      const y = T.heightAt(x, z) - 0.5;
      b.geo(M.timber, U.cyl(10), pm(x, y + 3.3, z, 0, 0, 0, 0.38, 6.6, 0.38), { color: WOOD_DK });
      b.geo(M.wood, U.coneCap(10), pm(x, y + 7.0, z, 0, 0, 0, 0.4, 0.9, 0.4), { color: [1.1, 0.95, 0.75] });
      gp.push(V(x, y + 5.9, z));
      const [tx, tz] = polar(a + sg * 0.06, R + 2.4);
      torch(ctx, b, M, tx, T.heightAt(tx, tz), tz, rng, fire);
    }
    beam(b, M.timber, gp[0], gp[1], 0.34, { color: WOOD_DK });
    beam(b, M.timber, gp[0].clone().add(V(0, -0.7, 0)), gp[1].clone().add(V(0, -0.7, 0)), 0.2, { color: WOOD_DK });
    // war-drum stage opposite the gate
    const sa = PALISADE_GATE + Math.PI;
    const [sx, sz] = polar(sa, R - 5.5);
    const rot = -sa + Math.PI / 2;
    b.push(pm(sx, topY - 0.2, sz, 0, rot, 0));
    for (const px of [-2.6, 2.6]) for (const pz of [-1.6, 1.6]) b.box(M.timber, pm(px, 0.7, pz), 0.3, 1.8, 0.3, { color: WOOD_DK });
    for (let i = -6; i <= 6; i++) b.box(M.wood, pm(i * 0.44, 1.6, 0), 0.42, 0.14, 3.6, { uv: 'grain', color: [0.9 + rng() * 0.15, 0.86, 0.78] });
    b.geo(M.wood, U.cyl(16), pm(0, 2.6, -0.3, Math.PI / 2, 0, 0, 1.1, 1.3, 1.1), { color: [0.85, 0.55, 0.38] });
    b.geo(M.fabric, U.circle(16), pm(0, 2.6, 0.36, Math.PI / 2, 0, 0, 1.05, 1, 1.05), { color: [1.1, 1.0, 0.85] });
    for (const px of [-2.6, 2.6]) {
      b.box(M.timber, pm(px, 3.8, -1.6), 0.22, 6.4, 0.22, { color: WOOD_DK });
      b.geo(M.pennant, U.plane(), pm(px + 0.75, 5.9, -1.6, 0, 0, 0, 1.4, 1.1, 1), { uv: 'keep', color: [1.3, 0.35, 0.25] });
    }
    b.pop();
    ctx.colliders.addBox(sx, sz, 3.0, 2.0, rot);
    // wind totem in the middle: a carved pole with a spinning four-blade wind wheel
    const cx = SUMMIT.x + 2, cz = SUMMIT.z + 2;
    b.geo(M.timber, U.cyl(10), pm(cx, topY + 3.5, cz, 0, 0, 0, 0.3, 7.5, 0.3), { color: [0.75, 0.62, 0.5] });
    for (const hy of [1.5, 3.2, 4.9]) b.geo(M.wood, U.torus(1, 0.25, 6, 14), pm(cx, topY + hy, cz, Math.PI / 2, 0, 0, 0.36, 0.36, 0.36), { color: [1.1, 0.6, 0.4] });
    b.geo(M.stone, U.bevel(0.15), pm(cx, topY + 0.3, cz, 0, 0.5, 0, 1.6, 0.8, 1.6), { uv: 'frame', uvs: 1, color: [0.9, 0.7, 0.55] });
    const wb = new GeoBuilder();
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const tip = V(Math.cos(a) * 1.9, Math.sin(a) * 1.9, 0);
      beam(wb, M.timber, V(0, 0, 0), tip, 0.1);
      const side2 = V(-Math.sin(a) * 0.7, Math.cos(a) * 0.7, 0.25);
      wb.quadN(M.pennant, tip.clone().multiplyScalar(0.25), tip, tip.clone().add(side2), tip.clone().multiplyScalar(0.25).add(side2.clone().multiplyScalar(0.5)), [0, 0], [1, 0], [1, 1], [0, 1], [1.3, 0.9, 0.35], V(0, 0, 1));
    }
    const wheel = new THREE.Group();
    for (const mat of [M.timber, M.pennant]) { const g = wb.toGeometry(mat); if (g) { const me = new THREE.Mesh(g, mat); me.castShadow = true; wheel.add(me); } }
    wheel.position.set(cx, topY + 7.4, cz + 0.35);
    ctx.scene.add(wheel);
    movers.push((dt, t) => { wheel.rotation.z += dt * (2.2 + Math.sin(t * 0.4) * 1.2); });
    ctx.colliders.addCircle(cx, cz, 1.1);
    for (let i = 0; i < 4; i++) {
      const a = sa + (i - 1.5) * 0.9;
      const [tx, tz] = polar(a, R - 2.2);
      torch(ctx, b, M, tx, T.heightAt(tx, tz), tz, rng, fire);
    }
    ctx.minimap.addCircle(SUMMIT.x, SUMMIT.z, R + 0.6, 'rgba(90,56,30,0.55)');
  }

  // ---- windmills, cottages, lookouts, campfires
  for (const wm of WINDMILLS) windmill(ctx, b, M, wm, rng, movers);
  for (const c of COTTAGES) cottage(ctx, b, M, c, rng, smokeSrc, fire);
  for (const lo of LOOKOUTS) lookout(ctx, b, M, lo, rng);
  for (const cf of CAMPFIRES) campfire(ctx, b, M, cf.x, cf.z, rng, fire, smokeSrc);

  // ---- arrows stuck in the tier and gorge walls
  let arrows = 0;
  for (let i = 0; i < 900 && arrows < 230; i++) {
    const k = (rng() * 3) | 0;
    const a = rng() * Math.PI * 2 - Math.PI;
    if (k === 0 && T.isNorth(a) > 0.3) continue;
    const y = TIERS[k].h - 9 + 1.6 + rng() * 5.8;
    const R = T.tierRadius(k, a);
    let r = R - 3, found = false;
    for (; r < R + 4; r += 0.2) { const [x, z] = polar(a, r); if (T.heightAt(x, z) < y) { found = true; break; } }
    if (!found) continue;
    const [x, z] = polar(a, r);
    if (nearRamp(x, z, 1.5) || T.slopeAt(x, z) < 0.35) continue;
    const n = T.normalAt(x, z);
    const dir = n.clone().add(V((rng() - 0.5) * 0.7, 0.25 + rng() * 0.4, (rng() - 0.5) * 0.7)).normalize();
    const tail = V(x, y, z).addScaledVector(dir, 0.75), tip = V(x, y, z).addScaledVector(dir, -0.25);
    beam(b, M.timber, tip, tail, 0.035, { color: [1.1, 0.9, 0.65] });
    const fl = tail.clone().addScaledVector(dir, -0.14);
    beam(b, M.color, fl, tail, 0.1, { d: 0.012, color: rng() < 0.5 ? [0.85, 0.2, 0.15] : [0.95, 0.92, 0.85] });
    arrows++;
  }

  // ---- forest: lantern posts along the trail, a signpost, crates at the bridge
  const lanternMat = M.lamp;
  const trail = samplePoly(FOREST_PATH, 1);
  for (let i = 8, k = 0; i < trail.length - 4; i += 22, k++) {
    const p = trail[i];
    const sg = k % 2 ? 1 : -1;
    const x = p.x - p.tz * sg * 3.8, z = p.z + p.tx * sg * 3.8;
    const y = T.heightAt(x, z);
    b.geo(M.timber, U.cyl(8), pm(x, y + 1.2, z, 0, 0, 0, 0.1, 2.6, 0.1), { color: WOOD_DK });
    const ax = x + p.tz * sg * 0.55, az = z - p.tx * sg * 0.55;
    beam(b, M.timber, V(x, y + 2.35, z), V(ax, y + 2.35, az), 0.07, { color: WOOD_DK });
    b.geo(M.iron, U.frustum(0.6, 6), pm(ax, y + 1.95, az, 0, 0, 0, 0.16, 0.14, 0.16), {});
    b.box(lanternMat, pm(ax, y + 1.78, az), 0.2, 0.26, 0.2, {});
    fire.halos.push({ x: ax, y: y + 1.78, z: az, s: 0.75 });
    ctx.colliders.addCircle(x, z, 0.25);
    ctx.addNoScatter(x, z, 1);
  }
  {
    const p = trail[4];
    const x = p.x + p.tz * 3.4, z = p.z - p.tx * 3.4, y = T.heightAt(x, z);
    b.geo(M.timber, U.cyl(8), pm(x, y + 1.1, z, 0, 0, 0, 0.12, 2.4, 0.12), { color: WOOD_DK });
    for (const [dy, yaw] of [[1.9, 0.5], [1.45, -0.4]]) {
      b.box(M.wood, pm(x, y + dy, z, 0, Math.PI + yaw, 0), 1.3, 0.3, 0.07, { uv: 'grain', color: [1.05, 0.95, 0.8] });
    }
    ctx.colliders.addCircle(x, z, 0.3);
  }
  for (const [x, z] of [[9, 100], [-2, 120.5]]) clutter(b, M, x, T.heightAt(x, z), z, rng() * 6, rng, T);
  barrel(b, M, -7, T.heightAt(-7, 150), 150, 0.4, 1, {});
  crate(b, M, -8.2, T.heightAt(-8.2, 151.2), 151.2, 0.2, 0.7, {});
  sack(b, M, -6.4, T.heightAt(-6.4, 151.6), 151.6, 1.2, 1);

  // ---- Windward Glade: standing stones around the (future) tower site
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    if (Math.abs(angleDiff(a, Math.PI)) < 0.3) continue; // leave the western approach from the bridge open
    const r = TOWER_SITE.r + 4.5;
    const x = TOWER_SITE.x + Math.cos(a) * r, z = TOWER_SITE.z + Math.sin(a) * r;
    const y = T.heightAt(x, z);
    const h = 3.2 + rng() * 2.2;
    b.geo(M.stone, U.bevel(0.2), pm(x, y + h / 2 - 0.3, z, (rng() - 0.5) * 0.12, -a, (rng() - 0.5) * 0.12, 1.1 + rng() * 0.4, h, 0.8), { uv: 'frame', uvs: 0.9, color: [1.12, 1.1, 1.06] });
    ctx.colliders.addCircle(x, z, 0.8);
    ctx.addNoScatter(x, z, 1.6);
  }
  ctx.minimap.addCircle(TOWER_SITE.x, TOWER_SITE.z, TOWER_SITE.r, 'rgba(240,240,210,0.35)');

  const stats = { tris: Math.round(b.triangleCount()), arrows };
  b.flush(ctx.batcher);
  fire.buildHalos();
  ctx.scene.add(fire.points, fire.haloPoints);
  const smoke = new Smoke(smokeSrc);
  ctx.scene.add(smoke.group);
  return {
    stats,
    update(dt, t, camPos) {
      townTime.value = t;
      fire.update(dt, camPos);
      fire.haloUniforms.time.value = t;
      smoke.update(t);
      for (const f of movers) f(dt, t);
    },
  };
}

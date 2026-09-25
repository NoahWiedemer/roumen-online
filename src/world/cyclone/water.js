// Water for Cyclone Hill: flat stylised water surfaces (forest pools + river, gorge / chasm streams)
// with depth-based shore foam, and waterfall sheets that hug the cliff face with scrolling streaks,
// foam puffs and spray at their base.
import * as THREE from 'three';
import { mulberry32, lerp } from '../../core/utils.js';
import { sampleSpline } from '../terrain.js';
import { POOLS, RIVER, GORGES, CHASM, WATERFALLS, polar } from './layout.js';
import { waterfallTex, mistPuffTex } from './textures.js';

const waterTime = { value: 0 };

function waterMaterial({ deep = '#157a86', shallow = '#4fd6c4', foam = '#f2fffb', flow = 0 } = {}) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: true,
    uniforms: {
      time: waterTime, deep: { value: new THREE.Color(deep) }, shallow: { value: new THREE.Color(shallow) }, foam: { value: new THREE.Color(foam) },
      flow: { value: flow }, sunDir: { value: new THREE.Vector3(-0.5, 0.7, 0.4).normalize() },
      ...THREE.UniformsLib.fog,
    },
    vertexShader: `attribute float depth; attribute vec2 flowUv; varying float vDepth; varying vec3 vW; varying vec2 vFlow;
      #include <fog_pars_vertex>
      void main(){
        vDepth = depth; vFlow = flowUv;
        vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform float time, flow; uniform vec3 deep, shallow, foam, sunDir; varying float vDepth; varying vec3 vW; varying vec2 vFlow;
      #include <fog_pars_fragment>
      float wave(vec2 p){ return sin(p.x) * 0.5 + sin(p.y * 1.3 + 1.7) * 0.5; }
      void main(){
        vec2 p = vW.xz * 0.45;
        vec2 fl = vec2(vFlow.x * 0.8 - time * flow, vFlow.y * 0.8);
        float r = wave(p * 1.3 + vec2(time * 0.5, time * 0.3)) * 0.5 + wave(p * 2.7 - vec2(time * 0.4, -time * 0.6)) * 0.3 + wave(fl * 3.0) * 0.5 * step(0.001, flow);
        vec3 n = normalize(vec3(r * 0.35, 1.0, wave(p.yx * 1.9 + time * 0.2) * 0.35));
        float d = clamp(vDepth / 2.2, 0.0, 1.0);
        vec3 col = mix(shallow, deep, smoothstep(0.0, 1.0, d));
        vec3 V = normalize(cameraPosition - vW);
        float spec = pow(max(dot(reflect(-sunDir, n), V), 0.0), 60.0);
        float fres = pow(1.0 - max(V.y, 0.0), 3.0);
        col = mix(col, vec3(0.85, 1.0, 0.98), fres * 0.35);
        col += spec * 0.8;
        // bands of foam along the shore + scattered flecks
        float f = smoothstep(0.35, 0.0, vDepth + r * 0.08) + smoothstep(0.93, 1.0, r * 0.5 + 0.5) * 0.25;
        col = mix(col, foam, clamp(f, 0.0, 1.0));
        float a = mix(0.72, 0.92, d) + f * 0.2;
        gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
        #include <fog_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

// grid mesh over a set of sample points: rows along a path (river) or rings (pool)
function surfaceFromGrid(rows, cols, pointAt, level, terrain) {
  const pos = [], depth = [], flow = [], idx = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const { x, z, u, v } = pointAt(i, j);
    pos.push(x, level, z);
    depth.push(Math.max(0, level - terrain.heightAt(x, z)));
    flow.push(u, v);
  }
  for (let j = 0; j < rows - 1; j++) for (let i = 0; i < cols - 1; i++) {
    const a = j * cols + i, b = a + 1, c = a + cols, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('depth', new THREE.Float32BufferAttribute(depth, 1));
  g.setAttribute('flowUv', new THREE.Float32BufferAttribute(flow, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

function ribbon(pts, halfWidth, level, terrain, step = 1.2, cols = 9) {
  const s = sampleSpline(pts, step);
  return surfaceFromGrid(s.length, cols, (i, j) => {
    const p = s[j];
    const w = (i / (cols - 1) - 0.5) * 2 * halfWidth;
    return { x: p.x - p.tz * w, z: p.z + p.tx * w, u: p.s / 4, v: i / (cols - 1) };
  }, level, terrain);
}

function disc(cx, cz, r, level, terrain, rings = 14, seg = 40) {
  return surfaceFromGrid(rings + 1, seg + 1, (i, j) => {
    const a = (i / seg) * Math.PI * 2, rr = (j / rings) * r;
    return { x: cx + Math.cos(a) * rr, z: cz + Math.sin(a) * rr, u: 0, v: 0 };
  }, level, terrain);
}

// ------------------------------------------------------------------ waterfalls
function waterfallSheet(wf, terrain) {
  const [lx, lz] = wf.lip, [bx, bz, level] = wf.base;
  let dx = bx - lx, dz = bz - lz;
  const L = Math.hypot(dx, dz); dx /= L; dz /= L;
  const px = -dz, pz = dx;
  const top = terrain.heightAt(lx, lz) + 0.3;
  // cliff profile: for each height find how far out the face is, keep the sheet slightly in front of it
  const rows = 26, cols = 6;
  const prof = [];
  let sPrev = 0;
  for (let j = 0; j < rows; j++) {
    const t = j / (rows - 1);
    const y = lerp(top, level + 0.2, t);
    let s = sPrev;
    while (s < L && terrain.heightAt(lx + dx * s, lz + dz * s) > y - 0.2) s += 0.25;
    sPrev = s;
    const out = s + 0.7 + Math.sin(t * Math.PI) * 0.6 + (t < 0.08 ? (0.08 - t) * 12 : 0);
    prof.push({ x: lx + dx * out, y, z: lz + dz * out, t });
  }
  const pos = [], uv = [], a = [], idx = [];
  const lenAcc = [0];
  for (let j = 1; j < rows; j++) lenAcc.push(lenAcc[j - 1] + Math.hypot(prof[j].x - prof[j - 1].x, prof[j].y - prof[j - 1].y, prof[j].z - prof[j - 1].z));
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const p = prof[j], u = i / (cols - 1);
    const w = wf.width * (1 + p.t * 0.35) * (u - 0.5);
    pos.push(p.x + px * w, p.y, p.z + pz * w);
    uv.push(u * wf.width / 3, lenAcc[j] / 7);
    a.push(Math.sin(u * Math.PI) ** 0.6 * Math.min(1, p.t * 12 + 0.3));
  }
  for (let j = 0; j < rows - 1; j++) for (let i = 0; i < cols - 1; i++) {
    const k = j * cols + i;
    idx.push(k, k + cols, k + 1, k + 1, k + cols, k + cols + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('edgeA', new THREE.Float32BufferAttribute(a, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return { geo: g, base: new THREE.Vector3(prof[rows - 1].x, level, prof[rows - 1].z), top, dir: new THREE.Vector2(dx, dz) };
}

function waterfallMaterial(speed, tint, opacity) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
    uniforms: { map: { value: waterfallTex() }, time: waterTime, speed: { value: speed }, tint: { value: new THREE.Color(tint) }, opacity: { value: opacity }, ...THREE.UniformsLib.fog },
    vertexShader: `attribute float edgeA; varying vec2 vUv; varying float vA;
      #include <fog_pars_vertex>
      void main(){ vUv = uv; vA = edgeA; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader: `uniform sampler2D map; uniform float time, speed, opacity; uniform vec3 tint; varying vec2 vUv; varying float vA;
      #include <fog_pars_fragment>
      void main(){
        float s = texture2D(map, vec2(vUv.x, vUv.y - time * speed)).a;
        float s2 = texture2D(map, vec2(vUv.x * 1.7 + 0.3, vUv.y * 0.8 - time * speed * 1.4)).a;
        float a = clamp((0.35 + s * 0.9 + s2 * 0.6) * vA * opacity, 0.0, 1.0);
        gl_FragColor = vec4(mix(tint, vec3(1.0), s * 0.7), a);
        #include <fog_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

// foam puffs at the base of a waterfall (camera-facing sprites that swell and fade)
class FoamPuffs {
  constructor(bases) {
    this.list = [];
    this.group = new THREE.Group();
    const tex = mistPuffTex();
    const rng = mulberry32(7401);
    for (const b of bases) {
      for (let i = 0; i < 7; i++) {
        const m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, color: 0xffffff, opacity: 0.7 });
        const s = new THREE.Sprite(m);
        this.group.add(s);
        this.list.push({ s, b, ph: rng(), spread: b.w * 0.5, ox: (rng() - 0.5), oz: (rng() - 0.5) });
      }
    }
  }
  update(t) {
    for (const f of this.list) {
      const k = (t * 0.45 + f.ph) % 1;
      const size = f.b.w * (0.45 + k * 0.9);
      f.s.scale.set(size, size * 0.8, 1);
      f.s.position.set(f.b.x + f.ox * f.spread + f.b.dir.x * 0.8, f.b.y + 0.4 + k * 1.8, f.b.z + f.oz * f.spread + f.b.dir.y * 0.8);
      f.s.material.opacity = Math.sin(k * Math.PI) * 0.75;
    }
  }
}

export function buildWater(ctx) {
  const { terrain } = ctx;
  const group = new THREE.Group();
  group.name = 'cyclone-water';
  ctx.scene.add(group);
  const forestMat = waterMaterial({ flow: 0.35 });
  const deepMat = waterMaterial({ deep: '#0e4f62', shallow: '#3aa9a8', flow: 0.6 });
  const add = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.renderOrder = 2; m.frustumCulled = true; group.add(m); return m; };
  for (const p of POOLS) add(disc(p.x, p.z, p.r * 1.5, p.level, terrain), forestMat);
  add(ribbon(RIVER.pts, RIVER.halfWidth + 3, RIVER.level, terrain), forestMat);
  for (const g of GORGES) {
    const pts = [];
    for (let r = g.r0 - 2; r <= g.r1 + 10; r += 6) pts.push(polar(g.angle, r));
    add(ribbon(pts, g.halfWidth + 5, g.water, terrain, 1.5), deepMat);
  }
  add(ribbon(CHASM.pts, CHASM.halfWidth + 5, CHASM.water, terrain, 1.5), deepMat);

  // waterfalls: two layered sheets each
  const sheetA = waterfallMaterial(0.9, '#bff8ef', 0.85), sheetB = waterfallMaterial(1.35, '#e8fffb', 0.5);
  const bases = [];
  const mistSpots = [];
  for (const wf of WATERFALLS) {
    const s = waterfallSheet(wf, terrain);
    const m1 = new THREE.Mesh(s.geo, sheetA); m1.renderOrder = 3; group.add(m1);
    const m2 = new THREE.Mesh(s.geo, sheetB); m2.renderOrder = 3; m2.scale.setScalar(1); group.add(m2);
    bases.push({ x: s.base.x, y: s.base.y, z: s.base.z, w: wf.width, dir: s.dir });
    mistSpots.push({ x: s.base.x, y: s.base.y + 2.5, z: s.base.z, w: wf.width * 3, h: 7 });
    mistSpots.push({ x: s.base.x, y: s.base.y + 6, z: s.base.z, w: wf.width * 2.4, h: 9 });
    ctx.addNoScatter(s.base.x, s.base.z, wf.width + 2);
  }
  const foam = new FoamPuffs(bases);
  group.add(foam.group);
  return {
    group, mistSpots,
    update(dt, t) { waterTime.value = t; foam.update(t); },
    setSun(dir) { for (const m of [forestMat, deepMat]) m.uniforms.sunDir.value.copy(dir); },
  };
}

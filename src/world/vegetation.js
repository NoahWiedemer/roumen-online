// Trees (instanced, wind-swayed), grass tufts, flowers, rocks, fences and field decoration
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { tex } from '../core/textures.js';
import { mulberry32, makeFbm, smoothstep, clamp } from '../core/utils.js';
import { mat } from '../core/batcher.js';
import { WORLD, Z, SPAWN_ZONES, PORTALS } from './layout.js';

const windUniforms = { uTime: { value: 0 } };

function addWind(material, strength = 1, key = 'wind') {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vec4 wp = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            wp = instanceMatrix * wp;
          #endif
          wp = modelMatrix * wp;
          float h = max(transformed.y, 0.0);
          float sway = sin(uTime * 1.7 + wp.x * 0.35 + wp.z * 0.27) * 0.5 + sin(uTime * 3.1 + wp.x * 0.9) * 0.2;
          transformed.x += sway * h * ${(0.018 * strength).toFixed(4)};
          transformed.z += cos(uTime * 1.3 + wp.z * 0.3) * h * ${(0.012 * strength).toFixed(4)};
        }`);
  };
  material.customProgramCacheKey = () => key;
}

// ------------------------------------------------------------------ tree geometry builders
function colorize(geo, fn) {
  const p = geo.attributes.position;
  const cols = new Float32Array(p.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const c = fn(v);
    cols[i * 3] = c[0]; cols[i * 3 + 1] = c[1]; cols[i * 3 + 2] = c[2];
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return geo;
}

function blob(r, detail, rng, noiseAmt = 0.18) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  const f = makeFbm(Math.floor(rng() * 1000), 3);
  const off = rng() * 100;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = v.clone().normalize();
    const d = 1 + (f(n.x * 1.6 + off, n.y * 1.6 + n.z * 1.3) - 0.5) * noiseAmt * 2;
    v.multiplyScalar(d);
    v.y *= 0.82;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  // make identical positions share normals (icosahedron is non-indexed) → smooth look
  g.deleteAttribute('normal');
  const merged = mergeVerticesSafe(g);
  merged.computeVertexNormals();
  return merged;
}

function mergeVerticesSafe(g) {
  // manual weld by position hash
  const p = g.attributes.position, uv = g.attributes.uv;
  const map = new Map(), pos = [], uvs = [], idx = [];
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`;
    let id = map.get(k);
    if (id === undefined) {
      id = pos.length / 3;
      map.set(k, id);
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      uvs.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
    }
    idx.push(id);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  out.setIndex(idx);
  return out;
}

function sphericalUV(geo, scale = 1) {
  const p = geo.attributes.position;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    uv[i * 2] = (Math.atan2(z, x) / (Math.PI * 2) + 0.5) * 3 * scale;
    uv[i * 2 + 1] = y * 0.5 * scale;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

function trunkGeo(rng, h, r0, r1, bend = 0.3, branches = 3) {
  const parts = [];
  const segs = 6;
  const trunk = new THREE.CylinderGeometry(r1, r0, h, 9, segs, false);
  trunk.translate(0, h / 2, 0);
  const p = trunk.attributes.position;
  const bx = (rng() - 0.5) * bend, bz = (rng() - 0.5) * bend;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), t = y / h;
    p.setX(i, p.getX(i) + bx * t * t);
    p.setZ(i, p.getZ(i) + bz * t * t);
    // root flare
    const flare = Math.max(0, 1 - y / (h * 0.15));
    p.setX(i, p.getX(i) * (1 + flare * 0.6));
    p.setZ(i, p.getZ(i) * (1 + flare * 0.6));
  }
  trunk.computeVertexNormals();
  parts.push(trunk);
  const tops = [];
  for (let b = 0; b < branches; b++) {
    const a = (b / branches) * Math.PI * 2 + rng();
    const len = h * (0.35 + rng() * 0.25);
    const br = new THREE.CylinderGeometry(r1 * 0.35, r1 * 0.7, len, 6);
    br.translate(0, len / 2, 0);
    const tilt = 0.6 + rng() * 0.4;
    const m = new THREE.Matrix4().makeRotationY(a).multiply(new THREE.Matrix4().makeRotationZ(tilt));
    const y0 = h * (0.55 + rng() * 0.3);
    m.premultiply(new THREE.Matrix4().makeTranslation(bx * 0.4, y0, bz * 0.4));
    br.applyMatrix4(m);
    parts.push(br);
    const tip = new THREE.Vector3(0, len, 0).applyMatrix4(m);
    tops.push(tip);
  }
  const g = mergeGeometries(parts.map((x) => x.toNonIndexed()));
  sphericalUV(g, 1.2);
  colorize(g, (v) => { const k = 0.75 + Math.min(1, v.y / h) * 0.3; return [k, k, k]; });
  return { geo: g, top: new THREE.Vector3(bx, h, bz), tops };
}

function canopyGeo(rng, clusters, baseCol = [1, 1, 1]) {
  const parts = [];
  for (const c of clusters) {
    const b = blob(c.r, 2, rng, 0.2);
    b.translate(c.x, c.y, c.z);
    parts.push(b.toNonIndexed());
  }
  const g = mergeGeometries(parts);
  g.computeBoundingBox();
  const minY = g.boundingBox.min.y, maxY = g.boundingBox.max.y;
  sphericalUV(g, 1.6);
  const center = new THREE.Vector3();
  g.boundingBox.getCenter(center);
  colorize(g, (v) => {
    const t = (v.y - minY) / (maxY - minY);
    const out = Math.min(1, v.clone().sub(center).length() / 3);
    const k = 0.55 + t * 0.5 + out * 0.12;
    return [k * baseCol[0], k * baseCol[1], k * baseCol[2]];
  });
  return g;
}

function buildTreeVariant(kind, seed) {
  const rng = mulberry32(seed);
  if (kind === 'round' || kind === 'blossom') {
    const h = 3.2 + rng() * 1.2;
    const t = trunkGeo(rng, h, 0.32, 0.2, 0.5, 3);
    const cl = [{ x: t.top.x, y: h + 1.1, z: t.top.z, r: 2.0 + rng() * 0.4 }];
    for (const tp of t.tops) cl.push({ x: tp.x * 1.1, y: tp.y + 0.5, z: tp.z * 1.1, r: 1.3 + rng() * 0.4 });
    for (let i = 0; i < 3; i++) {
      const a = rng() * Math.PI * 2;
      cl.push({ x: t.top.x + Math.cos(a) * 1.2, y: h + 1.6 + rng() * 0.7, z: t.top.z + Math.sin(a) * 1.2, r: 1.1 + rng() * 0.4 });
    }
    const col = kind === 'blossom' ? [1.0, 0.72, 0.82] : [1, 1, 1];
    return { trunk: t.geo, canopy: canopyGeo(rng, cl, col), radius: 0.45, blossom: kind === 'blossom' };
  }
  if (kind === 'tall') {
    const h = 5 + rng() * 1.5;
    const t = trunkGeo(rng, h, 0.3, 0.16, 0.3, 2);
    const cl = [];
    for (let i = 0; i < 5; i++) cl.push({ x: t.top.x + (rng() - 0.5) * 0.8, y: h - 1.5 + i * 0.9, z: t.top.z + (rng() - 0.5) * 0.8, r: 1.5 - i * 0.18 });
    return { trunk: t.geo, canopy: canopyGeo(rng, cl, [0.9, 1, 0.85]), radius: 0.4 };
  }
  if (kind === 'pine') {
    const h = 6 + rng() * 2;
    const t = trunkGeo(rng, h * 0.6, 0.28, 0.14, 0.1, 0);
    const parts = [];
    for (let i = 0; i < 5; i++) {
      const r = 2.2 - i * 0.38, y = 1.6 + i * 1.15;
      const c = new THREE.ConeGeometry(r, 2.2, 12, 2);
      const p = c.attributes.position;
      for (let k = 0; k < p.count; k++) {
        const yy = p.getY(k);
        if (yy < 0) { const a = Math.atan2(p.getZ(k), p.getX(k)); const d = 1 + Math.sin(a * 6) * 0.08; p.setX(k, p.getX(k) * d); p.setZ(k, p.getZ(k) * d); p.setY(k, yy - 0.15 * Math.abs(Math.sin(a * 6))); }
      }
      c.translate(0, y + 1.1, 0);
      parts.push(c.toNonIndexed());
    }
    const g = mergeGeometries(parts);
    g.computeVertexNormals();
    sphericalUV(g, 1.5);
    colorize(g, (v) => { const k = 0.5 + (v.y / h) * 0.4; return [k * 0.75, k * 0.95, k * 0.8]; });
    return { trunk: t.geo, canopy: g, radius: 0.4 };
  }
  // bush
  const cl = [];
  const n = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) cl.push({ x: (rng() - 0.5) * 1.4, y: 0.55 + rng() * 0.3, z: (rng() - 0.5) * 1.4, r: 0.6 + rng() * 0.35 });
  return { trunk: null, canopy: canopyGeo(rng, cl, [0.95, 1.05, 0.9]), radius: 0.9 };
}

// ------------------------------------------------------------------ main builder
export function buildVegetation(ctx) {
  const { scene, terrain, colliders } = ctx;
  const rng = mulberry32(2024);
  const group = new THREE.Group();
  group.name = 'vegetation';
  scene.add(group);

  const barkMat = new THREE.MeshStandardMaterial({ map: tex('bark'), vertexColors: true, roughness: 0.95 });
  const leafMat = new THREE.MeshStandardMaterial({ map: tex('leaves'), vertexColors: true, roughness: 0.85 });
  addWind(leafMat, 1, 'leaf-wind');
  const blossomMat = new THREE.MeshStandardMaterial({ map: tex('leaves'), vertexColors: true, roughness: 0.8, color: new THREE.Color('#ffb3cf') });
  addWind(blossomMat, 1, 'blossom-wind');

  const zoneAt = (x, z) => terrain.zoneAt(x, z);
  const blocked = (x, z, pad) => colliders.blocked(x, z, pad) || ctx.noScatter.some((n) => Math.hypot(x - n.x, z - n.z) < n.r + pad);
  const nearPortal = (x, z, r) => PORTALS.some((p) => Math.hypot(x - p.x, z - p.z) < r);
  const inSpawn = (x, z, k) => SPAWN_ZONES.some((s) => Math.hypot(x - s.x, z - s.z) < s.r * k);

  // 1. tree placements: town requests + dense forest hills + scattered field trees
  const placements = [...ctx.treeRequests];
  const P = WORLD.half - 2;
  let tries = 0;
  const target = placements.length + 900;
  while (placements.length < target && tries++ < 20000) {
    const x = (rng() * 2 - 1) * P, z = (rng() * 2 - 1) * P;
    const zn = zoneAt(x, z);
    if (zn === Z.FOREST) {
      if (terrain.heightAt(x, z) < 2) continue;
      if (terrain.onPath(x, z, 3)) continue;
      if (nearPortal(x, z, 7)) continue;
      const edge = Math.max(Math.abs(x), Math.abs(z));
      const variant = edge > 150 ? (rng() < 0.55 ? 'pine' : 'tall') : pickVariant(rng, z);
      placements.push({ x, z, scale: 0.9 + rng() * 0.7, variant, forest: true });
    } else if (zn === Z.FIELD) {
      if (rng() > 0.05) continue;
      if (terrain.onPath(x, z, 4) || inSpawn(x, z, 0.8) || nearPortal(x, z, 8)) continue;
      if (blocked(x, z, 2)) continue;
      placements.push({ x, z, scale: 0.8 + rng() * 0.5, variant: pickVariant(rng, z) });
    }
  }
  // bushes on field edges and forest borders
  for (let i = 0; i < 260; i++) {
    const x = (rng() * 2 - 1) * P, z = (rng() * 2 - 1) * P;
    const zn = zoneAt(x, z);
    if (zn !== Z.FIELD && zn !== Z.FOREST) continue;
    if (terrain.onPath(x, z, 1.5) || blocked(x, z, 1.5) || nearPortal(x, z, 5)) continue;
    placements.push({ x, z, scale: 0.7 + rng() * 0.6, variant: 'bush' });
  }

  // 2. variants
  const kinds = ['round', 'tall', 'blossom', 'pine', 'bush'];
  const variants = {};
  for (const k of kinds) variants[k] = [0, 1, 2].map((i) => buildTreeVariant(k, 100 + i * 31 + k.length * 7));

  const buckets = new Map();
  for (const p of placements) {
    const vs = variants[p.variant] || variants.round;
    const vi = Math.floor(rng() * vs.length);
    const key = p.variant + vi;
    if (!buckets.has(key)) buckets.set(key, { v: vs[vi], list: [] });
    buckets.get(key).list.push(p);
    if (p.variant !== 'bush') colliders.addCircle(p.x, p.z, (vs[vi].radius) * p.scale);
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), pos = new THREE.Vector3();
  for (const { v, list } of buckets.values()) {
    const mats = [];
    for (const p of list) {
      const h = terrain.heightAt(p.x, p.z) - 0.15;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * Math.PI * 2);
      const sc = p.scale;
      s.set(sc * (0.9 + rng() * 0.2), sc * (0.9 + rng() * 0.25), sc * (0.9 + rng() * 0.2));
      pos.set(p.x, h, p.z);
      mats.push(m4.clone().compose(pos, q, s));
    }
    const add = (geo, material) => {
      const im = new THREE.InstancedMesh(geo, material, mats.length);
      mats.forEach((m, i) => im.setMatrixAt(i, m));
      im.castShadow = true;
      im.receiveShadow = true;
      im.computeBoundingSphere();
      group.add(im);
    };
    if (v.trunk) add(v.trunk, barkMat);
    add(v.canopy, v.blossom ? blossomMat : leafMat);
  }

  // 3. grass tufts + flowers on the grassy loop and forest floor
  const tuft = crossedQuads(0.9, 0.55);
  const grassMat = new THREE.MeshStandardMaterial({ map: tex('grassBlades'), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1, color: new THREE.Color('#d8f0b0') });
  addWind(grassMat, 5, 'grass-wind');
  const flowerMat = new THREE.MeshStandardMaterial({ map: tex('flowers'), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9 });
  addWind(flowerMat, 4, 'flower-wind');
  const flowerQuad = crossedQuads(0.8, 0.7);
  const grassM = [], flowerM = [];
  const meadow = makeFbm(303, 3);
  for (let i = 0; i < 70000 && grassM.length < 24000; i++) {
    const x = (rng() * 2 - 1) * P, z = (rng() * 2 - 1) * P;
    const zn = zoneAt(x, z);
    if (zn !== Z.FIELD && !(zn === Z.FOREST && rng() < 0.25)) continue;
    if (terrain.onPath(x, z, 0.4)) continue;
    if (terrain.slopeAt(x, z) > 0.35) continue;
    if (ctx.noScatter.some((n) => Math.hypot(x - n.x, z - n.z) < n.r)) continue;
    const h = terrain.heightAt(x, z);
    const sc = 0.7 + rng() * 0.7;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * Math.PI);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, h - 0.03, z), q, new THREE.Vector3(sc, sc * (0.8 + rng() * 0.5), sc));
    const fl = meadow(x * 0.03, z * 0.03);
    if (zn === Z.FIELD && fl > 0.58 && rng() < 0.45) flowerM.push(m);
    else grassM.push(m);
  }
  const mk = (geo, material, list) => {
    const im = new THREE.InstancedMesh(geo, material, list.length);
    list.forEach((m, i) => im.setMatrixAt(i, m));
    im.receiveShadow = true;
    im.computeBoundingSphere();
    group.add(im);
    return im;
  };
  mk(tuft, grassMat, grassM);
  mk(flowerQuad, flowerMat, flowerM);

  // 4. rocks along the loop, the forest edges and the shoreline cliffs
  const rockMat = new THREE.MeshStandardMaterial({ map: tex('stoneWall'), vertexColors: true, roughness: 0.9 });
  for (let i = 0; i < 700 && i >= 0; i++) {
    const x = (rng() * 2 - 1) * P, z = (rng() * 2 - 1) * P;
    const zn = zoneAt(x, z);
    if (zn !== Z.FIELD && zn !== Z.FOREST) continue;
    if (zn === Z.FIELD && rng() > 0.35) continue;
    if (terrain.onPath(x, z, 1.5) || blocked(x, z, 1) || nearPortal(x, z, 6)) continue;
    const r = 0.35 + Math.pow(rng(), 3) * 1.8;
    const g = rockGeo(rng, r);
    const h = terrain.heightAt(x, z);
    ctx.batcher.add(g, rockMat, mat(x, h - r * 0.25, z, rng() * 0.3, rng() * 6, rng() * 0.3));
    if (r > 0.6 && zn === Z.FIELD) colliders.addCircle(x, z, r * 0.85);
  }
  // shoreline boulders where cliffs meet the sea
  for (let i = 0; i < 3000; i++) {
    const x = (rng() * 2 - 1) * P, z = (rng() * 2 - 1) * P;
    if (zoneAt(x, z) !== Z.SEA) continue;
    const h = terrain.heightAt(x, z);
    if (h < -2.2 || h > -0.4) continue;
    if (zoneAt(x + 3, z) === Z.SAND || zoneAt(x - 3, z) === Z.SAND || zoneAt(x, z + 3) === Z.SAND || zoneAt(x, z - 3) === Z.SAND) continue;
    if (terrain.deckAt(x, z) !== null) continue;
    if (rng() > 0.12) continue;
    const r = 0.5 + rng() * 1.3;
    ctx.batcher.add(rockGeo(rng, r), rockMat, mat(x, h + r * 0.3, z, rng() * 0.4, rng() * 6, rng() * 0.4));
  }

  ctx.onUpdate((dt, t) => { windUniforms.uTime.value = t; });
  return { group };
}

function pickVariant(rng, z) {
  const r = rng();
  if (r < 0.55) return 'round';
  if (r < 0.75) return 'tall';
  if (r < 0.85) return 'blossom';
  return 'pine';
}

function crossedQuads(w, h) {
  const parts = [];
  for (let i = 0; i < 3; i++) {
    const g = new THREE.PlaneGeometry(w, h);
    g.translate(0, h / 2, 0);
    g.rotateY((i / 3) * Math.PI);
    parts.push(g);
  }
  const g = mergeGeometries(parts);
  // normals pointing up for soft uniform lighting
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return g;
}

function rockGeo(rng, r) {
  const g = new THREE.DodecahedronGeometry(r, 1);
  const p = g.attributes.position;
  const f = makeFbm(Math.floor(rng() * 999), 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = v.clone().normalize();
    const d = 0.8 + f(n.x * 2 + 5, n.y * 2 + n.z * 2) * 0.45;
    v.multiplyScalar(d);
    v.y *= 0.65;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  const w = mergeVerticesSafe(g);
  w.computeVertexNormals();
  const out = w.toNonIndexed();
  colorize(out, (vv) => { const k = 0.75 + (vv.y / r) * 0.35; return [k, k * 0.97, k * 0.92]; });
  const uv = out.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, out.attributes.position.getX(i) * 0.5, out.attributes.position.getY(i) * 0.5 + out.attributes.position.getZ(i) * 0.3);
  return out;
}

export function makeWater(radius) {
  const g = new THREE.CircleGeometry(radius, 48);
  g.rotateX(-Math.PI / 2);
  const wn = tex('waterNormal');
  const m = new THREE.ShaderMaterial({
    transparent: true,
    fog: true,
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uTime: { value: 0 },
      uNormal: { value: wn },
      uDeep: { value: new THREE.Color('#2f7fb5') },
      uShallow: { value: new THREE.Color('#6fd0e0') },
      uSun: { value: new THREE.Vector3(-0.55, 0.8, 0.35).normalize() },
    },
    vertexShader: `varying vec3 vW; varying vec2 vUv;
      #include <fog_pars_vertex>
      void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vUv = uv; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader: `uniform float uTime; uniform sampler2D uNormal; uniform vec3 uDeep, uShallow, uSun; varying vec3 vW; varying vec2 vUv;
      #include <fog_pars_fragment>
      void main(){
        vec2 p = vW.xz * 0.12;
        vec3 n1 = texture2D(uNormal, p + vec2(uTime*0.02, uTime*0.013)).xyz*2.0-1.0;
        vec3 n2 = texture2D(uNormal, p*1.7 - vec2(uTime*0.017, -uTime*0.02)).xyz*2.0-1.0;
        vec3 n = normalize(vec3(n1.x+n2.x, 3.0, n1.y+n2.y));
        vec3 V = normalize(cameraPosition - vW);
        float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);
        float edge = smoothstep(0.35, 0.5, distance(vUv, vec2(0.5)));
        vec3 col = mix(uDeep, uShallow, edge * 0.8 + fres * 0.3);
        vec3 H = normalize(uSun + V);
        float spec = pow(max(dot(n, H), 0.0), 120.0) * 2.5;
        col = mix(col, vec3(0.85,0.93,1.0), fres*0.5) + spec;
        gl_FragColor = vec4(col, 0.82 - edge * 0.25);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.renderOrder = 1;
  return mesh;
}

// Tiered fountain with animated water + spray, the winged guardian statue on a stepped pedestal
// and the covered wagon with two cute horses (tails swish in update).
import * as THREE from 'three';
import { GeoBuilder, pm, U, unitGeo } from './builder.js';
import { PALETTE } from './parts.js';
import { trough, hayBale, barrel, crate, sack } from './props.js';
import { streakTex, signUV } from './textures.js';
import { tex } from '../../core/textures.js';
import { mulberry32 } from '../../core/utils.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const PINK = [1.0, 0.92, 0.9];

// ------------------------------------------------------------------ water material
function waterMaterial(time) {
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 }, uNormal: { value: null }, uCenter: { value: new THREE.Vector2() }, uRadius: { value: 3 },
      uDeep: { value: new THREE.Color('#1570b8') }, uShallow: { value: new THREE.Color('#3cc2e4') },
      uSun: { value: new THREE.Vector3(-0.55, 0.8, 0.35).normalize() },
    }]),
    vertexShader: `
      varying vec3 vW;
      #include <fog_pars_vertex>
      void main(){
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        vec4 mvPosition = viewMatrix * w;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform float uTime; uniform sampler2D uNormal; uniform vec2 uCenter; uniform float uRadius;
      uniform vec3 uDeep, uShallow, uSun;
      varying vec3 vW;
      #include <common>
      #include <fog_pars_fragment>
      void main(){
        vec2 p = vW.xz;
        vec3 n1 = texture2D(uNormal, p * 0.45 + vec2(uTime * 0.04, uTime * 0.03)).xyz * 2.0 - 1.0;
        vec3 n2 = texture2D(uNormal, p * 0.8 - vec2(uTime * 0.035, -uTime * 0.045)).xyz * 2.0 - 1.0;
        vec2 d = p - uCenter; float r = length(d);
        float ring = sin(r * 10.0 - uTime * 5.5) * (1.0 - smoothstep(0.0, uRadius, r));
        vec2 slope = (n1.xy + n2.xy) * 0.35 + (d / max(r, 1e-3)) * ring * 0.18;
        vec3 n = normalize(vec3(slope.x, 1.0, slope.y));
        vec3 V = normalize(cameraPosition - vW);
        float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);
        vec3 col = mix(uShallow, uDeep, 0.35 + 0.4 * smoothstep(0.0, uRadius, r));
        col = mix(col, vec3(0.75, 0.9, 1.0), fres * 0.45);
        vec3 H = normalize(uSun + V);
        float spec = pow(max(dot(n, H), 0.0), 140.0);
        col += vec3(1.0, 0.97, 0.9) * spec * 2.2;
        col += vec3(0.9, 1.0, 1.0) * max(ring, 0.0) * 0.08;
        float foam = smoothstep(uRadius - 0.3, uRadius - 0.02, r) * (0.55 + 0.45 * sin(uTime * 2.0 + atan(d.y, d.x + 1e-4) * 14.0));
        col = mix(col, vec3(1.0), foam * 0.55);
        gl_FragColor = vec4(col, 0.82 + fres * 0.15);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const n = tex('waterNormal');
  m.uniforms.uNormal.value = n;
  m.uniforms.uTime = time;
  return m;
}

function streakMaterial(time, speed, dir = -1) {
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.NormalBlending, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uMap: { value: null }, uSpeed: { value: speed } }]),
    vertexShader: `
      varying vec2 vUv;
      #include <fog_pars_vertex>
      void main(){ vUv = uv; vec4 mvPosition = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform float uTime; uniform sampler2D uMap; uniform float uSpeed;
      varying vec2 vUv;
      #include <common>
      #include <fog_pars_fragment>
      void main(){
        float a = texture2D(uMap, vec2(vUv.x * 6.0, vUv.y * 1.5 + uTime * uSpeed)).r;
        float b = texture2D(uMap, vec2(vUv.x * 9.0 + 0.3, vUv.y * 1.1 + uTime * uSpeed * 1.3)).r;
        float s = max(a, b);
        float edge = smoothstep(0.0, 0.12, vUv.y) * (1.0 - smoothstep(0.85, 1.0, vUv.y));
        vec3 col = mix(vec3(0.45, 0.78, 0.98), vec3(0.95, 1.0, 1.0), s);
        gl_FragColor = vec4(col, (0.1 + s * 0.62) * edge);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  m.uniforms.uMap.value = streakTex();
  m.uniforms.uTime = time;
  m.uniforms.uSpeed.value = speed * dir;
  return m;
}

// ------------------------------------------------------------------ fountain
export function fountain(ctx, b, M, cx, cy, cz, dyn) {
  // lower basin (profile: outer bottom -> up -> rim -> inner down)
  const lower = U.lathe('fnt_lower', [[3.55, -0.3], [3.55, 0.08], [3.42, 0.12], [3.38, 0.5], [3.5, 0.56], [3.5, 0.68], [3.36, 0.76], [3.08, 0.76], [2.98, 0.68], [2.98, 0.2], [2.9, 0.15]], 40);
  b.geo(M.plaza, lower, pm(cx, cy, cz), { uv: 'keep', uvScale: [8, 0.4], color: PINK });
  // basin floor
  b.geo(M.color, U.circle(32), pm(cx, cy + 0.16, cz, 0, 0, 0, 3.0, 1, 3.0), { color: [0.32, 0.6, 0.72] });
  // pedestal column with mouldings
  const ped = U.lathe('fnt_ped', [[0.85, 0], [0.85, 0.25], [0.7, 0.32], [0.5, 0.45], [0.42, 0.7], [0.4, 1.3], [0.5, 1.45], [0.6, 1.55], [0.001, 1.56]], 24);
  b.geo(M.marble, ped, pm(cx, cy + 0.15, cz), { uv: 'keep', uvScale: [3, 1] });
  // upper basin (shell bowl)
  const upper = U.lathe('fnt_upper', [[0.35, 0], [0.8, 0.1], [1.2, 0.3], [1.45, 0.5], [1.52, 0.6], [1.48, 0.66], [1.36, 0.62], [1.3, 0.55], [0.001, 0.5]], 32);
  b.geo(M.marble, upper, pm(cx, cy + 1.6, cz), { uv: 'keep', uvScale: [4, 0.6] });
  // scallop bumps on the upper rim
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    b.geo(M.marble, U.sphere(8, 5), pm(cx + Math.cos(a) * 1.44, cy + 2.2, cz + Math.sin(a) * 1.44, 0, -a, 0, 0.14, 0.09, 0.2), { uv: 'keep' });
  }
  // top column + bowl + finial
  const top = U.lathe('fnt_top', [[0.3, 0], [0.22, 0.12], [0.18, 0.5], [0.24, 0.62], [0.001, 0.63]], 16);
  b.geo(M.marble, top, pm(cx, cy + 2.1, cz), { uv: 'keep', uvScale: [2, 0.6] });
  const bowl = U.lathe('fnt_bowl', [[0.12, 0], [0.4, 0.1], [0.62, 0.28], [0.66, 0.34], [0.6, 0.36], [0.001, 0.3]], 20);
  b.geo(M.marble, bowl, pm(cx, cy + 2.72, cz), { uv: 'keep', uvScale: [2, 0.4] });
  b.geo(M.gold, U.sphere(10, 8), pm(cx, cy + 3.15, cz, 0, 0, 0, 0.16), {});
  // decorative fish spouts on the pedestal
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    b.geo(M.gold, U.cyl(8), pm(cx + Math.cos(a) * 0.55, cy + 0.95, cz + Math.sin(a) * 0.55, 0, -a, Math.PI / 2, 0.06, 0.3, 0.06), {});
  }

  // ---- dynamic water (separate meshes)
  const time = dyn.time;
  const wmat = waterMaterial(time);
  wmat.uniforms.uCenter.value.set(cx, cz);
  wmat.uniforms.uRadius.value = 3.0;
  const w1 = new THREE.Mesh(new THREE.RingGeometry(0.5, 3.0, 48, 2).rotateX(-Math.PI / 2), wmat);
  w1.position.set(cx, cy + 0.6, cz);
  const wmat2 = wmat.clone();
  wmat2.uniforms = { ...wmat.uniforms, uRadius: { value: 1.32 }, uCenter: { value: new THREE.Vector2(cx, cz) } };
  const w2 = new THREE.Mesh(new THREE.CircleGeometry(1.32, 32).rotateX(-Math.PI / 2), wmat2);
  w2.position.set(cx, cy + 2.2, cz);
  const wmat3 = wmat.clone();
  wmat3.uniforms = { ...wmat.uniforms, uRadius: { value: 0.58 }, uCenter: { value: new THREE.Vector2(cx, cz) } };
  const w3 = new THREE.Mesh(new THREE.CircleGeometry(0.58, 20).rotateX(-Math.PI / 2), wmat3);
  w3.position.set(cx, cy + 3.04, cz);
  // falling curtains + jet
  const cur = streakMaterial(time, 1.4, 1);
  const c1 = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.72, 1.6, 40, 1, true), cur);
  c1.position.set(cx, cy + 1.42, cz);
  const c2 = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.78, 0.84, 24, 1, true), cur);
  c2.position.set(cx, cy + 2.64, cz);
  const jetM = streakMaterial(time, 2.2, -1);
  const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.09, 1.1, 10, 1, true), jetM);
  jet.position.set(cx, cy + 3.75, cz);
  const g = new THREE.Group();
  g.name = 'fountainWater';
  for (const m of [w1, w2, w3, c1, c2, jet]) { m.renderOrder = 2; g.add(m); }
  ctx.scene.add(g);

  // spray particles
  const N = 420;
  const pos = new Float32Array(N * 3), vel = new Float32Array(N * 3), kind = new Uint8Array(N);
  const rng = mulberry32(77);
  const spawn = (i, first) => {
    const k = i % 3; // 0 jet, 1 upper curtain drops, 2 top curtain drops
    kind[i] = k;
    if (k === 0) {
      const a = rng() * Math.PI * 2, sp = 0.25 + rng() * 0.55;
      pos[i * 3] = cx; pos[i * 3 + 1] = cy + 4.1 + rng() * 0.2; pos[i * 3 + 2] = cz;
      vel[i * 3] = Math.cos(a) * sp; vel[i * 3 + 1] = 0.6 + rng() * 1.4; vel[i * 3 + 2] = Math.sin(a) * sp;
    } else {
      const a = rng() * Math.PI * 2, r = k === 1 ? 1.55 : 0.68;
      pos[i * 3] = cx + Math.cos(a) * r; pos[i * 3 + 1] = (k === 1 ? cy + 2.2 : cy + 3.06) - rng() * 0.2; pos[i * 3 + 2] = cz + Math.sin(a) * r;
      const sp = 0.2 + rng() * 0.3;
      vel[i * 3] = Math.cos(a) * sp; vel[i * 3 + 1] = -rng() * 0.5; vel[i * 3 + 2] = Math.sin(a) * sp;
    }
    if (first) { const f = rng(); for (let s = 0; s < 3; s++) pos[i * 3 + s] += vel[i * 3 + s] * f * 0.6; }
  };
  for (let i = 0; i < N; i++) spawn(i, true);
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pmMat = new THREE.PointsMaterial({ map: tex('glow'), size: 0.16, color: 0xe8fbff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, opacity: 0.9 });
  const pts = new THREE.Points(pg, pmMat);
  pts.name = 'fountainSpray';
  pts.frustumCulled = false;
  ctx.scene.add(pts);
  const floors = [cy + 0.6, cy + 2.2, cy + 3.04];
  dyn.updaters.push((dt) => {
    for (let i = 0; i < N; i++) {
      vel[i * 3 + 1] -= 9.8 * dt;
      pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      const dx = pos[i * 3] - cx, dz = pos[i * 3 + 2] - cz, r = Math.hypot(dx, dz);
      const floor = r < 0.6 ? floors[2] : r < 1.45 ? floors[1] : floors[0];
      if (pos[i * 3 + 1] < floor && vel[i * 3 + 1] < 0) spawn(i, false);
    }
    pg.attributes.position.needsUpdate = true;
  });
}

// ------------------------------------------------------------------ statue on a stepped pedestal
export function statue(ctx, b, M, x, y, z, rot) {
  b.resetFrame();
  b.push(pm(x, y, z, 0, rot, 0));
  const steps = [[5.2, 0.3], [4.4, 0.3], [3.6, 0.3]];
  let yy = 0;
  for (const [s, h] of steps) {
    b.box(M.stone, pm(0, yy + h / 2 - (yy === 0 ? 0.2 : 0), 0), s, h + (yy === 0 ? 0.4 : 0), s, { uv: 'frame', uvs: 0.5, color: [1.18, 1.14, 1.08] });
    yy += h;
  }
  const pw = 2.4, ph = 3.0;
  b.box(M.marble, pm(0, yy + 0.15, 0), pw + 0.4, 0.3, pw + 0.4, { uv: 'frame', uvs: 0.5 });
  b.box(M.marble, pm(0, yy + 0.3 + ph / 2, 0), pw, ph, pw, { uv: 'frame', uvs: 0.4 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(M.marble, pm(sx * (pw / 2 - 0.1), yy + 0.3 + ph / 2, sz * (pw / 2 - 0.1)), 0.32, ph, 0.32, { uv: 'frame', uvs: 0.4, color: [1.04, 1.04, 1.04] });
  b.box(M.marble, pm(0, yy + 0.3 + ph + 0.12, 0), pw + 0.36, 0.24, pw + 0.36, { uv: 'frame', uvs: 0.5 });
  b.box(M.marble, pm(0, yy + 0.3 + ph + 0.36, 0), pw + 0.1, 0.24, pw + 0.1, { uv: 'frame', uvs: 0.5 });
  const [u0, v0, u1, v1] = signUV(7);
  const py = yy + 0.3 + ph * 0.55, pz = pw / 2 + 0.03;
  b.quad(M.signs, V3(-0.75, py - 0.75, pz), V3(0.75, py - 0.75, pz), V3(0.75, py + 0.75, pz), V3(-0.75, py + 0.75, pz), [u0, v0], [u1, v0], [u1, v1], [u0, v1], [0.95, 0.93, 0.9], V3(0, 0, 1));
  b.geo(M.gold, U.torus(1, 0.05, 6, 32), pm(0, py, pz, 0, 0, 0, 0.86), {});
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    b.geo(M.marble, U.lathe('urn', [[0.001, 0], [0.2, 0], [0.14, 0.12], [0.26, 0.38], [0.3, 0.5], [0.001, 0.5]], 12), pm(sx * 2.25, 0.3, sz * 2.25), { uv: 'keep' });
    b.geo(M.leaf, U.sphere(8, 6), pm(sx * 2.25, 0.95, sz * 2.25, 0, 0, 0, 0.36, 0.3, 0.36), { uv: 'keep', uvScale: [1.5, 1] });
    for (let i = 0; i < 6; i++) b.geo(M.color, U.ico(0), pm(sx * 2.25 + Math.cos(i) * 0.22, 1.1 + (i % 2) * 0.1, sz * 2.25 + Math.sin(i) * 0.22, i, i, 0, 0.08), { color: PALETTE.flowers[(i + (sx > 0 ? 0 : 3)) % 7], flat: true });
  }
  guardianFigure(b, M, 0, yy + 0.3 + ph + 0.48, 0);
  b.pop();
  ctx.colliders.addBox(x, z, 2.7, 2.7, rot);
  ctx.minimap.addRect(x, z, 5.2, 5.2, rot, '#e8e4dc');
  ctx.addNoScatter(x, z, 4);
}

// Winged guardian (original design): robed figure raising a sword with both hands, large
// layered wings, all in pale marble. Local frame: feet at y0, facing +z.
function guardianFigure(b, M, x, y0, z) {
  b.push(pm(x, y0, z));
  const mm = M.marble;
  const o = { uv: 'keep', uvScale: [2, 1] };
  // plinth disc
  b.geo(mm, U.cyl(20), pm(0, 0.1, 0, 0, 0, 0, 1.0, 0.2, 1.0), o);
  // robe
  b.geo(mm, U.lathe('robe', [[0.001, 0.2], [0.95, 0.2], [0.9, 0.45], [0.78, 1.0], [0.62, 1.6], [0.52, 2.0], [0.5, 2.1], [0.001, 2.1]], 20), pm(0, 0, 0, 0, 0, 0, 1, 1, 0.8), o);
  // robe folds
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    b.geo(mm, U.cyl(6), pm(Math.sin(a) * 0.7, 1.1, Math.cos(a) * 0.56, Math.cos(a) * 0.14, 0, -Math.sin(a) * 0.14, 0.09, 1.7, 0.09), o);
  }
  // belt
  b.geo(mm, U.cyl(18, true), pm(0, 2.08, 0, 0, 0, 0, 0.53, 0.14, 0.44), o);
  // torso (chest armour)
  b.geo(mm, U.lathe('torso', [[0.001, 2.0], [0.48, 2.05], [0.55, 2.4], [0.6, 2.75], [0.5, 2.95], [0.22, 3.05], [0.001, 3.06]], 18), pm(0, 0, 0, 0, 0, 0, 1, 1, 0.78), o);
  // shoulders
  for (const s of [-1, 1]) b.geo(mm, U.sphere(12, 8), pm(s * 0.56, 2.9, 0, 0, 0, 0, 0.28, 0.24, 0.28), o);
  // neck + head + hair + circlet
  b.geo(mm, U.cyl(10), pm(0, 3.12, 0, 0, 0, 0, 0.14, 0.3, 0.14), o);
  b.geo(mm, U.sphere(16, 12), pm(0, 3.5, 0.04, 0, 0, 0, 0.34, 0.38, 0.34), o);
  b.geo(mm, U.sphere(14, 10), pm(0, 3.6, -0.06, 0.2, 0, 0, 0.37, 0.36, 0.36), o);
  for (const s of [-1, 1]) b.geo(mm, U.sphere(10, 8), pm(s * 0.26, 3.3, -0.1, 0.2, 0, s * 0.3, 0.14, 0.34, 0.16), o);
  b.geo(mm, U.sphere(10, 8), pm(0, 3.25, -0.28, 0.5, 0, 0, 0.2, 0.42, 0.16), o);
  b.geo(M.gold, U.torus(1, 0.07, 6, 24), pm(0, 3.72, 0.0, Math.PI / 2 - 0.2, 0, 0, 0.36), {});
  b.geo(M.gold, U.sphere(6, 4), pm(0, 3.78, 0.35, 0, 0, 0, 0.06), {});
  // arms raised: upper arm from shoulder up-in, forearm to the hands above the head
  const hand = V3(0, 4.25, 0.32);
  for (const s of [-1, 1]) {
    const sh = V3(s * 0.62, 2.9, 0.02);
    const el = V3(s * 0.62, 3.62, 0.3);
    limb(b, mm, sh, el, 0.14, o);
    limb(b, mm, el, V3(s * 0.12, hand.y, hand.z), 0.12, o);
    b.geo(mm, U.sphere(10, 8), pm(el.x, el.y, el.z, 0, 0, 0, 0.14), o);
    // sleeve cuff
    b.geo(mm, U.cyl(10, true), pm(s * 0.4, 3.9, 0.31, 0, 0, s * 0.9, 0.14, 0.12, 0.14), o);
  }
  b.geo(mm, U.sphere(10, 8), pm(0, hand.y, hand.z, 0, 0, 0, 0.2, 0.16, 0.16), o);
  // sword pointing up
  b.geo(mm, U.cyl(8), pm(0, hand.y - 0.05, hand.z, 0, 0, 0, 0.06, 0.5, 0.06), o);
  b.geo(M.gold, U.sphere(8, 6), pm(0, hand.y - 0.34, hand.z, 0, 0, 0, 0.1), {});
  b.box(mm, pm(0, hand.y + 0.25, hand.z), 0.9, 0.12, 0.14, { uv: 'part', uvs: 1 });
  for (const s of [-1, 1]) b.geo(mm, U.sphere(8, 6), pm(s * 0.47, hand.y + 0.25, hand.z, 0, 0, 0, 0.09), o);
  b.box(mm, pm(0, hand.y + 1.3, hand.z), 0.2, 2.0, 0.06, { uv: 'part', uvs: 1, color: [1.06, 1.06, 1.08] });
  b.geo(mm, U.coneCap(4), pm(0, hand.y + 2.55, hand.z, 0, Math.PI / 4, 0, 0.14, 0.5, 0.042), { color: [1.06, 1.06, 1.08] });
  b.box(mm, pm(0, hand.y + 1.3, hand.z + 0.035), 0.04, 1.9, 0.01, { uv: 'part', uvs: 1, color: [0.9, 0.9, 0.95] });
  // wings
  for (const s of [-1, 1]) wing(b, mm, s, o);
  b.pop();
}
function limb(b, mat, a, c, r, o) {
  const mid = a.clone().add(c).multiplyScalar(0.5);
  const dir = c.clone().sub(a);
  const L = dir.length();
  const q = new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), dir.normalize());
  b.geo(mat, U.cyl(10), new THREE.Matrix4().compose(mid, q, V3(r, L, r)), o);
}
function wing(b, mat, s, o) {
  // wing plane: outward (s*x) and up, tilted back
  const root = V3(s * 0.3, 2.75, -0.32);
  const back = 0.5;
  const U_ = V3(s * Math.cos(back), 0, -Math.sin(back)); // outward
  const Vv = V3(0, 1, 0);
  const W = (u, v, off = 0) => root.clone().addScaledVector(U_, u).addScaledVector(Vv, v).add(V3(0, 0, -off));
  // arm (bone): curve up and out
  const arm = [[0, 0], [0.6, 0.55], [1.3, 1.25], [2.0, 1.75], [2.6, 2.05]];
  for (let i = 0; i < arm.length - 1; i++) limb(b, mat, W(arm[i][0], arm[i][1]), W(arm[i + 1][0], arm[i + 1][1]), 0.13 - i * 0.02, o);
  // feathers: three layers hanging from the arm, longer towards the tip
  const layers = [
    { n: 9, len: [0.7, 1.1], off: 0.05, w: 0.2 },
    { n: 11, len: [1.2, 2.1], off: 0.1, w: 0.21 },
    { n: 13, len: [1.5, 3.0], off: 0.15, w: 0.22 },
  ];
  layers.forEach((L, li) => {
    for (let i = 0; i < L.n; i++) {
      const t = i / (L.n - 1);
      // attachment along arm polyline
      const f = t * (arm.length - 1);
      const k = Math.min(arm.length - 2, Math.floor(f)), ft = f - k;
      const au = arm[k][0] + (arm[k + 1][0] - arm[k][0]) * ft, av = arm[k][1] + (arm[k + 1][1] - arm[k][1]) * ft;
      const len = L.len[0] + (L.len[1] - L.len[0]) * Math.pow(t, 1.3) * (li === 2 ? 1 : 0.9);
      // direction: down near root, sweeping outward near tip
      const ang = -Math.PI / 2 + t * 1.15 + li * 0.05; // in wing plane
      const du = Math.cos(ang), dv = Math.sin(ang);
      const start = W(au, av - li * 0.05, L.off);
      const end = W(au + du * len, av + dv * len, L.off + 0.05);
      const mid = start.clone().add(end).multiplyScalar(0.5);
      const dir = end.clone().sub(start).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), dir);
      // flatten the feather in the wing plane: rotate around its axis so local z aligns with wing normal
      const nrm = new THREE.Vector3().crossVectors(U_, Vv).normalize();
      const localZ = V3(0, 0, 1).applyQuaternion(q);
      const twist = Math.atan2(new THREE.Vector3().crossVectors(localZ, nrm).dot(dir), localZ.dot(nrm));
      q.multiply(new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), twist));
      b.geo(mat, U.sphere(8, 6), new THREE.Matrix4().compose(mid, q, V3(L.w, len / 2, 0.045)), { ...o, color: [1 - li * 0.03, 1 - li * 0.03, 1 - li * 0.02] });
    }
  });
}

// ------------------------------------------------------------------ wagon + horses
export function buildWagon(ctx, b, M, dyn, T, x0, z0, rot) {
  const y0 = T.heightAt(x0, z0);
  b.resetFrame();
  b.push(pm(x0, y0, z0, 0, rot, 0));
  // --- wagon: local +z = forward (towards horses)
  const bedY = 0.95, bl = 3.4, bw = 1.7;
  b.box(M.wood, pm(0, bedY, 0), bw, 0.12, bl, { uvs: 0.8 });
  for (const s of [-1, 1]) {
    b.box(M.wood, pm(s * (bw / 2 - 0.05), bedY + 0.3, 0), 0.08, 0.5, bl, { uvs: 0.8 });
    b.box(M.paint, pm(s * (bw / 2 + 0.0), bedY + 0.52, 0), 0.1, 0.08, bl + 0.05, { color: [0.75, 0.3, 0.25] });
  }
  b.box(M.wood, pm(0, bedY + 0.3, -bl / 2 + 0.04), bw, 0.5, 0.08, { uvs: 0.8 });
  b.box(M.wood, pm(0, bedY + 0.3, bl / 2 - 0.04), bw, 0.5, 0.08, { uvs: 0.8 });
  // chassis + axles
  b.box(M.timber, pm(0, bedY - 0.15, 0), 0.9, 0.16, bl - 0.2, { uv: 'grain' });
  for (const az of [-1.05, 1.1]) b.box(M.iron, pm(0, 0.55, az), bw + 0.5, 0.08, 0.08);
  // wheels
  for (const [az, r] of [[-1.05, 0.62], [1.1, 0.5]]) for (const s of [-1, 1]) wheel(b, M, s * (bw / 2 + 0.2), r, az, r);
  // canvas cover on hoops
  const hoopN = 5;
  const coverR = 0.95;
  const cover = unitGeo('halfcyl', () => new THREE.CylinderGeometry(1, 1, 1, 16, 1, true, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2));
  b.geo(M.fabric, cover, pm(0, bedY + 0.55, -0.1, 0, 0, 0, coverR, coverR * 1.15, bl - 0.4), { uv: 'keep', uvScale: [3, 2], color: [1.0, 0.97, 0.9] });
  for (let i = 0; i < hoopN; i++) {
    const hz = -bl / 2 + 0.3 + (i / (hoopN - 1)) * (bl - 0.8);
    b.geo(M.wood, U.torus(1, 0.035, 4, 14, Math.PI), pm(0, bedY + 0.55, hz, 0, 0, 0, coverR + 0.02, (coverR + 0.02) * 1.15, 1), {});
  }
  // cargo peeking out the back
  crate(b, M, -0.35, bedY + 0.06, -bl / 2 + 0.55, 0.3, 0.55);
  sack(b, M, 0.4, bedY + 0.06, -bl / 2 + 0.5, 0.5, 0.9);
  barrel(b, M, 0.1, bedY + 0.06, -0.4, 0, 0.85);
  // driver seat + footboard
  b.box(M.wood, pm(0, bedY + 0.75, bl / 2 - 0.35), bw - 0.2, 0.08, 0.45, { uvs: 1 });
  b.box(M.paint, pm(0, bedY + 0.75 + 0.05, bl / 2 - 0.35), bw - 0.3, 0.06, 0.4, { color: [0.8, 0.25, 0.3] });
  b.box(M.wood, pm(0, bedY + 0.2, bl / 2 + 0.25, -0.5, 0, 0), bw - 0.2, 0.06, 0.6, { uvs: 1 });
  // shafts to the horses
  for (const s of [-1, 1]) b.box(M.wood, pm(s * 0.95, 0.95, bl / 2 + 1.5, 0.08, 0, 0), 0.08, 0.08, 3.2, { uv: 'grain' });
  b.box(M.wood, pm(0, 0.95, bl / 2 + 0.2), 2.0, 0.1, 0.1, { uv: 'grain' });
  // horses
  const tails = [];
  const horseCols = [
    { body: [0.66, 0.4, 0.22], mane: [0.28, 0.16, 0.1], socks: [1, 0.97, 0.92], blanket: [0.25, 0.45, 0.85] },
    { body: [0.96, 0.94, 0.92], mane: [0.62, 0.6, 0.62], socks: [0.85, 0.82, 0.8], blanket: [0.85, 0.28, 0.35] },
  ];
  for (let i = 0; i < 2; i++) {
    const hx = (i === 0 ? -1 : 1) * 0.5;
    const t = horse(b, M, hx, bl / 2 + 2.3, horseCols[i], i);
    tails.push(t);
  }
  b.pop();
  // tails as separate animated meshes
  const frame = pm(x0, y0, z0, 0, rot, 0);
  for (const [i, t] of tails.entries()) {
    const tb = new GeoBuilder();
    const tl = 0.8;
    for (let k = 0; k < 6; k++) {
      const f = k / 5;
      tb.geo(M.color, U.sphere(8, 6), pm(0, -f * tl * 0.9, -0.05 - f * 0.12, 0.3 + f * 0.2, 0, 0, 0.1 + f * 0.05, 0.18, 0.1 + f * 0.04), { color: horseCols[i].mane, ao: false });
    }
    const geo = tb.toGeometry(M.color);
    const mesh = new THREE.Mesh(geo, M.color);
    mesh.castShadow = true;
    const pivot = new THREE.Group();
    pivot.name = 'horseTail';
    const wp = t.clone().applyMatrix4(frame);
    pivot.position.copy(wp);
    pivot.rotation.set(0, rot, 0, 'YXZ');
    pivot.add(mesh);
    ctx.scene.add(pivot);
    const ph = i * 1.7;
    dyn.updaters.push((dt, time) => {
      const sw = Math.sin(time * 1.3 + ph);
      const flick = Math.max(0, Math.sin(time * 0.37 + ph * 3)) ** 8;
      mesh.rotation.z = sw * 0.18 + Math.sin(time * 7 + ph) * 0.25 * flick;
      mesh.rotation.x = -0.12 + Math.sin(time * 0.9 + ph) * 0.06;
    });
  }
  // colliders: wagon body + horses
  const c = Math.cos(rot), s = Math.sin(rot);
  const at = (lx, lz) => [x0 + lx * c + lz * s, z0 - lx * s + lz * c];
  let [wx, wz] = at(0, 0.2);
  ctx.colliders.addBox(wx, wz, 1.25, 2.1, rot);
  [wx, wz] = at(0, bl / 2 + 2.1);
  ctx.colliders.addBox(wx, wz, 1.2, 1.7, rot);
  ctx.minimap.addRect(...at(0, 1.2), 1.8, 7.5, rot, '#efe6cf');
  ctx.addNoScatter(...at(0, 1.2), 5);
  // extras: trough + hay + barrels
  const [tx, tz] = at(2.4, bl / 2 + 2.2);
  trough(b, M, tx, T.heightAt(tx, tz), tz, rot);
  ctx.colliders.addBox(tx, tz, 0.85, 0.35, rot);
  const [hx1, hz1] = at(-2.2, -1.2);
  hayBale(b, M, hx1, T.heightAt(hx1, hz1) - 0.05, hz1, rot + 0.3);
  const [hx2, hz2] = at(-2.3, -0.1);
  hayBale(b, M, hx2, T.heightAt(hx2, hz2) - 0.05, hz2, rot - 0.2);
  ctx.colliders.addCircle(hx1, hz1, 0.6);
  ctx.colliders.addCircle(hx2, hz2, 0.6);
  const [bx, bz] = at(2.0, -1.4);
  barrel(b, M, bx, T.heightAt(bx, bz), bz, 0.4, 1, { water: true });
  crate(b, M, bx + 0.7, T.heightAt(bx + 0.7, bz + 0.4), bz + 0.4, 0.7, 0.65);
  ctx.colliders.addCircle(bx + 0.3, bz + 0.2, 0.8);
  const [fx, fz] = at(-1.9, 1.5);
  return { spot: { x: fx, z: fz, rotY: rot - Math.PI / 2 } };
}

function wheel(b, M, x, y, z, r) {
  b.push(pm(x, y, z, 0, 0, 0));
  b.geo(M.wood, U.torus(1, 0.07, 6, 20), pm(0, 0, 0, 0, Math.PI / 2, 0, r, r, r * 1.2), { color: [0.9, 0.8, 0.7] });
  b.geo(M.iron, U.torus(1, 0.04, 4, 20), pm(0.02, 0, 0, 0, Math.PI / 2, 0, r + 0.04, r + 0.04, (r + 0.04) * 1.6), {});
  b.geo(M.wood, U.cyl(10), pm(0, 0, 0, 0, 0, Math.PI / 2, 0.1, 0.22, 0.1), { color: [0.8, 0.7, 0.6] });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    b.box(M.wood, pm(0, Math.sin(a) * r / 2, Math.cos(a) * r / 2, -a, 0, 0), 0.05, 0.05, r, { uv: 'grain', color: [0.9, 0.8, 0.7] });
  }
  b.pop();
}

// cute stylised horse; local +z forward. returns tail root (local, in the builder's current frame)
function horse(b, M, x, z, C, idx) {
  b.push(pm(x, 0, z));
  const col = (c) => ({ color: c, uv: 'keep' });
  const body = C.body;
  // body + chest + rump
  b.geo(M.color, U.sphere(16, 12), pm(0, 1.08, 0, 0, 0, 0, 0.36, 0.4, 0.72), col(body));
  b.geo(M.color, U.sphere(12, 10), pm(0, 1.12, 0.45, 0, 0, 0, 0.34, 0.4, 0.4), col(body));
  b.geo(M.color, U.sphere(12, 10), pm(0, 1.12, -0.42, 0, 0, 0, 0.36, 0.4, 0.42), col(body));
  // neck
  const nb = V3(0, 1.3, 0.62), nt = V3(0, 1.95, 0.92);
  const q = new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), nt.clone().sub(nb).normalize());
  b.geo(M.color, U.frustum(0.75, 12), new THREE.Matrix4().compose(nb.clone().add(nt).multiplyScalar(0.5), q, V3(0.24, nt.distanceTo(nb) + 0.2, 0.28)), col(body));
  // head
  b.geo(M.color, U.sphere(14, 10), pm(0, 2.02, 1.02, 0.55, 0, 0, 0.22, 0.25, 0.3), col(body));
  b.geo(M.color, U.sphere(12, 8), pm(0, 1.86, 1.28, 0.7, 0, 0, 0.17, 0.2, 0.18), col(idx === 0 ? [0.5, 0.3, 0.18] : [0.88, 0.8, 0.8]));
  if (idx === 0) b.geo(M.color, U.sphere(8, 6), pm(0, 2.1, 1.22, 0.4, 0, 0, 0.07, 0.16, 0.05), col([1, 0.97, 0.92]));
  // nostrils
  for (const s of [-1, 1]) b.geo(M.color, U.sphere(6, 4), pm(s * 0.07, 1.78, 1.4, 0, 0, 0, 0.03), col([0.2, 0.12, 0.1]));
  // big cute eyes
  for (const s of [-1, 1]) {
    b.geo(M.color, U.sphere(10, 8), pm(s * 0.17, 2.1, 1.1, 0, 0, 0, 0.065, 0.08, 0.065), col([0.12, 0.08, 0.08]));
    b.geo(M.color, U.sphere(6, 4), pm(s * 0.2, 2.13, 1.14, 0, 0, 0, 0.022), col([1, 1, 1]));
  }
  // ears
  for (const s of [-1, 1]) b.geo(M.color, U.coneCap(8), pm(s * 0.11, 2.3, 0.92, -0.2, 0, -s * 0.25, 0.06, 0.2, 0.05), col(body));
  // mane
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    const p = nb.clone().lerp(nt, t);
    b.geo(M.color, U.sphere(8, 6), pm(0, p.y + 0.18, p.z - 0.12 + t * 0.05, -0.5, 0, 0, 0.09, 0.16, 0.14), col(C.mane));
  }
  b.geo(M.color, U.sphere(8, 6), pm(0, 2.28, 1.08, 0.4, 0, 0, 0.1, 0.12, 0.14), col(C.mane));
  // legs with socks + hooves
  for (const [lx, lz] of [[-0.2, 0.45], [0.2, 0.45], [-0.2, -0.45], [0.2, -0.45]]) {
    b.geo(M.color, U.frustum(0.75, 10), pm(lx, 0.62, lz, 0, 0, 0, 0.12, 0.72, 0.12), col(body));
    b.geo(M.color, U.cyl(10), pm(lx, 0.2, lz, 0, 0, 0, 0.1, 0.22, 0.1), col(C.socks));
    b.geo(M.color, U.cyl(10), pm(lx, 0.05, lz, 0, 0, 0, 0.11, 0.1, 0.12), col([0.3, 0.25, 0.22]));
  }
  // harness: collar, blanket, straps
  const cq = new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), nt.clone().sub(nb).normalize());
  b.geo(M.color, U.torus(1, 0.28, 6, 16), new THREE.Matrix4().compose(V3(0, 1.52, 0.74), cq.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0))), V3(0.25, 0.25, 0.25)), col([0.45, 0.28, 0.16]));
  for (let i = 0; i < 5; i++) {
    const a = (i / 4) * Math.PI - Math.PI / 2;
    b.geo(M.gold, U.sphere(6, 4), pm(Math.sin(a) * 0.3, 1.52 + Math.cos(a) * 0.26, 0.8, 0, 0, 0, 0.035), {});
  }
  // draped saddle blanket (half tube over the back) with gold trim
  const drape = unitGeo('halfcyl', () => new THREE.CylinderGeometry(1, 1, 1, 16, 1, true, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2));
  b.geo(M.fabric, drape, pm(0, 1.1, -0.05, 0, 0, 0, 0.4, 0.42, 0.62), { color: C.blanket, uv: 'keep', uvScale: [2, 1] });
  for (const zz of [-0.36, 0.26]) b.geo(M.gold, U.torus(1, 0.05, 4, 14, Math.PI), pm(0, 1.1, zz, 0, 0, 0, 0.41, 0.43, 1), {});
  b.box(M.color, pm(0, 1.02, 0.15), 0.8, 0.07, 0.07, { color: [0.35, 0.22, 0.14] });
  // reins
  for (const s of [-1, 1]) b.box(M.color, pm(s * 0.17, 1.62, 0.55, -0.62, 0, 0), 0.025, 0.025, 1.25, { color: [0.35, 0.22, 0.14] });
  b.pop();
  return V3(x, 1.28, z - 0.82);
}

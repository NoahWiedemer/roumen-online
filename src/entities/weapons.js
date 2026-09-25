// Dual blades (Robo Blades): robosword.glb is loaded once and baked into the weapon convention used by the rigs
// (grip at the origin, blade along +Y, see humanoid.buildSword). Each blade gets a coloured energy glow:
// a pulsing emissive band on the blade itself (masked so guard and grip stay dark) plus two additive glow shells
// with a fresnel rim and energy flowing towards the tip. Right hand = red, left hand = blue (mirrored).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const BASE = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '/';
const MODELS = { robosword: BASE + 'models/robosword.glb' };
const LENGTH = 1.08;       // blade + hilt length in metres
const GRIP_AT = 0.874;     // grip centre as a fraction from the tip (-X) to the pommel (+X) in the source model
const BLADE_FROM = 0.23;   // local y where the blade leaves the guard

export const bladeTime = { value: 0 };

const templates = {};
const loading = {};
export function dualBladesReady(model = 'robosword') { return !!templates[model]; }
export function preloadDualBlades(model = 'robosword') {
  if (templates[model]) return Promise.resolve(templates[model]);
  if (!loading[model]) loading[model] = new GLTFLoader().loadAsync(MODELS[model]).then((g) => (templates[model] = prepare(g.scene)));
  return loading[model];
}

function prepare(scene) {
  let src = null;
  scene.updateMatrixWorld(true);
  scene.traverse((o) => { if (!src && o.isMesh) src = o; });
  const geo = src.geometry.clone();
  geo.applyMatrix4(src.matrixWorld);
  geo.computeBoundingBox();
  const bb = geo.boundingBox, len0 = bb.max.x - bb.min.x, s = LENGTH / len0;
  geo.translate(-(bb.min.x + len0 * GRIP_AT), -(bb.min.y + bb.max.y) / 2, -(bb.min.z + bb.max.z) / 2);
  geo.rotateZ(-Math.PI / 2);          // tip (-X) -> +Y
  geo.scale(s, s, s);
  geo.computeBoundingBox();
  // glow mask: 0 on grip / guard, rising to 1 along the blade, a touch brighter towards the tip
  const p = geo.attributes.position;
  const mask = new Float32Array(p.count);
  const top = geo.boundingBox.max.y;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const t = THREE.MathUtils.smoothstep(y, BLADE_FROM, BLADE_FROM + 0.1);
    mask[i] = t * (0.75 + 0.25 * (y - BLADE_FROM) / (top - BLADE_FROM));
  }
  geo.setAttribute('glowMask', new THREE.BufferAttribute(mask, 1));
  const mat = src.material.clone();      // the model's own colours: dark blade, silver edge and guard
  return { geo, mat, top, spine: bladeSpine(geo, top) };
}

// centre line of the curved blade (average of the vertices in slices along Y) with its half width per slice
function bladeSpine(geo, top) {
  const N = 16, p = geo.attributes.position;
  const sx = new Float32Array(N + 1), sz = new Float32Array(N + 1), cnt = new Float32Array(N + 1);
  const lo = new Float32Array(N + 1).fill(Infinity), hi = new Float32Array(N + 1).fill(-Infinity);
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (y < BLADE_FROM) continue;
    const k = Math.round(((y - BLADE_FROM) / (top - BLADE_FROM)) * N);
    sx[k] += p.getX(i); sz[k] += p.getZ(i); cnt[k]++;
    lo[k] = Math.min(lo[k], p.getX(i)); hi[k] = Math.max(hi[k], p.getX(i));
  }
  const raw = [];
  for (let k = 0; k <= N; k++) {
    if (cnt[k] < 12) continue;             // sparse slices (tip) give an unstable centre
    raw.push({ c: new THREE.Vector3(sx[k] / cnt[k], BLADE_FROM + ((top - BLADE_FROM) * k) / N, sz[k] / cnt[k]), w: Math.min(0.1, (hi[k] - lo[k]) / 2) });
  }
  // smooth the centre line and widths
  return raw.map((p, i) => {
    const a = raw[Math.max(0, i - 1)], b = raw[Math.min(raw.length - 1, i + 1)];
    return { c: p.c.clone().multiplyScalar(2).add(a.c).add(b.c).multiplyScalar(0.25), w: (2 * p.w + a.w + b.w) / 4 };
  });
}

// soft glow ribbon along the blade spine, turned towards the camera around the blade axis (a smooth aura
// from every angle, like the reference) — `pad` widens it beyond the blade, `additive` for the bright core
function glowRibbon(spine, color, { pad, strength, phase, additive, straight = false }) {
  const n = spine.length;
  const center = [], tangent = [], side = [], along = [], halfW = [], idx = [];
  // a wide ribbon on the curved tip would fold over on its inner side (a visible crease): wide ones use the
  // blade's overall direction for their cross-section
  const chord = spine[n - 1].c.clone().sub(spine[0].c).normalize();
  for (let i = 0; i < n; i++) {
    const a = spine[Math.max(0, i - 1)].c, b = spine[Math.min(n - 1, i + 1)].c;
    const t = straight ? chord : b.clone().sub(a).normalize();
    for (const s of [-1, 1]) {
      center.push(spine[i].c.x, spine[i].c.y, spine[i].c.z);
      tangent.push(t.x, t.y, t.z);
      side.push(s); along.push(i / (n - 1)); halfW.push(spine[i].w + pad);
    }
    if (i < n - 1) { const q = i * 2; idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(center, 3));   // (bounds only; the shader places it)
  g.setAttribute('center', new THREE.Float32BufferAttribute(center, 3));
  g.setAttribute('tangent', new THREE.Float32BufferAttribute(tangent, 3));
  g.setAttribute('side', new THREE.Float32BufferAttribute(side, 1));
  g.setAttribute('along', new THREE.Float32BufferAttribute(along, 1));
  g.setAttribute('halfW', new THREE.Float32BufferAttribute(halfW, 1));
  g.setIndex(idx);
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: { uColor: { value: new THREE.Color(color) }, uTime: bladeTime, uPhase: { value: phase }, uStrength: { value: strength }, uAdd: { value: additive ? 1 : 0 } },
    vertexShader: `attribute vec3 center; attribute vec3 tangent; attribute float side; attribute float along; attribute float halfW;
      varying float vSide; varying float vAlong;
      void main(){
        vec3 c = (modelViewMatrix * vec4(center, 1.0)).xyz;
        vec3 t = normalize((modelViewMatrix * vec4(tangent, 0.0)).xyz);
        vec3 s = cross(t, normalize(-c));
        s = length(s) > 1e-4 ? normalize(s) : vec3(1.0, 0.0, 0.0);
        gl_Position = projectionMatrix * vec4(c + s * side * halfW, 1.0);
        vSide = side; vAlong = along;
      }`,
    fragmentShader: `uniform vec3 uColor; uniform float uTime, uPhase, uStrength, uAdd; varying float vSide; varying float vAlong;
      void main(){
        float e = 1.0 - vSide * vSide;
        float across = e * e * exp(-vSide * vSide * 1.6);              // exactly zero at the ribbon edges
        float ends = smoothstep(0.0, 0.14, vAlong) * (1.0 - smoothstep(0.82, 1.0, vAlong));
        float flow = 0.72 + 0.28 * sin(vAlong * 13.0 - uTime * 4.5 + uPhase);
        float a = across * ends * flow * uStrength;
        gl_FragColor = uAdd > 0.5 ? vec4(uColor * a, a) : vec4(uColor, clamp(a, 0.0, 0.8));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = 6;
  return mesh;
}

// the blade keeps its original texture; only the bright silver cutting edge picks up the glow colour (a hot
// edge line like in the reference) with a slow shimmer travelling up the blade
function bladeMaterial(base, color, phase) {
  const m = base.clone();
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uGlow = { value: new THREE.Color(color) };
    sh.uniforms.uTime = bladeTime;
    sh.uniforms.uPhase = { value: phase };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float glowMask;\nvarying float vGlow;\nvarying float vY;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = glowMask;\nvY = position.y;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uGlow;\nuniform float uTime, uPhase;\nvarying float vGlow;\nvarying float vY;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
          float edge = smoothstep(0.16, 0.42, lum) * vGlow;               // silver edge texels on the blade only
          float flow = 0.65 + 0.35 * sin(vY * 14.0 - uTime * 5.0 + uPhase);
          diffuseColor.rgb *= 1.0 - edge * 0.55;                          // the glowing edge reads saturated, not pink
          totalEmissiveRadiance += uGlow * edge * 1.5 * flow;
          totalEmissiveRadiance += uGlow * vGlow * 0.035;                 // faint inner light on the dark body
        }`);
  };
  m.customProgramCacheKey = () => 'dual-blade-v2';
  return m;
}

// additive glow shell around the blade (the mesh inflated along its normals). `power` shapes the fresnel: high =
// a thin bright rim hugging the silhouette, low = a soft halo. Moving bands and small twinkles make it shimmer.
function shellMaterial(color, strength, phase, power = 1.6, twinkle = 0, additive = true) {
  return new THREE.ShaderMaterial({
    // additive = light added (bright core); otherwise a coloured veil that keeps its hue on bright backgrounds
    transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, side: THREE.FrontSide,
    uniforms: {
      uColor: { value: new THREE.Color(color) }, uTime: bladeTime, uStrength: { value: strength }, uPhase: { value: phase },
      uPower: { value: power }, uTwinkle: { value: twinkle }, uAdd: { value: additive ? 1 : 0 },
    },
    vertexShader: `attribute float glowMask; varying float vM; varying vec3 vN; varying vec3 vV; varying float vY; varying vec3 vP;
      void main(){
        vM = glowMask; vY = position.y; vP = position;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `uniform vec3 uColor; uniform float uTime, uStrength, uPhase, uPower, uTwinkle, uAdd;
      varying float vM; varying vec3 vN; varying vec3 vV; varying float vY; varying vec3 vP;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main(){
        // interpolated normals are not unit length: clamp, or pow() of a negative base yields NaN (black specks)
        float fr = pow(clamp(1.0 - abs(dot(normalize(vN), normalize(vV))), 0.0, 1.0), uPower);
        float wave = 0.7 + 0.3 * sin(vY * 9.0 - uTime * 4.0 + uPhase);
        float band = smoothstep(0.92, 1.0, sin(vY * 3.0 - uTime * 2.6 + uPhase)) * 0.8;   // a glint sliding up the blade
        float a = vM * fr * (wave + band) * uStrength;
        if (uTwinkle > 0.0) {
          vec2 cell = floor(vec2(vY * 34.0, (vP.x + vP.z) * 34.0));
          float tw = step(0.965, hash(cell + floor(uTime * 7.0 + uPhase)));
          a += vM * tw * uTwinkle;
        }
        gl_FragColor = uAdd > 0.5 ? vec4(uColor * a, a) : vec4(uColor, clamp(a, 0.0, 0.8));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}
function inflated(geo, d) {
  const g = geo.clone();
  const p = g.attributes.position, n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) + n.getX(i) * d, p.getY(i) + n.getY(i) * d, p.getZ(i) + n.getZ(i) * d);
  return g;
}

// one glowing blade; userData.baseLocal / tipLocal feed the weapon trail
export function createDualBlade(color, { mirror = false, phase = 0, model = 'robosword' } = {}) {
  const T = templates[model];
  if (!T) throw new Error('dual blades not loaded — await preloadDualBlades() first');
  const g = new THREE.Group();
  g.name = 'dual-blade';
  const blade = new THREE.Mesh(T.geo, bladeMaterial(T.mat, color, phase));
  blade.castShadow = true;
  g.add(blade);
  // thin bright rim hugging the blade (with twinkles) + a soft camera-facing aura: a coloured veil and a brighter
  // additive core that the bloom pass spreads
  const rim = new THREE.Mesh(inflated(T.geo, 0.008), shellMaterial(color, 1.8, phase, 2.4, 1.1));
  rim.renderOrder = 6;
  const veil = glowRibbon(T.spine, color, { pad: 0.16, strength: 0.72, phase: phase + 1.7, additive: false, straight: true });
  const core = glowRibbon(T.spine, color, { pad: 0.05, strength: 0.85, phase, additive: true });
  g.add(rim, veil, core);
  if (mirror) g.scale.x = -1;
  g.userData.baseLocal = new THREE.Vector3(0, BLADE_FROM + 0.05, 0);
  g.userData.tipLocal = new THREE.Vector3(0, T.top - 0.02, 0);
  g.userData.color = new THREE.Color(color);
  return g;
}

// put a pair of blades into a rig's hand holders (right = glowR, left = glowL); returns { right, left }
export function attachDualBlades(rig, look = {}) {
  const right = createDualBlade(look.glowR || '#ff2a3c', { phase: 0, model: look.model || 'robosword' });
  const left = createDualBlade(look.glowL || '#2a7bff', { mirror: true, phase: 2.1, model: look.model || 'robosword' });
  if (rig.weaponHolder) rig.weaponHolder.add(right);
  if (rig.weaponHolderL) rig.weaponHolderL.add(left);
  return { right, left };
}

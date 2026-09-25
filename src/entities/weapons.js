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
  const mat = src.material.clone();
  mat.metalnessMap = null; mat.metalness = 0.6; mat.roughness = 0.35;
  return { geo, mat, top };
}

// pulsing emissive energy on the blade (masked), injected into the model's standard material
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
          float flow = 0.55 + 0.45 * sin(vY * 22.0 - uTime * 7.0 + uPhase);
          float pulse = 0.85 + 0.15 * sin(uTime * 3.1 + uPhase);
          totalEmissiveRadiance += uGlow * vGlow * (0.7 + 0.9 * flow) * pulse;
        }`);
  };
  m.customProgramCacheKey = () => 'dual-blade-v1';
  return m;
}

// additive glow shell: the blade inflated along its normals, bright at the silhouette (fresnel)
function shellMaterial(color, strength, phase) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide,
    uniforms: { uColor: { value: new THREE.Color(color) }, uTime: bladeTime, uStrength: { value: strength }, uPhase: { value: phase } },
    vertexShader: `attribute float glowMask; varying float vM; varying vec3 vN; varying vec3 vV; varying float vY;
      void main(){
        vM = glowMask; vY = position.y;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `uniform vec3 uColor; uniform float uTime, uStrength, uPhase; varying float vM; varying vec3 vN; varying vec3 vV; varying float vY;
      void main(){
        // interpolated normals are not unit length: clamp, or pow() of a negative base yields NaN (black specks)
        float fr = pow(clamp(1.0 - abs(dot(normalize(vN), normalize(vV))), 0.0, 1.0), 1.6);
        float flow = 0.6 + 0.4 * sin(vY * 16.0 - uTime * 9.0 + uPhase);
        float a = vM * (0.18 + fr * 1.1) * flow * uStrength;
        gl_FragColor = vec4(uColor * a, a);
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
  const inner = new THREE.Mesh(inflated(T.geo, 0.006), shellMaterial(color, 1.0, phase));
  const outer = new THREE.Mesh(inflated(T.geo, 0.03), shellMaterial(color, 0.45, phase + 1.7));
  inner.renderOrder = outer.renderOrder = 6;
  g.add(inner, outer);
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

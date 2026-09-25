// Small CPU particle system for the title scenes (dragon fire, burning pants, smoke puffs, sparkles).
// Every particle is a soft round point sprite; colour runs through up to three stops over its life.
import * as THREE from 'three';

const VERT = `attribute vec3 aColor; attribute float aAlpha; attribute float aSize;
  uniform float uScale;
  varying vec3 vColor; varying float vAlpha;
  void main(){
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uScale / max(0.1, -mv.z);
    vColor = aColor; vAlpha = aAlpha;
  }`;
const FRAG = `varying vec3 vColor; varying float vAlpha;
  void main(){
    vec2 d = gl_PointCoord - 0.5;
    float r = length(d) * 2.0;
    if (r > 1.0) discard;
    float a = 1.0 - r * r; a *= a;
    gl_FragColor = vec4(vColor, a * vAlpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

const _c = new THREE.Color();

export class Particles {
  constructor(max = 400, { additive = true, renderOrder = 10 } = {}) {
    this.max = max;
    this.list = [];
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.alpha = new Float32Array(max);
    this.size = new Float32Array(max);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    this.uniforms = { uScale: { value: 400 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = renderOrder;
  }

  // p: { pos, vel, life, size, size1, c0, c1, c2, alpha, drag, gravity, fadeIn }
  emit(p) {
    if (this.list.length >= this.max) this.list.shift();
    this.list.push({
      x: p.pos.x, y: p.pos.y, z: p.pos.z,
      vx: p.vel ? p.vel.x : 0, vy: p.vel ? p.vel.y : 0, vz: p.vel ? p.vel.z : 0,
      age: 0, life: p.life || 1, size: p.size || 0.5, size1: p.size1 ?? p.size ?? 0.5,
      c0: p.c0, c1: p.c1 || p.c0, c2: p.c2 || p.c1 || p.c0,
      alpha: p.alpha ?? 1, drag: p.drag ?? 0, gravity: p.gravity ?? 0, fadeIn: p.fadeIn ?? 0.08,
    });
  }

  clear() { this.list.length = 0; this.points.geometry.setDrawRange(0, 0); }

  update(dt, camera, height) {
    // point size in pixels for a particle of size 1 at distance 1
    this.uniforms.uScale.value = height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    const L = this.list;
    let n = 0;
    for (let i = 0; i < L.length; i++) {
      const p = L[i];
      p.age += dt;
      if (p.age >= p.life) continue;
      const k = Math.exp(-p.drag * dt);
      p.vx *= k; p.vy = p.vy * k + p.gravity * dt; p.vz *= k;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const u = p.age / p.life;
      if (u < 0.5) _c.copy(p.c0).lerp(p.c1, u * 2); else _c.copy(p.c1).lerp(p.c2, (u - 0.5) * 2);
      const a = p.alpha * Math.min(1, u / p.fadeIn) * (1 - u * u);
      this.pos[n * 3] = p.x; this.pos[n * 3 + 1] = p.y; this.pos[n * 3 + 2] = p.z;
      this.col[n * 3] = _c.r; this.col[n * 3 + 1] = _c.g; this.col[n * 3 + 2] = _c.b;
      this.alpha[n] = a;
      this.size[n] = p.size + (p.size1 - p.size) * u;
      L[n] = p;
      n++;
    }
    L.length = n;
    const g = this.points.geometry;
    g.setDrawRange(0, n);
    for (const k of ['position', 'aColor', 'aAlpha', 'aSize']) g.attributes[k].needsUpdate = true;
  }
}

// HDR fire colours (values above 1 bloom)
// saturated oranges: additive fire on a bright sunset sky washes out to white otherwise
export const FIRE = {
  core: new THREE.Color(1.9, 1.15, 0.28),
  mid: new THREE.Color(1.35, 0.34, 0.04),
  end: new THREE.Color(0.35, 0.04, 0.01),
};
export const SMOKE = {
  a: new THREE.Color(0.2, 0.17, 0.17),
  b: new THREE.Color(0.12, 0.11, 0.13),
};

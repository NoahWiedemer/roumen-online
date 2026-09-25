// Atmosphere of Cyclone Hill: two presets that blend with the player's position —
//   MIST  (Forest of Mist): turquoise fog, cyan sky, soft daylight, fireflies and drifting ground mist
//   DUSK  (Cyclone Hill):   warm sunset fog, purple/pink sky with stars, low orange sun, dust swirling round the summit
// Also owns the sky dome, a distant ridge silhouette and the instanced mist billboards.
import * as THREE from 'three';
import { mulberry32, makeFbm, smoothstep, lerp, clamp } from '../../core/utils.js';
import { mistPuffTex, glowDotTex } from './textures.js';
import { HILL, SUMMIT, TIERS, CHASM, GORGES, polar } from './layout.js';

const C = (h) => new THREE.Color(h);
export const PRESETS = {
  mist: {
    fog: C('#62c9b6'), near: 11, far: 118, skyTop: C('#1c8f9a'), skyMid: C('#3cc3b4'), skyHorizon: C('#9ff0dc'), ridge: C('#3f9a8c'),
    hemiSky: C('#c8fff0'), hemiGround: C('#4f6e3a'), hemi: 1.05, sun: C('#fff6e0'), sunI: 1.55, exposure: 1.02, stars: 0,
    sunDir: new THREE.Vector3(-0.35, 0.82, 0.45).normalize(), mist: 1, fireflies: 1,
  },
  dusk: {
    fog: C('#d9906f'), near: 38, far: 330, skyTop: C('#262a62'), skyMid: C('#8a4e92'), skyHorizon: C('#ffa06a'), ridge: C('#7a3f4a'),
    hemiSky: C('#ffcfa8'), hemiGround: C('#6e3a2a'), hemi: 0.95, sun: C('#ffb26e'), sunI: 2.5, exposure: 1.06, stars: 1,
    sunDir: new THREE.Vector3(-0.78, 0.36, 0.28).normalize(), mist: 0.25, fireflies: 0,
  },
};

// 0 = dusk (hill), 1 = mist (forest), from the focus position
export function mistiness(x, z, y = 0) {
  const r = Math.hypot(x - HILL.x, z - HILL.z);
  const forest = smoothstep(22, 74, z) * smoothstep(TIERS[0].r - 6, TIERS[0].r + 26, r);
  return clamp(forest - smoothstep(4, 20, y) * 0.4, 0, 1);
}

// ------------------------------------------------------------------ sky dome
function makeSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color() }, mid: { value: new THREE.Color() }, horizon: { value: new THREE.Color() },
      sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color() }, stars: { value: 0 }, time: { value: 0 },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }`,
    fragmentShader: `uniform vec3 top, mid, horizon, sunDir, sunCol; uniform float stars, time; varying vec3 vDir;
      float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      void main(){
        float h = vDir.y;
        vec3 c = mix(horizon, mid, smoothstep(-0.02, 0.22, h));
        c = mix(c, top, smoothstep(0.22, 0.8, h));
        // soft streaky clouds lit from the sun side
        float band = sin(vDir.x * 7.0 + time * 0.01) * sin(vDir.z * 5.0 - time * 0.013) + sin((vDir.x + vDir.z) * 13.0) * 0.4;
        float cl = smoothstep(0.35, 1.1, band) * smoothstep(0.02, 0.18, h) * smoothstep(0.55, 0.25, h);
        c = mix(c, mix(horizon, vec3(1.0, 0.85, 0.8), 0.35), cl * 0.45);
        float s = max(dot(vDir, sunDir), 0.0);
        c += sunCol * (pow(s, 900.0) * 3.0 + pow(s, 14.0) * 0.35 + pow(s, 3.0) * 0.08);
        // stars (dusk only)
        vec3 g = floor(vDir * 240.0);
        float st = step(0.9975, hash(g)) * smoothstep(0.12, 0.45, h);
        st *= 0.6 + 0.4 * sin(time * 2.0 + hash(g + 3.0) * 30.0);
        c += vec3(1.0, 0.95, 0.9) * st * stars;
        c = mix(c, horizon * 0.95, smoothstep(0.0, -0.25, h));
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), mat);
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  return dome;
}

// distant ridges: a jagged ring that fades into the horizon colour
function makeRidge() {
  const fb = makeFbm(7301, 4);
  const seg = 180;
  const g = new THREE.CylinderGeometry(620, 620, 1, seg, 4, true);
  const pos = g.attributes.position;
  const k = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), yN = pos.getY(i) + 0.5;
    const a = Math.atan2(z, x);
    const hgt = 70 + fb(Math.cos(a) * 3 + 9, Math.sin(a) * 3 + 9) * 190 + Math.abs(Math.sin(a * 23)) * 18;
    pos.setY(i, -30 + yN * hgt);
    k[i] = yN;
  }
  g.setAttribute('k', new THREE.BufferAttribute(k, 1));
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, transparent: true,
    uniforms: { col: { value: new THREE.Color() }, horizon: { value: new THREE.Color() } },
    vertexShader: 'attribute float k; varying float vK; void main(){ vK = k; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 col, horizon; varying float vK;
      void main(){ vec3 c = mix(horizon, col, 0.25 + vK * 0.6); gl_FragColor = vec4(c, 0.96);
      #include <colorspace_fragment>
      }`,
  });
  const m = new THREE.Mesh(g, mat);
  m.renderOrder = -9;
  m.frustumCulled = false;
  return m;
}

// ------------------------------------------------------------------ instanced camera-facing mist puffs
class MistLayer {
  constructor(spots) {
    const n = spots.length;
    const quad = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = quad.index;
    g.setAttribute('position', quad.attributes.position);
    g.setAttribute('uv', quad.attributes.uv);
    const off = new Float32Array(n * 3), size = new Float32Array(n * 2), ph = new Float32Array(n);
    spots.forEach((s, i) => { off.set([s.x, s.y, s.z], i * 3); size.set([s.w, s.h], i * 2); ph[i] = s.ph; });
    g.setAttribute('iOff', new THREE.InstancedBufferAttribute(off, 3));
    g.setAttribute('iSize', new THREE.InstancedBufferAttribute(size, 2));
    g.setAttribute('iPh', new THREE.InstancedBufferAttribute(ph, 1));
    g.instanceCount = n;
    this.uniforms = {
      map: { value: mistPuffTex() }, color: { value: new THREE.Color('#e8fff8') }, opacity: { value: 0.5 }, time: { value: 0 },
      ...THREE.UniformsLib.fog,
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthWrite: false, fog: true,
      vertexShader: `attribute vec3 iOff; attribute vec2 iSize; attribute float iPh; uniform float time;
        varying vec2 vUv; varying float vA;
        #include <fog_pars_vertex>
        void main(){
          vUv = uv;
          vec3 c = iOff + vec3(sin(time * 0.05 + iPh) * 3.0, sin(time * 0.11 + iPh * 2.0) * 0.4, cos(time * 0.04 + iPh) * 3.0);
          vec4 mv = modelViewMatrix * vec4(c, 1.0);
          float d = -mv.z;
          mv.xy += position.xy * iSize * (1.0 + 0.06 * sin(time * 0.3 + iPh));
          vA = smoothstep(3.0, 14.0, d) * (0.75 + 0.25 * sin(time * 0.2 + iPh * 3.0));
          gl_Position = projectionMatrix * mv;
          vec4 mvPosition = mv;
          #include <fog_vertex>
        }`,
      fragmentShader: `uniform sampler2D map; uniform vec3 color; uniform float opacity; varying vec2 vUv; varying float vA;
        #include <fog_pars_fragment>
        void main(){
          float a = texture2D(map, vUv).a * opacity * vA;
          if (a < 0.004) discard;
          gl_FragColor = vec4(color, a);
          #include <fog_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
  }
}

// ------------------------------------------------------------------ glowing particles (fireflies / summit dust)
class Motes {
  constructor(n, { color, size, additive = true, update }) {
    this.n = n;
    this.pos = new Float32Array(n * 3);
    this.alpha = new Float32Array(n);
    this.state = [];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    this.uniforms = { map: { value: glowDotTex() }, color: { value: new THREE.Color(color) }, size: { value: size }, fade: { value: 1 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: `attribute float alpha; uniform float size; varying float vA;
        void main(){ vA = alpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * 300.0 / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; uniform vec3 color; uniform float fade; varying float vA;
        void main(){ float a = texture2D(map, gl_PointCoord).a * vA * fade; if (a < 0.01) discard; gl_FragColor = vec4(color * a, a);
        #include <colorspace_fragment>
        }`,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.step = update;
  }
  update(dt, t) {
    this.step(this, dt, t);
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.alpha.needsUpdate = true;
  }
}

export class CycloneAtmosphere {
  constructor(root, terrain, extraMist = []) {
    this.terrain = terrain;
    this.group = new THREE.Group();
    this.group.name = 'cyclone-atmosphere';
    root.add(this.group);
    this.sky = makeSky();
    this.ridge = makeRidge();
    this.skyGroup = new THREE.Group();
    this.skyGroup.add(this.sky, this.ridge);
    root.add(this.skyGroup);
    this.k = 1; // current mistiness
    this.cur = {
      fog: new THREE.Color(), skyTop: new THREE.Color(), skyMid: new THREE.Color(), skyHorizon: new THREE.Color(), ridge: new THREE.Color(),
      hemiSky: new THREE.Color(), hemiGround: new THREE.Color(), sun: new THREE.Color(), sunDir: new THREE.Vector3(),
    };

    // ---- mist puffs: forest floor, gorges, chasm (+ waterfall bases from the water module)
    const rng = mulberry32(7302);
    const spots = [];
    const T = terrain;
    for (let i = 0; i < 170; i++) {
      const x = -62 + rng() * 124, z = 10 + rng() * 160;
      if (T.heightAt(x, z) > 6) continue;
      spots.push({ x, y: T.heightAt(x, z) + 1.2 + rng() * 2.8, z, w: 14 + rng() * 16, h: 6 + rng() * 6, ph: rng() * 100 });
    }
    for (const g of GORGES) for (let r = g.r0 + 6; r < g.r1; r += 7) {
      const [x, z] = polar(g.angle, r);
      spots.push({ x, y: g.water + 2 + rng() * 5, z, w: 16 + rng() * 10, h: 7 + rng() * 5, ph: rng() * 100 });
    }
    for (let i = 0; i < CHASM.pts.length - 1; i++) {
      const [ax, az] = CHASM.pts[i], [bx, bz] = CHASM.pts[i + 1];
      const L = Math.hypot(bx - ax, bz - az);
      for (let s = 0; s < L; s += 8) {
        const t = s / L;
        spots.push({ x: lerp(ax, bx, t), y: CHASM.water + 2 + rng() * 7, z: lerp(az, bz, t), w: 18 + rng() * 12, h: 8 + rng() * 6, ph: rng() * 100 });
      }
    }
    for (const s of extraMist) spots.push({ ph: rng() * 100, ...s });
    this.mist = new MistLayer(spots);
    this.group.add(this.mist.mesh);

    // ---- fireflies in the forest
    this.fireflies = new Motes(140, {
      color: '#d8ff7a', size: 0.22,
      update: (m, dt, t) => {
        if (!m.state.length) {
          for (let i = 0; i < m.n; i++) {
            const x = -58 + rng() * 116, z = 20 + rng() * 150;
            m.state.push({ x, z, y: T.heightAt(x, z) + 0.6 + rng() * 2.5, ph: rng() * 100, sp: 0.4 + rng() * 0.6 });
          }
        }
        for (let i = 0; i < m.n; i++) {
          const s = m.state[i];
          const tt = t * s.sp + s.ph;
          m.pos[i * 3] = s.x + Math.sin(tt * 0.7) * 2.2;
          m.pos[i * 3 + 1] = s.y + Math.sin(tt * 1.3) * 0.6;
          m.pos[i * 3 + 2] = s.z + Math.cos(tt * 0.5) * 2.2;
          m.alpha[i] = Math.max(0, Math.sin(tt * 2.1)) ** 3;
        }
      },
    });
    this.group.add(this.fireflies.points);

    // ---- dust / leaves spiralling around the summit (the "cyclone")
    const top = TIERS[3].h;
    this.cyclone = new Motes(220, {
      color: '#ffd9a0', size: 0.3,
      update: (m, dt, t) => {
        if (!m.state.length) for (let i = 0; i < m.n; i++) m.state.push({ a: rng() * Math.PI * 2, r: 6 + rng() * 22, y: rng(), sp: 0.25 + rng() * 0.35, ph: rng() * 10 });
        for (let i = 0; i < m.n; i++) {
          const s = m.state[i];
          s.a += dt * s.sp * (1.6 - s.r / 30);
          s.y += dt * 0.035 * s.sp * 4;
          if (s.y > 1) { s.y = 0; s.r = 6 + rng() * 22; }
          const rr = s.r * (1 - s.y * 0.35);
          m.pos[i * 3] = SUMMIT.x + Math.cos(s.a) * rr;
          m.pos[i * 3 + 1] = top - 8 + s.y * 34;
          m.pos[i * 3 + 2] = SUMMIT.z + Math.sin(s.a) * rr;
          m.alpha[i] = Math.sin(s.y * Math.PI) * (0.45 + 0.3 * Math.sin(t * 3 + s.ph));
        }
      },
    });
    this.group.add(this.cyclone.points);
  }

  // blend the presets for position (x,z,y) and write them into the engine (fog, lights, background, exposure)
  apply(engine, k) {
    const A = PRESETS.dusk, B = PRESETS.mist, c = this.cur;
    c.fog.copy(A.fog).lerp(B.fog, k);
    c.skyTop.copy(A.skyTop).lerp(B.skyTop, k); c.skyMid.copy(A.skyMid).lerp(B.skyMid, k); c.skyHorizon.copy(A.skyHorizon).lerp(B.skyHorizon, k);
    c.ridge.copy(A.ridge).lerp(B.ridge, k);
    c.hemiSky.copy(A.hemiSky).lerp(B.hemiSky, k); c.hemiGround.copy(A.hemiGround).lerp(B.hemiGround, k);
    c.sun.copy(A.sun).lerp(B.sun, k);
    c.sunDir.copy(A.sunDir).lerp(B.sunDir, k).normalize();
    const scene = engine.scene;
    if (!scene.fog || !scene.fog.isFog) scene.fog = new THREE.Fog(c.fog, 10, 100);
    scene.fog.color.copy(c.fog);
    // fog distances interpolate in log space so the mist thins out smoothly
    scene.fog.near = Math.exp(lerp(Math.log(A.near), Math.log(B.near), k));
    scene.fog.far = Math.exp(lerp(Math.log(A.far), Math.log(B.far), k));
    if (!scene.background || !scene.background.isColor) scene.background = new THREE.Color();
    scene.background.copy(c.skyHorizon);
    engine.hemi.color.copy(c.hemiSky); engine.hemi.groundColor.copy(c.hemiGround); engine.hemi.intensity = lerp(A.hemi, B.hemi, k);
    engine.sun.color.copy(c.sun); engine.sun.intensity = lerp(A.sunI, B.sunI, k);
    engine.sunDir.copy(c.sunDir);
    engine.renderer.toneMappingExposure = lerp(A.exposure, B.exposure, k);
    const su = this.sky.material.uniforms;
    su.top.value.copy(c.skyTop); su.mid.value.copy(c.skyMid); su.horizon.value.copy(c.skyHorizon);
    su.sunDir.value.copy(c.sunDir); su.sunCol.value.copy(c.sun); su.stars.value = lerp(A.stars, B.stars, k);
    const ru = this.ridge.material.uniforms;
    ru.col.value.copy(c.ridge); ru.horizon.value.copy(c.skyHorizon);
    this.mist.uniforms.color.value.copy(c.fog).lerp(new THREE.Color('#ffffff'), 0.55);
    this.mist.uniforms.opacity.value = lerp(A.mist, B.mist, k) * 0.55;
    this.fireflies.uniforms.fade.value = lerp(A.fireflies, B.fireflies, k);
  }

  update(dt, t, engine, camera, focus, instant = false) {
    const target = mistiness(focus.x, focus.z, focus.y);
    this.k = instant ? target : this.k + (target - this.k) * (1 - Math.exp(-1.5 * dt));
    this.apply(engine, this.k);
    this.skyGroup.position.set(camera.position.x, 0, camera.position.z);
    this.sky.material.uniforms.time.value = t;
    this.mist.uniforms.time.value = t;
    if (this.k > 0.02) this.fireflies.update(dt, t);
    this.fireflies.points.visible = this.k > 0.02;
    this.cyclone.update(dt, t);
  }
}

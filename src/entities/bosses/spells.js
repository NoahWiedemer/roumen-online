// Vagel's spells that fly or spread: gold / violet bolts (they curve after the hero a little and burst on contact),
// the Midas Wave (a ring of golden light that runs out over the floor — jump over it), the golden chain of Greed's
// Grasp, the giant coins of the Rain of Fortune and the Seraph Blades (walls of light turning around her). Ground
// telegraphs, lobbed orbs and pools come from hazards.js. Everything lives in one group.
import * as THREE from 'three';
import { G } from '../../game/game.js';
import { tex } from '../../core/textures.js';

const TAU = Math.PI * 2;
const _d = new THREE.Vector3(), _t = new THREE.Vector3(), _q = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0);
// a blade of light: a wall, brightest at the floor, light running out along it; the tip and the inner end fade
const BLADE_FS = `uniform vec3 uColor; uniform float uTime, uAlpha; varying vec2 vUv;
  void main(){
    float h = vUv.y;
    float flow = 0.6 + 0.4 * sin(vUv.x * 46.0 - uTime * 11.0);
    float glow = pow(1.0 - h, 1.6) * (0.55 + 0.45 * flow) + 0.35 * smoothstep(0.05, 0.0, abs(h - 0.02));
    float ends = smoothstep(1.0, 0.92, vUv.x) * smoothstep(0.0, 0.05, vUv.x);
    gl_FragColor = vec4(uColor * (1.2 + (1.0 - h) * 0.9), glow * ends * uAlpha);
    #include <colorspace_fragment>
  }`;

// ring wall: an open cylinder, bright at the floor and fading upwards, with a band of moving light
const WAVE_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const WAVE_FS = `uniform vec3 uColor; uniform float uTime, uAlpha; varying vec2 vUv;
  void main(){
    float h = vUv.y;
    float band = 0.55 + 0.45 * sin(vUv.x * 80.0 - uTime * 9.0 + h * 6.0);
    float a = (1.0 - h) * (0.55 + 0.45 * band) * smoothstep(0.0, 0.08, h + 0.02);
    gl_FragColor = vec4(uColor * (1.2 + (1.0 - h) * 0.8), a * uAlpha);
    #include <colorspace_fragment>
  }`;
// the chain: links drawn along the length (uv.y), glowing gold
const CHAIN_FS = `uniform vec3 uColor; uniform float uTime, uLen, uAlpha; varying vec2 vUv;
  void main(){
    float s = vUv.y * uLen * 3.2 - uTime * 2.0;
    float link = abs(fract(s) - 0.5) * 2.0;
    float ring = smoothstep(0.55, 0.9, link) + 0.35;
    float edge = 1.0 - abs(vUv.x * 2.0 - 1.0);
    gl_FragColor = vec4(uColor * (0.8 + ring * 0.9), (0.45 + ring * 0.55) * uAlpha * (0.6 + edge * 0.4));
    #include <colorspace_fragment>
  }`;

export class Spells {
  constructor(parent) {
    this.group = new THREE.Group();
    this.group.name = 'vagel-spells';
    parent.add(this.group);
    this.items = [];
    this.t = 0;
    this.orbGeo = new THREE.IcosahedronGeometry(1, 2);
  }

  // a bolt from `from` flying at `speed`; it turns towards the hero by up to `homing` rad/s. onHit(pos) when it
  // touches the hero; it bursts on the floor or when its life runs out
  bolt(from, { speed = 15, homing = 0.9, color = '#ffd24a', core = '#fff4d2', size = 1, life = 4, onHit = null, aim = null } = {}) {
    const g = new THREE.Group();
    const orb = new THREE.Mesh(this.orbGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(core) }));
    orb.scale.setScalar(0.22 * size);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex('glow'), color: new THREE.Color(color), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    glow.scale.setScalar(1.9 * size);
    g.add(orb, glow);
    g.position.copy(from);
    this.group.add(g);
    const p = G.player;
    const target = aim || _t.set(p.pos.x, p.pos.y + 1.1, p.pos.z);
    const vel = new THREE.Vector3().subVectors(target, from).normalize().multiplyScalar(speed);
    const it = { kind: 'bolt', g, orb, glow, vel, speed, homing, life, t: 0, size, color: new THREE.Color(color), onHit };
    this.items.push(it);
    return it;
  }

  // the Midas Wave: a ring running out from (x, z); onCross() once when it passes the hero on the ground
  wave(x, z, { speed = 9, maxR = 32, width = 1.1, height = 1.5, color = '#ffd24a', onCross = null } = {}) {
    const geo = new THREE.CylinderGeometry(1, 1, 1, 96, 1, true);
    geo.translate(0, 0.5, 0);
    const mat = new THREE.ShaderMaterial({
      vertexShader: WAVE_VS, fragmentShader: WAVE_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 }, uAlpha: { value: 1 } },
    });
    const wall = new THREE.Mesh(geo, mat);
    wall.renderOrder = 6;
    wall.frustumCulled = false;
    const y = G.terrain.groundAt(x, z);
    wall.position.set(x, y, z);
    this.group.add(wall);
    const it = { kind: 'wave', wall, mat, x, z, y, r: 0.5, speed, maxR, width, height, onCross, crossed: false, t: 0 };
    this.items.push(it);
    return it;
  }

  // a golden chain from from() to to() (both return world points) until removed
  chain(from, to, { color = '#ffd24a' } = {}) {
    const geo = new THREE.CylinderGeometry(0.07, 0.07, 1, 8, 1, true);
    geo.translate(0, 0.5, 0);
    const mat = new THREE.ShaderMaterial({
      vertexShader: WAVE_VS, fragmentShader: CHAIN_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 }, uLen: { value: 1 }, uAlpha: { value: 0 } },
    });
    const m = new THREE.Mesh(geo, mat);
    m.frustumCulled = false;
    m.renderOrder = 6;
    this.group.add(m);
    const it = { kind: 'chain', m, mat, from, to, t: 0 };
    this.items.push(it);
    return it;
  }

  // a giant gold coin dropping from high above onto (x, z): lands after `fall` s (onLand), then lies there, sinks away
  coin(x, z, { r = 1.25, fall = 0.28, height = 16, onLand = null } = {}) {
    if (!this.coinGeo) {
      this.coinGeo = new THREE.CylinderGeometry(1, 1, 0.14, 32);
      this.coinMat = new THREE.MeshStandardMaterial({ color: '#ffcc55', metalness: 0.55, roughness: 0.32, emissive: '#7a4e08', emissiveIntensity: 0.9 });
    }
    const m = new THREE.Mesh(this.coinGeo, this.coinMat);
    const y = G.terrain.groundAt(x, z);
    m.scale.set(r, r, r);
    m.position.set(x, y + height, z);
    m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    m.castShadow = true;
    this.group.add(m);
    const it = { kind: 'coin', m, x, z, y, r, t: 0, fall, height, onLand, landed: false, spin: [4 + Math.random() * 6, 3 + Math.random() * 5] };
    this.items.push(it);
    return it;
  }

  // the Seraph Blades: n walls of light from (x, z) out to `len`; set(angle) turns them, fade() lets them go
  blades(x, z, n, { len = 27, inner = 1.4, height = 2.8, color = '#fff0b0' } = {}) {
    const g = new THREE.Group();
    g.position.set(x, G.terrain.groundAt(x, z), z);
    const mat = new THREE.ShaderMaterial({
      vertexShader: WAVE_VS, fragmentShader: BLADE_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 }, uAlpha: { value: 0 } },
    });
    const geo = new THREE.PlaneGeometry(len - inner, height).translate((len + inner) / 2, height / 2, 0);
    const walls = [];
    for (let k = 0; k < n; k++) { const w = new THREE.Mesh(geo, mat); w.frustumCulled = false; w.renderOrder = 6; g.add(w); walls.push(w); }
    this.group.add(g);
    const it = { kind: 'blades', g, mat, geo, walls, n, t: 0, fading: -1 };
    it.set = (ang) => walls.forEach((w, k) => { w.rotation.y = -(ang + (k / n) * TAU); });
    it.fade = () => { if (it.fading < 0) it.fading = 0; };
    this.items.push(it);
    return it;
  }

  remove(it) { it.dead = true; }

  burst(pos, color, n = 22) {
    G.fx.particles.burst(pos.x, pos.y, pos.z, n, { color, speed: 6, life: 0.55, size: 0.4, grav: -3, up: 0.3 });
    G.fx.hitSpark(pos.clone(), '#' + color.getHexString(), true);
  }

  update(dt) {
    this.t += dt;
    const p = G.player;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      if (it.dead) { this.dispose(it); this.items.splice(i, 1); continue; }
      it.t += dt;
      if (it.kind === 'bolt') {
        const pos = it.g.position;
        // curve towards the hero's chest
        if (it.homing > 0 && p && !p.dead) {
          _t.set(p.pos.x, p.pos.y + 1.1, p.pos.z).sub(pos).normalize();
          _d.copy(it.vel).normalize();
          const ang = _d.angleTo(_t);
          if (ang > 1e-4) {
            const k = Math.min(1, (it.homing * dt) / ang);
            _d.lerp(_t, k).normalize();
            it.vel.copy(_d).multiplyScalar(it.speed);
          }
        }
        pos.addScaledVector(it.vel, dt);
        it.orb.rotation.y += dt * 6;
        it.glow.material.rotation += dt * 3;
        if (Math.random() < dt * 45) G.fx.particles.emit({ x: pos.x, y: pos.y, z: pos.z, vx: (Math.random() - 0.5) * 0.8, vy: (Math.random() - 0.5) * 0.8, vz: (Math.random() - 0.5) * 0.8, life: 0.45, size: 0.32 * it.size, color: it.color, grav: 0, drag: 2 });
        const hitHero = p && !p.dead && Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z) < 0.55 * it.size + p.radius && pos.y > p.pos.y - 0.2 && pos.y < p.pos.y + 2.1;
        const floor = G.terrain.groundAt(pos.x, pos.z);
        if (hitHero || pos.y < floor + 0.15 || it.t > it.life) {
          this.burst(pos, it.color);
          G.audio.play('boltHit');
          if (hitHero && it.onHit) it.onHit(pos.clone());
          it.dead = true;
        }
      } else if (it.kind === 'wave') {
        it.r += it.speed * dt;
        const fade = Math.min(1, it.t / 0.15) * Math.min(1, (it.maxR - it.r) / 4);
        it.wall.scale.set(it.r, it.height, it.r);
        it.mat.uniforms.uTime.value = this.t;
        it.mat.uniforms.uAlpha.value = Math.max(0, fade);
        if (Math.random() < dt * 60) {
          const a = Math.random() * Math.PI * 2;
          G.fx.particles.emit({ x: it.x + Math.cos(a) * it.r, y: it.y + 0.2, z: it.z + Math.sin(a) * it.r, vx: Math.cos(a) * 2, vy: 1.5 + Math.random() * 2, vz: Math.sin(a) * 2, life: 0.6, size: 0.35, color: new THREE.Color('#ffe08a'), grav: -2, drag: 1.5 });
        }
        if (!it.crossed && p && !p.dead) {
          const d = Math.hypot(p.pos.x - it.x, p.pos.z - it.z);
          if (Math.abs(d - it.r) < it.width * 0.5 + p.radius) { it.crossed = true; it.onCross && it.onCross(); }
        }
        if (it.r >= it.maxR) it.dead = true;
      } else if (it.kind === 'chain') {
        const a = it.from(), b = it.to();
        _d.subVectors(b, a);
        const len = Math.max(0.1, _d.length());
        it.m.position.copy(a);
        _q.setFromUnitVectors(_up, _d.normalize());
        it.m.quaternion.copy(_q);
        it.m.scale.set(1, len, 1);
        it.mat.uniforms.uLen.value = len;
        it.mat.uniforms.uTime.value = this.t;
        it.mat.uniforms.uAlpha.value = Math.min(1, it.t / 0.2);
      } else if (it.kind === 'coin') {
        if (!it.landed) {
          const k = Math.min(1, it.t / it.fall);
          it.m.position.y = it.y + it.height * (1 - k * k);
          it.m.rotation.x += dt * it.spin[0]; it.m.rotation.z += dt * it.spin[1];
          if (k >= 1) {
            it.landed = true; it.t0 = it.t;
            it.m.rotation.set((Math.random() - 0.5) * 0.25, Math.random() * TAU, (Math.random() - 0.5) * 0.25);
            it.m.position.y = it.y + 0.07 * it.r;
            it.onLand && it.onLand(it);
          }
        } else {
          // it rings a moment on the floor, then sinks away
          const u = it.t - it.t0;
          it.m.rotation.x *= Math.exp(-6 * dt); it.m.rotation.z *= Math.exp(-6 * dt);
          if (u > 1.4) it.m.position.y = it.y + 0.07 * it.r - (u - 1.4) * 0.5;
          if (u > 2.1) it.dead = true;
        }
      } else if (it.kind === 'blades') {
        it.mat.uniforms.uTime.value = this.t;
        if (it.fading >= 0) { it.fading += dt; if (it.fading > 0.5) it.dead = true; }
        it.mat.uniforms.uAlpha.value = Math.min(1, it.t / 0.35) * (it.fading >= 0 ? Math.max(0, 1 - it.fading / 0.5) : 1);
      }
    }
  }

  dispose(it) {
    if (it.kind === 'bolt') { it.g.removeFromParent(); it.orb.material.dispose(); it.glow.material.dispose(); }
    if (it.wall) { it.wall.removeFromParent(); it.wall.geometry.dispose(); it.mat.dispose(); }
    if (it.kind === 'chain') { it.m.removeFromParent(); it.m.geometry.dispose(); it.mat.dispose(); }
    if (it.kind === 'coin') it.m.removeFromParent();
    if (it.kind === 'blades') { it.g.removeFromParent(); it.geo.dispose(); it.mat.dispose(); }
  }
  clear() { for (const it of this.items) this.dispose(it); this.items.length = 0; }
  destroy() { this.clear(); this.group.removeFromParent(); this.orbGeo.dispose(); if (this.coinGeo) { this.coinGeo.dispose(); this.coinMat.dispose(); } }
}

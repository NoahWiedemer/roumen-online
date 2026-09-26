// Boss fight effects that matter for gameplay: ground telegraphs (circles and lanes that fill up until they go
// off), lobbed slime blobs with sticky puddles, and the hypno beam. Decals are grids whose vertices follow the
// terrain, so they read correctly on uneven ground. Everything lives in one group under the world root.
import * as THREE from 'three';
import { G } from '../../game/game.js';
import { tex } from '../../core/textures.js';

const _g = new THREE.Vector3();
const TELE_VS = `
  attribute vec2 aLocal; varying vec2 vL;
  void main(){ vL = aLocal; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const TELE_FS = `
  uniform vec3 uColor; uniform float uFill, uAlpha, uTime, uShape;
  varying vec2 vL;
  void main(){
    float a;
    vec3 col;
    if (uShape < 0.5) {                                   // circle, vL in -1..1
      float r = length(vL);
      if (r > 1.0) discard;
      float edge = smoothstep(0.92, 0.985, r);
      float fill = step(r, uFill);
      float front = smoothstep(uFill - 0.05, uFill, r) * fill;
      a = 0.12 + fill * 0.2 + edge * 0.8 + front * 0.55 + 0.05 * sin(r * 14.0 - uTime * 5.0);
      col = uColor * (0.8 + a * 0.5); a = clamp(a * 1.25, 0.0, 1.0);
    } else if (uShape < 1.5) {                            // lane: x across -1..1, y along 0..1
      float ax = abs(vL.x), ay = vL.y;
      float edge = max(smoothstep(0.88, 0.98, ax), smoothstep(0.015, 0.0, ay));
      float fill = step(ay, uFill);
      float front = smoothstep(uFill - 0.025, uFill, ay) * fill;
      float chev = smoothstep(0.55, 1.0, sin((ay * 30.0 - ax * 3.0) - uTime * 9.0));
      a = (0.1 + fill * 0.2 + edge * 0.75 + front * 0.5 + chev * 0.12) * smoothstep(1.0, 0.9, ay);
      col = uColor * (0.8 + a * 0.5); a = clamp(a * 1.25, 0.0, 1.0);
    } else {                                              // slime puddle: glossy blob with bubbles
      float r = length(vL);
      float wob = 0.9 + 0.06 * sin(atan(vL.y, vL.x) * 5.0 + uTime * 1.3) + 0.04 * sin(atan(vL.y, vL.x) * 9.0 - uTime);
      if (r > wob) discard;
      float bub = smoothstep(0.75, 1.0, sin(vL.x * 17.0 + uTime * 2.0) * sin(vL.y * 15.0 - uTime * 1.7));
      a = 0.62 + 0.25 * smoothstep(wob - 0.12, wob, r) + bub * 0.25;
      col = uColor * (0.75 + 0.5 * bub + 0.4 * smoothstep(wob - 0.1, wob, r));
    }
    gl_FragColor = vec4(col, a * uAlpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

function teleMaterial(color, shape) {
  return new THREE.ShaderMaterial({
    vertexShader: TELE_VS, fragmentShader: TELE_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    uniforms: { uColor: { value: new THREE.Color(color) }, uFill: { value: 0 }, uAlpha: { value: 1 }, uTime: { value: 0 }, uShape: { value: shape } },
  });
}

// grid decal: `local` = per-vertex (u, v) in shape space; place() writes world positions following the ground
class Decal {
  constructor(group, color, shape, nu, nv) {
    this.nu = nu; this.nv = nv; this.shape = shape;
    const n = (nu + 1) * (nv + 1);
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 3);
    const loc = new Float32Array(n * 2), idx = [];
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const k = j * (nu + 1) + i;
      if (shape === 1) { loc[k * 2] = (i / nu) * 2 - 1; loc[k * 2 + 1] = j / nv; }
      else { loc[k * 2] = (i / nu) * 2 - 1; loc[k * 2 + 1] = (j / nv) * 2 - 1; }
      if (i < nu && j < nv) { const a = k, b = k + 1, c = k + nu + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
    }
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aLocal', new THREE.BufferAttribute(loc, 2));
    g.setIndex(idx);
    this.loc = loc;
    this.mat = teleMaterial(color, shape);
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    group.add(this.mesh);
  }
  // circle / puddle: centre + radius; lane: origin, unit dir (x,z), length, half width
  placeCircle(x, z, r) {
    const T = G.terrain, P = this.pos, L = this.loc;
    for (let k = 0; k < P.length / 3; k++) {
      const wx = x + L[k * 2] * r, wz = z + L[k * 2 + 1] * r;
      P[k * 3] = wx; P[k * 3 + 1] = T.groundAt(wx, wz) + 0.12; P[k * 3 + 2] = wz;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
  }
  placeLane(x, z, dx, dz, len, hw) {
    const T = G.terrain, P = this.pos, L = this.loc;
    for (let k = 0; k < P.length / 3; k++) {
      const a = L[k * 2] * hw, b = L[k * 2 + 1] * len;
      const wx = x + dx * b - dz * a, wz = z + dz * b + dx * a;
      P[k * 3] = wx; P[k * 3 + 1] = T.groundAt(wx, wz) + 0.12; P[k * 3 + 2] = wz;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
  }
  dispose() { this.mesh.removeFromParent(); this.mesh.geometry.dispose(); this.mat.dispose(); }
}

// ------------------------------------------------------------------ beam (hypno cannon)
const BEAM_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const BEAM_FS = `
  uniform float uTime, uAlpha, uLen; uniform vec3 uA, uB; varying vec2 vUv;
  void main(){
    float along = vUv.y * uLen;                        // metres from the muzzle
    float sp = sin(vUv.x * 6.2832 * 3.0 + along * 1.6 - uTime * 16.0);
    float band = smoothstep(0.2, 1.0, sp);
    float fadeEnd = smoothstep(uLen, uLen - 6.0, along) * smoothstep(0.0, 0.8, along);
    vec3 col = mix(uA, uB, band);
    gl_FragColor = vec4(col * (0.55 + band * 0.8), (0.3 + band * 0.5) * fadeEnd * uAlpha);
    #include <colorspace_fragment>
  }`;
function beamMesh(radius, len, a, b, alpha) {
  const g = new THREE.CylinderGeometry(radius, radius * 1.25, len, 20, 1, true);
  g.rotateX(Math.PI / 2);
  g.translate(0, 0, len / 2);
  const m = new THREE.ShaderMaterial({
    vertexShader: BEAM_VS, fragmentShader: BEAM_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uAlpha: { value: alpha }, uLen: { value: len }, uA: { value: new THREE.Color(a) }, uB: { value: new THREE.Color(b) } },
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = 7;
  return mesh;
}

// ------------------------------------------------------------------ manager
export class Hazards {
  constructor(parent) {
    this.group = new THREE.Group();
    this.group.name = 'boss-hazards';
    parent.add(this.group);
    this.items = [];
    this.t = 0;
    this.blobGeo = new THREE.SphereGeometry(0.6, 16, 12);
    this.blobMat = new THREE.MeshStandardMaterial({ color: '#9dff4a', emissive: '#4aa010', emissiveIntensity: 0.9, roughness: 0.2, metalness: 0, transparent: true, opacity: 0.92 });
  }

  // a filling circle that goes off after `dur` (onDone(x, z, r) called then)
  circle(x, z, r, dur, { color = '#ff3a2a', onDone = null, follow = null } = {}) {
    const d = new Decal(this.group, color, 0, 28, 28);
    d.placeCircle(x, z, r);
    const it = { kind: 'tele', d, x, z, r, t: 0, dur, onDone, follow };
    this.items.push(it);
    return it;
  }
  // a lane from (x,z) along dir; aim(...) can re-place it while it charges
  lane(x, z, dx, dz, len, hw, dur, { color = '#ff4ad8', onDone = null } = {}) {
    const d = new Decal(this.group, color, 1, 6, 40);
    const it = { kind: 'tele', d, x, z, t: 0, dur, onDone, lane: true, len, hw };
    it.aim = (ax, az, adx, adz) => { it.x = ax; it.z = az; it.dx = adx; it.dz = adz; d.placeLane(ax, az, adx, adz, len, hw); };
    it.aim(x, z, dx, dz);
    this.items.push(it);
    return it;
  }
  remove(it) { it.dead = true; }

  // a slime blob lobbed from `from` to (x,z): lands after `flight` seconds -> onLand(x, z)
  blob(from, x, z, flight, onLand) {
    const m = new THREE.Mesh(this.blobGeo, this.blobMat);
    m.castShadow = true;
    this.group.add(m);
    const to = new THREE.Vector3(x, G.terrain.groundAt(x, z), z);
    const h = 7 + from.distanceTo(to) * 0.35;
    this.items.push({ kind: 'blob', m, from: from.clone(), to, t: 0, dur: flight, h, onLand });
  }
  // sticky slime puddle: slows whoever stands in it
  puddle(x, z, r, life) {
    const d = new Decal(this.group, '#7fdc2a', 2, 20, 20);
    d.placeCircle(x, z, r);
    const it = { kind: 'puddle', d, x, z, r, t: 0, dur: life };
    this.items.push(it);
    return it;
  }
  // the hypno beam: a slanted part from the cannon cuffs down to a point in front of the boss, then a wave that
  // runs `len` metres along the ground (at chest height of the hero)
  beam(len) {
    const g = new THREE.Group();
    const slant = new THREE.Group(), run = new THREE.Group();
    const sCore = beamMesh(0.2, 1, '#ffe0fa', '#ff9ae8', 0.9), sOuter = beamMesh(0.6, 1, '#ff2ad0', '#8a2aff', 0.55);
    const rCore = beamMesh(0.22, len, '#ffe0fa', '#ff9ae8', 0.9), rOuter = beamMesh(0.7, len, '#ff2ad0', '#8a2aff', 0.55);
    slant.add(sCore, sOuter); run.add(rCore, rOuter);
    const flare = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex('glow'), color: new THREE.Color('#ff6ae8'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    const splash = new THREE.Sprite(flare.material.clone());
    g.add(slant, run, flare, splash);
    this.group.add(g);
    const mats = [sCore.material, sOuter.material, rCore.material, rOuter.material, flare.material, splash.material];
    const it = { kind: 'beam', g, mats, t: 0, dur: Infinity, len };
    it.set = (muzzle, gx, gy, gz, dx, dz, alpha = 1) => {
      slant.position.copy(muzzle);
      slant.lookAt(gx, gy, gz);
      const L = Math.max(0.5, muzzle.distanceTo(_g.set(gx, gy, gz)));
      slant.scale.set(1, 1, L);
      sCore.material.uniforms.uLen.value = sOuter.material.uniforms.uLen.value = L;
      run.position.set(gx, gy, gz);
      run.rotation.set(0, Math.atan2(dx, dz), 0);
      for (const m of mats) { if (m.uniforms) m.uniforms.uAlpha.value = (m === sOuter.material || m === rOuter.material ? 0.55 : 0.9) * alpha; else m.opacity = alpha; }
      flare.position.copy(muzzle); flare.scale.setScalar(3.5 + Math.sin(this.t * 40) * 0.6);
      splash.position.set(gx, gy, gz); splash.scale.setScalar(4 + Math.sin(this.t * 33) * 0.8);
    };
    this.items.push(it);
    return it;
  }

  // is the point (px,pz) inside the lane item (with extra margin)?
  static inLane(it, px, pz, margin = 0) {
    const rx = px - it.x, rz = pz - it.z;
    const along = rx * it.dx + rz * it.dz, across = -rx * it.dz + rz * it.dx;
    return along > -margin && along < it.len + margin && Math.abs(across) < it.hw + margin;
  }

  update(dt) {
    this.t += dt;
    const p = G.player;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      if (it.dead) { this.dispose(it); this.items.splice(i, 1); continue; }
      it.t += dt;
      if (it.kind === 'tele') {
        const k = Math.min(1, it.t / it.dur);
        it.d.mat.uniforms.uFill.value = k;
        it.d.mat.uniforms.uTime.value = this.t;
        it.d.mat.uniforms.uAlpha.value = Math.min(1, it.t / 0.15);
        if (it.follow) { const f = it.follow(); if (f) { it.x = f.x; it.z = f.z; it.d.placeCircle(f.x, f.z, it.r); } }
        if (it.t >= it.dur && !it.fired) {
          it.fired = true;
          it.onDone && it.onDone(it);
          if (!it.keep) it.dead = true;
        }
      } else if (it.kind === 'blob') {
        const k = Math.min(1, it.t / it.dur);
        it.m.position.lerpVectors(it.from, it.to, k);
        it.m.position.y += it.h * 4 * k * (1 - k);
        const s = 1 + 0.18 * Math.sin(it.t * 18);
        it.m.scale.set(s, 2 - s, s);
        if (Math.random() < dt * 30) G.fx.particles.emit({ x: it.m.position.x, y: it.m.position.y, z: it.m.position.z, vy: -0.5, life: 0.6, size: 0.35, color: new THREE.Color('#9dff4a'), grav: -3, alpha: 0.7 });
        if (k >= 1) { it.dead = true; it.onLand && it.onLand(it.to.x, it.to.z); }
      } else if (it.kind === 'puddle') {
        const fadeIn = Math.min(1, it.t / 0.25), fadeOut = Math.min(1, (it.dur - it.t) / 1.2);
        it.d.mat.uniforms.uAlpha.value = Math.max(0, Math.min(fadeIn, fadeOut)) * 0.85;
        it.d.mat.uniforms.uTime.value = this.t;
        // sticky: slows the hero while inside
        if (p && !p.dead && Math.hypot(p.pos.x - it.x, p.pos.z - it.z) < it.r * 0.9 && it.t < it.dur - 0.8) {
          const b = p.buffs.find((x) => x.id === 'slowed');
          if (b) b.t = Math.max(b.t, 1.2); else p.addBuff('slowed', 1.2, {});
        }
        if (it.t >= it.dur) it.dead = true;
      } else if (it.kind === 'beam') {
        for (const m of it.mats) if (m.uniforms) m.uniforms.uTime.value = this.t;
      }
    }
  }
  dispose(it) {
    if (it.d) it.d.dispose();
    if (it.m) it.m.removeFromParent();
    if (it.g) { it.g.removeFromParent(); it.g.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); for (const m of it.mats) m.dispose(); }
  }
  clear() { for (const it of this.items) this.dispose(it); this.items.length = 0; }
  destroy() { this.clear(); this.group.removeFromParent(); this.blobGeo.dispose(); this.blobMat.dispose(); }
}

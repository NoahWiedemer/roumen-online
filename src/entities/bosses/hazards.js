// Boss fight effects that matter for gameplay: ground telegraphs (circles and lanes that fill up until they go
// off), lobbed milk bombs with sticky puddles, and the hypno cannon's milk stream. Decals are grids whose vertices follow the
// terrain, so they read correctly on uneven ground. Everything lives in one group under the world root.
import * as THREE from 'three';
import { G } from '../../game/game.js';
import { tex } from '../../core/textures.js';
import { envTexture } from '../monsters/common.js';

const _g = new THREE.Vector3();
const MILK = new THREE.Color('#f7f5ee');
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
    } else if (uShape < 2.5) {                            // slime puddle: glossy blob with bubbles
      float r = length(vL);
      float wob = 0.9 + 0.06 * sin(atan(vL.y, vL.x) * 5.0 + uTime * 1.3) + 0.04 * sin(atan(vL.y, vL.x) * 9.0 - uTime);
      if (r > wob) discard;
      float bub = smoothstep(0.75, 1.0, sin(vL.x * 17.0 + uTime * 2.0) * sin(vL.y * 15.0 - uTime * 1.7));
      // creamy and nearly opaque: a thin darker rim, a soft sheen towards the middle
      float rim = smoothstep(wob - 0.1, wob, r);
      a = 0.93 - rim * 0.25;
      col = uColor * (0.96 + 0.08 * bub - 0.2 * rim + 0.08 * smoothstep(0.6, 0.0, length(vL - vec2(-0.25, -0.2))));
    } else {                                              // pool of corruption: dark, swirling, glowing veins
      float r = length(vL), ang = atan(vL.y, vL.x);
      float wob = 0.88 + 0.06 * sin(ang * 6.0 + uTime * 1.1) + 0.04 * sin(ang * 11.0 - uTime * 1.7);
      if (r > wob) discard;
      float swirl = 0.5 + 0.5 * sin(ang * 3.0 + r * 9.0 - uTime * 2.2);
      float veins = smoothstep(0.7, 1.0, sin(ang * 7.0 - r * 14.0 + uTime * 1.5 + sin(r * 6.0 + uTime)));
      float rim = smoothstep(wob - 0.16, wob, r);
      col = mix(vec3(0.05, 0.0, 0.1), uColor * 0.55, 0.3 + 0.4 * swirl) + uColor * (veins * 1.1 + rim * 1.3);
      a = 0.8 + rim * 0.2;
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

// ------------------------------------------------------------------ beam (hypno cannon): a gushing stream of milk
const BEAM_VS = `varying vec2 vUv; varying float vUp;
  void main(){ vUv = uv; vUp = normalize((modelMatrix * vec4(normal, 0.0)).xyz).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const BEAM_FS = `
  uniform float uTime, uAlpha, uLen; uniform vec3 uA, uB; varying vec2 vUv; varying float vUp;
  void main(){
    float along = vUv.y * uLen;                        // metres from the muzzle
    float around = vUv.x * 6.2832;
    // ripples rushing down the stream, lit from above with wet glints on top (a creamy, liquid look)
    float rip = 0.5 + 0.5 * sin(along * 2.6 - uTime * 22.0 + sin(around * 2.0 + along * 0.4) * 1.6);
    float rip2 = 0.5 + 0.5 * sin(along * 5.3 - uTime * 31.0 + around * 1.0);
    float light = clamp(vUp * 0.5 + 0.5, 0.0, 1.0);
    float shade = 0.62 + 0.38 * light + 0.35 * pow(light, 12.0) * rip2;     // body shading + wet glints
    float fadeEnd = smoothstep(uLen, uLen - 5.0, along) * smoothstep(0.0, 0.5, along);
    vec3 col = mix(uB, uA, rip) * shade;
    gl_FragColor = vec4(col, (0.86 + rip * 0.14) * fadeEnd * uAlpha);
    #include <colorspace_fragment>
  }`;
function beamMesh(radius, len, a, b, alpha) {
  const g = new THREE.CylinderGeometry(radius, radius * 1.25, len, 20, 1, true);
  g.rotateX(Math.PI / 2);
  g.translate(0, 0, len / 2);
  const m = new THREE.ShaderMaterial({
    vertexShader: BEAM_VS, fragmentShader: BEAM_FS, transparent: true, depthWrite: false,
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
    // milk bombs: creamy white and glossy
    this.blobMat = new THREE.MeshStandardMaterial({ color: '#fbf9f3', emissive: '#4a4842', emissiveIntensity: 0.5, roughness: 0.12, metalness: 0, envMap: envTexture(), envMapIntensity: 0.9 });
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

  // a slime blob lobbed from `from` to (x,z): lands after `flight` seconds -> onLand(x, z) (mat / trail: another look)
  blob(from, x, z, flight, onLand, { mat = null, trail = null } = {}) {
    const m = new THREE.Mesh(this.blobGeo, mat || this.blobMat);
    m.castShadow = true;
    this.group.add(m);
    const to = new THREE.Vector3(x, G.terrain.groundAt(x, z), z);
    const h = 7 + from.distanceTo(to) * 0.35;
    this.items.push({ kind: 'blob', m, from: from.clone(), to, t: 0, dur: flight, h, onLand, trail });
  }
  // sticky milk puddle: slows whoever stands in it (or: another colour, onInside(dt) while the hero stands in it;
  // shape 3 = a glowing pool of corruption)
  puddle(x, z, r, life, { color = '#f2efe6', slow = true, onInside = null, shape = 2 } = {}) {
    const d = new Decal(this.group, color, shape, 20, 20);
    d.placeCircle(x, z, r);
    const it = { kind: 'puddle', d, x, z, r, t: 0, dur: life, slow, onInside };
    this.items.push(it);
    return it;
  }
  // the hypno beam: a slanted part from the cannon cuffs down to a point in front of the boss, then a wave that
  // runs `len` metres along the ground (at chest height of the hero)
  beam(len) {
    const g = new THREE.Group();
    const slant = new THREE.Group(), run = new THREE.Group();
    // a dense milky core inside a thinner, splashy sheath
    const sCore = beamMesh(0.26, 1, '#ffffff', '#d6cfbf', 0.95), sOuter = beamMesh(0.4, 1, '#fbf9f2', '#d9d4c6', 0.4);
    const rCore = beamMesh(0.3, len, '#ffffff', '#d6cfbf', 0.95), rOuter = beamMesh(0.46, len, '#fbf9f2', '#d9d4c6', 0.4);
    slant.add(sCore, sOuter); run.add(rCore, rOuter);
    const flare = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex('glow'), color: new THREE.Color('#fffaf0'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.6 }));
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
      for (const m of mats) { if (m.uniforms) m.uniforms.uAlpha.value = (m === sOuter.material || m === rOuter.material ? 0.22 : 1) * alpha; else m.opacity = alpha * 0.6; }
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
        if (Math.random() < dt * 30) G.fx.particles.emit({ x: it.m.position.x, y: it.m.position.y, z: it.m.position.z, vy: -0.5, life: 0.6, size: 0.35, color: it.trail || MILK, grav: -3, alpha: 0.5 });
        if (k >= 1) { it.dead = true; it.onLand && it.onLand(it.to.x, it.to.z); }
      } else if (it.kind === 'puddle') {
        const fadeIn = Math.min(1, it.t / 0.25), fadeOut = Math.min(1, (it.dur - it.t) / 1.2);
        it.d.mat.uniforms.uAlpha.value = Math.max(0, Math.min(fadeIn, fadeOut));
        it.d.mat.uniforms.uTime.value = this.t;
        // sticky: slows the hero while inside
        if (p && !p.dead && Math.hypot(p.pos.x - it.x, p.pos.z - it.z) < it.r * 0.9 && it.t < it.dur - 0.8) {
          if (it.slow) {
            const b = p.buffs.find((x) => x.id === 'slowed');
            if (b) b.t = Math.max(b.t, 1.2); else p.addBuff('slowed', 1.2, {});
          }
          if (it.onInside) it.onInside(dt);
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

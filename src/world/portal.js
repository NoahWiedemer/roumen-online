// Portal: stone arch with glowing runes, an animated green vortex and a ring of floating stones.
// Portals are not functional yet — clicking one only shows a message.
import * as THREE from 'three';
import { tex, texRepeat } from '../core/textures.js';
import { mulberry32, makeFbm } from '../core/utils.js';

let shared = null;
function assets() {
  if (shared) return shared;
  const stoneMat = new THREE.MeshStandardMaterial({ map: texRepeat('plaster', 0.5, 0.5), color: '#b9b2a6', roughness: 0.92 });
  const darkStone = new THREE.MeshStandardMaterial({ map: texRepeat('stoneWall', 0.5, 0.25), color: '#9a948a', roughness: 0.95 });
  const runeMat = new THREE.MeshStandardMaterial({ color: '#7dffb8', emissive: '#3cff8a', emissiveIntensity: 2.2, roughness: 0.4 });
  const rockMat = new THREE.MeshStandardMaterial({ color: '#5f7488', roughness: 0.55, metalness: 0.15, flatShading: true, emissive: '#0a3a22', emissiveIntensity: 0.4 });
  // floating rock variants
  const rocks = [];
  const rng = mulberry32(77);
  for (let v = 0; v < 4; v++) {
    const g = new THREE.DodecahedronGeometry(0.22, 0);
    const p = g.attributes.position;
    const f = makeFbm(100 + v, 2);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const d = 0.75 + f(x * 4 + v, y * 4 + z * 3) * 0.6;
      p.setXYZ(i, x * d * (1 + v * 0.1), y * d * 1.5, z * d);
    }
    g.computeVertexNormals();
    rocks.push(g);
  }
  // vortex shader
  const vortexMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.NormalBlending,
    uniforms: { uTime: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float uTime; varying vec2 vUv;
      void main(){
        float r = length(vUv);
        if (r > 1.0) discard;
        float a = atan(vUv.y, vUv.x);
        float sw = sin(a * 3.0 + r * 14.0 - uTime * 3.2);
        float sw2 = sin(a * 5.0 - r * 9.0 + uTime * 2.1);
        float spiral = smoothstep(0.2, 1.0, sw) * 0.75 + smoothstep(0.5, 1.0, sw2) * 0.35;
        vec3 deep = vec3(0.01, 0.16, 0.09);
        vec3 mid = vec3(0.05, 0.62, 0.3);
        vec3 hi = vec3(0.42, 1.35, 0.72);
        vec3 col = mix(deep, mid, smoothstep(1.0, 0.25, r) * 0.7 + spiral * 0.35);
        col = mix(col, hi, spiral * smoothstep(1.0, 0.1, r) * 0.9);
        col += hi * smoothstep(0.3, 0.0, r) * 0.6;            // bright core
        float rim = smoothstep(0.8, 0.95, r) * smoothstep(1.0, 0.95, r);
        col += vec3(0.25, 1.1, 0.55) * rim * 0.9;
        float alpha = smoothstep(1.0, 0.86, r) * (0.72 + spiral * 0.28);
        gl_FragColor = vec4(col, alpha);
        #include <colorspace_fragment>
      }`,
  });
  const glowMat = new THREE.SpriteMaterial({ map: tex('glow'), color: new THREE.Color('#3cff8a'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.3 });
  shared = { stoneMat, darkStone, runeMat, rockMat, rocks, vortexMat, glowMat };
  return shared;
}

// stone arch built from bevelled blocks
function buildArch(A, group) {
  const add = (geo, mat, x, y, z, rz = 0, ry = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.rotation.set(0, ry, rz);
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
    return m;
  };
  const W = 2.35, pillarH = 2.6;
  // plinth + steps
  add(new THREE.BoxGeometry(6.2, 0.35, 2.6), A.darkStone, 0, 0.17, 0);
  add(new THREE.BoxGeometry(5.4, 0.25, 2.2), A.stoneMat, 0, 0.47, 0);
  // pillars from stacked blocks
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const h = pillarH / 5;
      const w = 0.78 - (i % 2) * 0.06;
      add(new THREE.BoxGeometry(w, h * 0.96, 0.95), A.stoneMat, sx * W, 0.6 + h * (i + 0.5), 0);
    }
    add(new THREE.BoxGeometry(1.0, 0.24, 1.15), A.darkStone, sx * W, 0.6 + pillarH + 0.12, 0);
  }
  // arch voussoirs
  const n = 11, R = W, cy = 0.6 + pillarH + 0.24;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI, a1 = ((i + 1) / n) * Math.PI, am = (a0 + a1) / 2;
    const len = R * (a1 - a0) * 1.12;
    const key = i === Math.floor(n / 2);
    const g = new THREE.BoxGeometry(key ? 0.95 : 0.8, len * 0.95, key ? 1.1 : 0.95);
    const m = add(g, A.stoneMat, Math.cos(am) * (R + 0.02), cy + Math.sin(am) * R, 0, am);
    if (key) {
      const rune = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), A.runeMat);
      rune.position.set(Math.cos(am) * R, cy + Math.sin(am) * R, 0.58);
      rune.scale.set(1, 1.3, 0.4);
      group.add(rune);
    }
  }
  // rune slits on the pillars
  for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.28, 0.02), A.runeMat);
    r.position.set(sx * W, 1.0 + i * 0.7, 0.49);
    group.add(r);
    const r2 = r.clone(); r2.position.z = -0.49; group.add(r2);
  }
  return { cy, R };
}

export function createPortal({ id, name, x, y, z, rotY = 0 }) {
  const A = assets();
  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.rotation.y = rotY;
  const { cy } = buildArch(A, group);
  // vortex disc
  const center = new THREE.Vector3(0, cy - 0.35, 0);
  const vortex = new THREE.Mesh(new THREE.CircleGeometry(1.5, 48), A.vortexMat);
  vortex.position.copy(center);
  vortex.renderOrder = 4;
  group.add(vortex);
  const glow = new THREE.Sprite(A.glowMat);
  glow.position.copy(center);
  glow.scale.setScalar(5);
  group.add(glow);
  // floating stones
  const stones = [];
  const rng = mulberry32(id.length * 31 + 7);
  for (let i = 0; i < 11; i++) {
    const m = new THREE.Mesh(A.rocks[i % A.rocks.length], A.rockMat);
    const s = 0.65 + rng() * 0.7;
    m.scale.setScalar(s);
    m.castShadow = true;
    group.add(m);
    stones.push({ m, a: (i / 11) * Math.PI * 2 + rng() * 0.2, r: 1.62 + rng() * 0.2, ph: rng() * 6, spin: new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).multiplyScalar(2) });
  }
  // ground rune ring
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.0, 2.3, 48), new THREE.MeshBasicMaterial({ color: '#5cffa6', transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(0, 0.62, 2.1);
  group.add(ring);
  const light = new THREE.PointLight('#4dff9a', 6, 9, 2);
  light.position.set(0, cy - 0.3, 0.8);
  group.add(light);

  const worldCenter = new THREE.Vector3();
  const portal = {
    id, name, isPortal: true, group, radius: 2.2, height: cy + 2.2,
    pos: new THREE.Vector3(x, y, z), groundY: y,
    headPos() { return new THREE.Vector3(x, y + cy + 2.6, z); },
    update(dt, t, fx) {
      A.vortexMat.uniforms.uTime.value = t;
      vortex.rotation.z = -t * 0.6;
      glow.material.opacity = 0.26 + Math.sin(t * 2.3) * 0.08;
      light.intensity = 5 + Math.sin(t * 3.1) * 1.2;
      for (const s of stones) {
        const a = s.a + t * 0.35;
        s.m.position.set(Math.cos(a) * s.r, center.y + Math.sin(a) * s.r + Math.sin(t * 1.4 + s.ph) * 0.08, Math.sin(t * 0.9 + s.ph) * 0.25);
        s.m.rotation.x += s.spin.x * dt; s.m.rotation.y += s.spin.y * dt; s.m.rotation.z += s.spin.z * dt;
      }
      ring.rotation.z = t * 0.3;
      // drifting sparkles
      if (fx && Math.random() < dt * 14) {
        worldCenter.copy(center).applyMatrix4(group.matrixWorld);
        const a = Math.random() * Math.PI * 2, r = 1.2 + Math.random() * 1.2;
        const off = new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
        fx.particles.emit({ x: worldCenter.x + off.x, y: worldCenter.y + off.y, z: worldCenter.z + off.z, vx: -off.x * 0.6, vy: -off.y * 0.6 + 0.3, vz: -off.z * 0.6, life: 1.2, size: 0.18, color: new THREE.Color('#8affc0'), drag: 0.5, grav: 0 });
      }
    },
  };
  return portal;
}

// Backdrop pieces shared by the title screen and the character-select terrace: gradient sky dome with a sun
// glow, layered mountain silhouettes fading into the haze, soft billboard clouds and small mesh helpers.
import * as THREE from 'three';
import { SPH, SPH_LO } from '../core/prims.js';

export function skyDome({ top = '#27366e', mid = '#6f7fc4', horizon = '#ffb27a', glow = '#ffd9a0', sunDir = new THREE.Vector3(0.5, 0.12, -1), radius = 600 } = {}) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      uTop: { value: new THREE.Color(top) }, uMid: { value: new THREE.Color(mid) }, uHor: { value: new THREE.Color(horizon) },
      uGlow: { value: new THREE.Color(glow) }, uSun: { value: sunDir.clone().normalize() },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: `uniform vec3 uTop, uMid, uHor, uGlow, uSun; varying vec3 vDir;
      void main(){
        float h = vDir.y;
        vec3 c = mix(uHor, uMid, smoothstep(-0.02, 0.22, h));
        c = mix(c, uTop, smoothstep(0.2, 0.75, h));
        float s = max(dot(normalize(vDir), uSun), 0.0);
        c += uGlow * (pow(s, 6.0) * 0.55 + pow(s, 64.0) * 1.2);
        c += uGlow * smoothstep(0.9993, 0.9997, s) * 3.0;
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), mat);
  m.renderOrder = -10;
  m.frustumCulled = false;
  return m;
}

// deterministic value noise for ridge lines
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }
function ridge(seed, n) {
  const r = rng(seed);
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push(r());
  return (u) => {
    const x = u * n, i = Math.floor(x), f = x - i, t = f * f * (3 - 2 * f);
    return pts[Math.min(i, n)] * (1 - t) + pts[Math.min(i + 1, n)] * t;
  };
}

// a silhouette band of peaks at distance `z`, lit top colour fading into `haze` at the foot
export function mountainLayer({ z = -120, width = 520, base = -4, height = 40, color = '#4a4f7a', haze = '#f0a585', seed = 1, peaks = 9, x = 0, snow = null }) {
  const n = 160;
  const f1 = ridge(seed, peaks), f2 = ridge(seed * 7 + 3, peaks * 4);
  const pos = [], col = [], idx = [];
  const top = new THREE.Color(color), foot = new THREE.Color(haze), sn = snow ? new THREE.Color(snow) : null;
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const px = x + (u - 0.5) * width;
    const h = height * (0.35 + 0.65 * Math.pow(f1(u), 1.6)) + height * 0.18 * f2(u);
    pos.push(px, base + h, z, px, base - 30, z);
    const c = top.clone();
    if (sn && h > height * 0.72) c.lerp(sn, 0.55);
    col.push(c.r, c.g, c.b, foot.r, foot.g, foot.b);
    if (i < n) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, depthWrite: true }));
  m.frustumCulled = false;
  return m;
}

// puffy cloud texture: a cluster of soft blobs, darker and warmer underneath
let cloudTex = null;
export function cloudTexture() {
  if (cloudTex) return cloudTex;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  const r = rng(11);
  for (let i = 0; i < 26; i++) {
    const x = 40 + r() * 176, y = 58 + (r() - 0.5) * 34 - Math.sin((x - 40) / 176 * Math.PI) * 18, rad = 18 + r() * 26;
    const gr = g.createRadialGradient(x, y - rad * 0.3, 0, x, y, rad);
    gr.addColorStop(0, 'rgba(255,255,255,0.95)');
    gr.addColorStop(0.6, 'rgba(255,255,255,0.55)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
  }
  cloudTex = new THREE.CanvasTexture(c);
  cloudTex.colorSpace = THREE.SRGBColorSpace;
  return cloudTex;
}

export function cloud({ x, y, z, w = 40, color = '#ffd2c0', opacity = 0.85 }) {
  const mat = new THREE.SpriteMaterial({ map: cloudTexture(), color: new THREE.Color(color), transparent: true, opacity, depthWrite: false, fog: false });
  const s = new THREE.Sprite(mat);
  s.position.set(x, y, z);
  s.scale.set(w, w * 0.5, 1);
  s.renderOrder = -5;
  return s;
}

export { mat, blob, limb } from '../core/prims.js';

// dispose everything below an object (geometries, materials and their textures)
export function disposeTree(root) {
  const seen = new Set();
  root.traverse((o) => {
    if (o.geometry && !seen.has(o.geometry) && o.geometry !== SPH && o.geometry !== SPH_LO) { seen.add(o.geometry); o.geometry.dispose(); }
    const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of ms) {
      if (seen.has(m)) continue;
      seen.add(m);
      for (const k of ['map', 'normalMap', 'roughnessMap', 'emissiveMap', 'alphaMap']) if (m[k] && m[k] !== cloudTex && !seen.has(m[k])) { seen.add(m[k]); m[k].dispose(); }
      m.dispose();
    }
  });
}

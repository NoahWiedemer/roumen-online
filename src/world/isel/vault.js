// Vagel's Vault of Avarice — the arena of her real fight: a round platform of dark marble inlaid with gold, adrift in
// a violet sky full of stars and nebulae. Gilded columns (some broken) stand around it, mounds of coins and chests
// lie along the low balustrade, corrupted crystals break through the floor, a golden halo turns high above, rocks
// drift around the platform and gold dust rises everywhere. The way back is a portal on the south rim, sealed with
// gold and violet light while she fights; once her hostage, Prince Ratman, is free, a second portal (home to Roumen)
// rises out of the floor beside the great hoard. Everything goes into the "vault" visibility zone (shown only in here).
import * as THREE from 'three';
import { GeoBuilder, pm, U, unitGeo } from '../town/builder.js';
import { marbleTex } from '../town/textures.js';
import { makeCanvas, toTexture, memo } from '../../core/textures.js';
import { makeNoise2D, mulberry32 } from '../../core/utils.js';
import { createPortal } from '../portal.js';
import { flash } from '../../game/cutscene.js';
import { G } from '../../game/game.js';
import { Glow } from './decor.js';
import { VAULT } from './layout.js';

const TAU = Math.PI * 2;
const { x: CX, z: CZ, r: R } = VAULT;
const rad = (d) => (d * Math.PI) / 180;
const at = (a, r) => [CX + Math.cos(a) * r, CZ + Math.sin(a) * r];

// what stands where (angles around the centre in degrees: 0 = east, 90 = south, where the portal is)
const COLUMN_R = 22.6, BROKEN = [1, 4, 6];
const MOUNDS = [[0, 24.2, 3.0, 1.3], [45, 24.6, 2.2, 0.9], [135, 24.6, 2.4, 1.0], [180, 23.8, 3.6, 1.7], [225, 24.4, 2.8, 1.2], [270, 23.2, 4.6, 2.4], [315, 24.2, 3.0, 1.35]];
const CRYSTALS = [[14, 26.0, 1.2], [118, 25.8, 1.0], [196, 26.2, 1.3], [252, 26.0, 1.1], [300, 25.6, 1.4], [338, 26.1, 0.9]];
const CHESTS = [[190, 21.4, 1.0, false], [283, 20.6, -0.6, true], [322, 21.2, 0.5, false]];

// ------------------------------------------------------------------ textures
// reflections for the gold: a violet sky over a band of warm golden light
const vaultEnv = () => memo('vault:env', () => {
  const W = 256, H = 128, c = makeCanvas(W, H), g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, '#1c1036'); grd.addColorStop(0.32, '#6a3aa0'); grd.addColorStop(0.47, '#ffe2a0');
  grd.addColorStop(0.55, '#b07a30'); grd.addColorStop(0.7, '#3a2418'); grd.addColorStop(1, '#120a1a');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  for (const [x, y, r, a] of [[60, 34, 22, 0.8], [170, 40, 16, 0.6], [120, 22, 10, 0.5], [230, 30, 12, 0.5]]) {
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, `rgba(255,236,190,${a})`); rg.addColorStop(1, 'rgba(255,236,190,0)');
    g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const t = toTexture(c, { repeat: false });
  t.mapping = THREE.EquirectangularReflectionMapping;
  return t;
});

// the floor, painted in the disc's uv space (canvas x = world x, canvas y = world z): dark violet marble with veins,
// gold inlay (rings, a sixteen-point star, spokes, a band of coins, the rim band) and violet cracks where the
// corrupted crystals break through. Three canvases: colour, glow (emissive) and roughness (g) / metalness (b)
const floorMaps = () => memo('vault:floor', () => {
  const S = 2048, SE = 1024;
  const map = makeCanvas(S), emi = makeCanvas(SE), mr = makeCanvas(SE);
  const g = map.getContext('2d'), ge = emi.getContext('2d'), gm = mr.getContext('2d');
  const rng = mulberry32(8080);
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grd.addColorStop(0, '#30243f'); grd.addColorStop(0.7, '#241b34'); grd.addColorStop(1, '#191226');
  g.fillStyle = grd; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 520; i++) {
    const x = rng() * S, y = rng() * S, r = 20 + rng() * 150, light = rng() < 0.5;
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, light ? 'rgba(96,74,128,0.2)' : 'rgba(8,4,16,0.24)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  g.lineCap = g.lineJoin = 'round';
  for (let i = 0; i < 180; i++) {
    let x = rng() * S, y = rng() * S, a = rng() * TAU;
    const light = rng() < 0.35;
    g.strokeStyle = light ? `rgba(206,186,240,${0.1 + rng() * 0.16})` : `rgba(10,5,20,${0.25 + rng() * 0.2})`;
    g.lineWidth = 0.6 + rng() * (light ? 1.6 : 2.6);
    g.beginPath(); g.moveTo(x, y);
    const n = 20 + rng() * 60;
    for (let k = 0; k < n; k++) { a += (rng() - 0.5) * 0.7; x += Math.cos(a) * 9; y += Math.sin(a) * 9; g.lineTo(x, y); }
    g.stroke();
  }
  gm.fillStyle = 'rgb(0,90,24)'; gm.fillRect(0, 0, SE, SE);          // polished stone
  ge.fillStyle = '#000'; ge.fillRect(0, 0, SE, SE);
  // drawing in metres from the centre, once per canvas
  const layers = [{ g, col: '#d9a441' }, { g: ge, col: '#704a0c' }, { g: gm, col: 'rgb(0,56,255)' }];
  const inlay = (draw, only = null) => {
    for (const L of layers) {
      if (only && !only.includes(L.g)) continue;
      const c = L.g, k = c.canvas.width / (2 * R);
      c.save(); c.translate(c.canvas.width / 2, c.canvas.height / 2); c.scale(k, k);
      c.strokeStyle = c.fillStyle = L.col; c.lineCap = c.lineJoin = 'round';
      draw(c, L);
      c.restore();
    }
  };
  const ring = (r, w) => inlay((c) => { c.lineWidth = w; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.stroke(); });
  const poly = (c, pts, close = false) => { c.beginPath(); pts.forEach(([x, z], i) => (i ? c.lineTo(x, z) : c.moveTo(x, z))); if (close) c.closePath(); };
  ring(3.6, 0.16); ring(4.1, 0.07);
  inlay((c) => { c.lineWidth = 0.13; const p = []; for (let i = 0; i <= 32; i++) { const a = (i / 32) * TAU, r = i % 2 ? 6.6 : 10.9; p.push([Math.cos(a) * r, Math.sin(a) * r]); } poly(c, p); c.stroke(); });
  ring(11.3, 0.22); ring(12.0, 0.08);
  inlay((c) => {
    c.lineWidth = 0.06;
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * TAU, ca = Math.cos(a), sa = Math.sin(a);
      poly(c, [[ca * 12.1, sa * 12.1], [ca * 18.9, sa * 18.9]]); c.stroke();
      const m = 15.5, w = 0.35, l = 0.8;
      poly(c, [[ca * (m - l), sa * (m - l)], [ca * m - sa * w, sa * m + ca * w], [ca * (m + l), sa * (m + l)], [ca * m + sa * w, sa * m - ca * w]], true); c.fill();
    }
  });
  ring(19.0, 0.1); ring(19.5, 0.26);
  inlay((c) => {
    const n = Math.floor((TAU * 20.4) / 1.05);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU, x = Math.cos(a) * 20.4, z = Math.sin(a) * 20.4;
      c.lineWidth = 0.05; c.beginPath(); c.arc(x, z, 0.3, 0, TAU); c.stroke();
      c.beginPath(); c.arc(x, z, 0.1, 0, TAU); c.fill();
    }
  });
  ring(21.3, 0.08); ring(25.9, 0.12); ring(27.75, 0.34);
  inlay((c) => {
    for (let i = 0; i < 72; i++) {
      const a = ((i + 0.5) / 72) * TAU, ca = Math.cos(a), sa = Math.sin(a), m = 26.8, w = 0.28, l = 0.55;
      poly(c, [[ca * (m - l), sa * (m - l)], [ca * m - sa * w, sa * m + ca * w], [ca * (m + l), sa * (m + l)], [ca * m + sa * w, sa * m - ca * w]], true); c.fill();
    }
  });
  // violet cracks, spreading inwards from the crystals
  const cracks = [];
  const grow = (x, z, a, len, w, depth) => {
    const pts = [[x, z]];
    for (let L = 0; L < len;) {
      a += (rng() - 0.5) * 0.9;
      const s = 0.35 + rng() * 0.4;
      x += Math.cos(a) * s; z += Math.sin(a) * s; L += s;
      pts.push([x, z]);
      if (depth < 2 && rng() < 0.08) grow(x, z, a + (rng() < 0.5 ? -1 : 1) * (0.5 + rng() * 0.6), len * 0.45, w * 0.6, depth + 1);
    }
    cracks.push({ pts, w });
  };
  for (const [ad, d, s] of CRYSTALS) {
    const a = rad(ad);
    for (let k = 0; k < 3; k++) grow(Math.cos(a) * (d - 0.8), Math.sin(a) * (d - 0.8), a + Math.PI + (rng() - 0.5) * 0.9, 4 + rng() * 5 * s, 0.11 * s, 0);
  }
  const drawCracks = (c, col, wMul, blur = 0) => {
    c.strokeStyle = col;
    if (blur) { c.shadowColor = col; c.shadowBlur = blur; }
    for (const k of cracks) { c.lineWidth = k.w * wMul; poly(c, k.pts); c.stroke(); }
    c.shadowBlur = 0;
  };
  inlay((c) => { drawCracks(c, '#3a0c66', 1.6); drawCracks(c, '#b45aff', 0.45); }, [g]);
  inlay((c) => drawCracks(c, '#b040ff', 1.3, 8), [ge]);
  inlay((c) => drawCracks(c, 'rgb(0,150,0)', 1.6), [gm]);
  const tMap = toTexture(map, { repeat: false }), tEmi = toTexture(emi, { repeat: false }), tMr = toTexture(mr, { srgb: false, repeat: false });
  return { map: tMap, emissive: tEmi, mr: tMr };
});

// the rune circle over the floor's centre (additive, white: tinted by the material)
const sigilTex = () => memo('vault:sigil', () => {
  const S = 1024, c = makeCanvas(S), g = c.getContext('2d');
  const rng = mulberry32(4711), H = S / 2;
  g.translate(H, H);
  g.strokeStyle = g.fillStyle = '#ffffff'; g.lineCap = g.lineJoin = 'round';
  g.shadowColor = '#ffffff'; g.shadowBlur = 10;
  const ring = (r, w) => { g.lineWidth = w; g.beginPath(); g.arc(0, 0, r * H, 0, TAU); g.stroke(); };
  ring(0.975, 6); ring(0.94, 2.5); ring(0.66, 3); ring(0.62, 6);
  const N = 40;
  for (let i = 0; i < N; i++) {
    g.save(); g.rotate((i / N) * TAU); g.translate(0, -0.8 * H);
    const s = 18;
    g.lineWidth = 3.2;
    g.beginPath();
    const strokes = 2 + ((rng() * 3) | 0);
    for (let k = 0; k < strokes; k++) { g.moveTo((rng() * 2 - 1) * s, (rng() * 2 - 1) * s * 1.6); g.lineTo((rng() * 2 - 1) * s, (rng() * 2 - 1) * s * 1.6); }
    if (rng() < 0.4) { g.moveTo(s * 0.5, 0); g.arc(0, 0, s * 0.5, 0, TAU); }
    g.stroke();
    g.restore();
    g.save(); g.rotate(((i + 0.5) / N) * TAU); g.beginPath(); g.arc(0, -0.8 * H, 3.5, 0, TAU); g.fill(); g.restore();
  }
  g.lineWidth = 4;
  for (let t = 0; t < 3; t++) {
    g.beginPath();
    for (let i = 0; i <= 3; i++) { const a = (i / 3) * TAU + (t / 9) * TAU - Math.PI / 2, r = 0.6 * H; if (i) g.lineTo(Math.cos(a) * r, Math.sin(a) * r); else g.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
    g.stroke();
  }
  ring(0.3, 4); ring(0.26, 2);
  // the crown of greed in the middle
  const cw = 0.17 * H, ch = 0.12 * H;
  g.lineWidth = 5;
  g.beginPath(); g.moveTo(-cw, ch * 0.6); g.lineTo(-cw, -ch * 0.4); g.lineTo(-cw * 0.5, ch * 0.05); g.lineTo(0, -ch * 0.8); g.lineTo(cw * 0.5, ch * 0.05); g.lineTo(cw, -ch * 0.4); g.lineTo(cw, ch * 0.6); g.closePath(); g.stroke();
  g.beginPath(); g.moveTo(-cw, ch * 0.85); g.lineTo(cw, ch * 0.85); g.stroke();
  return toTexture(c, { repeat: false });
});

// heaps of gold coins (tiles; coins drawn across the edges wrap around)
const coinTex = () => memo('vault:coins', () => {
  const S = 512, c = makeCanvas(S), g = c.getContext('2d');
  g.fillStyle = '#5a3c0e'; g.fillRect(0, 0, S, S);
  const rng = mulberry32(777);
  for (let i = 0; i < 1500; i++) {
    const x = rng() * S, y = rng() * S, r = 9 + rng() * 9, sq = 0.45 + rng() * 0.55, rot = rng() * Math.PI, hue = rng();
    const hi = hue < 0.1 ? '#fff6d0' : '#fff0b0', mid = hue < 0.15 ? '#f0c860' : hue < 0.9 ? '#e3ad3c' : '#d49a30';
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      const px = x + ox, py = y + oy;
      if (px < -r || px > S + r || py < -r || py > S + r) continue;
      g.save(); g.translate(px, py); g.rotate(rot); g.scale(1, sq);
      const gr = g.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
      gr.addColorStop(0, hi); gr.addColorStop(0.5, mid); gr.addColorStop(1, '#7a4e0e');
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
      g.lineWidth = 1.5; g.strokeStyle = 'rgba(80,50,8,0.8)'; g.stroke();
      g.strokeStyle = 'rgba(255,240,180,0.45)'; g.beginPath(); g.arc(0, 0, r * 0.68, 0, TAU); g.stroke();
      g.restore();
    }
  }
  return toTexture(c);
});

// ------------------------------------------------------------------ the sky: deep violet with nebulae and stars
const SKY_VS = `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }`;
const SKY_FS = `uniform float uTime; varying vec3 vDir;
  float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float noise(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z); }
  float fbm(vec3 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
  float stars(vec3 d, float scale, float cut){ vec3 p = d * scale; float h = hash(floor(p)); return step(cut, h) * smoothstep(0.32, 0.0, length(fract(p) - 0.5)) * (0.5 + 0.5 * h); }
  void main(){
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 c = mix(vec3(0.2, 0.075, 0.24), vec3(0.085, 0.04, 0.17), smoothstep(-0.45, 0.25, h));
    c = mix(c, vec3(0.03, 0.018, 0.07), smoothstep(0.25, 0.95, h));
    float n = fbm(d * 2.1 + vec3(0.0, uTime * 0.004, 0.0));
    float n2 = fbm(d * 4.3 + vec3(3.1, 1.7, uTime * 0.006));
    float neb = smoothstep(0.42, 0.8, n);
    c += vec3(0.46, 0.12, 0.56) * neb * 0.6;
    c += vec3(0.95, 0.6, 0.2) * smoothstep(0.6, 0.85, n2) * neb * 0.4;
    c += vec3(0.1, 0.2, 0.5) * smoothstep(0.5, 0.78, n2) * (1.0 - neb) * 0.28;
    float tw = 0.65 + 0.35 * sin(uTime * 2.3 + dot(floor(d * 170.0), vec3(1.7, 9.2, 3.1)));
    c += vec3(1.0, 0.94, 0.84) * stars(d, 170.0, 0.982) * tw * 1.5;
    c += vec3(0.8, 0.82, 1.0) * stars(d, 400.0, 0.992) * 0.9;
    c += vec3(0.55, 0.32, 0.1) * smoothstep(-0.15, -0.9, h) * 0.4;       // a golden glow far below
    gl_FragColor = vec4(c, 1.0);
    #include <colorspace_fragment>
  }`;

// ------------------------------------------------------------------ gold / violet seal on the portal
const SEAL_FS = `uniform float uTime, uAlpha; varying vec2 vUv;
  void main(){
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    if (r > 1.0) discard;
    float a = atan(p.y, p.x);
    float band = smoothstep(0.3, 1.0, sin(a * 3.0 - r * 14.0 + uTime * 2.4));
    float coins = smoothstep(0.82, 1.0, sin(p.x * 22.0) * sin(p.y * 22.0 + uTime));
    float rim = smoothstep(0.8, 0.98, r);
    vec3 col = mix(vec3(0.45, 0.12, 0.7), vec3(1.0, 0.78, 0.3), band) + vec3(1.0, 0.9, 0.6) * rim;
    gl_FragColor = vec4(col, (0.3 + band * 0.4 + rim * 0.6 + coins * 0.2) * uAlpha);
  }`;

// ------------------------------------------------------------------ shapes
// a heap: unit radius and height, lumpy, flat uvs over x/z
const moundUnit = () => unitGeo('vault-mound', () => {
  const rings = 10, segs = 40, pos = [0, 1, 0], uv = [0.5, 0.5], idx = [];
  const n = makeNoise2D(606);
  for (let i = 1; i <= rings; i++) {
    const d = i / rings;
    for (let j = 0; j < segs; j++) {
      const a = (j / segs) * TAU, x = Math.cos(a) * d, z = Math.sin(a) * d;
      const lump = (n(x * 3 + 5, z * 3 + 5) - 0.5) * 0.3;
      pos.push(x, i === rings ? 0 : Math.max(0.02, Math.pow(1 - d * d, 0.75) + lump * (1 - d)), z);
      uv.push(x * 0.5 + 0.5, z * 0.5 + 0.5);
    }
  }
  for (let j = 0; j < segs; j++) idx.push(0, 1 + ((j + 1) % segs), 1 + j);
  for (let i = 1; i < rings; i++) for (let j = 0; j < segs; j++) {
    const a = 1 + (i - 1) * segs + j, b = 1 + (i - 1) * segs + ((j + 1) % segs), c = 1 + i * segs + j, d = 1 + i * segs + ((j + 1) % segs);
    idx.push(a, b, c, b, d, c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
});
// the rocky underside of the platform: a lumpy cone hanging down from the rim
const undersideUnit = () => unitGeo('vault-under', () => {
  // (from the tip up to the rim: the lathe faces outwards)
  const prof = [[0.01, -28], [1.6, -26.5], [R - 24.5, -23], [R - 20.5, -19], [R - 15.5, -14.6], [R - 9.5, -10.2], [R - 4.5, -6.2], [R - 1.2, -3.4], [R, -2.2]];
  const geo = new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 72);
  const P = geo.attributes.position, n = makeNoise2D(4242);
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    if (y > -2.3) continue;
    const a = Math.atan2(z, x), cx = Math.cos(a) * 3, sz = Math.sin(a) * 3;
    const k = 1 + (n(cx + y * 0.13, sz - y * 0.21) - 0.5) * 0.36 + (n(cx * 3 + 7, sz * 3 + y * 0.5) - 0.5) * 0.12;
    P.setXYZ(i, x * k, y + (n(cx * 2 + 11, sz * 2 + y * 0.3) - 0.5) * 1.8, z * k);
  }
  geo.computeVertexNormals();
  return geo;
});
const shardUnit = () => unitGeo('vault-shard', () => new THREE.OctahedronGeometry(1, 0));
function rockGeo(seed) {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const P = g.attributes.position, n = makeNoise2D(seed);
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    const k = 0.7 + n(x * 1.7 + y * 0.9 + 3, z * 1.7 - y * 0.6 + 3) * 0.6;
    P.setXYZ(i, x * k, y * k * 0.8, z * k);
  }
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------ build
export function buildVault(ctx, decor) {
  const Z = ctx.zones.vault, group = Z.group;
  const b = new GeoBuilder(), bn = new GeoBuilder();
  const rng = mulberry32(31337);
  const env = vaultEnv();
  const std = (name, o) => { const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0, ...o }); m.name = name; return m; };
  const M = {
    gold: std('vault_gold', { color: 0xe6ae42, metalness: 0.92, roughness: 0.26, envMap: env, envMapIntensity: 1.2, emissive: 0x3a2606, emissiveIntensity: 0.6 }),
    marble: std('vault_marble', { map: marbleTex(), color: 0xe6def2, roughness: 0.42, envMap: env, envMapIntensity: 0.35 }),
    dark: std('vault_dark', { map: marbleTex(), color: 0x3e3056, roughness: 0.35, envMap: env, envMapIntensity: 0.5 }),
    rock: std('vault_rock', { color: 0x2e283a, roughness: 0.95, flatShading: true }),
    crystal: std('vault_crystal', { color: 0x9a4aff, emissive: 0x9a30ff, emissiveIntensity: 1.5, roughness: 0.12, metalness: 0.1, flatShading: true }),
    coins: std('vault_coins', { map: coinTex(), metalness: 0.8, roughness: 0.32, envMap: env, envMapIntensity: 1.1, emissive: 0x4a3000, emissiveIntensity: 0.5 }),
    wood: std('vault_wood', { color: 0x5c3622, roughness: 0.75 }),
    velvet: std('vault_velvet', { color: 0x5a1a6a, roughness: 0.95 }),
    gem: std('vault_gem', { color: 0xff3a6a, emissive: 0xb0103a, emissiveIntensity: 1.2, roughness: 0.1, flatShading: true }),
  };
  const glow = new Glow();
  const L = decor.lights;
  L.cur = group;
  const col = ctx.colliders;

  // ---- floor disc (its own mesh: the painted maps span the whole disc)
  const F = floorMaps();
  const floorMat = new THREE.MeshStandardMaterial({
    map: F.map, emissiveMap: F.emissive, emissive: 0xffffff, emissiveIntensity: 1, roughnessMap: F.mr, metalnessMap: F.mr,
    roughness: 1, metalness: 1, envMap: env, envMapIntensity: 0.7,
  });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(R, 128).rotateX(-Math.PI / 2), floorMat);
  floor.position.set(CX, VAULT.y, CZ);
  floor.receiveShadow = true;
  floor.name = 'vault-floor';
  group.add(floor);
  // the rune circle glowing over its centre (two layers turning against each other)
  const sigMat = (color, opacity) => new THREE.MeshBasicMaterial({ map: sigilTex(), color: new THREE.Color(color), transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const sigil = new THREE.Mesh(new THREE.PlaneGeometry(21.2, 21.2).rotateX(-Math.PI / 2), sigMat('#ffc860', 0.8));
  const sigil2 = new THREE.Mesh(new THREE.PlaneGeometry(8.6, 8.6).rotateX(-Math.PI / 2), sigMat('#c080ff', 0.75));
  sigil.position.set(CX, VAULT.y + 0.03, CZ); sigil2.position.set(CX, VAULT.y + 0.05, CZ);
  sigil.renderOrder = sigil2.renderOrder = 3;
  group.add(sigil, sigil2);

  // ---- rim, gold trim, the rocky underside with crystals hanging from it
  bn.geo(M.dark, U.cyl(96, true), pm(CX, -1.1, CZ, 0, 0, 0, R, 2.2, R), { uv: 'frame', uvs: 0.3 });
  for (const y of [-0.13, -2.08]) bn.geo(M.gold, U.cyl(96, true), pm(CX, y, CZ, 0, 0, 0, R + 0.05, 0.26, R + 0.05), {});
  bn.geo(M.rock, undersideUnit(), pm(CX, 0, CZ), { flat: true });
  for (let i = 0; i < 16; i++) {
    const a = rng() * TAU, d = 6 + rng() * 17, y = -2.5 - (R - d) * 0.75 - rng() * 2;
    const [x, z] = at(a, d);
    bn.geo(M.crystal, shardUnit(), pm(x, y, z, Math.PI + (rng() - 0.5) * 0.6, rng() * TAU, (rng() - 0.5) * 0.6, 0.3 + rng() * 0.4, 1.4 + rng() * 2.4, 0.3 + rng() * 0.4), { flat: true });
  }

  // ---- balustrade: posts with gold caps, balusters, rails
  const BR = 27.35, NP = 72;
  for (let i = 0; i < NP; i++) {
    const a = (i / NP) * TAU, [x, z] = at(a, BR), ry = Math.PI / 2 - a;
    b.box(M.marble, pm(x, 0.47, z, 0, ry, 0), 0.34, 0.94, 0.34, { uv: 'frame', uvs: 0.5 });
    b.box(M.gold, pm(x, 0.99, z, 0, ry, 0), 0.44, 0.1, 0.44, {});
    const a1 = ((i + 1) / NP) * TAU, am = (a + a1) / 2, [mx, mz] = at(am, BR), len = 2 * BR * Math.sin(Math.PI / NP);
    b.box(M.gold, pm(mx, 0.99, mz, 0, Math.PI / 2 - am, 0), len, 0.1, 0.16, {});
    b.box(M.marble, pm(mx, 0.11, mz, 0, Math.PI / 2 - am, 0), len, 0.16, 0.22, { uv: 'frame', uvs: 0.5 });
    for (const t of [-0.25, 0, 0.25]) {
      const [px, pz] = at(am + t * (TAU / NP), BR);
      b.geo(M.marble, U.lathe('baluster', [[0.001, 0], [0.08, 0], [0.06, 0.2], [0.1, 0.42], [0.05, 0.64], [0.07, 0.75], [0.001, 0.75]], 8), pm(px, 0.19, pz), {});
    }
  }

  // ---- columns: dark plinth, marble shaft with gold bands, gold capital and a floating orb; three are broken
  const orbs = [];
  for (let i = 0; i < 8; i++) {
    const a = ((i + 0.5) / 8) * TAU, [x, z] = at(a, COLUMN_R), ry = Math.PI / 2 - a;
    const broken = BROKEN.includes(i), h = broken ? [7.6, 5.4, 9.2][BROKEN.indexOf(i)] : 15;
    b.box(M.dark, pm(x, 0.35, z, 0, ry, 0), 2.8, 0.7, 2.8, { uv: 'frame', uvs: 0.35 });
    b.box(M.gold, pm(x, 0.78, z, 0, ry, 0), 2.3, 0.16, 2.3, {});
    b.geo(M.marble, U.frustum(0.8, 24), pm(x, 1.16, z, 0, 0, 0, 1.12, 0.6, 1.12), { uv: 'frame', uvs: 0.35 });
    b.geo(M.marble, U.cyl(24), pm(x, 1.46 + (h - 1.46) / 2, z, 0, 0, 0, 0.84, h - 1.46, 0.84), { uv: 'frame', uvs: 0.3 });
    for (const y of [2.1, h * 0.55]) if (y < h - 0.6) b.geo(M.gold, U.cyl(24), pm(x, y, z, 0, 0, 0, 0.92, 0.22, 0.92), {});
    if (!broken) {
      b.geo(M.gold, U.frustum(0.62, 24), pm(x, h + 0.42, z, Math.PI, 0, 0, 1.3, 0.84, 1.3), {});
      b.box(M.gold, pm(x, h + 0.98, z, 0, ry, 0), 2.3, 0.3, 2.3, {});
      const oy = h + 2.4;
      orbs.push({ x, z, y: oy, ph: rng() * TAU });
      glow.add(x, oy, z, '#ffc860', 5, 0);
      L.add(x, oy, z, '#ffc870', 10, 16);
    } else {
      // jagged break, corrupted crystals growing out of it, fallen drums on the floor
      for (let k = 0; k < 4; k++) {
        const t = (k / 4) * TAU + rng();
        b.geo(M.marble, U.coneCap(5), pm(x + Math.cos(t) * 0.35, h + 0.2, z + Math.sin(t) * 0.35, (rng() - 0.5) * 0.5, rng() * TAU, (rng() - 0.5) * 0.5, 0.45, 0.5 + rng() * 0.6, 0.45), { flat: true });
      }
      for (let k = 0; k < 4; k++) b.geo(M.crystal, shardUnit(), pm(x + (rng() - 0.5) * 0.9, h + 0.6 + rng() * 0.5, z + (rng() - 0.5) * 0.9, (rng() - 0.5) * 1.1, rng() * TAU, (rng() - 0.5) * 1.1, 0.2 + rng() * 0.15, 0.8 + rng() * 0.9, 0.2 + rng() * 0.15), { flat: true });
      glow.add(x, h + 1, z, '#b050ff', 3.5, 0);
      const fa = a + (rng() < 0.5 ? -1 : 1) * 0.12, [fx, fz] = at(fa, COLUMN_R - 2.6);
      b.geo(M.marble, U.cyl(24), pm(fx, 0.84, fz, 0, Math.PI / 2 - fa + 0.9, Math.PI / 2, 0.84, 2.4, 0.84), { uv: 'frame', uvs: 0.3 });
      col.addCircle(fx, fz, 1.2);
    }
    col.addCircle(x, z, 1.45);
    ctx.minimap.addCircle(x, z, 1.4, 'rgba(230,220,245,0.9)');
  }

  // ---- mounds of gold; the biggest one (behind where she stands) carries a crown and a sword
  for (const [ad, d, r, h] of MOUNDS) {
    const a = rad(ad), [x, z] = at(a, d);
    b.geo(M.coins, moundUnit(), pm(x, 0, z, 0, rng() * TAU, 0, r, h, r * 0.85), { uv: 'keep', uvScale: [r * 0.42, r * 0.42] });
    col.addCircle(x, z, r * 0.78);
    ctx.minimap.addCircle(x, z, r * 0.8, 'rgba(236,184,70,0.95)');
    glow.add(x, h * 0.7, z, '#ffc050', r * 1.6, 0);
    L.add(x, h + 1.4, z, '#ffc060', 12, 14);
  }
  {
    const [x, z] = at(rad(270), 23.2);
    // crown on top
    b.push(pm(x + 0.4, 2.3, z + 0.5, 0.25, 0.4, -0.15));
    b.geo(M.gold, U.cyl(16, true), pm(0, 0.18, 0, 0, 0, 0, 0.5, 0.36, 0.5), {});
    for (let k = 0; k < 8; k++) {
      const t = (k / 8) * TAU;
      b.geo(M.gold, U.coneCap(4), pm(Math.cos(t) * 0.5, 0.52, Math.sin(t) * 0.5, 0, t, 0, 0.1, 0.34, 0.1), {});
      b.geo(M.gem, U.ico(0), pm(Math.cos(t + 0.39) * 0.51, 0.2, Math.sin(t + 0.39) * 0.51, 0, 0, 0, 0.07, 0.07, 0.07), { flat: true });
    }
    b.pop();
    // a golden sword stuck in the heap
    b.push(pm(x - 1.6, 1.7, z - 0.6, 0.35, 0.8, 0.2));
    b.box(M.gold, pm(0, 0.2, 0), 0.16, 2.4, 0.04, {});
    b.box(M.gold, pm(0, 1.45, 0), 0.9, 0.12, 0.12, {});
    b.geo(M.velvet, U.cyl(8), pm(0, 1.8, 0, 0, 0, 0, 0.06, 0.6, 0.06), {});
    b.geo(M.gem, U.ico(0), pm(0, 2.14, 0, 0, 0, 0, 0.1, 0.1, 0.1), { flat: true });
    b.pop();
  }
  // goblets on some heaps
  for (const [ad, d, h] of [[0, 23.4, 1.1], [180, 22.6, 1.3], [225, 23.8, 1.0], [315, 23.3, 1.1]]) {
    const [x, z] = at(rad(ad) + 0.05, d);
    b.geo(M.gold, U.lathe('goblet', [[0.001, 0], [0.2, 0], [0.18, 0.04], [0.04, 0.1], [0.04, 0.3], [0.2, 0.42], [0.22, 0.62], [0.2, 0.62], [0.001, 0.46]], 12), pm(x, h - 0.1, z, 0.3, rng() * TAU, 0.2), {});
  }

  // ---- chests (one open, gold spilling out)
  for (const [ad, d, ro, open] of CHESTS) {
    const a = rad(ad), [x, z] = at(a, d), ry = -Math.PI / 2 - a + ro;
    b.push(pm(x, 0, z, 0, ry, 0));
    b.box(M.wood, pm(0, 0.42, 0), 1.5, 0.84, 0.95, { uv: 'part', uvs: 1 });
    for (const s of [-1, 1]) b.box(M.gold, pm(s * 0.55, 0.43, 0), 0.1, 0.88, 1.0, {});
    b.box(M.gold, pm(0, 0.72, 0.49), 0.24, 0.28, 0.05, {});
    if (!open) {
      b.geo(M.wood, U.cyl(12), pm(0, 0.84, 0, 0, 0, Math.PI / 2, 0.475, 1.5, 0.475), {});
      for (const s of [-1, 1]) b.geo(M.gold, U.cyl(12), pm(s * 0.55, 0.84, 0, 0, 0, Math.PI / 2, 0.5, 0.1, 0.5), {});
    } else {
      b.box(M.wood, pm(0, 1.22, -0.62, -1.15, 0, 0), 1.5, 0.08, 0.95, {});
      b.box(M.coins, pm(0, 0.86, 0), 1.36, 0.06, 0.82, { uv: 'part', uvs: 0.7 });
      b.geo(M.coins, moundUnit(), pm(0, 0.86, 0, 0, 0, 0, 0.62, 0.22, 0.4), { uv: 'keep', uvScale: [0.3, 0.3] });
      b.geo(M.coins, moundUnit(), pm(0.1, 0, 1.0, 0, 0.5, 0, 0.9, 0.3, 0.7), { uv: 'keep', uvScale: [0.4, 0.4] });
      const cx = x + Math.sin(ry) * 0.1, cz = z + Math.cos(ry) * 0.1;
      glow.add(cx, 1.05, cz, '#ffd070', 3.2, 0);
    }
    b.pop();
    col.addBox(x, z, 0.85, 0.6, ry);
  }

  // ---- corrupted crystal clusters along the rim
  for (const [ad, d, s] of CRYSTALS) {
    const a = rad(ad), [x, z] = at(a, d);
    const n = 5 + ((rng() * 4) | 0);
    for (let i = 0; i < n; i++) {
      const hh = (0.9 + rng() * 1.9) * s, w = (0.2 + rng() * 0.2) * s;
      const dir = a + (rng() - 0.5) * 2.2, tilt = 0.15 + rng() * 0.55;
      b.geo(M.crystal, shardUnit(), pm(x + (rng() - 0.5) * 1.3 * s, hh * 0.35, z + (rng() - 0.5) * 1.3 * s, tilt, Math.PI / 2 - dir, 0, w, hh, w), { flat: true });
    }
    glow.add(x, 1.2 * s, z, '#b050ff', 4.5 * s, 0);
    L.add(x, 1.6, z, '#b050ff', 9, 12);
    col.addCircle(x, z, 1.1 * s);
  }
  L.add(CX, 6, CZ, '#ffd890', 18, 30);

  // ---- coins scattered around the heaps (one instanced draw)
  const coinMat = new THREE.MeshStandardMaterial({ color: 0xf0bc4a, metalness: 0.9, roughness: 0.28, envMap: env, envMapIntensity: 1.2, emissive: 0x3a2604, emissiveIntensity: 0.6 });
  const NC = 700;
  const coins = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.12, 0.025, 12), coinMat, NC);
  const dm = new THREE.Object3D();
  let ci = 0;
  while (ci < NC) {
    let x, z;
    if (ci < 600) {
      const [ad, d, r] = MOUNDS[ci % MOUNDS.length], [mx, mz] = at(rad(ad), d);
      const a = rng() * TAU, rr = r * (0.75 + Math.pow(rng(), 1.6) * 1.0);
      x = mx + Math.cos(a) * rr; z = mz + Math.sin(a) * rr;
    } else { const a = rng() * TAU, rr = 6 + rng() * 19; x = CX + Math.cos(a) * rr; z = CZ + Math.sin(a) * rr; }
    if (Math.hypot(x - CX, z - CZ) > 26.8) continue;
    dm.position.set(x, 0.014 + rng() * 0.02, z);
    dm.rotation.set((rng() - 0.5) * 0.25, rng() * TAU, (rng() - 0.5) * 0.25);
    dm.updateMatrix();
    coins.setMatrixAt(ci++, dm.matrix);
  }
  coins.receiveShadow = true;
  group.add(coins);

  // ---- the halo high above: two rings of gold turning against each other, orbs on the outer one
  const haloMat = new THREE.MeshStandardMaterial({ color: 0xf0c050, metalness: 0.9, roughness: 0.3, envMap: env, emissive: 0xffa828, emissiveIntensity: 0.85 });
  const halo = new THREE.Group();
  halo.position.set(CX, 25, CZ);
  const ring1 = new THREE.Mesh(new THREE.TorusGeometry(15, 0.32, 10, 180), haloMat);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(11.6, 0.15, 8, 140), haloMat);
  ring1.rotation.x = ring2.rotation.x = Math.PI / 2;
  const tilt1 = new THREE.Group(), tilt2 = new THREE.Group();
  tilt1.rotation.z = 0.08; tilt2.rotation.x = -0.14;
  tilt1.add(ring1); tilt2.add(ring2);
  for (let k = 0; k < 12; k++) {
    const t = (k / 12) * TAU;
    const o = new THREE.Mesh(new THREE.SphereGeometry(k % 3 ? 0.35 : 0.6, 14, 10), haloMat);
    o.position.set(Math.cos(t) * 15, 0, Math.sin(t) * 15);
    tilt1.add(o);
  }
  halo.add(tilt1, tilt2);
  group.add(halo);
  // column-top orbs
  const orbMat = new THREE.MeshStandardMaterial({ color: 0xffe6a0, emissive: 0xffb030, emissiveIntensity: 2.2, roughness: 0.2, metalness: 0.3 });
  const orbMeshes = orbs.map((o) => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.45, 18, 12), orbMat); m.position.set(o.x, o.y, o.z); group.add(m); return m; });

  // ---- sky and drifting rocks
  const skyMat = new THREE.ShaderMaterial({ vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { uTime: { value: 0 } } });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), skyMat);
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  group.add(sky);
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x3a3250, roughness: 0.9, flatShading: true });
  const NR = 30;
  const rocks = new THREE.InstancedMesh(rockGeo(515), rockMat, NR);
  const rockData = [];
  for (let i = 0; i < NR; i++) rockData.push({ a: rng() * TAU, r: 33 + rng() * 26, y: -22 + rng() * 34, s: 0.6 + rng() * 2.4, w: (0.01 + rng() * 0.025) * (rng() < 0.5 ? -1 : 1), ph: rng() * TAU, spin: new THREE.Vector3(rng(), rng(), rng()).multiplyScalar(0.4) });
  rocks.frustumCulled = false;
  group.add(rocks);
  glow.build(group);

  // ---- the way back: a portal on the south rim, sealed while she fights
  const P = VAULT.portal;
  const portal = createPortal({ id: 'vault_exit', name: 'Throne Room', x: P.x, y: VAULT.y, z: P.z, rotY: P.rotY });
  portal.dest = 'throne';                   // (not a world: onUse takes the hero back up)
  group.add(portal.group);
  const pc = Math.cos(P.rotY), ps = Math.sin(P.rotY);
  for (const sx of [-1, 1]) col.addCircle(P.x + pc * sx * 2.35, P.z - ps * sx * 2.35, 0.6);
  ctx.minimap.addCircle(P.x, P.z, 2.2, '#4dff9a');
  const sealMat = new THREE.ShaderMaterial({
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: SEAL_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uAlpha: { value: 1 } },
  });
  const seal = new THREE.Mesh(new THREE.CircleGeometry(2.25, 48), sealMat);
  seal.position.set(0, 3.1, 0.62);
  seal.renderOrder = 5;
  portal.group.add(seal);
  const vagel = () => G.monsters && G.monsters.list.find((m) => m.type === 'vagel');
  const FIGHT = ['shift', 'vault', 'wrath', 'defeat'];
  const locked = () => { const v = vagel(); return !!(v && !v.dead && FIGHT.includes(v.stage)); };
  portal.locked = locked;
  portal.lockedMsg = 'A seal of gold and violet light covers the portal. While Vagel stands, there is no way out.';
  portal.onUse = () => {
    if (locked()) { G.msg(portal.lockedMsg, 'warn'); G.audio.play('error'); return; }
    const p = G.player;
    p.stopActions();
    G.audio.play('teleport');
    flash('#fff1c4', { rise: 0.25, hold: 0.3, fade: 0.9 }).then(() => {
      const B = VAULT.back;
      p.teleport(B.x, B.z);
      p.rotY = p.faceGoal = B.rotY;
      G.cam.yaw = B.rotY + Math.PI;
      G.cam.snap(p.pos);
      G.fx.pillar(p.pos.clone(), '#fff1c4', 1.2, 0.8, 7);
    });
  };

  // ---- the way home: a portal to Roumen that rises out of the floor once Prince Ratman is free (shown and hidden by
  // entities/bosses/vagelStory.js; while hidden it is no portal at all: no colliders, not in the world's list)
  const H = VAULT.home;
  const home = createPortal({ id: 'vault_home', name: 'Roumen', x: H.x, y: VAULT.y, z: H.z, rotY: H.rotY });
  home.dest = 'roumen';
  home.hidden = true;
  home.group.visible = false;
  group.add(home.group);
  const hc = Math.cos(H.rotY), hs = Math.sin(H.rotY);
  let homeCols = null, homeRise = -1;
  const homeCtl = {
    portal: home,
    portals: null,                          // (the world's portal list, set by index.js)
    get shown() { return !home.hidden; },
    show(rise = false) {
      if (!home.hidden) return;
      home.hidden = false;
      home.group.visible = true;
      homeCols = [-1, 1].map((sx) => col.addCircle(H.x + hc * sx * 2.35, H.z - hs * sx * 2.35, 0.6));
      if (this.portals && !this.portals.includes(home)) this.portals.push(home);
      homeRise = rise ? 0 : -1;
      home.group.position.y = rise ? VAULT.y - 7 : VAULT.y;
      if (rise) {
        const p = new THREE.Vector3(H.x, VAULT.y, H.z);
        G.fx.pillar(p, '#8affc0', 2.4, 2.2, 14);
        G.fx.shockwave(p, '#8affc0');
        G.audio.play('teleport');
      }
    },
    hide() {
      if (home.hidden) return;
      home.hidden = true;
      home.group.visible = false;
      for (const c of homeCols || []) col.remove(c);
      homeCols = null;
      if (this.portals) { const i = this.portals.indexOf(home); if (i >= 0) this.portals.splice(i, 1); }
    },
  };

  const tris = Math.round(b.triangleCount() + bn.triangleCount());
  b.flush(Z.batcher);
  bn.flush(Z.batcherNoShadow);

  // ---- motion
  const GOLD = new THREE.Color('#ffd070'), VIOLET = new THREE.Color('#b060ff');
  const _p = new THREE.Vector3();
  let wasLocked = null;
  return {
    portal,
    home: homeCtl,
    stats: `${tris} tris, ${NC} coins`,
    update(dt, t, camera) {
      if (!group.visible) return;
      if (camera) sky.position.copy(camera.position);
      skyMat.uniforms.uTime.value = t;
      sigil.rotation.y = t * 0.05; sigil2.rotation.y = -t * 0.11;
      tilt1.rotation.y = t * 0.07; tilt2.rotation.y = -t * 0.11;
      orbMeshes.forEach((m, i) => { m.position.y = orbs[i].y + Math.sin(t * 1.1 + orbs[i].ph) * 0.25; });
      M.crystal.emissiveIntensity = 1.35 + 0.35 * Math.sin(t * 1.7);
      for (let i = 0; i < NR; i++) {
        const r = rockData[i], a = r.a + t * r.w;
        dm.position.set(CX + Math.cos(a) * r.r, r.y + Math.sin(t * 0.4 + r.ph) * 0.8, CZ + Math.sin(a) * r.r);
        dm.rotation.set(t * r.spin.x + r.ph, t * r.spin.y, t * r.spin.z);
        dm.scale.setScalar(r.s);
        dm.updateMatrix();
        rocks.setMatrixAt(i, dm.matrix);
      }
      rocks.instanceMatrix.needsUpdate = true;
      // gold dust rising everywhere, a few violet motes
      const fx = G.fx;
      if (fx) {
        for (let k = 0; k < 3; k++) if (Math.random() < dt * 12) {
          const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * 26;
          fx.particles.emit({ x: CX + Math.cos(a) * r, y: 0.2 + Math.random() * 3, z: CZ + Math.sin(a) * r, vx: (Math.random() - 0.5) * 0.3, vy: 0.4 + Math.random() * 0.8, vz: (Math.random() - 0.5) * 0.3, life: 3 + Math.random() * 2, size: 0.12 + Math.random() * 0.14, color: Math.random() < 0.8 ? GOLD : VIOLET, grav: 0, drag: 0.2 });
        }
      }
      portal.update(dt, t, fx);
      if (!home.hidden) {
        if (homeRise >= 0) {
          // rising out of the marble, the ground shaking a little
          homeRise += dt;
          const k = Math.min(1, homeRise / 2.2);
          home.group.position.y = VAULT.y - 7 * Math.pow(1 - k, 3);
          if (fx && k < 1) for (let i = 0; i < 3; i++) {
            const a = Math.random() * TAU, r = 2.6 + Math.random() * 1.2;
            fx.particles.emit({ x: H.x + Math.cos(a) * r, y: 0.1, z: H.z + Math.sin(a) * r, vx: Math.cos(a) * 1.5, vy: 1.5 + Math.random() * 2, vz: Math.sin(a) * 1.5, life: 0.9, size: 0.45, endSize: 0.8, color: GOLD, grav: -3, drag: 1.5, alpha: 0.6 });
          }
          if (k >= 1) homeRise = -1;
        }
        home.update(dt, t, fx);
      }
      const l = locked();
      if (wasLocked === true && !l) {
        seal.getWorldPosition(_p);
        for (let i = 0; i < 70; i++) {
          const a = Math.random() * TAU, r = Math.random() * 2.2;
          fx.particles.emit({ x: _p.x + Math.cos(a) * r * 0.3, y: _p.y + Math.sin(a) * r, z: _p.z + Math.cos(a) * r, vx: (Math.random() - 0.5) * 6, vy: Math.random() * 4, vz: (Math.random() - 0.5) * 6, life: 1.1, size: 0.35, color: Math.random() < 0.6 ? GOLD : VIOLET, grav: -6, drag: 1.2 });
        }
        G.audio.play('shatter');
      }
      wasLocked = l;
      seal.visible = l;
      sealMat.uniforms.uTime.value = t;
      sealMat.uniforms.uAlpha.value = 0.85 + Math.sin(t * 2.4) * 0.15;
    },
  };
}

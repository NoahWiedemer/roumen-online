// Procedural, tileable canvas textures (all art generated in code)
import * as THREE from 'three';
import { makeFbm, makeNoise2D, mulberry32, clamp, lerp, smoothstep } from './utils.js';

let maxAniso = 8;
export function setMaxAnisotropy(v) { maxAniso = v; }

const cache = new Map();
const memoData = new Map();
function memo(key, fn) {
  if (!memoData.has(key)) memoData.set(key, fn());
  return memoData.get(key);
}

function makeCanvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function toTexture(canvas, { srgb = true, repeat = true } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = maxAniso;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true;
  return t;
}

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

// Build a normal map (linear) from a height field
function normalFromHeight(height, size, strength = 2) {
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const H = (x, y) => height[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
      const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      let nx = -dx, ny = dy, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l; ny /= l; nz /= l;
      const i = (y * size + x) * 4;
      d[i] = (nx * 0.5 + 0.5) * 255;
      d[i + 1] = (ny * 0.5 + 0.5) * 255;
      d[i + 2] = (nz * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c, { srgb: false });
}

// Tileable voronoi: returns per-pixel {f1, f2, id}
function voronoiField(size, cells, seed, jitter = 0.85) {
  const rng = mulberry32(seed);
  const pts = [];
  for (let j = 0; j < cells; j++)
    for (let i = 0; i < cells; i++)
      pts.push([(i + 0.5 + (rng() - 0.5) * jitter) / cells, (j + 0.5 + (rng() - 0.5) * jitter) / cells, rng()]);
  const f1 = new Float32Array(size * size), f2 = new Float32Array(size * size), id = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const ci = Math.floor(u * cells), cj = Math.floor(v * cells);
      let d1 = 9, d2 = 9, best = 0;
      for (let oj = -2; oj <= 2; oj++) for (let oi = -2; oi <= 2; oi++) {
        const ii = ci + oi, jj = cj + oj;
        const wi = ((ii % cells) + cells) % cells, wj = ((jj % cells) + cells) % cells;
        const p = pts[wj * cells + wi];
        const px = p[0] + (ii - wi) / cells, py = p[1] + (jj - wj) / cells;
        const dd = Math.hypot(px - u, py - v);
        if (dd < d1) { d2 = d1; d1 = dd; best = p[2]; } else if (dd < d2) d2 = dd;
      }
      const k = y * size + x;
      f1[k] = d1 * cells; f2[k] = d2 * cells; id[k] = best;
    }
  }
  return { f1, f2, id };
}

function paintPixels(size, fn) {
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const col = fn(x, y);
    const i = (y * size + x) * 4;
    d[i] = clamp(col[0], 0, 255); d[i + 1] = clamp(col[1], 0, 255); d[i + 2] = clamp(col[2], 0, 255);
    d[i + 3] = col[3] === undefined ? 255 : col[3];
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// ---------------------------------------------------------------- generators
const gens = {
  grass() {
    const S = 512, P = 8;
    const fb = makeFbm(11, 5, P), fb2 = makeFbm(29, 4, P * 2);
    const base = hexToRgb('#5f9e36'), light = hexToRgb('#8cc152'), dark = hexToRgb('#3f7a2a'), yel = hexToRgb('#a7b94a');
    const c = paintPixels(S, (x, y) => {
      const u = (x / S) * P, v = (y / S) * P;
      const n = fb(u, v), m = fb2(u * 1.3, v * 1.3);
      let col = mix3(dark, base, smoothstep(0.25, 0.55, n));
      col = mix3(col, light, smoothstep(0.55, 0.8, n) * 0.8);
      col = mix3(col, yel, smoothstep(0.62, 0.8, m) * 0.35);
      const g = (Math.random() - 0.5) * 14;
      return [col[0] + g, col[1] + g, col[2] + g * 0.5];
    });
    // blade strokes
    const ctx = c.getContext('2d');
    const rng = mulberry32(5);
    for (let i = 0; i < 5200; i++) {
      const x = rng() * S, y = rng() * S, len = 3 + rng() * 7, a = -Math.PI / 2 + (rng() - 0.5) * 0.9;
      const l = rng();
      ctx.strokeStyle = l > 0.5 ? `rgba(170,215,95,${0.25 + rng() * 0.3})` : `rgba(40,85,25,${0.2 + rng() * 0.25})`;
      ctx.lineWidth = 0.8 + rng() * 0.9;
      for (const ox of [0, -S, S]) for (const oy of [0, -S, S]) {
        if (ox && (x > 12 && x < S - 12)) continue;
        if (oy && (y > 12 && y < S - 12)) continue;
        ctx.beginPath(); ctx.moveTo(x + ox, y + oy); ctx.lineTo(x + ox + Math.cos(a) * len, y + oy + Math.sin(a) * len); ctx.stroke();
      }
    }
    return toTexture(c);
  },

  dirt() {
    const S = 512, P = 8;
    const fb = makeFbm(41, 5, P);
    const a = hexToRgb('#9a7449'), b = hexToRgb('#b98f5d'), dk = hexToRgb('#6e5033');
    const c = paintPixels(S, (x, y) => {
      const n = fb((x / S) * P, (y / S) * P);
      let col = mix3(dk, a, smoothstep(0.2, 0.5, n));
      col = mix3(col, b, smoothstep(0.5, 0.75, n));
      const g = (Math.random() - 0.5) * 18;
      return [col[0] + g, col[1] + g, col[2] + g];
    });
    const ctx = c.getContext('2d');
    const rng = mulberry32(8);
    for (let i = 0; i < 900; i++) {
      const x = rng() * S, y = rng() * S, r = 0.8 + rng() * 2.6;
      const t = rng();
      ctx.fillStyle = `rgba(${t > 0.5 ? '210,190,160' : '90,70,50'},${0.35 + rng() * 0.4})`;
      ctx.beginPath(); ctx.ellipse(x, y, r, r * (0.6 + rng() * 0.4), rng() * 3, 0, Math.PI * 2); ctx.fill();
    }
    return toTexture(c);
  },

  _cobbleData() {
    const S = 512, cells = 9;
    const vf = voronoiField(S, cells, 77, 0.8);
    const fb = makeFbm(3, 4, 16);
    const height = new Float32Array(S * S);
    const palette = ['#b9aa94', '#a89a86', '#c8b9a0', '#9c8f80', '#b3a18a', '#c2ad91', '#a39787'].map(hexToRgb);
    const grout = hexToRgb('#5b5247');
    const c = paintPixels(S, (x, y) => {
      const k = y * S + x;
      const edge = vf.f2[k] - vf.f1[k];
      const n = fb((x / S) * 16, (y / S) * 16);
      const stone = smoothstep(0.06, 0.2, edge);
      const dome = smoothstep(0.06, 0.45, edge);
      height[k] = stone * (0.55 + dome * 0.45) + n * 0.12;
      const base = palette[Math.floor(vf.id[k] * palette.length)];
      let col = mix3(grout, base, stone);
      const shade = 0.78 + dome * 0.28 + (n - 0.5) * 0.25;
      return [col[0] * shade, col[1] * shade, col[2] * shade];
    });
    return { c, height, S };
  },
  cobble() { const { c } = memo('cobbleData', () => gens._cobbleData()); return toTexture(c); },
  cobbleNormal() { const { height, S } = memo('cobbleData', () => gens._cobbleData()); return normalFromHeight(height, S, 3.5); },

  plazaStone() {
    // pinkish sand stone slabs for plazas
    const S = 512, cells = 6;
    const vf = voronoiField(S, cells, 91, 0.5);
    const fb = makeFbm(12, 4, 8);
    const palette = ['#e3b7a8', '#d9a898', '#eac3b4', '#d4a293', '#e8bca8'].map(hexToRgb);
    const grout = hexToRgb('#9c7468');
    const c = paintPixels(S, (x, y) => {
      const k = y * S + x;
      const edge = vf.f2[k] - vf.f1[k];
      const stone = smoothstep(0.03, 0.09, edge);
      const n = fb((x / S) * 8, (y / S) * 8);
      const col = mix3(grout, palette[Math.floor(vf.id[k] * palette.length)], stone);
      const sh = 0.88 + n * 0.22;
      return [col[0] * sh, col[1] * sh, col[2] * sh];
    });
    return toTexture(c);
  },

  sand() {
    const S = 512, P = 8;
    const fb = makeFbm(301, 5, P);
    const a = hexToRgb('#d9c49a'), b = hexToRgb('#eadcb8'), dk = hexToRgb('#b8a07a');
    const c = paintPixels(S, (x, y) => {
      const n = fb((x / S) * P, (y / S) * P);
      let col = mix3(dk, a, smoothstep(0.2, 0.5, n));
      col = mix3(col, b, smoothstep(0.55, 0.8, n));
      const g = (Math.random() - 0.5) * 22;
      return [col[0] + g, col[1] + g, col[2] + g * 0.8];
    });
    const ctx = c.getContext('2d');
    const rng = mulberry32(302);
    for (let i = 0; i < 500; i++) {
      const x = rng() * S, y = rng() * S, r = 0.6 + rng() * 1.8;
      ctx.fillStyle = `rgba(${rng() > 0.5 ? '255,250,235' : '120,100,70'},${0.3 + rng() * 0.4})`;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    return toTexture(c);
  },

  plaster() {
    const S = 512, P = 6;
    const fb = makeFbm(51, 5, P), fb2 = makeFbm(52, 3, P);
    const base = hexToRgb('#f1e4c8'), warm = hexToRgb('#e6d0a8'), grime = hexToRgb('#c8b392');
    const c = paintPixels(S, (x, y) => {
      const u = (x / S) * P, v = (y / S) * P;
      const n = fb(u, v), m = fb2(u * 2, v * 2);
      let col = mix3(base, warm, smoothstep(0.35, 0.75, n) * 0.7);
      col = mix3(col, grime, smoothstep(0.62, 0.85, m) * 0.35);
      const g = (Math.random() - 0.5) * 7;
      return [col[0] + g, col[1] + g, col[2] + g];
    });
    return toTexture(c);
  },

  wood() {
    const S = 512, planks = 4;
    const n1 = makeNoise2D(71), fb = makeFbm(72, 4, 8);
    const rng = mulberry32(73);
    const tints = Array.from({ length: planks }, () => 0.85 + rng() * 0.3);
    const a = hexToRgb('#7a4b2a'), b = hexToRgb('#a0673a'), dk = hexToRgb('#4a2c18');
    const c = paintPixels(S, (x, y) => {
      const u = x / S, v = y / S;
      const pi = Math.floor(u * planks), pu = u * planks - pi;
      const grain = Math.sin((u * 60 + fb(u * 8, v * 2) * 6 + pi * 3.1) * 3.0) * 0.5 + 0.5;
      let col = mix3(a, b, grain * 0.6 + n1(u * 30, v * 4) * 0.4);
      const gap = smoothstep(0.0, 0.04, pu) * smoothstep(1.0, 0.96, pu);
      col = mix3(dk, col, gap);
      const t = tints[pi];
      return [col[0] * t, col[1] * t, col[2] * t];
    });
    return toTexture(c);
  },

  darkWood() {
    const S = 256;
    const fb = makeFbm(81, 4, 4);
    const a = hexToRgb('#4a2a17'), b = hexToRgb('#6b3e22');
    const c = paintPixels(S, (x, y) => {
      const u = x / S, v = y / S;
      const g = Math.sin((v * 40 + fb(u * 2, v * 4) * 5) * 2.5) * 0.5 + 0.5;
      const col = mix3(a, b, g * 0.7);
      const r = (Math.random() - 0.5) * 8;
      return [col[0] + r, col[1] + r, col[2] + r];
    });
    return toTexture(c);
  },

  _roofData(hue = 'red') {
    const S = 512, rows = 8, cols = 8;
    const rng = mulberry32(hue === 'red' ? 101 : hue === 'blue' ? 102 : 103);
    const pal = {
      red: ['#c9412c', '#b8392a', '#d24f33', '#a93225', '#c64830'],
      blue: ['#3d67b8', '#355ca8', '#4a75c4', '#2f5299', '#4470bd'],
      pink: ['#d9667f', '#cc5a73', '#e0738b', '#c24f69', '#d86b83'],
      slate: ['#5b6272', '#535a69', '#646b7c', '#4c5261', '#5f6677'],
    }[hue].map(hexToRgb);
    const tileCol = [];
    for (let i = 0; i < rows * cols * 2; i++) tileCol.push(pal[Math.floor(rng() * pal.length)]);
    const height = new Float32Array(S * S);
    const fb = makeFbm(104, 3, 8);
    const c = paintPixels(S, (x, y) => {
      const v = y / S * rows;
      const row = Math.floor(v), fv = v - row;
      const off = (row % 2) * 0.5;
      const u = (x / S) * cols + off;
      const col = Math.floor(u), fu = u - col;
      // rounded tile bottom
      const dxm = (fu - 0.5) * 2;
      const bottom = 1 - 0.18 * (1 - dxm * dxm);
      const inTile = fv < bottom;
      const edgeX = smoothstep(0.0, 0.06, fu) * smoothstep(1.0, 0.94, fu);
      const k = y * S + x;
      const ci = ((row * cols + ((col % cols) + cols) % cols) * 7) % tileCol.length;
      let base = tileCol[ci];
      const n = fb(x / S * 8, y / S * 8);
      // shading: top of tile darker (covered), bottom lit, with barrel curvature
      const barrel = 1 - Math.pow(Math.abs(dxm), 3) * 0.35;
      let sh = (0.62 + fv * 0.45) * barrel * (0.9 + n * 0.2);
      let h = fv * barrel;
      if (!inTile) { sh = 0.35; h = 0; }
      sh *= lerp(0.55, 1, edgeX);
      height[k] = h * edgeX;
      return [base[0] * sh, base[1] * sh, base[2] * sh];
    });
    return { c, height, S };
  },
  roofRed() { return toTexture(memo('roofRed', () => gens._roofData('red')).c); },
  roofBlue() { return toTexture(gens._roofData('blue').c); },
  roofPink() { return toTexture(gens._roofData('pink').c); },
  roofSlate() { return toTexture(gens._roofData('slate').c); },
  roofNormal() { const { height, S } = memo('roofRed', () => gens._roofData('red')); return normalFromHeight(height, S, 4); },

  _stoneWallData() {
    const S = 512, rows = 8;
    const rng = mulberry32(121);
    const pal = ['#b8ae9c', '#a79d8a', '#c4b9a5', '#9d9483', '#b2a58f', '#aca290'].map(hexToRgb);
    const grout = hexToRgb('#6d665a');
    const fb = makeFbm(122, 4, 16);
    // pre-layout bricks per row
    const rowBricks = [];
    for (let r = 0; r < rows; r++) {
      const cuts = [0];
      let u = rng() * 0.25;
      while (u < 1) { cuts.push(u); u += 0.18 + rng() * 0.22; }
      cuts.push(1);
      rowBricks.push(cuts.filter((c, i, a) => i === 0 || c - a[i - 1] > 0.05).map((c) => ({ c, col: pal[Math.floor(rng() * pal.length)] })));
    }
    const height = new Float32Array(S * S);
    const c = paintPixels(S, (x, y) => {
      const v = (y / S) * rows, r = Math.floor(v), fv = v - r;
      const u = x / S;
      const bricks = rowBricks[r];
      let bi = 0;
      for (let i = 0; i < bricks.length - 1; i++) if (u >= bricks[i].c) bi = i;
      const u0 = bricks[bi].c, u1 = bricks[bi + 1] ? bricks[bi + 1].c : 1;
      const fu = (u - u0) / (u1 - u0);
      const ex = Math.min(fu, 1 - fu) * (u1 - u0) * rows;
      const ey = Math.min(fv, 1 - fv);
      const e = Math.min(ex, ey);
      const stone = smoothstep(0.03, 0.08, e);
      const dome = smoothstep(0.03, 0.3, e);
      const n = fb(x / S * 16, y / S * 16);
      height[y * S + x] = stone * (0.6 + dome * 0.4) + n * 0.15;
      const base = bricks[(bi) % bricks.length].col;
      const col = mix3(grout, base, stone);
      const sh = 0.75 + dome * 0.3 + (n - 0.5) * 0.3;
      return [col[0] * sh, col[1] * sh, col[2] * sh];
    });
    return { c, height, S };
  },
  stoneWall() { return toTexture(memo('stoneWall', () => gens._stoneWallData()).c); },
  stoneWallNormal() { const { height, S } = memo('stoneWall', () => gens._stoneWallData()); return normalFromHeight(height, S, 3); },

  bark() {
    const S = 256;
    const fb = makeFbm(131, 4, 8);
    const a = hexToRgb('#5a3b24'), b = hexToRgb('#7c5536'), dk = hexToRgb('#382314');
    const c = paintPixels(S, (x, y) => {
      const u = x / S, v = y / S;
      const n = fb(u * 8, v * 2);
      const ridge = Math.abs(Math.sin((u * 14 + n * 2.2) * Math.PI));
      let col = mix3(dk, a, smoothstep(0.05, 0.5, ridge));
      col = mix3(col, b, smoothstep(0.6, 1, ridge) * 0.7);
      return col;
    });
    return toTexture(c);
  },

  leaves() {
    // dense painterly leaf clusters (opaque) for canopy blobs
    const S = 512;
    const c = makeCanvas(S);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#3e7a2c';
    ctx.fillRect(0, 0, S, S);
    const rng = mulberry32(141);
    const cols = ['#2f6523', '#3f8030', '#4f9538', '#63a843', '#77b84e', '#8fc85a', '#366f27'];
    for (let i = 0; i < 4200; i++) {
      const x = rng() * S, y = rng() * S;
      const r = 5 + rng() * 9;
      const a = rng() * Math.PI * 2;
      const shade = Math.min(cols.length - 1, Math.floor(rng() * cols.length));
      for (const ox of [0, -S, S]) for (const oy of [0, -S, S]) {
        if ((ox && x > 20 && x < S - 20) || (oy && y > 20 && y < S - 20)) continue;
        ctx.save();
        ctx.translate(x + ox, y + oy); ctx.rotate(a);
        ctx.fillStyle = cols[shade];
        ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(20,50,15,0.35)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(-r, 0); ctx.lineTo(r, 0); ctx.stroke();
        ctx.restore();
      }
    }
    return toTexture(c);
  },

  leafCard() {
    // alpha leaf cluster for fringe cards
    const S = 256;
    const c = makeCanvas(S);
    const ctx = c.getContext('2d');
    const rng = mulberry32(151);
    const cols = ['#3f8030', '#4f9538', '#63a843', '#77b84e', '#8fc85a'];
    for (let i = 0; i < 260; i++) {
      const ang = rng() * Math.PI * 2, rad = Math.pow(rng(), 0.7) * S * 0.42;
      const x = S / 2 + Math.cos(ang) * rad, y = S / 2 + Math.sin(ang) * rad;
      const r = 7 + rng() * 9;
      ctx.save(); ctx.translate(x, y); ctx.rotate(rng() * 6.28);
      ctx.fillStyle = cols[Math.floor(rng() * cols.length)];
      ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.48, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    return toTexture(c, { repeat: false });
  },

  grassBlades() {
    const W = 128, H = 128;
    const c = makeCanvas(W, H);
    const ctx = c.getContext('2d');
    const rng = mulberry32(161);
    for (let i = 0; i < 26; i++) {
      const x = 10 + rng() * (W - 20), h = H * (0.45 + rng() * 0.55), bend = (rng() - 0.5) * 30, w = 3 + rng() * 4;
      const g = ctx.createLinearGradient(0, H, 0, H - h);
      g.addColorStop(0, '#2f6a22'); g.addColorStop(0.5, '#5fa23c'); g.addColorStop(1, '#a8d86a');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x - w / 2, H);
      ctx.quadraticCurveTo(x + bend * 0.3, H - h * 0.5, x + bend, H - h);
      ctx.quadraticCurveTo(x + bend * 0.3 + w * 0.3, H - h * 0.5, x + w / 2, H);
      ctx.fill();
    }
    return toTexture(c, { repeat: false });
  },

  flowers() {
    const W = 128, H = 128;
    const c = makeCanvas(W, H);
    const ctx = c.getContext('2d');
    const rng = mulberry32(171);
    for (let i = 0; i < 9; i++) {
      const x = 14 + rng() * (W - 28), h = 40 + rng() * 70;
      ctx.strokeStyle = '#3f7d2a'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(x, H); ctx.quadraticCurveTo(x + (rng() - 0.5) * 10, H - h / 2, x, H - h); ctx.stroke();
      const cols = ['#ffffff', '#ffe25a', '#ff8fb4', '#b98cff', '#ff6b5a'];
      const col = cols[Math.floor(rng() * cols.length)];
      ctx.fillStyle = col;
      for (let p = 0; p < 5; p++) {
        const a = (p / 5) * Math.PI * 2;
        ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * 5, H - h + Math.sin(a) * 5, 5, 3.2, a, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = '#ffcc33';
      ctx.beginPath(); ctx.arc(x, H - h, 3, 0, Math.PI * 2); ctx.fill();
    }
    return toTexture(c, { repeat: false });
  },

  waterNormal() {
    const S = 256;
    const fb = makeFbm(181, 5, 4);
    const h = new Float32Array(S * S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) h[y * S + x] = fb((x / S) * 4, (y / S) * 4);
    return normalFromHeight(h, S, 6);
  },

  cloud() {
    const S = 256;
    const c = makeCanvas(S);
    const ctx = c.getContext('2d');
    const rng = mulberry32(191);
    for (let i = 0; i < 26; i++) {
      const x = S * (0.2 + rng() * 0.6), y = S * (0.4 + rng() * 0.25), r = S * (0.08 + rng() * 0.14);
      const g = ctx.createRadialGradient(x, y - r * 0.2, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.95)');
      g.addColorStop(0.6, 'rgba(250,250,255,0.6)');
      g.addColorStop(1, 'rgba(240,245,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    return toTexture(c, { repeat: false });
  },

  glow() {
    const S = 128;
    const c = makeCanvas(S);
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.6)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
    return toTexture(c, { repeat: false });
  },

  ring() {
    const S = 256;
    const c = makeCanvas(S);
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(S / 2, S / 2, S * 0.28, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
    return toTexture(c, { repeat: false });
  },

  spark() {
    const S = 64;
    const c = makeCanvas(S);
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.15, 'rgba(255,255,230,0.9)');
    g.addColorStop(0.4, 'rgba(255,230,160,0.25)');
    g.addColorStop(1, 'rgba(255,200,100,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(S / 2, 2); ctx.lineTo(S / 2, S - 2); ctx.moveTo(2, S / 2); ctx.lineTo(S - 2, S / 2); ctx.stroke();
    return toTexture(c, { repeat: false });
  },

  fabric() {
    const S = 256;
    const n = makeNoise2D(201);
    const c = paintPixels(S, (x, y) => {
      const w = ((x % 4) < 2) !== ((y % 4) < 2) ? 1 : 0.92;
      const v = 225 * w + (n(x * 0.2, y * 0.2) - 0.5) * 20;
      return [v, v, v];
    });
    return toTexture(c);
  },

  metal() {
    const S = 256;
    const fb = makeFbm(211, 4, 4);
    const c = paintPixels(S, (x, y) => {
      const n = fb((x / S) * 4, (y / S) * 4);
      const brushed = (Math.random() - 0.5) * 16;
      const v = 200 + n * 40 + brushed;
      return [v, v, v];
    });
    return toTexture(c);
  },
};

export function tex(name) {
  if (!cache.has(name)) {
    if (!gens[name]) throw new Error('Unknown texture ' + name);
    cache.set(name, gens[name]());
  }
  return cache.get(name);
}

// Get a clone of a cached texture with its own repeat values
export function texRepeat(name, rx, ry = rx) {
  const key = `${name}@${rx}x${ry}`;
  if (!cache.has(key)) {
    const t = tex(name).clone();
    t.repeat.set(rx, ry);
    t.needsUpdate = true;
    cache.set(key, t);
  }
  return cache.get(key);
}

// Canvas helper for UI or decals
export { makeCanvas, toTexture };

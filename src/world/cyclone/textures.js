// Painterly canvas textures for Cyclone Hill / Forest of Mist (all generated in code, cached per name).
// Ground textures are tileable (periodic fbm / voronoi); foliage cards are alpha-cut RGBA canvases.
import { makeFbm, mulberry32, clamp, smoothstep } from '../../core/utils.js';
import { makeCanvas, toTexture, normalFromHeight, voronoiField, paintPixels, hexToRgb, mix3 } from '../../core/textures.js';

const cache = new Map();
const data = new Map();
const once = (key, fn) => { if (!cache.has(key)) cache.set(key, fn()); return cache.get(key); };
const onceData = (key, fn) => { if (!data.has(key)) data.set(key, fn()); return data.get(key); };
const TAU = Math.PI * 2;

// draw a stroke on a tileable canvas (repeats across the edges)
function wrapDraw(S, x, y, pad, fn) {
  for (const ox of [0, -S, S]) for (const oy of [0, -S, S]) {
    if (ox && x > pad && x < S - pad) continue;
    if (oy && y > pad && y < S - pad) continue;
    fn(x + ox, y + oy);
  }
}

// ------------------------------------------------------------------ ground
// mossy olive forest floor with fallen orange leaves (Forest of Mist)
export const forestFloorTex = () => once('forestFloor', () => {
  const S = 512, P = 6;
  const fb = makeFbm(301, 5, P), fb2 = makeFbm(302, 4, P * 2);
  const dark = hexToRgb('#4d6a26'), base = hexToRgb('#7a8f34'), light = hexToRgb('#a7b24a'), brown = hexToRgb('#7a6230');
  const c = paintPixels(S, (x, y) => {
    const u = x / S * P, v = y / S * P;
    const n = fb(u, v), m = fb2(u * 1.1 + 3, v * 1.1);
    let col = mix3(dark, base, smoothstep(0.28, 0.55, n));
    col = mix3(col, light, smoothstep(0.58, 0.82, n) * 0.75);
    col = mix3(col, brown, smoothstep(0.55, 0.75, m) * 0.55);
    const g = (Math.random() - 0.5) * 10;
    return [col[0] + g, col[1] + g, col[2] + g * 0.4];
  });
  const ctx = c.getContext('2d');
  const rng = mulberry32(303);
  // grass strokes
  for (let i = 0; i < 3800; i++) {
    const x = rng() * S, y = rng() * S, len = 3 + rng() * 6, a = -Math.PI / 2 + (rng() - 0.5) * 1.1;
    ctx.strokeStyle = rng() > 0.45 ? `rgba(190,205,95,${0.18 + rng() * 0.25})` : `rgba(40,62,18,${0.18 + rng() * 0.22})`;
    ctx.lineWidth = 0.7 + rng() * 0.9;
    wrapDraw(S, x, y, 10, (px, py) => { ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(a) * len, py + Math.sin(a) * len); ctx.stroke(); });
  }
  // fallen leaves (orange / rust / yellow)
  const leafCols = ['#d8742a', '#c2552a', '#e39a3a', '#b8452a', '#d6b03e'];
  for (let i = 0; i < 520; i++) {
    const x = rng() * S, y = rng() * S, s = 2 + rng() * 3.2, a = rng() * TAU;
    ctx.fillStyle = leafCols[(rng() * leafCols.length) | 0];
    ctx.globalAlpha = 0.55 + rng() * 0.4;
    wrapDraw(S, x, y, 8, (px, py) => { ctx.beginPath(); ctx.ellipse(px, py, s, s * 0.55, a, 0, TAU); ctx.fill(); });
  }
  ctx.globalAlpha = 1;
  return toTexture(c);
});

// bright meadow grass for the raised glade
export const meadowTex = () => once('meadow', () => {
  const S = 512, P = 6;
  const fb = makeFbm(311, 5, P), fb2 = makeFbm(312, 4, P * 2);
  const dark = hexToRgb('#3f8a2e'), base = hexToRgb('#6cb83e'), light = hexToRgb('#a6d85a'), yel = hexToRgb('#c9d65a');
  const c = paintPixels(S, (x, y) => {
    const u = x / S * P, v = y / S * P;
    const n = fb(u, v), m = fb2(u, v);
    let col = mix3(dark, base, smoothstep(0.25, 0.52, n));
    col = mix3(col, light, smoothstep(0.55, 0.8, n) * 0.8);
    col = mix3(col, yel, smoothstep(0.64, 0.82, m) * 0.4);
    const g = (Math.random() - 0.5) * 12;
    return [col[0] + g, col[1] + g, col[2] + g * 0.4];
  });
  const ctx = c.getContext('2d');
  const rng = mulberry32(313);
  for (let i = 0; i < 4200; i++) {
    const x = rng() * S, y = rng() * S, len = 3 + rng() * 7, a = -Math.PI / 2 + (rng() - 0.5) * 0.9;
    ctx.strokeStyle = rng() > 0.5 ? `rgba(190,235,110,${0.2 + rng() * 0.3})` : `rgba(30,80,20,${0.18 + rng() * 0.2})`;
    ctx.lineWidth = 0.8 + rng();
    wrapDraw(S, x, y, 10, (px, py) => { ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(a) * len, py + Math.sin(a) * len); ctx.stroke(); });
  }
  return toTexture(c);
});

// cracked orange clay plates (Cyclone Hill ground)
const clayData = () => onceData('clay', () => {
  const S = 512, P = 5;
  const vor = voronoiField(S, 7, 321, 0.9);
  const fb = makeFbm(322, 4, P), fb2 = makeFbm(323, 3, P * 3);
  const height = new Float32Array(S * S);
  const col = new Array(S * S);
  const a = hexToRgb('#c9793a'), b = hexToRgb('#e0a052'), c2 = hexToRgb('#b8602e'), crack = hexToRgb('#7a3a1c');
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const k = y * S + x, u = x / S * P, v = y / S * P;
    const edge = vor.f2[k] - vor.f1[k];                  // 0 at the crack
    const n = fb(u, v), m = fb2(u, v);
    const cr = 1 - smoothstep(0.03, 0.11 + m * 0.05, edge);
    let cc = mix3(a, b, clamp(vor.id[k] * 0.8 + (n - 0.5) * 0.9, 0, 1));
    cc = mix3(cc, c2, smoothstep(0.55, 0.8, m) * 0.5);
    // plates are slightly lighter towards their middle (pillowy), darker at the rim
    const pillow = smoothstep(0.02, 0.4, edge);
    cc = mix3(mix3(cc, crack, 0.25), cc, pillow);
    cc = mix3(cc, crack, cr * 0.85);
    col[k] = cc;
    height[k] = pillow * 0.8 + n * 0.3 - cr * 0.6;
  }
  return { S, height, col };
});
export const clayTex = () => once('clay', () => {
  const d = clayData();
  const c = paintPixels(d.S, (x, y) => { const cc = d.col[y * d.S + x]; const g = (Math.random() - 0.5) * 8; return [cc[0] + g, cc[1] + g, cc[2] + g]; });
  return toTexture(c);
});
export const clayNormalTex = () => once('clayN', () => normalFromHeight(clayData().height, clayData().S, 2.2));

// swirling orange-brown rock strata (tier walls, gorges)
const swirlData = () => onceData('swirl', () => {
  const S = 512, P = 4;
  const warp = makeFbm(331, 4, P), warp2 = makeFbm(332, 4, P), fb = makeFbm(333, 5, P * 2);
  const height = new Float32Array(S * S);
  const col = new Array(S * S);
  const dark = hexToRgb('#7a3a1e'), mid = hexToRgb('#c0682f'), light = hexToRgb('#dd9450'), cream = hexToRgb('#efbd78');
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const k = y * S + x, u = x / S * P, v = y / S * P;
    const wx = warp(u, v) - 0.5, wy = warp2(u + 5.2, v + 1.3) - 0.5;
    // strata: horizontal bands bent by a domain warp -> flowing wood-grain like swirl lines on an orange base
    const ph = (v + wy * 2.4 + wx * 1.2) * TAU * 2 + Math.sin((u + wx) * TAU) * 1.4;
    const band = Math.sin(ph), fine = Math.sin(ph * 3.0 + wx * 4);
    const n = fb(u, v);
    let cc = mix3(mid, light, smoothstep(0.3, 0.75, n));
    cc = mix3(cc, cream, smoothstep(0.55, 0.95, band) * 0.35);
    const line = 1 - smoothstep(0.0, 0.16, Math.abs(band));
    const line2 = (1 - smoothstep(0.0, 0.1, Math.abs(fine))) * 0.35;
    cc = mix3(cc, dark, Math.max(line * 0.75, line2));
    cc = mix3(cc, dark, smoothstep(0.7, 0.9, n) * 0.2);
    col[k] = cc;
    height[k] = n * 0.6 - line * 0.5;
  }
  return { S, height, col };
});
export const swirlRockTex = () => once('swirl', () => {
  const d = swirlData();
  const c = paintPixels(d.S, (x, y) => { const cc = d.col[y * d.S + x]; const g = (Math.random() - 0.5) * 7; return [cc[0] + g, cc[1] + g, cc[2] + g]; });
  return toTexture(c);
});
export const swirlRockNormalTex = () => once('swirlN', () => normalFromHeight(swirlData().height, swirlData().S, 1.6));

// brown earth cliff with mossy streaks (forest valley walls)
export const earthCliffTex = () => once('earthCliff', () => {
  const S = 512, P = 4;
  const warp = makeFbm(341, 4, P), fb = makeFbm(342, 5, P * 2), moss = makeFbm(343, 4, P);
  const dark = hexToRgb('#4a3322'), mid = hexToRgb('#7a5534'), light = hexToRgb('#a47a4a'), green = hexToRgb('#5a7a2c');
  const c = paintPixels(S, (x, y) => {
    const u = x / S * P, v = y / S * P;
    const w = warp(u, v) - 0.5;
    const band = Math.sin((v + w * 1.8) * TAU * 3) * 0.5 + 0.5;
    const n = fb(u, v);
    let cc = mix3(dark, mid, smoothstep(0.2, 0.6, n * 0.7 + band * 0.4));
    cc = mix3(cc, light, smoothstep(0.75, 0.95, band) * 0.5);
    cc = mix3(cc, green, smoothstep(0.58, 0.78, moss(u, v)) * 0.65);
    const g = (Math.random() - 0.5) * 9;
    return [cc[0] + g, cc[1] + g, cc[2] + g];
  });
  return toTexture(c);
});

// packed trail dirt with pebbles
export const trailTex = () => once('trail', () => {
  const S = 512, P = 6;
  const fb = makeFbm(351, 5, P), fb2 = makeFbm(352, 3, P * 2);
  const dark = hexToRgb('#6e4a2a'), base = hexToRgb('#9a6c3e'), light = hexToRgb('#bf8e56');
  const c = paintPixels(S, (x, y) => {
    const u = x / S * P, v = y / S * P;
    const n = fb(u, v), m = fb2(u, v);
    let cc = mix3(dark, base, smoothstep(0.3, 0.6, n));
    cc = mix3(cc, light, smoothstep(0.6, 0.85, m) * 0.6);
    const g = (Math.random() - 0.5) * 10;
    return [cc[0] + g, cc[1] + g, cc[2] + g];
  });
  const ctx = c.getContext('2d');
  const rng = mulberry32(353);
  for (let i = 0; i < 900; i++) {
    const x = rng() * S, y = rng() * S, r = 1 + rng() * 2.6, l = 150 + rng() * 70;
    wrapDraw(S, x, y, 6, (px, py) => {
      ctx.fillStyle = `rgba(40,25,12,0.35)`; ctx.beginPath(); ctx.ellipse(px + 0.8, py + 0.8, r, r * 0.8, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = `rgb(${l},${l * 0.85 | 0},${l * 0.68 | 0})`; ctx.beginPath(); ctx.ellipse(px, py, r, r * 0.8, 0, 0, TAU); ctx.fill();
    });
  }
  return toTexture(c);
});

// wet bank mud / sand near the water
export const mudTex = () => once('mud', () => {
  const S = 256, P = 4;
  const fb = makeFbm(361, 5, P);
  const a = hexToRgb('#5a4a34'), b = hexToRgb('#8a7a56'), g2 = hexToRgb('#4a5a36');
  const c = paintPixels(S, (x, y) => {
    const n = fb(x / S * P, y / S * P);
    let cc = mix3(a, b, smoothstep(0.35, 0.7, n));
    cc = mix3(cc, g2, smoothstep(0.62, 0.8, n) * 0.4);
    const g = (Math.random() - 0.5) * 8;
    return [cc[0] + g, cc[1] + g, cc[2] + g];
  });
  return toTexture(c);
});

// ------------------------------------------------------------------ foliage cards (RGBA, alpha-tested)
function leafShape(ctx, x, y, len, wid, a) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(a);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(wid, -len * 0.45, 0, -len);
  ctx.quadraticCurveTo(-wid, -len * 0.45, 0, 0);
  ctx.fill();
  ctx.restore();
}

// dense clump of painted leaves for broadleaf canopies; palette = [shadow, mid, light, highlight]
function clumpCanvas(seed, palette, S = 512, count = 520) {
  const c = makeCanvas(S);
  const ctx = c.getContext('2d');
  const rng = mulberry32(seed);
  const cols = palette.map((h) => hexToRgb(h));
  // leaves are spread over a soft blob; darker at the bottom, lighter at the top
  for (let i = 0; i < count; i++) {
    const ang = rng() * TAU, rr = Math.sqrt(rng()) * S * 0.44;
    const x = S / 2 + Math.cos(ang) * rr, y = S / 2 + Math.sin(ang) * rr * 0.86;
    const tTop = 1 - y / S;                          // 0 bottom .. 1 top
    const depth = i / count;                         // later leaves are on top -> lighter
    const k = clamp(tTop * 0.55 + depth * 0.6 + (rng() - 0.5) * 0.3, 0, 1);
    const ci = k < 0.3 ? 0 : k < 0.6 ? 1 : k < 0.85 ? 2 : 3;
    const cc = mix3(cols[ci], cols[Math.min(3, ci + 1)], rng() * 0.5);
    ctx.fillStyle = `rgb(${cc[0] | 0},${cc[1] | 0},${cc[2] | 0})`;
    const len = S * (0.05 + rng() * 0.045), wid = len * (0.38 + rng() * 0.15);
    leafShape(ctx, x, y, len, wid, ang + Math.PI / 2 + (rng() - 0.5) * 1.6);
    // midrib
    if (rng() < 0.35) {
      ctx.strokeStyle = `rgba(20,40,10,0.35)`; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(ang) * len * 0.4, y + Math.sin(ang) * len * 0.4); ctx.stroke();
    }
  }
  return c;
}
export const leafClumpTex = () => once('leafClump', () => toTexture(clumpCanvas(401, ['#2f5a1a', '#5b8a24', '#93b834', '#cfe06a']), { repeat: false }));
export const leafClumpDarkTex = () => once('leafClumpDark', () => toTexture(clumpCanvas(402, ['#23461a', '#3f6e24', '#6f9a34', '#a6c450']), { repeat: false }));
export const blossomClumpTex = () => once('blossomClump', () => toTexture(clumpCanvas(403, ['#b0507a', '#e07aa0', '#f7a8c4', '#ffe0ec'], 512, 640), { repeat: false }));
export const autumnClumpTex = () => once('autumnClump', () => toTexture(clumpCanvas(404, ['#7a4a1a', '#b8762a', '#dca23a', '#f2d06a']), { repeat: false }));

// bamboo leaf spray: slender leaves fanning out from a point near the bottom centre
export const bambooLeafTex = () => once('bambooLeaf', () => {
  const S = 256;
  const c = makeCanvas(S);
  const ctx = c.getContext('2d');
  const rng = mulberry32(411);
  const cols = ['#3f7a22', '#5a9a2a', '#7fbf3a', '#a8d65a'];
  for (let i = 0; i < 46; i++) {
    const a = -Math.PI / 2 + (rng() - 0.5) * 2.6;
    const len = S * (0.25 + rng() * 0.28), wid = len * 0.16;
    const ox = S / 2 + (rng() - 0.5) * S * 0.3, oy = S * (0.35 + rng() * 0.55);
    ctx.fillStyle = cols[(rng() * cols.length) | 0];
    leafShape(ctx, ox, oy, len, wid, a + Math.PI / 2 + Math.PI);
  }
  return toTexture(c, { repeat: false });
});

// fern frond fan
export const fernTex = () => once('fern', () => {
  const S = 256;
  const c = makeCanvas(S);
  const ctx = c.getContext('2d');
  const rng = mulberry32(421);
  ctx.lineCap = 'round';
  for (let f = 0; f < 7; f++) {
    const a = -Math.PI / 2 + (f - 3) * 0.36 + (rng() - 0.5) * 0.15;
    const len = S * (0.38 + rng() * 0.1);
    const x0 = S / 2, y0 = S * 0.98;
    ctx.strokeStyle = '#3d6a1e'; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(x0 + Math.cos(a) * len * 0.5, y0 + Math.sin(a) * len * 0.62, x0 + Math.cos(a) * len, y0 + Math.sin(a) * len); ctx.stroke();
    for (let i = 1; i < 14; i++) {
      const t = i / 14;
      const px = x0 + Math.cos(a) * len * t, py = y0 + Math.sin(a) * len * t;
      const pl = S * 0.09 * (1 - t * 0.7);
      ctx.fillStyle = i % 2 ? '#5f9a2c' : '#79b43a';
      for (const s of [-1, 1]) leafShape(ctx, px, py, pl, pl * 0.3, a + Math.PI / 2 + s * 1.1 + Math.PI);
    }
  }
  return toTexture(c, { repeat: false });
});

// broad glossy herb leaves (healing herbs)
export const herbLeafTex = () => once('herbLeaf', () => {
  const S = 128;
  const c = makeCanvas(S);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, S, 0, 0);
  g.addColorStop(0, '#1f6a3a'); g.addColorStop(0.6, '#3fae5a'); g.addColorStop(1, '#9ff0a0');
  ctx.fillStyle = g;
  leafShape(ctx, S / 2, S * 0.98, S * 0.94, S * 0.36, 0);
  ctx.strokeStyle = 'rgba(210,255,200,0.55)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(S / 2, S * 0.96); ctx.lineTo(S / 2, S * 0.12); ctx.stroke();
  ctx.lineWidth = 1;
  for (let i = 1; i < 6; i++) {
    const y = S * (0.9 - i * 0.14);
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(S / 2, y); ctx.lineTo(S / 2 + s * S * 0.18, y - S * 0.08); ctx.stroke(); }
  }
  return toTexture(c, { repeat: false });
});

// dark bark with vertical fibres
export const barkTex = () => once('bark', () => {
  const S = 256, P = 4;
  const fb = makeFbm(431, 4, P);
  const a = hexToRgb('#3a2418'), b = hexToRgb('#6a4128'), l = hexToRgb('#8a5a36');
  const c = paintPixels(S, (x, y) => {
    const u = x / S * P, v = y / S * P;
    const fib = Math.sin((u + fb(u * 0.5, v * 0.15) * 1.5) * TAU * 3) * 0.5 + 0.5;
    const n = fb(u, v * 0.3);
    let cc = mix3(a, b, smoothstep(0.2, 0.7, fib * 0.6 + n * 0.5));
    cc = mix3(cc, l, smoothstep(0.85, 1, fib) * 0.5);
    const g = (Math.random() - 0.5) * 10;
    return [cc[0] + g, cc[1] + g, cc[2] + g];
  });
  return toTexture(c);
});

// ------------------------------------------------------------------ water & air
// vertical white streaks for waterfall sheets (tiles vertically)
export const waterfallTex = () => once('waterfall', () => {
  const W = 128, H = 256;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0)'; ctx.fillRect(0, 0, W, H);
  const rng = mulberry32(441);
  for (let i = 0; i < 260; i++) {
    const x = rng() * W, y = rng() * H, len = 30 + rng() * 120, w = 1 + rng() * 4;
    const a = 0.15 + rng() * 0.5;
    const g = ctx.createLinearGradient(0, y, 0, y + len);
    g.addColorStop(0, `rgba(255,255,255,0)`); g.addColorStop(0.3, `rgba(255,255,255,${a})`); g.addColorStop(1, `rgba(255,255,255,0)`);
    ctx.fillStyle = g;
    for (const oy of [0, -H, H]) for (const ox of [0, -W, W]) ctx.fillRect(x - w / 2 + ox, y + oy, w, len);
  }
  const t = toTexture(c, { srgb: true });
  return t;
});

// soft cloudy puff for mist billboards
export const mistPuffTex = () => once('mistPuff', () => {
  const S = 128;
  const fb = makeFbm(451, 4);
  const c = paintPixels(S, (x, y) => {
    const dx = (x - S / 2) / (S / 2), dy = (y - S / 2) / (S / 2);
    const r = Math.hypot(dx, dy);
    const n = fb(x / S * 3 + 1, y / S * 3 + 1);
    const a = smoothstep(1.0, 0.25, r + (n - 0.5) * 0.5) * (0.55 + n * 0.45);
    return [255, 255, 255, a * 255];
  });
  return toTexture(c, { repeat: false });
});

// round glow sprite (herbs, fireflies, torches)
export const glowDotTex = () => once('glowDot', () => {
  const S = 64;
  const c = makeCanvas(S);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  return toTexture(c, { repeat: false });
});

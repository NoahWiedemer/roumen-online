// Tower of Isel — procedural textures: sea-green masonry with moss, warm wooden parquet, a red carpet with gold
// border, the tower's banner, stained glass, daylight windows, the glowing rune circle, the great clock's dial and book
// spines.
import { makeCanvas, toTexture, memo, normalFromHeight, paintPixels, hexToRgb, mix3 } from '../../core/textures.js';
import { makeFbm, mulberry32, smoothstep, clamp } from '../../core/utils.js';

const once = (key, fn) => () => memo('isel:' + key, fn);

// ---- sea-green / blue-grey stone blocks, irregular courses, moss creeping out of the joints
const stoneData = once('stone', () => {
  const S = 512, rows = 6;
  const rng = mulberry32(9101);
  const pal = ['#7f9a98', '#6f8a8c', '#8aa3a0', '#748f8a', '#91a7a2', '#687f83', '#809a92'].map(hexToRgb);
  const grout = hexToRgb('#34403f'), moss = hexToRgb('#5f7a36');
  const fb = makeFbm(9102, 4, 16), fm = makeFbm(9103, 3, 8);
  const rowBricks = [];
  for (let r = 0; r < rows; r++) {
    const cuts = [0];
    let u = rng() * 0.2;
    while (u < 1) { cuts.push(u); u += 0.22 + rng() * 0.26; }
    cuts.push(1);
    rowBricks.push(cuts.filter((c, i, a) => i === 0 || c - a[i - 1] > 0.06).map((c) => ({ c, col: pal[Math.floor(rng() * pal.length)], k: 0.9 + rng() * 0.2 })));
  }
  const height = new Float32Array(S * S);
  const c = paintPixels(S, (x, y) => {
    const v = (y / S) * rows, r = Math.floor(v), fv = v - r;
    const u = x / S, bricks = rowBricks[r];
    let bi = 0;
    for (let i = 0; i < bricks.length - 1; i++) if (u >= bricks[i].c) bi = i;
    const u0 = bricks[bi].c, u1 = bricks[bi + 1] ? bricks[bi + 1].c : 1;
    const fu = (u - u0) / (u1 - u0);
    const e = Math.min(Math.min(fu, 1 - fu) * (u1 - u0) * rows, Math.min(fv, 1 - fv));
    const stone = smoothstep(0.025, 0.07, e), dome = smoothstep(0.03, 0.35, e);
    const n = fb(x / S * 16, y / S * 16);
    height[y * S + x] = stone * (0.55 + dome * 0.45) + n * 0.18;
    const b = bricks[bi];
    let col = mix3(grout, b.col, stone);
    // moss: in the joints and on the lower edges of the blocks
    const m = smoothstep(0.55, 0.75, fm(x / S * 8, y / S * 8)) * (1 - stone * 0.75 + (fv > 0.7 ? 0.35 : 0));
    col = mix3(col, moss, clamp(m, 0, 0.85));
    const sh = (0.72 + dome * 0.3 + (n - 0.5) * 0.35) * b.k;
    return [col[0] * sh, col[1] * sh, col[2] * sh];
  });
  return { c, height, S };
});
export const stoneTex = once('stoneTex', () => toTexture(stoneData().c));
export const stoneNormal = once('stoneN', () => normalFromHeight(stoneData().height, stoneData().S, 3.2));

// ---- wooden parquet: short planks in a brick bond, warm browns, dark seams
const parquetData = once('parquet', () => {
  const S = 512, rows = 8;
  const rng = mulberry32(9111);
  const pal = ['#8a5a34', '#9a6a3c', '#7a4c2a', '#a8743f', '#8e5e36', '#b07a44'].map(hexToRgb);
  const seam = hexToRgb('#2e1a0e');
  const fb = makeFbm(9112, 3, 32);
  const cols = [];
  for (let r = 0; r < rows; r++) { const row = []; for (let i = 0; i < 4; i++) row.push({ col: pal[Math.floor(rng() * pal.length)], k: 0.9 + rng() * 0.2 }); cols.push(row); }
  const height = new Float32Array(S * S);
  const c = paintPixels(S, (x, y) => {
    const v = (y / S) * rows, r = Math.floor(v), fv = v - r;
    let u = (x / S) * 4 + (r % 2 ? 0.5 : 0);
    const i = Math.floor(u) % 4, fu = u - Math.floor(u);
    const e = Math.min(Math.min(fu, 1 - fu) * 4 / rows * 2, Math.min(fv, 1 - fv));
    const plank = smoothstep(0.02, 0.05, e);
    const grain = fb(x / S * 4 + r * 3.1, y / S * 64);
    height[y * S + x] = plank * (0.8 + grain * 0.2);
    const p = cols[r][i];
    const col = mix3(seam, p.col, plank);
    const sh = (0.8 + (grain - 0.5) * 0.5) * p.k;
    return [col[0] * sh, col[1] * sh, col[2] * sh];
  });
  return { c, height, S };
});
export const parquetTex = once('parquetTex', () => toTexture(parquetData().c));
export const parquetNormal = once('parquetN', () => normalFromHeight(parquetData().height, parquetData().S, 2));

// ---- red carpet, gold border along the long edges (u across 0..1, v along, tiles along v)
export const carpetTex = once('carpet', () => {
  const W = 256, H = 256;
  const fb = makeFbm(9121, 3, 8);
  const c = paintPixels(W, (x, y) => {
    const u = x / W, v = y / H;
    const edge = Math.min(u, 1 - u);
    const n = fb(u * 8, v * 8);
    let col = [150, 26, 38];
    // diamond pattern in the field
    const du = Math.abs(((u * 4) % 1) - 0.5) + Math.abs(((v * 2) % 1) - 0.5);
    if (du < 0.18) col = [196, 150, 60]; else if (du < 0.24) col = [96, 14, 26];
    if (edge < 0.14) col = [210, 160, 64];
    if (edge < 0.1) col = [120, 18, 30];
    if (edge < 0.06) col = [214, 168, 70];
    const s = 0.85 + n * 0.3;
    return [col[0] * s, col[1] * s, col[2] * s];
  });
  return toTexture(c);
});

// ---- banner: deep indigo with a gold tower emblem, swallow-tail bottom (alpha)
export const bannerTex = once('banner', () => {
  const W = 256, H = 512, c = makeCanvas(W, H), g = c.getContext('2d');
  g.clearRect(0, 0, W, H);
  g.beginPath(); g.moveTo(0, 0); g.lineTo(W, 0); g.lineTo(W, H); g.lineTo(W / 2, H * 0.84); g.lineTo(0, H); g.closePath();
  const grd = g.createLinearGradient(0, 0, W, 0);
  grd.addColorStop(0, '#2a1650'); grd.addColorStop(0.5, '#43247a'); grd.addColorStop(1, '#2a1650');
  g.fillStyle = grd; g.fill();
  g.strokeStyle = '#e2b24a'; g.lineWidth = 12; g.stroke();
  // emblem: the tower of Isel
  g.save(); g.translate(W / 2, H * 0.42); g.fillStyle = '#f0c75a'; g.strokeStyle = '#6a4a10'; g.lineWidth = 4;
  g.beginPath(); g.moveTo(-34, 90); g.lineTo(-24, -20); g.lineTo(-40, -20); g.lineTo(0, -110); g.lineTo(40, -20); g.lineTo(24, -20); g.lineTo(34, 90); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#43247a'; g.beginPath(); g.arc(0, 20, 12, Math.PI, 0); g.lineTo(12, 50); g.lineTo(-12, 50); g.closePath(); g.fill();
  g.beginPath(); g.arc(0, -40, 7, 0, Math.PI * 2); g.fill();
  g.restore();
  g.fillStyle = '#e2b24a'; for (let i = 0; i < 9; i++) g.fillRect(12 + i * 27, 22, 12, 12);
  const t = toTexture(c, { repeat: false });
  return t;
});

// ---- stained glass: leaded panes (for the throne room's great window), rounded top via alpha
export const stainedTex = once('stained', () => {
  const W = 256, H = 512, c = makeCanvas(W, H), g = c.getContext('2d');
  const rng = mulberry32(9131);
  const cols = ['#3a6ad8', '#d83a4a', '#f0c040', '#3ab070', '#8a4ad8', '#40b8d8', '#e8783a'];
  g.fillStyle = '#1a1420'; g.fillRect(0, 0, W, H);
  g.save();
  g.beginPath(); g.moveTo(0, H); g.lineTo(0, W / 2); g.arc(W / 2, W / 2, W / 2, Math.PI, 0); g.lineTo(W, H); g.closePath(); g.clip();
  for (let y = 0; y < H; y += 32) for (let x = 0; x < W; x += 32) {
    g.fillStyle = cols[Math.floor(rng() * cols.length)];
    g.beginPath(); g.moveTo(x + 3 + rng() * 4, y + 3); g.lineTo(x + 29, y + 3 + rng() * 4); g.lineTo(x + 29 - rng() * 4, y + 29); g.lineTo(x + 3, y + 29 - rng() * 4); g.closePath(); g.fill();
  }
  // a rose in the arch and a figure-like central lancet
  g.fillStyle = '#f6d060'; g.beginPath(); g.arc(W / 2, W / 2, 46, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#1a1420'; g.lineWidth = 6;
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; g.beginPath(); g.moveTo(W / 2, W / 2); g.lineTo(W / 2 + Math.cos(a) * 46, W / 2 + Math.sin(a) * 46); g.stroke(); }
  g.fillStyle = '#e8f0ff'; g.fillRect(W / 2 - 22, W * 0.9, 44, H - W * 0.9 - 30);
  g.restore();
  g.strokeStyle = '#1a1420'; g.lineWidth = 10;
  g.beginPath(); g.moveTo(5, H); g.lineTo(5, W / 2); g.arc(W / 2, W / 2, W / 2 - 5, Math.PI, 0); g.lineTo(W - 5, H); g.stroke();
  return toTexture(c, { repeat: false });
});

// ---- plain arched window with daylight (outer walls)
export const windowTex = once('window', () => {
  const W = 128, H = 256, c = makeCanvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#1a1c24'; g.fillRect(0, 0, W, H);
  g.save();
  g.beginPath(); g.moveTo(8, H - 6); g.lineTo(8, W / 2); g.arc(W / 2, W / 2, W / 2 - 8, Math.PI, 0); g.lineTo(W - 8, H - 6); g.closePath(); g.clip();
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, '#fff8e0'); grd.addColorStop(0.5, '#c8ecff'); grd.addColorStop(1, '#8ac8e8');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  g.restore();
  g.strokeStyle = '#2a2230'; g.lineWidth = 7;
  g.beginPath(); g.moveTo(W / 2, 20); g.lineTo(W / 2, H - 6); g.moveTo(8, H * 0.55); g.lineTo(W - 8, H * 0.55); g.stroke();
  return toTexture(c, { repeat: false });
});

// ---- glowing rune circle (alpha) for the sanctum floor
export const runeTex = once('rune', () => {
  const S = 512, c = makeCanvas(S), g = c.getContext('2d');
  g.translate(S / 2, S / 2);
  g.strokeStyle = '#ffffff'; g.fillStyle = '#ffffff';
  const ring = (r, w) => { g.lineWidth = w; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke(); };
  ring(240, 10); ring(212, 5); ring(120, 6); ring(70, 4);
  g.lineWidth = 5;
  for (let k = 0; k < 2; k++) { g.beginPath(); for (let i = 0; i <= 6; i++) { const a = (i / 6) * Math.PI * 2 + k * Math.PI / 6; const x = Math.cos(a) * 205, y = Math.sin(a) * 205; if (i) g.lineTo(x, y); else g.moveTo(x, y); } g.stroke(); }
  g.font = 'bold 26px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const glyphs = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ';
  for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; g.save(); g.rotate(a); g.fillText(glyphs[i], 0, -226); g.restore(); }
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.save(); g.rotate(a); g.fillText(glyphs[(i * 5) % 24], 0, -96); g.restore(); }
  return toTexture(c, { repeat: false });
});

// ---- the great clock's face: ivory dial, roman numerals, gold rim (hands are separate meshes)
export const clockTex = once('clock', () => {
  const S = 512, c = makeCanvas(S), g = c.getContext('2d');
  g.translate(S / 2, S / 2);
  const grd = g.createRadialGradient(0, 0, 20, 0, 0, 250);
  grd.addColorStop(0, '#fff6dc'); grd.addColorStop(0.8, '#ecd9a8'); grd.addColorStop(1, '#b89048');
  g.fillStyle = grd; g.beginPath(); g.arc(0, 0, 252, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#6a4a18'; g.lineWidth = 14; g.beginPath(); g.arc(0, 0, 244, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = '#e8b848'; g.lineWidth = 6; g.beginPath(); g.arc(0, 0, 232, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 3; g.strokeStyle = '#6a4a18'; g.beginPath(); g.arc(0, 0, 160, 0, Math.PI * 2); g.stroke();
  const num = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
  g.fillStyle = '#3a2410'; g.font = 'bold 44px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.save(); g.rotate(a); g.fillText(num[i], 0, -196); g.restore();
    for (let k = 1; k < 5; k++) { const b = a + (k / 60) * Math.PI * 2; g.fillRect(Math.sin(b) * 222 - 2, -Math.cos(b) * 222 - 2, 4, 4); }
  }
  // a sun-and-moon medallion in the middle
  g.fillStyle = '#e8b848'; g.beginPath(); g.arc(0, 0, 70, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#3a5aa8'; g.beginPath(); g.arc(0, 0, 58, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#f6e6a8'; g.beginPath(); g.arc(-12, -8, 34, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#3a5aa8'; g.beginPath(); g.arc(4, -16, 30, 0, Math.PI * 2); g.fill();
  return toTexture(c, { repeat: false });
});

// ---- book spines for shelves (rows of books in muted colours)
export const booksTex = once('books', () => {
  const W = 512, H = 128, c = makeCanvas(W, H), g = c.getContext('2d');
  const rng = mulberry32(9141);
  const cols = ['#6a2a2a', '#2a4a6a', '#2a5a3a', '#6a5a2a', '#4a2a5a', '#7a4a2a', '#3a3a3a', '#8a6a4a'];
  g.fillStyle = '#2a1a10'; g.fillRect(0, 0, W, H);
  let x = 0;
  while (x < W) {
    const w = 10 + rng() * 16, h = H * (0.7 + rng() * 0.28);
    g.fillStyle = cols[Math.floor(rng() * cols.length)];
    g.fillRect(x, H - h, w - 1.5, h);
    g.fillStyle = 'rgba(240,200,110,0.7)'; g.fillRect(x + 2, H - h + 8, w - 5, 3); g.fillRect(x + 2, H - 14, w - 5, 3);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + w - 4, H - h, 2.5, h);
    x += w;
  }
  return toTexture(c);
});


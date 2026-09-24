// Town-specific procedural canvas textures (signs, banners, window glass, awnings...)
// All art is drawn in code. Cached per name.
import * as THREE from 'three';
import { makeCanvas, toTexture } from '../../core/textures.js';
import { mulberry32, makeFbm } from '../../core/utils.js';

const cache = new Map();
function cached(name, fn) {
  if (!cache.has(name)) cache.set(name, fn());
  return cache.get(name);
}

const OUT = '#3a2213';

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function woodBoard(ctx, x, y, w, h, r, base = '#b77a45') {
  rr(ctx, x, y, w, h, r);
  ctx.fillStyle = base; ctx.fill();
  ctx.save(); ctx.clip();
  const rng = mulberry32(7);
  for (let i = 0; i < 26; i++) {
    ctx.strokeStyle = `rgba(80,40,15,${0.12 + rng() * 0.18})`;
    ctx.lineWidth = 1 + rng() * 2;
    const yy = y + rng() * h;
    ctx.beginPath(); ctx.moveTo(x, yy); ctx.bezierCurveTo(x + w * 0.3, yy + (rng() - 0.5) * 8, x + w * 0.7, yy + (rng() - 0.5) * 8, x + w, yy + (rng() - 0.5) * 6); ctx.stroke();
  }
  // plank seams
  ctx.strokeStyle = 'rgba(60,30,10,0.45)'; ctx.lineWidth = 3;
  for (let k = 1; k < 3; k++) { ctx.beginPath(); ctx.moveTo(x, y + (h * k) / 3); ctx.lineTo(x + w, y + (h * k) / 3); ctx.stroke(); }
  // light top
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, 'rgba(255,230,180,0.25)'); g.addColorStop(1, 'rgba(40,20,0,0.25)');
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  ctx.restore();
  rr(ctx, x, y, w, h, r);
  ctx.lineWidth = 9; ctx.strokeStyle = '#6b3d1c'; ctx.stroke();
  ctx.lineWidth = 3; ctx.strokeStyle = OUT; ctx.stroke();
  // nails
  ctx.fillStyle = '#e9d9a8';
  for (const [nx, ny] of [[x + 14, y + 14], [x + w - 14, y + 14], [x + 14, y + h - 14], [x + w - 14, y + h - 14]]) {
    ctx.beginPath(); ctx.arc(nx, ny, 4, 0, Math.PI * 2); ctx.fill();
  }
}

function sword(ctx, x, y, len, ang, blade = '#dfe8f2') {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  ctx.lineJoin = 'round';
  // blade
  ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(9, 0); ctx.lineTo(9, -len * 0.72); ctx.lineTo(0, -len * 0.84); ctx.lineTo(-9, -len * 0.72); ctx.closePath();
  ctx.fillStyle = blade; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = OUT; ctx.stroke();
  ctx.strokeStyle = 'rgba(120,140,170,0.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(0, -len * 0.75); ctx.stroke();
  // guard
  rr(ctx, -26, -2, 52, 12, 5); ctx.fillStyle = '#f2c14e'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = OUT; ctx.stroke();
  // grip
  rr(ctx, -6, 10, 12, len * 0.16, 3); ctx.fillStyle = '#7a3f1d'; ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 14 + len * 0.16, 9, 0, Math.PI * 2); ctx.fillStyle = '#f2c14e'; ctx.fill(); ctx.stroke();
  ctx.restore();
}

function star(ctx, x, y, r1, r2, n, rot = -Math.PI / 2) {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? r2 : r1, a = rot + (i * Math.PI) / n;
    ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  ctx.closePath();
}

function wing(ctx, x, y, s, flip) {
  ctx.save(); ctx.translate(x, y); ctx.scale(flip ? -s : s, s);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(30, -40, 70, -50, 95, -38);
  ctx.bezierCurveTo(80, -28, 88, -20, 78, -12);
  ctx.bezierCurveTo(70, -8, 74, 0, 64, 4);
  ctx.bezierCurveTo(56, 8, 58, 16, 46, 16);
  ctx.bezierCurveTo(34, 18, 20, 16, 0, 10);
  ctx.closePath();
  ctx.restore();
}

// ------------------------------------------------------------------ sign atlas
// 4x2 cells of 256px: 0 potion, 1 weapon, 2 armor, 3 inn, 4 storage, 5 bakery, 6 clock, 7 crest
export const SIGN = { potion: 0, weapon: 1, armor: 2, inn: 3, storage: 4, bakery: 5, clock: 6, crest: 7 };
export function signAtlas() {
  return cached('signs', () => {
    const W = 1024, H = 512, C = 256;
    const c = makeCanvas(W, H);
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const cell = (i, fn) => { ctx.save(); ctx.translate((i % 4) * C, Math.floor(i / 4) * C); fn(); ctx.restore(); };

    // 0 potion bottle (shaped sign)
    cell(0, () => {
      ctx.beginPath();
      ctx.moveTo(104, 40); ctx.lineTo(152, 40); ctx.lineTo(152, 96);
      ctx.bezierCurveTo(215, 112, 232, 170, 214, 205);
      ctx.bezierCurveTo(196, 244, 60, 244, 42, 205);
      ctx.bezierCurveTo(24, 170, 41, 112, 104, 96);
      ctx.closePath();
      ctx.fillStyle = '#d8f1ff'; ctx.fill();
      ctx.save(); ctx.clip();
      ctx.fillStyle = '#e8324f';
      ctx.beginPath(); ctx.moveTo(20, 150);
      for (let x = 20; x <= 236; x += 12) ctx.lineTo(x, 146 + Math.sin(x * 0.08) * 7);
      ctx.lineTo(236, 250); ctx.lineTo(20, 250); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ff7b8c';
      for (const [bx, by, br] of [[100, 190, 9], [130, 172, 6], [158, 200, 11], [118, 215, 5], [170, 170, 5]]) { ctx.beginPath(); ctx.arc(bx, by, br, 0, 7); ctx.fill(); }
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.beginPath(); ctx.ellipse(76, 150, 12, 30, 0.35, 0, 7); ctx.fill();
      ctx.restore();
      ctx.lineWidth = 8; ctx.strokeStyle = OUT; ctx.stroke();
      // cork
      rr(ctx, 96, 14, 64, 34, 8); ctx.fillStyle = '#b57a42'; ctx.fill(); ctx.lineWidth = 6; ctx.stroke();
      rr(ctx, 92, 40, 72, 14, 6); ctx.fillStyle = '#f2c14e'; ctx.fill(); ctx.stroke();
    });
    // 1 weapon: round board with crossed swords
    cell(1, () => {
      ctx.beginPath(); ctx.arc(128, 128, 118, 0, 7); ctx.fillStyle = '#6b3d1c'; ctx.fill();
      ctx.beginPath(); ctx.arc(128, 128, 104, 0, 7); ctx.fillStyle = '#c0864c'; ctx.fill();
      ctx.save(); ctx.clip();
      ctx.strokeStyle = 'rgba(80,40,15,0.35)'; ctx.lineWidth = 3;
      for (let k = -3; k <= 3; k++) { ctx.beginPath(); ctx.moveTo(0, 128 + k * 30); ctx.lineTo(256, 128 + k * 30); ctx.stroke(); }
      ctx.restore();
      ctx.beginPath(); ctx.arc(128, 128, 118, 0, 7); ctx.lineWidth = 6; ctx.strokeStyle = OUT; ctx.stroke();
      sword(ctx, 128 - 50, 128 + 62, 190, 0.72);
      sword(ctx, 128 + 50, 128 + 62, 190, -0.72);
    });
    // 2 armor: heater shield
    cell(2, () => {
      const shield = () => {
        ctx.beginPath();
        ctx.moveTo(40, 30); ctx.lineTo(216, 30);
        ctx.bezierCurveTo(222, 120, 200, 190, 128, 240);
        ctx.bezierCurveTo(56, 190, 34, 120, 40, 30);
        ctx.closePath();
      };
      shield(); ctx.fillStyle = '#c9d3de'; ctx.fill();
      ctx.save(); ctx.translate(128, 135); ctx.scale(0.84, 0.84); ctx.translate(-128, -135); shield(); ctx.fillStyle = '#2f68d0'; ctx.fill(); ctx.restore();
      ctx.save(); shield(); ctx.clip();
      ctx.fillStyle = '#f2c14e';
      ctx.fillRect(116, 20, 24, 230); ctx.fillRect(30, 96, 200, 24);
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(40, 30, 88, 220);
      ctx.restore();
      star(ctx, 128, 108, 30, 13, 5); ctx.fillStyle = '#fff4c2'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = OUT; ctx.stroke();
      shield(); ctx.lineWidth = 8; ctx.strokeStyle = OUT; ctx.stroke();
    });
    // 3 inn: board with mug + moon
    cell(3, () => {
      woodBoard(ctx, 14, 30, 228, 196, 26, '#c48a50');
      // mug
      rr(ctx, 62, 88, 86, 104, 12); ctx.fillStyle = '#f6c343'; ctx.fill(); ctx.lineWidth = 6; ctx.strokeStyle = OUT; ctx.stroke();
      ctx.beginPath(); ctx.arc(150, 138, 28, -1.3, 1.3); ctx.lineWidth = 12; ctx.strokeStyle = OUT; ctx.stroke(); ctx.lineWidth = 6; ctx.strokeStyle = '#f0e6d0'; ctx.stroke();
      ctx.fillStyle = '#fffaf0';
      for (const [fx, fy, fr] of [[70, 86, 18], [96, 78, 22], [124, 84, 20], [146, 92, 14]]) { ctx.beginPath(); ctx.arc(fx, fy, fr, 0, 7); ctx.fill(); }
      ctx.lineWidth = 5; ctx.strokeStyle = OUT;
      ctx.beginPath(); ctx.arc(96, 78, 22, 3.3, 6.0); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(74, 110, 10, 66);
      // moon + stars
      ctx.beginPath(); ctx.arc(196, 84, 24, 0, 7); ctx.fillStyle = '#fff1a8'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = OUT; ctx.stroke();
      ctx.beginPath(); ctx.arc(208, 76, 20, 0, 7); ctx.fillStyle = '#c48a50'; ctx.fill();
      star(ctx, 198, 150, 12, 5, 5); ctx.fillStyle = '#fff1a8'; ctx.fill();
      star(ctx, 214, 186, 8, 3.5, 5); ctx.fill();
    });
    // 4 storage: crate emblem
    cell(4, () => {
      woodBoard(ctx, 14, 30, 228, 196, 26, '#9fbf6a');
      rr(ctx, 70, 72, 116, 116, 8); ctx.fillStyle = '#d99b55'; ctx.fill(); ctx.lineWidth = 7; ctx.strokeStyle = OUT; ctx.stroke();
      ctx.strokeStyle = '#8a5428'; ctx.lineWidth = 10;
      ctx.beginPath(); ctx.moveTo(78, 80); ctx.lineTo(178, 180); ctx.stroke();
      ctx.lineWidth = 4; ctx.strokeStyle = OUT; ctx.strokeRect(70, 72, 116, 116);
      ctx.fillStyle = '#8a5428'; ctx.fillRect(70, 72, 116, 14); ctx.fillRect(70, 174, 116, 14);
      ctx.strokeRect(70, 72, 116, 14); ctx.strokeRect(70, 174, 116, 14);
      ctx.fillStyle = '#f2c14e'; ctx.beginPath(); ctx.arc(128, 130, 16, 0, 7); ctx.fill(); ctx.stroke();
    });
    // 5 bakery: bread loaf
    cell(5, () => {
      woodBoard(ctx, 14, 30, 228, 196, 26, '#e0a868');
      ctx.beginPath(); ctx.ellipse(128, 138, 90, 50, 0, 0, 7); ctx.fillStyle = '#d98a3a'; ctx.fill(); ctx.lineWidth = 7; ctx.strokeStyle = OUT; ctx.stroke();
      ctx.fillStyle = 'rgba(255,220,150,0.6)'; ctx.beginPath(); ctx.ellipse(110, 120, 60, 22, -0.1, 0, 7); ctx.fill();
      ctx.strokeStyle = '#7a3d12'; ctx.lineWidth = 7;
      for (const dx of [-40, 0, 40]) { ctx.beginPath(); ctx.moveTo(128 + dx - 14, 112); ctx.lineTo(128 + dx + 14, 150); ctx.stroke(); }
    });
    // 6 clock face
    cell(6, () => {
      ctx.beginPath(); ctx.arc(128, 128, 124, 0, 7); ctx.fillStyle = '#e9b949'; ctx.fill();
      ctx.beginPath(); ctx.arc(128, 128, 108, 0, 7); ctx.fillStyle = '#fbf6e8'; ctx.fill();
      ctx.lineWidth = 4; ctx.strokeStyle = OUT; ctx.stroke();
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        ctx.save(); ctx.translate(128, 128); ctx.rotate(a);
        ctx.fillStyle = '#2a3550'; ctx.fillRect(-4, -100, 8, i % 3 === 0 ? 26 : 14);
        ctx.restore();
      }
      ctx.lineCap = 'round'; ctx.strokeStyle = '#2a3550';
      ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(128, 128); ctx.lineTo(128 + 44, 128 - 30); ctx.stroke();
      ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(128, 128); ctx.lineTo(128 - 12, 128 - 82); ctx.stroke();
      ctx.beginPath(); ctx.arc(128, 128, 10, 0, 7); ctx.fillStyle = '#e9b949'; ctx.fill(); ctx.lineWidth = 3; ctx.stroke();
      ctx.beginPath(); ctx.arc(128, 128, 124, 0, 7); ctx.lineWidth = 5; ctx.strokeStyle = OUT; ctx.stroke();
    });
    // 7 town crest (winged star shield)
    cell(7, () => {
      ctx.fillStyle = '#f7f0dc';
      wing(ctx, 110, 128, 1.1, true); ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = OUT; ctx.stroke();
      wing(ctx, 146, 128, 1.1, false); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(84, 60); ctx.lineTo(172, 60); ctx.bezierCurveTo(176, 140, 160, 186, 128, 214); ctx.bezierCurveTo(96, 186, 80, 140, 84, 60); ctx.closePath();
      ctx.fillStyle = '#2f68d0'; ctx.fill(); ctx.lineWidth = 7; ctx.strokeStyle = '#e9b949'; ctx.stroke(); ctx.lineWidth = 3; ctx.strokeStyle = OUT; ctx.stroke();
      star(ctx, 128, 122, 34, 14, 8); ctx.fillStyle = '#ffd95a'; ctx.fill(); ctx.lineWidth = 3; ctx.stroke();
    });
    const t = toTexture(c, { repeat: false });
    t.anisotropy = 8;
    return t;
  });
}
// uv rect for a sign cell: returns [u0, v0, u1, v1]
export function signUV(i) {
  const col = i % 4, row = Math.floor(i / 4);
  return [col / 4 + 0.002, 1 - (row + 1) / 2 + 0.004, (col + 1) / 4 - 0.002, 1 - row / 2 - 0.004];
}

// ------------------------------------------------------------------ banner atlas
// 4 vertical banners (128x512 each): 0 blue/star, 1 red/wing, 2 green/tree, 3 purple/crown
export function bannerAtlas() {
  return cached('banners', () => {
    const W = 512, H = 512, C = 128;
    const c = makeCanvas(W, H);
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    const schemes = [
      { bg: '#2c5fc9', bg2: '#244fa8', trim: '#f2c14e' },
      { bg: '#d23a3a', bg2: '#b02c2e', trim: '#f2c14e' },
      { bg: '#3b9a4a', bg2: '#2f7f3c', trim: '#f6efd8' },
      { bg: '#7a46c2', bg2: '#643aa3', trim: '#f2c14e' },
    ];
    schemes.forEach((s, i) => {
      ctx.save(); ctx.translate(i * C, 0);
      const shape = () => {
        ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(C - 4, 0); ctx.lineTo(C - 4, H - 4); ctx.lineTo(C / 2, H - 70); ctx.lineTo(4, H - 4); ctx.closePath();
      };
      shape(); ctx.fillStyle = s.bg; ctx.fill();
      ctx.save(); shape(); ctx.clip();
      // vertical fabric shading
      const g = ctx.createLinearGradient(0, 0, C, 0);
      g.addColorStop(0, 'rgba(0,0,0,0.18)'); g.addColorStop(0.5, 'rgba(255,255,255,0.08)'); g.addColorStop(1, 'rgba(0,0,0,0.18)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, C, H);
      ctx.fillStyle = s.bg2; ctx.fillRect(0, 0, C, 40);
      // trims
      ctx.strokeStyle = s.trim; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(14, 44); ctx.lineTo(14, H - 40); ctx.moveTo(C - 14, 44); ctx.lineTo(C - 14, H - 40); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(8, 44); ctx.lineTo(C - 8, 44); ctx.stroke();
      // zigzag
      ctx.lineWidth = 4; ctx.beginPath();
      for (let y = 60; y < H - 110; y += 16) { ctx.lineTo(24, y); ctx.lineTo(30, y + 8); }
      ctx.stroke();
      ctx.beginPath();
      for (let y = 60; y < H - 110; y += 16) { ctx.lineTo(C - 24, y); ctx.lineTo(C - 30, y + 8); }
      ctx.stroke();
      // emblem
      const ex = C / 2, ey = 190;
      ctx.fillStyle = s.trim; ctx.strokeStyle = 'rgba(40,20,10,0.8)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(ex, ey, 44, 0, 7); ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fill();
      ctx.fillStyle = s.trim;
      if (i === 0) { star(ctx, ex, ey, 40, 16, 8); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.arc(ex, ey, 12, 0, 7); ctx.fillStyle = '#fff'; ctx.fill(); }
      if (i === 1) {
        wing(ctx, ex - 4, ey + 6, 0.5, true); ctx.fill(); ctx.stroke(); wing(ctx, ex + 4, ey + 6, 0.5, false); ctx.fill(); ctx.stroke();
        star(ctx, ex, ey - 4, 18, 8, 5); ctx.fillStyle = '#fff6d0'; ctx.fill(); ctx.stroke();
      }
      if (i === 2) {
        ctx.fillStyle = '#7a4a22'; ctx.fillRect(ex - 6, ey, 12, 38); ctx.strokeRect(ex - 6, ey, 12, 38);
        ctx.fillStyle = s.trim;
        for (const [dx, dy, r] of [[0, -18, 26], [-22, 2, 20], [22, 2, 20], [0, 8, 22]]) { ctx.beginPath(); ctx.arc(ex + dx, ey + dy, r, 0, 7); ctx.fill(); }
        ctx.beginPath(); ctx.arc(ex, ey - 18, 26, 3.4, 6.0); ctx.stroke();
      }
      if (i === 3) {
        ctx.beginPath(); ctx.moveTo(ex - 34, ey + 22); ctx.lineTo(ex - 38, ey - 22); ctx.lineTo(ex - 18, ey - 2); ctx.lineTo(ex, ey - 32); ctx.lineTo(ex + 18, ey - 2); ctx.lineTo(ex + 38, ey - 22); ctx.lineTo(ex + 34, ey + 22); ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#e8324f'; for (const dx of [-18, 0, 18]) { ctx.beginPath(); ctx.arc(ex + dx, ey + 10, 5, 0, 7); ctx.fill(); }
      }
      // lower small stars
      ctx.fillStyle = s.trim;
      for (const yy of [300, 350, 400]) { star(ctx, ex, yy, 9, 4, 4); ctx.fill(); }
      ctx.restore();
      shape(); ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(30,15,5,0.7)'; ctx.stroke();
      ctx.restore();
    });
    return toTexture(c, { repeat: false });
  });
}
export function bannerUV(i) { return [i / 4 + 0.003, 0, (i + 1) / 4 - 0.003, 1]; }

// ------------------------------------------------------------------ glass
export function glassTex() {
  return cached('glass', () => {
    const W = 64, H = 128;
    const c = makeCanvas(W, H);
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#d6f0ff'); g.addColorStop(0.35, '#7fb4e6'); g.addColorStop(0.7, '#3d6aa6'); g.addColorStop(1, '#27406e');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath(); ctx.moveTo(8, H); ctx.lineTo(24, H); ctx.lineTo(W, 30); ctx.lineTo(W, 6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath(); ctx.moveTo(30, H); ctx.lineTo(36, H); ctx.lineTo(W, 74); ctx.lineTo(W, 62); ctx.closePath(); ctx.fill();
    return toTexture(c, { repeat: false });
  });
}
export function glassLitTex() {
  return cached('glassLit', () => {
    const W = 64, H = 128;
    const c = makeCanvas(W, H);
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(W / 2, H * 0.55, 4, W / 2, H * 0.55, H * 0.7);
    g.addColorStop(0, '#fff3c4'); g.addColorStop(0.5, '#ffc865'); g.addColorStop(1, '#d9822e');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // curtains
    const cur = (x0, dir) => {
      ctx.fillStyle = '#d0485a';
      ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x0 + dir * 22, 0);
      ctx.quadraticCurveTo(x0 + dir * 8, H * 0.5, x0 + dir * 16, H); ctx.lineTo(x0, H); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(120,20,40,0.6)'; ctx.lineWidth = 2;
      for (let k = 1; k < 4; k++) { ctx.beginPath(); ctx.moveTo(x0 + dir * k * 5, 0); ctx.quadraticCurveTo(x0 + dir * k * 2, H * 0.5, x0 + dir * k * 4, H); ctx.stroke(); }
    };
    cur(0, 1); cur(W, -1);
    ctx.fillStyle = '#b8323f'; ctx.fillRect(0, 0, W, 10);
    return toTexture(c, { repeat: false });
  });
}

// ------------------------------------------------------------------ light painted wood (tint via vertex colour)
export function paintWoodTex() {
  return cached('paintWood', () => {
    const S = 256;
    const c = makeCanvas(S);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#f4efe6'; ctx.fillRect(0, 0, S, S);
    const rng = mulberry32(333);
    const planks = 4;
    for (let p = 0; p < planks; p++) {
      const x0 = (p * S) / planks;
      ctx.fillStyle = `rgba(${200 + rng() * 40},${190 + rng() * 40},${180 + rng() * 40},0.35)`;
      ctx.fillRect(x0, 0, S / planks, S);
      for (let k = 0; k < 10; k++) {
        ctx.strokeStyle = `rgba(150,130,110,${0.12 + rng() * 0.15})`; ctx.lineWidth = 1;
        const xx = x0 + 4 + rng() * (S / planks - 8);
        ctx.beginPath(); ctx.moveTo(xx, 0); ctx.bezierCurveTo(xx + (rng() - 0.5) * 6, S * 0.3, xx + (rng() - 0.5) * 6, S * 0.7, xx, S); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(90,70,55,0.55)'; ctx.fillRect(x0, 0, 2, S);
    }
    return toTexture(c);
  });
}

// ------------------------------------------------------------------ awning stripes (4 schemes in horizontal bands)
export function awningTex() {
  return cached('awning', () => {
    const S = 256;
    const c = makeCanvas(S);
    const ctx = c.getContext('2d');
    const schemes = [['#d8343f', '#fff6e8'], ['#2f6fd0', '#fff6e8'], ['#3c9a4c', '#fbf3d6'], ['#e0628a', '#fff6f0']];
    schemes.forEach(([a, b], i) => {
      const y0 = i * 64;
      for (let x = 0; x < S; x += 32) {
        ctx.fillStyle = a; ctx.fillRect(x, y0, 16, 64);
        ctx.fillStyle = b; ctx.fillRect(x + 16, y0, 16, 64);
      }
      const g = ctx.createLinearGradient(0, y0, 0, y0 + 64);
      g.addColorStop(0, 'rgba(0,0,0,0.12)'); g.addColorStop(1, 'rgba(255,255,255,0.08)');
      ctx.fillStyle = g; ctx.fillRect(0, y0, S, 64);
    });
    return toTexture(c);
  });
}

// ------------------------------------------------------------------ water streaks (alpha) for jets / curtains
export function streakTex() {
  return cached('streak', () => {
    const W = 128, H = 128;
    const c = makeCanvas(W, H);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    const rng = mulberry32(444);
    for (let i = 0; i < 90; i++) {
      const x = rng() * W, y = rng() * H, l = 20 + rng() * 60, a = 0.25 + rng() * 0.6;
      const g = ctx.createLinearGradient(0, y, 0, y + l);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, `rgba(255,255,255,${a})`); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      for (const oy of [0, -H]) ctx.fillRect(x, y + oy, 1.5 + rng() * 2.5, l);
    }
    const t = toTexture(c, { srgb: false });
    return t;
  });
}

// ------------------------------------------------------------------ pale marble for the statue
export function marbleTex() {
  return cached('marble', () => {
    const S = 256;
    const c = makeCanvas(S);
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(S, S);
    const fb = makeFbm(515, 5, 4);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const n = fb((x / S) * 4, (y / S) * 4);
      const vein = Math.pow(1 - Math.abs(Math.sin((x / S + n * 1.6) * Math.PI * 3)), 14);
      const v = 236 + n * 16 - vein * 38;
      const i = (y * S + x) * 4;
      img.data[i] = v; img.data[i + 1] = v - 2; img.data[i + 2] = v - 6; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return toTexture(c);
  });
}

export { THREE };

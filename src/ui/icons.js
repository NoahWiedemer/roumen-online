// Procedural HUD icon set.
// Every icon is original artwork painted in code with the Canvas 2D API
// (paths, gradients, shadows, glows) — no external images.
//
// All art is authored in a 100×100 design space, rendered at 4× the requested
// pixel size and downsampled in halving steps for clean anti-aliased edges.
// Lighting convention: key light from the top-left, soft drop shadow to the
// bottom-right, dark ink outline around every object silhouette.
//
//   skillIcon(id, size = 64) -> PNG dataURL (framed painted skill scene)
//   itemIcon(id, size = 64)  -> PNG dataURL (item on dark inventory tile)
//   menuIcon(id, size = 64)  -> PNG dataURL (transparent glossy toy-style icon)
//   buffIcon(id, size = 32)  -> PNG dataURL (small framed status icon)

const U = 100;
const TAU = Math.PI * 2;
const D = Math.PI / 180;
const INK = '#1d0f17';
const cache = new Map();

/* ================================================================== */
/* colour + math utils                                                  */
/* ================================================================== */
function hexRgb(h) {
  h = h.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function toHex(r, g, b) {
  return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}
/** t > 0 lightens towards white, t < 0 darkens towards black */
function shade(hex, t) {
  const [r, g, b] = hexRgb(hex);
  if (t >= 0) return toHex(r + (255 - r) * t, g + (255 - g) * t, b + (255 - b) * t);
  return toHex(r * (1 + t), g * (1 + t), b * (1 + t));
}
function rgba(hex, a) {
  const [r, g, b] = hexRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ================================================================== */
/* materials                                                            */
/* ================================================================== */
const M = {
  steel: { hi: '#ffffff', a: '#dfe8f3', b: '#93a5bd', lo: '#44526b', line: '#222a3a' },
  iron: { hi: '#eef1f4', a: '#bcc4cc', b: '#7d8792', lo: '#39404a', line: '#1e232a' },
  dark: { hi: '#aab0bc', a: '#666d7c', b: '#3c414d', lo: '#17191f', line: '#0a0b0e' },
  bronze: { hi: '#fff0cc', a: '#eab676', b: '#b87733', lo: '#5b3311', line: '#321905' },
  wood: { hi: '#ffe4b8', a: '#dca868', b: '#a86a30', lo: '#5a3212', line: '#341b07' },
  gold: { hi: '#fffbe0', a: '#ffdc62', b: '#e09a1a', lo: '#7a4404', line: '#452502' },
  silver: { hi: '#ffffff', a: '#e8edf4', b: '#a9b4c4', lo: '#566276', line: '#2c3342' },
  copper: { hi: '#ffe2c8', a: '#f6a86a', b: '#c4622a', lo: '#5c2208', line: '#341104' },
  red: { hi: '#ffc4b4', a: '#ff5a44', b: '#cc1a1e', lo: '#560612', line: '#2c0007' },
  blue: { hi: '#d4f2ff', a: '#58b8ff', b: '#1a5ad8', lo: '#0a1e66', line: '#060e36' },
  green: { hi: '#e4ffcc', a: '#72e45c', b: '#1f9a34', lo: '#0a4418', line: '#04240b' },
  jade: { hi: '#dcffea', a: '#62e4a4', b: '#16a060', lo: '#064a2a', line: '#032814' },
  purple: { hi: '#f2dcff', a: '#b884ff', b: '#6a2ad0', lo: '#2a0a5a', line: '#15042c' },
  leather: { hi: '#f4c692', a: '#c88a4c', b: '#8e5426', lo: '#46260c', line: '#281303' },
  dleather: { hi: '#c9977a', a: '#8f5c3c', b: '#603a22', lo: '#2a160a', line: '#170a03' },
  ivory: { hi: '#ffffff', a: '#fff4d6', b: '#e2cc96', lo: '#8a7246', line: '#453619' },
  flame: { hi: '#fffac8', a: '#ffc444', b: '#f25c14', lo: '#6a1004', line: '#380602' },
  redMetal: { hi: '#ffc8b8', a: '#f45c46', b: '#b8161c', lo: '#480408', line: '#280004' },
  skin: { hi: '#fff0e2', a: '#ffd8b8', b: '#eea57c', lo: '#8a4a2c', line: '#4a2212' },
  parch: { hi: '#fffaf0', a: '#f8e6b8', b: '#dcb676', lo: '#8a6630', line: '#4a3212' },
};

/* ================================================================== */
/* canvas plumbing                                                      */
/* ================================================================== */
function mk(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
function kOf(ctx) { const t = ctx.getTransform(); return Math.hypot(t.a, t.b); }
function glow(ctx, color, blur) {
  ctx.shadowColor = color; ctx.shadowBlur = blur * kOf(ctx);
  ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
}
function noGlow(ctx) { ctx.shadowColor = 'rgba(0,0,0,0)'; ctx.shadowBlur = 0; }
function addStops(g, stops) {
  stops.forEach((s, i) => (Array.isArray(s) ? g.addColorStop(s[0], s[1]) : g.addColorStop(stops.length === 1 ? 0 : i / (stops.length - 1), s)));
  return g;
}
function lin(ctx, x0, y0, x1, y1, stops) { return addStops(ctx.createLinearGradient(x0, y0, x1, y1), stops); }
function rad(ctx, x0, y0, r0, x1, y1, r1, stops) { return addStops(ctx.createRadialGradient(x0, y0, r0, x1, y1, r1), stops); }

function tint(src, color) {
  const c = mk(src.width, src.height), x = c.getContext('2d');
  x.drawImage(src, 0, 0);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = color; x.fillRect(0, 0, c.width, c.height);
  return c;
}
function newLayer(W) {
  const L = mk(W), l = L.getContext('2d');
  const k = W / U;
  l.setTransform(k, 0, 0, k, 0, 0);
  l.lineJoin = 'round'; l.lineCap = 'round';
  return [L, l];
}

/**
 * Draw an object on its own layer, then composite it with a consistent
 * silhouette outline (dilation), optional coloured glow and a soft drop shadow.
 */
function obj(ctx, draw, o = {}) {
  const W = ctx.canvas.width, k = W / U;
  const [L, l] = newLayer(W);
  draw(l);
  const ow = (o.ow ?? 2.3) * k;
  let sil;
  if (ow > 0) {
    const t = tint(L, o.oc || INK);
    const Dc = mk(W), d = Dc.getContext('2d');
    const rings = [ow, ow * 0.55];
    for (const r of rings) {
      const n = Math.max(12, Math.ceil((TAU * r) / 1.4));
      for (let i = 0; i < n; i++) { const a = (i / n) * TAU; d.drawImage(t, Math.cos(a) * r, Math.sin(a) * r); }
    }
    d.drawImage(t, 0, 0);
    sil = Dc;
  } else sil = tint(L, '#000');
  const far = W * 3;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (o.glow) {
    ctx.shadowColor = o.glow; ctx.shadowBlur = (o.glowR ?? 7) * k;
    ctx.shadowOffsetX = far; ctx.shadowOffsetY = 0;
    ctx.globalAlpha = o.glowA ?? 1;
    for (let i = 0; i < (o.glowN ?? 2); i++) ctx.drawImage(sil, -far, 0);
    ctx.globalAlpha = 1;
  }
  if (o.shadow !== false) {
    ctx.shadowColor = `rgba(0,0,0,${o.shadowA ?? 0.5})`;
    ctx.shadowBlur = (o.shadowBlur ?? 3) * k;
    ctx.shadowOffsetX = far + (o.sx ?? 1.2) * k; ctx.shadowOffsetY = (o.sy ?? 2.4) * k;
    ctx.drawImage(sil, -far, 0);
  }
  ctx.shadowColor = 'rgba(0,0,0,0)'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
  ctx.globalAlpha = o.alpha ?? 1;
  if (ow > 0) ctx.drawImage(sil, 0, 0);
  ctx.drawImage(L, 0, 0);
  ctx.restore();
}

/** Flat translucent silhouette of a drawing (used for motion ghosts). */
function ghost(ctx, draw, color, alpha) {
  const W = ctx.canvas.width;
  const [L, l] = newLayer(W);
  draw(l);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = alpha;
  ctx.drawImage(tint(L, color), 0, 0);
  ctx.restore();
}

function rasterize(size, draw) {
  const S = Math.min(1024, Math.max(64, Math.round(size * 4)));
  let c = mk(S);
  const x = c.getContext('2d');
  x.setTransform(S / U, 0, 0, S / U, 0, 0);
  x.lineJoin = 'round'; x.lineCap = 'round';
  draw(x);
  let w = S;
  while (w / 2 >= size * 1.5) {
    const h = Math.round(w / 2);
    const n = mk(h), nx = n.getContext('2d');
    nx.imageSmoothingEnabled = true; nx.imageSmoothingQuality = 'high';
    nx.drawImage(c, 0, 0, h, h);
    c = n; w = h;
  }
  const out = mk(size), ox = out.getContext('2d');
  ox.imageSmoothingEnabled = true; ox.imageSmoothingQuality = 'high';
  ox.drawImage(c, 0, 0, size, size);
  return out.toDataURL('image/png');
}

/* ================================================================== */
/* path helpers                                                         */
/* ================================================================== */
function rrPath(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); rrPath(ctx, x, y, w, h, r); }
function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); }
function ell(ctx, x, y, rx, ry, rot = 0) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, TAU); }
function poly(ctx, pts) {
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
  ctx.closePath();
}
/** closed smooth curve through the midpoints of pts */
function smooth(ctx, pts) {
  const n = pts.length;
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  ctx.beginPath();
  const m0 = mid(pts[n - 1], pts[0]);
  ctx.moveTo(m0[0], m0[1]);
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n], m = mid(p, q);
    ctx.quadraticCurveTo(p[0], p[1], m[0], m[1]);
  }
  ctx.closePath();
}
function capsule(ctx, x1, y1, x2, y2, r) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  ctx.beginPath();
  ctx.arc(x2, y2, r, a - Math.PI / 2, a + Math.PI / 2);
  ctx.arc(x1, y1, r, a + Math.PI / 2, a + Math.PI * 1.5);
  ctx.closePath();
}
function starPath(ctx, cx, cy, n, r1, r2, rot = -Math.PI / 2) {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? r2 : r1, a = rot + (i * Math.PI) / n;
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath();
}
function heartPath(ctx, cx, cy, s) {
  const w = s / 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy + w * 0.95);
  ctx.bezierCurveTo(cx - w * 0.3, cy + w * 0.68, cx - w * 1.02, cy + w * 0.28, cx - w * 1.02, cy - w * 0.22);
  ctx.bezierCurveTo(cx - w * 1.02, cy - w * 0.78, cx - w * 0.36, cy - w * 0.98, cx, cy - w * 0.5);
  ctx.bezierCurveTo(cx + w * 0.36, cy - w * 0.98, cx + w * 1.02, cy - w * 0.78, cx + w * 1.02, cy - w * 0.22);
  ctx.bezierCurveTo(cx + w * 1.02, cy + w * 0.28, cx + w * 0.3, cy + w * 0.68, cx, cy + w * 0.95);
  ctx.closePath();
}
function shieldPath(ctx, cx, cy, w, h) {
  const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2;
  ctx.beginPath();
  ctx.moveTo(x0, y0 + h * 0.07);
  ctx.quadraticCurveTo(cx, y0 - h * 0.07, x1, y0 + h * 0.07);
  ctx.lineTo(x1, y0 + h * 0.42);
  ctx.bezierCurveTo(x1, y0 + h * 0.72, cx + w * 0.24, y0 + h * 0.88, cx, y1);
  ctx.bezierCurveTo(cx - w * 0.24, y0 + h * 0.88, x0, y0 + h * 0.72, x0, y0 + h * 0.42);
  ctx.closePath();
}
/** flame with a main tongue and two side licks; base centre (cx, by) */
function flamePath(ctx, cx, by, w, h) {
  const P = (x, y) => [cx + x * w, by - y * h];
  ctx.beginPath();
  ctx.moveTo(...P(0, 0));
  ctx.bezierCurveTo(...P(-0.56, 0), ...P(-0.62, 0.32), ...P(-0.4, 0.54));
  ctx.quadraticCurveTo(...P(-0.44, 0.72), ...P(-0.32, 0.86));
  ctx.quadraticCurveTo(...P(-0.2, 0.68), ...P(-0.12, 0.64));
  ctx.bezierCurveTo(...P(-0.14, 0.82), ...P(-0.04, 0.92), ...P(0.03, 1));
  ctx.bezierCurveTo(...P(0.12, 0.86), ...P(0.24, 0.76), ...P(0.18, 0.6));
  ctx.quadraticCurveTo(...P(0.3, 0.66), ...P(0.36, 0.8));
  ctx.bezierCurveTo(...P(0.52, 0.62), ...P(0.62, 0.32), ...P(0.52, 0.16));
  ctx.bezierCurveTo(...P(0.44, 0.02), ...P(0.26, 0), ...P(0, 0));
  ctx.closePath();
}
/** tapered arc stroke (slashes, wind, vortex) as a filled polygon */
function swoosh(ctx, cx, cy, R, a0, a1, T, o = {}) {
  const { rx = 1, ry = 1, rot = 0, bias = 0.5, n = 56, profile = null } = o;
  const cr = Math.cos(rot), sr = Math.sin(rot);
  const P = (a, r) => { const x = Math.cos(a) * r * rx, y = Math.sin(a) * r * ry; return [cx + x * cr - y * sr, cy + x * sr + y * cr]; };
  const outer = [], inner = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    let th;
    if (profile) th = T * profile(t);
    else { const tt = t < bias ? (t / bias) * 0.5 : 0.5 + ((t - bias) / (1 - bias)) * 0.5; th = T * Math.sin(Math.PI * tt); }
    const a = a0 + (a1 - a0) * t;
    outer.push(P(a, R + th / 2)); inner.push(P(a, R - th / 2));
  }
  ctx.beginPath();
  outer.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
  for (let i = inner.length - 1; i >= 0; i--) ctx.lineTo(inner[i][0], inner[i][1]);
  ctx.closePath();
}
function fillStroke(ctx, fill, stroke, lw) {
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}

/* ================================================================== */
/* small shared painters                                                */
/* ================================================================== */
function ballGrad(ctx, x, y, r, m, ang = 0) {
  // highlight towards world top-left even inside rotated frames
  const wx = -0.36, wy = -0.42, c = Math.cos(-ang), s = Math.sin(-ang);
  const lx = wx * c - wy * s, ly = wx * s + wy * c;
  return rad(ctx, x + lx * r, y + ly * r, r * 0.05, x, y, r, [[0, m.hi], [0.3, m.a], [0.78, m.b], [1, m.lo]]);
}
function ball(ctx, x, y, r, m, stroke = true) {
  circle(ctx, x, y, r);
  ctx.fillStyle = ballGrad(ctx, x, y, r, m);
  ctx.fill();
  if (stroke) { ctx.lineWidth = Math.max(0.6, r * 0.12); ctx.strokeStyle = m.line; ctx.stroke(); }
}
function spec(ctx, x, y, r, a = 0.95) { circle(ctx, x, y, r); ctx.fillStyle = `rgba(255,255,255,${a})`; ctx.fill(); }
/** soft elliptical glossy highlight */
function gloss(ctx, x, y, rx, ry, rot = -0.6, a = 0.8) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(rot); ctx.scale(1, ry / rx);
  ctx.fillStyle = rad(ctx, 0, 0, 0, 0, 0, rx, [[0, `rgba(255,255,255,${a})`], [0.5, `rgba(255,255,255,${a * 0.5})`], [1, 'rgba(255,255,255,0)']]);
  circle(ctx, 0, 0, rx); ctx.fill();
  ctx.restore();
}
function sparkle(ctx, x, y, r, color = '#ffffff', glowCol = null) {
  ctx.save();
  glow(ctx, glowCol || color, r * 0.9);
  ctx.fillStyle = color;
  const q = r * 0.16;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x + q, y - q, x + r, y);
  ctx.quadraticCurveTo(x + q, y + q, x, y + r);
  ctx.quadraticCurveTo(x - q, y + q, x - r, y);
  ctx.quadraticCurveTo(x - q, y - q, x, y - r);
  ctx.fill();
  ctx.restore();
}
function drawGem(ctx, x, y, r, g, facets = true) {
  circle(ctx, x, y, r);
  ctx.fillStyle = rad(ctx, x - r * 0.3, y - r * 0.35, r * 0.05, x, y, r, [[0, g.hi], [0.35, g.a], [0.8, g.b], [1, g.lo]]);
  ctx.fill();
  ctx.lineWidth = Math.max(0.5, r * 0.16); ctx.strokeStyle = g.line; ctx.stroke();
  if (facets && r > 2.5) {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + Math.PI / 8; const px = x + Math.cos(a) * r * 0.55, py = y + Math.sin(a) * r * 0.55; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
    ctx.closePath();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = Math.max(0.3, r * 0.08); ctx.stroke();
  }
  spec(ctx, x - r * 0.34, y - r * 0.38, r * 0.24);
}
function stitches(ctx, drawPath, color = 'rgba(255,230,190,0.75)', lw = 0.9, dash = [2.2, 2]) {
  ctx.save();
  drawPath();
  ctx.setLineDash(dash); ctx.lineWidth = lw; ctx.strokeStyle = color; ctx.lineCap = 'butt';
  ctx.stroke();
  ctx.restore();
}
function rivet(ctx, x, y, r = 1.6, m = M.silver) { ball(ctx, x, y, r, m, false); }

/* ---------------- sword ---------------- */
function drawSword(ctx, o) {
  const {
    x, y, ang = 0, len = 56, w = 10, blade = M.steel, guard = M.gold, grip = '#6b3a1c', pommel = null,
    gem = null, gemGuard = null, gw = null, style = 'bar', tip = 'point', gripLen = 13, fuller = false,
    wavy = 0, taper = 0.84, bladeFx = null,
  } = o;
  const pm = pommel || guard;
  const a = ang * D;
  ctx.save();
  ctx.translate(x, y); ctx.rotate(a);
  const litRight = Math.cos(a) * -0.7 + Math.sin(a) * -0.7 > 0.05;
  const hw = w / 2;

  // grip
  const gr = Math.max(2.3, w * 0.26);
  rr(ctx, -gr, -1, gr * 2, gripLen + 1, 1.2);
  const gs = [shade(grip, 0.35), grip, shade(grip, -0.5)];
  ctx.fillStyle = lin(ctx, -gr, 0, gr, 0, litRight ? gs.slice().reverse() : gs);
  ctx.fill();
  ctx.save(); ctx.clip();
  ctx.strokeStyle = shade(grip, -0.6); ctx.lineWidth = 1.1;
  for (let yy = 1.5; yy < gripLen + 3; yy += 3.1) { ctx.beginPath(); ctx.moveTo(-gr - 1, yy + 1.3); ctx.lineTo(gr + 1, yy - 1.3); ctx.stroke(); }
  ctx.restore();
  rr(ctx, -gr, -1, gr * 2, gripLen + 1, 1.2); ctx.lineWidth = 0.7; ctx.strokeStyle = shade(grip, -0.75); ctx.stroke();

  // pommel
  const pr = Math.max(2.8, w * 0.4);
  const py = gripLen + pr * 0.72;
  circle(ctx, 0, py, pr);
  ctx.fillStyle = ballGrad(ctx, 0, py, pr, pm, a); ctx.fill();
  ctx.lineWidth = 0.7; ctx.strokeStyle = pm.line; ctx.stroke();
  if (gem) drawGem(ctx, 0, py, pr * 0.55, gem, false);

  // blade
  const tipL = tip === 'point' ? Math.max(w * 1.35, 7) : 0;
  const endW = hw * taper;
  const Lb = tip === 'round' ? len - endW : len - tipL;
  const N = 30, left = [], right = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, yy = -t * Lb;
    let ww = hw * (1 - (1 - taper) * t);
    if (wavy) ww += Math.sin(t * Math.PI * 6 + 0.6) * wavy * (1 - t * 0.6);
    left.push([-ww, yy]); right.push([ww, yy]);
  }
  const half = (pts, sign) => {
    ctx.beginPath(); ctx.moveTo(0, 1);
    pts.forEach((p) => ctx.lineTo(p[0], p[1]));
    if (tip === 'round') ctx.arc(0, -Lb, endW, sign < 0 ? Math.PI : 0, -Math.PI / 2, sign > 0);
    else ctx.lineTo(0, -len);
    ctx.closePath();
  };
  const litG = (sign) => lin(ctx, sign * hw, 0, 0, 0, [blade.a, blade.hi]);
  const darkG = (sign) => lin(ctx, 0, 0, sign * hw, 0, [blade.b, blade.lo]);
  half(left, -1); ctx.fillStyle = litRight ? darkG(-1) : litG(-1); ctx.fill();
  half(right, 1); ctx.fillStyle = litRight ? litG(1) : darkG(1); ctx.fill();
  // subtle length-wise sheen
  ctx.save();
  half(left, -1); half(right, 1);
  ctx.beginPath(); ctx.moveTo(0, 1); left.forEach((p) => ctx.lineTo(p[0], p[1])); ctx.lineTo(0, -len);
  for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
  ctx.closePath();
  ctx.clip();
  if (bladeFx) bladeFx(ctx, hw, len);
  ctx.fillStyle = lin(ctx, 0, 0, 0, -len, [[0, 'rgba(0,0,0,0.18)'], [0.35, 'rgba(255,255,255,0)'], [0.7, 'rgba(255,255,255,0.18)'], [1, 'rgba(255,255,255,0)']]);
  ctx.fillRect(-hw * 2, -len - 2, hw * 4, len + 4);
  if (fuller) {
    const fw = Math.max(1.2, w * 0.16);
    rr(ctx, -fw / 2, -Lb * 0.72, fw, Lb * 0.68, fw / 2);
    ctx.fillStyle = lin(ctx, -fw / 2, 0, fw / 2, 0, [blade.lo, blade.b]); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 0.45;
    ctx.beginPath(); ctx.moveTo(fw / 2 + 0.4, -3); ctx.lineTo(fw / 2 + 0.4, -Lb * 0.72); ctx.stroke();
  } else {
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(0, -1); ctx.lineTo(0, -len + 2); ctx.stroke();
  }
  ctx.restore();
  // edge line + lit edge glint
  ctx.beginPath(); ctx.moveTo(0, 1); left.forEach((p) => ctx.lineTo(p[0], p[1]));
  if (tip === 'round') ctx.arc(0, -Lb, endW, Math.PI, 0);
  else ctx.lineTo(0, -len);
  for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
  ctx.closePath();
  ctx.lineWidth = 0.75; ctx.strokeStyle = blade.line; ctx.stroke();
  const edge = litRight ? right : left;
  ctx.beginPath();
  edge.forEach((p, i) => { const px = p[0] * 0.86; i ? ctx.lineTo(px, p[1]) : ctx.moveTo(px, p[1] - 1.5); });
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 0.55; ctx.stroke();

  // guard
  const GW = gw ?? hw + 7.5;
  const gh = Math.max(3.6, w * 0.4);
  const gm = guard;
  const gFill = () => lin(ctx, 0, -gh, 0, gh, [gm.hi, gm.a, gm.b, gm.lo]);
  if (style === 'bar' || style === 'simple') {
    rr(ctx, -GW, -gh / 2, GW * 2, gh, gh / 2);
    ctx.fillStyle = gFill(); ctx.fill(); ctx.lineWidth = 0.7; ctx.strokeStyle = gm.line; ctx.stroke();
    if (style === 'bar') {
      circle(ctx, -GW, 0, gh * 0.66); ctx.fillStyle = ballGrad(ctx, -GW, 0, gh * 0.66, gm, a); ctx.fill(); ctx.stroke();
      circle(ctx, GW, 0, gh * 0.66); ctx.fillStyle = ballGrad(ctx, GW, 0, gh * 0.66, gm, a); ctx.fill(); ctx.stroke();
    }
  } else if (style === 'wing' || style === 'horn') {
    const up = style === 'horn' ? 2.6 : 1.7;
    ctx.beginPath();
    ctx.moveTo(-GW, -gh * up);
    ctx.quadraticCurveTo(-GW * 0.55, gh * 1.25, 0, gh * 0.9);
    ctx.quadraticCurveTo(GW * 0.55, gh * 1.25, GW, -gh * up);
    ctx.quadraticCurveTo(GW * 0.52, -gh * 0.05, 0, -gh * 0.75);
    ctx.quadraticCurveTo(-GW * 0.52, -gh * 0.05, -GW, -gh * up);
    ctx.closePath();
    ctx.fillStyle = gFill(); ctx.fill(); ctx.lineWidth = 0.75; ctx.strokeStyle = gm.line; ctx.stroke();
    // centre block
    poly(ctx, [[0, -gh * 1.35], [gh * 0.95, 0], [0, gh * 1.45], [-gh * 0.95, 0]]);
    ctx.fillStyle = lin(ctx, -gh, -gh, gh, gh, [gm.hi, gm.a, gm.b, gm.lo]); ctx.fill(); ctx.stroke();
  }
  if (gemGuard) drawGem(ctx, 0, style === 'wing' || style === 'horn' ? 0 : 0, gh * 0.62, gemGuard, false);
  ctx.restore();
}

/* ---------------- chibi head ---------------- */
function drawChibiHead(ctx, cx, cy, r, o = {}) {
  const hair = o.hair || '#ff9326';
  const HH = { hi: shade(hair, 0.6), a: shade(hair, 0.2), b: hair, lo: shade(hair, -0.55) };
  const hairFill = () => rad(ctx, cx - r * 0.4, cy - r * 0.9, r * 0.1, cx, cy - r * 0.2, r * 1.5, [[0, HH.hi], [0.3, HH.a], [0.7, HH.b], [1, HH.lo]]);
  // back hair spikes
  const spikes = o.spikes ?? 9;
  ctx.beginPath();
  const a0 = 160 * D, a1 = 380 * D;
  for (let i = 0; i <= spikes * 2; i++) {
    const t = i / (spikes * 2), a = a0 + (a1 - a0) * t;
    const tipR = r * (1.3 + 0.1 * Math.sin(i * 1.7));
    const rr_ = i % 2 === 0 ? r * 0.98 : tipR;
    const aa = i % 2 === 0 ? a : a + 7 * D;
    const px = cx + Math.cos(aa) * rr_, py = cy + Math.sin(aa) * rr_ * 1.02;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.lineTo(cx + r * 0.9, cy + r * 0.5);
  ctx.lineTo(cx - r * 0.9, cy + r * 0.5);
  ctx.closePath();
  ctx.fillStyle = hairFill(); ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = HH.lo; ctx.stroke();
  // ears
  for (const s of [-1, 1]) {
    ell(ctx, cx + s * r * 0.95, cy + r * 0.18, r * 0.16, r * 0.22);
    ctx.fillStyle = rad(ctx, cx + s * r * 0.95, cy + r * 0.12, 0, cx + s * r * 0.95, cy + r * 0.18, r * 0.24, [M.skin.a, M.skin.b]); ctx.fill();
    ctx.lineWidth = 0.8; ctx.strokeStyle = M.skin.lo; ctx.stroke();
  }
  // face
  ell(ctx, cx, cy + r * 0.05, r, r * 0.95);
  ctx.fillStyle = rad(ctx, cx - r * 0.35, cy - r * 0.3, r * 0.1, cx, cy + r * 0.05, r * 1.05, [[0, M.skin.hi], [0.45, M.skin.a], [1, M.skin.b]]);
  ctx.fill(); ctx.lineWidth = 0.8; ctx.strokeStyle = M.skin.lo; ctx.stroke();
  // chin shade
  ctx.save(); ell(ctx, cx, cy + r * 0.05, r, r * 0.95); ctx.clip();
  ell(ctx, cx + r * 0.25, cy + r * 0.95, r * 0.9, r * 0.35); ctx.fillStyle = 'rgba(190,90,60,0.18)'; ctx.fill();
  ctx.restore();
  // fringe
  ctx.beginPath();
  ctx.moveTo(cx - r * 1.06, cy + r * 0.12);
  ctx.bezierCurveTo(cx - r * 1.12, cy - r * 1.1, cx + r * 1.12, cy - r * 1.1, cx + r * 1.06, cy + r * 0.12);
  const fr = [[0.9, -0.28], [0.78, 0.02], [0.6, -0.36], [0.42, -0.02], [0.22, -0.38], [0.02, -0.08], [-0.2, -0.4], [-0.4, -0.06], [-0.58, -0.36], [-0.8, 0.0], [-0.92, -0.3]];
  fr.forEach(([fx, fy]) => ctx.lineTo(cx + fx * r, cy + fy * r));
  ctx.closePath();
  ctx.fillStyle = hairFill(); ctx.fill(); ctx.lineWidth = 0.9; ctx.strokeStyle = HH.lo; ctx.stroke();
  // hair shine streak
  ctx.save();
  ctx.beginPath(); ctx.arc(cx - r * 0.1, cy - r * 0.1, r * 0.72, 205 * D, 250 * D);
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = r * 0.09; ctx.stroke();
  ctx.restore();
  // eyes
  const ey = cy + r * 0.22;
  if (o.eyes === 'closed') {
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.arc(cx + s * r * 0.36, ey - r * 0.1, r * 0.17, 25 * D, 155 * D);
      ctx.strokeStyle = '#3a1a10'; ctx.lineWidth = r * 0.075; ctx.stroke();
    }
  } else {
    for (const s of [-1, 1]) {
      const ex = cx + s * r * 0.36;
      ell(ctx, ex, ey, r * 0.15, r * 0.23);
      ctx.fillStyle = lin(ctx, 0, ey - r * 0.23, 0, ey + r * 0.23, [[0, '#1a0c1c'], [0.55, o.iris || '#4a2a8a'], [1, shade(o.iris || '#4a2a8a', 0.5)]]);
      ctx.fill();
      spec(ctx, ex - r * 0.05, ey - r * 0.1, r * 0.075);
      spec(ctx, ex + r * 0.05, ey + r * 0.1, r * 0.035, 0.8);
    }
  }
  // blush
  for (const s of [-1, 1]) { ell(ctx, cx + s * r * 0.6, cy + r * 0.5, r * 0.15, r * 0.08); ctx.fillStyle = 'rgba(255,110,120,0.45)'; ctx.fill(); }
  // mouth
  ctx.beginPath();
  if (o.mouth === 'open') {
    ctx.moveTo(cx - r * 0.12, cy + r * 0.52); ctx.quadraticCurveTo(cx, cy + r * 0.78, cx + r * 0.12, cy + r * 0.52); ctx.closePath();
    ctx.fillStyle = '#8a1a24'; ctx.fill(); ctx.lineWidth = 0.7; ctx.strokeStyle = '#3a0a0a'; ctx.stroke();
  } else {
    ctx.moveTo(cx - r * 0.1, cy + r * 0.55); ctx.quadraticCurveTo(cx, cy + r * 0.66, cx + r * 0.1, cy + r * 0.55);
    ctx.strokeStyle = '#6a2a1a'; ctx.lineWidth = r * 0.05; ctx.stroke();
  }
}

/* ---------------- glossy orb button ---------------- */
function drawOrb(ctx, cx, cy, r, c, rim = M.gold) {
  // rim
  circle(ctx, cx, cy, r);
  ctx.fillStyle = lin(ctx, cx - r, cy - r, cx + r, cy + r, [rim.hi, rim.a, rim.b, rim.lo]); ctx.fill();
  circle(ctx, cx, cy, r * 0.93);
  ctx.strokeStyle = rgba(rim.hi, 0.6); ctx.lineWidth = r * 0.03; ctx.stroke();
  const ir = r * 0.8;
  circle(ctx, cx, cy, ir);
  ctx.fillStyle = lin(ctx, cx + r, cy + r, cx - r, cy - r, [rim.hi, rim.b, rim.lo]); ctx.fill();
  // sphere
  circle(ctx, cx, cy, ir * 0.93);
  ctx.fillStyle = rad(ctx, cx - ir * 0.25, cy - ir * 0.35, ir * 0.05, cx, cy, ir, [[0, c.a], [0.55, c.b], [1, c.lo]]); ctx.fill();
  // bottom reflected light
  ctx.save(); circle(ctx, cx, cy, ir * 0.93); ctx.clip();
  ell(ctx, cx, cy + ir * 0.75, ir * 0.7, ir * 0.4);
  ctx.fillStyle = rad(ctx, cx, cy + ir * 0.85, 0, cx, cy + ir * 0.75, ir * 0.7, [[0, rgba(c.hi, 0.7)], [1, rgba(c.hi, 0)]]); ctx.fill();
  ctx.restore();
}
function orbShine(ctx, cx, cy, r) {
  const ir = r * 0.8 * 0.93;
  ctx.save(); circle(ctx, cx, cy, ir); ctx.clip();
  ell(ctx, cx, cy - ir * 0.46, ir * 0.78, ir * 0.48);
  ctx.fillStyle = lin(ctx, 0, cy - ir, 0, cy - ir * 0.05, [[0, 'rgba(255,255,255,0.85)'], [1, 'rgba(255,255,255,0.05)']]); ctx.fill();
  ctx.restore();
  spec(ctx, cx - ir * 0.52, cy - ir * 0.3, ir * 0.07, 0.9);
}
/** thick white glyph stroke with dark casing */
function glyphStroke(ctx, pathFn, w, col = '#ffffff', case_ = INK) {
  pathFn(); ctx.strokeStyle = case_; ctx.lineWidth = w + 4.2; ctx.stroke();
  pathFn(); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke();
}

/* ---------------- potions ---------------- */
const LIQ = {
  red: { hi: '#ffd0c4', a: '#ff5a48', b: '#d01422', lo: '#4e0212', line: '#2a0008', glow: '#ff3a2a' },
  blue: { hi: '#d0f2ff', a: '#4cb8ff', b: '#1856e0', lo: '#08165a', line: '#040a30', glow: '#3aa0ff' },
};
function glassBody(ctx, path, L, g) {
  const { level, cx, cy, rx, ry } = g;
  ctx.save();
  path(); ctx.clip();
  ctx.fillStyle = lin(ctx, 0, cy - ry, 0, level + 3, [shade(L.lo, 0.2), shade(L.lo, 0.35)]);
  ctx.fillRect(0, 0, 100, 100);
  // liquid
  ctx.beginPath(); ctx.rect(0, level, 100, 100);
  ctx.fillStyle = rad(ctx, cx - rx * 0.2, cy + ry * 0.05, 1, cx, cy + ry * 0.1, Math.max(rx, ry) * 1.05, [[0, L.a], [0.5, L.b], [1, L.lo]]);
  ctx.fill();
  // glowing core
  ell(ctx, cx - rx * 0.05, cy + ry * 0.25, rx * 0.45, ry * 0.35);
  ctx.fillStyle = rad(ctx, cx - rx * 0.05, cy + ry * 0.25, 0, cx - rx * 0.05, cy + ry * 0.25, rx * 0.45, [[0, rgba(L.hi, 0.55)], [1, rgba(L.hi, 0)]]);
  ctx.fill();
  // meniscus
  ell(ctx, cx, level, rx * 0.95, 2.4);
  ctx.fillStyle = rgba(L.hi, 0.6); ctx.fill();
  // bubbles
  const bubbles = g.bubbles || [[cx + rx * 0.3, cy + ry * 0.2, 2], [cx + rx * 0.12, cy + ry * 0.45, 1.3], [cx - rx * 0.25, cy + ry * 0.05, 1.1]];
  bubbles.forEach(([bx, by, br]) => { circle(ctx, bx, by, br); ctx.strokeStyle = rgba(L.hi, 0.75); ctx.lineWidth = 0.6; ctx.stroke(); spec(ctx, bx - br * 0.35, by - br * 0.35, br * 0.3, 0.9); });
  // rim darkening
  path(); ctx.lineWidth = 6; ctx.strokeStyle = rgba(L.lo, 0.55); ctx.stroke();
  // reflected light lower right
  ctx.beginPath(); ctx.ellipse(cx, cy, rx * 0.8, ry * 0.8, 0, 15 * D, 100 * D);
  ctx.strokeStyle = rgba(L.hi, 0.55); ctx.lineWidth = 2; ctx.stroke();
  ctx.restore();
  // glass edge
  path(); ctx.lineWidth = 0.9; ctx.strokeStyle = L.line; ctx.stroke();
  // highlights
  gloss(ctx, cx - rx * 0.4, cy - ry * 0.42, rx * 0.34, ry * 0.2, -0.75, 0.95);
  spec(ctx, cx - rx * 0.52, cy - ry * 0.05, 1.1, 0.8);
}
function glassNeck(ctx, x, y, w, h, L) {
  rr(ctx, x, y, w, h, 1.5);
  ctx.fillStyle = lin(ctx, x, 0, x + w, 0, [[0, shade(L.lo, 0.35)], [0.25, rgba(L.hi, 0.95)], [0.5, shade(L.b, 0.1)], [1, L.lo]]);
  ctx.fill(); ctx.lineWidth = 0.9; ctx.strokeStyle = L.line; ctx.stroke();
}
function glassLip(ctx, x, y, w, h, L) {
  rr(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = lin(ctx, 0, y, 0, y + h, [L.hi, shade(L.a, 0.2), L.lo]); ctx.fill();
  ctx.lineWidth = 0.9; ctx.strokeStyle = L.line; ctx.stroke();
}
function cork(ctx, x, y, w, h) {
  rr(ctx, x, y, w, h, 2);
  ctx.fillStyle = lin(ctx, x, 0, x + w, 0, ['#f0c88a', '#c88a4a', '#7a4a1e']); ctx.fill();
  ctx.lineWidth = 0.9; ctx.strokeStyle = '#3a1f08'; ctx.stroke();
  ell(ctx, x + w / 2, y + 1.2, w / 2 - 0.4, 1.6); ctx.fillStyle = '#f8dcaa'; ctx.fill(); ctx.lineWidth = 0.6; ctx.stroke();
  ctx.fillStyle = 'rgba(80,40,10,0.5)';
  [[0.3, 0.45], [0.65, 0.6], [0.45, 0.8]].forEach(([u, v]) => { circle(ctx, x + w * u, y + h * v, 0.7); ctx.fill(); });
}
function drawPotion(ctx, L, tier) {
  if (tier === 1) {
    glassNeck(ctx, 43.5, 31, 13, 15, L);
    const body = () => circle(ctx, 50, 64, 22);
    glassBody(ctx, body, L, { level: 49, cx: 50, cy: 64, rx: 22, ry: 22 });
    glassLip(ctx, 40.5, 28, 19, 5.5, L);
    cork(ctx, 44, 17, 12, 12.5);
  } else if (tier === 2) {
    glassNeck(ctx, 43.5, 22, 13, 20, L);
    const body = () => {
      ctx.beginPath(); ctx.moveTo(44, 38);
      ctx.bezierCurveTo(44, 50, 21, 56, 21, 72);
      ctx.bezierCurveTo(21, 88, 34, 93, 50, 93);
      ctx.bezierCurveTo(66, 93, 79, 88, 79, 72);
      ctx.bezierCurveTo(79, 56, 56, 50, 56, 38);
      ctx.closePath();
    };
    glassBody(ctx, body, L, { level: 50, cx: 50, cy: 72, rx: 28, ry: 21 });
    glassLip(ctx, 40, 19, 20, 5.5, L);
    // twine
    rr(ctx, 42.5, 31, 15, 3.6, 1.8); ctx.fillStyle = lin(ctx, 0, 31, 0, 34.6, ['#e8c98a', '#9a6a30']); ctx.fill(); ctx.lineWidth = 0.6; ctx.strokeStyle = '#3a2008'; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(57, 33); ctx.quadraticCurveTo(64, 36, 62, 44); ctx.strokeStyle = '#b88a4a'; ctx.lineWidth = 1.3; ctx.stroke();
    // tag
    ctx.save(); ctx.translate(63, 47); ctx.rotate(0.25);
    poly(ctx, [[-4, -3], [3, -3], [5, 0], [3, 3], [-4, 3]]);
    ctx.fillStyle = lin(ctx, -4, -3, 5, 3, ['#fff4d8', '#d8b878']); ctx.fill(); ctx.lineWidth = 0.6; ctx.strokeStyle = '#4a3010'; ctx.stroke();
    ctx.restore();
    cork(ctx, 44.5, 8, 11, 13);
  } else {
    // large ornate flask with gold cage and stopper
    glassNeck(ctx, 43, 20, 14, 14, L);
    const body = () => circle(ctx, 50, 63, 29);
    glassBody(ctx, body, L, { level: 44, cx: 50, cy: 63, rx: 29, ry: 29, bubbles: [[62, 70, 2.4], [58, 80, 1.5], [40, 58, 1.2], [66, 58, 1]] });
    // gold cage
    ctx.save();
    ctx.lineWidth = 2.4; ctx.strokeStyle = M.gold.b;
    const band = () => { ctx.beginPath(); ctx.ellipse(50, 63, 29, 6, 0, 0, Math.PI); };
    band(); ctx.lineWidth = 4.2; ctx.strokeStyle = M.gold.line; ctx.stroke();
    band(); ctx.lineWidth = 2.6; ctx.strokeStyle = lin(ctx, 21, 0, 79, 0, [M.gold.a, M.gold.hi, M.gold.b, M.gold.lo]); ctx.stroke();
    for (const s of [-1, 1]) {
      const rib = () => { ctx.beginPath(); ctx.moveTo(50 + s * 7, 36); ctx.bezierCurveTo(50 + s * 30, 46, 50 + s * 26, 82, 50 + s * 6, 91.5); };
      rib(); ctx.lineWidth = 3.6; ctx.strokeStyle = M.gold.line; ctx.stroke();
      rib(); ctx.lineWidth = 2; ctx.strokeStyle = lin(ctx, 50, 36, 50, 92, [M.gold.hi, M.gold.a, M.gold.b]); ctx.stroke();
    }
    ctx.restore();
    // heart emblem on the band
    heartPath(ctx, 50, 69, 11); ctx.fillStyle = lin(ctx, 44, 64, 56, 75, [M.gold.hi, M.gold.a, M.gold.b]); ctx.fill(); ctx.lineWidth = 0.8; ctx.strokeStyle = M.gold.line; ctx.stroke();
    drawGem(ctx, 50, 68.4, 2.6, L === LIQ.red ? M.red : M.blue, false);
    // collar
    rr(ctx, 36, 29, 28, 7, 3.5); ctx.fillStyle = lin(ctx, 0, 29, 0, 36, [M.gold.hi, M.gold.a, M.gold.b, M.gold.lo]); ctx.fill(); ctx.lineWidth = 0.9; ctx.strokeStyle = M.gold.line; ctx.stroke();
    // stopper
    ctx.beginPath(); ctx.moveTo(42, 21); ctx.quadraticCurveTo(42, 11, 50, 11); ctx.quadraticCurveTo(58, 11, 58, 21); ctx.closePath();
    ctx.fillStyle = lin(ctx, 42, 0, 58, 0, [M.gold.a, M.gold.hi, M.gold.b, M.gold.lo]); ctx.fill(); ctx.lineWidth = 0.9; ctx.strokeStyle = M.gold.line; ctx.stroke();
    rr(ctx, 39.5, 19, 21, 4.5, 2.2); ctx.fillStyle = lin(ctx, 0, 19, 0, 23.5, [M.gold.hi, M.gold.b, M.gold.lo]); ctx.fill(); ctx.stroke();
    drawGem(ctx, 50, 8.5, 4.6, L === LIQ.red ? M.red : M.blue);
  }
}

/* ---------------- crystal ---------------- */
function drawCrystal(ctx, x, by, w, h, g, ang = 0) {
  ctx.save();
  ctx.translate(x, by); ctx.rotate(ang * D);
  const hw = w / 2;
  const T = [0, -h], Lp = [-hw, -h * 0.7], R = [hw, -h * 0.7], BL = [-hw * 0.92, -h * 0.07], BR = [hw * 0.92, -h * 0.07], B = [0, h * 0.04];
  const Mt = [-w * 0.1, -h * 0.66], Mb = [-w * 0.1, -h * 0.02];
  const face = (pts, fill) => { poly(ctx, pts); ctx.fillStyle = fill; ctx.fill(); };
  face([Lp, Mt, Mb, BL], lin(ctx, -hw, 0, 0, 0, [g.a, g.hi]));
  face([Mt, R, BR, Mb], lin(ctx, 0, -h, hw, 0, [g.a, g.b, g.lo]));
  face([T, Lp, Mt], lin(ctx, -hw, -h, 0, -h * 0.7, [g.hi, '#ffffff']));
  face([T, Mt, R], lin(ctx, 0, -h, hw, -h * 0.7, [g.hi, g.a]));
  face([BL, Mb, B], g.b);
  face([Mb, BR, B], g.lo);
  // inner light
  ctx.save();
  poly(ctx, [T, R, BR, B, BL, Lp]); ctx.clip();
  ell(ctx, -hw * 0.1, -h * 0.4, hw * 0.55, h * 0.3);
  ctx.fillStyle = rad(ctx, -hw * 0.1, -h * 0.4, 0, -hw * 0.1, -h * 0.4, h * 0.3, [[0, rgba(g.hi, 0.6)], [1, rgba(g.hi, 0)]]); ctx.fill();
  ctx.restore();
  poly(ctx, [T, R, BR, B, BL, Lp]); ctx.lineWidth = 0.8; ctx.strokeStyle = g.line; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(...T); ctx.lineTo(...Mt); ctx.lineTo(...Mb); ctx.lineTo(...B);
  ctx.moveTo(...Lp); ctx.lineTo(...Mt); ctx.lineTo(...R); ctx.moveTo(...BL); ctx.lineTo(...Mb); ctx.lineTo(...BR);
  ctx.strokeStyle = rgba(g.hi, 0.8); ctx.lineWidth = 0.55; ctx.stroke();
  // glint line
  ctx.beginPath(); ctx.moveTo(-hw * 0.72, -h * 0.62); ctx.lineTo(-hw * 0.7, -h * 0.2);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.restore();
}

const STONE = {
  hp: { hi: '#ffe0d8', a: '#ff6a58', b: '#d0182a', lo: '#4a0210', line: '#2a0008', glow: '#ff3a2a', spark: '#ff8070' },
  sp: { hi: '#e0f6ff', a: '#58b8ff', b: '#1a58d8', lo: '#08145a', line: '#040a30', glow: '#3a9aff', spark: '#80c8ff' },
};
function crystalCluster(ctx, g, s = 1, dy = 0) {
  obj(ctx, (l) => {
    l.translate(50, 50 + dy); l.scale(s, s); l.translate(-50, -50);
    drawCrystal(l, 30, 86, 16, 36, g, -28); drawCrystal(l, 72, 88, 15, 32, g, 26); drawCrystal(l, 50, 90, 26, 76, g, 0);
  }, { glow: g.glow, glowR: 8 });
  sparkle(ctx, 50 + 8 * s, 50 + dy - 24 * s, 5 * s, '#ffffff', g.spark);
  sparkle(ctx, 50 - 22 * s, 50 + dy - 6 * s, 3 * s, '#ffffff', g.spark);
}

/* ---------------- coins ---------------- */
function coinFlat(ctx, x, y, rx, m, emblem = 'star') {
  const ry = rx * 0.42, th = rx * 0.3;
  ctx.beginPath();
  ctx.moveTo(x - rx, y); ctx.lineTo(x - rx, y + th);
  ctx.ellipse(x, y + th, rx, ry, 0, Math.PI, 0, true);
  ctx.lineTo(x + rx, y);
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI, false);
  ctx.closePath();
  ctx.fillStyle = lin(ctx, x - rx, 0, x + rx, 0, [m.a, m.b, m.lo]); ctx.fill();
  ctx.lineWidth = 0.7; ctx.strokeStyle = m.line; ctx.stroke();
  // reeded edge
  ctx.save(); ctx.clip();
  ctx.strokeStyle = rgba(m.lo, 0.6); ctx.lineWidth = 0.4;
  for (let i = -8; i <= 8; i++) { const px = x + (i / 8.6) * rx; ctx.beginPath(); ctx.moveTo(px, y); ctx.lineTo(px, y + th + ry); ctx.stroke(); }
  ctx.restore();
  ell(ctx, x, y, rx, ry);
  ctx.fillStyle = lin(ctx, x - rx, y - ry, x + rx * 0.6, y + ry, [m.hi, m.a, m.b]); ctx.fill();
  ctx.lineWidth = 0.7; ctx.strokeStyle = m.line; ctx.stroke();
  ell(ctx, x, y, rx * 0.74, ry * 0.72); ctx.strokeStyle = rgba(m.lo, 0.6); ctx.lineWidth = 0.7; ctx.stroke();
  coinEmblem(ctx, x, y, rx * 0.36, ry / rx, m, emblem);
}
function coinEmblem(ctx, x, y, r, sy, m, emblem) {
  ctx.save(); ctx.translate(x, y); ctx.scale(1, sy);
  if (emblem === 'hole') {
    rr(ctx, -r * 0.55, -r * 0.55, r * 1.1, r * 1.1, r * 0.1); ctx.fillStyle = m.line; ctx.fill();
    ctx.strokeStyle = rgba(m.hi, 0.7); ctx.lineWidth = 0.6; ctx.stroke();
  } else if (emblem === 'crown') {
    poly(ctx, [[-r, r * 0.55], [-r, -r * 0.35], [-r * 0.5, r * 0.1], [0, -r * 0.7], [r * 0.5, r * 0.1], [r, -r * 0.35], [r, r * 0.55]]);
    ctx.fillStyle = m.b; ctx.fill(); ctx.strokeStyle = m.lo; ctx.lineWidth = 0.6; ctx.stroke();
  } else {
    starPath(ctx, 0, 0, 4, r, r * 0.35, -Math.PI / 2);
    ctx.fillStyle = m.b; ctx.fill(); ctx.strokeStyle = m.lo; ctx.lineWidth = 0.5; ctx.stroke();
  }
  ctx.restore();
}
function coinUp(ctx, x, y, r, m, emblem = 'star', lean = 0) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(lean);
  ell(ctx, r * 0.14, 0, r * 0.98, r);
  ctx.fillStyle = lin(ctx, 0, -r, 0, r, [m.b, m.lo]); ctx.fill(); ctx.lineWidth = 0.7; ctx.strokeStyle = m.line; ctx.stroke();
  circle(ctx, 0, 0, r);
  ctx.fillStyle = rad(ctx, -r * 0.35, -r * 0.4, r * 0.05, 0, 0, r, [[0, m.hi], [0.4, m.a], [1, m.b]]); ctx.fill(); ctx.stroke();
  circle(ctx, 0, 0, r * 0.76); ctx.strokeStyle = rgba(m.lo, 0.65); ctx.lineWidth = r * 0.07; ctx.stroke();
  circle(ctx, 0.3, 0.3, r * 0.76); ctx.strokeStyle = rgba(m.hi, 0.5); ctx.lineWidth = r * 0.03; ctx.stroke();
  coinEmblem(ctx, 0, 0, r * 0.4, 1, m, emblem);
  gloss(ctx, -r * 0.35, -r * 0.45, r * 0.4, r * 0.2, -0.7, 0.7);
  ctx.restore();
}
function coinStack(ctx, x, by, n, rx, m, emblem, jitter = 1) {
  const step = rx * 0.3;
  for (let i = 0; i < n; i++) {
    const jx = Math.sin(i * 2.3 + x) * jitter;
    coinFlat(ctx, x + jx, by - i * step - rx * 0.3, rx, m, emblem);
  }
}

/* ================================================================== */
/* frames                                                               */
/* ================================================================== */
function paintBg(ctx, o) {
  const cx = o.cx ?? 45, cy = o.cy ?? 40;
  ctx.fillStyle = rad(ctx, cx, cy, 1, 50, 50, 80, [[0, o.c[0]], [0.45, o.c[1]], [1, o.c[2]]]);
  ctx.fillRect(0, 0, 100, 100);
  const r = rng(hash(o.seed || 'bg'));
  for (let i = 0; i < 10; i++) {
    const x = r() * 100, y = r() * 100, rr_ = 12 + r() * 26, light = r() < 0.5;
    ctx.fillStyle = rad(ctx, x, y, 0, x, y, rr_, [[0, light ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.13)'], [1, 'rgba(0,0,0,0)']]);
    ctx.fillRect(0, 0, 100, 100);
  }
  if (o.rays) {
    ctx.save();
    ctx.fillStyle = rad(ctx, cx, cy, 0, cx, cy, 85, [[0, rgba(o.rayCol || '#ffffff', o.rayA ?? 0.24)], [1, rgba(o.rayCol || '#ffffff', 0)]]);
    const n = o.rays, off = o.rayRot ?? 0.2;
    for (let i = 0; i < n; i++) {
      const a0 = off + (i / n) * TAU, a1 = a0 + (Math.PI / n) * 0.8;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, 150, a0, a1); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
  // brush-stroke texture: faint diagonal streaks
  ctx.save();
  ctx.globalAlpha = 0.06;
  ctx.strokeStyle = '#ffffff';
  for (let i = 0; i < 14; i++) {
    const x = r() * 120 - 10, y = r() * 120 - 10, l = 10 + r() * 22;
    ctx.lineWidth = 1 + r() * 2.5;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + l * 0.5, y - l * 0.1, x + l, y - l * 0.35); ctx.stroke();
  }
  ctx.restore();
}
function skillFrame(ctx, bg, content) {
  ctx.save();
  rr(ctx, 0.5, 0.5, 99, 99, 10); ctx.clip();
  paintBg(ctx, bg);
  content(ctx);
  // vignette
  ctx.fillStyle = rad(ctx, 46, 42, 24, 50, 50, 76, [[0, 'rgba(0,0,0,0)'], [0.62, 'rgba(0,0,0,0.12)'], [1, 'rgba(0,0,0,0.62)']]);
  ctx.fillRect(0, 0, 100, 100);
  // glossy sheen across the upper-left
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(100, 0); ctx.lineTo(100, 14);
  ctx.bezierCurveTo(70, 26, 34, 34, 0, 50); ctx.closePath();
  ctx.fillStyle = lin(ctx, 0, 0, 22, 46, [[0, 'rgba(255,255,255,0.2)'], [1, 'rgba(255,255,255,0.02)']]); ctx.fill();
  ctx.restore();
  // bevel
  ctx.lineWidth = 3.4;
  ctx.strokeStyle = lin(ctx, 0, 0, 100, 100, [[0, 'rgba(255,255,255,0.75)'], [0.4, 'rgba(255,255,255,0.18)'], [0.6, 'rgba(0,0,0,0.18)'], [1, 'rgba(0,0,0,0.65)']]);
  rr(ctx, 3.2, 3.2, 93.6, 93.6, 8); ctx.stroke();
  ctx.lineWidth = 0.9; ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  rr(ctx, 5.1, 5.1, 89.8, 89.8, 6.5); ctx.stroke();
  ctx.lineWidth = 2; ctx.strokeStyle = '#140a08';
  rr(ctx, 1, 1, 98, 98, 10); ctx.stroke();
}
function itemFrame(ctx, glowCol, content) {
  ctx.save();
  rr(ctx, 0.5, 0.5, 99, 99, 9); ctx.clip();
  ctx.fillStyle = rad(ctx, 42, 36, 4, 50, 50, 78, [[0, '#3e3548'], [0.55, '#241e2d'], [1, '#0e0b13']]);
  ctx.fillRect(0, 0, 100, 100);
  // faint diamond tile texture
  ctx.strokeStyle = 'rgba(255,255,255,0.025)'; ctx.lineWidth = 1;
  for (let i = -100; i < 200; i += 12) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + 100, 100); ctx.moveTo(i, 100); ctx.lineTo(i + 100, 0); ctx.stroke(); }
  if (glowCol) {
    ctx.fillStyle = rad(ctx, 50, 52, 0, 50, 52, 46, [[0, rgba(glowCol, 0.42)], [0.6, rgba(glowCol, 0.12)], [1, rgba(glowCol, 0)]]);
    ctx.fillRect(0, 0, 100, 100);
  }
  content(ctx);
  ctx.fillStyle = rad(ctx, 50, 48, 40, 50, 50, 74, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.35)']]);
  ctx.fillRect(0, 0, 100, 100);
  ctx.restore();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = lin(ctx, 0, 0, 100, 100, [[0, 'rgba(255,255,255,0.22)'], [1, 'rgba(255,255,255,0.03)']]);
  rr(ctx, 2, 2, 96, 96, 8); ctx.stroke();
  ctx.lineWidth = 1.4; ctx.strokeStyle = '#07050a';
  rr(ctx, 0.8, 0.8, 98.4, 98.4, 9); ctx.stroke();
}
function buffFrame(ctx, c, debuff, content) {
  ctx.save();
  rr(ctx, 2, 2, 96, 96, 16); ctx.clip();
  ctx.fillStyle = rad(ctx, 40, 34, 2, 50, 50, 74, [[0, c[0]], [0.5, c[1]], [1, c[2]]]);
  ctx.fillRect(0, 0, 100, 100);
  content(ctx);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(100, 0); ctx.lineTo(100, 22); ctx.bezierCurveTo(66, 36, 34, 42, 0, 52); ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,0.16)'; ctx.fill();
  ctx.restore();
  const bm = debuff ? { hi: '#ffb0a0', a: '#ff5a4a', b: '#b0141c', lo: '#4a0206' } : M.gold;
  ctx.lineWidth = 6;
  ctx.strokeStyle = lin(ctx, 0, 0, 100, 100, [bm.hi, bm.a, bm.b, bm.lo]);
  rr(ctx, 5, 5, 90, 90, 13); ctx.stroke();
  ctx.lineWidth = 2.4; ctx.strokeStyle = INK;
  rr(ctx, 1.5, 1.5, 97, 97, 16); ctx.stroke();
  ctx.lineWidth = 1.4; ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  rr(ctx, 8.5, 8.5, 83, 83, 10); ctx.stroke();
}

/* ================================================================== */
/* SKILL ICONS                                                          */
/* ================================================================== */
const SKILLS = {
  attack(ctx) {
    skillFrame(ctx, { c: ['#ffe7a4', '#d4552e', '#3a0c0a'], rays: 12, seed: 'attack', cx: 50, cy: 50 }, () => {
      const sw = { len: 58, w: 10, blade: M.steel, guard: M.gold, grip: '#7a2e16' };
      obj(ctx, (l) => drawSword(l, { ...sw, x: 30, y: 74, ang: 45 }));
      obj(ctx, (l) => drawSword(l, { ...sw, x: 70, y: 74, ang: -45 }));
      sparkle(ctx, 50, 54, 8, '#fffbe0', '#ffd060');
      sparkle(ctx, 50, 54, 4, '#ffffff');
    });
  },

  power_slash(ctx) {
    skillFrame(ctx, { c: ['#ffc070', '#b02818', '#240303'], seed: 'ps', cx: 70, cy: 28 }, () => {
      ctx.save();
      glow(ctx, '#ff6a10', 7);
      swoosh(ctx, 48, 55, 33, 140 * D, 318 * D, 17, { bias: 0.72 });
      ctx.fillStyle = lin(ctx, 18, 82, 76, 26, [[0, 'rgba(255,40,0,0)'], [0.3, '#ff4a10'], [0.7, '#ffa228'], [1, '#fff2a8']]);
      ctx.fill();
      noGlow(ctx);
      swoosh(ctx, 48, 55, 35, 175 * D, 318 * D, 6, { bias: 0.78 });
      ctx.fillStyle = lin(ctx, 16, 60, 76, 26, [[0, 'rgba(255,255,220,0)'], [1, 'rgba(255,255,235,0.95)']]);
      ctx.fill();
      swoosh(ctx, 50, 57, 24, 170 * D, 300 * D, 5, { bias: 0.7 });
      ctx.fillStyle = 'rgba(255,200,90,0.55)'; ctx.fill();
      ctx.restore();
      const r = rng(7);
      for (let i = 0; i < 9; i++) {
        const a = (150 + r() * 160) * D, rr_ = 38 + r() * 12;
        const x = 48 + Math.cos(a) * rr_, y = 55 + Math.sin(a) * rr_;
        ctx.save(); glow(ctx, '#ff8a20', 3); circle(ctx, x, y, 0.8 + r() * 1.3); ctx.fillStyle = '#ffe28a'; ctx.fill(); ctx.restore();
      }
      obj(ctx, (l) => drawSword(l, { x: 35, y: 71, ang: 40, len: 52, w: 10, blade: M.steel, guard: M.gold, grip: '#6a2410', fuller: true }));
      sparkle(ctx, 71, 29, 7, '#fffbe8', '#ffb040');
    });
  },

  mighty_blow(ctx) {
    skillFrame(ctx, { c: ['#fff4c0', '#f0922e', '#5a1c06'], seed: 'mb', cx: 50, cy: 60, rays: 10, rayA: 0.2, rayRot: -0.1 }, () => {
      // ground slab
      const top = () => { ctx.beginPath(); ctx.moveTo(0, 71); ctx.bezierCurveTo(30, 65, 70, 65, 100, 71); };
      top(); ctx.lineTo(100, 100); ctx.lineTo(0, 100); ctx.closePath();
      ctx.fillStyle = lin(ctx, 0, 66, 0, 100, ['#7a5a40', '#3e2616', '#160a04']); ctx.fill();
      // rock strata
      ctx.save(); ctx.clip();
      ctx.strokeStyle = 'rgba(20,8,2,0.45)'; ctx.lineWidth = 1.2;
      [[0, 86, 40, 83, 100, 88], [0, 95, 60, 92, 100, 96]].forEach(([a, b, c, d, e, f]) => { ctx.beginPath(); ctx.moveTo(a, b); ctx.quadraticCurveTo(c, d, e, f); ctx.stroke(); });
      ctx.restore();
      top(); ctx.strokeStyle = '#1a0a04'; ctx.lineWidth = 2; ctx.stroke();
      top(); ctx.strokeStyle = 'rgba(255,220,160,0.75)'; ctx.lineWidth = 1; ctx.stroke();
      // glowing cracks
      const r = rng(11);
      const cracks = [];
      for (let i = 0; i < 6; i++) {
        const a = (i / 5) * Math.PI * 0.9 + 0.15 + (r() - 0.5) * 0.2;
        let x = 50, y = 77;
        const pts = [[x, y]];
        const segs = 2 + Math.floor(r() * 2);
        for (let s = 0; s < segs; s++) {
          const l = 5 + r() * 5, aa = a + (r() - 0.5) * 0.9;
          x += Math.cos(aa) * l * 1.25; y += Math.sin(aa) * l * 0.45 + 0.5;
          pts.push([x, y]);
        }
        cracks.push(pts);
      }
      ctx.save();
      glow(ctx, '#ff9a10', 2.5);
      cracks.forEach((pts) => { ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.strokeStyle = '#ffc83a'; ctx.lineWidth = 2; ctx.stroke(); });
      noGlow(ctx);
      cracks.forEach((pts) => { ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.strokeStyle = '#3a1404'; ctx.lineWidth = 0.9; ctx.stroke(); });
      ctx.restore();
      // shockwave back half
      const ring = (rx, ry, from, to, col, w) => { ctx.beginPath(); ctx.ellipse(50, 77, rx, ry, 0, from, to); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke(); };
      ctx.save(); glow(ctx, 'rgba(255,200,40,0.8)', 3);
      ring(42, 10, Math.PI, TAU, 'rgba(255,230,90,0.9)', 2.4);
      ring(26, 6, Math.PI, TAU, 'rgba(255,250,200,0.9)', 1.5);
      ctx.restore();
      // speed lines
      ctx.save();
      [[33, 6, 40], [67, 8, 42], [27, 16, 34], [73, 14, 36], [40, 2, 22], [60, 4, 24]].forEach(([x, y0, y1]) => {
        ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1);
        ctx.strokeStyle = lin(ctx, 0, y0, 0, y1, ['rgba(255,255,255,0)', 'rgba(255,255,255,0.8)']); ctx.lineWidth = 1.6; ctx.stroke();
      });
      ctx.restore();
      obj(ctx, (l) => drawSword(l, { x: 50, y: 31, ang: 180, len: 46, w: 12, blade: M.steel, guard: M.gold, grip: '#6a2a14', gw: 14, fuller: true }));
      // shockwave front half + flash
      ctx.save(); glow(ctx, 'rgba(255,200,40,0.8)', 3);
      ring(42, 10, 0, Math.PI, 'rgba(255,236,110,0.95)', 2.6);
      ring(26, 6, 0, Math.PI, 'rgba(255,255,220,0.95)', 1.7);
      ctx.restore();
      starPath(ctx, 50, 77, 8, 12, 3.6, -Math.PI / 2);
      ctx.save(); glow(ctx, '#ffe060', 4); ctx.fillStyle = rad(ctx, 50, 77, 0, 50, 77, 13, [[0, '#ffffff'], [0.5, '#fff2a0'], [1, 'rgba(255,200,60,0.4)']]); ctx.fill(); ctx.restore();
      // debris
      const rock = (x, y, s, a) => {
        ctx.save(); ctx.translate(x, y); ctx.rotate(a);
        poly(ctx, [[-s, -s * 0.4], [-s * 0.3, -s], [s * 0.8, -s * 0.6], [s, s * 0.3], [s * 0.1, s], [-s * 0.8, s * 0.6]]);
        ctx.fillStyle = lin(ctx, -s, -s, s, s, ['#d8a870', '#7a4a22', '#3a1c08']); ctx.fill();
        ctx.lineWidth = 0.9; ctx.strokeStyle = '#1e0e04'; ctx.stroke(); ctx.restore();
      };
      rock(20, 60, 4, 0.3); rock(81, 56, 4.6, 1.2); rock(29, 48, 2.6, 0.8); rock(73, 44, 2.8, 2); rock(13, 70, 2.4, 0.1); rock(88, 67, 2.2, 1.7);
    });
  },

  whirlwind(ctx) {
    skillFrame(ctx, { c: ['#e8faff', '#3a8ee6', '#071640'], seed: 'ww', cx: 50, cy: 50 }, () => {
      const cx = 50, cy = 52;
      ctx.save();
      circle(ctx, cx, cy, 39); ctx.strokeStyle = 'rgba(200,240,255,0.35)'; ctx.lineWidth = 1.4; ctx.stroke();
      glow(ctx, '#9fe0ff', 5);
      for (let i = 0; i < 3; i++) {
        const a = (i * 120 - 20) * D;
        swoosh(ctx, cx, cy, 38, a, a + 105 * D, 7.5, { bias: 0.75 });
        ctx.fillStyle = 'rgba(235,250,255,0.92)'; ctx.fill();
        swoosh(ctx, cx, cy, 29, a + 60 * D, a + 150 * D, 5.5, { bias: 0.75 });
        ctx.fillStyle = 'rgba(150,225,255,0.8)'; ctx.fill();
        swoosh(ctx, cx, cy, 20, a + 20 * D, a + 95 * D, 3.5, { bias: 0.75 });
        ctx.fillStyle = 'rgba(200,245,255,0.7)'; ctx.fill();
      }
      ctx.restore();
      // spinning blade: ghosts then the sword
      const swordAt = (deg) => {
        const a = deg * D, dir = [Math.sin(a), -Math.cos(a)];
        return { x: cx - dir[0] * 17, y: cy - dir[1] * 17, ang: deg, len: 50, w: 10, blade: M.steel, guard: M.gold, grip: '#243a7a', fuller: true };
      };
      ghost(ctx, (l) => drawSword(l, swordAt(0)), '#dff6ff', 0.18);
      ghost(ctx, (l) => drawSword(l, swordAt(28)), '#dff6ff', 0.32);
      obj(ctx, (l) => drawSword(l, swordAt(58)));
      ctx.save(); glow(ctx, '#ffffff', 5);
      swoosh(ctx, cx, cy, 34, -120 * D, -35 * D, 5, { bias: 0.85 }); ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fill();
      ctx.restore();
      sparkle(ctx, 22, 24, 4.5, '#ffffff', '#a0e0ff');
      sparkle(ctx, 80, 78, 3.5, '#ffffff', '#a0e0ff');
    });
  },

  leap_strike(ctx) {
    skillFrame(ctx, { c: ['#ffb060', '#d04a3a', '#34082e'], seed: 'ls', cx: 56, cy: 46 }, () => {
      // sun
      ctx.save(); glow(ctx, '#ffe080', 12);
      circle(ctx, 56, 47, 21); ctx.fillStyle = rad(ctx, 52, 42, 2, 56, 47, 21, ['#ffffff', '#fff6c8', '#ffc860']); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,120,60,0.35)'; ctx.lineWidth = 1.4;
      [40, 50, 58].forEach((y) => { ctx.beginPath(); ctx.moveTo(30, y); ctx.lineTo(82, y); ctx.stroke(); });
      // distant hills
      ctx.beginPath(); ctx.moveTo(0, 86); ctx.quadraticCurveTo(20, 74, 40, 84); ctx.quadraticCurveTo(62, 72, 82, 82); ctx.quadraticCurveTo(92, 78, 100, 80); ctx.lineTo(100, 100); ctx.lineTo(0, 100); ctx.closePath();
      ctx.fillStyle = lin(ctx, 0, 72, 0, 100, ['#6a2860', '#2a0c2a']); ctx.fill();
      // golden motion streaks
      ctx.save(); glow(ctx, '#ffc830', 3);
      [[4, 92, 36, 66, 2.6], [12, 99, 42, 74, 2], [0, 78, 30, 58, 1.8], [18, 100, 46, 80, 1.4], [2, 64, 24, 50, 1.2]].forEach(([x0, y0, x1, y1, w]) => {
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
        ctx.strokeStyle = lin(ctx, x0, y0, x1, y1, ['rgba(255,210,70,0)', 'rgba(255,236,140,1)']); ctx.lineWidth = w; ctx.stroke();
      });
      ctx.restore();
      const sil = '#240c2c';
      obj(ctx, (l) => {
        l.fillStyle = sil; l.strokeStyle = sil;
        // cape
        l.beginPath(); l.moveTo(55, 41); l.bezierCurveTo(44, 36, 34, 38, 26, 46); l.quadraticCurveTo(34, 45, 36, 50); l.quadraticCurveTo(40, 47, 46, 54); l.closePath(); l.fill();
        // legs
        l.lineWidth = 6.5;
        l.beginPath(); l.moveTo(47, 58); l.lineTo(60, 59); l.lineTo(63, 71); l.stroke();
        l.beginPath(); l.moveTo(45, 59); l.lineTo(37, 69); l.lineTo(26, 72); l.stroke();
        l.lineWidth = 4.5;
        l.beginPath(); l.moveTo(63, 71); l.lineTo(67, 72); l.stroke();
        l.beginPath(); l.moveTo(26, 72); l.lineTo(23, 75); l.stroke();
        // torso
        poly(l, [[51, 39], [60, 43], [51, 60], [42, 57]]); l.fill();
        l.lineWidth = 3; l.stroke();
        // arms up to the hilt
        l.lineWidth = 4.8;
        l.beginPath(); l.moveTo(57, 43); l.lineTo(64, 36); l.lineTo(61, 27); l.stroke();
        l.beginPath(); l.moveTo(53, 42); l.lineTo(57, 33); l.lineTo(60, 27); l.stroke();
        // head
        circle(l, 58, 34, 6.4); l.fill();
        // hilt silhouette
        l.save(); l.translate(61, 27); l.rotate(-52 * D);
        rr(l, -1.8, 0, 3.6, 8, 1); l.fill();
        rr(l, -7, -1.8, 14, 3.6, 1.8); l.fill();
        l.restore();
      }, { ow: 1.3, oc: '#ffd86a', glow: '#ffb830', glowR: 6, shadow: false });
      // glowing golden blade
      obj(ctx, (l) => {
        l.save(); l.translate(61, 27); l.rotate(-52 * D);
        l.beginPath(); l.moveTo(-3.2, -1.5); l.lineTo(-2.6, -27); l.lineTo(0, -34); l.lineTo(2.6, -27); l.lineTo(3.2, -1.5); l.closePath();
        l.fillStyle = lin(l, -3, 0, 3, 0, ['#fffbe0', '#ffffff', '#ffd860', '#c07a10']); l.fill();
        l.restore();
      }, { ow: 1.2, oc: '#5a2a04', glow: '#ffd040', glowR: 7, shadow: false });
      sparkle(ctx, 36, 8, 6.5, '#ffffff', '#ffd060');
    });
  },

  provoke(ctx) {
    skillFrame(ctx, { c: ['#ffc080', '#e02a1a', '#360404'], seed: 'pv', rays: 14, rayA: 0.3, cx: 50, cy: 52 }, () => {
      // roaring aura
      ctx.save(); glow(ctx, '#ff3010', 8);
      starPath(ctx, 50, 54, 14, 46, 29, -Math.PI / 2 + 0.1);
      ctx.fillStyle = rad(ctx, 50, 54, 10, 50, 54, 46, [[0, '#ffe070'], [0.55, '#ff6a20'], [1, 'rgba(210,20,10,0.9)']]); ctx.fill();
      noGlow(ctx);
      starPath(ctx, 50, 54, 14, 38, 27, -Math.PI / 2 + 0.32);
      ctx.fillStyle = 'rgba(255,240,150,0.55)'; ctx.fill();
      ctx.restore();
      obj(ctx, (l) => {
        const cx = 50, cy = 56, r = 23;
        // spiky hair
        l.beginPath();
        const hs = [[-24, -2], [-27, -16], [-19, -14], [-20, -30], [-10, -21], [-5, -35], [2, -23], [11, -34], [12, -20], [23, -28], [20, -13], [27, -12], [24, -2]];
        hs.forEach(([x, y], i) => (i ? l.lineTo(cx + x, cy + y) : l.moveTo(cx + x, cy + y)));
        l.closePath();
        l.fillStyle = lin(l, 0, cy - 35, 0, cy, ['#6a2a18', '#2a0e08']); l.fill();
        // face
        ell(l, cx, cy + 1, r, r * 0.98);
        l.fillStyle = rad(l, cx - 8, cy - 8, 2, cx, cy, r * 1.1, [[0, '#ffe0c4'], [0.5, '#ffac80'], [1, '#d85a3a']]); l.fill();
        l.lineWidth = 0.8; l.strokeStyle = '#6a1a0a'; l.stroke();
        // hair fringe over forehead
        l.beginPath(); l.moveTo(cx - 23, cy - 3);
        l.bezierCurveTo(cx - 24, cy - 26, cx + 24, cy - 26, cx + 23, cy - 3);
        [[18, -12], [13, -6], [7, -14], [1, -7], [-5, -15], [-10, -7], [-16, -13], [-20, -4]].forEach(([x, y]) => l.lineTo(cx + x, cy + y));
        l.closePath(); l.fillStyle = lin(l, 0, cy - 24, 0, cy - 4, ['#8a3a20', '#3a1208']); l.fill();
        // angry brows
        l.fillStyle = '#2a0a06';
        poly(l, [[cx - 18, cy - 7], [cx - 3, cy - 1], [cx - 4, cy + 2], [cx - 18, cy - 3]]); l.fill();
        poly(l, [[cx + 18, cy - 7], [cx + 3, cy - 1], [cx + 4, cy + 2], [cx + 18, cy - 3]]); l.fill();
        // eyes (white slits with tiny pupils)
        for (const s of [-1, 1]) {
          l.beginPath(); l.moveTo(cx + s * 16, cy + 0.5); l.lineTo(cx + s * 5, cy + 4); l.quadraticCurveTo(cx + s * 11, cy + 8, cx + s * 16, cy + 3.5); l.closePath();
          l.fillStyle = '#ffffff'; l.fill(); l.lineWidth = 0.8; l.strokeStyle = '#2a0a06'; l.stroke();
          circle(l, cx + s * 10.5, cy + 4.3, 1.5); l.fillStyle = '#1a0404'; l.fill();
        }
        // shouting mouth
        l.beginPath(); l.moveTo(cx - 10, cy + 9); l.quadraticCurveTo(cx, cy + 7, cx + 10, cy + 9);
        l.quadraticCurveTo(cx + 9, cy + 22, cx, cy + 22); l.quadraticCurveTo(cx - 9, cy + 22, cx - 10, cy + 9); l.closePath();
        l.fillStyle = '#5a0a10'; l.fill(); l.lineWidth = 1; l.strokeStyle = '#2a0406'; l.stroke();
        l.save(); l.clip();
        rr(l, cx - 11, cy + 7, 22, 4, 1); l.fillStyle = '#ffffff'; l.fill();
        ell(l, cx, cy + 22, 7, 5); l.fillStyle = '#ff6a6a'; l.fill();
        l.restore();
        // anger vein
        l.save(); l.translate(cx + 15, cy - 22); l.strokeStyle = '#ff1a1a'; l.lineWidth = 2;
        for (let i = 0; i < 4; i++) { l.rotate(Math.PI / 2); l.beginPath(); l.moveTo(1.5, -4.5); l.quadraticCurveTo(1.5, -1.5, 4.5, -1.5); l.stroke(); }
        l.restore();
      }, { ow: 2.3 });
      // shout lines
      ctx.save(); glow(ctx, '#ffe070', 3); ctx.strokeStyle = '#fff6c0'; ctx.lineWidth = 2.2;
      [[-1, 0], [1, 0]].forEach(([s]) => {
        [[-0.35, 30, 40], [0, 31, 42], [0.35, 30, 40]].forEach(([a, r0, r1]) => {
          const an = (s < 0 ? Math.PI : 0) + a * s;
          ctx.beginPath(); ctx.moveTo(50 + Math.cos(an) * r0, 68 + Math.sin(an) * r0); ctx.lineTo(50 + Math.cos(an) * r1, 68 + Math.sin(an) * r1); ctx.stroke();
        });
      });
      ctx.restore();
    });
  },

  iron_skin(ctx) {
    skillFrame(ctx, { c: ['#d4f2ff', '#3a80d0', '#081a40'], seed: 'is', rays: 16, rayA: 0.18, cx: 50, cy: 48 }, () => {
      obj(ctx, (l) => {
        shieldPath(l, 50, 52, 58, 72);
        l.fillStyle = lin(l, 21, 16, 79, 88, [M.steel.hi, M.steel.a, M.steel.b, M.steel.lo]); l.fill();
        l.lineWidth = 0.8; l.strokeStyle = M.steel.line; l.stroke();
        shieldPath(l, 50, 53, 46, 58);
        l.fillStyle = rad(l, 40, 36, 2, 50, 54, 42, [[0, '#b8ecff'], [0.35, '#4aa8ff'], [0.8, '#1a4ac0'], [1, '#0c2470']]); l.fill();
        l.lineWidth = 1; l.strokeStyle = '#0a1a4a'; l.stroke();
        // steel cross bands
        l.save(); shieldPath(l, 50, 53, 46, 58); l.clip();
        rr(l, 45.5, 20, 9, 70, 2); l.fillStyle = lin(l, 45.5, 0, 54.5, 0, [M.steel.a, M.steel.hi, M.steel.b, M.steel.lo]); l.fill(); l.lineWidth = 0.7; l.strokeStyle = M.steel.line; l.stroke();
        rr(l, 22, 44.5, 56, 9, 2); l.fillStyle = lin(l, 0, 44.5, 0, 53.5, [M.steel.hi, M.steel.a, M.steel.b, M.steel.lo]); l.fill(); l.stroke();
        l.restore();
        ball(l, 50, 49, 8.5, M.steel);
        drawGem(l, 50, 49, 4.2, M.blue);
        [[27, 23], [73, 23], [26, 50], [74, 50], [50, 84]].forEach(([x, y]) => rivet(l, x, y, 1.7, M.steel));
        // glossy sheen
        l.save(); shieldPath(l, 50, 52, 58, 72); l.clip();
        l.beginPath(); l.moveTo(18, 14); l.lineTo(60, 14); l.bezierCurveTo(46, 30, 34, 44, 18, 60); l.closePath();
        l.fillStyle = 'rgba(255,255,255,0.28)'; l.fill();
        l.restore();
      }, { glow: '#8fe4ff', glowR: 9 });
      sparkle(ctx, 20, 22, 5, '#ffffff', '#9fe8ff');
      sparkle(ctx, 82, 34, 3.5, '#ffffff', '#9fe8ff');
      sparkle(ctx, 78, 80, 4, '#ffffff', '#9fe8ff');
    });
  },

  berserk(ctx) {
    skillFrame(ctx, { c: ['#ffc050', '#b81c08', '#1e0202'], seed: 'bz', rays: 12, rayA: 0.18, rayCol: '#ffd080', cx: 50, cy: 60 }, () => {
      // flames
      ctx.save(); glow(ctx, '#ff5a00', 8);
      flamePath(ctx, 28, 90, 30, 44); ctx.fillStyle = lin(ctx, 0, 90, 0, 46, ['#ffcc40', '#ff5a10', 'rgba(200,20,0,0.9)']); ctx.fill();
      flamePath(ctx, 72, 90, 30, 48); ctx.fill();
      flamePath(ctx, 50, 92, 62, 66); ctx.fillStyle = lin(ctx, 0, 92, 0, 26, ['#ffe070', '#ff7a14', '#e02a08', 'rgba(160,10,0,0.85)']); ctx.fill();
      noGlow(ctx);
      flamePath(ctx, 50, 92, 38, 44); ctx.fillStyle = lin(ctx, 0, 92, 0, 48, ['#ffffff', '#fff2a0', 'rgba(255,200,60,0.4)']); ctx.fill();
      ctx.restore();
      obj(ctx, (l) => drawSword(l, { x: 50, y: 40, ang: 0, len: 36, w: 12, blade: M.steel, guard: M.gold, grip: '#3a1008', gw: 18, fuller: true }));
      // fist
      const sk = { hi: '#ffe0c8', a: '#ff9a6a', b: '#e0482a', lo: '#6a1006', line: '#3a0602' };
      obj(ctx, (l) => {
        l.translate(0, 4);
        const fillPart = (g) => { l.fillStyle = g; l.fill(); l.lineWidth = 0.9; l.strokeStyle = sk.line; l.stroke(); };
        // wrist
        rr(l, 39, 78, 22, 24, 5); fillPart(lin(l, 0, 78, 0, 96, [sk.b, sk.lo, '#2a0402']));
        // back of hand
        rr(l, 29, 50, 42, 32, 10); fillPart(rad(l, 40, 56, 2, 50, 66, 30, [sk.hi, sk.a, sk.b, sk.lo]));
        // knuckle row
        for (let i = 0; i < 4; i++) {
          const x = 30.5 + i * 9.8;
          rr(l, x, 43, 9.4, 16, 4.7);
          fillPart(lin(l, x, 43, x + 9.4, 59, [sk.hi, sk.a, sk.b]));
          spec(l, x + 2.8, 46.5, 1.3, 0.8);
        }
        // curled finger row
        for (let i = 0; i < 4; i++) {
          const x = 31.5 + i * 9.4;
          rr(l, x, 57, 8.8, 13, 4);
          fillPart(lin(l, x, 57, x + 8.8, 70, [sk.a, sk.b, sk.lo]));
        }
        // thumb
        capsule(l, 31, 74, 54, 67.5, 5.6);
        fillPart(lin(l, 30, 64, 40, 80, [sk.hi, sk.a, sk.b]));
        ell(l, 52, 67.8, 3, 2.4, -0.3); l.fillStyle = 'rgba(255,230,210,0.7)'; l.fill();
      }, { glow: '#ff4a00', glowR: 5 });
      // embers
      const r = rng(5);
      for (let i = 0; i < 10; i++) {
        const x = 16 + r() * 68, y = 10 + r() * 50;
        ctx.save(); glow(ctx, '#ff7a10', 3); circle(ctx, x, y, 0.6 + r() * 1.1); ctx.fillStyle = '#ffe08a'; ctx.fill(); ctx.restore();
      }
    });
  },

  second_wind(ctx) {
    skillFrame(ctx, { c: ['#f0ffd8', '#46b454', '#06300f'], seed: 'sw', cx: 50, cy: 50, rays: 10, rayA: 0.18 }, () => {
      const windBack = () => {
        ctx.save(); glow(ctx, '#e0fff0', 4);
        swoosh(ctx, 50, 56, 36, 170 * D, 350 * D, 6, { ry: 0.5, rot: -18 * D, bias: 0.6 }); ctx.fillStyle = 'rgba(230,255,240,0.75)'; ctx.fill();
        swoosh(ctx, 50, 50, 28, 200 * D, 330 * D, 4, { ry: 0.45, rot: -18 * D, bias: 0.6 }); ctx.fillStyle = 'rgba(200,255,220,0.6)'; ctx.fill();
        ctx.restore();
      };
      windBack();
      obj(ctx, (l) => {
        heartPath(l, 50, 52, 50);
        l.fillStyle = rad(l, 38, 38, 2, 50, 54, 34, [[0, '#eaffd8'], [0.25, '#7ef06a'], [0.7, '#22a83a'], [1, '#0a5a1a']]); l.fill();
        l.lineWidth = 0.9; l.strokeStyle = '#063a10'; l.stroke();
        l.save(); heartPath(l, 50, 52, 50); l.clip();
        heartPath(l, 53, 56, 44); l.lineWidth = 3; l.strokeStyle = 'rgba(0,60,10,0.35)'; l.stroke();
        l.restore();
        gloss(l, 37, 38, 9, 5.5, -0.7, 0.95);
        spec(l, 62, 38, 1.8, 0.9);
      }, { glow: '#b8ff9a', glowR: 7 });
      ctx.save(); glow(ctx, '#e0fff0', 4);
      swoosh(ctx, 50, 56, 36, -10 * D, 170 * D, 7, { ry: 0.5, rot: -18 * D, bias: 0.4 }); ctx.fillStyle = 'rgba(245,255,250,0.95)'; ctx.fill();
      swoosh(ctx, 84, 36, 7, -60 * D, 200 * D, 2.6, { bias: 0.3 }); ctx.fillStyle = 'rgba(240,255,245,0.9)'; ctx.fill();
      swoosh(ctx, 16, 76, 6, 120 * D, 380 * D, 2.2, { bias: 0.3 }); ctx.fillStyle = 'rgba(240,255,245,0.85)'; ctx.fill();
      ctx.restore();
      // leaves
      const leaf = (x, y, a, s) => {
        obj(ctx, (l) => {
          l.save(); l.translate(x, y); l.rotate(a);
          l.beginPath(); l.moveTo(-s, 0); l.quadraticCurveTo(0, -s * 0.8, s, 0); l.quadraticCurveTo(0, s * 0.8, -s, 0); l.closePath();
          l.fillStyle = lin(l, -s, -s, s, s, ['#d8ff90', '#58c83a', '#1a6a1a']); l.fill();
          l.beginPath(); l.moveTo(-s, 0); l.lineTo(s * 0.8, 0); l.strokeStyle = 'rgba(20,80,20,0.7)'; l.lineWidth = 0.6; l.stroke();
          l.restore();
        }, { ow: 1.4, shadowA: 0.3 });
      };
      leaf(20, 30, -0.6, 6); leaf(80, 70, 0.5, 5); leaf(74, 18, 0.2, 4);
      sparkle(ctx, 28, 80, 3.5, '#ffffff', '#c0ffb0');
      sparkle(ctx, 68, 26, 3, '#ffffff', '#c0ffb0');
    });
  },

  stun_bash(ctx) {
    skillFrame(ctx, { c: ['#fff4a0', '#a050d8', '#1c0838'], seed: 'sb', cx: 36, cy: 64, rays: 14, rayA: 0.24 }, () => {
      // impact burst
      ctx.save(); glow(ctx, '#ffe040', 8);
      starPath(ctx, 35, 65, 11, 27, 11, 0.1);
      ctx.fillStyle = rad(ctx, 35, 65, 0, 35, 65, 27, [[0, '#ffffff'], [0.35, '#fff7a0'], [0.75, '#ffb830'], [1, '#ff7a10']]); ctx.fill();
      noGlow(ctx);
      ctx.lineWidth = 1; ctx.strokeStyle = '#8a3a00'; ctx.stroke();
      starPath(ctx, 35, 65, 9, 14, 6, 0.4);
      ctx.fillStyle = '#ffffff'; ctx.fill();
      ctx.restore();
      obj(ctx, (l) => drawSword(l, { x: 51, y: 49, ang: 45, len: 46, w: 11, blade: M.steel, guard: M.gold, grip: '#5a2410', pommel: M.gold, gem: M.red }));
      // impact lines
      ctx.save(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.8; glow(ctx, '#ffffff', 2);
      [[-150, 30, 40], [-120, 30, 41], [165, 30, 39], [120, 28, 37]].forEach(([a, r0, r1]) => {
        const an = a * D; ctx.beginPath(); ctx.moveTo(35 + Math.cos(an) * r0, 65 + Math.sin(an) * r0); ctx.lineTo(35 + Math.cos(an) * r1, 65 + Math.sin(an) * r1); ctx.stroke();
      });
      ctx.restore();
      // dizzy orbit with stars
      ctx.save();
      ctx.beginPath(); ctx.ellipse(36, 22, 23, 7, -0.12, 0, TAU);
      ctx.setLineDash([3, 2.5]); ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.restore();
      [[15, 23, 5.2, -0.2], [38, 29, 6.5, 0.2], [57, 17, 4.8, 0.5]].forEach(([x, y, s, rot]) => {
        obj(ctx, (l) => {
          starPath(l, x, y, 5, s, s * 0.46, -Math.PI / 2 + rot);
          l.fillStyle = rad(l, x - s * 0.3, y - s * 0.3, 0, x, y, s, ['#ffffff', '#ffe860', '#f0a010']); l.fill();
        }, { ow: 1.4, glow: '#fff0a0', glowR: 4 });
      });
    });
  },

  sit(ctx) {
    skillFrame(ctx, { c: ['#dcfff4', '#3aa89a', '#0a2a38'], seed: 'sit', cx: 50, cy: 54 }, () => {
      // moon
      ctx.save(); glow(ctx, '#fff8c8', 6);
      ctx.beginPath(); ctx.arc(20, 21, 8.5, 0, TAU); ctx.arc(24, 18, 7.5, 0, TAU, true);
      ctx.fillStyle = '#fff6c8'; ctx.fill('evenodd');
      ctx.restore();
      // resting aura
      ell(ctx, 50, 62, 36, 32);
      ctx.fillStyle = rad(ctx, 50, 62, 4, 50, 62, 36, [[0, 'rgba(220,255,245,0.55)'], [1, 'rgba(220,255,245,0)']]); ctx.fill();
      // mat
      ell(ctx, 50, 86, 34, 7);
      ctx.fillStyle = 'rgba(0,30,30,0.35)'; ctx.fill();
      obj(ctx, (l) => {
        // crossed legs
        const pants = '#5a3a86';
        capsule(l, 27, 80, 63, 86, 6.4); l.fillStyle = lin(l, 0, 74, 0, 92, [shade(pants, 0.35), pants, shade(pants, -0.45)]); l.fill(); l.lineWidth = 0.8; l.strokeStyle = shade(pants, -0.7); l.stroke();
        capsule(l, 73, 80, 37, 86, 6.4); l.fill(); l.stroke();
        ell(l, 66, 87, 5, 3.4); l.fillStyle = '#6a3a1a'; l.fill(); l.stroke();
        ell(l, 34, 87, 5, 3.4); l.fill(); l.stroke();
        // torso
        l.beginPath(); l.moveTo(38, 54); l.lineTo(62, 54); l.quadraticCurveTo(66, 66, 64, 78); l.lineTo(36, 78); l.quadraticCurveTo(34, 66, 38, 54); l.closePath();
        l.fillStyle = lin(l, 36, 54, 64, 78, ['#8ad0ff', '#2a7ad8', '#123a8a']); l.fill(); l.lineWidth = 0.8; l.strokeStyle = '#0a1a4a'; l.stroke();
        rr(l, 35.5, 70, 29, 4, 1.5); l.fillStyle = lin(l, 0, 70, 0, 74, ['#e8b060', '#7a4a1a']); l.fill(); l.stroke();
        rr(l, 47.5, 69.5, 5, 5, 1); l.fillStyle = lin(l, 0, 69, 0, 75, [M.gold.hi, M.gold.b]); l.fill(); l.stroke();
        // arms to knees
        capsule(l, 39, 57, 30, 76, 4.3); l.fillStyle = lin(l, 28, 0, 42, 0, ['#8ad0ff', '#2a7ad8']); l.fill(); l.stroke();
        capsule(l, 61, 57, 70, 76, 4.3); l.fillStyle = lin(l, 58, 0, 74, 0, ['#4a9aee', '#1a4aa8']); l.fill(); l.stroke();
        ball(l, 30, 78, 3.8, M.skin); ball(l, 70, 78, 3.8, M.skin);
        drawChibiHead(l, 50, 39, 15, { eyes: 'closed', hair: '#8a4a1e', spikes: 7 });
      });
      // Zz
      const z = (x, y, s, w) => glyphStroke(ctx, () => { ctx.beginPath(); ctx.moveTo(x - s / 2, y - s / 2); ctx.lineTo(x + s / 2, y - s / 2); ctx.lineTo(x - s / 2, y + s / 2); ctx.lineTo(x + s / 2, y + s / 2); }, w, '#ffffff', 'rgba(10,40,50,0.8)');
      ctx.lineJoin = 'round';
      z(73, 36, 6, 1.8); z(83, 24, 8.5, 2.3);
      sparkle(ctx, 30, 36, 3, '#ffffff', '#c0fff0');
    });
  },

  pickup(ctx) {
    skillFrame(ctx, { c: ['#fff4c0', '#d89a2a', '#361a04'], seed: 'pu', rays: 12, rayA: 0.25, cx: 48, cy: 62 }, () => {
      // spilled coins
      obj(ctx, (l) => { coinFlat(l, 22, 88, 8, M.gold); coinFlat(l, 80, 89, 7, M.gold); coinUp(l, 71, 81, 6.5, M.gold, 'star', 0.3); }, { ow: 1.6 });
      // sack
      obj(ctx, (l) => {
        const sack = () => {
          l.beginPath(); l.moveTo(43, 49);
          l.bezierCurveTo(24, 56, 18, 71, 24, 83);
          l.bezierCurveTo(30, 95, 70, 95, 76, 83);
          l.bezierCurveTo(82, 71, 76, 56, 57, 49);
          l.closePath();
        };
        sack(); l.fillStyle = rad(l, 38, 60, 2, 50, 72, 32, [[0, '#ffe2a8'], [0.4, '#d8a060'], [0.85, '#8a5424'], [1, '#4a2a0e']]); l.fill();
        l.lineWidth = 0.9; l.strokeStyle = '#2e1606'; l.stroke();
        l.save(); sack(); l.clip();
        l.strokeStyle = 'rgba(90,50,16,0.45)'; l.lineWidth = 0.9;
        [[44, 50, 34, 80], [50, 50, 48, 88], [56, 50, 66, 82], [40, 52, 26, 70]].forEach(([a, b, c, d]) => { l.beginPath(); l.moveTo(a, b); l.quadraticCurveTo((a + c) / 2 - 3, (b + d) / 2, c, d); l.stroke(); });
        l.restore();
        // coin emblem
        circle(l, 52, 72, 8); l.fillStyle = rad(l, 49, 69, 1, 52, 72, 8, [M.gold.hi, M.gold.a, M.gold.b]); l.fill(); l.lineWidth = 0.9; l.strokeStyle = M.gold.line; l.stroke();
        coinEmblem(l, 52, 72, 4, 1, M.gold, 'star');
        // gathered, ruffled top
        l.beginPath(); l.moveTo(43, 50); l.lineTo(33, 34); l.lineTo(39, 36); l.lineTo(41, 28); l.lineTo(47, 33); l.lineTo(51, 26); l.lineTo(55, 33); l.lineTo(61, 28); l.lineTo(62, 36); l.lineTo(68, 34); l.lineTo(57, 50); l.closePath();
        l.fillStyle = lin(l, 34, 26, 66, 50, ['#ffe2a8', '#c88a4a', '#7a4a1a']); l.fill(); l.lineWidth = 0.9; l.strokeStyle = '#2e1606'; l.stroke();
        // drawstring
        rr(l, 40, 47, 20, 4, 2); l.fillStyle = lin(l, 0, 47, 0, 51, ['#ff6a5a', '#a01020']); l.fill(); l.lineWidth = 0.8; l.strokeStyle = '#3a0006'; l.stroke();
        l.beginPath(); l.moveTo(58, 50); l.quadraticCurveTo(64, 56, 62, 62); l.strokeStyle = '#c02030'; l.lineWidth = 1.6; l.stroke();
      });
      // hand reaching down and gripping the gathered top
      obj(ctx, (l) => {
        const sk = M.skin;
        const part = (fill) => { l.fillStyle = fill; l.fill(); l.lineWidth = 0.9; l.strokeStyle = sk.line; l.stroke(); };
        // sleeve going up out of frame
        l.beginPath(); l.moveTo(48, 20); l.lineTo(58, -4); l.lineTo(80, -4); l.lineTo(68, 24); l.closePath();
        part(lin(l, 50, 0, 76, 10, ['#7ac0ff', '#2a64d0', '#10286a']));
        poly(l, [[46, 16], [70, 20], [66, 28], [44, 24]]);
        part(lin(l, 0, 16, 0, 28, [M.gold.hi, M.gold.a, M.gold.b, M.gold.lo]));
        // back of hand
        rr(l, 38, 22, 30, 17, 8);
        part(rad(l, 46, 26, 1, 52, 31, 18, [sk.hi, sk.a, sk.b]));
        // thumb wrapping on the left
        capsule(l, 39, 28, 36, 40, 4.2);
        part(lin(l, 32, 28, 44, 40, [sk.hi, sk.a, sk.b]));
        // four curled fingers in front of the sack top
        for (let i = 0; i < 4; i++) {
          const x = 43 + i * 6.6;
          capsule(l, x, 31, x - 0.6, 42 - Math.abs(i - 1.5) * 0.8, 3.3);
          part(lin(l, x - 3, 0, x + 3, 0, [sk.hi, sk.a, sk.b]));
          spec(l, x - 1.2, 40 - Math.abs(i - 1.5) * 0.8, 0.8, 0.7);
        }
      });
      sparkle(ctx, 20, 30, 5, '#ffffff', '#ffe070');
    });
  },
};

function stoneSkill(g, bg) {
  return (ctx) => skillFrame(ctx, { c: bg, seed: 'stone' + g.glow, rays: 12, rayA: 0.22, cx: 50, cy: 52 }, () => {
    // rising energy motes
    const r = rng(hash(g.glow));
    for (let i = 0; i < 12; i++) {
      const x = 14 + r() * 72, y = 12 + r() * 76;
      ctx.save(); glow(ctx, g.glow, 3); circle(ctx, x, y, 0.7 + r() * 1.3); ctx.fillStyle = g.hi; ctx.fill(); ctx.restore();
    }
    ell(ctx, 50, 86, 30, 6); ctx.fillStyle = rad(ctx, 50, 86, 0, 50, 86, 30, [[0, rgba(g.hi, 0.7)], [1, rgba(g.hi, 0)]]); ctx.fill();
    ctx.save(); glow(ctx, g.glow, 4); ctx.beginPath(); ctx.ellipse(50, 86, 34, 7, 0, 0, TAU); ctx.strokeStyle = rgba(g.hi, 0.9); ctx.lineWidth = 1.6; ctx.stroke(); ctx.restore();
    crystalCluster(ctx, g, 0.9, 1);
    // rising light streaks
    ctx.save(); glow(ctx, g.glow, 3);
    [[14, 80, 52], [86, 78, 46], [22, 40, 22], [80, 36, 18]].forEach(([x, y0, y1]) => {
      ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1);
      ctx.strokeStyle = lin(ctx, 0, y0, 0, y1, [rgba(g.hi, 0), rgba(g.hi, 0.95)]); ctx.lineWidth = 1.8; ctx.stroke();
    });
    ctx.restore();
  });
}
SKILLS.hp_stone_use = stoneSkill(STONE.hp, ['#ffd0c0', '#c42434', '#26040a']);
SKILLS.sp_stone_use = stoneSkill(STONE.sp, ['#d0f0ff', '#2458c8', '#060c30']);

/* ================================================================== */
/* ITEM ICONS                                                           */
/* ================================================================== */
function swordItem(o, glowCol, objOpts = {}) {
  return (ctx) => itemFrame(ctx, glowCol, () => obj(ctx, (l) => drawSword(l, { ang: 45, ...o }), objOpts));
}
function potionItem(L, tier) {
  return (ctx) => itemFrame(ctx, L.glow, () => obj(ctx, (l) => drawPotion(l, L, tier)));
}

/** 3D finger-ring seen from above at an angle: outer wall, top face and the inner far wall */
function ringBand(ctx, cx, cy, rx, ry, depth, inner, m) {
  const irx = rx * inner, iry = ry * inner;
  // outer wall (visible below the top face)
  ctx.beginPath(); ctx.ellipse(cx, cy + depth, rx, ry, 0, 0, TAU); ctx.ellipse(cx, cy, irx, iry, 0, 0, TAU, true);
  ctx.fillStyle = lin(ctx, cx - rx, 0, cx + rx, 0, [m.b, m.a, m.b, m.lo]); ctx.fill('evenodd');
  ctx.lineWidth = 0.9; ctx.strokeStyle = m.line; ctx.stroke();
  ctx.save(); ctx.beginPath(); ctx.ellipse(cx, cy + depth, rx, ry, 0, 0, TAU); ctx.clip();
  ctx.beginPath(); ctx.ellipse(cx, cy + depth, rx, ry, 0, 0.1 * Math.PI, 0.9 * Math.PI); ctx.strokeStyle = rgba(m.hi, 0.5); ctx.lineWidth = 1.4; ctx.stroke();
  ctx.restore();
  // top face
  ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU); ctx.ellipse(cx, cy, irx, iry, 0, 0, TAU, true);
  ctx.fillStyle = lin(ctx, cx - rx, cy - ry, cx + rx * 0.6, cy + ry, [m.hi, m.a, m.b, m.lo]); ctx.fill('evenodd');
  ctx.lineWidth = 0.9; ctx.strokeStyle = m.line; ctx.stroke();
  // far inner wall seen through the hole
  ctx.save(); ctx.beginPath(); ctx.ellipse(cx, cy, irx, iry, 0, 0, TAU); ctx.clip();
  ctx.beginPath(); ctx.ellipse(cx, cy, irx, iry, 0, 0, TAU); ctx.ellipse(cx, cy + depth, irx, iry, 0, 0, TAU, true);
  ctx.fillStyle = lin(ctx, 0, cy - iry, 0, cy - iry + depth, [m.lo, m.b]); ctx.fill('evenodd');
  ctx.restore();
  gloss(ctx, cx - rx * 0.55, cy - ry * 0.55, rx * 0.28, ry * 0.14, -0.6, 0.9);
}

function torsoPath(ctx, o = {}) {
  const sl = o.sleeves ?? true;
  ctx.beginPath();
  ctx.moveTo(40, 14);
  ctx.quadraticCurveTo(50, 22, 60, 14);
  ctx.lineTo(70, 17);
  if (sl) { ctx.lineTo(85, 30); ctx.lineTo(90, 46); ctx.lineTo(78, 50); ctx.lineTo(72, 40); }
  else { ctx.quadraticCurveTo(76, 22, 74, 36); }
  ctx.lineTo(73, 62);
  ctx.quadraticCurveTo(76, 78, 78, 88);
  ctx.quadraticCurveTo(50, 93, 22, 88);
  ctx.quadraticCurveTo(24, 78, 27, 62);
  if (sl) { ctx.lineTo(28, 40); ctx.lineTo(22, 50); ctx.lineTo(10, 46); ctx.lineTo(15, 30); ctx.lineTo(30, 17); }
  else { ctx.lineTo(26, 36); ctx.quadraticCurveTo(24, 22, 30, 17); }
  ctx.closePath();
}

function pantsPath(ctx) {
  ctx.beginPath();
  ctx.moveTo(26, 12); ctx.lineTo(74, 12); ctx.lineTo(76, 30);
  ctx.lineTo(82, 88); ctx.lineTo(58, 90); ctx.lineTo(51, 44); ctx.lineTo(49, 44); ctx.lineTo(42, 90); ctx.lineTo(18, 88); ctx.lineTo(24, 30);
  ctx.closePath();
}

function bootPath(ctx, x, y, s = 1) {
  const P = (px, py) => [x + px * s, y + py * s];
  ctx.beginPath();
  ctx.moveTo(...P(-12, -36));
  ctx.lineTo(...P(10, -36));
  ctx.lineTo(...P(10, -8));
  ctx.quadraticCurveTo(...P(14, -4), ...P(26, -2));
  ctx.quadraticCurveTo(...P(34, 0), ...P(33, 6));
  ctx.lineTo(...P(33, 9));
  ctx.lineTo(...P(-14, 9));
  ctx.lineTo(...P(-14, 0));
  ctx.quadraticCurveTo(...P(-12, -8), ...P(-12, -14));
  ctx.closePath();
}

function glovePath(ctx) {
  // right-hand glove, back view, fingers up
  ctx.beginPath();
  capsuleSub(ctx, 36, 44, 34, 20, 5.4);
  capsuleSub(ctx, 47, 42, 47, 13, 5.6);
  capsuleSub(ctx, 58, 42, 60, 16, 5.4);
  capsuleSub(ctx, 67, 46, 71, 27, 4.8);
  capsuleSub(ctx, 34, 62, 18, 46, 5.4);
  rrPath(ctx, 30, 38, 42, 34, 12);
}
function capsuleSub(ctx, x1, y1, x2, y2, r) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  ctx.moveTo(x2 + Math.cos(a - Math.PI / 2) * r, y2 + Math.sin(a - Math.PI / 2) * r);
  ctx.arc(x2, y2, r, a - Math.PI / 2, a + Math.PI / 2);
  ctx.arc(x1, y1, r, a + Math.PI / 2, a + Math.PI * 1.5);
  ctx.closePath();
}

const ITEMS = {
  hp_potion_s: potionItem(LIQ.red, 1),
  hp_potion_m: potionItem(LIQ.red, 2),
  hp_potion_l: potionItem(LIQ.red, 3),
  sp_potion_s: potionItem(LIQ.blue, 1),
  sp_potion_m: potionItem(LIQ.blue, 2),
  sp_potion_l: potionItem(LIQ.blue, 3),

  hp_stone(ctx) { itemFrame(ctx, STONE.hp.glow, () => crystalCluster(ctx, STONE.hp)); },
  sp_stone(ctx) { itemFrame(ctx, STONE.sp.glow, () => crystalCluster(ctx, STONE.sp)); },

  return_scroll(ctx) {
    itemFrame(ctx, '#7ac8ff', () => {
      obj(ctx, (l) => {
        l.save(); l.translate(50, 52); l.rotate(-35 * D);
        const R = 12, L = 36;
        // body cylinder
        rr(l, -L, -R, L * 2, R * 2, 2);
        l.fillStyle = lin(l, 0, -R, 0, R, [[0, '#fffaf0'], [0.25, '#f8e6b8'], [0.7, '#d8ae6a'], [1, '#8a6228']]); l.fill();
        l.lineWidth = 0.9; l.strokeStyle = M.parch.line; l.stroke();
        // paper edge seam
        l.beginPath(); l.moveTo(-L, R * 0.55); l.lineTo(L, R * 0.55); l.strokeStyle = 'rgba(120,80,30,0.5)'; l.lineWidth = 0.7; l.stroke();
        // rune glow line
        l.save(); glow(l, '#60c0ff', 3);
        l.beginPath(); l.moveTo(-L + 6, -2); l.lineTo(-14, -2); l.moveTo(14, -2); l.lineTo(L - 6, -2);
        l.strokeStyle = 'rgba(60,150,255,0.8)'; l.lineWidth = 1.1; l.setLineDash([3, 2]); l.stroke();
        l.restore();
        // end caps with spiral
        for (const s of [-1, 1]) {
          ell(l, s * L, 0, 4.6, R);
          l.fillStyle = lin(l, s * L - 4, -R, s * L + 4, R, ['#fff4d8', '#d8ae6a', '#8a6228']); l.fill();
          l.lineWidth = 0.9; l.strokeStyle = M.parch.line; l.stroke();
          l.beginPath(); l.ellipse(s * L, 0, 2.6, 7, 0, 0, TAU * 0.8); l.strokeStyle = 'rgba(110,70,20,0.7)'; l.lineWidth = 0.7; l.stroke();
          l.beginPath(); l.ellipse(s * L, 0, 1.2, 3.4, 0, 0, TAU); l.stroke();
        }
        // ribbon band
        rr(l, -5, -R - 0.6, 10, R * 2 + 1.2, 1);
        l.fillStyle = lin(l, -5, 0, 5, 0, ['#ff7a7a', '#d0182a', '#6a0610']); l.fill(); l.lineWidth = 0.8; l.strokeStyle = '#3a0006'; l.stroke();
        // bow tails
        poly(l, [[-2, R], [-8, R + 12], [-4.5, R + 10], [-2.5, R + 14], [1, R]]);
        l.fillStyle = lin(l, -8, R, 1, R + 14, ['#ff5a5a', '#a0101c']); l.fill(); l.stroke();
        poly(l, [[1, R], [7, R + 11], [8, R + 7], [10, R + 10], [3, R - 1]]); l.fill(); l.stroke();
        // loops
        for (const s of [-1, 1]) {
          l.beginPath(); l.moveTo(0, R - 1); l.bezierCurveTo(s * 12, R - 10, s * 14, R + 4, 0, R + 1); l.closePath();
          l.fillStyle = lin(l, 0, R - 8, s * 12, R + 4, ['#ff8a8a', '#d0182a', '#7a0612']); l.fill(); l.stroke();
        }
        ball(l, 0, R, 3, M.red);
        l.restore();
      });
      sparkle(ctx, 76, 28, 4.5, '#ffffff', '#7ac8ff');
    });
  },

  slime_jelly(ctx) {
    itemFrame(ctx, '#6aff5a', () => {
      const blob = (l) => {
        l.beginPath();
        l.moveTo(20, 84);
        l.bezierCurveTo(11, 80, 13, 64, 25, 57);
        l.bezierCurveTo(27, 42, 40, 31, 51, 31);
        l.bezierCurveTo(50, 23, 55, 17, 62, 17);
        l.bezierCurveTo(58, 23, 59, 29, 64, 33);
        l.bezierCurveTo(78, 39, 84, 54, 81, 66);
        l.bezierCurveTo(89, 70, 89, 84, 79, 86);
        l.bezierCurveTo(60, 91, 38, 90, 20, 84);
        l.closePath();
      };
      obj(ctx, (l) => {
        blob(l);
        l.fillStyle = rad(l, 42, 50, 2, 50, 62, 42, [[0, '#e8ffc8'], [0.3, '#8af060'], [0.7, '#2ab43a'], [1, '#0a5a1a']]); l.fill();
        l.save(); blob(l); l.clip();
        ell(l, 52, 88, 36, 10); l.fillStyle = 'rgba(0,70,20,0.45)'; l.fill();
        ell(l, 48, 66, 18, 12); l.fillStyle = rad(l, 48, 66, 0, 48, 66, 18, [[0, 'rgba(230,255,200,0.55)'], [1, 'rgba(230,255,200,0)']]); l.fill();
        blob(l); l.lineWidth = 4; l.strokeStyle = 'rgba(10,90,20,0.45)'; l.stroke();
        l.beginPath(); l.moveTo(70, 80); l.quadraticCurveTo(80, 76, 82, 68); l.strokeStyle = 'rgba(220,255,200,0.6)'; l.lineWidth = 1.8; l.stroke();
        l.restore();
        blob(l); l.lineWidth = 0.9; l.strokeStyle = '#063a10'; l.stroke();
        [[60, 60, 3], [38, 72, 2.2], [66, 74, 1.6], [46, 52, 1.4], [30, 66, 1.2]].forEach(([x, y, r]) => { circle(l, x, y, r); l.strokeStyle = 'rgba(230,255,210,0.8)'; l.lineWidth = 0.7; l.stroke(); spec(l, x - r * 0.35, y - r * 0.35, r * 0.3, 0.9); });
        gloss(l, 38, 46, 10, 5, -0.7, 0.95);
        gloss(l, 58, 24, 3, 1.6, -0.9, 0.9);
        spec(l, 28, 62, 1.6, 0.9);
      });
      obj(ctx, (l) => { l.beginPath(); l.moveTo(86, 80); l.quadraticCurveTo(91, 88, 86, 91); l.quadraticCurveTo(81, 88, 86, 80); l.fillStyle = lin(l, 82, 80, 90, 92, ['#b0ff90', '#2ab43a']); l.fill(); spec(l, 85, 87, 0.8); }, { ow: 1.4 });
    });
  },

  mushroom_spore(ctx) {
    itemFrame(ctx, '#ff6a8a', () => {
      obj(ctx, (l) => {
        // stem stub
        l.beginPath(); l.moveTo(42, 60); l.quadraticCurveTo(40, 76, 43, 86); l.quadraticCurveTo(51, 90, 59, 86); l.quadraticCurveTo(61, 74, 59, 60); l.closePath();
        l.fillStyle = lin(l, 42, 0, 60, 0, ['#fffaf0', '#f0dcb8', '#a88a5a']); l.fill(); l.lineWidth = 0.9; l.strokeStyle = '#4a3418'; l.stroke();
        ell(l, 51, 86, 8, 2.6); l.fillStyle = '#d8c090'; l.fill(); l.stroke();
        // gills underside
        ell(l, 50, 60, 36, 9);
        l.fillStyle = lin(l, 0, 52, 0, 69, ['#fff0d0', '#c8a070']); l.fill(); l.lineWidth = 0.9; l.stroke();
        l.save(); ell(l, 50, 60, 36, 9); l.clip(); l.strokeStyle = 'rgba(120,80,40,0.5)'; l.lineWidth = 0.6;
        for (let i = -9; i <= 9; i++) { l.beginPath(); l.moveTo(50, 58); l.lineTo(50 + i * 4.2, 70); l.stroke(); }
        l.restore();
        // cap
        const cap = () => { l.beginPath(); l.moveTo(13, 58); l.bezierCurveTo(12, 30, 32, 16, 50, 16); l.bezierCurveTo(68, 16, 88, 30, 87, 58); l.bezierCurveTo(74, 64, 26, 64, 13, 58); l.closePath(); };
        cap(); l.fillStyle = rad(l, 36, 26, 2, 50, 44, 44, [[0, '#ffb0a0'], [0.3, '#ff4a3a'], [0.75, '#c01426'], [1, '#5a0410']]); l.fill();
        l.lineWidth = 0.9; l.strokeStyle = '#2e0006'; l.stroke();
        l.save(); cap(); l.clip();
        [[34, 30, 5.5, 4], [56, 24, 4.2, 3], [70, 38, 5, 4], [44, 46, 6, 3.6], [22, 46, 3.6, 3.2], [80, 52, 2.8, 2.4], [62, 52, 3, 2]].forEach(([x, y, rx, ry]) => {
          ell(l, x, y, rx, ry); l.fillStyle = rad(l, x - rx * 0.3, y - ry * 0.3, 0, x, y, rx, ['#ffffff', '#fff0e8', '#e8c8c0']); l.fill();
          l.lineWidth = 0.5; l.strokeStyle = 'rgba(90,0,10,0.5)'; l.stroke();
        });
        l.beginPath(); l.moveTo(13, 58); l.bezierCurveTo(26, 64, 74, 64, 87, 58); l.lineWidth = 4; l.strokeStyle = 'rgba(80,0,10,0.4)'; l.stroke();
        l.restore();
        gloss(l, 30, 26, 10, 4.5, -0.6, 0.8);
      });
      const r = rng(3);
      for (let i = 0; i < 9; i++) {
        const x = 14 + r() * 72, y = 10 + r() * 22 + (i % 3) * 22 * (r() < 0.5 ? 0 : 1);
        if (y > 20 && x > 20 && x < 80 && y < 64) continue;
        ctx.save(); glow(ctx, '#ffe0a0', 3); circle(ctx, x, y, 0.8 + r() * 1.2); ctx.fillStyle = '#fff4c0'; ctx.fill(); ctx.restore();
      }
    });
  },

  bee_honey(ctx) {
    itemFrame(ctx, '#ffb020', () => {
      obj(ctx, (l) => {
        const jar = () => { l.beginPath(); l.moveTo(30, 36); l.lineTo(70, 36); l.bezierCurveTo(82, 42, 82, 60, 80, 76); l.quadraticCurveTo(78, 92, 50, 92); l.quadraticCurveTo(22, 92, 20, 76); l.bezierCurveTo(18, 60, 18, 42, 30, 36); l.closePath(); };
        jar(); l.fillStyle = rad(l, 40, 56, 2, 50, 64, 40, [[0, '#fff4a0'], [0.35, '#ffc21a'], [0.8, '#d07800'], [1, '#6a3000']]); l.fill();
        l.save(); jar(); l.clip();
        l.lineWidth = 5; l.strokeStyle = 'rgba(120,50,0,0.4)'; jar(); l.stroke();
        // label: honeycomb hex
        rr(l, 30, 56, 40, 20, 4); l.fillStyle = lin(l, 0, 56, 0, 76, ['#fff6e0', '#e8d0a0']); l.fill(); l.lineWidth = 0.8; l.strokeStyle = '#6a4010'; l.stroke();
        const hex = (x, y, s) => { l.beginPath(); for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; const px = x + Math.cos(a) * s, py = y + Math.sin(a) * s; i ? l.lineTo(px, py) : l.moveTo(px, py); } l.closePath(); };
        [[44, 64], [51, 60], [51, 68], [58, 64]].forEach(([x, y]) => { hex(x, y, 3.8); l.fillStyle = lin(l, x, y - 4, x, y + 4, ['#ffd84a', '#e08a00']); l.fill(); l.lineWidth = 0.6; l.strokeStyle = '#7a4000'; l.stroke(); });
        l.restore();
        jar(); l.lineWidth = 0.9; l.strokeStyle = '#3a1800'; l.stroke();
        gloss(l, 29, 50, 4, 12, 0.15, 0.85);
        l.beginPath(); l.moveTo(74, 48); l.quadraticCurveTo(77, 64, 72, 82); l.strokeStyle = 'rgba(255,240,180,0.55)'; l.lineWidth = 1.6; l.stroke();
        // cloth lid
        l.beginPath(); l.moveTo(24, 38); l.quadraticCurveTo(22, 24, 34, 20); l.lineTo(66, 20); l.quadraticCurveTo(78, 24, 76, 38);
        l.quadraticCurveTo(72, 44, 68, 38); l.quadraticCurveTo(62, 45, 56, 38); l.quadraticCurveTo(50, 45, 44, 38); l.quadraticCurveTo(38, 45, 32, 38); l.quadraticCurveTo(28, 44, 24, 38); l.closePath();
        l.fillStyle = lin(l, 30, 18, 70, 44, ['#ff8a8a', '#d02030', '#6a0a14']); l.fill(); l.lineWidth = 0.9; l.strokeStyle = '#3a0008'; l.stroke();
        l.save(); l.clip(); l.strokeStyle = 'rgba(255,255,255,0.4)'; l.lineWidth = 2.2;
        for (let i = 0; i < 8; i++) { l.beginPath(); l.moveTo(22 + i * 8, 16); l.lineTo(22 + i * 8, 46); l.stroke(); l.beginPath(); l.moveTo(20, 18 + i * 8); l.lineTo(80, 18 + i * 8); l.stroke(); }
        l.restore();
        // twine
        rr(l, 27, 32, 46, 3.4, 1.7); l.fillStyle = lin(l, 0, 32, 0, 35.4, ['#f0d8a0', '#9a7030']); l.fill(); l.lineWidth = 0.6; l.strokeStyle = '#3a2008'; l.stroke();
        // honey drip over rim
        l.beginPath(); l.moveTo(62, 36); l.quadraticCurveTo(64, 46, 63, 50); l.quadraticCurveTo(66, 54, 68, 50); l.quadraticCurveTo(67, 44, 70, 37); l.closePath();
        l.fillStyle = lin(l, 62, 36, 70, 52, ['#ffe070', '#e89000']); l.fill(); l.lineWidth = 0.7; l.strokeStyle = '#7a3a00'; l.stroke();
        spec(l, 64.5, 46, 0.9);
      });
    });
  },

  bee_stinger(ctx) {
    itemFrame(ctx, '#e8d040', () => {
      obj(ctx, (l) => {
        l.save(); l.translate(31, 71); l.rotate(45 * D);
        // spike: glossy chitin, slightly curved
        const spike = () => { l.beginPath(); l.moveTo(-9, -2); l.bezierCurveTo(-8, -30, -4, -50, 1, -72); l.bezierCurveTo(4, -50, 9, -30, 9, -2); l.closePath(); };
        spike(); l.fillStyle = lin(l, -9, 0, 9, 0, ['#e8c890', '#9a6a3a', '#4a2a16', '#1a0c06']); l.fill();
        l.lineWidth = 0.9; l.strokeStyle = '#140800'; l.stroke();
        l.save(); spike(); l.clip();
        l.fillStyle = lin(l, 0, 0, 0, -72, ['rgba(0,0,0,0)', 'rgba(0,0,0,0)', 'rgba(20,6,0,0.55)']); l.fillRect(-10, -74, 20, 74);
        l.restore();
        l.beginPath(); l.moveTo(-5.2, -6); l.bezierCurveTo(-4.6, -30, -2.2, -48, 0.2, -64); l.strokeStyle = 'rgba(255,250,230,0.85)'; l.lineWidth = 1.3; l.stroke();
        // barbs along the right edge
        l.strokeStyle = '#1a0c04'; l.lineWidth = 1.1;
        for (let i = 0; i < 4; i++) { const y = -24 - i * 10, w = 7.4 - i * 1.4; l.beginPath(); l.moveTo(w - 1, y); l.lineTo(w + 2.2, y + 3.6); l.stroke(); }
        // striped venom sac
        ell(l, 0, 8, 14, 15);
        l.save(); l.clip();
        l.fillStyle = rad(l, -5, 0, 1, 0, 8, 17, ['#fff6b0', '#ffc81a', '#b87000']); l.fillRect(-15, -8, 30, 32);
        l.fillStyle = '#1a1014';
        [[-2, 4], [8, 4], [18, 5]].forEach(([y, h]) => { l.beginPath(); l.moveTo(-15, y); l.quadraticCurveTo(0, y - 4, 15, y); l.lineTo(15, y + h); l.quadraticCurveTo(0, y + h - 4, -15, y + h); l.closePath(); l.fill(); });
        l.restore();
        ell(l, 0, 8, 14, 15); l.lineWidth = 0.9; l.strokeStyle = '#1a0a00'; l.stroke();
        gloss(l, -5, 1, 5, 3, -0.4, 0.95);
        l.restore();
        // venom droplet at the tip
        l.beginPath(); l.moveTo(83, 22); l.quadraticCurveTo(89, 29, 86, 33); l.quadraticCurveTo(81, 35, 81, 29); l.closePath();
        l.fillStyle = lin(l, 80, 22, 88, 34, ['#f0c8ff', '#a040e0', '#5a1090']); l.fill(); spec(l, 83, 29.5, 1);
      });
      sparkle(ctx, 70, 16, 4.5, '#ffffff', '#ffe070');
    });
  },

  boar_tusk(ctx) {
    itemFrame(ctx, '#f0e0b0', () => {
      obj(ctx, (l) => {
        const path = () => swoosh(l, 78, 80, 50, 188 * D, 272 * D, 20, { profile: (t) => Math.pow(1 - t, 0.85) + (t < 0.02 ? 0 : 0) });
        path();
        l.fillStyle = lin(l, 28, 80, 70, 24, [[0, M.ivory.b], [0.4, M.ivory.a], [1, M.ivory.hi]]); l.fill();
        l.save(); path(); l.clip();
        swoosh(l, 78, 80, 43, 188 * D, 272 * D, 10, { profile: (t) => Math.pow(1 - t, 0.9) });
        l.fillStyle = 'rgba(160,130,80,0.35)'; l.fill();
        l.strokeStyle = 'rgba(150,120,70,0.5)'; l.lineWidth = 0.7;
        for (let i = 1; i < 6; i++) { const a = (188 + i * 7) * D; l.beginPath(); l.moveTo(78 + Math.cos(a) * 38, 80 + Math.sin(a) * 38); l.lineTo(78 + Math.cos(a + 0.05) * 62, 80 + Math.sin(a + 0.05) * 62); l.stroke(); }
        swoosh(l, 78, 80, 56, 192 * D, 268 * D, 3, { bias: 0.4 }); l.fillStyle = 'rgba(255,255,255,0.85)'; l.fill();
        l.restore();
        path(); l.lineWidth = 0.9; l.strokeStyle = M.ivory.line; l.stroke();
        // root end
        const a0 = 188 * D, c0 = [78 + Math.cos(a0) * 50, 80 + Math.sin(a0) * 50];
        ell(l, c0[0], c0[1] + 1, 10.5, 4.5, 0.08);
        l.fillStyle = lin(l, c0[0] - 10, c0[1], c0[0] + 10, c0[1] + 4, ['#c89070', '#8a4a30', '#4a2010']); l.fill(); l.lineWidth = 0.8; l.strokeStyle = '#2a1006'; l.stroke();
        ell(l, c0[0], c0[1] + 1, 5, 2, 0.08); l.fillStyle = '#5a2a14'; l.fill();
      });
    });
  },

  boar_hide(ctx) {
    itemFrame(ctx, '#c8844a', () => {
      const pts = [[44, 9], [56, 9], [62, 18], [80, 11], [90, 16], [86, 22], [72, 30], [75, 46], [74, 62], [86, 74], [90, 84], [82, 87], [66, 77], [57, 84], [50, 95], [43, 84], [34, 77], [18, 87], [10, 84], [14, 74], [26, 62], [25, 46], [28, 30], [14, 22], [10, 16], [20, 11], [38, 18]];
      obj(ctx, (l) => {
        smooth(l, pts);
        l.fillStyle = rad(l, 42, 40, 2, 50, 52, 46, [[0, '#e8b47a'], [0.45, '#b0703a'], [0.85, '#6a3a18'], [1, '#3a1c08']]); l.fill();
        l.save(); smooth(l, pts); l.clip();
        // dark bristly spine stripe
        l.beginPath(); l.moveTo(50, 6); l.bezierCurveTo(46, 36, 54, 60, 50, 96);
        l.strokeStyle = 'rgba(40,20,8,0.7)'; l.lineWidth = 12; l.stroke();
        l.strokeStyle = 'rgba(20,8,2,0.5)'; l.lineWidth = 5; l.stroke();
        const r = rng(9);
        for (let i = 0; i < 90; i++) {
          const x = 10 + r() * 80, y = 8 + r() * 86, a = -1.9 + r() * 0.6;
          const dark = r() < 0.55;
          l.beginPath(); l.moveTo(x, y); l.lineTo(x + Math.cos(a) * 4, y + Math.sin(a) * 4);
          l.strokeStyle = dark ? 'rgba(50,24,8,0.55)' : 'rgba(255,220,170,0.35)'; l.lineWidth = 0.8; l.stroke();
        }
        smooth(l, pts); l.lineWidth = 5; l.strokeStyle = 'rgba(40,18,4,0.45)'; l.stroke();
        l.restore();
        smooth(l, pts); l.lineWidth = 0.9; l.strokeStyle = '#2a1204'; l.stroke();
        gloss(l, 38, 32, 10, 4, -0.5, 0.35);
      });
    });
  },

  king_crown_shard(ctx) {
    itemFrame(ctx, '#ffd040', () => {
      obj(ctx, (l) => {
        const shard = [[24, 86], [30, 76], [36, 84], [44, 74], [52, 86], [60, 76], [68, 84], [74, 72], [72, 50], [64, 40], [56, 22], [48, 40], [36, 46], [28, 58]];
        poly(l, shard);
        l.fillStyle = lin(l, 24, 20, 76, 88, [M.gold.hi, M.gold.a, M.gold.b, M.gold.lo]); l.fill();
        l.save(); poly(l, shard); l.clip();
        // engraved band + filigree
        l.beginPath(); l.moveTo(20, 66); l.quadraticCurveTo(50, 60, 80, 64); l.lineTo(80, 70); l.quadraticCurveTo(50, 66, 20, 72); l.closePath();
        l.fillStyle = lin(l, 0, 60, 0, 72, [M.gold.b, M.gold.lo]); l.fill();
        l.strokeStyle = rgba(M.gold.hi, 0.8); l.lineWidth = 0.6; l.beginPath(); l.moveTo(20, 66); l.quadraticCurveTo(50, 60, 80, 64); l.stroke();
        poly(l, [[56, 22], [64, 40], [72, 50], [74, 72], [60, 58], [56, 30]]); l.fillStyle = 'rgba(120,60,0,0.3)'; l.fill();
        poly(l, [[56, 22], [48, 40], [36, 46], [44, 44], [56, 30]]); l.fillStyle = 'rgba(255,255,230,0.5)'; l.fill();
        l.restore();
        poly(l, shard); l.lineWidth = 0.9; l.strokeStyle = M.gold.line; l.stroke();
        ball(l, 56, 19, 4.2, M.gold);
        // ruby
        l.save(); l.translate(52, 51);
        ell(l, 0, 0, 10, 8.4); l.fillStyle = lin(l, -8, -8, 8, 8, [M.gold.hi, M.gold.b, M.gold.lo]); l.fill(); l.lineWidth = 0.8; l.strokeStyle = M.gold.line; l.stroke();
        const gp = [[0, -6.6], [7.6, -2], [5.6, 5], [-5.6, 5], [-7.6, -2]];
        poly(l, gp); l.fillStyle = rad(l, -2, -3, 0, 0, 0, 8, ['#ffd0c8', '#ff3a3a', '#a0081a', '#4a0008']); l.fill(); l.lineWidth = 0.7; l.strokeStyle = '#2a0006'; l.stroke();
        poly(l, [[0, -3.4], [3.6, -0.8], [2.4, 2.6], [-2.4, 2.6], [-3.6, -0.8]]); l.fillStyle = 'rgba(255,120,120,0.55)'; l.fill();
        l.beginPath(); gp.forEach((p, i) => { l.moveTo(p[0], p[1]); l.lineTo([[0, -3.4], [3.6, -0.8], [2.4, 2.6], [-2.4, 2.6], [-3.6, -0.8]][i][0], [[0, -3.4], [3.6, -0.8], [2.4, 2.6], [-2.4, 2.6], [-3.6, -0.8]][i][1]); });
        l.strokeStyle = 'rgba(255,200,200,0.5)'; l.lineWidth = 0.5; l.stroke();
        spec(l, -2.4, -2.8, 1.2);
        l.restore();
        [[34, 64], [70, 62], [42, 78]].forEach(([x, y]) => drawGem(l, x, y, 2.2, M.blue, false));
      });
      sparkle(ctx, 70, 30, 6, '#ffffff', '#ffe070');
      sparkle(ctx, 28, 40, 3.5, '#ffffff', '#ffe070');
    });
  },

  copper(ctx) {
    itemFrame(ctx, '#e08040', () => {
      obj(ctx, (l) => { coinUp(l, 60, 50, 17, M.copper, 'hole', 0.15); coinStack(l, 42, 86, 3, 19, M.copper, 'hole'); });
    });
  },
  silver(ctx) {
    itemFrame(ctx, '#b0c8e8', () => {
      obj(ctx, (l) => { coinUp(l, 66, 44, 15, M.silver, 'star', 0.2); coinStack(l, 64, 88, 3, 15, M.silver, 'star'); coinStack(l, 36, 88, 5, 18, M.silver, 'star'); });
      sparkle(ctx, 24, 30, 4, '#ffffff');
    });
  },
  gold(ctx) {
    itemFrame(ctx, '#ffc020', () => {
      obj(ctx, (l) => {
        coinUp(l, 50, 34, 16, M.gold, 'crown', -0.1);
        coinStack(l, 70, 90, 5, 15, M.gold, 'crown');
        coinStack(l, 32, 90, 7, 17, M.gold, 'crown');
        coinFlat(l, 52, 88, 13, M.gold, 'crown');
      });
      sparkle(ctx, 76, 26, 6, '#ffffff', '#ffe070');
      sparkle(ctx, 20, 30, 3.5, '#ffffff', '#ffe070');
    });
  },

  sword_wood: swordItem({ x: 30, y: 70, len: 60, w: 14, blade: M.wood, guard: M.wood, pommel: M.wood, grip: '#e8dcc0', tip: 'round', style: 'simple', gw: 15, taper: 0.9, gripLen: 14,
    bladeFx: (c, hw, len) => { c.strokeStyle = 'rgba(90,50,16,0.45)'; c.lineWidth = 0.7; [-0.45, 0.1, 0.5].forEach((u) => { c.beginPath(); c.moveTo(u * hw * 2, -2); c.bezierCurveTo(u * hw * 2 + 2, -len * 0.3, u * hw * 2 - 2, -len * 0.6, u * hw * 1.6, -len + 3); c.stroke(); }); },
  }, '#c89050'),
  sword_bronze: swordItem({ x: 29, y: 71, len: 63, w: 12.5, blade: M.bronze, guard: M.bronze, grip: '#6a3a1a', style: 'bar', gw: 14 }, '#e0a050'),
  sword_iron: swordItem({ x: 28, y: 72, len: 66, w: 12, blade: M.iron, guard: M.iron, grip: '#3a2a22', fuller: true, style: 'bar', gw: 14.5 }, '#a0b0c8'),
  sword_knight: swordItem({ x: 28, y: 72, len: 67, w: 11.5, blade: M.steel, guard: M.gold, grip: '#1a3a8a', pommel: M.gold, gem: M.blue, gemGuard: M.blue, style: 'wing', gw: 18, fuller: true }, '#4aa0ff', { glow: '#8ac8ff', glowR: 4, glowA: 0.6 }),
  greatsword_flame(ctx) {
    itemFrame(ctx, '#ff5a10', () => {
      obj(ctx, (l) => drawSword(l, {
        x: 28, y: 72, ang: 45, len: 68, w: 19, blade: M.flame, guard: M.dark, pommel: M.dark, grip: '#5a0a08', gemGuard: M.red, gem: M.red,
        style: 'horn', gw: 18, gripLen: 14, wavy: 1.2, taper: 0.7,
        bladeFx: (c, hw, len) => {
          c.save(); glow(c, '#fff0a0', 3);
          flamePath(c, 0, 2, hw * 1.2, len * 0.62); c.fillStyle = 'rgba(255,240,150,0.55)'; c.fill();
          c.restore();
        },
      }), { glow: '#ff6a10', glowR: 7 });
      const r = rng(21);
      for (let i = 0; i < 8; i++) { const x = 30 + r() * 60, y = 8 + r() * 50; ctx.save(); glow(ctx, '#ff7a10', 3); circle(ctx, x, y, 0.6 + r()); ctx.fillStyle = '#ffe08a'; ctx.fill(); ctx.restore(); }
    });
  },

  armor_cloth(ctx) {
    itemFrame(ctx, '#80c0ff', () => {
      obj(ctx, (l) => {
        torsoPath(l);
        l.fillStyle = rad(l, 38, 30, 2, 50, 50, 50, [[0, '#fffaf0'], [0.4, '#eee0c4'], [0.85, '#b89c70'], [1, '#6a5030']]); l.fill();
        l.save(); torsoPath(l); l.clip();
        // trims
        l.strokeStyle = '#2a8a5a'; l.lineWidth = 3.4;
        l.beginPath(); l.moveTo(18, 87); l.quadraticCurveTo(50, 92, 82, 87); l.stroke();
        l.beginPath(); l.moveTo(8, 45); l.lineTo(22, 50); l.moveTo(92, 45); l.lineTo(78, 50); l.stroke();
        // folds
        l.strokeStyle = 'rgba(110,80,40,0.35)'; l.lineWidth = 1.2;
        [[36, 54, 32, 86], [62, 56, 68, 86], [50, 64, 50, 88]].forEach(([a, b, c, d]) => { l.beginPath(); l.moveTo(a, b); l.quadraticCurveTo((a + c) / 2 + 2, (b + d) / 2, c, d); l.stroke(); });
        l.restore();
        torsoPath(l); l.lineWidth = 0.9; l.strokeStyle = '#3a2810'; l.stroke();
        // neckline V with trim
        l.beginPath(); l.moveTo(40, 14); l.lineTo(50, 32); l.lineTo(60, 14); l.quadraticCurveTo(50, 22, 40, 14); l.closePath();
        l.fillStyle = '#3a2a1a'; l.fill();
        l.beginPath(); l.moveTo(40, 14); l.lineTo(50, 32); l.lineTo(60, 14); l.strokeStyle = '#2a8a5a'; l.lineWidth = 3; l.stroke();
        // rope belt
        l.beginPath(); l.moveTo(26, 60); l.quadraticCurveTo(50, 66, 74, 60); l.strokeStyle = '#6a4a1a'; l.lineWidth = 4.4; l.stroke();
        l.strokeStyle = '#d8b070'; l.lineWidth = 2.6; l.stroke();
        l.beginPath(); l.moveTo(56, 63); l.quadraticCurveTo(58, 72, 55, 78); l.moveTo(58, 63); l.quadraticCurveTo(62, 70, 62, 76); l.strokeStyle = '#b08850'; l.lineWidth = 2; l.stroke();
        gloss(l, 36, 30, 8, 4, -0.5, 0.45);
      });
    });
  },
  armor_leather(ctx) {
    itemFrame(ctx, '#c88a4a', () => {
      obj(ctx, (l) => {
        torsoPath(l, { sleeves: false });
        l.fillStyle = rad(l, 38, 32, 2, 50, 52, 50, [[0, M.leather.hi], [0.35, M.leather.a], [0.8, M.leather.b], [1, M.leather.lo]]); l.fill();
        l.lineWidth = 0.9; l.strokeStyle = M.leather.line; l.stroke();
        stitches(l, () => { l.beginPath(); l.moveTo(30, 22); l.quadraticCurveTo(28, 40, 30, 60); l.quadraticCurveTo(28, 76, 26, 86); });
        stitches(l, () => { l.beginPath(); l.moveTo(70, 22); l.quadraticCurveTo(72, 40, 70, 60); l.quadraticCurveTo(72, 76, 74, 86); });
        // laced front
        l.beginPath(); l.moveTo(40, 14); l.lineTo(50, 40); l.lineTo(60, 14); l.quadraticCurveTo(50, 22, 40, 14); l.fillStyle = '#2a1608'; l.fill();
        l.strokeStyle = '#f0d8a8'; l.lineWidth = 1.1;
        for (let i = 0; i < 4; i++) { const y = 20 + i * 5, w = 8 - i * 1.8; l.beginPath(); l.moveTo(50 - w, y); l.lineTo(50 + w, y + 4); l.moveTo(50 + w, y); l.lineTo(50 - w, y + 4); l.stroke(); }
        // shoulder pads
        for (const s of [-1, 1]) {
          ell(l, 50 + s * 22, 22, 11, 7.5, s * 0.35);
          l.fillStyle = lin(l, 50 + s * 22 - 10, 14, 50 + s * 22 + 10, 30, [M.dleather.hi, M.dleather.a, M.dleather.lo]); l.fill();
          l.lineWidth = 0.9; l.strokeStyle = M.dleather.line; l.stroke();
          rivet(l, 50 + s * 22, 21, 1.5, M.bronze);
        }
        // belt
        l.beginPath(); l.moveTo(26, 62); l.quadraticCurveTo(50, 68, 74, 62); l.lineTo(74.5, 70); l.quadraticCurveTo(50, 76, 25.5, 70); l.closePath();
        l.fillStyle = lin(l, 0, 62, 0, 74, [M.dleather.a, M.dleather.lo]); l.fill(); l.lineWidth = 0.8; l.strokeStyle = M.dleather.line; l.stroke();
        rr(l, 44, 63.5, 12, 10, 2); l.lineWidth = 2.4; l.strokeStyle = M.bronze.b; l.stroke(); l.lineWidth = 0.7; l.strokeStyle = M.bronze.line; l.stroke();
        gloss(l, 38, 36, 9, 5, -0.5, 0.4);
      });
    });
  },
  armor_plate(ctx) {
    itemFrame(ctx, '#ff5a3a', () => {
      const R = M.redMetal, G = M.gold;
      obj(ctx, (l) => {
        // faulds
        for (let i = 2; i >= 0; i--) {
          const y = 68 + i * 7;
          l.beginPath(); l.moveTo(28 - i * 1.5, y); l.quadraticCurveTo(50, y + 6, 72 + i * 1.5, y); l.lineTo(73 + i * 1.5, y + 8); l.quadraticCurveTo(50, y + 14, 27 - i * 1.5, y + 8); l.closePath();
          l.fillStyle = lin(l, 0, y, 0, y + 12, [R.a, R.b, R.lo]); l.fill(); l.lineWidth = 0.8; l.strokeStyle = R.line; l.stroke();
          l.beginPath(); l.moveTo(27 - i * 1.5, y + 7.4); l.quadraticCurveTo(50, y + 13.4, 73 + i * 1.5, y + 7.4); l.strokeStyle = G.b; l.lineWidth = 1.6; l.stroke();
        }
        // breastplate
        const bp = () => { l.beginPath(); l.moveTo(30, 20); l.quadraticCurveTo(50, 28, 70, 20); l.quadraticCurveTo(80, 44, 72, 72); l.quadraticCurveTo(50, 80, 28, 72); l.quadraticCurveTo(20, 44, 30, 20); l.closePath(); };
        bp(); l.fillStyle = rad(l, 40, 36, 2, 50, 48, 40, [[0, R.hi], [0.3, R.a], [0.75, R.b], [1, R.lo]]); l.fill();
        l.save(); bp(); l.clip();
        poly(l, [[50, 20], [80, 20], [80, 80], [50, 80]]); l.fillStyle = 'rgba(60,0,0,0.25)'; l.fill();
        l.beginPath(); l.moveTo(50, 26); l.lineTo(50, 78); l.strokeStyle = rgba(R.hi, 0.7); l.lineWidth = 1; l.stroke();
        l.restore();
        bp(); l.lineWidth = 3.2; l.strokeStyle = G.b; l.stroke(); l.lineWidth = 1.2; l.strokeStyle = G.hi; l.stroke();
        bp(); l.lineWidth = 0.6; l.strokeStyle = G.line; l.stroke();
        // gold sunburst emblem
        starPath(l, 50, 48, 8, 9, 4.5, -Math.PI / 2);
        l.fillStyle = lin(l, 42, 40, 58, 56, [G.hi, G.a, G.b]); l.fill(); l.lineWidth = 0.7; l.strokeStyle = G.line; l.stroke();
        drawGem(l, 50, 48, 3.4, M.red);
        // gorget
        l.beginPath(); l.moveTo(34, 14); l.quadraticCurveTo(50, 22, 66, 14); l.lineTo(64, 22); l.quadraticCurveTo(50, 30, 36, 22); l.closePath();
        l.fillStyle = lin(l, 0, 14, 0, 28, [G.hi, G.a, G.b, G.lo]); l.fill(); l.lineWidth = 0.8; l.strokeStyle = G.line; l.stroke();
        // pauldrons (two lames each)
        for (const s of [-1, 1]) {
          for (let k = 1; k >= 0; k--) {
            const cx = 50 + s * (25 + k * 3), cy = 24 + k * 8;
            l.beginPath(); l.ellipse(cx, cy, 15 - k * 2, 10 - k, s * 0.35, Math.PI, TAU); l.closePath();
            l.fillStyle = lin(l, cx - 12, cy - 10, cx + 12, cy + 4, [R.hi, R.a, R.b, R.lo]); l.fill();
            l.lineWidth = 2.2; l.strokeStyle = G.b; l.stroke(); l.lineWidth = 0.6; l.strokeStyle = G.line; l.stroke();
          }
          rivet(l, 50 + s * 25, 19, 1.5, G);
        }
        gloss(l, 38, 36, 8, 4.5, -0.6, 0.7);
      });
    });
  },

  helm_leather(ctx) {
    itemFrame(ctx, '#c88a4a', () => {
      obj(ctx, (l) => {
        const L = M.leather;
        // ear flaps
        for (const s of [-1, 1]) {
          l.beginPath(); l.moveTo(50 + s * 30, 50); l.quadraticCurveTo(50 + s * 33, 70, 50 + s * 26, 80); l.quadraticCurveTo(50 + s * 18, 82, 50 + s * 17, 70); l.lineTo(50 + s * 18, 52); l.closePath();
          l.fillStyle = lin(l, 50 + s * 32, 50, 50 + s * 18, 80, [L.a, L.b, L.lo]); l.fill(); l.lineWidth = 0.9; l.strokeStyle = L.line; l.stroke();
          stitches(l, () => { l.beginPath(); l.moveTo(50 + s * 27, 54); l.quadraticCurveTo(50 + s * 29, 68, 50 + s * 24, 76); });
          l.beginPath(); l.moveTo(50 + s * 22, 80); l.quadraticCurveTo(50 + s * 20, 88, 50 + s * 12, 90); l.strokeStyle = M.dleather.b; l.lineWidth = 2; l.stroke();
        }
        // dome
        const dome = () => { l.beginPath(); l.moveTo(18, 54); l.bezierCurveTo(16, 20, 84, 20, 82, 54); l.quadraticCurveTo(50, 60, 18, 54); l.closePath(); };
        dome(); l.fillStyle = rad(l, 38, 28, 2, 50, 44, 40, [[0, L.hi], [0.35, L.a], [0.8, L.b], [1, L.lo]]); l.fill(); l.lineWidth = 0.9; l.strokeStyle = L.line; l.stroke();
        l.save(); dome(); l.clip();
        l.strokeStyle = rgba(L.lo, 0.8); l.lineWidth = 1.2;
        l.beginPath(); l.moveTo(50, 24); l.lineTo(50, 60); l.moveTo(50, 24); l.quadraticCurveTo(32, 30, 28, 58); l.moveTo(50, 24); l.quadraticCurveTo(68, 30, 72, 58); l.stroke();
        l.restore();
        stitches(l, () => { l.beginPath(); l.moveTo(52, 26); l.lineTo(52, 54); });
        // brim band
        l.beginPath(); l.moveTo(16, 50); l.quadraticCurveTo(50, 58, 84, 50); l.lineTo(84, 58); l.quadraticCurveTo(50, 66, 16, 58); l.closePath();
        l.fillStyle = lin(l, 0, 50, 0, 64, [M.dleather.a, M.dleather.b, M.dleather.lo]); l.fill(); l.lineWidth = 0.9; l.strokeStyle = M.dleather.line; l.stroke();
        stitches(l, () => { l.beginPath(); l.moveTo(18, 54); l.quadraticCurveTo(50, 62, 82, 54); });
        ball(l, 50, 22, 3.2, M.bronze);
        gloss(l, 36, 32, 9, 5, -0.6, 0.6);
      });
    });
  },
  helm_iron(ctx) {
    itemFrame(ctx, '#a0b4d0', () => {
      obj(ctx, (l) => {
        const S = M.iron;
        // cheek guards
        for (const s of [-1, 1]) {
          l.beginPath(); l.moveTo(50 + s * 30, 48); l.lineTo(50 + s * 30, 72); l.quadraticCurveTo(50 + s * 26, 84, 50 + s * 14, 86); l.lineTo(50 + s * 13, 66); l.quadraticCurveTo(50 + s * 18, 58, 50 + s * 16, 50); l.closePath();
          l.fillStyle = lin(l, 50 + s * 30, 48, 50 + s * 12, 86, s < 0 ? [S.hi, S.a, S.b] : [S.a, S.b, S.lo]); l.fill(); l.lineWidth = 0.9; l.strokeStyle = S.line; l.stroke();
          rivet(l, 50 + s * 25, 58, 1.5, S); rivet(l, 50 + s * 23, 74, 1.5, S);
        }
        // dome
        const dome = () => { l.beginPath(); l.moveTo(18, 52); l.bezierCurveTo(16, 12, 84, 12, 82, 52); l.closePath(); };
        dome(); l.fillStyle = rad(l, 36, 26, 2, 50, 42, 42, [[0, S.hi], [0.3, S.a], [0.75, S.b], [1, S.lo]]); l.fill(); l.lineWidth = 0.9; l.strokeStyle = S.line; l.stroke();
        // crest ridge
        l.beginPath(); l.moveTo(50, 17); l.quadraticCurveTo(53, 34, 50, 50); l.quadraticCurveTo(47, 34, 50, 17); l.fillStyle = S.hi; l.fill(); l.lineWidth = 0.6; l.strokeStyle = S.b; l.stroke();
        // brow band with rivets
        l.beginPath(); l.moveTo(16, 48); l.quadraticCurveTo(50, 56, 84, 48); l.lineTo(84, 56); l.quadraticCurveTo(50, 64, 16, 56); l.closePath();
        l.fillStyle = lin(l, 0, 48, 0, 62, [S.hi, S.a, S.b, S.lo]); l.fill(); l.lineWidth = 0.9; l.strokeStyle = S.line; l.stroke();
        [22, 32, 42, 58, 68, 78].forEach((x) => rivet(l, x, 53 + (1 - Math.abs(x - 50) / 34) * 3.2, 1.4, M.bronze));
        // nasal guard
        l.beginPath(); l.moveTo(46, 52); l.lineTo(54, 52); l.lineTo(53, 80); l.quadraticCurveTo(50, 84, 47, 80); l.closePath();
        l.fillStyle = lin(l, 46, 0, 54, 0, [S.hi, S.a, S.lo]); l.fill(); l.lineWidth = 0.9; l.strokeStyle = S.line; l.stroke();
        gloss(l, 34, 30, 10, 5.5, -0.6, 0.85);
      });
    });
  },
  pants_leather(ctx) {
    itemFrame(ctx, '#c88a4a', () => {
      obj(ctx, (l) => {
        const L = M.leather;
        pantsPath(l); l.fillStyle = lin(l, 20, 12, 80, 90, [L.hi, L.a, L.b, L.lo]); l.fill(); l.lineWidth = 0.9; l.strokeStyle = L.line; l.stroke();
        l.save(); pantsPath(l); l.clip();
        poly(l, [[50, 30], [100, 30], [100, 100], [50, 100]]); l.fillStyle = 'rgba(40,16,0,0.18)'; l.fill();
        // knee patches
        rr(l, 22, 58, 16, 14, 4); l.fillStyle = M.dleather.a; l.fill(); l.lineWidth = 0.7; l.strokeStyle = M.dleather.line; l.stroke();
        rr(l, 62, 58, 16, 14, 4); l.fill(); l.stroke();
        l.restore();
        stitches(l, () => { l.beginPath(); l.moveTo(35, 26); l.lineTo(32, 86); l.moveTo(65, 26); l.lineTo(68, 86); });
        stitches(l, () => { rrPath(l, 24, 60, 12, 10, 3); rrPath(l, 64, 60, 12, 10, 3); }, 'rgba(255,230,190,0.6)', 0.7, [1.6, 1.4]);
        // waistband + belt
        rr(l, 25, 12, 50, 10, 2); l.fillStyle = lin(l, 0, 12, 0, 22, [M.dleather.a, M.dleather.lo]); l.fill(); l.lineWidth = 0.8; l.strokeStyle = M.dleather.line; l.stroke();
        rr(l, 44, 11, 12, 12, 2); l.lineWidth = 2.4; l.strokeStyle = M.bronze.b; l.stroke(); l.lineWidth = 0.7; l.strokeStyle = M.bronze.line; l.stroke();
        gloss(l, 34, 36, 5, 12, 0.1, 0.35);
      });
    });
  },
  pants_plate(ctx) {
    itemFrame(ctx, '#a0b4d0', () => {
      obj(ctx, (l) => {
        const S = M.iron, G = M.gold;
        pantsPath(l); l.fillStyle = lin(l, 20, 12, 80, 90, ['#5a4a6a', '#34283e', '#16101c']); l.fill(); l.lineWidth = 0.9; l.strokeStyle = '#0a0a10'; l.stroke();
        for (const s of [-1, 1]) {
          // thigh plate
          const tx = 50 + s * 16;
          l.beginPath(); l.moveTo(tx - 12, 26); l.lineTo(tx + 12, 26); l.lineTo(tx + 11 + s * 2, 56); l.quadraticCurveTo(tx + s, 60, tx - 10 + s * 2, 56); l.closePath();
          l.fillStyle = lin(l, tx - 12, 26, tx + 12, 60, [S.hi, S.a, S.b, S.lo]); l.fill(); l.lineWidth = 1.8; l.strokeStyle = G.b; l.stroke(); l.lineWidth = 0.6; l.strokeStyle = G.line; l.stroke();
          // greave
          const gx = 50 + s * 20;
          l.beginPath(); l.moveTo(gx - 10, 66); l.lineTo(gx + 10, 66); l.lineTo(gx + 11, 88); l.quadraticCurveTo(gx, 91, gx - 11, 88); l.closePath();
          l.fillStyle = lin(l, gx - 10, 66, gx + 10, 90, [S.hi, S.a, S.b, S.lo]); l.fill(); l.lineWidth = 1.8; l.strokeStyle = G.b; l.stroke(); l.lineWidth = 0.6; l.strokeStyle = G.line; l.stroke();
          // knee cop
          ball(l, 50 + s * 18, 62, 7, S); ball(l, 50 + s * 18, 62, 3, G);
        }
        // fauld / waist
        l.beginPath(); l.moveTo(24, 12); l.lineTo(76, 12); l.lineTo(78, 26); l.quadraticCurveTo(50, 32, 22, 26); l.closePath();
        l.fillStyle = lin(l, 0, 12, 0, 30, [S.hi, S.a, S.b, S.lo]); l.fill(); l.lineWidth = 2; l.strokeStyle = G.b; l.stroke(); l.lineWidth = 0.6; l.strokeStyle = G.line; l.stroke();
        drawGem(l, 50, 20, 3.4, M.blue);
        gloss(l, 32, 38, 4, 9, 0.1, 0.7);
      });
    });
  },
  boots_leather(ctx) {
    itemFrame(ctx, '#c88a4a', () => {
      const one = (l, x, y, s, dim) => {
        const L = M.leather;
        bootPath(l, x, y, s);
        l.fillStyle = lin(l, x - 14 * s, y - 36 * s, x + 30 * s, y + 8 * s, dim ? [L.b, L.lo, L.line] : [L.hi, L.a, L.b, L.lo]); l.fill(); l.lineWidth = 0.9; l.strokeStyle = L.line; l.stroke();
        // sole
        rr(l, x - 14.5 * s, y + 5 * s, 48 * s, 4.6 * s, 2 * s); l.fillStyle = '#2a1608'; l.fill();
        // cuff
        rr(l, x - 14 * s, y - 38 * s, 26 * s, 8 * s, 3 * s); l.fillStyle = lin(l, 0, y - 38 * s, 0, y - 30 * s, dim ? [M.dleather.b, M.dleather.lo] : [M.dleather.hi, M.dleather.a, M.dleather.lo]); l.fill(); l.lineWidth = 0.8; l.strokeStyle = M.dleather.line; l.stroke();
        // strap + buckle
        l.beginPath(); l.moveTo(x - 12 * s, y - 14 * s); l.lineTo(x + 11 * s, y - 10 * s); l.lineWidth = 3.4 * s; l.strokeStyle = M.dleather.b; l.stroke();
        rr(l, x - 2 * s, y - 15 * s, 6 * s, 6 * s, 1); l.lineWidth = 1.3; l.strokeStyle = M.bronze.a; l.stroke();
        if (!dim) { stitches(l, () => { l.beginPath(); l.moveTo(x + 8 * s, y - 28 * s); l.lineTo(x + 8 * s, y - 16 * s); }); gloss(l, x - 6 * s, y - 22 * s, 3 * s, 8 * s, 0.1, 0.4); }
      };
      obj(ctx, (l) => { one(l, 56, 72, 0.92, true); one(l, 40, 84, 1, false); });
    });
  },
  boots_plate(ctx) {
    itemFrame(ctx, '#a0b4d0', () => {
      const one = (l, x, y, s, dim) => {
        const S = dim ? { hi: M.steel.a, a: M.steel.b, b: M.steel.lo, lo: '#1a2030' } : M.steel, G = M.gold;
        bootPath(l, x, y, s);
        l.fillStyle = lin(l, x - 14 * s, y - 36 * s, x + 30 * s, y + 8 * s, [S.hi, S.a, S.b, S.lo]); l.fill(); l.lineWidth = 0.9; l.strokeStyle = M.steel.line; l.stroke();
        l.save(); bootPath(l, x, y, s); l.clip();
        l.strokeStyle = rgba(M.steel.line, 0.8); l.lineWidth = 0.9;
        for (let i = 0; i < 3; i++) { l.beginPath(); l.moveTo(x + (12 + i * 6) * s, y - (6 - i * 1.5) * s); l.quadraticCurveTo(x + (15 + i * 6) * s, y + 2 * s, x + (12 + i * 6) * s, y + 9 * s); l.stroke(); }
        l.beginPath(); l.moveTo(x - 14 * s, y - 20 * s); l.lineTo(x + 10 * s, y - 20 * s); l.stroke();
        l.restore();
        // gold trims
        rr(l, x - 14 * s, y - 39 * s, 26 * s, 6 * s, 2 * s); l.fillStyle = lin(l, 0, y - 39 * s, 0, y - 33 * s, [G.hi, G.a, G.b]); l.fill(); l.lineWidth = 0.8; l.strokeStyle = G.line; l.stroke();
        rr(l, x - 15 * s, y + 5 * s, 49 * s, 5 * s, 2 * s); l.fillStyle = lin(l, 0, y + 5 * s, 0, y + 10 * s, [G.a, G.lo]); l.fill(); l.stroke();
        ball(l, x - 1 * s, y - 8 * s, 4.5 * s, G);
        if (!dim) gloss(l, x - 6 * s, y - 24 * s, 3 * s, 8 * s, 0.1, 0.7);
      };
      obj(ctx, (l) => { one(l, 56, 72, 0.92, true); one(l, 40, 84, 1, false); });
    });
  },
  gloves_leather(ctx) {
    itemFrame(ctx, '#c88a4a', () => {
      obj(ctx, (l) => {
        const L = M.leather;
        glovePath(l); l.fillStyle = rad(l, 40, 36, 2, 50, 50, 44, [[0, L.hi], [0.35, L.a], [0.8, L.b], [1, L.lo]]); l.fill('nonzero');
        l.strokeStyle = rgba(L.line, 0.8); l.lineWidth = 0.9;
        [[41.5, 44, 41, 20], [52.5, 43, 53, 20], [63, 45, 65, 30]].forEach(([a, b, c, d]) => { l.beginPath(); l.moveTo(a, b); l.lineTo(c, d); l.stroke(); });
        l.beginPath(); l.moveTo(34, 64); l.quadraticCurveTo(38, 56, 34, 50); l.stroke();
        // knuckle stitches
        stitches(l, () => { l.beginPath(); l.moveTo(34, 46); l.quadraticCurveTo(52, 42, 70, 48); });
        // cuff
        l.beginPath(); l.moveTo(30, 68); l.lineTo(72, 68); l.lineTo(78, 92); l.quadraticCurveTo(52, 96, 26, 92); l.closePath();
        l.fillStyle = lin(l, 26, 68, 78, 92, [M.dleather.hi, M.dleather.a, M.dleather.b, M.dleather.lo]); l.fill(); l.lineWidth = 0.9; l.strokeStyle = M.dleather.line; l.stroke();
        stitches(l, () => { l.beginPath(); l.moveTo(30, 73); l.lineTo(73, 73); });
        rivet(l, 70, 82, 1.8, M.bronze);
        gloss(l, 42, 48, 8, 4, -0.4, 0.45);
      });
    });
  },
  gloves_plate(ctx) {
    itemFrame(ctx, '#a0b4d0', () => {
      obj(ctx, (l) => {
        const S = M.steel, G = M.gold;
        glovePath(l); l.fillStyle = rad(l, 40, 36, 2, 50, 50, 44, [[0, S.hi], [0.35, S.a], [0.8, S.b], [1, S.lo]]); l.fill();
        l.strokeStyle = rgba(S.line, 0.85); l.lineWidth = 0.9;
        [[41.5, 44, 41, 20], [52.5, 43, 53, 20], [63, 45, 65, 30]].forEach(([a, b, c, d]) => { l.beginPath(); l.moveTo(a, b); l.lineTo(c, d); l.stroke(); });
        // finger lames
        [[36, 44, 34, 20], [47, 42, 47, 13], [58, 42, 60, 16], [67, 46, 71, 27]].forEach(([x1, y1, x2, y2]) => {
          for (let t = 0.3; t < 1; t += 0.3) { const x = x1 + (x2 - x1) * t, y = y1 + (y2 - y1) * t; l.beginPath(); l.moveTo(x - 4.5, y + 1); l.quadraticCurveTo(x, y - 1.5, x + 4.5, y + 1); l.stroke(); }
        });
        // knuckle plate
        l.beginPath(); l.moveTo(30, 44); l.quadraticCurveTo(52, 36, 72, 46); l.lineTo(72, 56); l.quadraticCurveTo(52, 48, 30, 56); l.closePath();
        l.fillStyle = lin(l, 0, 40, 0, 58, [G.hi, G.a, G.b, G.lo]); l.fill(); l.lineWidth = 0.8; l.strokeStyle = G.line; l.stroke();
        [37, 46, 55, 64].forEach((x) => rivet(l, x, 49 - (x - 30) * 0.02, 1.4, S));
        // flared cuff
        l.beginPath(); l.moveTo(30, 66); l.lineTo(72, 66); l.lineTo(82, 92); l.quadraticCurveTo(52, 97, 22, 92); l.closePath();
        l.fillStyle = lin(l, 22, 66, 82, 92, [S.hi, S.a, S.b, S.lo]); l.fill(); l.lineWidth = 2.2; l.strokeStyle = G.b; l.stroke(); l.lineWidth = 0.6; l.strokeStyle = G.line; l.stroke();
        drawGem(l, 52, 80, 3.6, M.blue);
        gloss(l, 40, 30, 5, 3, -0.4, 0.8);
      });
    });
  },
  ring_copper(ctx) {
    itemFrame(ctx, '#e08040', () => {
      obj(ctx, (l) => {
        const m = M.copper;
        ringBand(l, 50, 54, 32, 24, 8, 0.72, m);
        // engraved runes on the top face
        l.save(); l.beginPath(); l.ellipse(50, 54, 28, 20.5, 0, 0.15 * Math.PI, 0.85 * Math.PI); l.setLineDash([3, 2.4]);
        l.strokeStyle = rgba(m.lo, 0.7); l.lineWidth = 1; l.stroke(); l.restore();
        spec(l, 72, 64, 1.3, 0.8);
      });
    });
  },
  ring_ruby(ctx) {
    itemFrame(ctx, '#ff3a4a', () => {
      obj(ctx, (l) => {
        const m = M.gold;
        ringBand(l, 50, 63, 29, 21, 6, 0.72, m);
        l.lineWidth = 0.9; l.strokeStyle = m.line;
        // setting + prongs
        poly(l, [[38, 44], [62, 44], [58, 52], [42, 52]]); l.fillStyle = lin(l, 38, 44, 62, 52, [m.hi, m.b, m.lo]); l.fill(); l.stroke();
        // ruby (faceted)
        const g = M.red;
        const top = [[50, 20], [64, 28], [62, 44], [38, 44], [36, 28]];
        poly(l, top); l.fillStyle = rad(l, 44, 28, 1, 50, 34, 16, [g.hi, g.a, g.b, g.lo]); l.fill(); l.lineWidth = 0.9; l.strokeStyle = g.line; l.stroke();
        poly(l, [[50, 26], [57, 30], [56, 38], [44, 38], [43, 30]]); l.fillStyle = 'rgba(255,140,130,0.6)'; l.fill();
        l.beginPath(); [[50, 20, 50, 26], [64, 28, 57, 30], [62, 44, 56, 38], [38, 44, 44, 38], [36, 28, 43, 30]].forEach(([a, b, c, d]) => { l.moveTo(a, b); l.lineTo(c, d); });
        l.strokeStyle = 'rgba(255,210,200,0.6)'; l.lineWidth = 0.6; l.stroke();
        [[36, 30], [64, 30], [40, 44], [60, 44]].forEach(([x, y]) => ball(l, x, y, 2, m));
        gloss(l, 30, 52, 7, 3, -0.8, 0.8);
      }, { glow: '#ff4050', glowR: 5, glowA: 0.6 });
      sparkle(ctx, 44, 26, 4, '#ffffff');
    });
  },
  necklace_jade(ctx) {
    itemFrame(ctx, '#40e090', () => {
      obj(ctx, (l) => {
        // chain beads
        const pts = [];
        for (let i = 0; i <= 26; i++) {
          const t = i / 26, a = Math.PI * (1 - t);
          pts.push([50 + Math.cos(a) * 34, 18 + Math.sin(a) * 38]);
        }
        pts.forEach(([x, y], i) => { if (Math.abs(x - 50) < 5 && y > 50) return; ball(l, x, y, i % 2 ? 1.9 : 2.4, M.gold, true); });
        // bail
        ball(l, 50, 58, 3.4, M.gold);
        // pendant setting
        l.beginPath(); l.moveTo(50, 60); l.bezierCurveTo(66, 64, 66, 84, 50, 92); l.bezierCurveTo(34, 84, 34, 64, 50, 60); l.closePath();
        l.fillStyle = lin(l, 36, 60, 64, 92, [M.gold.hi, M.gold.a, M.gold.b, M.gold.lo]); l.fill(); l.lineWidth = 0.9; l.strokeStyle = M.gold.line; l.stroke();
        l.beginPath(); l.moveTo(50, 64); l.bezierCurveTo(62, 67, 62, 82, 50, 88); l.bezierCurveTo(38, 82, 38, 67, 50, 64); l.closePath();
        l.fillStyle = rad(l, 46, 72, 1, 50, 76, 14, [M.jade.hi, M.jade.a, M.jade.b, M.jade.lo]); l.fill(); l.lineWidth = 0.7; l.strokeStyle = M.jade.line; l.stroke();
        l.beginPath(); l.moveTo(46, 70); l.quadraticCurveTo(52, 76, 48, 84); l.strokeStyle = 'rgba(220,255,230,0.4)'; l.lineWidth = 1; l.stroke();
        gloss(l, 46, 70, 4, 2.2, -0.9, 0.95);
      }, { glow: '#60ffa0', glowR: 4, glowA: 0.5 });
    });
  },
  earring_silver(ctx) {
    itemFrame(ctx, '#a0d8ff', () => {
      const one = (l, x, y, s) => {
        l.beginPath(); l.moveTo(x, y); l.bezierCurveTo(x - 10 * s, y - 2 * s, x - 10 * s, y - 16 * s, x - 1 * s, y - 17 * s); l.bezierCurveTo(x + 6 * s, y - 17 * s, x + 7 * s, y - 10 * s, x + 4 * s, y - 6 * s);
        l.lineWidth = 2.2 * s; l.strokeStyle = M.silver.lo; l.stroke(); l.lineWidth = 1.2 * s; l.strokeStyle = M.silver.hi; l.stroke();
        ball(l, x, y + 2 * s, 2.4 * s, M.silver);
        l.beginPath(); l.ellipse(x, y + 12 * s, 7.5 * s, 8.5 * s, 0, 0, TAU); l.ellipse(x, y + 12 * s, 5 * s, 6 * s, 0, 0, TAU, true);
        l.fillStyle = lin(l, x - 8 * s, y + 4 * s, x + 8 * s, y + 20 * s, [M.silver.hi, M.silver.a, M.silver.b, M.silver.lo]); l.fill('evenodd'); l.lineWidth = 0.7; l.strokeStyle = M.silver.line; l.stroke();
        const gy = y + 20 * s;
        l.beginPath(); l.moveTo(x, gy); l.bezierCurveTo(x + 7 * s, gy + 6 * s, x + 6 * s, gy + 14 * s, x, gy + 16 * s); l.bezierCurveTo(x - 6 * s, gy + 14 * s, x - 7 * s, gy + 6 * s, x, gy); l.closePath();
        l.fillStyle = rad(l, x - 2 * s, gy + 6 * s, 0, x, gy + 9 * s, 9 * s, ['#f0faff', '#7ad0ff', '#1a6ad0', '#0a2a70']); l.fill(); l.lineWidth = 0.8; l.strokeStyle = '#061a40'; l.stroke();
        spec(l, x - 2 * s, gy + 6 * s, 1.2 * s);
      };
      obj(ctx, (l) => { one(l, 68, 34, 0.95); one(l, 40, 28, 1.25); });
      sparkle(ctx, 24, 76, 4, '#ffffff', '#a0d8ff');
    });
  },
  bread(ctx) {
    itemFrame(ctx, '#e8a050', () => {
      obj(ctx, (l) => {
        l.save(); l.translate(50, 56); l.rotate(-18 * D);
        const loaf = () => { l.beginPath(); l.ellipse(0, 0, 38, 22, 0, 0, TAU); };
        loaf(); l.fillStyle = rad(l, -12, -12, 2, 0, 0, 40, [[0, '#ffe0a0'], [0.35, '#e8a048'], [0.8, '#a85a1a'], [1, '#5a2a08']]); l.fill();
        l.lineWidth = 0.9; l.strokeStyle = '#3a1804'; l.stroke();
        l.save(); loaf(); l.clip();
        l.beginPath(); l.ellipse(4, 16, 40, 10, 0, 0, TAU); l.fillStyle = 'rgba(70,30,0,0.35)'; l.fill();
        l.restore();
        // score cuts
        [-18, 0, 18].forEach((x) => {
          l.beginPath(); l.ellipse(x, -3, 5, 13, 0.6, 0, TAU);
          l.fillStyle = lin(l, x - 5, -14, x + 5, 8, ['#fff8e0', '#f0d098', '#c89050']); l.fill();
          l.lineWidth = 0.8; l.strokeStyle = '#6a3410'; l.stroke();
          l.beginPath(); l.ellipse(x - 1.5, -4, 3.5, 11, 0.6, Math.PI * 0.6, Math.PI * 1.4); l.strokeStyle = 'rgba(140,70,20,0.6)'; l.lineWidth = 1.4; l.stroke();
        });
        // flour dust
        const r = rng(4);
        l.fillStyle = 'rgba(255,250,235,0.7)';
        for (let i = 0; i < 16; i++) { circle(l, -28 + r() * 50, -16 + r() * 14, 0.4 + r() * 0.6); l.fill(); }
        gloss(l, -16, -12, 10, 4, -0.1, 0.5);
        l.restore();
      });
    });
  },
  apple(ctx) {
    itemFrame(ctx, '#ff4a3a', () => {
      obj(ctx, (l) => {
        const body = () => {
          l.beginPath(); l.moveTo(50, 32);
          l.bezierCurveTo(60, 24, 84, 26, 84, 52);
          l.bezierCurveTo(84, 76, 66, 90, 58, 88);
          l.quadraticCurveTo(50, 86, 42, 88);
          l.bezierCurveTo(34, 90, 16, 76, 16, 52);
          l.bezierCurveTo(16, 26, 40, 24, 50, 32);
          l.closePath();
        };
        body(); l.fillStyle = rad(l, 36, 42, 2, 50, 58, 38, [[0, '#ffb0a0'], [0.25, '#ff4a3a'], [0.7, '#c8141c'], [1, '#5a0410']]); l.fill();
        l.save(); body(); l.clip();
        ell(l, 70, 66, 14, 18); l.fillStyle = rad(l, 70, 66, 0, 70, 66, 18, [[0, 'rgba(255,210,80,0.35)'], [1, 'rgba(255,210,80,0)']]); l.fill();
        l.strokeStyle = 'rgba(255,220,180,0.25)'; l.lineWidth = 0.8;
        [[30, 40, 26, 70], [70, 38, 76, 64], [50, 40, 50, 80]].forEach(([a, b, c, d]) => { l.beginPath(); l.moveTo(a, b); l.quadraticCurveTo((a + c) / 2, (b + d) / 2 + 2, c, d); l.stroke(); });
        l.restore();
        body(); l.lineWidth = 0.9; l.strokeStyle = '#2a0006'; l.stroke();
        // dimple
        l.beginPath(); l.moveTo(44, 32); l.quadraticCurveTo(50, 37, 56, 32); l.strokeStyle = 'rgba(80,0,10,0.6)'; l.lineWidth = 1.2; l.stroke();
        // stem
        l.beginPath(); l.moveTo(50, 34); l.quadraticCurveTo(49, 22, 54, 14); l.strokeStyle = '#3a1a08'; l.lineWidth = 3.4; l.stroke(); l.strokeStyle = '#8a5a2a'; l.lineWidth = 1.6; l.stroke();
        // leaf
        l.beginPath(); l.moveTo(53, 20); l.quadraticCurveTo(62, 8, 76, 12); l.quadraticCurveTo(68, 26, 53, 20); l.closePath();
        l.fillStyle = lin(l, 53, 10, 76, 24, ['#d0ff90', '#4ac03a', '#1a6a1a']); l.fill(); l.lineWidth = 0.8; l.strokeStyle = '#0a3a0a'; l.stroke();
        l.beginPath(); l.moveTo(54, 20); l.quadraticCurveTo(64, 15, 74, 13); l.strokeStyle = 'rgba(20,80,20,0.7)'; l.lineWidth = 0.6; l.stroke();
        gloss(l, 32, 44, 7, 11, 0.3, 0.9);
        spec(l, 30, 58, 1.4, 0.8);
      });
    });
  },
};

/* ---------------- imp drops + cut mushroom cap ---------------- */
const BONE = { hi: '#fffdf6', a: '#f0e8d8', b: '#c4b49a', lo: '#6a5a44', line: '#352a1c' };

ITEMS.imp_claw = (ctx) => itemFrame(ctx, '#ff5a5a', () => {
  obj(ctx, (l) => {
    const claw = () => swoosh(l, 60, 66, 30, 168 * D, 334 * D, 22, { profile: (t) => Math.pow(1 - t, 0.75) });
    claw();
    l.fillStyle = lin(l, 30, 40, 80, 80, [BONE.hi, BONE.a, BONE.b, BONE.lo]); l.fill();
    l.save(); claw(); l.clip();
    // inner (shadow) curve
    swoosh(l, 60, 66, 23, 168 * D, 330 * D, 9, { profile: (t) => Math.pow(1 - t, 0.9) });
    l.fillStyle = 'rgba(90,70,50,0.35)'; l.fill();
    // growth ridges
    l.strokeStyle = 'rgba(110,90,60,0.55)'; l.lineWidth = 0.8;
    for (let i = 1; i < 6; i++) { const a = (168 + i * 16) * D; l.beginPath(); l.moveTo(60 + Math.cos(a) * 18, 66 + Math.sin(a) * 18); l.lineTo(60 + Math.cos(a + 0.06) * 42, 66 + Math.sin(a + 0.06) * 42); l.stroke(); }
    // blood-red tip
    const ta = 334 * D, tx = 60 + Math.cos(ta) * 30, ty = 66 + Math.sin(ta) * 30;
    l.fillStyle = rad(l, tx, ty, 0, tx, ty, 34, [[0, '#ff4a3a'], [0.4, '#d4121e'], [0.72, 'rgba(170,0,16,0.55)'], [1, 'rgba(160,0,16,0)']]);
    l.fillRect(0, 0, 100, 100);
    // outer-edge highlight
    swoosh(l, 60, 66, 38, 180 * D, 300 * D, 2.6, { bias: 0.35 }); l.fillStyle = 'rgba(255,255,255,0.85)'; l.fill();
    l.restore();
    claw(); l.lineWidth = 0.9; l.strokeStyle = BONE.line; l.stroke();
    // knobbly knuckle at the root
    const a0 = 168 * D, bx = 60 + Math.cos(a0) * 30, by = 66 + Math.sin(a0) * 30;
    ell(l, bx + 1, by + 4, 11, 8, -0.3); l.fillStyle = lin(l, bx - 10, by - 4, bx + 10, by + 12, [BONE.a, BONE.b, BONE.lo]); l.fill(); l.lineWidth = 0.9; l.strokeStyle = BONE.line; l.stroke();
    ell(l, bx - 4, by + 9, 6.5, 5, 0.2); l.fill(); l.stroke();
    gloss(l, bx - 3, by, 4, 2, -0.4, 0.8);
    // blood drip
    l.beginPath(); l.moveTo(tx - 3, ty + 4); l.quadraticCurveTo(tx - 1, ty + 12, tx - 3.5, ty + 14); l.quadraticCurveTo(tx - 7, ty + 11, tx - 3, ty + 4); l.closePath();
    l.fillStyle = lin(l, 0, ty + 4, 0, ty + 14, ['#ff4a4a', '#9a0010']); l.fill(); spec(l, tx - 4, ty + 11, 0.8);
  });
});

ITEMS.imp_wing = (ctx) => itemFrame(ctx, '#ff7a6a', () => {
  obj(ctx, (l) => {
    const root = [22, 80];
    const tips = [[46, 12], [74, 20], [89, 44], [84, 72]];
    const mem = () => {
      l.beginPath(); l.moveTo(...root);
      l.quadraticCurveTo(26, 40, tips[0][0], tips[0][1]);
      for (let i = 1; i < tips.length; i++) {
        const p = tips[i - 1], q = tips[i];
        const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
        l.quadraticCurveTo(mx + (root[0] - mx) * 0.28, my + (root[1] - my) * 0.28, q[0], q[1]);
      }
      l.quadraticCurveTo(62, 70, 54, 84);
      l.quadraticCurveTo(38, 76, root[0], root[1]);
      l.closePath();
    };
    mem(); l.fillStyle = rad(l, 34, 60, 2, 40, 58, 64, [[0, '#ffe2d8'], [0.35, '#f4a09a'], [0.75, '#c8404e'], [1, '#6a1022']]); l.fill();
    l.save(); mem(); l.clip();
    // veins
    l.strokeStyle = 'rgba(140,20,40,0.45)'; l.lineWidth = 0.8;
    [[40, 40, 60, 30], [50, 50, 76, 42], [48, 62, 74, 60], [34, 56, 44, 34]].forEach(([a, b, c, d]) => { l.beginPath(); l.moveTo(a, b); l.quadraticCurveTo((a + c) / 2 + 3, (b + d) / 2 + 3, c, d); l.stroke(); });
    mem(); l.lineWidth = 5; l.strokeStyle = 'rgba(110,10,30,0.35)'; l.stroke();
    l.restore();
    mem(); l.lineWidth = 0.9; l.strokeStyle = '#3a0612'; l.stroke();
    // finger bones
    tips.forEach(([x, y], i) => {
      l.beginPath(); l.moveTo(...root); l.quadraticCurveTo((root[0] + x) / 2 - (i === 0 ? 8 : 2), (root[1] + y) / 2 + (i === 0 ? 0 : 4), x, y);
      l.lineWidth = i === 0 ? 4.6 : 3; l.strokeStyle = '#4a1420'; l.stroke();
      l.lineWidth = i === 0 ? 2.6 : 1.5; l.strokeStyle = lin(l, root[0], root[1], x, y, [BONE.a, BONE.hi, BONE.b]); l.stroke();
    });
    // hooked thumb claw at the top tip + root knuckle
    l.beginPath(); l.moveTo(44, 14); l.quadraticCurveTo(42, 6, 50, 5); l.quadraticCurveTo(46, 9, 48, 14); l.closePath();
    l.fillStyle = BONE.a; l.fill(); l.lineWidth = 0.8; l.strokeStyle = BONE.line; l.stroke();
    ball(l, root[0], root[1], 5, BONE);
    gloss(l, 36, 42, 8, 3.5, -0.9, 0.55);
  });
});

ITEMS.imp_blade = (ctx) => itemFrame(ctx, '#ffc040', () => {
  obj(ctx, (l) => {
    l.save(); l.translate(31, 70); l.rotate(45 * D);
    const G = M.gold;
    // grip + spiked pommel
    rr(l, -2.8, 0, 5.6, 13, 1.4); l.fillStyle = lin(l, -3, 0, 3, 0, ['#c8404e', '#7a0a1c', '#34000a']); l.fill(); l.lineWidth = 0.7; l.strokeStyle = '#1a0006'; l.stroke();
    l.strokeStyle = '#2a0008'; l.lineWidth = 1;
    for (let y = 2; y < 13; y += 3) { l.beginPath(); l.moveTo(-2.8, y + 1.2); l.lineTo(2.8, y - 1.2); l.stroke(); }
    poly(l, [[-4, 13], [4, 13], [0, 22]]); l.fillStyle = lin(l, -4, 13, 4, 22, [G.hi, G.b, G.lo]); l.fill(); l.lineWidth = 0.7; l.strokeStyle = G.line; l.stroke();
    // zigzag lightning blade
    const cl = [[0, 0], [4.5, -13], [-4, -25], [4, -38], [-2.5, -50], [1, -64]];
    const wd = [7.5, 7, 6.4, 5.4, 4, 0];
    const L = cl.map(([x, y], i) => [x - wd[i], y + (i ? 2 : 0)]);
    const R = cl.map(([x, y], i) => [x + wd[i], y - (i ? 2 : 0)]);
    poly(l, [...L, ...cl.slice(0).reverse()]); l.fillStyle = lin(l, -8, 0, 4, 0, [G.a, G.hi]); l.fill();
    poly(l, [...cl, ...R.slice(0).reverse()]); l.fillStyle = lin(l, -2, 0, 10, 0, [G.b, G.lo]); l.fill();
    poly(l, [...L, ...R.slice(0).reverse()]); l.lineWidth = 0.8; l.strokeStyle = G.line; l.stroke();
    l.beginPath(); cl.forEach(([x, y], i) => (i ? l.lineTo(x, y) : l.moveTo(x, y - 2))); l.strokeStyle = 'rgba(255,255,230,0.8)'; l.lineWidth = 0.6; l.stroke();
    l.beginPath(); L.forEach(([x, y], i) => (i ? l.lineTo(x * 0.85, y) : l.moveTo(x * 0.85, y - 2))); l.strokeStyle = 'rgba(255,255,255,0.75)'; l.lineWidth = 0.6; l.stroke();
    // crimson horned guard with gem
    l.beginPath(); l.moveTo(-15, -9); l.quadraticCurveTo(-10, 4, 0, 3.6); l.quadraticCurveTo(10, 4, 15, -9); l.quadraticCurveTo(9, -2, 0, -3); l.quadraticCurveTo(-9, -2, -15, -9); l.closePath();
    l.fillStyle = lin(l, 0, -9, 0, 4, ['#ff8a8a', '#c0182a', '#4a0010']); l.fill(); l.lineWidth = 0.8; l.strokeStyle = '#1e0006'; l.stroke();
    drawGem(l, 0, 0.5, 3.2, M.green);
    l.restore();
  }, { glow: '#ffcc40', glowR: 4, glowA: 0.55 });
  sparkle(ctx, 74, 22, 5, '#ffffff', '#ffe070');
});

// twin curved blades with serrated edges, one glowing red, one blue (dual-blade weapon class)
ITEMS.robo_blades = (ctx) => itemFrame(ctx, '#b050ff', () => {
  const blade = (l, glowCol, mirror) => {
    l.save();
    if (mirror) l.scale(-1, 1);
    // grip + pommel
    rr(l, -2.6, 2, 5.2, 14, 1.4); l.fillStyle = lin(l, -3, 0, 3, 0, ['#4a4a55', '#1a1a22']); l.fill(); l.lineWidth = 0.7; l.strokeStyle = '#08080c'; l.stroke();
    l.beginPath(); l.arc(0, 18, 3.2, 0, TAU); l.fillStyle = '#d8d0c8'; l.fill(); l.stroke();
    // bone-white guard
    l.beginPath(); l.moveTo(-10, -1); l.quadraticCurveTo(-5, 4, 0, 2.5); l.quadraticCurveTo(5, 4, 10, -1); l.quadraticCurveTo(4, -3, 0, -3.5); l.quadraticCurveTo(-4, -3, -10, -1); l.closePath();
    l.fillStyle = lin(l, 0, -4, 0, 4, ['#fff8ee', '#c8bcae', '#7a6e62']); l.fill(); l.stroke();
    // curved blade: smooth back edge, serrated front edge
    const back = [[3.5, -3], [5.5, -20], [5, -38], [2, -52], [-3, -64]];
    const front = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10, y = -3 - t * 60;
      front.push([-4.5 + t * 1.5 - Math.sin(t * Math.PI) * 1.5 + (i % 2 ? -2.6 : 0) * (1 - t * 0.5), y]);
    }
    const outline = [...back, ...front.reverse()];
    l.save(); l.shadowColor = glowCol; l.shadowBlur = 10;
    poly(l, outline); l.fillStyle = lin(l, -6, 0, 6, 0, ['#2e2436', '#0c0a10']); l.fill();
    l.restore();
    poly(l, outline); l.lineWidth = 1.2; l.strokeStyle = glowCol; l.stroke();
    l.beginPath(); back.forEach(([x, y], i) => (i ? l.lineTo(x - 1.2, y) : l.moveTo(x - 1.2, y))); l.strokeStyle = 'rgba(255,255,255,0.65)'; l.lineWidth = 0.6; l.stroke();
    l.restore();
  };
  obj(ctx, (l) => {
    l.save(); l.translate(36, 80); l.rotate(30 * D); blade(l, '#ff3048', false); l.restore();
    l.save(); l.translate(64, 80); l.rotate(-30 * D); blade(l, '#3a8aff', true); l.restore();
  }, { glow: '#d060ff', glowR: 5, glowA: 0.55 });
  sparkle(ctx, 22, 22, 5, '#ffffff', '#ff5a6a');
  sparkle(ctx, 80, 26, 4.5, '#ffffff', '#6aa8ff');
});

ITEMS.mushroom_cap = (ctx) => itemFrame(ctx, '#ff6a8a', () => {
  obj(ctx, (l) => {
    l.save(); l.translate(50, 52); l.rotate(-16 * D); l.translate(-50, -52);
    // dome
    const cap = () => { l.beginPath(); l.moveTo(12, 56); l.bezierCurveTo(10, 26, 32, 14, 50, 14); l.bezierCurveTo(68, 14, 90, 26, 88, 56); l.closePath(); };
    cap(); l.fillStyle = rad(l, 36, 24, 2, 50, 44, 44, [[0, '#ffb0a0'], [0.3, '#ff4a3a'], [0.75, '#c01426'], [1, '#5a0410']]); l.fill();
    l.lineWidth = 0.9; l.strokeStyle = '#2e0006'; l.stroke();
    l.save(); cap(); l.clip();
    [[32, 28, 5.5, 4], [54, 22, 4.4, 3], [72, 34, 5, 4], [22, 46, 3.6, 3], [46, 40, 4.6, 3], [82, 50, 3, 2.4]].forEach(([x, y, rx, ry]) => {
      ell(l, x, y, rx, ry); l.fillStyle = rad(l, x - rx * 0.3, y - ry * 0.3, 0, x, y, rx, ['#ffffff', '#fff0e8', '#e8c8c0']); l.fill();
      l.lineWidth = 0.5; l.strokeStyle = 'rgba(90,0,10,0.5)'; l.stroke();
    });
    l.restore();
    gloss(l, 30, 26, 10, 4.5, -0.6, 0.8);
    // underside with gills
    ell(l, 50, 58, 38, 13);
    l.fillStyle = rad(l, 50, 60, 2, 50, 58, 38, ['#b89060', '#f0dcb4', '#fff4dc']); l.fill(); l.lineWidth = 0.9; l.strokeStyle = '#4a3418'; l.stroke();
    l.save(); ell(l, 50, 58, 38, 13); l.clip();
    l.strokeStyle = 'rgba(120,80,40,0.55)'; l.lineWidth = 0.6;
    for (let i = 0; i < 36; i++) { const a = (i / 36) * TAU; l.beginPath(); l.moveTo(50 + Math.cos(a) * 9, 60 + Math.sin(a) * 3.2); l.lineTo(50 + Math.cos(a) * 40, 58 + Math.sin(a) * 14); l.stroke(); }
    l.beginPath(); l.ellipse(50, 58, 38, 13, 0, Math.PI * 1.05, Math.PI * 1.95); l.lineWidth = 3; l.strokeStyle = 'rgba(200,30,40,0.7)'; l.stroke();
    l.restore();
    // cleanly cut stem stub
    l.beginPath(); l.moveTo(41, 60); l.lineTo(41, 67); l.ellipse(50, 67, 9, 3.6, 0, Math.PI, 0, true); l.lineTo(59, 60); l.closePath();
    l.fillStyle = lin(l, 41, 0, 59, 0, ['#fffaf0', '#e8d4b0', '#a88a5a']); l.fill(); l.lineWidth = 0.8; l.strokeStyle = '#4a3418'; l.stroke();
    ell(l, 50, 67, 9, 3.6); l.fillStyle = rad(l, 48, 66, 0, 50, 67, 9, ['#ffffff', '#fff6e4', '#e8d0a8']); l.fill(); l.stroke();
    ell(l, 50, 67, 5.5, 2.1); l.strokeStyle = 'rgba(160,120,70,0.6)'; l.lineWidth = 0.6; l.stroke();
    l.restore();
  });
});

/* ================================================================== */
/* MENU ICONS                                                           */
/* ================================================================== */
const MENU_OW = 3.4;
const menuObj = (ctx, draw, o = {}) => obj(ctx, draw, { ow: MENU_OW, sy: 3, sx: 1.5, shadowBlur: 3.5, shadowA: 0.55, ...o });

function orbButton(c, symbol, r = 44) {
  return (ctx) => {
    menuObj(ctx, (l) => {
      drawOrb(l, 50, 50, r, c);
      symbol(l);
      orbShine(l, 50, 50, r);
    });
  };
}

const MENU = {
  character(ctx) {
    menuObj(ctx, (l) => {
      // collar / shoulders peeking
      l.beginPath(); l.moveTo(22, 98); l.quadraticCurveTo(24, 80, 50, 78); l.quadraticCurveTo(76, 80, 78, 98); l.closePath();
      l.fillStyle = lin(l, 22, 78, 78, 98, ['#7ac8ff', '#2a6ad8', '#12307a']); l.fill(); l.lineWidth = 1; l.strokeStyle = '#0a1a4a'; l.stroke();
      l.beginPath(); l.moveTo(40, 80); l.lineTo(50, 92); l.lineTo(60, 80); l.lineWidth = 2.4; l.strokeStyle = M.gold.b; l.stroke();
      drawChibiHead(l, 50, 52, 29, { hair: '#ff8a1a', iris: '#2a5ad0', mouth: 'open', spikes: 9 });
    });
  },

  inventory(ctx) {
    menuObj(ctx, (l) => {
      const W = M.wood, G = M.gold;
      // body
      rr(l, 13, 48, 74, 40, 4);
      l.fillStyle = lin(l, 0, 48, 0, 88, [W.a, W.b, W.lo]); l.fill(); l.lineWidth = 1; l.strokeStyle = W.line; l.stroke();
      l.save(); rr(l, 13, 48, 74, 40, 4); l.clip();
      l.strokeStyle = rgba(W.lo, 0.8); l.lineWidth = 1;
      [60, 72].forEach((y) => { l.beginPath(); l.moveTo(13, y); l.lineTo(87, y); l.stroke(); });
      l.restore();
      // lid
      const lid = () => { l.beginPath(); l.moveTo(11, 52); l.lineTo(11, 36); l.bezierCurveTo(11, 14, 89, 14, 89, 36); l.lineTo(89, 52); l.closePath(); };
      lid(); l.fillStyle = lin(l, 0, 18, 0, 52, [W.hi, W.a, W.b]); l.fill(); l.lineWidth = 1; l.strokeStyle = W.line; l.stroke();
      l.save(); lid(); l.clip();
      l.strokeStyle = rgba(W.lo, 0.7); l.lineWidth = 1;
      [30, 41].forEach((y) => { l.beginPath(); l.moveTo(11, y); l.quadraticCurveTo(50, y - 5, 89, y); l.stroke(); });
      l.restore();
      // gold straps
      for (const x of [20, 72]) {
        l.beginPath(); l.moveTo(x, 24); l.bezierCurveTo(x, 20, x + 8, 20, x + 8, 24); l.lineTo(x + 8, 88); l.lineTo(x, 88); l.closePath();
        l.fillStyle = lin(l, x, 0, x + 8, 0, [G.hi, G.a, G.b, G.lo]); l.fill(); l.lineWidth = 0.9; l.strokeStyle = G.line; l.stroke();
        rivet(l, x + 4, 32, 1.4, G); rivet(l, x + 4, 62, 1.4, G); rivet(l, x + 4, 80, 1.4, G);
      }
      // rim band
      rr(l, 9, 47, 82, 7, 2.5); l.fillStyle = lin(l, 0, 47, 0, 54, [G.hi, G.a, G.b, G.lo]); l.fill(); l.lineWidth = 0.9; l.strokeStyle = G.line; l.stroke();
      // lock
      rr(l, 41, 44, 18, 20, 4); l.fillStyle = lin(l, 41, 44, 59, 64, [G.hi, G.a, G.b, G.lo]); l.fill(); l.lineWidth = 1; l.strokeStyle = G.line; l.stroke();
      circle(l, 50, 52, 2.6); l.fillStyle = '#2a1404'; l.fill(); poly(l, [[48.6, 53], [51.4, 53], [52.4, 59], [47.6, 59]]); l.fill();
      gloss(l, 30, 26, 12, 4, -0.2, 0.7);
      spec(l, 45, 47, 1.2);
    });
    sparkleAt(ctx, 84, 16, 6);
  },

  skills(ctx) {
    // glow behind
    ctx.save(); ctx.fillStyle = rad(ctx, 50, 42, 2, 50, 42, 40, [[0, 'rgba(255,240,160,0.8)'], [1, 'rgba(255,220,120,0)']]); ctx.fillRect(0, 0, 100, 100); ctx.restore();
    menuObj(ctx, (l) => {
      const P = M.purple;
      // cover
      poly(l, [[50, 88], [8, 80], [6, 38], [50, 46]]); l.fillStyle = lin(l, 6, 38, 50, 88, [P.a, P.b, P.lo]); l.fill(); l.lineWidth = 1; l.strokeStyle = P.line; l.stroke();
      poly(l, [[50, 88], [92, 80], [94, 38], [50, 46]]); l.fillStyle = lin(l, 94, 38, 50, 88, [P.b, P.lo]); l.fill(); l.stroke();
      [[8, 80], [92, 80]].forEach(([x, y]) => { ball(l, x, y - 2, 3, M.gold); });
      // page stack edges
      for (let i = 3; i >= 0; i--) {
        const o = i * 1.6;
        l.beginPath(); l.moveTo(50, 84 - o * 0.2 + o); l.quadraticCurveTo(32, 74 + o, 11, 77 + o * 0.5); l.lineTo(11, 74); l.quadraticCurveTo(32, 70, 50, 80); l.closePath();
        l.fillStyle = i % 2 ? '#e8d4a8' : '#fff4d8'; l.fill();
        l.beginPath(); l.moveTo(50, 84 - o * 0.2 + o); l.quadraticCurveTo(68, 74 + o, 89, 77 + o * 0.5); l.lineTo(89, 74); l.quadraticCurveTo(68, 70, 50, 80); l.closePath();
        l.fill();
      }
      // pages
      const pageL = () => { l.beginPath(); l.moveTo(50, 80); l.quadraticCurveTo(32, 70, 12, 74); l.lineTo(11, 34); l.quadraticCurveTo(32, 28, 50, 40); l.closePath(); };
      const pageR = () => { l.beginPath(); l.moveTo(50, 80); l.quadraticCurveTo(68, 70, 88, 74); l.lineTo(89, 34); l.quadraticCurveTo(68, 28, 50, 40); l.closePath(); };
      pageL(); l.fillStyle = lin(l, 12, 30, 50, 80, ['#fffdf4', '#fbeecb', '#d8b880']); l.fill(); l.lineWidth = 0.9; l.strokeStyle = '#6a4a1a'; l.stroke();
      pageR(); l.fillStyle = lin(l, 88, 30, 50, 80, ['#fff6de', '#f0dcae', '#c8a060']); l.fill(); l.stroke();
      // text squiggles
      l.strokeStyle = 'rgba(120,80,40,0.45)'; l.lineWidth = 1.3;
      for (let i = 0; i < 4; i++) {
        const y = 44 + i * 7.5;
        l.beginPath(); l.moveTo(17, y - 3 + i * 0.2); l.quadraticCurveTo(30, y - 6, 43, y + 2); l.stroke();
        l.beginPath(); l.moveTo(57, y + 2); l.quadraticCurveTo(70, y - 6, 83, y - 3 + i * 0.2); l.stroke();
      }
      // spine shadow
      l.beginPath(); l.moveTo(50, 40); l.lineTo(50, 80); l.strokeStyle = 'rgba(90,50,10,0.5)'; l.lineWidth = 1.6; l.stroke();
      // magic rune circle above
      l.save(); glow(l, '#ffe070', 5);
      l.beginPath(); l.ellipse(50, 30, 16, 5, 0, 0, TAU); l.strokeStyle = 'rgba(255,240,160,0.95)'; l.lineWidth = 1.6; l.stroke();
      starPath(l, 50, 20, 4, 10, 3, -Math.PI / 2); l.fillStyle = '#fffbe0'; l.fill();
      l.restore();
    }, { glow: '#ffe8a0', glowR: 4, glowA: 0.6 });
    sparkleAt(ctx, 26, 16, 4.5);
    sparkleAt(ctx, 76, 22, 3.5);
  },

  quests(ctx) {
    menuObj(ctx, (l) => {
      const Pm = M.parch;
      l.save(); l.translate(46, 52); l.rotate(-8 * D);
      // sheet
      l.beginPath(); l.moveTo(-24, -32); l.lineTo(24, -32); l.quadraticCurveTo(21, 0, 25, 32); l.lineTo(-23, 32); l.quadraticCurveTo(-27, 0, -24, -32); l.closePath();
      l.fillStyle = lin(l, -24, -32, 24, 32, [Pm.hi, Pm.a, Pm.b]); l.fill(); l.lineWidth = 1; l.strokeStyle = Pm.line; l.stroke();
      l.strokeStyle = 'rgba(120,80,40,0.5)'; l.lineWidth = 1.4;
      for (let i = 0; i < 5; i++) { const y = -20 + i * 8; l.beginPath(); l.moveTo(-16, y); l.lineTo(i === 4 ? 2 : 16, y); l.stroke(); }
      // rolls
      for (const y of [-33, 33]) {
        rr(l, -29, y - 5.5, 58, 11, 5.5);
        l.fillStyle = lin(l, 0, y - 5.5, 0, y + 5.5, [Pm.hi, Pm.a, Pm.b, Pm.lo]); l.fill(); l.lineWidth = 1; l.strokeStyle = Pm.line; l.stroke();
        for (const s of [-1, 1]) { ball(l, s * 31, y, 3.6, M.wood); }
      }
      l.restore();
      // wax seal
      const r = rng(2);
      const sp = [];
      for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU; const rr_ = 11 + (r() - 0.5) * 3; sp.push([64 + Math.cos(a) * rr_, 74 + Math.sin(a) * rr_]); }
      poly(l, [[58, 80], [54, 96], [60, 92], [64, 97], [66, 82]]); l.fillStyle = lin(l, 54, 80, 66, 97, ['#ff5a5a', '#a0101c']); l.fill(); l.lineWidth = 0.9; l.strokeStyle = '#3a0006'; l.stroke();
      smooth(l, sp); l.fillStyle = rad(l, 60, 70, 1, 64, 74, 13, ['#ff8a7a', '#d8202a', '#7a0612']); l.fill(); l.lineWidth = 1; l.strokeStyle = '#3a0006'; l.stroke();
      circle(l, 64, 74, 7); l.strokeStyle = 'rgba(90,0,10,0.6)'; l.lineWidth = 1.2; l.stroke();
      starPath(l, 64, 74, 5, 4.6, 2, -Math.PI / 2); l.fillStyle = 'rgba(120,0,16,0.7)'; l.fill();
      spec(l, 59, 68, 1.6, 0.8);
    });
    // quill
    menuObj(ctx, (l) => {
      l.save(); l.translate(76, 44); l.rotate(28 * D);
      l.beginPath(); l.moveTo(0, 40); l.lineTo(0, -34); l.strokeStyle = '#8a6a4a'; l.lineWidth = 1.6; l.stroke();
      l.beginPath(); l.moveTo(0, 22);
      l.bezierCurveTo(-12, 8, -10, -24, 0, -40); l.bezierCurveTo(10, -24, 12, 8, 0, 22); l.closePath();
      l.fillStyle = lin(l, -10, -40, 10, 22, ['#ffffff', '#e8f0ff', '#a8b8d8']); l.fill(); l.lineWidth = 0.9; l.strokeStyle = '#3a4a6a'; l.stroke();
      l.strokeStyle = 'rgba(90,110,150,0.6)'; l.lineWidth = 0.7;
      for (let i = 0; i < 8; i++) { const y = 16 - i * 7; l.beginPath(); l.moveTo(0, y); l.lineTo(-7 + i * 0.3, y - 5); l.moveTo(0, y); l.lineTo(7 - i * 0.3, y - 5); l.stroke(); }
      l.beginPath(); l.moveTo(0, -36); l.lineTo(0, 22); l.strokeStyle = '#c8a878'; l.lineWidth = 1.2; l.stroke();
      l.beginPath(); l.moveTo(-1.6, 22); l.lineTo(1.6, 22); l.lineTo(0, 34); l.closePath(); l.fillStyle = '#2a2a3a'; l.fill();
      l.restore();
    }, { ow: 2.4 });
  },

  map(ctx) {
    menuObj(ctx, (l) => {
      const xs = [10, 36, 64, 90], tops = [26, 18, 26, 18], bots = [86, 78, 86, 78];
      const panel = (i) => poly(l, [[xs[i], tops[i]], [xs[i + 1], tops[i + 1]], [xs[i + 1], bots[i + 1]], [xs[i], bots[i]]]);
      const shadeCol = ['#fff2cc', '#d8bc84', '#fbe8b8'];
      for (let i = 0; i < 3; i++) { panel(i); l.fillStyle = lin(l, xs[i], tops[i], xs[i + 1], bots[i + 1], [shadeCol[i], shade(shadeCol[i], -0.15)]); l.fill(); }
      // content clipped to the whole map
      l.save();
      poly(l, [[10, 26], [36, 18], [64, 26], [90, 18], [90, 78], [64, 86], [36, 78], [10, 86]]); l.clip();
      // sea
      l.beginPath(); l.moveTo(0, 60); l.quadraticCurveTo(24, 52, 30, 70); l.quadraticCurveTo(40, 88, 0, 100); l.closePath();
      l.fillStyle = rgba('#4a9ae0', 0.75); l.fill();
      l.beginPath(); l.moveTo(70, 0); l.quadraticCurveTo(74, 20, 100, 24); l.lineTo(100, 0); l.closePath(); l.fill();
      // land blobs
      smooth(l, [[40, 36], [52, 30], [60, 40], [56, 52], [44, 50]]); l.fillStyle = rgba('#5ab04a', 0.7); l.fill();
      smooth(l, [[66, 56], [80, 50], [86, 64], [74, 70]]); l.fill();
      // mountains
      [[46, 44], [52, 42]].forEach(([x, y]) => { poly(l, [[x - 4, y + 4], [x, y - 3], [x + 4, y + 4]]); l.fillStyle = '#8a6a4a'; l.fill(); });
      // dotted route
      l.beginPath(); l.moveTo(20, 72); l.bezierCurveTo(30, 56, 44, 66, 50, 58); l.bezierCurveTo(56, 50, 62, 44, 70, 40);
      l.setLineDash([2.4, 2.6]); l.strokeStyle = '#b02020'; l.lineWidth = 1.8; l.stroke(); l.setLineDash([]);
      // fold shading
      for (let i = 0; i < 3; i++) { if (i === 1) { panel(i); l.fillStyle = 'rgba(80,50,10,0.18)'; l.fill(); } }
      l.restore();
      for (let i = 0; i < 3; i++) { panel(i); l.lineWidth = 1; l.strokeStyle = '#5a3a14'; l.stroke(); }
      // X marks the spot
      const X = () => { l.beginPath(); l.moveTo(64, 34); l.lineTo(76, 46); l.moveTo(76, 34); l.lineTo(64, 46); };
      X(); l.strokeStyle = '#3a0006'; l.lineWidth = 7; l.stroke();
      X(); l.strokeStyle = '#ff2a2a'; l.lineWidth = 4.2; l.stroke();
      l.beginPath(); l.moveTo(64.5, 34.5); l.lineTo(69, 39); l.strokeStyle = 'rgba(255,200,200,0.8)'; l.lineWidth = 1.2; l.stroke();
      // compass rose
      starPath(l, 22, 36, 4, 7, 2, -Math.PI / 2); l.fillStyle = '#6a4a2a'; l.fill();
      gloss(l, 24, 30, 10, 4, -0.3, 0.45);
    });
  },

  community(ctx) {
    menuObj(ctx, (l) => {
      l.beginPath(); l.ellipse(61, 36, 30, 22, 0, 0, TAU);
      l.moveTo(76, 52); l.lineTo(88, 68); l.lineTo(66, 56);
      l.fillStyle = rad(l, 52, 24, 2, 61, 38, 32, ['#fff0b0', '#ffc030', '#e07a10', '#8a3a00']); l.fill();
      l.lineWidth = 1; l.strokeStyle = '#5a2a00'; l.stroke();
      gloss(l, 52, 24, 12, 5, -0.2, 0.8);
    });
    menuObj(ctx, (l) => {
      l.beginPath(); l.ellipse(40, 60, 31, 23, 0, 0, TAU);
      l.moveTo(24, 76); l.lineTo(10, 94); l.lineTo(36, 82);
      l.fillStyle = rad(l, 30, 48, 2, 40, 62, 34, ['#e0f6ff', '#5ab8ff', '#1a62d8', '#0a2a7a']); l.fill();
      l.lineWidth = 1; l.strokeStyle = '#0a1a50'; l.stroke();
      [28, 40, 52].forEach((x) => { circle(l, x, 62, 4.2); l.fillStyle = '#ffffff'; l.fill(); l.lineWidth = 1.2; l.strokeStyle = '#0a2a6a'; l.stroke(); });
      gloss(l, 30, 47, 13, 5.5, -0.2, 0.85);
    });
  },

  guild(ctx) {
    menuObj(ctx, (l) => {
      const sw = { len: 80, w: 9, blade: M.steel, guard: M.gold, grip: '#6a2a14', gripLen: 10, gw: 11 };
      drawSword(l, { ...sw, x: 22, y: 25, ang: 135 });
      drawSword(l, { ...sw, x: 78, y: 25, ang: -135 });
    }, { ow: 3 });
    menuObj(ctx, (l) => {
      const G = M.gold;
      shieldPath(l, 50, 54, 52, 64);
      l.fillStyle = lin(l, 22, 20, 78, 88, [G.hi, G.a, G.b, G.lo]); l.fill(); l.lineWidth = 1; l.strokeStyle = G.line; l.stroke();
      shieldPath(l, 50, 55, 41, 51);
      l.fillStyle = rad(l, 40, 38, 2, 50, 56, 36, ['#8ad4ff', '#2a74e0', '#0e2e8a']); l.fill(); l.lineWidth = 1; l.strokeStyle = '#061a50'; l.stroke();
      l.save(); shieldPath(l, 50, 55, 41, 51); l.clip();
      poly(l, [[50, 20], [80, 20], [80, 90], [50, 90]]); l.fillStyle = 'rgba(210,30,40,0.85)'; l.fill();
      poly(l, [[50, 20], [80, 20], [80, 90], [50, 90]]); l.fillStyle = lin(l, 50, 28, 78, 84, ['rgba(255,150,150,0.4)', 'rgba(60,0,0,0.4)']); l.fill();
      l.restore();
      starPath(l, 50, 52, 5, 13, 5.6, -Math.PI / 2);
      l.fillStyle = lin(l, 38, 40, 62, 64, [G.hi, G.a, G.b]); l.fill(); l.lineWidth = 1; l.strokeStyle = G.line; l.stroke();
      l.save(); shieldPath(l, 50, 54, 52, 64); l.clip();
      l.beginPath(); l.moveTo(20, 18); l.lineTo(62, 18); l.bezierCurveTo(48, 30, 36, 40, 20, 56); l.closePath(); l.fillStyle = 'rgba(255,255,255,0.3)'; l.fill();
      l.restore();
    });
  },

  shop(ctx) {
    menuObj(ctx, (l) => {
      const R = { hi: '#ffc8dc', a: '#ff5a8a', b: '#d81a52', lo: '#6a0626', line: '#34000f' }, G = M.gold;
      // body
      rr(l, 20, 46, 60, 44, 4); l.fillStyle = lin(l, 20, 46, 80, 90, [R.a, R.b, R.lo]); l.fill(); l.lineWidth = 1; l.strokeStyle = R.line; l.stroke();
      l.save(); rr(l, 20, 46, 60, 44, 4); l.clip(); poly(l, [[50, 46], [80, 46], [80, 90], [50, 90]]); l.fillStyle = 'rgba(60,0,20,0.2)'; l.fill(); l.restore();
      // ribbon vertical
      rr(l, 44, 46, 12, 44, 1); l.fillStyle = lin(l, 44, 0, 56, 0, [G.hi, G.a, G.b, G.lo]); l.fill(); l.lineWidth = 0.9; l.strokeStyle = G.line; l.stroke();
      // lid
      rr(l, 15, 34, 70, 15, 4); l.fillStyle = lin(l, 0, 34, 0, 49, [R.hi, R.a, R.b]); l.fill(); l.lineWidth = 1; l.strokeStyle = R.line; l.stroke();
      rr(l, 43, 34, 14, 15, 1); l.fillStyle = lin(l, 43, 0, 57, 0, [G.hi, G.a, G.b, G.lo]); l.fill(); l.lineWidth = 0.9; l.strokeStyle = G.line; l.stroke();
      // bow
      for (const s of [-1, 1]) {
        l.beginPath(); l.moveTo(50, 32); l.bezierCurveTo(50 + s * 10, 12, 50 + s * 30, 14, 50 + s * 24, 30); l.quadraticCurveTo(50 + s * 18, 36, 50, 32); l.closePath();
        l.fillStyle = lin(l, 50, 14, 50 + s * 26, 34, [G.hi, G.a, G.b, G.lo]); l.fill(); l.lineWidth = 1; l.strokeStyle = G.line; l.stroke();
        l.beginPath(); l.moveTo(50 + s * 4, 29); l.quadraticCurveTo(50 + s * 14, 20, 50 + s * 20, 26); l.strokeStyle = rgba(G.lo, 0.6); l.lineWidth = 1.2; l.stroke();
      }
      ell(l, 50, 32, 6, 5); l.fillStyle = lin(l, 44, 27, 56, 37, [G.hi, G.a, G.b]); l.fill(); l.lineWidth = 1; l.strokeStyle = G.line; l.stroke();
      gloss(l, 30, 38, 10, 3, -0.1, 0.8);
      gloss(l, 30, 58, 6, 9, 0.1, 0.35);
    });
    sparkleAt(ctx, 84, 22, 5);
  },

  options(ctx) {
    menuObj(ctx, (l) => {
      const G = M.gold, n = 8, Ro = 44, Ri = 34;
      l.beginPath();
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU - Math.PI / 2, tw = 0.2, bw = 0.3;
        const pts = [[a - bw, Ri], [a - tw, Ro], [a + tw, Ro], [a + bw, Ri]];
        pts.forEach(([aa, r], j) => { const x = 50 + Math.cos(aa) * r, y = 50 + Math.sin(aa) * r; i === 0 && j === 0 ? l.moveTo(x, y) : l.lineTo(x, y); });
        const nextA = ((i + 1) / n) * TAU - Math.PI / 2 - bw;
        l.arc(50, 50, Ri, a + bw, nextA);
      }
      l.closePath();
      l.moveTo(50 + 14, 50); l.arc(50, 50, 14, 0, TAU, true);
      l.fillStyle = rad(l, 36, 34, 2, 50, 50, 46, [[0, G.hi], [0.35, G.a], [0.75, G.b], [1, G.lo]]); l.fill('evenodd');
      l.lineWidth = 1; l.strokeStyle = G.line; l.stroke();
      // inner bevel ring
      l.beginPath(); l.arc(50, 50, 24, 0, TAU); l.arc(50, 50, 14, 0, TAU, true);
      l.fillStyle = lin(l, 30, 30, 70, 70, [G.b, G.a, G.hi]); l.fill('evenodd');
      circle(l, 50, 50, 24); l.lineWidth = 1; l.strokeStyle = G.line; l.stroke();
      circle(l, 50, 50, 14); l.stroke();
      l.beginPath(); l.arc(50, 50, 30, 200 * D, 290 * D); l.strokeStyle = 'rgba(255,255,255,0.8)'; l.lineWidth = 2.4; l.stroke();
      spec(l, 33, 26, 2);
    });
  },

  exit: orbButton(M.red, (l) => {
    glyphStroke(l, () => { l.beginPath(); l.arc(50, 53, 15, -58 * D, 238 * D); }, 5.6, '#ffffff', 'rgba(70,0,8,0.9)');
    glyphStroke(l, () => { l.beginPath(); l.moveTo(50, 32); l.lineTo(50, 52); }, 5.6, '#ffffff', 'rgba(70,0,8,0.9)');
  }),
  help: orbButton(M.blue, (l) => {
    const q = () => { l.beginPath(); l.moveTo(40, 40); l.arc(50, 40, 10.5, Math.PI, Math.PI * 2.3); l.quadraticCurveTo(50, 50, 50, 57); };
    glyphStroke(l, q, 6.4, '#ffffff', 'rgba(4,16,60,0.9)');
    circle(l, 50, 68, 5.4); l.fillStyle = 'rgba(4,16,60,0.9)'; l.fill();
    circle(l, 50, 68, 3.5); l.fillStyle = '#ffffff'; l.fill();
  }),
  zoom_in: orbButton({ hi: '#d8fff4', a: '#40d8b8', b: '#0e8a8a', lo: '#063a44' }, (l) => {
    glyphStroke(l, () => { l.beginPath(); l.moveTo(36, 50); l.lineTo(64, 50); l.moveTo(50, 36); l.lineTo(50, 64); }, 7, '#ffffff', 'rgba(0,30,36,0.9)');
  }),
  zoom_out: orbButton({ hi: '#d8fff4', a: '#40d8b8', b: '#0e8a8a', lo: '#063a44' }, (l) => {
    glyphStroke(l, () => { l.beginPath(); l.moveTo(36, 50); l.lineTo(64, 50); }, 7, '#ffffff', 'rgba(0,30,36,0.9)');
  }),
  collapse: orbButton({ hi: '#d8fff4', a: '#40d8b8', b: '#0e8a8a', lo: '#063a44' }, (l) => {
    glyphStroke(l, () => { l.beginPath(); l.moveTo(37, 57); l.lineTo(50, 43); l.lineTo(63, 57); }, 7, '#ffffff', 'rgba(0,30,36,0.9)');
  }),
  world_map(ctx) {
    menuObj(ctx, (l) => {
      const cx = 50, cy = 50, r = 44 * 0.8 * 0.93;
      drawOrb(l, 50, 50, 44, { hi: '#b8f0ff', a: '#3aa0f0', b: '#1450b8', lo: '#08205a' });
      circle(l, cx, cy, r);
      l.fillStyle = rad(l, cx - 12, cy - 14, 2, cx, cy, r, ['#b8f0ff', '#3aa0f0', '#1450b8', '#08205a']); l.fill();
      l.save(); circle(l, cx, cy, r); l.clip();
      l.fillStyle = rad(l, cx - 10, cy - 12, 2, cx, cy, r, ['#c8ff90', '#5ac83a', '#1a7a24', '#0a3a10']);
      smooth(l, [[22, 30], [36, 22], [48, 28], [46, 42], [38, 48], [30, 60], [22, 56], [18, 42]]); l.fill();
      smooth(l, [[56, 44], [70, 36], [82, 46], [78, 62], [64, 70], [56, 60]]); l.fill();
      smooth(l, [[40, 74], [50, 70], [56, 80], [46, 86]]); l.fill();
      l.strokeStyle = 'rgba(255,255,255,0.28)'; l.lineWidth = 0.9;
      [-0.5, 0, 0.5].forEach((t) => { l.beginPath(); l.ellipse(cx, cy, r * Math.abs(Math.cos(t * 1.3)) + 0.1, r, 0, 0, TAU); l.stroke(); });
      [-20, 0, 20].forEach((dy) => { l.beginPath(); l.ellipse(cx, cy + dy, Math.sqrt(r * r - dy * dy), 3, 0, 0, TAU); l.stroke(); });
      circle(l, cx + 6, cy + 8, r * 1.02); l.lineWidth = 10; l.strokeStyle = 'rgba(0,10,40,0.3)'; l.stroke();
      l.restore();
      circle(l, cx, cy, r); l.lineWidth = 1; l.strokeStyle = '#061a44'; l.stroke();
      orbShine(l, 50, 50, 44);
    });
  },

  actions(ctx) {
    // happy emote face
    menuObj(ctx, (l) => {
      const cx = 44, cy = 46, r = 36;
      circle(l, cx, cy, r);
      l.fillStyle = rad(l, cx - 12, cy - 14, 2, cx, cy, r, [[0, '#fffbd0'], [0.3, '#ffe04a'], [0.8, '#f0a010'], [1, '#9a5000']]); l.fill();
      l.lineWidth = 1; l.strokeStyle = '#5a2a00'; l.stroke();
      // ^ ^ eyes
      l.lineCap = 'round';
      for (const s of [-1, 1]) {
        l.beginPath(); l.arc(cx + s * 12, cy - 2, 6, 200 * D, 340 * D);
        l.strokeStyle = '#4a1e04'; l.lineWidth = 3.6; l.stroke();
      }
      // big open smile
      l.beginPath(); l.moveTo(cx - 17, cy + 7); l.quadraticCurveTo(cx, cy + 11, cx + 17, cy + 7); l.quadraticCurveTo(cx + 15, cy + 27, cx, cy + 27); l.quadraticCurveTo(cx - 15, cy + 27, cx - 17, cy + 7); l.closePath();
      l.fillStyle = '#7a1414'; l.fill(); l.lineWidth = 1.2; l.strokeStyle = '#3a0404'; l.stroke();
      l.save(); l.clip();
      ell(l, cx, cy + 27, 11, 7); l.fillStyle = '#ff6a7a'; l.fill();
      rr(l, cx - 18, cy + 5, 36, 5, 2); l.fillStyle = '#ffffff'; l.fill();
      l.restore();
      for (const s of [-1, 1]) { ell(l, cx + s * 23, cy + 8, 5.5, 3.2); l.fillStyle = 'rgba(255,90,70,0.45)'; l.fill(); }
      l.save(); circle(l, cx, cy, r); l.clip();
      ell(l, cx - 4, cy - 22, 24, 13); l.fillStyle = lin(l, 0, cy - 35, 0, cy - 9, ['rgba(255,255,255,0.85)', 'rgba(255,255,255,0.05)']); l.fill();
      l.restore();
    });
    // waving hand
    menuObj(ctx, (l) => {
      l.save(); l.translate(76, 74); l.rotate(18 * D);
      const sk = { hi: '#fffbd0', a: '#ffe04a', b: '#f0a010', lo: '#9a5000', line: '#5a2a00' };
      const part = () => { l.fillStyle = rad(l, -6, -10, 1, 0, -4, 22, [sk.hi, sk.a, sk.b]); l.fill(); };
      [[-9, -8, -13, -24], [-3, -10, -4, -28], [3, -10, 5, -27], [8, -8, 12, -21]].forEach(([x1, y1, x2, y2]) => { capsule(l, x1, y1, x2, y2, 3.4); part(); });
      capsule(l, -10, 2, -20, -6, 3.6); part();
      rr(l, -12, -12, 24, 22, 8); part();
      l.strokeStyle = rgba(sk.line, 0.6); l.lineWidth = 0.8;
      [[-6.5, -9, -8, -14], [-0.5, -10, -1, -15], [5.5, -9, 6.5, -14]].forEach(([a, b, c, d]) => { l.beginPath(); l.moveTo(a, b); l.lineTo(c, d); l.stroke(); });
      l.restore();
    }, { ow: 3 });
    // wave motion marks
    ctx.save(); ctx.lineCap = 'round';
    [[88, 44, 7, -70, 20], [94, 52, 5, -60, 25]].forEach(([x, y, r, a0, a1]) => glyphStroke(ctx, () => { ctx.beginPath(); ctx.arc(x - r, y + r, r, a0 * D, a1 * D); }, 2.4, '#ffffff', INK));
    ctx.restore();
  },

  house(ctx) {
    // grassy mound
    menuObj(ctx, (l) => {
      ell(l, 50, 88, 42, 9);
      l.fillStyle = lin(l, 0, 79, 0, 97, ['#b8f070', '#4ab030', '#1a6a1a']); l.fill();
      l.strokeStyle = 'rgba(20,90,20,0.8)'; l.lineWidth = 1.2;
      [[14, 86], [22, 83], [80, 83], [88, 86], [72, 91]].forEach(([x, y]) => { l.beginPath(); l.moveTo(x - 2, y + 2); l.lineTo(x, y - 3); l.lineTo(x + 2, y + 2); l.stroke(); });
    }, { ow: 3 });
    menuObj(ctx, (l) => {
      // stem walls
      const wall = () => { l.beginPath(); l.moveTo(27, 88); l.bezierCurveTo(25, 72, 29, 56, 31, 48); l.lineTo(69, 48); l.bezierCurveTo(71, 56, 75, 72, 73, 88); l.quadraticCurveTo(50, 93, 27, 88); l.closePath(); };
      wall(); l.fillStyle = lin(l, 26, 0, 74, 0, ['#fffdf4', '#f6e6c4', '#d8b88a', '#9a7448']); l.fill(); l.lineWidth = 1; l.strokeStyle = '#4a3218'; l.stroke();
      l.save(); wall(); l.clip();
      ell(l, 50, 50, 26, 6); l.fillStyle = 'rgba(90,50,20,0.35)'; l.fill();
      l.restore();
      // round window with warm light
      circle(l, 37, 64, 6.4); l.fillStyle = lin(l, 31, 58, 43, 70, [M.wood.a, M.wood.lo]); l.fill(); l.lineWidth = 0.9; l.strokeStyle = M.wood.line; l.stroke();
      circle(l, 37, 64, 4.6);
      l.save(); glow(l, '#ffd060', 4); l.fillStyle = rad(l, 36, 63, 0, 37, 64, 5, ['#fffbe0', '#ffd24a', '#e08a10']); l.fill(); l.restore();
      l.beginPath(); l.moveTo(37, 59.4); l.lineTo(37, 68.6); l.moveTo(32.4, 64); l.lineTo(41.6, 64); l.strokeStyle = M.wood.lo; l.lineWidth = 1.2; l.stroke();
      // arched door
      const door = () => { l.beginPath(); l.moveTo(49, 90); l.lineTo(49, 70); l.arc(57, 70, 8, Math.PI, TAU); l.lineTo(65, 90); l.closePath(); };
      door(); l.fillStyle = lin(l, 49, 62, 65, 90, [M.wood.hi, M.wood.a, M.wood.b, M.wood.lo]); l.fill(); l.lineWidth = 1; l.strokeStyle = M.wood.line; l.stroke();
      l.save(); door(); l.clip(); l.strokeStyle = rgba(M.wood.lo, 0.7); l.lineWidth = 0.9;
      [54.3, 59.6].forEach((x) => { l.beginPath(); l.moveTo(x, 60); l.lineTo(x, 92); l.stroke(); });
      l.restore();
      ball(l, 62, 78, 1.6, M.gold);
      // step stone
      ell(l, 57, 91, 10, 2.6); l.fillStyle = lin(l, 0, 88, 0, 94, ['#d8d0c8', '#8a8078']); l.fill(); l.lineWidth = 0.8; l.strokeStyle = '#3a3028'; l.stroke();
      // mushroom cap roof
      const cap = () => { l.beginPath(); l.moveTo(8, 52); l.bezierCurveTo(6, 22, 30, 8, 50, 8); l.bezierCurveTo(70, 8, 94, 22, 92, 52); l.bezierCurveTo(76, 60, 24, 60, 8, 52); l.closePath(); };
      cap(); l.fillStyle = rad(l, 34, 20, 2, 50, 36, 48, [[0, '#ffb8a8'], [0.3, '#ff4a3a'], [0.75, '#c8142a'], [1, '#5a0412']]); l.fill(); l.lineWidth = 1; l.strokeStyle = '#34000a'; l.stroke();
      l.save(); cap(); l.clip();
      [[30, 24, 6, 4.4], [52, 17, 5, 3.4], [72, 28, 6.4, 4.6], [44, 38, 7, 4.2], [18, 42, 4, 3.2], [84, 44, 3.6, 3], [62, 44, 4, 2.6]].forEach(([x, y, rx, ry]) => {
        ell(l, x, y, rx, ry); l.fillStyle = rad(l, x - rx * 0.3, y - ry * 0.3, 0, x, y, rx, ['#ffffff', '#fff2ea', '#e8c8c0']); l.fill();
        l.lineWidth = 0.6; l.strokeStyle = 'rgba(90,0,10,0.5)'; l.stroke();
      });
      l.beginPath(); l.moveTo(8, 52); l.bezierCurveTo(24, 60, 76, 60, 92, 52); l.lineWidth = 4; l.strokeStyle = 'rgba(80,0,10,0.4)'; l.stroke();
      l.restore();
      ell(l, 32, 20, 12, 5, -0.4); l.fillStyle = 'rgba(255,255,255,0.4)'; l.fill();
      spec(l, 24, 26, 1.6, 0.9);
    });
  },
};
MENU.store = MENU.shop;
MENU.portal = (ctx) => {
  const cx = 50, cy = 50;
  const stone = (x, y, s, a) => menuObj(ctx, (l) => {
    l.save(); l.translate(x, y); l.rotate(a);
    poly(l, [[-s, -s * 0.3], [-s * 0.4, -s], [s * 0.7, -s * 0.8], [s, s * 0.1], [s * 0.4, s * 0.9], [-s * 0.7, s * 0.7]]);
    l.fillStyle = lin(l, -s, -s, s, s, ['#e4ecf0', '#8a9aa8', '#3a4652']); l.fill();
    poly(l, [[-s * 0.4, -s], [s * 0.7, -s * 0.8], [s * 0.2, -s * 0.2], [-s, -s * 0.3]]); l.fillStyle = 'rgba(255,255,255,0.35)'; l.fill();
    l.beginPath(); l.moveTo(-s * 0.3, s * 0.1); l.lineTo(s * 0.3, -s * 0.3); l.moveTo(0, -s * 0.5); l.lineTo(0, s * 0.4);
    l.save(); glow(l, '#60ffa0', 2); l.strokeStyle = '#8affb8'; l.lineWidth = 1.1; l.stroke(); l.restore();
    l.restore();
  }, { ow: 2.8, glow: '#5aff9a', glowR: 4, glowA: 0.7 });
  // vortex disc
  menuObj(ctx, (l) => {
    const rx = 34, ry = 40;
    ell(l, cx, cy, rx, ry);
    l.fillStyle = rad(l, cx, cy, 1, cx, cy, ry, [[0, '#f4fff0'], [0.18, '#9affb0'], [0.5, '#1ec060'], [0.85, '#0a5a2e'], [1, '#042a18']]); l.fill();
    l.save(); ell(l, cx, cy, rx, ry); l.clip();
    // spiral arms
    for (let j = 0; j < 3; j++) {
      const outer = [], inner = [];
      const N = 60;
      for (let i = 0; i <= N; i++) {
        const t = i / N, th = t * 2.4 * Math.PI, r = 3 + t * 40;
        const a = th + (j * TAU) / 3, w = 7 * Math.sin(Math.PI * Math.min(1, t * 1.1));
        outer.push([cx + Math.cos(a) * (r + w / 2) * (rx / ry), cy + Math.sin(a) * (r + w / 2)]);
        inner.push([cx + Math.cos(a) * (r - w / 2) * (rx / ry), cy + Math.sin(a) * (r - w / 2)]);
      }
      l.beginPath(); outer.forEach((p, i) => (i ? l.lineTo(p[0], p[1]) : l.moveTo(p[0], p[1])));
      for (let i = inner.length - 1; i >= 0; i--) l.lineTo(inner[i][0], inner[i][1]);
      l.closePath();
      l.fillStyle = j === 0 ? 'rgba(230,255,235,0.85)' : 'rgba(170,255,200,0.6)'; l.fill();
    }
    ell(l, cx, cy, 8, 9); l.fillStyle = rad(l, cx, cy, 0, cx, cy, 9, ['#ffffff', 'rgba(220,255,230,0)']); l.fill();
    ell(l, cx + 4, cy + 6, rx + 2, ry + 2); l.lineWidth = 8; l.strokeStyle = 'rgba(0,40,20,0.45)'; l.stroke();
    l.restore();
    // glossy emerald rim
    ell(l, cx, cy, rx, ry); l.lineWidth = 7; l.strokeStyle = lin(l, cx - rx, cy - ry, cx + rx, cy + ry, ['#d8ffe4', '#3ad880', '#0e7a3e', '#043a1e']); l.stroke();
    ell(l, cx, cy, rx, ry); l.lineWidth = 1; l.strokeStyle = '#032414'; l.stroke();
    ell(l, cx, cy, rx - 3.6, ry - 3.6); l.stroke();
    l.beginPath(); l.ellipse(cx, cy, rx, ry, 0, 200 * D, 250 * D); l.lineWidth = 2; l.strokeStyle = 'rgba(255,255,255,0.85)'; l.stroke();
  }, { glow: '#5aff9a', glowR: 6, glowA: 0.8 });
  stone(13, 26, 6.5, 0.4); stone(88, 20, 5, 1.2); stone(89, 74, 6.5, 2.1); stone(15, 80, 4.6, 0.9);
  sparkle(ctx, 76, 44, 3.5, '#ffffff', '#8affb8');
  sparkle(ctx, 26, 56, 3, '#ffffff', '#8affb8');
};
function sparkleAt(ctx, x, y, r) { sparkle(ctx, x, y, r, '#ffffff', '#ffe890'); }

/* ================================================================== */
/* BUFF ICONS                                                           */
/* ================================================================== */
const BOW = 4.6;
const BUFFS = {
  iron_skin(ctx) {
    buffFrame(ctx, ['#a8e4ff', '#2a70d0', '#0a1a48'], false, () => {
      obj(ctx, (l) => {
        shieldPath(l, 50, 52, 54, 64);
        l.fillStyle = lin(l, 22, 20, 78, 84, [M.steel.hi, M.steel.a, M.steel.b, M.steel.lo]); l.fill();
        shieldPath(l, 50, 53, 36, 46);
        l.fillStyle = rad(l, 42, 40, 1, 50, 54, 30, ['#c8f0ff', '#3a9aff', '#0e2e8a']); l.fill();
        rr(l, 46, 30, 8, 46, 2); l.fillStyle = M.steel.a; l.fill();
        rr(l, 32, 46, 36, 8, 2); l.fill();
        ball(l, 50, 50, 6, M.steel, false);
      }, { ow: BOW, glow: '#a0e8ff', glowR: 6 });
    });
  },
  berserk(ctx) {
    buffFrame(ctx, ['#ffb040', '#c01a08', '#2a0202'], false, () => {
      ctx.save(); glow(ctx, '#ff4a00', 6);
      flamePath(ctx, 50, 90, 70, 74); ctx.fillStyle = lin(ctx, 0, 90, 0, 18, ['#fff4a0', '#ff8a1a', '#e02a08']); ctx.fill();
      ctx.restore();
      obj(ctx, (l) => drawSword(l, { x: 50, y: 66, ang: 0, len: 48, w: 14, blade: M.steel, guard: M.gold, grip: '#3a1008', gw: 18, gripLen: 12 }), { ow: BOW });
    });
  },
  second_wind(ctx) {
    buffFrame(ctx, ['#e0ffc0', '#3aa84a', '#06300f'], false, () => {
      obj(ctx, (l) => {
        heartPath(l, 50, 54, 60);
        l.fillStyle = rad(l, 38, 38, 2, 50, 54, 40, ['#f0ffe0', '#7af06a', '#18902e']); l.fill();
        gloss(l, 36, 40, 10, 6, -0.7, 0.9);
      }, { ow: BOW });
      ctx.save(); glow(ctx, '#ffffff', 3);
      swoosh(ctx, 50, 60, 38, -10 * D, 170 * D, 8, { ry: 0.45, rot: -18 * D, bias: 0.4 }); ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fill();
      ctx.restore();
    });
  },
  provoke(ctx) {
    buffFrame(ctx, ['#fff0a0', '#ff9a20', '#8a2a00'], false, () => {
      obj(ctx, (l) => {
        l.save(); l.translate(50, 50);
        for (let i = 0; i < 4; i++) {
          l.save(); l.rotate((i * Math.PI) / 2);
          l.beginPath(); l.moveTo(7, -30); l.quadraticCurveTo(8, -8, 30, -7); l.lineTo(30, -16); l.quadraticCurveTo(16, -16, 16, -30); l.closePath();
          l.fillStyle = lin(l, 7, -30, 30, -7, ['#ff8a7a', '#e81a1a', '#8a0008']); l.fill();
          l.restore();
        }
        l.restore();
      }, { ow: BOW });
    });
  },
  well_fed(ctx) {
    buffFrame(ctx, ['#ffe8b0', '#e08a2a', '#4a1e04'], false, () => {
      obj(ctx, (l) => {
        // bone
        capsule(l, 44, 58, 26, 76, 5.5); l.fillStyle = lin(l, 20, 60, 44, 80, ['#ffffff', '#f0e4c8', '#b8a070']); l.fill();
        circle(l, 21, 74, 7); l.fill(); circle(l, 27, 81, 7); l.fill();
        // meat
        l.save(); l.translate(58, 42); l.rotate(-45 * D);
        ell(l, 0, 0, 30, 22);
        l.fillStyle = rad(l, -10, -10, 2, 0, 0, 30, ['#ffd8a0', '#e8801a', '#a0400a', '#4a1804']); l.fill();
        l.beginPath(); l.ellipse(4, 6, 20, 8, 0, 0, Math.PI); l.strokeStyle = 'rgba(90,30,0,0.5)'; l.lineWidth = 2; l.stroke();
        l.restore();
        gloss(l, 50, 30, 10, 5, -0.7, 0.85);
      }, { ow: BOW });
    });
  },
  stun(ctx) {
    buffFrame(ctx, ['#e0b0ff', '#7a2ad0', '#1c0640'], true, () => {
      ctx.save(); ctx.beginPath(); ctx.ellipse(50, 56, 36, 14, -0.15, 0, TAU); ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 3; ctx.stroke(); ctx.restore();
      [[20, 56, 12], [52, 38, 17], [78, 64, 12]].forEach(([x, y, s]) => obj(ctx, (l) => {
        starPath(l, x, y, 5, s, s * 0.46, -Math.PI / 2);
        l.fillStyle = rad(l, x - s * 0.3, y - s * 0.3, 0, x, y, s, ['#ffffff', '#ffe860', '#f0a010']); l.fill();
      }, { ow: 3.6, glow: '#fff0a0', glowR: 4 }));
    });
  },
  regen(ctx) {
    buffFrame(ctx, ['#e0fff4', '#2aa890', '#063030'], false, () => {
      ell(ctx, 46, 60, 34, 32); ctx.fillStyle = rad(ctx, 46, 60, 2, 46, 60, 34, [[0, 'rgba(230,255,240,0.6)'], [1, 'rgba(230,255,240,0)']]); ctx.fill();
      obj(ctx, (l) => {
        const line = () => { l.lineWidth = 2; l.strokeStyle = '#1a1030'; l.stroke(); };
        // crossed legs
        l.beginPath(); l.moveTo(12, 84); l.quadraticCurveTo(18, 68, 40, 72); l.lineTo(52, 72); l.quadraticCurveTo(76, 68, 82, 84); l.quadraticCurveTo(47, 94, 12, 84); l.closePath();
        l.fillStyle = lin(l, 0, 68, 0, 92, ['#a88ae8', '#5a3aa0', '#2a1a5a']); l.fill(); line();
        // torso
        l.beginPath(); l.moveTo(34, 46); l.lineTo(60, 46); l.quadraticCurveTo(66, 60, 62, 76); l.lineTo(32, 76); l.quadraticCurveTo(28, 60, 34, 46); l.closePath();
        l.fillStyle = lin(l, 30, 46, 64, 76, ['#9ad8ff', '#2a7ad8', '#12388a']); l.fill(); line();
        // arms resting on knees + hands
        capsule(l, 34, 50, 22, 72, 5.4); l.fillStyle = lin(l, 20, 0, 38, 0, ['#9ad8ff', '#2a7ad8']); l.fill(); line();
        capsule(l, 60, 50, 72, 72, 5.4); l.fillStyle = lin(l, 58, 0, 76, 0, ['#4a9aee', '#1a4aa8']); l.fill(); line();
        circle(l, 22, 75, 5); l.fillStyle = M.skin.a; l.fill(); line();
        circle(l, 72, 75, 5); l.fill(); line();
        // head with hair cap and closed eyes
        circle(l, 47, 30, 15); l.fillStyle = rad(l, 42, 24, 1, 47, 30, 16, [M.skin.hi, M.skin.a, M.skin.b]); l.fill(); line();
        l.beginPath(); l.arc(47, 30, 15.5, Math.PI * 1.05, Math.PI * 1.95); l.quadraticCurveTo(47, 22, 32, 27); l.closePath();
        l.fillStyle = lin(l, 0, 14, 0, 28, ['#c07a3a', '#6a3a14']); l.fill(); line();
        for (const sx of [-1, 1]) { l.beginPath(); l.arc(47 + sx * 6, 31, 3.4, 0.15 * Math.PI, 0.85 * Math.PI); l.lineWidth = 2.2; l.strokeStyle = '#2a1008'; l.stroke(); }
      }, { ow: BOW });
      obj(ctx, (l) => {
        rr(l, 74, 10, 9, 28, 2.5); l.fillStyle = lin(l, 0, 10, 0, 38, ['#d8ffd0', '#4ae05a', '#1a8a2a']); l.fill();
        rr(l, 64.5, 19.5, 28, 9, 2.5); l.fill();
      }, { ow: 3.6, glow: '#aaffaa', glowR: 4 });
    });
  },
};

/* ================================================================== */
/* fallback + public API                                                */
/* ================================================================== */
function fallback(kind) {
  return (ctx) => {
    const qm = (l) => {
      const q = () => { l.beginPath(); l.moveTo(40, 40); l.arc(50, 40, 10.5, Math.PI, Math.PI * 2.3); l.quadraticCurveTo(50, 50, 50, 57); };
      glyphStroke(l, q, 6.4, '#ffffff', 'rgba(20,10,30,0.9)');
      circle(l, 50, 68, 5.4); l.fillStyle = 'rgba(20,10,30,0.9)'; l.fill();
      circle(l, 50, 68, 3.5); l.fillStyle = '#ffffff'; l.fill();
    };
    if (kind === 'skill') skillFrame(ctx, { c: ['#b8b0c8', '#5a5070', '#1a1624'], seed: 'fb' }, () => obj(ctx, qm, { ow: 0 }));
    else if (kind === 'item') itemFrame(ctx, '#8a80a0', () => obj(ctx, qm, { ow: 0 }));
    else if (kind === 'buff') buffFrame(ctx, ['#c8c0d8', '#6a6080', '#1a1624'], false, () => obj(ctx, qm, { ow: 0 }));
    else menuObj(ctx, (l) => { drawOrb(l, 50, 50, 44, { hi: '#e8e0f0', a: '#a898c0', b: '#6a5a88', lo: '#2a2040' }); qm(l); orbShine(l, 50, 50, 44); });
  };
}

function render(kind, table, id, size) {
  const s = Math.max(8, Math.round(Number(size) || 64));
  const key = `${kind}:${id}:${s}`;
  const hit = cache.get(key);
  if (hit) return hit;
  let url;
  const fn = Object.prototype.hasOwnProperty.call(table, id) ? table[id] : null;
  try {
    url = rasterize(s, fn || fallback(kind));
  } catch (e) {
    console.warn(`[icons] failed to draw ${kind} "${id}"`, e);
    try { url = rasterize(s, fallback(kind)); } catch { url = ''; }
  }
  cache.set(key, url);
  return url;
}

export function skillIcon(id, size = 64) { return render('skill', SKILLS, id, size); }
export function itemIcon(id, size = 64) { return render('item', ITEMS, id, size); }
export function menuIcon(id, size = 64) { return render('menu', MENU, id, size); }
export function buffIcon(id, size = 32) { return render('buff', BUFFS, id, size); }

export const SKILL_ICON_IDS = Object.freeze(Object.keys(SKILLS));
export const ITEM_ICON_IDS = Object.freeze(Object.keys(ITEMS));
export const MENU_ICON_IDS = Object.freeze(Object.keys(MENU));
export const BUFF_ICON_IDS = Object.freeze(Object.keys(BUFFS));

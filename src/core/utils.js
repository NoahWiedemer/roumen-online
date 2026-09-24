// Shared math / noise helpers

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const TAU = Math.PI * 2;

export function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
export function dampAngle(a, b, lambda, dt) {
  return a + angleDiff(a, b) * (1 - Math.exp(-lambda * dt));
}

// Deterministic PRNG
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 2D value noise with smooth interpolation (seeded, tileable when period given)
function hash2(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 982451653) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967295;
}

export function makeNoise2D(seed = 1, period = 0) {
  return function (x, y) {
    let xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    let x1 = xi + 1, y1 = yi + 1;
    if (period) {
      xi = ((xi % period) + period) % period;
      yi = ((yi % period) + period) % period;
      x1 = ((x1 % period) + period) % period;
      y1 = ((y1 % period) + period) % period;
    }
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash2(xi, yi, seed), b = hash2(x1, yi, seed);
    const c = hash2(xi, y1, seed), d = hash2(x1, y1, seed);
    return lerp(lerp(a, b, u), lerp(c, d, u), v);
  };
}

export function makeFbm(seed = 1, octaves = 4, period = 0) {
  const layers = [];
  for (let i = 0; i < octaves; i++) layers.push(makeNoise2D(seed + i * 17, period ? period << i : 0));
  return function (x, y) {
    let sum = 0, amp = 0.5, norm = 0, f = 1;
    for (let i = 0; i < octaves; i++) {
      sum += layers[i](x * f, y * f) * amp;
      norm += amp;
      amp *= 0.5;
      f *= 2;
    }
    return sum / norm;
  };
}

export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}
export function randRange(rng, a, b) {
  return a + (b - a) * rng();
}

export function formatMoney(copper) {
  const gem = Math.floor(copper / 100000000);
  const gold = Math.floor(copper / 1000000) % 100;
  const silver = Math.floor(copper / 1000) % 1000;
  const cu = copper % 1000;
  return { gem, gold, silver, copper: cu };
}

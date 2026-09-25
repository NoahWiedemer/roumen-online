// Static 2D colliders (circles + oriented boxes on the XZ plane) and a nav grid with A*
import { clamp } from '../core/utils.js';
import { WORLD } from './layout.js';

export class Colliders {
  constructor(playable = WORLD.playable) {
    this.playable = playable;  // hard clamp for entities (half extent of the walkable square)
    this.circles = [];
    this.boxes = [];
    this.cell = 8;
    this.grid = new Map();
  }
  _key(ix, iz) { return ix * 73856093 ^ iz * 19349663; }
  _insert(obj, minX, minZ, maxX, maxZ) {
    const c = this.cell;
    for (let ix = Math.floor(minX / c); ix <= Math.floor(maxX / c); ix++)
      for (let iz = Math.floor(minZ / c); iz <= Math.floor(maxZ / c); iz++) {
        const k = this._key(ix, iz);
        if (!this.grid.has(k)) this.grid.set(k, []);
        this.grid.get(k).push(obj);
      }
  }
  addCircle(x, z, r) {
    const o = { type: 'c', x, z, r };
    this.circles.push(o);
    this._insert(o, x - r, z - r, x + r, z + r);
    return o;
  }
  // box centred at (x,z) with half extents hw (local x) / hd (local z), rotated by rotY
  addBox(x, z, hw, hd, rotY = 0) {
    const cos = Math.cos(rotY), sin = Math.sin(rotY);
    const o = { type: 'b', x, z, hw, hd, cos, sin };
    this.boxes.push(o);
    const ex = Math.abs(cos) * hw + Math.abs(sin) * hd, ez = Math.abs(sin) * hw + Math.abs(cos) * hd;
    this._insert(o, x - ex, z - ez, x + ex, z + ez);
    return o;
  }
  near(x, z) {
    const c = this.cell;
    return this.grid.get(this._key(Math.floor(x / c), Math.floor(z / c))) || [];
  }
  // push a circle of radius r at (x,z) out of all colliders; returns corrected {x,z}
  resolve(x, z, r) {
    for (let iter = 0; iter < 2; iter++) {
      const seen = new Set();
      for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) {
        for (const o of this.near(x + ox * this.cell * 0.5, z + oz * this.cell * 0.5)) {
          if (seen.has(o)) continue;
          seen.add(o);
          if (o.type === 'c') {
            const dx = x - o.x, dz = z - o.z, d = Math.hypot(dx, dz), m = o.r + r;
            if (d < m && d > 1e-5) { x = o.x + (dx / d) * m; z = o.z + (dz / d) * m; }
          } else {
            // to local
            const dx = x - o.x, dz = z - o.z;
            const lx = dx * o.cos - dz * o.sin, lz = dx * o.sin + dz * o.cos;
            const cx = clamp(lx, -o.hw, o.hw), cz = clamp(lz, -o.hd, o.hd);
            let px = lx - cx, pz = lz - cz;
            const d = Math.hypot(px, pz);
            let nlx = lx, nlz = lz;
            if (d < r) {
              if (d > 1e-5) { nlx = cx + (px / d) * r; nlz = cz + (pz / d) * r; }
              else {
                // inside the box: push out along the smallest axis
                const exX = o.hw - Math.abs(lx), exZ = o.hd - Math.abs(lz);
                if (exX < exZ) nlx = Math.sign(lx || 1) * (o.hw + r); else nlz = Math.sign(lz || 1) * (o.hd + r);
              }
              x = o.x + nlx * o.cos + nlz * o.sin;
              z = o.z - nlx * o.sin + nlz * o.cos;
            }
          }
        }
      }
    }
    const P = this.playable;
    return { x: clamp(x, -P, P), z: clamp(z, -P, P) };
  }
  blocked(x, z, r = 0.3) {
    const p = this.resolve(x, z, r);
    return Math.abs(p.x - x) > 1e-3 || Math.abs(p.z - z) > 1e-3;
  }
}

// ----------------------------------------------------------------- nav grid
export class NavGrid {
  constructor(terrain, colliders, cellSize = 1) {
    this.cs = cellSize;
    const size = terrain.size || WORLD.size;
    this.n = Math.ceil(size / cellSize);
    this.half = size / 2;
    this.walk = new Uint8Array(this.n * this.n);
    const P = colliders.playable;
    for (let j = 0; j < this.n; j++) for (let i = 0; i < this.n; i++) {
      const x = -this.half + (i + 0.5) * cellSize, z = -this.half + (j + 0.5) * cellSize;
      let ok = Math.abs(x) < P && Math.abs(z) < P;
      const deck = terrain.deckAt ? terrain.deckAt(x, z) !== null : false;
      if (ok && terrain.isWater(x, z)) ok = false;
      if (ok && !deck && terrain.slopeAt(x, z) > 0.42) ok = false;
      if (ok && colliders.blocked(x, z, 0.45)) ok = false;
      this.walk[j * this.n + i] = ok ? 1 : 0;
    }
  }
  toCell(x, z) {
    return [clamp(Math.floor((x + this.half) / this.cs), 0, this.n - 1), clamp(Math.floor((z + this.half) / this.cs), 0, this.n - 1)];
  }
  toWorld(i, j) { return [-this.half + (i + 0.5) * this.cs, -this.half + (j + 0.5) * this.cs]; }
  isWalkable(x, z) { const [i, j] = this.toCell(x, z); return !!this.walk[j * this.n + i]; }

  // line of sight over walkable cells (supercover-ish sampling)
  los(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az);
    const steps = Math.ceil(d / (this.cs * 0.4));
    for (let k = 1; k < steps; k++) {
      const t = k / steps;
      if (!this.isWalkable(ax + (bx - ax) * t, az + (bz - az) * t)) return false;
    }
    return true;
  }

  nearestWalkable(x, z, maxR = 12) {
    if (this.isWalkable(x, z)) return [x, z];
    const [ci, cj] = this.toCell(x, z);
    for (let r = 1; r <= maxR; r++) {
      let best = null, bd = 1e9;
      for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) {
        if (Math.max(Math.abs(a), Math.abs(b)) !== r) continue;
        const i = ci + a, j = cj + b;
        if (i < 0 || j < 0 || i >= this.n || j >= this.n || !this.walk[j * this.n + i]) continue;
        const dd = a * a + b * b;
        if (dd < bd) { bd = dd; best = this.toWorld(i, j); }
      }
      if (best) return best;
    }
    return null;
  }

  // A* returning list of [x,z] waypoints (smoothed), or null
  findPath(sx, sz, tx, tz, maxNodes = 40000) {
    const t = this.nearestWalkable(tx, tz);
    if (!t) return null;
    [tx, tz] = t;
    if (this.los(sx, sz, tx, tz)) return [[tx, tz]];
    const n = this.n;
    const [si, sj] = this.toCell(sx, sz);
    const [ti, tj] = this.toCell(tx, tz);
    const start = sj * n + si, goal = tj * n + ti;
    const g = new Map(), came = new Map();
    const open = new MinHeap();
    g.set(start, 0);
    const h = (i, j) => { const dx = Math.abs(i - ti), dz = Math.abs(j - tj); return (dx + dz) + (Math.SQRT2 - 2) * Math.min(dx, dz); };
    open.push(start, h(si, sj));
    const closed = new Set();
    let found = false, count = 0;
    const dirs = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
    while (open.size && count++ < maxNodes) {
      const cur = open.pop();
      if (cur === goal) { found = true; break; }
      if (closed.has(cur)) continue;
      closed.add(cur);
      const ci = cur % n, cj = (cur / n) | 0;
      const gc = g.get(cur);
      for (const [di, dj, cost] of dirs) {
        const ni = ci + di, nj = cj + dj;
        if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
        const k = nj * n + ni;
        if (!this.walk[k]) continue;
        if (di && dj && (!this.walk[cj * n + ni] || !this.walk[nj * n + ci])) continue;
        const ng = gc + cost;
        if (ng < (g.has(k) ? g.get(k) : Infinity)) {
          g.set(k, ng); came.set(k, cur);
          open.push(k, ng + h(ni, nj));
        }
      }
    }
    if (!found) return null;
    const cells = [];
    let c = goal;
    while (c !== undefined && c !== start) { cells.push(c); c = came.get(c); }
    cells.reverse();
    const pts = cells.map((k) => this.toWorld(k % n, (k / n) | 0));
    pts[pts.length - 1] = [tx, tz];
    // string pulling
    const out = [];
    let ax = sx, az = sz, idx = 0;
    while (idx < pts.length) {
      let far = idx;
      for (let k = pts.length - 1; k > idx; k--) {
        if (this.los(ax, az, pts[k][0], pts[k][1])) { far = k; break; }
      }
      out.push(pts[far]);
      [ax, az] = pts[far];
      idx = far + 1;
    }
    return out;
  }
}

class MinHeap {
  constructor() { this.k = []; this.p = []; }
  get size() { return this.k.length; }
  push(key, pri) {
    const k = this.k, p = this.p;
    k.push(key); p.push(pri);
    let i = k.length - 1;
    while (i > 0) {
      const pa = (i - 1) >> 1;
      if (p[pa] <= p[i]) break;
      [k[pa], k[i]] = [k[i], k[pa]]; [p[pa], p[i]] = [p[i], p[pa]];
      i = pa;
    }
  }
  pop() {
    const k = this.k, p = this.p;
    const top = k[0];
    const lk = k.pop(), lp = p.pop();
    if (k.length) {
      k[0] = lk; p[0] = lp;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < k.length && p[l] < p[m]) m = l;
        if (r < k.length && p[r] < p[m]) m = r;
        if (m === i) break;
        [k[m], k[i]] = [k[i], k[m]]; [p[m], p[i]] = [p[i], p[m]];
        i = m;
      }
    }
    return top;
  }
}

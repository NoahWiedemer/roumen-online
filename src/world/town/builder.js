// Geometry accumulator for the town: collects triangles per material in typed arrays,
// supports a transform "frame" stack, world-scale UV projection, tint + baked AO vertex
// colours, and flushes one merged geometry per material into the StaticBatcher.
import * as THREE from 'three';

class Acc {
  constructor() {
    this.cap = 3 * 4096;
    this.n = 0; // vertex count
    this.pos = new Float32Array(this.cap * 3);
    this.nor = new Float32Array(this.cap * 3);
    this.uv = new Float32Array(this.cap * 2);
    this.col = new Float32Array(this.cap * 3);
  }
  reserve(k) {
    if (this.n + k <= this.cap) return;
    let c = this.cap;
    while (this.n + k > c) c *= 2;
    const grow = (a, s) => { const b = new Float32Array(c * s); b.set(a); return b; };
    this.pos = grow(this.pos, 3); this.nor = grow(this.nor, 3); this.uv = grow(this.uv, 2); this.col = grow(this.col, 3);
    this.cap = c;
  }
}

// unit box faces: corners (CCW from outside), normal, in-plane axes [uAxis, vAxis]
const FACES = {
  px: { n: [1, 0, 0], c: [[0.5, -0.5, 0.5], [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5]], ax: [2, 1] },
  nx: { n: [-1, 0, 0], c: [[-0.5, -0.5, -0.5], [-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5]], ax: [2, 1] },
  py: { n: [0, 1, 0], c: [[-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5]], ax: [0, 2] },
  ny: { n: [0, -1, 0], c: [[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5]], ax: [0, 2] },
  pz: { n: [0, 0, 1], c: [[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]], ax: [0, 1] },
  nz: { n: [0, 0, -1], c: [[0.5, -0.5, -0.5], [-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5]], ax: [0, 1] },
};
const FACE_KEYS = ['px', 'nx', 'py', 'ny', 'pz', 'nz'];
const QUAD_IDX = [0, 1, 2, 0, 2, 3];
const WHITE = [1, 1, 1];

// cached unit geometries (non-indexed flat arrays)
const UNIT = new Map();
export function unitGeo(key, make) {
  let d = UNIT.get(key);
  if (!d) {
    let g = make();
    if (g.index) g = g.toNonIndexed();
    if (!g.attributes.normal) g.computeVertexNormals();
    d = {
      pos: g.attributes.position.array,
      nor: g.attributes.normal.array,
      uv: g.attributes.uv ? g.attributes.uv.array : null,
      n: g.attributes.position.count,
    };
    UNIT.set(key, d);
    g.dispose();
  }
  return d;
}

const _m = new THREE.Matrix4(), _nm = new THREE.Matrix3();
const _p = new THREE.Vector3(), _n = new THREE.Vector3(), _pl = new THREE.Vector3(), _nl = new THREE.Vector3();
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _t = new THREE.Vector3();

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// compose part matrix (Euler YXZ like batcher.mat)
export function pm(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  _t.set(x, y, z);
  _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ'));
  _s.set(sx, sy, sz);
  return new THREE.Matrix4().compose(_t, _q, _s);
}

export class GeoBuilder {
  constructor() {
    this.acc = new Map();
    this.F = new THREE.Matrix4();
    this.FN = new THREE.Matrix3();
    this.stack = [];
    this.ao = null; // { y0, h, min } world-space ground AO
    this.uvOff = [0, 0];
  }

  // ---------------------------------------------------------------- frames
  setFrame(m) { this.F.copy(m); this.FN.getNormalMatrix(this.F); return this; }
  resetFrame() { this.F.identity(); this.FN.identity(); this.stack.length = 0; return this; }
  push(m) { this.stack.push(this.F.clone()); this.F.multiply(m); this.FN.getNormalMatrix(this.F); return this; }
  pop() { this.F.copy(this.stack.pop()); this.FN.getNormalMatrix(this.F); return this; }

  _get(mat) {
    let a = this.acc.get(mat);
    if (!a) { a = new Acc(); this.acc.set(mat, a); }
    return a;
  }

  _aoMul(y) {
    const a = this.ao;
    if (!a) return 1;
    return a.min + (1 - a.min) * smooth(a.y0, a.y0 + a.h, y);
  }

  // emit one vertex: local (frame-space) position/normal already computed in _pl/_nl
  _vert(acc, u, v, cr, cg, cb, useAo) {
    _p.copy(_pl).applyMatrix4(this.F);
    _n.copy(_nl).applyMatrix3(this.FN).normalize();
    const i = acc.n++;
    acc.pos[i * 3] = _p.x; acc.pos[i * 3 + 1] = _p.y; acc.pos[i * 3 + 2] = _p.z;
    acc.nor[i * 3] = _n.x; acc.nor[i * 3 + 1] = _n.y; acc.nor[i * 3 + 2] = _n.z;
    acc.uv[i * 2] = u; acc.uv[i * 2 + 1] = v;
    const k = useAo ? this._aoMul(_p.y) : 1;
    acc.col[i * 3] = cr * k; acc.col[i * 3 + 1] = cg * k; acc.col[i * 3 + 2] = cb * k;
  }

  // --------------------------------------------------------------- box
  // Box of size (w,h,d) transformed by part matrix m (in frame space).
  // opt: mat (default material), faces {px:mat|null,...}, skip:[...], color [r,g,b] or {px:[..]},
  //      uv: 'frame' | 'part' | 'grain' (default 'part'), uvs: repeats per metre, ao: bool
  box(mat, m, w, h, d, opt = {}) {
    const S = [w, h, d];
    const uvMode = opt.uv || 'part';
    const uvs = opt.uvs ?? 0.4;
    const useAo = opt.ao !== false;
    _nm.getNormalMatrix(m);
    const lp = new THREE.Vector3();
    const corners = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const uvsOut = [[0, 0], [0, 0], [0, 0], [0, 0]];
    const nl = new THREE.Vector3();
    for (const fk of FACE_KEYS) {
      if (opt.skip && opt.skip.includes(fk)) continue;
      let fmat = mat;
      if (opt.faces && fk in opt.faces) fmat = opt.faces[fk];
      if (!fmat) continue;
      const f = FACES[fk];
      let col = opt.color || WHITE;
      if (opt.faceColor && opt.faceColor[fk]) col = opt.faceColor[fk];
      const acc = this._get(fmat);
      acc.reserve(6);
      nl.set(f.n[0], f.n[1], f.n[2]).applyMatrix3(_nm).normalize();
      let ua = f.ax[0], va = f.ax[1];
      if (uvMode === 'grain' && S[va] > S[ua]) { const t = ua; ua = va; va = t; }
      for (let c = 0; c < 4; c++) {
        const cc = f.c[c];
        lp.set(cc[0] * w, cc[1] * h, cc[2] * d);
        corners[c].copy(lp).applyMatrix4(m);
        let u, v;
        if (uvMode === 'frame') [u, v] = projUV(corners[c], nl);
        else { u = lp.getComponent(ua); v = lp.getComponent(va); }
        uvsOut[c][0] = u * uvs + this.uvOff[0]; uvsOut[c][1] = v * uvs + this.uvOff[1];
      }
      for (const k of QUAD_IDX) {
        _pl.copy(corners[k]);
        _nl.copy(nl);
        this._vert(acc, uvsOut[k][0], uvsOut[k][1], col[0], col[1], col[2], useAo);
      }
    }
  }

  // --------------------------------------------------------------- generic geometry
  // unit: {pos,nor,uv,n} from unitGeo(); m: part matrix; opt: color, uv:'keep'|'frame'|fn, uvScale:[su,sv], uvs, ao
  geo(mat, unit, m, opt = {}) {
    const acc = this._get(mat);
    acc.reserve(unit.n);
    _nm.getNormalMatrix(m);
    const col = opt.color || [1, 1, 1];
    const uvMode = opt.uv || 'keep';
    const su = opt.uvScale ? opt.uvScale[0] : 1, sv = opt.uvScale ? opt.uvScale[1] : 1;
    const uo = opt.uvOffset ? opt.uvOffset[0] : 0, vo = opt.uvOffset ? opt.uvOffset[1] : 0;
    const uvs = opt.uvs ?? 0.4;
    const useAo = opt.ao !== false;
    const colFn = opt.colorFn;
    const flat = opt.flat;
    const P = unit.pos, N = unit.nor, U = unit.uv;
    const tmp = new THREE.Vector3();
    for (let i = 0; i < unit.n; i++) {
      _pl.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
      if (colFn) tmp.copy(_pl);
      _pl.applyMatrix4(m);
      _nl.set(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]).applyMatrix3(_nm).normalize();
      if (flat && i % 3 === 0) {
        // compute flat face normal from the triangle
        const a = new THREE.Vector3(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]).applyMatrix4(m);
        const b = new THREE.Vector3(P[i * 3 + 3], P[i * 3 + 4], P[i * 3 + 5]).applyMatrix4(m);
        const c = new THREE.Vector3(P[i * 3 + 6], P[i * 3 + 7], P[i * 3 + 8]).applyMatrix4(m);
        this._flatN = b.sub(a).cross(c.sub(a)).normalize();
      }
      if (flat) _nl.copy(this._flatN);
      let u = 0, v = 0;
      if (uvMode === 'keep') { if (U) { u = U[i * 2] * su + uo; v = U[i * 2 + 1] * sv + vo; } }
      else if (uvMode === 'frame') { [u, v] = projUV(_pl, _nl); u = u * uvs + this.uvOff[0]; v = v * uvs + this.uvOff[1]; }
      else if (typeof uvMode === 'function') { [u, v] = uvMode(_pl, _nl, i); }
      let cr = col[0], cg = col[1], cb = col[2];
      if (colFn) { const k = colFn(tmp, i); cr *= k; cg *= k; cb *= k; }
      this._vert(acc, u, v, cr, cg, cb, useAo);
    }
  }

  // --------------------------------------------------------------- raw triangles / quads (frame space)
  // pts: array of THREE.Vector3 (frame space), uvs: [[u,v],...], normal optional (computed)
  tri(mat, a, b, c, ua, ub, uc, col = [1, 1, 1], nrm = null, useAo = true) {
    const acc = this._get(mat);
    acc.reserve(3);
    const n = nrm || new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    for (const [p, uv] of [[a, ua], [b, ub], [c, uc]]) {
      _pl.copy(p); _nl.copy(n);
      this._vert(acc, uv[0], uv[1], col[0], col[1], col[2], useAo);
    }
  }
  quad(mat, a, b, c, d, ua, ub, uc, ud, col = [1, 1, 1], nrm = null, useAo = true) {
    const n = nrm || new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    this.tri(mat, a, b, c, ua, ub, uc, col, n, useAo);
    this.tri(mat, a, c, d, ua, uc, ud, col, n, useAo);
  }
  // quad whose winding is fixed so its face normal points along `dir` (frame space)
  quadN(mat, a, b, c, d, ua, ub, uc, ud, col, dir, useAo = true) {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    if (n.lengthSq() < 1e-12) n.subVectors(c, a).cross(new THREE.Vector3().subVectors(d, a));
    n.normalize();
    if (n.dot(dir) < 0) { this.quad(mat, d, c, b, a, ud, uc, ub, ua, col, n.negate(), useAo); return; }
    this.quad(mat, a, b, c, d, ua, ub, uc, ud, col, n, useAo);
  }
  triN(mat, a, b, c, ua, ub, uc, col, dir, useAo = true) {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    if (n.dot(dir) < 0) { this.tri(mat, a, c, b, ua, uc, ub, col, n.negate(), useAo); return; }
    this.tri(mat, a, b, c, ua, ub, uc, col, n, useAo);
  }
  // per-vertex coloured triangle (colours array of 3)
  triC(mat, a, b, c, ua, ub, uc, ca, cb, cc, nrm = null) {
    const acc = this._get(mat);
    acc.reserve(3);
    const n = nrm || new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    for (const [p, uv, col] of [[a, ua, ca], [b, ub, cb], [c, uc, cc]]) {
      _pl.copy(p); _nl.copy(n);
      this._vert(acc, uv[0], uv[1], col[0], col[1], col[2], false);
    }
  }

  triangleCount() {
    let t = 0;
    for (const a of this.acc.values()) t += a.n / 3;
    return t;
  }

  // Build geometries and hand them to the static batcher (one geometry per material)
  flush(batcher) {
    const stats = [];
    for (const [mat, a] of this.acc) {
      if (!a.n) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(a.pos.slice(0, a.n * 3), 3));
      g.setAttribute('normal', new THREE.BufferAttribute(a.nor.slice(0, a.n * 3), 3));
      g.setAttribute('uv', new THREE.BufferAttribute(a.uv.slice(0, a.n * 2), 2));
      g.setAttribute('color', new THREE.BufferAttribute(a.col.slice(0, a.n * 3), 3));
      batcher.add(g, mat);
      stats.push({ name: mat.name, tris: a.n / 3 });
      g.dispose();
    }
    this.acc.clear();
    return stats;
  }

  // Build standalone meshes (for dynamic/separate objects)
  toGeometry(mat) {
    const a = this.acc.get(mat);
    if (!a) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(a.pos.slice(0, a.n * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(a.nor.slice(0, a.n * 3), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(a.uv.slice(0, a.n * 2), 2));
    g.setAttribute('color', new THREE.BufferAttribute(a.col.slice(0, a.n * 3), 3));
    this.acc.delete(mat);
    return g;
  }
}


// box projection in frame space
function projUV(p, n) {
  const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
  if (ay >= ax && ay >= az) return [p.x, p.z];
  if (ax >= az) return [n.x > 0 ? -p.z : p.z, p.y];
  return [n.z > 0 ? p.x : -p.x, p.y];
}

// ------------------------------------------------------------------ unit shapes
export const U = {
  cyl: (seg = 12, open = false) => unitGeo(`cyl${seg}${open}`, () => new THREE.CylinderGeometry(1, 1, 1, seg, 1, open)),
  cone: (seg = 12) => unitGeo(`cone${seg}`, () => new THREE.ConeGeometry(1, 1, seg, 1, true)),
  coneCap: (seg = 12) => unitGeo(`conec${seg}`, () => new THREE.ConeGeometry(1, 1, seg, 1, false)),
  frustum: (rTop, seg = 12) => unitGeo(`fr${rTop}_${seg}`, () => new THREE.CylinderGeometry(rTop, 1, 1, seg, 1, false)),
  sphere: (w = 10, h = 7) => unitGeo(`sph${w}_${h}`, () => new THREE.SphereGeometry(1, w, h)),
  hemi: (w = 10, h = 4) => unitGeo(`hemi${w}_${h}`, () => new THREE.SphereGeometry(1, w, h, 0, Math.PI * 2, 0, Math.PI / 2)),
  ico: (d = 0) => unitGeo(`ico${d}`, () => new THREE.IcosahedronGeometry(1, d)),
  torus: (r = 1, t = 0.1, rs = 6, ts = 16, arc = Math.PI * 2) => unitGeo(`tor${r}_${t}_${rs}_${ts}_${arc}`, () => new THREE.TorusGeometry(r, t, rs, ts, arc)),
  plane: () => unitGeo('plane', () => new THREE.PlaneGeometry(1, 1)),
  circle: (seg = 24) => unitGeo(`circ${seg}`, () => new THREE.CircleGeometry(1, seg).rotateX(-Math.PI / 2)),
  ring: (inner, seg = 32) => unitGeo(`ring${inner}_${seg}`, () => new THREE.RingGeometry(inner, 1, seg, 1).rotateX(-Math.PI / 2)),
  lathe: (key, pts, seg = 16) => unitGeo(`lathe_${key}_${seg}`, () => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg)),
  // chamfered box (unit size), bevel b relative (0..0.5)
  bevel: (b = 0.12) => unitGeo(`bev${b}`, () => chamferBox(b)),
};

// Unit chamfered box (-0.5..0.5) with flat-shaded faces
function chamferBox(b) {
  const h = 0.5, i = 0.5 - b;
  const pos = [];
  const pushTri = (a, c, d) => pos.push(...a, ...c, ...d);
  const quad = (a, c, d, e) => { pushTri(a, c, d); pushTri(a, d, e); };
  // main faces
  const S = [-1, 1];
  // +-x faces
  for (const s of S) {
    const x = s * h;
    const pts = [[x, -i, -i], [x, -i, i], [x, i, i], [x, i, -i]];
    if (s > 0) quad(pts[1], pts[0], pts[3], pts[2]); else quad(...pts);
  }
  for (const s of S) {
    const y = s * h;
    const pts = [[-i, y, -i], [i, y, -i], [i, y, i], [-i, y, i]];
    if (s > 0) quad(pts[3], pts[2], pts[1], pts[0]); else quad(...pts);
  }
  for (const s of S) {
    const z = s * h;
    const pts = [[-i, -i, z], [i, -i, z], [i, i, z], [-i, i, z]];
    if (s > 0) quad(...pts); else quad(pts[1], pts[0], pts[3], pts[2]);
  }
  // edges and corners: build by convex hull approach — simpler: explicit
  const V = (x, y, z) => [x, y, z];
  // edges parallel to x
  for (const sy of S) for (const sz of S) {
    const a = V(-i, sy * h, sz * i), b2 = V(i, sy * h, sz * i), c = V(i, sy * i, sz * h), d = V(-i, sy * i, sz * h);
    orientQuad(pos, [a, b2, c, d], [0, sy, sz]);
  }
  for (const sx of S) for (const sz of S) {
    const a = V(sx * h, -i, sz * i), b2 = V(sx * h, i, sz * i), c = V(sx * i, i, sz * h), d = V(sx * i, -i, sz * h);
    orientQuad(pos, [a, b2, c, d], [sx, 0, sz]);
  }
  for (const sx of S) for (const sy of S) {
    const a = V(sx * h, sy * i, -i), b2 = V(sx * h, sy * i, i), c = V(sx * i, sy * h, i), d = V(sx * i, sy * h, -i);
    orientQuad(pos, [a, b2, c, d], [sx, sy, 0]);
  }
  for (const sx of S) for (const sy of S) for (const sz of S) {
    const a = V(sx * h, sy * i, sz * i), b2 = V(sx * i, sy * h, sz * i), c = V(sx * i, sy * i, sz * h);
    orientTri(pos, [a, b2, c], [sx, sy, sz]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  // box-projected uvs in unit space
  const P = g.attributes.position, N = g.attributes.normal;
  const uv = new Float32Array(P.count * 2);
  for (let k = 0; k < P.count; k++) {
    const p = new THREE.Vector3().fromBufferAttribute(P, k), n = new THREE.Vector3().fromBufferAttribute(N, k);
    const [u, v] = projUV(p, n);
    uv[k * 2] = u + 0.5; uv[k * 2 + 1] = v + 0.5;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
function orientTri(pos, [a, b, c], dir) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
  if (n[0] * dir[0] + n[1] * dir[1] + n[2] * dir[2] < 0) pos.push(...a, ...c, ...b); else pos.push(...a, ...b, ...c);
}
function orientQuad(pos, [a, b, c, d], dir) {
  orientTri(pos, [a, b, c], dir);
  orientTri(pos, [a, c, d], dir);
}

// Iso-line extraction on the terrain height field (marching squares + segment chaining).
// Used to find quay edges (plaza/island meets the sea) and the foot of the northern cliff.

// returns array of polylines [[x,z], ...] for heightAt(x,z) == iso inside bbox [x0,z0,x1,z1]
export function isoLines(heightAt, bbox, iso, step = 0.5) {
  const [x0, z0, x1, z1] = bbox;
  const nx = Math.ceil((x1 - x0) / step), nz = Math.ceil((z1 - z0) / step);
  const H = new Float32Array((nx + 1) * (nz + 1));
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) H[j * (nx + 1) + i] = heightAt(x0 + i * step, z0 + j * step) - iso;
  const segs = [];
  const P = (i, j) => [x0 + i * step, z0 + j * step];
  const lerpE = (a, b, va, vb) => { const t = va / (va - vb); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; };
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const v0 = H[j * (nx + 1) + i], v1 = H[j * (nx + 1) + i + 1], v2 = H[(j + 1) * (nx + 1) + i + 1], v3 = H[(j + 1) * (nx + 1) + i];
    const c0 = P(i, j), c1 = P(i + 1, j), c2 = P(i + 1, j + 1), c3 = P(i, j + 1);
    const pts = [];
    const edges = [[c0, c1, v0, v1], [c1, c2, v1, v2], [c2, c3, v2, v3], [c3, c0, v3, v0]];
    for (const [a, b, va, vb] of edges) if ((va > 0) !== (vb > 0)) pts.push(lerpE(a, b, va, vb));
    if (pts.length === 2) segs.push([pts[0], pts[1]]);
    else if (pts.length === 4) { segs.push([pts[0], pts[1]]); segs.push([pts[2], pts[3]]); }
  }
  return chain(segs);
}

function chain(segs) {
  const key = (p) => `${Math.round(p[0] * 1000)},${Math.round(p[1] * 1000)}`;
  const map = new Map();
  segs.forEach((s, i) => {
    for (const e of [0, 1]) {
      const k = key(s[e]);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(i);
    }
  });
  const used = new Uint8Array(segs.length);
  const lines = [];
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = 1;
    const line = [segs[i][0], segs[i][1]];
    for (const dir of [1, -1]) {
      for (;;) {
        const end = dir > 0 ? line[line.length - 1] : line[0];
        const cand = (map.get(key(end)) || []).find((k) => !used[k]);
        if (cand === undefined) break;
        used[cand] = 1;
        const s = segs[cand];
        const nxt = key(s[0]) === key(end) ? s[1] : s[0];
        if (dir > 0) line.push(nxt); else line.unshift(nxt);
      }
    }
    lines.push(line);
  }
  return lines;
}

// Douglas-Peucker simplification
export function simplify(pts, tol = 0.3) {
  if (pts.length < 3) return pts;
  const [ax, az] = pts[0], [bx, bz] = pts[pts.length - 1];
  const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1e-9;
  let dmax = 0, idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs((pts[i][0] - ax) * dz - (pts[i][1] - az) * dx) / L;
    if (d > dmax) { dmax = d; idx = i; }
  }
  if (dmax <= tol) return [pts[0], pts[pts.length - 1]];
  return simplify(pts.slice(0, idx + 1), tol).slice(0, -1).concat(simplify(pts.slice(idx), tol));
}

// resample a polyline into points every `step` metres with tangent + cumulative length
export function resample(pts, step = 1) {
  const out = [];
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const L = Math.hypot(bx - ax, bz - az);
    if (L < 1e-6) continue;
    const tx = (bx - ax) / L, tz = (bz - az) / L;
    let t = out.length ? step - acc : 0;
    while (t <= L) {
      out.push({ x: ax + tx * t, z: az + tz * t, tx, tz });
      t += step;
    }
    acc = L - (t - step);
  }
  const last = pts[pts.length - 1];
  if (out.length && Math.hypot(out[out.length - 1].x - last[0], out[out.length - 1].z - last[1]) > step * 0.3) {
    const p = out[out.length - 1];
    out.push({ x: last[0], z: last[1], tx: p.tx, tz: p.tz });
  }
  return out;
}

export function polyLength(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return L;
}

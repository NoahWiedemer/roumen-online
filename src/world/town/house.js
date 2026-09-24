// Parametric half-timbered house. Local frame: origin at the ground-floor floor level, centre
// of the footprint; +z is the street-facing front, x across the facade.
import * as THREE from 'three';
import { pm, U } from './builder.js';
import { windowAt, doorAt, flowerBox, hangingSign, wallLantern, awning, PALETTE } from './parts.js';
import { gableRoof, gableTri, gableTimber, coneRoof } from './roofs.js';
import { mulberry32 } from '../../core/utils.js';

const TW = 0.2, TD = 0.07;

function beam(b, M, x, y, w, h, tc, z = TD / 2, rz = 0) {
  b.box(M.timber, pm(x, y, z, 0, 0, rz), w, h, TD, { uv: 'grain', color: tc, skip: ['nz'], uvs: 0.7 });
}
function diag(b, M, x0, y0, x1, y1, tc, z = TD / 2) {
  const L = Math.hypot(x1 - x0, y1 - y0) - 0.08, a = Math.atan2(y1 - y0, x1 - x0);
  beam(b, M, (x0 + x1) / 2, (y0 + y1) / 2, L, 0.17, tc, z, a);
}

// Timber framing for one floor of one facade (facade frame). bays: [{kind, ...}]
function timberFloor(b, M, W, Hf, bays, tc, rng, o = {}) {
  const nb = bays.length, bw = W / nb;
  const sill = o.sill !== false;
  if (sill) beam(b, M, 0, TW / 2, W + 0.02, TW, tc);
  beam(b, M, 0, Hf - TW / 2, W + 0.02, TW, tc);
  for (let i = 0; i <= nb; i++) {
    const x = -W / 2 + i * bw;
    const xx = i === 0 ? x + TW / 2 : i === nb ? x - TW / 2 : x;
    beam(b, M, xx, Hf / 2, TW, Hf - 0.04, tc, TD / 2 + 0.004);
  }
  const y0 = sill ? TW : 0.02, y1 = Hf - TW;
  const pat = o.pattern ?? 0;
  bays.forEach((bay, i) => {
    const cx = -W / 2 + (i + 0.5) * bw;
    const inner = bw - TW;
    const xl = cx - inner / 2, xr = cx + inner / 2;
    if (bay.kind === 'win' || bay.kind === 'balc' || bay.kind === 'oriel') {
      if (bay.kind === 'win') {
        const s = bay.y, t = bay.y + bay.h + 0.1;
        beam(b, M, cx, s - 0.16, inner, 0.15, tc);
        if (y1 - t > 0.22) beam(b, M, cx, t + 0.08, inner, 0.15, tc);
        const yb = s - 0.24;
        if (yb - y0 > 0.32) {
          if (pat === 1) { diag(b, M, xl, y0, cx, yb, tc); diag(b, M, xr, y0, cx, yb, tc, TD / 2 + 0.006); }
          else { diag(b, M, xl, y0, xr, yb, tc); diag(b, M, xl, yb, xr, y0, tc, TD / 2 + 0.006); }
        }
      }
    } else if (bay.kind === 'blank') {
      const p = (pat + i) % 3;
      if (p === 0) { diag(b, M, xl, y0, xr, y1, tc); diag(b, M, xl, y1, xr, y0, tc, TD / 2 + 0.006); }
      else if (p === 1) { beam(b, M, cx, (y0 + y1) / 2, inner, 0.16, tc); diag(b, M, xl, y0, xr, (y0 + y1) / 2, tc); diag(b, M, xl, y1, xr, (y0 + y1) / 2, tc); }
      else { diag(b, M, xl, y0, cx, y1, tc); diag(b, M, xr, y0, cx, y1, tc, TD / 2 + 0.006); }
    }
  });
}

// stone quoins at both facade edges (facade frame)
function quoins(b, M, W, Hf, col) {
  let k = 0;
  for (let y = 0.02; y < Hf - 0.2; y += 0.38, k++) {
    const long = k % 2 === 0;
    for (const s of [-1, 1]) {
      const w = long ? 0.62 : 0.36;
      b.box(M.stone, pm(s * (W / 2 - w / 2 + 0.03), y + 0.17, 0.025), w, 0.34, 0.07, { color: col, uvs: 0.9, skip: ['nz'] });
    }
  }
}

// facade frame helpers
function frontF(zf, y) { return pm(0, y, zf); }
function backF(zb, y) { return pm(0, y, zb, 0, Math.PI, 0); }
function sideF(sx, x, zm, y) { return pm(x, y, zm, 0, sx > 0 ? Math.PI / 2 : -Math.PI / 2, 0); }

// oriel (bay window) in facade frame: centred at cx, from y0, size ow x oh, projecting od
function oriel(b, M, cx, y0, ow, oh, od, S, tc, rng) {
  b.box(M.plaster, pm(cx, y0 + oh / 2, od / 2), ow, oh, od, { uv: 'frame', uvs: 0.33, skip: ['nz'], color: S.wallCol, faces: { ny: M.timber } });
  // corner posts + beams
  for (const s of [-1, 1]) b.box(M.timber, pm(cx + s * (ow / 2 - 0.08), y0 + oh / 2, od - 0.06), 0.18, oh, 0.16, { uv: 'grain', color: tc });
  b.box(M.timber, pm(cx, y0 + 0.08, od / 2 + 0.01), ow + 0.04, 0.18, od + 0.04, { uv: 'grain', color: tc });
  b.box(M.timber, pm(cx, y0 + oh - 0.08, od / 2 + 0.01), ow + 0.04, 0.18, od + 0.04, { uv: 'grain', color: tc });
  // windows front (2) + sides
  b.push(pm(cx, y0, od));
  const ww = (ow - 0.7) / 2;
  for (const s of [-1, 1]) windowAt(b, M, s * (ww / 2 + 0.12), 0.35, ww, oh - 0.75, { lit: rng() < S.litP, mull: true });
  b.pop();
  for (const s of [-1, 1]) {
    b.push(pm(cx + s * ow / 2, y0, od / 2, 0, s * Math.PI / 2, 0));
    windowAt(b, M, 0, 0.35, Math.min(0.34, od - 0.3), oh - 0.75, { lit: false, mull: false });
    b.pop();
  }
  // stepped corbel
  for (let i = 0; i < 3; i++) {
    const f = 1 - i * 0.28;
    b.box(M.timber, pm(cx, y0 - 0.1 - i * 0.18, (od * f) / 2), ow * f, 0.18, od * f, { uv: 'grain', color: tc, skip: ['nz'] });
  }
  // little roof (shed) sloping outwards
  const rp = 0.55;
  const rl = (od + 0.25) / Math.cos(rp);
  b.box(S.roofMat, pm(cx, y0 + oh + Math.sin(rp) * rl / 2 - 0.02, (od + 0.25) / 2 - 0.02, rp, 0, 0), ow + 0.3, 0.12, rl, { faces: { ny: M.timber }, uvs: 0.42, color: S.roofCol });
}

// balcony in facade frame at floor base y0=0, centred cx, width bw
function balcony(b, M, cx, bw, bd, S, tc, rng) {
  b.box(M.wood, pm(cx, -0.07, bd / 2), bw, 0.14, bd, { uv: 'part', uvs: 0.8 });
  // railing
  const rh = 0.92;
  const posts = [[-bw / 2 + 0.05, bd - 0.05], [bw / 2 - 0.05, bd - 0.05], [-bw / 2 + 0.05, 0.05], [bw / 2 - 0.05, 0.05]];
  for (const [px, pz] of posts) b.box(M.wood, pm(cx + px, rh / 2, pz), 0.1, rh, 0.1, { uv: 'grain', uvs: 0.8 });
  b.box(M.wood, pm(cx, rh, bd - 0.05), bw, 0.08, 0.14, { uv: 'grain', uvs: 0.8 });
  for (const s of [-1, 1]) b.box(M.wood, pm(cx + s * (bw / 2 - 0.05), rh, bd / 2), 0.14, 0.08, bd, { uv: 'grain', uvs: 0.8 });
  const n = Math.round(bw / 0.2);
  for (let i = 1; i < n; i++) b.box(M.wood, pm(cx - bw / 2 + (i / n) * bw, rh / 2, bd - 0.05), 0.045, rh - 0.05, 0.045, { uv: 'grain' });
  for (const s of [-1, 1]) for (let i = 1; i < 4; i++) b.box(M.wood, pm(cx + s * (bw / 2 - 0.05), rh / 2, (i / 4) * bd), 0.045, rh - 0.05, 0.045, { uv: 'grain' });
  // flowers on the rail
  flowerBox(b, M, cx, rh + 0.14, bd - 0.05, bw * 0.8, PALETTE.flowers, rng, [0.5, 0.33, 0.2]);
  // knee braces
  for (const s of [-1, 0, 1]) {
    if (s === 0 && bw < 2.2) continue;
    b.box(M.timber, pm(cx + s * (bw / 2 - 0.2), -0.45, bd * 0.4, -0.75, 0, 0), 0.12, 0.12, 0.95, { uv: 'grain', color: tc });
  }
  // french door
  const dw = 0.95, dh = 2.0;
  b.quad(M.glass, new THREE.Vector3(cx - dw / 2, 0.05, 0.03), new THREE.Vector3(cx + dw / 2, 0.05, 0.03), new THREE.Vector3(cx + dw / 2, dh, 0.03), new THREE.Vector3(cx - dw / 2, dh, 0.03), [0, 0], [1, 0], [1, 1], [0, 1], [1, 1, 1], new THREE.Vector3(0, 0, 1), false);
  for (const s of [-1, 1]) b.box(M.paint, pm(cx + s * (dw / 2 + 0.05), dh / 2, 0.06), 0.1, dh + 0.1, 0.12, { color: [1, 0.98, 0.94] });
  b.box(M.paint, pm(cx, dh + 0.05, 0.06), dw + 0.2, 0.1, 0.12, { color: [1, 0.98, 0.94] });
  b.box(M.paint, pm(cx, dh / 2, 0.06), 0.06, dh, 0.06, { color: [1, 0.98, 0.94] });
  for (const yy of [0.7, 1.35]) b.box(M.paint, pm(cx, yy, 0.06), dw, 0.05, 0.05, { color: [1, 0.98, 0.94] });
}

// ----------------------------------------------------------------------------- house
export function buildHouse(b, M, S, halos) {
  const rng = mulberry32(S.seed);
  const { w, d } = S;
  const nF = S.floors;
  const fh = S.fh;
  const J = S.jetty;
  const base = [0];
  for (let k = 0; k < nF; k++) base.push(base[k] + fh[k]);
  const H = base[nF];
  const zf = (k) => d / 2 + J * Math.min(k, 2);
  const zb = -d / 2;
  const tc = S.timberCol;
  const wallCol = S.wallCol;
  const shut = S.shutterCol;
  const top = nF - 1;

  const F = pm(S.x, S.floorY, S.z, 0, S.rotY, 0);
  b.setFrame(F);
  b.ao = { y0: S.groundMin - 0.05, h: 1.4, min: 0.62 };
  b.uvOff = [rng() * 4, rng() * 4];

  // ---- foundation / plinth
  const fdY0 = Math.min(-0.5, S.groundMin - S.floorY - 0.5);
  b.box(M.stone, pm(0, fdY0 / 2, 0), w + 0.24, -fdY0, d + 0.24, { uv: 'frame', uvs: 0.42, skip: ['ny'], color: [0.95, 0.93, 0.9] });
  b.box(M.stone, pm(0, -0.07, 0), w + 0.36, 0.14, d + 0.36, { uv: 'frame', uvs: 0.42, skip: ['ny'], color: [1.12, 1.1, 1.04] });

  // ---- walls
  const stoneGround = S.ground === 'stone';
  b.box(stoneGround ? M.stone : M.plaster, pm(0, fh[0] / 2, 0), w, fh[0], d, { uv: 'frame', uvs: stoneGround ? 0.42 : 0.33, skip: ['ny', 'py'], color: stoneGround ? S.stoneCol : wallCol });
  for (let k = 1; k < nF; k++) {
    const zfk = zf(k), dk = zfk - zb;
    b.box(M.plaster, pm(0, base[k] + fh[k] / 2, (zfk + zb) / 2), w, fh[k], dk, { uv: 'frame', uvs: 0.33, skip: ['py'], faces: { ny: M.timber }, color: wallCol });
    if (zfk > zf(k - 1) + 0.01) {
      // jetty joist ends + sill beam
      const n = Math.max(2, Math.round(w / 0.55));
      for (let i = 0; i < n; i++) {
        const xx = -w / 2 + (i + 0.5) * (w / n);
        b.box(M.timber, pm(xx, base[k] - 0.09, (zf(k - 1) + zfk) / 2 + 0.02), 0.15, 0.17, zfk - zf(k - 1) + 0.04, { uv: 'grain', color: tc });
      }
    }
  }
  if (stoneGround && J < 0.01) b.box(M.stone, pm(0, fh[0] - 0.08, 0), w + 0.14, 0.16, d + 0.14, { uv: 'frame', uvs: 0.42, color: [1.12, 1.1, 1.04], skip: ['ny'] });

  // ---- facade layouts
  const nb = Math.max(2, Math.round(w / 2.05));
  const bwid = w / nb;
  const doorBay = S.doorBay ?? Math.floor(nb / 2 - 0.5 + (rng() < 0.5 ? 0 : 1)) % nb;
  const out = { anchors: [], door: null, frontTop: [], signs: [] };
  const flowerBoxes = S.flowerP;
  const winW = Math.min(1.0, bwid - 0.75);

  for (let k = 0; k < nF; k++) {
    const Hf = fh[k];
    const zfk = zf(k);
    const timbered = !(k === 0 && stoneGround);
    const wy = k === 0 ? 0.95 : 0.8, wh = k === 0 ? 1.3 : Math.min(1.25, Hf - 1.5);

    // -------- front
    b.push(frontF(zfk, base[k]));
    const bays = [];
    for (let i = 0; i < nb; i++) {
      let kind = 'win';
      if (k === 0 && i === doorBay) kind = 'door';
      if (k === 0 && S.shop && i === S.shop.bay) kind = 'shop';
      if (k === 0 && S.shop && S.shop.span === 2 && i === S.shop.bay + 1) kind = 'shop2';
      if (k === 1 && S.oriel && i === S.oriel.bay) kind = 'oriel';
      if (k === 1 && S.balcony && i === S.balcony.bay) kind = 'balc';
      if (k > 0 && S.blankFront && i === S.blankFront) kind = 'blank';
      bays.push({ kind, y: wy, h: wh });
    }
    if (timbered) timberFloor(b, M, w, Hf, bays, tc, rng, { pattern: S.pattern, sill: k > 0 || !stoneGround });
    else quoins(b, M, w, Hf, [1.14, 1.12, 1.06]);
    bays.forEach((bay, i) => {
      const cx = -w / 2 + (i + 0.5) * bwid;
      if (bay.kind === 'win') {
        const lit = rng() < S.litP;
        windowAt(b, M, cx, wy, winW, wh, {
          lit, shutters: S.shutters ? shut : null, box: (k === 1 || (k === 0 && !S.shop)) && rng() < flowerBoxes ? PALETTE.flowers : null, rng,
          arch: !timbered && S.archWin, archStone: !timbered, header: !timbered && !S.archWin ? M.stone : null, headerCol: [1.12, 1.1, 1.04],
        });
      } else if (bay.kind === 'door') {
        const dw = 1.1, dh = S.doorArch ? 1.85 : 2.15;
        doorAt(b, M, cx, dw, dh, { col: S.doorCol, arch: S.doorArch, frameMat: stoneGround ? M.stone : M.timber, frameCol: stoneGround ? [1.12, 1.1, 1.04] : tc, step: S.stepH, canopy: S.canopy ? S.roofMat : null, window: rng() < 0.5 });
        const wp = new THREE.Vector3(cx, 0, 1.1).applyMatrix4(b.F);
        out.door = { x: wp.x, y: wp.y, z: wp.z };
        if (S.doorLamp) wallLantern(b, M, cx + (dw / 2 + 0.45) * (i < nb / 2 ? 1 : -1), 2.1, halos);
        // flower pots beside door
        if (!S.shop && rng() < 0.7) {
          for (const s of [-1, 1]) {
            if (rng() < 0.35) continue;
            flowerPot(b, M, cx + s * (dw / 2 + 0.5), 0.42, rng, 1, -(S.stepH ?? 0.3));
          }
        }
      } else if (bay.kind === 'shop') {
        const span = S.shop.span || 1;
        const sw = bwid * span - 0.6;
        const scx = cx + (span - 1) * bwid / 2;
        windowAt(b, M, scx, 0.75, sw, 1.55, { lit: true, mull: false, frameMat: M.paint, frameCol: S.shop.frameCol || [0.36, 0.55, 0.36], archStone: false });
        const nm = Math.max(2, Math.round(sw / 0.55));
        for (let m = 1; m < nm; m++) b.box(M.paint, pm(scx - sw / 2 + (m / nm) * sw, 0.75 + 0.775, 0.07), 0.06, 1.55, 0.06, { color: S.shop.frameCol || [0.36, 0.55, 0.36] });
        b.box(M.paint, pm(scx, 0.75 + 1.1, 0.07), sw, 0.06, 0.06, { color: S.shop.frameCol || [0.36, 0.55, 0.36] });
        // display counter
        b.box(M.wood, pm(scx, 0.68, 0.22), sw + 0.3, 0.1, 0.45, { uvs: 0.8 });
        for (const s of [-1, 1]) b.box(M.timber, pm(scx + s * (sw / 2), 0.35, 0.3), 0.1, 0.6, 0.1, { uv: 'grain' });
        if (S.shop.awning !== undefined) awning(b, M, scx, 2.75, sw + 0.4, 1.1, S.shop.awning);
      }
    });
    // anchors for garlands (upper floor)
    if (k === Math.min(1, top)) {
      for (const s of [-1, 1]) {
        const p = new THREE.Vector3(s * w * 0.36, Hf * 0.78, 0.1).applyMatrix4(b.F);
        out.anchors.push({ x: p.x, y: p.y, z: p.z });
      }
    }
    // sign
    if (k === 0 && S.sign !== undefined && S.sign !== null) {
      const sx = S.signX ?? (-w / 2 + (doorBay + (doorBay < nb / 2 ? 1 : 0)) * bwid);
      hangingSign(b, M, sx, fh[0] - 0.25, S.sign, 1.0);
    }
    // balcony / oriel
    bays.forEach((bay, i) => {
      const cx = -w / 2 + (i + 0.5) * bwid;
      if (bay.kind === 'oriel') oriel(b, M, cx, 0.35, Math.min(bwid + 0.4, 2.3), Hf - 0.75, 0.62, S, tc, rng);
      if (bay.kind === 'balc') balcony(b, M, cx, Math.min(bwid + 0.8, 2.8), 0.95, S, tc, rng);
    });
    b.pop();

    // -------- back
    b.push(backF(zb, base[k]));
    const bb = [];
    for (let i = 0; i < nb; i++) bb.push({ kind: (i + k) % 2 === 0 ? 'win' : 'blank', y: wy, h: wh });
    if (timbered) timberFloor(b, M, w, Hf, bb, tc, rng, { pattern: S.pattern + 1, sill: k > 0 || !stoneGround });
    else quoins(b, M, w, Hf, [1.14, 1.12, 1.06]);
    bb.forEach((bay, i) => {
      if (bay.kind !== 'win') return;
      windowAt(b, M, -w / 2 + (i + 0.5) * bwid, wy, winW, wh, { lit: rng() < S.litP * 0.6, shutters: S.shutters && k > 0 ? shut : null, header: timbered ? null : M.stone, headerCol: [1.12, 1.1, 1.04] });
    });
    b.pop();

    // -------- sides
    const dk = zfk - zb, zm = (zfk + zb) / 2;
    const ns = Math.max(2, Math.round(dk / 2.05));
    for (const sx of [-1, 1]) {
      b.push(sideF(sx, sx * w / 2, zm, base[k]));
      const sb = [];
      for (let i = 0; i < ns; i++) sb.push({ kind: (i + k + (sx > 0 ? 1 : 0)) % 2 === 0 ? 'win' : 'blank', y: wy, h: wh });
      if (timbered) timberFloor(b, M, dk, Hf, sb, tc, rng, { pattern: S.pattern + 2, sill: k > 0 || !stoneGround });
      else quoins(b, M, dk, Hf, [1.14, 1.12, 1.06]);
      sb.forEach((bay, i) => {
        if (bay.kind !== 'win') return;
        const ww = Math.min(0.9, dk / ns - 0.75);
        windowAt(b, M, -dk / 2 + (i + 0.5) * (dk / ns), wy, ww, wh, { lit: rng() < S.litP * 0.7, shutters: S.shutters && k > 0 && rng() < 0.5 ? shut : null, box: k === 1 && rng() < flowerBoxes * 0.5 ? PALETTE.flowers : null, rng, header: timbered ? null : M.stone, headerCol: [1.12, 1.1, 1.04] });
      });
      b.pop();
    }
  }

  // ---- roof
  const pitch = S.pitch;
  const zfT = zf(top);
  const roofInfo = {};
  const rc = S.roofCol;
  if (S.roof === 'side' || S.roof === 'cross') {
    const r = gableRoof(b, M, S.roofMat, { x0: -w / 2, x1: w / 2, zb, zf: zfT, y: H, pitch, ovE: 0.55, ovG: 0.45, col: rc, uo: rng() * 3 });
    Object.assign(roofInfo, r);
    // gable ends (sides)
    for (const sx of [-1, 1]) {
      b.push(sideF(sx, sx * w / 2, (zfT + zb) / 2, H));
      gableTri(b, M.plaster, 0, 0, (zfT - zb) / 2, r.hr, wallCol);
      const withWin = true;
      const yc = gableTimber(b, M, 0, 0, (zfT - zb) / 2, r.hr, tc, withWin);
      if (yc > 1.3) windowAt(b, M, 0, 0.35, 0.62, Math.min(0.85, yc - 0.65), { lit: rng() < S.litP, mull: true, shutters: S.shutters ? shut : null });
      b.pop();
    }
    // cross gable wing on the front
    if (S.roof === 'cross') {
      const ww = S.wingW, xw = S.wingX;
      const hr2 = (ww / 2) * Math.tan(pitch);
      const zEnd = r.zc + (r.hr - hr2 - 0.4) / Math.tan(pitch);
      b.push(pm(xw, 0, 0, 0, Math.PI / 2, 0));
      gableRoof(b, M, S.roofMat, { x0: -zfT, x1: -zEnd, zb: -ww / 2, zf: ww / 2, y: H, pitch, ovE: 0.45, ovG0: 0.5, ovG1: 0, col: rc, noGableEdge1: true, noBarge1: true, knobs: false });
      b.pop();
      b.push(pm(xw, H, zfT));
      gableTri(b, M.plaster, 0, 0, ww / 2, hr2, wallCol);
      const yc = gableTimber(b, M, 0, 0, ww / 2, hr2, tc, true);
      windowAt(b, M, 0, 0.3, Math.min(1.1, ww - 1.5), Math.min(1.1, yc - 0.55), { lit: rng() < S.litP, mull: true, shutters: S.shutters ? shut : null, box: rng() < 0.7 ? PALETTE.flowers : null, rng });
      b.pop();
    }
    // dormers on the front slope
    if (S.dormers) {
      const xs = S.dormers === 1 ? [S.dormerX ?? 0] : [-w * 0.24, w * 0.24];
      for (const xd of xs) dormer(b, M, S, r, xd, zfT, H, rng);
    }
    // chimney on back slope
    if (S.chimney) {
      const cxp = S.chimneyX ?? w * 0.28, czp = r.zc - r.a * 0.3;
      chimney(b, M, cxp, czp, H, r.topAt(czp), r.ridgeTop);
    }
  } else {
    // front-facing gable, ridge along z
    b.push(pm(0, 0, 0, 0, Math.PI / 2, 0));
    const r = gableRoof(b, M, S.roofMat, { x0: -zfT, x1: -zb, zb: -w / 2, zf: w / 2, y: H, pitch, ovE: 0.5, ovG: 0.55, col: rc, uo: rng() * 3 });
    b.pop();
    Object.assign(roofInfo, r);
    // front + back gable triangles
    b.push(pm(0, H, zfT));
    gableTri(b, M.plaster, 0, 0, w / 2, r.hr, wallCol);
    const yc = gableTimber(b, M, 0, 0, w / 2, r.hr, tc, true);
    if (S.hoist) {
      // loading door + hoist beam
      doorAt(b, M, 0, 1.2, Math.min(1.7, yc - 0.3), { col: [0.55, 0.36, 0.22], step: 0, frameMat: M.timber, frameCol: tc });
      b.box(M.timber, pm(0, yc + 0.35, 0.8), 0.22, 0.22, 1.8, { uv: 'grain', color: tc });
      b.geo(M.wood, U.cyl(10), pm(0, yc + 0.18, 1.55, 0, 0, Math.PI / 2, 0.16, 0.12, 0.16), { uv: 'keep' });
      b.box(M.rope, pm(0, yc - 0.9, 1.65), 0.03, 2.1, 0.03);
      b.box(M.iron, pm(0, yc - 1.95, 1.65), 0.14, 0.1, 0.08);
    } else {
      windowAt(b, M, 0, 0.35, Math.min(1.1, w * 0.18), Math.min(1.2, yc - 0.6), { lit: rng() < S.litP, mull: true, shutters: S.shutters ? shut : null, box: rng() < 0.7 ? PALETTE.flowers : null, rng });
      if (r.hr > 3.2) windowAt(b, M, 0, yc + 0.35, 0.5, 0.6, { lit: false, mull: false });
    }
    b.pop();
    b.push(pm(0, H, zb, 0, Math.PI, 0));
    gableTri(b, M.plaster, 0, 0, w / 2, r.hr, wallCol);
    const yc2 = gableTimber(b, M, 0, 0, w / 2, r.hr, tc, true);
    windowAt(b, M, 0, 0.35, 0.7, Math.min(1.0, yc2 - 0.6), { lit: rng() < S.litP, mull: true });
    b.pop();
    // side dormers (on +x slope, in the rotated roof frame the slope is along world x)
    if (S.chimney) {
      const czp = (zfT + zb) / 2 - (zfT - zb) * 0.22;
      chimney(b, M, w * 0.22, czp, H, r.topAt(w * 0.22), r.ridgeTop);
    }
  }

  // ---- turret on a front corner
  if (S.turret) {
    const sx = S.turret;
    const R = S.turretR || 1.15;
    const cx = sx * (w / 2 + 0.05), cz = zfT + 0.05;
    const y0 = base[1] - 0.15;
    const yTop = H + Math.max(1.4, (roofInfo.hr || 4) * 0.42);
    const hh = yTop - y0;
    b.geo(M.plaster, U.cyl(16, true), pm(cx, y0 + hh / 2, cz, 0, 0, 0, R, hh, R), { uv: 'keep', uvScale: [2 * Math.PI * R * 0.33, hh * 0.33], color: wallCol });
    // corbel
    b.geo(M.stone, U.lathe('corbel2', [[0.02, 0], [0.14, 0.02], [0.22, 0.12], [0.3, 0.32], [0.46, 0.55], [0.7, 0.78], [0.92, 0.95], [1.0, 1.05], [1.06, 1.06], [1.06, 1.14], [1.0, 1.15]], 16), pm(cx, y0 - 1.0, cz, 0, 0, 0, R, 0.9, R), { uv: 'keep', uvScale: [4, 0.5], color: [1.12, 1.08, 1.02] });
    b.geo(M.gold, U.sphere(6, 4), pm(cx, y0 - 1.03, cz, 0, 0, 0, 0.09), {});
    // timber bands
    for (let k = 1; k <= nF; k++) {
      const yy = k === nF ? yTop - 0.08 : base[k] + 0.05;
      if (yy < y0) continue;
      b.geo(M.timber, U.cyl(16, true), pm(cx, yy, cz, 0, 0, 0, R + 0.04, 0.18, R + 0.04), { uv: 'keep', uvScale: [4, 0.2], color: tc });
    }
    // windows facing outward
    const outA = Math.atan2(sx, 1);
    for (let k = 1; k < nF + 1; k++) {
      const yb = k < nF ? base[k] + 0.75 : H + 0.35;
      if (yb + 0.95 > yTop - 0.2) continue;
      for (const da of [-0.62, 0, 0.62]) {
        if (k === nF && da !== 0) continue;
        const a = outA + da;
        b.push(pm(cx + Math.sin(a) * (R - 0.02), 0, cz + Math.cos(a) * (R - 0.02), 0, a, 0));
        windowAt(b, M, 0, yb, 0.46, 0.85, { lit: rng() < S.litP, mull: false, sillMat: M.stone });
        b.pop();
      }
    }
    const tip = coneRoof(b, M, S.turretRoofMat || S.roofMat, cx, yTop, cz, R + 0.32, (R + 0.32) * 2.8, { col: rc });
    out.turretTop = new THREE.Vector3(cx, tip, cz).applyMatrix4(b.F);
  }

  b.ao = null;
  b.uvOff = [0, 0];
  b.resetFrame();
  const c = Math.cos(S.rotY), s = Math.sin(S.rotY);
  out.height = H + (roofInfo.hr || 0);
  out.roofInfo = roofInfo;
  return out;
}

function dormer(b, M, S, r, xd, zfT, H, rng) {
  const dw = 1.5, dh = 1.35;
  const p2 = 0.85;
  const zd = r.zc + r.a * 0.45; // front plane of dormer
  const ys = r.topAt(zd) + 0.02; // roof surface at dormer front
  const yw = ys + dh - 0.25;
  const ridgeD = yw + (dw / 2 + 0.18) * Math.tan(p2) + 0.2;
  // keep the dormer body and its little roof inside the main roof (never past the main ridge)
  const depth = Math.min(r.a * 0.45 + 0.3, (dh + 0.35) / r.tp + 0.15);
  const roofBack = Math.min(r.a * 0.45 + 0.2, (ridgeD - ys + 0.15) / r.tp);
  b.box(M.plaster, pm(xd, ys + dh / 2 - 0.25, zd - depth / 2), dw, dh + 0.5, depth, { uv: 'frame', uvs: 0.33, color: S.wallCol, skip: ['ny'] });
  b.push(pm(xd, 0, zd));
  for (const s of [-1, 1]) b.box(M.timber, pm(s * (dw / 2 - 0.08), ys + dh / 2 - 0.1, 0.03), 0.16, dh + 0.2, 0.08, { uv: 'grain', color: S.timberCol });
  windowAt(b, M, 0, ys + 0.2, 0.72, dh - 0.45, { lit: rng() < S.litP, mull: true, shutters: null, box: rng() < 0.5 ? PALETTE.flowers : null, rng });
  b.pop();
  b.push(pm(xd, 0, 0, 0, Math.PI / 2, 0));
  gableRoof(b, M, S.roofMat, { x0: -(zd + 0.05), x1: -(zd - roofBack), zb: -dw / 2, zf: dw / 2, y: yw, pitch: p2, ovE: 0.18, ovG0: 0.25, ovG1: 0, t: 0.14, col: S.roofCol, knobs: false, noGableEdge1: true, noBarge1: true });
  b.pop();
  b.push(pm(xd, yw, zd));
  gableTri(b, M.plaster, 0, 0, dw / 2, (dw / 2) * Math.tan(p2), S.wallCol);
  b.box(M.timber, pm(0, 0.05, 0.035), dw, 0.14, 0.07, { uv: 'grain', color: S.timberCol });
  b.pop();
}

function chimney(b, M, x, z, H, yRoof, ridge) {
  const top = Math.max(ridge + 0.6, yRoof + 1.2);
  const y0 = H - 0.5;
  b.box(M.stone, pm(x, (y0 + top) / 2, z), 0.78, top - y0, 0.78, { uv: 'frame', uvs: 0.5, color: [1.0, 0.92, 0.88] });
  b.box(M.stone, pm(x, top + 0.07, z), 0.98, 0.14, 0.98, { uv: 'frame', uvs: 0.5, color: [1.12, 1.08, 1.02] });
  b.geo(M.color, U.cyl(8), pm(x - 0.15, top + 0.3, z, 0, 0, 0, 0.12, 0.35, 0.12), { color: [0.78, 0.4, 0.28] });
  b.geo(M.color, U.cyl(8), pm(x + 0.18, top + 0.25, z + 0.05, 0, 0, 0, 0.1, 0.25, 0.1), { color: [0.72, 0.36, 0.26] });
}

export function flowerPot(b, M, x, z, rng, s = 1, y = 0) {
  const cols = [[0.82, 0.45, 0.3], [0.75, 0.4, 0.28], [0.9, 0.55, 0.38]];
  b.geo(M.color, U.lathe('pot', [[0.001, 0], [0.16, 0], [0.2, 0.05], [0.24, 0.34], [0.28, 0.36], [0.28, 0.42], [0.22, 0.42]], 10), pm(x, y, z, 0, 0, 0, s), { color: cols[Math.floor(rng() * 3)] });
  b.geo(M.leaf, U.sphere(8, 6), pm(x, y + 0.55 * s, z, 0, rng() * 3, 0, 0.3 * s, 0.26 * s, 0.3 * s), { uv: 'keep', uvScale: [1.5, 1] });
  const fc = PALETTE.flowers[Math.floor(rng() * PALETTE.flowers.length)];
  for (let i = 0; i < 5; i++) {
    const a = rng() * 6.28, r = 0.1 + rng() * 0.15;
    b.geo(M.color, U.ico(0), pm(x + Math.cos(a) * r * s, y + (0.62 + rng() * 0.15) * s, z + Math.sin(a) * r * s, rng(), rng(), 0, 0.07 * s), { color: fc, flat: true });
  }
}

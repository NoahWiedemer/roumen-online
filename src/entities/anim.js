// Keyframe + procedural animation system for the chibi humanoid rig.
// Poses are partial maps of joint -> [rx, ry, rz] (radians) plus optional `pos` (hips offset [x,y,z])
// and `root` ([x,y,z] body offset, used for leaps). Missing joints fall back to the previous key.
import * as THREE from 'three';
import { JOINTS } from './humanoid.js';
import { clamp, lerp } from '../core/utils.js';

const ease = {
  linear: (t) => t,
  inOut: (t) => t * t * (3 - 2 * t),
  in: (t) => t * t * t,
  out: (t) => 1 - Math.pow(1 - t, 3),
  outBack: (t) => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  snap: (t) => 1 - Math.pow(1 - t, 5),
};

const CHANNELS = [...JOINTS, 'pos', 'root'];
const zero = () => [0, 0, 0];

function resolveKeys(keys, base) {
  // carry forward missing channels so every key is complete
  const out = [];
  let prev = {};
  for (const ch of CHANNELS) prev[ch] = (base && base[ch]) ? base[ch].slice() : zero();
  for (const k of keys) {
    const full = { t: k.t, e: k.e || 'inOut' };
    for (const ch of CHANNELS) full[ch] = k[ch] ? k[ch].slice() : prev[ch].slice();
    out.push(full);
    prev = full;
  }
  return out;
}

export class Clip {
  constructor(name, { duration, keys, loop = false, events = [], base = null, expression = null, sword = null }) {
    this.name = name;
    this.duration = duration;
    this.loop = loop;
    this.keys = resolveKeys(keys, base);
    this.events = events; // [{t, name}]
    this.expression = expression;
    this.sword = sword; // [tStart, tEnd] window where the weapon trail is on
  }
  sample(t, out) {
    const K = this.keys;
    if (t <= K[0].t) { copyPose(K[0], out); return out; }
    if (t >= K[K.length - 1].t) { copyPose(K[K.length - 1], out); return out; }
    let i = 0;
    while (i < K.length - 1 && K[i + 1].t < t) i++;
    const a = K[i], b = K[i + 1];
    const u = ease[b.e]((t - a.t) / Math.max(1e-5, b.t - a.t));
    for (const ch of CHANNELS) {
      const pa = a[ch], pb = b[ch], o = out[ch];
      o[0] = pa[0] + (pb[0] - pa[0]) * u;
      o[1] = pa[1] + (pb[1] - pa[1]) * u;
      o[2] = pa[2] + (pb[2] - pa[2]) * u;
    }
    return out;
  }
}

function copyPose(src, out) {
  for (const ch of CHANNELS) { const s = src[ch], o = out[ch]; o[0] = s[0]; o[1] = s[1]; o[2] = s[2]; }
}
export function emptyPose() {
  const p = {};
  for (const ch of CHANNELS) p[ch] = zero();
  return p;
}
function blendPose(a, b, w, out) {
  for (const ch of CHANNELS) {
    const pa = a[ch], pb = b[ch], o = out[ch];
    o[0] = pa[0] + (pb[0] - pa[0]) * w;
    o[1] = pa[1] + (pb[1] - pa[1]) * w;
    o[2] = pa[2] + (pb[2] - pa[2]) * w;
  }
}

// ------------------------------------------------------------------ pose library
// Sword-on-shoulder relaxed idle
export const P_IDLE = {
  pos: [0, 0, 0],
  hips: [0, 0.08, 0], spine: [0.02, -0.04, 0], chest: [-0.02, -0.04, 0.0], neck: [0, 0, 0], head: [0.04, 0, 0],
  armR: [-0.45, 0.1, -0.32], elbowR: [-1.7, 0, 0], handR: [-0.5, -0.68, 0.3],
  armL: [0.08, 0, 0.22], elbowL: [-0.25, 0, 0], handL: [0, 0, 0.1],
  legL: [-0.04, 0.06, 0.07], kneeL: [0.06, 0, 0], footL: [0, 0, -0.03],
  legR: [0.05, -0.1, -0.08], kneeR: [0.08, 0, 0], footR: [-0.02, 0, 0.04],
};
// Battle stance: sword held forward-low, knees bent
export const P_BATTLE = {
  pos: [0, -0.045, 0],
  hips: [0, 0.42, 0], spine: [0.12, -0.18, 0], chest: [0.06, -0.14, 0], neck: [0, -0.05, 0], head: [-0.05, -0.08, 0],
  armR: [-0.7, 0.3, -0.3], elbowR: [-1.2, 0, 0], handR: [0.9, -0.5, 0.3],
  armL: [-0.35, 0, 0.32], elbowL: [-1.25, 0, 0], handL: [0, 0, 0],
  legL: [-0.42, -0.25, 0.12], kneeL: [0.48, 0, 0], footL: [-0.06, 0.2, 0],
  legR: [0.25, -0.4, -0.12], kneeR: [0.4, 0, 0], footR: [-0.05, 0.3, 0],
};
export const P_SIT = {
  pos: [0, -0.5, 0],
  hips: [-0.08, 0, 0], spine: [0.18, 0, 0], chest: [0.08, 0, 0], neck: [0, 0, 0], head: [0.12, 0, 0],
  armR: [-0.7, 0, -0.25], elbowR: [-0.95, 0, 0], handR: [0.2, 0.3, 1.35],
  armL: [-0.55, 0, 0.35], elbowL: [-1.0, 0, 0], handL: [0, 0, 0],
  legL: [-1.45, 0.35, 0.75], kneeL: [2.35, 0, 0], footL: [-0.3, 0, 0],
  legR: [-1.45, -0.35, -0.75], kneeR: [2.35, 0, 0], footR: [-0.3, 0, 0],
};
export const P_DEAD = {
  pos: [0, -0.52, -0.2],
  hips: [-1.45, 0.1, 0], spine: [0.08, 0, 0], chest: [0.05, 0, 0], neck: [0, 0, 0], head: [-0.2, 0.5, 0],
  armR: [-0.3, 0, -1.3], elbowR: [-0.3, 0, 0], handR: [0.2, 0, 0.4],
  armL: [-0.2, 0, 1.2], elbowL: [-0.4, 0, 0], handL: [0, 0, 0],
  legL: [0.1, 0, 0.2], kneeL: [0.25, 0, 0], footL: [0.3, 0, 0],
  legR: [-0.25, 0, -0.15], kneeR: [0.6, 0, 0], footR: [0.3, 0, 0],
};

// make library poses complete (all channels present)
export function fullPose(p) {
  for (const ch of CHANNELS) if (!p[ch]) p[ch] = zero();
  return p;
}
fullPose(P_IDLE); fullPose(P_BATTLE); fullPose(P_SIT); fullPose(P_DEAD);

const B = P_BATTLE;
const mix = (p, o) => ({ ...p, ...o });

export const CLIPS = {
  // 3-hit basic combo — hand x≈1.5 makes the blade extend the forearm
  attack1: new Clip('attack1', {
    duration: 0.62, base: B, expression: 'angry', sword: [0.13, 0.36],
    events: [{ t: 0.25, name: 'hit' }],
    keys: [
      { t: 0, ...B },
      { t: 0.14, e: 'out', pos: [0, -0.02, -0.03], hips: [0, -0.35, 0], spine: [-0.05, -0.3, 0], chest: [-0.1, -0.2, 0], armR: [-2.6, 0, -0.85], elbowR: [-0.35, 0, 0], handR: [1.0, 0, 0], armL: [-0.6, 0, 0.5], elbowL: [-1.3, 0, 0] },
      { t: 0.27, e: 'snap', pos: [0, -0.1, 0.14], hips: [0.05, 0.55, 0], spine: [0.3, 0.35, 0], chest: [0.2, 0.2, 0], armR: [-0.55, 0, 0.55], elbowR: [-0.1, 0, 0], handR: [1.35, 0, 0], armL: [0.3, 0, 0.7], elbowL: [-0.5, 0, 0], legL: [-0.7, -0.2, 0.1], kneeL: [0.8, 0, 0] },
      { t: 0.4, e: 'out', pos: [0, -0.09, 0.12], hips: [0.05, 0.62, 0], spine: [0.32, 0.4, 0], armR: [-0.45, 0, 0.65], handR: [1.4, 0, 0] },
      { t: 0.62, ...B },
    ],
  }),
  attack2: new Clip('attack2', {
    duration: 0.6, base: B, expression: 'angry', sword: [0.11, 0.34],
    events: [{ t: 0.23, name: 'hit' }],
    keys: [
      { t: 0, ...B },
      { t: 0.12, e: 'out', hips: [0, 0.7, 0], spine: [0.1, 0.4, 0], chest: [0.05, 0.25, 0], armR: [-1.45, 0, 0.75], elbowR: [-0.5, 0, 0], handR: [1.5, 0, 0], armL: [-0.3, 0, 0.3], elbowL: [-1.5, 0, 0] },
      { t: 0.25, e: 'snap', pos: [0, -0.07, 0.1], hips: [0, -0.55, 0], spine: [0.15, -0.35, 0], chest: [0.05, -0.25, 0], armR: [-1.5, 0, -1.25], elbowR: [-0.05, 0, 0], handR: [1.5, 0, 0], armL: [0.1, 0, 0.9], elbowL: [-0.4, 0, 0], legL: [-0.55, -0.1, 0.1], kneeL: [0.6, 0, 0] },
      { t: 0.38, e: 'out', hips: [0, -0.65, 0], spine: [0.15, -0.42, 0], armR: [-1.45, 0, -1.4] },
      { t: 0.6, ...B },
    ],
  }),
  attack3: new Clip('attack3', {
    duration: 0.8, base: B, expression: 'angry', sword: [0.22, 0.46],
    events: [{ t: 0.36, name: 'hit' }],
    keys: [
      { t: 0, ...B },
      { t: 0.22, e: 'out', pos: [0, 0.02, -0.05], hips: [-0.15, 0.1, 0], spine: [-0.25, 0, 0], chest: [-0.2, 0, 0], neck: [-0.1, 0, 0], armR: [-3.0, 0, -0.25], elbowR: [-0.9, 0, 0], handR: [0.2, 0, 0], armL: [-2.8, 0, 0.3], elbowL: [-1.2, 0, 0], legL: [-0.3, 0, 0.1], kneeL: [0.2, 0, 0] },
      { t: 0.37, e: 'snap', pos: [0, -0.16, 0.2], hips: [0.25, 0.1, 0], spine: [0.45, 0, 0], chest: [0.25, 0, 0], neck: [0.1, 0, 0], armR: [-0.8, 0, -0.1], elbowR: [-0.1, 0, 0], handR: [1.25, 0, 0], armL: [-0.75, 0, 0.15], elbowL: [-0.4, 0, 0], legL: [-0.95, 0, 0.1], kneeL: [1.05, 0, 0], legR: [0.55, -0.2, -0.1], kneeR: [0.5, 0, 0] },
      { t: 0.55, e: 'out', pos: [0, -0.15, 0.18], hips: [0.3, 0.1, 0], spine: [0.5, 0, 0], armR: [-0.6, 0, -0.1], elbowR: [-0.05, 0, 0], handR: [1.3, 0, 0] },
      { t: 0.8, ...B },
    ],
  }),
  // Power Slash: big wind-up to the right, wide horizontal sweep to the left
  power_slash: new Clip('power_slash', {
    duration: 1.0, base: B, expression: 'angry', sword: [0.34, 0.62],
    events: [{ t: 0.46, name: 'hit' }],
    keys: [
      { t: 0, ...B },
      { t: 0.32, e: 'inOut', pos: [0, -0.14, -0.08], hips: [0, -1.0, 0], spine: [0.15, -0.45, 0], chest: [0.05, -0.3, 0], head: [0, 0.9, 0], armR: [-1.45, 0, -1.55], elbowR: [-0.25, 0, 0], handR: [1.5, 0, 0], armL: [-1.3, 0, 0.3], elbowL: [-1.4, 0, 0], legL: [-0.6, 0.3, 0.2], kneeL: [0.9, 0, 0], legR: [0.4, -0.5, -0.1], kneeR: [0.8, 0, 0] },
      { t: 0.48, e: 'snap', pos: [0, -0.1, 0.25], hips: [0.05, 0.9, 0], spine: [0.2, 0.45, 0], chest: [0.1, 0.3, 0], head: [0, -0.8, 0], armR: [-1.5, 0, 0.75], elbowR: [-0.05, 0, 0], handR: [1.5, 0, 0], armL: [0.2, 0, 1.2], elbowL: [-0.3, 0, 0], legL: [-0.8, -0.3, 0.1], kneeL: [0.9, 0, 0], legR: [0.5, -0.1, -0.2], kneeR: [0.3, 0, 0] },
      { t: 0.7, e: 'out', pos: [0, -0.1, 0.25], hips: [0.05, 1.05, 0], spine: [0.2, 0.5, 0], head: [0, -0.9, 0], armR: [-1.45, 0, 0.9] },
      { t: 1.0, ...B },
    ],
  }),
  // Mighty Blow: jump & overhead smash into the ground
  mighty_blow: new Clip('mighty_blow', {
    duration: 1.15, base: B, expression: 'angry', sword: [0.45, 0.66],
    events: [{ t: 0.62, name: 'hit' }],
    keys: [
      { t: 0, ...B },
      { t: 0.18, e: 'out', pos: [0, -0.18, 0], hips: [0.2, 0.2, 0], spine: [0.3, 0, 0], armR: [-0.4, 0, -0.3], elbowR: [-0.9, 0, 0], handR: [0.9, 0, 0], legL: [-0.9, 0, 0.1], kneeL: [1.4, 0, 0], legR: [-0.3, 0, -0.1], kneeR: [1.2, 0, 0], footL: [0.3, 0, 0], footR: [0.3, 0, 0] },
      { t: 0.42, e: 'out', root: [0, 0.85, 0.35], pos: [0, 0, 0], hips: [-0.2, 0, 0], spine: [-0.35, 0, 0], chest: [-0.25, 0, 0], neck: [-0.15, 0, 0], armR: [-3.1, 0, -0.2], elbowR: [-1.0, 0, 0], handR: [0.1, 0, 0], armL: [-3.0, 0, 0.2], elbowL: [-1.3, 0, 0], legL: [-0.8, 0, 0.1], kneeL: [1.3, 0, 0], legR: [0.2, 0, -0.1], kneeR: [1.1, 0, 0] },
      { t: 0.62, e: 'in', root: [0, 0, 0.6], pos: [0, -0.28, 0.1], hips: [0.4, 0, 0], spine: [0.55, 0, 0], chest: [0.3, 0, 0], neck: [0.2, 0, 0], armR: [-0.7, 0, -0.1], elbowR: [-0.05, 0, 0], handR: [1.35, 0, 0], armL: [-0.7, 0, 0.1], elbowL: [-0.3, 0, 0], legL: [-1.25, 0, 0.15], kneeL: [1.7, 0, 0], legR: [0.5, 0, -0.1], kneeR: [1.4, 0, 0] },
      { t: 0.85, e: 'out', root: [0, 0, 0.6], pos: [0, -0.26, 0.1], hips: [0.4, 0, 0] },
      { t: 1.15, e: 'inOut', root: [0, 0, 0.6], ...B },
    ],
  }),
  // Whirlwind: two full spins with the sword extended
  whirlwind: new Clip('whirlwind', {
    duration: 1.2, base: B, expression: 'angry', sword: [0.15, 0.97],
    events: [{ t: 0.4, name: 'hit' }, { t: 0.8, name: 'hit' }],
    keys: [
      { t: 0, ...B },
      { t: 0.15, e: 'out', pos: [0, -0.12, 0], hips: [0, 0.9, 0], spine: [0.1, 0.3, 0], armR: [-1.5, 0, -0.9], elbowR: [-0.05, 0, 0], handR: [1.5, 0, 0], armL: [-1.4, 0, 1.3], elbowL: [-0.2, 0, 0] },
      { t: 0.55, e: 'linear', pos: [0, -0.12, 0], hips: [0, 0.9 + Math.PI * 2, 0], spine: [0.1, 0.3, 0] },
      { t: 0.95, e: 'linear', pos: [0, -0.12, 0], hips: [0, 0.9 + Math.PI * 4, 0], spine: [0.1, 0.3, 0] },
      { t: 1.2, e: 'out', ...B, hips: [0, 0.42 + Math.PI * 4, 0] },
    ],
  }),
  // Leap strike: dash forward with a rising slash
  leap_strike: new Clip('leap_strike', {
    duration: 0.95, base: B, expression: 'angry', sword: [0.3, 0.56],
    events: [{ t: 0.44, name: 'hit' }],
    keys: [
      { t: 0, ...B },
      { t: 0.14, e: 'out', pos: [0, -0.2, 0], spine: [0.45, 0, 0], armR: [0.5, 0, -0.5], elbowR: [-0.4, 0, 0], handR: [1.6, 0, 0], legL: [-0.9, 0, 0.1], kneeL: [1.3, 0, 0], legR: [0.2, 0, -0.1], kneeR: [1.2, 0, 0] },
      { t: 0.34, e: 'out', root: [0, 0.5, 1.5], pos: [0, 0, 0], hips: [-0.15, 0.3, 0], spine: [0.3, 0, 0], armR: [0.6, 0, -0.6], elbowR: [-0.2, 0, 0], handR: [1.6, 0, 0], armL: [0.6, 0, 0.5], legL: [-1.1, 0, 0.1], kneeL: [1.6, 0, 0], legR: [0.6, 0, -0.1], kneeR: [1.5, 0, 0] },
      { t: 0.46, e: 'snap', root: [0, 0.2, 2.4], hips: [-0.2, -0.3, 0], spine: [-0.25, -0.2, 0], chest: [-0.2, 0, 0], armR: [-2.8, 0, -0.4], elbowR: [-0.1, 0, 0], handR: [1.4, 0, 0], armL: [-0.4, 0, 1.0], legL: [-0.6, 0, 0.1], kneeL: [0.9, 0, 0], legR: [0.4, 0, -0.1], kneeR: [0.8, 0, 0] },
      { t: 0.62, e: 'in', root: [0, 0, 2.6], pos: [0, -0.1, 0], hips: [0.1, 0, 0], spine: [0.2, 0, 0], armR: [-2.2, 0, -0.5], elbowR: [-0.3, 0, 0] },
      { t: 0.95, e: 'inOut', root: [0, 0, 2.6], ...B },
    ],
  }),
  // Stun bash: pommel thrust (blade pointing back along the forearm)
  stun_bash: new Clip('stun_bash', {
    duration: 0.75, base: B, expression: 'angry',
    events: [{ t: 0.3, name: 'hit' }],
    keys: [
      { t: 0, ...B },
      { t: 0.18, e: 'out', hips: [0, 0.7, 0], spine: [0, 0.4, 0], armR: [-0.3, 0, -0.6], elbowR: [-2.0, 0, 0], handR: [-1.5, 0, 0], armL: [-1.0, 0, 0.3], elbowL: [-1.8, 0, 0] },
      { t: 0.3, e: 'snap', pos: [0, -0.06, 0.2], hips: [0, -0.3, 0], spine: [0.3, -0.3, 0], armR: [-1.45, 0, -0.1], elbowR: [-0.2, 0, 0], handR: [-1.5, 0, 0], armL: [-1.4, 0, 0.1], elbowL: [-0.6, 0, 0], legL: [-0.7, 0, 0.1], kneeL: [0.7, 0, 0] },
      { t: 0.5, e: 'out', pos: [0, -0.06, 0.18] },
      { t: 0.75, ...B },
    ],
  }),
  // War cry / provoke
  provoke: new Clip('provoke', {
    duration: 1.1, base: B, expression: 'angry',
    events: [{ t: 0.35, name: 'hit' }],
    keys: [
      { t: 0, ...B },
      { t: 0.2, e: 'out', pos: [0, -0.1, 0], spine: [0.35, 0, 0], chest: [0.2, 0, 0], armR: [-0.3, 0, -0.5], elbowR: [-1.2, 0, 0], armL: [-0.3, 0, 0.5], elbowL: [-1.5, 0, 0] },
      { t: 0.38, e: 'snap', pos: [0, 0.02, 0], hips: [0, 0, 0], spine: [-0.3, 0, 0], chest: [-0.25, 0, 0], neck: [-0.2, 0, 0], head: [-0.25, 0, 0], armR: [-0.4, 0, -1.3], elbowR: [-0.3, 0, 0], handR: [1.5, 0, 0], armL: [-0.4, 0, 1.3], elbowL: [-0.6, 0, 0], legL: [-0.4, 0, 0.35], legR: [0.2, 0, -0.35] },
      { t: 0.85, e: 'linear', pos: [0, 0.02, 0], spine: [-0.32, 0, 0], armR: [-0.45, 0, -1.35], armL: [-0.45, 0, 1.35] },
      { t: 1.1, ...B },
    ],
  }),
  // Buff: raise sword to the sky
  buff: new Clip('buff', {
    duration: 1.0, base: B,
    events: [{ t: 0.45, name: 'hit' }],
    keys: [
      { t: 0, ...B },
      { t: 0.3, e: 'out', pos: [0, -0.02, 0], hips: [0, 0, 0], spine: [-0.1, 0, 0], chest: [-0.12, 0, 0], head: [-0.35, 0, 0], armR: [-3.05, 0, -0.1], elbowR: [-0.05, 0, 0], handR: [1.5, 0, 0], armL: [-0.2, 0, 0.6], elbowL: [-0.8, 0, 0], legL: [0, 0, 0.1], kneeL: [0, 0, 0], legR: [0, 0, -0.1], kneeR: [0, 0, 0] },
      { t: 0.7, e: 'linear', pos: [0, -0.02, 0], spine: [-0.14, 0, 0], armR: [-3.1, 0, -0.08] },
      { t: 1.0, ...B },
    ],
  }),
  hit: new Clip('hit', {
    duration: 0.35, base: B, expression: 'hurt',
    keys: [
      { t: 0, ...B },
      { t: 0.08, e: 'snap', pos: [0, -0.02, -0.08], hips: [-0.15, 0.4, 0], spine: [-0.25, -0.1, 0], chest: [-0.15, 0, 0], head: [-0.3, 0.2, 0] },
      { t: 0.35, ...B },
    ],
  }),
  pickup: new Clip('pickup', {
    duration: 0.8, base: P_IDLE,
    events: [{ t: 0.4, name: 'hit' }],
    keys: [
      { t: 0, ...P_IDLE },
      { t: 0.35, e: 'out', pos: [0, -0.28, 0], spine: [0.6, 0, 0], chest: [0.3, 0, 0], head: [0.2, 0, 0], armL: [-1.1, 0, 0.15], elbowL: [-0.2, 0, 0], legL: [-0.9, 0, 0.1], kneeL: [1.5, 0, 0], legR: [-0.2, 0, -0.1], kneeR: [1.3, 0, 0], footL: [-0.5, 0, 0], footR: [-0.9, 0, 0] },
      { t: 0.5, pos: [0, -0.28, 0], spine: [0.6, 0, 0], armL: [-0.9, 0, 0.1] },
      { t: 0.8, ...P_IDLE },
    ],
  }),
  levelup: new Clip('levelup', {
    duration: 1.6, base: P_IDLE,
    keys: [
      { t: 0, ...P_IDLE },
      { t: 0.3, e: 'out', pos: [0, -0.1, 0], spine: [0.2, 0, 0], armL: [-0.3, 0, 0.3], elbowL: [-1.8, 0, 0] },
      { t: 0.55, e: 'outBack', root: [0, 0.35, 0], pos: [0, 0, 0], spine: [-0.2, 0, 0], head: [-0.3, 0, 0], armL: [-3.0, 0, 0.3], elbowL: [-0.1, 0, 0], handL: [0, 0, 0], legL: [-0.4, 0, 0.1], kneeL: [0.8, 0, 0], legR: [0.2, 0, -0.1], kneeR: [0.9, 0, 0] },
      { t: 0.8, e: 'in', root: [0, 0, 0], pos: [0, -0.08, 0], armL: [-3.0, 0, 0.3], legL: [0, 0, 0.1], kneeL: [0.2, 0, 0], legR: [0, 0, -0.1], kneeR: [0.2, 0, 0] },
      { t: 1.25, pos: [0, 0, 0], armL: [-2.9, 0, 0.35] },
      { t: 1.6, ...P_IDLE },
    ],
  }),
  // NPC gestures
  wave: new Clip('wave', {
    duration: 1.6, base: P_IDLE,
    keys: [
      { t: 0, ...P_IDLE },
      { t: 0.25, e: 'out', armL: [-0.3, 0, 2.5], elbowL: [-0.6, 0, 0], handL: [0, 0, -0.2] },
      { t: 0.5, armL: [-0.3, 0, 2.5], elbowL: [-0.2, 0, 0] },
      { t: 0.75, armL: [-0.3, 0, 2.5], elbowL: [-0.7, 0, 0] },
      { t: 1.0, armL: [-0.3, 0, 2.5], elbowL: [-0.2, 0, 0] },
      { t: 1.25, armL: [-0.3, 0, 2.5], elbowL: [-0.6, 0, 0] },
      { t: 1.6, ...P_IDLE },
    ],
  }),
  // death falls into P_DEAD and stays
  death: new Clip('death', {
    duration: 1.1, base: B, expression: 'hurt',
    keys: [
      { t: 0, ...B },
      { t: 0.2, e: 'out', pos: [0, -0.05, -0.05], hips: [-0.3, 0.2, 0], spine: [-0.35, 0, 0], head: [-0.4, 0, 0], armR: [-0.4, 0, -0.8], armL: [-0.4, 0, 0.8] },
      { t: 0.55, e: 'in', pos: [0, -0.4, -0.15], hips: [-0.8, 0.1, 0], spine: [-0.1, 0, 0], kneeL: [1.2, 0, 0], kneeR: [1.0, 0, 0], legL: [-0.6, 0, 0.1], legR: [-0.4, 0, -0.1] },
      { t: 0.85, e: 'out', ...P_DEAD },
      { t: 1.1, ...P_DEAD },
    ],
  }),
};

// ------------------------------------------------------------------ animator
export class Animator {
  constructor(rig, { idlePose = P_IDLE } = {}) {
    this.rig = rig;
    this.J = rig.joints;
    this.idlePose = fullPose(idlePose);
    this.t = 0;
    this.speed = 0;         // 0..1 locomotion blend (running)
    this.moveDir = 1;       // 1 forward, -1 backwards
    this.phase = 0;
    this.battle = 0;        // 0..1 blend towards battle stance
    this.battleTarget = 0;
    this.sit = 0; this.sitTarget = 0;
    this.dead = false;
    this.action = null;     // { clip, t, speed, weight, fadeIn, fadeOut, onEvent, firedEvents }
    this.base = emptyPose();
    this.act = emptyPose();
    this.out = emptyPose();
    this.tmp = emptyPose();
    this.blinkT = 2 + Math.random() * 3;
    this.expr = 'open';
    this.rootOffset = new THREE.Vector3();
    this.rootDelta = new THREE.Vector3();   // horizontal root motion this frame (local space)
    this.tailState = (rig.tails || []).map(() => ({ ang: 0, vel: 0, side: 0, sideVel: 0 }));
    this.lastRootPos = null;
    this.accel = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.lookYaw = 0;
  }

  play(name, { speed = 1, onEvent = null, fadeIn = 0.06, fadeOut = 0.16 } = {}) {
    const clip = CLIPS[name];
    if (!clip) return null;
    this.action = { clip, t: 0, speed, weight: this.action ? this.action.weight : 0, fadeIn, fadeOut, onEvent, fired: new Set(), done: false };
    return this.action;
  }
  get busy() { return !!(this.action && !this.action.done && this.action.t < this.action.clip.duration - this.action.fadeOut * 0.5); }
  stop() { if (this.action) this.action.done = true; }

  die() { this.dead = true; this.play('death'); }
  revive() { this.dead = false; this.action = null; }

  // procedural locomotion pose into this.base
  locomotion(dt) {
    const J = this.base;
    const s = this.speed;
    const sp = 0.55 + s * 0.45;
    this.phase += dt * (s > 0.01 ? (5.6 + s * 4.0) : 0) * (this.moveDir < 0 ? 0.8 : 1);
    const ph = this.phase;
    const t = this.t;

    // idle / battle / sit blend
    const idle = this.idlePose;
    blendPose(idle, P_BATTLE, this.battle, J);
    // breathing & weight shift
    const br = Math.sin(t * 2.1);
    J.spine[0] += br * 0.015;
    J.chest[0] -= br * 0.02;
    J.head[0] += Math.sin(t * 2.1 + 0.6) * 0.02;
    J.pos[1] += br * 0.004;
    J.hips[2] += Math.sin(t * 0.7) * 0.02 * (1 - this.battle);
    J.armL[2] += Math.sin(t * 2.1) * 0.02;
    if (this.battle > 0.01) {
      J.pos[1] += Math.sin(t * 5) * 0.008 * this.battle;
      J.armR[0] += Math.sin(t * 5 + 1) * 0.03 * this.battle;
    }

    if (s > 0.001) {
      // run cycle: per-leg phase, swing/stance knee curve, foot roll, pelvis/chest counter-rotation
      const dir = this.moveDir;
      const stride = (0.55 + s * 0.45) * (dir < 0 ? 0.7 : 1);
      const leg = (p) => {
        const sn = Math.sin(p), cs = Math.cos(p);
        const hip = -sn * 0.72 * stride * dir;                       // negative = forward
        const knee = 0.12 + Math.max(0, cs) * 1.45 * stride + Math.max(0, -sn) * Math.max(0, -cs) * 0.35;
        const toeOff = Math.max(0, sn) * Math.max(0, cs) * 0.9;       // push off when the leg is behind
        const foot = -(hip + knee) * 0.82 + toeOff - Math.max(0, cs) * 0.25;
        return [hip, knee, foot];
      };
      const [hL, kL, fL] = leg(ph), [hR, kR, fR] = leg(ph + Math.PI);
      const sw = Math.sin(ph), cw = Math.cos(ph);
      const bob = Math.abs(cw) * 0.06 * stride;
      const run = {
        pos: [Math.sin(ph) * 0.012, -0.045 + bob, 0],
        hips: [0.06 * dir, -sw * 0.16, cw * 0.035],
        spine: [0.2 * dir * s, sw * 0.1, -cw * 0.02],
        chest: [0.04, sw * 0.16, 0],
        neck: [0, -sw * 0.06, 0],
        head: [-0.16 * dir * s, -sw * 0.06, cw * 0.02],
        legL: [hL, 0, 0.05], kneeL: [kL, 0, 0], footL: [fL, 0, 0],
        legR: [hR, 0, -0.05], kneeR: [kR, 0, 0], footR: [fR, 0, 0],
        armL: [sw * 0.85 * dir, 0.1, 0.28], elbowL: [-1.05 - Math.max(0, -sw) * 0.45, 0, 0], handL: [0.1, 0, 0],
        // sword arm: blade trailing behind, small counter swing
        armR: [0.62 - sw * 0.18, 0, -0.36], elbowR: [-0.55 - Math.max(0, sw) * 0.15, 0, 0], handR: [2.15, 0, -0.3],
      };
      if (this.runOverride) for (const k of ['armR', 'elbowR', 'handR']) if (this.runOverride[k]) run[k] = this.runOverride[k];
      const w = Math.min(1, s * 1.8);
      for (const k of Object.keys(run)) {
        const a = J[k], b = run[k];
        a[0] += (b[0] - a[0]) * w; a[1] += (b[1] - a[1]) * w; a[2] += (b[2] - a[2]) * w;
      }
    }
    if (this.sit > 0.001) blendPose(J, P_SIT, this.sit, J);
  }

  update(dt, rootWorldPos) {
    this.t += dt;
    this.battle += (this.battleTarget - this.battle) * (1 - Math.exp(-6 * dt));
    this.sit += (this.sitTarget - this.sit) * (1 - Math.exp(-5 * dt));
    this.locomotion(dt);

    let pose = this.base;
    const a = this.action;
    let expr = 'open';
    if (a && !a.done) {
      a.t += dt * a.speed;
      const c = a.clip;
      if (a.t < a.fadeIn) a.weight = Math.max(a.weight, a.t / a.fadeIn);
      else a.weight = 1;
      const endT = c.duration;
      if (!c.loop && !this.dead && a.t > endT - a.fadeOut) a.weight = Math.max(0, (endT - a.t) / a.fadeOut);
      for (const ev of c.events) {
        if (a.t >= ev.t && !a.fired.has(ev)) { a.fired.add(ev); a.onEvent && a.onEvent(ev.name); }
      }
      c.sample(Math.min(a.t, c.duration), this.act);
      // root motion extraction (unweighted, horizontal)
      const r = this.act.root;
      if (!a.prevRoot) a.prevRoot = [0, 0, 0];
      this.rootDelta.set(r[0] - a.prevRoot[0], 0, r[2] - a.prevRoot[2]);
      a.prevRoot = [r[0], r[1], r[2]];
      if (c.expression) expr = c.expression;
      if (a.t >= endT) {
        if (c.loop) a.t %= endT;
        else if (!this.dead) { a.done = true; a.onEvent && a.onEvent('end'); }
      }
      if (!a.done || this.dead) {
        blendPose(this.base, this.act, this.dead ? 1 : a.weight, this.out);
        pose = this.out;
      }
      this.swordActive = c.sword && a.t >= c.sword[0] && a.t <= c.sword[1];
    } else this.swordActive = false;

    // apply
    const J = this.J;
    for (const name of JOINTS) {
      const r = pose[name];
      J[name].rotation.set(r[0], r[1], r[2], 'YXZ');
    }
    const ks = this.rig.hipY / 0.64;
    J.hips.position.set(pose.pos[0] * ks, this.rig.hipY + pose.pos[1] * ks, pose.pos[2] * ks);
    if (!(a && !a.done)) this.rootDelta.set(0, 0, 0);
    this.rootOffset.set(0, pose.root[1], 0);
    this.rig.body.position.copy(this.rootOffset);

    // facial expression + blinking
    if (this.dead) expr = 'hurt';
    this.blinkT -= dt;
    if (expr === 'open' && this.blinkT < 0.12) expr = 'blink';
    if (this.blinkT < 0) this.blinkT = 2 + Math.random() * 3.5;
    if (expr !== this.expr) { this.expr = expr; this.rig.setExpression(expr); }

    this.updateTails(dt, rootWorldPos);
  }

  // secondary motion for headband ribbon tails
  updateTails(dt, rootWorldPos) {
    const flaps = this.rig.flaps;
    if (flaps && flaps.length) {
      const J = this.J;
      const lf = Math.min(J.legL.rotation.x, J.legR.rotation.x), lb = Math.max(J.legL.rotation.x, J.legR.rotation.x);
      for (const f of flaps) {
        const target = f.dir > 0 ? Math.min(0, lf) * 0.85 - (this.speed * 0.12) : Math.max(0, lb) * 0.85 + this.speed * 0.25;
        f.vel = (f.vel || 0) + ((target - (f.ang || 0)) * 90 - (f.vel || 0) * 12) * dt;
        f.ang = (f.ang || 0) + f.vel * dt;
        f.pivot.rotation.x = f.ang;
      }
    }
    if (!this.rig.tails.length) return;
    if (rootWorldPos) {
      if (this.lastRootPos) {
        const v = rootWorldPos.clone().sub(this.lastRootPos).divideScalar(Math.max(dt, 1e-4));
        this.velocity.lerp(v, 1 - Math.exp(-8 * dt));
      }
      this.lastRootPos = rootWorldPos.clone();
    }
    const speed = Math.min(8, this.velocity.length());
    const t = this.t;
    this.rig.tails.forEach((tail, i) => {
      const st = this.tailState[i];
      const target = 0.25 + speed * 0.16 + (this.action && !this.action.done ? 0.35 : 0);
      st.vel += ((target - st.ang) * 40 - st.vel * 7) * dt;
      st.ang += st.vel * dt;
      tail.segs.forEach((seg, k) => {
        const flutter = Math.sin(t * (7 + speed) + k * 1.3 + i * 2) * (0.08 + speed * 0.05) * (k + 1) * 0.5;
        seg.rotation.x = -(k === 0 ? st.ang : st.ang * 0.3) + flutter;
        seg.rotation.z = tail.side * (k === 0 ? 0.25 : 0.05) + Math.sin(t * 3 + k + i) * 0.05;
      });
    });
  }
}

// Keyframe + procedural animation system for the chibi humanoid rig.
// Poses are partial maps of joint -> [rx, ry, rz] (radians) plus optional `pos` (hips offset [x,y,z])
// and `root` ([x,y,z] body offset, used for leaps). Missing joints fall back to the previous key.
import * as THREE from 'three';
import { JOINTS } from './humanoid.js';
import { clamp, lerp, smoothstep } from '../core/utils.js';

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
  constructor(name, opts) {
    const { duration, keys, loop = false, events = [], base = null, expression = null, sword = null } = opts;
    this.opts = opts;       // kept so a clip can be re-based for another weapon style (see restyleClip)
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
// riding a mount: straddling the saddle, knees bent along the flanks, both hands forward on the reins
export const P_RIDE = {
  pos: [0, 0, 0],
  hips: [0, 0, 0], spine: [0.14, 0, 0], chest: [0.04, 0, 0], neck: [0, 0, 0], head: [-0.12, 0, 0],
  armL: [-0.7, 0, 0.12], elbowL: [-0.95, 0, 0], handL: [0.25, 0, 0],
  armR: [-0.7, 0, -0.12], elbowR: [-0.95, 0, 0], handR: [0.25, 0, 0],
  legL: [-0.7, 0.35, 0.95], kneeL: [1.25, 0, 0], footL: [0.2, 0, -0.3],
  legR: [-0.7, -0.35, -0.95], kneeR: [1.25, 0, 0], footR: [0.2, 0, 0.3],
};
export const P_DEAD = {
  pos: [0, -0.52, -0.2],
  hips: [-1.45, 0.1, 0], spine: [0.08, 0, 0], chest: [0.05, 0, 0], neck: [0, 0, 0], head: [-0.2, 0.5, 0],
  armR: [-0.3, 0, -1.3], elbowR: [-0.3, 0, 0], handR: [0.2, 0, 0.4],
  armL: [-0.2, 0, 1.2], elbowL: [-0.4, 0, 0], handL: [0, 0, 0],
  legL: [0.1, 0, 0.2], kneeL: [0.25, 0, 0], footL: [0.3, 0, 0],
  legR: [-0.25, 0, -0.15], kneeR: [0.6, 0, 0], footR: [0.3, 0, 0],
};

// ---- dual blades: relaxed stance, arms loose at the sides and both blades angled down-back and out (a clear V
// seen from the follow camera, never crossing the legs); plus a low wide battle stance
export const P_DUAL_IDLE = {
  pos: [0, -0.015, 0],
  hips: [0, 0.06, 0.02], spine: [0.05, -0.03, -0.01], chest: [0.02, -0.03, 0], neck: [0, 0, 0], head: [0.04, 0, 0],
  armR: [0.05, 0, -0.3], elbowR: [-0.32, 0, 0], handR: [2.2, 0, -0.42],
  armL: [0.05, 0, 0.3], elbowL: [-0.32, 0, 0], handL: [2.2, 0, 0.42],
  legL: [-0.05, 0.08, 0.1], kneeL: [0.08, 0, 0], footL: [0, 0, -0.05],
  legR: [0.06, -0.12, -0.1], kneeR: [0.14, 0, 0], footR: [-0.02, 0, 0.05],
};
// arm poses used by the dual-blade run (right blade trailing low behind, left blade across the chest)
const DUAL_RUN = {
  armR: [0.5, 0.1, -0.22], elbowR: [-0.2, 0, 0], handR: [1.95, 0.1, -0.15],
  armL: [-0.3, 0, 0.15], elbowL: [-1.6, -1.1, 0], handL: [-1.6, 0, 0],   // forearm across the chest, reverse grip
};
const ARM_CH = ['armL', 'elbowL', 'handL', 'armR', 'elbowR', 'handR'];
const pick = (p, chans) => Object.fromEntries(chans.map((c) => [c, p[c]]));
// sword run: right arm swept back, blade trailing behind and a little up
const SWORD_RUN ={ armR: [0.4, 0.1, -0.35], elbowR: [-0.35, 0, 0], handR: [2.3, 0, -0.35] };

// ---- gait helpers (skinned rigs with rig.legGeo)
// foot path of one leg over the gait cycle u (0 = touch-down in front); z in model units (travel / zc), y in leg
// lengths above the standing ankle height: the planted foot slides
// back under the body (heel strike -> flat -> toe-off), the swing lifts the heel and carries the foot forward
const _footL = { z: 0, y: 0, pitch: 0 }, _footR = { z: 0, y: 0, pitch: 0 };
const _ik = [0, 0];
function footPath(u, D, travel, zc, lift, dir, out) {
  if (u < D) {
    const s = u / D;
    const toe = s > 0.55 ? ((s - 0.55) / 0.45) ** 2 : 0;
    out.z = zc + dir * travel * (0.5 - s);
    out.y = toe * 0.1;
    out.pitch = s < 0.15 ? -0.15 * (1 - s / 0.15) : toe;
  } else {
    const s = (u - D) / (1 - D);
    const e = s * s * (3 - 2 * s);
    out.z = zc + dir * travel * (e - 0.5);
    out.y = lift * 6.75 * s * (1 - s) * (1 - s) + 0.1 * (1 - s) ** 3;   // heel kick early, foot comes down in time
    out.pitch = (1 - e) - 0.15 * e;
  }
}
// 2-bone IK in the sagittal plane: ankle target (z forward, y up) relative to the hip joint -> [hip, knee]
// (hip negative = thigh forward, knee positive = bent, knee always in front)
export function legIK(z, y, T, S, out = [0, 0]) {
  let d = Math.hypot(z, y);
  const maxD = (T + S) * 0.998;
  if (d > maxD) { z *= maxD / d; y *= maxD / d; d = maxD; }
  d = Math.max(d, Math.abs(T - S) + 1e-3);
  const phi = Math.atan2(z, -y);
  const alpha = Math.acos(clamp((T * T + d * d - S * S) / (2 * T * d), -1, 1));
  out[0] = -(phi + alpha);
  out[1] = Math.PI - Math.acos(clamp((T * T + S * S - d * d) / (2 * T * S), -1, 1));
  return out;
}
export const P_DUAL_BATTLE = {
  pos: [0, -0.07, 0],
  hips: [0, 0.3, 0], spine: [0.2, -0.18, 0], chest: [0.08, -0.12, 0], neck: [0, -0.05, 0], head: [-0.1, -0.12, 0],
  armR: [-0.6, 0.25, -0.45], elbowR: [-1.25, 0, 0], handR: [0.55, -0.25, 0],
  armL: [-0.2, -0.2, 0.62], elbowL: [-0.85, 0, 0], handL: [1.95, 0.25, 0.15],
  legL: [-0.48, -0.25, 0.2], kneeL: [0.58, 0, 0], footL: [-0.08, 0.22, 0],
  legR: [0.3, -0.38, -0.2], kneeR: [0.46, 0, 0], footR: [-0.08, 0.3, 0],
};

// make library poses complete (all channels present)
export function fullPose(p) {
  for (const ch of CHANNELS) if (!p[ch]) p[ch] = zero();
  return p;
}
fullPose(P_IDLE); fullPose(P_BATTLE); fullPose(P_SIT); fullPose(P_RIDE); fullPose(P_DEAD); fullPose(P_DUAL_IDLE); fullPose(P_DUAL_BATTLE);

// weapon-holding arm layers for the motion-capture locomotion (joint -> rotation; absent joints keep the clip).
// `aim`: while moving, the hand's orientation relative to the chest is locked to the one of a designed pose
// (arm * elbow * hand of that pose), so the weapon keeps its look while the arm swings naturally.
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qc = new THREE.Quaternion();
const _eu = new THREE.Euler(0, 0, 0, 'YXZ');
const _aimOut = { L: null, R: null };
const _stance = [0, 0, 0];
function eulerQ(r, out) { return out.setFromEuler(_eu.set(r[0], r[1], r[2], 'YXZ')); }
function chainQ(p, side) {
  const q = new THREE.Quaternion();
  eulerQ(p['arm' + side], q); q.multiply(eulerQ(p['elbow' + side], _qc)); q.multiply(eulerQ(p['hand' + side], _qc));
  return q;
}
const WEAPON_ARMS = {
  // big sword: resting on the right shoulder when standing and while running
  sword: {
    idle: pick(P_IDLE, ['armR', 'elbowR', 'handR']),
    run: { armR: [-0.3, 0.2, -0.45], elbowR: [-2.1, 0, 0], handR: [-0.5, -0.68, 0.3] },
  },
  // dual blades: a relaxed V when standing; running keeps the natural arm swing with the blades reverse-gripped
  dual: {
    idle: pick(P_DUAL_IDLE, ['armL', 'elbowL', 'handL', 'armR', 'elbowR', 'handR']),
    // arms halfway between the clip's swing and the designed run pose (less swing: the blades stay clear)
    run: pick(DUAL_RUN, ['armL', 'elbowL', 'armR', 'elbowR']),
    runWeight: 0.5,
    aim: { L: chainQ(DUAL_RUN, 'L'), R: chainQ({ ...DUAL_RUN, handR: [1.55, 0.1, -0.5] }, 'R') },
  },
};

// Re-base a clip for another weapon style: every channel that was taken verbatim from a library pose
// (e.g. `...P_BATTLE`) is swapped for the matching channel of the style's pose. Hit reactions, pick-up,
// level-up etc. then keep their motion but hold the blades the way the style does.
const STYLE_POSES = { dual: new Map([[P_BATTLE, P_DUAL_BATTLE], [P_IDLE, P_DUAL_IDLE]]) };
const restyled = new Map();
function restyleClip(clip, style) {
  const key = clip.name + '|' + style;
  if (restyled.has(key)) return restyled.get(key);
  const map = STYLE_POSES[style];
  const o = clip.opts;
  const keys = o.keys.map((k) => {
    const out = { ...k };
    for (const ch of CHANNELS) for (const [from, to] of map) if (out[ch] && out[ch] === from[ch]) out[ch] = to[ch];
    return out;
  });
  const c = new Clip(clip.name, { ...o, keys, base: map.get(o.base) || o.base });
  restyled.set(key, c);
  return c;
}

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
  // ---- dual blades: 4-hit combo (right slash, left backhand, X-cross, spinning finisher)
  dual_attack1: new Clip('dual_attack1', {
    duration: 0.46, base: P_DUAL_BATTLE, expression: 'angry', sword: [0.08, 0.3],
    events: [{ t: 0.2, name: 'hit' }],
    keys: [
      { t: 0, ...P_DUAL_BATTLE },
      { t: 0.1, e: 'out', pos: [0, -0.05, -0.03], hips: [0, -0.55, 0], spine: [0.1, -0.35, 0], chest: [0.02, -0.2, 0], armR: [-1.35, 0, -1.35], elbowR: [-0.45, 0, 0], handR: [1.45, 0, 0], armL: [-0.45, 0, 0.45], elbowL: [-1.25, 0, 0], handL: [1.9, 0.2, 0.2] },
      { t: 0.22, e: 'snap', pos: [0, -0.09, 0.14], hips: [0, 0.65, 0], spine: [0.18, 0.45, 0], chest: [0.06, 0.25, 0], armR: [-1.45, 0, 0.75], elbowR: [-0.1, 0, 0], handR: [1.5, 0, 0], armL: [0.25, 0, 0.8], elbowL: [-0.6, 0, 0], legL: [-0.75, -0.2, 0.15], kneeL: [0.85, 0, 0] },
      { t: 0.32, e: 'out', pos: [0, -0.09, 0.14], hips: [0, 0.7, 0], spine: [0.2, 0.5, 0], armR: [-1.4, 0, 0.85], handR: [1.5, 0, 0] },
      { t: 0.46, ...P_DUAL_BATTLE },
    ],
  }),
  dual_attack2: new Clip('dual_attack2', {
    duration: 0.46, base: P_DUAL_BATTLE, expression: 'angry', sword: [0.08, 0.3],
    events: [{ t: 0.2, name: 'hit' }],
    keys: [
      { t: 0, ...P_DUAL_BATTLE },
      { t: 0.1, e: 'out', pos: [0, -0.05, -0.03], hips: [0, 0.75, 0], spine: [0.1, 0.4, 0], chest: [0.02, 0.2, 0], armL: [-1.35, 0, 1.35], elbowL: [-0.45, 0, 0], handL: [1.45, 0, 0], armR: [-0.5, 0, -0.35], elbowR: [-1.3, 0, 0], handR: [1.9, -0.2, -0.2] },
      { t: 0.22, e: 'snap', pos: [0, -0.09, 0.14], hips: [0, -0.45, 0], spine: [0.18, -0.45, 0], chest: [0.06, -0.25, 0], armL: [-1.45, 0, -0.75], elbowL: [-0.1, 0, 0], handL: [1.5, 0, 0], armR: [0.25, 0, -0.8], elbowR: [-0.6, 0, 0], legR: [-0.7, 0.2, -0.15], kneeR: [0.8, 0, 0], legL: [0.3, -0.2, 0.15], kneeL: [0.4, 0, 0] },
      { t: 0.32, e: 'out', pos: [0, -0.09, 0.14], hips: [0, -0.5, 0], spine: [0.2, -0.5, 0], armL: [-1.4, 0, -0.85], handL: [1.5, 0, 0] },
      { t: 0.46, ...P_DUAL_BATTLE },
    ],
  }),
  dual_attack3: new Clip('dual_attack3', {
    duration: 0.62, base: P_DUAL_BATTLE, expression: 'angry', sword: [0.16, 0.4],
    events: [{ t: 0.27, name: 'hit' }, { t: 0.32, name: 'hit' }],
    keys: [
      { t: 0, ...P_DUAL_BATTLE },
      { t: 0.15, e: 'out', pos: [0, 0.03, -0.05], hips: [0, 0.05, 0], spine: [-0.22, 0, 0], chest: [-0.15, 0, 0], head: [-0.2, 0, 0], armR: [-2.75, 0, -0.65], elbowR: [-0.55, 0, 0], handR: [1.2, 0, 0], armL: [-2.75, 0, 0.65], elbowL: [-0.55, 0, 0], handL: [1.2, 0, 0], legL: [-0.2, 0, 0.12], kneeL: [0.2, 0, 0], legR: [0.1, 0, -0.12], kneeR: [0.15, 0, 0] },
      { t: 0.3, e: 'snap', pos: [0, -0.15, 0.2], hips: [0.1, 0.05, 0], spine: [0.45, 0, 0], chest: [0.2, 0, 0], head: [0.1, 0, 0], armR: [-0.75, 0, 0.6], elbowR: [-0.1, 0, 0], handR: [1.45, 0, 0], armL: [-0.75, 0, -0.6], elbowL: [-0.1, 0, 0], handL: [1.45, 0, 0], legL: [-0.95, -0.1, 0.12], kneeL: [1.05, 0, 0], legR: [0.55, -0.2, -0.1], kneeR: [0.5, 0, 0] },
      { t: 0.44, e: 'out', pos: [0, -0.15, 0.2], spine: [0.48, 0, 0], armR: [-0.7, 0, 0.7], armL: [-0.7, 0, -0.7] },
      { t: 0.62, ...P_DUAL_BATTLE },
    ],
  }),
  dual_attack4: new Clip('dual_attack4', {
    duration: 0.82, base: P_DUAL_BATTLE, expression: 'angry', sword: [0.12, 0.72],
    events: [{ t: 0.36, name: 'hit' }, { t: 0.56, name: 'hit' }],
    keys: [
      { t: 0, ...P_DUAL_BATTLE },
      { t: 0.12, e: 'out', pos: [0, -0.13, 0], hips: [0, -0.9, 0], spine: [0.15, -0.4, 0], chest: [0.05, -0.2, 0], armR: [-1.5, 0, -1.3], elbowR: [-0.1, 0, 0], handR: [1.5, 0, 0], armL: [-1.5, 0, 1.3], elbowL: [-0.1, 0, 0], handL: [1.5, 0, 0], legL: [-0.5, 0, 0.25], kneeL: [0.6, 0, 0], legR: [0.2, 0, -0.25], kneeR: [0.5, 0, 0] },
      { t: 0.62, e: 'linear', root: [0, 0.18, 0], pos: [0, -0.13, 0], hips: [0, -0.9 + Math.PI * 2, 0], spine: [0.15, -0.4, 0], armR: [-1.5, 0, -1.35], armL: [-1.5, 0, 1.35] },
      { t: 0.82, e: 'out', root: [0, 0, 0], ...P_DUAL_BATTLE, hips: [0, 0.3 + Math.PI * 2, 0] },
    ],
  }),
  // ---- idle showpieces for wandering NPCs (Sir Ratman, Robo)
  // courtly bow: right hand to the chest, left arm swept back
  bow: new Clip('bow', {
    duration: 2.2, base: P_IDLE,
    keys: [
      { t: 0, ...P_IDLE },
      { t: 0.45, e: 'out', armR: [-0.9, 0.5, 0.3], elbowR: [-1.9, 0, 0], armL: [0.5, 0, 0.35], elbowL: [-0.2, 0, 0], legR: [0.2, 0, -0.05], kneeR: [0.25, 0, 0] },
      { t: 0.9, e: 'inOut', pos: [0, -0.04, -0.03], spine: [0.45, 0, 0], chest: [0.25, 0, 0], head: [0.3, 0, 0], armR: [-0.95, 0.5, 0.3], elbowR: [-1.95, 0, 0], armL: [0.75, 0, 0.3], elbowL: [-0.15, 0, 0], legL: [-0.15, 0, 0.05], kneeL: [0.2, 0, 0], legR: [0.25, 0, -0.05], kneeR: [0.3, 0, 0] },
      { t: 1.5, e: 'linear', pos: [0, -0.04, -0.03], spine: [0.47, 0, 0], chest: [0.26, 0, 0], head: [0.32, 0, 0], armR: [-0.95, 0.5, 0.3], elbowR: [-1.95, 0, 0], armL: [0.78, 0, 0.3] },
      { t: 2.2, e: 'inOut', ...P_IDLE },
    ],
  }),
  // double-biceps flex
  flex: new Clip('flex', {
    duration: 2.6, base: P_IDLE,
    keys: [
      { t: 0, ...P_IDLE },
      { t: 0.4, e: 'outBack', pos: [0, -0.03, 0], spine: [-0.08, 0, 0], chest: [-0.12, 0, 0], head: [-0.15, 0, 0], armL: [0, 0, 1.45], elbowL: [0, 0, 1.75], armR: [0, 0, -1.45], elbowR: [0, 0, -1.75], legL: [0, 0, 0.18], legR: [0, 0, -0.18] },
      { t: 1.1, e: 'inOut', pos: [0, -0.04, 0], spine: [-0.06, 0.25, 0], chest: [-0.12, 0.15, 0], head: [-0.12, -0.3, 0], armL: [0, 0, 1.5], elbowL: [0, 0, 1.85], armR: [0, 0, -1.5], elbowR: [0, 0, -1.85], legL: [0, 0, 0.18], legR: [0, 0, -0.18] },
      { t: 1.9, e: 'inOut', pos: [0, -0.04, 0], spine: [-0.06, -0.25, 0], chest: [-0.12, -0.15, 0], head: [-0.12, 0.3, 0], armL: [0, 0, 1.5], elbowL: [0, 0, 1.9], armR: [0, 0, -1.5], elbowR: [0, 0, -1.9], legL: [0, 0, 0.18], legR: [0, 0, -0.18] },
      { t: 2.6, e: 'inOut', ...P_IDLE },
    ],
  }),
  // shade the eyes and scan the horizon
  lookout: new Clip('lookout', {
    duration: 3.2, base: P_IDLE,
    keys: [
      { t: 0, ...P_IDLE },
      { t: 0.45, e: 'out', armL: [-2.2, 0, 0.15], elbowL: [-1.85, 0, 0], handL: [0.3, 0, 0], head: [-0.18, 0.55, 0], neck: [0, 0.2, 0], spine: [0, 0.15, 0] },
      { t: 1.4, e: 'inOut', armL: [-2.2, 0, 0.15], elbowL: [-1.85, 0, 0], handL: [0.3, 0, 0], head: [-0.2, -0.55, 0], neck: [0, -0.2, 0], spine: [0, -0.15, 0] },
      { t: 2.4, e: 'inOut', armL: [-2.2, 0, 0.15], elbowL: [-1.85, 0, 0], handL: [0.3, 0, 0], head: [-0.15, 0.1, 0], neck: [0, 0.05, 0], spine: [0, 0, 0] },
      { t: 3.2, e: 'inOut', ...P_IDLE },
    ],
  }),
  // big stretch with both arms above the head
  stretch: new Clip('stretch', {
    duration: 2.4, base: P_IDLE,
    keys: [
      { t: 0, ...P_IDLE },
      { t: 0.6, e: 'out', root: [0, 0.04, 0], spine: [-0.22, 0, 0], chest: [-0.15, 0, 0], head: [-0.35, 0, 0], armL: [-2.95, 0, 0.25], elbowL: [-0.4, 0, 0], armR: [-2.95, 0, -0.25], elbowR: [-0.4, 0, 0] },
      { t: 1.4, e: 'inOut', root: [0, 0.05, 0], spine: [-0.24, 0, 0.12], chest: [-0.16, 0, 0.1], head: [-0.3, 0, 0.1], armL: [-3.0, 0, 0.3], elbowL: [-0.3, 0, 0], armR: [-3.0, 0, -0.2], elbowR: [-0.3, 0, 0] },
      { t: 2.4, e: 'inOut', ...P_IDLE },
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

// generic clip names replaced by motion-capture clips on rigs that have them
const MOCAP_ALIAS = { hit: 'mc_Hit_Chest' };

// ------------------------------------------------------------------ animator
export class Animator {
  constructor(rig, { idlePose = P_IDLE, gait = 'sword' } = {}) {
    this.rig = rig;
    this.J = rig.joints;
    this.gait = gait;       // 'sword' (blade trails behind while running) | 'free' (both arms swing)
    this.idlePose = fullPose(idlePose);
    this.baseIdlePose = this.idlePose;
    this.battlePose = P_BATTLE;
    this.style = 'sword';   // weapon style: 'sword' | 'dual' (poses, run cycle and clip re-basing)
    this.groundSpeed = null; // m/s set by the controller (drives the step cadence); null = derive from speed
    this.gaitSpeed = 6.2;    // last real ground speed (the gait keeps its shape while blending out)
    this.lean = 0;          // turn lean (set by the controller from the yaw rate)
    this.air = 0; this.inAir = false; this.airVel = 0; this.landT = 0; this.landK = 0;
    this.t = 0;
    this.speed = 0;         // 0..1 locomotion blend (running)
    this.moveDir = 1;       // 1 forward, -1 backwards
    this.phase = 0;
    this.battle = 0;        // 0..1 blend towards battle stance
    this.battleTarget = 0;
    this.sit = 0; this.sitTarget = 0;
    this.ride = 0; this.rideTarget = 0;   // mounted pose blend
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

  setStyle(style) {
    if (style === this.style) return;
    this.style = style;
    this.idlePose = style === 'dual' ? P_DUAL_IDLE : this.baseIdlePose;
    this.battlePose = style === 'dual' ? P_DUAL_BATTLE : P_BATTLE;
  }

  play(name, { speed = 1, onEvent = null, fadeIn = 0.06, fadeOut = 0.16 } = {}) {
    if (this.mocap && MOCAP_ALIAS[name] && CLIPS[MOCAP_ALIAS[name]]) name = MOCAP_ALIAS[name];
    let clip = CLIPS[name];
    if (!clip) return null;
    if (this.style !== 'sword' && STYLE_POSES[this.style] && !name.startsWith(this.style + '_') && !name.startsWith('mc_')) clip = restyleClip(clip, this.style);
    this.action = { clip, t: 0, speed, weight: this.action ? this.action.weight : 0, fadeIn, fadeOut, onEvent, fired: new Set(), done: false };
    return this.action;
  }
  get busy() { return !!(this.action && !this.action.done && this.action.t < this.action.clip.duration - this.action.fadeOut * 0.5); }
  stop() { if (this.action) this.action.done = true; }

  die() { this.dead = true; this.play(this.mocap && CLIPS.mc_Death01 ? 'mc_Death01' : 'death'); }
  revive() { this.dead = false; this.action = null; }

  // ---------------------------------------------------------------- motion-capture locomotion
  // Rigs given a clip library (see mocap.js) stand, walk and run with real motion clips: idle / fight stance,
  // walk <-> jog blended by speed with a shared, phase-locked cycle whose playback rate follows the ground
  // speed (planted feet do not slide). Weapon holding arms are layered on top of the mocap body.
  useMocap(lib) {
    this.mocap = lib;
    this.mc = { idleT: Math.random() * 2, phase: 0, airT: 0, w: 0, stop: null };
    this.mcA = emptyPose(); this.mcB = emptyPose(); this.mcW = emptyPose();
  }
  armStyle() {
    if (this.gait === 'free') return null;
    if (this.style === 'dual') return 'dual';
    return this.rig.weapon && this.rig.weapon.visible ? 'sword' : null;
  }
  mocapLocomotion(dt) {
    const J = this.base, C = this.mocap.clips, M = this.mocap.meta;
    const A = this.mcA, B = this.mcB, W = this.mcW;
    const s = this.speed, sc = this.rig.scale || 1;
    const G = this.rig.legGeo;
    const legW = (G ? G.thigh + G.shin : 0.75) * sc;
    const v = this.groundSpeed ?? s * 6.2;
    if (v > 0.3) this.gaitSpeed = v;
    const gv = this.gaitSpeed;
    // standing: relaxed idle, crossfading into a ready fight stance in combat
    this.mc.idleT += dt;
    C.Idle_Loop.sample(this.mc.idleT % C.Idle_Loop.duration, J);
    if (this.battle > 0.01 && C.Sword_Idle) { C.Sword_Idle.sample(this.mc.idleT % C.Sword_Idle.duration, A); blendPose(J, A, this.battle, J); }
    // moving: walk <-> jog
    const walk = C.Walk_Loop, run = C.Jog_Fwd_Loop, mw = M.Walk_Loop, mr = M.Jog_Fwd_Loop;
    const natW = Math.max(0.3, mw.speedLeg * legW), natR = Math.max(1, mr.speedLeg * legW);
    const k = clamp((gv - natW * 1.15) / (natR * 0.7 - natW * 1.15), 0, 1);
    const rateW = clamp(gv / natW, 0.6, 1.9), rateR = clamp(gv / natR, 0.7, 1.6);
    const f = lerp(rateW / walk.duration, rateR / run.duration, k);   // gait cycles per second
    const mc = this.mc;
    let w = Math.min(1, s * 3.4);
    if (v > 0.05 && s > 0.01) {
      mc.phase += dt * f * (this.moveDir < 0 ? -0.8 : 1);
      mc.stop = null;
      mc.w = w;
    } else if (mc.w > 0.02) {
      // stopping: instead of freezing mid-stride, the step runs on to the next passing position (phase .25 / .75:
      // one foot planted under the body, the other beside it) while the gait blends into the stand
      if (!mc.stop) {
        const p0 = mc.phase, target = 0.25 + 0.5 * Math.ceil((p0 - 0.25 + 0.03) / 0.5);
        mc.stop = { t: 0, p0, dist: target - p0, dur: clamp((target - p0) / Math.max(f, 0.8), 0.16, 0.34), w0: mc.w };
      }
      const st = mc.stop;
      st.t = Math.min(st.dur, st.t + dt);
      const x = st.t / st.dur;
      mc.phase = st.p0 + st.dist * (1 - (1 - x) * (1 - x));        // eases into the planted position
      w = st.w0 * (1 - smoothstep(0.3, 1, x));
      if (x >= 1) mc.w = 0;
    } else { mc.stop = null; w = 0; }
    const ph = ((mc.phase % 1) + 1) % 1;
    walk.sample(((ph + mw.contact) % 1) * walk.duration, A);
    run.sample(((ph + mr.contact) % 1) * run.duration, B);
    blendPose(A, B, k, W);
    blendPose(J, W, w, J);
    // lean into turns
    const ln = this.lean * s;
    J.hips[2] -= ln * 0.4; J.spine[2] -= ln * 0.3; J.head[2] += ln * 0.25;
    // airborne: mid-air pose from the jump clip
    if (this.air > 0.001 && C.Jump_Loop) {
      this.mc.airT += dt;
      C.Jump_Loop.sample((0.35 + this.mc.airT * 0.7) % C.Jump_Loop.duration, A);
      blendPose(J, A, this.air * 0.85, J);
    } else this.mc.airT = 0;
    // weapon arms layered on the mocap body: channels a style defines replace the clip's, the others keep the
    // natural mocap arm swing (dual blades: arms swing, hands hold the blades in reverse grip along the forearms)
    const arms = this.armStyle();
    if (arms) {
      const set = WEAPON_ARMS[arms];
      const run = this.runOverride ? { ...set.run, ...this.runOverride } : set.run;
      const rw = set.runWeight ?? 1;
      // arms first (clip swing, partly pulled towards the style's run pose), then the hands
      for (const pass of [0, 1]) {
        for (const ch of ARM_CH) {
          const isHand = ch.startsWith('hand');
          if (isHand !== (pass === 1)) continue;
          const side = ch.slice(-1);
          const aimed = isHand && set.aim && set.aim[side];
          if (aimed && w > 0.001) {
            // the weapon keeps its orientation relative to the chest: hand = (arm * elbow)^-1 * aim
            eulerQ(J['arm' + side], _qa); eulerQ(J['elbow' + side], _qb);
            _qa.multiply(_qb).invert().multiply(set.aim[side]);
            _eu.setFromQuaternion(_qa, 'YXZ');
            _aimOut[side] = [_eu.x, _eu.y, _eu.z];
          }
          const idleC = set.idle[ch];
          const runC = aimed ? _aimOut[side] : run[ch];
          const k = aimed ? 1 : rw;
          if (!idleC && !runC) continue;
          const o = J[ch];
          if (aimed && idleC && w > 0.001) {
            // aimed hand: rotate between the stance grip and the aimed grip on the shortest path (lerping the
            // Euler angles would swing the blade through odd orientations while starting / stopping)
            for (let i = 0; i < 3; i++) _stance[i] = lerp(idleC[i], this.battlePose[ch][i], this.battle);
            eulerQ(_stance, _qa).slerp(eulerQ(runC, _qb), w);
            _eu.setFromQuaternion(_qa, 'YXZ');
            o[0] = _eu.x; o[1] = _eu.y; o[2] = _eu.z;
            continue;
          }
          for (let i = 0; i < 3; i++) {
            const m = o[i];
            const a = idleC ? lerp(idleC[i], this.battlePose[ch][i], this.battle) : m;
            o[i] = lerp(a, runC ? lerp(m, runC[i], k) : m, w);
          }
        }
      }
    }
    this.finishPose(J, dt);
  }

  // procedural locomotion pose into this.base
  locomotion(dt) {
    const J = this.base;
    const s = this.speed;
    // cadence follows the real ground speed so the feet do not slide: one full cycle (two steps) covers
    // strideLen metres (longer strides when running, scaled with the character's size)
    const v = this.groundSpeed ?? s * 6.2;
    const sc = this.rig.scale || 1;
    if (v > 0.3) this.gaitSpeed = v;                                 // gait shape holds while blending out
    const G = this.rig.legGeo;
    const strideLen = G
      ? (G.thigh + G.shin) * sc * Math.min(3.3, 1.2 + 0.32 * v / sc)
      : (1.3 + 1.4 * clamp((v - 1) / 5, 0, 1)) * sc;
    this.phase += dt * (v > 0.05 && s > 0.01 ? (Math.PI * 2 * v) / strideLen : 0) * (!G && this.moveDir < 0 ? 0.85 : 1);
    const ph = this.phase;
    const t = this.t;

    // idle / battle / sit blend
    const idle = this.idlePose;
    blendPose(idle, this.battlePose, this.battle, J);
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
      const dir = this.moveDir;
      let sw, cw, legs, pos, runK = 1;
      if (G) {
        // foot-planted gait for skinned rigs: each foot follows a stance / swing path and the legs are solved
        // with 2-bone IK, so the planted foot stays on the ground and slides back exactly at ground speed.
        // Walking keeps a foot on the ground (pelvis highest over the stance leg); running has a flight phase,
        // a heel kick and the pelvis dipping on every landing.
        const legLen = G.thigh + G.shin;
        const vs = this.gaitSpeed / sc;                              // size-normalised speed
        runK = clamp((vs - 1.4) / 2.0, 0, 1);
        const strideLen = legLen * Math.min(3.3, 1.2 + 0.32 * vs);   // one cycle (two steps), model units
        const travelMax = legLen * lerp(0.8, 0.62, runK);
        const D = Math.max(travelMax / strideLen, lerp(0.58, 0.2, runK));    // stance share of the cycle
        const travel = Math.min(travelMax, D * strideLen);
        const u = ((ph / (Math.PI * 2)) % 1 + 1) % 1;
        const bobSign = lerp(1, -1, runK);
        const pelvis = legLen * (-lerp(0.06, 0.045, runK) + lerp(0.02, 0.03, runK) * bobSign * Math.cos(4 * Math.PI * (u - D / 2)));
        const hipsPitch = lerp(0.03, 0.08, runK) * dir;
        const zc = legLen * lerp(0.03, 0.07, runK) * dir;
        const lift = lerp(0.12, 0.42, runK);
        const ks = this.rig.hipY / 0.64;
        legs = {};
        const th = [0, 0];
        footPath(u, D, travel, zc, lift, dir, _footL);
        footPath((u + 0.5) % 1, D, travel, zc, lift, dir, _footR);
        // pelvis turns with the legs (the hip of the leading leg forward); that moves the hip joints fore / aft,
        // which the IK targets compensate so the planted foot does not skate
        const dual = this.style === 'dual' && this.gait !== 'free';
        const hipsYaw = (dual ? -0.1 : 0) + (dual ? 0.75 : 1) * clamp(-0.26 * (_footL.z - _footR.z) / legLen, -0.2, 0.2);
        for (let i = 0; i < 2; i++) {
          const f = i ? _footR : _footL;
          const jointZ = (i ? 1 : -1) * G.width * Math.sin(hipsYaw);
          const ty = G.ankle + f.y * legLen - (G.top + pelvis);
          legIK(f.z - jointZ, ty, G.thigh, G.shin, _ik);
          const side = i ? 'R' : 'L';
          legs['leg' + side] = [_ik[0] - hipsPitch, 0, i ? -0.04 : 0.04];
          legs['knee' + side] = [_ik[1], 0, 0];
          legs['foot' + side] = [f.pitch - (_ik[0] + _ik[1]), 0, 0];
          th[i] = -_ik[0];                                           // thigh angle, forward positive
        }
        legs.hips = [hipsPitch, hipsYaw, 0];
        sw = clamp((th[0] - th[1]) * 1.1, -1, 1);                    // +1 = left leg forward
        cw = Math.cos(2 * Math.PI * (u - D / 2));                    // +1 = over the left foot
        pos = [cw * 0.012, pelvis / ks, 0];
      } else {
        // procedural chibi rig: simple sine run cycle
        const stride = (0.55 + s * 0.45) * (dir < 0 ? 0.7 : 1);
        const leg = (p) => {
          const sn = Math.sin(p), cs = Math.cos(p);
          const hip = -sn * 0.72 * stride * dir;
          const knee = 0.12 + Math.max(0, cs) * 1.45 * stride + Math.max(0, -sn) * Math.max(0, -cs) * 0.35;
          const foot = -(hip + knee) * 0.82 + Math.max(0, sn) * Math.max(0, cs) * 0.9 - Math.max(0, cs) * 0.25;
          return [hip, knee, foot];
        };
        const [hL, kL, fL] = leg(ph), [hR, kR, fR] = leg(ph + Math.PI);
        sw = Math.sin(ph); cw = Math.cos(ph);
        legs = {
          legL: [hL, 0, 0.05], kneeL: [kL, 0, 0], footL: [fL, 0, 0], legR: [hR, 0, -0.05], kneeR: [kR, 0, 0], footR: [fR, 0, 0],
          hips: [0.06 * dir, this.style === 'dual' ? -sw * 0.12 - 0.1 : -sw * 0.16, 0],
        };
        pos = [sw * 0.012, -0.045 + Math.abs(cw) * 0.06 * stride, 0];
      }
      const lean = lerp(0.06, 0.2, runK) * dir * s;
      const run = {
        pos,
        hips: [legs.hips[0], legs.hips[1], cw * 0.035],
        spine: [lean, sw * 0.1, -cw * 0.02],
        chest: [0.04 + lean * 0.3, sw * 0.18, 0],
        neck: [0, -sw * 0.08, 0],
        head: [-lean * 1.1, -sw * 0.08, cw * 0.02],
        legL: legs.legL, kneeL: legs.kneeL, footL: legs.footL, legR: legs.legR, kneeR: legs.kneeR, footR: legs.footR,
        // free arm pumps against the legs (elbow bent more when running)
        armL: [sw * lerp(0.55, 0.85, runK) * dir, 0.1, 0.2], elbowL: [-lerp(0.35, 1.2, runK) - Math.max(0, -sw) * 0.4, 0, 0], handL: [0.1, 0, 0],
        // sword arm: arm swept back, blade trailing behind and a little up so it never scrapes the ground
        armR: [...SWORD_RUN.armR], elbowR: SWORD_RUN.elbowR, handR: SWORD_RUN.handR,
      };
      run.armR[0] -= sw * 0.1;
      if (this.gait === 'free') {
        // unarmed walkers swing both arms in opposition to the legs
        run.armR = [-sw * lerp(0.55, 0.85, runK) * dir, -0.1, -0.2]; run.elbowR = [-lerp(0.35, 1.2, runK) - Math.max(0, sw) * 0.4, 0, 0]; run.handR = [0.1, 0, 0];
      } else if (this.style === 'dual') {
        // assassin run: torso leaning in and turned slightly, right blade trailing low behind, left blade held
        // bent in front of the chest, pointing back along the forearm; arms only bob a little with the stride
        run.hips = [legs.hips[0], legs.hips[1], cw * 0.03];
        run.spine = [lean * 1.4, sw * 0.06 + 0.1, -cw * 0.02];
        run.chest = [0.08 + lean * 0.3, sw * 0.1 + 0.1, 0];
        run.head = [-lean * 1.6, -sw * 0.06 - 0.12, 0];
        run.armR = [...DUAL_RUN.armR]; run.armR[0] -= sw * 0.08; run.elbowR = DUAL_RUN.elbowR; run.handR = DUAL_RUN.handR;
        run.armL = [...DUAL_RUN.armL]; run.armL[0] += cw * 0.04; run.elbowL = DUAL_RUN.elbowL; run.handL = DUAL_RUN.handL;
      }
      if (this.runOverride) for (const k of Object.keys(this.runOverride)) if (run[k]) run[k] = this.runOverride[k];
      // foot-planted gaits need the full pose as soon as the character really moves (walkers run at s ~0.36)
      const w = Math.min(1, s * (G ? 3.4 : 1.8));
      for (const k of Object.keys(run)) {
        const a = J[k], b = run[k];
        a[0] += (b[0] - a[0]) * w; a[1] += (b[1] - a[1]) * w; a[2] += (b[2] - a[2]) * w;
      }
      // lean into turns (lean > 0 = turning left), stronger at speed
      const ln = this.lean * s;
      J.hips[2] -= ln * 0.5; J.spine[2] -= ln * 0.35; J.head[2] += ln * 0.3;
    }
    // airborne: tuck the legs while rising, reach down while falling; short squash on landing
    if (this.air > 0.001) {
      const up = clamp(this.airVel / 6, -1, 1);
      const k = this.air;
      const tuck = clamp(0.4 + up * 0.6, 0, 1);
      const air = {
        pos: [0, 0.02, 0], spine: [0.1 - up * 0.15, 0, 0], head: [-0.05 + up * 0.1, 0, 0],
        legL: [-0.95 * tuck - 0.2, 0, 0.08], kneeL: [0.35 + 1.25 * tuck, 0, 0], footL: [0.35 * tuck, 0, 0],
        legR: [0.3 - 0.35 * tuck, 0, -0.08], kneeR: [0.3 + 0.75 * tuck, 0, 0], footR: [0.25, 0, 0],
      };
      for (const key of Object.keys(air)) {
        const a = J[key], b = air[key];
        a[0] += (b[0] - a[0]) * k; a[1] += (b[1] - a[1]) * k; a[2] += (b[2] - a[2]) * k;
      }
    }
    this.finishPose(J, dt);
  }
  // shared tail of both locomotion paths: landing squash, sitting and riding
  finishPose(J, dt) {
    if (this.landT > 0) {
      const b = Math.sin((1 - this.landT / 0.22) * Math.PI) * this.landK;
      J.pos[1] -= 0.07 * b; J.kneeL[0] += 0.45 * b; J.kneeR[0] += 0.45 * b; J.legL[0] -= 0.22 * b; J.legR[0] -= 0.22 * b; J.spine[0] += 0.12 * b;
      J.footL[0] -= 0.2 * b; J.footR[0] -= 0.2 * b;
      this.landT = Math.max(0, this.landT - dt);
    }
    if (this.sit > 0.001) blendPose(J, P_SIT, this.sit, J);
    if (this.ride > 0.001) {
      blendPose(J, P_RIDE, this.ride, J);
      J.spine[0] += Math.sin(this.t * 2.1) * 0.012 * this.ride;
    }
  }
  // controller hooks: airborne state / landing impact
  setAirborne(on, velY = 0) {
    if (this.inAir && !on) { this.landT = 0.22; this.landK = clamp(-this.airVel / 7, 0.3, 1); }
    this.inAir = on;
    this.airVel = velY;
  }

  update(dt, rootWorldPos) {
    this.t += dt;
    this.battle += (this.battleTarget - this.battle) * (1 - Math.exp(-6 * dt));
    this.sit += (this.sitTarget - this.sit) * (1 - Math.exp(-5 * dt));
    this.ride += (this.rideTarget - this.ride) * (1 - Math.exp(-12 * dt));
    this.air += ((this.inAir ? 1 : 0) - this.air) * (1 - Math.exp(-(this.inAir ? 12 : 20) * dt));
    if (this.mocap) this.mocapLocomotion(dt); else this.locomotion(dt);

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
    if (this.rig.afterPose) this.rig.afterPose(); // skinned rigs retarget the joint pose onto their bones

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

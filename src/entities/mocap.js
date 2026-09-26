// Motion clips from the Universal Animation Library (Quaternius, CC0 — public/anims), retargeted onto the
// humanoid proxy joints the Animator drives. For every sampled source frame a mapped bone's world rotation is
// expressed relative to its rest frame, straightened the same way skinnedRig.js straightens the target model's
// limbs (segment pointing down). That is exactly the inverse of skinnedRig's afterPose, so the result plays on
// any rig with a proxy mapping: the limbs point the same way as in the source, whatever the rest pose was.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Clip, CLIPS } from './anim.js';
import { JOINTS } from './humanoid.js';

const BASE = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '/';
const URL = BASE + 'anims/AnimationLibrary_Godot_Standard.gltf';
const FPS = 30;

// proxy joint -> source bone (names as the GLTFLoader sanitises them: dots dropped)
const MAP = {
  hips: 'DEF-hips', spine: 'DEF-spine001', chest: 'DEF-spine003', neck: 'DEF-neck', head: 'DEF-head',
  armL: 'DEF-upper_armL', elbowL: 'DEF-forearmL', handL: 'DEF-handL',
  armR: 'DEF-upper_armR', elbowR: 'DEF-forearmR', handR: 'DEF-handR',
  legL: 'DEF-thighL', kneeL: 'DEF-shinL', footL: 'DEF-footL',
  legR: 'DEF-thighR', kneeR: 'DEF-shinR', footR: 'DEF-footR',
};
// limb segments straightened in the proxy zero pose (the same joints skinnedRig straightens)
const SEG_END = {
  armL: 'DEF-forearmL', elbowL: 'DEF-handL', handL: 'DEF-f_middle01L',
  armR: 'DEF-forearmR', elbowR: 'DEF-handR', handR: 'DEF-f_middle01R',
  legL: 'DEF-shinL', kneeL: 'DEF-footL', legR: 'DEF-shinR', kneeR: 'DEF-footR',
};
// torso segments straightened to point up (must match the target's segmentUp joints, see playerModel.js)
const SEG_UP = { hips: 'DEF-spine001', spine: 'DEF-spine002', chest: 'DEF-neck', neck: 'DEF-head' };
const PARENT = {
  spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck',
  armL: 'chest', elbowL: 'armL', handL: 'elbowL', armR: 'chest', elbowR: 'armR', handR: 'elbowR',
  legL: 'hips', kneeL: 'legL', footL: 'kneeL', legR: 'hips', kneeR: 'legR', footR: 'kneeR',
};

// One rotation has two YXZ Euler triples: (x, y, z) and (PI - x, y + PI, z + PI). The decomposition picks between
// them by itself (it flips where a limb swings past 90°, e.g. a thigh lifted high in the jog), and interpolating
// between keys - or blending the walk into the jog - across such a flip twists the limb through nonsense poses.
// Keys therefore keep the triple that is closest to the previous key (unwrapped by whole turns), starting from
// the one with the smaller twist (|y| + |z|).
const TWO_PI = Math.PI * 2;
const HINGE = new Set(['kneeL', 'kneeR', 'elbowL', 'elbowR']);
const wrapNear = (v, ref) => { while (v - ref > Math.PI) v -= TWO_PI; while (v - ref < -Math.PI) v += TWO_PI; return v; };
function steadyEuler(x, y, z, prev) {
  const a = [x, y, z], b = [Math.PI - x, y + Math.PI, z + Math.PI];
  if (!prev) {
    for (const r of [a, b]) for (let k = 0; k < 3; k++) r[k] = wrapNear(r[k], 0);
    return Math.abs(a[1]) + Math.abs(a[2]) <= Math.abs(b[1]) + Math.abs(b[2]) ? a : b;
  }
  let da = 0, db = 0;
  for (let k = 0; k < 3; k++) {
    a[k] = wrapNear(a[k], prev[k]); b[k] = wrapNear(b[k], prev[k]);
    da += Math.abs(a[k] - prev[k]); db += Math.abs(b[k] - prev[k]);
  }
  return da <= db ? a : b;
}

let library = null;
let loading = null;
export function mocapReady() { return !!library; }
export function getMocap() { return library; }

// loads and bakes every clip of the library into Animator clips: { name: Clip } plus meta (natural speeds)
export function preloadMocap() {
  if (library) return Promise.resolve(library);
  if (!loading) loading = new GLTFLoader().loadAsync(URL).then((gltf) => (library = bakeLibrary(gltf)));
  return loading;
}

function bakeLibrary(gltf) {
  const scene = gltf.scene;
  const bones = {};
  scene.traverse((o) => { if (o.isBone || o.name.startsWith('DEF-')) bones[o.name] = o; });
  const wq = (b, out = new THREE.Quaternion()) => b.getWorldQuaternion(out);
  const wp = (b, out = new THREE.Vector3()) => b.getWorldPosition(out);
  const mixer = new THREE.AnimationMixer(scene);
  // reference pose: the library's T-pose clip (the node rest state of the file is not a clean upright pose)
  const tpose = gltf.animations.find((a) => a.name === 'A_TPose');
  const tposeAction = tpose ? mixer.clipAction(tpose) : null;
  if (tposeAction) { tposeAction.play(); mixer.setTime(0); }
  scene.updateMatrixWorld(true);

  // rest frames (straightened limbs) of the source
  const down = new THREE.Vector3(0, -1, 0), up = new THREE.Vector3(0, 1, 0);
  const offsetInv = {};
  for (const [joint, name] of Object.entries(MAP)) {
    const b = bones[name];
    const c = new THREE.Quaternion();
    if (SEG_END[joint] && bones[SEG_END[joint]]) c.setFromUnitVectors(wp(bones[SEG_END[joint]]).sub(wp(b)).normalize(), down);
    else if (SEG_UP[joint] && bones[SEG_UP[joint]]) c.setFromUnitVectors(wp(bones[SEG_UP[joint]]).sub(wp(b)).normalize(), up);
    offsetInv[joint] = c.multiply(wq(b)).invert();
  }
  const hipsRest = wp(bones[MAP.hips]);
  const legLen = wp(bones[MAP.legL]).distanceTo(wp(bones[MAP.kneeL])) + wp(bones[MAP.kneeL]).distanceTo(wp(bones[MAP.footL]));
  const posScale = 0.64 / hipsRest.y;     // Animator pos units (see Animator.update: pos * hipY / 0.64)
  if (tposeAction) tposeAction.stop();     // (stopping restores the file's node state)

  const qW = {}; for (const j of JOINTS) qW[j] = new THREE.Quaternion();
  const loc = new THREE.Quaternion(), eul = new THREE.Euler(0, 0, 0, 'YXZ'), inv = new THREE.Quaternion();
  const clips = {};
  const meta = {};
  for (const anim of gltf.animations) {
    const action = mixer.clipAction(anim);
    action.play();
    const n = Math.max(2, Math.round(anim.duration * FPS) + 1);
    const keys = [];
    let prev = null;
    let footSpeed = 0, minFootY = Infinity;
    // (the mixer repeats clips: sampling exactly at the end would wrap one-shot clips back to their first frame,
    // e.g. a death clip standing up again in its last key)
    const loops = /_Loop$/.test(anim.name);
    for (let i = 0; i < n; i++) {
      const t = Math.min(anim.duration, (i / (n - 1)) * anim.duration);
      mixer.setTime(loops ? t : Math.min(t, anim.duration - 1e-4));
      scene.updateMatrixWorld(true);
      const key = { t, e: 'linear' };
      for (const [joint, name] of Object.entries(MAP)) qW[joint].multiplyQuaternions(wq(bones[name]), offsetInv[joint]);
      for (const joint of JOINTS) {
        if (!MAP[joint]) continue;
        const p = PARENT[joint];
        if (p) loc.multiplyQuaternions(inv.copy(qW[p]).invert(), qW[joint]); else loc.copy(qW[joint]);
        if (HINGE.has(joint)) {
          // knees and elbows only bend: keep the bend about the joint's x axis (the twist part of the rotation);
          // around a 90° bend the full Euler triple has two large angles cancelling each other, which blending
          // with other poses turns into a twisted limb
          const bend = 2 * Math.atan2(loc.x, loc.w);
          key[joint] = [prev ? wrapNear(bend, prev[joint][0]) : wrapNear(bend, 0), 0, 0];
          continue;
        }
        eul.setFromQuaternion(loc, 'YXZ');
        key[joint] = steadyEuler(eul.x, eul.y, eul.z, prev && prev[joint]);
      }
      const hp = wp(bones[MAP.hips]).sub(hipsRest).multiplyScalar(posScale);
      key.pos = [hp.x, hp.y, hp.z];
      key.root = [0, 0, 0];
      keys.push(key);
      prev = key;
      minFootY = Math.min(minFootY, wp(bones[MAP.footL]).y);
    }
    // locomotion loops: natural ground speed (how fast the planted foot slides back relative to the hips) and
    // the cycle position where the left foot reaches furthest forward (to phase-lock blended gaits)
    let contact = 0;
    if (/_Loop$/.test(anim.name) && /Walk|Jog|Sprint|Crouch_Fwd/.test(anim.name)) {
      let prevZ = null, prevY = null, dist = 0, time = 0, maxZ = -Infinity;
      for (let i = 0; i < n; i++) {
        const t = Math.min(anim.duration, (i / (n - 1)) * anim.duration);
        mixer.setTime(t); scene.updateMatrixWorld(true);
        const fp = wp(bones[MAP.footL]), z = fp.z - wp(bones[MAP.hips]).z;
        if (prevZ !== null && fp.y < minFootY + 0.04 && prevY < minFootY + 0.04 && prevZ > z) { dist += prevZ - z; time += anim.duration / (n - 1); }
        if (z > maxZ) { maxZ = z; contact = t / anim.duration; }
        prevZ = z; prevY = fp.y;
      }
      footSpeed = time > 0 ? dist / time : 0;
    }
    action.stop();
    mixer.uncacheAction(anim);
    clips[anim.name] = new Clip('mc_' + anim.name, { duration: anim.duration, loop: /_Loop$/.test(anim.name), keys, slerp: true });
    CLIPS['mc_' + anim.name] = clips[anim.name];     // playable by name: anim.play('mc_Jump_Start')
    // natural speed in "leg lengths per second" so it scales to any character
    meta[anim.name] = { duration: anim.duration, speedLeg: footSpeed / legLen, contact };
  }
  deriveCombatClips(clips);
  return { clips, meta, legLen };
}

// ------------------------------------------------------------------ derived combat clips
const SIDE_SWAP = { armL: 'armR', elbowL: 'elbowR', handL: 'handR', legL: 'legR', kneeL: 'kneeR', footL: 'footR' };
for (const [a, b] of Object.entries(SIDE_SWAP)) SIDE_SWAP[b] = a;

// left/right mirrored copy of a set of keys (the proxy zero pose is symmetric: mirroring across the YZ plane
// keeps the X rotation and negates Y / Z; sides swap)
function mirrorKeys(keys) {
  return keys.map((k) => {
    const o = { t: k.t, e: k.e };
    for (const ch of [...JOINTS, 'pos', 'root']) {
      const src = k[SIDE_SWAP[ch] || ch];
      if (!src) continue;
      o[ch] = ch === 'pos' || ch === 'root' ? [-src[0], src[1], src[2]] : [src[0], -src[1], -src[2]];
    }
    return o;
  });
}
// a trimmed / sped-up / optionally mirrored section of a baked clip, with events and fixed hand rotations
function derive(name, src, { from = 0, to = src.duration, speed = 1, mirror = false, hands = null, events = [], sword = null }) {
  let keys = src.keys.filter((k) => k.t >= from - 1e-6 && k.t <= to + 1e-6).map((k) => {
    const o = { ...k, t: (k.t - from) / speed, e: 'linear' };
    if (hands) for (const [ch, r] of Object.entries(hands)) o[ch] = r;
    return o;
  });
  if (mirror) keys = mirrorKeys(keys);
  const clip = new Clip(name, { duration: (to - from) / speed, keys, events, sword, slerp: true });
  CLIPS[name] = clip;
  return clip;
}

// dual-blade combo from real motion: left stab, right stab, big right slash, big left slash (mirrored).
// For the stabs the wrists are turned so the blades extend the forearms.
function deriveCombatClips(clips) {
  const stab = { handL: [1.45, 0, 0], handR: [1.45, 0, 0] };
  if (clips.Punch_Jab) derive('mc_dual_1', clips.Punch_Jab, { from: 0.05, to: 0.7, speed: 1.25, hands: stab, events: [{ t: 0.17, name: 'hit' }], sword: [0.08, 0.28] });
  if (clips.Punch_Cross) derive('mc_dual_2', clips.Punch_Cross, { from: 0.05, to: 0.85, speed: 1.25, hands: stab, events: [{ t: 0.22, name: 'hit' }], sword: [0.1, 0.34] });
  if (clips.Sword_Attack) {
    derive('mc_dual_3', clips.Sword_Attack, { from: 0.3, to: 1.3, speed: 1.45, events: [{ t: 0.27, name: 'hit' }], sword: [0.12, 0.42] });
    derive('mc_dual_4', clips.Sword_Attack, { from: 0.3, to: 1.3, speed: 1.4, mirror: true, events: [{ t: 0.28, name: 'hit' }], sword: [0.12, 0.44] });
  }
}

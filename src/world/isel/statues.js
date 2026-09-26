// Tower of Isel — stone statues of heroes: the player model is posed with a frame of the motion library and baked
// into plain static geometry (one unit per pose, merged into the batcher with a stone material). Also returns where
// the hands ended up, so a statue can hold a burning torch or a glowing orb.
import * as THREE from 'three';
import { preloadPlayerModel, createPlayerRig } from '../../entities/playerModel.js';
import { preloadMocap } from '../../entities/mocap.js';
import { JOINTS } from '../../entities/humanoid.js';
import { emptyPose } from '../../entities/anim.js';

// pose -> motion clip and the moment (0..1 of the clip) that is carved in stone
// (joint overrides are [rx, ry, rz] of the Animator's proxy joints, see anim.js)
export const STATUE_POSES = {
  guard: { clip: 'Sword_Idle', t: 0.35, weapon: true },
  strike: { clip: 'Sword_Attack', t: 0.42, weapon: true },
  vigil: { clip: 'Idle_Loop', t: 0.3, weapon: true, over: { armR: [-0.4, 0.2, 0.45], elbowR: [-1.0, 0, 0], handR: [1.5, 0.3, 0.2], armL: [-0.5, 0.3, -0.3], elbowL: [-1.2, 0, 0], handL: [0, 0, -0.5] } },
  salute: { clip: 'Idle_Loop', t: 0.3, weapon: true, over: { armR: [-2.7, 0, -0.15], elbowR: [-0.3, 0, 0], handR: [0.6, 0, 0] } },
  torch: { clip: 'Idle_Loop', t: 0.3, over: { armL: [-2.6, 0, 0.2], elbowL: [-0.4, 0, 0] } },
  mage: { clip: 'Spell_Simple_Idle_Loop', t: 0.3 },
  invoke: { clip: 'Idle_Loop', t: 0.3, over: { armL: [-2.5, 0, 0.35], elbowL: [-0.3, 0, 0], armR: [-2.5, 0, -0.35], elbowR: [-0.3, 0, 0] } },
};

const cache = new Map();
const _v = new THREE.Vector3();

// { unit: {pos, nor, uv, n} (feet at y = 0, facing +z), hands: {L, R} (Vector3, same frame), height } or null
export async function statueUnit(key) {
  if (cache.has(key)) return cache.get(key);
  let out = null;
  try { out = await bakePose(STATUE_POSES[key]); } catch (e) { console.warn('statue', key, e); }
  cache.set(key, out);
  return out;
}

export async function bakePose(P) {
  await preloadPlayerModel();
  const lib = await preloadMocap();
  const clip = lib.clips[P.clip];
  return clip ? bake(clip, P) : null;
}

function bake(clip, P) {
  const rig = createPlayerRig({ weapon: P.weapon ? 'sword' : null, swordStyle: 'broad' });
  const pose = emptyPose();
  clip.sample(P.t * clip.duration, pose);
  // hand-set joints on top of the clip frame (a raised sword, a lifted torch ...)
  if (P.over) for (const [j, r] of Object.entries(P.over)) pose[j] = r;
  for (const j of JOINTS) rig.joints[j].rotation.set(pose[j][0], pose[j][1], pose[j][2], 'YXZ');
  const ks = rig.hipY / 0.64;
  rig.joints.hips.position.set(pose.pos[0] * ks, rig.hipY + pose.pos[1] * ks, pose.pos[2] * ks);
  rig.afterPose();
  rig.root.updateMatrixWorld(true);

  const pos = [], nor = [];
  let minY = Infinity, maxY = -Infinity;       // of the body (a sword tip may reach below the feet)
  rig.root.traverse((o) => {
    if (!o.isMesh || !o.visible || !o.geometry.attributes.position) return;
    // skin every vertex of the indexed mesh, recompute smooth normals, then unroll the triangles
    const src = o.geometry;
    const g = new THREE.BufferGeometry();
    const S = src.attributes.position, n = S.count, arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      _v.fromBufferAttribute(S, i);
      if (o.isSkinnedMesh) o.applyBoneTransform(i, _v);
      _v.applyMatrix4(o.matrixWorld);
      arr[i * 3] = _v.x; arr[i * 3 + 1] = _v.y; arr[i * 3 + 2] = _v.z;
      if (o.isSkinnedMesh) { minY = Math.min(minY, _v.y); maxY = Math.max(maxY, _v.y); }
    }
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    if (src.index) g.setIndex(src.index);
    // weld by position so the seams of the UV islands do not show up as creases
    const welded = weldNormals(g);
    const flat = welded.index ? welded.toNonIndexed() : welded;
    pos.push(flat.attributes.position.array);
    nor.push(flat.attributes.normal.array);
  });
  let total = 0;
  for (const a of pos) total += a.length;
  const P3 = new Float32Array(total), N3 = new Float32Array(total);
  let o = 0;
  for (let i = 0; i < pos.length; i++) { P3.set(pos[i], o); N3.set(nor[i], o); o += pos[i].length; }
  // stand on y = 0
  for (let i = 1; i < total; i += 3) P3[i] -= minY;
  const hand = (h) => { const w = new THREE.Vector3(); if (h) { h.getWorldPosition(w); w.y -= minY; } return w; };
  return {
    unit: { pos: P3, nor: N3, uv: null, n: total / 3 },
    hands: { R: hand(rig.weaponHolder), L: hand(rig.weaponHolderL) },
    height: maxY - minY,
  };
}

// smooth normals shared by every vertex at the same position
function weldNormals(g) {
  const P = g.attributes.position, n = P.count;
  const idx = g.index ? g.index.array : null;
  const tris = idx ? idx.length / 3 : n / 3;
  const key = (i) => `${Math.round(P.getX(i) * 2000)},${Math.round(P.getY(i) * 2000)},${Math.round(P.getZ(i) * 2000)}`;
  const id = new Int32Array(n), map = new Map();
  for (let i = 0; i < n; i++) { const k = key(i); let v = map.get(k); if (v === undefined) { v = map.size; map.set(k, v); } id[i] = v; }
  const acc = new Float32Array(map.size * 3);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  for (let t = 0; t < tris; t++) {
    const i0 = idx ? idx[t * 3] : t * 3, i1 = idx ? idx[t * 3 + 1] : t * 3 + 1, i2 = idx ? idx[t * 3 + 2] : t * 3 + 2;
    a.fromBufferAttribute(P, i0); b.fromBufferAttribute(P, i1); c.fromBufferAttribute(P, i2);
    e1.subVectors(b, a); e2.subVectors(c, a); e1.cross(e2);     // area weighted
    for (const i of [i0, i1, i2]) { const k = id[i] * 3; acc[k] += e1.x; acc[k + 1] += e1.y; acc[k + 2] += e1.z; }
  }
  const N = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const k = id[i] * 3, l = Math.hypot(acc[k], acc[k + 1], acc[k + 2]) || 1;
    N[i * 3] = acc[k] / l; N[i * 3 + 1] = acc[k + 1] / l; N[i * 3 + 2] = acc[k + 2] / l;
  }
  g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  return g;
}

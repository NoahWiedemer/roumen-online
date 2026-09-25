// Skinned humanoids from GLB files (auto-rigged meshes without animation clips) driven by the procedural
// Animator. The Animator poses an invisible proxy of the humanoid joint tree (same joints, identity rest
// orientations, limbs hanging straight down). After every pose the proxy rotations are retargeted onto the
// skeleton: a mapped bone gets proxyWorld * correction * bindWorld, where the correction turns the model's
// (A-)pose limb segments into the proxy's arms-down zero pose. Unmapped bones (clavicles, extra spine links,
// fingers, toes, cloth flaps) keep their bind-local rotation and simply follow their parent.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { JOINTS, buildSword, makeMats } from './humanoid.js';

const JOINT_PARENT = {
  spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck',
  armL: 'chest', elbowL: 'armL', handL: 'elbowL', armR: 'chest', elbowR: 'armR', handR: 'elbowR',
  legL: 'hips', kneeL: 'legL', footL: 'kneeL', legR: 'hips', kneeR: 'legR', footR: 'kneeR',
};
const IDENT = new THREE.Quaternion();

// spec: { url, boneMap: {joint: boneName}, segmentEnd: {joint: boneName}, rootBone, recenter?, material?(mat) }
export async function loadSkinnedTemplate(spec) {
  const gltf = await new GLTFLoader().loadAsync(spec.url);
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);
  let skinned = null;
  scene.traverse((o) => { if (o.isSkinnedMesh && !skinned) skinned = o; });
  if (!skinned) throw new Error(`${spec.url}: no skinned mesh`);
  const rest = {};
  scene.traverse((o) => {
    if (!o.isBone) return;
    rest[o.name] = { q: o.getWorldQuaternion(new THREE.Quaternion()), p: o.getWorldPosition(new THREE.Vector3()), pos: o.position.clone() };
  });
  for (const b of [...Object.values(spec.boneMap), spec.rootBone]) if (!rest[b]) throw new Error(`${spec.url}: bone ${b} missing`);
  const down = new THREE.Vector3(0, -1, 0);
  const offset = {};
  for (const [joint, bone] of Object.entries(spec.boneMap)) {
    const c = new THREE.Quaternion();
    const end = spec.segmentEnd[joint];
    if (end) c.setFromUnitVectors(rest[end].p.clone().sub(rest[bone].p).normalize(), down);
    offset[joint] = c.multiply(rest[bone].q);
  }
  if (spec.material) spec.material(skinned.material);
  // optional: move the model so the root bone stands on the origin (models are not always centred)
  const shift = spec.recenter ? new THREE.Vector3(-rest[spec.rootBone].p.x, 0, -rest[spec.rootBone].p.z) : new THREE.Vector3();
  const box = new THREE.Box3().setFromObject(skinned);
  return { spec, scene, rest, offset, shift, hipY: rest[spec.rootBone].p.y, height: box.max.y - box.min.y };
}

export function createSkinnedRig(T, look = {}, extra = {}) {
  const { boneMap, rootBone } = T.spec;
  const root = new THREE.Group();
  root.name = look.name || 'skinned';
  const scale = extra.scale || 1;           // uniform size factor (e.g. NPCs a few heads taller than the player)
  root.scale.setScalar(scale);
  const body = new THREE.Group();
  root.add(body);
  const model = SkeletonUtils.clone(T.scene);
  model.position.copy(T.shift);
  body.add(model);
  const bones = {};
  let skinned = null;
  model.traverse((o) => {
    if (o.isBone) bones[o.name] = o;
    if (o.isSkinnedMesh) { skinned = o; o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false; }
  });
  const order = [];
  (function walk(b) { order.push(b); for (const c of b.children) if (c.isBone) walk(c); })(bones[rootBone]);
  const jointOf = new Map(Object.entries(boneMap).map(([j, b]) => [bones[b], j]));

  // invisible proxy joints posed by the Animator (only rotations + the hips offset are read)
  const J = {};
  for (const name of JOINTS) {
    J[name] = new THREE.Group();
    J[name].name = name;
    if (JOINT_PARENT[name]) J[JOINT_PARENT[name]].add(J[name]);
  }

  // weapon holders in both fists: a frame under each hand bone carries the proxy hand orientation, so a weapon
  // placed in the holder sits exactly like on the procedural rig (grip at the origin, blade along local +Y)
  const mats = makeMats(look);
  const holder = (side) => {
    const bone = bones[boneMap['hand' + side]];
    if (!bone) return null;
    const handFrame = new THREE.Group();
    handFrame.quaternion.copy(T.offset['hand' + side]).invert();
    bone.add(handFrame);
    const h = new THREE.Group();
    h.position.set(0, -(extra.gripDrop ?? 0.075), 0);
    h.rotation.x = Math.PI / 2;
    handFrame.add(h);
    return h;
  };
  const weaponHolder = holder('R'), weaponHolderL = holder('L');
  let weapon = null;
  if (look.weapon === 'sword' && weaponHolder) {
    weapon = buildSword(mats, look.swordStyle || 'broad');
    weaponHolder.add(weapon);
  }

  const hipY = T.hipY;
  const qW = {};
  for (const name of JOINTS) qW[name] = new THREE.Quaternion();
  const charQ = new Map(order.map((b) => [b, new THREE.Quaternion()]));
  const rootRest = T.rest[rootBone].pos;

  function afterPose() {
    for (const name of JOINTS) {
      const p = JOINT_PARENT[name];
      if (p) qW[name].multiplyQuaternions(qW[p], J[name].quaternion); else qW[name].copy(J[name].quaternion);
    }
    for (const b of order) {
      const q = charQ.get(b);
      const pq = b.parent && b.parent.isBone ? charQ.get(b.parent) : IDENT;
      const j = jointOf.get(b);
      if (j) { q.multiplyQuaternions(qW[j], T.offset[j]); b.quaternion.copy(pq).invert().multiply(q); }
      else q.multiplyQuaternions(pq, b.quaternion);
    }
    const hp = J.hips.position;
    bones[rootBone].position.set(rootRest.x + hp.x, rootRest.y + hp.y - hipY, rootRest.z + hp.z);
  }
  J.hips.position.set(0, hipY, 0);
  afterPose();

  return {
    root, body, joints: J, mats, weapon, weaponHolder, weaponHolderL, skinned, bones,
    tails: [], flaps: [], setExpression() {}, afterPose,
    hipY, height: T.height * scale, headRadius: 0.16 * scale, scale,
    portraitY: (extra.portraitY ?? T.height * 0.88) * scale, portraitDist: (extra.portraitDist ?? 0.72) * scale,
  };
}

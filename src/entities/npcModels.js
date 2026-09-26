// Skinned NPC models (auto-rigged GLBs without clips, retargeted by skinnedRig.js):
//   ratman    — Sir Ratman, the rat knight wandering in the Forest of Mist (pickaxe is part of the mesh)
//   robo      — Robo, King of Beasts, a werewolf at the foot of Cyclone Hill (his twin blades are part of the mesh)
//   ratprince — Prince Ratman, Sir Ratman's son (Vagel's hostage in the Tower of Isel)
// They are drawn a few heads taller than the player via `scale`.
import { loadSkinnedTemplate, createSkinnedRig } from './skinnedRig.js';

const BASE = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '/';

const SPECS = {
  // faces +Z, left side +X; Bone_002..005 are the loincloth flaps
  ratman: {
    url: BASE + 'models/ratman.glb', rootBone: 'Bone_000', recenter: true, scale: 1.35, portraitY: 1.52, portraitDist: 0.8,
    boneMap: {
      hips: 'Bone_001', spine: 'Bone_009', chest: 'Bone_007', neck: 'Bone_022', head: 'Bone_021',
      armL: 'Bone_026', elbowL: 'Bone_025', handL: 'Bone_024',
      armR: 'Bone_031', elbowR: 'Bone_030', handR: 'Bone_029',
      legL: 'Bone_014', kneeL: 'Bone_013', footL: 'Bone_012',
      legR: 'Bone_019', kneeR: 'Bone_018', footR: 'Bone_017',
    },
    segmentEnd: {
      armL: 'Bone_025', elbowL: 'Bone_024', handL: 'Bone_023', armR: 'Bone_030', elbowR: 'Bone_029', handR: 'Bone_028',
      legL: 'Bone_013', kneeL: 'Bone_012', legR: 'Bone_018', kneeR: 'Bone_017',
    },
    material(mat) {
      mat.metalnessMap = null; mat.metalness = 0.05; mat.roughness = 0.72;
      if (mat.emissiveMap) mat.emissiveIntensity = 0.35;   // Meshy bakes a faint glow map; keep it subtle
      mat.needsUpdate = true;
    },
  },
  // faces +Z, left side +X; long werewolf arms (shoulder -> elbow -> claw tip), Bone_002/003 are the tail
  robo: {
    url: BASE + 'models/robo.glb', rootBone: 'Bone_000', recenter: true, scale: 1.5, portraitY: 1.5, portraitDist: 0.85,
    boneMap: {
      hips: 'Bone_001', spine: 'Bone_007', chest: 'Bone_005', neck: 'Bone_020', head: 'Bone_019',
      armL: 'Bone_029', elbowL: 'Bone_027',
      armR: 'Bone_024', elbowR: 'Bone_022',
      legL: 'Bone_017', kneeL: 'Bone_016', footL: 'Bone_015',
      legR: 'Bone_012', kneeR: 'Bone_011', footR: 'Bone_010',
    },
    segmentEnd: {
      armL: 'Bone_027', elbowL: 'Bone_026', armR: 'Bone_022', elbowR: 'Bone_021',
      legL: 'Bone_016', kneeL: 'Bone_015', legR: 'Bone_011', kneeR: 'Bone_010',
    },
    material(mat) {
      mat.metalnessMap = null; mat.metalness = 0.05; mat.roughness = 0.7;
      mat.needsUpdate = true;
    },
  },
  // the rat-man monster (hatchet in the right hand is part of the mesh); delivered in a crouched stride pose,
  // so skinnedRig straightens the limbs and re-grounds the feet. Bone_002..004 are the front loincloth.
  ratman_mob: {
    url: BASE + 'models/ratman_mob.glb', rootBone: 'Bone_000', recenter: true, scale: 1, portraitY: 1.5, portraitDist: 0.8,
    boneMap: {
      hips: 'Bone_001', spine: 'Bone_007', chest: 'Bone_006', neck: 'Bone_020', head: 'Bone_019',
      armL: 'Bone_025', elbowL: 'Bone_024', handL: 'Bone_023',
      armR: 'Bone_030', elbowR: 'Bone_029', handR: 'Bone_028',
      legL: 'Bone_018', kneeL: 'Bone_017', footL: 'Bone_016',
      legR: 'Bone_013', kneeR: 'Bone_012', footR: 'Bone_011',
    },
    segmentEnd: {
      armL: 'Bone_024', elbowL: 'Bone_023', handL: 'Bone_022', armR: 'Bone_029', elbowR: 'Bone_028', handR: 'Bone_027',
      legL: 'Bone_017', kneeL: 'Bone_016', legR: 'Bone_012', kneeR: 'Bone_011',
    },
    material(mat) {
      mat.metalnessMap = null; mat.metalness = 0.05; mat.roughness = 0.75;
      mat.needsUpdate = true;
    },
  },
  // the Hammer Boar monster (user's Eber.glb, white spiky fur): hunched boar-man with digitigrade legs
  // (hip -> knee -> hock -> toe); Bone_023 / Bone_028 are the clavicles, the fingers stay unmapped
  eber: {
    url: BASE + 'models/eber.glb', rootBone: 'Bone_000', recenter: true, scale: 1.45, portraitY: 1.45, portraitDist: 0.95,
    boneMap: {
      hips: 'Bone_001', spine: 'Bone_006', chest: 'Bone_004', neck: 'Bone_003', head: 'Bone_018',
      armL: 'Bone_022', elbowL: 'Bone_021', handL: 'Bone_020',
      armR: 'Bone_027', elbowR: 'Bone_026', handR: 'Bone_025',
      legL: 'Bone_016', kneeL: 'Bone_015', footL: 'Bone_014',
      legR: 'Bone_011', kneeR: 'Bone_010', footR: 'Bone_009',
    },
    segmentEnd: {
      armL: 'Bone_021', elbowL: 'Bone_020', handL: 'Bone_019', armR: 'Bone_026', elbowR: 'Bone_025', handR: 'Bone_024',
      legL: 'Bone_015', kneeL: 'Bone_014', legR: 'Bone_010', kneeR: 'Bone_009',
    },
    material(mat) {
      mat.metalnessMap = null; mat.metalness = 0; mat.roughness = 0.85;
      mat.needsUpdate = true;
    },
  },
  // Vagel, Goddess of Greed — the last boss of the Tower of Isel (user's Vagel.glb): a hooded sorceress in a long,
  // gold-trimmed cloak. Bone_027 is the elbow (Bone_037 the forearm, Bone_034/033 the hanging sleeve), Bone_036 /
  // Bone_041 the wrists; the cloak tails (Bone_013..010 at the back, Bone_005/004 in front) stay unmapped. A goddess:
  // drawn about twice the hero's height (she has to fill the throne of the Throne Room).
  vagel: {
    url: BASE + 'models/vagel.glb', rootBone: 'Bone_000', recenter: true, scale: 2.1, portraitY: 1.5, portraitDist: 0.8,
    boneMap: {
      hips: 'Bone_001', spine: 'Bone_009', chest: 'Bone_007', neck: 'Bone_026', head: 'Bone_025',
      armL: 'Bone_028', elbowL: 'Bone_027', handL: 'Bone_036',
      armR: 'Bone_031', elbowR: 'Bone_030', handR: 'Bone_041',
      legL: 'Bone_023', kneeL: 'Bone_022', footL: 'Bone_021',
      legR: 'Bone_018', kneeR: 'Bone_017', footR: 'Bone_016',
    },
    segmentEnd: {
      armL: 'Bone_027', elbowL: 'Bone_036', handL: 'Bone_049', armR: 'Bone_030', elbowR: 'Bone_041', handR: 'Bone_061',
      legL: 'Bone_022', kneeL: 'Bone_021', legR: 'Bone_017', kneeR: 'Bone_016',
    },
    segmentUp: { hips: 'Bone_009', spine: 'Bone_008', chest: 'Bone_006', neck: 'Bone_025' },
    material(mat) {
      // the gold trim keeps its metal map (it shines with the environment reflection set by the boss model)
      mat.roughness = 0.7;
      mat.needsUpdate = true;
    },
  },
  // Prince Ratman, Sir Ratman's son (user's Meshy "Rat Prince", a Mixamo-style biped rig; the clips it came with
  // are dropped, the joint names lost their "mixamorig:" prefix). Faces +Z, left side +X, arms in an A-pose
  ratprince: {
    url: BASE + 'models/ratprince.glb', rootBone: 'Hips', recenter: true, scale: 1.2, portraitY: 1.5, portraitDist: 0.8,
    boneMap: {
      hips: 'Hips', spine: 'Spine', chest: 'Spine2', neck: 'Neck', head: 'Head',
      armL: 'LeftArm', elbowL: 'LeftForeArm', handL: 'LeftHand',
      armR: 'RightArm', elbowR: 'RightForeArm', handR: 'RightHand',
      legL: 'LeftUpLeg', kneeL: 'LeftLeg', footL: 'LeftFoot',
      legR: 'RightUpLeg', kneeR: 'RightLeg', footR: 'RightFoot',
    },
    segmentEnd: {
      armL: 'LeftForeArm', elbowL: 'LeftHand', handL: 'LeftHandMiddle4', armR: 'RightForeArm', elbowR: 'RightHand', handR: 'RightHandMiddle4',
      legL: 'LeftLeg', kneeL: 'LeftFoot', legR: 'RightLeg', kneeR: 'RightFoot',
    },
    segmentUp: { hips: 'Spine', spine: 'Spine1', chest: 'Neck', neck: 'Head' },
    material(mat) {
      mat.roughness = 0.75;
      mat.needsUpdate = true;
    },
  },
};

const templates = {};
const loading = {};

export function npcModelReady(id) { return !!templates[id]; }
export function preloadNpcModel(id) {
  if (templates[id]) return Promise.resolve(templates[id]);
  if (!loading[id]) loading[id] = loadSkinnedTemplate(SPECS[id]).then((t) => (templates[id] = t));
  return loading[id];
}
export function preloadNpcModels(ids = Object.keys(SPECS)) { return Promise.all(ids.map((id) => preloadNpcModel(id))); }

export function createNpcRig(id, look = {}) {
  const T = templates[id], S = SPECS[id];
  if (!T) throw new Error(`NPC model "${id}" not loaded — await preloadNpcModel() first`);
  return createSkinnedRig(T, { ...look, weapon: null }, { scale: look.scale ?? S.scale, portraitY: S.portraitY, portraitDist: S.portraitDist });
}

// Sir Ratman (quest giver in the Forest of Mist) from /models/ratman.glb (auto-rigged with UniRig, no clips),
// retargeted by skinnedRig.js. The pickaxe is part of the mesh and follows the right hand.
import { loadSkinnedTemplate, createSkinnedRig } from './skinnedRig.js';

const BASE = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '/';

// humanoid joint -> bone in ratman.glb (faces +Z, left side +X; Bone_002..005 are the loincloth flaps)
const SPEC = {
  url: BASE + 'models/ratman.glb',
  rootBone: 'Bone_000',
  recenter: true,
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
    mat.metalnessMap = null; mat.metalness = 0.05;
    mat.roughness = 0.72;
    if (mat.emissiveMap) mat.emissiveIntensity = 0.35;   // Meshy bakes a faint glow map; keep it subtle
    mat.needsUpdate = true;
  },
};

let template = null;
let loading = null;

export function ratmanModelReady() { return !!template; }
export function preloadRatmanModel() {
  if (template) return Promise.resolve(template);
  if (!loading) loading = loadSkinnedTemplate(SPEC).then((t) => (template = t));
  return loading;
}
export function createRatmanRig(look = {}) {
  if (!template) throw new Error('ratman model not loaded — await preloadRatmanModel() first');
  return createSkinnedRig(template, { ...look, weapon: null }, { portraitY: 1.52, portraitDist: 0.8 });
}

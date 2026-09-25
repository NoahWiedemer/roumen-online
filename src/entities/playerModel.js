// Player character from /models/player.glb (auto-rigged with UniRig, no clips), retargeted by skinnedRig.js
import { loadSkinnedTemplate, createSkinnedRig } from './skinnedRig.js';

const BASE = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '/';

// humanoid joint -> bone in player.glb (the model faces +Z, its left side is +X)
const SPEC = {
  url: BASE + 'models/player.glb',
  rootBone: 'Bone_000',
  boneMap: {
    hips: 'Bone_001', spine: 'Bone_005', chest: 'Bone_003', neck: 'Bone_018', head: 'Bone_017',
    armL: 'Bone_022', elbowL: 'Bone_021', handL: 'Bone_020',
    armR: 'Bone_027', elbowR: 'Bone_026', handR: 'Bone_025',
    legL: 'Bone_015', kneeL: 'Bone_014', footL: 'Bone_013',
    legR: 'Bone_010', kneeR: 'Bone_009', footR: 'Bone_008',
  },
  // limb segments straightened to hang down in the zero pose: joint -> bone at the end of the segment
  segmentEnd: {
    armL: 'Bone_021', elbowL: 'Bone_020', handL: 'Bone_019', armR: 'Bone_026', elbowR: 'Bone_025', handR: 'Bone_024',
    legL: 'Bone_014', kneeL: 'Bone_013', legR: 'Bone_009', kneeR: 'Bone_008',
  },
  material(mat) {
    mat.metalnessMap = null; mat.metalness = 0;   // the baked metal map only adds speckles
    mat.roughness = 0.78;
    mat.needsUpdate = true;
  },
};

let template = null;
let loading = null;

export function playerModelReady() { return !!template; }
export function preloadPlayerModel() {
  if (template) return Promise.resolve(template);
  if (!loading) loading = loadSkinnedTemplate(SPEC).then((t) => (template = t));
  return loading;
}
export function createPlayerRig(look = {}) {
  if (!template) throw new Error('player model not loaded — await preloadPlayerModel() first');
  return createSkinnedRig(template, look, { gripDrop: 0.075, portraitY: 1.5, portraitDist: 0.72 });
}

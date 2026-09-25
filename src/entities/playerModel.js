// Player character from /models/player.glb (auto-rigged with UniRig, no clips), retargeted by skinnedRig.js
import * as THREE from 'three';
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
  const rig = createSkinnedRig(template, look, { gripDrop: 0.075, portraitY: 1.5, portraitDist: 0.72 });
  applyPlayerTint(rig, look);
  return rig;
}

// Per-character colours: the texture has saturated blue hair and an almost white shirt, so both are masked by
// hue / saturation in the shader and recoloured with the shading kept (look.hairTint / look.outfitTint, null =
// original). Calling it again on the same rig just updates the colours.
export function applyPlayerTint(rig, look = {}) {
  if (!rig.skinned) return;
  const hair = look.hairTint, outfit = look.outfitTint;
  let m = rig.skinned.material;
  if (!m.userData.tint) {
    if (!hair && !outfit) return;
    m = m.clone();
    const u = { uHair: { value: new THREE.Color() }, uHairOn: { value: 0 }, uOutfit: { value: new THREE.Color() }, uOutfitOn: { value: 0 } };
    m.userData.tint = u;
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uHair, uOutfit;\nuniform float uHairOn, uOutfitOn;')
        .replace('#include <map_fragment>', `#include <map_fragment>
          {
            vec3 sc = sqrt(max(diffuseColor.rgb, vec3(0.0)));          // ~sRGB for the masks
            float mx = max(max(sc.r, sc.g), sc.b), mn = min(min(sc.r, sc.g), sc.b);
            float sat = mx > 0.001 ? (mx - mn) / mx : 0.0;
            float hairM = smoothstep(0.22, 0.4, sat) * smoothstep(0.02, 0.12, sc.b - max(sc.r, sc.g)) * uHairOn;
            float shirtM = (1.0 - smoothstep(0.08, 0.2, sat)) * smoothstep(0.45, 0.62, mx) * uOutfitOn;
            vec3 hairC = uHair * (mx / 0.82);
            vec3 shirtC = uOutfit * (mx / 0.88);
            diffuseColor.rgb = mix(diffuseColor.rgb, hairC * hairC, hairM);
            diffuseColor.rgb = mix(diffuseColor.rgb, shirtC * shirtC, shirtM);
          }`);
    };
    m.customProgramCacheKey = () => 'player-tint-v1';
    rig.skinned.material = m;
  }
  const u = m.userData.tint;
  // uniforms work in ~sRGB space (squared back to linear in the shader)
  const toS = (hex, c) => { c.set(hex); c.convertLinearToSRGB(); };
  if (hair) toS(hair, u.uHair.value);
  if (outfit) toS(outfit, u.uOutfit.value);
  u.uHairOn.value = hair ? 1 : 0;
  u.uOutfitOn.value = outfit ? 1 : 0;
}

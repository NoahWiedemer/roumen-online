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
  // torso segments straightened to point up in the zero pose (the model's rest spine leans back ~15 degrees;
  // mocap clips are retargeted by segment direction, so both rigs must share an upright zero pose)
  segmentUp: { hips: 'Bone_005', spine: 'Bone_004', chest: 'Bone_002', neck: 'Bone_017' },
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

// Per-character colours and visible outfit. The texture has saturated blue hair, an almost white shirt, dark brown
// trousers and boots and pink skin, so body regions are masked in the shader by colour plus bind-pose height and
// recoloured with the shading kept:
//   look.hairTint / look.outfitTint (character creation; null = original colours)
//   look.gear = { top, pants, boots: { color, style: 'cloth' | 'leather' | 'metal' } } (equipped armour)
// A metal region also becomes shiny (metalness / roughness) with plate grooves; leather gets a grain.
// Calling it again on the same rig just updates the uniforms.
const STYLE_ID = { cloth: 1, leather: 2, metal: 3 };
export function applyPlayerTint(rig, look = {}) { applyPlayerLook(rig, look); }
export function applyPlayerLook(rig, look = {}) {
  if (!rig.skinned) return;
  let m = rig.skinned.material;
  if (!m.userData.tint) {
    m = m.clone();
    const V3 = () => ({ value: new THREE.Color() });
    const u = {
      uHair: V3(), uHairOn: { value: 0 },
      uTop: V3(), uTopStyle: { value: 0 }, uPants: V3(), uPantsStyle: { value: 0 }, uBoots: V3(), uBootsStyle: { value: 0 },
      uMinY: { value: rig.bindBox ? rig.bindBox.min.y : 0 }, uSpanY: { value: rig.bindBox ? rig.bindBox.max.y - rig.bindBox.min.y : 1 },
      uDebug: { value: 0 },
    };
    m.userData.tint = u;
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uMinY, uSpanY;\nvarying float vBindH;\nvarying vec3 vBindP;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBindH = (position.y - uMinY) / uSpanY;\nvBindP = position;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform vec3 uHair, uTop, uPants, uBoots;
          uniform float uHairOn, uTopStyle, uPantsStyle, uBootsStyle, uDebug;
          varying float vBindH; varying vec3 vBindP;
          float oHash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
          // recolour a region: returns linear colour; writes the region's metalness / roughness
          vec3 gearColor(vec3 col, float style, float shade, inout float metal, inout float rough) {
            vec3 c = col * shade;
            if (style > 2.5) {                                   // metal plates with grooves
              float band = fract(vBindH * 24.0);
              float groove = smoothstep(0.0, 0.1, band) * (1.0 - smoothstep(0.9, 1.0, band));
              c = col * (0.72 + 0.28 * shade) * mix(0.45, 1.0, groove);
              metal = 0.85; rough = 0.3;
            } else if (style > 1.5) {                            // leather grain (a little darker, it is dyed hide)
              float g = oHash(floor(vBindP * 180.0));
              c = col * min(shade, 1.0) * 0.82 * (0.88 + 0.16 * g);
              metal = 0.0; rough = 0.55;
            } else { metal = 0.0; rough = 0.9; }                 // cloth
            return c * c;
          }`)
        .replace('#include <map_fragment>', `#include <map_fragment>
          float gMetal = -1.0, gRough = -1.0;
          {
            vec3 sc = sqrt(max(diffuseColor.rgb, vec3(0.0)));          // ~sRGB for the masks
            float mx = max(max(sc.r, sc.g), sc.b), mn = min(min(sc.r, sc.g), sc.b);
            float sat = mx > 0.001 ? (mx - mn) / mx : 0.0;
            float h = vBindH;
            float hairM = smoothstep(0.22, 0.4, sat) * smoothstep(0.02, 0.12, sc.b - max(sc.r, sc.g));
            float skin = smoothstep(0.6, 0.72, mx) * smoothstep(0.12, 0.25, sat) * step(sc.b, sc.r);
            float shirtM = (1.0 - smoothstep(0.08, 0.2, sat)) * smoothstep(0.45, 0.62, mx) * smoothstep(0.4, 0.44, h);
            float brown = (1.0 - smoothstep(0.55, 0.66, mx)) * (1.0 - skin) * (1.0 - hairM) * step(sc.b, sc.r + 0.03);
            float bootsM = brown * (1.0 - smoothstep(0.2, 0.23, h));
            float pantsM = brown * smoothstep(0.2, 0.23, h) * (1.0 - smoothstep(0.56, 0.6, h));
            if (uDebug > 0.5) { diffuseColor.rgb = vec3(shirtM, pantsM, bootsM) + vec3(hairM, 0.0, hairM) * 0.5 + vec3(skin) * 0.2; }
            else {
              float metal = 0.0, rough = 0.9;
              if (uHairOn > 0.5) { vec3 hc = uHair * (mx / 0.82); diffuseColor.rgb = mix(diffuseColor.rgb, hc * hc, hairM); }
              if (uTopStyle > 0.5 && shirtM > 0.01) {
                vec3 c = gearColor(uTop, uTopStyle, mx / 0.88, metal, rough);
                diffuseColor.rgb = mix(diffuseColor.rgb, c, shirtM);
                if (shirtM > 0.5) { gMetal = metal; gRough = rough; }
              }
              if (uPantsStyle > 0.5 && pantsM > 0.01) {
                vec3 c = gearColor(uPants, uPantsStyle, clamp(mx / 0.42, 0.3, 1.5), metal, rough);
                diffuseColor.rgb = mix(diffuseColor.rgb, c, pantsM);
                if (pantsM > 0.5) { gMetal = metal; gRough = rough; }
              }
              if (uBootsStyle > 0.5 && bootsM > 0.01) {
                vec3 c = gearColor(uBoots, uBootsStyle, clamp(mx / 0.4, 0.3, 1.5), metal, rough);
                diffuseColor.rgb = mix(diffuseColor.rgb, c, bootsM);
                if (bootsM > 0.5) { gMetal = metal; gRough = rough; }
              }
            }
          }`)
        .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
          if (gMetal >= 0.0) { metalnessFactor = gMetal; roughnessFactor = gRough; }`);
    };
    m.customProgramCacheKey = () => 'player-outfit-v1';
    rig.skinned.material = m;
  }
  const u = m.userData.tint;
  // uniforms work in ~sRGB space (squared back to linear in the shader)
  const toS = (hex, c) => { c.set(hex); c.convertLinearToSRGB(); };
  u.uHairOn.value = look.hairTint ? 1 : 0;
  if (look.hairTint) toS(look.hairTint, u.uHair.value);
  const gear = look.gear || {};
  // top: equipped armour, else the shirt colour picked at character creation
  const top = gear.top || (look.outfitTint ? { color: look.outfitTint, style: 'cloth' } : null);
  for (const [key, g] of [['Top', top], ['Pants', gear.pants], ['Boots', gear.boots]]) {
    u['u' + key + 'Style'].value = g ? STYLE_ID[g.style] || 1 : 0;
    if (g) toS(g.color, u['u' + key].value);
  }
}

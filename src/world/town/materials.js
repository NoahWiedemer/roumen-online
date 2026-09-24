// Shared town materials (each created once). Some carry tiny shader injections driven by a
// shared time uniform: waving cloth (pennants, banners, flags) and flickering lamp glass.
import * as THREE from 'three';
import { tex } from '../../core/textures.js';
import { signAtlas, bannerAtlas, glassTex, glassLitTex, paintWoodTex, awningTex, marbleTex } from './textures.js';

export const townTime = { value: 0 };

function std(name, o) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, ...o });
  m.name = name;
  return m;
}

// displace along the normal with a travelling wave; weight = 1 - uv.y (0 at the attached edge)
function addWave(mat, amp, key) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = townTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          float ww = clamp(1.0 - uv.y, 0.0, 1.0);
          float ph = position.x * 0.37 + position.z * 0.29 + position.y * 0.11;
          float wv = sin(uTime * 3.2 - ww * 4.2 + ph) * 0.65 + sin(uTime * 5.7 - ww * 7.5 + ph * 1.9) * 0.3;
          transformed += normal * wv * ww * ${amp.toFixed(3)};
        }`);
  };
  mat.customProgramCacheKey = () => 'townwave-' + key;
}

function addFlicker(mat, key, strength = 0.22) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = townTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFlk;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFlk = (modelMatrix * vec4(position, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying vec3 vFlk;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          float hh = floor(vFlk.x * 0.7) * 1.37 + floor(vFlk.z * 0.7) * 2.11;
          float f = 0.5 + 0.5 * sin(uTime * 7.3 + hh * 5.1) * sin(uTime * 3.1 + hh * 3.7);
          f = mix(1.0, 0.75 + 0.35 * f, ${strength.toFixed(2)} * 4.0);
          totalEmissiveRadiance *= f;
        }`);
  };
  mat.customProgramCacheKey = () => 'townflicker-' + key;
}

let MATS = null;
export function townMaterials() {
  if (MATS) return MATS;
  const M = {};
  M.plaster = std('town_plaster', { map: tex('plaster'), roughness: 0.93 });
  M.timber = std('town_timber', { map: tex('darkWood'), roughness: 0.8 });
  M.wood = std('town_wood', { map: tex('wood'), roughness: 0.82 });
  M.paint = std('town_paintwood', { map: paintWoodTex(), roughness: 0.7 });
  M.stone = std('town_stone', { map: tex('stoneWall'), normalMap: tex('stoneWallNormal'), normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.92, color: 0xf4e8d4 });
  M.cobble = std('town_cobble', { map: tex('cobble'), normalMap: tex('cobbleNormal'), roughness: 0.9 });
  M.plaza = std('town_plaza', { map: tex('plazaStone'), roughness: 0.85 });
  const roofN = tex('roofNormal');
  M.roofRed = std('town_roofRed', { map: tex('roofRed'), normalMap: roofN, normalScale: new THREE.Vector2(1, 1), roughness: 0.68 });
  M.roofBlue = std('town_roofBlue', { map: tex('roofBlue'), normalMap: roofN, roughness: 0.62 });
  M.roofPink = std('town_roofPink', { map: tex('roofPink'), normalMap: roofN, roughness: 0.66 });
  M.roofSlate = std('town_roofSlate', { map: tex('roofSlate'), normalMap: roofN, roughness: 0.6 });
  M.glass = std('town_glass', { map: glassTex(), roughness: 0.12, metalness: 0.15 });
  M.glassLit = std('town_glassLit', { map: glassLitTex(), emissive: 0xffc46a, emissiveMap: glassLitTex(), emissiveIntensity: 0.75, roughness: 0.3 });
  M.lamp = std('town_lampGlass', { color: 0xfff4d6, emissive: 0xffcf7a, emissiveIntensity: 2.6, roughness: 0.25 });
  addFlicker(M.lamp, 'lamp', 0.12);
  M.ember = std('town_ember', { color: 0xff7a2a, emissive: 0xff5a1a, emissiveIntensity: 2.2, roughness: 0.9 });
  addFlicker(M.ember, 'ember', 0.25);
  M.iron = std('town_iron', { color: 0x46454d, metalness: 0.45, roughness: 0.5 });
  M.gold = std('town_gold', { color: 0xf0c050, metalness: 0.35, roughness: 0.35, emissive: 0x3a2400, emissiveIntensity: 0.4 });
  M.color = std('town_color', { roughness: 0.7 }); // flat vertex-coloured details
  M.cream = std('town_cream', { map: tex('plaster'), color: 0xffffff, roughness: 0.55 }); // lamp posts / trims
  M.leaf = std('town_leaf', { map: tex('leaves'), roughness: 0.95 });
  M.flowerCard = std('town_flowers', { map: tex('flowers'), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9 });
  M.fabric = std('town_fabric', { map: tex('fabric'), roughness: 0.95, side: THREE.DoubleSide });
  M.awning = std('town_awning', { map: awningTex(), roughness: 0.9, side: THREE.DoubleSide });
  M.signs = std('town_signs', { map: signAtlas(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.75 });
  M.marble = std('town_marble', { map: marbleTex(), roughness: 0.55 });
  M.dirt = std('town_soil', { map: tex('dirt'), roughness: 1, color: 0x8a7a6a });
  M.pennant = std('town_pennant', { map: tex('fabric'), side: THREE.DoubleSide, roughness: 0.9, emissive: 0x000000 });
  M.pennant.color.setScalar(1.15);
  addWave(M.pennant, 0.09, 'pennant');
  M.banner = std('town_banner', { map: bannerAtlas(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9 });
  addWave(M.banner, 0.16, 'banner');
  M.rope = std('town_rope', { color: 0x5a4632, roughness: 1 });
  MATS = M;
  return M;
}

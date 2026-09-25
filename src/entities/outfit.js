// Visible equipment on the skinned hero. The equipped top / pants / boots recolour their body region in the model's
// shader (cloth, leather or shiny metal plates, see playerModel.applyPlayerLook); items can add rigid pieces that
// ride on the joint frames of the skeleton: pauldrons, a breastplate, belt, leather cross strap, knee cops, shin
// greaves and bracers. Helmets stay invisible.
import * as THREE from 'three';
import { ITEMS } from '../game/data.js';
import { applyPlayerLook } from './playerModel.js';

const matCache = new Map();
function gearMat(color, style) {
  const key = color + style;
  if (!matCache.has(key)) {
    const metal = style === 'metal';
    matCache.set(key, new THREE.MeshStandardMaterial({
      color: new THREE.Color(color), metalness: metal ? 0.85 : 0, roughness: metal ? 0.3 : style === 'leather' ? 0.62 : 0.85,
      side: THREE.DoubleSide,
    }));
  }
  return matCache.get(key);
}
const SPH_CAP = new THREE.SphereGeometry(1, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.55);
const SPH = new THREE.SphereGeometry(1, 20, 14);
const RING = new THREE.TorusGeometry(1, 0.1, 8, 32);

function mesh(geo, mat, parent, { p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1] } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...p); m.rotation.set(...r); m.scale.set(...s);
  m.castShadow = true;
  parent.add(m);
  return m;
}

// ---- piece builders (units: metres in the joint frame; limbs: -Y along the limb, +Z forward, +X = left)
const PIECES = {
  pauldron(rig, side, look) {
    const f = rig.jointFrame('arm' + side);
    if (!f) return [];
    const g = new THREE.Group();
    const out = side === 'L' ? 1 : -1;
    g.position.set(out * 0.012, 0.012, -0.005);
    g.rotation.z = -out * 0.42;
    const m = gearMat(look.color, look.style), t = gearMat(look.trim || look.color, 'metal');
    mesh(SPH_CAP, m, g, { s: [0.094, 0.07, 0.09] });
    mesh(RING, t, g, { p: [0, 0.004, 0], r: [Math.PI / 2, 0, 0], s: [0.093, 0.089, 0.05] });
    if (look.style === 'metal') {
      mesh(SPH_CAP, m, g, { p: [0, -0.04, 0], s: [0.088, 0.062, 0.085] });
      mesh(RING, t, g, { p: [0, -0.037, 0], r: [Math.PI / 2, 0, 0], s: [0.087, 0.084, 0.045] });
    }
    f.add(g);
    return [g];
  },
  pauldrons(rig, look) { return [...PIECES.pauldron(rig, 'L', look), ...PIECES.pauldron(rig, 'R', look)]; },
  pauldronL(rig, look) { return PIECES.pauldron(rig, 'L', look); },
  pauldronR(rig, look) { return PIECES.pauldron(rig, 'R', look); },
  chest(rig, look) {
    const f = rig.jointFrame('chest');
    if (!f) return [];
    const g = new THREE.Group();
    const m = gearMat(look.color, look.style), t = gearMat(look.trim || look.color, 'metal');
    mesh(SPH, m, g, { p: [0, -0.045, 0.045], s: [0.15, 0.17, 0.078] });
    mesh(SPH, t, g, { p: [0, -0.02, 0.12], s: [0.026, 0.032, 0.01] });               // emblem
    mesh(RING, t, g, { p: [0, 0.085, 0.04], r: [Math.PI / 2 + 0.25, 0, 0], s: [0.12, 0.09, 0.08] });   // gorget rim
    f.add(g);
    return [g];
  },
  belt(rig, look) {
    const f = rig.jointFrame('hips');
    if (!f) return [];
    const g = new THREE.Group();
    const leather = gearMat(look.style === 'metal' ? look.trim || '#4a3020' : '#3e2616', look.style === 'metal' ? 'metal' : 'leather');
    const t = gearMat(look.trim || '#c99a4a', 'metal');
    mesh(RING, leather, g, { p: [0, 0.075, 0.012], r: [Math.PI / 2, 0, 0], s: [0.165, 0.135, 0.22] });
    mesh(new THREE.BoxGeometry(0.05, 0.042, 0.016), t, g, { p: [0, 0.075, 0.148] });
    f.add(g);
    return [g];
  },
  strap(rig, look) {
    const f = rig.jointFrame('chest');
    if (!f) return [];
    const g = new THREE.Group();
    const m = gearMat('#3a2414', 'leather'), t = gearMat(look.trim || '#c99a4a', 'metal');
    mesh(new THREE.BoxGeometry(0.045, 0.44, 0.014), m, g, { p: [0, -0.07, 0.118], r: [0.12, 0, 0.62] });
    mesh(SPH, t, g, { p: [-0.045, -0.02, 0.13], s: [0.018, 0.018, 0.01] });
    f.add(g);
    return [g];
  },
  knees(rig, look) {
    const out = [];
    for (const side of ['L', 'R']) {
      const f = rig.jointFrame('knee' + side);
      if (!f) continue;
      const g = new THREE.Group();
      const m = gearMat(look.color, look.style), t = gearMat(look.trim || look.color, 'metal');
      mesh(SPH, m, g, { p: [0, 0.005, 0.052], s: [0.052, 0.06, 0.028] });
      if (look.style === 'metal') mesh(SPH, t, g, { p: [0, 0.005, 0.078], s: [0.016, 0.016, 0.008] });
      f.add(g);
      out.push(g);
    }
    return out;
  },
  greaves(rig, look) {
    const out = [];
    const geo = new THREE.CylinderGeometry(0.058, 0.05, 0.2, 14, 1, true, -Math.PI / 2, Math.PI);
    for (const side of ['L', 'R']) {
      const f = rig.jointFrame('knee' + side);
      if (!f) continue;
      const g = new THREE.Group();
      mesh(geo, gearMat(look.color, look.style), g, { p: [0, -0.2, 0.012] });
      mesh(RING, gearMat(look.trim || look.color, 'metal'), g, { p: [0, -0.1, 0.012], r: [Math.PI / 2, 0, 0], s: [0.058, 0.058, 0.05] });
      f.add(g);
      out.push(g);
    }
    return out;
  },
  bracers(rig, look) {
    const out = [];
    const geo = new THREE.CylinderGeometry(0.043, 0.038, 0.11, 14, 1, true);
    for (const side of ['L', 'R']) {
      const f = rig.jointFrame('elbow' + side);
      if (!f) continue;
      const g = new THREE.Group();
      mesh(geo, gearMat(look.color, look.style), g, { p: [0, -0.16, 0] });
      if (look.trim) mesh(RING, gearMat(look.trim, 'metal'), g, { p: [0, -0.105, 0], r: [Math.PI / 2, 0, 0], s: [0.043, 0.043, 0.05] });
      f.add(g);
      out.push(g);
    }
    return out;
  },
};

// equipment: { armor, pants, boots, gloves, ... } item ids; tints: { hairTint, outfitTint }
export function applyOutfit(rig, equipment = {}, tints = {}) {
  if (!rig.skinned || !rig.jointFrame) return;
  const lookOf = (slot) => { const it = ITEMS[equipment[slot]]; return it && it.look && it.type === slot ? it.look : null; };
  const top = lookOf('armor'), pants = lookOf('pants'), boots = lookOf('boots'), gloves = lookOf('gloves');
  applyPlayerLook(rig, { ...tints, gear: { top, pants, boots } });
  // rebuild the rigid pieces
  for (const p of rig.outfitPieces || []) p.removeFromParent();
  rig.outfitPieces = [];
  for (const look of [top, pants, boots, gloves]) {
    if (!look || !look.pieces) continue;
    for (const name of look.pieces) if (PIECES[name]) rig.outfitPieces.push(...PIECES[name](rig, look));
  }
}

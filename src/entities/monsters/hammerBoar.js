// Hammer Boar — a hunched boar-man in white spiky fur (the user's Eber.glb, auto-rigged) carrying a long iron-bound
// maul on his right shoulder. Slow but heavy: a long two-handed wind-up, then the hammer comes down in front of him
// (the hero can step out of reach during the wind-up). Implements the monster model interface of monsters.js like
// SkinnedMonster does (root, height, radius, headY, setMoving, attack -> impact time, hit, die, update, dispose).
import * as THREE from 'three';
import { Animator, Clip, CLIPS, fullPose, P_DEAD } from '../anim.js';
import { createNpcRig } from '../npcModels.js';
import { applyRim, envTexture } from './common.js';
import { G } from '../../game/game.js';

// ------------------------------------------------------------------ the maul (built in code)
// In the hand holder: grip at the origin, shaft along +Y; the head sits across the shaft at the far end.
let hammerParts = null;
function buildHammer() {
  if (!hammerParts) {
    const wood = new THREE.MeshStandardMaterial({ color: '#7a5232', roughness: 0.82 });
    const woodDark = new THREE.MeshStandardMaterial({ color: '#4e3320', roughness: 0.9 });
    const iron = new THREE.MeshStandardMaterial({ color: '#6d727a', roughness: 0.38, metalness: 0.85, envMap: envTexture(), envMapIntensity: 0.8 });
    const ironDark = new THREE.MeshStandardMaterial({ color: '#3a3d43', roughness: 0.5, metalness: 0.8, envMap: envTexture(), envMapIntensity: 0.6 });
    const leather = new THREE.MeshStandardMaterial({ color: '#3b2517', roughness: 0.75 });
    hammerParts = { wood, woodDark, iron, ironDark, leather };
  }
  const M = hammerParts;
  const g = new THREE.Group();
  g.name = 'hammer';
  const add = (geo, mat, [x, y, z] = [0, 0, 0], [rx, ry, rz] = [0, 0, 0]) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; g.add(m); return m;
  };
  const L = 1.28;                                                            // shaft length (model units)
  add(new THREE.CylinderGeometry(0.03, 0.036, L, 10), M.wood, [0, L / 2 - 0.2, 0]);
  add(new THREE.CylinderGeometry(0.038, 0.038, 0.3, 10), M.leather, [0, 0.02, 0]);            // grip wrap
  for (const y of [-0.12, 0.08, 0.17]) add(new THREE.TorusGeometry(0.038, 0.008, 6, 14), M.woodDark, [0, y, 0], [Math.PI / 2, 0, 0]);
  add(new THREE.SphereGeometry(0.05, 12, 8), M.ironDark, [0, -0.22, 0]);                      // pommel
  add(new THREE.CylinderGeometry(0.042, 0.034, 0.22, 10), M.ironDark, [0, L - 0.36, 0]);      // iron collar below the head
  // head: a heavy block across the shaft (striking faces along ±Z), iron bands and a crown of spikes
  const hy = L - 0.16;
  g.userData.head = add(new THREE.BoxGeometry(0.2, 0.2, 0.44), M.iron, [0, hy, 0]);
  for (const s of [-1, 1]) {
    add(new THREE.CylinderGeometry(0.125, 0.125, 0.06, 8), M.ironDark, [0, hy, s * 0.22], [Math.PI / 2, 0, Math.PI / 8]);   // octagonal faces
    add(new THREE.BoxGeometry(0.215, 0.215, 0.035), M.ironDark, [0, hy, s * 0.11]);                                       // bands
  }
  for (const [x, z] of [[0, 0], [0.06, -0.12], [-0.06, 0.12]]) add(new THREE.ConeGeometry(0.03, 0.09, 6), M.ironDark, [x, hy + 0.14, z]);
  return g;
}

// ------------------------------------------------------------------ poses and clips
// hunched brute: knees bent, head pushed forward, maul resting on the right shoulder, left arm hanging heavy
export const P_BOAR = fullPose({
  pos: [0, -0.06, 0],
  hips: [0.08, 0.05, 0], spine: [0.22, 0, 0], chest: [0.1, -0.05, 0], neck: [-0.1, 0, 0], head: [-0.22, 0, 0],
  armR: [-0.25, 0.12, -0.28], elbowR: [-1.6, 0, 0], handR: [-0.988, -0.241, -0.701],   // shaft up-back over the shoulder
  armL: [-0.1, 0, 0.3], elbowL: [-0.45, 0, 0], handL: [0.1, 0, 0.1],
  legL: [-0.3, 0.08, 0.12], kneeL: [0.5, 0, 0], footL: [-0.18, 0, -0.04],
  legR: [-0.12, -0.08, -0.12], kneeR: [0.42, 0, 0], footR: [-0.2, 0, 0.04],
});
const CARRY = { armR: P_BOAR.armR, elbowR: P_BOAR.elbowR, handR: P_BOAR.handR };
const SMASH = { dur: 2.3, hit: 1.32 };

// two-handed overhead smash: slow wind-up (the left hand grabs the shaft, the maul hangs down the back), a short
// hold, then down in front. The torso bends ~60 degrees at the impact, so the arms swing far forward relative to
// the chest to point forward-down in the world; the hand angles were solved so the shaft continues that line.
CLIPS.hammer_smash = new Clip('hammer_smash', {
  duration: SMASH.dur, base: P_BOAR,
  events: [{ t: SMASH.hit, name: 'hit' }],
  keys: [
    { t: 0, ...P_BOAR },
    { t: 0.75, e: 'out', pos: [0, 0.02, -0.06], hips: [-0.05, -0.15, 0], spine: [-0.18, -0.1, 0], chest: [-0.2, -0.05, 0], head: [-0.15, 0, 0],
      armR: [-2.6, 0, -0.25], elbowR: [-0.85, 0, 0], handR: [0.167, -0.162, 0.166], armL: [-2.45, 0, 0.35], elbowL: [-1.05, 0, 0], handL: [0.226, 0.267, -0.176],
      legL: [-0.45, 0.1, 0.14], kneeL: [0.55, 0, 0], legR: [0.1, -0.1, -0.14], kneeR: [0.3, 0, 0] },
    { t: 1.05, e: 'inOut', pos: [0, 0.04, -0.08], spine: [-0.26, -0.1, 0], chest: [-0.24, -0.05, 0],
      armR: [-2.8, 0, -0.25], elbowR: [-0.95, 0, 0], handR: [0.363, -0.15, 0.155], armL: [-2.65, 0, 0.35], elbowL: [-1.15, 0, 0], handL: [0.42, 0.258, -0.154] },
    { t: SMASH.hit, e: 'in', pos: [0, -0.2, 0.16], hips: [0.2, 0.1, 0], spine: [0.6, 0.05, 0], chest: [0.3, 0, 0], head: [-0.35, 0, 0],
      armR: [-1.65, 0, -0.12], elbowR: [-0.1, 0, 0], handR: [1.156, 0.264, 0.3], armL: [-1.75, 0, 0.2], elbowL: [-0.3, 0, 0], handL: [0.9, 0, 0],
      legL: [-0.85, 0.1, 0.14], kneeL: [1.0, 0, 0], footL: [-0.1, 0, 0], legR: [0.25, -0.1, -0.14], kneeR: [0.55, 0, 0] },
    { t: 1.7, e: 'out', pos: [0, -0.18, 0.14], spine: [0.58, 0.05, 0], chest: [0.28, 0, 0],
      armR: [-1.55, 0, -0.12], elbowR: [-0.12, 0, 0], handR: [1.031, 0.187, 0.233], armL: [-1.65, 0, 0.2], elbowL: [-0.3, 0, 0], handL: [0.9, 0, 0] },
    { t: SMASH.dur, ...P_BOAR },
  ],
});
// knocked down: stagger back, the maul slips from the hand, falls on the back
CLIPS.boar_down = new Clip('boar_down', {
  duration: 1.3, base: P_BOAR, expression: 'hurt',
  keys: [
    { t: 0, ...P_BOAR },
    { t: 0.2, e: 'out', pos: [0, -0.02, -0.12], spine: [-0.35, 0.1, 0], chest: [-0.2, 0, 0], head: [-0.5, 0.3, 0], armR: [-0.5, 0, -1.0], elbowR: [-0.4, 0, 0], armL: [-0.3, 0, 0.9] },
    { t: 0.7, e: 'in', pos: [0, -0.38, -0.18], hips: [-0.75, 0.2, 0], spine: [-0.1, 0, 0], kneeL: [1.3, 0, 0], kneeR: [1.1, 0, 0], legL: [-0.6, 0, 0.1], legR: [-0.4, 0, -0.1] },
    { t: 1.1, e: 'out', ...P_DEAD },
    { t: 1.3, ...P_DEAD },
  ],
});

export class HammerBoarMonster {
  constructor(type, { tint } = {}) {
    this.type = type;
    this.rig = createNpcRig('eber', { name: 'monster:' + type });
    this.anim = new Animator(this.rig, { idlePose: P_BOAR, gait: 'free' });
    this.anim.runOverride = CARRY;                 // the maul stays on the shoulder while he trudges along
    this.root = this.rig.root;
    const scale = this.rig.scale || 1;
    this.height = this.rig.height;
    this.radius = 0.7 * scale;
    this.headY = this.height * 0.82;
    this.impactTime = SMASH.hit;
    this.collapseDur = 1.3;
    this.lingerTime = 3.5;
    this.fadeDur = 1.3;
    this.maxSpeed = 2.3;
    this.moveTarget = 0;
    this.dead = false;
    this.deathT = -1;
    this.hl = 0; this.hlTarget = 0; this.flash = 0;
    this.t = Math.random() * 10;
    this.onImpact = null;
    const m = this.rig.skinned.material.clone();
    if (tint) m.color.multiply(tint);
    applyRim(m, '#000000', 2.2);
    this.rim = m.userData.uRimColor.value;
    this.rig.skinned.material = m;
    this.mat = m;
    this.hammer = buildHammer();
    this.rig.weaponHolder.add(this.hammer);
    this._headW = new THREE.Vector3();
  }

  setMoving(v) { this.moveTarget = v; }
  attack() {
    if (this.deathT >= 0) return 0;
    this.anim.battleTarget = 1;
    this.anim.play('hammer_smash', { onEvent: (e) => { if (e === 'hit') this.smashImpact(); } });
    return this.impactTime;
  }
  // the maul hits the ground in front: dust ring, rumble (monsters.js adds shake + thud for strength > 1)
  smashImpact() {
    this.onImpact?.(1.4);
    if (!G.fx) return;
    this.hammer.updateWorldMatrix(true, true);
    this.hammer.userData.head.getWorldPosition(this._headW);
    const y = G.terrain ? G.terrain.groundAt(this._headW.x, this._headW.z) : 0;
    const p = new THREE.Vector3(this._headW.x, y, this._headW.z);
    G.fx.ring(p, { color: '#d8c7a0', from: 0.4, to: 4.2, life: 0.5 });
    const c = new THREE.Color('#c9b58e');
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * Math.PI * 2;
      G.fx.particles.emit({ x: p.x, y: p.y + 0.15, z: p.z, vx: Math.cos(a) * 3.5, vy: 1 + Math.random() * 2.5, vz: Math.sin(a) * 3.5, life: 0.8, size: 0.6, endSize: 1.3, color: c, drag: 2.5, grav: -3, alpha: 0.45 });
    }
  }
  hit() {
    if (this.deathT >= 0) return;
    this.flash = 1;
    this.anim.battleTarget = 1;
    if (!this.anim.busy) this.anim.play('hit');
  }
  die() {
    if (this.deathT >= 0) return;
    this.deathT = 0;
    this.anim.dead = true;
    this.anim.play('boar_down');
  }
  setHighlight(on) { this.hlTarget = on ? 1 : 0; }

  update(dt) {
    if (this.dead) return;
    this.t += dt;
    const s = this.deathT >= 0 ? 0 : this.moveTarget;
    this.anim.speed += (s * 0.45 - this.anim.speed) * (1 - Math.exp(-6 * dt));
    this.anim.groundSpeed = s * this.maxSpeed;
    this.anim.update(dt, null);
    this.hl += (this.hlTarget - this.hl) * (1 - Math.exp(-14 * dt));
    this.flash = Math.max(0, this.flash - dt * 5);
    this.rim.setRGB(0.45 * this.hl + 0.9 * this.flash, 0.42 * this.hl + 0.35 * this.flash, 0.36 * this.hl + 0.3 * this.flash);
    if (this.deathT >= 0) {
      this.deathT += dt;
      if (this.deathT > this.lingerTime) {
        const f = Math.min(1, (this.deathT - this.lingerTime) / this.fadeDur);
        if (!this.mat.transparent) {
          this.mat.transparent = true; this.mat.needsUpdate = true; this.rig.skinned.castShadow = false;
          this.hammer.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; o.castShadow = false; } });
        }
        this.mat.opacity = 1 - f;
        this.hammer.traverse((o) => { if (o.isMesh) o.material.opacity = 1 - f; });
        if (f >= 1) { this.dead = true; this.root.visible = false; }
      }
    }
  }

  dispose() {
    this.mat.dispose();
    if (this.mat.transparent) this.hammer.traverse((o) => { if (o.isMesh) o.material.dispose(); });
    this.root.parent?.remove(this.root);
  }
}

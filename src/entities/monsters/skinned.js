// Skinned humanoid monsters (the rat-men) driven by the procedural Animator. Implements the monster model
// interface used by entities/monsters.js (root, height, radius, headY, setMoving, attack -> impact time, hit, die,
// update, setHighlight, dispose, dead). Tier variants tint the model and add a pulsing "hypnosis" rim glow;
// instead of dying they are knocked out: they topple over, dizzy stars circle their head, then they fade away.
import * as THREE from 'three';
import { Animator, Clip, CLIPS, fullPose, P_IDLE, P_DEAD } from '../anim.js';
import { createNpcRig } from '../npcModels.js';
import { applyRim } from './common.js';
import { MONSTERS } from '../../game/data.js';
import { makeCanvas, toTexture } from '../../core/textures.js';

// tier looks: body tint (sRGB multiplier) + optional hypnosis glow (rim colour, strength)
export const RAT_VARIANTS = {
  forest: { tint: '#ffffff', glow: null, rim: 0 },
  digger: { tint: '#f4c890', glow: '#ffb060', rim: 0.12 },
  hypno: { tint: '#caa6ff', glow: '#b050ff', rim: 0.55 },
  frenzy: { tint: '#ff9088', glow: '#ff2a20', rim: 0.7 },
};

let starTex = null;
function starTexture() {
  if (starTex) return starTex;
  const S = 64, c = makeCanvas(S), g = c.getContext('2d');
  g.translate(S / 2, S / 2);
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? S * 0.18 : S * 0.44, a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  g.closePath();
  g.fillStyle = '#ffe45a'; g.fill();
  g.lineWidth = 3; g.strokeStyle = '#a06a00'; g.stroke();
  starTex = toTexture(c, { repeat: false });
  return starTex;
}

export class SkinnedMonster {
  constructor(type, { tint } = {}) {
    const def = MONSTERS[type] || {};
    const v = RAT_VARIANTS[def.variant || 'forest'];
    this.type = type;
    this.rig = createNpcRig(def.model || 'ratman_mob', { name: 'monster:' + type, scale: def.scale || 1 });
    this.anim = new Animator(this.rig, { idlePose: P_RATMOB, gait: 'free' });
    this.root = this.rig.root;
    const scale = this.rig.scale || 1;
    this.height = this.rig.height;
    this.radius = 0.5 * scale;
    this.headY = this.height * 0.86;
    this.impactTime = 0.45;
    this.collapseDur = 1.1;
    this.lingerTime = 7;        // seconds lying knocked out before fading away
    this.fadeDur = 1.2;
    this.maxSpeed = def.speed || 2.6;
    this.moveTarget = 0;
    this.dead = false;
    this.deathT = -1;
    this.hl = 0; this.hlTarget = 0; this.flash = 0;
    this.t = Math.random() * 10;
    this.onImpact = null;
    // per-instance material: tier tint x individual variation, rim glow for the hypnotised tiers + highlight / hit flash
    const m = this.rig.skinned.material.clone();
    const c = new THREE.Color().setStyle(v.tint, THREE.SRGBColorSpace);
    if (tint) c.multiply(tint);
    m.color.copy(c);
    this.glowCol = new THREE.Color(v.glow || '#ffffff');
    this.glowStrength = v.rim;
    applyRim(m, '#000000', 2.2);
    this.rim = m.userData.uRimColor.value;
    this.rig.skinned.material = m;
    this.mat = m;
    // dizzy stars, shown while knocked out (children of the scaled root -> compensate the scale)
    this.stars = new THREE.Group();
    this.stars.visible = false;
    const smat = new THREE.SpriteMaterial({ map: starTexture(), transparent: true, depthWrite: false });
    for (let i = 0; i < 4; i++) { const s = new THREE.Sprite(smat); s.scale.setScalar(0.22 / scale); this.stars.add(s); }
    this.starMat = smat;
    this.root.add(this.stars);
  }

  setMoving(v) { this.moveTarget = v; }
  attack() {
    if (this.deathT >= 0) return 0;
    this.anim.battleTarget = 1;
    this.anim.play('axe_chop', { onEvent: (e) => { if (e === 'hit') this.onImpact?.(0.8); } });
    return this.impactTime;
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
    this.anim.play('knockout');
  }
  setHighlight(on) { this.hlTarget = on ? 1 : 0; }

  update(dt) {
    if (this.dead) return;
    this.t += dt;
    const s = this.deathT >= 0 ? 0 : this.moveTarget;
    this.anim.speed += (s * 0.6 - this.anim.speed) * (1 - Math.exp(-8 * dt));
    this.anim.groundSpeed = s * this.maxSpeed;
    this.anim.update(dt, null);
    // rim: hypnosis pulse + hover highlight + hit flash
    this.hl += (this.hlTarget - this.hl) * (1 - Math.exp(-14 * dt));
    this.flash = Math.max(0, this.flash - dt * 5);
    const awake = this.deathT >= 0 ? Math.max(0, 1 - this.deathT) : 1;   // the hypnosis fades when knocked out
    const pulse = this.glowStrength * (0.65 + 0.35 * Math.sin(this.t * 3.2)) * awake;
    this.rim.setRGB(
      this.glowCol.r * pulse + 0.45 * this.hl + 0.9 * this.flash,
      this.glowCol.g * pulse + 0.42 * this.hl + 0.35 * this.flash,
      this.glowCol.b * pulse + 0.36 * this.hl + 0.3 * this.flash,
    );
    if (this.deathT >= 0) {
      this.deathT += dt;
      const sc = this.rig.scale || 1;
      // dizzy stars circle above the head while it lies on the ground
      const on = this.deathT > this.collapseDur * 0.8 && this.deathT < this.lingerTime;
      this.stars.visible = on;
      if (on) {
        this.stars.children.forEach((st, i) => {
          const a = this.t * 3 + (i / 4) * Math.PI * 2;
          st.position.set(Math.cos(a) * 0.32 / sc, 0.55 / sc + Math.sin(this.t * 6 + i) * 0.03 / sc, -0.55 / sc + Math.sin(a) * 0.32 / sc);
        });
      }
      if (this.deathT > this.lingerTime) {
        const f = Math.min(1, (this.deathT - this.lingerTime) / this.fadeDur);
        if (!this.mat.transparent) { this.mat.transparent = true; this.mat.needsUpdate = true; this.rig.skinned.castShadow = false; }
        this.mat.opacity = 1 - f;
        if (f >= 1) { this.dead = true; this.root.visible = false; }
      }
    }
  }

  dispose() {
    this.mat.dispose();
    this.starMat.dispose();
    this.root.parent?.remove(this.root);
  }
}

// hunched, predatory stance: hatchet held forward-low, knees bent
export const P_RATMOB = fullPose({
  ...P_IDLE,
  pos: [0, -0.05, 0],
  hips: [0.05, 0, 0], spine: [0.22, 0, 0], chest: [0.12, 0, 0], neck: [0, 0, 0], head: [-0.2, 0, 0],
  armR: [-0.4, 0, -0.22], elbowR: [-0.75, 0, 0], handR: [0.5, 0, 0],
  armL: [-0.2, 0, 0.3], elbowL: [-0.65, 0, 0], handL: [0, 0, 0],
  legL: [-0.22, 0.05, 0.1], kneeL: [0.35, 0, 0], footL: [-0.12, 0, 0],
  legR: [0.12, -0.05, -0.1], kneeR: [0.28, 0, 0], footR: [-0.12, 0, 0],
});

// overhead hatchet chop
CLIPS.axe_chop = new Clip('axe_chop', {
  duration: 0.95, base: P_RATMOB,
  events: [{ t: 0.45, name: 'hit' }],
  keys: [
    { t: 0, ...P_RATMOB },
    { t: 0.28, e: 'out', pos: [0, 0.02, -0.03], spine: [-0.05, -0.2, 0], chest: [-0.15, -0.1, 0], head: [-0.1, 0, 0], armR: [-2.6, 0, -0.35], elbowR: [-1.3, 0, 0], handR: [0.2, 0, 0], armL: [-0.5, 0, 0.5], elbowL: [-0.9, 0, 0] },
    { t: 0.45, e: 'snap', pos: [0, -0.1, 0.15], hips: [0.1, 0.25, 0], spine: [0.5, 0.2, 0], chest: [0.25, 0.1, 0], head: [0.1, 0, 0], armR: [-0.7, 0, 0.15], elbowR: [-0.15, 0, 0], handR: [1.1, 0, 0], armL: [0.2, 0, 0.6], elbowL: [-0.4, 0, 0], legL: [-0.7, 0, 0.12], kneeL: [0.85, 0, 0] },
    { t: 0.6, e: 'out', pos: [0, -0.1, 0.15], spine: [0.52, 0.2, 0], armR: [-0.65, 0, 0.2] },
    { t: 0.95, ...P_RATMOB },
  ],
});
// knocked out (not killed): stagger back, knees buckle, fall on the back and stay down
CLIPS.knockout = new Clip('knockout', {
  duration: 1.1, base: P_RATMOB, expression: 'hurt',
  keys: [
    { t: 0, ...P_RATMOB },
    { t: 0.15, e: 'out', pos: [0, -0.02, -0.1], spine: [-0.4, 0, 0.1], chest: [-0.2, 0, 0], head: [-0.5, 0.3, 0], armR: [-0.3, 0, -0.9], armL: [-0.3, 0, 0.9] },
    { t: 0.55, e: 'in', pos: [0, -0.35, -0.15], hips: [-0.7, 0.2, 0], spine: [-0.1, 0, 0], kneeL: [1.2, 0, 0], kneeR: [1.0, 0, 0], legL: [-0.6, 0, 0.1], legR: [-0.4, 0, -0.1] },
    { t: 0.95, e: 'out', ...P_DEAD },
    { t: 1.1, ...P_DEAD },
  ],
});

// Vagel, Goddess of Greed — the model: the user's Vagel.glb (auto-rigged, see SPECS.vagel in npcModels.js) driven by
// the Animator with the motion-capture clips (sitting, talking, casting, death) and a few spell poses of her own.
// Implements the monster model interface of monsters.js. In a fight she levitates (toes pointed, hands floating
// out from the body, a slow bob), her hands glow while she casts, a golden halo burns behind her head when she is
// enraged, a blink squeezes her into a sliver of light and back, and when she falls she dissolves into gold.
import * as THREE from 'three';
import { Clip, CLIPS, Animator, fullPose } from '../anim.js';
import { createNpcRig, preloadNpcModel, npcModelReady } from '../npcModels.js';
import { mocapReady, getMocap } from '../mocap.js';
import { applyRim, envTexture } from '../monsters/common.js';
import { tex } from '../../core/textures.js';
import { G } from '../../game/game.js';
import { clamp, smoothstep } from '../../core/utils.js';

export const preloadVagel = () => preloadNpcModel('vagel');
export const vagelReady = () => npcModelReady('vagel');

// ------------------------------------------------------------------ poses
// levitating: toes pointed, knees soft, hands floating out from the body (the base of her spell clips, and layered
// over the motion-capture idle while she hovers)
const HOVER = {
  legL: [0.14, 0.04, 0.03], kneeL: [0.34, 0, 0], footL: [0.7, 0, 0],
  legR: [-0.04, -0.04, -0.03], kneeR: [0.52, 0, 0], footR: [0.75, 0, 0],
  armL: [-0.22, 0, 0.45], elbowL: [-0.55, 0, 0], handL: [0.15, 0, 0.35],
  armR: [-0.22, 0, -0.45], elbowR: [-0.55, 0, 0], handR: [0.15, 0, -0.35],
};
const LEGS = ['legL', 'kneeL', 'footL', 'legR', 'kneeR', 'footR'];
export const P_VAGEL = fullPose({ ...HOVER, spine: [-0.03, 0, 0], chest: [-0.05, 0, 0], head: [0.04, 0, 0] });

const UP = { armL: [-2.75, 0, 0.3], elbowL: [-0.2, 0, 0], handL: [0, 0, 0.2], armR: [-2.75, 0, -0.3], elbowR: [-0.2, 0, 0], handR: [0, 0, -0.2], spine: [-0.08, 0, 0], chest: [-0.15, 0, 0], head: [-0.3, 0, 0] };
const WIDE = { armL: [-0.25, 0, 1.4], elbowL: [-0.12, 0, 0], handL: [0.2, 0, 0.3], armR: [-0.25, 0, -1.4], elbowR: [-0.12, 0, 0], handR: [0.2, 0, -0.3], chest: [-0.18, 0, 0], head: [-0.22, 0, 0] };
// both arms raised to the sky (summoning); the cloak rises with them like wings
CLIPS.vg_raise = new Clip('vg_raise', {
  duration: 2.4, base: P_VAGEL, curve: 'smooth',
  keys: [{ t: 0, ...P_VAGEL }, { t: 0.5, stop: true, ...UP }, { t: 2.0, stop: true, ...UP, head: [-0.36, 0, 0] }, { t: 2.4, ...P_VAGEL }],
});
// arms spread wide: the cloak opens like a pair of wings
CLIPS.vg_spread = new Clip('vg_spread', {
  duration: 2.6, base: P_VAGEL, curve: 'smooth',
  keys: [{ t: 0, ...P_VAGEL }, { t: 0.5, stop: true, ...WIDE }, { t: 2.2, stop: true, ...WIDE, chest: [-0.2, 0, 0] }, { t: 2.6, ...P_VAGEL }],
});
// a mocking laugh: head thrown back, one hand at the chest, shoulders shaking
const LAUGH = { head: [-0.5, 0.15, 0], chest: [-0.2, 0, 0], armR: [-0.85, 0.35, 0.3], elbowR: [-2.05, 0, 0], handR: [0.3, 0, 0], armL: [-0.1, 0, 0.55] };
CLIPS.vg_laugh = new Clip('vg_laugh', {
  duration: 1.9, base: P_VAGEL, curve: 'smooth',
  keys: [
    { t: 0, ...P_VAGEL },
    { t: 0.3, ...LAUGH },
    { t: 0.5, ...LAUGH, chest: [-0.12, 0, 0], head: [-0.4, 0.1, 0] },
    { t: 0.7, ...LAUGH },
    { t: 0.9, ...LAUGH, chest: [-0.12, 0, 0], head: [-0.42, 0.1, 0] },
    { t: 1.1, ...LAUGH },
    { t: 1.9, ...P_VAGEL },
  ],
});
// greed's grasp: the right hand reaches out and holds, then pulls back into a fist
const REACH = { armR: [-1.5, 0.15, -0.1], elbowR: [-0.05, 0, 0], handR: [0.1, 0, 0], chest: [0.05, -0.15, 0], armL: [-0.3, 0, 0.7] };
CLIPS.vg_grasp = new Clip('vg_grasp', {
  duration: 3.0, base: P_VAGEL, curve: 'smooth',
  keys: [{ t: 0, ...P_VAGEL }, { t: 0.35, stop: true, ...REACH }, { t: 2.45, stop: true, ...REACH }, { t: 2.7, stop: true, ...REACH, armR: [-0.9, 0.25, -0.2], elbowR: [-1.7, 0, 0], chest: [-0.05, 0.15, 0] }, { t: 3.0, ...P_VAGEL }],
});
// a backhand sweep across the front (the Midas wave)
CLIPS.vg_sweep = new Clip('vg_sweep', {
  duration: 1.3, base: P_VAGEL, curve: 'smooth',
  keys: [
    { t: 0, ...P_VAGEL },
    { t: 0.35, stop: true, armR: [-1.4, 0.95, -0.1], elbowR: [-0.5, 0, 0], chest: [0, 0.25, 0], head: [0, 0.15, 0] },
    { t: 0.62, stop: true, armR: [-1.45, -0.85, -0.1], elbowR: [-0.05, 0, 0], chest: [0, -0.25, 0], head: [0, -0.1, 0] },
    { t: 1.3, ...P_VAGEL },
  ],
});
// pointing at the hero while she talks
CLIPS.vg_point = new Clip('vg_point', {
  duration: 1.8, base: P_VAGEL, curve: 'smooth',
  keys: [{ t: 0, ...P_VAGEL }, { t: 0.35, stop: true, armR: [-1.45, 0.1, -0.12], elbowR: [-0.1, 0, 0], handR: [0.2, 0, 0], head: [0.05, 0, 0.1] }, { t: 1.4, stop: true, armR: [-1.4, 0.1, -0.12], elbowR: [-0.15, 0, 0], handR: [0.2, 0, 0] }, { t: 1.8, ...P_VAGEL }],
});

// motion-capture clips with the legs held in the levitating pose (casting while hovering)
function hoverClip(name, src, speed = 1) {
  const keys = src.keys.map((k) => {
    const o = { ...k, t: k.t / speed, pos: [k.pos[0], 0, k.pos[2]] };
    for (const j of LEGS) o[j] = HOVER[j];
    return o;
  });
  return (CLIPS[name] = new Clip(name, { duration: src.duration / speed, keys, slerp: true }));
}

// ------------------------------------------------------------------ glow sprites
let haloTex = null;
function haloTexture() {
  if (haloTex) return haloTex;
  const S = 256, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.translate(S / 2, S / 2);
  const rg = g.createRadialGradient(0, 0, S * 0.3, 0, 0, S * 0.5);
  rg.addColorStop(0, 'rgba(255,220,120,0)'); rg.addColorStop(0.55, 'rgba(255,230,150,1)'); rg.addColorStop(0.7, 'rgba(255,200,80,0.8)'); rg.addColorStop(1, 'rgba(255,160,40,0)');
  g.fillStyle = rg; g.beginPath(); g.arc(0, 0, S * 0.5, 0, Math.PI * 2); g.fill();
  // spikes of a sun crown
  g.fillStyle = 'rgba(255,236,170,0.9)';
  for (let i = 0; i < 16; i++) {
    g.save(); g.rotate((i / 16) * Math.PI * 2);
    g.beginPath(); g.moveTo(-4, -S * 0.36); g.lineTo(0, -S * (i % 2 ? 0.46 : 0.5)); g.lineTo(4, -S * 0.36); g.fill();
    g.restore();
  }
  haloTex = new THREE.CanvasTexture(c);
  haloTex.colorSpace = THREE.SRGBColorSpace;
  return haloTex;
}
const sprite = (color, size, map = tex('glow')) => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, color: new THREE.Color(color), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
  s.scale.setScalar(size);
  return s;
};

const GOLD = new THREE.Color('#ffd24a'), VIOLET = new THREE.Color('#b04aff');
const _v = new THREE.Vector3();

export class VagelModel {
  constructor(type) {
    this.type = type;
    this.rig = createNpcRig('vagel', { name: 'monster:vagel' });
    this.anim = new Animator(this.rig, { idlePose: P_VAGEL, gait: 'free' });
    if (mocapReady()) {
      this.anim.useMocap(getMocap());
      this.anim.walkOnly = true;
      if (!CLIPS.vg_cast && CLIPS.mc_Spell_Simple_Shoot) hoverClip('vg_cast', CLIPS.mc_Spell_Simple_Shoot, 0.8);
      if (!CLIPS.vg_talk && CLIPS.mc_Idle_Talking_Loop) { hoverClip('vg_talk', CLIPS.mc_Idle_Talking_Loop); CLIPS.vg_talk.loop = true; }
    }
    this.anim.poseHook = (J, dt) => this.posture(J, dt);
    this.root = this.rig.root;
    this.scale = this.rig.scale || 1;
    this.k = this.scale / 1.6;                // (sizes below were tuned at scale 1.6)
    this.height = this.rig.height;
    this.radius = 0.95 * this.k;
    this.headY = this.height * 0.9;
    this.collapseDur = 1.4;
    this.lingerTime = 2.2;       // (monsters.js: how long the body stays before it fades)
    this.fadeDur = 2.4;
    this.dead = false;
    this.deathT = -1;
    this.t = Math.random() * 10;
    this.hover = 0; this.hoverTarget = 1;     // 0 standing / sitting .. 1 levitating
    this.lift = 0;                            // metres above the floor (the boss adds it to the root)
    this.flinchT = -1; this.flinchDir = 1;
    this.hl = 0; this.hlTarget = 0; this.flash = 0;
    this.cast = [0, 0]; this.castTarget = [0, 0];   // hand glow [right (gold), left (violet)]
    this.rage = 0; this.rageTarget = 0;             // the golden halo
    this.vanish = 0;                                // blink: 0 visible .. 1 gone
    this.moveTarget = 0;
    this.onImpact = null;
    // her own material: environment reflections on the gold, rim light for hover highlight and hit flash
    const m = this.rig.skinned.material.clone();
    m.envMap = envTexture();
    m.envMapIntensity = 0.9;
    applyRim(m, '#000000', 2.2);
    this.rim = m.userData.uRimColor.value;
    this.rig.skinned.material = m;
    this.mat = m;
    this.baseEmissive = m.emissive.clone();
    // hand glows ride in the hand holders (inside the scaled rig: sizes compensate the scale)
    this.handGlow = [sprite(GOLD, 0.9 / this.scale), sprite(VIOLET, 0.9 / this.scale)];
    this.rig.weaponHolder.add(this.handGlow[0]);
    this.rig.weaponHolderL.add(this.handGlow[1]);
    // the halo behind her head
    const head = this.rig.jointFrame('head');
    this.halo = sprite('#ffe6a0', (0.9 * this.k) / this.scale, haloTexture());
    this.halo.position.set(0, (0.2 * this.k) / this.scale, (-0.16 * this.k) / this.scale);
    if (head) head.add(this.halo);
  }

  // ---------------------------------------------------------------- actions
  play(name, opts = {}) {
    if (this.deathT >= 0 || !CLIPS[name]) return null;
    return this.anim.play(name, { fadeIn: 0.2, fadeOut: 0.3, ...opts });
  }
  stopAction() { this.anim.stop(); }
  // sitting on the throne (talking = gesturing while she speaks)
  sit(talking = false) {
    this.hoverTarget = 0; this.hover = 0;
    const name = talking ? 'mc_Sitting_Talking_Loop' : 'mc_Sitting_Idle_Loop';
    if (CLIPS[name]) this.anim.play(name, { fadeIn: 0.35, fadeOut: 0.3 });
  }
  standUp() {
    if (CLIPS.mc_Sitting_Exit) this.anim.play('mc_Sitting_Exit', { fadeIn: 0.15, fadeOut: 0.45 });
    else this.anim.stop();
  }
  talk(on) {
    if (on && CLIPS.vg_talk) this.anim.play('vg_talk', { fadeIn: 0.3, fadeOut: 0.4 });
    else if (!on && this.anim.action && this.anim.action.clip === CLIPS.vg_talk) this.anim.stop();
  }
  setHover(on) { this.hoverTarget = on ? 1 : 0; }
  setCast(right, left = 0) { this.castTarget[0] = right; this.castTarget[1] = left; }
  setRage(on) { this.rageTarget = on ? 1 : 0; }
  handWorld(side, out = new THREE.Vector3()) {
    const h = side === 'L' ? this.rig.weaponHolderL : this.rig.weaponHolder;
    h.updateWorldMatrix(true, false);
    return h.getWorldPosition(out);
  }
  headWorld(out = new THREE.Vector3()) {
    const b = this.rig.bones[this.rig.bones.Bone_025 ? 'Bone_025' : 'Bone_024'];
    b.updateWorldMatrix(true, false);
    return b.getWorldPosition(out);
  }
  // hips height above the root (for seating her exactly on the throne cushion)
  hipsAbove() {
    this.root.updateMatrixWorld(true);
    const b = this.rig.bones.Bone_001;
    return b.getWorldPosition(_v).y - this.root.position.y;
  }

  // ---------------------------------------------------------------- monster model interface
  setMoving(v) { this.moveTarget = v; }
  attack() { return 0; }
  hit() {
    if (this.deathT >= 0) return;
    this.flash = 1;
    this.flinchT = 0; this.flinchDir = 0.7 + Math.random() * 0.5;
  }
  die() {
    if (this.deathT >= 0) return;
    this.deathT = 0;
    this.anim.dead = true;
    this.hoverTarget = 0;
    this.castTarget = [0, 0];
    this.rageTarget = 0;
    this.anim.play(CLIPS.mc_Death01 ? 'mc_Death01' : 'vg_raise', { fadeIn: 0.2 });
  }
  setHighlight(on) { this.hlTarget = on ? 1 : 0; }

  // levitation and hit flinch, layered on the locomotion pose (before clips blend in)
  posture(J, dt) {
    const k = this.hover;
    if (k > 0.001) for (const [ch, v] of Object.entries(HOVER)) {
      const o = J[ch];
      o[0] += (v[0] - o[0]) * k; o[1] += (v[1] - o[1]) * k; o[2] += (v[2] - o[2]) * k;
    }
    // a slow sway while she floats
    const s = Math.sin(this.t * 1.3) * 0.04 * k;
    J.armL[2] += s; J.armR[2] += s; J.spine[2] += s * 0.4; J.head[1] += Math.sin(this.t * 0.7) * 0.05 * k;
    if (this.flinchT >= 0) {
      this.flinchT += dt;
      const f = this.flinchT < 0.08 ? this.flinchT / 0.08 : Math.max(0, 1 - (this.flinchT - 0.08) / 0.35);
      const q = f * f * (3 - 2 * f) * this.flinchDir;
      J.spine[0] -= 0.18 * q; J.chest[0] -= 0.12 * q; J.head[0] -= 0.25 * q; J.head[1] += 0.15 * q;
      J.armL[2] += 0.25 * q; J.armR[2] -= 0.25 * q;
      if (this.flinchT > 0.45) this.flinchT = -1;
    }
  }

  update(dt) {
    if (this.dead) return;
    this.t += dt;
    const hk = 1 - Math.exp(-3.5 * dt);
    this.hover += (this.hoverTarget - this.hover) * hk;
    this.lift = this.hover * (0.34 + Math.sin(this.t * 1.6) * 0.07) * this.k;
    this.anim.speed = 0;
    this.anim.groundSpeed = 0;
    this.anim.update(dt, null);
    // glows: hands, halo; highlight and hit flash on the rim
    for (let i = 0; i < 2; i++) {
      this.cast[i] += (this.castTarget[i] - this.cast[i]) * (1 - Math.exp(-8 * dt));
      const g = this.handGlow[i];
      g.material.opacity = this.cast[i] * (0.75 + 0.25 * Math.sin(this.t * 17 + i * 2));
      g.scale.setScalar(((0.7 + this.cast[i] * 0.7) * this.k / this.scale) * (1 + 0.1 * Math.sin(this.t * 11 + i)));
    }
    this.rage += (this.rageTarget - this.rage) * (1 - Math.exp(-2 * dt));
    this.halo.material.opacity = this.rage * (0.8 + 0.2 * Math.sin(this.t * 3));
    this.halo.material.rotation = this.t * 0.4;
    this.hl += (this.hlTarget - this.hl) * (1 - Math.exp(-14 * dt));
    this.flash = Math.max(0, this.flash - dt * 5);
    this.rim.setRGB(0.5 * this.hl + 1.0 * this.flash + 0.25 * this.rage, 0.42 * this.hl + 0.55 * this.flash + 0.16 * this.rage, 0.3 * this.hl + 0.3 * this.flash + 0.02 * this.rage);
    // blink: squeezed into a sliver of light
    const v = this.vanish, sc = this.scale;
    this.root.scale.set(sc * (1 - v * 0.96), sc * (1 + v * 0.35), sc * (1 - v * 0.96));
    this.rig.skinned.visible = v < 0.98;
    // the fall: she collapses, then dissolves into gold (emissive gold rising through the body while it fades)
    if (this.deathT >= 0) {
      this.deathT += dt;
      const d = smoothstep(this.collapseDur * 0.6, this.lingerTime + this.fadeDur, this.deathT);
      this.mat.emissive.copy(this.baseEmissive).lerp(GOLD, d * 0.9);
      if (this.deathT > this.collapseDur * 0.6 && G.fx && Math.random() < dt * 40 * (1 - d * 0.5)) {
        this.root.updateMatrixWorld(true);
        const b = this.rig.bones[['Bone_001', 'Bone_007', 'Bone_025', 'Bone_017', 'Bone_022', 'Bone_027', 'Bone_030'][(Math.random() * 7) | 0]];
        b.getWorldPosition(_v);
        G.fx.particles.emit({ x: _v.x + (Math.random() - 0.5) * 0.6, y: _v.y, z: _v.z + (Math.random() - 0.5) * 0.6, vx: (Math.random() - 0.5) * 0.8, vy: 1.2 + Math.random() * 2.2, vz: (Math.random() - 0.5) * 0.8, life: 1.4, size: 0.3, color: Math.random() < 0.8 ? GOLD : VIOLET, grav: -0.5, drag: 0.8 });
      }
      if (this.deathT > this.lingerTime) {
        const f = clamp((this.deathT - this.lingerTime) / this.fadeDur, 0, 1);
        if (!this.mat.transparent) { this.mat.transparent = true; this.mat.needsUpdate = true; this.rig.skinned.castShadow = false; }
        this.mat.opacity = 1 - f;
        if (f >= 1) { this.dead = true; this.root.visible = false; }
      }
    }
  }

  dispose() {
    this.mat.dispose();
    for (const s of [...this.handGlow, this.halo]) s.material.dispose();
    this.root.parent?.remove(this.root);
  }
}

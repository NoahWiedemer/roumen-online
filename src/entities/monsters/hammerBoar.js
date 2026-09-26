// Hammer Boar — a hunched boar-man in white spiky fur (the user's Eber.glb, auto-rigged) carrying a long iron-bound
// maul on his right shoulder. Slow but heavy: he lifts the maul off his shoulder, winds up with both paws, holds,
// then smashes it down in front of him (the hero can step out of reach during the wind-up), recoils and puts the
// maul back on his shoulder. Implements the monster model interface of monsters.js like SkinnedMonster.
//
// How it moves:
// - body: the motion-capture idle / walk / hit / death clips the hero uses (mocap.js), with a brute posture layered
//   on top (hunched back, bent knees, wide stance, the maul arm held to the shoulder)
// - the maul sits in the palm of the right paw; while carried it is aimed every frame so the shaft runs through
//   the paw AND over the top of the shoulder (it rests there whatever the body does); during the smash the paw's
//   own rotation swings it
// - the smash is a smooth-curve clip (no stop at every key), with anticipation, a hold at the top and a recoil
import * as THREE from 'three';
import { Animator, Clip, CLIPS, fullPose, P_DEAD } from '../anim.js';
import { createNpcRig } from '../npcModels.js';
import { mocapReady, getMocap } from '../mocap.js';
import { applyRim, envTexture } from './common.js';
import { G } from '../../game/game.js';
import { MONSTERS } from '../../game/data.js';
import { smoothstep } from '../../core/utils.js';

// ------------------------------------------------------------------ the maul (built in code)
// In the hand holder: grip at the origin, shaft along +Y; the head sits across the shaft at the far end.
const SHAFT = 1.28;                                                          // model units (x1.45 in the game)
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
  const L = SHAFT;
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
// (the base pose of the clips and the fallback idle when no motion clips are loaded)
// paw in front of the chest, about half a metre before and below the shoulder, so the shaft lies back over it at
// ~38 degrees (the maul is aimed at the shoulder, see aimHammer)
const CARRY = { armR: [-1.1, 0.3, 0.02], elbowR: [-1.05, 0, 0], handR: [-0.988, -0.241, -0.701] };
export const P_BOAR = fullPose({
  pos: [0, -0.06, 0],
  hips: [0.08, 0.05, 0], spine: [0.22, 0, 0], chest: [0.1, -0.05, 0], neck: [-0.1, 0, 0], head: [-0.22, 0, 0],
  ...CARRY,
  armL: [-0.1, 0, 0.3], elbowL: [-0.45, 0, 0], handL: [0.1, 0, 0.1],
  legL: [-0.3, 0.08, 0.12], kneeL: [0.5, 0, 0], footL: [-0.18, 0, -0.04],
  legR: [-0.12, -0.08, -0.12], kneeR: [0.42, 0, 0], footR: [-0.2, 0, 0.04],
});
// posture layered on the motion-capture body (added to the clip's joint angles)
const HUNCH = {
  spine: [0.13, 0, 0], chest: [0.07, 0, 0], neck: [-0.05, 0, 0], head: [-0.2, 0, 0],
  legL: [-0.16, 0, 0.06], kneeL: [0.32, 0, 0], footL: [-0.15, 0, 0],
  legR: [-0.16, 0, -0.06], kneeR: [0.32, 0, 0], footR: [-0.15, 0, 0],
  armL: [0, 0, 0.14], elbowL: [-0.15, 0, 0],
};

// The smash. Hand angles were solved so the shaft continues the line of the arms in the world (the torso bends
// ~60 degrees at the impact, so "forward" for the arms is far forward relative to the chest).
const SMASH = { dur: 2.6, hit: 1.34 };
const AIM = {
  lift: [-0.754, -0.299, -1.26], liftL: [-0.499, 0.263, -1.286],
  up: [0.167, -0.162, 0.166], upL: [0.226, 0.267, -0.176],
  top: [0.363, -0.15, 0.155], topL: [0.42, 0.258, -0.154],
  hit: [1.156, 0.264, 0.3], hitL: [0.9, 0, 0],
  low: [1.135, 0.216, 0.316], lowL: [1.263, -0.435, -0.571],
  rise: [0.42, -0.273, -0.032],
};
CLIPS.hammer_smash = new Clip('hammer_smash', {
  duration: SMASH.dur, base: P_BOAR, curve: 'smooth',
  events: [{ t: SMASH.hit, name: 'hit' }],
  keys: [
    { t: 0, ...P_BOAR },
    // anticipation: dips, lifts the maul off the shoulder, the left paw comes up to the shaft
    { t: 0.32, pos: [0, -0.1, -0.02], hips: [0.1, 0.05, 0], spine: [0.27, 0, 0], chest: [0.12, -0.05, 0], head: [-0.25, 0, 0],
      armR: [-0.75, 0.1, -0.28], elbowR: [-1.5, 0, 0], handR: AIM.lift, armL: [-1.1, 0, 0.35], elbowL: [-1.4, 0, 0], handL: AIM.liftL,
      legL: [-0.36, 0.08, 0.12], kneeL: [0.62, 0, 0], legR: [-0.16, -0.08, -0.12], kneeR: [0.5, 0, 0] },
    // up: both paws overhead, torso arched back, weight on the back leg, left foot steps forward
    { t: 0.85, pos: [0, 0.02, -0.06], hips: [-0.05, -0.15, 0], spine: [-0.18, -0.1, 0], chest: [-0.2, -0.05, 0], head: [-0.15, 0, 0],
      armR: [-2.6, 0, -0.25], elbowR: [-0.85, 0, 0], handR: AIM.up, armL: [-2.45, 0, 0.35], elbowL: [-1.05, 0, 0], handL: AIM.upL,
      legL: [-0.45, 0.1, 0.14], kneeL: [0.55, 0, 0], footL: [-0.1, 0, 0], legR: [0.1, -0.1, -0.14], kneeR: [0.3, 0, 0] },
    // held at the top for a beat (the tell)
    { t: 1.1, stop: true, pos: [0, 0.04, -0.08], spine: [-0.26, -0.1, 0], chest: [-0.24, -0.05, 0],
      armR: [-2.8, 0, -0.25], elbowR: [-0.95, 0, 0], handR: AIM.top, armL: [-2.65, 0, 0.35], elbowL: [-1.15, 0, 0], handL: AIM.topL },
    // impact in front
    { t: SMASH.hit, stop: true, pos: [0, -0.2, 0.16], hips: [0.2, 0.1, 0], spine: [0.6, 0.05, 0], chest: [0.3, 0, 0], head: [-0.35, 0, 0],
      armR: [-1.65, 0, -0.12], elbowR: [-0.1, 0, 0], handR: AIM.hit, armL: [-1.75, 0, 0.2], elbowL: [-0.3, 0, 0], handL: AIM.hitL,
      legL: [-0.85, 0.1, 0.14], kneeL: [1.0, 0, 0], footL: [-0.1, 0, 0], legR: [0.25, -0.1, -0.14], kneeR: [0.55, 0, 0] },
    // recoil: the maul bounces a little, the body sags into it
    { t: 1.52, pos: [0, -0.17, 0.14], spine: [0.56, 0.05, 0], armR: [-1.75, 0, -0.12], armL: [-1.85, 0, 0.2] },
    // straighten up, the maul comes up in front ...
    { t: 1.9, pos: [0, -0.12, 0.08], hips: [0.15, 0.05, 0], spine: [0.35, 0, 0], chest: [0.15, 0, 0], head: [-0.25, 0, 0],
      armR: [-1.2, 0, -0.15], elbowR: [-0.5, 0, 0], handR: AIM.low, armL: [-1.25, 0, 0.2], elbowL: [-0.6, 0, 0], handL: AIM.lowL,
      legL: [-0.5, 0.08, 0.12], kneeL: [0.7, 0, 0], legR: [0, -0.08, -0.12], kneeR: [0.45, 0, 0] },
    // ... and swings back onto the shoulder
    { t: 2.25, pos: [0, -0.08, 0], hips: [0.1, 0.05, 0], spine: [0.25, 0, 0], chest: [0.1, -0.05, 0],
      armR: [-0.55, 0.1, -0.3], elbowR: [-1.35, 0, 0], handR: AIM.rise, armL: [-0.3, 0, 0.3], elbowL: [-0.5, 0, 0], handL: [0.1, 0, 0.1] },
    { t: SMASH.dur, ...P_BOAR },
  ],
});
// fallback death when no motion clips are loaded: stagger back, fall on the back
CLIPS.boar_down = new Clip('boar_down', {
  duration: 1.3, base: P_BOAR, expression: 'hurt', curve: 'smooth',
  keys: [
    { t: 0, ...P_BOAR },
    { t: 0.2, pos: [0, -0.02, -0.12], spine: [-0.35, 0.1, 0], chest: [-0.2, 0, 0], head: [-0.5, 0.3, 0], armR: [-0.5, 0, -1.0], elbowR: [-0.4, 0, 0], armL: [-0.3, 0, 0.9] },
    { t: 0.7, pos: [0, -0.38, -0.18], hips: [-0.75, 0.2, 0], spine: [-0.1, 0, 0], kneeL: [1.3, 0, 0], kneeR: [1.1, 0, 0], legL: [-0.6, 0, 0.1], legR: [-0.4, 0, -0.1] },
    { t: 1.1, stop: true, ...P_DEAD },
    { t: 1.3, ...P_DEAD },
  ],
});

const _g = new THREE.Vector3(), _s = new THREE.Vector3(), _d = new THREE.Vector3(), _x = new THREE.Vector3(), _z = new THREE.Vector3();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _qh = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0);

export class HammerBoarMonster {
  constructor(type, { tint } = {}) {
    this.type = type;
    this.rig = createNpcRig('eber', { name: 'monster:' + type });
    this.anim = new Animator(this.rig, { idlePose: P_BOAR, gait: 'free' });
    this.anim.runOverride = CARRY;                 // (procedural fallback) the maul stays on the shoulder while walking
    if (mocapReady()) {
      this.anim.useMocap(getMocap());
      this.anim.walkOnly = true;                   // heavy: never breaks into a jog (no flight phase)
      this.anim.poseHook = (J, dt) => this.posture(J, dt);
    }
    this.root = this.rig.root;
    const scale = this.rig.scale || 1;
    this.height = this.rig.height;
    this.radius = 0.7 * scale;
    this.headY = this.height * 0.82;
    this.impactTime = SMASH.hit;
    this.collapseDur = 1.3;
    this.lingerTime = 3.5;
    this.fadeDur = 1.3;
    this.maxSpeed = MONSTERS[type]?.speed || 2.1;   // the walk cycle follows the real ground speed
    this.flinchT = -1; this.flinchDir = 1;
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
    this.carry = 1;                               // 1 = maul resting on the shoulder (aimed), 0 = swung by the paw
    this.drop = null;                             // the maul falling to the ground after the knockout
    this.fitGrip();
  }

  // grip in the palm of the paw (between the wrist and the three claws) and a rest point on top of the right
  // shoulder, measured on the posed rig
  fitGrip() {
    const B = this.rig.bones;
    this.anim.update(0, null);
    this.root.updateMatrixWorld(true);
    const palm = new THREE.Vector3(), v = new THREE.Vector3();
    for (const n of ['Bone_024', 'Bone_040', 'Bone_043', 'Bone_046']) palm.add(B[n].getWorldPosition(v));
    palm.multiplyScalar(0.25);
    const holder = this.rig.weaponHolder;
    holder.parent.worldToLocal(holder.position.copy(palm));
    // shoulder top: between the clavicle root and the shoulder joint, lifted to the top of the fur
    const cl = B.Bone_028.getWorldPosition(new THREE.Vector3()), sh = B.Bone_027.getWorldPosition(new THREE.Vector3());
    const rest = cl.lerp(sh, 0.62);
    rest.y += 0.16 * (this.rig.scale || 1);
    this.shoulder = new THREE.Object3D();
    B.Bone_028.add(this.shoulder);
    B.Bone_028.worldToLocal(this.shoulder.position.copy(rest));
  }

  // brute posture on the motion-capture body: hunched, knees bent, the maul arm held up to the shoulder; hits
  // make him flinch (layered, so the maul stays where it is)
  posture(J, dt) {
    for (const [k, v] of Object.entries(HUNCH)) { const o = J[k]; o[0] += v[0]; o[1] += v[1]; o[2] += v[2]; }
    if (this.flinchT >= 0) {
      this.flinchT += dt;
      const f = this.flinchT < 0.08 ? this.flinchT / 0.08 : Math.max(0, 1 - (this.flinchT - 0.08) / 0.4);
      const k = f * f * (3 - 2 * f) * this.flinchDir;
      J.spine[0] -= 0.22 * k; J.chest[0] -= 0.16 * k; J.head[0] -= 0.3 * k; J.head[1] += 0.2 * k;
      J.armL[0] -= 0.35 * k; J.armL[2] += 0.25 * k; J.elbowL[0] -= 0.4 * k;
      J.pos[2] -= 0.03 * k;
      if (this.flinchT > 0.5) this.flinchT = -1;
    }
    // the carrying arm follows the breathing / walking body only a little (always on: the smash blends over it,
    // so fading in and out of the smash starts and ends at the shoulder)
    const sway = Math.sin(this.t * 1.7) * 0.03;
    for (const k of ['armR', 'elbowR', 'handR']) {
      const o = J[k], c = CARRY[k];
      o[0] = c[0] + (k === 'armR' ? sway : 0); o[1] = c[1]; o[2] = c[2];
    }
  }

  // aim the maul: while carried the shaft runs from the grip over the shoulder rest point; blends with the
  // paw's own orientation (carry < 1) during the smash
  aimHammer() {
    const h = this.hammer;
    if (this.carry <= 0.001) { h.quaternion.identity(); return; }
    const holder = this.rig.weaponHolder;
    holder.updateWorldMatrix(true, false);
    holder.getWorldPosition(_g);
    this.shoulder.getWorldPosition(_s);
    _d.subVectors(_s, _g).normalize();
    // basis: shaft (+Y) through the shoulder, head across it and level (+Z horizontal)
    _z.crossVectors(_d, _up);
    if (_z.lengthSq() < 1e-6) _z.set(1, 0, 0);
    _z.normalize();
    _x.crossVectors(_d, _z).normalize();
    _m.makeBasis(_x, _d, _z);
    _q.setFromRotationMatrix(_m);
    holder.getWorldQuaternion(_qh);
    _qh.invert().multiply(_q);                                   // into the holder's space
    h.quaternion.identity().slerp(_qh, this.carry);
  }

  setMoving(v) { this.moveTarget = v; }
  attack() {
    if (this.deathT >= 0) return 0;
    this.anim.battleTarget = 1;
    this.anim.play('hammer_smash', { fadeIn: 0.25, fadeOut: 0.4, onEvent: (e) => { if (e === 'hit') this.smashImpact(); } });
    return this.impactTime;
  }
  // the maul hits the ground in front: dust ring, rumble (monsters.js adds shake + thud for strength > 1)
  smashImpact() {
    this.onImpact?.(1.4);
    if (!G.fx) return;
    this.hammer.updateWorldMatrix(true, true);
    this.hammer.userData.head.getWorldPosition(_g);
    const y = G.terrain ? G.terrain.groundAt(_g.x, _g.z) : 0;
    const p = new THREE.Vector3(_g.x, y, _g.z);
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
    if (this.anim.mocap) { this.flinchT = 0; this.flinchDir = 0.8 + Math.random() * 0.4; }
    else if (!this.anim.busy) this.anim.play('hit');
  }
  die() {
    if (this.deathT >= 0) return;
    this.deathT = 0;
    this.anim.dead = true;
    this.anim.play(this.anim.mocap && CLIPS.mc_Death01 ? 'mc_Death01' : 'boar_down', { fadeIn: 0.15 });
    // the maul slips out of the paw and drops
    const world = this.root.parent;
    if (world) {
      this.aimHammer();
      world.attach(this.hammer);
      this.drop = { vy: 0.5, spin: (Math.random() < 0.5 ? -1 : 1) * (1.5 + Math.random()), done: false };
    }
  }
  setHighlight(on) { this.hlTarget = on ? 1 : 0; }

  update(dt) {
    if (this.dead) return;
    this.t += dt;
    const s = this.deathT >= 0 ? 0 : this.moveTarget;
    this.anim.speed += (s - this.anim.speed) * (1 - Math.exp(-6 * dt));
    this.anim.groundSpeed = s * this.maxSpeed;
    this.anim.update(dt, null);
    // carried on the shoulder unless he is swinging it: off quickly as the smash lifts it, back on as it lands there
    const a = this.anim.action;
    const smash = a && !a.done && a.clip === CLIPS.hammer_smash ? a.t : -1;
    const target = smash < 0 ? 1 : 1 - smoothstep(0.12, 0.45, smash) + smoothstep(SMASH.dur - 0.5, SMASH.dur - 0.08, smash);
    this.carry += (target - this.carry) * (1 - Math.exp(-(smash < 0 ? 8 : 30) * dt));
    if (!this.drop) this.aimHammer(); else this.updateDrop(dt);
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
        if (f >= 1) { this.dead = true; this.root.visible = false; this.hammer.visible = false; }
      }
    }
  }

  // the dropped maul: falls, tips over and comes to rest lying on the ground
  updateDrop(dt) {
    const d = this.drop, h = this.hammer;
    if (d.done) return;
    d.vy -= 14 * dt;
    h.position.y += d.vy * dt;
    h.rotateOnWorldAxis(_up, d.spin * dt * 0.3);
    // tip over towards lying flat (shaft horizontal)
    _d.set(0, 1, 0).applyQuaternion(h.quaternion);
    const tilt = Math.acos(Math.min(1, Math.abs(_d.y)));
    if (tilt < Math.PI / 2 - 0.05) {
      _x.crossVectors(_d, _up).normalize();
      if (_x.lengthSq() > 1e-6) h.rotateOnWorldAxis(_x, -Math.min(dt * 5, Math.PI / 2 - tilt) * Math.sign(_d.y || 1));
    }
    const ground = (G.terrain ? G.terrain.groundAt(h.position.x, h.position.z) : 0) + 0.12;
    if (h.position.y <= ground) {
      h.position.y = ground;
      if (d.vy < -2) { d.vy *= -0.25; if (G.audio) G.audio.play('stomp'); }
      else d.done = tilt >= Math.PI / 2 - 0.08;
      if (!d.done) d.vy = Math.max(d.vy, 0);
    }
  }

  dispose() {
    this.mat.dispose();
    if (this.mat.transparent) this.hammer.traverse((o) => { if (o.isMesh) o.material.dispose(); });
    this.hammer.removeFromParent();
    this.root.parent?.remove(this.root);
  }
}

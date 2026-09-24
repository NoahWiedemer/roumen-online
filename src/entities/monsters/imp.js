// Imp — built from the user's model /models/imp.glb (static mesh). At preload we estimate a skeleton from the
// geometry (hand-measured joint table in model space), compute smooth skin weights (distance-to-bone-segment,
// power falloff, max 4 influences; weapon+fist, skull and ear-wings rigid), build a THREE.SkinnedMesh template and
// animate its bones procedurally. Instances are cloned with SkeletonUtils.clone.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { MonsterBase, Spring, track, ease, seg, bump, clamp, lerp, smoothstep, envTexture, TAU } from './common.js';

const BASE = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '/';
const MODEL_URL = BASE + 'models/imp.glb';
const GAME_HEIGHT = 1.35;

// Joint positions in raw model space (feet at y≈-0.93, facing +Z; imp's right side = -X, weapon in right hand)
const J = {
  hips: [0.06, -0.12, -0.4], spine: [0.05, 0.05, -0.34], chest: [0.03, 0.22, -0.22], neck: [0.0, 0.36, -0.02],
  head: [0.0, 0.45, 0.2], headEnd: [0.0, 0.8, 0.42],
  earL: [0.37, 0.6, 0.3], earLEnd: [0.68, 0.8, 0.27], earR: [-0.37, 0.6, 0.32], earREnd: [-0.66, 0.8, 0.32],
  shoulderL: [0.25, 0.26, -0.06], elbowL: [0.35, -0.12, 0.05], handL: [0.37, -0.47, 0.13], handLEnd: [0.36, -0.68, 0.15],
  shoulderR: [-0.2, 0.26, -0.12], elbowR: [-0.35, -0.12, -0.12], handR: [-0.39, -0.47, -0.02], handREnd: [-0.39, -0.68, 0.04],
  thighL: [0.2, -0.16, -0.36], kneeL: [0.37, -0.36, -0.2], ankleL: [0.5, -0.78, -0.38], toeL: [0.53, -0.9, -0.12],
  thighR: [-0.06, -0.16, -0.4], kneeR: [-0.22, -0.34, -0.24], ankleR: [-0.25, -0.78, -0.4], toeR: [-0.3, -0.9, -0.12],
  tail1: [0.08, -0.12, -0.52], tail2: [0.18, -0.2, -0.66], tail3: [0.24, -0.3, -0.8], tailEnd: [0.27, -0.38, -0.93],
};
// bone → parent (root is an extra bone at the ground origin)
const PARENT = {
  hips: 'root', spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck', earL: 'head', earR: 'head',
  shoulderL: 'chest', elbowL: 'shoulderL', handL: 'elbowL', shoulderR: 'chest', elbowR: 'shoulderR', handR: 'elbowR',
  thighL: 'hips', kneeL: 'thighL', ankleL: 'kneeL', thighR: 'hips', kneeR: 'thighR', ankleR: 'kneeR',
  tail1: 'hips', tail2: 'tail1', tail3: 'tail2',
};
// segments each bone owns for skin weighting
const SEG = {
  hips: [['hips', 'spine'], ['hips', 'thighL'], ['hips', 'thighR'], ['hips', 'tail1']],
  spine: [['spine', 'chest']], chest: [['chest', 'neck'], ['chest', 'shoulderL'], ['chest', 'shoulderR']],
  neck: [['neck', 'head']], head: [['head', 'headEnd']], earL: [['earL', 'earLEnd']], earR: [['earR', 'earREnd']],
  shoulderL: [['shoulderL', 'elbowL']], elbowL: [['elbowL', 'handL']], handL: [['handL', 'handLEnd']],
  shoulderR: [['shoulderR', 'elbowR']], elbowR: [['elbowR', 'handR']], handR: [['handR', 'handREnd']],
  thighL: [['thighL', 'kneeL']], kneeL: [['kneeL', 'ankleL']], ankleL: [['ankleL', 'toeL']],
  thighR: [['thighR', 'kneeR']], kneeR: [['kneeR', 'ankleR']], ankleR: [['ankleR', 'toeR']],
  tail1: [['tail1', 'tail2']], tail2: [['tail2', 'tail3']], tail3: [['tail3', 'tailEnd']],
};
const BONES = ['root', ...Object.keys(PARENT)];

// ------------------------------------------------------------------ skinning
function computeSkin(pos) {
  const n = pos.count;
  const B = BONES.length;
  const segs = [];
  for (const [bone, list] of Object.entries(SEG)) {
    const bi = BONES.indexOf(bone);
    for (const [a, b] of list) segs.push([bi, ...J[a], ...J[b]]);
  }
  const skinIndex = new Uint16Array(n * 4), skinWeight = new Float32Array(n * 4);
  const dist = new Float32Array(B), w = new Float32Array(B);
  const bi = (name) => BONES.indexOf(name);
  const HAND_R = bi('handR'), HEAD = bi('head'), EAR_L = bi('earL'), EAR_R = bi('earR'), NECK = bi('neck');
  const KNEE_R = bi('kneeR'), THIGH_R = bi('thighR'), ANKLE_R = bi('ankleR');
  const ARM = ['shoulderL', 'elbowL', 'handL', 'shoulderR', 'elbowR', 'handR'].map(bi);
  const LEG = ['thighL', 'kneeL', 'ankleL', 'thighR', 'kneeR', 'ankleR'].map(bi);
  const TAIL = ['tail1', 'tail2', 'tail3'].map(bi);
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    dist.fill(1e9);
    for (const s of segs) {
      const ax = s[1], ay = s[2], az = s[3], dx = s[4] - ax, dy = s[5] - ay, dz = s[6] - az;
      let t = ((x - ax) * dx + (y - ay) * dy + (z - az) * dz) / (dx * dx + dy * dy + dz * dz);
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const d = Math.hypot(x - ax - dx * t, y - ay - dy * t, z - az - dz * t);
      if (d < dist[s[0]]) dist[s[0]] = d;
    }
    for (let b = 0; b < B; b++) w[b] = dist[b] > 1e8 ? 0 : 1 / Math.pow(dist[b] + 0.02, 4);
    // region gating: ears only via the explicit rule, arms never reach the feet, legs never the upper body, tail only behind
    w[EAR_L] = w[EAR_R] = 0;
    if (y < -0.74) for (const k of ARM) w[k] = 0;
    if (y > 0.1) for (const k of LEG) w[k] = 0;
    if (z > -0.42) for (const k of TAIL) w[k] = 0;
    // rigid regions
    const nearLeg = Math.min(dist[KNEE_R], dist[THIGH_R], dist[ANKLE_R]) < dist[HAND_R];
    const weapon = !nearLeg && ((x < -0.22 && z > 0.12 && y < -0.02) || (x < -0.25 && y > -0.77 && y < -0.42 && z > -0.22));
    const hx = x, hy = y - 0.62, hz = z - 0.36;
    const skull = Math.hypot(hx, hy, hz) < 0.42 && y > 0.33 && Math.abs(x) < 0.4;
    const ax = Math.abs(x);
    if (weapon) { w.fill(0); w[HAND_R] = 1; }
    else if (y > 0.3 && ax > 0.36) {
      const e = smoothstep(0.36, 0.47, ax);
      w.fill(0); w[x > 0 ? EAR_L : EAR_R] = e; w[HEAD] = 1 - e;
    } else if (skull) {
      // soften the skull/neck border a little
      const k = smoothstep(0.33, 0.42, y);
      const neckW = w[NECK] / (w[NECK] + w[HEAD] + 1e-9);
      w.fill(0); w[HEAD] = 1 - (1 - k) * neckW * 0.5; w[NECK] = (1 - k) * neckW * 0.5;
    }
    // top 4
    let sum = 0;
    for (let k = 0; k < 4; k++) {
      let best = -1, bw = 0;
      for (let b = 0; b < B; b++) if (w[b] > bw) { bw = w[b]; best = b; }
      if (best < 0) { skinIndex[i * 4 + k] = 0; skinWeight[i * 4 + k] = 0; continue; }
      skinIndex[i * 4 + k] = best; skinWeight[i * 4 + k] = bw; sum += bw; w[best] = 0;
    }
    for (let k = 0; k < 4; k++) skinWeight[i * 4 + k] /= sum || 1;
  }
  return { skinIndex, skinWeight };
}

// ------------------------------------------------------------------ template (built once by preloadImp)
let template = null;
let loading = null;

export function impReady() { return !!template; }

export function preloadImp() {
  if (template) return Promise.resolve(template);
  if (loading) return loading;
  loading = new GLTFLoader().loadAsync(MODEL_URL).then((gltf) => {
    let src = null;
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((o) => { if (!src && o.isMesh) src = o; });
    if (!src) throw new Error('imp.glb: no mesh');
    const geo = src.geometry.clone();
    geo.applyMatrix4(src.matrixWorld);
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    const s = GAME_HEIGHT / (bb.max.y - bb.min.y), y0 = bb.min.y;
    // skin in raw space, then move to game space (feet at y=0, 1.35 m tall)
    const { skinIndex, skinWeight } = computeSkin(geo.attributes.position);
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
    geo.translate(0, -y0, 0);
    geo.scale(s, s, s);
    const toGame = (p) => new THREE.Vector3(p[0] * s, (p[1] - y0) * s, p[2] * s);

    const bones = {};
    const list = [];
    for (const name of BONES) {
      const b = new THREE.Bone();
      b.name = name;
      bones[name] = b;
      list.push(b);
    }
    for (const name of BONES) {
      if (name === 'root') continue;
      const p = PARENT[name];
      const wp = toGame(J[name]);
      const pp = p === 'root' ? new THREE.Vector3() : toGame(J[p]);
      bones[name].position.copy(wp.sub(pp));
      bones[p].add(bones[name]);
    }
    const mat = src.material.clone();
    mat.envMap = envTexture();
    mat.envMapIntensity = 0.55;
    if (mat.map) { mat.emissiveMap = mat.map; mat.emissive = new THREE.Color(0, 0, 0); }
    const mesh = new THREE.SkinnedMesh(geo, mat);
    mesh.name = 'imp';
    mesh.add(bones.root);
    mesh.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton(list));
    const group = new THREE.Group();
    group.add(mesh);
    template = {
      group, material: mat, scale: s,
      headY: toGame([0, 0.62, 0.36]).y,
      tris: geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3,
    };
    return template;
  });
  return loading;
}

// ------------------------------------------------------------------ model
export class ImpMonster extends MonsterBase {
  constructor(type, opts) {
    super(type, opts);
    const T = template;
    if (!T) throw new Error("Imp model not loaded yet — await preloadMonsterAssets() before createMonsterModel('imp')");
    this.height = GAME_HEIGHT; this.radius = 0.5; this.headY = T.headY;
    this.impactTime = 0.47; this.attackDur = 1.0; this.hitDur = 0.45; this.collapseDur = 0.95;
    this.impactStrength = 0.8;

    const mat = this.inst(T.material, { tint: 0.12, rim: ['#ffe4dc', 0.24, 2.4] });
    this.mover = new THREE.Group();
    this.root.add(this.mover);
    const obj = SkeletonUtils.clone(T.group);
    this.mover.add(obj);
    obj.traverse((o) => {
      if (o.isSkinnedMesh) {
        o.material = mat;
        o.castShadow = true;
        o.receiveShadow = false;
        o.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.7, 0), 1.35);
        this.skinned = o;
      }
    });
    this.b = {};
    for (const bone of this.skinned.skeleton.bones) {
      this.b[bone.name] = bone;
      bone.userData.base = bone.position.clone();
    }

    this.phase = Math.random() * TAU;
    this.flutterT = -1; this._nextFlutter = 1 + Math.random() * 3;
    this.twitchT = -1; this._nextTwitch = 2 + Math.random() * 4; this.twitch = 0;
    this.look = new Spring(40, 9); this._lookT = 0; this._lookTarget = 0;
    this.headLag = new Spring(90, 10);
    this.earSpring = new Spring(80, 5);
    this.tailSpring = new Spring(30, 4);
    this.prevY = 0;
    this.fallDir = Math.random() < 0.5 ? -1 : 1;

    const A = this.attackDur;
    this.trk = {
      // right (weapon) arm: raise overhead then chop down/forward
      shR: track([[0, 0], [0.3, -2.45, ease.outQuad], [0.4, -2.55], [0.47, 0.35, ease.inCubic], [0.62, 0.2], [A, 0]]),
      shRz: track([[0, 0], [0.3, -0.35], [0.47, 0.25], [0.62, 0.15], [A, 0]]),
      elR: track([[0, 0], [0.3, -1.1], [0.42, -0.9], [0.5, -0.05, ease.outQuad], [A, 0]]),
      // (weapon mesh is welded to the forearm → keep the wrist nearly locked, the snap comes from elbow/shoulder)
      wrR: track([[0, 0], [0.3, 0.1], [0.44, 0.08], [0.52, -0.06, ease.outQuad], [A, 0]]),
      twist: track([[0, 0], [0.3, -0.45, ease.outQuad], [0.47, 0.4, ease.inCubic], [0.62, 0.3], [A, 0]]),
      lean: track([[0, 0], [0.3, -0.22], [0.47, 0.35, ease.inCubic], [0.65, 0.25], [A, 0]]),
      z: track([[0, 0], [0.3, -0.08], [0.47, 0.3, ease.inQuad], [0.7, 0.24], [A, 0]]),
      crouch: track([[0, 0], [0.3, 0.05], [0.47, 0.08], [0.7, 0.05], [A, 0]]),
      shL: track([[0, 0], [0.3, -0.7], [0.47, 0.6], [0.65, 0.4], [A, 0]]),
    };
    this.hitTrk = track([[0, 0], [0.07, 1, ease.outQuad], [0.45, 0]]);
    const C = this.collapseDur, F = C + this.fadeDur;
    this.dieTrk = {
      buckle: track([[0, 0], [0.12, -0.15], [0.4, 1, ease.inQuad], [F, 1]]),
      fall: track([[0, 0], [0.25, 0.05], [0.62, 1.32, ease.inQuad], [0.74, 1.18, ease.outQuad], [0.86, 1.32, ease.inQuad], [F, 1.32]]),
      lift: track([[0, 0], [0.62, 0.1], [F, 0.1]]),
      sink: track([[0, 0], [C, 0], [F, -0.32, ease.inQuad]]),
    };
    this.animate(0);
    this._applyMaterials();
  }

  onHitStart() { this.earSpring.kick(6); this.headLag.kick(-3); this.tailSpring.kick(3); }

  dispose() {
    this.skinned?.skeleton?.dispose();
    super.dispose();
  }

  animate(dt) {
    const b = this.b, t = this.t;
    const dying = this.deathT >= 0;
    const a = smoothstep(0.02, 0.4, this.move) * (dying ? 0 : 1);
    const idle = 1 - a;
    const freq = 2.7 * lerp(0.75, 1.1, this.move);
    this.phase += dt * freq * TAU * (a > 0.01 ? 1 : 0);
    const ph = this.phase;

    // pose channels
    const P = {
      hipsY: 0, hipsRoll: 0, hipsPitch: 0, hipsYaw: 0, spinePitch: 0, chestPitch: 0, chestYaw: 0, chestRoll: 0,
      neckPitch: 0, headPitch: 0, headYaw: 0, headRoll: 0,
      shL: 0, shLz: 0, elL: 0, wrL: 0, shR: 0, shRz: 0, elR: 0, wrR: 0,
      thL: 0, knL: 0, thR: 0, knR: 0, thLz: 0, thRz: 0,
      earFlap: 0, earBack: 0, tailYaw: 0, tailPitch: 0,
    };
    let moverZ = 0, moverY = 0, moverRoll = 0;

    // --- idle: breathing, weight shift, twitchy head, ear flutter, tail sway
    const br = Math.sin(t * 2.1);
    P.chestPitch += 0.035 * br;
    P.spinePitch += 0.015 * br;
    P.shL += 0.04 * br; P.shR += 0.03 * br;
    const shift = Math.sin(t * 0.75);
    P.hipsRoll += 0.045 * shift * idle;
    P.thLz -= 0.045 * shift * idle; P.thRz -= 0.045 * shift * idle;
    P.chestRoll -= 0.03 * shift * idle;
    P.hipsY += -0.012 * (0.5 + 0.5 * Math.sin(t * 1.5)) * idle;
    P.knL += 0.05 * (0.5 + 0.5 * Math.sin(t * 1.5)) * idle; P.knR += 0.05 * (0.5 + 0.5 * Math.sin(t * 1.5)) * idle;
    this._lookT -= dt;
    if (this._lookT <= 0) { this._lookT = 1.2 + Math.random() * 2.8; this._lookTarget = (Math.random() - 0.5) * 0.9; }
    P.headYaw += this.look.step(this._lookTarget * idle, dt);
    // sudden creepy head tilt
    this._nextTwitch -= dt;
    if (this._nextTwitch <= 0 && this.twitchT < 0) { this.twitchT = 0; this._nextTwitch = 3 + Math.random() * 5; this._twDir = Math.random() < 0.5 ? -1 : 1; }
    if (this.twitchT >= 0) {
      this.twitchT += dt;
      P.headRoll += this._twDir * 0.35 * track([[0, 0], [0.08, 1, ease.outQuad], [0.9, 1], [1.1, 0]])(this.twitchT) * idle;
      if (this.twitchT > 1.1) this.twitchT = -1;
    }
    this._nextFlutter -= dt;
    if (this._nextFlutter <= 0 && this.flutterT < 0) { this.flutterT = 0; this._nextFlutter = 1.5 + Math.random() * 3.5; }
    let flutter = 0.08 * Math.sin(t * 1.9);
    if (this.flutterT >= 0) {
      this.flutterT += dt;
      flutter += 0.32 * Math.sin(this.flutterT * 34) * bump(this.flutterT, 0, 0.5);
      if (this.flutterT > 0.5) this.flutterT = -1;
    }
    P.earFlap += flutter;
    P.tailYaw += 0.3 * Math.sin(t * 1.35);
    P.tailPitch += 0.08 * Math.sin(t * 0.9 + 1);

    // --- skittering crouched gait
    if (a > 0) {
      const s = Math.sin(ph), c = Math.cos(ph);
      P.thL += -0.55 * a * s; P.thR += 0.55 * a * s;
      P.knL += 0.75 * a * Math.max(0, c); P.knR += 0.75 * a * Math.max(0, -c);
      P.hipsY += (-0.02 + 0.03 * Math.abs(s)) * a;
      P.hipsPitch += 0.12 * a;
      P.spinePitch += 0.1 * a; P.chestPitch += 0.06 * a + 0.04 * a * Math.sin(ph * 2);
      P.hipsYaw += 0.1 * a * s; P.chestYaw -= 0.14 * a * s;
      P.hipsRoll += 0.05 * a * c;
      P.shL += 0.6 * a * s; P.elL -= 0.3 * a * (0.5 + 0.5 * s);
      P.shR -= 0.35 * a * s; P.elR -= 0.2 * a;
      P.headPitch -= 0.18 * a; // keep looking ahead while leaning
      P.earBack += 0.4 * a; P.earFlap += 0.12 * a * Math.sin(ph * 2);
      P.tailPitch += 0.35 * a; P.tailYaw += 0.35 * a * Math.sin(ph + 1);
    }

    // --- attack
    if (this.attackT >= 0 && !dying) {
      const T = this.trk, at = this.attackT;
      P.shR += T.shR(at); P.shRz += T.shRz(at); P.elR += T.elR(at); P.wrR += T.wrR(at);
      P.chestYaw += T.twist(at); P.hipsYaw += T.twist(at) * 0.4;
      P.spinePitch += T.lean(at) * 0.6; P.chestPitch += T.lean(at) * 0.5;
      P.headPitch -= T.lean(at) * 0.6; P.headYaw *= 0.3; P.headYaw -= T.twist(at) * 0.7;
      P.shL += T.shL(at); P.elL -= 0.4 * bump(at, 0.1, 0.8);
      const cr = T.crouch(at);
      P.hipsY -= cr; P.knL += cr * 3; P.knR += cr * 3; P.thL -= cr * 1.5; P.thR -= cr * 1.5;
      P.earBack += 0.5 * bump(at, 0.1, 0.7); P.earFlap += 0.25 * bump(at, 0.3, 0.6);
      P.tailPitch += 0.5 * bump(at, 0.0, 0.9);
      moverZ += T.z(at);
      P.thL += -0.3 * bump(at, 0.3, 0.8); P.knL += 0.4 * bump(at, 0.3, 0.6);
      if (this._lat !== undefined && this._lat < this.impactTime && at >= this.impactTime) { this.headLag.kick(3); this.earSpring.kick(-5); }
      this._lat = at;
    } else this._lat = undefined;

    // --- hit flinch
    if (this.hitT >= 0 && !dying) {
      const h = this.hitTrk(this.hitT);
      P.chestPitch -= 0.35 * h; P.spinePitch -= 0.15 * h; P.headPitch -= 0.3 * h;
      P.shL -= 0.6 * h; P.shR -= 0.4 * h; P.elL -= 0.6 * h; P.elR -= 0.4 * h;
      P.earFlap += 0.4 * h; P.tailPitch += 0.4 * h;
      moverZ -= 0.09 * h;
    }

    // --- death: knees buckle, keel over sideways, limbs go limp, then sink/fade
    if (dying) {
      const D = this.dieTrk, d = this.deathT;
      const k = D.buckle(d);
      P.hipsY -= 0.12 * Math.max(0, k);
      P.knL += 1.1 * k; P.knR += 1.1 * k; P.thL -= 0.7 * k; P.thR -= 0.7 * k;
      P.chestPitch += 0.3 * k; P.headPitch += 0.4 * k + 0.15 * Math.sin(d * 8) * (1 - seg(d, 0, 0.9));
      P.shL += -0.4 * k; P.shR += -0.5 * k; P.elL -= 0.6 * k; P.elR -= 0.5 * k;
      P.earFlap -= 0.45 * seg(d, 0.2, 0.9); P.tailPitch -= 0.4 * k;
      moverRoll = this.fallDir * D.fall(d);
      moverY = D.lift(d) + D.sink(d);
    }

    // follow-through springs
    const vy = dt > 1e-5 ? (P.hipsY - this.prevY) / dt : 0;
    this.prevY = P.hipsY;
    const ear = this.earSpring.step(clamp(-vy * 2, -0.6, 0.6), dt);
    const tailLag = this.tailSpring.step(-P.hipsYaw * 1.5, dt);
    const hl = this.headLag.step(clamp(vy * 1.2, -0.3, 0.3), dt);

    // --- apply to bones
    const set = (name, x, y, z) => b[name].rotation.set(x, y, z);
    b.hips.position.copy(b.hips.userData.base);
    b.hips.position.y += P.hipsY;
    set('hips', P.hipsPitch, P.hipsYaw, P.hipsRoll);
    set('spine', P.spinePitch, 0, 0);
    set('chest', P.chestPitch, P.chestYaw, P.chestRoll);
    set('neck', P.neckPitch + 0.3 * P.headPitch, 0.3 * P.headYaw, 0);
    set('head', 0.7 * P.headPitch + hl, 0.7 * P.headYaw, P.headRoll);
    set('earL', 0, P.earBack, P.earFlap + ear);
    set('earR', 0, -P.earBack, -(P.earFlap + ear));
    set('shoulderL', P.shL, 0, P.shLz);
    set('elbowL', P.elL, 0, 0);
    set('handL', P.wrL, 0, 0);
    set('shoulderR', P.shR, 0, P.shRz);
    set('elbowR', P.elR, 0, 0);
    set('handR', P.wrR, 0, 0);
    const legPitch = P.hipsPitch;
    set('thighL', P.thL - legPitch, 0, P.thLz);
    set('kneeL', P.knL, 0, 0);
    set('ankleL', -(P.thL + P.knL) * 0.85, 0, 0);
    set('thighR', P.thR - legPitch, 0, P.thRz);
    set('kneeR', P.knR, 0, 0);
    set('ankleR', -(P.thR + P.knR) * 0.85, 0, 0);
    set('tail1', P.tailPitch * 0.5, P.tailYaw * 0.5 + tailLag * 0.3, 0);
    set('tail2', P.tailPitch * 0.4, P.tailYaw * 0.6 + tailLag * 0.5, 0);
    set('tail3', P.tailPitch * 0.3, P.tailYaw * 0.8 + tailLag * 0.7, 0);

    this.mover.position.set(0, moverY, moverZ);
    this.mover.rotation.set(0, 0, moverRoll);
  }
}

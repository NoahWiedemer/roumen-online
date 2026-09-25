// Rideable mounts, summoned from an item like in Fiesta: a chubby raccoon and a donkey (original designs built
// from primitives). Each has a procedural four-legged gait that goes from a lateral walk to a bounding gallop
// with speed, an idle (breathing, ear flicks, tail swish, looking around), a saddle and a rider anchor.
import * as THREE from 'three';
import { mat, blob, limb } from '../core/prims.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const O = V(0, 0, 0);

// speed = run speed while riding (m/s); stride = metres per gait cycle at full gallop
export const MOUNTS = {
  raccoon: { name: 'Raccoon', speed: 8.4, stride: 1.9 },
  donkey: { name: 'Donkey', speed: 9.6, stride: 2.4 },
};

export function createMount(kind) {
  const m = kind === 'donkey' ? buildDonkey() : buildRaccoon();
  m.kind = kind;
  m.def = MOUNTS[kind];
  let ph = 0, t = Math.random() * 10, earT = 2, lookT = 3, lookGoal = 0, look = 0, gait = 0;
  // legs: [group, phase offset (gallop), phase offset (walk), is front]
  m.update = (dt, speed = 0) => {
    t += dt;
    const k = Math.min(1, speed / m.def.speed);                    // 0 idle .. 1 full gallop
    gait += (k - gait) * (1 - Math.exp(-8 * dt));
    const g = gait;
    const strideLen = m.def.stride * (0.55 + 0.45 * g);
    if (speed > 0.05) ph += (dt * speed) / strideLen;
    const P = ph * Math.PI * 2;
    // gallop (bounding) vs walk (lateral sequence) leg timing, blended
    for (const L of m.legs) {
      const off = L.walk * (1 - g) + L.gallop * g;
      const a = P + off * Math.PI * 2;
      const amp = (0.35 + 0.45 * g) * Math.min(1, speed * 2);
      L.upper.rotation.x = -Math.sin(a) * amp;
      // lift the lower leg while it swings forward
      L.lower.rotation.x = Math.max(0, Math.cos(a)) * (0.5 + 0.7 * g) * Math.min(1, speed * 2);
    }
    const bob = Math.abs(Math.sin(P)) * (0.03 + 0.09 * g) * Math.min(1, speed);
    const breathe = Math.sin(t * 2.2) * 0.012 * (1 - g);
    m.body.position.y = m.bodyY + bob + breathe;
    m.body.rotation.x = Math.sin(P) * 0.09 * g;
    m.body.rotation.z = Math.sin(P * 0.5) * 0.03 * (1 - g) * Math.min(1, speed);
    // head: counter bob when moving, looks around when idle
    lookT -= dt;
    if (lookT < 0) { lookT = 2.5 + Math.random() * 4; lookGoal = speed > 0.3 ? 0 : (Math.random() - 0.5) * 1.1; }
    look += (lookGoal * (speed > 0.3 ? 0 : 1) - look) * (1 - Math.exp(-3 * dt));
    m.head.rotation.y = look;
    m.head.rotation.x = m.headPitch - Math.sin(P) * 0.12 * g + Math.sin(t * 1.3) * 0.03 * (1 - g);
    // ears: flick now and then, flatten back at a gallop
    earT -= dt;
    const flick = earT < 0.25 ? Math.sin(earT * 40) * 0.35 : 0;
    if (earT < 0) earT = 1.8 + Math.random() * 3;
    m.ears.forEach((e, i) => { e.rotation.x = e.userData.rx - 0.6 * g + (i === 0 ? flick : 0); });
    // tail: swish when idle, streams back when running
    m.tail.forEach((s, i) => {
      s.rotation.y = Math.sin(t * 2.6 - i * 0.6) * (0.25 * (1 - g) + 0.08) ;
      s.rotation.x = s.userData.rx * (1 - g * 0.8) + Math.sin(P - i * 0.5) * 0.12 * g;
    });
  };
  m.update(0);
  return m;
}

// shared rig helper: a leg with a hip / shoulder pivot, upper + lower segment and a foot
function leg(parent, M, { x, y, z, upper, lower, r0, r1, foot, footMat, front, walk, gallop }) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  g.add(limb(M, O, V(0, -upper, 0), r0, r0 * 0.85));
  const lo = new THREE.Group();
  lo.position.y = -upper;
  g.add(lo);
  lo.add(limb(M, O, V(0, -lower, 0), r0 * 0.8, r1));
  lo.add(blob(footMat, foot[0], foot[1], foot[2], 0, -lower - foot[1] * 0.4, foot[2] * 0.25, true));
  return { group: g, upper: g, lower: lo, front, walk, gallop };
}
function earPair(head, fur, inner, { x, y, z, w, h, tilt, rx = -0.15 }) {
  const ears = [];
  for (const sx of [-1, 1]) {
    const e = new THREE.Group();
    e.position.set(sx * x, y, z);
    e.rotation.z = -sx * tilt;
    e.rotation.x = rx;
    e.userData.rx = rx;
    head.add(e);
    const o = new THREE.Mesh(new THREE.ConeGeometry(w, h, 10), fur);
    o.position.y = h * 0.45; o.scale.z = 0.45; o.castShadow = true;
    const i = new THREE.Mesh(new THREE.ConeGeometry(w * 0.62, h * 0.75, 10), inner);
    i.position.set(0, h * 0.42, w * 0.2); i.scale.z = 0.25;
    e.add(o, i);
    ears.push(e);
  }
  return ears;
}
function eyes(head, { x, y, z, r }) {
  const eyeM = mat('#1c1a1f', { roughness: 0.12 });
  const shine = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  for (const sx of [-1, 1]) {
    head.add(blob(eyeM, r, r * 1.1, r * 0.7, sx * x, y, z));
    head.add(blob(shine, r * 0.3, r * 0.34, r * 0.2, sx * (x - r * 0.15), y + r * 0.4, z + r * 0.55, true));
  }
}

// ------------------------------------------------------------------ raccoon
function buildRaccoon() {
  const fur = mat('#6b5c4f', { roughness: 0.95 });
  const light = mat('#d8cab6', { roughness: 0.95 });
  const dark = mat('#26201c', { roughness: 0.9 });
  const leather = mat('#9b2f2a', { roughness: 0.65 });
  const gold = mat('#e2b44f', { roughness: 0.35, metalness: 0.7 });
  const blanket = mat('#2f5fa8', { roughness: 0.9 });

  const root = new THREE.Group();
  root.name = 'mount:raccoon';
  const body = new THREE.Group();
  root.add(body);
  const bodyY = 0.8;
  body.position.y = bodyY;
  // chubby barrel body, pale belly, darker back
  body.add(blob(fur, 0.45, 0.42, 0.74, 0, 0, 0));
  body.add(blob(light, 0.36, 0.3, 0.6, 0, -0.14, 0.05));
  body.add(blob(fur, 0.43, 0.4, 0.4, 0, 0.02, 0.4));           // chest
  body.add(blob(fur, 0.42, 0.4, 0.4, 0, 0.02, -0.42));         // rump

  // head: round with a mask band, white brows and cheeks, pointy snout
  const head = new THREE.Group();
  head.position.set(0, 0.32, 0.72);
  body.add(head);
  head.add(blob(fur, 0.36, 0.32, 0.32, 0, 0, 0));
  head.add(blob(light, 0.3, 0.2, 0.2, 0, -0.08, 0.16));        // cheeks
  head.add(blob(dark, 0.34, 0.1, 0.16, 0, 0.04, 0.2));         // mask band
  for (const sx of [-1, 1]) head.add(blob(light, 0.1, 0.035, 0.05, sx * 0.13, 0.15, 0.26, true));   // brows
  head.add(blob(light, 0.13, 0.1, 0.18, 0, -0.06, 0.36));      // snout
  head.add(blob(dark, 0.05, 0.04, 0.04, 0, -0.02, 0.53, true)); // nose
  eyes(head, { x: 0.13, y: 0.05, z: 0.3, r: 0.058 });
  const ears = earPair(head, fur, dark, { x: 0.21, y: 0.2, z: -0.02, w: 0.13, h: 0.25, tilt: 0.35 });
  for (const e of ears) e.add(blob(light, 0.05, 0.02, 0.03, 0, 0.16, 0.02, true));   // pale ear tips

  // legs (dark socks)
  const legs = [];
  const lp = { upper: 0.27, lower: 0.25, r0: 0.15, r1: 0.11, foot: [0.13, 0.08, 0.16], footMat: dark };
  legs.push(leg(body, fur, { ...lp, x: 0.26, y: -0.2, z: 0.42, front: true, walk: 0.25, gallop: 0 }));
  legs.push(leg(body, fur, { ...lp, x: -0.26, y: -0.2, z: 0.42, front: true, walk: 0.75, gallop: 0.1 }));
  legs.push(leg(body, fur, { ...lp, x: 0.26, y: -0.2, z: -0.42, front: false, walk: 0, gallop: 0.5 }));
  legs.push(leg(body, fur, { ...lp, x: -0.26, y: -0.2, z: -0.42, front: false, walk: 0.5, gallop: 0.6 }));

  // big ringed tail, carried up and back
  const tail = [];
  let parent = new THREE.Group();
  parent.position.set(0, 0.14, -0.72);
  body.add(parent);
  for (let i = 0; i < 7; i++) {
    const s = new THREE.Group();
    s.position.z = i === 0 ? 0 : -0.17;
    s.userData.rx = i === 0 ? 0.3 : 0.05;
    parent.add(s);
    const r = 0.2 - Math.abs(i - 2.5) * 0.022;
    s.add(blob(i % 2 ? dark : fur, r, r, 0.13, 0, 0, -0.08, true));
    tail.push(s);
    parent = s;
  }
  tail[tail.length - 1].add(blob(dark, 0.12, 0.12, 0.12, 0, 0, -0.16, true));

  // saddle: blanket, red leather seat with gold rim, reins
  const saddle = new THREE.Group();
  saddle.position.set(0, 0.38, -0.02);
  body.add(saddle);
  saddle.add(blob(blanket, 0.42, 0.06, 0.38, 0, -0.04, 0));
  saddle.add(blob(leather, 0.3, 0.09, 0.3, 0, 0.03, 0));
  saddle.add(blob(leather, 0.2, 0.12, 0.08, 0, 0.1, 0.24, true));   // pommel
  saddle.add(blob(leather, 0.26, 0.1, 0.08, 0, 0.09, -0.26, true)); // cantle
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.018, 6, 24), gold);
  rim.rotation.x = Math.PI / 2; rim.position.y = 0.05;
  saddle.add(rim);
  for (const sx of [-1, 1]) saddle.add(limb(leather, V(sx * 0.3, 0.02, 0.2), V(sx * 0.22, -0.12, 0.72), 0.012, 0.012, 4));   // reins
  const seat = new THREE.Object3D();
  seat.position.set(0, 0.16, -0.02);
  saddle.add(seat);

  return { root, body, bodyY, head, headPitch: 0.05, ears, legs, tail, seat };
}

// ------------------------------------------------------------------ donkey
function buildDonkey() {
  const fur = mat('#7a6f66', { roughness: 0.95 });
  const light = mat('#e6e0d4', { roughness: 0.95 });
  const dark = mat('#453d37', { roughness: 0.9 });
  const hoof = mat('#2e2a27', { roughness: 0.6 });
  const leather = mat('#6b4428', { roughness: 0.7 });
  const brass = mat('#c9a14a', { roughness: 0.35, metalness: 0.7 });
  const blanketA = mat('#2c7a6a', { roughness: 0.9 });
  const bag = mat('#8a5a34', { roughness: 0.85 });

  const root = new THREE.Group();
  root.name = 'mount:donkey';
  const body = new THREE.Group();
  root.add(body);
  const bodyY = 1.0;
  body.position.y = bodyY;
  body.add(blob(fur, 0.35, 0.38, 0.8, 0, 0, 0));
  body.add(blob(light, 0.29, 0.26, 0.66, 0, -0.16, 0.02));
  body.add(blob(dark, 0.07, 0.05, 0.76, 0, 0.37, -0.02, true));     // dorsal stripe
  body.add(blob(fur, 0.34, 0.37, 0.38, 0, 0.03, 0.48));
  body.add(blob(fur, 0.35, 0.38, 0.4, 0, 0.03, -0.52));

  // neck + long head with a pale muzzle, spiky mane, long ears
  const neck = new THREE.Group();
  neck.position.set(0, 0.25, 0.72);
  neck.rotation.x = -0.7;
  body.add(neck);
  neck.add(limb(fur, O, V(0, 0.55, 0), 0.22, 0.17));
  for (let i = 0; i < 5; i++) neck.add(blob(dark, 0.04, 0.09, 0.06, 0, 0.1 + i * 0.1, -0.16, true));   // mane
  const head = new THREE.Group();
  head.position.set(0, 0.6, 0);
  head.rotation.x = 0.7;
  neck.add(head);
  head.add(blob(fur, 0.22, 0.22, 0.26, 0, 0.05, 0));
  head.add(blob(fur, 0.17, 0.16, 0.26, 0, -0.04, 0.26));
  head.add(blob(light, 0.17, 0.15, 0.16, 0, -0.07, 0.44));        // muzzle
  for (const sx of [-1, 1]) head.add(blob(dark, 0.025, 0.02, 0.02, sx * 0.07, -0.02, 0.59, true));   // nostrils
  eyes(head, { x: 0.15, y: 0.1, z: 0.14, r: 0.05 });
  for (const sx of [-1, 1]) head.add(blob(light, 0.05, 0.03, 0.03, sx * 0.15, 0.13, 0.17, true));   // pale eye rings
  const ears = earPair(head, fur, light, { x: 0.1, y: 0.22, z: -0.06, w: 0.08, h: 0.42, tilt: 0.28, rx: -0.3 });
  for (const e of ears) e.add(blob(dark, 0.05, 0.06, 0.03, 0, 0.38, 0, true));   // dark ear tips
  // bridle
  const strap = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.015, 5, 20), leather);
  strap.position.set(0, -0.02, 0.36); strap.rotation.y = Math.PI / 2; strap.scale.set(1, 0.8, 1);
  head.add(strap);
  head.add(blob(brass, 0.03, 0.03, 0.03, 0.17, -0.02, 0.36, true));

  const legs = [];
  const lp = { upper: 0.4, lower: 0.38, r0: 0.11, r1: 0.075, foot: [0.085, 0.07, 0.1], footMat: hoof };
  legs.push(leg(body, fur, { ...lp, x: 0.2, y: -0.2, z: 0.5, front: true, walk: 0.25, gallop: 0 }));
  legs.push(leg(body, fur, { ...lp, x: -0.2, y: -0.2, z: 0.5, front: true, walk: 0.75, gallop: 0.1 }));
  legs.push(leg(body, fur, { ...lp, x: 0.2, y: -0.2, z: -0.55, front: false, walk: 0, gallop: 0.5 }));
  legs.push(leg(body, fur, { ...lp, x: -0.2, y: -0.2, z: -0.55, front: false, walk: 0.5, gallop: 0.6 }));
  // pale socks above the hooves
  for (const L of legs) L.lower.add(blob(light, 0.08, 0.08, 0.08, 0, -0.31, 0, true));

  // thin tail hanging down, with a dark tuft
  const tail = [];
  let parent = new THREE.Group();
  parent.position.set(0, 0.22, -0.9);
  body.add(parent);
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Group();
    s.position.z = i === 0 ? 0 : -0.12;
    s.userData.rx = i === 0 ? -1.15 : -0.08;
    parent.add(s);
    s.add(blob(fur, 0.04, 0.04, 0.08, 0, 0, -0.06, true));
    tail.push(s);
    parent = s;
  }
  tail[tail.length - 1].add(blob(dark, 0.07, 0.07, 0.14, 0, 0, -0.16, true));

  // saddle with blanket and saddle bags
  const saddle = new THREE.Group();
  saddle.position.set(0, 0.36, 0.02);
  body.add(saddle);
  saddle.add(blob(blanketA, 0.39, 0.06, 0.4, 0, -0.04, 0));
  saddle.add(blob(leather, 0.28, 0.09, 0.3, 0, 0.03, 0));
  saddle.add(blob(leather, 0.16, 0.12, 0.07, 0, 0.1, 0.25, true));
  saddle.add(blob(leather, 0.24, 0.1, 0.07, 0, 0.09, -0.27, true));
  for (const sx of [-1, 1]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.26, 0.3), bag);
    b.position.set(sx * 0.4, -0.2, -0.36); b.rotation.z = sx * 0.12; b.castShadow = true;
    saddle.add(b);
    saddle.add(blob(brass, 0.02, 0.02, 0.02, sx * 0.47, -0.14, -0.36, true));
    saddle.add(limb(leather, V(sx * 0.28, 0.02, 0.22), V(sx * 0.16, 0.25, 0.72), 0.012, 0.012, 4));   // reins
  }
  const seat = new THREE.Object3D();
  seat.position.set(0, 0.12, 0);
  saddle.add(seat);

  // the gait code drives `head`; for the donkey that is the neck (head and neck bob together)
  return { root, body, bodyY, head: neck, headPitch: -0.7, ears, legs, tail, seat };
}

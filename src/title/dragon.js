// Procedural dragon for the title intro (original design: teal scales, golden belly, ember-orange wings).
// Segmented neck and tail chains that wave, a horned head with an opening jaw and glowing eyes, and two bat
// wings whose membranes are rebuilt every frame from the flapping arm / finger bones. Faces +Z.
import * as THREE from 'three';
import { mat, blob, limb } from './scenery.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const O = V(0, 0, 0);

export function createDragon() {
  const M = {
    body: mat('#1f7480', { roughness: 0.5, metalness: 0.1 }),
    back: mat('#134851', { roughness: 0.55 }),
    belly: mat('#efcd86', { roughness: 0.65 }),
    membrane: new THREE.MeshStandardMaterial({ color: '#e0643a', roughness: 0.85, side: THREE.DoubleSide, emissive: new THREE.Color('#6a1d08'), emissiveIntensity: 0.7 }),
    horn: mat('#f3e6c8', { roughness: 0.4 }),
    spike: mat('#f0a531', { roughness: 0.45 }),
    eye: new THREE.MeshStandardMaterial({ color: '#ffd23a', emissive: new THREE.Color('#ffc21a'), emissiveIntensity: 2.4 }),
    pupil: new THREE.MeshBasicMaterial({ color: '#170700' }),
    mouth: mat('#4a0a10', { roughness: 0.9 }),
    tooth: mat('#fffaf0', { roughness: 0.35 }),
  };
  const coneGeo = new THREE.ConeGeometry(1, 1, 6);
  const cone = (m, parent, x, y, z, r, h, rx = 0, rz = 0) => {
    const c = new THREE.Mesh(coneGeo, m);
    c.scale.set(r, h, r);
    c.position.set(x, y, z);
    c.rotation.set(rx, 0, rz);
    c.castShadow = true;
    parent.add(c);
    return c;
  };

  const root = new THREE.Group();
  root.name = 'dragon';
  const body = new THREE.Group();
  root.add(body);

  // ---- torso
  body.add(blob(M.body, 0.78, 0.7, 1.35, 0, 0, 0));
  body.add(blob(M.back, 0.6, 0.32, 1.15, 0, 0.38, -0.05));
  body.add(blob(M.belly, 0.6, 0.5, 1.15, 0, -0.22, 0.06));
  body.add(blob(M.body, 0.62, 0.58, 0.72, 0, -0.02, -0.95));
  for (let i = 0; i < 4; i++) cone(M.spike, body, 0, 0.64 - i * 0.03, 0.8 - i * 0.55, 0.11, 0.34 - i * 0.03, -0.55);

  // ---- neck chain (curves up) + head
  const neck = [];
  let parent = new THREE.Group();
  parent.position.set(0, 0.35, 1.05);
  body.add(parent);
  for (let i = 0; i < 6; i++) {
    const g = new THREE.Group();
    g.position.z = i === 0 ? 0 : 0.34;
    parent.add(g);
    const r = 0.44 - i * 0.03;
    g.add(blob(M.body, r, r * 0.95, 0.32, 0, 0, 0.12, true));
    g.add(blob(M.belly, r * 0.8, r * 0.6, 0.28, 0, -r * 0.38, 0.12, true));
    cone(M.spike, g, 0, r * 0.92, 0.06, 0.07, 0.2 - i * 0.015, -0.6);
    neck.push(g);
    parent = g;
  }
  const head = new THREE.Group();
  head.position.z = 0.32;
  parent.add(head);
  head.add(blob(M.body, 0.4, 0.34, 0.46, 0, 0.06, 0.18));          // skull
  head.add(blob(M.body, 0.29, 0.2, 0.44, 0, 0.0, 0.62));           // snout
  head.add(blob(M.back, 0.27, 0.11, 0.36, 0, 0.15, 0.5));          // snout ridge
  for (const sx of [-1, 1]) {
    const brow = blob(M.back, 0.14, 0.06, 0.18, sx * 0.2, 0.26, 0.34);
    brow.rotation.z = sx * 0.35;
    head.add(brow);
    head.add(blob(M.eye, 0.07, 0.06, 0.075, sx * 0.265, 0.14, 0.38));
    head.add(blob(M.pupil, 0.012, 0.05, 0.032, sx * 0.335, 0.14, 0.4));
    head.add(limb(M.horn, V(sx * 0.18, 0.3, 0.1), V(sx * 0.32, 0.55, -0.2), 0.08, 0.05));
    head.add(limb(M.horn, V(sx * 0.32, 0.55, -0.2), V(sx * 0.37, 0.62, -0.62), 0.05, 0.008));
    head.add(limb(M.spike, V(sx * 0.33, 0.0, 0.15), V(sx * 0.58, 0.06, -0.16), 0.05, 0.006));
    head.add(blob(M.mouth, 0.03, 0.02, 0.03, sx * 0.1, 0.1, 1.0, true));   // nostril
    for (let k = 0; k < 3; k++) cone(M.tooth, head, sx * 0.17, -0.14, 0.62 + k * 0.12, 0.025, 0.08, Math.PI);
  }
  head.add(blob(M.mouth, 0.22, 0.08, 0.38, 0, -0.1, 0.56));        // inside of the mouth
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.1, 0.15);
  head.add(jaw);
  jaw.add(blob(M.body, 0.25, 0.09, 0.44, 0, -0.06, 0.42));
  jaw.add(blob(M.belly, 0.2, 0.06, 0.38, 0, -0.1, 0.42));
  for (const sx of [-1, 1]) for (let k = 0; k < 2; k++) cone(M.tooth, jaw, sx * 0.14, 0.0, 0.5 + k * 0.14, 0.022, 0.07);
  const mouth = new THREE.Object3D();
  mouth.position.set(0, -0.1, 1.0);
  head.add(mouth);

  // ---- tail chain with a spade tip
  const tail = [];
  parent = new THREE.Group();
  parent.position.set(0, 0.05, -1.3);
  body.add(parent);
  for (let i = 0; i < 12; i++) {
    const g = new THREE.Group();
    g.position.z = i === 0 ? 0 : -0.4;
    parent.add(g);
    const r = 0.46 * (1 - i / 13) + 0.05;
    g.add(blob(M.body, r, r * 0.9, 0.3, 0, 0, -0.15, true));
    if (i % 2 === 0) cone(M.spike, g, 0, r * 0.85, -0.15, 0.06, 0.2 * (1 - i / 14), -0.9);
    tail.push(g);
    parent = g;
  }
  const spade = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.7, 4), M.membrane);
  spade.rotation.x = -Math.PI / 2;
  spade.scale.set(1, 1, 0.25);
  spade.position.z = -0.45;
  parent.add(spade);

  // ---- legs tucked under the body in flight
  for (const sx of [-1, 1]) {
    const fl = new THREE.Group();
    fl.position.set(sx * 0.42, -0.42, 0.62);
    fl.rotation.x = 0.9;
    body.add(fl);
    fl.add(limb(M.body, O, V(0, -0.42, 0), 0.14, 0.1));
    const fl2 = new THREE.Group();
    fl2.position.y = -0.42;
    fl2.rotation.x = -1.7;
    fl.add(fl2);
    fl2.add(limb(M.body, O, V(0, -0.34, 0), 0.09, 0.07));
    for (let k = -1; k <= 1; k++) cone(M.horn, fl2, k * 0.05, -0.38, 0.03, 0.025, 0.09, 0.4);
    const hl = new THREE.Group();
    hl.position.set(sx * 0.5, -0.3, -0.9);
    hl.rotation.x = 1.25;
    body.add(hl);
    hl.add(blob(M.body, 0.22, 0.4, 0.26, 0, -0.22, 0));
    hl.add(limb(M.body, V(0, -0.5, 0), V(0, -0.95, 0.12), 0.1, 0.07));
    for (let k = -1; k <= 1; k++) cone(M.horn, hl, k * 0.05, -1.0, 0.16, 0.025, 0.1, 0.9);
  }

  // ---- wings: shoulder > forearm; the membrane spans shoulder, elbow, four finger tips and the flank
  const wings = [];
  const TIPS = [V(2.5, 0.35, 0.35), V(2.7, 0.05, -0.75), V(2.2, -0.05, -1.75), V(1.25, -0.05, -2.3)];
  const FLANK = V(-0.35, -0.12, -1.7);
  const IDX = [0, 3, 7, 0, 7, 4, 0, 4, 8, 0, 8, 5, 0, 5, 9, 0, 9, 6, 0, 6, 10, 0, 10, 2, 0, 2, 1];
  for (const sx of [1, -1]) {
    const side = new THREE.Group();
    side.scale.x = sx;
    side.position.set(0, 0.45, 0.45);
    body.add(side);
    const W = new THREE.Group();
    W.position.x = 0.5;
    side.add(W);
    const E = V(1.7, 0.25, 0.25);
    W.add(limb(M.body, O, E, 0.13, 0.08));
    const fore = new THREE.Group();
    fore.position.copy(E);
    W.add(fore);
    for (const t of TIPS) fore.add(limb(M.back, O, t, 0.065, 0.015, 6));
    cone(M.horn, fore, 0.05, 0.12, 0.12, 0.04, 0.2, -0.8);           // thumb claw
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(11 * 3), 3));
    geo.setIndex(IDX);
    const mem = new THREE.Mesh(geo, M.membrane);
    mem.castShadow = true;
    mem.frustumCulled = false;
    W.add(mem);
    wings.push({ W, fore, geo, pts: Array.from({ length: 11 }, () => new THREE.Vector3()) });
  }
  const updateMembrane = (w) => {
    w.fore.updateMatrix();
    const p = w.pts;
    p[0].copy(w.fore.position);
    p[1].set(0, 0, 0);
    p[2].copy(FLANK);
    for (let i = 0; i < 4; i++) p[3 + i].copy(TIPS[i]).applyMatrix4(w.fore.matrix);
    // scalloped trailing edge: midpoints pulled in towards the elbow
    for (let i = 0; i < 3; i++) p[7 + i].lerpVectors(p[3 + i], p[4 + i], 0.5).lerp(p[0], 0.2);
    p[10].lerpVectors(p[6], p[2], 0.5).lerp(p[0], 0.16);
    const a = w.geo.attributes.position;
    for (let i = 0; i < 11; i++) a.setXYZ(i, p[i].x, p[i].y, p[i].z);
    a.needsUpdate = true;
    w.geo.computeVertexNormals();
  };

  let t = 0, ph = 0;
  const api = {
    root, body, head, jaw, mouth, neck, tail, wings,
    flapRate: 6, flapAmp: 1,
    hover: 0,          // 0 = gliding / flying level, 1 = rearing up to hover
    jawOpen: 0,
    neckYaw: 0, neckPitch: 0, headPitch: 0,
    update(dt) {
      t += dt;
      ph += dt * this.flapRate;
      const s = Math.sin(ph), amp = this.flapAmp;
      for (const w of wings) {
        w.W.rotation.z = 0.12 + 0.78 * amp * s;
        w.W.rotation.y = 0.16 * amp * Math.cos(ph);
        w.fore.rotation.z = 0.5 * amp * Math.sin(ph - 0.9);
        w.fore.rotation.y = -0.08 - 0.14 * amp * Math.cos(ph);
        updateMembrane(w);
      }
      body.position.y = -0.22 * amp * s;
      body.rotation.x = -0.28 * this.hover + 0.04 * Math.cos(ph) * amp;
      // the neck carries the aim (rest curve up, then levelled by the head)
      const n = neck.length;
      neck.forEach((g, i) => {
        g.rotation.x = -0.14 + this.neckPitch / n + Math.sin(t * 2 - i * 0.5) * 0.03;
        g.rotation.y = this.neckYaw / n + Math.sin(t * 1.3 - i * 0.4) * 0.025;
      });
      head.rotation.x = 0.62 + this.headPitch;
      jaw.rotation.x = this.jawOpen * 0.6 + Math.sin(t * 9) * 0.03 * this.jawOpen;
      tail.forEach((g, i) => {
        g.rotation.y = Math.sin(t * 2.2 - i * 0.45) * 0.13;
        g.rotation.x = 0.03 + Math.sin(t * 1.7 - i * 0.35) * 0.05 + this.hover * 0.09;
      });
    },
  };
  api.update(0);
  return api;
}

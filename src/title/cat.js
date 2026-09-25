// A small grey-blue cat with white socks and a red scarf (original design) for the title intro: it peeks out
// from behind a rock, twitches its ears, looks around, puffs up at the dragon's roar and bolts. Faces +Z.
import * as THREE from 'three';
import { mat, blob, limb } from './scenery.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export function createCat() {
  const fur = mat('#8b9ab2', { roughness: 0.9 });
  const furDark = mat('#6c7a92', { roughness: 0.9 });
  const white = mat('#f4f1ea', { roughness: 0.9 });
  const pink = mat('#f2a0ac', { roughness: 0.7 });
  const eyeM = mat('#23222b', { roughness: 0.15, metalness: 0.1 });
  const shine = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const scarfM = mat('#d8363a', { roughness: 0.8 });

  const root = new THREE.Group();
  root.name = 'cat';
  const body = new THREE.Group();
  body.position.y = 0.2;
  root.add(body);
  body.add(blob(fur, 0.15, 0.14, 0.27, 0, 0, 0));
  body.add(blob(furDark, 0.1, 0.05, 0.2, 0, 0.12, -0.02));          // darker saddle
  body.add(blob(white, 0.11, 0.1, 0.2, 0, -0.045, 0.05));

  // head
  const head = new THREE.Group();
  head.position.set(0, 0.13, 0.25);
  body.add(head);
  head.add(blob(fur, 0.17, 0.15, 0.15, 0, 0, 0));
  head.add(blob(white, 0.09, 0.06, 0.06, 0, -0.05, 0.115));
  head.add(blob(pink, 0.02, 0.014, 0.012, 0, -0.02, 0.168));
  const eyes = [];
  for (const sx of [-1, 1]) {
    const e = new THREE.Group();
    e.position.set(sx * 0.066, 0.022, 0.118);
    head.add(e);
    e.add(blob(eyeM, 0.043, 0.052, 0.026, 0, 0, 0));
    e.add(blob(shine, 0.013, 0.015, 0.008, sx * 0.012, 0.018, 0.022, true));
    eyes.push(e);
  }
  const ears = [];
  for (const sx of [-1, 1]) {
    const ear = new THREE.Group();
    ear.position.set(sx * 0.095, 0.1, -0.01);
    ear.rotation.z = -sx * 0.3;
    head.add(ear);
    const outer = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.13, 4), fur);
    outer.position.y = 0.06; outer.rotation.y = Math.PI / 4; outer.scale.z = 0.55; outer.castShadow = true;
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.09, 4), pink);
    inner.position.set(0, 0.05, 0.018); inner.rotation.y = Math.PI / 4; inner.scale.z = 0.3;
    ear.add(outer, inner);
    ears.push(ear);
  }
  // whiskers
  const wPts = [];
  for (const sx of [-1, 1]) for (let k = -1; k <= 1; k++) wPts.push(sx * 0.05, -0.04, 0.13, sx * 0.2, -0.03 + k * 0.03, 0.1 + k * 0.01);
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.Float32BufferAttribute(wPts, 3));
  head.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: '#ffffff' })));
  // scarf
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.035, 8, 20), scarfM);
  scarf.position.set(0, 0.08, 0.2);
  scarf.rotation.x = Math.PI / 2 - 0.35;
  body.add(scarf);
  const knot = limb(scarfM, V(0.06, 0.03, 0.29), V(0.1, -0.1, 0.33), 0.035, 0.02);
  body.add(knot);

  // legs (pivot at the top) with white socks
  const legs = [];
  for (const [x, z] of [[0.08, 0.16], [-0.08, 0.16], [0.08, -0.16], [-0.08, -0.16]]) {
    const g = new THREE.Group();
    g.position.set(x, -0.04, z);
    body.add(g);
    g.add(limb(fur, V(0, 0, 0), V(0, -0.12, 0), 0.035, 0.03, 6));
    g.add(blob(white, 0.035, 0.03, 0.045, 0, -0.14, 0.012, true));
    legs.push(g);
  }
  // tail: curled chain
  const tail = [];
  let parent = new THREE.Group();
  parent.position.set(0, 0.06, -0.25);
  body.add(parent);
  for (let i = 0; i < 8; i++) {
    const g = new THREE.Group();
    g.position.z = i === 0 ? 0 : -0.06;
    parent.add(g);
    g.add(blob(i === 7 ? furDark : fur, 0.034, 0.034, 0.045, 0, 0, -0.03, true));
    tail.push(g);
    parent = g;
  }

  let t = 0, blinkT = 1.5;
  const api = {
    root, body, head, ears, tail, legs,
    run: 0, runPhase: 0,     // 0..1 gallop blend, cycle phase
    headYaw: 0, headPitch: 0,
    earTwitch: 0,            // set to 1 to flick the ears
    puff: 0,                 // 0..1 startled fur / bottle-brush tail
    update(dt) {
      t += dt;
      const r = this.run;
      const p = this.runPhase;
      // gallop: front and hind pairs out of phase, back flexing, body bounding
      legs[0].rotation.x = legs[1].rotation.x = -Math.sin(p) * 1.0 * r;
      legs[2].rotation.x = legs[3].rotation.x = Math.sin(p + 1.9) * 1.0 * r;
      body.position.y = 0.2 + Math.abs(Math.sin(p)) * 0.06 * r + this.puff * 0.03;
      body.rotation.x = Math.sin(p) * 0.18 * r - this.puff * 0.08;
      body.scale.set(1 + this.puff * 0.12, 1 + this.puff * 0.18, 1 - 0.06 * r * Math.cos(p));
      head.rotation.y = this.headYaw;
      head.rotation.x = this.headPitch + Math.sin(p) * 0.1 * r;
      // ears: flick + flatten when running
      this.earTwitch = Math.max(0, this.earTwitch - dt * 4);
      ears.forEach((e, i) => { e.rotation.x = -0.6 * r + Math.sin(this.earTwitch * 12 + i) * 0.4 * this.earTwitch; });
      // tail: lazy curl, straight up and fluffed when startled, streaming back when running
      tail.forEach((g, i) => {
        const curl = (-0.32 + Math.sin(t * 1.6 - i * 0.6) * 0.1) * (1 - this.puff) * (1 - r);
        g.rotation.x = curl - this.puff * (i === 0 ? 1.3 : 0.05) + r * (i === 0 ? -0.3 : 0.08);
        g.rotation.y = Math.sin(t * 2.3 - i * 0.5) * 0.12 * (1 - this.puff);
        const s = 1 + this.puff * 0.9;
        g.scale.set(s, s, 1);
      });
      // blink
      blinkT -= dt;
      const closed = blinkT < 0.1 && this.puff < 0.3;
      eyes.forEach((e) => { e.scale.y = closed ? 0.12 : 1 + this.puff * 0.25; });
      if (blinkT < 0) blinkT = 1.8 + Math.random() * 2.5;
    },
  };
  api.update(0);
  return api;
}

// Cute mushroom cottage the player can rest in (H) — boosts HP/SP regeneration
import * as THREE from 'three';
import { tex } from '../core/textures.js';

let proto = null;

function spotsTexture() {
  const S = 256, c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, S);
  g.addColorStop(0, '#ff6a52'); g.addColorStop(1, '#c8261c');
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  const spots = [[40, 60, 22], [130, 40, 26], [210, 70, 20], [90, 130, 18], [175, 140, 24], [30, 190, 16], [120, 210, 20], [230, 200, 14]];
  for (const [x, y, r] of spots) {
    for (const ox of [-S, 0, S]) {
      ctx.fillStyle = '#fff7ea';
      ctx.beginPath(); ctx.ellipse(x + ox, y, r, r * 0.8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      ctx.beginPath(); ctx.ellipse(x + ox + 2, y + 3, r, r * 0.8, 0, 0, Math.PI * 2); ctx.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

function build() {
  const g = new THREE.Group();
  const plaster = new THREE.MeshStandardMaterial({ map: tex('plaster'), color: '#fff3dc', roughness: 0.9 });
  const cap = new THREE.MeshStandardMaterial({ map: spotsTexture(), roughness: 0.45 });
  const under = new THREE.MeshStandardMaterial({ color: '#f2d6b0', roughness: 0.9, side: THREE.DoubleSide });
  const wood = new THREE.MeshStandardMaterial({ map: tex('wood'), color: '#b07a4a', roughness: 0.8 });
  const glass = new THREE.MeshStandardMaterial({ color: '#ffd98a', emissive: '#ffb040', emissiveIntensity: 1.4, roughness: 0.3 });
  const gold = new THREE.MeshStandardMaterial({ color: '#e8b44a', metalness: 0.9, roughness: 0.3 });
  const stone = new THREE.MeshStandardMaterial({ map: tex('stoneWall'), roughness: 0.9 });
  const add = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = true; o.receiveShadow = true; g.add(o); return o; };
  // stem / walls
  add(new THREE.CylinderGeometry(0.72, 0.85, 1.2, 28), plaster, 0, 0.6, 0);
  // cap
  const capG = new THREE.SphereGeometry(1.25, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.5);
  capG.scale(1, 0.72, 1);
  add(capG, cap, 0, 1.1, 0);
  const rim = new THREE.CircleGeometry(1.25, 32); rim.rotateX(Math.PI / 2);
  add(rim, under, 0, 1.1, 0);
  // door
  const doorShape = new THREE.Shape();
  doorShape.moveTo(-0.22, 0); doorShape.lineTo(-0.22, 0.45); doorShape.absarc(0, 0.45, 0.22, Math.PI, 0, true); doorShape.lineTo(0.22, 0); doorShape.lineTo(-0.22, 0);
  const door = new THREE.ExtrudeGeometry(doorShape, { depth: 0.06, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 2 });
  add(door, wood, 0, 0.02, 0.8);
  add(new THREE.SphereGeometry(0.03, 8, 6), gold, 0.13, 0.35, 0.89);
  // round windows
  for (const a of [-0.9, 0.9]) {
    const w = add(new THREE.CircleGeometry(0.15, 20), glass, Math.sin(a) * 0.79, 0.72, Math.cos(a) * 0.79, 0, a, 0);
    const fr = new THREE.TorusGeometry(0.16, 0.03, 8, 20);
    add(fr, wood, Math.sin(a) * 0.8, 0.72, Math.cos(a) * 0.8, 0, a, 0);
    w.castShadow = false;
  }
  // chimney
  add(new THREE.CylinderGeometry(0.1, 0.12, 0.45, 10), stone, 0.5, 1.75, -0.3);
  // steps + flowers
  add(new THREE.CylinderGeometry(0.34, 0.38, 0.08, 18, 1, false), stone, 0, 0.04, 1.02);
  const flowerCols = ['#ff8fb4', '#ffe25a', '#b98cff', '#ffffff'];
  for (let i = 0; i < 10; i++) {
    const a = -1.4 + (i / 9) * 2.8 + (i % 2) * 0.1;
    if (Math.abs(a) < 0.35) continue;
    const r = 0.98;
    add(new THREE.CylinderGeometry(0.01, 0.01, 0.2, 4), new THREE.MeshStandardMaterial({ color: '#3f7d2a' }), Math.sin(a) * r, 0.1, Math.cos(a) * r);
    add(new THREE.SphereGeometry(0.055, 8, 6), new THREE.MeshStandardMaterial({ color: flowerCols[i % 4], roughness: 0.6 }), Math.sin(a) * r, 0.22, Math.cos(a) * r);
  }
  g.userData.chimney = new THREE.Vector3(0.5, 2.0, -0.3);
  return g;
}

export function createMiniHouse() {
  if (!proto) proto = build();
  const h = proto.clone(true);
  h.userData.chimney = proto.userData.chimney.clone();
  return h;
}

// Primitive mesh helpers for procedurally built creatures and props (title actors, mounts, terrace furniture)
import * as THREE from 'three';

// standard material shortcut
export function mat(color, o = {}) {
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: o.roughness ?? 0.75, metalness: o.metalness ?? 0, ...o });
}

// shared unit spheres (never disposed)
export const SPH = new THREE.SphereGeometry(1, 20, 14);
export const SPH_LO = new THREE.SphereGeometry(1, 12, 8);

// a mesh ellipsoid
export function blob(material, sx, sy, sz, x = 0, y = 0, z = 0, lo = false) {
  const m = new THREE.Mesh(lo ? SPH_LO : SPH, material);
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

// a tapered cylinder between two points (bones, horns, posts)
const _up = new THREE.Vector3(0, 1, 0);
export function limb(material, a, b, r0, r1, seg = 8) {
  const d = new THREE.Vector3().subVectors(b, a);
  const len = d.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1);
  g.translate(0, len / 2, 0);
  const m = new THREE.Mesh(g, material);
  m.position.copy(a);
  m.quaternion.setFromUnitVectors(_up, d.normalize());
  m.castShadow = true;
  return m;
}

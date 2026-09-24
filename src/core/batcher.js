// Static geometry batcher: collect many transformed geometries per material and
// merge them into a few meshes to keep draw calls low while allowing lots of detail.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export class StaticBatcher {
  constructor() {
    this.buckets = new Map(); // material -> geometry[]
    this.tmpM = new THREE.Matrix4();
  }

  // Normalise a geometry to non-indexed position/normal/uv so all can be merged
  static normalize(geo) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) {
      const n = g.attributes.position.count;
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    }
    for (const k of Object.keys(g.attributes)) {
      if (k !== 'position' && k !== 'normal' && k !== 'uv' && k !== 'color') g.deleteAttribute(k);
    }
    if (!g.attributes.color) {
      const n = g.attributes.position.count;
      const col = new Float32Array(n * 3).fill(1);
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    }
    g.morphAttributes = {};
    g.clearGroups();
    return g;
  }

  // Add a geometry with a world matrix (or position/rotation/scale helper)
  add(geo, material, matrix, tint) {
    const g = StaticBatcher.normalize(geo);
    if (matrix) g.applyMatrix4(matrix);
    if (tint) {
      const c = g.attributes.color;
      for (let i = 0; i < c.count; i++) c.setXYZ(i, c.getX(i) * tint.r, c.getY(i) * tint.g, c.getZ(i) * tint.b);
    }
    if (!this.buckets.has(material)) this.buckets.set(material, []);
    this.buckets.get(material).push(g);
    return g;
  }

  // Add every mesh in an Object3D hierarchy (after updating its world matrices)
  addObject(obj) {
    obj.updateMatrixWorld(true);
    obj.traverse((o) => {
      if (o.isMesh && !o.isInstancedMesh) this.add(o.geometry, o.material, o.matrixWorld);
    });
  }

  build(scene, { castShadow = true, receiveShadow = true, name = 'static' } = {}) {
    const meshes = [];
    for (const [mat, geos] of this.buckets) {
      if (!geos.length) continue;
      // chunk to avoid giant buffers
      const CHUNK = 400;
      for (let i = 0; i < geos.length; i += CHUNK) {
        const merged = mergeGeometries(geos.slice(i, i + CHUNK), false);
        if (!merged) continue;
        merged.computeBoundingSphere();
        merged.computeBoundingBox();
        const m = new THREE.Mesh(merged, mat);
        m.name = name;
        m.castShadow = castShadow && !mat.transparent;
        m.receiveShadow = receiveShadow;
        m.matrixAutoUpdate = false;
        m.updateMatrix();
        scene.add(m);
        meshes.push(m);
      }
      for (const g of geos) g.dispose();
    }
    this.buckets.clear();
    return meshes;
  }
}

// Helper to compose a matrix quickly
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler();
export function mat(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  _p.set(x, y, z);
  _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ'));
  _s.set(sx, sy, sz);
  return new THREE.Matrix4().compose(_p, _q, _s);
}

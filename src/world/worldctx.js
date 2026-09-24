// Shared world-building context handed to town / vegetation builders
import * as THREE from 'three';
import { StaticBatcher } from '../core/batcher.js';
import { Colliders } from './colliders.js';

// Records shapes to paint onto the minimap later
export class MinimapShapes {
  constructor() { this.shapes = []; }
  // rectangle centred at x,z with full width w (local x) and depth d (local z), rotated by rotY
  addRect(x, z, w, d, rotY = 0, color = '#c9503a') { this.shapes.push({ kind: 'rect', x, z, w, d, rotY, color }); }
  addCircle(x, z, r, color = '#d9d0c0') { this.shapes.push({ kind: 'circle', x, z, r, color }); }
}

export function createWorldContext(scene, terrain) {
  const ctx = {
    scene,
    terrain,
    batcher: new StaticBatcher(),
    colliders: new Colliders(),
    minimap: new MinimapShapes(),
    treeRequests: [],
    // Request a tree at x,z. variant: 'round' | 'tall' | 'blossom' | 'pine' | 'bush'
    addTree(x, z, scale = 1, variant = 'round') {
      ctx.treeRequests.push({ x, z, scale, variant });
    },
    // Areas where vegetation scattering must not place grass/flowers/trees (circles)
    noScatter: [],
    addNoScatter(x, z, r) { ctx.noScatter.push({ x, z, r }); },
    updaters: [],
    onUpdate(fn) { ctx.updaters.push(fn); },
  };
  return ctx;
}

// Quick placeholder trees (used by the dev viewer when the vegetation module is absent)
export function placeholderTrees(ctx) {
  const trunk = new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 1 });
  const leaf = new THREE.MeshStandardMaterial({ color: 0x4f9538, roughness: 1 });
  for (const t of ctx.treeRequests) {
    const h = ctx.terrain.heightAt(t.x, t.z);
    const m1 = new THREE.Matrix4().makeTranslation(t.x, h + 1.5 * t.scale, t.z).multiply(new THREE.Matrix4().makeScale(t.scale, t.scale, t.scale));
    ctx.batcher.add(new THREE.CylinderGeometry(0.2, 0.3, 3, 8), trunk, m1);
    const m2 = new THREE.Matrix4().makeTranslation(t.x, h + 4 * t.scale, t.z).multiply(new THREE.Matrix4().makeScale(t.scale, t.scale, t.scale));
    ctx.batcher.add(new THREE.IcosahedronGeometry(2, 1), leaf, m2);
  }
}

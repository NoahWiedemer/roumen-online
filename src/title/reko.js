// Reko — the (future) iconic monster with the sunglasses and the red potion, starring in the title intro.
// reko.glb is a static mesh, so all his acting is done with transforms: a tilt pivot at the feet (leaning,
// drinking) inside a squash & stretch pivot, plus anchor points for effects (burning pants, shades glint, flask).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const BASE = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '/';
const HEIGHT = 1.6;

let template = null;
let loading = null;
export function rekoReady() { return !!template; }
export function preloadReko() {
  if (template) return Promise.resolve(template);
  if (!loading) {
    loading = new GLTFLoader().loadAsync(BASE + 'models/reko.glb').then((g) => {
      const scene = g.scene;
      scene.updateMatrixWorld(true);
      const bb = new THREE.Box3().setFromObject(scene);
      const s = HEIGHT / (bb.max.y - bb.min.y);
      const c = bb.getCenter(new THREE.Vector3());
      scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      template = { scene, s, offset: new THREE.Vector3(-c.x * s, -bb.min.y * s, -c.z * s) };
      return template;
    });
  }
  return loading;
}

// root (ground position / facing) > tilt (lean at the feet) > squash (scale at the feet) > model
export function createReko() {
  if (!template) throw new Error('reko not loaded — await preloadReko() first');
  const root = new THREE.Group();
  root.name = 'reko';
  const tilt = new THREE.Group();
  const squash = new THREE.Group();
  root.add(tilt); tilt.add(squash);
  const model = template.scene.clone(true);
  model.scale.setScalar(template.s);
  model.position.copy(template.offset);
  squash.add(model);
  // effect anchors (model faces +Z, his right hand holds the flask on -X)
  const anchor = (x, y, z) => { const o = new THREE.Object3D(); o.position.set(x, y, z); squash.add(o); return o; };
  return {
    root, tilt, squash, model,
    butt: anchor(0, 0.5, -0.42),
    shades: anchor(0.28, 1.3, 0.62),
    flask: anchor(-0.6, 0.78, 0.3),
    height: HEIGHT,
  };
}

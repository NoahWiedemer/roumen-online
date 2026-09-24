// Dev viewer: /viewer.html?scene=<name>&terrain=1&cam=x,y,z&target=x,y,z
// Loads src/dev/scenes/<name>.js and calls its default export with a context object.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Engine } from '../core/engine.js';
import { Terrain } from '../world/terrain.js';
import { Sky } from '../world/sky.js';
import { createSea } from '../world/sea.js';

const q = new URLSearchParams(location.search);
const showErr = (e) => { const el = document.getElementById('info'); el.style.color = '#ff6060'; el.textContent += '\nERROR: ' + (e && (e.stack || e.message) || e); };
window.addEventListener('error', (e) => showErr(e.error || e.message));
window.addEventListener('unhandledrejection', (e) => showErr(e.reason));
const vec = (s, d) => (s ? new THREE.Vector3(...s.split(',').map(Number)) : d);

const engine = new Engine(document.getElementById('c'), { bloom: q.get('bloom') !== '0' });
const { scene, camera } = engine;
camera.position.copy(vec(q.get('cam'), new THREE.Vector3(6, 4, 8)));
const controls = new OrbitControls(camera, engine.renderer.domElement);
controls.target.copy(vec(q.get('target'), new THREE.Vector3(0, 1, 0)));
controls.update();

const updaters = [];
let terrain = null;
if (q.get('terrain') === '1') {
  terrain = new Terrain();
  scene.add(terrain.mesh);
  const sea = createSea(terrain, engine.sunDir);
  scene.add(sea.mesh);
  updaters.push((dt, t) => sea.update(t));
} else {
  const g = new THREE.Mesh(new THREE.CircleGeometry(40, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x6fa54a, roughness: 1 }));
  g.receiveShadow = true;
  scene.add(g);
}
const sky = new Sky(scene, engine.sunDir);

const ctx = { THREE, engine, scene, camera, controls, terrain, q, onUpdate: (fn) => updaters.push(fn), info: (t) => (document.getElementById('info').textContent = t) };
const name = q.get('scene');
if (name) {
  try {
    const mod = await import(/* @vite-ignore */ `./scenes/${name}.js`);
    await mod.default(ctx);
  } catch (e) { showErr(e); }
}

const clock = new THREE.Clock();
let frames = 0;
const fixedT = q.get('time') ? Number(q.get('time')) : null;
function loop() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  for (const f of updaters) f(fixedT !== null && frames < 2 ? fixedT : dt, t);
  controls.update();
  engine.setShadowFocus(controls.target);
  sky.update(dt, camera.position);
  engine.render();
  frames++;
  if (frames === 30) window.__ready = true;
  requestAnimationFrame(loop);
}
loop();

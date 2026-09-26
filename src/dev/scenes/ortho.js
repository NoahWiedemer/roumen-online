// Near-orthographic measuring view of a raw glb (model space, no recentering) with a coordinate grid on top:
//   ?scene=ortho&file=/models/cumbot.glb&view=front|side|back|top&span=1.1&step=0.1&c=0,0 (view centre)
//   &joints=cumbot  -> overlay the joint table of a rigged static model (spheres + bone lines)
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export default async function (ctx) {
  const { scene, camera, controls, q, engine } = ctx;
  const gltf = await new GLTFLoader().loadAsync(q.get('file'));
  scene.add(gltf.scene);
  scene.children.filter((o) => o.isMesh && o.geometry?.type === 'CircleGeometry').forEach((o) => { o.visible = false; });
  const view = q.get('view') || 'front';
  const span = Number(q.get('span') || 1.1), step = Number(q.get('step') || 0.1);
  const [cu, cv] = (q.get('c') || '0,0').split(',').map(Number);
  // axes of the view plane (u right, v up) and the camera direction
  const V = {
    front: { dir: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
    back: { dir: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
    side: { dir: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },   // looking from +X (model's left side)
    top: { dir: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
  }[view];
  const d = new THREE.Vector3(...V.dir), u = new THREE.Vector3(...V.u), v = new THREE.Vector3(...V.v);
  const centre = u.clone().multiplyScalar(cu).add(v.clone().multiplyScalar(cv));
  const dist = 80;
  camera.fov = 2 * Math.atan(span / dist) * 180 / Math.PI;
  camera.near = dist - 10; camera.far = dist + 10;
  camera.up.copy(view === 'top' ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, 1, 0));
  camera.position.copy(centre).addScaledVector(d, dist);
  camera.updateProjectionMatrix();
  controls.target.copy(centre);
  controls.enabled = false;
  // grid lines in front of everything
  const pts = [], major = [];
  const n = Math.ceil(span * 2 / step) + 2;
  const snap = (x) => Math.round(x / step) * step;
  for (let i = -n; i <= n; i++) {
    const a = snap(cu) + i * step, b = snap(cv) + i * step;
    const isMaj = (x) => Math.abs(x / (step * 5) - Math.round(x / (step * 5))) < 1e-4;
    const lu = [u.clone().multiplyScalar(a).addScaledVector(v, cv - span * 2), u.clone().multiplyScalar(a).addScaledVector(v, cv + span * 2)];
    const lv = [v.clone().multiplyScalar(b).addScaledVector(u, cu - span * 2), v.clone().multiplyScalar(b).addScaledVector(u, cu + span * 2)];
    (isMaj(a) ? major : pts).push(...lu);
    (isMaj(b) ? major : pts).push(...lv);
  }
  for (const [list, color, op] of [[pts, '#ffffff', 0.25], [major, '#ffea00', 0.7]]) {
    const g = new THREE.BufferGeometry().setFromPoints(list);
    const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity: op, depthTest: false }));
    l.renderOrder = 10;
    scene.add(l);
  }
  // joint overlay
  if (q.get('joints')) {
    const mod = await import(/* @vite-ignore */ `../../entities/bosses/${q.get('joints')}.js`);
    const { J, PARENT } = mod.RIG;
    const sm = new THREE.MeshBasicMaterial({ color: '#ff2060', depthTest: false });
    const lines = [];
    for (const [name, p] of Object.entries(J)) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), sm);
      s.position.set(...p); s.renderOrder = 11;
      scene.add(s);
      const par = PARENT[name];
      if (par && J[par]) lines.push(new THREE.Vector3(...J[par]), new THREE.Vector3(...p));
    }
    const lg = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(lines), new THREE.LineBasicMaterial({ color: '#00ffd0', depthTest: false }));
    lg.renderOrder = 11;
    scene.add(lg);
  }
  engine.useBloom = false;
  ctx.info(`${view}  u=${V.u} v=${V.v}  step ${step} (yellow = ${step * 5})  centre ${cu},${cv}`);
}

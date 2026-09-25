// Show a glb / gltf: ?scene=glb&file=/models/imp.glb&rot=0&anim=Jog_Fwd_Loop&bones=1
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export default async function (ctx) {
  const { scene, q } = ctx;
  const gltf = await new GLTFLoader().loadAsync(q.get('file'));
  const m = gltf.scene;
  m.rotation.y = Number(q.get('rot') || 0);
  m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  const box = new THREE.Box3().setFromObject(m);
  m.position.y -= box.min.y;
  scene.add(m);
  if (q.get('bones')) scene.add(new THREE.SkeletonHelper(m));
  if (gltf.animations.length && q.get('anim')) {
    const mixer = new THREE.AnimationMixer(m);
    const clip = gltf.animations.find((a) => a.name === q.get('anim'));
    if (clip) mixer.clipAction(clip).play();
    ctx.onUpdate((dt) => mixer.update(dt));
  }
  window.__glb = gltf;
  let tris = 0; m.traverse((o) => { if (o.isMesh && o.geometry.index) tris += o.geometry.index.count / 3; });
  ctx.info(`${q.get('file')} tris=${tris} size=${box.getSize(new THREE.Vector3()).toArray().map((v) => v.toFixed(2))} anims=${gltf.animations.length}`);
}

// Mocap retarget check: ?scene=mocap&clip=Jog_Fwd_Loop&rot=1.57&time=0.3&freeze=1
// left: the library's own mannequin playing the clip, right: player.glb playing the retargeted clip
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createFighter } from '../../entities/fighter.js';
import { preloadPlayerModel } from '../../entities/playerModel.js';
import { preloadMocap } from '../../entities/mocap.js';

export default async function (ctx) {
  const { scene, q } = ctx;
  await preloadPlayerModel();
  const lib = await preloadMocap();
  const name = q.get('clip') || 'Idle_Loop';
  const rot = Number(q.get('rot') || 0);
  const time = Number(q.get('time') || 0);
  const freeze = q.has('freeze');
  // source mannequin
  const gltf = await new GLTFLoader().loadAsync('/anims/AnimationLibrary_Godot_Standard.gltf');
  const src = gltf.scene;
  src.position.x = -0.9;
  src.rotation.y = rot;
  scene.add(src);
  const mixer = new THREE.AnimationMixer(src);
  const a = mixer.clipAction(gltf.animations.find((c) => c.name === name));
  a.play();
  mixer.setTime(time);
  // retargeted fighter
  const f = createFighter();
  if (f.rig.weapon) f.rig.weapon.visible = false;
  f.root.position.x = 0.9;
  f.root.rotation.y = rot;
  scene.add(f.root);
  f.anim.play('mc_' + name, { fadeIn: 0 });
  for (let k = 0; k < Math.round(time * 100); k++) f.anim.update(0.01, f.root.position);
  if (freeze) f.anim.action.speed = 0;
  ctx.onUpdate((dt) => { if (!freeze) mixer.update(dt); f.anim.update(freeze ? 0 : dt, f.root.position); });
  ctx.info(`${name}  speed(leg/s)=${lib.meta[name] && lib.meta[name].speedLeg.toFixed(2)}  clips=${Object.keys(lib.clips).length}`);
}

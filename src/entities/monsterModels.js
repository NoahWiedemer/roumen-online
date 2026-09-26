// Monster models + procedural animation.
//
//   import { preloadMonsterAssets, createMonsterModel, MONSTER_TYPES } from './entities/monsterModels.js';
//   await preloadMonsterAssets();           // loads /models/imp.glb and builds the rigged imp template (once)
//   const m = createMonsterModel('slime', { tint: new THREE.Color(1, .95, .92) });   // synchronous
//   scene.add(m.root);           // feet at y=0, faces +Z; rotate m.root.rotation.y to steer
//   m.setMoving(1);              // 0 idle … 1 full walk/hop speed (blends smoothly)
//   const hitDelay = m.attack(); // seconds until the impact frame (m.onImpact(strength) also fires then)
//   m.hit(); m.die();            // after death finishes m.dead === true → remove + m.dispose()
//   m.update(dt) every frame.
//
// slime & kingslime share one model/animation code path (king = scale/colour/crown/cape/heavy timings).
// imp = the user's imp.glb, auto-rigged at preload (SkinnedMesh) and animated procedurally.
// bee & boar are still available but no longer part of MONSTER_TYPES.
import * as THREE from 'three';
import { SlimeMonster } from './monsters/slime.js';
import { MushroomMonster } from './monsters/mushroom.js';
import { BeeMonster } from './monsters/bee.js';
import { BoarMonster } from './monsters/boar.js';
import { ImpMonster, preloadImp, impReady } from './monsters/imp.js';
import { SkinnedMonster } from './monsters/skinned.js';
import { HammerBoarMonster } from './monsters/hammerBoar.js';

export const MONSTER_TYPES = ['slime', 'mushroom', 'imp', 'kingslime'];
export const ALL_MONSTER_TYPES = ['slime', 'mushroom', 'imp', 'kingslime', 'bee', 'boar'];

const CTORS = {
  slime: SlimeMonster,
  kingslime: SlimeMonster,
  mushroom: MushroomMonster,
  imp: ImpMonster,
  bee: BeeMonster,
  boar: BoarMonster,
  // rat-men (skinned ratman_mob.glb — preload with npcModels.preloadNpcModel('ratman_mob') before spawning)
  ratman: SkinnedMonster,
  ratman_digger: SkinnedMonster,
  ratman_hypno: SkinnedMonster,
  ratman_frenzy: SkinnedMonster,
  // Hammer Boar (skinned eber.glb — preload with preloadNpcModel('eber'))
  hammer_boar: HammerBoarMonster,
};

// Async: load + prepare every asset that is not generated in code (currently the rigged imp). Safe to call repeatedly.
export async function preloadMonsterAssets() {
  await preloadImp();
}

// bosses register their model class from their own module (keeps big boss code out of the common path)
export function registerMonsterModel(type, ctor) { CTORS[type] = ctor; }

export function createMonsterModel(type, { tint } = {}) {
  const C = CTORS[type];
  if (!C) throw new Error(`Unknown monster type "${type}"`);
  return new C(type, { tint });
}

// Optional: pre-compile every monster shader variant (normal + death-fade) against the real scene lights,
// so the first spawn / first death does not hitch. Call once after lights are set up (after preloadMonsterAssets).
export function warmupMonsters(renderer, camera, scene, types = MONSTER_TYPES) {
  const group = new THREE.Group();
  const models = [];
  for (const type of types) {
    if (type === 'imp' && !impReady()) continue;
    for (const fading of [false, true]) {
      const m = createMonsterModel(type);
      if (fading) { m.die(); m.update(m.collapseDur + 0.2); }
      m.root.traverse((o) => { o.visible = true; });
      group.add(m.root);
      models.push(m);
    }
  }
  try {
    renderer.compile(group, camera, scene);
  } finally {
    for (const m of models) m.dispose();
  }
}

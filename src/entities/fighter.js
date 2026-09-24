// The player's Fighter: an original chibi swordsman design
import { createHumanoid } from './humanoid.js';
import { Animator } from './anim.js';

export const FIGHTER_LOOK = {
  name: 'fighter',
  outfit: 'fighter',
  hair: 'spiky',
  hairColor: '#d8302a',
  hairSeed: 7,
  skin: '#ffdcc6',
  armorColor: '#c3262c',
  armorDark: '#7a1418',
  trimColor: '#eab54c',
  clothColor: '#2a2230',
  cloth2Color: '#f3ebdd',
  leatherColor: '#5e3620',
  bootColor: '#b8232a',
  gemColor: '#39a4ff',
  ribbonColor: '#f5efe2',
  weapon: 'sword',
  swordStyle: 'broad',
  headband: false,
  tabard: true,
  tabardColor: '#8e1a22',
  legScale: 1.2,
  armScale: 1.12,
  shoulderW: 0.19,
  headR: 0.238,
  face: {
    irisColor: ['#e0a040', '#a0501c', '#3a1406'], browColor: '#7a1c12', browTilt: 0.34, browWidth: 0.026,
    eyeScale: 0.84, eyeAspect: 0.74, eyeY: 0.575, eyeSpacing: 0.16, blush: false, smile: -0.004, lashColor: '#1e0c08',
  },
};

export function createFighter(overrides = {}) {
  const rig = createHumanoid({ ...FIGHTER_LOOK, ...overrides });
  const anim = new Animator(rig);
  return { rig, anim, root: rig.root };
}

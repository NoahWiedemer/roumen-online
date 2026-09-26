// Vagel's hostage and the Robo S-Card — the story around the last fight of the Tower of Isel:
//   Prince Ratman, Sir Ratman's son, is Vagel's hostage. He sits in a cage of gold and violet light beside her throne,
//   and the cage hovers before her great hoard once she takes the hero into her vault. That is why his father, strong
//   enough to take the tower apart on his own, cannot lift a paw against her (he tells the hero when they first meet).
//   At her wrath (30%) her eyes blaze and she grows stronger. Sir Ratman tears a rift into the vault, draws the Robo
//   S-Card (a gift of Robo, King of Beasts), shows it off like a card duellist and throws it to the hero: it blazes
//   up, the spirit of the King of Beasts appears behind the hero and blesses them (Beast Blessing: now they can keep
//   up with her). Sir Ratman guards his son's cage for the rest of the fight.
//   When she falls she vanishes, vowing to return stronger; her treasure stays behind in a chest, the cage bursts,
//   father and son meet again, Sir Ratman thanks the hero (the rat-folk can live in peace again) and a portal home to
//   Roumen rises in the vault. Father and son stay there (they can be talked to) until the hero leaves the vault;
//   from then on the prince stands at his father's side in the Forest of Mist.
// A new attempt after being knocked out brings Sir Ratman back without the long scene (the hero keeps the card); in
// later fights (the prince is free) the card in the bag blazes up by itself.
// The boss (vagel.js) calls in at the moments that matter; the rest runs from the Tower's per-frame update.
import * as THREE from 'three';
import { Clip, CLIPS, fullPose, P_IDLE } from '../anim.js';
import { preloadNpcModel } from '../npcModels.js';
import { P_RAT, P_KING } from '../npcs.js';
import { Actor, Prison, Rift, RoboCard, BeastAura, BeastSpirit, TreasureChest, loadRoboCard, headOf } from './storyProps.js';
import { Cutscene, flash } from '../../game/cutscene.js';
import { NPCS } from '../../game/data.js';
import { G } from '../../game/game.js';
import { VAULT, THRONE_PRISON, ZONE } from '../../world/isel/layout.js';

export const FREED = 'prince:freed';        // (also the cue for the prince to appear in the Forest of Mist)
const SEEN = 'prince:seen';                 // Vagel has shown off her hostage
const CARD = 'vagel:card';                  // Sir Ratman has thrown the hero the card
const FIGHT = ['shift', 'vault', 'wrath', 'defeat'];
const TAU = Math.PI * 2;

// ------------------------------------------------------------------ lines
const VAGEL = { who: 'Vagel', title: 'Goddess of Greed' }, SIR = { who: 'Sir Ratman', title: 'Rat Knight' }, PRINCE = { who: 'Prince Ratman', title: 'Heir of the Rat-Folk' };
const CARD_WHO = { who: 'Robo S-Card', title: 'S-rank  ★★★★★★★' };
const L = {
  show: 'Speaking of rats... say hello to my little prince. Sir Ratman\'s precious son.',
  plea: 'Hero! Don\'t listen to her! My father will come and—',
  hostage: 'Your father will do nothing, pet. As long as you sit in my cage, the mighty Sir Ratman does not dare to lift a single claw against me.',
  enrage: 'ENOUGH! You dare take from ME?!',
  surge: 'I have been far too generous with you. Now I take EVERYTHING — your gold, your breath, your pathetic little soul!',
  notSoFast: 'Not so fast, witch!',
  ratman: 'Ratman?! How DARE you set foot in my vault! One more step and your precious son—',
  why: 'My son is the very reason I am here. I cannot raise my pickaxe against you while you hold his life, Vagel... but nothing forbids me to help a friend!',
  draw: 'Hero! My old friend Robo, the King of Beasts, entrusted me with this for the darkest hour. I would say this is it!',
  behold: 'Behold — the Robo S-Card! S-rank! Seven stars!',
  cardText: '"The mighty Robo is the King of Beasts — only fools think he is a robot."',
  catchIt: 'Catch!',
  stand: 'Now you can stand against her! For my son — and for all the rat-folk!',
  again: 'Once more, friend! Raise the card — Robo\'s strength has not left you!',
  blazeAgain: 'The Robo S-Card blazes up in your hand. The King of Beasts has not forgotten you!',
  blazeAlone: 'Greed rises against you — and the Robo S-Card blazes up! The King of Beasts fights at your side.',
  reply: ['A CARD?! You think a scrap of paper can stop a GODDESS?!', 'That cursed card AGAIN?!', 'That cursed card... I will melt it down with the rest of your bones!'],
  fall: 'No... NO! My gold... my glory... bested by a nobody with a CARD?!',
  fallAgain: 'No... not again... not by YOU!',
  vow: 'Mark my words, little thief: greed never dies. I WILL return — richer, stronger, and hungrier than ever!',
  free: 'The cage... it is breaking! I am free — I am FREE!',
  myBoy: 'My boy! My brave, brave boy...',
  father: 'Father! I knew you would come!',
  thanks: 'Hero... you gave me back my son. And with Vagel gone, the rat-folk can finally live in peace again. We are forever in your debt.',
  princeThanks: 'Thank you, hero! That was the most amazing fight I have ever seen!',
  home: 'Look — her vault opens a way home. That portal leads straight back to Roumen. Go and rest, my friend. We will meet again in the Forest of Mist!',
};
// shouts in the chat while the hero fights in the vault
const SHOUTS = {
  prince: ['You can do it, hero!', 'Keep moving — her gold cannot hit what it cannot catch!', 'Don\'t give up! Please!', 'Watch her hands — they glow before she strikes!', 'She hates it when you get close!'],
  sir: ['Strike true, friend! I will keep her claws off my boy!', 'Hold fast — Robo\'s strength is in you!', 'Ha! Her greed has made her slow!', 'Do not let up now, hero!'],
  princeLate: ['Father! You came!', 'Go, hero! Go!', 'She is weakening — I can see it!'],
};
const pick = (a) => a[(Math.random() * a.length) | 0];
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const dirTo = (a, b) => Math.atan2(b.x - a.x, b.z - a.z);
// turn the hero at once (and keep them turned: the player damps towards faceGoal)
const turnHero = (to) => { const p = G.player; p.rotY = p.faceGoal = dirTo(p.pos, to); };

// ------------------------------------------------------------------ poses and clips
// the prince in his cage: shoulders down, head hanging
const P_SAD = fullPose({ ...P_RAT, spine: [0.2, 0, 0], chest: [0.1, 0, 0], neck: [0.1, 0, 0], head: [0.26, 0, 0], armL: [0.1, 0, 0.1], elbowL: [-0.2, 0, 0], armR: [0.1, 0, -0.1], elbowR: [-0.2, 0, 0] });
// Sir Ratman guarding the cage: feet apart, the pickaxe raised across the body, the free paw ready
const P_GUARD = fullPose({
  ...P_RAT, pos: [0, -0.04, 0], spine: [0.14, 0, 0], chest: [0.06, 0, 0], head: [-0.12, 0, 0],
  armR: [-0.95, 0.35, -0.3], elbowR: [-1.1, 0, 0], handR: [0.2, 0, 0], armL: [-0.5, 0, 0.5], elbowL: [-0.9, 0, 0],
  legL: [-0.25, 0.1, 0.18], kneeL: [0.35, 0, 0], legR: [0.2, -0.1, -0.18], kneeR: [0.3, 0, 0],
});
const clip = (name, duration, base, keys, loop = false) => (CLIPS[name] = new Clip(name, { duration, base, keys, curve: 'smooth', loop }));
// Sir Ratman draws the card: the left paw reaches back to his belt, then sweeps it up high over his head
const REACH = { armL: [0.55, 0.2, 0.3], elbowL: [-1.1, 0, 0], handL: [0.2, 0, 0], chest: [0.05, 0.25, 0], head: [0.1, 0.2, 0] };
const HIGH = { armL: [-2.85, 0, 0.45], elbowL: [-0.15, 0, 0], handL: [0, 0, 0], spine: [-0.1, 0, 0], chest: [-0.15, 0, 0], head: [-0.35, 0.1, 0] };
clip('rt_draw', 8, P_RAT, [{ t: 0, ...P_RAT }, { t: 0.45, stop: true, ...REACH }, { t: 0.95, armL: [-1.6, 0, 1.1], elbowL: [-0.3, 0, 0], chest: [-0.05, -0.1, 0], head: [-0.15, 0, 0] }, { t: 1.4, stop: true, ...HIGH }, { t: 7.4, stop: true, ...HIGH }, { t: 8, ...P_RAT }]);
// ... holds it up beside his face, its picture turned to the onlooker, like a duellist playing his trump
const SHOW = { armL: [-1.25, 0.55, 0.55], elbowL: [-1.75, 0, 0], handL: [0.05, 0, 0], chest: [-0.04, 0.2, 0], head: [0.02, -0.12, 0.05] };
clip('rt_show', 12, P_RAT, [{ t: 0, ...P_RAT, ...HIGH }, { t: 0.55, stop: true, ...SHOW }, { t: 11.4, stop: true, ...SHOW }, { t: 12, ...P_RAT }]);
// ... and throws it: the paw winds up across the chest and snaps out (the card leaves it at 0.38 s)
const WIND = { armL: [-1.4, -0.9, -0.2], elbowL: [-1.9, 0, 0], chest: [0, 0.35, 0], spine: [0, 0.15, 0] };
const OUT = { armL: [-1.45, 0.35, 0.75], elbowL: [-0.1, 0, 0], handL: [-0.2, 0, 0], chest: [0.05, -0.35, 0], spine: [0.02, -0.15, 0] };
clip('rt_throw', 1.5, P_RAT, [{ t: 0, ...P_RAT, ...SHOW }, { t: 0.26, stop: true, ...WIND }, { t: 0.38, ...OUT }, { t: 0.6, stop: true, ...OUT, chest: [0.08, -0.4, 0] }, { t: 1.5, ...P_RAT }]);
// father and son: an embrace (he goes down on one knee), the prince's arms round his father's neck
const HUG = {
  pos: [0, -0.3, 0.05], spine: [0.3, 0, 0], chest: [0.1, 0, 0], head: [0.3, 0.15, 0.1],
  armL: [-1.25, -0.75, 0.15], elbowL: [-1.35, 0, 0], armR: [-1.15, 0.75, -0.15], elbowR: [-1.3, 0, 0],
  legL: [-1.35, 0, 0.1], kneeL: [1.45, 0, 0], footL: [-0.1, 0, 0], legR: [0.35, 0, -0.1], kneeR: [1.75, 0, 0], footR: [0.55, 0, 0],
};
clip('rt_hug', 6, P_RAT, [{ t: 0, ...P_RAT }, { t: 0.7, stop: true, ...HUG }, { t: 3, ...HUG, spine: [0.34, 0, 0.05] }, { t: 5.4, stop: true, ...HUG }, { t: 6, ...P_RAT }]);
const PHUG = { armL: [-1.1, -0.8, 0.35], elbowL: [-1.6, 0, 0], armR: [-1.1, 0.8, -0.35], elbowR: [-1.6, 0, 0], spine: [0.28, 0, 0], chest: [0.1, 0, 0], head: [0.4, 0.15, 0.05] };
clip('pr_hug', 6, P_RAT, [{ t: 0, ...P_RAT }, { t: 0.5, stop: true, ...PHUG }, { t: 5.4, stop: true, ...PHUG }, { t: 6, ...P_RAT }]);
// the prince in his cage: pounding on the barrier, pleading with folded paws; free: a jump for joy
const KNOCK = { armL: [-1.45, -0.1, 0.12], elbowL: [-0.55, 0, 0], armR: [-1.45, 0.1, -0.12], elbowR: [-0.55, 0, 0], head: [-0.08, 0, 0], spine: [0.05, 0, 0] };
clip('pr_knock', 2.4, P_SAD, [{ t: 0, ...P_SAD }, { t: 0.35, stop: true, ...KNOCK }, { t: 0.55, ...KNOCK, elbowL: [-1.0, 0, 0] }, { t: 0.75, ...KNOCK }, { t: 0.95, ...KNOCK, elbowR: [-1.0, 0, 0] }, { t: 1.15, ...KNOCK }, { t: 1.35, ...KNOCK, elbowL: [-1.0, 0, 0] }, { t: 1.7, stop: true, ...KNOCK }, { t: 2.4, ...P_SAD }]);
const PLEAD = { armL: [-0.9, -0.5, 0.1], elbowL: [-1.7, 0, 0], armR: [-0.9, 0.5, -0.1], elbowR: [-1.7, 0, 0], head: [-0.18, 0, 0], spine: [0.06, 0, 0] };
clip('pr_plead', 3.2, P_SAD, [{ t: 0, ...P_SAD }, { t: 0.45, stop: true, ...PLEAD }, { t: 2.6, stop: true, ...PLEAD, head: [-0.22, 0.08, 0] }, { t: 3.2, ...P_SAD }]);
const JOY = { armL: [-2.9, 0, 0.45], elbowL: [-0.2, 0, 0], armR: [-2.9, 0, -0.45], elbowR: [-0.2, 0, 0], head: [-0.25, 0, 0], spine: [-0.08, 0, 0] };
clip('pr_cheer', 2.2, P_RAT, [{ t: 0, ...P_RAT }, { t: 0.3, stop: true, ...JOY, root: [0, 0, 0] }, { t: 0.5, ...JOY, root: [0, 0.22, 0] }, { t: 0.7, stop: true, ...JOY, root: [0, 0, 0] }, { t: 0.9, ...JOY, root: [0, 0.18, 0] }, { t: 1.1, stop: true, ...JOY, root: [0, 0, 0] }, { t: 2.2, ...P_RAT }]);
// the hero holds the card high (caught with the left hand)
const RAISE = { armL: [-2.95, 0, 0.3], elbowL: [-0.1, 0, 0], handL: [0, 0, 0], spine: [-0.1, 0, 0], chest: [-0.12, 0, 0], head: [-0.35, 0, 0] };
clip('hero_card', 4, P_IDLE, [{ t: 0, ...P_IDLE }, { t: 0.3, armL: [-1.9, 0, 0.35], elbowL: [-0.6, 0, 0] }, { t: 0.7, stop: true, ...RAISE }, { t: 3.4, stop: true, ...RAISE }, { t: 4, ...P_IDLE }]);
// the spirit of Robo: a roar with the arms thrown wide, then (of course) a double-biceps flex
const ROAR = { spine: [-0.12, 0, 0], chest: [-0.28, 0, 0], neck: [-0.1, 0, 0], head: [-0.55, 0, 0], armL: [-0.7, 0, 1.25], elbowL: [-0.7, 0, 0], armR: [-0.7, 0, -1.25], elbowR: [-0.7, 0, 0] };
const FLEX = { armL: [0, 0, 1.5], elbowL: [0, 0, 1.85], armR: [0, 0, -1.5], elbowR: [0, 0, -1.85], chest: [-0.12, 0, 0], head: [-0.1, 0, 0], spine: [-0.06, 0, 0] };
clip('rb_roar', 3.8, P_KING, [{ t: 0, ...P_KING }, { t: 0.4, stop: true, ...ROAR }, { t: 1.5, ...ROAR, head: [-0.6, 0, 0] }, { t: 2.0, stop: true, ...FLEX }, { t: 3.2, stop: true, ...FLEX }, { t: 3.8, ...P_KING }]);

// ------------------------------------------------------------------ camera spots
// a camera `dist` metres from `at` (horizontally) and `up` above it, on the side the angle `dir` points to (0 = +z), or
// the nearest side from which nothing (a column, a heap, the cage) blocks the view
function clearLine(a, b, skipEnd) {
  const len = Math.hypot(b.x - a.x, b.z - a.z), n = Math.ceil(len / 0.5);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (len * (1 - t) < skipEnd) break;
    if (G.colliders.blocked(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, 0.25)) return false;
  }
  return true;
}
function camSpot(at, dir, dist, up, { skipEnd = 1.5, where = 'vault' } = {}) {
  const inside = (c) => (where === 'throne' ? G.terrain.where(c.x, c.z) === 'throne' : Math.hypot(c.x - VAULT.x, c.z - VAULT.z) < VAULT.r - 1.2);
  for (const o of [0, 0.3, -0.3, 0.6, -0.6, 0.95, -0.95, 1.35, -1.35, 1.9, -1.9, Math.PI]) {
    const a = dir + o, c = V3(at.x + Math.sin(a) * dist, at.y + up, at.z + Math.cos(a) * dist);
    if (inside(c) && !G.colliders.blocked(c.x, c.z, 0.6) && clearLine(c, at, skipEnd)) return c;
  }
  return V3(at.x + Math.sin(dir) * dist, at.y + up, at.z + Math.cos(dir) * dist);
}

// ------------------------------------------------------------------ the story
let story = null;
export const vagelStory = () => story;
export function preloadVagelStory() {
  return Promise.all([preloadNpcModel('ratman'), preloadNpcModel('ratprince'), preloadNpcModel('robo').catch((e) => console.warn('robo spirit', e)), loadRoboCard()]);
}
// built with the Tower of Isel (main.js), before the hero enters it
export function attachVagelStory(world) {
  if (!story) story = new VagelStory(world);
  return story;
}

class VagelStory {
  constructor(world) {
    this.world = world;
    this.env = { terrain: world.terrain, colliders: world.colliders };
    this.root = new THREE.Group();
    this.root.name = 'isel-story';
    world.root.add(this.root);
    this.home = world.vault && world.vault.home;
    this.rift = new Rift(this.root);
    this.card = new RoboCard(this.root);
    this.aura = new BeastAura();
    this.spirit = new BeastSpirit(this.root, P_KING);
    this.prison = null; this.prince = null; this.sir = null; this.chest = null;
    this.boss = null;
    this.caged = false;          // the prince stands in his cage (follows it)
    this.guarding = false;       // Sir Ratman guards the cage
    this.after = false;          // her fall is over: father and son wait in the vault, the chest too
    this.lineT = 10; this.princeT = 3;
    this.ensurePrison();
    world.onUpdate((dt) => this.update(dt));
    G.on('world', (w) => { if (w !== world) this.leftTower(); });
  }
  get freed() { return !!(G.player && G.player.flags[FREED]); }
  bind(boss) { this.boss = boss; }
  actor(model, pose) {
    const a = new Actor(model, this.root, this.env, { pose });
    a.anim.crossfade = true;
    return a;
  }

  // ---------------------------------------------------------------- the hostage
  ensurePrison() {
    if (this.prison || this.prince || this.freed || this.after) return;
    this.prison = new Prison(this.root, this.env);
    this.prison.place('throne', THRONE_PRISON.x, THRONE_PRISON.z);
    this.prince = this.actor('ratprince', P_SAD);
    this.caged = true;
    this.keepInCage();
    this.prince.rotY = -Math.PI / 2;
  }
  keepInCage() {
    const pr = this.prince, pz = this.prison, P = pz.group.position;
    pr.pos.x = P.x; pr.pos.z = P.z;
    pr.lift = pz.floorY() - this.env.terrain.groundAt(P.x, P.z);
  }
  // her magic takes the cage along into the vault (and back to her throne when the fight is over)
  moveCage(where) {
    const pz = this.prison;
    if (!pz || pz.where === where) return;
    const c = pz.center();
    G.fx.particles.burst(c.x, c.y, c.z, 30, { color: new THREE.Color('#d8a8ff'), speed: 4, life: 0.7, size: 0.35, grav: 0, up: 0.3 });
    const P = where === 'vault' ? VAULT.prison : THRONE_PRISON;
    pz.place(where, P.x, P.z);
    this.keepInCage();
    this.prince.rotY = where === 'vault' ? 0 : -Math.PI / 2;
    this.prince.sync();
  }
  princeLife(dt, p) {
    const pr = this.prince;
    const d = Math.hypot(p.pos.x - pr.pos.x, p.pos.z - pr.pos.z);
    if (d < 34) pr.face(p.pos.x, p.pos.z);
    else pr.faceGoal = this.prison.where === 'vault' ? 0 : -Math.PI / 2;
    this.princeT -= dt;
    if (this.princeT <= 0 && !pr.anim.busy && !G.cutscene) {
      this.princeT = 5 + Math.random() * 6;
      if (d < 28) pr.play(pick(['pr_knock', 'pr_plead', 'pr_knock', 'lookout']));
    }
  }

  // ---------------------------------------------------------------- per frame
  update(dt) {
    const p = G.player;
    if (!p) return;
    this.ensurePrison();
    const w = G.terrain.where(p.pos.x, p.pos.z), inVault = w === 'vault', east = ZONE[w] === 'east';
    if (this.prison) {
      const pz = this.prison, seen = pz.where === 'vault' ? inVault : east;
      pz.group.visible = seen && !pz.gone;
      if (seen) pz.update(dt);
      if (pz.gone) { pz.dispose(); this.prison = null; }
    }
    if (this.prince) {
      const pr = this.prince;
      if (this.caged && this.prison) this.keepInCage();
      if (this.floatDown) { pr.lift = Math.max(0, pr.lift - dt * 1.4); if (pr.lift <= 0) this.floatDown = false; }
      pr.show(this.prison ? (this.prison.where === 'vault' ? inVault : east) : inVault);
      if (this.caged && pr.root.visible) this.princeLife(dt, p);
      pr.update(dt);
    }
    if (this.sir) {
      const s = this.sir;
      if (this.sirFade) {
        const f = this.sirFade;
        f.t += dt;
        const k = Math.min(1, Math.max(0, f.t / f.dur));
        s.setOpacity(f.to ? k : 1 - k);
        if (k >= 1) { this.sirFade = null; if (!f.to) { s.dispose(); this.sir = null; } }
      }
      if (this.sir) {
        if (this.guarding) s.face(p.pos.x, p.pos.z);
        s.show(inVault);
        s.update(dt);
      }
    }
    this.rift.update(dt);
    this.card.update(dt);
    this.aura.update(dt);
    this.spirit.update(dt, p.pos);
    if (this.chest) this.chest.update(dt);
    this.shouts(dt);
    if (this.after && !inVault) this.leaveVault();
    this.syncHome();
  }
  // the portal home: there once the prince is free, but not while she fights in her vault
  syncHome() {
    const h = this.home, b = this.boss;
    if (!h) return;
    const fight = !!(b && !b.dead && !b.removed && FIGHT.includes(b.stage));
    if (this.freed && !fight && !h.shown) h.show(false);
    else if (fight && h.shown) h.hide();
  }
  // encouragement in the chat while the hero fights in the vault
  shouts(dt) {
    const b = this.boss;
    if (!b || b.dead || b.stage !== 'vault' || G.cutscene || !this.prince || !this.caged) return;
    this.lineT -= dt;
    if (this.lineT > 0) return;
    this.lineT = 15 + Math.random() * 10;
    const pool = this.guarding
      ? [...SHOUTS.sir.map((t) => ['Sir Ratman', t]), ...SHOUTS.princeLate.map((t) => ['Prince Ratman', t])]
      : SHOUTS.prince.map((t) => ['Prince Ratman', t]);
    const [who, text] = pick(pool);
    G.msg(`${who}: "${text}"`, 'ally');
  }
  // (her blinks and aimed spells keep clear of the cage and of Sir Ratman)
  blocks(x, z, r = 0) {
    if (this.prison && this.prison.blocks(x, z, r)) return true;
    return !!(this.sir && Math.hypot(x - this.sir.pos.x, z - this.sir.pos.z) < 1.2 + r);
  }

  // ---------------------------------------------------------------- the boss calls in
  // the first meeting: she shows off her hostage (steps spliced into her intro in the throne room)
  introSteps(boss) {
    const p = G.player;
    if (!this.prince || !this.caged || this.freed || p.flags[SEEN]) return [];
    p.flags[SEEN] = true;
    const pr = this.prince, pz = this.prison;
    const cage = () => pz.center(V3());
    return [
      { run: (cs) => { const c = cage(); cs.setShot({ pos: camSpot(c, dirTo(c, p.pos) + 0.35, 7.5, 0.9, { where: 'throne', skipEnd: 2 }), look: c, dur: 1.4 }); pr.play('pr_knock'); },
        say: { ...VAGEL, text: L.show } },
      { run: (cs) => { const h = headOf(pr, V3()); cs.setShot({ pos: camSpot(h, dirTo(h, p.pos), 3.6, -0.1, { where: 'throne', skipEnd: 2.2 }), look: V3(h.x, h.y - 0.25, h.z), dur: 1.0 }); pr.play('pr_plead'); },
        say: { ...PRINCE, text: L.plea } },
      { run: (cs) => { const h = boss.model.headWorld(V3()); cs.setShot({ pos: camSpot(h, dirTo(h, p.pos), 5.2, -0.5, { where: 'throne' }), look: h, dur: 1.1 }); boss.model.play('vg_laugh'); G.audio.play('laugh'); },
        say: { ...VAGEL, text: L.hostage } },
    ];
  }
  // 90%: into the vault, cage and all
  warp() { this.moveCage('vault'); }
  // the fight is over without her fall (the hero was knocked out or left): Sir Ratman slips away, the blessing fades,
  // the cage goes back beside her throne
  reset() {
    this.sirLeaves();
    this.rift.close();
    this.card.hide();
    this.dropBlessing();
    this.moveCage('throne');
  }
  sirLeaves() {
    const s = this.sir;
    if (!s) return;
    this.guarding = false;
    G.fx.particles.burst(s.pos.x, s.pos.y + 1.2, s.pos.z, 30, { color: new THREE.Color('#9affd0'), speed: 3, life: 0.8, size: 0.4, grav: 0, up: 0.5 });
    this.sirFade = { t: 0, dur: 0.6, to: 0 };
  }
  bless() {
    const p = G.player;
    if (!p.buffs.some((b) => b.id === 'beast_blessing')) p.addBuff('beast_blessing', 9999, { dmg: 0.5, def: 1.0, ward: 0.5, regenFlat: p.stats.maxHp * 0.012, aura: true });
    this.aura.set(true);
  }
  dropBlessing() {
    const p = G.player;
    this.aura.set(false);
    if (!p) return;
    const i = p.buffs.findIndex((b) => b.id === 'beast_blessing');
    if (i >= 0) { p.buffs.splice(i, 1); p.recalc(); G.emit('buffs'); }
  }
  heroHand(out = V3()) {
    const h = G.player.rig.weaponHolderL;
    if (!h) return out.copy(G.player.headPos()).add(V3(0, 0.5, 0));
    h.updateWorldMatrix(true, false);
    return h.getWorldPosition(out);
  }

  // ---------------------------------------------------------------- 30%: her wrath, Sir Ratman and the card
  // plays the scene; done() hands the fight back to her
  wrath(boss, done) {
    const p = G.player;
    const variant = this.freed ? 'alone' : p.flags[CARD] ? 'again' : 'first';
    const steps = [...this.wrathOpening(boss)];
    if (variant === 'first') steps.push(...this.sirArrives(boss, true), ...this.cardScene(), ...this.catchScene(variant));
    else if (variant === 'again') steps.push(...this.sirArrives(boss, false), ...this.catchScene(variant));
    else steps.push(...this.catchScene(variant));
    const reply = L.reply[variant === 'first' ? 0 : variant === 'again' ? 1 : 2];
    steps.push({ run: (cs) => { const h = boss.model.headWorld(V3()); cs.setShot({ pos: camSpot(h, dirTo(h, p.pos) - 0.3, 5.4, -0.6), look: h, dur: 1.0 }); boss.model.play('vg_point'); }, say: { ...VAGEL, text: reply } });
    const cs = new Cutscene(steps, { onEnd: () => { this.settleWrath(boss, variant); done(); } });
    cs.play();
    return cs;
  }
  wrathOpening(boss) {
    const p = G.player;
    return [
      // her eyes blaze
      { run: (cs) => { boss.wrathStart(); const h = boss.model.headWorld(V3()); cs.setShot({ pos: camSpot(h, dirTo(h, p.pos), 3.4, -0.45), look: V3(h.x, h.y - 0.1, h.z), dur: 0.8 }); }, say: { ...VAGEL, text: L.enrage } },
      // ... and her power surges
      { run: (cs) => { boss.powerSurge(); const b = V3(boss.pos.x, boss.floorY + 2.3, boss.pos.z); cs.setShot({ pos: camSpot(b, dirTo(b, p.pos) + 0.7, 10, 1.2), look: b, dur: 1.6 }); }, say: { ...VAGEL, text: L.surge } },
    ];
  }
  // Sir Ratman tears a rift into the vault and steps out beside his son's cage
  sirArrives(boss, first) {
    const R = VAULT.rift, rc = V3(R.x, 2.3, R.z), toMid = dirTo(rc, V3(VAULT.x, 0, VAULT.z));
    const open = (cs) => { this.rift.openAt(R.x, R.z); cs.setShot({ pos: camSpot(rc, toMid + 0.35, 6.6, 0.1, { skipEnd: 2 }), look: V3(rc.x, rc.y - 0.3, rc.z), dur: 1.3 }); };
    if (!first) return [{ run: (cs) => { open(cs); this.sirStepsOut(0.3); }, say: { ...SIR, text: L.again } }];
    return [
      { run: open, say: { ...SIR, text: L.notSoFast } },
      { run: () => this.sirStepsOut(0), until: () => !this.sir || this.sir.arrived, say: { ...VAGEL, text: L.ratman } },
      { run: (cs) => { const s = headOf(this.sir, V3()); cs.setShot({ pos: camSpot(s, dirTo(s, G.player.pos), 4, -0.35, { skipEnd: 2 }), look: V3(s.x, s.y - 0.3, s.z), dur: 1.2 }); this.rift.close(); },
        say: { ...SIR, text: L.why } },
    ];
  }
  sirStepsOut(delay) {
    const R = VAULT.rift, Gd = VAULT.guard;
    if (!this.sir) this.sir = this.actor('ratman', P_RAT);
    const s = this.sir;
    this.guarding = false;
    s.anim.battleTarget = 0;
    s.place(R.x, R.z, dirTo(R, Gd));
    s.setOpacity(0);
    this.sirFade = { t: -delay, dur: 0.6, to: 1 };
    s.walkTo(Gd.x, Gd.z, 1.5, () => s.face(G.player.pos.x, G.player.pos.z));
  }
  // he draws the card, shows it off, throws it
  cardScene() {
    const p = G.player, s = () => this.sir;
    const hand = V3(), cam = () => G.engine.camera.position;
    const inHand = () => s().handWorld('L', hand).add(V3(0, 0.22, 0));
    // the show: the camera flies in close to the card, which faces it
    const showCam = (cs, dt, dist) => {
      const c = this.card.worldPos(V3()), a = dirTo(s().pos, p.pos);
      const want = V3(c.x + Math.sin(a) * dist + Math.cos(a) * 0.12, c.y + 0.04, c.z + Math.cos(a) * dist - Math.sin(a) * 0.12);
      const k = 1 - Math.exp(-4.5 * dt);
      cs.shot = null;
      cs.pos.lerp(want, k);
      cs.look.lerp(V3(c.x, c.y - 0.1, c.z), k);
    };
    return [
      { run: (cs) => {
        const sr = s(), h = headOf(sr, V3());
        sr.face(p.pos.x, p.pos.z);
        sr.play('rt_draw');
        cs.setShot({ pos: camSpot(h, dirTo(sr.pos, p.pos) - 0.5, 3.4, -1.0, { skipEnd: 2 }), look: V3(h.x, h.y + 0.3, h.z), dur: 1.0 });
      },
      tick: (cs) => {
        if (cs.t >= 0.4 && !this.card.group.visible) { this.card.hold(inHand, cam); this.card.glowTarget = 0.5; }
        if (cs.t >= 1.0 && !cs._glint) { cs._glint = true; G.audio.play('card'); this.card.glowTarget = 1; }
      },
      say: { ...SIR, text: L.draw } },
      { run: () => s().play('rt_show'),
        tick: (cs, dt) => {
          showCam(cs, dt, 1.55);
          if (cs.t >= 0.5 && !cs._flash) { cs._flash = true; flash('#fff6d8', { rise: 0.06, hold: 0.04, fade: 0.55 }); G.audio.play('card'); this.card.raysTarget = 1; }
        },
        say: { ...SIR, text: L.behold } },
      { tick: (cs, dt) => showCam(cs, dt, 1.55 - Math.min(cs.t, 5) * 0.07), say: { ...CARD_WHO, text: L.cardText } },
      { run: (cs) => {
        const sr = s(), a = dirTo(sr.pos, p.pos);
        turnHero(sr.pos);
        sr.play('rt_throw');
        this.card.raysTarget = 0; this.card.glowTarget = 0.8;
        const h = headOf(sr, V3());
        cs.setShot({ pos: camSpot(V3(h.x, h.y - 0.2, h.z), a + Math.PI - 0.45, 2.7, 0.3, { skipEnd: 0 }), look: V3(p.pos.x, p.pos.y + 1.2, p.pos.z), dur: 0.5 });
        this.cardArrived = false;
      },
      tick: (cs, dt) => {
        if (cs.t >= 0.38 && !this.card.flying && !this.cardArrived && !cs._thrown) {
          cs._thrown = true;
          const from = this.card.worldPos(V3()), d = from.distanceTo(p.pos);
          this.card.throwTo(from, () => this.heroHand(V3()).add(V3(0, 0.3, 0)), 0.75 + d / 26, () => { this.cardArrived = true; });
        }
        if (cs._thrown) { cs.shot = null; cs.look.lerp(this.card.worldPos(V3()), 1 - Math.exp(-7 * dt)); }
      },
      until: () => this.cardArrived, say: { ...SIR, text: L.catchIt }, wait: 0.8 },
    ];
  }
  // the card blazes up in the hero's raised hand, the spirit of Robo appears behind them, the blessing flows in
  catchScene(variant) {
    const p = G.player;
    const say = variant === 'first' ? { ...SIR, text: L.stand } : { ...CARD_WHO, text: variant === 'again' ? L.blazeAgain : L.blazeAlone };
    return [{
      run: (cs) => {
        if (this.sir) turnHero(this.sir.pos);
        p.stopActions();
        p.anim.play('hero_card', { fadeIn: 0.15, fadeOut: 0.4 });
        this.card.hold(() => this.heroHand(V3()).add(V3(0, 0.3, 0)), () => G.engine.camera.position);
        this.card.glowTarget = 0.8;
        if (variant !== 'first') G.audio.play('card');
        const h = V3(p.pos.x, p.pos.y + 1.6, p.pos.z);
        cs.setShot({ pos: camSpot(h, p.rotY, 6.4, 0.3, { skipEnd: 1 }), look: V3(p.pos.x, p.pos.y + 2.1, p.pos.z), dur: 0.9 });
      },
      tick: (cs) => {
        if (cs.t >= 0.5 && !cs._blaze) {
          cs._blaze = true;
          this.card.glowTarget = 1; this.card.raysTarget = 1;
          flash('#fff2c0', { rise: 0.08, hold: 0.08, fade: 0.8 });
          G.audio.play('blessing');
          const at = p.pos.clone();
          G.fx.pillar(at, '#ffe070', 1.3, 0.9, 9);
          G.fx.shockwave(at, '#ffd24a');
        }
        if (cs.t >= 0.85 && !cs._spirit) {
          cs._spirit = true;
          const a = p.rotY;
          this.spirit.summon(p.pos.x - Math.sin(a) * 2.5, p.pos.z - Math.cos(a) * 2.5, a);
        }
        if (cs.t >= 1.6 && !cs._bless) { cs._bless = true; this.bless(); }
        if (cs.t >= 3.3 && !cs._gone) {
          cs._gone = true;
          const c = this.card.worldPos(V3());
          G.fx.particles.burst(c.x, c.y, c.z, 30, { color: new THREE.Color('#ffe070'), speed: 3, life: 0.6, size: 0.3, grav: 0, up: 0.2 });
          this.card.hide();
        }
      },
      say, wait: 4.2,
    }];
  }
  // (at the end of the scene, however far it got: everything in its final place)
  settleWrath(boss, variant) {
    const p = G.player;
    boss.wrathStart();
    if (variant !== 'alone') {
      p.flags[CARD] = true;
      if (!this.sir) this.sir = this.actor('ratman', P_RAT);
      const s = this.sir, Gd = VAULT.guard;
      this.sirFade = null;
      s.setOpacity(1);
      if (!s.arrived || Math.hypot(s.pos.x - Gd.x, s.pos.z - Gd.z) > 0.3) s.place(Gd.x, Gd.z, dirTo(Gd, p.pos));
      s.anim.battlePose = P_GUARD;
      s.anim.battleTarget = 1;
      this.guarding = true;
    }
    this.rift.close();
    this.card.hide();
    if (!p.countItem('robo_card') && p.addItem('robo_card', 1) === 0) G.msg('Obtained Robo S-Card.', 'loot');
    this.bless();
    G.ui?.centerMsg('Beast Blessing — the power of the King of Beasts flows through you!', 3.5);
    p.save();
  }

  // ---------------------------------------------------------------- her fall
  defeat(boss, done) {
    const p = G.player, H = p.pos.clone(), first = !this.freed && !!this.prince;
    const steps = [
      { run: (cs) => { boss.falter(); const h = boss.model.headWorld(V3()); cs.setShot({ pos: camSpot(h, dirTo(h, H), 4.8, -0.4), look: V3(h.x, h.y - 0.3, h.z), dur: 0.9 }); },
        say: { ...VAGEL, text: this.freed ? L.fallAgain : L.fall } },
      { run: (cs) => { boss.vow(); const b = V3(boss.pos.x, boss.floorY + 2.2, boss.pos.z); cs.setShot({ pos: camSpot(b, dirTo(b, H) + 0.5, 8.5, -1.0), look: V3(b.x, b.y + 1.3, b.z), dur: 1.4 }); },
        say: { ...VAGEL, text: L.vow } },
      // she vanishes; her chest crashes down where she stood
      { run: () => boss.vanishNow(), tick: (cs) => { if (cs.t >= 0.9) this.dropChest(boss); }, wait: 3.4 },
    ];
    if (first) steps.push(...this.releaseScene());
    const cs = new Cutscene(steps, { onEnd: () => { this.settleDefeat(boss); done(); } });
    cs.play();
    return cs;
  }
  // a free spot for her chest: where she was, but clear of the hero, the cage, the columns and the portals
  chestSpot(boss) {
    const p = G.player, R = VAULT.reunion, Hm = VAULT.home;
    const ok = (x, z) => Math.hypot(x - VAULT.x, z - VAULT.z) < VAULT.walk - 2.5 && !G.colliders.blocked(x, z, 1.3)
      && Math.hypot(x - p.pos.x, z - p.pos.z) > 3.2 && !this.blocks(x, z, 1.4)
      && Math.hypot(x - R.sir.x, z - R.sir.z) > 3 && Math.hypot(x - Hm.x, z - Hm.z) > 5 && Math.hypot(x - VAULT.portal.x, z - VAULT.portal.z) > 5;
    for (let r = 0; r < 14; r += 1) for (let k = 0; k < 12; k++) {
      const a = (k / 12) * TAU, x = boss.pos.x + Math.cos(a) * r, z = boss.pos.z + Math.sin(a) * r;
      if (ok(x, z)) return [x, z];
      if (r === 0) break;
    }
    return [VAULT.x, VAULT.z];
  }
  dropChest(boss) {
    if (this.chest) return;
    const p = G.player, [x, z] = this.chestSpot(boss);
    this.chest = new TreasureChest(this.root, this.env);
    this.chest.drop(x, z, Math.atan2(p.pos.x - x, p.pos.z - z));
  }
  // the cage bursts, father and son meet again, they thank the hero, the portal home rises
  releaseScene() {
    const p = G.player, R = VAULT.reunion, mid = V3((R.sir.x + R.prince.x) / 2, 0, (R.sir.z + R.prince.z) / 2);
    const both = () => V3(mid.x, (this.prince ? this.prince.pos.y : 0) + 1.5, mid.z);
    return [
      { run: (cs) => {
        const c = this.prison.center(V3());
        this.prison.shatter();
        cs.setShot({ pos: camSpot(c, dirTo(c, V3(VAULT.x, 0, VAULT.z)), 7, 0.5, { skipEnd: 2 }), look: c, dur: 1.2 });
      },
      tick: (cs) => {
        if (cs.t >= 1.15 && this.caged) { this.caged = false; this.floatDown = true; this.prince.play('pr_cheer'); }
      },
      say: { ...PRINCE, text: L.free } },
      { run: (cs) => {
        this.caged = false;
        this.sirFade = null;
        if (!this.sir) { this.sir = this.actor('ratman', P_RAT); this.sir.place(VAULT.guard.x, VAULT.guard.z); }
        this.guarding = false;
        const s = this.sir, pr = this.prince;
        s.setOpacity(1);
        s.anim.battleTarget = 0;
        pr.anim.battlePose = P_RAT; pr.anim.battleTarget = 1;      // (his head is up again)
        s.walkTo(R.sir.x, R.sir.z, 3.0, () => s.face(R.prince.x, R.prince.z));
        pr.walkTo(R.prince.x, R.prince.z, 2.4, () => pr.face(R.sir.x, R.sir.z));
        const b = both();
        cs.setShot({ pos: camSpot(b, dirTo(b, V3(VAULT.x, 0, VAULT.z)) + 0.5, 7.5, 1.0, { skipEnd: 3 }), look: b, dur: 1.5 });
      },
      until: () => this.sir.arrived && this.prince.arrived, say: { ...SIR, text: L.myBoy } },
      { run: (cs) => {
        const s = this.sir, pr = this.prince;
        // (one more step into each other's arms)
        const a = dirTo(pr.pos, s.pos), m = V3((s.pos.x + pr.pos.x) / 2, 0, (s.pos.z + pr.pos.z) / 2);
        s.walkTo(m.x + Math.sin(a) * 0.42, m.z + Math.cos(a) * 0.42, 0.8, () => s.face(pr.pos.x, pr.pos.z));
        pr.walkTo(m.x - Math.sin(a) * 0.3, m.z - Math.cos(a) * 0.3, 0.8, () => pr.face(s.pos.x, s.pos.z));
        s.play('rt_hug'); pr.play('pr_hug');
        G.audio.play('buff');
        const b = both(), side = dirTo(s.pos, pr.pos) + Math.PI / 2;
        cs.setShot({ pos: camSpot(b, side, 4.2, -0.2, { skipEnd: 2.5 }), look: V3(b.x, b.y - 0.35, b.z), dur: 1.1 });
      }, say: { ...PRINCE, text: L.father } },
      { run: (cs) => {
        const s = this.sir, pr = this.prince;
        s.face(p.pos.x, p.pos.z); pr.face(p.pos.x, p.pos.z);
        s.play('bow');
        const b = both();
        cs.setShot({ pos: camSpot(b, dirTo(b, p.pos), 5.4, 0, { skipEnd: 2.5 }), look: V3(b.x, b.y - 0.2, b.z), dur: 1.2 });
      }, say: { ...SIR, text: L.thanks } },
      { run: (cs) => {
        const pr = this.prince;
        pr.play('pr_cheer');
        const h = headOf(pr, V3());
        cs.setShot({ pos: camSpot(h, dirTo(h, p.pos) - 0.25, 3.2, -0.2, { skipEnd: 2 }), look: V3(h.x, h.y - 0.3, h.z), dur: 0.9 });
      }, say: { ...PRINCE, text: L.princeThanks } },
      { run: (cs) => {
        const Hm = VAULT.home, c = V3(Hm.x, 2.6, Hm.z);
        if (this.home) this.home.show(true);
        G.cam.addShake(0.4);
        cs.setShot({ pos: camSpot(c, Hm.rotY + 0.25, 12, 1.8, { skipEnd: 3 }), look: c, dur: 1.4 });
      }, say: { ...SIR, text: L.home } },
    ];
  }
  // (at the end of the scene, however far it got)
  settleDefeat(boss) {
    const p = G.player;
    boss.vanishNow();
    this.dropChest(boss);
    this.rift.close();
    this.card.hide();
    this.dropBlessing();
    if (this.prince && !this.freed) {
      p.flags[FREED] = true;
      if (this.prison) { this.prison.dispose(); this.prison = null; }
      if (this.home && !this.home.shown) this.home.show(false);
      this.toNpcs();
      G.quests.finish('q_prince');
      G.msg('Prince Ratman is free! Sir Ratman and his son wait for you in the vault.', 'quest');
    } else if (this.sir) this.sirLeaves();
    this.guarding = false;
    this.after = true;
    G.msg('Vagel left her treasure behind: walk up to the chest to open it.', 'quest');
    p.save();
  }
  // father and son stay in the vault as NPCs (they can be talked to) until the hero leaves it
  toNpcs() {
    const npcs = this.world.npcs, R = VAULT.reunion;
    const def = (id) => NPCS.find((n) => n.id === id);
    const face = (x, z) => Math.atan2(VAULT.x - x, VAULT.z - z);
    for (const a of [this.sir, this.prince]) if (a) a.dispose();
    this.sir = this.prince = null;
    this.caged = false;
    if (!npcs) return;
    npcs.remove('sir_ratman'); npcs.remove('prince_ratman');
    npcs.add({ ...def('sir_ratman'), wander: null, rot: face(R.sir.x, R.sir.z) }, [R.sir.x, R.sir.z]);
    npcs.add({ ...def('prince_ratman'), requiresFlag: null, rot: face(R.prince.x, R.prince.z) }, [R.prince.x, R.prince.z]);
    npcs.refreshMarkers();
  }
  // leaving the vault after her fall: father and son head home (to the Forest of Mist), a closed chest comes along
  leaveVault() {
    this.after = false;
    if (this.chest) { this.chest.collectAll(); this.chest.dispose(); this.chest = null; }
    const npcs = this.world.npcs;
    if (npcs) { npcs.remove('sir_ratman'); npcs.remove('prince_ratman'); }
  }
  // the hero left the Tower (a portal, a return scroll): nothing of the fight goes along
  leftTower() {
    this.aura.set(false);
    this.aura.k = 0;
    this.aura.update(0);
    this.dropBlessing();
    this.card.hide();
    if (this.after) this.leaveVault();
    if (this.chest) { this.chest.dispose(); this.chest = null; }
  }
}

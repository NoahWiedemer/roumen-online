// Vagel, Goddess of Greed — the last boss of the Tower of Isel. She lounges on the throne at the end of the Throne
// Room. When the hero comes up the hall she mocks them (a short cutscene), then tests them in a short first fight on
// the dais: plain arcane bolts and a blink, nothing more. At 90% health she has seen enough and takes the hero into
// her Vault of Avarice (world/isel/vault.js), a platform of marble and gold adrift among the stars, to fight for real:
//   Arcane bolts      gold bolts from her right hand that curve after the hero a little (step aside)
//   Blink             she vanishes into a sliver of light and appears elsewhere (also when the hero clings to her)
//   Gilded Barrage    three fans of bolts in a row (the gaps between the bolts are safe)
//   Divine Judgement  golden circles around the hero; columns of holy light strike them a moment later
//   Midas Wave        a ring of gold runs out over the floor from her: jump over it (Space)
//   Corruption        violet orbs rain down and leave pools that burn while you stand in them
//   Greed's Grasp     a golden chain drags the hero towards her while a circle around her fills: run against it
//   Wrath (35%)       the halo of a goddess burns behind her head; her specials come faster and bigger
// Getting knocked out (or leaving the throne room during the first fight) puts her back on her throne. Her fall opens
// the vault's portal back to the throne room.
import * as THREE from 'three';
import { Monster, BOSS_CLASSES } from '../monsters.js';
import { registerMonsterModel } from '../monsterModels.js';
import { VagelModel, preloadVagel, vagelReady } from './vagelModel.js';
import { Hazards } from './hazards.js';
import { Spells } from './spells.js';
import { Cutscene, flash } from '../../game/cutscene.js';
import { G } from '../../game/game.js';
import { dampAngle, clamp, smoothstep } from '../../core/utils.js';
import { THRONE, SEAT, VAULT, ZONE, room } from '../../world/isel/layout.js';

registerMonsterModel('vagel', VagelModel);
export { preloadVagel, vagelReady };

export const VAGEL_FLAG = 'boss:vagel';
const MET_FLAG = 'boss:vagel:met';          // (after the first meeting she only says a line or two)
// share of her health at which she takes the hero into her vault, and at which her wrath begins
export const SHIFT_AT = 0.9;
const ENRAGE_AT = 0.35;
const HALL = room('throne');
const TRIGGER_X = -6;                       // the meeting starts once the hero is this far up the hall
const WALK_TO = { x: 17, z: THRONE.z };     // ... and the hero walks on to the foot of the dais
const HIP_LIFT = 0.1;                       // her hip bone above the throne cushion (her feet rest on its base)

const WHO = { who: 'Vagel', title: 'Goddess of Greed' };
const LINES = {
  intro: [
    'Well, well. A little hero, climbing all those stairs... just to kneel before me?',
    'You broke that clanking toy downstairs. Cumbot. How adorable. He cost me a fortune, you know.',
    'And look at you. Shabby gear, empty pockets... I have seen richer rats.',
    'I am Vagel, Goddess of Greed. Everything in this tower is MINE. The gold, the stone... even the air you are wasting.',
    'Come then, little thief. Entertain me, before I take everything you own.',
  ],
  again: ['Back again? Greedy little thing... I like that.', 'Come then. Let us see what you brought me this time.'],
  taunts: ['Is that all? My maid hits harder.', 'Tickles.', 'Careful, darling. This gown costs more than your whole village.'],
  shift: ['Hmph. You scratched my gown. That goes on your bill.', 'Let us continue this somewhere more... private.'],
  vault: 'Welcome to my Vault. Every coin here was once somebody\'s life... yours will look lovely on the pile.',
  calls: { barrage: 'Kneel before gold!', judgement: 'Judgement of the gods!', grasp: 'Everything you have is mine!', corruption: 'Drown in desire!' },
  enrage: 'ENOUGH! You dare take from ME?!',
  death: 'No... my treasure... this is not... over...',
  win: 'Another soul for the pile. Thank you for the donation.',
  flee: 'Leaving so soon? Do come back. And bring more gold.',
};
const SPECIALS = ['barrage', 'judgement', 'wave', 'corruption', 'grasp'];
// camera shots of the meeting in the throne room (throne at x 33, she fights at x 29.5, the hero stops at x 17)
const SHOTS = {
  hall: { pos: [-2, 63.5, -42], look: [33, 57.2, -42], dur: 2.4, drift: [0.7, -0.1, 0] },     // down the hall
  seated: { pos: [28.8, 57.5, -44.2], look: [32.6, 57.6, -42], dur: 1.3, drift: [0.05, 0, 0.05] },
  rise: { pos: [23.2, 57.6, -37.6], look: [30.5, 57.8, -42], dur: 1.2 },
  wings: { pos: [23.6, 55.9, -45.6], look: [29.5, 58.9, -42], dur: 1.1 },                     // low: the cloak opens
  over: { pos: [35, 60.2, -39.3], look: [17, 55.6, -41.5], dur: 0, drift: [0, 0.06, 0.05] },  // cut: behind her, down at the hero
};

const GOLD = new THREE.Color('#ffd24a'), VIOLET = new THREE.Color('#b04aff'), PALE = new THREE.Color('#fff1c4');
const _v = new THREE.Vector3(), _h = new THREE.Vector3(), _c1 = new THREE.Vector3(), _c2 = new THREE.Vector3();
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const pick = (a) => a[(Math.random() * a.length) | 0];
const say = (text) => ({ ...WHO, text });

export class VagelBoss extends Monster {
  constructor(type, level, zone, rng) {
    super(type, level, zone, rng);
    this.isBoss = true;
    this.engaged = false;
    this.stage = 'dormant';     // dormant (on the throne) | intro | throne (first fight) | shift | vault | dead
    this.phase = 1;             // 2 = wrath (the HUD shows the boss bar enraged)
    this.act = null;
    this.body = 'seat';         // seat | rise (standing up) | glide | float
    this.glide = null; this.blinkA = null; this.cs = null;
    this.floorY = 0;
    this.blinkT = 0; this.clingT = 0; this.specialT = 0; this.specialIdx = 0; this.tauntT = 0; this.dotT = 0;
    this.strafe = 1; this.strafeT = 0;
    this.pVel = new THREE.Vector3(); this._pLast = null;
    this.barMarks = [SHIFT_AT, ENRAGE_AT];
    // her corruption orbs
    this.orbMat = new THREE.MeshStandardMaterial({ color: '#4a1080', emissive: '#b04aff', emissiveIntensity: 1.8, roughness: 0.25, metalness: 0.1 });
  }

  spawnAt(x, z, parent) {
    super.spawnAt(x, z, parent);
    this.hz = new Hazards(parent);
    this.sp = new Spells(parent);
    this.seat();
  }

  // on her throne: the model sits, and placeBody() fits the root to the cushion every frame
  seat() {
    const m = this.model;
    this.body = 'seat';
    this.glide = null; this.blinkA = null;
    this.pos.set(SEAT.x, G.terrain.groundAt(SEAT.x, SEAT.z), SEAT.z);
    this.floorY = this.groundY = this.pos.y;
    this.rotY = this.faceGoal = SEAT.rotY;
    m.vanish = 0;
    m.setCast(0, 0); m.setRage(false);
    m.sit(false);
  }

  // ---------------------------------------------------------------- talk / immunity / damage
  say(text) { if (text) G.msg(`Vagel: "${text}"`, 'boss'); }
  // (asked by player.dealDamage first: while she sits, talks or blinks, blows do nothing)
  immune() {
    if (this.dead) return null;
    if (this.stage === 'dormant' || this.stage === 'intro' || this.stage === 'shift') return 'Immune';
    if (this.blinkA || this.model.vanish > 0.5) return 'Miss';
    return null;
  }
  onAttacked(p) { if (this.stage === 'dormant' && p === G.player) this.startIntro(); }
  taunt(p) { if (this.stage === 'dormant' && p === G.player) this.startIntro(); }
  addDebuff(id, dur, data = {}) {
    if (id === 'stun') { G.fx.text(this.headPos(), 'Immune', 'miss'); return; }
    super.addDebuff(id, dur, data);
  }
  takeDamage(dmg, from, crit) {
    if (this.dead || this.immune()) return;
    this.lastHitBy = from;
    const max = this.stats.maxHp;
    if (this.stage === 'throne') {
      // the first fight is only a test: at 90% she takes the hero elsewhere
      const floor = Math.ceil(max * SHIFT_AT);
      this.hp = Math.max(floor, this.hp - dmg);
      if (this.hp <= floor) this.shiftPending = true;
      else if (this.tauntT <= 0 && Math.random() < 0.25) { this.say(pick(LINES.taunts)); this.tauntT = 12; }
    } else {
      this.hp -= dmg;
      if (this.hp <= 0) { this.hp = 0; this.die(from); return; }
      if (this.phase === 1 && this.hp < max * ENRAGE_AT) this.enragePending = true;
    }
    if (this.hitReactT <= 0) { this.model.hit(); this.hitReactT = 0.3; }
    G.emit('monsterHp', this);
  }

  die(killer) {
    this.endAction();
    this.hz.clear(); this.sp.clear();
    this.blinkA = null; this.model.vanish = 0;
    this.engaged = false;
    this.stage = 'dead';
    super.die(killer);
    this.say(LINES.death);
    G.audio.play('shatter');
    G.audio.play('coins');
    G.cam.addShake(0.5);
    const p = G.player;
    const first = p && !p.flags[VAGEL_FLAG];
    if (p) p.flags[VAGEL_FLAG] = true;
    G.ui?.centerMsg('Vagel, Goddess of Greed, has fallen!', 4);
    G.msg('Her vault loses its greedy glow... the seal on its portal breaks.', 'quest');
    if (first) G.msg('The Tower of Isel is free of its goddess. For now.', 'quest');
    G.emit('bossDefeated', this);
    p?.save();
  }

  // back onto her throne, healed (the hero was knocked out, left the hall, or turned the raccoon cheat on)
  reset(playerDown, line = null) {
    this.say(playerDown ? LINES.win : line);
    if (this.cs && G.cutscene === this.cs) this.cs.finish(true);
    this.cs = null;
    this.engaged = false;
    this.stage = 'dormant';
    this.target = null;
    this.phase = 1;
    this.shiftPending = this.enragePending = false;
    this.endAction();
    this.hz.clear(); this.sp.clear();
    this.hp = this.stats.maxHp;
    G.emit('monsterHp', this);
    this.sparkle(this.pos, 30);
    this.seat();
  }

  // ---------------------------------------------------------------- the meeting (cutscene) and the first fight
  watchHall(p) {
    if (p.dead || G.traveling || G.cutscene) return;
    if (G.terrain.where(p.pos.x, p.pos.z) === 'throne' && p.pos.x > TRIGGER_X) this.startIntro();
  }
  startIntro() {
    const p = G.player;
    if (this.stage !== 'dormant' || this.dead || !p || p.dead || G.cutscene) return;
    this.stage = 'intro';
    const first = !p.flags[MET_FLAG];
    p.flags[MET_FLAG] = true;
    if (p.mount) p.dismount(true);
    if (p.inHouse) p.exitHouse();
    p.standUp();
    G.audio.play('divine');
    this.cs = new Cutscene(first ? this.introSteps() : this.againSteps(), { onEnd: () => this.beginThrone() });
    this.cs.play();
  }
  // the hero walks up the hall while she talks from her throne; she rises for the last lines
  introSteps() {
    const L = LINES.intro, m = this.model;
    return [
      { shot: SHOTS.hall, run: () => { this.walkIn(); m.sit(true); }, say: say(L[0]) },
      { shot: SHOTS.seated, say: say(L[1]) },
      { shot: SHOTS.rise, run: () => this.rise(), until: () => this.body === 'float', say: say(L[2]) },
      { shot: SHOTS.wings, run: () => m.play('vg_spread'), say: say(L[3]) },
      { shot: SHOTS.over, run: () => { m.play('vg_laugh'); G.audio.play('laugh'); }, say: say(L[4]) },
    ];
  }
  againSteps() {
    const m = this.model;
    return [
      { shot: { ...SHOTS.seated, dur: 1.6 }, run: () => { this.walkIn(); m.sit(true); }, say: say(LINES.again[0]) },
      { shot: SHOTS.rise, run: () => this.rise(), until: () => this.body === 'float', say: say(LINES.again[1]) },
    ];
  }
  walkIn() {
    const p = G.player;
    if (p.pos.x < WALK_TO.x - 2) p.moveTo(WALK_TO.x, clamp(p.pos.z, WALK_TO.z - 4, WALK_TO.z + 4));
  }
  // she stands up from the throne, then floats down the dais to where she fights
  rise() {
    if (this.body !== 'seat') return;
    this.body = 'rise';
    this.riseT = 0;
    this.model.standUp();
  }
  glideTo(x, z, dur, onDone = null) {
    this.glide = { from: this.root.position.clone(), x, z, t: 0, dur, onDone };
    this.body = 'glide';
  }
  beginThrone() {
    this.cs = null;
    if (this.dead || this.stage !== 'intro') return;
    const m = this.model;
    if (this.body !== 'float') {           // (the intro was skipped: straight to where she fights)
      m.stopAction();
      this.glide = null;
      this.body = 'float';
      m.setHover(true); m.hover = 1;
      this.pos.x = THRONE.x; this.pos.z = THRONE.z;
      this.floorY = G.terrain.groundAt(THRONE.x, THRONE.z);
      this.rotY = THRONE.rotY;
    }
    this.stage = 'throne';
    this.engaged = true;
    this.target = G.player;
    this.attackCd = 0.8;
    this.blinkT = 8 + Math.random() * 2;
    this.clingT = 0;
    G.emit('bossEngaged', this);
  }

  // ---------------------------------------------------------------- 90%: into the vault
  startShift() {
    const p = G.player, m = this.model;
    this.shiftPending = false;
    this.stage = 'shift';
    this.endAction(); this.cancelBlink();
    this.hz.clear(); this.sp.clear();
    const H = p.pos.clone(), B = V3(this.pos.x, this.floorY, this.pos.z);
    const d = V3(B.x - H.x, 0, B.z - H.z).normalize(), side = V3(-d.z, 0, d.x);
    const VA = VAULT;
    // (where she stands decides the shots: the first candidate with a clear view past pillars and statues)
    const near = this.pickShot([2.5, -2.5, 0, 4].map((s) => B.clone().addScaledVector(d, -6).addScaledVector(side, s).add(V3(0, 1.8, 0))), [B]);
    const wide = this.pickShot([4, -4, 0, 6.5, -6.5].map((s) => H.clone().addScaledVector(d, -5).addScaledVector(side, s).add(V3(0, 6, 0))), [H, B]);
    this.warped = false;
    this.cs = new Cutscene([
      { shot: { pos: near, look: B.clone().add(V3(0, 2.2, 0)), dur: 0.9 },
        run: () => m.play('vg_point'), say: say(LINES.shift[0]) },
      { shot: { pos: wide, look: H.clone().lerp(B, 0.4).add(V3(0, 0.8, 0)), dur: 1.4 },
        run: () => { m.play('vg_raise'); m.setCast(1, 1); G.audio.play('arcane'); this.shiftCircle(H, B); }, say: say(LINES.shift[1]) },
      // a slow flash; at its peak both stand in the vault
      { run: () => { G.audio.play('teleport'); flash('#f3e4ff', { rise: 0.35, hold: 0.45, fade: 1.1 }); },
        tick: (cs) => { if (!this.warped && cs.t >= 0.36) this.warp(cs); }, until: () => this.warped, wait: 2.4, skip: () => this.warp() },
      { shot: { pos: [VA.boss.x - 2.6, 2.1, VA.boss.z + 6.4], look: [VA.boss.x, 3.4, VA.boss.z], dur: 1.6 },
        run: () => { m.play('vg_spread'); G.audio.play('laugh'); }, say: say(LINES.vault) },
    ], { onEnd: () => this.beginVault() });
    this.cs.play();
  }
  // the first camera position that stands inside the hall and sees every target past the pillars and statues
  pickShot(cands, targets) {
    const C = G.colliders;
    const free = (a, b) => {
      const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.5);
      for (let i = 1; i < n - 1; i++) { const t = i / n; if (C.blocked(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, 0.3)) return false; }
      return true;
    };
    return cands.find((c) => G.terrain.where(c.x, c.z) === 'throne' && !C.blocked(c.x, c.z, 0.6) && targets.every((t) => free(c, t))) || cands[0];
  }
  shiftCircle(H, B) {
    G.fx.magicCircle(H, '#d8a8ff', 3.4, 4.5);
    G.fx.magicCircle(B, '#ffd24a', 3.4, 4.5);
    for (let i = 0; i < 50; i++) {
      const a = Math.random() * Math.PI * 2, r = 0.6 + Math.random() * 1.6;
      G.fx.particles.emit({ x: H.x + Math.cos(a) * r, y: H.y + Math.random() * 0.4, z: H.z + Math.sin(a) * r, vx: -Math.sin(a) * 1.2, vz: Math.cos(a) * 1.2, vy: 1 + Math.random() * 2.5, life: 1.6, size: 0.3, color: Math.random() < 0.6 ? VIOLET : GOLD, drag: 0.6, grav: 0 });
    }
  }
  // hero and goddess into the vault (cs: the cutscene, whose camera then looks past the hero at her)
  warp(cs = null) {
    if (this.warped || this.dead) return;
    this.warped = true;
    const p = G.player, VA = VAULT, m = this.model;
    if (cs) cs.setShot({ from: { pos: [VA.hero.x + 3.2, 2.6, VA.hero.z + 7.5], look: [VA.boss.x, 3.6, VA.boss.z] }, pos: [VA.hero.x + 2.2, 2.3, VA.hero.z + 5.2], look: [VA.boss.x, 3.4, VA.boss.z], dur: 2.2 });
    p.stopActions();
    p.teleport(VA.hero.x, VA.hero.z);
    p.rotY = p.faceGoal = VA.hero.rotY;
    this.pos.set(VA.boss.x, 0, VA.boss.z);
    this.floorY = this.pos.y = G.terrain.groundAt(VA.boss.x, VA.boss.z);
    this.rotY = this.faceGoal = VA.boss.rotY;
    this.body = 'float'; this.glide = null;
    m.setCast(0, 0);
    G.cam.yaw = p.rotY + Math.PI;
    G.cam.snap(p.pos);
    G.audio.play('teleport');
    G.fx.pillar(V3(VA.hero.x, this.floorY, VA.hero.z), '#e6c8ff', 1.4, 0.9, 8);
    this.sparkle(this.pos, 30);
  }
  beginVault() {
    this.cs = null;
    if (this.dead || this.stage !== 'shift') return;
    this.warp();                            // (skipped: no flash, straight there)
    this.model.setHover(true);
    this.stage = 'vault';
    this.engaged = true;
    this.target = G.player;
    this.specialT = 3.5; this.specialIdx = 0;
    this.attackCd = 1.2;
    this.blinkT = 10; this.clingT = 0;
  }
  enrage() {
    this.enragePending = false;
    this.phase = 2;
    const m = this.model;
    m.setRage(true);
    m.play('vg_raise');
    this.say(LINES.enrage);
    G.audio.play('divine');
    const c = V3(this.pos.x, this.floorY, this.pos.z);
    G.fx.shockwave(c, '#ffd24a');
    G.fx.pillar(c, '#ffe6a0', 1.6, 1.4, 22);
    this.shake(0.8);
    this.specialT = 2.5;
    this.attackCd = 1.8;
    this.act = { name: 'wrath', t: 0, done: {}, dur: 1.6 };
  }

  // ---------------------------------------------------------------- helpers
  hurt(mult, opts = {}) {
    const [a0, a1] = this.stats.atk;
    G.player.takeDamage((a0 + Math.random() * (a1 - a0)) * mult, this, opts);
  }
  shake(amount, x = this.pos.x, z = this.pos.z) {
    const d = Math.hypot(G.player.pos.x - x, G.player.pos.z - z);
    const k = clamp(1 - d / 40, 0, 1);
    if (k > 0) G.cam.addShake(amount * k);
  }
  knockBack(dist) {
    const p = G.player;
    if (p.cheat) return;
    const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z, d = Math.hypot(dx, dz) || 1;
    for (let i = 0; i < 8; i++) p.tryMove((dx / d) * dist / 8, (dz / d) * dist / 8);
  }
  sparkle(pos, n) {
    const y = this.floorY + 1.4;
    G.fx.particles.burst(pos.x, y, pos.z, n, { color: GOLD, speed: 4, life: 0.6, size: 0.35, grav: 0, up: 0.3 });
    G.fx.particles.burst(pos.x, y, pos.z, n >> 1, { color: VIOLET, speed: 3, life: 0.7, size: 0.4, grav: 0, up: 0.5 });
    G.fx.ring(V3(pos.x, this.floorY, pos.z), { color: '#e0b0ff', from: 0.4, to: 3, life: 0.4 });
  }
  inVault() { return Math.hypot(this.pos.x - VAULT.x, this.pos.z - VAULT.z) < VAULT.r; }
  // may she float / blink / aim a spell at (x, z)? (the vault disc, or the east end of the throne room)
  inArena(x, z, margin = 0) {
    if (this.stage === 'vault') return Math.hypot(x - VAULT.x, z - VAULT.z) < VAULT.walk - margin && G.nav.isWalkable(x, z);
    return x > 10 + margin && x < 32 - margin && z > HALL.z0 + 2 + margin && z < HALL.z1 - 2 - margin && G.nav.isWalkable(x, z);
  }
  blinkSpot(p) {
    for (let k = 0; k < 30; k++) {
      let x, z;
      if (this.stage === 'vault') { const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * (VAULT.walk - 5); x = VAULT.x + Math.cos(a) * r; z = VAULT.z + Math.sin(a) * r; }
      else { x = 13 + Math.random() * 17; z = HALL.z0 + 5 + Math.random() * (HALL.z1 - HALL.z0 - 10); }
      const d = Math.hypot(x - p.pos.x, z - p.pos.z);
      if (d < 8 || d > 18 || Math.hypot(x - this.pos.x, z - this.pos.z) < 5) continue;
      if (this.inArena(x, z, 2)) return [x, z];
    }
    return null;
  }
  // vanish into a sliver of light, appear at (x, z)
  blink(x, z) {
    this.blinkA = { t: 0, x, z, moved: false };
    G.audio.play('arcane');
  }
  stepBlink(dt) {
    const b = this.blinkA;
    if (!b) return;
    const m = this.model;
    b.t += dt;
    if (b.t < 0.2) m.vanish = b.t / 0.2;
    else if (!b.moved) {
      b.moved = true;
      m.vanish = 1;
      this.sparkle(this.pos, 26);
      this.pos.x = b.x; this.pos.z = b.z;
      this.floorY = G.terrain.groundAt(b.x, b.z);
      const p = G.player;
      this.rotY = this.faceGoal = Math.atan2(p.pos.x - b.x, p.pos.z - b.z);
      this.sparkle(this.pos, 26);
    } else if (b.t < 0.3) m.vanish = 1;
    else if (b.t < 0.5) m.vanish = 1 - (b.t - 0.3) / 0.2;
    else { m.vanish = 0; this.blinkA = null; }
  }
  cancelBlink() {
    const b = this.blinkA;
    if (!b) return;
    if (!b.moved) { this.pos.x = b.x; this.pos.z = b.z; this.floorY = G.terrain.groundAt(b.x, b.z); }
    this.blinkA = null;
    this.model.vanish = 0;
  }
  // (vault) she drifts sideways around the hero, keeping a caster's distance
  drift(dt, dx, dz, dist) {
    this.strafeT -= dt;
    if (this.strafeT <= 0) { this.strafe = Math.random() < 0.5 ? -1 : 1; this.strafeT = 2.5 + Math.random() * 2.5; }
    const ux = dx / (dist || 1), uz = dz / (dist || 1);
    const want = clamp((dist - 11) * 0.15, -0.6, 0.6);
    const vx = -uz * this.strafe + ux * want, vz = ux * this.strafe + uz * want;
    const nx = this.pos.x + vx * 1.3 * dt, nz = this.pos.z + vz * 1.3 * dt;
    if (this.inArena(nx, nz, 3)) { this.pos.x = nx; this.pos.z = nz; } else this.strafe = -this.strafe;
  }

  // ---------------------------------------------------------------- the fight
  fight(dt, p, dist, dx, dz) {
    const vault = this.stage === 'vault';
    this.clingT = dist < this.radius + p.radius + 2.2 ? this.clingT + dt : Math.max(0, this.clingT - dt * 0.5);
    this.blinkT -= dt;
    // (the clock of her specials runs on between them, bolts and blinks included)
    if (vault && !(this.act && SPECIALS.includes(this.act.name))) this.specialT -= dt;
    if (this.blinkA) return;
    if (this.act) { this.runAction(dt); return; }
    this.faceGoal = Math.atan2(dx, dz);
    if (this.clingT > (vault ? 3 : 2.4) || this.blinkT <= 0) {
      const q = this.blinkSpot(p);
      this.blinkT = q ? (vault ? 9 : 7) + Math.random() * 3 : 1.5;
      if (q) { this.clingT = 0; this.blink(q[0], q[1]); return; }
    }
    if (vault && this.specialT <= 0) {
      this.start(SPECIALS[this.specialIdx++ % SPECIALS.length]);
      this.specialT = this.phase === 2 ? 5.2 : 7.2;
      return;
    }
    if (this.attackCd <= 0 && dist < 40) {
      this.start(vault && this.phase === 2 ? 'twin' : 'bolt');
      this.attackCd = (vault ? 1.8 : this.def.atkCd) * (0.85 + Math.random() * 0.3);
      return;
    }
    if (vault) this.drift(dt, dx, dz, dist);
  }

  start(name) {
    const m = this.model;
    const a = this.act = { name, t: 0, done: {}, dur: 1 };
    switch (name) {
      case 'bolt': m.play('vg_cast'); m.setCast(1, 0); a.dur = 0.7; break;
      case 'twin': m.play('vg_cast'); m.setCast(1, 1); a.dur = 0.75; break;
      case 'barrage': this.say(LINES.calls.barrage); m.setCast(1, 1); a.dur = 2.35; break;
      case 'judgement': this.say(LINES.calls.judgement); m.play('vg_raise'); m.setCast(1, 1); G.audio.play('divine'); a.dur = 2.4; break;
      case 'wave':
        m.play('vg_sweep'); m.setCast(1, 0);
        a.dur = this.phase === 2 ? 2.2 : 1.35;
        G.fx.ring(V3(this.pos.x, this.floorY, this.pos.z), { color: '#ffd24a', from: 3.2, to: 0.6, life: 0.5 });
        G.audio.play('arcane');
        break;
      case 'corruption': this.say(LINES.calls.corruption); m.play('vg_spread'); m.setCast(0, 1); a.dur = 2.4; break;
      case 'grasp': this.say(LINES.calls.grasp); m.play('vg_grasp'); m.setCast(1, 0); a.dur = 3.0; break;
    }
  }
  endAction() {
    const a = this.act;
    if (!a) return;
    if (a.chain) this.sp.remove(a.chain);
    if (a.tele && !a.tele.fired) this.hz.remove(a.tele);
    this.model.setCast(0, 0);
    this.act = null;
  }
  runAction(dt) {
    const a = this.act, p = G.player, m = this.model;
    a.t += dt;
    const once = (key, time) => (a.t >= time && !a.done[key] ? (a.done[key] = true) : false);
    const toP = Math.atan2(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
    switch (a.name) {
      case 'bolt':
        this.faceGoal = toP;
        if (once('fire', 0.3)) { this.fireBolt('R', { homing: 0.8, mult: 0.9 }); m.setCast(0, 0); }
        break;
      case 'twin':
        this.faceGoal = toP;
        if (once('fire', 0.3)) { this.fireBolt('R', { homing: 0.7, mult: 0.8, angle: 0.12 }); this.fireBolt('L', { homing: 0.7, mult: 0.8, angle: -0.12 }); m.setCast(0, 0); }
        break;
      case 'barrage':
        this.faceGoal = toP;
        [0, 0.75, 1.5].forEach((t0, i) => {
          if (once('c' + i, t0)) m.play('vg_cast');
          if (once('v' + i, t0 + 0.3)) this.volley(i);
        });
        break;
      case 'judgement': if (once('mark', 0.5)) this.judgement(); break;
      case 'wave':
        if (a.t < 0.4) this.faceGoal = toP;
        if (once('w0', 0.5)) this.midasWave();
        if (this.phase === 2) { if (once('s1', 1.2)) m.play('vg_sweep'); if (once('w1', 1.7)) this.midasWave(); }
        break;
      case 'corruption':
        this.faceGoal = toP;
        if (once('throw', 0.55)) this.corruption();
        break;
      case 'grasp': this.grasp(a, dt, toP, once); break;
    }
    if (a.t >= a.dur) this.endAction();
  }

  // a bolt from one hand at the hero (angle: turned aside for fans; homing: rad/s it bends after them)
  fireBolt(side, { homing = 0.8, mult = 0.9, angle = 0, speed = 15, size = 1 } = {}) {
    const p = G.player;
    const from = this.model.handWorld(side, _h);
    let aim = null;
    if (angle) {
      const tx = p.pos.x - from.x, tz = p.pos.z - from.z, c = Math.cos(angle), s = Math.sin(angle);
      aim = V3(from.x + tx * c + tz * s, p.pos.y + 1.1, from.z - tx * s + tz * c);
    }
    const gold = side === 'R';
    this.sp.bolt(from, { speed, homing, aim, size, color: gold ? '#ffd24a' : '#c46aff', core: gold ? '#fff6d8' : '#f6e6ff', onHit: () => this.hurt(mult) });
    G.audio.play('arcane');
  }
  // Gilded Barrage: a fan of straight bolts (the middle one bends a little); every other fan is shifted half a gap
  volley(i) {
    const n = this.phase === 2 ? 5 : 3, step = n === 3 ? 0.35 : 0.28, off = i % 2 ? step / 2 : 0;
    for (let k = 0; k < n; k++) {
      const ang = (k - (n - 1) / 2) * step + off;
      this.fireBolt(k % 2 ? 'L' : 'R', { angle: ang || 1e-4, homing: k === (n - 1) / 2 && !off ? 0.3 : 0, mult: 0.75, speed: 16 });
    }
  }
  // Divine Judgement: one circle under the hero, the others around them; each is struck by a column of light
  judgement() {
    const p = G.player, n = this.phase === 2 ? 7 : 5;
    const pts = [[p.pos.x, p.pos.z]];
    for (let k = 0; k < n * 6 && pts.length < n; k++) {
      const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 7;
      const x = p.pos.x + Math.cos(a) * r, z = p.pos.z + Math.sin(a) * r;
      if (!this.inArena(x, z) || pts.some(([qx, qz]) => Math.hypot(qx - x, qz - z) < 4)) continue;
      pts.push([x, z]);
    }
    pts.forEach(([x, z], i) => this.hz.circle(x, z, 2.8, 1.6 + i * 0.12, { color: '#ffe066', onDone: (it) => this.smite(it.x, it.z, it.r, i) }));
  }
  smite(x, z, r, i) {
    const p = G.player, y = G.terrain.groundAt(x, z);
    G.fx.pillar(V3(x, y, z), '#ffe9a0', 1.0, r * 0.5, 18);
    G.fx.particles.burst(x, y + 0.5, z, 26, { color: PALE, speed: 6, life: 0.6, size: 0.4, grav: -4, up: 1.2 });
    if (i % 2 === 0) G.audio.play('judgement');
    this.shake(0.35, x, z);
    if (!p.dead && Math.hypot(p.pos.x - x, p.pos.z - z) < r + p.radius * 0.5) this.hurt(1.4, { sure: true });
  }
  // Midas Wave: a ring of gold running out from her over the floor
  midasWave() {
    const x = this.pos.x, z = this.pos.z;
    this.sp.wave(x, z, { speed: 9, maxR: 32, height: 1.1, onCross: () => this.waveHit() });
    G.audio.play('wave');
    G.fx.shockwave(V3(x, this.floorY, z), '#ffd24a');
    this.shake(0.45, x, z);
    if (!this.waveHint) { this.waveHint = true; G.ui?.centerMsg('Jump over the Midas Wave! (Space)', 2.5); }
  }
  waveHit() {
    const p = G.player;
    if (p.dead) return;
    if (p.airborne && p.jumpY > 0.3) { G.fx.text(p.headPos(), 'Dodged!', 'heal'); return; }
    this.hurt(1.6, { sure: true });
    p.addBuff('slowed', 2.5, {});
  }
  // Corruption: violet orbs lobbed around the hero (the first where they are heading); each leaves a burning pool
  corruption() {
    const p = G.player, n = this.phase === 2 ? 6 : 4;
    const from = this.model.handWorld('L', new THREE.Vector3());
    const pts = [[p.pos.x + this.pVel.x * 0.8, p.pos.z + this.pVel.z * 0.8]];
    for (let k = 0; k < n * 6 && pts.length < n; k++) {
      const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 7;
      const x = p.pos.x + Math.cos(a) * r, z = p.pos.z + Math.sin(a) * r;
      if (!this.inArena(x, z) || pts.some(([qx, qz]) => Math.hypot(qx - x, qz - z) < 4.5)) continue;
      pts.push([x, z]);
    }
    pts.forEach(([x, z], i) => {
      if (!this.inArena(x, z)) return;
      const flight = 1.3 + i * 0.12;
      this.hz.circle(x, z, 3, flight, { color: '#b04aff' });
      this.hz.blob(from, x, z, flight, (lx, lz) => this.corruptLand(lx, lz), { mat: this.orbMat, trail: VIOLET });
    });
    G.audio.play('corrupt');
  }
  corruptLand(x, z) {
    const p = G.player, y = G.terrain.groundAt(x, z);
    G.fx.particles.burst(x, y + 0.4, z, 30, { color: VIOLET, speed: 6, life: 0.7, size: 0.45, grav: -6, up: 0.9 });
    G.fx.ring(V3(x, y, z), { color: '#c46aff', from: 0.5, to: 5, life: 0.45 });
    G.audio.play('boltHit');
    this.hz.puddle(x, z, 3, 12, { color: '#9a3aff', slow: false, shape: 3, onInside: (dt) => this.corruptTick(dt) });
    if (!p.dead && Math.hypot(p.pos.x - x, p.pos.z - z) < 3 + p.radius * 0.5) this.hurt(1.0, { sure: true });
  }
  // standing in a pool burns a share of the hero's health (armour does not help)
  corruptTick(dt) {
    this.dotT += dt;
    if (this.dotT < 0.5) return;
    this.dotT = 0;
    const p = G.player;
    p.takeDamage(Math.max(4, p.stats.maxHp * 0.025), this, { sure: true, pierce: true });
    G.fx.particles.burst(p.pos.x, p.pos.y + 0.3, p.pos.z, 8, { color: VIOLET, speed: 2, life: 0.6, size: 0.35, grav: 1.5, up: 1 });
  }
  // Greed's Grasp: a golden chain pulls the hero in while the circle around her fills, then it bursts
  grasp(a, dt, toP, once) {
    const p = G.player;
    this.faceGoal = toP;
    if (once('chain', 0.35)) {
      a.chain = this.sp.chain(() => this.model.handWorld('R', _c1), () => _c2.set(p.pos.x, p.pos.y + 1.1, p.pos.z));
      a.tele = this.hz.circle(this.pos.x, this.pos.z, 6.5, 2.35, { color: '#ffb020' });
      G.audio.play('chain');
    }
    if (a.done.chain && a.t < 2.7 && !p.dead && !p.cheat) {
      const dx = this.pos.x - p.pos.x, dz = this.pos.z - p.pos.z, d = Math.hypot(dx, dz);
      const stop = this.radius + p.radius + 0.4;
      if (d > stop) { const s = Math.min(d - stop, 3.5 * dt); p.tryMove((dx / d) * s, (dz / d) * s); }
    }
    if (once('burst', 2.7)) {
      if (a.chain) { this.sp.remove(a.chain); a.chain = null; }
      const c = V3(this.pos.x, this.floorY, this.pos.z);
      G.fx.shockwave(c, '#ffc83a');
      G.fx.ring(c, { color: '#ffe08a', from: 1, to: 13, life: 0.5 });
      G.audio.play('coins'); G.audio.play('boltHit');
      this.shake(0.7);
      if (!p.dead && Math.hypot(p.pos.x - c.x, p.pos.z - c.z) < 6.5 + p.radius * 0.5) { this.hurt(2.2, { sure: true }); this.knockBack(4); }
    }
  }

  // ---------------------------------------------------------------- per frame
  update(dt) {
    if (this.removed) return;
    const m = this.model, p = G.player;
    if (this.dead) {
      this.hz.update(dt); this.sp.update(dt);
      super.update(dt);                       // (Monster: the dissolve, then removal and the respawn timer)
      if (this.removed) { this.hz.destroy(); this.sp.destroy(); this.orbMat.dispose(); return; }
      this.root.position.y = this.floorY + m.lift;
      this.showFor(p);
      return;
    }
    for (let i = this.debuffs.length - 1; i >= 0; i--) {
      const d = this.debuffs[i];
      d.t -= dt;
      if (d.t <= 0) { this.debuffs.splice(i, 1); this.debuffDef = this.debuffs.reduce((s, x) => s + (x.data.def || 0), 0); }
    }
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.hitReactT = Math.max(0, this.hitReactT - dt);
    this.tauntT = Math.max(0, this.tauntT - dt);
    this.hz.update(dt); this.sp.update(dt);
    // the hero's velocity (to lead the corruption orbs); teleports do not count
    if (this._pLast && dt > 1e-4) {
      _v.subVectors(p.pos, this._pLast).divideScalar(dt);
      if (_v.lengthSq() > 400) _v.set(0, 0, 0);
      this.pVel.lerp(_v, 1 - Math.exp(-6 * dt));
    }
    this._pLast = (this._pLast || new THREE.Vector3()).copy(p.pos);

    const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z, dist = Math.hypot(dx, dz);
    if (this.engaged && p.dead) this.reset(true);
    else if (this.stage === 'dormant') this.watchHall(p);
    else if (this.stage === 'intro') { if (!p.path) p.faceGoal = Math.atan2(-dx, -dz); }
    else if (this.stage === 'throne') {
      if (G.terrain.where(p.pos.x, p.pos.z) !== 'throne') this.reset(false, LINES.flee);
      else if (this.shiftPending) this.startShift();
      else this.fight(dt, p, dist, dx, dz);
    } else if (this.stage === 'vault') {
      if (this.enragePending && !this.act && !this.blinkA) this.enrage();
      else this.fight(dt, p, dist, dx, dz);
    }
    if (this.body === 'rise') {
      this.riseT += dt;
      if (this.riseT >= 0.8) {
        m.setHover(true);
        this.glideTo(THRONE.x, THRONE.z, 1.4, () => { if (this.stage === 'intro') m.play('vg_point'); });
      }
    }
    this.stepBlink(dt);
    // the hero cannot stand inside her
    if (!p.dead && this.body === 'float' && this.engaged && !this.blinkA) {
      const d = Math.hypot(dx, dz), min = this.radius + p.radius;
      if (d < min && d > 1e-4) p.tryMove((dx / d) * (min - d), (dz / d) * (min - d));
    }
    if (this.body === 'float' || this.body === 'glide') this.rotY = dampAngle(this.rotY, this.faceGoal ?? this.rotY, this.act ? 6 : 4, dt);
    m.setMoving(0);
    m.update(dt);
    this.placeBody(dt);
    this.showFor(p);
  }

  // root placement: on the cushion (seated), frozen while she stands up, gliding, or floating over the floor
  placeBody(dt) {
    const m = this.model, r = this.root;
    r.rotation.y = this.rotY;
    if (this.body === 'seat') {
      // pelvis on the cushion: the sitting clip decides where the root has to be
      r.position.set(this.pos.x, SEAT.top, this.pos.z);
      r.updateMatrixWorld(true);
      const hip = m.rig.bones.Bone_001.getWorldPosition(_v);
      r.position.x += SEAT.hipX - hip.x;
      r.position.z += SEAT.z - hip.z;
      r.position.y += SEAT.top + HIP_LIFT - hip.y;
      return;
    }
    if (this.body === 'rise') return;
    const floor = G.terrain.groundAt(this.pos.x, this.pos.z);
    this.floorY += (floor - this.floorY) * (1 - Math.exp(-10 * dt));
    this.pos.y = this.groundY = this.floorY;
    if (this.body === 'glide') {
      const g = this.glide;
      g.t += dt;
      const k = smoothstep(0, 1, Math.min(1, g.t / g.dur));
      const ty = G.terrain.groundAt(g.x, g.z) + m.lift;
      r.position.set(g.from.x + (g.x - g.from.x) * k, g.from.y + (ty - g.from.y) * k * k, g.from.z + (g.z - g.from.z) * k);
      this.pos.x = r.position.x; this.pos.z = r.position.z;
      if (g.t >= g.dur) { this.body = 'float'; this.glide = null; this.floorY = G.terrain.groundAt(g.x, g.z); if (g.onDone) g.onDone(); }
      return;
    }
    r.position.set(this.pos.x, this.floorY + m.lift, this.pos.z);
  }

  // she is only drawn where the hero can see her: from the east halls (throne) or inside her vault
  showFor(p) {
    const w = G.terrain.where(p.pos.x, p.pos.z);
    if (!(this.inVault() ? w === 'vault' : ZONE[w] === 'east')) this.root.visible = false;
  }
}
BOSS_CLASSES.vagel = VagelBoss;

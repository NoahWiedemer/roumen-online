// Cumbot 9000 — the mid boss of Cyclone Hill. He guards the portal into the Tower of Isel and hums the tune that
// hypnotises the rat-folk. Fight rules (all telegraphed, all dodgeable):
//   melee        cuff hammer punches (left / right); every third attack a two-handed ground slam (red circle in front)
//   Slime Mortar the tank on his back lobs slime blobs at the hero (green circles); hits hurt and leave sticky puddles
//   Hypno Cannon both cuffs charge pink, a lane shows where the beam will go; the beam sweeps slowly after the hero.
//                Getting caught hypnotises the hero for a moment (no moving, no attacking)
//   Jingle Quake (below 50%) he crouches, jumps and lands: a big orange circle around him — run out or jump over it
//   Choir call   at 50% he calls two hypnotised rat-men; beating him breaks the hypnosis (they are knocked out)
// Leaving the arena (or getting knocked out) resets him. The first victory opens the portal to the tower.
import * as THREE from 'three';
import { Monster, BOSS_CLASSES } from '../monsters.js';
import { registerMonsterModel } from '../monsterModels.js';
import { CumbotModel, ACTIONS, preloadCumbot, cumbotReady } from './cumbotModel.js';
import { Hazards } from './hazards.js';
import { G } from '../../game/game.js';
import { dampAngle, angleDiff, clamp } from '../../core/utils.js';

registerMonsterModel('cumbot', CumbotModel);
export { preloadCumbot, cumbotReady };

export const CUMBOT_FLAG = 'boss:cumbot';
const LINES = {
  engage: 'HO HO HO! Have you been naughty or nice? ...Naughty. Definitely naughty!',
  summon: 'Sing along, my little rat choir! Jingle... ALL... THE WAY!',
  reset: 'Ho ho ho! Run along home, little one. The choir will wait for you.',
  win: 'Another voice for my choir! Ho ho ho!',
  death: 'Ho... ho... h-o... *bzzzt*',
};
const LIME = new THREE.Color('#9dff4a'), SPARK = new THREE.Color('#ffe08a'), SMOKE = new THREE.Color('#6a6a70'), PINK = new THREE.Color('#ff6ae8');
const _v = new THREE.Vector3(), _w = new THREE.Vector3();

export class CumbotBoss extends Monster {
  constructor(type, level, zone, rng) {
    super(type, level, zone, rng);
    this.isBoss = true;
    this.engaged = false;
    this.act = null;
    this.phase = 1;
    this.specialIdx = 0; this.specialT = 0; this.meleeN = 0;
    this.summoned = false;
    this.adds = [];
    this.pVel = new THREE.Vector3(); this._pLast = null;
    this.model.onStep = (side) => this.onStep(side);
  }

  spawnAt(x, z, parent) {
    super.spawnAt(x, z, parent);
    this.rotY = this.faceGoal = this.zone.rotY ?? -Math.PI / 2;
    this.root.rotation.y = this.rotY;
    this.hz = new Hazards(parent);
  }

  // ---------------------------------------------------------------- engage / reset / talk
  say(text) { G.msg(`Cumbot 9000: "${text}"`, 'boss'); }
  engage(p) {
    if (this.engaged || this.dead || this.state === 'return') return;
    this.engaged = true;
    this.target = p;
    this.state = 'chase';
    this.specialT = 7.5;
    this.attackCd = 0.8;
    this.say(LINES.engage);
    G.audio.play('hoho');
    this.start('intro');
    G.emit('bossEngaged', this);
  }
  reset(playerDown) {
    this.say(playerDown ? LINES.win : LINES.reset);
    this.engaged = false;
    this.state = 'return';
    this.target = null;
    this.endAction();
    this.model.stopAction();
    this.hz.clear();
    this.phase = 1; this.summoned = false; this.specialIdx = 0; this.meleeN = 0;
    this.adds = this.adds.filter((a) => !a.dead);
  }
  taunt(p) { if (!p.cheat) this.engage(p); }
  onAttacked(p) { if (!this.engaged && !p.cheat) this.engage(p); }
  addDebuff(id, dur, data = {}) {
    if (id === 'stun') { G.fx.text(this.headPos(), 'Immune', 'miss'); return; }
    super.addDebuff(id, dur, data);
  }
  takeDamage(dmg, from, crit) {
    if (this.dead) return;
    this.hp -= dmg;
    this.lastHitBy = from;
    if (this.hp <= 0) { this.hp = 0; this.die(from); return; }
    if (!this.engaged && from === G.player && !from.cheat) this.engage(from);
    if (this.hitReactT <= 0) { this.model.hit(); this.hitReactT = 0.25; }
    G.emit('monsterHp', this);
  }
  die(killer) {
    this.endAction();
    this.hz.clear();
    this.engaged = false;
    super.die(killer);
    this.say(LINES.death);
    G.audio.play('powerdown');
    G.cam.addShake(0.6);
    // the hypnosis breaks: the called rat-men drop, knocked out
    for (const a of this.adds) if (!a.dead) a.die(null);
    this.adds.length = 0;
    const p = G.player;
    const first = p && !p.flags[CUMBOT_FLAG];
    if (p) p.flags[CUMBOT_FLAG] = true;
    G.ui?.centerMsg('Cumbot 9000 shuts down!', 4);
    G.msg('The hypnotic hum fades away...', 'quest');
    if (first) G.msg('The barrier around the portal to the Tower of Isel shatters!', 'quest');
    G.emit('bossDefeated', this);
    p?.save();
  }

  // ---------------------------------------------------------------- helpers
  fwd(out = _w) { return out.set(Math.sin(this.rotY), 0, Math.cos(this.rotY)); }
  hurt(mult, opts = {}) {
    const [a0, a1] = this.stats.atk;
    G.player.takeDamage((a0 + Math.random() * (a1 - a0)) * mult, this, opts);
  }
  shake(amount, x, z) {
    const d = Math.hypot(G.player.pos.x - x, G.player.pos.z - z);
    const k = clamp(1 - d / 40, 0, 1);
    if (k > 0) G.cam.addShake(amount * k);
  }
  knockBack(dist) {
    const p = G.player;
    const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z, d = Math.hypot(dx, dz) || 1;
    for (let i = 0; i < 8; i++) p.tryMove((dx / d) * dist / 8, (dz / d) * dist / 8);
  }
  dust(x, z, n = 16, spread = 1.5) {
    const y = G.terrain.groundAt(x, z);
    const c = new THREE.Color('#c9b08a');
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      G.fx.particles.emit({ x: x + Math.cos(a) * spread * 0.4, y: y + 0.2, z: z + Math.sin(a) * spread * 0.4, vx: Math.cos(a) * spread * 2.5, vy: 1 + Math.random() * 2, vz: Math.sin(a) * spread * 2.5, life: 0.9, size: 0.7, endSize: 1.6, color: c, drag: 2.5, grav: -2, alpha: 0.45 });
    }
  }
  onStep(side) {
    const f = this.fwd(), sx = side === 'L' ? 1 : -1;
    const x = this.pos.x + f.x * 0.6 + f.z * 0.85 * sx, z = this.pos.z + f.z * 0.6 - f.x * 0.85 * sx;
    this.dust(x, z, 7, 0.8);
    this.shake(0.22, x, z);
    if (Math.hypot(G.player.pos.x - x, G.player.pos.z - z) < 30) G.audio.play('thud');
  }
  // a walkable point in the arena near (x, z)
  arenaPoint(x, z, spread) {
    for (let k = 0; k < 8; k++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread;
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (Math.hypot(px - this.home.x, pz - this.home.z) < this.def.leash - 6 && G.nav.isWalkable(px, pz)) return [px, pz];
    }
    return null;
  }

  // ---------------------------------------------------------------- actions
  start(name) {
    const A = ACTIONS[name];
    const a = this.act = { name, A, t: 0, done: {} };
    this.model.play(name);
    const p = G.player;
    if (name === 'slam') {
      const centre = () => { const f = this.fwd(); return { x: this.pos.x + f.x * 3.9, z: this.pos.z + f.z * 3.9 }; };
      const c = centre();
      a.tele = this.hz.circle(c.x, c.z, 3.5, A.hit, { color: '#ff3a2a', follow: () => (this.act === a && a.t < A.hit - 0.5 ? centre() : null) });
    } else if (name === 'stomp') {
      a.tele = this.hz.circle(this.pos.x, this.pos.z, 9, A.land, { color: '#ff7a1a' });
      G.audio.play('jingle');
    } else if (name === 'beam') {
      a.aim = Math.atan2(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
      a.lane = this.hz.lane(this.pos.x, this.pos.z, Math.sin(a.aim), Math.cos(a.aim), 30, 1.5, A.fire, { color: '#ff4ad8' });
      a.lane.keep = true;
      G.audio.play('charge');
    } else if (name === 'mortar') {
      G.audio.play('jingle');
    } else if (name === 'summon') {
      this.say(LINES.summon);
      G.audio.play('hypno');
    }
  }
  endAction() {
    const a = this.act;
    if (!a) return;
    if (a.lane) this.hz.remove(a.lane);
    if (a.beam) this.hz.remove(a.beam);
    if (a.tele && !a.tele.fired) this.hz.remove(a.tele);
    this.act = null;
  }

  runAction(dt) {
    const a = this.act, A = a.A, p = G.player;
    a.t += dt;
    const once = (key, time) => (a.t >= time && !a.done[key] ? (a.done[key] = true) : false);
    const toP = Math.atan2(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
    switch (a.name) {
      case 'intro': this.faceGoal = toP; break;
      case 'punchL': case 'punchR':
        if (a.t < A.hit - 0.35) this.faceGoal = toP;
        if (once('hit', A.hit)) this.punchHit(a.name === 'punchL' ? 'L' : 'R');
        break;
      case 'slam':
        if (a.t < A.hit - 0.5) this.faceGoal = toP;
        if (once('hit', A.hit)) this.slamHit(a.tele);
        break;
      case 'mortar':
        this.faceGoal = toP;
        A.shots.forEach((s, i) => { if (once('s' + i, s)) this.mortarVolley(i); });
        break;
      case 'beam': this.beamUpdate(a, dt, toP); break;
      case 'stomp': if (once('land', A.land)) this.stompLand(); break;
      case 'summon': if (once('pulse', A.pulse)) this.summonAdds(); break;
    }
    if (a.t >= A.dur) this.endAction();
  }

  punchHit(side) {
    const p = G.player;
    const m = this.model.socketWorld('muzzle' + side, _v);
    const gy = G.terrain.groundAt(m.x, m.z);
    G.fx.ring(new THREE.Vector3(m.x, gy, m.z), { color: '#ffd9a0', from: 0.4, to: 3.2, life: 0.35 });
    this.dust(m.x, m.z, 10, 1.1);
    this.shake(0.35, m.x, m.z);
    G.audio.play('stomp');
    if (p.dead) return;
    const d = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
    const ang = Math.abs(angleDiff(this.rotY, Math.atan2(p.pos.x - this.pos.x, p.pos.z - this.pos.z)));
    if (d < this.radius + p.radius + 3.3 && ang < 1.15) this.hurt(1);
  }
  slamHit(tele) {
    const p = G.player;
    const c = new THREE.Vector3(tele.x, G.terrain.groundAt(tele.x, tele.z), tele.z);
    G.fx.shockwave(c, '#ff9a4a');
    this.dust(c.x, c.z, 24, 2.2);
    this.shake(0.9, c.x, c.z);
    G.audio.play('quake');
    if (!p.dead && Math.hypot(p.pos.x - c.x, p.pos.z - c.z) < tele.r + p.radius) { this.hurt(1.6, { sure: true }); this.knockBack(1.8); }
  }
  mortarVolley(i) {
    const p = G.player;
    const top = this.model.socketWorld('tankTop', new THREE.Vector3());
    G.audio.play('mortar');
    G.fx.particles.burst(top.x, top.y, top.z, 18, { color: LIME, speed: 5, life: 0.6, size: 0.45, grav: -4, up: 1.2 });
    const targets = [[p.pos.x, p.pos.z]];
    if (i >= 1) targets[0] = [p.pos.x + this.pVel.x * 1.1, p.pos.z + this.pVel.z * 1.1];   // lead the hero
    const extra = i + (this.phase === 2 ? 1 : 0);
    for (let k = 0; k < extra; k++) { const q = this.arenaPoint(p.pos.x, p.pos.z, 8); if (q) targets.push(q); }
    targets.forEach(([x, z], k) => {
      if (!G.nav.isWalkable(x, z)) return;
      const flight = 1.5 + k * 0.12;
      this.hz.circle(x, z, 2.6, flight, { color: '#ffb81a' });
      this.hz.blob(top, x, z, flight, (lx, lz) => this.splat(lx, lz));
    });
  }
  splat(x, z) {
    const p = G.player, y = G.terrain.groundAt(x, z);
    G.fx.particles.burst(x, y + 0.4, z, 30, { color: LIME, speed: 7, life: 0.7, size: 0.5, grav: -10, up: 0.9 });
    G.fx.ring(new THREE.Vector3(x, y, z), { color: '#9dff4a', from: 0.5, to: 5.5, life: 0.45 });
    G.audio.play('splat');
    this.shake(0.25, x, z);
    this.hz.puddle(x, z, 2.3, 7.5);
    if (!p.dead && Math.hypot(p.pos.x - x, p.pos.z - z) < 2.6 + p.radius) {
      this.hurt(1.25, { sure: true });
      p.addBuff('slowed', 3.5, {});
      G.fx.text(p.headPos(), 'Slimed!', 'miss');
    }
  }
  beamUpdate(a, dt, toP) {
    const A = a.A, p = G.player;
    // aim: follows the hero quickly while charging, locks shortly before firing, then sweeps slowly after them
    const rate = a.t < A.fire - 0.4 ? 2.2 : a.t < A.fire ? 0 : 0.34;
    const d = angleDiff(a.aim, toP);
    a.aim += clamp(d, -rate * dt, rate * dt);
    this.faceGoal = a.aim;
    const dx = Math.sin(a.aim), dz = Math.cos(a.aim);
    const ox = this.pos.x + dx * 1.2, oz = this.pos.z + dz * 1.2;
    if (a.lane) a.lane.aim(ox, oz, dx, dz);
    if (a.t >= A.fire && a.t < A.end) {
      if (!a.beam) {
        a.beam = this.hz.beam(26);
        G.audio.play('beam');
        this.shake(0.4, this.pos.x, this.pos.z);
      }
      // slanted part from between the cuffs down to the ground in front, then the hypno wave along the lane
      const mL = this.model.socketWorld('muzzleL', _v).clone(), mR = this.model.socketWorld('muzzleR', _w);
      const muzzle = mL.add(mR).multiplyScalar(0.5);
      const gx = this.pos.x + dx * 4.6, gz = this.pos.z + dz * 4.6;
      const fade = Math.min(1, (a.t - A.fire) / 0.12) * Math.min(1, (A.end - a.t) / 0.2);
      a.beam.set(muzzle, gx, G.terrain.groundAt(gx, gz) + 1.1, gz, dx, dz, fade);
      if (Math.random() < dt * 40) {
        const s = 4.6 + Math.random() * 24;
        const x = this.pos.x + dx * s, z = this.pos.z + dz * s;
        G.fx.particles.emit({ x, y: G.terrain.groundAt(x, z) + 1.1, z, vx: (Math.random() - 0.5) * 3, vy: 1.5 + Math.random() * 2, vz: (Math.random() - 0.5) * 3, life: 0.6, size: 0.4, color: PINK, grav: 0, drag: 1.5 });
      }
      if (!a.hitDone && !p.dead && Hazards.inLane(a.lane, p.pos.x, p.pos.z, p.radius) && p.jumpY < 1.4) {
        a.hitDone = true;
        this.hurt(1.1, { sure: true });
        p.stun(2.4, 'hypno');
      }
    }
  }
  stompLand() {
    const p = G.player;
    const c = this.pos.clone();
    G.fx.shockwave(c, '#ffb04a');
    for (let k = 0; k < 3; k++) setTimeout(() => G.fx.ring(c, { color: k ? '#ffe0a0' : '#ff9a3a', from: 1, to: 20, life: 0.5 + k * 0.12, y: 0.2 + k * 0.3 }), k * 90);
    this.dust(c.x, c.z, 40, 4);
    this.shake(1.3, c.x, c.z);
    G.audio.play('quake');
    G.audio.play('jingle');
    if (p.dead) return;
    const d = Math.hypot(p.pos.x - c.x, p.pos.z - c.z);
    if (d < 9 + p.radius) {
      if (p.airborne && p.jumpY > 0.35) { G.fx.text(p.headPos(), 'Dodged!', 'heal'); return; }
      this.hurt(1.8, { sure: true });
      this.knockBack(3);
    }
  }
  summonAdds() {
    this.summoned = true;
    this.phase = 2;
    const p = G.player;
    G.fx.ring(this.pos.clone(), { color: '#ff4ad8', from: 1, to: 36, life: 1.4, y: 0.3 });
    G.fx.ring(this.pos.clone(), { color: '#b060ff', from: 1, to: 26, life: 1.1, y: 1.2, tex: 'click' });
    this.shake(0.5, this.pos.x, this.pos.z);
    const base = Math.atan2(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
    for (const s of [-1, 1]) {
      const ang = base + s * 1.35;
      const x = this.pos.x + Math.sin(ang) * 11, z = this.pos.z + Math.cos(ang) * 11;
      const q = G.nav.isWalkable(x, z) ? [x, z] : this.arenaPoint(this.pos.x, this.pos.z, 12);
      if (!q) continue;
      const m = G.monsters.spawnOne({ id: 'cumbot_choir', type: 'ratman_hypno', x: q[0], z: q[1], r: 2, count: 0, lv: [9, 9], noRespawn: true });
      G.fx.pillar(m.pos.clone(), '#ff4ad8', 1.4, 0.8, 6);
      G.fx.poof(m.pos, '#ffb0f0', 20);
      m.taunt(p);
      this.adds.push(m);
    }
    G.msg('Hypnotized rat-men answer Cumbot\'s call!', 'warn');
  }

  // ---------------------------------------------------------------- per frame
  update(dt) {
    if (this.removed) return;
    if (this.dead) {
      this.deadFx(dt); this.hz?.update(dt); super.update(dt);
      // he lies slumped for a while first: the respawn time counts from the knockout, not from the fade-out
      if (this.removed) { this.respawnT = Math.max(5, this.def.respawn - this.deathT); this.hz?.destroy(); }
      return;
    }
    const m = this.model, p = G.player;
    for (let i = this.debuffs.length - 1; i >= 0; i--) {
      const d = this.debuffs[i];
      d.t -= dt;
      if (d.t <= 0) { this.debuffs.splice(i, 1); this.debuffDef = this.debuffs.reduce((s, x) => s + (x.data.def || 0), 0); }
    }
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.hitReactT = Math.max(0, this.hitReactT - dt);
    this.hz.update(dt);
    // the hero's velocity (to lead the mortar)
    if (this._pLast && dt > 1e-4) { _v.subVectors(p.pos, this._pLast).divideScalar(dt); this.pVel.lerp(_v, 1 - Math.exp(-6 * dt)); }
    this._pLast = (this._pLast || new THREE.Vector3()).copy(p.pos);

    let moveSpeed = 0;
    const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z, dist = Math.hypot(dx, dz);
    if (!this.engaged) {
      if (this.state === 'return') {
        const hx = this.home.x - this.pos.x, hz = this.home.z - this.pos.z, d = Math.hypot(hx, hz);
        this.hp = Math.min(this.stats.maxHp, this.hp + this.stats.maxHp * 0.25 * dt);
        if (d < 0.6) { this.state = 'idle'; this.hp = this.stats.maxHp; this.faceGoal = this.zone.rotY ?? -Math.PI / 2; G.emit('monsterHp', this); }
        else { moveSpeed = this.def.speed * 1.2; this.moveDir(hx / d, hz / d, Math.min(d, moveSpeed * dt), true); }
      } else if (!p.dead && !p.cheat && !G.traveling && dist < (this.def.aggroRange || 13) && Math.abs(p.pos.y - this.pos.y) < 5) this.engage(p);
    } else {
      const leash = Math.hypot(p.pos.x - this.home.x, p.pos.z - this.home.z);
      // the special timer runs during melee too (not while a special is going on)
      if (!this.act || !['mortar', 'beam', 'stomp', 'summon', 'intro'].includes(this.act.name)) this.specialT -= dt;
      if (p.dead || leash > this.def.leash) this.reset(p.dead);
      else if (this.act) this.runAction(dt);
      else {
        const reach = this.def.range + this.radius + p.radius;
        if (!this.summoned && this.hp < this.stats.maxHp * 0.5) this.start('summon');
        else if (this.specialT <= 0 && dist < 28) {
          const rot = this.phase === 2 ? ['stomp', 'mortar', 'beam'] : ['mortar', 'beam'];
          this.start(rot[this.specialIdx++ % rot.length]);
          this.specialT = this.phase === 2 ? 8.5 : 10.5;
        } else if (dist > reach) {
          moveSpeed = this.def.speed * (this.phase === 2 ? 1.2 : 1) * this.speedMult();
          this.moveDir(dx / dist, dz / dist, Math.min(dist - reach * 0.85, moveSpeed * dt));
        } else {
          this.faceGoal = Math.atan2(dx, dz);
          if (this.attackCd <= 0 && Math.abs(angleDiff(this.rotY, this.faceGoal)) < 0.7) {
            this.meleeN++;
            this.start(this.meleeN % 3 === 0 ? 'slam' : this.meleeN % 2 ? 'punchR' : 'punchL');
            this.attackCd = this.def.atkCd * (0.85 + this.rng() * 0.3);
          }
        }
      }
    }
    // the hero cannot stand inside the mech
    if (!p.dead) {
      const d = Math.hypot(dx, dz), min = this.radius + p.radius;
      if (d < min && d > 1e-4) p.tryMove((dx / d) * (min - d), (dz / d) * (min - d));
    }
    if (this.faceGoal !== undefined) this.rotY = dampAngle(this.rotY, this.faceGoal, this.act ? 3.2 : 5, dt);
    this.groundY = G.terrain.groundAt(this.pos.x, this.pos.z);
    this.pos.y = this.groundY;
    m.setMoving(clamp(moveSpeed / Math.max(0.1, this.def.speed), 0, 1));
    m.update(dt);
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.rotY;
    if (this.engaged) this.state = 'chase';
  }

  // sparks and smoke while he powers down
  deadFx(dt) {
    const d = this.model.deathT;
    if (d < 0 || d > 9) return;
    if (Math.random() < dt * (d < 3 ? 16 : 5)) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 1.4;
      const y = this.groundY + 1 + Math.random() * (d < 1.5 ? 3.5 : 2);
      G.fx.particles.burst(this.pos.x + Math.cos(a) * r, y, this.pos.z + Math.sin(a) * r, 7, { color: SPARK, speed: 5, life: 0.4, size: 0.22, grav: -10, up: 0.8 });
      if (Math.random() < 0.3) G.audio.play('zap');
    }
    if (Math.random() < dt * 7) {
      const top = this.model.socketWorld('tankTop', _v);
      G.fx.particles.emit({ x: top.x + (Math.random() - 0.5), y: top.y - 1, z: top.z + (Math.random() - 0.5), vx: (Math.random() - 0.5) * 0.6, vy: 1.4, vz: (Math.random() - 0.5) * 0.6, life: 2.4, size: 1.1, endSize: 2.6, color: SMOKE, drag: 0.6, grav: 0, alpha: 0.4 });
    }
  }
}
BOSS_CLASSES.cumbot = CumbotBoss;

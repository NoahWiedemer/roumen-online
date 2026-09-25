// Monster instances with simple MMO AI (wander / aggro / chase / attack / leash / respawn)
import * as THREE from 'three';
import { createMonsterModel } from './monsterModels.js';
import { MONSTERS, monsterStats } from '../game/data.js';
import { SPAWN_ZONES } from '../world/layout.js';
import { G } from '../game/game.js';
import { clamp, dampAngle, mulberry32 } from '../core/utils.js';

const _v = new THREE.Vector3();

export class Monster {
  constructor(type, level, zone, rng) {
    this.type = type;
    this.def = MONSTERS[type];
    this.name = this.def.name;
    this.level = level;
    this.zone = zone;
    this.stats = monsterStats(type, level);
    this.hp = this.stats.maxHp;
    // subtle per-individual colour variation (near-white tints multiply the body colour)
    const tint = new THREE.Color(0.86 + rng() * 0.14, 0.86 + rng() * 0.14, 0.86 + rng() * 0.14);
    let model;
    try { model = createMonsterModel(type, { tint: type === 'kingslime' ? undefined : tint }); }
    catch (e) { console.warn('monster model missing:', type, e); model = createMonsterModel('slime', { tint }); }
    this.model = model;
    this.model.onImpact = (strength) => { if (strength > 1) { G.cam.addShake(0.6); G.audio.play('stomp'); } };
    this.root = this.model.root;
    this.radius = this.model.radius;
    this.height = this.model.height;
    this.pos = new THREE.Vector3();
    this.rotY = rng() * Math.PI * 2;
    this.home = new THREE.Vector3();
    this.state = 'idle';
    this.wanderT = 1 + rng() * 4;
    this.wanderTarget = null;
    this.attackCd = 0;
    this.pendingHit = -1;
    this.target = null;
    this.dead = false;
    this.removed = false;
    this.debuffs = [];
    this.debuffDef = 0;
    this.hitReactT = 0;
    this.lastHitBy = null;
    this.rng = rng;
    this.groundY = 0;
  }

  spawnAt(x, z, parent = G.scene) {
    this.pos.set(x, G.terrain.groundAt(x, z), z);
    this.home.copy(this.pos);
    this.groundY = this.pos.y;
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.rotY;
    this.parent = parent;
    parent.add(this.root);
  }

  headPos() { return _v.set(this.pos.x, this.groundY + this.height + 0.25, this.pos.z).clone(); }

  addDebuff(id, dur, data = {}) {
    const ex = this.debuffs.find((d) => d.id === id);
    if (ex) ex.t = dur; else this.debuffs.push({ id, t: dur, data });
    this.debuffDef = this.debuffs.reduce((a, d) => a + (d.data.def || 0), 0);
    if (id === 'stun') this.stunFx = true;
  }
  isStunned() { return this.debuffs.some((d) => d.id === 'stun'); }
  speedMult() { return this.debuffs.some((d) => d.id === 'slow') ? 0.5 : 1; }

  taunt(player) {
    if (this.dead) return;
    this.target = player;
    this.state = 'chase';
    G.fx.text(this.headPos(), '!', 'aggro');
  }

  onAttacked(player) {
    if (this.dead) return;
    if (!this.target) { this.target = player; this.state = 'chase'; }
    // pack monsters (imps) call their friends for help
    if (this.def.assist && !this._called) {
      this._called = true;
      for (const o of G.monsters.list) {
        if (o === this || o.dead || o.type !== this.type || o.target) continue;
        if (Math.hypot(o.pos.x - this.pos.x, o.pos.z - this.pos.z) < this.def.assist) { o.target = player; o.state = 'chase'; G.fx.text(o.headPos(), '!', 'aggro'); }
      }
    }
  }

  takeDamage(dmg, from, crit) {
    if (this.dead) return;
    this.hp -= dmg;
    this.lastHitBy = from;
    this.onAttacked(from);
    if (this.hp <= 0) { this.hp = 0; this.die(from); return; }
    if (this.hitReactT <= 0 && this.pendingHit < 0) { this.model.hit(); this.hitReactT = 0.35; }
    // small knockback
    const dx = this.pos.x - from.pos.x, dz = this.pos.z - from.pos.z, d = Math.hypot(dx, dz) || 1;
    const kb = crit ? 0.35 : 0.15;
    const r = G.colliders.resolve(this.pos.x + (dx / d) * kb, this.pos.z + (dz / d) * kb, this.radius * 0.8);
    this.pos.x = r.x; this.pos.z = r.z;
    if (this.type === 'slime' || this.type === 'kingslime') G.audio.play('slime');
    G.emit('monsterHp', this);
  }

  die(killer) {
    this.dead = true;
    this.state = 'dead';
    this.model.die();
    this.deathT = 0;
    G.audio.play('die');
    G.emit('monsterKilled', this);
    const p = G.player;
    if (killer === p) {
      // exp scaled by level difference
      const diff = this.level - p.level;
      let exp = this.stats.exp;
      if (diff <= -5) exp = Math.max(1, Math.round(exp * 0.2));
      else if (diff < 0) exp = Math.round(exp * (1 + diff * 0.12));
      else exp = Math.round(exp * (1 + diff * 0.1));
      p.gainExp(exp);
      G.loot.dropFrom(this);
    }
    if (p.target === this) p.setTarget(null);
  }

  update(dt) {
    const m = this.model;
    if (this.removed) return;
    if (this.dead) {
      this.deathT += dt;
      m.update(dt);
      if (m.dead || this.deathT > 3) {
        this.removed = true;
        this.root.parent?.remove(this.root);
        this.respawnT = this.def.respawn;
      }
      return;
    }
    // debuffs
    for (let i = this.debuffs.length - 1; i >= 0; i--) {
      const d = this.debuffs[i];
      d.t -= dt;
      if (d.t <= 0) { this.debuffs.splice(i, 1); this.debuffDef = this.debuffs.reduce((a, x) => a + (x.data.def || 0), 0); }
    }
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.hitReactT = Math.max(0, this.hitReactT - dt);

    const player = G.player;
    let moveSpeed = 0;
    const stunned = this.isStunned();
    if (stunned && this.rng() < dt * 3) {
      const hp = this.headPos();
      G.fx.particles.emit({ x: hp.x + (this.rng() - 0.5) * 0.4, y: hp.y, z: hp.z + (this.rng() - 0.5) * 0.4, vy: 0.3, life: 0.6, size: 0.28, color: new THREE.Color('#ffe45a'), grav: 0 });
    }

    // pending attack impact
    if (this.pendingHit >= 0) {
      this.pendingHit -= dt;
      if (this.pendingHit < 0 && this.target && !this.target.dead) {
        const d = Math.hypot(this.target.pos.x - this.pos.x, this.target.pos.z - this.pos.z);
        if (d < this.def.range + this.radius + this.target.radius + 0.6) {
          const dmg = this.stats.atk[0] + Math.random() * (this.stats.atk[1] - this.stats.atk[0]);
          this.target.takeDamage(dmg, this);

        }
      }
    }

    if (!stunned) {
      const dHome = Math.hypot(this.pos.x - this.home.x, this.pos.z - this.home.z);
      switch (this.state) {
        case 'idle': {
          // aggro check
          if (this.def.aggressive && !player.dead && player.level < this.level + 8) {
            const d = Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
            if (d < (this.def.aggroRange || 6)) { this.target = player; this.state = 'chase'; G.fx.text(this.headPos(), '!', 'aggro'); if (this.type === 'bee') G.audio.play('buzz'); break; }
          }
          this.wanderT -= dt;
          if (this.wanderTarget) {
            const dx = this.wanderTarget.x - this.pos.x, dz = this.wanderTarget.z - this.pos.z, d = Math.hypot(dx, dz);
            if (d < 0.3) this.wanderTarget = null;
            else { moveSpeed = this.def.speed * 0.4; this.moveDir(dx / d, dz / d, moveSpeed * dt); }
          } else if (this.wanderT <= 0) {
            this.wanderT = 3 + this.rng() * 6;
            const a = this.rng() * Math.PI * 2, r = this.rng() * this.zone.r * 0.6;
            const tx = this.zone.x + Math.cos(a) * r, tz = this.zone.z + Math.sin(a) * r;
            if (G.nav.isWalkable(tx, tz)) this.wanderTarget = { x: tx, z: tz };
          }
          break;
        }
        case 'chase': {
          const t = this.target;
          if (!t || t.dead || dHome > this.def.leash) { this.state = 'return'; this.target = null; break; }
          const dx = t.pos.x - this.pos.x, dz = t.pos.z - this.pos.z, d = Math.hypot(dx, dz);
          const reach = this.def.range + this.radius + t.radius;
          if (d > reach) {
            moveSpeed = this.def.speed * this.speedMult();
            this.moveDir(dx / d, dz / d, Math.min(d - reach * 0.8, moveSpeed * dt));
          } else {
            this.faceGoal = Math.atan2(dx, dz);
            if (this.attackCd <= 0 && this.pendingHit < 0) {
              this.attackCd = this.def.atkCd * (0.9 + this.rng() * 0.2);
              this.pendingHit = m.attack();
            }
          }
          break;
        }
        case 'return': {
          const dx = this.home.x - this.pos.x, dz = this.home.z - this.pos.z, d = Math.hypot(dx, dz);
          this.hp = Math.min(this.stats.maxHp, this.hp + this.stats.maxHp * 0.5 * dt);
          if (d < 0.5) { this.state = 'idle'; this.hp = this.stats.maxHp; this._called = false; G.emit('monsterHp', this); }
          else { moveSpeed = this.def.speed * 1.3; this.moveDir(dx / d, dz / d, moveSpeed * dt, true); }
          break;
        }
      }
    }

    // separate from other monsters a little
    for (const o of G.monsters.list) {
      if (o === this || o.dead || o.removed) continue;
      const dx = this.pos.x - o.pos.x, dz = this.pos.z - o.pos.z, d = Math.hypot(dx, dz), min = this.radius + o.radius;
      if (d < min && d > 1e-4) { const push = (min - d) * 0.5; this.pos.x += (dx / d) * push; this.pos.z += (dz / d) * push; }
    }
    // separate from player
    if (!player.dead) {
      const dx = this.pos.x - player.pos.x, dz = this.pos.z - player.pos.z, d = Math.hypot(dx, dz), min = this.radius + player.radius;
      if (d < min && d > 1e-4) { this.pos.x += (dx / d) * (min - d); this.pos.z += (dz / d) * (min - d); }
    }

    if (this.faceGoal !== undefined) this.rotY = dampAngle(this.rotY, this.faceGoal, 8, dt);
    this.groundY = G.terrain.groundAt(this.pos.x, this.pos.z);
    this.pos.y = this.groundY;
    m.setMoving(clamp(moveSpeed / Math.max(0.1, this.def.speed), 0, 1));
    m.update(dt);
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.rotY;
  }

  moveDir(dx, dz, step, ignoreNav = false) {
    const nx = this.pos.x + dx * step, nz = this.pos.z + dz * step;
    if (!ignoreNav && !G.nav.isWalkable(nx, nz)) { this.wanderTarget = null; return; }
    const r = G.colliders.resolve(nx, nz, this.radius * 0.8);
    this.pos.x = r.x; this.pos.z = r.z;
    this.faceGoal = Math.atan2(dx, dz);
  }
}

export class MonsterManager {
  // zones: spawn zones of this world; parent: the world's root group
  constructor(zones = SPAWN_ZONES, parent = null) {
    this.list = [];
    this.zones = zones;
    this.parent = parent;
    this.rng = mulberry32(4242);
    this.respawnQueue = [];
  }
  spawnAll() {
    for (const z of this.zones) for (let i = 0; i < z.count; i++) this.spawnOne(z);
  }
  spawnOne(zone) {
    const rng = this.rng;
    const lv = zone.lv[0] + Math.floor(rng() * (zone.lv[1] - zone.lv[0] + 1));
    const m = new Monster(zone.type, lv, zone, rng);
    for (let k = 0; k < 20; k++) {
      const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * zone.r * 0.8;
      const x = zone.x + Math.cos(a) * r, z = zone.z + Math.sin(a) * r;
      if (G.nav.isWalkable(x, z)) { m.spawnAt(x, z, this.parent || G.scene); break; }
      if (k === 19) m.spawnAt(zone.x, zone.z, this.parent || G.scene);
    }
    this.list.push(m);
    return m;
  }
  update(dt) {
    const player = G.player;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const m = this.list[i];
      // cheap LOD: far-away idle monsters update at low rate
      const d = Math.hypot(m.pos.x - player.pos.x, m.pos.z - player.pos.z);
      m.root.visible = d < 140;
      if (d > 90 && m.state === 'idle' && !m.dead) { m._acc = (m._acc || 0) + dt; if (m._acc < 0.25) continue; m.update(m._acc); m._acc = 0; }
      else m.update(dt);
      if (m.removed) {
        this.list.splice(i, 1);
        this.respawnQueue.push({ zone: m.zone, t: m.respawnT });
        m.model.dispose && m.model.dispose();
      }
    }
    for (let i = this.respawnQueue.length - 1; i >= 0; i--) {
      const r = this.respawnQueue[i];
      r.t -= dt;
      if (r.t <= 0) {
        this.respawnQueue.splice(i, 1);
        const m = this.spawnOne(r.zone);
        G.fx.poof(m.pos, '#ffffff', 10);
      }
    }
  }
  inRadius(p, r) { return this.list.filter((m) => !m.dead && Math.hypot(m.pos.x - p.x, m.pos.z - p.z) < r + m.radius); }
  nearestTarget(p, maxD = 20, exclude = null) {
    let best = null, bd = maxD;
    for (const m of this.list) {
      if (m.dead || m === exclude) continue;
      const d = Math.hypot(m.pos.x - p.x, m.pos.z - p.z);
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  }
  // Tab targeting: cycle through monsters in front of the camera, nearest first
  cycleTarget(p, current) {
    const cands = this.list.filter((m) => !m.dead && Math.hypot(m.pos.x - p.x, m.pos.z - p.z) < 25)
      .sort((a, b) => Math.hypot(a.pos.x - p.x, a.pos.z - p.z) - Math.hypot(b.pos.x - p.x, b.pos.z - p.z));
    if (!cands.length) return null;
    const idx = cands.indexOf(current);
    return cands[(idx + 1) % cands.length];
  }
}

// Player controller: movement (click-to-move + WASD), combat, skills, inventory, progression
import * as THREE from 'three';
import { createFighter } from './fighter.js';
import { Trail } from './effects.js';
import { dualBladesReady, attachDualBlades, bladeTime } from './weapons.js';
import { G } from '../game/game.js';
import { clamp, dampAngle, angleDiff, lerp } from '../core/utils.js';
import {
  EXP_TABLE, MAX_LEVEL, FIGHTER_BASE, FIGHTER_GROWTH, STAT_NAMES, derivedStats, SKILLS, ITEMS, STARTING, EQUIP_SLOTS,
} from '../game/data.js';
import { TOWN } from '../world/layout.js';

const RUN_SPEED = 6.2, WALK_SPEED = 2.4, GCD = 0.6;
const INV_SIZE = 48; // 2 pages x 24
const SAVE_KEY = 'roumen-online-save-v1';

export class Player {
  constructor(name = 'Ryou') {
    const f = createFighter();
    this.rig = f.rig; this.anim = f.anim; this.root = f.root;
    this.name = name;
    this.title = 'Novice';
    this.isPlayer = true;
    this.radius = 0.4;
    this.height = 1.85;
    this.pos = new THREE.Vector3(TOWN.spawn.x, 0, TOWN.spawn.z);
    this.rotY = -0.52;         // new characters face the fountain & market
    this.velY = 0; this.airborne = false; this.jumpY = 0;
    this.level = 1; this.exp = 0; this.statPoints = 1;
    this.alloc = { str: 0, end: 0, dex: 0, int: 0, spr: 0 };
    this.money = STARTING.money;
    this.stones = { ...STARTING.stones };
    this.inventory = new Array(INV_SIZE).fill(null);
    this.equipment = {};
    this.learned = new Set(['attack', 'pickup', 'sit']);
    this.skillbar = new Array(24).fill(null);
    this.skillbar[0] = { type: 'skill', id: 'attack' };
    this.skillbar[1] = { type: 'skill', id: 'pickup' };
    this.skillbar[9] = { type: 'skill', id: 'sit' };
    this.skillbar[10] = { type: 'item', id: 'hp_potion_s' };
    this.skillbar[11] = { type: 'item', id: 'sp_potion_s' };
    this.cooldowns = {};
    this.gcd = 0;
    this.buffs = [];
    this.target = null;
    this.autoAttack = false;
    this.path = null;
    this.running = true;
    this.state = 'idle';
    this.dead = false;
    this.comboIdx = 0;
    this.attackTimer = 0;
    this.pending = null;       // pending skill / interaction to perform when in range
    this.inCombatT = 0;
    this.regenT = 0;
    this.sitting = false;
    this.pathTimer = 0;
    this._fwd = new THREE.Vector3();
    this.trail = null;
    this.trailL = null;        // off-hand trail (dual blades)
    this.dual = null;          // { right, left } blade meshes once dual blades were equipped
    this.flags = {};           // one-time story flags, e.g. 'gift:robo'
    this.stuckT = 0;
    for (const [id, n] of STARTING.inventory) this.addItem(id, n, true);
    for (const [slot, id] of Object.entries(STARTING.equipment)) this.equipment[slot] = id;
    this.stats = derivedStats(this);
    this.hp = this.stats.maxHp; this.sp = this.stats.maxSp;
  }

  attach(scene) {
    scene.add(this.root);
    this.trail = new Trail(scene, '#fff4c8', 16);
    this.trailL = new Trail(scene, '#2a7bff', 16);
    this.applyWeaponLook();
  }
  isDual() { return ITEMS[this.equipment.weapon]?.weaponClass === 'dual'; }

  // ---------------------------------------------------------------- stats
  baseStats() {
    const s = {};
    for (const k of Object.keys(FIGHTER_BASE)) s[k] = Math.floor(FIGHTER_BASE[k] + FIGHTER_GROWTH[k] * (this.level - 1)) + this.alloc[k];
    return s;
  }
  equipStats() {
    const o = { atkMin: 1, atkMax: 2, def: 0, mdef: 0, hp: 0, sp: 0, str: 0, end: 0, dex: 0, int: 0, spr: 0 };
    for (const slot of EQUIP_SLOTS) {
      const id = this.equipment[slot];
      if (!id) continue;
      const it = ITEMS[id];
      if (it.atk) { o.atkMin = it.atk[0]; o.atkMax = it.atk[1]; }
      o.def += it.def || 0; o.hp += it.hp || 0; o.sp += it.sp || 0;
      for (const k of ['str', 'end', 'dex', 'int', 'spr']) o[k] += it[k] || 0;
    }
    return o;
  }
  totalStats() {
    const b = this.baseStats(), e = this.equipStats();
    return { str: b.str + e.str, end: b.end + e.end, dex: b.dex + e.dex, int: b.int + e.int, spr: b.spr + e.spr };
  }
  recalc() {
    const prevMax = this.stats ? this.stats.maxHp : 0;
    this.stats = derivedStats(this);
    for (const b of this.buffs) {
      if (b.data.def) this.stats.def = Math.round(this.stats.def * (1 + b.data.def));
    }
    this.hp = Math.min(this.hp, this.stats.maxHp);
    this.sp = Math.min(this.sp, this.stats.maxSp);
    G.emit('stats');
  }
  dmgMult() { let m = 1; for (const b of this.buffs) if (b.data.dmg) m += b.data.dmg; return m; }
  allocate(stat) {
    if (this.statPoints <= 0) return;
    this.statPoints--; this.alloc[stat]++;
    this.recalc();
    G.audio.play('click');
  }

  // ---------------------------------------------------------------- inventory
  addItem(id, n = 1, silent = false) {
    const it = ITEMS[id];
    if (!it) return n;
    const stack = it.stack || 1;
    for (let i = 0; i < INV_SIZE && n > 0; i++) {
      const s = this.inventory[i];
      if (s && s.id === id && s.n < stack) { const add = Math.min(n, stack - s.n); s.n += add; n -= add; }
    }
    for (let i = 0; i < INV_SIZE && n > 0; i++) {
      if (!this.inventory[i]) { const add = Math.min(n, stack); this.inventory[i] = { id, n: add }; n -= add; }
    }
    if (!silent) G.emit('inventory');
    if (n > 0 && !silent) G.msg('Your inventory is full.', 'warn');
    return n;
  }
  countItem(id) { return this.inventory.reduce((a, s) => a + (s && s.id === id ? s.n : 0), 0); }
  removeItem(id, n = 1) {
    for (let i = INV_SIZE - 1; i >= 0 && n > 0; i--) {
      const s = this.inventory[i];
      if (s && s.id === id) { const r = Math.min(n, s.n); s.n -= r; n -= r; if (s.n <= 0) this.inventory[i] = null; }
    }
    G.emit('inventory');
    return n === 0;
  }
  freeSlots() { return this.inventory.filter((s) => !s).length; }
  useInventorySlot(i) {
    const s = this.inventory[i];
    if (!s) return;
    const it = ITEMS[s.id];
    if (it.type === 'consumable') this.useItem(s.id);
    else if (['weapon', 'armor', 'helm', 'pants', 'boots', 'gloves', 'ring', 'necklace', 'earring'].includes(it.type)) this.equipFromSlot(i);
  }
  equipFromSlot(i) {
    const s = this.inventory[i];
    if (!s) return;
    const it = ITEMS[s.id];
    const slot = it.type;
    if ((it.lv || 1) > this.level) { G.msg(`You need to be level ${it.lv} to equip ${it.name}.`, 'warn'); G.audio.play('error'); return; }
    const prev = this.equipment[slot];
    this.equipment[slot] = s.id;
    this.inventory[i] = prev ? { id: prev, n: 1 } : null;
    this.recalc();
    if (slot === 'weapon') this.applyWeaponLook();
    G.audio.play('pickup');
    G.msg(`Equipped ${it.name}.`);
    G.emit('inventory');
    this.save();
  }
  unequip(slot) {
    const id = this.equipment[slot];
    if (!id) return;
    if (this.freeSlots() === 0) { G.msg('Your inventory is full.', 'warn'); return; }
    delete this.equipment[slot];
    this.addItem(id, 1);
    this.recalc();
    if (slot === 'weapon') this.applyWeaponLook();
    G.emit('inventory');
  }
  applyWeaponLook() {
    const it = ITEMS[this.equipment.weapon];
    const w = this.rig.weapon;
    // dual blades: one glowing blade per fist, own stance / run cycle / combo
    if (it && it.weaponClass === 'dual') {
      if (!this.dual && dualBladesReady()) this.dual = attachDualBlades(this.rig, it.look);
      if (this.dual) this.dual.right.visible = this.dual.left.visible = true;
      if (w) w.visible = false;
      this.anim.setStyle('dual');
      this.comboIdx = 0;
      if (this.trail) this.trail.setColor(it.look.glowR);
      if (this.trailL) this.trailL.setColor(it.look.glowL);
      return;
    }
    if (this.dual) this.dual.right.visible = this.dual.left.visible = false;
    this.anim.setStyle('sword');
    if (!w) return;
    w.visible = !!it;
    if (!it) return;
    const look = it.look || {};
    const wid = this.equipment.weapon;
    const scale = wid === 'greatsword_flame' ? 1.15 : 1;
    w.scale.set(scale, scale, scale);
    w.traverse((o) => {
      if (!o.isMesh) return;
      if (o.material === this.rig.mats.steel || o.material === this._bladeMat) {
        if (!this._bladeMat) { this._bladeMat = o.material.clone(); }
        o.material = this._bladeMat;
      }
      if (o.material.emissive && o.material.emissiveIntensity > 1) o.visible = !!look.rune;
      if (o.material.emissive && o.material.emissiveIntensity > 1 && look.rune) { o.material.color.set(look.rune); o.material.emissive.set(look.rune); }
    });
    if (this._bladeMat) {
      this._bladeMat.color.set(look.blade || '#d9e0ea');
      this._bladeMat.metalness = wid === 'sword_wood' ? 0 : 0.95;
      this._bladeMat.roughness = wid === 'sword_wood' ? 0.8 : 0.22;
    }
    if (this.trail) this.trail.setColor(look.rune || '#fff4c8');
  }

  // ---------------------------------------------------------------- consumables
  useItem(id) {
    const it = ITEMS[id];
    if (!it || this.dead) return;
    if (this.countItem(id) <= 0) { G.msg(`You have no ${it.name}.`, 'warn'); G.audio.play('error'); return; }
    const cdKey = 'item:' + (it.heal ? 'hp' : it.mana ? 'sp' : id);
    if (this.cooldowns[cdKey] > 0) { G.msg('That item is not ready yet.', 'warn'); return; }
    if (it.heal) { if (this.hp >= this.stats.maxHp) { G.msg('Your HP is already full.', 'warn'); return; } this.heal(it.heal); G.audio.play('potion'); }
    if (it.mana) { if (this.sp >= this.stats.maxSp) { G.msg('Your SP is already full.', 'warn'); return; } this.restoreSp(it.mana); G.audio.play('potion'); }
    if (it.regen) this.addBuff('well_fed', it.regenDur, { regenFlat: it.regen / it.regenDur });
    if (it.recall) { this.recall(); }
    this.cooldowns[cdKey] = it.cd || 1;
    this.cooldowns['item:' + id] = it.cd || 1;
    this.removeItem(id, 1);
  }
  useStone(kind) {
    if (this.dead) return;
    if (this.stones[kind] <= 0) { G.msg(`You have no ${kind.toUpperCase()} stones left. Visit the Healer in town.`, 'warn'); G.audio.play('error'); return; }
    const key = 'stone:' + kind;
    if (this.cooldowns[key] > 0) return;
    if (kind === 'hp') { if (this.hp >= this.stats.maxHp) return; this.heal(Math.round(this.stats.maxHp * 0.35 + 10)); }
    else { if (this.sp >= this.stats.maxSp) return; this.restoreSp(Math.round(this.stats.maxSp * 0.4 + 4)); }
    this.stones[kind]--;
    this.cooldowns[key] = 3;
    G.audio.play('potion');
    G.emit('stats');
  }
  heal(n) {
    const before = this.hp;
    this.hp = Math.min(this.stats.maxHp, this.hp + n);
    const d = Math.round(this.hp - before);
    if (d > 0) { G.fx.text(this.headPos(), '+' + d, 'heal'); G.fx.healSparkle(this.pos); }
  }
  restoreSp(n) {
    const before = this.sp;
    this.sp = Math.min(this.stats.maxSp, this.sp + n);
    const d = Math.round(this.sp - before);
    if (d > 0) { G.fx.text(this.headPos(), '+' + d, 'sp'); G.fx.healSparkle(this.pos, '#7fc8ff'); }
  }
  recall() {
    this.stopActions();
    G.fx.pillar(this.pos.clone(), '#8fd8ff', 1.2, 0.8, 6);
    G.audio.play('teleport');
    if (G.world && G.world.id !== 'roumen' && G.travel) { G.travel('roumen', { at: { x: TOWN.spawn.x, z: TOWN.spawn.z } }); return; }
    setTimeout(() => {
      this.teleport(TOWN.spawn.x, TOWN.spawn.z);
      G.fx.pillar(this.pos.clone(), '#8fd8ff', 1.2, 0.8, 6);
    }, 600);
  }
  teleport(x, z) {
    this.pos.set(x, G.terrain.groundAt(x, z), z);
    this.path = null;
    G.cam.snap(this.pos);
  }

  // ---------------------------------------------------------------- buffs
  addBuff(id, dur, data = {}) {
    const ex = this.buffs.find((b) => b.id === id);
    if (ex) { ex.t = dur; ex.dur = dur; ex.data = data; }
    else this.buffs.push({ id, t: dur, dur, data });
    this.recalc();
    G.emit('buffs');
  }

  // ---------------------------------------------------------------- progression
  gainExp(n) {
    if (this.level >= MAX_LEVEL) return;
    this.exp += n;
    G.msg(`Obtained ${n} Exp.`, 'exp');
    while (this.level < MAX_LEVEL && this.exp >= EXP_TABLE[this.level]) {
      this.exp -= EXP_TABLE[this.level];
      this.levelUp();
    }
    G.emit('stats');
  }
  levelUp() {
    const before = this.baseStats();
    this.level++;
    this.statPoints++;
    const after = this.baseStats();
    this.recalc();
    this.hp = this.stats.maxHp; this.sp = this.stats.maxSp;
    const sm = STARTING.stoneMax(this.level);
    G.fx.pillar(this.pos.clone(), '#ffe45a', 2.4, 0.9, 10);
    G.fx.text(this.headPos().add(new THREE.Vector3(0, 0.6, 0)), 'LEVEL UP!', 'levelup');
    G.audio.play('levelup');
    if (!this.anim.busy && !this.sitting) this.anim.play('levelup');
    G.msg(`Congratulations! You have reached level ${this.level}.`, 'level');
    for (const k of Object.keys(before)) if (after[k] > before[k]) G.msg(`${STAT_NAMES[k]} increased by ${after[k] - before[k]}.`, 'stat');
    G.msg(`HP increased. SP increased. Stone capacity: ${sm.hp} / ${sm.sp}.`, 'stat');
    if (this.level >= 5) this.title = 'Apprentice';
    if (this.level >= 10) this.title = 'Brave';
    const newSkills = Object.entries(SKILLS).filter(([, s]) => s.level === this.level && s.cost);
    for (const [, s] of newSkills) G.msg(`New skill available at the Skill Master: ${s.name}.`, 'quest');
    G.emit('levelup', this.level);
    this.save();
  }

  // ---------------------------------------------------------------- combat
  headPos() { return new THREE.Vector3(this.pos.x, this.pos.y + this.height + 0.1, this.pos.z); }
  get groundY() { return this.pos.y; }

  setTarget(t) {
    if (this.target === t) return;
    this.target = t;
    if (!t) this.autoAttack = false;
    G.fx.showTarget(t, t && t.isNpc);
    G.emit('target', t);
  }
  attackTarget(t) {
    if (!t || t.dead) return;
    this.setTarget(t);
    this.autoAttack = true;
    this.pending = null;
    this.standUp();
  }
  stopActions() {
    this.autoAttack = false; this.pending = null; this.path = null;
  }
  standUp() {
    if (this.sitting) { this.sitting = false; this.anim.sitTarget = 0; G.emit('buffs'); }
  }
  toggleSit() {
    if (this.dead) return;
    if (this.sitting) { this.standUp(); return; }
    if (this.anim.busy || this.airborne) return;
    this.stopActions();
    this.sitting = true;
    this.anim.sitTarget = 1;
    G.emit('buffs');
  }

  meleeRange(t) { return this.radius + (t.radius || 0.5) + 1.25; }

  // use a skillbar entry
  useSlot(entry) {
    if (!entry || this.dead) return;
    if (entry.type === 'item') { this.useItem(entry.id); return; }
    this.useSkill(entry.id);
  }

  useSkill(id) {
    const sk = SKILLS[id];
    if (!sk || this.dead) return;
    if (!this.learned.has(id)) { G.msg('You have not learned that skill.', 'warn'); return; }
    if (id === 'attack') {
      const t = this.target && !this.target.isNpc && !this.target.dead ? this.target : G.monsters.nearestTarget(this.pos, 12);
      if (!t) { G.msg('There is no target.', 'warn'); return; }
      this.attackTarget(t);
      return;
    }
    if (id === 'pickup') { G.loot.pickupNearest(this); return; }
    if (id === 'sit') { this.toggleSit(); return; }
    if ((this.cooldowns[id] || 0) > 0) { G.msg(`${sk.name} is not ready yet.`, 'warn'); G.audio.play('error'); return; }
    if (this.sp < sk.sp) { G.msg('Not enough SP.', 'warn'); G.audio.play('error'); return; }
    this.standUp();
    if (sk.kind === 'melee') {
      let t = this.target && !this.target.isNpc && !this.target.dead ? this.target : null;
      if (!t) t = G.monsters.nearestTarget(this.pos, sk.dash ? sk.range + 2 : 8);
      if (!t) { G.msg('There is no target.', 'warn'); G.audio.play('error'); return; }
      this.setTarget(t);
      this.autoAttack = true;
      this.pending = { kind: 'skill', id };
      return;
    }
    // self / aoe / buff skills cast immediately
    this.pending = { kind: 'skill', id };
  }

  castSkill(id) {
    const sk = SKILLS[id];
    if (this.anim.busy || this.gcd > 0) return false;
    if ((this.cooldowns[id] || 0) > 0 || this.sp < sk.sp) { this.pending = null; return false; }
    this.sp -= sk.sp;
    this.cooldowns[id] = sk.cd;
    this.gcd = GCD;
    this.inCombatT = 6;
    this.anim.battleTarget = 1;
    const t = this.target;
    if (t && sk.kind === 'melee') this.faceTowards(t.pos, true);
    G.audio.play(sk.kind === 'buff' ? 'buff' : id === 'provoke' ? 'shout' : 'swingBig');
    if (sk.kind === 'buff') G.fx.aura(this, sk.fx === 'buff_blue' ? '#6fb8ff' : sk.fx === 'buff_green' ? '#7dff8a' : '#ff5a4a', 1.2);
    let hitCount = 0;
    this.anim.play(sk.anim, {
      onEvent: (ev) => {
        if (ev !== 'hit') return;
        hitCount++;
        this.applySkill(id, sk, t, hitCount);
      },
    });
    this.swingColor = sk.fx === 'slash_orange' ? '#ffb055' : sk.fx === 'slash_red' ? '#ff5a4a' : sk.fx === 'slash_gold' ? '#ffe070' : sk.fx === 'whirl' ? '#bfe6ff' : null;
    this.pending = null;
    G.emit('stats');
    return true;
  }

  applySkill(id, sk, t, hitCount) {
    const fwd = new THREE.Vector3(Math.sin(this.rotY), 0, Math.cos(this.rotY));
    if (sk.kind === 'buff') {
      this.addBuff(sk.buff.id, sk.buff.dur, sk.buff);
      G.msg(`${sk.name} activated.`, 'skill');
      return;
    }
    if (id === 'provoke') {
      G.fx.warCry(this.pos);
      G.cam.addShake(0.4);
      for (const m of G.monsters.inRadius(this.pos, sk.aoe)) m.taunt(this);
      return;
    }
    if (sk.kind === 'aoe_self') {
      G.fx.whirl(this.pos);
      for (const m of G.monsters.inRadius(this.pos, sk.aoe)) this.dealDamage(m, sk);
      return;
    }
    if (!t || t.dead) return;
    if (sk.aoe) {
      const c = t.pos.clone();
      G.fx.shockwave(new THREE.Vector3(c.x, t.groundY, c.z));
      G.cam.addShake(0.7);
      G.audio.play('stomp');
      for (const m of G.monsters.inRadius(c, sk.aoe)) {
        this.dealDamage(m, sk);
        if (sk.debuff && !m.dead) m.addDebuff(sk.debuff.id, sk.debuff.dur, sk.debuff);
      }
      return;
    }
    const pos = this.pos.clone().addScaledVector(fwd, 1.2); pos.y += 1;
    if (sk.fx && sk.fx.startsWith('slash')) G.fx.slashArc(pos, this.rotY, this.swingColor || '#ffd27a', 3.2, id === 'armor_break' ? 1.2 : 0);
    const hit = this.dealDamage(t, sk);
    if (hit && sk.debuff && !t.dead) {
      t.addDebuff(sk.debuff.id, sk.debuff.dur, sk.debuff);
      if (sk.debuff.id === 'stun') G.msg(`${t.name} is stunned!`, 'skill');
    }
  }

  // returns true if hit; scale = damage factor for multi-hit swings
  dealDamage(m, sk = null, scale = 1) {
    if (!m || m.dead) return false;
    const st = this.stats;
    const hitChance = clamp(0.88 + (st.aim - m.stats.evasion) * 0.012, 0.55, 0.98);
    if (!sk && Math.random() > hitChance) {
      G.fx.text(m.headPos(), 'Miss', 'miss');
      G.audio.play('miss');
      m.onAttacked(this, 0);
      return false;
    }
    let base = st.atkMin + Math.random() * (st.atkMax - st.atkMin);
    if (sk) base = base * (sk.mult || 1) + (sk.flat || 0);
    let def = m.stats.def + (m.debuffDef || 0);
    let dmg = Math.max(1, base - def * 0.6) * this.dmgMult() * scale;
    const crit = Math.random() < st.crit;
    if (crit) dmg *= 1.6;
    dmg = Math.round(dmg * (0.92 + Math.random() * 0.16));
    m.takeDamage(dmg, this, crit);
    const hp = m.headPos(); hp.y -= 0.3;
    G.fx.text(hp, String(dmg), crit ? 'crit' : sk ? 'skill' : 'dmg');
    const sp = m.pos.clone(); sp.y = m.groundY + m.height * 0.5;
    G.fx.hitSpark(sp, crit ? '#ffb040' : '#fff2b0', crit || !!sk);
    G.audio.play(crit ? 'crit' : 'hit');
    if (crit) G.cam.addShake(0.35);
    return true;
  }

  takeDamage(dmg, from) {
    if (this.dead) return;
    const ev = this.stats.evasion;
    const aim = from.stats.aim;
    if (Math.random() > clamp(0.9 + (aim - ev) * 0.01, 0.5, 0.97)) {
      G.fx.text(this.headPos(), 'Miss', 'miss');
      return;
    }
    const def = this.stats.def;
    let d = Math.max(1, Math.round((dmg - def * 0.5) * (0.9 + Math.random() * 0.2)));
    this.hp -= d;
    this.inCombatT = 6;
    this.anim.battleTarget = 1;
    this.standUp();
    G.fx.text(this.headPos(), String(d), 'hurt');
    G.audio.play('hurt');
    if (!this.anim.busy) this.anim.play('hit');
    if (!this.target || this.target.dead) { if (!this.target) this.setTarget(from); }
    if (this.hp <= 0) this.die();
    G.emit('stats');
  }

  die() {
    this.hp = 0;
    this.dead = true;
    this.stopActions();
    this.setTarget(null);
    this.sitting = false; this.anim.sitTarget = 0;
    this.anim.die();
    G.msg('You have been knocked out!', 'warn');
    G.emit('death');
  }
  revive() {
    this.dead = false;
    this.anim.revive();
    this.hp = Math.round(this.stats.maxHp * 0.5);
    this.sp = Math.round(this.stats.maxSp * 0.5);
    const s = (G.world && G.world.spawn) || TOWN.spawn;
    this.teleport(s.x, s.z);
    G.fx.pillar(this.pos.clone(), '#ffffff', 1.4, 0.8, 7);
    G.emit('stats');
  }

  faceTowards(p, instant = false) {
    const a = Math.atan2(p.x - this.pos.x, p.z - this.pos.z);
    if (instant) this.rotY = a; else this.faceGoal = a;
  }

  // ---------------------------------------------------------------- movement
  moveTo(x, z) {
    if (this.dead) return;
    this.standUp();
    const path = G.nav.findPath(this.pos.x, this.pos.z, x, z);
    if (!path) { G.audio.play('error'); return false; }
    this.path = path;
    this.stuckT = 0;
    return true;
  }

  update(dt) {
    const input = G.input;
    // timers
    for (const k in this.cooldowns) if (this.cooldowns[k] > 0) this.cooldowns[k] = Math.max(0, this.cooldowns[k] - dt);
    this.gcd = Math.max(0, this.gcd - dt);
    this.attackTimer = Math.max(0, this.attackTimer - dt);
    this.inCombatT = Math.max(0, this.inCombatT - dt);
    if (this.inCombatT <= 0 && !this.autoAttack) this.anim.battleTarget = 0;
    this.updateBuffs(dt);
    this.updateRegen(dt);

    let moving = false;
    let speed = 0;
    const busy = this.anim.busy;

    if (!this.dead) {
      // --- keyboard movement (camera relative)
      let ix = 0, iz = 0;
      if (input.down('KeyW')) iz += 1;
      if (input.down('KeyS')) iz -= 1;
      if (input.down('KeyA')) ix -= 1;
      if (input.down('KeyD')) ix += 1;
      if (input.leftHeld && input.buttons.has(2)) iz = 1; // both mouse buttons = run forward
      if (input.wasPressed('KeyZ')) { this.running = !this.running; G.msg(this.running ? 'Run mode.' : 'Walk mode.'); }
      if (input.wasPressed('Space')) this.jump();

      const maxSpeed = this.running ? RUN_SPEED : WALK_SPEED;
      const slowed = this.buffs.some((b) => b.id === 'slowed') ? 0.6 : 1;
      if ((ix || iz) && !busy) {
        this.standUp();
        this.path = null;
        this.autoAttack = false;
        this.pending = this.pending && this.pending.kind === 'skill' && SKILLS[this.pending.id].kind !== 'melee' ? this.pending : null;
        const f = G.cam.forward(this._fwd);
        const rx = -f.z, rz = f.x; // right vector
        let dx = f.x * iz + rx * ix, dz = f.z * iz + rz * ix;
        const l = Math.hypot(dx, dz); dx /= l; dz /= l;
        const back = iz < 0 && ix === 0;
        speed = maxSpeed * (back ? 0.6 : 1) * slowed;
        this.tryMove(dx * speed * dt, dz * speed * dt);
        this.faceGoal = back ? Math.atan2(-dx, -dz) : Math.atan2(dx, dz);
        this.anim.moveDir = back ? -1 : 1;
        moving = true;
      } else this.anim.moveDir = 1;

      // --- pending interactions / auto attack
      if (!moving) {
        const t = this.target;
        if (this.pending && this.pending.kind === 'skill' && SKILLS[this.pending.id].kind !== 'melee') {
          this.castSkill(this.pending.id);
        } else if (this.pending && this.pending.kind === 'npc') {
          const npc = this.pending.npc;
          const d = Math.hypot(npc.pos.x - this.pos.x, npc.pos.z - this.pos.z);
          if (d < 2.8) { this.path = null; this.faceTowards(npc.pos, true); this.pending = null; G.npcs.interact(npc); }
          else if (!this.path || this.pathTimer <= 0) { this.moveTo(npc.pos.x, npc.pos.z); this.pathTimer = 0.6; }
        } else if (this.pending && this.pending.kind === 'portal') {
          // walk into the vortex, then travel
          const pt = this.pending.portal, r = pt.group.rotation.y;
          const fx = pt.pos.x + Math.sin(r) * 2.2, fz = pt.pos.z + Math.cos(r) * 2.2;
          if (Math.hypot(fx - this.pos.x, fz - this.pos.z) < 1.9) { this.path = null; this.pending = null; this.faceTowards(pt.pos, true); G.usePortal && G.usePortal(pt); }
          else if (!this.path) { if (!this.moveTo(fx, fz)) this.pending = null; }
        } else if (this.pending && this.pending.kind === 'loot') {
          const l = this.pending.loot;
          if (l.removed) this.pending = null;
          else if (Math.hypot(l.pos.x - this.pos.x, l.pos.z - this.pos.z) < 1.6) { this.path = null; this.pending = null; G.loot.pickup(l, this); }
          else if (!this.path) this.moveTo(l.pos.x, l.pos.z);
        } else if (this.autoAttack && t && !t.dead && !t.isNpc) {
          const d = Math.hypot(t.pos.x - this.pos.x, t.pos.z - this.pos.z);
          const sk = this.pending && this.pending.kind === 'skill' ? SKILLS[this.pending.id] : null;
          const range = sk && sk.range ? (sk.dash ? sk.range : this.radius + t.radius + sk.range * 0.6) : this.meleeRange(t);
          if (d > range) {
            this.pathTimer -= dt;
            if (!this.path || this.pathTimer <= 0) {
              // approach a point in front of the target
              const ax = t.pos.x - (t.pos.x - this.pos.x) / d * (range * 0.7), az = t.pos.z - (t.pos.z - this.pos.z) / d * (range * 0.7);
              if (!this.moveTo(ax, az)) this.moveTo(t.pos.x, t.pos.z);
              this.pathTimer = 0.35;
            }
          } else {
            this.path = null;
            this.faceGoal = Math.atan2(t.pos.x - this.pos.x, t.pos.z - this.pos.z);
            if (sk) this.castSkill(this.pending.id);
            else if (!busy && this.attackTimer <= 0 && this.gcd <= 0) this.basicAttack(t);
          }
        } else if (this.autoAttack && (!t || t.dead)) {
          this.autoAttack = false;
          this.pending = null;
        }
      }

      // --- path following
      if (!moving && this.path && !busy) {
        const wp = this.path[0];
        const dx = wp[0] - this.pos.x, dz = wp[1] - this.pos.z;
        const d = Math.hypot(dx, dz);
        const maxSpeedP = (this.running ? RUN_SPEED : WALK_SPEED) * slowed;
        if (d < 0.25) {
          this.path.shift();
          if (!this.path.length) this.path = null;
        } else {
          const step = Math.min(d, maxSpeedP * dt);
          const before = this.pos.clone();
          this.tryMove((dx / d) * step, (dz / d) * step);
          const moved = Math.hypot(this.pos.x - before.x, this.pos.z - before.z);
          if (moved < step * 0.2) { this.stuckT += dt; if (this.stuckT > 0.5) { this.path = null; this.stuckT = 0; } }
          else this.stuckT = 0;
          this.faceGoal = Math.atan2(dx, dz);
          speed = maxSpeedP;
          moving = true;
        }
      }

      // --- root motion from skills (leaps / lunges)
      const rd = this.anim.rootDelta;
      if (rd.lengthSq() > 0) {
        const s = Math.sin(this.rotY), c = Math.cos(this.rotY);
        let wx = rd.x * c + rd.z * s, wz = -rd.x * s + rd.z * c;
        // do not run through the target
        const t = this.target;
        if (t && !t.dead) {
          const d = Math.hypot(t.pos.x - this.pos.x, t.pos.z - this.pos.z);
          const minD = this.radius + t.radius + 0.6;
          const adv = wx * (t.pos.x - this.pos.x) / d + wz * (t.pos.z - this.pos.z) / d;
          if (d - adv < minD) { const k = Math.max(0, (d - minD) / Math.max(adv, 1e-4)); wx *= k; wz *= k; }
        }
        this.tryMove(wx, wz);
      }
    }

    // facing
    if (this.faceGoal !== undefined && !this.dead) this.rotY = dampAngle(this.rotY, this.faceGoal, 16, dt);

    // vertical: terrain + jump
    const gh = G.terrain.groundAt(this.pos.x, this.pos.z);
    if (this.airborne) {
      this.velY -= 18 * dt;
      this.jumpY += this.velY * dt;
      if (this.jumpY <= 0) { this.jumpY = 0; this.airborne = false; this.velY = 0; }
    }
    this.pos.y = gh + this.jumpY;

    // animation
    const target = moving ? clamp(speed / RUN_SPEED, 0.35, 1) : 0;
    this.anim.speed = this.anim.speed + (target - this.anim.speed) * (1 - Math.exp(-14 * dt));
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.rotY;
    this.anim.update(dt, this.pos);
    if (this.airborne) this.rig.body.position.y += 0; // body offset handled by pos

    // weapon trails (dual blades: one coloured trail per blade)
    bladeTime.value = G.time;
    const pushTrail = (trail, w) => {
      w.updateWorldMatrix(true, false);
      const base = w.userData.baseLocal.clone().applyMatrix4(w.matrixWorld);
      const tip = w.userData.tipLocal.clone().applyMatrix4(w.matrixWorld);
      trail.push(base, tip, this.anim.swordActive);
    };
    if (this.isDual() && this.dual) {
      if (this.trail) pushTrail(this.trail, this.dual.right);
      if (this.trailL) pushTrail(this.trailL, this.dual.left);
    } else {
      const w = this.rig.weapon;
      if (w && this.trail) {
        pushTrail(this.trail, w);
        if (this.anim.swordActive && this.swingColor) this.trail.setColor(this.swingColor);
        else if (!this.anim.swordActive) this.trail.setColor((ITEMS[this.equipment.weapon]?.look?.rune) || '#fff4c8');
      }
      if (this.trailL) this.trailL.push(this.pos, this.pos, false);   // let a leftover off-hand trail fade out
    }
  }

  jump() {
    if (this.airborne || this.anim.busy || this.sitting || this.dead) return;
    this.airborne = true;
    this.velY = 6.2;
    G.audio.play('jump');
  }

  tryMove(dx, dz) {
    const nx = this.pos.x + dx, nz = this.pos.z + dz;
    const ok = (x, z) => G.nav.isWalkable(x, z);
    let tx = nx, tz = nz;
    if (!ok(tx, tz)) {
      if (ok(nx, this.pos.z)) tz = this.pos.z;
      else if (ok(this.pos.x, nz)) tx = this.pos.x;
      else return;
    }
    const r = G.colliders.resolve(tx, tz, this.radius);
    if (!ok(r.x, r.z)) return;
    this.pos.x = r.x; this.pos.z = r.z;
  }

  basicAttack(t) {
    const dual = this.isDual();
    // sword: 3-hit combo; dual blades: faster 4-hit combo (hits 3 and 4 strike twice for a bit less each)
    const n = dual ? 4 : 3;
    this.comboIdx = (this.comboIdx % n) + 1;
    const clip = (dual ? 'dual_attack' : 'attack') + this.comboIdx;
    const perHit = dual ? (this.comboIdx >= 3 ? 0.62 : 0.85) : 1;
    this.attackTimer = dual ? [0, 0.44, 0.44, 0.6, 0.8][this.comboIdx] - Math.min(0.12, this.stats.aim * 0.002) : 1.05 - Math.min(0.3, this.stats.aim * 0.004);
    this.inCombatT = 6;
    this.anim.battleTarget = 1;
    this.swingColor = null;
    G.audio.play(dual && this.comboIdx === 4 ? 'swingBig' : 'swing');
    this.anim.play(clip, {
      speed: dual ? 1.05 : 1.1,
      onEvent: (ev) => {
        if (ev === 'hit' && t && !t.dead) {
          const d = Math.hypot(t.pos.x - this.pos.x, t.pos.z - this.pos.z);
          if (d < this.meleeRange(t) + 0.8) this.dealDamage(t, null, perHit);
          if (dual) this.bladeSparks(t);
        }
      },
    });
  }
  // coloured sparks from both blades on impact
  bladeSparks(t) {
    if (!this.dual || !G.fx) return;
    const p = t.pos.clone(); p.y = t.groundY + t.height * 0.55;
    for (const [col, side] of [[this.dual.right.userData.color, -1], [this.dual.left.userData.color, 1]]) {
      for (let i = 0; i < 7; i++) {
        const a = Math.random() * Math.PI * 2;
        G.fx.particles.emit({ x: p.x + side * 0.15, y: p.y, z: p.z, vx: Math.cos(a) * 3, vy: 1 + Math.random() * 2.5, vz: Math.sin(a) * 3, life: 0.45, size: 0.22, color: col, grav: 6, drag: 1.5 });
      }
    }
  }

  updateBuffs(dt) {
    let changed = false;
    for (let i = this.buffs.length - 1; i >= 0; i--) {
      const b = this.buffs[i];
      b.t -= dt;
      if (b.data.regenPct) this.hp = Math.min(this.stats.maxHp, this.hp + (this.stats.maxHp * b.data.regenPct / b.dur) * dt);
      if (b.data.regenFlat) this.hp = Math.min(this.stats.maxHp, this.hp + b.data.regenFlat * dt);
      if (b.t <= 0) { this.buffs.splice(i, 1); changed = true; }
    }
    if (changed) { this.recalc(); G.emit('buffs'); }
  }

  updateRegen(dt) {
    if (this.dead) return;
    this.regenT += dt;
    if (this.regenT < 1) return;
    this.regenT -= 1;
    const mult = (this.sitting ? 4 : 1) * (this.inCombatT > 0 ? 0.5 : 1.5);
    this.hp = Math.min(this.stats.maxHp, this.hp + this.stats.hpRegen * mult + (this.sitting ? this.stats.maxHp * 0.03 : 0));
    this.sp = Math.min(this.stats.maxSp, this.sp + this.stats.spRegen * mult + (this.sitting ? this.stats.maxSp * 0.04 : 0));
    G.emit('stats');
  }

  // ---------------------------------------------------------------- save / load
  save() {
    try {
      const data = {
        name: this.name, level: this.level, exp: this.exp, statPoints: this.statPoints, alloc: this.alloc, money: this.money,
        stones: this.stones, inventory: this.inventory, equipment: this.equipment, learned: [...this.learned], skillbar: this.skillbar,
        hp: this.hp, sp: this.sp, pos: [this.pos.x, this.pos.z], quests: G.quests ? G.quests.serialize() : null, title: this.title,
        world: G.world ? G.world.id : 'roumen', rotY: this.rotY, flags: this.flags,
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch { /* storage unavailable */ }
  }
  load() {
    let data = null;
    try { data = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch { data = null; }
    if (!data) return false;
    Object.assign(this, {
      name: data.name || this.name, level: data.level, exp: data.exp, statPoints: data.statPoints, alloc: data.alloc, money: data.money,
      stones: data.stones, inventory: data.inventory, equipment: data.equipment, skillbar: data.skillbar, title: data.title || this.title,
    });
    this.learned = new Set(data.learned);
    this.recalc();
    this.hp = Math.min(data.hp || this.stats.maxHp, this.stats.maxHp);
    this.sp = Math.min(data.sp || this.stats.maxSp, this.stats.maxSp);
    if (data.pos) this.pos.set(data.pos[0], 0, data.pos[1]);
    if (typeof data.rotY === 'number') this.rotY = data.rotY;
    this.flags = data.flags || {};
    this._savedWorld = data.world || 'roumen';
    this._savedQuests = data.quests;
    return true;
  }
  static clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ } }
}

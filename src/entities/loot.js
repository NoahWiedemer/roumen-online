// Ground loot: item pouches and coin piles dropped by monsters
import * as THREE from 'three';
import { ITEMS, MONSTERS } from '../game/data.js';
import { G } from '../game/game.js';
import { tex } from '../core/textures.js';
import { formatMoney } from '../core/utils.js';

let shared = null;
function sharedAssets() {
  if (shared) return shared;
  const bagMat = new THREE.MeshStandardMaterial({ color: '#9c6a3c', roughness: 0.8 });
  const tieMat = new THREE.MeshStandardMaterial({ color: '#e8c35a', roughness: 0.35, metalness: 0.8 });
  const coinMat = new THREE.MeshStandardMaterial({ color: '#f0c24a', roughness: 0.3, metalness: 0.9, emissive: '#5a3a00', emissiveIntensity: 0.3 });
  const bag = new THREE.SphereGeometry(0.22, 16, 12); bag.scale(1, 0.9, 1);
  const neck = new THREE.CylinderGeometry(0.06, 0.1, 0.12, 12);
  const tie = new THREE.TorusGeometry(0.075, 0.018, 6, 14);
  const coin = new THREE.CylinderGeometry(0.1, 0.1, 0.025, 16);
  shared = { bagMat, tieMat, coinMat, bag, neck, tie, coin };
  return shared;
}

const RARITY_COL = { consumable: '#ff8a8a', material: '#d8d8d8', weapon: '#ffd060', armor: '#7fd0ff', helm: '#7fd0ff', pants: '#7fd0ff', boots: '#7fd0ff', gloves: '#7fd0ff', ring: '#d49aff', necklace: '#d49aff', earring: '#d49aff' };

export class LootManager {
  constructor() { this.list = []; }

  dropFrom(monster) {
    const def = MONSTERS[monster.type];
    const center = monster.pos;
    const drops = [];
    const copper = Math.round(def.copper[0] + Math.random() * (def.copper[1] - def.copper[0]));
    if (Math.random() < 0.85) drops.push({ kind: 'money', n: copper });
    for (const [id, chance] of def.drops) if (Math.random() < chance) drops.push({ kind: 'item', id, n: 1 });
    drops.forEach((d, i) => {
      const a = (i / Math.max(1, drops.length)) * Math.PI * 2 + Math.random();
      const r = drops.length > 1 ? 0.7 + Math.random() * 0.4 : 0.3;
      this.spawn(d, center.x + Math.cos(a) * r, center.z + Math.sin(a) * r, center);
    });
  }

  spawn(d, x, z, from) {
    const S = sharedAssets();
    const g = new THREE.Group();
    if (d.kind === 'money') {
      const n = Math.min(6, 2 + Math.floor(d.n / 20));
      for (let i = 0; i < n; i++) {
        const c = new THREE.Mesh(S.coin, S.coinMat);
        c.position.set((Math.random() - 0.5) * 0.18, 0.02 + i * 0.028, (Math.random() - 0.5) * 0.18);
        c.rotation.set((Math.random() - 0.5) * 0.3, 0, (Math.random() - 0.5) * 0.3);
        c.castShadow = true;
        g.add(c);
      }
    } else {
      const bag = new THREE.Mesh(S.bag, S.bagMat); bag.position.y = 0.2; bag.castShadow = true; g.add(bag);
      const neck = new THREE.Mesh(S.neck, S.bagMat); neck.position.y = 0.4; g.add(neck);
      const tie = new THREE.Mesh(S.tie, S.tieMat); tie.position.y = 0.38; tie.rotation.x = Math.PI / 2; g.add(tie);
    }
    const col = d.kind === 'money' ? '#ffd24a' : (RARITY_COL[ITEMS[d.id].type] || '#ffffff');
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex('glow'), color: new THREE.Color(col), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55 }));
    glow.scale.setScalar(1.1);
    glow.position.y = 0.25;
    g.add(glow);
    const y = G.terrain.groundAt(x, z);
    g.position.set(from.x, from.y + 1, from.z);
    G.scene.add(g);
    const loot = { ...d, mesh: g, glow, pos: new THREE.Vector3(x, y, z), from: from.clone(), t: 0, removed: false, radius: 0.4, color: col, isLoot: true };
    loot.label = d.kind === 'money' ? moneyText(d.n) : ITEMS[d.id].name;
    this.list.push(loot);
    return loot;
  }

  pickupNearest(player) {
    let best = null, bd = 3.5;
    for (const l of this.list) {
      const d = Math.hypot(l.pos.x - player.pos.x, l.pos.z - player.pos.z);
      if (d < bd) { bd = d; best = l; }
    }
    if (!best) {
      // walk to a nearby one if within 12m
      let far = null, fd = 12;
      for (const l of this.list) { const d = Math.hypot(l.pos.x - player.pos.x, l.pos.z - player.pos.z); if (d < fd) { fd = d; far = l; } }
      if (far) { player.pending = { kind: 'loot', loot: far }; player.moveTo(far.pos.x, far.pos.z); }
      else G.msg('There is nothing to pick up.', 'warn');
      return;
    }
    this.pickup(best, player);
  }

  pickup(l, player) {
    if (l.removed) return;
    if (l.kind === 'money') {
      player.money += l.n;
      G.msg(`Obtained ${moneyText(l.n)}.`, 'loot');
      G.audio.play('coin');
    } else {
      const left = player.addItem(l.id, l.n);
      if (left > 0) return;
      G.msg(`Obtained ${ITEMS[l.id].name}.`, 'loot');
      G.audio.play('pickup');
      G.emit('itemGained', l.id);
    }
    if (!player.anim.busy && !player.sitting) player.anim.play('pickup');
    G.fx.healSparkle(l.pos, l.color);
    this.remove(l);
    G.emit('inventory');
  }

  remove(l) {
    l.removed = true;
    G.scene.remove(l.mesh);
    l.glow.material.dispose();
    this.list.splice(this.list.indexOf(l), 1);
  }

  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const l = this.list[i];
      l.t += dt;
      const k = Math.min(1, l.t / 0.45);
      // arc from the monster to the ground
      const x = l.from.x + (l.pos.x - l.from.x) * k, z = l.from.z + (l.pos.z - l.from.z) * k;
      const y = l.from.y + 1 + (l.pos.y - l.from.y - 1) * k + Math.sin(k * Math.PI) * 1.2;
      l.mesh.position.set(x, k < 1 ? y : l.pos.y + Math.sin(l.t * 2.5) * 0.03, z);
      l.mesh.rotation.y += dt * 0.8;
      l.glow.material.opacity = 0.35 + Math.sin(l.t * 4) * 0.15;
      if (Math.random() < dt * 1.5) G.fx.particles.emit({ x: l.pos.x + (Math.random() - 0.5) * 0.4, y: l.pos.y + 0.3, z: l.pos.z + (Math.random() - 0.5) * 0.4, vy: 0.8, life: 0.8, size: 0.18, color: new THREE.Color(l.color), grav: 0 });
      if (l.t > 90) this.remove(l);
    }
  }
}

export function moneyText(copper) {
  const m = formatMoney(copper);
  const parts = [];
  if (m.gem) parts.push(`${m.gem} Gem`);
  if (m.gold) parts.push(`${m.gold} Gold`);
  if (m.silver) parts.push(`${m.silver} Silver`);
  if (m.copper || !parts.length) parts.push(`${m.copper} Copper`);
  return parts.join(' ');
}

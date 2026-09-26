// Draggable game windows, NPC dialogs, shops, tooltips and drag & drop
import { G } from '../game/game.js';
import { skillIcon, itemIcon, menuIcon } from './icons.js';
import {
  SKILLS, SKILL_ORDER, ITEMS, EQUIP_SLOTS, EQUIP_SLOT_NAMES, STAT_NAMES, EXP_TABLE, QUESTS, STARTING,
} from '../game/data.js';
import { formatMoney } from '../core/utils.js';
import { moneyText } from '../entities/loot.js';
import { MOUNTS } from '../entities/mounts.js';
import { WORLD, TOWN } from '../world/layout.js';

const el = (tag, cls, parent, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  if (parent) parent.appendChild(e);
  return e;
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function moneyHtml(copper) {
  const m = formatMoney(copper);
  return `<span class="gem"><i></i>${m.gem}</span><span class="gold"><i></i>${m.gold}</span><span class="silver"><i></i>${m.silver}</span><span class="copper"><i></i>${m.copper}</span>`;
}

const DEFS = {
  character: { title: 'Character Info', icon: 'character', w: 290, x: 60, y: 130 },
  inventory: { title: 'Inventory', icon: 'inventory', w: 300, x: -318, y: 236 },
  skills: { title: 'Skills', icon: 'skills', w: 340, x: 360, y: 120 },
  quests: { title: 'Quest Log', icon: 'quests', w: 380, x: 380, y: 130 },
  map: { title: 'Area Map', icon: 'map', w: 560, x: 'c', y: 70 },
  options: { title: 'Options', icon: 'options', w: 320, x: 'c', y: 140 },
  help: { title: 'Help', icon: 'help', w: 360, x: 'c', y: 110 },
  community: { title: 'Community', icon: 'community', w: 280, x: 'c', y: 160 },
  store: { title: 'Store', icon: 'store', w: 300, x: 'c', y: 160 },
  actions: { title: 'Actions', icon: 'actions', w: 260, x: 'c', y: 200 },
  npc: { title: 'NPC', icon: 'quests', w: 380, x: 'c', y: 150 },
  shop: { title: 'Shop', icon: 'shop', w: 330, x: 90, y: 110 },
  skillmaster: { title: 'Skill Master', icon: 'skills', w: 380, x: 90, y: 110 },
  stash: { title: 'Raccoon Stash', icon: 'cheat', w: 372, x: 60, y: 90 },
};
// Raccoon Stash tabs (cheat): every item of the game, grouped
const STASH_TABS = [
  ['All', () => true], ['Weapons', (it) => it.type === 'weapon'], ['Armor', (it) => ['armor', 'helm', 'pants', 'boots', 'gloves'].includes(it.type)],
  ['Jewels', (it) => ['ring', 'necklace', 'earring'].includes(it.type)], ['Items', (it) => ['consumable', 'mount'].includes(it.type)], ['Loot', (it) => it.type === 'material'],
];

export class Windows {
  constructor(hud) {
    this.hud = hud;
    this.wins = {};
    this.invPage = 0;
    this.selQuest = null;
    this.drag = null;
    this.ghost = el('div', 'hidden', document.body, '<img>'); this.ghost.id = 'drag-ghost';
    this.portraitUrl = '';
    G.on('inventory', () => { this.refresh('inventory'); this.refresh('character'); this.refresh('shop'); this.refresh('quests'); });
    G.on('stats', () => { this._statsDirty = true; });
    G.on('quests', () => { this.refresh('quests'); if (this.npc) this.refresh('npc'); });
    G.on('levelup', () => { this.refresh('skills'); this.refresh('skillmaster'); this.refresh('character'); });
    G.on('npcInteract', (npc) => this.openNpc(npc));
    this.setupTooltips();
    document.addEventListener('pointermove', (e) => this.onDragMove(e));
    document.addEventListener('pointerup', (e) => this.onDragEnd(e));
  }
  setPortrait(url) { this.portraitUrl = url; this.refresh('character'); }

  // ---------------------------------------------------------------- window frame
  get(name) {
    if (this.wins[name]) return this.wins[name];
    const d = DEFS[name];
    const w = el('div', 'win hidden', document.getElementById('hud'));
    w.style.width = d.w + 'px';
    const title = el('div', 'wtitle', w, d.title);
    el('div', 'wbadge', w, `<img src="${menuIcon(d.icon, 64)}">`);
    const close = el('button', 'wclose', w, '✕');
    close.onclick = () => this.close(name);
    const body = el('div', 'wbody', w);
    const x = d.x === 'c' ? (window.innerWidth - d.w) / 2 : d.x < 0 ? window.innerWidth + d.x : d.x;
    w.style.left = Math.max(10, x) + 'px';
    w.style.top = d.y + 'px';
    // drag window by title
    title.addEventListener('pointerdown', (e) => {
      const sx = e.clientX, sy = e.clientY, ox = w.offsetLeft, oy = w.offsetTop;
      const mv = (ev) => { w.style.left = ox + ev.clientX - sx + 'px'; w.style.top = Math.max(0, oy + ev.clientY - sy) + 'px'; };
      const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
      window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
      this.front(w);
    });
    w.addEventListener('pointerdown', () => this.front(w));
    this.wins[name] = { el: w, body, title, name };
    return this.wins[name];
  }
  front(w) { this._z = (this._z || 20) + 1; w.style.zIndex = this._z; }
  isOpen(name) { return this.wins[name] && !this.wins[name].el.classList.contains('hidden'); }
  open(name) {
    const w = this.get(name);
    w.el.classList.remove('hidden');
    this.front(w.el);
    this.render(name);
    G.audio.play('open');
    this.hud.menuIcons[name]?.classList.add('active');
  }
  close(name) {
    const w = this.wins[name];
    if (!w || w.el.classList.contains('hidden')) return false;
    w.el.classList.add('hidden');
    G.audio.play('close');
    this.hud.menuIcons[name]?.classList.remove('active');
    if (name === 'npc') { this.npc = null; this.close('shop'); this.close('skillmaster'); this.showArt(null); }
    if (name === 'shop') this.shopNpc = null;
    this.hideTip();
    return true;
  }
  toggle(name) { if (this.isOpen(name)) this.close(name); else this.open(name); }
  closeTop() {
    let best = null, bz = -1;
    for (const w of Object.values(this.wins)) {
      if (w.el.classList.contains('hidden')) continue;
      const z = Number(w.el.style.zIndex || 0);
      if (z > bz) { bz = z; best = w; }
    }
    if (best) { this.close(best.name); return true; }
    return false;
  }
  refresh(name) { if (this.isOpen(name)) this.render(name); }
  render(name) {
    const w = this.get(name);
    const fn = this['render_' + name];
    if (fn) fn.call(this, w.body, w);
  }
  update() {
    if (this._statsDirty) { this._statsDirty = false; this.refresh('character'); }
    // hide tooltips whose element was re-rendered away
    if (this.tipTarget && !this.tipTarget.isConnected) { this.tipTarget = null; this.hideTip(); }
  }

  // ---------------------------------------------------------------- drag & drop
  makeDraggable(node, getEntry, extra = {}) {
    node.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const entry = typeof getEntry === 'function' ? getEntry() : getEntry;
      if (!entry) return;
      this.drag = { entry, extra, sx: e.clientX, sy: e.clientY, started: false, node };
    });
  }
  makeDropTarget(node, fn) { node._drop = fn; }
  onDragMove(e) {
    const d = this.drag;
    if (!d) return;
    if (!d.started && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 5) {
      d.started = true;
      this.ghost.querySelector('img').src = d.entry.icon || (d.entry.type === 'item' ? itemIcon(ITEMS[d.entry.id].icon, 64) : skillIcon(SKILLS[d.entry.id].icon, 64));
      this.ghost.classList.remove('hidden');
      this.hideTip();
    }
    if (d.started) { this.ghost.style.left = e.clientX + 'px'; this.ghost.style.top = e.clientY + 'px'; }
  }
  onDragEnd(e) {
    const d = this.drag;
    this.drag = null;
    if (!d || !d.started) return;
    this.ghost.classList.add('hidden');
    d.node._suppressClick = true;
    setTimeout(() => { d.node._suppressClick = false; }, 50);
    let t = document.elementFromPoint(e.clientX, e.clientY);
    while (t && !t._drop) t = t.parentElement;
    if (t && t._drop) { t._drop({ entry: d.entry, ...d.extra }); return; }
    // dropped outside: remove from skill bar
    if (d.extra.fromBar) {
      const [r, i] = d.extra.fromBar;
      G.player.skillbar[this.hud.barIndex(r, i)] = null;
      this.hud.renderSkillbars();
    }
  }

  // ---------------------------------------------------------------- tooltips
  setupTooltips() {
    const tip = () => this.hud.tooltip;
    document.addEventListener('pointerover', (e) => {
      let t = e.target;
      while (t && !t._tip) t = t.parentElement;
      if (!t || this.drag) { this.hideTip(); return; }
      const html = t._tip();
      if (!html) { this.hideTip(); return; }
      tip().innerHTML = html;
      tip().classList.remove('hidden');
      this.tipTarget = t;
      this.placeTip(e.clientX, e.clientY);
    });
    document.addEventListener('pointermove', (e) => {
      if (tip().classList.contains('hidden')) return;
      this.placeTip(e.clientX, e.clientY);
    });
  }
  placeTip(cx, cy) {
    const tip = this.hud.tooltip;
    const r = tip.getBoundingClientRect();
    let x = cx + 16, y = cy + 16;
    if (x + r.width > window.innerWidth - 6) x = cx - r.width - 12;
    if (y + r.height > window.innerHeight - 6) y = cy - r.height - 12;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  }
  hideTip() { this.hud.tooltip.classList.add('hidden'); }
  entryTip(e) {
    if (!e) return '';
    return e.type === 'item' ? this.itemTip(e.id) : this.skillTip(e.id);
  }
  itemTip(id, { price = null, sell = false } = {}) {
    const it = ITEMS[id];
    if (!it) return '';
    const typeName = { consumable: 'Consumable', material: 'Material', weapon: it.weaponClass === 'dual' ? 'Dual Blades' : 'One-Handed Sword', armor: 'Armor', helm: 'Helmet', pants: 'Pants', boots: 'Boots', gloves: 'Gloves', ring: 'Ring', necklace: 'Necklace', earring: 'Earring', mount: 'Mount' }[it.type] || it.type;
    const col = { weapon: '#ffd060', armor: '#7fd0ff', helm: '#7fd0ff', pants: '#7fd0ff', boots: '#7fd0ff', gloves: '#7fd0ff', ring: '#d49aff', necklace: '#d49aff', earring: '#d49aff', mount: '#8cff9a' }[it.type] || '#ffffff';
    let s = `<div class="tt-name" style="color:${col}">${esc(it.name)}</div><div class="tt-type">${typeName}</div>`;
    if (it.mount) s += `<div class="tt-stat">Riding speed +${Math.round((MOUNTS[it.mount].speed / 6.2 - 1) * 100)}%</div>`;
    if (it.atk) s += `<div class="tt-stat">Attack ${it.atk[0]} ~ ${it.atk[1]}</div>`;
    if (it.def) s += `<div class="tt-stat">Defense +${it.def}</div>`;
    if (it.guard) s += '<div class="tt-stat">Defense ∞ (you take no damage)</div>';
    for (const k of ['str', 'end', 'dex', 'int', 'spr', 'hp', 'sp']) if (it[k]) s += `<div class="tt-stat">${k === 'hp' ? 'Max HP' : k === 'sp' ? 'Max SP' : STAT_NAMES[k]} +${it[k]}</div>`;
    if (it.lv && it.lv > 1) s += `<div class="${G.player.level >= it.lv ? 'tt-type' : 'tt-req'}">Required level: ${it.lv}</div>`;
    if (it.desc) s += `<div class="tt-desc">${esc(it.desc)}</div>`;
    if (price !== null) s += `<div class="tt-price">${sell ? 'Sell price' : 'Price'}: ${moneyText(price)}</div>`;
    return s;
  }
  skillTip(id) {
    const sk = SKILLS[id];
    if (!sk) return '';
    let s = `<div class="tt-name" style="color:#ffe070">${esc(sk.name)}</div>`;
    if (sk.level > 1) s += `<div class="tt-type">Required level ${sk.level}</div>`;
    const parts = [];
    if (sk.sp) parts.push(`SP ${sk.sp}`);
    if (sk.cd) parts.push(`Cooldown ${sk.cd}s`);
    if (sk.range && sk.kind === 'melee') parts.push(`Range ${sk.dash ? sk.range + 'm' : 'melee'}`);
    if (parts.length) s += `<div class="tt-stat">${parts.join(' · ')}</div>`;
    s += `<div class="tt-desc">${esc(sk.desc)}</div>`;
    if (!G.player.learned.has(id)) s += `<div class="tt-req">Not learned — visit the Skill Master.</div>`;
    return s;
  }

  // ---------------------------------------------------------------- inventory
  render_inventory(body) {
    const p = G.player;
    body.innerHTML = '';
    const eq = el('div', 'inv-equip', body);
    eq.innerHTML = `<svg class="silhouette" viewBox="0 0 110 176"><g fill="rgba(160,190,240,0.18)" stroke="rgba(200,220,255,0.35)" stroke-width="1.5">
      <circle cx="55" cy="30" r="24"/><path d="M32 60 Q55 50 78 60 L84 110 Q55 118 26 110 Z"/><path d="M26 64 L12 104 L20 108 L32 76Z"/><path d="M84 64 L98 104 L90 108 L78 76Z"/>
      <path d="M34 112 L40 168 L53 168 L55 120 L57 168 L70 168 L76 112Z"/></g></svg>`;
    const pos = { helm: [6, 6], necklace: [6, 60], earring: [6, 114], weapon: [224, 6], armor: [224, 60], gloves: [224, 114], ring: [48, 140], pants: [182, 140], boots: [115, 140] };
    for (const slot of EQUIP_SLOTS) {
      const [x, y] = pos[slot];
      const wrap = el('div', 'eslot', eq);
      wrap.style.left = x + 'px'; wrap.style.top = y + 'px';
      const s = el('div', 'slot', wrap);
      const id = p.equipment[slot];
      if (id) s.innerHTML = `<img src="${itemIcon(ITEMS[id].icon, 64)}">`;
      else el('div', 'lbl', wrap, EQUIP_SLOT_NAMES[slot]);
      s._tip = () => id ? this.itemTip(id) + '<div class="tt-type">Right-click to unequip</div>' : `<div class="tt-type">${EQUIP_SLOT_NAMES[slot]}</div>`;
      s.addEventListener('contextmenu', (e) => { e.preventDefault(); p.unequip(slot); });
      s.addEventListener('dblclick', () => p.unequip(slot));
      this.makeDropTarget(s, (pl) => { if (pl.invIndex !== undefined && ITEMS[pl.entry.id].type === slot) p.equipFromSlot(pl.invIndex); });
    }
    const tabs = el('div', 'inv-tabs', body);
    for (let i = 0; i < 2; i++) {
      const b = el('button', this.invPage === i ? 'on' : '', tabs, String(i + 1));
      b.onclick = () => { this.invPage = i; this.render('inventory'); };
    }
    const grid = el('div', 'inv-grid', body);
    for (let k = 0; k < 24; k++) {
      const idx = this.invPage * 24 + k;
      const s = el('div', 'slot', grid);
      const it = p.inventory[idx];
      if (it) {
        s.innerHTML = `<img src="${itemIcon(ITEMS[it.id].icon, 64)}">${it.n > 1 ? `<span class="count">${it.n}</span>` : ''}`;
        const def = ITEMS[it.id];
        if (def.lv && def.lv > p.level) s.classList.add('disabled');
      }
      s._tip = () => {
        const cur = p.inventory[idx];
        if (!cur) return '';
        const def = ITEMS[cur.id];
        const hint = this.shopNpc ? (def.type === 'mount' ? '' : '<div class="tt-type">Right-click to sell</div>') : def.type === 'consumable' ? '<div class="tt-type">Right-click to use</div>' : def.type === 'mount' ? '<div class="tt-type">Right-click to ride / dismount</div>' : def.type !== 'material' ? '<div class="tt-type">Right-click to equip</div>' : '';
        return this.itemTip(cur.id, this.shopNpc && def.type !== 'mount' ? { price: Math.max(1, Math.floor(def.price * 0.3)) * cur.n, sell: true } : {}) + hint;
      };
      s.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const cur = p.inventory[idx];
        if (!cur) return;
        if (this.shopNpc) this.sellSlot(idx);
        else p.useInventorySlot(idx);
      });
      s.addEventListener('dblclick', () => { if (!this.shopNpc) p.useInventorySlot(idx); });
      this.makeDraggable(s, () => p.inventory[idx] ? { type: 'item', id: p.inventory[idx].id } : null, { invIndex: idx });
      this.makeDropTarget(s, (pl) => {
        if (pl.invIndex !== undefined && pl.invIndex !== idx) {
          const a = p.inventory[pl.invIndex], b = p.inventory[idx];
          if (a && b && a.id === b.id && ITEMS[a.id].stack > 1) {
            const room = ITEMS[a.id].stack - b.n, mv = Math.min(room, a.n);
            b.n += mv; a.n -= mv; if (a.n <= 0) p.inventory[pl.invIndex] = null;
          } else { p.inventory[idx] = a; p.inventory[pl.invIndex] = b; }
          G.emit('inventory');
        }
      });
    }
    el('div', 'money', body, moneyHtml(p.money));
    // raccoon cheat: a field that opens the stash of every item
    if (p.cheat) {
      const st = el('div', 'slot stash-slot interactive', tabs, `<img src="${menuIcon('cheat', 64)}">`);
      st._tip = () => '<div class="tt-name" style="color:#8ad0ff">Raccoon Stash</div><div class="tt-desc">Every item of the game. Click to open.</div>';
      st.onclick = () => this.toggle('stash');
    }
  }

  // ---------------------------------------------------------------- raccoon stash (cheat)
  render_stash(body) {
    const p = G.player;
    body.innerHTML = '';
    if (!p.cheat) { el('div', 'tt-type', body, 'Switch on the raccoon cheat (menu bar) first.'); return; }
    el('div', 'tt-type', body, 'Click: take one · Shift+click: take a full stack. The items stay when the cheat is switched off.').style.marginBottom = '6px';
    const tabs = el('div', 'stash-tabs', body);
    this.stashTab = this.stashTab || 0;
    STASH_TABS.forEach(([name], i) => {
      const b = el('button', this.stashTab === i ? 'on' : '', tabs, name);
      b.onclick = () => { this.stashTab = i; this.render('stash'); };
    });
    const grid = el('div', 'stash-grid', body);
    const filter = STASH_TABS[this.stashTab][1];
    for (const [id, it] of Object.entries(ITEMS)) {
      if (!filter(it)) continue;
      const s = el('div', 'slot', grid, `<img src="${itemIcon(it.icon, 64)}">`);
      s._tip = () => this.itemTip(id) + '<div class="tt-type">Click: take one · Shift+click: a stack</div>';
      s.onclick = (e) => {
        const n = e.shiftKey ? it.stack || 1 : 1;
        const left = p.addItem(id, n);
        if (left < n) { G.audio.play('pickup'); G.msg(`Raccoon Stash: ${it.name}${n - left > 1 ? ' x' + (n - left) : ''}.`, 'loot'); p.save(); }
      };
    }
  }
  sellSlot(idx) {
    const p = G.player;
    const cur = p.inventory[idx];
    if (!cur) return;
    const def = ITEMS[cur.id];
    if (def.type === 'mount') { G.msg('You would never sell your trusty companion!', 'warn'); G.audio.play('error'); return; }
    const price = Math.max(1, Math.floor(def.price * 0.3)) * cur.n;
    p.inventory[idx] = null;
    p.money += price;
    G.msg(`Sold ${def.name}${cur.n > 1 ? ' x' + cur.n : ''} for ${moneyText(price)}.`, 'loot');
    G.audio.play('coin');
    G.emit('inventory');
  }

  // ---------------------------------------------------------------- character
  render_character(body) {
    const p = G.player;
    const base = p.baseStats(), tot = p.totalStats(), st = p.stats;
    const need = EXP_TABLE[p.level] || 1;
    body.innerHTML = `<div class="char-top"><div class="cport"><img src="${this.portraitUrl}"></div>
      <div><div class="cname">${esc(p.name)}</div><div class="cclass">Lv. ${p.level} Fighter</div><div class="tt-type">EXP ${p.exp} / ${need}</div></div></div>`;
    const sec = el('div', 'section', body);
    el('h4', '', sec, `Stats ${p.statPoints > 0 ? `<span style="color:#7dff6a;text-transform:none">(${p.statPoints} point${p.statPoints > 1 ? 's' : ''} to spend)</span>` : ''}`);
    const g = el('div', 'stat-grid', sec);
    for (const k of ['str', 'end', 'dex', 'int', 'spr']) {
      el('div', 'lbl', g, STAT_NAMES[k]);
      const bonus = tot[k] - base[k];
      el('div', 'val', g, `${tot[k]}${bonus ? ` <span class="bonus">(+${bonus})</span>` : ''}`);
      const cell = el('div', '', g);
      if (p.statPoints > 0) { const b = el('button', 'plus', cell, '+'); b.onclick = () => p.allocate(k); }
    }
    const sec2 = el('div', 'section', body);
    sec2.style.marginTop = '8px';
    el('h4', '', sec2, 'Combat');
    const d = el('div', 'derived', sec2);
    const rows = [['HP', `${Math.round(p.hp)} / ${st.maxHp}`], ['SP', `${Math.round(p.sp)} / ${st.maxSp}`], ['Attack', `${st.atkMin} ~ ${st.atkMax}`], ['Defense', st.def], ['Magic Def.', st.mdef], ['Aim', st.aim], ['Evasion', st.evasion], ['Critical', (st.crit * 100).toFixed(1) + '%']];
    for (const [a, b] of rows) { el('div', 'lbl', d, a); el('div', 'val', d, b); }
  }

  // ---------------------------------------------------------------- skills
  render_skills(body) {
    const p = G.player;
    body.innerHTML = '<div class="tt-type" style="margin-bottom:6px">Drag skills onto your skill bar. New skills are taught by the Skill Master in Roumen.</div>';
    const list = el('div', 'list', body);
    for (const id of ['attack', 'pickup', 'sit', ...SKILL_ORDER]) {
      const sk = SKILLS[id];
      const learned = p.learned.has(id);
      const r = el('div', 'row' + (learned ? '' : ' locked'), list);
      const s = el('div', 'slot', r, `<img src="${skillIcon(sk.icon, 64)}">`);
      s._tip = () => this.skillTip(id);
      if (learned) {
        this.makeDraggable(s, () => ({ type: 'skill', id }));
        s.addEventListener('click', () => { if (!s._suppressClick) p.useSkill(id); });
      }
      el('div', 'info', r, `<div class="t">${esc(sk.name)}</div><div class="d">${esc(sk.desc)}</div>`);
      el('div', 'req', r, learned ? (sk.sp ? `SP ${sk.sp}` : '') : `Lv ${sk.level}`);
    }
  }

  // ---------------------------------------------------------------- quests
  render_quests(body) {
    const Q = G.quests;
    body.innerHTML = '';
    const ids = Object.keys(Q.active);
    if (!ids.length) { el('div', 'dlg-text', body, 'You have no active quests. Look for NPCs with a <b style="color:#ffd35a">!</b> marker above their heads.'); return; }
    if (!this.selQuest || !Q.active[this.selQuest]) this.selQuest = ids[0];
    const list = el('div', 'list', body);
    list.style.maxHeight = '140px';
    for (const id of ids) {
      const q = QUESTS[id];
      const r = el('div', 'row' + (id === this.selQuest ? ' sel' : ''), list, `<div class="info"><div class="t">${esc(q.name)}</div><div class="d">${esc(Q.progressText(id))}</div></div><div class="req">${Q.isComplete(id) ? '✔ Done' : 'Lv ' + q.level}</div>`);
      r.style.cursor = 'pointer';
      r.onclick = () => { this.selQuest = id; this.render('quests'); };
    }
    const q = QUESTS[this.selQuest];
    const det = el('div', 'section', body);
    det.style.marginTop = '8px';
    const giver = G.npcs.get(q.turnin || q.giver);
    det.innerHTML = `<h4>${esc(q.name)}</h4><div class="d" style="line-height:1.5">${esc(q.text)}</div>
      <div style="margin-top:6px;font-weight:900">${esc(Q.progressText(this.selQuest))}</div>
      <div class="tt-type" style="margin-top:4px">Report to: ${giver ? esc(giver.title + ' ' + giver.name) : '-'}</div>`;
    det.appendChild(this.rewardHtml(q));
  }
  rewardHtml(q) {
    const r = el('div', 'reward');
    el('span', 'tt-type', r, 'Reward:');
    if (q.reward.exp) el('span', '', r, `<b style="color:#7dff6a">${q.reward.exp} EXP</b>`);
    if (q.reward.copper) el('span', '', r, `<b style="color:#ffe070">${moneyText(q.reward.copper)}</b>`);
    for (const [id, n] of q.reward.items || []) {
      const s = el('div', 'slot', r, `<img src="${itemIcon(ITEMS[id].icon, 64)}">${n > 1 ? `<span class="count">${n}</span>` : ''}`);
      s.style.width = s.style.height = '34px';
      s._tip = () => this.itemTip(id);
    }
    return r;
  }

  // ---------------------------------------------------------------- map
  render_map(body) {
    body.innerHTML = '';
    const c = el('canvas', 'map-canvas', body);
    const S = 530;
    c.width = c.height = S;
    c.style.width = c.style.height = S + 'px';
    const ctx = c.getContext('2d');
    const draw = () => {
      if (!this.isOpen('map')) return;
      ctx.drawImage(this.hud.mapBase, 0, 0, S, S);
      const size = this.hud.mapSize || WORLD.size;
      const k = S / size;
      const tp = (x, z) => [(x + size / 2) * k, (z + size / 2) * k];
      ctx.font = '900 13px Nunito'; ctx.textAlign = 'center';
      const label = (x, z, t, col = '#fff') => { const [a, b] = tp(x, z); ctx.lineWidth = 3; ctx.strokeStyle = '#000a'; ctx.strokeText(t, a, b); ctx.fillStyle = col; ctx.fillText(t, a, b); };
      for (const [x, z, t, col] of (G.world && G.world.mapLabels) || []) label(x, z, t, col);
      for (const pt of G.portals || []) { const [a, b] = tp(pt.pos.x, pt.pos.z); ctx.fillStyle = '#4dff9a'; ctx.beginPath(); ctx.arc(a, b, 5, 0, 7); ctx.fill(); ctx.strokeStyle = '#063'; ctx.lineWidth = 2; ctx.stroke(); label(pt.pos.x, pt.pos.z + 9, pt.name, '#9fffc8'); }
      for (const n of G.npcs.list) { const [a, b] = tp(n.pos.x, n.pos.z); ctx.fillStyle = n.markerKind === 'available' ? '#ffd020' : n.markerKind === 'complete' ? '#60ff40' : '#fff'; ctx.beginPath(); ctx.arc(a, b, 3.5, 0, 7); ctx.fill(); }
      const p = G.player;
      const [px, py] = tp(p.pos.x, p.pos.z);
      ctx.save(); ctx.translate(px, py); ctx.rotate(-p.rotY + Math.PI);
      ctx.fillStyle = '#2aa8ff'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(6, 7); ctx.lineTo(0, 3); ctx.lineTo(-6, 7); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
      requestAnimationFrame(draw);
    };
    draw();
    el('div', 'tt-type', body, 'Click on the minimap to walk to a location.').style.marginTop = '6px';
  }

  // ---------------------------------------------------------------- options / help / misc
  render_options(body) {
    const a = G.audio, o = G.options;
    body.innerHTML = '';
    const sec = el('div', 'section', body);
    el('h4', '', sec, 'Sound');
    const slider = (label, val, fn) => {
      const r = el('div', 'opt-row', sec, `<span>${label}</span>`);
      const i = el('input', '', r); i.type = 'range'; i.min = 0; i.max = 100; i.value = Math.round(val * 100);
      i.oninput = () => fn(i.value / 100);
    };
    slider('Effects', a.sfxVol, (v) => { a.setSfx(v); o.sfx = v; G.saveOptions(); });
    slider('Music', a.musicVol / 0.5, (v) => { a.setMusic(v * 0.5); o.music = v * 0.5; G.saveOptions(); });
    const sec2 = el('div', 'section', body); sec2.style.marginTop = '8px';
    el('h4', '', sec2, 'Graphics');
    const check = (label, val, fn) => {
      const r = el('div', 'opt-row', sec2, `<span>${label}</span>`);
      const i = el('input', '', r); i.type = 'checkbox'; i.checked = val;
      i.onchange = () => fn(i.checked);
    };
    check('Show interface (U)', !this.hud.hidden, (v) => this.hud.setHidden(!v));
    check('Shadows', o.shadows, (v) => { o.shadows = v; G.applyOptions(); });
    check('Bloom glow', o.bloom, (v) => { o.bloom = v; G.applyOptions(); });
    const r = el('div', 'opt-row', sec2, '<span>Resolution</span>');
    const sel = el('select', '', r, '<option value="0.75">Low</option><option value="1">Medium</option><option value="1.5">High</option><option value="2">Ultra</option>');
    sel.value = String(o.pixelRatio);
    sel.onchange = () => { o.pixelRatio = Number(sel.value); G.applyOptions(); };
    const sec3 = el('div', 'section', body); sec3.style.marginTop = '8px';
    el('h4', '', sec3, 'Game');
    const b1 = el('button', 'btn', sec3, 'Save now'); b1.onclick = () => { G.player.save(); G.msg('Game saved.'); };
    b1.style.marginRight = '6px';
    const b2 = el('button', 'btn orange', sec3, 'Character select');
    b2.onclick = () => G.toCharSelect();
  }
  render_help(body) {
    body.innerHTML = `<div class="keys">
      <kbd>Left click</kbd><span>Move / select target / talk to NPC</span>
      <kbd>Double click</kbd><span>Attack monster</span>
      <kbd>W A S D</kbd><span>Move (relative to camera)</span>
      <kbd>Right drag</kbd><span>Rotate camera</span>
      <kbd>Wheel / PgUp PgDn</kbd><span>Zoom</span>
      <kbd>Tab</kbd><span>Target next monster</span>
      <kbd>U</kbd><span>Hide / show the interface</span>
      <kbd>1 – 0, - , =</kbd><span>Skill bar (hold Shift for 2nd bar)</span>
      <kbd>Q / E</kbd><span>Use HP / SP stone</span>
      <kbd>Space</kbd><span>Jump</span>
      <kbd>Z</kbd><span>Walk / run</span>
      <kbd>Home</kbd><span>Rest (sit)</span>
      <kbd>H</kbd><span>Rest in mini house</span>
      <kbd>C I K L M</kbd><span>Character / Inventory / Skills / Quests / Map</span>
      <kbd>V F X</kbd><span>Actions / Community / Store</span>
      <kbd>Esc</kbd><span>Close window · deselect · options</span>
    </div>`;
  }
  render_community(body) { body.innerHTML = '<div class="dlg-text">Friends, guild and party features are not available in this single-player version of Roumen.</div>'; }
  render_store(body) { body.innerHTML = '<div class="dlg-text">The item store is closed. Everything in Roumen can be earned by playing!</div>'; }
  render_actions(body) {
    body.innerHTML = '';
    const list = el('div', 'dlg-opts', body);
    const acts = [['Wave', () => G.player.anim.play('wave')], ['Sit / Stand', () => G.player.toggleSit()], ['Cheer', () => G.player.anim.play('levelup')], ['Battle cry', () => G.player.anim.play('provoke')], ['Show off', () => G.player.anim.play('buff')]];
    for (const [n, fn] of acts) { const b = el('button', '', list, n); b.onclick = () => { if (!G.player.anim.busy) fn(); }; }
  }

  // ---------------------------------------------------------------- NPC dialog
  openNpc(npc) {
    this.npc = npc;
    this.npcPage = 'main';
    const lines = npc.def.greetLines;
    this.npcGreet = lines && lines.length ? lines[(Math.random() * lines.length) | 0] : npc.def.greet;
    this.open('npc');
    this.get('npc').title.textContent = `${npc.title} ${npc.name}`;
    this.showArt(npc.def.art || null);
  }
  // large character illustration on the right side while talking
  showArt(url) {
    if (!this.artEl) {
      this.artEl = el('img', '', document.getElementById('hud'));
      this.artEl.id = 'npc-art';
      this.artEl.alt = '';
      this.artEl.draggable = false;
    }
    const a = this.artEl;
    if (!url) { a.classList.remove('show'); return; }
    // size in real screen pixels: the HUD may be CSS-zoomed on small windows, the art must still be cut off
    // by the bottom edge (145% of the screen height, top at 4%), but never wider than 60% of the screen.
    // It sits behind the HUD panels (z-index -1 inside #hud) and in front of the 3D view.
    const z = G.uiScale || 1, H = window.innerHeight, W = window.innerWidth;
    const aspect = a.naturalWidth && a.naturalHeight ? a.naturalWidth / a.naturalHeight : 0.75;
    const h = Math.min(H * 1.45, (W * 0.6) / aspect);
    a.style.height = (h / z) + 'px';
    a.style.top = (H * 0.04 / z) + 'px';
    a.style.right = (-H * 0.04 / z) + 'px';
    const show = () => { a.classList.remove('show'); void a.offsetWidth; a.classList.add('show'); };
    if (a.getAttribute('src') !== url) { a.onload = show; a.src = url; } else show();
  }
  render_npc(body) {
    const npc = this.npc;
    if (!npc) return;
    const Q = G.quests;
    body.innerHTML = '';
    const page = this.npcPage;
    if (page.startsWith('quest:')) {
      const id = page.slice(6), q = QUESTS[id];
      const state = Q.active[id] ? (Q.isComplete(id) ? 'complete' : 'active') : 'available';
      let text = q.text;
      if (state === 'complete') text = q.goal.type === 'talk' ? `So the chief sent you! Nice to meet you. Come see me whenever you need your stones refilled or a potion.` : `Wonderful work! Here is your reward, as promised.`;
      if (state === 'active') text = `${q.text}<br><br><b>${esc(Q.progressText(id))}</b>`;
      el('div', 'dlg-text', body, `<b style="color:#ffd35a">${esc(q.name)}</b><br>${text}`);
      body.appendChild(this.rewardHtml(q));
      const opts = el('div', 'dlg-opts', body);
      if (state === 'available') { const b = el('button', '', opts, '<span class="qi">✔</span>Accept'); b.onclick = () => { Q.accept(id); this.npcPage = 'main'; this.render('npc'); }; }
      if (state === 'complete') { const b = el('button', '', opts, '<span class="qi">★</span>Complete quest'); b.onclick = () => { if (Q.complete(id)) { this.npcPage = 'main'; this.render('npc'); } }; }
      const back = el('button', '', opts, 'Back'); back.onclick = () => { this.npcPage = 'main'; this.render('npc'); };
      return;
    }
    // one-time gift (e.g. Robo hands over the Robo Blades): offered until accepted, never again afterwards
    const gift = npc.def.gift, giftKey = 'gift:' + npc.id;
    if (gift && !G.player.flags[giftKey]) {
      el('div', 'dlg-text', body, esc(gift.text));
      body.appendChild(this.rewardHtml({ reward: { items: [[gift.item, 1]] } }));
      const opts = el('div', 'dlg-opts', body);
      const b = el('button', '', opts, `<span class="qi">★</span>${esc(gift.button || 'Accept')}`);
      b.onclick = () => {
        const p = G.player;
        if (p.flags[giftKey]) return;
        if (p.freeSlots() < 1) { G.msg('Make room in your inventory first.', 'warn'); G.audio.play('error'); return; }
        p.addItem(gift.item, 1);
        p.flags[giftKey] = true;
        G.msg(`${npc.name} gave you ${ITEMS[gift.item].name}. Equip it from your inventory (I).`, 'loot');
        G.audio.play('quest');
        G.fx.pillar(p.pos.clone(), '#ffd86a', 1.4, 0.8, 6);
        this.npcGreet = gift.done || this.npcGreet;
        G.quests.refresh();
        G.ui.updateQuestNotice();
        p.save();
        this.render('npc');
      };
      const bye = el('button', '', opts, 'Goodbye'); bye.onclick = () => this.close('npc');
      return;
    }
    el('div', 'dlg-text', body, esc(this.npcGreet || npc.def.greet));
    const opts = el('div', 'dlg-opts', body);
    for (const { id, q, state } of Q.forNpc(npc.id)) {
      const icon = state === 'available' ? '!' : state === 'complete' ? '?' : '…';
      const b = el('button', '', opts, `<span class="qi">${icon}</span>${esc(q.name)}${state === 'active' ? ' (in progress)' : ''}`);
      b.onclick = () => { this.npcPage = 'quest:' + id; this.render('npc'); };
    }
    const roles = npc.def.roles;
    if (roles.includes('healer')) {
      const p = G.player;
      const max = STARTING.stoneMax(p.level);
      const need = { hp: max.hp - p.stones.hp, sp: max.sp - p.stones.sp };
      const cost = need.hp * STARTING.stonePrice.hp + need.sp * STARTING.stonePrice.sp;
      const b = el('button', '', opts, `<span class="qi">♥</span>Refill HP/SP stones (${need.hp + need.sp > 0 ? moneyText(cost) : 'full'})`);
      b.onclick = () => {
        if (need.hp + need.sp <= 0) { G.msg('Your stones are already full.'); return; }
        if (p.money < cost) { G.msg('You do not have enough money.', 'warn'); G.audio.play('error'); return; }
        p.money -= cost; p.stones.hp = max.hp; p.stones.sp = max.sp;
        p.hp = p.stats.maxHp; p.sp = p.stats.maxSp;
        G.fx.healSparkle(p.pos); G.audio.play('potion');
        G.msg(`Stones refilled for ${moneyText(cost)}. HP and SP restored.`, 'loot');
        G.emit('stats'); G.emit('inventory');
        this.render('npc');
      };
    }
    if (roles.includes('shop')) { const b = el('button', '', opts, '<span class="qi">$</span>Buy / sell items'); b.onclick = () => this.openShop(npc); }
    if (roles.includes('skills')) { const b = el('button', '', opts, '<span class="qi">✦</span>Learn skills'); b.onclick = () => this.openSkillMaster(npc); }
    const bye = el('button', '', opts, 'Goodbye'); bye.onclick = () => this.close('npc');
  }

  // ---------------------------------------------------------------- shop
  openShop(npc) {
    this.close('skillmaster');
    this.shopNpc = npc;
    this.open('shop');
    this.get('shop').title.textContent = `${npc.name}'s Shop`;
    if (!this.isOpen('inventory')) this.open('inventory');
  }
  render_shop(body) {
    const npc = this.shopNpc;
    if (!npc) return;
    const p = G.player;
    body.innerHTML = '<div class="tt-type" style="margin-bottom:6px">Click to buy · Shift+click to buy 10 · Right-click items in your inventory to sell.</div>';
    const list = el('div', 'list', body);
    for (const id of npc.def.shop) {
      const it = ITEMS[id];
      const r = el('div', 'row', list);
      const s = el('div', 'slot', r, `<img src="${itemIcon(it.icon, 64)}">`);
      s._tip = () => this.itemTip(id, { price: it.price });
      el('div', 'info', r, `<div class="t">${esc(it.name)}</div><div class="d">${it.lv && it.lv > 1 ? 'Lv ' + it.lv + ' · ' : ''}${esc(it.desc || '')}</div>`);
      el('div', 'price', r, moneyText(it.price));
      r.style.cursor = 'pointer';
      r.onclick = (e) => this.buy(id, e.shiftKey && it.stack > 1 ? 10 : 1);
    }
    el('div', 'money', body, moneyHtml(p.money));
  }
  buy(id, n = 1) {
    const p = G.player, it = ITEMS[id];
    const cost = it.price * n;
    if (p.money < cost) { G.msg('You do not have enough money.', 'warn'); G.audio.play('error'); return; }
    const left = p.addItem(id, n);
    const bought = n - left;
    if (bought <= 0) return;
    p.money -= it.price * bought;
    G.msg(`Bought ${it.name}${bought > 1 ? ' x' + bought : ''} for ${moneyText(it.price * bought)}.`, 'loot');
    G.audio.play('coin');
    G.emit('inventory');
  }

  // ---------------------------------------------------------------- skill master
  openSkillMaster(npc) { this.close('shop'); this.open('skillmaster'); }
  render_skillmaster(body) {
    const p = G.player;
    body.innerHTML = '<div class="tt-type" style="margin-bottom:6px">Each technique costs a fee. Learned skills appear in your Skills window (K).</div>';
    const list = el('div', 'list', body);
    for (const id of SKILL_ORDER) {
      const sk = SKILLS[id];
      const learned = p.learned.has(id);
      const can = p.level >= sk.level;
      const r = el('div', 'row' + (can || learned ? '' : ' locked'), list);
      const s = el('div', 'slot', r, `<img src="${skillIcon(sk.icon, 64)}">`);
      s._tip = () => this.skillTip(id);
      el('div', 'info', r, `<div class="t">${esc(sk.name)}</div><div class="d">Lv ${sk.level} · ${moneyText(sk.cost)}</div>`);
      if (learned) el('div', 'req', r, 'Learned');
      else {
        const b = el('button', 'btn small' + (can ? ' green' : ''), r, 'Learn');
        b.disabled = !can;
        b.onclick = () => {
          if (p.money < sk.cost) { G.msg('You do not have enough money.', 'warn'); G.audio.play('error'); return; }
          p.money -= sk.cost;
          p.learned.add(id);
          // put it on the first free skill bar slot
          const free = p.skillbar.findIndex((e, i) => !e && i < 12 && i > 1);
          if (free >= 0) p.skillbar[free] = { type: 'skill', id };
          G.msg(`You learned ${sk.name}!`, 'skill');
          G.fx.aura(p, '#ffe070', 1.2);
          G.audio.play('buff');
          this.hud.renderSkillbars();
          this.render('skillmaster'); this.refresh('skills');
          G.emit('inventory');
          p.save();
        };
      }
    }
    el('div', 'money', body, moneyHtml(p.money));
  }

  // ---------------------------------------------------------------- death
  showDeath() {
    const bg = el('div', 'modal-bg', document.body);
    const w = el('div', 'win', bg);
    w.style.width = '320px';
    el('div', 'wtitle', w, 'Knocked Out');
    const b = el('div', 'wbody', w, '<div class="dlg-text" style="text-align:center">You have been defeated…<br>Return to Roumen to recover?</div>');
    const btn = el('button', 'btn orange', b, 'Return to town');
    btn.style.cssText = 'display:block;margin:12px auto 0';
    btn.onclick = () => { bg.remove(); G.player.revive(); };
  }
}

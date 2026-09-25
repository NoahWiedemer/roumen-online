// In-game HUD: player/target frames, minimap, skill bars, menu bar, system log, nameplates
import * as THREE from 'three';
import { G } from '../game/game.js';
import { skillIcon, itemIcon, menuIcon, buffIcon } from './icons.js';
import { SKILLS, ITEMS, EXP_TABLE, MONSTERS } from '../game/data.js';
import { WORLD, areaNameAt } from '../world/layout.js';
import { Windows } from './windows.js';
import { renderPortrait } from './portrait.js';

const el = (tag, cls, parent, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  if (parent) parent.appendChild(e);
  return e;
};

export const SLOT_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='];
export const SLOT_CODES = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal'];

export function levelColorClass(mLv, pLv) {
  const d = mLv - pLv;
  if (d <= -5) return 'lvcol-gray';
  if (d <= -2) return 'lvcol-green';
  if (d <= 1) return 'lvcol-white';
  if (d <= 3) return 'lvcol-yellow';
  if (d <= 5) return 'lvcol-orange';
  return 'lvcol-red';
}

export function entryIcon(entry) {
  if (!entry) return null;
  if (entry.type === 'item') return itemIcon(ITEMS[entry.id]?.icon || entry.id, 64);
  return skillIcon(SKILLS[entry.id]?.icon || entry.id, 64);
}

export class HUD {
  constructor() {
    this.root = document.getElementById('hud');
    this.rowPage = [0, 1];
    this.menuIcons = {};
    this.win = new Windows(this);
    this.build();
    this.plates = new Plates();
    this.lastVals = {};
    G.on('message', (m) => this.log(m.text, m.color));
    G.on('target', (t) => this.setTarget(t));
    G.on('buffs', () => this.renderBuffs());
    G.on('stats', () => this.dirty = true);
    G.on('inventory', () => { this.renderSkillbars(); });
    G.on('levelup', () => { this.pfLevel.textContent = G.player.level; });
    G.on('quests', () => this.updateQuestNotice());
    G.on('death', () => this.win.showDeath());
  }

  build() {
    const R = this.root;
    // ---------------- player frame
    const pf = el('div', '', R); pf.id = 'pframe';
    this.pfName = el('div', 'name-plate pf-name', pf, 'Ryou');
    const port = el('div', 'pf-portrait interactive', pf);
    port.innerHTML = `<svg class="ring" viewBox="0 0 86 86">
      <defs><linearGradient id="rimg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4f8ff"/><stop offset="0.5" stop-color="#9aa8bf"/><stop offset="1" stop-color="#5d6a80"/></linearGradient>
      <linearGradient id="expg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe28a"/><stop offset="1" stop-color="#ff8a1a"/></linearGradient></defs>
      <circle cx="43" cy="43" r="41" fill="#141a26" stroke="url(#rimg)" stroke-width="3"/>
      <circle cx="43" cy="43" r="37" fill="none" stroke="#2a1a08" stroke-width="5"/>
      <circle class="expring" cx="43" cy="43" r="37" fill="none" stroke="url(#expg)" stroke-width="4" stroke-linecap="round" transform="rotate(-90 43 43)" stroke-dasharray="0 1000"/>
    </svg><div class="face"><img alt=""></div>`;
    this.pfFace = port.querySelector('img');
    this.expRing = port.querySelector('.expring');
    port.addEventListener('click', () => G.player.setTarget(null));
    this.pfLevel = el('div', 'pf-level', pf, '1');
    const st = el('div', 'pf-stats', pf);
    this.hpOrb = el('div', 'orb hp interactive', st, '15');
    this.hpOrb.title = 'HP Stones (Q)';
    this.hpOrb.addEventListener('click', () => G.player.useStone('hp'));
    const bars = el('div', 'pf-bars', st);
    this.hpBar = this.makeBar(bars, 'hp');
    this.spBar = this.makeBar(bars, 'sp');
    this.spOrb = el('div', 'orb sp interactive', st, '7');
    this.spOrb.title = 'SP Stones (E)';
    this.spOrb.addEventListener('click', () => G.player.useStone('sp'));
    const ex = el('div', 'pf-exp', pf);
    this.beads = [];
    for (let i = 0; i < 10; i++) this.beads.push(el('i', '', ex));
    this.expText = el('b', '', ex, '0.00%');
    this.pfBuffs = el('div', 'pf-buffs', pf);

    // ---------------- target frame
    const tf = el('div', 'hidden', R); tf.id = 'tframe';
    this.tf = tf;
    this.tfName = el('div', 'name-plate tf-name', tf, '');
    const row = el('div', 'tf-row', tf);
    this.tfHp = this.makeBar(row, 'hp');
    this.tfLv = el('div', 'tf-lv', row, '1');
    this.tfSp = this.makeBar(row, 'sp');
    this.tfPort = el('div', 'tf-portrait', tf, '<img alt="">').querySelector('img');
    this.tfBuffs = el('div', 'tf-buffs', tf);

    // ---------------- minimap
    const mm = el('div', '', R); mm.id = 'minimap';
    this.mmTitle = el('div', 'mm-title', mm, 'Roumen');
    const fr = el('div', 'mm-frame interactive', mm);
    this.mmCanvas = el('canvas', '', fr);
    this.mmCanvas.width = 392; this.mmCanvas.height = 340;
    this.mmCtx = this.mmCanvas.getContext('2d');
    this.mmZoom = 1;
    const btns = el('div', 'mm-btns', mm);
    const mkRb = (icon, title, fn) => { const b = el('button', 'round-btn', btns, `<img src="${menuIcon(icon, 48)}">`); b.title = title; b.onclick = fn; return b; };
    mkRb('zoom_in', 'Zoom in', () => { this.mmZoom = Math.min(2.5, this.mmZoom * 1.35); });
    mkRb('zoom_out', 'Zoom out', () => { this.mmZoom = Math.max(0.45, this.mmZoom / 1.35); });
    mkRb('world_map', 'Area map (M)', () => this.win.toggle('map'));
    mkRb('collapse', 'Hide minimap', () => fr.classList.toggle('hidden'));
    this.mmCoords = el('div', 'mm-coords', mm, '');
    fr.addEventListener('click', (e) => {
      // click on minimap to walk there
      const r = fr.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width * this.mmCanvas.width, py = (e.clientY - r.top) / r.height * this.mmCanvas.height;
      const s = this.mmScale();
      const p = G.player.pos;
      const wx = p.x + (px - this.mmCanvas.width / 2) / s, wz = p.z + (py - this.mmCanvas.height / 2) / s;
      if (G.player.moveTo(wx, wz)) G.fx.showClick(new THREE.Vector3(wx, G.terrain.heightAt(wx, wz), wz));
    });
    this.questNotice = el('div', 'hidden', R, `<img src="${menuIcon('quests', 64)}">`);
    this.questNotice.id = 'questnotice';
    this.questNotice.title = 'Quests available';
    this.questNotice.onclick = () => this.win.toggle('quests');

    // ---------------- skill bars
    const sb = el('div', '', R); sb.id = 'skillbars';
    this.sbRows = [];
    for (let r = 0; r < 2; r++) {
      const bar = el('div', 'sbar interactive', sb);
      const page = el('div', 'page', bar);
      const up = el('button', '', page, '▲');
      const num = el('div', 'num', page, String(this.rowPage[r] + 1));
      const dn = el('button', '', page, '▼');
      up.onclick = () => { this.rowPage[r] = (this.rowPage[r] + 3) % 4; num.textContent = this.rowPage[r] + 1; this.renderSkillbars(); };
      dn.onclick = () => { this.rowPage[r] = (this.rowPage[r] + 1) % 4; num.textContent = this.rowPage[r] + 1; this.renderSkillbars(); };
      const slots = [];
      for (let i = 0; i < 12; i++) {
        const s = el('div', 'slot', bar);
        s.innerHTML = `<img alt="" draggable="false"><div class="cd"></div><div class="cdtext"></div><span class="key">${r === 1 ? '⇧' : ''}${SLOT_KEYS[i]}</span><span class="count"></span>`;
        s.dataset.bar = r; s.dataset.i = i;
        s.addEventListener('click', () => this.activateSlot(r, i));
        s.addEventListener('contextmenu', (e) => { e.preventDefault(); this.activateSlot(r, i); });
        this.win.makeDraggable(s, () => this.barEntry(r, i), { fromBar: [r, i] });
        this.win.makeDropTarget(s, (payload) => this.dropOnBar(r, i, payload));
        s._tip = () => this.win.entryTip(this.barEntry(r, i));
        slots.push({ el: s, img: s.querySelector('img'), cd: s.querySelector('.cd'), cdt: s.querySelector('.cdtext'), count: s.querySelector('.count'), entry: undefined });
      }
      const cap = el('div', 'endcap', bar, `<button class="round-btn" title="Skills (K)"><img src="${menuIcon('skills', 48)}"></button>`);
      cap.querySelector('button').onclick = () => this.win.toggle('skills');
      this.sbRows.push({ bar, slots, num });
    }

    // ---------------- menu bar (bottom right)
    const mb = el('div', '', R); mb.id = 'menubar';
    const tg = el('button', 'toggle', mb, '›');
    tg.onclick = () => { mb.classList.toggle('collapsed'); tg.textContent = mb.classList.contains('collapsed') ? '‹' : '›'; };
    this.menuIcons = {};
    const MENU = [
      ['help', 'Help (F10)', 'help'], ['character', 'Character (C)', 'character'], ['store', 'Store (X)', 'store'], ['inventory', 'Inventory (I)', 'inventory'],
      ['skills', 'Skills (K)', 'skills'], ['quests', 'Quests (L)', 'quests'], ['community', 'Community (F)', 'community'], ['actions', 'Actions (V)', 'actions'],
      ['house', 'Mini House (H)', 'house'], ['options', 'Options (Esc)', 'options'],
    ];
    for (const [icon, title, win] of MENU) {
      const m = el('div', 'micon', mb, `<img src="${menuIcon(icon, 80)}" alt="">`);
      m.title = title;
      m.onclick = () => { G.audio.play('click'); if (win === 'house') G.player.toggleHouse ? G.player.toggleHouse() : G.player.toggleSit(); else this.win.toggle(win); };
      this.menuIcons[win] = m;
    }

    // ---------------- system log + center msg
    this.syslog = el('div', '', R); this.syslog.id = 'syslog';
    this.center = el('div', '', R); this.center.id = 'center-msg';
    this.tooltip = el('div', 'hidden', document.body); this.tooltip.id = 'tooltip';
  }

  makeBar(parent, kind) {
    const b = el('div', 'bar ' + kind, parent);
    const lag = el('div', 'lag', b);
    const f = el('div', 'fill', b);
    const s = el('span', '', b);
    return { el: b, fill: f, lag, text: s, last: -1 };
  }
  setBar(bar, v, max) {
    const pct = max > 0 ? Math.max(0, Math.min(1, v / max)) : 0;
    const key = Math.round(v) + '/' + Math.round(max);
    if (bar.last === key) return;
    bar.last = key;
    bar.fill.style.width = (pct * 100).toFixed(2) + '%';
    bar.lag.style.width = (pct * 100).toFixed(2) + '%';
    bar.text.textContent = `${Math.round(v)}/${Math.round(max)}`;
  }

  // ---------------------------------------------------------------- portraits
  refreshPortrait() {
    const p = G.player;
    const url = renderPortrait(G.engine.renderer, null, p.root, p.rig.portraitY || 1.32, p.rig.portraitDist || 0.95, { env: G.scene.environment });
    this.pfFace.src = url;
    this.win.setPortrait(url);
  }
  portraitFor(t) {
    if (t.isNpc) return renderPortrait(G.engine.renderer, 'npc:' + t.id, t.root, t.rig.portraitY || 1.34 * (t.scale || 1), t.rig.portraitDist || 0.95 * (t.scale || 1), { env: G.scene.environment, yaw: 0 });
    const key = 'mon:' + t.type;
    const h = t.model.headY || t.height * 0.6;
    return renderPortrait(G.engine.renderer, key, t.root, h, Math.max(0.8, t.height * 1.1), { yaw: 0.25, env: G.scene.environment });
  }

  // ---------------------------------------------------------------- target
  setTarget(t) {
    this.target = t;
    if (!t) { this.tf.classList.add('hidden'); return; }
    this.tf.classList.remove('hidden');
    this.tfName.textContent = t.isNpc ? `${t.title} ${t.name}` : t.name;
    this.tfLv.textContent = t.isNpc ? '-' : t.level;
    this.tfLv.className = 'tf-lv ' + (t.isNpc ? '' : levelColorClass(t.level, G.player.level));
    this.tfName.className = 'name-plate tf-name ' + (t.isNpc ? '' : levelColorClass(t.level, G.player.level));
    try { this.tfPort.src = this.portraitFor(t); } catch { /* ignore */ }
    this.tfHp.last = -1; this.tfSp.last = -1;
  }

  // ---------------------------------------------------------------- skill bars
  barIndex(r, i) { return this.rowPage[r] * 12 + i; }
  barEntry(r, i) { return G.player.skillbar[this.barIndex(r, i)] || null; }
  dropOnBar(r, i, payload) {
    const p = G.player;
    const idx = this.barIndex(r, i);
    if (payload.fromBar) {
      const [fr, fi] = payload.fromBar;
      const fidx = this.barIndex(fr, fi);
      const tmp = p.skillbar[idx];
      p.skillbar[idx] = p.skillbar[fidx];
      p.skillbar[fidx] = tmp;
    } else if (payload.entry) {
      if (payload.entry.type === 'item' && ITEMS[payload.entry.id].type !== 'consumable') return;
      p.skillbar[idx] = { ...payload.entry };
    }
    this.renderSkillbars();
    p.save();
  }
  activateSlot(r, i) {
    const e = this.barEntry(r, i);
    if (!e) return;
    const s = this.sbRows[r].slots[i].el;
    s.classList.remove('flash'); void s.offsetWidth; s.classList.add('flash');
    G.player.useSlot(e);
  }
  renderSkillbars() {
    const p = G.player;
    if (!p) return;
    while (p.skillbar.length < 48) p.skillbar.push(null);
    for (let r = 0; r < 2; r++) {
      this.sbRows[r].num.textContent = this.rowPage[r] + 1;
      this.sbRows[r].slots.forEach((s, i) => {
        const e = this.barEntry(r, i);
        const key = e ? e.type + ':' + e.id : '';
        if (s.entry !== key) {
          s.entry = key;
          if (e) { s.img.src = entryIcon(e); s.img.style.display = ''; } else { s.img.removeAttribute('src'); s.img.style.display = 'none'; }
        }
        if (e && e.type === 'item') {
          const n = p.countItem(e.id);
          s.count.textContent = n;
          s.el.classList.toggle('disabled', n === 0);
        } else { s.count.textContent = ''; s.el.classList.remove('disabled'); }
      });
    }
  }
  updateCooldowns() {
    const p = G.player;
    for (let r = 0; r < 2; r++) {
      for (let i = 0; i < 12; i++) {
        const s = this.sbRows[r].slots[i];
        const e = this.barEntry(r, i);
        let rem = 0, tot = 1;
        if (e && e.type === 'skill') {
          const sk = SKILLS[e.id];
          rem = p.cooldowns[e.id] || 0; tot = sk.cd || 1;
          if (rem <= 0 && p.gcd > 0 && sk.kind !== 'util' && e.id !== 'attack') { rem = p.gcd; tot = 0.6; }
          s.el.classList.toggle('nosp', sk.sp > p.sp);
          s.el.classList.toggle('disabled', !p.learned.has(e.id));
        } else if (e && e.type === 'item') {
          const it = ITEMS[e.id];
          const k = 'item:' + (it.heal ? 'hp' : it.mana ? 'sp' : e.id);
          rem = p.cooldowns[k] || 0; tot = it.cd || 1;
        }
        const key = rem > 0 ? Math.ceil(rem * 20) : 0;
        if (s._cdKey === key) continue;
        s._cdKey = key;
        if (rem > 0) {
          const a = (rem / tot) * 360;
          s.cd.style.background = `conic-gradient(rgba(0,0,0,0.72) ${a}deg, rgba(0,0,0,0) ${a}deg)`;
          s.cdt.textContent = rem >= 1 ? Math.ceil(rem) : '';
        } else { s.cd.style.background = 'none'; s.cdt.textContent = ''; }
      }
    }
  }

  // ---------------------------------------------------------------- buffs
  renderBuffs() {
    const p = G.player;
    this.pfBuffs.innerHTML = '';
    const list = [...p.buffs];
    if (p.sitting) list.push({ id: 'regen', t: 0 });
    for (const b of list) {
      const d = el('div', 'buff', this.pfBuffs, `<img src="${buffIcon(b.id, 32)}"><span class="t"></span>`);
      d._buff = b;
      d.title = b.id.replace('_', ' ');
    }
  }
  updateBuffTimers() {
    for (const d of this.pfBuffs.children) {
      const b = d._buff;
      const t = d.querySelector('.t');
      const txt = b.t > 0 ? (b.t >= 60 ? Math.ceil(b.t / 60) + 'm' : Math.ceil(b.t) + 's') : '';
      if (t.textContent !== txt) t.textContent = txt;
    }
    // target debuffs
    const t = this.target;
    if (t && !t.isNpc) {
      const key = (t.debuffs || []).map((d) => d.id + Math.ceil(d.t)).join(',');
      if (key !== this._tbKey) {
        this._tbKey = key;
        this.tfBuffs.innerHTML = '';
        for (const d of t.debuffs || []) el('div', 'buff debuff', this.tfBuffs, `<img src="${buffIcon(d.id === 'slow' ? 'stun' : d.id === 'armor_break' ? 'provoke' : d.id, 32)}"><span class="t">${Math.ceil(d.t)}</span>`);
      }
    } else if (this._tbKey) { this._tbKey = ''; this.tfBuffs.innerHTML = ''; }
  }

  // ---------------------------------------------------------------- log
  log(text, cls = 'sys') {
    const d = el('div', cls, this.syslog, '');
    d.textContent = text;
    while (this.syslog.children.length > 9) this.syslog.firstChild.remove();
    setTimeout(() => { d.style.opacity = '0'; }, 9000);
    setTimeout(() => d.remove(), 10200);
  }
  centerMsg(text, dur = 2.5) {
    this.center.textContent = text;
    this.center.style.opacity = 1;
    clearTimeout(this._cm);
    this._cm = setTimeout(() => { this.center.style.opacity = 0; }, dur * 1000);
  }
  updateQuestNotice() {
    const any = G.npcs && G.npcs.list.some((n) => G.quests.markerFor(n.id) === 'available' || G.quests.markerFor(n.id) === 'complete');
    this.questNotice.classList.toggle('hidden', !any);
  }

  // ---------------------------------------------------------------- minimap
  // switch the minimap / area names to a world (the painted base map is built once per world and cached on it)
  setWorld(world) {
    if (!world.mapBase) world.mapBase = this.buildMinimapBase(world.minimap, world.terrain);
    this.mapBase = world.mapBase;
    this.mapSize = world.terrain.size;
    this.areaNameAt = world.areaNameAt || areaNameAt;
    if (G.player) this.mmTitle.textContent = this.areaNameAt(G.player.pos.x, G.player.pos.z);
    this.win.refresh('map');
  }
  buildMinimapBase(minimapShapes, T = G.terrain) {
    const S = 1024, SIZE = T.size || WORLD.size, half = SIZE / 2;
    const c = document.createElement('canvas'); c.width = c.height = S;
    const ctx = c.getContext('2d');
    const R = 512;
    const small = document.createElement('canvas'); small.width = small.height = R;
    const sctx = small.getContext('2d');
    const img = sctx.createImageData(R, R);
    // base colour: worlds may provide their own (minimapColor), otherwise Roumen's splat channels
    let colorAt = T.minimapColor ? (wx, wz) => T.minimapColor(wx, wz) : null;
    if (!colorAt) {
      const splat = T.splatCanvas.getContext('2d').getImageData(0, 0, T.splatCanvas.width, T.splatCanvas.height).data;
      const sw = T.splatCanvas.width;
      colorAt = (wx, wz) => {
        const sx = Math.floor((wx + half) / SIZE * sw), sy = Math.floor((wz + half) / SIZE * sw);
        const si = (sy * sw + sx) * 4;
        const dirt = splat[si] / 255, cob = splat[si + 1] / 255, plaza = splat[si + 2] / 255, rock = 1 - splat[si + 3] / 255;
        let col = T.zoneAt(wx, wz) === 4 ? [70, 120, 50] : [118, 176, 74];
        col = mix(col, [205, 170, 115], dirt);
        col = mix(col, [238, 206, 170], plaza);
        col = mix(col, [190, 196, 205], cob);
        return mix(col, [150, 140, 120], rock * 0.7);
      };
    }
    for (let y = 0; y < R; y++) for (let x = 0; x < R; x++) {
      const wx = -half + (x + 0.5) / R * SIZE, wz = -half + (y + 0.5) / R * SIZE;
      const col = colorAt(wx, wz);
      // hillshade
      const n = T.normalAt(wx, wz);
      const shade = 0.72 + Math.max(0, n.x * -0.5 + n.y * 0.6 + n.z * -0.35) * 0.45;
      const h = T.heightAt(wx, wz);
      const hl = 0.9 + Math.max(-0.2, Math.min(0.25, h * 0.006));
      let rgb = col.map((v) => v * shade * hl);
      if (T.isWater(wx, wz)) { const dp = Math.min(1, Math.max(0, -h / 6)); rgb = mix([110, 200, 235], [40, 110, 200], dp); }
      const i = (y * R + x) * 4;
      img.data[i] = rgb[0]; img.data[i + 1] = rgb[1]; img.data[i + 2] = rgb[2]; img.data[i + 3] = 255;
    }
    sctx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(small, 0, 0, S, S);
    // footprints
    const k = S / SIZE;
    for (const sh of minimapShapes.shapes) {
      ctx.save();
      ctx.translate((sh.x + half) * k, (sh.z + half) * k);
      ctx.fillStyle = sh.color;
      ctx.strokeStyle = 'rgba(40,20,10,0.7)';
      ctx.lineWidth = 1.5;
      if (sh.kind === 'rect') {
        ctx.rotate(-sh.rotY);
        ctx.fillRect(-sh.w / 2 * k, -sh.d / 2 * k, sh.w * k, sh.d * k);
        ctx.strokeRect(-sh.w / 2 * k, -sh.d / 2 * k, sh.w * k, sh.d * k);
      } else {
        ctx.beginPath(); ctx.arc(0, 0, sh.r * k, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
      ctx.restore();
    }
    return c;
  }
  mmScale() { return 2.2 * this.mmZoom; } // canvas px per metre
  drawMinimap() {
    if (!this.mapBase) return;
    const ctx = this.mmCtx, W = this.mmCanvas.width, H = this.mmCanvas.height;
    const p = G.player.pos;
    const s = this.mmScale();
    const size = this.mapSize || WORLD.size;
    const k = this.mapBase.width / size;
    const srcW = W / s * k, srcH = H / s * k;
    const sx = (p.x + size / 2) * k - srcW / 2, sy = (p.z + size / 2) * k - srcH / 2;
    ctx.fillStyle = '#3a5a2a';
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(this.mapBase, sx, sy, srcW, srcH, 0, 0, W, H);
    const toMM = (x, z) => [W / 2 + (x - p.x) * s, H / 2 + (z - p.z) * s];
    // monsters
    for (const m of G.monsters.list) {
      if (m.dead) continue;
      const [x, y] = toMM(m.pos.x, m.pos.z);
      if (x < -5 || y < -5 || x > W + 5 || y > H + 5) continue;
      ctx.fillStyle = m.def.boss ? '#c060ff' : m.def.aggressive ? '#ff4030' : '#ff9a30';
      ctx.beginPath(); ctx.arc(x, y, m.def.boss ? 6 : 3.6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke();
    }
    // npcs
    for (const n of G.npcs.list) {
      const [x, y] = toMM(n.pos.x, n.pos.z);
      if (x < -5 || y < -5 || x > W + 5 || y > H + 5) continue;
      const mk = n.markerKind;
      ctx.fillStyle = mk === 'available' ? '#ffd020' : mk === 'complete' ? '#60ff40' : '#ffffff';
      ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1.2; ctx.stroke();
      if (mk === 'available' || mk === 'complete') {
        ctx.font = '900 14px Nunito'; ctx.fillStyle = '#000'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(mk === 'complete' ? '?' : '!', x, y + 0.5);
      }
    }
    // player arrow
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(-G.player.rotY + Math.PI);
    // camera view cone
    ctx.restore();
    ctx.save();
    ctx.translate(W / 2, H / 2);
    const camYaw = G.cam.yaw;
    ctx.rotate(-camYaw + Math.PI);
    const cone = ctx.createRadialGradient(0, 0, 0, 0, 0, 60);
    cone.addColorStop(0, 'rgba(255,255,255,0.35)'); cone.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = cone;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 60, Math.PI / 2 - 0.5, Math.PI / 2 + 0.5); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(-G.player.rotY + Math.PI);
    ctx.fillStyle = '#2aa8ff'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(0, -13); ctx.lineTo(9, 10); ctx.lineTo(0, 5); ctx.lineTo(-9, 10); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    // north marker
    ctx.font = '900 18px Nunito'; ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.textAlign = 'center';
    ctx.strokeText('N', W / 2, 20); ctx.fillText('N', W / 2, 20);
  }

  // ---------------------------------------------------------------- per-frame update
  update(dt) {
    const p = G.player;
    if (!p) return;
    this.setBar(this.hpBar, p.hp, p.stats.maxHp);
    this.setBar(this.spBar, p.sp, p.stats.maxSp);
    const v = this.lastVals;
    if (v.hs !== p.stones.hp) { v.hs = p.stones.hp; this.hpOrb.textContent = p.stones.hp; }
    if (v.ss !== p.stones.sp) { v.ss = p.stones.sp; this.spOrb.textContent = p.stones.sp; }
    if (v.lv !== p.level) { v.lv = p.level; this.pfLevel.textContent = p.level; }
    if (v.name !== p.name) { v.name = p.name; this.pfName.textContent = p.name; }
    const need = EXP_TABLE[p.level] || 1;
    const pct = Math.min(1, p.exp / need);
    const pk = Math.round(pct * 10000);
    if (v.exp !== pk) {
      v.exp = pk;
      const C = 2 * Math.PI * 37;
      this.expRing.setAttribute('stroke-dasharray', `${(pct * C).toFixed(1)} ${C}`);
      const n = Math.floor(pct * 10);
      this.beads.forEach((b, i) => b.classList.toggle('on', i < n));
      this.expText.textContent = `EXP ${(pct * 100).toFixed(2)}%`;
    }
    // target
    const t = this.target;
    if (t) {
      if (t.isNpc) { this.setBar(this.tfHp, 1, 1); this.setBar(this.tfSp, 1, 1); this.tfHp.text.textContent = ''; this.tfSp.text.textContent = ''; }
      else { this.setBar(this.tfHp, t.hp, t.stats.maxHp); this.setBar(this.tfSp, t.def.boss ? 300 : 20 + t.level * 5, t.def.boss ? 300 : 20 + t.level * 5); }
    }
    this.updateCooldowns();
    this.updateBuffTimers();
    this._mmT = (this._mmT || 0) + dt;
    if (this._mmT > 0.05) {
      this._mmT = 0;
      this.drawMinimap();
      const area = (this.areaNameAt || areaNameAt)(p.pos.x, p.pos.z);
      if (this.mmTitle.textContent !== area) {
        const prev = this.mmTitle.textContent;
        this.mmTitle.textContent = area;
        if (prev && prev !== area) this.centerMsg(area, 2.5);
      }
      this.mmCoords.textContent = `${Math.round(p.pos.x)}, ${Math.round(-p.pos.z)}`;
    }
    this.plates.update();
    this.win.update(dt);
  }
}

function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

// ------------------------------------------------------------------ nameplates
class Plates {
  constructor() {
    this.layer = document.createElement('div');
    this.layer.className = 'plates';
    document.body.appendChild(this.layer);
    this.map = new Map();
    this.v = new THREE.Vector3();
  }
  plateFor(ent) {
    let p = this.map.get(ent);
    if (!p) {
      const d = document.createElement('div');
      d.className = 'plate';
      this.layer.appendChild(d);
      p = { el: d, key: '' };
      this.map.set(ent, p);
    }
    p.used = true;
    return p;
  }
  update() {
    const cam = G.camera, W = window.innerWidth, H = window.innerHeight;
    const pp = G.player.pos;
    for (const p of this.map.values()) p.used = false;
    const show = (ent, html, key, yOff = 0.35, maxD = 45, cls = '') => {
      const d = Math.hypot(ent.pos.x - pp.x, ent.pos.z - pp.z);
      if (d > maxD) return;
      const hp = ent.headPos ? ent.headPos() : ent.pos;
      this.v.set(hp.x, hp.y + yOff, hp.z).project(cam);
      if (this.v.z > 1 || this.v.x < -1.2 || this.v.x > 1.2 || this.v.y < -1.2 || this.v.y > 1.2) return;
      const pl = this.plateFor(ent);
      if (pl.key !== key) { pl.key = key; pl.el.innerHTML = html; }
      const cl = 'plate ' + cls + (G.hovered === ent ? ' hover' : '');
      if (pl.cls !== cl) { pl.cls = cl; pl.el.className = cl; }
      const sc = Math.max(0.7, Math.min(1, 14 / Math.max(d, 1))) * (G.uiScale || 1);
      pl.el.style.transform = `translate(${((this.v.x * 0.5 + 0.5) * W).toFixed(1)}px, ${((-this.v.y * 0.5 + 0.5) * H).toFixed(1)}px) translate(-50%, -100%) scale(${sc.toFixed(2)})`;
      pl.el.style.display = '';
    };
    const P = G.player;
    if (!P.inHouse) show(P, `<div class="guild">[Roumen]</div><div class="nm"><span class="ttl">${P.title}</span>${P.name}</div>`, 'p' + P.title + P.name, 0.3, 999);
    else show(P, `<div class="rest">${P.name} Resting</div>`, 'house' + P.name, 0.9, 999);
    for (const n of G.npcs.list) show(n, `<div class="npcttl">&lt;${n.title}&gt;</div><div class="nm">${n.name}</div>`, 'n' + n.id, 0.2, 40);
    for (const m of G.monsters.list) {
      if (m.dead) continue;
      const cls = levelColorClass(m.level, P.level);
      const hurt = m.hp < m.stats.maxHp || P.target === m;
      const pct = Math.round((m.hp / m.stats.maxHp) * 100);
      show(m, `<div class="nm ${cls}">${m.name} <small>Lv.${m.level}</small></div>${hurt ? `<div class="mhp"><div style="width:${pct}%"></div></div>` : ''}`, `m${cls}${hurt ? pct : ''}`, 0.15, 32);
    }
    for (const l of G.loot.list) show(l, `<div class="nm">${l.label}</div>`, 'l' + l.label, 0.7, 14, 'loot');
    for (const pt of G.portals || []) show(pt, `<div class="npcttl">&lt;Portal&gt;</div><div class="nm">${pt.name}</div>`, 'pt' + pt.id, 0.2, 45);
    for (const [ent, p] of this.map) {
      if (!p.used) {
        if (ent.removed || (ent.dead && !ent.isPlayer)) { p.el.remove(); this.map.delete(ent); }
        else p.el.style.display = 'none';
      }
    }
  }
}

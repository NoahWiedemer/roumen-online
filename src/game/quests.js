// Quest log: availability, progress tracking, turn-in
import { QUESTS, ITEMS, MONSTERS } from './data.js';
import { G } from './game.js';

export class QuestLog {
  constructor() {
    this.active = {};     // id -> { progress }
    this.done = new Set();
    G.on('monsterKilled', (m) => this.onKill(m));
    G.on('inventory', () => this.refresh());
    G.on('levelup', () => this.refresh());
  }
  serialize() { return { active: this.active, done: [...this.done] }; }
  load(d) {
    if (!d) return;
    this.active = d.active || {};
    this.done = new Set(d.done || []);
  }

  isAvailable(id) {
    const q = QUESTS[id];
    if (this.done.has(id) || this.active[id]) return false;
    if (G.player.level < q.level) return false;
    if (q.requires && !q.requires.every((r) => this.done.has(r))) return false;
    return true;
  }
  isComplete(id) {
    const q = QUESTS[id], a = this.active[id];
    if (!a) return false;
    const g = q.goal;
    if (g.type === 'kill') return a.progress >= g.count;
    if (g.type === 'collect') return G.player.countItem(g.item) >= g.count;
    if (g.type === 'talk') return true;
    return false;
  }
  progressText(id) {
    const q = QUESTS[id], a = this.active[id];
    const g = q.goal;
    if (g.type === 'kill') return `${MONSTERS[g.target]?.name || cap(g.target)} defeated: ${Math.min(a ? a.progress : 0, g.count)} / ${g.count}`;
    if (g.type === 'collect') return `${ITEMS[g.item].name}: ${Math.min(G.player.countItem(g.item), g.count)} / ${g.count}`;
    if (g.type === 'talk') return `Talk to ${G.npcs.get(g.npc)?.title || ''} ${G.npcs.get(g.npc)?.name || ''}`;
    return '';
  }
  // quests this NPC can give or accept
  forNpc(npcId) {
    const out = [];
    for (const [id, q] of Object.entries(QUESTS)) {
      const turnin = q.turnin || q.giver;
      if (this.active[id] && turnin === npcId) out.push({ id, q, state: this.isComplete(id) ? 'complete' : 'active' });
      else if (q.giver === npcId && this.isAvailable(id)) out.push({ id, q, state: 'available' });
    }
    return out;
  }
  markerFor(npcId) {
    const l = this.forNpc(npcId);
    if (l.some((x) => x.state === 'complete')) return 'complete';
    if (l.some((x) => x.state === 'available')) return 'available';
    if (l.some((x) => x.state === 'active')) return 'active';
    return null;
  }
  accept(id) {
    if (!this.isAvailable(id)) return;
    this.active[id] = { progress: 0 };
    G.msg(`Quest accepted: ${QUESTS[id].name}`, 'quest');
    G.audio.play('quest');
    this.refresh();
  }
  complete(id) {
    if (!this.isComplete(id)) return false;
    const q = QUESTS[id];
    const p = G.player;
    const items = q.reward.items || [];
    if (p.freeSlots() < items.length) { G.msg('Make room in your inventory first.', 'warn'); return false; }
    if (q.goal.type === 'collect') p.removeItem(q.goal.item, q.goal.count);
    delete this.active[id];
    this.done.add(id);
    G.msg(`Quest complete: ${q.name}`, 'quest');
    G.audio.play('quest');
    if (q.reward.copper) { p.money += q.reward.copper; }
    for (const [it, n] of items) { p.addItem(it, n); G.msg(`Obtained ${ITEMS[it].name}${n > 1 ? ' x' + n : ''}.`, 'loot'); }
    if (q.reward.exp) p.gainExp(q.reward.exp);
    G.fx.pillar(p.pos.clone(), '#8affc0', 1.4, 0.7, 5);
    this.refresh();
    p.save();
    return true;
  }
  onKill(m) {
    let changed = false;
    for (const [id, a] of Object.entries(this.active)) {
      const g = QUESTS[id].goal;
      if (g.type === 'kill' && g.target === m.type && a.progress < g.count) {
        a.progress++;
        changed = true;
        G.msg(`${QUESTS[id].name}: ${this.progressText(id)}`, 'quest');
        if (a.progress === g.count) G.audio.play('quest');
      }
    }
    if (changed) this.refresh();
  }
  refresh() {
    if (G.npcs) G.npcs.refreshMarkers();
    G.emit('quests');
  }
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

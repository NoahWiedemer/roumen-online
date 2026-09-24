// Global game singleton + tiny event bus
export const G = {
  engine: null, scene: null, camera: null, terrain: null, colliders: null, nav: null,
  input: null, cam: null, audio: null, fx: null, ui: null,
  player: null, monsters: null, npcs: null, loot: null, quests: null,
  time: 0,
  hovered: null,
  _listeners: new Map(),
  on(ev, fn) {
    if (!this._listeners.has(ev)) this._listeners.set(ev, []);
    this._listeners.get(ev).push(fn);
  },
  emit(ev, data) {
    const l = this._listeners.get(ev);
    if (l) for (const fn of l) fn(data);
  },
  // system message (bottom-right log)
  msg(text, color = 'sys') { this.emit('message', { text, color }); },
};

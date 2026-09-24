// Keyboard + mouse input with click / double-click / right-drag detection
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();   // keys pressed this frame
    this.mouse = { x: 0, y: 0, nx: 0, ny: 0, inside: false };
    this.buttons = new Set();
    this.clicks = [];           // queued {x, y, button, double}
    this.dragDX = 0; this.dragDY = 0; this.wheel = 0;
    this.leftHeld = false;
    this._down = null;
    this._lastClick = { t: 0, x: 0, y: 0 };
    this.rightDragging = false;
    this.handlers = {};

    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      const k = normKey(e);
      if (!this.keys.has(k)) this.pressed.add(k);
      this.keys.add(k);
      if (['Tab', 'Space', 'F1', 'F2', 'F3', 'F4', 'F5', 'F10', 'Home', 'PageUp', 'PageDown', 'ArrowUp', 'ArrowDown'].includes(k) || (e.ctrlKey && k === 'KeyW')) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(normKey(e));
      if (e.code && e.code.startsWith('Key')) this.keys.delete(e.code); // shift/case safety
    });
    window.addEventListener('blur', () => { this.keys.clear(); this.buttons.clear(); this.rightDragging = false; this.leftHeld = false; });

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointerdown', (e) => {
      this.buttons.add(e.button);
      this._down = { x: e.clientX, y: e.clientY, button: e.button, t: performance.now(), moved: 0 };
      if (e.button === 2) canvas.setPointerCapture(e.pointerId);
      if (e.button === 0) this.leftHeld = true;
    });
    window.addEventListener('pointermove', (e) => {
      const dx = e.movementX || 0, dy = e.movementY || 0;
      this.mouse.x = e.clientX; this.mouse.y = e.clientY;
      this.mouse.nx = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouse.ny = -(e.clientY / window.innerHeight) * 2 + 1;
      this.mouse.overCanvas = e.target === canvas;
      if (this._down) {
        this._down.moved += Math.abs(dx) + Math.abs(dy);
        if (this.buttons.has(2) && this._down.moved > 3) {
          this.rightDragging = true;
          this.dragDX += dx; this.dragDY += dy;
        }
      }
    });
    window.addEventListener('pointerup', (e) => {
      const d = this._down;
      this.buttons.delete(e.button);
      if (e.button === 0) this.leftHeld = false;
      if (d && d.button === e.button && e.target === canvas) {
        if (d.moved < 6) {
          const now = performance.now();
          const lc = this._lastClick;
          const dbl = e.button === 0 && now - lc.t < 320 && Math.hypot(e.clientX - lc.x, e.clientY - lc.y) < 8;
          this.clicks.push({ x: e.clientX, y: e.clientY, button: e.button, double: dbl });
          if (e.button === 0) this._lastClick = dbl ? { t: 0, x: 0, y: 0 } : { t: now, x: e.clientX, y: e.clientY };
        }
      }
      if (e.button === 2) this.rightDragging = false;
      this._down = null;
    });
    canvas.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
  }
  down(k) { return this.keys.has(k); }
  wasPressed(k) { return this.pressed.has(k); }
  consumeClicks() { const c = this.clicks; this.clicks = []; return c; }
  endFrame() { this.pressed.clear(); this.dragDX = 0; this.dragDY = 0; this.wheel = 0; }
}

function normKey(e) {
  if (e.code === 'Space') return 'Space';
  // letters follow the keyboard layout (so Z/Y etc. match the printed key on QWERTZ)
  if (e.key && e.key.length === 1 && /[a-z]/i.test(e.key)) return 'Key' + e.key.toUpperCase();
  return e.code || e.key;
}

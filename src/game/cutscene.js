// Cutscenes: black bars, a dialogue box (speaker, title, typewriter text) and a scripted camera. While one runs
// (G.cutscene) the hero cannot be steered and the follow camera is overridden; Space / Enter / a click shows the
// whole line or goes on, Escape skips the rest. When it ends the camera glides back behind the hero.
// A step: { say: { who, title, text }, shot: { pos, look, from?: { pos, look }, dur }, run(cs), tick(cs, dt),
//           until(cs), wait, auto: false (only on input), skip(cs) (when skipped before it ran) }
// flash(color) is a full-screen flash for teleports etc. (also outside cutscenes).
import * as THREE from 'three';
import { G } from './game.js';
import { smoothstep } from '../core/utils.js';

let dom = null;
function ui() {
  if (dom) return dom;
  const root = document.createElement('div');
  root.id = 'cutscene';
  root.innerHTML = '<div class="cs-bar top"></div><div class="cs-bar bottom"></div>'
    + '<div class="cs-box"><div class="cs-who"><b></b><span></span></div><div class="cs-text"></div><div class="cs-next">&#9660;</div></div>'
    + '<div class="cs-skip">Esc &nbsp;skip</div>';
  const fl = document.createElement('div');
  fl.id = 'cs-flash';
  document.body.appendChild(root);
  document.body.appendChild(fl);
  dom = { root, fl, box: root.querySelector('.cs-box'), who: root.querySelector('.cs-who b'), title: root.querySelector('.cs-who span'), text: root.querySelector('.cs-text'), next: root.querySelector('.cs-next') };
  return dom;
}

// full-screen flash: in quickly, hold, fade out (returns a promise that resolves at the peak)
export function flash(color = '#ffffff', { rise = 0.12, hold = 0.2, fade = 0.7 } = {}) {
  const f = ui().fl;
  f.style.background = color;
  f.style.transition = `opacity ${rise}s ease-in`;
  f.style.opacity = '1';
  return new Promise((resolve) => setTimeout(() => {
    resolve();
    setTimeout(() => { f.style.transition = `opacity ${fade}s ease-out`; f.style.opacity = '0'; }, hold * 1000);
  }, rise * 1000));
}

const _d = new THREE.Vector3(), _p = new THREE.Vector3(), _l = new THREE.Vector3();
const v3 = (a) => (a.isVector3 ? a.clone() : new THREE.Vector3(a[0], a[1], a[2]));

export class Cutscene {
  constructor(steps, { onEnd = null, onSkip = null } = {}) {
    this.steps = steps;
    this.onEnd = onEnd; this.onSkip = onSkip;
    this.i = -1;
    this.locked = true;
    this.pos = new THREE.Vector3(); this.look = new THREE.Vector3();
    this.shot = null;
    this.outro = -1;
  }

  play() {
    if (G.cutscene) G.cutscene.finish(true);
    G.cutscene = this;
    const d = ui();
    d.root.classList.add('on');
    document.body.classList.add('in-cutscene');
    const c = G.engine.camera;
    this.pos.copy(c.position);
    c.getWorldDirection(_d);
    this.look.copy(c.position).addScaledVector(_d, 10);
    const p = G.player;
    if (p) { p.stopActions(); p.setTarget(null); }
    this.next();
    return new Promise((resolve) => { this._resolve = resolve; });
  }

  next() {
    this.i++;
    const s = this.steps[this.i];
    const d = ui();
    if (!s) { this.finish(false); return; }
    this.step = s; this.t = 0; this.typed = 0;
    if (s.run) s.run(this);
    if (s.shot) this.setShot(s.shot);
    this.full = s.say ? s.say.text : '';
    if (s.say) {
      d.box.classList.add('show');
      d.who.textContent = s.say.who || '';
      d.title.textContent = s.say.title || '';
      d.text.textContent = '';
    } else d.box.classList.remove('show');
  }
  // move the camera from where it is (or `from`) to pos / look over dur seconds
  setShot(sh) {
    const f = sh.from || { pos: this.pos.clone(), look: this.look.clone() };
    this.shot = { from: { pos: v3(f.pos), look: v3(f.look) }, pos: v3(sh.pos), look: v3(sh.look), dur: sh.dur ?? 1.2, t: 0, drift: sh.drift ? v3(sh.drift) : null };
  }

  update(dt) {
    const inp = G.input;
    if (this.outro >= 0) return;
    let adv = inp.consumeClicks().length > 0;
    if (inp.wasPressed('Space') || inp.wasPressed('Enter')) adv = true;
    if (inp.wasPressed('Escape')) { this.skip(); return; }
    const s = this.step;
    if (!s) return;
    this.t += dt;
    if (s.tick) s.tick(this, dt);
    if (this.step !== s || this.outro >= 0) return;
    const d = ui();
    if (this.full) {
      const before = this.typed | 0;
      this.typed = Math.min(this.full.length, this.typed + dt * 40);
      if ((this.typed | 0) !== before) d.text.textContent = this.full.slice(0, this.typed | 0);
    }
    const lineDone = !this.full || this.typed >= this.full.length;
    if (adv && !lineDone) { this.typed = this.full.length; d.text.textContent = this.full; adv = false; }
    d.next.style.visibility = lineDone && this.full ? 'visible' : 'hidden';
    const auto = s.wait ?? (this.full ? 1.6 + this.full.length * 0.045 : (s.shot ? s.shot.dur ?? 1.2 : 0));
    const ready = !s.until || s.until(this);
    if (ready && lineDone && (adv || (s.auto !== false && this.t >= auto))) this.next();
  }

  // (after the follow camera has placed itself) scripted shot, or the glide back at the end
  applyCamera(dt) {
    const cam = G.engine.camera;
    if (this.outro >= 0) {
      this.outro += dt;
      const k = smoothstep(0, 0.9, this.outro);
      cam.getWorldDirection(_d);
      _l.copy(cam.position).addScaledVector(_d, 10);
      _p.copy(this.pos).lerp(cam.position, k);
      _l.lerp(this.look, 1 - k);
      cam.position.copy(_p);
      cam.lookAt(_l);
      if (this.outro >= 0.9) this.end();
      return;
    }
    const sh = this.shot;
    if (sh) {
      sh.t += dt;
      const k = smoothstep(0, 1, Math.min(1, sh.t / sh.dur));
      this.pos.lerpVectors(sh.from.pos, sh.pos, k);
      this.look.lerpVectors(sh.from.look, sh.look, k);
      if (sh.drift && sh.t > sh.dur) this.pos.addScaledVector(sh.drift, Math.min(sh.t - sh.dur, 8) * 1);
    }
    cam.position.copy(this.pos);
    cam.lookAt(this.look);
  }

  skip() {
    if (this.onSkip) this.onSkip(this);
    // run the remaining steps' skip handlers so the scene ends in its final state
    for (let i = this.i + 1; i < this.steps.length; i++) this.steps[i].skip?.(this);
    this.finish(true);
  }
  finish(skipped) {
    if (this.outro >= 0) return;
    const d = ui();
    d.root.classList.remove('on');
    d.box.classList.remove('show');
    document.body.classList.remove('in-cutscene');
    this.locked = false;
    this.skipped = skipped;
    this.outro = 0;
    if (G.cam && G.player) G.cam.snap(G.player.pos);
    if (this.onEnd) this.onEnd(this);
  }
  end() {
    if (G.cutscene === this) G.cutscene = null;
    this._resolve && this._resolve(this.skipped);
  }
}

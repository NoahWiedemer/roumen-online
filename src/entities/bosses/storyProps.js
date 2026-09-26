// The props of Vagel's story (vagelStory.js): the actors (Sir Ratman and Prince Ratman as skinned NPC rigs under the
// story's control), the cage of gold and violet light that holds the prince, the rift Sir Ratman steps out of, the
// Robo S-Card, the Beast Blessing glowing around the hero, the spirit of Robo that the card calls up, and the treasure
// chest the goddess leaves behind. Everything is placed in world coordinates under the Tower of Isel's root group.
import * as THREE from 'three';
import { createNpcRig, npcModelReady } from '../npcModels.js';
import { Animator } from '../anim.js';
import { tex, makeCanvas, toTexture } from '../../core/textures.js';
import { clamp, dampAngle, smoothstep, mulberry32 } from '../../core/utils.js';
import { ITEMS, MONSTERS } from '../../game/data.js';
import { moneyText } from '../loot.js';
import { G } from '../../game/game.js';

const TAU = Math.PI * 2;
const BASE = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '/';
const GOLD = new THREE.Color('#ffd24a'), VIOLET = new THREE.Color('#b04aff'), PALE = new THREE.Color('#fff4d0'), MINT = new THREE.Color('#9affd0');
const _v = new THREE.Vector3(), _w = new THREE.Vector3();

const glowSprite = (color, size, { map = tex('glow'), opacity = 0 } = {}) => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, color: new THREE.Color(color), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity }));
  s.scale.setScalar(size);
  return s;
};
const disposeTree = (o) => o.traverse((c) => {
  if (c.geometry) c.geometry.dispose();
  if (c.material) for (const m of [].concat(c.material)) m.dispose();
});

// ------------------------------------------------------------------ an actor: a skinned NPC rig the story steers
// (env: the Tower's { terrain, colliders } — the story is built before the hero enters, while G still points at
// another world)
export class Actor {
  constructor(model, parent, env, { scale, pose, name } = {}) {
    this.model = model;
    this.env = env;
    this.rig = createNpcRig(model, { name: name || 'story:' + model, scale });
    this.anim = new Animator(this.rig, { idlePose: pose, gait: 'free' });
    this.root = this.rig.root;
    this.height = this.rig.height;
    this.pos = new THREE.Vector3();
    this.rotY = 0; this.faceGoal = null;
    this.lift = 0;                  // metres above the floor (standing on the cage's plate)
    this.goal = null;
    this.opacity = 1; this.shown = true;
    this.mat = this.rig.skinned.material.clone();   // (its own material: it can fade in and out)
    this.rig.skinned.material = this.mat;
    parent.add(this.root);
  }
  place(x, z, rotY = this.rotY) {
    this.pos.set(x, this.env.terrain.groundAt(x, z) + this.lift, z);
    this.rotY = rotY; this.faceGoal = null; this.goal = null;
    this.sync();
  }
  face(x, z) { this.faceGoal = Math.atan2(x - this.pos.x, z - this.pos.z); }
  walkTo(x, z, speed = 1.3, onArrive = null) { this.goal = { x, z, speed, onArrive }; }
  get arrived() { return !this.goal; }
  play(name, opts = {}) { return this.anim.play(name, { fadeIn: 0.25, fadeOut: 0.35, ...opts }); }
  setOpacity(a) {
    this.opacity = a;
    const m = this.mat, tr = a < 0.999;
    if (m.transparent !== tr) { m.transparent = tr; m.needsUpdate = true; }
    m.opacity = a;
    this.rig.skinned.castShadow = a > 0.6;
  }
  handWorld(side, out = new THREE.Vector3()) {
    const h = side === 'L' ? this.rig.weaponHolderL : this.rig.weaponHolder;
    if (!h) return out.set(this.pos.x, this.pos.y + this.height * 0.6, this.pos.z);
    h.updateWorldMatrix(true, false);
    return h.getWorldPosition(out);
  }
  update(dt) {
    let v = 0;
    const g = this.goal;
    if (g) {
      const dx = g.x - this.pos.x, dz = g.z - this.pos.z, d = Math.hypot(dx, dz);
      if (d < 0.06) { this.goal = null; if (g.onArrive) g.onArrive(); }
      else {
        const step = Math.min(d, g.speed * dt);
        this.pos.x += (dx / d) * step; this.pos.z += (dz / d) * step;
        v = g.speed;
        this.rotY = dampAngle(this.rotY, Math.atan2(dx, dz), 8, dt);
      }
    }
    if (!v && this.faceGoal !== null) this.rotY = dampAngle(this.rotY, this.faceGoal, 5, dt);
    this.pos.y = this.env.terrain.groundAt(this.pos.x, this.pos.z) + this.lift;
    // (as the NPCs: a walk at ~0.36 of the locomotion blend, a run further up)
    const a = this.anim, want = v > 0 ? clamp(0.36 + (v - 1.25) * 0.2, 0.36, 0.9) : 0;
    a.speed += (want - a.speed) * (1 - Math.exp(-8 * dt));
    a.groundSpeed = v; a.moveDir = 1;
    if (this.root.visible) a.update(dt, null);
    this.sync();
  }
  sync() { this.root.position.copy(this.pos); this.root.rotation.y = this.rotY; }
  // (visible where the hero can see it, while not faded out)
  show(on) { this.shown = on; this.root.visible = on && this.opacity > 0.01; }
  dispose() { this.root.removeFromParent(); this.mat.dispose(); }
}

// ------------------------------------------------------------------ the cage of gold and violet light
// A golden plate with a ring of runes, a birdcage of eight curved golden bars under a crown finial, a shell of shimmering
// barrier light inside the bars and two rings turning around it. In the throne room it stands on the dais; in the vault
// it hovers before the great hoard. It flickers and bursts when she falls (the bars fly apart).
const SHELL_VS = `varying vec3 vN; varying vec3 vView; varying vec3 vLocal;
  void main(){ vLocal = position; vec4 wp = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal);
    vView = cameraPosition - wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`;
const SHELL_FS = `uniform float uTime, uAlpha, uCrack; uniform vec3 uGold, uViolet; varying vec3 vN; varying vec3 vView; varying vec3 vLocal;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main(){
    vec3 n = normalize(vN), v = normalize(vView);
    float fres = pow(1.0 - abs(dot(n, v)), 2.2);
    // a lattice of little coins over the shell, each blinking on its own
    vec2 uv = vec2(atan(vLocal.z, vLocal.x) * 3.2, vLocal.y * 6.0);
    vec2 g = uv; g.x += mod(floor(g.y), 2.0) * 0.5;
    vec2 f = fract(g) - 0.5;
    float ring = smoothstep(0.36, 0.44, length(f)) * (1.0 - smoothstep(0.44, 0.5, length(f)));
    float blink = 0.5 + 0.5 * sin(uTime * 2.2 + hash(floor(g)) * 6.28);
    float band = smoothstep(0.82, 1.0, sin(vLocal.y * 8.0 - uTime * 2.4));
    vec3 col = mix(uViolet, uGold, 0.4 + 0.35 * sin(vLocal.y * 2.3 + uTime * 0.7));
    float crack = uCrack * (0.6 + 0.4 * sin(uTime * 40.0 + vLocal.y * 30.0));
    float a = 0.02 + fres * 0.75 + ring * (0.12 + 0.6 * uCrack) * blink + band * 0.14 + crack * 0.3;
    col += vec3(1.0, 0.95, 0.85) * (ring * uCrack + crack * 0.4);
    gl_FragColor = vec4(col * (0.55 + 0.9 * fres), clamp(a, 0.0, 1.0) * uAlpha);
  }`;
let runeTexture = null;
function runeTex() {
  if (runeTexture) return runeTexture;
  const S = 512, c = makeCanvas(S), g = c.getContext('2d'), rng = mulberry32(606);
  g.translate(S / 2, S / 2);
  g.strokeStyle = g.fillStyle = '#ffffff'; g.lineCap = 'round';
  g.shadowColor = '#ffffff'; g.shadowBlur = 8;
  const ring = (r, w) => { g.lineWidth = w; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke(); };
  ring(246, 5); ring(232, 2); ring(168, 3); ring(158, 1.5);
  for (let i = 0; i < 24; i++) {
    g.save(); g.rotate((i / 24) * TAU); g.translate(0, -200);
    g.lineWidth = 3; g.beginPath();
    for (let k = 0; k < 3; k++) { g.moveTo((rng() * 2 - 1) * 12, (rng() * 2 - 1) * 16); g.lineTo((rng() * 2 - 1) * 12, (rng() * 2 - 1) * 16); }
    g.stroke(); g.restore();
  }
  // a chain of coins round the middle, the crown of greed in it
  for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; g.lineWidth = 2.5; g.beginPath(); g.arc(Math.cos(a) * 110, Math.sin(a) * 110, 14, 0, TAU); g.stroke(); }
  g.lineWidth = 5;
  g.beginPath(); g.moveTo(-48, 26); g.lineTo(-48, -14); g.lineTo(-24, 6); g.lineTo(0, -34); g.lineTo(24, 6); g.lineTo(48, -14); g.lineTo(48, 26); g.closePath(); g.stroke();
  runeTexture = toTexture(c, { repeat: false });
  return runeTexture;
}

export class Prison {
  constructor(parent, env) {
    this.env = env;
    this.group = new THREE.Group();
    this.group.name = 'story:prison';
    this.inner = new THREE.Group();            // (bobs while it hovers)
    this.group.add(this.inner);
    parent.add(this.group);
    const gold = this.gold = new THREE.MeshStandardMaterial({ color: '#e8b04a', metalness: 0.9, roughness: 0.28, emissive: '#5a3a08', emissiveIntensity: 0.7 });
    const gem = new THREE.MeshStandardMaterial({ color: '#b060ff', emissive: '#9030ff', emissiveIntensity: 1.8, roughness: 0.15, flatShading: true });
    // the plate and its runes
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(1.32, 1.42, 0.16, 48), gold);
    plate.position.y = 0.08;
    plate.castShadow = plate.receiveShadow = true;
    this.runeMat = new THREE.MeshBasicMaterial({ map: runeTex(), color: '#e0a0ff', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const runes = new THREE.Mesh(new THREE.CircleGeometry(1.28, 48).rotateX(-Math.PI / 2), this.runeMat);
    runes.position.y = 0.165;
    this.runes = runes;
    this.inner.add(plate, runes);
    // the bars: eight curves from the rim of the plate up to the crown ring
    const curve = new THREE.CatmullRomCurve3([[1.18, 0.12], [1.26, 0.9], [1.24, 1.75], [1.04, 2.45], [0.62, 2.9], [0.26, 3.08]].map(([r, y]) => new THREE.Vector3(r, y, 0)));
    const barGeo = new THREE.TubeGeometry(curve, 28, 0.04, 6);
    this.bars = [];
    for (let i = 0; i < 8; i++) {
      const b = new THREE.Mesh(barGeo, gold);
      b.rotation.y = (i / 8) * TAU;
      b.castShadow = true;
      this.inner.add(b);
      this.bars.push(b);
    }
    const crown = new THREE.Group();
    crown.position.y = 3.08;
    crown.add(new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.05, 8, 24).rotateX(Math.PI / 2), gold));
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.42, 8), gold);
    tip.position.y = 0.24;
    const g1 = new THREE.Mesh(new THREE.OctahedronGeometry(0.13, 0), gem);
    g1.position.y = 0.56; g1.scale.y = 1.4;
    crown.add(tip, g1);
    this.crown = crown;
    this.inner.add(crown);
    // the barrier: a shell of light inside the bars
    this.shellMat = new THREE.ShaderMaterial({
      vertexShader: SHELL_VS, fragmentShader: SHELL_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uAlpha: { value: 1 }, uCrack: { value: 0 }, uGold: { value: new THREE.Color('#ffc850') }, uViolet: { value: new THREE.Color('#a040ff') } },
    });
    const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), this.shellMat);
    shell.scale.set(1.16, 1.5, 1.16);
    shell.position.y = 1.5;
    shell.renderOrder = 6;
    this.shell = shell;
    this.inner.add(shell);
    // two thin rings turning round it (below his waist and over his head), and a glow on the plate
    this.ringMat = new THREE.MeshBasicMaterial({ color: '#ffd878', transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
    this.rings = [1.5, 1.2].map((r, i) => {
      const t = new THREE.Group();
      const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.02, 6, 96).rotateX(Math.PI / 2), this.ringMat);
      t.add(m);
      t.position.y = i ? 2.72 : 0.72;
      t.rotation.set(i ? -0.28 : 0.22, 0, i ? 0.12 : -0.18);
      this.inner.add(t);
      return { t, m };
    });
    this.glow = glowSprite('#c080ff', 4.2, { opacity: 0.45 });
    this.glow.position.y = 1.4;
    this.inner.add(this.glow);
    this.motes = [0, 1, 2, 3, 4, 5].map((i) => { const s = glowSprite(i % 2 ? '#ffd870' : '#d090ff', 0.32, { opacity: 0.9 }); this.inner.add(s); return s; });
    this.where = null;
    this.hover = 0;
    this.t = 0;
    this.crack = 0; this.breakT = -1; this.gone = false;
    this.collider = null;
  }
  // stand it on the throne room's dais or hover it before the great hoard in the vault
  place(where, x, z) {
    this.where = where;
    this.hover = where === 'vault' ? 0.7 : 0;
    this.group.position.set(x, this.env.terrain.groundAt(x, z), z);
    const C = this.env.colliders;
    C.remove(this.collider);
    this.collider = C.addCircle(x, z, 1.35);
  }
  // where the prince's feet go
  floorY() { return this.group.position.y + this.inner.position.y + 0.16; }
  center(out = new THREE.Vector3()) { return out.set(this.group.position.x, this.floorY() + 1.35, this.group.position.z); }
  update(dt) {
    this.t += dt;
    const t = this.t;
    this.inner.position.y = this.hover ? this.hover + Math.sin(t * 1.3) * 0.12 : 0;
    this.shellMat.uniforms.uTime.value = t;
    this.rings[0].t.rotation.y = t * 0.6; this.rings[1].t.rotation.y = -t * 0.45;
    this.runes.rotation.y = -t * 0.15;
    this.motes.forEach((s, i) => {
      const a = t * (0.7 + i * 0.05) + (i / 6) * TAU;
      s.position.set(Math.cos(a) * 1.5, 0.6 + ((t * 0.35 + i / 6) % 1) * 2.4, Math.sin(a) * 1.5);
    });
    this.crown.rotation.y = t * 0.3;
    // cracking, then bursting
    if (this.breakT >= 0) {
      this.breakT += dt;
      const bt = this.breakT;
      if (bt < 1.1) {
        this.crack = smoothstep(0, 1.1, bt);
        this.shellMat.uniforms.uAlpha.value = 0.7 + 0.3 * Math.sin(bt * 60) * this.crack;
        this.inner.position.x = (Math.random() - 0.5) * 0.06 * this.crack;
      } else {
        if (!this.burst) this.burstNow();
        const k = clamp((bt - 1.1) / 0.35, 0, 1);
        this.shell.scale.set(1.16 + k * 0.6, 1.5 + k * 0.7, 1.16 + k * 0.6);
        this.shellMat.uniforms.uAlpha.value = 1 - k;
        this.ringMat.opacity = 0.8 * (1 - k);
        this.glow.material.opacity = 0.45 * (1 - k);
        for (const s of this.motes) s.material.opacity = 1 - k;
        // the bars fly apart and fall, the plate dims and sinks
        for (const b of this.bars) {
          const d = b.userData;
          d.vy -= 9.8 * dt;
          b.position.x += d.vx * dt; b.position.y += d.vy * dt; b.position.z += d.vz * dt;
          b.rotation.x += d.sx * dt; b.rotation.z += d.sz * dt;
        }
        this.crown.position.y += this.crownV * dt; this.crownV -= 9.8 * dt;
        const fade = clamp((bt - 1.6) / 1.2, 0, 1);
        if (fade > 0) {
          if (!this.gold.transparent) { this.gold.transparent = true; this.gold.needsUpdate = true; }
          this.gold.opacity = 1 - fade;
          this.runeMat.opacity = 0.85 * (1 - fade);
        }
        if (bt > 2.9) { this.gone = true; this.group.visible = false; }
      }
      this.shellMat.uniforms.uCrack.value = this.crack;
    }
  }
  shatter() { if (this.breakT < 0) { this.breakT = 0; G.audio.play('chain'); } }
  burstNow() {
    this.burst = true;
    const c = this.center();
    G.audio.play('shatter'); G.audio.play('boltHit');
    G.fx.particles.burst(c.x, c.y, c.z, 80, { color: GOLD, speed: 8, life: 0.9, size: 0.4, grav: -6, up: 0.4 });
    G.fx.particles.burst(c.x, c.y, c.z, 50, { color: VIOLET, speed: 6, life: 1.1, size: 0.5, grav: -2, up: 0.6 });
    G.fx.ring(new THREE.Vector3(c.x, this.group.position.y, c.z), { color: '#e0b0ff', from: 0.5, to: 7, life: 0.6 });
    G.fx.hitSpark(c, '#fff0c0', true);
    for (const b of this.bars) {
      const a = b.rotation.y;
      b.userData = { vx: Math.cos(a) * (2.5 + Math.random() * 2), vy: 2 + Math.random() * 2.5, vz: -Math.sin(a) * (2.5 + Math.random() * 2), sx: (Math.random() - 0.5) * 6, sz: (Math.random() - 0.5) * 6 };
    }
    this.crownV = 4;
    this.env.colliders.remove(this.collider);
    this.collider = null;
  }
  // (the cage stands in the way: her blinks and aimed spells keep clear of it)
  blocks(x, z, r) { return !this.gone && !!this.where && Math.hypot(x - this.group.position.x, z - this.group.position.z) < 1.4 + r; }
  dispose() {
    this.env.colliders.remove(this.collider);
    this.group.removeFromParent();
    disposeTree(this.group);
  }
}

// ------------------------------------------------------------------ the rift Sir Ratman steps out of
// A tear in the air, taller than he is: a jagged, glowing seam that opens onto swirling mist-green light. Turned to the
// camera around the vertical.
const RIFT_FS = `uniform float uTime, uOpen; varying vec2 vUv;
  float hash(float n){ return fract(sin(n) * 43758.5453); }
  float noise(float x){ float i = floor(x), f = fract(x); return mix(hash(i), hash(i + 1.0), f * f * (3.0 - 2.0 * f)); }
  void main(){
    vec2 p = vUv * 2.0 - 1.0;
    float prof = pow(max(1.0 - p.y * p.y, 0.0), 0.7);
    float jag = (noise(p.y * 9.0 + 3.0) - 0.5) * 0.3 + (noise(p.y * 23.0 - uTime * 3.0) - 0.5) * 0.08;
    float w = uOpen * 0.5 * prof;
    float d = abs(p.x - jag * prof) - w;
    float inside = 1.0 - smoothstep(-0.015, 0.015, d);
    float edge = exp(-abs(d) * 22.0) * prof * min(1.0, uOpen * 3.0);
    float sw = sin(atan(p.y, p.x - jag) * 5.0 + length(p) * 10.0 - uTime * 4.0);
    float mid = 1.0 - clamp(abs(p.x - jag * prof) / max(w, 0.001), 0.0, 1.0);    // 1 in the middle of the seam
    vec3 deep = vec3(0.01, 0.04, 0.04);
    vec3 col = mix(deep, vec3(0.3, 0.9, 0.7), smoothstep(0.55, 1.0, sw) * 0.3) * inside;
    col += vec3(0.55, 1.0, 0.82) * pow(1.0 - mid, 3.0) * inside * 0.7;           // (the lips of the tear glow)
    col += vec3(0.9, 1.0, 0.95) * edge * 2.2;
    gl_FragColor = vec4(col, clamp(inside * 0.96 + edge, 0.0, 1.0));
    #include <colorspace_fragment>
  }`;
export class Rift {
  constructor(parent) {
    this.mat = new THREE.ShaderMaterial({
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: RIFT_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 }, uOpen: { value: 0 } },
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 4.6), this.mat);
    this.mesh.renderOrder = 6;
    this.glow = glowSprite('#8affc8', 6);
    this.group = new THREE.Group();
    this.group.add(this.mesh, this.glow);
    this.group.visible = false;
    parent.add(this.group);
    this.open = 0; this.target = 0; this.t = 0;
  }
  openAt(x, z) {
    this.group.position.set(x, G.terrain.groundAt(x, z) + 2.35, z);
    this.target = 1;
    G.audio.play('rift');
  }
  close() { if (this.target) { this.target = 0; G.audio.play('teleport'); } }
  update(dt) {
    this.t += dt;
    this.open += (this.target - this.open) * (1 - Math.exp(-(this.target ? 2.2 : 4.5) * dt));
    const on = this.open > 0.005;
    this.group.visible = on;
    if (!on) return;
    this.mat.uniforms.uTime.value = this.t;
    this.mat.uniforms.uOpen.value = this.open;
    this.glow.material.opacity = this.open * 0.5;
    const cam = G.engine.camera.position, P = this.group.position;
    this.group.rotation.y = Math.atan2(cam.x - P.x, cam.z - P.z);
    if (Math.random() < dt * 30 * this.open) {
      const y = (Math.random() * 2 - 1) * 2 * this.open;
      const s = Math.sin(this.group.rotation.y), c = Math.cos(this.group.rotation.y);
      const off = (Math.random() - 0.5) * 0.6 * this.open;
      G.fx.particles.emit({ x: P.x + c * off, y: P.y + y, z: P.z - s * off, vx: c * (Math.random() - 0.5) * 3, vy: (Math.random() - 0.3) * 1.5, vz: -s * (Math.random() - 0.5) * 3, life: 0.9, size: 0.25, color: Math.random() < 0.7 ? MINT : PALE, grav: 0, drag: 1.2 });
    }
  }
  get visible() { return this.group.visible; }
  dispose() { this.group.removeFromParent(); disposeTree(this.group); }
}

// ------------------------------------------------------------------ the Robo S-Card
// public/textures/robo_card.webp is a screenshot of the card: its gold frame is cut out and drawn with round corners
// onto the front; the back is painted here (violet field, a golden S among seven stars).
const CARD_CROP = { x: 35, y: 22, w: 977, h: 1500 };   // (the card's outer gold edge inside the screenshot, pixels)
let cardFront = null, cardBack = null, raysTexture = null;
function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
export function loadRoboCard() {
  if (cardFront) return Promise.resolve();
  cardBack = paintCardBack();
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const W = 512, H = 768, c = makeCanvas(W, H), g = c.getContext('2d');
      roundRect(g, 0, 0, W, H, 22); g.clip();
      g.drawImage(img, CARD_CROP.x, CARD_CROP.y, CARD_CROP.w, CARD_CROP.h, 0, 0, W, H);
      cardFront = toTexture(c, { repeat: false });
      resolve();
    };
    img.onerror = () => { console.warn('robo_card.webp missing'); resolve(); };
    img.src = BASE + 'textures/robo_card.webp';
  });
}
function paintCardBack() {
  const W = 512, H = 768, c = makeCanvas(W, H), g = c.getContext('2d');
  roundRect(g, 0, 0, W, H, 22); g.clip();
  const gold = g.createLinearGradient(0, 0, W, H);
  gold.addColorStop(0, '#fff0b0'); gold.addColorStop(0.35, '#d9a02a'); gold.addColorStop(0.6, '#ffe28a'); gold.addColorStop(1, '#8a5a10');
  g.fillStyle = gold; g.fillRect(0, 0, W, H);
  const field = g.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, H * 0.62);
  field.addColorStop(0, '#8a2ad0'); field.addColorStop(0.55, '#3a0e66'); field.addColorStop(1, '#140524');
  g.fillStyle = field; roundRect(g, 26, 26, W - 52, H - 52, 14); g.fill();
  g.strokeStyle = '#ffd86a'; g.lineWidth = 3; roundRect(g, 38, 38, W - 76, H - 76, 10); g.stroke();
  g.translate(W / 2, H / 2);
  g.strokeStyle = 'rgba(255, 220, 120, 0.8)';
  for (const [r, w] of [[190, 3], [172, 1.5], [120, 4]]) { g.lineWidth = w; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke(); }
  // seven stars round the emblem
  g.fillStyle = '#ffe070';
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + (i / 7) * TAU, x = Math.cos(a) * 150, y = Math.sin(a) * 150;
    g.beginPath();
    for (let k = 0; k < 10; k++) { const rr = k % 2 ? 7 : 17, b = -Math.PI / 2 + (k / 10) * TAU; g.lineTo(x + Math.cos(b) * rr, y + Math.sin(b) * rr); }
    g.closePath(); g.fill();
  }
  g.font = '900 170px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 10; g.strokeStyle = '#3a1a00'; g.strokeText('S', 0, 8);
  const sg = g.createLinearGradient(0, -80, 0, 90);
  sg.addColorStop(0, '#fff6c8'); sg.addColorStop(0.5, '#ffc53a'); sg.addColorStop(1, '#b0700a');
  g.fillStyle = sg; g.fillText('S', 0, 8);
  g.font = '800 30px Georgia, serif'; g.fillStyle = '#ffe28a';
  g.fillText('KING OF BEASTS', 0, 290);
  return toTexture(c, { repeat: false });
}
function raysTex() {
  if (raysTexture) return raysTexture;
  const S = 256, c = makeCanvas(S), g = c.getContext('2d');
  g.translate(S / 2, S / 2);
  for (let i = 0; i < 18; i++) {
    g.save(); g.rotate((i / 18) * TAU);
    const w = i % 2 ? 0.07 : 0.12;
    const gr = g.createLinearGradient(0, 0, 0, -S / 2);
    gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.sin(w) * S / 2, -Math.cos(w) * S / 2); g.lineTo(-Math.sin(w) * S / 2, -Math.cos(w) * S / 2); g.closePath(); g.fill();
    g.restore();
  }
  const rg = g.createRadialGradient(0, 0, 0, 0, 0, S / 2);
  rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.25, 'rgba(255,255,255,0.35)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg; g.fillRect(-S / 2, -S / 2, S, S);
  raysTexture = toTexture(c, { repeat: false });
  return raysTexture;
}

// Where the card is: held by an actor (follows a hand, faces a point), flying (an arc from one point to a moving
// target, spinning), or hidden. Its glow and the rays behind it rise for the big moments.
export class RoboCard {
  constructor(parent) {
    const W = 0.4, H = 0.6;
    this.edgeMat = new THREE.MeshStandardMaterial({ color: '#e8b64a', metalness: 0.9, roughness: 0.3, emissive: '#6a4a10', emissiveIntensity: 0.6 });
    const face = (map) => new THREE.MeshStandardMaterial({ map, roughness: 0.4, metalness: 0.05, emissive: '#ffffff', emissiveMap: map, emissiveIntensity: 0.3, alphaTest: 0.5, transparent: false });
    this.frontMat = face(cardFront); this.backMat = face(cardBack);
    this.mesh = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.012), [this.edgeMat, this.edgeMat, this.edgeMat, this.edgeMat, this.frontMat, this.backMat]);
    this.group = new THREE.Group();
    this.group.add(this.mesh);
    this.glowS = glowSprite('#ffd86a', 1.4);
    this.rays = glowSprite('#ffe6a0', 3.2, { map: raysTex() });
    this.rays.renderOrder = 4;
    parent.add(this.group, this.glowS, this.rays);
    this.hide();
    this.glow = 0; this.glowTarget = 0; this.raysK = 0; this.raysTarget = 0; this.t = 0;
    this.scale = 1;
  }
  hide() { this.mode = null; this.group.visible = false; this.glowTarget = 0; this.raysTarget = 0; this.fly = null; }
  // held: pos() gives the world position each frame, faceTo() the point its front turns to
  hold(pos, faceTo, { spin = 0, scale = 1 } = {}) {
    this.mode = 'hold'; this.pos = pos; this.faceTo = faceTo; this.spin = spin; this.scale = scale;
    this.group.visible = true;
  }
  // thrown: from `from` to where to() is, in `dur` seconds, a high arc, spinning like a shuriken
  throwTo(from, to, dur, onArrive) {
    this.mode = 'fly';
    this.fly = { from: from.clone(), to, dur, t: 0, onArrive, height: 2.2 + from.distanceTo(to()) * 0.08 };
    this.group.visible = true;
    G.audio.play('swing');
  }
  get flying() { return this.mode === 'fly'; }
  update(dt) {
    this.t += dt;
    this.glow += (this.glowTarget - this.glow) * (1 - Math.exp(-5 * dt));
    this.raysK += (this.raysTarget - this.raysK) * (1 - Math.exp(-4 * dt));
    const g = this.group, cam = G.engine.camera.position;
    if (this.mode === 'hold') {
      g.position.copy(this.pos());
      const f = this.faceTo();
      if (f) g.lookAt(f);
      if (this.spin) g.rotateY(this.t * this.spin);
      g.scale.setScalar(this.scale);
    } else if (this.mode === 'fly') {
      const F = this.fly;
      F.t += dt;
      const k = Math.min(1, F.t / F.dur), to = F.to();
      g.position.lerpVectors(F.from, to, k);
      g.position.y += Math.sin(k * Math.PI) * F.height;
      g.rotation.set(0.35, this.t * 16, 0.2);
      if (Math.random() < 0.7) G.fx.particles.emit({ x: g.position.x, y: g.position.y, z: g.position.z, vy: 0.2, life: 0.5, size: 0.3, color: Math.random() < 0.7 ? GOLD : PALE, grav: 0, drag: 2 });
      if (k >= 1) { this.mode = 'hold'; this.pos = () => to; this.faceTo = () => cam; const cb = F.onArrive; this.fly = null; if (cb) cb(); }
    }
    // glow and rays: just behind the card as seen from the camera
    const on = g.visible;
    _v.subVectors(cam, g.position).normalize();
    this.glowS.visible = on && this.glow > 0.01;
    this.glowS.position.copy(g.position).addScaledVector(_v, -0.05);
    this.glowS.material.opacity = this.glow * (0.75 + 0.25 * Math.sin(this.t * 9));
    this.glowS.scale.setScalar((1.1 + this.glow * 0.8) * this.scale);
    this.rays.visible = on && this.raysK > 0.01;
    this.rays.position.copy(g.position).addScaledVector(_v, -0.12);
    this.rays.material.opacity = this.raysK * 0.55;
    this.rays.material.rotation = this.t * 0.35;
    this.rays.scale.setScalar(2.7 * this.scale * (0.9 + this.raysK * 0.1));
    this.frontMat.emissiveIntensity = this.backMat.emissiveIntensity = 0.3 + this.glow * 0.5;
  }
  worldPos(out = new THREE.Vector3()) { return out.copy(this.group.position); }
  dispose() {
    for (const o of [this.group, this.glowS, this.rays]) o.removeFromParent();
    this.mesh.geometry.dispose();
    for (const m of [this.edgeMat, this.frontMat, this.backMat, this.glowS.material, this.rays.material]) m.dispose();
  }
}

// ------------------------------------------------------------------ the Beast Blessing around the hero
// A warm golden glow round the hero, a ring of light turning under their feet and golden motes rising from them
export class BeastAura {
  constructor() {
    this.k = 0; this.target = 0; this.t = 0;
    this.glow = glowSprite('#ffcf5a', 3.4);
    const decal = (size, color) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: G.fx.tex.magic, color: new THREE.Color(color), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.renderOrder = 3;
      return m;
    };
    this.ring = decal(3.4, '#ffd060');
    this.ring2 = decal(2.3, '#fff0b0');
    for (const o of [this.glow, this.ring, this.ring2]) { o.visible = false; G.scene.add(o); }
  }
  set(on) { this.target = on ? 1 : 0; }
  update(dt) {
    this.t += dt;
    this.k += (this.target - this.k) * (1 - Math.exp(-(this.target ? 3 : 2) * dt));
    const p = G.player, on = this.k > 0.01 && p && !p.dead;
    for (const o of [this.glow, this.ring, this.ring2]) o.visible = !!on;
    if (!on) return;
    const k = this.k, P = p.pos;
    this.glow.position.set(P.x, P.y + 1.1, P.z);
    this.glow.material.opacity = k * (0.32 + 0.08 * Math.sin(this.t * 3.1));
    this.ring.position.set(P.x, P.y + 0.06, P.z); this.ring2.position.set(P.x, P.y + 0.07, P.z);
    this.ring.rotation.y = this.t * 0.9; this.ring2.rotation.y = -this.t * 1.4;
    this.ring.material.opacity = k * 0.6; this.ring2.material.opacity = k * 0.45;
    if (Math.random() < dt * 26 * k) {
      const a = Math.random() * TAU, r = 0.35 + Math.random() * 0.5;
      G.fx.particles.emit({ x: P.x + Math.cos(a) * r, y: P.y + 0.2 + Math.random() * 1.4, z: P.z + Math.sin(a) * r, vy: 1 + Math.random() * 1.5, life: 1.1, size: 0.18 + Math.random() * 0.12, color: Math.random() < 0.75 ? GOLD : PALE, grav: 0, drag: 0.6 });
    }
  }
  dispose() { for (const o of [this.glow, this.ring, this.ring2]) { o.removeFromParent(); if (o.geometry) o.geometry.dispose(); o.material.dispose(); } }
}

// ------------------------------------------------------------------ the spirit of Robo, King of Beasts
// Called up by the card behind the hero: a huge wolf of golden light that roars, flexes (he would), and flows into the
// hero as the blessing
export class BeastSpirit {
  constructor(parent, pose) {
    this.ok = npcModelReady('robo');
    if (!this.ok) return;
    this.rig = createNpcRig('robo', { name: 'story:robo_spirit', scale: 2.4 });
    this.anim = new Animator(this.rig, { idlePose: pose, gait: 'free' });
    const m = this.mat = this.rig.skinned.material.clone();
    m.transparent = true; m.depthWrite = false; m.blending = THREE.AdditiveBlending;
    m.color = new THREE.Color('#ffd98a'); m.emissive = new THREE.Color('#ff9a2a'); m.emissiveIntensity = 0.6; m.opacity = 0;
    m.needsUpdate = true;
    this.rig.skinned.material = m;
    this.rig.skinned.castShadow = false;
    this.root = this.rig.root;
    this.root.visible = false;
    parent.add(this.root);
    this.t = -1;
  }
  summon(x, z, rotY) {
    if (!this.ok) return;
    this.root.position.set(x, G.terrain.groundAt(x, z), z);
    this.root.rotation.y = rotY;
    this.base = this.root.position.y + 0.3;             // (a spirit: it floats)
    this.t = 0;
    this.root.visible = true;
    this.anim.play('rb_roar', { fadeIn: 0.2, fadeOut: 0.4 });
    G.audio.play('beast');
  }
  get active() { return this.t >= 0; }
  update(dt, into = null) {
    if (!this.ok || this.t < 0) return;
    this.t += dt;
    const t = this.t;
    const a = t < 0.5 ? t / 0.5 : t < 2.9 ? 1 : Math.max(0, 1 - (t - 2.9) / 0.9);
    this.mat.opacity = a * (0.84 + 0.1 * Math.sin(t * 7));
    this.root.position.y = this.base + t * 0.12 + (t > 2.9 ? (t - 2.9) * 0.8 : 0);
    this.anim.speed = 0; this.anim.groundSpeed = 0;
    this.anim.update(dt, null);
    // motes of gold round the spirit, flowing into the hero as it fades
    const P = this.root.position;
    if (Math.random() < dt * 40 * a) {
      const ang = Math.random() * TAU, r = 0.6 + Math.random() * 1.2;
      const x = P.x + Math.cos(ang) * r, y = P.y + 0.5 + Math.random() * 3.2, z = P.z + Math.sin(ang) * r;
      const flow = t > 2.9 && into ? into : null;
      G.fx.particles.emit(flow
        ? { x, y, z, vx: (flow.x - x) / 0.7, vy: (flow.y + 1 - y) / 0.7, vz: (flow.z - z) / 0.7, life: 0.7, size: 0.3, color: GOLD, grav: 0, drag: 0 }
        : { x, y, z, vy: 0.8 + Math.random(), life: 1, size: 0.26, color: Math.random() < 0.7 ? GOLD : PALE, grav: 0, drag: 0.8 });
    }
    if (t > 3.8) { this.t = -1; this.root.visible = false; }
  }
  dispose() { if (!this.ok) return; this.root.removeFromParent(); this.mat.dispose(); }
}

// ------------------------------------------------------------------ her treasure chest
// A chest of dark lacquered wood bound in gold drops where she vanished. Walking up to it opens the lid: her gold and
// her treasures spill out onto the floor in front of it (picked up like any loot). A chest left closed empties
// itself into the hero's bag when they leave the vault.
export class TreasureChest {
  constructor(parent, env) {
    this.env = env;
    const wood = new THREE.MeshStandardMaterial({ color: '#5e2418', roughness: 0.55, metalness: 0.05 });
    const gold = new THREE.MeshStandardMaterial({ color: '#f0bc4a', metalness: 0.9, roughness: 0.25, emissive: '#4a3006', emissiveIntensity: 0.7 });
    const gem = new THREE.MeshStandardMaterial({ color: '#ff4a8a', emissive: '#c0104a', emissiveIntensity: 1.4, roughness: 0.1, flatShading: true });
    this.mats = [wood, gold, gem];
    const box = (mat, w, h, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = true; return m; };
    const g = this.group = new THREE.Group();
    g.name = 'story:chest';
    g.add(box(wood, 1.5, 0.78, 0.98, 0, 0.39, 0));
    for (const x of [-0.56, 0, 0.56]) g.add(box(gold, 0.12, 0.82, 1.02, x, 0.41, 0));
    g.add(box(gold, 1.54, 0.08, 1.02, 0, 0.04, 0));
    g.add(box(gold, 0.3, 0.32, 0.06, 0, 0.6, 0.5));
    const lock = new THREE.Mesh(new THREE.OctahedronGeometry(0.07, 0), gem);
    lock.position.set(0, 0.62, 0.55);
    g.add(lock);
    // the lid turns open around its back edge
    const lid = this.lid = new THREE.Group();
    lid.position.set(0, 0.78, -0.49);
    const half = (r, len, mat) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 20, 1, false, 0, Math.PI), mat); m.rotation.set(0, 0, Math.PI / 2); m.position.set(0, 0, 0.49); m.castShadow = true; return m; };
    lid.add(half(0.49, 1.5, wood));
    for (const x of [-0.56, 0, 0.56]) { const b = half(0.515, 0.12, gold); b.position.x = x; lid.add(b); }
    g.add(lid);
    // gold light inside, and a glow over it
    this.inner = new THREE.Mesh(new THREE.PlaneGeometry(1.36, 0.84).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffd870' }));
    this.inner.position.y = 0.74;
    g.add(this.inner);
    this.glow = glowSprite('#ffd060', 3, { opacity: 0.5 });
    this.glow.position.y = 1;
    g.add(this.glow);
    g.visible = false;
    parent.add(g);
    this.state = null;          // falling | closed | opening | open
    this.t = 0; this.collider = null;
  }
  // it falls from the sky with a crash of gold; its front turns to the hero
  drop(x, z, rotY) {
    this.x = x; this.z = z; this.rotY = rotY;
    this.floor = this.env.terrain.groundAt(x, z);
    this.group.position.set(x, this.floor + 9, z);
    this.group.rotation.y = rotY;
    this.group.visible = true;
    this.vy = 0; this.state = 'falling'; this.t = 0;
    G.fx.pillar(new THREE.Vector3(x, this.floor, z), '#ffe6a0', 1.6, 1.1, 12);
  }
  update(dt) {
    if (!this.state) return;
    this.t += dt;
    const g = this.group;
    if (this.state === 'falling') {
      this.vy -= 30 * dt;
      g.position.y += this.vy * dt;
      if (g.position.y <= this.floor) {
        g.position.y = this.floor;
        this.state = 'closed'; this.t = 0;
        const P = new THREE.Vector3(this.x, this.floor, this.z);
        G.fx.shockwave(P, '#ffd060');
        G.fx.particles.burst(this.x, this.floor + 0.4, this.z, 40, { color: GOLD, speed: 6, life: 0.7, size: 0.3, grav: -12, up: 1.2 });
        G.audio.play('thud'); G.audio.play('coins');
        G.cam.addShake(0.35);
        this.collider = this.env.colliders.addBox(this.x, this.z, 0.8, 0.55, this.rotY);
      }
      return;
    }
    // a slow glint while it waits
    if (this.state === 'closed') {
      this.glow.material.opacity = 0.35 + 0.15 * Math.sin(this.t * 3);
      if (Math.random() < dt * 5) G.fx.particles.emit({ x: this.x + (Math.random() - 0.5) * 1.4, y: this.floor + 0.3 + Math.random() * 0.7, z: this.z + (Math.random() - 0.5) * 0.9, vy: 0.6, life: 0.9, size: 0.2, color: GOLD, grav: 0 });
      const p = G.player;
      if (p && !p.dead && !G.cutscene && Math.hypot(p.pos.x - this.x, p.pos.z - this.z) < 2.6) this.open();
    }
    if (this.state === 'opening' || this.state === 'open') {
      const k = Math.min(1, this.t / 0.6);
      this.lid.rotation.x = -1.95 * (1 - Math.pow(1 - k, 3) + Math.sin(k * Math.PI) * 0.08);
      this.glow.material.opacity = 0.5 + 0.2 * Math.sin(this.t * 4);
      if (this.state === 'opening' && this.t > 0.25) { this.state = 'open'; this.spill(); }
      if (Math.random() < dt * 14) G.fx.particles.emit({ x: this.x + (Math.random() - 0.5) * 1.1, y: this.floor + 0.8, z: this.z + (Math.random() - 0.5) * 0.7, vy: 1.4 + Math.random(), life: 1, size: 0.22, color: Math.random() < 0.8 ? GOLD : PALE, grav: 0, drag: 0.5 });
    }
  }
  get closed() { return this.state === 'falling' || this.state === 'closed'; }
  open() {
    if (!this.closed) return;
    this.state = 'opening'; this.t = 0;
    G.audio.play('chest');
    G.fx.hitSpark(new THREE.Vector3(this.x, this.floor + 1, this.z), '#ffe6a0', true);
  }
  // her treasure: all her gold, and each treasure by its chance (as monsters drop theirs, only richer)
  static contents() {
    const def = MONSTERS.vagel, out = [];
    out.push({ kind: 'money', n: Math.round(def.copper[0] + Math.random() * (def.copper[1] - def.copper[0])) });
    for (const [id, chance] of def.drops) if (Math.random() < chance) out.push({ kind: 'item', id, n: 1 });
    return out;
  }
  // ... spilled in a fan in front of the chest
  spill() {
    const drops = TreasureChest.contents(), from = new THREE.Vector3(this.x, this.floor + 0.6, this.z);
    drops.forEach((d, i) => {
      const a = this.rotY + (i - (drops.length - 1) / 2) * 0.42, r = 1.7 + (i % 2) * 0.55;
      let x = this.x + Math.sin(a) * r, z = this.z + Math.cos(a) * r;
      if (G.nav && !G.nav.isWalkable(x, z)) { x = this.x + Math.sin(this.rotY) * 1.6; z = this.z + Math.cos(this.rotY) * 1.6; }
      G.loot.spawn(d, x, z, from);
    });
    G.audio.play('coins');
  }
  // (left closed: the hero takes the treasure along)
  collectAll() {
    if (!this.closed) return;
    const p = G.player;
    this.state = 'open';
    const got = [];
    for (const d of TreasureChest.contents()) {
      if (d.kind === 'money') { p.money += d.n; got.push(moneyText(d.n)); }
      else if (p.addItem(d.id, d.n) === 0) got.push(ITEMS[d.id].name);
    }
    G.msg(`You take Vagel's treasure chest along: ${got.join(', ')}.`, 'loot');
    G.emit('inventory');
  }
  dispose() {
    this.env.colliders.remove(this.collider);
    this.group.removeFromParent();
    disposeTree(this.group);
  }
}

// ------------------------------------------------------------------ helper: the actor model's head height
export const headOf = (a, out = _w) => out.set(a.pos.x, a.pos.y + a.height * 0.9, a.pos.z);

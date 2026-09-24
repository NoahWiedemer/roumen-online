// Visual effects: particles, weapon trails, ground rings, pillars, floating combat text
import * as THREE from 'three';
import { tex, makeCanvas, toTexture } from '../core/textures.js';
import { G } from '../game/game.js';

// ------------------------------------------------------------------ particle system (single draw call)
class Particles {
  constructor(scene, max = 4000) {
    this.max = max;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { map: { value: tex('spark') }, scale: { value: 600 } },
      vertexShader: `attribute float size; attribute vec4 color; varying vec4 vC; uniform float scale;
        void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; varying vec4 vC; void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC.rgb * t.rgb, t.a * vC.a); }`,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
    this.list = [];
    this.geo = g;
  }
  emit(p) {
    if (this.list.length >= this.max) this.list.shift();
    this.list.push({
      x: p.x, y: p.y, z: p.z, vx: p.vx || 0, vy: p.vy || 0, vz: p.vz || 0,
      life: p.life || 1, age: 0, size: p.size || 0.3, endSize: p.endSize ?? (p.size || 0.3) * 0.2,
      r: p.color ? p.color.r : 1, g: p.color ? p.color.g : 1, b: p.color ? p.color.b : 1,
      grav: p.grav ?? 0, drag: p.drag ?? 1.5, alpha: p.alpha ?? 1,
    });
  }
  burst(x, y, z, n, opts = {}) {
    const c = opts.color || new THREE.Color(1, 0.9, 0.6);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1;
      const s = (opts.speed || 4) * (0.4 + Math.random() * 0.6);
      const r = Math.sqrt(1 - u * u);
      this.emit({
        x, y, z, vx: Math.cos(a) * r * s, vy: (opts.up ?? 0.5) * s + u * s * 0.5, vz: Math.sin(a) * r * s,
        life: (opts.life || 0.6) * (0.6 + Math.random() * 0.6), size: (opts.size || 0.35) * (0.6 + Math.random() * 0.7),
        color: c, grav: opts.grav ?? -6, drag: opts.drag ?? 2, endSize: opts.endSize,
      });
    }
  }
  update(dt) {
    const L = this.list;
    let w = 0;
    for (let i = 0; i < L.length; i++) {
      const p = L[i];
      p.age += dt;
      if (p.age >= p.life) continue;
      const k = Math.exp(-p.drag * dt);
      p.vx *= k; p.vy = p.vy * k + p.grav * dt; p.vz *= k;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      L[w++] = p;
    }
    L.length = w;
    for (let i = 0; i < w; i++) {
      const p = L[i], t = p.age / p.life;
      this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
      const a = (t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.9) * p.alpha;
      this.col[i * 4] = p.r; this.col[i * 4 + 1] = p.g; this.col[i * 4 + 2] = p.b; this.col[i * 4 + 3] = a;
      this.size[i] = p.size + (p.endSize - p.size) * t;
    }
    this.geo.setDrawRange(0, w);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.attributes.size.needsUpdate = true;
  }
}

// ------------------------------------------------------------------ weapon trail ribbon
export class Trail {
  constructor(scene, color = '#fff3c0', len = 18) {
    this.len = len;
    this.pts = [];
    const g = new THREE.BufferGeometry();
    this.posArr = new Float32Array(len * 2 * 3);
    this.alphaArr = new Float32Array(len * 2);
    g.setAttribute('position', new THREE.BufferAttribute(this.posArr, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alphaArr, 1).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let i = 0; i < len - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setIndex(idx);
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      uniforms: { color: { value: new THREE.Color(color) } },
      vertexShader: `attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 color; varying float vA; void main(){ gl_FragColor = vec4(color * (0.6 + vA), vA); }`,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    scene.add(this.mesh);
    this.geo = g;
    this.active = false;
  }
  setColor(c) { this.mat.uniforms.color.value.set(c); }
  push(base, tip, on) {
    if (on) this.pts.unshift({ a: base.clone(), b: tip.clone(), life: 1 });
    for (const p of this.pts) p.life -= 0.09;
    while (this.pts.length > this.len || (this.pts.length && this.pts[this.pts.length - 1].life <= 0)) this.pts.pop();
    const n = this.pts.length;
    for (let i = 0; i < this.len; i++) {
      const p = this.pts[Math.min(i, n - 1)];
      if (!p) { this.alphaArr[i * 2] = this.alphaArr[i * 2 + 1] = 0; continue; }
      this.posArr.set([p.a.x, p.a.y, p.a.z], i * 6);
      this.posArr.set([p.b.x, p.b.y, p.b.z], i * 6 + 3);
      const a = i < n ? Math.max(0, p.life) * (1 - i / this.len) : 0;
      this.alphaArr[i * 2] = a * 0.15;
      this.alphaArr[i * 2 + 1] = a * 0.85;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.alpha.needsUpdate = true;
    this.mesh.visible = n > 1;
  }
}

// ------------------------------------------------------------------ ground decals
function ringTexture(kind) {
  const S = 256, c = makeCanvas(S), ctx = c.getContext('2d');
  ctx.translate(S / 2, S / 2);
  if (kind === 'target') {
    ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 10;
    ctx.beginPath(); ctx.arc(0, 0, S * 0.4, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 4; ctx.globalAlpha = 0.6;
    ctx.beginPath(); ctx.arc(0, 0, S * 0.32, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
    for (let i = 0; i < 4; i++) {
      ctx.save(); ctx.rotate((i * Math.PI) / 2);
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.moveTo(0, -S * 0.49); ctx.lineTo(-14, -S * 0.4); ctx.lineTo(14, -S * 0.4); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  } else if (kind === 'click') {
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 12;
    ctx.beginPath(); ctx.arc(0, 0, S * 0.36, 0, Math.PI * 2); ctx.stroke();
  } else if (kind === 'shock') {
    const g = ctx.createRadialGradient(0, 0, S * 0.2, 0, 0, S * 0.5);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.75, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(-S / 2, -S / 2, S, S);
  } else if (kind === 'magic') {
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(0, 0, S * 0.45, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, S * 0.36, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2, b = a + (Math.PI * 2) / 3;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * S * 0.36, Math.sin(a) * S * 0.36); ctx.lineTo(Math.cos(b) * S * 0.36, Math.sin(b) * S * 0.36); ctx.stroke();
    }
    ctx.font = 'bold 20px serif'; ctx.fillStyle = '#fff';
    for (let i = 0; i < 12; i++) { ctx.save(); ctx.rotate((i / 12) * Math.PI * 2); ctx.fillText('✦', -6, -S * 0.39); ctx.restore(); }
  } else if (kind === 'shadow') {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, S * 0.5);
    g.addColorStop(0, 'rgba(0,0,0,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(-S / 2, -S / 2, S, S);
  }
  return toTexture(c, { repeat: false });
}

function groundDecal(texture, size, color, additive = true) {
  const g = new THREE.PlaneGeometry(size, size);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.MeshBasicMaterial({ map: texture, color, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, polygonOffset: true, polygonOffsetFactor: -4, fog: false });
  const mesh = new THREE.Mesh(g, m);
  mesh.renderOrder = 3;
  return mesh;
}

// ------------------------------------------------------------------ Effects manager
export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.particles = new Particles(scene);
    this.transients = [];
    this.tex = { target: ringTexture('target'), click: ringTexture('click'), shock: ringTexture('shock'), magic: ringTexture('magic'), shadow: ringTexture('shadow') };
    // target ring
    this.targetRing = groundDecal(this.tex.target, 2, new THREE.Color('#ff5a4a'));
    this.targetRing.visible = false;
    scene.add(this.targetRing);
    this.clickMarker = groundDecal(this.tex.click, 1, new THREE.Color('#9fe8ff'));
    this.clickMarker.visible = false;
    this.clickT = 0;
    scene.add(this.clickMarker);
    // floating text layer
    this.textLayer = document.createElement('div');
    this.textLayer.className = 'fct-layer';
    document.body.appendChild(this.textLayer);
    this.texts = [];
    this._v = new THREE.Vector3();
  }

  // --- ground target ring
  showTarget(entity, friendly = false) {
    if (!entity) { this.targetRing.visible = false; this.targetEntity = null; return; }
    this.targetEntity = entity;
    this.targetRing.material.color.set(friendly ? '#6dff8a' : '#ff5a4a');
    const r = (entity.radius || 0.6) * 2.2 + 0.4;
    this.targetRing.scale.setScalar(r / 2);
    this.targetRing.visible = true;
  }
  showClick(p) {
    this.clickMarker.position.set(p.x, p.y + 0.05, p.z);
    this.clickMarker.visible = true;
    this.clickT = 0;
  }

  // --- transient helpers
  add(obj, life, update) {
    this.scene.add(obj);
    this.transients.push({ obj, life, age: 0, update });
  }

  ring(pos, { color = '#ffffff', from = 0.5, to = 5, life = 0.5, tex: t = 'shock', y = 0.08 } = {}) {
    const d = groundDecal(this.tex[t], 1, new THREE.Color(color));
    d.position.set(pos.x, pos.y + y, pos.z);
    this.add(d, life, (o, k) => { o.scale.setScalar(from + (to - from) * (1 - Math.pow(1 - k, 2))); o.material.opacity = 1 - k; });
  }

  magicCircle(pos, color, life = 1.2, size = 3) {
    const d = groundDecal(this.tex.magic, size, new THREE.Color(color));
    d.position.set(pos.x, pos.y + 0.06, pos.z);
    this.add(d, life, (o, k, dt) => { o.rotation.y += dt * 1.5; o.material.opacity = Math.sin(k * Math.PI); o.scale.setScalar(0.6 + k * 0.5); });
  }

  hitSpark(pos, color = '#fff2b0', big = false) {
    const c = new THREE.Color(color);
    this.particles.burst(pos.x, pos.y, pos.z, big ? 26 : 14, { color: c, speed: big ? 7 : 5, life: 0.4, size: big ? 0.45 : 0.3, grav: -8 });
    // flash sprite
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex('spark'), color: c, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    s.position.copy(pos);
    s.material.rotation = Math.random() * 3;
    this.add(s, 0.18, (o, k) => { o.scale.setScalar((big ? 2.6 : 1.6) * (0.5 + k)); o.material.opacity = 1 - k; });
  }

  slashArc(pos, rotY, color = '#ffd27a', size = 2.2, tilt = 0) {
    // crescent sprite mesh facing up-ish
    const S = 256, c = makeCanvas(S), ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S * 0.5);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.7, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.strokeStyle = g; ctx.lineWidth = S * 0.2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(S / 2, S / 2, S * 0.4, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
    const t = toTexture(c, { repeat: false });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color(color), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    m.position.copy(pos);
    m.rotation.set(-Math.PI / 2 + tilt, 0, 0);
    const holder = new THREE.Group();
    holder.position.copy(pos); m.position.set(0, 0, 0);
    holder.rotation.y = rotY;
    holder.add(m);
    this.add(holder, 0.3, (o, k) => { m.material.opacity = 1 - k; m.rotation.z = -k * 1.2; o.scale.setScalar(0.8 + k * 0.5); });
  }

  pillar(pos, color = '#ffe86a', life = 2.2, radius = 0.9, height = 9) {
    const g = new THREE.CylinderGeometry(radius, radius * 1.3, height, 32, 1, true);
    g.translate(0, height / 2, 0);
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { color: { value: new THREE.Color(color) }, k: { value: 0 }, t: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 color; uniform float k, t; varying vec2 vUv;
        void main(){ float fade = (1.0 - vUv.y) * smoothstep(0.0, 0.15, vUv.y + 0.05);
          float stripes = 0.6 + 0.4 * sin(vUv.x * 50.0 + t * 6.0 + vUv.y * 10.0);
          float a = fade * stripes * sin(k * 3.14159) ; gl_FragColor = vec4(color * 1.6, a * 0.8); }`,
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.position.copy(pos);
    this.add(mesh, life, (o, k, dt) => { m.uniforms.k.value = k; m.uniforms.t.value += dt; o.scale.set(1 + k * 0.4, 0.3 + Math.min(1, k * 4) * 0.7, 1 + k * 0.4); });
    const c = new THREE.Color(color);
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * Math.PI * 2, r = radius * (0.3 + Math.random());
      this.particles.emit({ x: pos.x + Math.cos(a) * r, y: pos.y + Math.random() * 1.5, z: pos.z + Math.sin(a) * r, vy: 2 + Math.random() * 5, life: 1 + Math.random() * 1.2, size: 0.25 + Math.random() * 0.3, color: c, drag: 0.5, grav: 0 });
    }
    this.ring(pos, { color, from: 0.5, to: 7, life: 0.9 });
    this.magicCircle(pos, color, life, 3.4);
  }

  aura(entity, color, life = 1.2) {
    const c = new THREE.Color(color);
    const p = entity.pos;
    this.magicCircle(p, color, life, 2.6);
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2, r = 0.5 + Math.random() * 0.6;
      this.particles.emit({ x: p.x + Math.cos(a) * r, y: p.y + Math.random() * 0.5, z: p.z + Math.sin(a) * r, vx: -Math.sin(a) * 1.5, vz: Math.cos(a) * 1.5, vy: 1.5 + Math.random() * 2.5, life: 0.8 + Math.random() * 0.6, size: 0.25, color: c, drag: 0.8, grav: 0 });
    }
  }

  shockwave(pos, color = '#ffd060') {
    this.ring(pos, { color, from: 0.5, to: 8, life: 0.55 });
    this.ring(pos, { color: '#ffffff', from: 0.3, to: 5, life: 0.35 });
    const c = new THREE.Color('#c9a36a');
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2;
      this.particles.emit({ x: pos.x + Math.cos(a) * 0.8, y: pos.y + 0.1, z: pos.z + Math.sin(a) * 0.8, vx: Math.cos(a) * 6, vy: 2 + Math.random() * 3, vz: Math.sin(a) * 6, life: 0.7, size: 0.5, endSize: 0.9, color: c, grav: -10, drag: 3, alpha: 0.6 });
    }
    this.hitSpark(new THREE.Vector3(pos.x, pos.y + 0.3, pos.z), color, true);
  }

  whirl(pos, color = '#bfe6ff') {
    const c = new THREE.Color(color);
    for (let k = 0; k < 3; k++) this.ring(pos, { color, from: 1, to: 7, life: 0.5 + k * 0.15, y: 0.3 + k * 0.4, tex: 'click' });
    for (let i = 0; i < 50; i++) {
      const a = Math.random() * Math.PI * 2, r = 1 + Math.random() * 2.5;
      this.particles.emit({ x: pos.x + Math.cos(a) * r, y: pos.y + 0.3 + Math.random() * 1.2, z: pos.z + Math.sin(a) * r, vx: -Math.sin(a) * 7, vz: Math.cos(a) * 7, vy: 0.5, life: 0.5, size: 0.3, color: c, drag: 2, grav: 0 });
    }
  }

  warCry(pos) {
    for (let k = 0; k < 3; k++) setTimeout(() => this.ring(pos, { color: '#ff4a3a', from: 1, to: 14, life: 0.6, y: 1.0 }), k * 120);
  }

  poof(pos, color = '#ffffff', n = 18) {
    const c = new THREE.Color(color);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this.particles.emit({ x: pos.x, y: pos.y + 0.3, z: pos.z, vx: Math.cos(a) * 2.5, vy: 1 + Math.random() * 2, vz: Math.sin(a) * 2.5, life: 0.7, size: 0.6, endSize: 1.1, color: c, drag: 3, grav: 0, alpha: 0.5 });
    }
  }

  healSparkle(pos, color = '#7dff8a') {
    const c = new THREE.Color(color);
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * Math.PI * 2, r = 0.3 + Math.random() * 0.4;
      this.particles.emit({ x: pos.x + Math.cos(a) * r, y: pos.y + 0.2 + Math.random(), z: pos.z + Math.sin(a) * r, vy: 1.2 + Math.random(), life: 0.9, size: 0.22, color: c, drag: 1, grav: 0 });
    }
  }

  // --- floating combat text (DOM)
  text(worldPos, str, cls = 'dmg') {
    const el = document.createElement('div');
    el.className = 'fct ' + cls;
    el.textContent = str;
    this.textLayer.appendChild(el);
    this.texts.push({ el, pos: worldPos.clone(), age: 0, life: cls === 'levelup' ? 2.2 : 1.1, dx: (Math.random() - 0.5) * 30 });
  }

  update(dt, camera) {
    this.particles.update(dt);
    for (let i = this.transients.length - 1; i >= 0; i--) {
      const t = this.transients[i];
      t.age += dt;
      const k = Math.min(1, t.age / t.life);
      if (t.update) t.update(t.obj, k, dt);
      if (t.age >= t.life) {
        this.scene.remove(t.obj);
        t.obj.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map && o.material.map !== tex('spark') && !Object.values(this.tex).includes(o.material.map)) o.material.map.dispose(); o.material.dispose(); } });
        this.transients.splice(i, 1);
      }
    }
    // target ring follow
    if (this.targetEntity) {
      const e = this.targetEntity;
      if (e.dead || e.removed) { this.showTarget(null); }
      else {
        this.targetRing.position.set(e.pos.x, e.groundY !== undefined ? e.groundY + 0.06 : e.pos.y + 0.06, e.pos.z);
        this.targetRing.rotation.y += dt * 1.2;
      }
    }
    if (this.clickMarker.visible) {
      this.clickT += dt;
      const k = this.clickT / 0.6;
      this.clickMarker.scale.setScalar(1.4 - k * 0.9);
      this.clickMarker.material.opacity = 1 - k;
      if (k >= 1) this.clickMarker.visible = false;
    }
    // text
    const W = window.innerWidth, H = window.innerHeight;
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.age += dt;
      const k = t.age / t.life;
      if (k >= 1) { t.el.remove(); this.texts.splice(i, 1); continue; }
      this._v.copy(t.pos);
      this._v.y += k * 1.2;
      this._v.project(camera);
      if (this._v.z > 1) { t.el.style.display = 'none'; continue; }
      t.el.style.display = '';
      const x = (this._v.x * 0.5 + 0.5) * W + t.dx * k, y = (-this._v.y * 0.5 + 0.5) * H;
      const pop = k < 0.12 ? 0.6 + (k / 0.12) * 0.7 : 1.3 - Math.min(0.3, (k - 0.12) * 1.5);
      t.el.style.transform = `translate(-50%,-50%) translate(${x}px,${y}px) scale(${pop})`;
      t.el.style.opacity = k > 0.7 ? (1 - k) / 0.3 : 1;
    }
  }
}

// "Scamigo Online" title screen, shown after the loading screen. A short, snappy intro on a sunset meadow:
// a cat peeks out from behind a rock and bolts at a roar, a dragon swoops in and torches the sky (the logo burns
// in), and Reko sprints through with his pants on fire, gulps his potion and strikes a pose. Afterwards the
// dragon circles the mountains and Reko keeps clowning around. Resolves when Start is pressed.
import * as THREE from 'three';
import { G } from '../game/game.js';
import { skyDome, mountainLayer, cloud, mat, blob, disposeTree } from './scenery.js';
import { Particles, FIRE, SMOKE } from './particles.js';
import { createDragon } from './dragon.js';
import { createCat } from './cat.js';
import { createReko, rekoReady } from './reko.js';
import { fadeScreen, starTexture } from './ui.js';

const T_LOGO = 3.55;       // logo burns in
const T_START = 4.5;       // Start button shows (clicking earlier skips to here)

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const seg = (t, a, b) => clamp01((t - a) / (b - a));
const smooth = (x) => x * x * (3 - 2 * x);
const lerp = (a, b, k) => a + (b - a) * k;

// gentle meadow; the characters stand on it
function groundAt(x, z) {
  return 0.28 * Math.sin(x * 0.17 + 0.6) + 0.2 * Math.cos(z * 0.21 + x * 0.09) - 0.2 + (z < -10 ? (z + 10) * 0.06 : 0);
}

export function runTitle(engine, { onShown } = {}) {
  return new Promise((resolve) => {
    const S = buildScene(engine);
    const ui = buildUi();
    let T = 0, done = false, shown = false, last = performance.now();
    const fired = new Set();
    const once = (key, t, fn) => { if (T >= t && !fired.has(key)) { fired.add(key); fn(); } };
    const skip = () => { if (T < T_START) { T = T_START; ui.logo.classList.add('shown'); } };
    const onKey = (e) => { if (e.key === 'Enter' || e.key === ' ') { if (T < T_START) skip(); else start(); } else if (T < T_START) skip(); };
    const onDown = () => { G.audio.unlock(); if (T < T_START) skip(); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    const start = async () => {
      if (done) return;
      done = true;
      G.audio.unlock();
      G.audio.play('open');
      ui.root.classList.add('leaving');
      await fadeScreen(true, 380);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
      ui.root.remove();
      S.dispose();
      resolve();
    };
    ui.start.onclick = (e) => { e.stopPropagation(); start(); };

    const advance = (dt) => {
      T += dt;
      once('roar', 1.85, () => { G.audio.play('roar'); S.shake = 0.35; });
      once('meow', 1.95, () => G.audio.play('meow'));
      once('fire', 3.35, () => G.audio.play('fire'));
      once('logo', T_LOGO, () => ui.logo.classList.add('burn'));
      once('btn', T_START, () => ui.bottom.classList.add('shown'));
      once('poof', 6.95, () => G.audio.play('poof'));
      once('glint', 7.95, () => G.audio.play('glint'));
      S.update(dt, T);
    };
    // dev: ?titlefreeze stops the clock; window.__titleStep(sec) advances it in 60 Hz steps
    let frozen = new URLSearchParams(location.search).has('titlefreeze');
    window.__titleScene = S;
    window.__titleStep = (sec) => { for (let k = 0; k < Math.round(sec * 60); k++) advance(1 / 60); engine.renderWith(S.scene, S.camera); return T; };
    const frame = (now) => {
      if (done) return;
      requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!frozen) advance(dt);
      engine.renderWith(S.scene, S.camera);
      if (!shown) { shown = true; fadeScreen(false, 500); if (onShown) onShown(); }
    };
    requestAnimationFrame(frame);
  });
}

// ------------------------------------------------------------------ the 3D scene
function buildScene(engine) {
  const scene = new THREE.Scene();
  scene.environment = engine.scene.environment;
  scene.environmentIntensity = 0.45;
  scene.fog = new THREE.Fog('#d99a8e', 70, 420);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 2000);
  const camBase = new THREE.Vector3(0, 1.4, 9);
  const camLook = new THREE.Vector3(0, 2.2, 0);

  const sunDir = new THREE.Vector3(0.42, 0.14, -1).normalize();
  scene.add(skyDome({ top: '#1b2657', mid: '#5a63ad', horizon: '#ffa574', glow: '#ffd08e', sunDir }));
  scene.add(mountainLayer({ z: -330, width: 1200, base: -30, height: 120, color: '#7d6ca8', haze: '#f7ae8c', seed: 3, peaks: 7, snow: '#ffe1da' }));
  scene.add(mountainLayer({ z: -210, width: 820, base: -22, height: 58, color: '#58558d', haze: '#e6a08e', seed: 8, peaks: 9 }));
  scene.add(mountainLayer({ z: -120, width: 520, base: -12, height: 22, color: '#2e4a55', haze: '#a08790', seed: 21, peaks: 12 }));
  const clouds = [];
  for (const [x, y, z, w, c] of [[-120, 62, -300, 110, '#ffd6c6'], [90, 78, -320, 130, '#ffc9bd'], [10, 40, -250, 70, '#ffe0c8'], [-60, 30, -200, 60, '#f7b9a8'], [150, 34, -240, 80, '#ffd0b5'], [-190, 46, -280, 90, '#f4c0b4']]) {
    const s = cloud({ x, y, z, w, color: c, opacity: 0.8 });
    scene.add(s); clouds.push(s);
  }

  // lights: low warm sun behind (rim light), cool fill from the camera side
  const hemi = new THREE.HemisphereLight('#ffd7c0', '#4b5a3c', 0.95);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffbf8a', 2.3);
  sun.position.copy(sunDir).multiplyScalar(40).add(new THREE.Vector3(0, 12, 0));
  sun.castShadow = engine.renderer.shadowMap.enabled;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 90 });
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight('#aebfff', 1.0);
  fill.position.set(-4, 6, 12);
  scene.add(fill);

  // ---- meadow
  const gGeo = new THREE.PlaneGeometry(160, 70, 80, 35).rotateX(-Math.PI / 2).translate(0, 0, -21);
  const gp = gGeo.attributes.position;
  const gc = [];
  const cNear = new THREE.Color('#5f8f35'), cFar = new THREE.Color('#9aa35b'), tmp = new THREE.Color();
  for (let i = 0; i < gp.count; i++) {
    const x = gp.getX(i), z = gp.getZ(i);
    gp.setY(i, groundAt(x, z));
    tmp.copy(cNear).lerp(cFar, clamp01((-z + 4) / 45)).offsetHSL(0, 0, (Math.sin(x * 1.7) * Math.cos(z * 1.3)) * 0.03);
    gc.push(tmp.r, tmp.g, tmp.b);
  }
  gGeo.setAttribute('color', new THREE.Float32BufferAttribute(gc, 3));
  gGeo.computeVertexNormals();
  const ground = new THREE.Mesh(gGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  ground.receiveShadow = true;
  scene.add(ground);
  // grass tufts + flowers (instanced)
  const rnd = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
  const blade = new THREE.ConeGeometry(0.035, 0.34, 3).translate(0, 0.17, 0);
  const grass = new THREE.InstancedMesh(blade, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 }), 1400);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), pv = new THREE.Vector3(), sv = new THREE.Vector3();
  for (let i = 0; i < grass.count; i++) {
    const x = (rnd() - 0.5) * 26, z = 6 - rnd() * 24;
    e.set((rnd() - 0.5) * 0.5, rnd() * 6.28, (rnd() - 0.5) * 0.5);
    const s = 0.6 + rnd() * 0.9;
    m4.compose(pv.set(x, groundAt(x, z) - 0.02, z), q.setFromEuler(e), sv.set(s, s * (0.8 + rnd() * 0.6), s));
    grass.setMatrixAt(i, m4);
    grass.setColorAt(i, tmp.set('#6fa03c').offsetHSL((rnd() - 0.5) * 0.05, 0, (rnd() - 0.5) * 0.12));
  }
  grass.receiveShadow = true;
  scene.add(grass);
  const petal = new THREE.SphereGeometry(0.05, 6, 4);
  const flowers = new THREE.InstancedMesh(petal, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 }), 260);
  const fCols = ['#ffffff', '#ffe066', '#ff9ec7', '#c9a4ff', '#ff7a6b'];
  for (let i = 0; i < flowers.count; i++) {
    const x = (rnd() - 0.5) * 24, z = 5 - rnd() * 20;
    m4.compose(pv.set(x, groundAt(x, z) + 0.2 + rnd() * 0.08, z), q.identity(), sv.setScalar(0.7 + rnd() * 0.6));
    flowers.setMatrixAt(i, m4);
    flowers.setColorAt(i, tmp.set(fCols[Math.floor(rnd() * fCols.length)]));
  }
  scene.add(flowers);
  // the rock the cat hides behind, a smaller one, and a framing tree on the right
  const rockMat = mat('#8e8a86', { roughness: 0.95, flatShading: true });
  const mossMat = mat('#6d8a3e', { roughness: 1, flatShading: true });
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.8, 1), rockMat);
  rock.scale.set(1.15, 1.0, 0.9);
  rock.position.set(-3.35, groundAt(-3.35, 3.1) + 0.35, 3.1);
  rock.rotation.set(0.2, 0.5, 0.1);
  rock.castShadow = rock.receiveShadow = true;
  scene.add(rock);
  const moss = new THREE.Mesh(new THREE.DodecahedronGeometry(0.62, 1), mossMat);
  moss.scale.set(1.2, 0.45, 0.95);
  moss.position.copy(rock.position).add(new THREE.Vector3(0.05, 0.5, 0));
  scene.add(moss);
  const rock2 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.45, 1), rockMat);
  rock2.position.set(-4.45, groundAt(-4.45, 3.9) + 0.12, 3.9);
  rock2.castShadow = true;
  scene.add(rock2);
  const tree = new THREE.Group();
  tree.position.set(7.2, groundAt(7.2, -1.5), -1.5);
  const bark = mat('#5b3b26', { roughness: 0.95 });
  const leaf = mat('#3f7a33', { roughness: 0.9 });
  const leaf2 = mat('#5c9a3a', { roughness: 0.9 });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.38, 5, 8).translate(0, 2.5, 0), bark);
  trunk.castShadow = true;
  tree.add(trunk);
  for (const [x, y, z, r, m] of [[0, 5.4, 0, 1.9, leaf], [-1.3, 4.7, 0.4, 1.3, leaf2], [1.2, 4.9, -0.3, 1.4, leaf], [0.2, 6.3, 0.2, 1.3, leaf2], [-0.6, 5.6, 1.0, 1.1, leaf]]) tree.add(blob(m, r, r * 0.85, r, x, y, z, true));
  scene.add(tree);
  // distant castle on the hills (Roumen's keep) with lit windows
  const castle = new THREE.Group();
  castle.position.set(70, -6, -175);
  castle.scale.setScalar(0.85);
  const stone = mat('#3a3550', { roughness: 1 });
  const roof = mat('#5a2a3e', { roughness: 0.9 });
  const lit = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.1, 0.9), fog: false });
  for (const [x, h, r] of [[0, 18, 2.2], [-6, 12, 1.8], [6, 13, 1.7], [-2.5, 9, 3.4], [3, 8, 3.2]]) {
    const tw = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.05, h, 10).translate(0, h / 2, 0), stone);
    tw.position.x = x;
    castle.add(tw);
    const cn = new THREE.Mesh(new THREE.ConeGeometry(r * 1.3, r * 2.2, 10).translate(0, h + r * 1.1, 0), roof);
    cn.position.x = x;
    castle.add(cn);
    for (let k = 0; k < 3; k++) { const w = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.8), lit); w.position.set(x + (k - 1) * r * 0.5, h * (0.45 + k * 0.15), r + 0.05); castle.add(w); }
  }
  scene.add(castle);
  // a floating island on the left
  const island = new THREE.Group();
  island.position.set(-42, 24, -120);
  island.add(new THREE.Mesh(new THREE.ConeGeometry(7, 10, 9).rotateX(Math.PI).translate(0, -5, 0), mat('#6d5a58', { flatShading: true })));
  island.add(blob(mat('#5e8c45'), 7, 1.2, 7, 0, 0.2, 0, true));
  island.add(blob(mat('#3f7a33'), 2.4, 2.4, 2.4, -1.5, 3, 0.5, true));
  island.add(blob(mat('#4d8a3a'), 1.8, 1.8, 1.8, 2, 2.4, -1, true));
  scene.add(island);

  // ---- actors
  const dragon = createDragon();
  dragon.root.scale.setScalar(0.9);
  scene.add(dragon.root);
  const fireLight = new THREE.PointLight('#ff8a2a', 0, 45, 2);
  scene.add(fireLight);
  const cat = createCat();
  cat.root.scale.setScalar(1.7);
  scene.add(cat.root);
  const reko = rekoReady() ? createReko() : null;
  if (reko) scene.add(reko.root);
  const fire = new Particles(900, { additive: true, renderOrder: 12 });
  const smoke = new Particles(300, { additive: false, renderOrder: 11 });
  const sparks = new Particles(200, { additive: true, renderOrder: 13 });
  scene.add(smoke.points, fire.points, sparks.points);
  const glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTexture(), color: new THREE.Color(3, 2.7, 2), transparent: true, depthTest: false, blending: THREE.AdditiveBlending }));
  glint.renderOrder = 20;
  glint.visible = false;
  scene.add(glint);

  // dragon flight: swoop in, hover + breathe, leave, then circle the mountains
  const enterPath = new THREE.CatmullRomCurve3([V(34, 17, -64), V(14, 9, -26), V(1, 5.2, -12), V(-7.0, 3.3, -8.2)]);
  const exitPath = new THREE.CatmullRomCurve3([V(-7.0, 3.3, -8.2), V(-12, 8, -17), V(-26, 13, -42), V(-37, 16, -85)]);
  const orbit = (a, out) => out.set(8 + 45 * Math.cos(a), 16 + 2.2 * Math.sin(2 * a), -85 + 26 * Math.sin(a));
  // hover low on the left (below the logo), breathe across the sky under the logo and down to the meadow
  const HOVER = V(-7.0, 3.3, -8.2);
  const fireA = V(0.5, 3.9, -6.0), fireB = V(6.5, 3.3, -4.0), fireC = V(8.2, 0.6, 0.6);

  const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), dirV = new THREE.Vector3(), mouthW = new THREE.Vector3();
  const lookAhead = new THREE.Vector3();
  let bank = 0, orbitA = Math.PI, puffT = 9;
  let gagT = 9.5, gag = null, catPeekT = 16;

  // point the dragon along its motion with a banking roll
  const flyAlong = (pos, ahead, dt, rollK = 1) => {
    const r = dragon.root;
    const prevYaw = r.rotation.y;
    r.position.copy(pos);
    const dx = ahead.x - pos.x, dz = ahead.z - pos.z, dy = ahead.y - pos.y;
    const yaw = Math.atan2(dx, dz);
    const pitch = -Math.atan2(dy, Math.hypot(dx, dz));
    let dyaw = yaw - prevYaw; while (dyaw > Math.PI) dyaw -= Math.PI * 2; while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    bank += ((-dyaw / Math.max(dt, 1e-3)) * 0.35 * rollK - bank) * (1 - Math.exp(-3 * dt));
    r.rotation.set(pitch * 0.6, yaw, Math.max(-0.7, Math.min(0.7, bank)), 'YXZ');
  };
  const emitPos = new THREE.Vector3(), emitDir = new THREE.Vector3();
  const emitFire = (from, to, rate, dt, scale = 1) => {
    const n = Math.floor(rate * dt + Math.random());
    const d = Math.max(7 * scale, from.distanceTo(to));    // always a long stream, even at close targets
    for (let i = 0; i < n; i++) {
      emitDir.subVectors(to, from).normalize();
      emitDir.x += (Math.random() - 0.5) * 0.14; emitDir.y += (Math.random() - 0.5) * 0.14; emitDir.z += (Math.random() - 0.5) * 0.14;
      emitDir.normalize();
      const life = 0.55 + Math.random() * 0.3, drag = 1.3;
      const v0 = (d * drag) / (1 - Math.exp(-drag * life * 0.85));
      emitPos.copy(from).addScaledVector(emitDir, Math.random() * 0.3);
      fire.emit({ pos: emitPos, vel: emitDir.clone().multiplyScalar(v0 * (0.85 + Math.random() * 0.3)), life, size: 0.25 * scale, size1: Math.min(1.7, 1.0 + d * 0.06) * scale, c0: FIRE.core, c1: FIRE.mid, c2: FIRE.end, alpha: 0.85, drag, gravity: 2.5 });
      if (Math.random() < 0.15) smoke.emit({ pos: emitPos, vel: emitDir.clone().multiplyScalar(v0 * 0.55), life: life * 1.6, size: 0.5 * scale, size1: 2.0 * scale, c0: SMOKE.a, c1: SMOKE.b, alpha: 0.22, drag: 1.6, gravity: 1.2 });
    }
  };
  const burnPants = (dt) => {
    reko.butt.getWorldPosition(tmpV);
    const n = Math.floor(80 * dt + Math.random());
    for (let i = 0; i < n; i++) {
      fire.emit({ pos: tmpV.clone().add(V((Math.random() - 0.5) * 0.3, Math.random() * 0.15, (Math.random() - 0.5) * 0.2)), vel: V((Math.random() - 0.5) * 0.6, 1.4 + Math.random() * 1.2, (Math.random() - 0.5) * 0.6), life: 0.35 + Math.random() * 0.25, size: 0.24, size1: 0.1, c0: FIRE.core, c1: FIRE.mid, c2: FIRE.end, alpha: 0.75, drag: 1.5, gravity: 1.5 });
      if (Math.random() < 0.3) smoke.emit({ pos: tmpV.clone(), vel: V(0, 1.2, 0), life: 0.9, size: 0.2, size1: 0.8, c0: SMOKE.a, c1: SMOKE.b, alpha: 0.4, drag: 1, gravity: 0.6 });
    }
  };
  const poof = (at, n = 45, col = new THREE.Color(0.95, 0.95, 0.98)) => {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 2.2;
      smoke.emit({ pos: at.clone(), vel: V(Math.cos(a) * s, 1 + Math.random() * 2, Math.sin(a) * s * 0.6), life: 0.8 + Math.random() * 0.5, size: 0.35, size1: 1.3, c0: col, c1: col, alpha: 0.8, drag: 2.2, gravity: 0.8 });
    }
  };
  const sparkle = (at, n, col) => {
    for (let i = 0; i < n; i++) sparks.emit({ pos: at.clone().add(V((Math.random() - 0.5) * 0.3, Math.random() * 0.2, (Math.random() - 0.5) * 0.3)), vel: V((Math.random() - 0.5) * 1.2, 0.8 + Math.random() * 1.2, (Math.random() - 0.5) * 1.2), life: 0.6 + Math.random() * 0.4, size: 0.12, size1: 0.02, c0: col, c1: col, drag: 1.5, gravity: -1.5 });
  };

  // ---- Reko choreography helpers
  const rekoPlace = (x, z, yaw) => { reko.root.position.set(x, groundAt(x, z), z); reko.root.rotation.y = yaw; };
  const rekoRunPose = (ph, k = 1) => {
    reko.root.position.y += Math.abs(Math.sin(ph)) * 0.24 * k;
    reko.tilt.rotation.set(0.28 * k, 0, Math.sin(ph) * 0.16 * k);
    reko.squash.scale.set(1 - 0.05 * Math.cos(2 * ph) * k, 1 + 0.09 * Math.cos(2 * ph) * k, 1 - 0.05 * Math.cos(2 * ph) * k);
  };
  const rekoRest = () => { reko.tilt.rotation.set(0, 0, 0); reko.squash.scale.set(1, 1, 1); };
  const REKO_X = 2.7, REKO_Z = 1.3;
  let glintT = -1;

  const S = {
    scene, camera, shake: 0, fire, smoke, dragon,
    update(dt, T) {
      // camera: slow push-in + drift, small shake on roar / fire
      const w = window.innerWidth, h = window.innerHeight;
      if (camera.aspect !== w / h) { camera.aspect = w / h; camera.updateProjectionMatrix(); }
      const push = smooth(seg(T, 0, 6));
      camera.position.set(camBase.x + Math.sin(T * 0.13) * 0.25, camBase.y + 0.05 * Math.sin(T * 0.21), camBase.z + 0.6 - push * 0.6);
      this.shake = Math.max(0, this.shake - dt);
      if (this.shake > 0) camera.position.add(V((Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.12, 0).multiplyScalar(this.shake * 2));
      camera.lookAt(camLook);
      for (const c of clouds) { c.position.x += dt * 1.2; if (c.position.x > 260) c.position.x = -260; }
      island.position.y = 24 + Math.sin(T * 0.4) * 0.8;

      // ---- cat: peek (0.35-1.85), startle (1.9), bolt left (2.05-2.8); later peeks from time to time
      const cr = cat.root;
      const CAT_IN = -3.8, CAT_OUT = -3.0, CAT_Z = 2.5;
      if (T < 2.05) {
        const out = smooth(seg(T, 0.35, 0.7));
        cr.position.set(lerp(CAT_IN, CAT_OUT, out), groundAt(CAT_OUT, CAT_Z), CAT_Z);
        cr.rotation.y = 0.9;
        cat.headYaw = T < 1.0 ? 0 : T < 1.4 ? -0.7 : T < 1.8 ? 0.5 : 0;
        cat.headPitch = -0.1;
        if (T > 0.8 && T < 0.85) cat.earTwitch = 1;
        if (T > 1.5 && T < 1.55) cat.earTwitch = 1;
        cat.puff = seg(T, 1.88, 1.95);
        const hop = seg(T, 1.9, 2.05);
        cr.position.y += Math.sin(hop * Math.PI) * 0.35;
        cat.run = 0;
      } else if (T < 3.4) {
        // bolt off across the meadow, away from the camera
        const k = seg(T, 2.05, 3.3);
        cat.puff = Math.max(0, 1 - k * 2);
        cat.run = 1;
        cat.runPhase = T * 24;
        cat.headYaw = 0;
        const x = lerp(CAT_OUT, -9, k), z = lerp(CAT_Z, -7, k);
        cr.rotation.y = Math.atan2(-6, -9.5);
        cr.position.set(x, groundAt(x, z), z);
      } else if (T > catPeekT && T < catPeekT + 2.6) {
        // shy repeat peek from behind the rock
        const k = T - catPeekT;
        const out = smooth(seg(k, 0, 0.35)) * (1 - smooth(seg(k, 2.1, 2.5)));
        cr.position.set(lerp(CAT_IN, CAT_OUT, out), groundAt(CAT_OUT, CAT_Z), CAT_Z);
        cr.rotation.y = 0.9;
        cat.run = 0; cat.puff = 0;
        cat.headYaw = k < 1.1 ? 0.3 : -0.4;
        if (k > 0.5 && k < 0.55) cat.earTwitch = 1;
        if (k > 2.5) catPeekT = T + 14 + Math.random() * 8;
      } else {
        cr.position.set(-20, -5, 0);
      }
      cat.update(dt);

      // ---- dragon
      const dr = dragon.root;
      if (T < 2.0) {
        dr.visible = false;
      } else if (T < 3.3) {
        dr.visible = true;
        const k = 1 - Math.pow(1 - seg(T, 2.0, 3.3), 2);
        enterPath.getPointAt(k, tmpV);
        enterPath.getPointAt(Math.min(1, k + 0.02), lookAhead);
        if (k > 0.97) lookAhead.copy(tmpV).add(V(1, 0, 0.35));
        flyAlong(tmpV, lookAhead, dt);
        dragon.flapRate = 7; dragon.flapAmp = 1; dragon.hover = smooth(seg(T, 2.9, 3.3));
        dragon.jawOpen = 0; dragon.neckYaw *= 0.9; dragon.headPitch *= 0.9;
      } else if (T < 5.0) {
        // hover facing right, breathe a sweeping stream of fire across the sky down to the meadow
        const h = seg(T, 3.3, 3.5);
        dr.position.copy(HOVER);
        dr.rotation.set(-0.05, Math.atan2(1, 0.35), 0, 'YXZ');
        dragon.flapRate = 7.5; dragon.flapAmp = 1.15; dragon.hover = 1;
        const breath = T > 3.35 && T < 4.55;
        const bk = seg(T, 3.35, 4.45);
        const target = bk < 0.6 ? tmpV2.lerpVectors(fireA, fireB, smooth(bk / 0.6)) : tmpV2.lerpVectors(fireB, fireC, smooth((bk - 0.6) / 0.4));
        // aim the head (neck yaw + head pitch) at the target
        tmpV.copy(target);
        dr.worldToLocal(tmpV);
        const yaw = Math.atan2(tmpV.x, tmpV.z), pitch = Math.atan2(tmpV.y - 1.4, Math.hypot(tmpV.x, tmpV.z));
        dragon.neckYaw += (Math.max(-1.1, Math.min(1.1, yaw)) - dragon.neckYaw) * (1 - Math.exp(-8 * dt));
        dragon.neckPitch += (0.45 * h - dragon.neckPitch) * (1 - Math.exp(-8 * dt));      // stretch the neck forward
        dragon.headPitch += ((-pitch + 0.05) * h - dragon.headPitch) * (1 - Math.exp(-8 * dt));
        dragon.jawOpen += ((breath ? 1 : 0) - dragon.jawOpen) * (1 - Math.exp(-14 * dt));
        dragon.mouth.getWorldPosition(mouthW);
        if (breath) {
          emitFire(mouthW, target, 300, dt);
          fireLight.position.copy(mouthW).lerp(target, 0.4);
          fireLight.intensity = 110 + Math.random() * 50;
          this.shake = Math.max(this.shake, 0.12);
        } else fireLight.intensity *= Math.exp(-10 * dt);
      } else if (T < 6.8) {
        const k = smooth(seg(T, 5.0, 6.8));
        exitPath.getPointAt(k, tmpV);
        exitPath.getPointAt(Math.min(1, k + 0.02), lookAhead);
        if (k > 0.98) orbit(Math.PI + 0.05, lookAhead);
        flyAlong(tmpV, lookAhead, dt);
        dragon.hover = 1 - seg(T, 5.0, 5.5); dragon.jawOpen *= Math.exp(-8 * dt);
        dragon.neckYaw *= Math.exp(-4 * dt); dragon.headPitch *= Math.exp(-4 * dt); dragon.neckPitch *= Math.exp(-4 * dt);
        dragon.flapRate = 7; dragon.flapAmp = 1;
        fireLight.intensity *= Math.exp(-10 * dt);
      } else {
        // circle the mountains, now and then a puff of fire
        orbitA += dt * (Math.PI * 2 / 18);
        orbit(orbitA, tmpV);
        orbit(orbitA + 0.05, lookAhead);
        flyAlong(tmpV, lookAhead, dt, 0.6);
        const glide = 0.5 + 0.5 * Math.sin(T * 0.5);
        dragon.flapRate = 5 + glide * 1.5; dragon.flapAmp = 0.55 + 0.45 * glide; dragon.hover = 0;
        puffT -= dt;
        const puffing = puffT < 0.7 && puffT > 0;
        dragon.jawOpen += ((puffing ? 1 : 0) - dragon.jawOpen) * (1 - Math.exp(-10 * dt));
        dragon.headPitch = 0; dragon.neckYaw = 0;
        if (puffing) {
          dragon.mouth.getWorldPosition(mouthW);
          dragon.head.getWorldDirection(dirV);
          emitFire(mouthW, tmpV.copy(mouthW).addScaledVector(dirV, 9), 160, dt, 2.2);
        }
        if (puffT < 0) puffT = 8 + Math.random() * 5;
      }
      dragon.update(dt);

      // ---- Reko: sprints in with burning pants (4.3), turns (5.3), back to his spot (5.55-6.3), drinks (6.45),
      // steam poof (6.95), spin + pose (7.2-7.95); afterwards little gags
      if (reko) {
        if (T < 4.3) {
          reko.root.visible = false;
        } else if (T < 5.3) {
          reko.root.visible = true;
          const k = seg(T, 4.3, 5.3);
          rekoPlace(lerp(8.5, -2.2, k), REKO_Z, -Math.PI / 2);
          rekoRunPose(T * 22);
          burnPants(dt);
        } else if (T < 5.55) {
          const k = smooth(seg(T, 5.3, 5.55));
          rekoPlace(-2.2 - Math.sin(k * Math.PI) * 0.3, REKO_Z, lerp(-Math.PI / 2, Math.PI / 2, k));
          rekoRunPose(T * 22, 0.4);
          burnPants(dt);
        } else if (T < 6.3) {
          const k = seg(T, 5.55, 6.3);
          rekoPlace(lerp(-2.2, REKO_X, k), REKO_Z, Math.PI / 2);
          rekoRunPose(T * 24);
          burnPants(dt);
        } else if (T < 6.45) {
          const k = smooth(seg(T, 6.3, 6.45));
          rekoPlace(REKO_X, REKO_Z, lerp(Math.PI / 2, -0.25, k));
          rekoRest();
          reko.tilt.rotation.x = -0.15 * k;
          burnPants(dt);
        } else if (T < 7.2) {
          // gulp: lean back, three swallows
          const k = seg(T, 6.45, 7.2);
          rekoPlace(REKO_X, REKO_Z, -0.25);
          rekoRest();
          reko.tilt.rotation.x = -0.55 * Math.sin(Math.min(1, k * 1.4) * Math.PI / 2) * (1 - seg(T, 7.05, 7.2));
          const g = Math.max(0, Math.sin(k * Math.PI * 6));
          reko.squash.scale.set(1 + g * 0.05, 1 - g * 0.06, 1 + g * 0.05);
          if (T < 6.95) burnPants(dt);
          else if (!this._poofed) { this._poofed = true; reko.butt.getWorldPosition(tmpV); poof(tmpV); }
          if (Math.random() < dt * 14) { reko.flask.getWorldPosition(tmpV); sparkle(tmpV, 2, new THREE.Color(2.4, 0.5, 0.6)); }
        } else if (T < 7.95) {
          // hop + full spin, land with a squash, shades glint
          const k = seg(T, 7.2, 7.75);
          rekoPlace(REKO_X, REKO_Z, -0.25 + smooth(k) * Math.PI * 2);
          rekoRest();
          reko.root.position.y += Math.sin(k * Math.PI) * 0.7;
          const land = seg(T, 7.75, 7.95);
          const sq = Math.sin(land * Math.PI) * 0.14;
          reko.squash.scale.set(1 + sq, 1 - sq, 1 + sq);
          if (T > 7.75 && glintT < 0) glintT = 0;
        } else {
          // idle: breathing bob + a random gag every few seconds
          rekoPlace(REKO_X, REKO_Z, -0.25);
          rekoRest();
          const b = Math.sin(T * 2.4);
          reko.squash.scale.set(1 + b * 0.012, 1 - b * 0.015, 1 + b * 0.012);
          gagT -= dt;
          if (!gag && gagT < 0) { gag = { kind: ['sip', 'dance', 'shades', 'spin'][Math.floor(Math.random() * 4)], t: 0 }; gagT = 5 + Math.random() * 4; }
          if (gag) {
            gag.t += dt;
            const t = gag.t;
            if (gag.kind === 'sip') {
              reko.tilt.rotation.x = -0.45 * Math.sin(Math.min(1, t / 0.9) * Math.PI);
              if (Math.random() < dt * 10) { reko.flask.getWorldPosition(tmpV); sparkle(tmpV, 1, new THREE.Color(2.4, 0.5, 0.6)); }
              if (t > 0.9) gag = null;
            } else if (gag.kind === 'dance') {
              const ph = t * Math.PI * 2.5;
              reko.root.position.x += Math.sin(ph) * 0.25;
              reko.root.position.y += Math.abs(Math.sin(ph)) * 0.2;
              reko.tilt.rotation.z = Math.sin(ph) * 0.25;
              reko.root.rotation.y += Math.sin(ph) * 0.4;
              if (t > 1.6) gag = null;
            } else if (gag.kind === 'shades') {
              reko.root.position.y += Math.sin(Math.min(1, t / 0.4) * Math.PI) * 0.12;
              if (t > 0.25 && glintT < 0) glintT = 0;
              if (t > 0.7) gag = null;
            } else {
              const k = Math.min(1, t / 0.7);
              reko.root.rotation.y += smooth(k) * Math.PI * 2;
              reko.root.position.y += Math.sin(k * Math.PI) * 0.5;
              if (t > 0.7) gag = null;
            }
          }
        }
        // glint on the shades
        if (glintT >= 0) {
          glintT += dt;
          const k = glintT / 0.55;
          reko.shades.getWorldPosition(tmpV);
          glint.position.copy(tmpV).add(dirV.subVectors(camera.position, tmpV).normalize().multiplyScalar(0.3));
          const s = Math.sin(Math.min(1, k) * Math.PI) * 0.55;
          glint.scale.set(s, s, 1);
          glint.material.rotation = k * 2;
          glint.visible = k < 1;
          if (k >= 1) glintT = -1;
        }
      }

      // ambient embers drifting up
      if (Math.random() < dt * 6) sparks.emit({ pos: V((Math.random() - 0.5) * 16, 0.2, 2 - Math.random() * 10), vel: V(0.3, 0.5 + Math.random() * 0.5, 0), life: 3, size: 0.07, size1: 0.02, c0: new THREE.Color(2.4, 1.3, 0.4), c1: new THREE.Color(1.6, 0.6, 0.2), drag: 0.2 });
      fire.update(dt, camera, h * G.engine.renderer.getPixelRatio());
      smoke.update(dt, camera, h * G.engine.renderer.getPixelRatio());
      sparks.update(dt, camera, h * G.engine.renderer.getPixelRatio());
    },
    dispose() { disposeTree(scene); },
  };
  return S;
}

function V(x, y, z) { return new THREE.Vector3(x, y, z); }

// ------------------------------------------------------------------ HTML overlay (logo + Start)
function buildUi() {
  const root = document.createElement('div');
  root.id = 'title-ui';
  root.innerHTML = `
    <div class="ttl-logo">${LOGO_SVG}</div>
    <div class="ttl-bottom">
      <button class="ttl-start"><span>Start</span></button>
      <div class="ttl-hint">Click or press Enter</div>
    </div>
    <div class="ttl-foot">Scamigo Online · a Roumen fan adventure</div>`;
  document.body.appendChild(root);
  return { root, logo: root.querySelector('.ttl-logo'), bottom: root.querySelector('.ttl-bottom'), start: root.querySelector('.ttl-start') };
}

export const LOGO_SVG = `<svg viewBox="0 0 900 300" xmlns="http://www.w3.org/2000/svg" aria-label="Scamigo Online">
  <defs>
    <linearGradient id="lgGold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fffbe0"/><stop offset="0.42" stop-color="#ffd35a"/><stop offset="0.75" stop-color="#f59a22"/><stop offset="1" stop-color="#c8560f"/>
    </linearGradient>
    <linearGradient id="lgRibbon" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#e2474a"/><stop offset="1" stop-color="#8e1624"/>
    </linearGradient>
    <linearGradient id="lgShine" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.5" stop-color="#fff" stop-opacity="0.85"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <path d="M190 204 H710 L684 236 L710 268 H190 L216 236 Z" fill="url(#lgRibbon)" stroke="#3a0d10" stroke-width="7" stroke-linejoin="round"/>
  <path d="M150 214 H206 L190 236 L206 258 H150 L170 236 Z" fill="#7a1220" stroke="#3a0d10" stroke-width="6" stroke-linejoin="round"/>
  <path d="M750 214 H694 L710 236 L694 258 H750 L730 236 Z" fill="#7a1220" stroke="#3a0d10" stroke-width="6" stroke-linejoin="round"/>
  <text x="450" y="250" text-anchor="middle" font-family="'Lilita One', 'Nunito', sans-serif" font-size="42" letter-spacing="16" fill="#ffe7a8" stroke="#3a0d10" stroke-width="5" paint-order="stroke">ONLINE</text>
  <text x="450" y="178" text-anchor="middle" font-family="'Lilita One', 'Nunito', sans-serif" font-size="158" letter-spacing="3" fill="url(#lgGold)" stroke="#3b1405" stroke-width="16" stroke-linejoin="round" paint-order="stroke">SCAMIGO</text>
  <text class="ttl-shine" x="450" y="178" text-anchor="middle" font-family="'Lilita One', 'Nunito', sans-serif" font-size="158" letter-spacing="3" fill="url(#lgShine)" opacity="0.5">SCAMIGO</text>
  <g fill="#fff6d0"><path d="M118 70 l7 18 18 7 -18 7 -7 18 -7 -18 -18 -7 18 -7z"/><path d="M790 48 l5 13 13 5 -13 5 -5 13 -5 -13 -13 -5 13 -5z"/></g>
</svg>`;

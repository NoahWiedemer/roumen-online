// The Tower of Isel: the user's huge tower model (/models/tower.glb, a spired castle on a rock) rising at the east end
// of the Windward Glade, and the portal into the tower at the foot of its rock. The portal is sealed by a pink
// hypnotic barrier until the hero has defeated Cumbot 9000 once (player flag); the tower itself is not built yet,
// so an open portal only tells the hero so.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createPortal } from '../portal.js';
import { G } from '../../game/game.js';
import { ISEL_TOWER, ISEL_PORTAL } from './layout.js';

const BASE = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '/';
export const ISEL_FLAG = 'boss:cumbot';          // set by entities/bosses/cumbot.js on the first victory
// spire axis of the raw model (x, z): the rock base is not centred under the tower
const AXIS = [0.03, -0.22];

const BARRIER_FS = `
  uniform float uTime, uAlpha; varying vec2 vUv;
  void main(){
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    if (r > 1.0) discard;
    float a = atan(p.y, p.x);
    float sp = sin(a * 2.0 - r * 16.0 + uTime * 3.0);
    float band = smoothstep(0.3, 1.0, sp);
    float hex = abs(sin(p.x * 18.0 + sin(p.y * 18.0) * 0.6) * sin(p.y * 16.0));
    float rim = smoothstep(0.82, 0.98, r);
    vec3 col = mix(vec3(0.55, 0.08, 0.5), vec3(1.0, 0.45, 0.92), band) + vec3(1.0, 0.7, 1.0) * rim;
    float alpha = (0.28 + band * 0.4 + rim * 0.6 + smoothstep(0.85, 1.0, hex) * 0.15) * uAlpha;
    gl_FragColor = vec4(col, alpha);
  }`;

export async function buildIselTower(ctx) {
  const T = ctx.terrain;
  const t = ISEL_TOWER;
  const gy = T.heightAt(t.x, t.z);
  let mesh = null;
  try {
    const gltf = await new GLTFLoader().loadAsync(BASE + 'models/tower.glb');
    let src = null;
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((o) => { if (!src && o.isMesh) src = o; });
    const geo = src.geometry.clone();
    geo.applyMatrix4(src.matrixWorld);
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    const s = t.height / (bb.max.y - bb.min.y);
    geo.translate(-AXIS[0], -bb.min.y, -AXIS[1]);
    // drop the triangles buried under the glade (the model's underside has some stray flat pieces too)
    const cut = (t.sink - 0.6) / s, P = geo.attributes.position, I = geo.index.array, keep = [];
    for (let i = 0; i < I.length; i += 3) if (P.getY(I[i]) > cut || P.getY(I[i + 1]) > cut || P.getY(I[i + 2]) > cut) keep.push(I[i], I[i + 1], I[i + 2]);
    geo.setIndex(keep);
    geo.computeBoundingSphere();
    const mat = src.material;
    // the tower is a landmark: fog only veils it partly, so its silhouette shows from across the hill
    mat.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <fog_fragment>', `#ifdef USE_FOG
        #ifdef FOG_EXP2
          float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
        #else
          float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
        #endif
        gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor * 0.72);
      #endif`);
    };
    mat.customProgramCacheKey = () => 'isel-tower-v1';
    mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'tower-of-isel';
    mesh.scale.setScalar(s);
    mesh.position.set(t.x, gy - t.sink, t.z);
    mesh.rotation.y = t.rotY;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    ctx.scene.add(mesh);
  } catch (e) { console.warn('tower of isel model', e); }
  ctx.colliders.addCircle(t.x, t.z, t.rockR);
  ctx.addNoScatter(t.x, t.z, t.rockR + 5);
  ctx.minimap.addCircle(t.x, t.z, t.rockR, 'rgba(140,150,140,0.85)');
  ctx.minimap.addCircle(t.x, t.z, 7, 'rgba(210,225,215,0.95)');

  // ---- the portal into the tower, sealed until Cumbot 9000 is beaten
  const P = ISEL_PORTAL;
  const portal = createPortal({ id: 'to_isel', name: 'Tower of Isel', x: P.x, y: T.groundAt(P.x, P.z), z: P.z, rotY: P.rotY });
  portal.dest = 'isel';
  portal.arriveDist = 3.5;           // (coming back out: stay clear of Cumbot's aggro range)
  ctx.scene.add(portal.group);
  const c = Math.cos(P.rotY), sn = Math.sin(P.rotY);
  for (const sx of [-1, 1]) ctx.colliders.addCircle(P.x + c * sx * 2.35, P.z - sn * sx * 2.35, 0.6);
  ctx.addNoScatter(P.x, P.z, 5);
  ctx.minimap.addCircle(P.x, P.z, 2.2, '#ff8ae0');
  const barrierMat = new THREE.ShaderMaterial({
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: BARRIER_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uAlpha: { value: 1 } },
  });
  const barrier = new THREE.Mesh(new THREE.CircleGeometry(2.25, 48), barrierMat);
  barrier.position.set(0, 3.1, 0.62);
  barrier.renderOrder = 5;
  portal.group.add(barrier);
  const locked = () => !(G.player && G.player.flags[ISEL_FLAG]);
  portal.locked = locked;
  portal.lockedMsg = 'A pink, humming barrier seals the portal. Its tune comes from Cumbot 9000...';
  portal.onUse = () => {
    if (locked()) { G.msg(portal.lockedMsg, 'warn'); G.audio.play('error'); return; }
    G.fx.pillar(portal.pos.clone(), '#ff9ae8', 1.4, 0.9, 7);
    G.travel('isel');
  };
  let wasLocked = null;
  const baseUpdate = portal.update;
  portal.update = (dt, time, fx) => {
    baseUpdate(dt, time, fx);
    const l = locked();
    if (wasLocked === true && !l) {
      // the barrier shatters the moment Cumbot falls
      barrier.getWorldPosition(_p);
      for (let i = 0; i < 60; i++) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * 2.2;
        G.fx.particles.emit({ x: _p.x + Math.cos(a) * r * 0.3, y: _p.y + Math.sin(a) * r, z: _p.z + Math.cos(a) * r, vx: (Math.random() - 0.5) * 6, vy: Math.random() * 4, vz: (Math.random() - 0.5) * 6, life: 1.1, size: 0.35, color: new THREE.Color('#ff8ae8'), grav: -6, drag: 1.2 });
      }
      G.audio.play('glint');
    }
    wasLocked = l;
    barrier.visible = l;
    barrierMat.uniforms.uTime.value = time;
    barrierMat.uniforms.uAlpha.value = 0.85 + Math.sin(time * 2.4) * 0.15;
  };
  return { mesh, portal };
}
const _p = new THREE.Vector3();

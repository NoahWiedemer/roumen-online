// Render small face portraits of 3D models into data URLs (for HUD frames)
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

let rt = null, scene = null, cam = null;
const cache = new Map();

function setup(renderer) {
  if (rt) return;
  rt = new THREE.WebGLRenderTarget(160, 160, { samples: 4 });
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a6a, 1.4));
  const d = new THREE.DirectionalLight(0xfff0e0, 2.2);
  d.position.set(1, 2, 3);
  scene.add(d);
  cam = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
}

// object: THREE.Object3D (cloned internally); focus: world-space point relative to object origin (e.g. head centre)
export function renderPortrait(renderer, key, object, focusY, dist = 1.1, { yaw = 0.35, env = null } = {}) {
  if (key && cache.has(key)) return cache.get(key);
  setup(renderer);
  const clone = SkeletonUtils.clone(object); // rebinds skinned meshes to the cloned bones (plain clone would keep the originals)
  clone.position.set(0, 0, 0);
  clone.rotation.set(0, 0, 0);
  clone.scale.copy(object.scale);
  clone.traverse((o) => { o.frustumCulled = false; });
  scene.add(clone);
  scene.environment = env;
  cam.position.set(Math.sin(yaw) * dist, focusY + dist * 0.12, Math.cos(yaw) * dist);
  cam.lookAt(0, focusY - dist * 0.03, 0);
  const prevTarget = renderer.getRenderTarget();
  const prevClear = renderer.getClearAlpha();
  const prevColor = new THREE.Color(); renderer.getClearColor(prevColor);
  const prevTM = renderer.toneMapping;
  renderer.setRenderTarget(rt);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.render(scene, cam);
  const px = new Uint8Array(160 * 160 * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, 160, 160, px);
  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(prevColor, prevClear);
  renderer.toneMapping = prevTM;
  scene.remove(clone);
  const c = document.createElement('canvas');
  c.width = c.height = 160;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(160, 160);
  // flip Y and convert linear → sRGB-ish (render target stores linear values)
  for (let y = 0; y < 160; y++) {
    for (let x = 0; x < 160; x++) {
      const si = ((159 - y) * 160 + x) * 4, di = (y * 160 + x) * 4;
      img.data[di] = lin2srgb(px[si]); img.data[di + 1] = lin2srgb(px[si + 1]); img.data[di + 2] = lin2srgb(px[si + 2]); img.data[di + 3] = px[si + 3];
    }
  }
  ctx.putImageData(img, 0, 0);
  const url = c.toDataURL();
  if (key) cache.set(key, url);
  return url;
}

const LUT = new Uint8Array(256);
for (let i = 0; i < 256; i++) {
  const v = i / 255;
  // render target is sRGB encoded already; apply a gentle contrast boost only
  LUT[i] = Math.round(Math.min(1, Math.pow(v, 0.95) * 1.04) * 255);
}
function lin2srgb(v) { return LUT[v]; }

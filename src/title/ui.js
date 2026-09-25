// Small shared helpers for the title / character-select screens: a full-screen fade and a star sprite texture.
import * as THREE from 'three';

let fadeEl = null;
// fade the screen to black (true) or back in (false); resolves when the transition is done
export function fadeScreen(toBlack, ms = 400) {
  if (!fadeEl) {
    fadeEl = document.createElement('div');
    fadeEl.id = 'scene-fade';
    document.body.appendChild(fadeEl);
  }
  fadeEl.style.transitionDuration = ms + 'ms';
  if (toBlack) fadeEl.classList.add('on');
  // force a style flush so the transition runs even right after creation
  void fadeEl.offsetWidth;
  if (!toBlack) fadeEl.classList.remove('on');
  return new Promise((r) => setTimeout(r, ms));
}

let star = null;
export function starTexture() {
  if (star) return star;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.15, 'rgba(255,255,255,0.6)');
  grd.addColorStop(0.4, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#fff';
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2, r = i % 2 === 0 ? 62 : 7;
    g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
  star = new THREE.CanvasTexture(c);
  star.colorSpace = THREE.SRGBColorSpace;
  return star;
}

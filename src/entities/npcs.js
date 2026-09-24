// Town NPCs built from the humanoid generator, with idle behaviour and quest markers
import * as THREE from 'three';
import { createHumanoid } from './humanoid.js';
import { Animator, P_IDLE, fullPose } from './anim.js';
import { NPCS } from '../game/data.js';
import { G } from '../game/game.js';
import { dampAngle } from '../core/utils.js';
import { NPC_POINTS } from '../world/layout.js';

// relaxed standing pose for unarmed NPCs
const P_NPC = fullPose({
  ...P_IDLE,
  armR: [0.08, 0, -0.22], elbowR: [-0.25, 0, 0], handR: [0, 0, -0.1],
  armL: [0.08, 0, 0.22], elbowL: [-0.25, 0, 0], handL: [0, 0, 0.1],
});
const P_GUARD = fullPose({
  ...P_IDLE,
  armR: [-0.35, 0, -0.2], elbowR: [-0.9, 0, 0], handR: [0, 0, 0],
  armL: [0.05, 0, 0.18], elbowL: [-0.2, 0, 0],
});
const P_ARMS_CROSSED = fullPose({
  ...P_IDLE,
  armR: [-0.4, 0, -0.1], elbowR: [-1.9, -0.9, 0], handR: [0, 0, 0],
  armL: [-0.4, 0, 0.1], elbowL: [-1.9, 0.9, 0], handL: [0, 0, 0],
});

const LOOKS = {
  elder: { outfit: 'robe', hair: 'short', hairColor: '#e8e4dc', skin: '#f6d2b8', clothColor: '#4a6fb5', armorColor: '#2f4f8f', trimColor: '#e8c060', leatherColor: '#6a4a2a', beard: true, hairSeed: 3, headband: false, face: { irisColor: ['#9fc8ff', '#3a6ab0', '#1a2a50'], browColor: '#bbbbbb', smile: 0.02, eyeScale: 0.8 }, scale: 0.98, pose: P_NPC },
  healer: { outfit: 'dress', hair: 'long', hairColor: '#f2d27a', skin: '#ffe0cc', clothColor: '#ffffff', cloth2Color: '#fff6f0', trimColor: '#ff8fb0', leatherColor: '#e07090', hat: null, hairSeed: 11, face: { irisColor: ['#b8f0c0', '#3fae6a', '#14502a'], browColor: '#c9a050', lashes: true, smile: 0.025 }, pose: P_NPC },
  merchant: { outfit: 'merchant', hair: 'short', hairColor: '#6b3f22', skin: '#f2c8a8', clothColor: '#3f8f5a', cloth2Color: '#f0e2c0', trimColor: '#e8b44a', leatherColor: '#7a4a2a', hat: 'cap', armorDark: '#2e6b44', hairSeed: 5, face: { irisColor: ['#e0c080', '#8a5a2a', '#3a200a'], browColor: '#5a3018', smile: 0.03 }, pose: P_NPC },
  smith: { outfit: 'guard', hair: 'short', hairColor: '#3a2a22', skin: '#e8b890', clothColor: '#3a3440', armorColor: '#6f6a70', armorDark: '#4a464c', trimColor: '#c08040', leatherColor: '#5a3620', bootColor: '#4a3a30', apron: true, beard: true, hairSeed: 9, face: { irisColor: ['#c0a080', '#6a4a2a', '#2a1a0a'], browColor: '#2a1a12', browTilt: 0.2 }, scale: 1.05, pose: P_ARMS_CROSSED },
  armorer: { outfit: 'guard', hair: 'ponytail', hairColor: '#b8452a', skin: '#ffd8c0', clothColor: '#2a3450', armorColor: '#5a7ab8', armorDark: '#3a5088', trimColor: '#e8c060', leatherColor: '#6a4a2a', bootColor: '#3a5088', hairSeed: 13, face: { irisColor: ['#a0e0ff', '#2a88c0', '#0a3050'], browColor: '#8a3018', lashes: true }, pose: P_ARMS_CROSSED },
  master: { outfit: 'robe', hair: 'ponytail', hairColor: '#1e1e2a', skin: '#f0cfb2', clothColor: '#7a2a3a', armorColor: '#5a1a2a', trimColor: '#e8c060', leatherColor: '#2a1a1a', hairSeed: 17, headband: false, face: { irisColor: ['#ffd0a0', '#b04a2a', '#401008'], browColor: '#1a1a22', browTilt: 0.25 }, pose: P_ARMS_CROSSED },
  storage: { outfit: 'dress', hair: 'bob', hairColor: '#7a4ab0', skin: '#ffe0cc', clothColor: '#6a5a9a', cloth2Color: '#efe6ff', trimColor: '#e8c060', leatherColor: '#4a3a6a', hairSeed: 19, face: { irisColor: ['#e0c0ff', '#8a4ad0', '#301050'], browColor: '#5a3080', lashes: true, smile: 0.02 }, pose: P_NPC },
  guard: { outfit: 'guard', hair: 'short', hairColor: '#5a3a1a', skin: '#f2c8a8', clothColor: '#2a3050', armorColor: '#3a6ab8', armorDark: '#243f78', trimColor: '#e8c060', bootColor: '#2a3a68', hat: 'guard', weapon: 'spear', hairSeed: 21, face: { irisColor: ['#a0c0e0', '#3a5a8a', '#101a30'], browColor: '#3a2210', browTilt: 0.2 }, pose: P_GUARD },
  kid: { outfit: 'dress', hair: 'bob', hairColor: '#f09a3a', skin: '#ffe0cc', clothColor: '#ff7a9a', cloth2Color: '#fff0f4', trimColor: '#ffd84a', leatherColor: '#a05030', hairSeed: 23, face: { irisColor: ['#c0ffa0', '#4ab02a', '#104010'], browColor: '#c06020', lashes: true, smile: 0.03 }, scale: 0.78, pose: P_NPC },
  farmer: { outfit: 'merchant', hair: 'short', hairColor: '#c89a5a', skin: '#e8b890', clothColor: '#6a8a3a', cloth2Color: '#e8dcc0', trimColor: '#a07a3a', leatherColor: '#6a4a2a', hat: 'cap', armorDark: '#8a6a3a', hairSeed: 29, face: { irisColor: ['#d0c080', '#7a6a2a', '#302a0a'], browColor: '#7a5a30' }, pose: P_NPC },
  bard: { outfit: 'robe', hair: 'long', hairColor: '#3a8a6a', skin: '#ffe0cc', clothColor: '#d8a030', armorColor: '#a07020', trimColor: '#ffffff', leatherColor: '#6a3a1a', hat: 'wizard', hairSeed: 31, headband: false, cape: true, capeColor: '#b03040', face: { irisColor: ['#ffe0a0', '#c08a2a', '#402a0a'], browColor: '#2a5a4a', smile: 0.03 }, pose: P_NPC },
};

export class NPC {
  constructor(def, spot) {
    this.def = def;
    this.id = def.id;
    this.name = def.name;
    this.title = def.title;
    this.isNpc = true;
    const look = LOOKS[def.look] || LOOKS.merchant;
    this.rig = createHumanoid({ ...look, name: def.id, weapon: look.weapon || null });
    this.anim = new Animator(this.rig, { idlePose: look.pose || P_NPC });
    this.root = this.rig.root;
    this.radius = 0.45;
    this.scale = look.scale || 1;
    this.height = 1.8 * this.scale;
    this.pos = new THREE.Vector3(spot.x, G.terrain.groundAt(spot.x, spot.z), spot.z);
    this.homeRot = spot.rotY || 0;
    this.rotY = this.homeRot;
    this.groundY = this.pos.y;
    this.waveCd = 3 + Math.random() * 5;
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.rotY;
    this.marker = null;
    G.scene.add(this.root);
    G.colliders.addCircle(spot.x, spot.z, 0.5);
    this.buildMarker();
  }
  headPos() { return new THREE.Vector3(this.pos.x, this.pos.y + this.height + 0.1, this.pos.z); }

  buildMarker() {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    this.markerCanvas = c;
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
    s.scale.setScalar(0.75);
    s.position.y = this.height + 0.85;
    s.visible = false;
    s.renderOrder = 8;
    this.root.add(s);
    this.marker = s;
    this.markerKind = null;
  }
  setMarker(kind) {
    if (kind === this.markerKind) return;
    this.markerKind = kind;
    if (!kind) { this.marker.visible = false; return; }
    const ctx = this.markerCanvas.getContext('2d');
    ctx.clearRect(0, 0, 128, 128);
    const col = kind === 'available' ? ['#fff3a0', '#ffc21a', '#b87400'] : kind === 'complete' ? ['#c8ff9a', '#4fd13a', '#1f7a12'] : ['#e0e0e0', '#a0a0a0', '#606060'];
    const g = ctx.createRadialGradient(56, 44, 6, 64, 64, 56);
    g.addColorStop(0, col[0]); g.addColorStop(0.6, col[1]); g.addColorStop(1, col[2]);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(64, 60, 44, 52, 0, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 6; ctx.strokeStyle = '#3a2400'; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath(); ctx.ellipse(48, 36, 14, 9, -0.5, 0, Math.PI * 2); ctx.fill();
    ctx.font = '900 64px Nunito, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 8; ctx.strokeStyle = '#3a2400';
    const ch = kind === 'complete' ? '?' : '!';
    ctx.strokeText(ch, 64, 64); ctx.fillStyle = '#ffffff'; ctx.fillText(ch, 64, 64);
    this.marker.material.map.needsUpdate = true;
    this.marker.visible = true;
  }

  update(dt) {
    const p = G.player;
    const d = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
    // face the player when close
    if (d < 6) this.faceGoal = Math.atan2(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
    else this.faceGoal = this.homeRot;
    this.rotY = dampAngle(this.rotY, this.faceGoal, 4, dt);
    this.waveCd -= dt;
    if (d < 7 && this.waveCd <= 0 && !this.anim.busy) {
      this.anim.play('wave');
      this.waveCd = 12 + Math.random() * 10;
    }
    if (this.marker.visible) this.marker.position.y = this.height + 0.85 + Math.sin(G.time * 3) * 0.08;
    this.root.visible = d < 120;
    if (d < 70) this.anim.update(dt, null);
    this.root.rotation.y = this.rotY;
  }
}

export class NpcManager {
  constructor() {
    this.list = [];
    for (const def of NPCS) {
      const pt = NPC_POINTS[def.spot];
      if (!pt) continue;
      this.list.push(new NPC(def, { x: pt[0], z: pt[1], rotY: def.rot || 0 }));
    }
  }
  get(id) { return this.list.find((n) => n.id === id); }
  update(dt) { for (const n of this.list) n.update(dt); }
  interact(npc) { G.emit('npcInteract', npc); }
  refreshMarkers() {
    for (const n of this.list) n.setMarker(G.quests.markerFor(n.id));
  }
}

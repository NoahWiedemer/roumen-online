// Randomised (seeded) house styling
import { mulberry32 } from '../../core/utils.js';
import { townMaterials } from './materials.js';
import { PALETTE } from './parts.js';
import { SIGN } from './textures.js';

const WALLS = [[1, 1, 1], [1.02, 0.98, 0.9], [1.03, 0.94, 0.88], [1.02, 1.0, 0.84], [1.0, 0.93, 0.93], [1.04, 1.02, 0.97]];
const TIMBER = [[1, 1, 1], [1.25, 1.08, 0.98], [0.85, 0.8, 0.8], [1.1, 0.95, 0.9]];
const STONE = [[1, 1, 1], [1.05, 1.0, 0.95], [0.98, 0.98, 1.0]];

export const ROOF_COLORS = { roofRed: '#c9503a', roofBlue: '#3f6cc0', roofPink: '#d9667f', roofSlate: '#5d6474' };

export function makeHouseSpec(seed, kind = 'plain', o = {}) {
  const M = townMaterials();
  const rng = mulberry32(seed);
  const pick = (a) => a[Math.floor(rng() * a.length)];
  const w = o.w ?? 7.5 + rng() * 2.5;
  const d = o.d ?? 7 + rng() * 1.5;
  const floors = o.floors ?? (rng() < 0.35 ? 3 : 2);
  const roofR = rng();
  const roofKey = o.roofKey ?? (roofR < 0.6 ? 'roofRed' : roofR < 0.8 ? 'roofBlue' : roofR < 0.92 ? 'roofPink' : 'roofSlate');
  const nb = Math.max(2, Math.round(w / 2.05));
  const S = {
    seed, kind, w, d, floors,
    fh: [3.3, 2.9, 2.75].slice(0, floors),
    jetty: rng() < 0.7 ? 0.35 + rng() * 0.15 : 0,
    ground: rng() < 0.45 ? 'stone' : 'plaster',
    roof: w > 9.5 && rng() < 0.6 ? 'cross' : rng() < 0.62 ? 'side' : rng() < 0.7 ? 'front' : 'cross',
    pitch: (52 + rng() * 7) * Math.PI / 180,
    roofKey, roofMat: M[roofKey], roofCol: [1, 1, 1],
    wallCol: pick(WALLS), timberCol: pick(TIMBER), stoneCol: pick(STONE),
    shutterCol: pick(PALETTE.shutters), shutters: rng() < 0.65,
    doorCol: pick(PALETTE.doors), doorArch: rng() < 0.4, canopy: rng() < 0.3, doorLamp: rng() < 0.35,
    pattern: Math.floor(rng() * 3),
    litP: 0.18, flowerP: 0.75,
    turret: rng() < 0.28 ? (rng() < 0.5 ? -1 : 1) : 0,
    oriel: null, balcony: null, dormers: 0, chimney: rng() < 0.7,
    archWin: rng() < 0.5,
    shop: null, sign: null,
  };
  S.doorBay = Math.min(nb - 1, Math.floor(rng() * nb));
  if (S.roof === 'side' && rng() < 0.6) S.dormers = w > 8.8 && rng() < 0.5 ? 2 : 1;
  if (S.roof === 'cross') { S.wingW = Math.min(4.4, w * 0.45); S.wingX = (rng() < 0.5 ? -1 : 1) * (w / 2 - S.wingW / 2 - 0.6); }
  // upper floor features
  const upper = rng();
  if (upper < 0.3) S.oriel = { bay: Math.floor(rng() * nb) };
  else if (upper < 0.55) S.balcony = { bay: Math.floor(rng() * nb) };
  if (S.turret && S.roof === 'front') S.turret = 0;
  if (S.dormers === 1) S.dormerX = S.oriel ? -w / 2 + (S.oriel.bay + 0.5) * (w / nb) : 0;
  if (S.turret && S.dormers === 2) S.dormers = 1, S.dormerX = -S.turret * w * 0.15;
  if (S.turret) S.turretRoofMat = rng() < 0.5 ? M.roofBlue : S.roofMat;

  // special kinds
  if (kind === 'shop' || kind === 'potion' || kind === 'bakery' || kind === 'armor') {
    S.ground = rng() < 0.5 ? 'stone' : 'plaster';
    S.doorBay = rng() < 0.5 ? 0 : nb - 1;
    S.shop = { bay: S.doorBay === 0 ? 1 : 0, span: nb >= 3 ? 2 : 1, awning: Math.floor(rng() * 4), frameCol: pick([[0.36, 0.55, 0.36], [0.32, 0.45, 0.72], [0.62, 0.3, 0.3], [0.5, 0.35, 0.22]]) };
    if (S.shop.span === 2 && S.shop.bay + 1 === S.doorBay) S.shop.span = 1;
    S.sign = kind === 'bakery' ? SIGN.bakery : kind === 'armor' ? SIGN.armor : SIGN.potion;
    S.doorLamp = true;
    if (S.balcony) S.balcony = null;
  }
  if (kind === 'inn') {
    S.floors = 3; S.fh = [3.4, 2.9, 2.75]; S.roof = 'cross'; S.wingW = 4.2; S.wingX = 0;
    S.balcony = null; S.oriel = { bay: 0 }; S.turret = 1; S.turretRoofMat = M.roofBlue;
    S.sign = SIGN.inn; S.doorLamp = true; S.canopy = true; S.litP = 0.6; S.shutters = true;
    S.doorBay = Math.floor(nb / 2); S.dormers = 0; S.jetty = 0.4; S.chimney = true;
  }
  if (kind === 'storage') {
    S.floors = 2; S.fh = [3.6, 3.0]; S.roof = 'front'; S.hoist = true; S.ground = 'stone'; S.jetty = 0;
    S.turret = 0; S.oriel = null; S.balcony = null; S.sign = SIGN.storage; S.shutters = true; S.shutterCol = [0.36, 0.55, 0.36];
    S.doorBay = Math.floor(nb / 2); S.doorArch = true; S.dormers = 0;
  }
  if (kind === 'smithy') {
    S.ground = 'stone'; S.floors = 2; S.fh = [3.3, 2.9]; S.turret = 0; S.sign = null; S.chimney = true; S.chimneyX = -w * 0.3;
    S.doorBay = nb - 1; S.oriel = null;
  }
  for (const k of Object.keys(o)) if (o[k] !== undefined) S[k] = o[k];
  S.fh = S.fh.slice(0, S.floors);
  while (S.fh.length < S.floors) S.fh.push(2.8);
  return S;
}

// Cyclone Hill (Zyklonhügel) — map definition. Units are metres, +x = east, -z = north.
//
//   South: the Forest of Mist (Nebelwald) — a foggy valley between high cliffs with waterfalls, a river,
//          big trees, bamboo groves and healing herbs. The portal back to Roumen stands at the south end.
//   Centre/north: Cyclone Hill — a tiered hill like a layered cake (T1..T4). Ramps wind up along the tier
//          walls, two gorges cut through the lower tiers and are crossed by bridges. Palisade fort on top.
//   East: a misty chasm; a long trestle bridge runs from tier 3 along gorge A across the chasm to the
//          Windward Glade, a raised forest clearing. At its east end the huge Tower of Isel rises from its rock;
//          Cumbot 9000 guards the portal into the tower in the arena in front of it.
//
// Angles on the hill are measured around HILL with atan2(z - HILL.z, x - HILL.x): 0 = east, +90° = south,
// ±180° = west, -90° = north.

export const MAP = { size: 360, half: 180, playable: 168 };

const D = Math.PI / 180;
export const deg = (a) => a * D;

// ------------------------------------------------------------------ the tiered hill
export const HILL = { x: 0, z: -40 };
export const TIER_H = 9;                              // height of each tier step
export const TIERS = [                                // outer radius (base), top height
  { r: 74, h: 9 }, { r: 55, h: 18 }, { r: 37, h: 27 }, { r: 20, h: 36 },
];
export const TIER_WALL = 2.8;                         // horizontal width of a tier wall (steep, not walkable)
export const RING_SOUTH = 14;                          // flat ground ring around the hill (south half)

export const polar = (a, r) => [HILL.x + Math.cos(a) * r, HILL.z + Math.sin(a) * r];
// points along an arc around the hill: angle a0 -> a1 (degrees), radius r0 -> r1
export function arc(a0, a1, r0, r1, n = 8) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push(polar(deg(a0 + (a1 - a0) * t), r0 + (r1 - r0) * t));
  }
  return out;
}

// gorges cut radially through the lower tiers; they bite slightly into the tier-3 rim so no ledge of tier 2
// survives around the gorge head (the tier-2 halves must only be connected by the bridges)
export const GORGES = [
  { id: 'gorgeA', angle: deg(0), r0: 36, r1: 88, halfWidth: 8, floor: -12, water: -11 },         // east, into the chasm
  { id: 'gorgeB', angle: deg(-135), r0: 36, r1: 110, halfWidth: 6.5, floor: -10, water: -9 },    // north-west, into the cliffs
];

// ------------------------------------------------------------------ the Windward Glade (raised clearing) + Tower of Isel
// an ellipse stretched east-west (r = north-south radius, rx = east-west radius): from the bridge landing at the
// chasm to the foot of the tower
export const GLADE = { x: 133, z: -40, r: 31, rx: 42, h: 27 };
// distance from the glade centre in "r units" (< GLADE.r inside the clearing)
export const gladeDist = (x, z) => Math.hypot((x - GLADE.x) * GLADE.r / GLADE.rx, z - GLADE.z);
// the tower (/models/tower.glb): centred on its spire, sunk into the glade's east rim, gate facing the bridge (west);
// rockR = footprint of its rock base (collider)
export const ISEL_TOWER = { x: 162, z: -40, height: 104, sink: 7, rotY: -Math.PI / 2, rockR: 22 };
// the portal into the tower at the foot of the rock, and the arena where Cumbot 9000 waits in front of it
export const ISEL_PORTAL = { x: 132.5, z: -40, rotY: -Math.PI / 2 };
export const BOSS_ARENA = { x: 116, z: -40, r: 18 };
export const BOSS_HOME = { x: 124, z: -40, rotY: -Math.PI / 2 };

// ------------------------------------------------------------------ the chasm between hill and glade
export const CHASM = {
  pts: [[80, -168], [84, -122], [81, -84], [83, -40], [80, -6], [88, 22], [112, 38], [140, 44]],
  halfWidth: 8.5, floor: -14, water: -12,
};

// ------------------------------------------------------------------ Forest of Mist valley
export const VALLEY = { x0: -66, x1: 66, z0: 4, z1: 174 };
// low earthen mounds scattered in the forest
export const MOUNDS = [
  { x: -36, z: 138, r: 15, h: 4.5 }, { x: 40, z: 150, r: 13, h: 3.5 }, { x: 38, z: 88, r: 16, h: 5 },
  { x: -34, z: 72, r: 12, h: 3.2 }, { x: 30, z: 58, r: 11, h: 2.6 }, { x: -48, z: 102, r: 8, h: 2.2 },
];

// water: forest pools + river (flat water at `level`; the terrain is carved below it)
export const POOLS = [
  { id: 'pool_w', x: -56, z: 118, r: 10, level: -0.9, depth: -2.6 },
  { id: 'pool_e', x: 55, z: 132, r: 11, level: -0.9, depth: -2.6 },
  { id: 'pool_w2', x: -57, z: 62, r: 8, level: -0.9, depth: -2.4 },
];
export const RIVER = {
  pts: [[-52, 116], [-40, 108], [-24, 112], [-6, 108], [8, 110], [24, 118], [40, 124], [52, 130]],
  halfWidth: 3.8, level: -0.9, depth: -2.4,
};
// waterfalls: lip on the cliff top (x,z; height taken from the terrain) -> base in the water below (x,z,level)
export const WATERFALLS = [
  { id: 'wf_west', lip: [-78, 119], base: [-60, 118.5, -0.9], width: 5.5 },
  { id: 'wf_east', lip: [79, 133], base: [59, 132.5, -0.9], width: 6.5 },
  { id: 'wf_west2', lip: [-78, 62], base: [-60, 62, -0.9], width: 4 },
  { id: 'wf_chasm', lip: [102, -68], base: [85, -68, -12], width: 5 },
  { id: 'wf_gorgeB', lip: [-76.4, -116.4], base: [-62.2, -102.2, -9], width: 4.5 },
];

// ------------------------------------------------------------------ walking routes
// forest trail from the arrival portal to the foot of the hill
export const FOREST_PATH = [[0, 160], [-7, 142], [5, 124], [4, 111], [-5, 94], [5, 76], [-3, 58], [-2, 46], [-12, 38]];
export const PATH_WIDTH = 5;

// ramps (terrain overrides): polyline + height at start / end; they climb along the outside of a tier wall
export const RAMPS = [
  { id: 'ramp1', pts: arc(98, 140, 78.5, 67, 10), width: 7, h0: 0, h1: 9, kind: 'dirt' },
  { id: 'ramp2', pts: arc(-104, -64, 59.5, 48.5, 10), width: 6.5, h0: 9, h1: 18, kind: 'dirt' },
  { id: 'ramp3', pts: arc(104, 48, 41.5, 30.5, 12), width: 6, h0: 18, h1: 27, kind: 'dirt' },
  { id: 'ramp4', pts: arc(-24, -108, 24.5, 14.5, 12), width: 5, h0: 27, h1: 36, kind: 'stairs' },
];

// bridges (walkable decks): polyline, width, deck height at start / end, arch = extra height in the middle
const perpB = [Math.cos(deg(-135) + Math.PI / 2), Math.sin(deg(-135) + Math.PI / 2)];
const onGorgeB = (r, half) => {
  const [cx, cz] = polar(deg(-135), r);
  return [[cx - perpB[0] * half, cz - perpB[1] * half], [cx + perpB[0] * half, cz + perpB[1] * half]];
};
export const BRIDGES = [
  { id: 'river_bridge', pts: [[3.2, 102.5], [4.6, 117]], width: 4.2, h0: -0.2, h1: -0.2, arch: 0.9, kind: 'plank' },
  { id: 'gorgeB_t1', pts: onGorgeB(64.5, 12.5), width: 4, h0: 9, h1: 9, arch: 0.6, kind: 'plank' },
  { id: 'gorgeB_t2', pts: onGorgeB(46, 11.5), width: 4, h0: 18, h1: 18, arch: 0.5, kind: 'plank' },
  { id: 'sky_bridge', pts: [[32, -40], [98, -40]], width: 4.6, h0: 27, h1: 27, arch: 0, kind: 'trestle' },
];

// ------------------------------------------------------------------ landmarks / props
export const ARRIVAL = { x: 0, z: 164, rotY: Math.PI };     // portal back to Roumen (faces north)
export const SPAWN = { x: 0, z: 156, rotY: Math.PI };
export const SUMMIT = { x: HILL.x, z: HILL.z, r: 17 };        // palisade ring radius
export const PALISADE_GATE = deg(-87);                        // where ramp 4 passes the palisade ring
export const WINDMILLS = [
  { x: -58, z: -12, rot: deg(40), s: 1 }, { x: 58, z: 24, rot: deg(-30), s: 0.9 }, { x: -30, z: -94, rot: deg(160), s: 1.1 },
];
export const COTTAGES = [
  { x: -62, z: -30, rot: deg(75), s: 1 }, { x: 44, z: 30, rot: deg(-150), s: 0.9 }, { x: 32, z: -96, rot: deg(-20), s: 0.85 },
];
export const LOOKOUTS = [   // tall lattice towers with a platform (decorative)
  { x: -54, z: 18, h: 16, rot: deg(20) }, { x: 62, z: -60, h: 22, rot: deg(-10) }, { x: -64, z: -62, h: 13, rot: deg(55) },
];
export const CAMPFIRES = [{ x: 8, z: 40 }, { x: -66, z: -36 }, { x: 10, z: -84 }];
export const HEALING_HERB_SPOTS = [ // clusters: centre + radius + count
  { x: -58, z: 140, r: 7, n: 7 }, { x: -52, z: 100, r: 6, n: 6 }, { x: -60, z: 74, r: 6, n: 6 }, { x: -46, z: 124, r: 5, n: 5 },
  { x: 56, z: 150, r: 7, n: 7 }, { x: 58, z: 112, r: 6, n: 6 }, { x: 52, z: 70, r: 7, n: 6 }, { x: 44, z: 136, r: 5, n: 4 },
  { x: 140, z: -56, r: 6, n: 6 }, { x: 108, z: -22, r: 5, n: 4 },
];
export const BAMBOO_GROVES = [
  { x: -50, z: 150, r: 12, n: 70 }, { x: 50, z: 160, r: 10, n: 55 }, { x: -58, z: 88, r: 9, n: 50 },
  { x: 57, z: 94, r: 10, n: 55 }, { x: -24, z: 124, r: 7, n: 30 }, { x: 24, z: 102, r: 6, n: 26 }, { x: 55, z: 58, r: 8, n: 36 },
];

// ------------------------------------------------------------------ monsters
// Rat-men get stronger, more hypnotised (tier tint) and aggressive the higher up the hill; imps roam the forest
// and the ground ring at the foot of the hill only. The arrival, Sir Ratman, Robo and the summit stay clear.
const zoneAt = (id, type, a, r, rad, count, lv) => { const [x, z] = polar(deg(a), r); return { id, type, x, z, r: rad, count, lv }; };
export const SPAWN_ZONES = [
  // Forest of Mist (passive)
  { id: 'rat_f1', type: 'ratman', x: -32, z: 126, r: 12, count: 4, lv: [3, 4] },
  { id: 'rat_f2', type: 'ratman', x: 30, z: 108, r: 11, count: 4, lv: [3, 4] },
  { id: 'rat_f3', type: 'ratman', x: -28, z: 84, r: 12, count: 4, lv: [4, 5] },
  { id: 'rat_f4', type: 'ratman', x: 28, z: 72, r: 11, count: 4, lv: [4, 5] },
  { id: 'imp_f1', type: 'imp', x: -46, z: 102, r: 9, count: 4, lv: [4, 5] },
  { id: 'imp_f2', type: 'imp', x: 44, z: 90, r: 9, count: 4, lv: [5, 6] },
  // foot of Cyclone Hill (ground ring)
  { id: 'imp_r1', type: 'imp', x: -40, z: 22, r: 9, count: 4, lv: [6, 7] },
  { id: 'imp_r2', type: 'imp', x: 38, z: 12, r: 8, count: 3, lv: [6, 7] },
  // tier 1 (passive diggers)
  zoneAt('rat_t1a', 'ratman_digger', 120, 63, 7, 3, [6, 7]),
  zoneAt('rat_t1b', 'ratman_digger', 50, 63, 7, 3, [6, 7]),
  zoneAt('rat_t1c', 'ratman_digger', -50, 63, 7, 3, [6, 7]),
  // Hammer Boars: slow, heavy hitters wandering the upper half of tier 1 and tier 2 (never down in the forest)
  zoneAt('boar_t1a', 'hammer_boar', 170, 64, 7, 2, [7, 8]),
  zoneAt('boar_t1b', 'hammer_boar', -88, 64, 7, 2, [7, 8]),
  zoneAt('boar_t2a', 'hammer_boar', 105, 46, 6, 2, [9, 10]),
  zoneAt('boar_t2b', 'hammer_boar', -165, 46, 6, 2, [9, 10]),
  // tier 2 (hypnotised, aggressive at short range)
  zoneAt('rat_t2a', 'ratman_hypno', -100, 46, 6, 3, [8, 9]),
  zoneAt('rat_t2b', 'ratman_hypno', -25, 46, 6, 3, [8, 10]),
  zoneAt('rat_t2c', 'ratman_hypno', 150, 46, 6, 3, [9, 10]),
  zoneAt('rat_t2d', 'ratman_hypno', 60, 46, 5, 3, [8, 9]),
  // tier 3 (frenzied)
  zoneAt('rat_t3a', 'ratman_frenzy', 90, 29, 5, 3, [11, 12]),
  zoneAt('rat_t3b', 'ratman_frenzy', -150, 29, 5, 3, [11, 13]),
  zoneAt('rat_t3c', 'ratman_frenzy', -60, 29, 4, 2, [12, 13]),
  zoneAt('rat_t3d', 'ratman_frenzy', 30, 29, 4, 2, [11, 12]),
  // mid boss in front of the Tower of Isel
  { id: 'boss_cumbot', type: 'cumbot', x: BOSS_HOME.x, z: BOSS_HOME.z, r: 0.5, count: 1, lv: [15, 15], rotY: BOSS_HOME.rotY },
];

// labels for the area map window
export const MAP_LABELS = [
  [0, 132, 'FOREST OF MIST', '#b8fff0'], [0, -40, 'CYCLONE HILL', '#ffd08a'], [112, -62, 'Windward Glade', '#c8ffb0'],
  [158, -40, 'Tower of Isel', '#ffc8f0'],
  [84, 0, 'Chasm', '#9fd8ff'], [0, 172, 'to Roumen', '#9fffc8'],
];

// ------------------------------------------------------------------ area names (minimap title / banner)
export function areaNameAt(x, z) {
  if (gladeDist(x, z) < GLADE.r + 6) return 'Windward Glade';
  const r = Math.hypot(x - HILL.x, z - HILL.z);
  if (r < TIERS[0].r + 6 || z < 10) return 'Cyclone Hill';
  return 'Forest of Mist';
}

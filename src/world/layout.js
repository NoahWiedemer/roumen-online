// World layout of Roumen, derived from the reference map (tools/make_zones.py + hand-read features).
// Units are metres. +x = east, -z = north. Map pixel (px, py) of the 340 px reference maps to
// world ((px - 170) * 0.92, (py - 170) * 0.92). North: the grassy loop with monsters around two
// forested hills. Middle: the town band. South: the harbour plaza, the sea, the round island.
import { ZONES, ZONE_W, ZONE_H } from './zonemap.js';

export const MAP_SCALE = 0.92;
export const mapToWorld = (px, py) => [(px - 170) * MAP_SCALE, (py - 170) * MAP_SCALE];

export const WORLD = {
  size: 400,          // terrain spans [-200, 200]
  half: 200,
  playable: 150,      // hard clamp for entities
};

export const SEA_LEVEL = 0;
export const Z = { SEA: 1, SAND: 2, FIELD: 3, FOREST: 4, TOWN: 5 };

// zone lookup (nearest pixel); outside the map: sea to the south, mountains elsewhere
export function zoneAt(x, z) {
  const px = Math.floor(x / MAP_SCALE + 170), py = Math.floor(z / MAP_SCALE + 170);
  if (px < 0 || py < 0 || px >= ZONE_W || py >= ZONE_H) return z > 100 ? Z.SEA : Z.FOREST;
  return ZONES[py * ZONE_W + px];
}

// nominal ground heights per zone (terrain adds noise / hills / smoothing)
export const HEIGHTS = { sea: -3.5, plaza: 1.8, town: 2.2, field: 7.5 };

// ------------------------------------------------------------------ town
export const MAIN_STREET = [[-108.6, -34.0], [-99.4, -32.2], [-87.4, -28.5], [-73.6, -24.8], [-55.2, -23.0], [-36.8, -25.8], [-18.4, -27.6], [0.0, -27.6], [18.4, -25.8], [32.2, -22.1], [44.2, -16.6], [55.2, -9.2]];
export const MAIN_STREET_WIDTH = 11;
export const TERRACE_LANE = [[-95.7, -42.3], [-73.6, -44.2], [-46.0, -45.1], [-18.4, -45.1], [9.2, -45.1], [32.2, -42.3], [44.2, -35.0]];
export const SOUTH_LANE = [[-101.2, -9.2], [-82.8, -11.0], [-55.2, -9.2], [-36.8, -7.4], [-18.4, -6.4], [4.6, -4.6], [27.6, -5.5], [41.4, -9.2]];
export const WEST_WALK = [[-105.8, -29.4], [-104.9, -13.8], [-101.2, 1.8], [-95.7, 14.7]];
export const LANE_WIDTH = 5;

// Building footprints read from the map. w = length of the long side, d = depth, angle = long axis
// rotation in map space (degrees, x right / y down), face = side ('n' | 's') that faces the street/plaza.
export const HOUSES = [
  { x: -70.8, z: -34.0, w: 9.2, d: 6.4, angle: -30, face: 's' }, { x: -58.9, z: -35.0, w: 7.4, d: 5.5, angle: 35, face: 's' },
  { x: -27.6, z: -39.6, w: 7.4, d: 5.5, angle: 0, face: 's' }, { x: -6.4, z: -39.6, w: 8.3, d: 4.6, angle: 0, face: 's' },
  { x: 3.7, z: -39.6, w: 6.4, d: 5.5, angle: 0, face: 's' }, { x: 14.7, z: -38.6, w: 7.4, d: 5.5, angle: 0, face: 's' },
  { x: 31.3, z: -35.9, w: 11.0, d: 7.4, angle: 55, face: 's' },
  { x: -98.4, z: -17.5, w: 7.4, d: 5.5, angle: 40, face: 'n' }, { x: -81.0, z: -7.4, w: 12.9, d: 6.4, angle: 5, face: 'n' },
  { x: -64.4, z: 0.9, w: 12.0, d: 6.4, angle: 0, face: 'n' }, { x: -53.4, z: 0.0, w: 5.5, d: 5.5, angle: 0, face: 'n' },
  { x: -6.4, z: -11.0, w: 12.9, d: 4.6, angle: 0, face: 'n' }, { x: 34.0, z: -3.7, w: 5.5, d: 5.5, angle: -40, face: 'n' },
  { x: -64.4, z: 12.0, w: 11.0, d: 6.4, angle: 0, face: 's' }, { x: -23.0, z: 7.4, w: 12.9, d: 4.6, angle: -20, face: 's' },
  { x: -2.8, z: 0.0, w: 6.4, d: 4.6, angle: 0, face: 's' }, { x: 18.4, z: 5.5, w: 7.4, d: 4.6, angle: 35, face: 's' },
];
export const ROUND_TOWER = [-90.2, 1.8];

// ------------------------------------------------------------------ harbour
// plaza outline (map px polygon converted) — the part touching the sea gets quay walls
export const PLAZA_POLY = [[56, 168], [62, 200], [80, 214], [100, 222], [120, 232], [150, 236], [180, 229], [205, 212], [216, 200], [236, 188], [260, 181], [276, 170], [274, 158], [230, 158], [56, 158]].map(([a, b]) => mapToWorld(a, b));
export const FOUNTAIN = { x: -29.9, z: 35.9 };
export const ISLAND = { x: 75.9, z: 82.8, r: 40.5 };
export const OCTAGON = { x: 73.6, z: 84.6, r: 6 };
export const LIGHTHOUSE = { x: -96.6, z: 85.6, r: 6.5 };

// walkable decks over water: height interpolates h0 -> h1 along the polyline
export const DECKS = [
  { id: 'bridge', pts: [[32.2, 34.0], [48.8, 53.4]], width: 5, h0: 1.8, h1: 1.8, arch: 0.8, kind: 'wood' },
  { id: 'island_stairs', pts: [[109.5, -9.2], [115.9, 13.8], [117.8, 36.8], [116.8, 47.8]], width: 3.6, h0: 7.8, h1: 1.8, kind: 'wood_stairs' },
  { id: 'island_link', pts: [[116.8, 47.8], [114.1, 69.9]], width: 3.6, h0: 1.8, h1: 1.8, kind: 'wood' },
  { id: 'pier', pts: [[-66.2, 46.9], [-77.3, 60.7], [-86.5, 71.8], [-93.8, 81.0]], width: 5.5, h0: 1.8, h1: 1.8, kind: 'stone' },
];
export const DECK_DISCS = [{ id: 'lighthouse', ...LIGHTHOUSE, h: 1.8, kind: 'stone' }];

// ------------------------------------------------------------------ land connections (terrain ramps)
export const RAMPS = [
  { id: 'north_path', pts: [[-35.0, -28.5], [-36.8, -44.2], [-38.6, -55.2], [-36.8, -66.2], [-32.2, -77.3], [-24.8, -90.2], [-16.6, -101.2], [-9.2, -110.4]], width: 9, h0: 2.2, h1: 9, kind: 'dirt' },
  { id: 'west_ramp', pts: [[-104.9, -33.1], [-108.6, -42.3], [-112.2, -53.4], [-115.0, -64.4], [-117.8, -75.4]], width: 10, h0: 2.2, h1: 8, kind: 'dirt' },
  { id: 'east_stairs', pts: [[84.6, -5.5], [93.8, -11.0], [104.0, -18.4]], width: 7, h0: 1.8, h1: 7.8, kind: 'stairs' },
];
// dirt trail through the grassy loop
export const LOOP_PATH = [[-115.0, -64.4], [-119.6, -82.8], [-121.4, -99.4], [-115.0, -115.0], [-101.2, -126.0], [-82.8, -131.6], [-55.2, -134.3], [-27.6, -136.2], [0.0, -134.3], [27.6, -135.2], [55.2, -134.3], [78.2, -130.6], [92.0, -119.6], [99.4, -105.8], [104.0, -87.4], [107.6, -69.0], [106.7, -50.6], [104.9, -32.2], [104.0, -18.4]];
export const LOOP_PATH_WIDTH = 4.5;

// ------------------------------------------------------------------ portals (not functional yet)
export const PORTALS = [
  { id: 'forest_of_tides', name: 'Forest of Tides', x: -125.3, z: -127.0, rotY: 0.75 },
  { id: 'sand_beach', name: 'Sand Beach', x: 111.3, z: -73.9, rotY: -1.57 },
  { id: 'teleport_gate', name: 'Teleport Gate', x: -93.8, z: 22.4, rotY: 1.57 },
  { id: 'sea_of_greed', name: 'Sea of Greed', x: -90.2, z: 73.6, rotY: 0.9 },
  { id: 'secret_basement', name: 'Secret Basement', x: -95.7, z: 90.2, rotY: 0.2 },
];

// ------------------------------------------------------------------ NPC standing points (numbers from the map)
export const NPC_POINTS = {
  1: [13.8, 36.8], 2: [34.5, -21.2], 3: [3.2, -31.3], 4: [1.8, -17.5], 5: [-26.7, -29.0], 6: [-52.4, -11.0], 7: [-73.6, -34.0],
  8: [-86.5, 14.7], 9: [-65.3, 16.1], 10: [-54.3, 16.1], 11: [-60.7, 49.7], 12: [-26.7, 30.4], 13: [77.7, 73.6], 14: [72.2, 97.1], 15: [6.0, 7.8],
};

export const TOWN = {
  spawn: { x: -22, z: 22 },               // player (re)spawn point on the plaza next to the fountain
  fountain: FOUNTAIN,
};

// ------------------------------------------------------------------ monsters
export const SPAWN_ZONES = [
  { id: 'slime_west', type: 'slime', x: -115.9, z: -69.0, r: 14, count: 7, lv: [1, 2] },
  { id: 'slime_nw', type: 'slime', x: -113.0, z: -104.0, r: 14, count: 6, lv: [2, 3] },
  { id: 'mushroom_top', type: 'mushroom', x: -62.0, z: -131.0, r: 16, count: 7, lv: [3, 4] },
  { id: 'mushroom_top2', type: 'mushroom', x: -12.0, z: -133.0, r: 16, count: 7, lv: [4, 5] },
  { id: 'mushroom_glade', type: 'mushroom', x: -64.4, z: -70.8, r: 8, count: 3, lv: [3, 4] },
  { id: 'imp_ne', type: 'imp', x: 72.0, z: -128.0, r: 15, count: 6, lv: [5, 6] },
  { id: 'imp_east', type: 'imp', x: 104.9, z: -62.0, r: 12, count: 6, lv: [6, 7] },
  { id: 'imp_glade', type: 'imp', x: 14.7, z: -82.8, r: 8, count: 3, lv: [6, 7] },
  { id: 'king_slime', type: 'kingslime', x: 36.0, z: -133.0, r: 6, count: 1, lv: [9, 9] },
];

export function areaNameAt(x, z) {
  const zn = zoneAt(x, z);
  return zn === Z.FIELD || zn === Z.FOREST ? 'Roumen Field' : 'Roumen';
}

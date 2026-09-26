// Tower of Isel — floor plan. Units are metres, +x = east, -z = north, y = floor height.
//
// A linear climb: round / oval / long halls joined by thick stone stairways, each floor higher than the last:
//   1 Entrance Hall (y 0)  -> stair up north -> 2 Hall of Statues (y 11) -> stair west into the tower core ->
//   3 Clockwork Chamber (y 22, inside the core) -> out through the core wall onto the OUTER STAIR, which winds half
//   around the outside of the tower in the open air (y 22 -> 42) -> back in -> 4 Arcane Sanctum (y 42, inside the
//   core) -> stair east -> 5 Throne Room (y 54, the final boss waits here later).
// The floors lie side by side (not stacked), so one height field describes every walkable surface. The "core" is
// the round tower body: rooms 3 and 4 sit inside it, the outer stair runs around its west side, and only that half
// of its outer wall is ever seen (from the stair), with a model landscape of Cyclone Hill and the Forest of Mist far
// below.

export const MAP = { size: 260, half: 130, playable: 124 };

const D = Math.PI / 180;
export const deg = (a) => a * D;

// the tower core (outer wall) and the outer stair band around it
export const CORE = { x: -60, z: -20, r: 42 };
export const OUTER = { r: 46.5, hw: 2.6, rail: 49.3, a0: deg(106), a1: deg(274) };
export const at = (a, r, o = CORE) => [o.x + Math.cos(a) * r, o.z + Math.sin(a) * r];

// rooms: shape circle (r) or rect (x0..x1, z0..z1); y floor, h ceiling height above the floor
export const ROOMS = [
  { id: 'hall', name: 'Entrance Hall', shape: 'circle', x: -3, z: 68, r: 17, y: 0, h: 15, style: 'entrance' },
  { id: 'statues', name: 'Hall of Statues', shape: 'rect', x0: -16, x1: 10, z0: -14, z1: 30, y: 11, h: 15, style: 'statues' },
  { id: 'clock', name: 'Clockwork Chamber', shape: 'circle', ...pos(deg(110), 22), r: 14, y: 22, h: 16, style: 'clock' },
  { id: 'sanctum', name: 'Arcane Sanctum', shape: 'circle', ...pos(deg(270), 22), r: 14, y: 42, h: 14, style: 'sanctum' },
  { id: 'throne', name: 'Throne Room', shape: 'rect', x0: -22, x1: 36, z0: -58, z1: -26, y: 54, h: 20, style: 'throne' },
];
function pos(a, r) { const [x, z] = at(a, r); return { x, z }; }
export const room = (id) => ROOMS.find((r) => r.id === id);

// stairways and corridors: polylines of [x, z, y] (height interpolated along the path), full width w.
// `open: true` = no ceiling / side walls (the outer stair), `steps` = draw stone steps where it climbs
const clock = room('clock'), sanctum = room('sanctum');
const cDoorIn = at(deg(110), 22 + 14 - 0.5), cDoorOut = at(deg(110), OUTER.r);
const sDoorIn = at(deg(270), 22 + 14 - 0.5), sDoorOut = at(deg(270), OUTER.r);
export const PATHS = [
  // 1 -> 2: straight up north
  { id: 'stair1', w: 7, pts: [[-3, 52, 0], [-3, 49, 0], [-3, 33, 11], [-3, 29.5, 11]], steps: true },
  // 2 -> 3: west through the core wall
  { id: 'stair2', w: 6.5, pts: [[-15.5, clock.z, 11], [-24, clock.z, 11], [-46, clock.z, 22], [clock.x + 13.5, clock.z, 22]], steps: true },
  // 3 -> outer stair: out through the core wall (core: the tunnel is only built inside the core)
  { id: 'out', w: 5, core: true, pts: [[cDoorIn[0], cDoorIn[1], 22], [cDoorOut[0], cDoorOut[1], 22]] },
  // outer stair -> 4: back in
  { id: 'in', w: 5, core: true, pts: [[sDoorOut[0], sDoorOut[1], 42], [sDoorIn[0], sDoorIn[1], 42]] },
  // 4 -> 5: east up to the throne room
  { id: 'stair4', w: 7, pts: [[sanctum.x + 13.5, sanctum.z, 42], [-44, sanctum.z, 42], [-25, sanctum.z, 54], [-21.5, sanctum.z, 54]], steps: true },
];
// the outer stair: heights along the arc (angle, y) with two landings to catch the breath and the view
export const OUTER_PROFILE = [[deg(106), 22], [deg(122), 22], [deg(172), 30], [deg(186), 30], [deg(250), 42], [deg(274), 42]];

// visibility zones: the rooms inside the round tower body and the outer stair ("core") are shown everywhere; the
// halls east of it ("east") lie outside the round tower's silhouette, so they are hidden while the hero is out on
// the outer stair (from there one would otherwise look past the tower's edge into them)
export const ZONE = { hall: 'east', statues: 'east', throne: 'east', stair1: 'east', stair2: 'east', stair4: 'east', clock: 'core', sanctum: 'core', out: 'core', in: 'core' };

// the portal back to Cyclone Hill (south wall of the entrance hall, facing north into the hall)
const hall = room('hall');
export const PORTAL_BACK = { x: hall.x, z: hall.z + hall.r - 3.2, rotY: Math.PI };
export const SPAWN = { x: hall.x, z: hall.z + 6, rotY: Math.PI };
// the throne dais at the east end of the throne room: three broad steps up from the west
export const DAIS = { x0: 25, x1: 36, z0: -50, z1: -34, rise: 0.4, run: 1.1, steps: 3 };
export function daisHeight(x, z) {
  const D = DAIS;
  if (x < D.x0 || z < D.z0 || z > D.z1) return 0;
  return Math.min(D.steps, Math.floor((x - D.x0) / D.run) + 1) * D.rise;
}
// where Vagel fights (on the dais in front of the throne)
export const THRONE = { x: room('throne').x1 - 6.5, z: (room('throne').z0 + room('throne').z1) / 2, rotY: -Math.PI / 2 };
// the throne itself (decor.js builds it at `scale`): the top of its cushion, and where her hips rest on it
const SEAT_SCALE = 1.15;
export const SEAT = {
  x: DAIS.x1 - 3, z: THRONE.z, rotY: -Math.PI / 2, scale: SEAT_SCALE,
  top: room('throne').y + DAIS.steps * DAIS.rise + 1.37 * SEAT_SCALE, hipX: DAIS.x1 - 3.15,
};

// Vagel's Vault of Avarice: a round platform of dark marble and gold adrift among the stars. It lies far east of the
// halls in the same height field, but only her magic leads there (a portal leads back to the throne room)
export const VAULT = {
  x: 80, z: 30, r: 28, walk: 26.3, y: 0,
  hero: { x: 80, z: 41, rotY: Math.PI },          // where the hero lands, facing her
  boss: { x: 80, z: 22, rotY: 0 },
  portal: { x: 80, z: 54.2, rotY: Math.PI },      // the way back, on the south rim facing in
  back: { x: 18, z: -42, rotY: Math.PI / 2 },     // ... into the throne room, facing the throne
};
ZONE.vault = 'vault';
// monsters of the tower: for now only its goddess, waiting on her throne (entities/bosses/vagel.js)
export const SPAWN_ZONES = [{ id: 'boss_vagel', type: 'vagel', x: SEAT.x, z: SEAT.z, r: 0.5, count: 1, lv: [18, 18], rotY: SEAT.rotY }];

export const MAP_LABELS = [
  [hall.x, hall.z, 'Entrance Hall', '#ffe0a0'], [-3, 8, 'Hall of Statues', '#ffe0a0'], [clock.x, clock.z, 'Clockwork', '#ffe0a0'],
  [-104, -20, 'Outer Stair', '#bfe8ff'], [sanctum.x, sanctum.z, 'Sanctum', '#ffe0a0'], [7, -42, 'Throne Room', '#ffb0c8'],
  [VAULT.x, VAULT.z, 'Vault of Avarice', '#e8c0ff'],
];

export function inRoom(r, x, z, pad = 0) {
  if (r.shape === 'circle') return Math.hypot(x - r.x, z - r.z) < r.r - pad;
  return x > r.x0 + pad && x < r.x1 - pad && z > r.z0 + pad && z < r.z1 - pad;
}

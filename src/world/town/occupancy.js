// Simple 2D occupancy bookkeeping so props never land on NPC points, portals, the spawn point,
// houses, walkable paths (optional) or each other.
import { distToObb, keepClearList, makePathTester } from './plan.js';

export class Occupancy {
  constructor(T, houses) {
    this.T = T;
    this.keep = keepClearList();
    this.houses = houses;
    this.props = [];
    this.pathGap = makePathTester(T);
  }
  // o: { paths: keep off streets/lanes/ramps, pathPad, ignoreProps, houseMargin, decks }
  free(x, z, r, o = {}) {
    for (const c of this.keep) if (Math.hypot(c.x - x, c.z - z) < c.r + r) return false;
    const hm = o.houseMargin ?? 0.3;
    for (const h of this.houses) if (distToObb(h.obb, x, z) < r + hm) return false;
    if (!o.ignoreProps) for (const c of this.props) if (Math.hypot(c.x - x, c.z - z) < c.r + r) return false;
    if (o.paths && this.pathGap(x, z).gap < r + (o.pathPad ?? 0.2)) return false;
    if (o.decks !== false && this.T.deckAt(x, z) !== null && !o.onDeck) return false;
    return true;
  }
  reserve(x, z, r) { this.props.push({ x, z, r }); }
}

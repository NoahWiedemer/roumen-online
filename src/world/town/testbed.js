// Dev-only: a row of sample houses on flat ground to iterate on the look quickly.
import * as THREE from 'three';
import { GeoBuilder } from './builder.js';
import { townMaterials } from './materials.js';
import { buildHouse } from './house.js';
import { makeHouseSpec } from './styles.js';
import { StaticBatcher } from '../../core/batcher.js';

export function testHouses(ctx) {
  const M = townMaterials();
  const b = new GeoBuilder();
  const halos = [];
  const kinds = ['plain', 'shop', 'inn', 'plain', 'storage', 'plain'];
  let x = -30;
  kinds.forEach((kind, i) => {
    const S = makeHouseSpec(1000 + i * 17, kind, { w: kind === 'inn' ? 11 : 8 + (i % 3), d: 8 });
    S.x = x + S.w / 2; S.z = 0; S.rotY = 0; S.floorY = 0.3; S.groundMin = 0; S.stepH = 0.3;
    buildHouse(b, M, S, halos);
    x += S.w + 3;
  });
  const batcher = new StaticBatcher();
  const stats = b.flush(batcher);
  batcher.build(ctx.scene);
  const tris = stats.reduce((a, s) => a + s.tris, 0);
  return `test houses: ${stats.length} materials, ${(tris / 1000).toFixed(1)}k tris`;
}

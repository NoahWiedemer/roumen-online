// Cyclone Hill preview: /viewer.html?scene=cyclone&cam=0,260,160&target=0,0,-10&bloom=0
//   &only=terrain  -> terrain only (fast iteration on the height field)
//   &fog=0         -> no fog / atmosphere blending
//   &at=x,z        -> evaluate the atmosphere as if the player stood at x,z
export default async function (ctx) {
  const { scene, engine, q } = ctx;
  const sky = scene.getObjectByName('sky');
  if (sky) sky.visible = false;
  const t0 = performance.now();
  if (q.get('only') === 'terrain') {
    const { CycloneTerrain } = await import('../../world/cyclone/terrain.js');
    const terrain = new CycloneTerrain();
    scene.add(terrain.mesh);
    scene.children.filter((o) => o.isMesh && o !== terrain.mesh && o.geometry?.type === 'CircleGeometry').forEach((o) => { o.visible = false; });
    scene.fog = null;
    ctx.info(`cyclone terrain: ${Math.round(performance.now() - t0)} ms, ${terrain.res}² verts`);
    return;
  }
  const { buildCycloneWorld } = await import('../../world/cyclone/index.js');
  const world = await buildCycloneWorld({ engine, preview: true });
  scene.add(world.root);
  scene.children.filter((o) => o.isMesh && o.geometry?.type === 'CircleGeometry').forEach((o) => { o.visible = false; });
  const at = q.get('at') ? q.get('at').split(',').map(Number) : null;
  const focus = new ctx.THREE.Vector3();
  if (at) focus.set(at[0], world.terrain.heightAt(at[0], at[1]), at[1]); else focus.copy(ctx.controls.target);
  world.activate(engine, focus);
  if (q.get('fog') === '0') scene.fog = null;
  ctx.onUpdate((dt, t) => {
    if (at) focus.set(at[0], world.terrain.heightAt(at[0], at[1]), at[1]);
    else focus.copy(ctx.controls.target);
    world.update(dt, t, ctx.camera, focus);
    if (q.get('fog') === '0') scene.fog = null;
  });
  ctx.info(`cyclone world: ${Math.round(performance.now() - t0)} ms  ${world.stats || ''}`);
}

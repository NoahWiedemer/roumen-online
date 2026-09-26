// Tower of Isel preview: /viewer.html?scene=isel&cam=-3,40,110&target=-3,0,68&bloom=0
//   &at=x,z  -> light the tower as if the hero stood at x,z (inside / on the outer stair)
export default async function (ctx) {
  const { scene, engine, q } = ctx;
  const sky = scene.getObjectByName('sky');
  if (sky) sky.visible = false;
  scene.children.filter((o) => o.isMesh && o.geometry?.type === 'CircleGeometry').forEach((o) => { o.visible = false; });
  const t0 = performance.now();
  const { preloadPlayerModel } = await import('../../entities/playerModel.js');
  await preloadPlayerModel();
  const { buildIselWorld } = await import('../../world/isel/index.js');
  const world = await buildIselWorld({ engine });
  scene.add(world.root);
  const at = q.get('at') ? q.get('at').split(',').map(Number) : null;
  const focus = new ctx.THREE.Vector3();
  const place = () => { if (at) focus.set(at[0], world.terrain.heightAt(at[0], at[1]), at[1]); else focus.copy(ctx.controls.target); };
  place();
  world.activate(engine, focus);
  window.__isel = world;
  ctx.onUpdate((dt, t) => { place(); world.update(dt, t, ctx.camera, focus); });
  ctx.info(`isel: ${Math.round(performance.now() - t0)} ms  ${world.stats}`);
}

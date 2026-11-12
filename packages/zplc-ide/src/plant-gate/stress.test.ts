import { expect, it } from 'bun:test';
import { loadJolt } from './jolt';
import { driveStress, stress } from './scenes';
import { createWorld } from './world';

it('the stress scene keeps 200 boxes on 20 belts for 30 simulated seconds', async () => {
  const world = createWorld(await loadJolt(), stress());
  for (let scan = 0; scan < 3000; scan += 1) {
    driveStress(world, scan);
    world.step(10);
  }
  const bodies = world.bodies();
  expect(bodies.length).toBe(200);
  for (const b of bodies) expect(b.p[1]).toBeGreaterThan(0.4);
  world.dispose();
});

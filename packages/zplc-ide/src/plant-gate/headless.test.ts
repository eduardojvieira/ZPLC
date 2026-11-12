import { describe, expect, it } from 'bun:test';

import { loadJolt, type JoltModule } from './jolt';
import { dropBox } from './scenes';
import { createWorld } from './world';

// Free bytes of the WebAssembly heap, as the JoltPhysics.js examples display it.
function freeHeapBytes(Jolt: JoltModule): number {
  const settings = new Jolt.JoltSettings();
  const pairs = new Jolt.ObjectLayerPairFilterTable(1);
  const layer = new Jolt.BroadPhaseLayer(0);
  const bp = new Jolt.BroadPhaseLayerInterfaceTable(1, 1);
  bp.MapObjectToBroadPhaseLayer(0, layer);
  settings.mObjectLayerPairFilter = pairs;
  settings.mBroadPhaseLayerInterface = bp;
  settings.mObjectVsBroadPhaseLayerFilter = new Jolt.ObjectVsBroadPhaseLayerFilterTable(bp, 1, pairs, 1);
  const probe = new Jolt.JoltInterface(settings);
  Jolt.destroy(settings);
  const free = probe.sGetFreeMemory();
  Jolt.destroy(probe); // owns the filters
  Jolt.destroy(layer);
  return free;
}

describe('headless world (gate check 5)', () => {
  it('simulates a falling box in the test runner', async () => {
    const world = createWorld(await loadJolt(), dropBox());
    world.step(2000);
    const [box] = world.bodies();
    expect(world.timeMs).toBe(2000);
    expect(Math.abs(box!.p[1] - 0.15)).toBeLessThan(0.002);
    world.dispose();
  });

  it('rejects a step that is not a multiple of the plant step', async () => {
    const world = createWorld(await loadJolt(), dropBox());
    expect(() => world.step(7)).toThrow(RangeError);
    world.dispose();
  });

  it('does not grow WebAssembly memory across 50 create and dispose cycles', async () => {
    const Jolt = await loadJolt();
    const free: number[] = [];
    for (let cycle = 0; cycle < 50; cycle += 1) {
      const world = createWorld(Jolt, dropBox());
      world.step(100);
      world.dispose();
      free.push(freeHeapBytes(Jolt));
    }
    expect(Math.abs(free[49]! - free[4]!)).toBeLessThan(free[4]! * 0.01);
  });
});

import { describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { createWorld, type PhysicsWorld, type WorldBodySpec } from './world';
import { loadJolt, type JoltModule } from './jolt';

const floor: WorldBodySpec = {
  id: 'floor',
  kind: 'box',
  half: [5, 0.5, 5],
  position: [0, -0.5, 0],
  rotationYDeg: 0,
  massKg: 0,
  friction: 0.6,
  motion: 'static',
  layer: 'static',
};
const belt = (id: string, z = 0): WorldBodySpec => ({
  id,
  kind: 'box',
  half: [2, 0.05, 0.3],
  position: [0, 0.45, z],
  rotationYDeg: 0,
  massKg: 0,
  friction: 0.6,
  motion: 'static',
  layer: 'static',
});
const box = (id: string, at: [number, number, number]): WorldBodySpec => ({
  id,
  kind: 'item',
  half: [0.15, 0.15, 0.15],
  position: at,
  rotationYDeg: 0,
  massKg: 5,
  friction: 0.6,
  motion: 'dynamic',
  layer: 'moving',
});
const addBelt = (w: PhysicsWorld, id: string, z = 0, turnPerMps?: number) => {
  w.addBody(belt(id, z));
  w.addBelt({ id, bodyId: id, axis: [1, 0, 0], accelMps2: 1, ...(turnPerMps === undefined ? {} : { turnPerMps }) });
};
const state = (w: PhysicsWorld, id: string) => w.bodies().find((b) => b.id === id)!;

function hashPoses(w: PhysicsWorld): string {
  const bodies = w.bodies();
  const out = new Float32Array(bodies.length * 7);
  bodies.forEach((b, i) => out.set([...b.p, ...b.q], i * 7));
  return createHash('sha256').update(new Uint8Array(out.buffer)).digest('hex');
}

async function make(): Promise<{ Jolt: JoltModule; world: PhysicsWorld }> {
  const Jolt = await loadJolt();
  return { Jolt, world: createWorld(Jolt) };
}

describe('physics world', () => {
  it('PLT-001 a falling box lands in the test runner', async () => {
    const { world } = await make();
    world.addBody(floor);
    world.addBody(box('b', [0, 1, 0]));
    world.step(2000);
    expect(Math.abs(state(world, 'b').p[1] - 0.15)).toBeLessThan(0.002);
    world.dispose();
  });

  it('PLT-004 a step that is not a multiple of the plant step is rejected', async () => {
    const { world } = await make();
    expect(() => world.step(7)).toThrow(RangeError);
    expect(() => world.step(0)).toThrow(RangeError);
    expect(() => world.step(-5)).toThrow(RangeError);
    expect(world.timeMs).toBe(0);
    world.step(10);
    expect(world.timeMs).toBe(10);
    world.dispose();
  });

  it('PLT-007 a box on a belt reaches belt speed and stops with it', async () => {
    const { world } = await make();
    world.addBody(floor);
    addBelt(world, 'belt');
    world.addBody(box('b', [-1, 0.6, 0]));
    world.step(500);
    world.setBeltTarget('belt', 0.5);
    world.step(1500);
    let b = state(world, 'b');
    expect(Math.abs(b.v[0] - 0.5)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(b.p[2])).toBeLessThanOrEqual(0.005);
    world.setBeltTarget('belt', 0);
    world.step(1500);
    b = state(world, 'b');
    expect(Math.hypot(...b.v)).toBeLessThanOrEqual(0.005);
    world.dispose();
  });

  it('a box asleep on a stopped belt moves when its belt starts', async () => {
    const { world } = await make();
    world.addBody(floor);
    addBelt(world, 'belt');
    world.addBody(box('b', [-1, 0.6, 0]));
    world.step(60000);
    expect(state(world, 'b').asleep).toBe(true);
    world.setBeltTarget('belt', 0.5);
    world.step(1500);
    expect(Math.abs(state(world, 'b').v[0] - 0.5)).toBeLessThanOrEqual(0.01);
    world.dispose();
  });

  it('a belt with turnPerMps spins the box on it about the up axis', async () => {
    const { world } = await make();
    world.addBody(floor);
    addBelt(world, 'belt', 0, -0.5);
    world.addBody(box('b', [0, 0.6, 0]));
    world.setBeltTarget('belt', 0.5);
    world.step(1500);
    // omega = turnPerMps * speed = -0.25 rad/s about +y, tolerant of friction slip.
    const q = state(world, 'b').q;
    expect(2 * Math.atan2(q[1], q[3])).toBeLessThan(-0.1);
    world.dispose();
  });

  it('only bodies on the started belt are woken', async () => {
    const { world } = await make();
    world.addBody(floor);
    addBelt(world, 'a', -1);
    addBelt(world, 'b', 1);
    world.addBody(box('on-a', [0, 0.6, -1]));
    world.addBody(box('on-b', [0, 0.6, 1]));
    world.step(60000);
    expect(state(world, 'on-a').asleep && state(world, 'on-b').asleep).toBe(true);
    world.setBeltTarget('a', 0.5);
    world.step(5);
    expect(state(world, 'on-a').asleep).toBe(false);
    expect(state(world, 'on-b').asleep).toBe(true);
    world.dispose();
  });

  it('PLT-012 capture then restore reproduces the same future', async () => {
    const { world } = await make();
    world.addBody(floor);
    addBelt(world, 'belt');
    world.addBody(box('b', [-1, 0.6, 0]));
    world.addBody(box('c', [-0.5, 0.6, 0.1]));
    world.setBeltTarget('belt', 0.5);
    world.step(1000);
    const bytes = world.capture();
    const at = world.timeMs;
    world.step(1000);
    const first = hashPoses(world);
    world.restore(bytes);
    expect(world.timeMs).toBe(at);
    world.step(1000);
    expect(hashPoses(world)).toBe(first);
    world.dispose();
  });

  it('PLT-001 rayHit names the nearest moving body crossing the segment', async () => {
    const { world } = await make();
    world.addBody(floor);
    world.addBody(box('b', [0, 0.15, 0]));
    world.step(100);
    expect(world.rayHit([-1, 0.15, 0], [1, 0.15, 0])).toBe('b');
    expect(world.rayHit([-1, 0.6, 0], [1, 0.6, 0])).toBeNull();
    world.dispose();
  });

  it('PLT-001 a kinematic body moved to a pose is reported there', async () => {
    const { world } = await make();
    world.addBody({ ...box('k', [0, 1, 0]), motion: 'kinematic' });
    world.setKinematicPose('k', [0, 2, 0], [0, 0, 0, 1]);
    world.step(5);
    expect(Math.abs(state(world, 'k').p[1] - 2)).toBeLessThan(1e-4);
    world.removeBody('k');
    expect(world.bodies()).toHaveLength(0);
    world.dispose();
  });

  it('no WebAssembly growth across 50 create and dispose cycles', async () => {
    const Jolt = await loadJolt();
    const probe = freeHeapProbe(Jolt);
    const cycle = () => {
      const w = createWorld(Jolt);
      w.addBody(floor);
      addBelt(w, 'belt');
      w.addBody(box('b', [0, 0.6, 0]));
      w.setBeltTarget('belt', 0.5);
      w.step(100);
      w.dispose();
    };
    for (let i = 0; i < 5; i += 1) cycle();
    const at5 = probe.free();
    for (let i = 5; i < 50; i += 1) cycle();
    const at50 = probe.free();
    expect(Math.abs(at50 - at5) / at5).toBeLessThanOrEqual(0.01);
    expect(Jolt.HEAPU8.byteLength).toBeLessThan(512 * 1024 * 1024);
  });
});

// A bare JoltInterface kept alive beside the worlds, only to read the module's free-heap counter.
function freeHeapProbe(Jolt: JoltModule) {
  const settings = new Jolt.JoltSettings();
  const filter = new Jolt.ObjectLayerPairFilterTable(1);
  filter.EnableCollision(0, 0);
  const bp = new Jolt.BroadPhaseLayer(0);
  const bpi = new Jolt.BroadPhaseLayerInterfaceTable(1, 1);
  bpi.MapObjectToBroadPhaseLayer(0, bp);
  settings.mObjectLayerPairFilter = filter;
  settings.mBroadPhaseLayerInterface = bpi;
  settings.mObjectVsBroadPhaseLayerFilter = new Jolt.ObjectVsBroadPhaseLayerFilterTable(bpi, 1, filter, 1);
  const jolt = new Jolt.JoltInterface(settings);
  Jolt.destroy(settings);
  return { free: () => jolt.sGetFreeMemory() };
}

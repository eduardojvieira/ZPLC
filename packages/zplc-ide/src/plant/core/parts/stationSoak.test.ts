import { afterEach, describe, expect, it } from 'bun:test';
import type { PlantCore, PlantSceneFile, ScenePart } from '../../contracts';
import { loadJolt } from '../jolt';
import { createPlantCore } from '../plantCore';
import { SCENE_SCHEMA_VERSION } from '../sceneSchema';
import { createWorld, type PhysicsWorld } from '../world';
import { CRATE_OUTER, boxSize, itemParts, spawnItem, type PartRuntime } from './items';
import { liftParts } from './lift';
import { stackerParts } from './stackerCrane';

// The tolerances are those of soak.test.ts and sortSoak.test.ts: 1 mm of position, 0.1 degree of turn, 1 mm/s of speed.
const DRIFT_M = 0.001;
const TURN_DEG = 0.1;
const SPEED_MPS = 0.001;
const TEN_MINUTES_S = 600;

const worlds: PhysicsWorld[] = [];
const cores: PlantCore[] = [];
afterEach(() => {
  for (const w of worlds.splice(0)) w.dispose();
  for (const c of cores.splice(0)) c.dispose();
});

const part = (id: string, partId: string, position: [number, number, number], config: ScenePart['config'] = {}): ScenePart => ({
  id,
  part: partId,
  name: id,
  position,
  rotationYDeg: 0,
  config,
});
const tiltDeg = (q: readonly number[]) => (Math.acos(Math.min(1, 1 - 2 * (q[0]! ** 2 + q[2]! ** 2))) * 180) / Math.PI;
const yawDeg = (q: readonly number[]) => (2 * Math.atan2(q[1]!, q[3]!) * 180) / Math.PI;

type Pose = { id: string; p: readonly number[]; q: readonly number[]; v?: readonly number[] };

/** Ten simulated minutes in one-second slices: the largest deviation from the start and the final drift of every item. */
function soak(label: string, ids: string[], read: () => readonly Pose[], run: (ms: number) => void) {
  const pick = () => new Map(read().map((b) => [b.id, b]));
  const first = pick();
  for (const id of ids) expect(first.has(id)).toBe(true);
  let jitter = 0;
  let turn = 0;
  let speed = 0;
  let last = first;
  for (let second = 1; second <= TEN_MINUTES_S; second += 1) {
    run(1000);
    last = pick();
    for (const id of ids) {
      const b = last.get(id)!;
      const ref = first.get(id)!;
      jitter = Math.max(jitter, Math.hypot(b.p[0]! - ref.p[0]!, b.p[1]! - ref.p[1]!, b.p[2]! - ref.p[2]!));
      turn = Math.max(turn, Math.abs(tiltDeg(b.q) - tiltDeg(ref.q)), Math.abs(yawDeg(b.q) - yawDeg(ref.q)));
      if (b.v) speed = Math.max(speed, Math.hypot(...b.v));
    }
  }
  const drift = Math.max(...ids.map((id) => Math.hypot(...last.get(id)!.p.map((c, k) => c - first.get(id)!.p[k]!))));
  console.log(`PLT-008 station soak ${label}: max deviation ${jitter} m, final drift ${drift} m, turn ${turn} deg, speed ${speed} m/s`);
  expect(drift).toBeLessThanOrEqual(DRIFT_M);
  expect(jitter).toBeLessThanOrEqual(DRIFT_M);
  expect(turn).toBeLessThanOrEqual(TURN_DEG);
  expect(speed).toBeLessThanOrEqual(SPEED_MPS);
}

const floor = (world: PhysicsWorld) =>
  world.addBody({
    id: 'floor',
    kind: 'box',
    half: [20, 0.5, 20],
    position: [0, -0.5, 0],
    rotationYDeg: 0,
    massKg: 0,
    friction: 0.6,
    motion: 'static',
    layer: 'static',
  });

describe('station parts rest soak', () => {
  it('PLT-008 a box on a stopped lift at each of its levels stays at rest for ten simulated minutes', async () => {
    const jolt = await loadJolt();
    for (const level of [1, 2, 3]) {
      const world = createWorld(jolt);
      worlds.push(world);
      floor(world);
      const scene = [
        part('lf', 'lift', [0, 0.45, 0], { levels: 3, levelPitchM: 0.3, travelSpeedMps: 0.1 }),
        part('b1', 'box', [0, 0.45, 0], { height: 0.2, mass: 2 }),
      ];
      const defs = [...itemParts, ...liftParts];
      const runtimes: PartRuntime[] = scene.map((p) => {
        const rt = defs.find((d) => d.id === p.part)!.runtime(p, () => 0.5);
        rt.build(world, p);
        return rt;
      });
      const lf = runtimes[0]!;
      let commands: Record<string, boolean | number> = {};
      const run = (ms: number) => {
        for (let i = 0; i < ms / 5; i += 1) {
          for (const rt of runtimes) rt.beforeStep(commands);
          world.step(5);
          for (const rt of runtimes) rt.afterStep();
        }
      };
      run(1000);
      commands = { 'lf.up': true };
      // slow jog, released 5 mm short: the platform decelerates onto the level (as lift.test.ts does)
      for (let t = 0; t < 30000 && (lf.facts()['axis:lf:y'] as number) < (level - 1) * 0.3 - 0.005; t += 5) run(5);
      commands = {};
      run(2000);
      expect(lf.sense()[`lf.atLevel${level}`]).toBe(true);
      expect(world.bodies().find((b) => b.id === 'b1')!.p[1]).toBeGreaterThan(0.45 + (level - 1) * 0.3); // carried up, riding the platform
      soak(`lift level ${level}`, ['b1'], () => world.bodies(), run);
    }
  }, 600000);

  /** A stacker crane with a box on its raised fork; `park` moves the fork, then every command is released. */
  async function crane(label: string, park: (r: ReturnType<typeof rig>) => void, expectLoaded: boolean, atZ?: number) {
    const world = createWorld(await loadJolt());
    worlds.push(world);
    floor(world);
    const p = part('Crane1', 'stacker-crane', [0, 0, 0], {});
    const rt: PartRuntime = stackerParts[0]!.runtime(p, () => 0);
    rt.build(world, p);
    const cmd: Record<string, boolean | number> = {};
    const r = rig(world, rt, cmd);
    r.set({ raise: true });
    r.run(1500);
    spawnItem(world, 'b', 'item', boxSize(0.2), 2, [0, 0.13, 0], 90);
    r.run(500);
    expect(r.sense('loaded')).toBe(true);
    park(r);
    r.set({});
    r.run(2000);
    if (expectLoaded) expect(r.sense('loaded')).toBe(true);
    if (atZ !== undefined) expect(world.bodies().find((b) => b.id === 'b')!.p[2]).toBeGreaterThan(atZ); // out over the rack cell
    soak(label, ['b'], () => world.bodies(), r.run);
  }
  const rig = (world: PhysicsWorld, rt: PartRuntime, cmd: Record<string, boolean | number>) => {
    const r = {
      set(c: Record<string, boolean | number>) {
        for (const k of Object.keys(cmd)) delete cmd[k];
        for (const [k, v] of Object.entries(c)) cmd[`Crane1.${k}`] = v;
      },
      patch(c: Record<string, boolean | number>) {
        for (const [k, v] of Object.entries(c)) cmd[`Crane1.${k}`] = v;
      },
      run(ms: number) {
        for (let i = 0; i < ms / 5; i += 1) {
          rt.beforeStep(cmd);
          world.step(5);
          rt.afterStep();
        }
      },
      sense: (k: string) => rt.sense()[`Crane1.${k}`],
      until(sensor: string, maxMs = 20000) {
        for (let t = 0; t < maxMs; t += 5) {
          if (r.sense(sensor) === true) return;
          r.run(5);
        }
        throw new Error(`${sensor} never became TRUE`);
      },
    };
    return r;
  };

  it('PLT-008 a box on a stopped stacker crane fork, centred and raised, stays at rest for ten simulated minutes', async () => {
    await crane('fork centre', () => {}, true);
  }, 300000);

  it('PLT-008 a box on a stopped stacker crane fork, extended over a rack cell, stays at rest for ten simulated minutes', async () => {
    await crane(
      'fork extended',
      (r) => {
        r.patch({ bay: 1, level: 1, raise: true });
        r.run(300);
        r.until('inPosition');
        r.until('raised');
        r.patch({ forkRight: true });
        r.until('forkAtRight');
        r.run(500);
      },
      false,
      0.6,
    );
  }, 300000);

  it('PLT-008 a box stored on rack rails stays at rest for ten simulated minutes', async () => {
    await crane(
      'rack rails',
      (r) => {
        r.patch({ bay: 1, level: 1, raise: true });
        r.run(300);
        r.until('inPosition');
        r.until('raised');
        r.patch({ forkRight: true });
        r.until('forkAtRight');
        r.patch({ raise: false });
        r.run(1500);
        r.patch({ forkRight: false });
        r.until('forkCentre');
        r.run(500);
      },
      false,
      0.6,
    );
  }, 300000);

  const make = async (parts: ScenePart[]) => {
    const scene: PlantSceneFile = { schemaVersion: SCENE_SCHEMA_VERSION, name: 'stationSoak', parts, cameras: [] };
    const core = await createPlantCore(scene);
    cores.push(core);
    return core;
  };
  const crateRun = (core: PlantCore) => (ms: number) => {
    for (let t = 0; t < ms; t += 10) core.advance(10);
  };

  it('PLT-008 a crate holding five items stays at rest for ten simulated minutes', async () => {
    const drops: [number, number][] = [
      [-0.25, -0.13],
      [0, -0.13],
      [0.25, -0.13],
      [-0.12, 0.13],
      [0.12, 0.13],
    ];
    const core = await make([
      part('c1', 'crate', [0, 0, 0]),
      ...drops.map(([x, z], k) => ({ ...part(`w${k}`, 'workpiece', [x, 0.4, z], { mass: 0.5 }), name: `W${k}` })),
    ]);
    const run = crateRun(core);
    run(6000);
    expect(core.snapshot().items.length).toBe(6);
    expect(core.snapshot().facts['loaded:crate:0']).toBe(5);
    soak(
      'crate with five items',
      core.snapshot().items.map((i) => i.id),
      () => core.snapshot().items,
      run,
    );
    expect(core.snapshot().facts['loaded:crate:0']).toBe(5);
  }, 600000);

  it('PLT-008 a stack of two crates stays at rest for ten simulated minutes', async () => {
    const core = await make([part('low', 'crate', [0, 0, 0]), part('high', 'crate', [0, CRATE_OUTER[1] + 0.01, 0])]);
    const run = crateRun(core);
    run(5000);
    soak('two crates', ['low', 'high'], () => core.snapshot().items, run);
  }, 600000);
});

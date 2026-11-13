import { afterEach, describe, expect, it } from 'bun:test';
import { resolve } from 'node:path';
import { itNative } from '../../cli/nativeRuntimeGuard';
import { SCENE_INDEX } from '../../generated/sceneIndex';
import type { PlantCore, PlantSceneFile, ScenePart } from '../contracts';
import sceneHashes from '../ci/sceneHashes.json';
import { runSceneCheck } from '../ci/sceneCheck';
import { catalogue } from './catalogue';
import hashes from './hashes.json';
import { createPlantCore } from './plantCore';

const cores: PlantCore[] = [];
afterEach(() => {
  for (const c of cores.splice(0)) c.dispose();
});
const part = (id: string, name: string, position: [number, number, number], config: ScenePart['config'] = {}): ScenePart => ({
  id: name.toLowerCase(),
  part: id,
  name,
  position,
  rotationYDeg: 0,
  config,
});
const sceneOf = (parts: ScenePart[], name = 'grip'): PlantSceneFile => ({ schemaVersion: 1, name, parts, cameras: [] });
const make = async (scene: PlantSceneFile) => {
  const core = await createPlantCore(scene);
  cores.push(core);
  return core;
};
const run = (core: PlantCore, ms: number) => {
  for (let t = 0; t < ms; t += 10) core.advance(10);
};

// SCRIPTS-BEGIN (the throwaway pin script copies this block verbatim)
const axis = (core: PlantCore, name: string, letter: 'x' | 'y' | 'z') => core.facts()[`axis:${name}:${letter}`] as number;
const near = (core: PlantCore, name: string, letter: 'x' | 'y' | 'z', v: number) => Math.abs(axis(core, name, letter) - v) < 0.001;

/** Numeric driver: set the targets and the grip, advance 10 ms scans until every axis is at its target, then settle 100 ms. */
function goto(core: PlantCore, name: string, x: number, y: number, grip: boolean, z?: number, onScan?: () => void): void {
  core.apply({ [`${name}.xSet`]: x, [`${name}.ySet`]: y, [`${name}.grip`]: grip, ...(z === undefined ? {} : { [`${name}.zSet`]: z }) });
  for (let scan = 0; scan < 2500; scan += 1) {
    if (near(core, name, 'x', x) && near(core, name, 'y', y) && (z === undefined || near(core, name, 'z', z))) break;
    core.advance(10);
    onScan?.();
  }
  run(core, 100);
}

/** Digital driver: hold the commands in `hold` until `done`, release, and let the axis stop with the grip as given. */
function jog(core: PlantCore, name: string, hold: string[], grip: boolean, done: () => boolean): void {
  const all = ['xPlus', 'xMinus', 'yPlus', 'yMinus'];
  const commands = (held: string[]) => ({
    ...Object.fromEntries(all.map((c) => [`${name}.${c}`, held.includes(c)])),
    [`${name}.grip`]: grip,
  });
  core.apply(commands(hold));
  for (let scan = 0; scan < 2500 && !done(); scan += 1) core.advance(10);
  core.apply(commands([]));
  run(core, 400);
}

const GRIP_SCENE = () =>
  sceneOf(
    [
      part('box', 'Box1', [0.3, 0, 0], { height: '0.3', mass: '2' }),
      part('pallet', 'Pallet1', [1.2, 0, 0]),
      part('pick-place', 'Pick1', [0, 0, 0], { variant: 'digital', gripper: 'vacuum', speedMps: 0.15, strokeYM: 0.6 }),
    ],
    'gripCycle',
  );
const gripCycle = (core: PlantCore, until: 'carry' | 'end' = 'end'): void => {
  const ax = (l: 'x' | 'y') => axis(core, 'Pick1', l);
  run(core, 500);
  jog(core, 'Pick1', ['yPlus'], false, () => ax('y') >= 0.45);
  jog(core, 'Pick1', ['xPlus'], false, () => ax('x') >= 0.29);
  jog(core, 'Pick1', ['yMinus'], false, () => ax('y') <= 0.302);
  jog(core, 'Pick1', [], true, () => true); // the pad is on the box: grip
  jog(core, 'Pick1', ['yPlus'], true, () => ax('y') >= 0.5);
  if (until === 'carry') return;
  jog(core, 'Pick1', ['xPlus'], true, () => ax('x') >= 0.99);
  jog(core, 'Pick1', ['yMinus'], true, () => ax('y') <= 0.46);
  jog(core, 'Pick1', [], false, () => true);
  run(core, 1000);
};

const GANTRY_SCENE = () =>
  sceneOf(
    [
      part('box', 'BoxA', [0.3, 0, 0.4], { height: '0.3', mass: '2' }),
      part('box', 'BoxB', [0.3, 0, 0.8], { height: '0.3', mass: '2' }),
      part('pallet', 'Pallet1', [1.2, 0, 0.6]),
      part('gantry', 'Gan1', [0, 0, 0], { variant: 'numeric', strokeYM: 1, strokeZM: 1.2 }),
    ],
    'gantryNumeric',
  );
const gantryScript = (core: PlantCore): void => {
  run(core, 500);
  const carry = (z0: number, z1: number) => {
    goto(core, 'Gan1', 0.3, 0.7, false, z0);
    goto(core, 'Gan1', 0.3, 0.3, false, z0);
    goto(core, 'Gan1', 0.3, 0.3, true, z0);
    goto(core, 'Gan1', 0.3, 0.7, true, z0);
    goto(core, 'Gan1', 1, 0.7, true, z1);
    goto(core, 'Gan1', 1, 0.46, true, z1);
    goto(core, 'Gan1', 1, 0.46, false, z1);
    goto(core, 'Gan1', 1, 0.7, false, z1);
  };
  goto(core, 'Gan1', 0, 0.7, false, 0); // lift first: the pad starts at floor level, beside the boxes
  carry(0.4, 0.4);
  carry(0.8, 0.8);
  run(core, 1000);
};
// SCRIPTS-END

describe('PlantCore manipulators, support facts and the M3 pins', () => {
  it('PRT-001 the catalogue contains pick-place, gantry, layer-palletizer, lid and base after the core is created', async () => {
    await make(GRIP_SCENE());
    for (const id of ['pick-place', 'gantry', 'layer-palletizer', 'lid', 'base']) expect(catalogue.get(id)).toBeDefined();
    expect(catalogue.get('pick-place')!.family).toBe('manipulators');
    expect(catalogue.get('layer-palletizer')!.family).toBe('stations');
  });

  it('PLT-010 picked, placed, drops and axis facts are published and rounded', async () => {
    const core = await make(GRIP_SCENE());
    gripCycle(core);
    const facts = core.facts();
    expect(facts).toMatchObject({ 'picked:Pick1': 1, 'placed:Pick1': 1, 'drops:Pick1': 0 });
    expect(facts['axis:Pick1:x']).toBeGreaterThan(0.9);
    for (const k of ['x', 'y']) expect(Math.round((facts[`axis:Pick1:${k}`] as number) * 1000) / 1000).toBe(facts[`axis:Pick1:${k}`]);
    expect(facts).not.toHaveProperty(['axis:Pick1:z']);
    expect(facts['stacked:pallet:0']).toBe(1);
    expect(core.snapshot().items.find((i) => i.id.includes('box'))?.tag).toBe('box');
    const gantry = await make(GANTRY_SCENE());
    gantryScript(gantry);
    expect(gantry.facts()).toMatchObject({
      'picked:Gan1': 2,
      'placed:Gan1': 2,
      'drops:Gan1': 0,
      'stacked:pallet:0': 2,
      'layers:pallet:0': 1,
    });
    expect(gantry.facts()).toHaveProperty(['axis:Gan1:z']);
  }, 120_000);

  it('PLT-010 itemsAssembled counts a lid placed on a base by the pick and place', async () => {
    const core = await make(
      sceneOf([
        part('base', 'Base1', [0.4, 0, 0], { mass: 2 }),
        part('lid', 'Lid1', [0.9, 0, 0], { mass: 0.5 }),
        part('pick-place', 'Pick1', [0, 0, 0], { variant: 'numeric', strokeYM: 0.6 }),
      ]),
    );
    run(core, 500);
    expect(core.facts().itemsAssembled).toBe(0);
    goto(core, 'Pick1', 0.9, 0.5, false);
    goto(core, 'Pick1', 0.9, 0.04, false);
    goto(core, 'Pick1', 0.9, 0.04, true);
    goto(core, 'Pick1', 0.9, 0.5, true);
    goto(core, 'Pick1', 0.4, 0.5, true);
    goto(core, 'Pick1', 0.4, 0.2, true);
    goto(core, 'Pick1', 0.4, 0.2, false);
    run(core, 1000);
    expect(core.facts()).toMatchObject({ 'picked:Pick1': 1, 'placed:Pick1': 1, itemsAssembled: 1 });
    expect(core.snapshot().items.map((i) => i.tag)).toEqual(['base', 'lid']);
    run(core, 2000);
    expect(core.facts().itemsAssembled).toBe(1); // counted once
  }, 120_000);

  it('PLT-010 stacked and layers facts read the boxes on a pallet', async () => {
    const core = await make(sceneOf([part('pick-place', 'Pick1', [0, 0, 0], { variant: 'numeric' })]));
    expect(core.facts()['itemsAssembled']).toBe(0);
    expect(Object.keys(core.facts()).some((k) => k.startsWith('stacked:'))).toBe(false);
    core.addItem('pallet', [2, 0, 0]);
    core.addItem('box', [2, 0.144, 0]);
    core.addItem('box', [2, 0.444, 0]);
    run(core, 2000);
    expect(core.facts()).toMatchObject({ 'stacked:pallet:0': 2, 'layers:pallet:0': 2 });
    run(core, 5000);
    expect(core.facts()).toMatchObject({ 'stacked:pallet:0': 2, 'layers:pallet:0': 2 });
  }, 60_000);

  it('PLT-012 a capture taken mid-carry restores to the same exact state and the same final hash as the run without capture', async () => {
    const plain = await make(GRIP_SCENE());
    gripCycle(plain);
    const plainHash = await plain.traceHash();

    const core = await make(GRIP_SCENE());
    gripCycle(core, 'carry');
    expect(core.sense()['Pick1.gripped']).toBe(true);
    const state = core.capture();
    const atCapture = JSON.stringify(core.snapshot());
    const hashAtCapture = await core.traceHash();
    const finish = (c: PlantCore) => {
      jog(c, 'Pick1', ['xPlus'], true, () => axis(c, 'Pick1', 'x') >= 0.99);
      jog(c, 'Pick1', ['yMinus'], true, () => axis(c, 'Pick1', 'y') <= 0.46);
      jog(c, 'Pick1', [], false, () => true);
      run(c, 1000);
    };
    finish(core);
    const endHash = await core.traceHash();
    expect(endHash).toBe(plainHash); // taking a capture changes nothing
    core.restore(state);
    expect(JSON.stringify(core.snapshot())).toBe(atCapture);
    expect(await core.traceHash()).toBe(hashAtCapture);
    expect(core.sense()['Pick1.gripped']).toBe(true);
    finish(core);
    expect(await core.traceHash()).toBe(endHash);
    expect(core.facts()).toMatchObject({ 'picked:Pick1': 1, 'placed:Pick1': 1 });
  }, 120_000);

  it('PLT-012 reset returns a manipulator scene to its initial state, the pad home and nothing held', async () => {
    const core = await make(GRIP_SCENE());
    const first = JSON.stringify(core.snapshot());
    const emptyHash = await core.traceHash();
    gripCycle(core, 'carry');
    expect(core.sense()['Pick1.gripped']).toBe(true);
    core.reset();
    expect(JSON.stringify(core.snapshot())).toBe(first);
    expect(await core.traceHash()).toBe(emptyHash);
    expect(core.sense()['Pick1.gripped']).toBe(false);
    expect(core.facts()).toMatchObject({ 'picked:Pick1': 0, 'axis:Pick1:x': 0, 'axis:Pick1:y': 0 });
    gripCycle(core); // and it works again after the reset
    expect(core.facts()).toMatchObject({ 'picked:Pick1': 1, 'placed:Pick1': 1 });
  }, 120_000);

  it('PLT-006 the two M3 core scripts give the pinned hashes on Linux', async () => {
    const grip = await make(GRIP_SCENE());
    gripCycle(grip);
    const gantry = await make(GANTRY_SCENE());
    gantryScript(gantry);
    expect(Object.keys(hashes).sort()).toEqual(['m1-palletStack-v1', 'm2-tankLoop-v1', 'm3-gantryNumeric-v1', 'm3-gripCycle-v1', 'notes']);
    if (process.platform !== 'linux') return;
    expect(await grip.traceHash()).toBe(hashes['m3-gripCycle-v1']);
    expect(await gantry.traceHash()).toBe(hashes['m3-gantryNumeric-v1']);
  }, 120_000);

  it('PLT-006 the hash does not depend on host pacing', async () => {
    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    let state = 4242;
    const random = () => (state = (Math.imul(state, 1103515245) + 12345) >>> 0) / 4294967296;
    const core = await make(GANTRY_SCENE());
    // the same script, with a seeded 0 to 5 ms pause after every advance
    const advance = core.advance.bind(core);
    let scans = 0;
    const pauses: Promise<void>[] = [];
    core.advance = (ms: number) => {
      advance(ms);
      scans += 1;
      if (scans % 3 === 0) pauses.push(wait(Math.floor(random() * 6)));
    };
    gantryScript(core);
    await Promise.all(pauses);
    if (process.platform === 'linux') expect(await core.traceHash()).toBe(hashes['m3-gantryNumeric-v1']);
    expect(scans).toBeGreaterThan(100);
  }, 120_000);

  it('PLT-016 apply refuses a REAL setpoint of the wrong type with the located message and leaves the hash unchanged', async () => {
    const core = await make(GANTRY_SCENE());
    run(core, 200);
    const before = await core.traceHash();
    expect(() => core.apply({ 'Gan1.xSet': true })).toThrow('plant: Gan1.xSet is REAL, got true');
    expect(() => core.apply({ 'Gan1.grip': 1 })).toThrow('plant: Gan1.grip is BOOL, got 1');
    expect(() => core.apply({ 'Gan1.zSet': Number.NaN })).toThrow('plant: Gan1.zSet must be a finite number');
    expect(await core.traceHash()).toBe(before);
  });

  it('PLT-010 a scene with no manipulator publishes the same facts as before, plus the support facts', async () => {
    const core = await make(sceneOf([part('box', 'Box1', [0, 0, 0]), part('pallet', 'Pallet1', [2, 0, 0])], 'plain'));
    run(core, 200);
    expect(Object.keys(core.facts())).toEqual([
      'itemsEmitted',
      'itemsRemoved',
      'itemsDropped',
      'itemsCollided',
      'position:box:0',
      'position:pallet:0',
      'itemsAssembled',
      'stacked:pallet:0',
      'layers:pallet:0',
    ]);
  });
});

describe('the M1 and M2 evidence is unchanged by the M3 registration', () => {
  it('PLT-006 the M1 and M2 pinned hashes keep their values', () => {
    expect(hashes['m1-palletStack-v1']).toBe('d709b3b3059f85d100b392494efe3f47effb4d32575982301afe6e663a9b3fd5');
    expect(hashes['m2-tankLoop-v1']).toBe('4808d3f020c559020a0e7d47c893e9c690bb95903505e4fe4f5f14cb3b10fd02');
  });

  const linux = sceneHashes.linux as Record<string, string>;
  for (const entry of SCENE_INDEX.filter((e) => e.id in linux)) {
    itNative(
      `PLT-006 the shipped scene ${entry.id} keeps its sceneHashes.json hash`,
      async () => {
        const result = await runSceneCheck(resolve(import.meta.dir, '../../..', entry.dir), 'native');
        expect(result.problems).toEqual([]);
        if (process.platform === 'linux') expect(result.traceHash).toBe(linux[entry.id]!);
      },
      240_000,
    );
  }
});

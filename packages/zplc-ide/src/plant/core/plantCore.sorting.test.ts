import { afterEach, describe, expect, it } from 'bun:test';
import { SCENE_INDEX } from '../../generated/sceneIndex';
import type { PartDefinition, PlantCore, PlantSceneFile, ScenePart } from '../contracts';
import sceneHashes from '../ci/sceneHashes.json';
import { catalogue } from './catalogue';
import hashes from './hashes.json';
import { createPlantCore } from './plantCore';

const cores: PlantCore[] = [];
afterEach(() => {
  for (const c of cores.splice(0)) c.dispose();
});
const part = (
  id: string,
  name: string,
  position: [number, number, number],
  config: ScenePart['config'] = {},
  rotationYDeg = 0,
): ScenePart => ({ id: name.toLowerCase(), part: id, name, position, rotationYDeg, config });
const sceneOf = (parts: ScenePart[], name = 'sorting'): PlantSceneFile => ({ schemaVersion: 1, name, parts, cameras: [] });
const make = async (scene: PlantSceneFile) => {
  const core = await createPlantCore(scene);
  cores.push(core);
  return core;
};
const run = (core: PlantCore, ms: number) => {
  for (let t = 0; t < ms; t += 10) core.advance(10);
};

// SCRIPTS-BEGIN (the throwaway pin script copies this block verbatim)
const TOP = 0.45;
const itemX = (core: PlantCore, index: number) => core.snapshot().items[index]!.p[0];

/** A belt feeds a chain transfer that lifts and moves a box right; a pusher pushes a second box off a belt; a turntable turns right. */
const DIVERTERS_SCENE = () =>
  sceneOf(
    [
      part('belt', 'In1', [-2.4, TOP, 0], { length: 4 }),
      part('chain-transfer', 'Chain1', [0, TOP, 0]),
      part('belt', 'Belt2', [0, TOP, 2.5], { length: 2 }),
      part('pusher', 'Pusher1', [0, TOP, 1.95], { strokeM: 1 }),
      part('turntable', 'Turn1', [0, TOP, -2.5]),
      part('box', 'BoxA', [-1.5, TOP, 0], { height: '0.2' }),
      part('box', 'BoxB', [0, TOP, 2.5], { height: '0.2' }),
      part('box', 'BoxC', [0, TOP, -2.5], { height: '0.2' }),
    ],
    'diverters',
  );
const divertersScript = (core: PlantCore): void => {
  run(core, 300);
  core.apply({ 'In1.run': true, 'Chain1.run': true });
  for (let scan = 0; scan < 1000 && itemX(core, 0) < -0.05; scan += 1) core.advance(10);
  core.apply({ 'In1.run': false, 'Chain1.run': false, 'Chain1.lift': true });
  run(core, 800);
  core.apply({ 'Chain1.moveRight': true });
  run(core, 2500);
  core.apply({ 'Chain1.moveRight': false });
  run(core, 500);
  core.apply({ 'Chain1.lift': false });
  run(core, 800);
  core.apply({ 'Pusher1.extend': true });
  run(core, 3000);
  core.apply({ 'Pusher1.extend': false });
  run(core, 2000);
  core.apply({ 'Turn1.toRight': true });
  run(core, 1500);
  core.apply({ 'Turn1.run': true });
  run(core, 3000);
  core.apply({ 'Turn1.run': false, 'Turn1.toRight': false });
  run(core, 2500);
};

/** An emitter of coloured workpieces (vary colour) on a belt past a colour sensor, a light array, a scale and a vision sensor. */
const SORTING_SCENE = () =>
  sceneOf(
    [
      part('belt', 'Line', [0, TOP, 0], { length: 6 }),
      part('emitter', 'Em1', [-2.8, TOP, 0], { kind: 'workpiece', vary: 'colour', intervalMs: 2000, maxItems: 5 }),
      part('sensor-colour', 'Col1', [-1.6, TOP, -0.5], { target: 'red', rangeM: 0.6, heightM: 0.05 }, 270),
      part('light-array', 'Arr1', [-0.8, TOP, -0.5]),
      part('scale', 'Scl1', [0.4, TOP, 0]),
      part('vision-sensor', 'Vis1', [1.6, TOP, 0]),
      part('remover', 'Bin1', [3.2, TOP - 0.3, 0], { width: 0.6, depth: 0.8, height: 0.6, accepts: 'red' }),
    ],
    'sorting',
  );
const sortingScript = (core: PlantCore): void => {
  run(core, 300);
  core.apply({ 'Line.run': true });
  run(core, 5000);
  core.apply({ 'Line.run': false });
  run(core, 1000);
  core.apply({ 'Line.run': true });
  run(core, 4000);
  core.apply({ 'Line.run': false });
  run(core, 1000);
  core.apply({ 'Line.run': true });
  run(core, 9000);
};

const TURN_SCENE = () => sceneOf([part('turntable', 'Turn1', [0, TOP, 0]), part('box', 'BoxC', [0, TOP, 0], { height: '0.2' })], 'turn');
// SCRIPTS-END

const M4_PARTS: Record<string, PartDefinition['family']> = {
  'light-array': 'sensors',
  scale: 'sensors',
  'vision-sensor': 'sensors',
  pusher: 'flow',
  'diverter-arm': 'flow',
  'chain-transfer': 'conveyors',
  turntable: 'conveyors',
  workpiece: 'items',
  'sensor-inductive': 'sensors',
  'sensor-capacitive': 'sensors',
  'sensor-colour': 'sensors',
};
const remove = async (config: ScenePart['config']) => {
  const core = await make(sceneOf([part('remover', 'Bin1', [0, 0.3, 0], { width: 2, depth: 2, height: 2, ...config })]));
  core.addItem('workpiece', [0, 0.3, 0]);
  core.addItem('box', [0.2, 0.3, 0]);
  run(core, 300);
  return core.facts();
};

describe('PlantCore sorting sensors, diverters and the M4 pins', () => {
  it('PRT-001 the catalogue contains every M4 part and the workpiece after the core is created', async () => {
    await make(sceneOf([part('box', 'Box1', [0, 0, 0])]));
    for (const [id, family] of Object.entries(M4_PARTS)) expect(catalogue.get(id)?.family).toBe(family);
    const ids = [...catalogue.list().map((d) => d.id)];
    expect(ids.indexOf('stack-light')).toBeLessThan(ids.indexOf('light-array')); // the new parts come last: earlier order unchanged
    expect(ids.indexOf('layer-palletizer')).toBeLessThan(ids.indexOf('turntable'));
  });

  it('PLT-010 sorted and misrouted are published by a remover that accepts a class and not by one that accepts any', async () => {
    const facts = await remove({ accepts: 'red' });
    expect(facts).toMatchObject({ 'delivered:Bin1': 2, 'sorted:Bin1': 1, 'misrouted:Bin1': 1 }); // the red workpiece, then a box
    expect(await remove({ accepts: 'any' })).toEqual(expect.objectContaining({ 'delivered:Bin1': 2 }));
    const any = await remove({});
    expect(Object.keys(any).filter((k) => /sorted|misrouted/.test(k))).toEqual([]);
  });

  it('PLT-010 addItem accepts a workpiece and the snapshot carries its colour, metal and code', async () => {
    const core = await make(sceneOf([part('box', 'Box1', [5, 0, 0])]));
    const id = core.addItem('workpiece', [0, 1, 0]);
    const added = core.snapshot().items.find((i) => i.id === id)!;
    expect(added).toMatchObject({ kind: 'item', size: [0.2, 0.1, 0.2], colour: 'red', metal: false });
    expect(added).not.toHaveProperty('code'); // unlabelled
    const box = core.snapshot().items.find((i) => i.id !== id)!;
    expect(box).not.toHaveProperty('colour');
    expect(box).not.toHaveProperty('metal');
    expect(() => core.addItem('tray', [0, 1, 0])).toThrow('plant: unknown item kind "tray"; use box, workpiece, crate or pallet');
    expect(core.snapshot().items).toHaveLength(2);
  });

  it('PLT-012 a capture taken while a box rides a turning platform restores to the same exact state and the same final hash', async () => {
    const script = (c: PlantCore, from: 'start' | 'ride') => {
      if (from === 'start') {
        c.apply({ 'Turn1.toRight': true, 'Turn1.run': true });
        run(c, 600);
      }
      run(c, 1500);
      c.apply({ 'Turn1.run': false, 'Turn1.toRight': false });
      run(c, 1000);
    };
    const plain = await make(TURN_SCENE());
    script(plain, 'start');
    const plainHash = await plain.traceHash();

    const core = await make(TURN_SCENE());
    core.apply({ 'Turn1.toRight': true, 'Turn1.run': true });
    run(core, 600);
    expect(core.snapshot().parts.find((p) => p.part === 'turntable')!.state.angleDeg).toBeGreaterThan(5); // turning
    const state = core.capture();
    const atCapture = JSON.stringify(core.snapshot());
    const hashAtCapture = await core.traceHash();
    script(core, 'ride');
    expect(await core.traceHash()).toBe(plainHash); // taking a capture changes nothing
    core.restore(state);
    expect(JSON.stringify(core.snapshot())).toBe(atCapture);
    expect(await core.traceHash()).toBe(hashAtCapture);
    script(core, 'ride');
    expect(await core.traceHash()).toBe(plainHash);
  }, 120_000);

  it('PLT-012 reset returns a sorting scene to its initial state', async () => {
    const core = await make(SORTING_SCENE());
    const first = JSON.stringify(core.snapshot());
    const emptyHash = await core.traceHash();
    run(core, 3000);
    core.apply({ 'Line.run': true });
    run(core, 2000);
    expect(JSON.stringify(core.snapshot())).not.toBe(first);
    core.reset();
    expect(JSON.stringify(core.snapshot())).toBe(first);
    expect(await core.traceHash()).toBe(emptyHash);
    expect(core.facts()).toMatchObject({ 'emitted:Em1': 0, 'delivered:Bin1': 0, 'sorted:Bin1': 0, 'misrouted:Bin1': 0, 'count:Col1': 0 });
  }, 120_000);

  it('PLT-010 the sorting scene grades every removed item as sorted or misrouted', async () => {
    const core = await make(SORTING_SCENE());
    sortingScript(core);
    const facts = core.facts();
    expect(facts['delivered:Bin1']).toBeGreaterThan(0);
    expect(facts['sorted:Bin1'] as number).toBe((facts['delivered:Bin1'] as number) - (facts['misrouted:Bin1'] as number));
    expect(facts['count:Col1']).toBeGreaterThan(0);
    expect(facts['count:Arr1']).toBeGreaterThan(0);
    expect(facts).not.toHaveProperty(['count:Scl1']); // a reading is a signal, not a fact
  }, 120_000);

  it('PLT-006 the two M4 core scripts give the pinned hashes on Linux', async () => {
    const diverters = await make(DIVERTERS_SCENE());
    divertersScript(diverters);
    const sorting = await make(SORTING_SCENE());
    sortingScript(sorting);
    expect(Object.keys(hashes)).toEqual(expect.arrayContaining(['m4-diverters-v1', 'm4-sorting-v1']));
    if (process.platform !== 'linux') return;
    expect(await diverters.traceHash()).toBe(hashes['m4-diverters-v1']);
    expect(await sorting.traceHash()).toBe(hashes['m4-sorting-v1']);
  }, 120_000);

  it('PLT-006 the hash does not depend on host pacing', async () => {
    const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
    let state = 4242;
    const random = () => (state = (Math.imul(state, 1103515245) + 12345) >>> 0) / 4294967296;
    const core = await make(SORTING_SCENE());
    const advance = core.advance.bind(core);
    let scans = 0;
    const pauses: Promise<void>[] = [];
    core.advance = (ms: number) => {
      advance(ms);
      scans += 1;
      if (scans % 3 === 0) pauses.push(wait(Math.floor(random() * 6)));
    };
    sortingScript(core);
    await Promise.all(pauses);
    if (process.platform === 'linux') expect(await core.traceHash()).toBe(hashes['m4-sorting-v1']);
    expect(scans).toBeGreaterThan(100);
  }, 120_000);

  it('PLT-016 apply refuses a REAL command of the wrong type with the located message and leaves the hash unchanged', async () => {
    const core = await make(
      sceneOf([
        part('scale', 'Scl1', [0, TOP, 0]),
        part('pusher', 'Pusher1', [0, TOP, 2]),
        part('gantry', 'Gan1', [4, 0, 0], { variant: 'numeric' }),
      ]),
    );
    run(core, 200);
    const before = await core.traceHash();
    expect(() => core.apply({ 'Gan1.xSet': true })).toThrow('plant: Gan1.xSet is REAL, got true');
    expect(() => core.apply({ 'Pusher1.extend': 1 })).toThrow('plant: Pusher1.extend is BOOL, got 1');
    expect(() => core.apply({ 'Scl1.weight': 3 })).toThrow('Scl1.weight');
    expect(await core.traceHash()).toBe(before);
  });

  it('PLT-010 a scene with no M4 part publishes the same facts, in the same key order, as before', async () => {
    const plain = await make(sceneOf([part('box', 'Box1', [0, 0, 0]), part('pallet', 'Pallet1', [2, 0, 0])], 'plain'));
    run(plain, 100);
    expect(Object.keys(plain.facts())).toEqual([
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
    const line = await make(
      sceneOf(
        [
          part('belt', 'Belt1', [0, TOP, 0], { length: 3 }),
          part('emitter', 'Em1', [-1, TOP, 0], { kind: 'box', intervalMs: 0 }),
          part('sensor-diffuse', 'EyeA', [0, TOP + 0.1, -0.5], {}, 270),
          part('remover', 'Rem1', [1.6, 0.2, 0]),
        ],
        'line',
      ),
    );
    run(line, 200);
    expect(Object.keys(line.facts())).toEqual([
      'itemsEmitted',
      'itemsRemoved',
      'itemsDropped',
      'itemsCollided',
      'emitted:Em1',
      'count:EyeA',
      'delivered:Rem1',
      'itemsAssembled',
    ]);
  });
});

describe('the M1 to M3 evidence is unchanged by the M4 registration', () => {
  it('PLT-006 the four M1 to M3 core pins keep their values', () => {
    expect(hashes['m1-palletStack-v1']).toBe('d709b3b3059f85d100b392494efe3f47effb4d32575982301afe6e663a9b3fd5');
    expect(hashes['m2-tankLoop-v1']).toBe('4808d3f020c559020a0e7d47c893e9c690bb95903505e4fe4f5f14cb3b10fd02');
    expect(hashes['m3-gripCycle-v1']).toBe('be5ead7684a90f27a38869491861eda7185439d3dc94bbc20d7bfa27b6d66de6');
    expect(hashes['m3-gantryNumeric-v1']).toBe('bc6ac85d01bdf3fbb164423e8b98182d3a532f44ceaffc83670ce1d82e8e45d3');
  });

  const linux = sceneHashes.linux as Record<string, string>;
  it('PLT-006 every shipped scene is pinned', () => {
    expect(SCENE_INDEX.filter((e) => !(e.id in linux)).map((e) => e.id)).toEqual([]);
  });
  // Each shipped scene's reference run and pinned hash are checked once, by the SCN-004 scene test in src/plant/ci/sceneCheck.test.ts.
});

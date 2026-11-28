import { afterEach, describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { SCENE_INDEX } from '../../generated/sceneIndex';
import type { PartDefinition, PlantCore, PlantSceneFile, ScenePart } from '../contracts';
import sceneHashes from '../ci/sceneHashes.json';
import { catalogue } from './catalogue';
import hashes from './hashes.json';
import { createPlantCore } from './plantCore';
import { scaleDefaultTimeout } from '../../test/platformTime';

scaleDefaultTimeout(); // a test with no timeout of its own gets bun's 5 s scaled for the system (src/test/platformTime.ts)

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
const sceneOf = (parts: ScenePart[], name = 'stations'): PlantSceneFile => ({ schemaVersion: 1, name, parts, cameras: [] });
const make = async (scene: PlantSceneFile) => {
  const core = await createPlantCore(scene);
  cores.push(core);
  return core;
};
const run = (core: PlantCore, ms: number) => {
  for (let t = 0; t < ms; t += 10) core.advance(10);
};
/** Advances until a sensor reads TRUE (a failure to arrive is a test failure, not a hang). */
const until = (core: PlantCore, sensor: string, maxMs = 20000) => {
  for (let t = 0; t < maxMs; t += 10) {
    if (core.sense()[sensor] === true) return;
    core.advance(10);
  }
  throw new Error(`${sensor} never became TRUE`);
};
const body = (core: PlantCore, id: string) => core.snapshot().items.find((i) => i.id === id)!;

// SCRIPTS-BEGIN (the throwaway pin script copies this block verbatim)
const TOP = 0.45;
const LEVEL_PITCH = 0.6;
const FORK_TOP = 0.07; // the dock level of the crane, fork lowered

/** A belt feeds a lift: a box rides up one level and runs off onto a second belt; then a crate takes two dropped workpieces down. */
const LIFTS_SCENE = () =>
  sceneOf(
    [
      part('belt', 'In1', [-1, TOP, 0], { length: 1 }),
      part('lift', 'Lift1', [0, TOP, 0]),
      part('belt', 'Out1', [1, TOP + LEVEL_PITCH, 0], { length: 1 }),
      part('box', 'BoxA', [-1, TOP, 0], { height: '0.2' }),
    ],
    'm5-lifts',
  );
const liftsScript = (core: PlantCore): void => {
  run(core, 300);
  core.apply({ 'In1.run': true, 'Lift1.run': true });
  run(core, 2500);
  core.apply({ 'In1.run': false, 'Lift1.run': false });
  run(core, 500);
  core.apply({ 'Lift1.up': true });
  until(core, 'Lift1.atLevel2');
  run(core, 500);
  core.apply({ 'Lift1.up': false, 'Lift1.run': true, 'Out1.run': true });
  run(core, 3000);
  core.apply({ 'Lift1.run': false, 'Out1.run': false });
  core.addItem('crate', [0, TOP + LEVEL_PITCH, 0]);
  run(core, 800);
  core.addItem('workpiece', [-0.15, TOP + LEVEL_PITCH + 0.5, 0]);
  core.addItem('workpiece', [0.15, TOP + LEVEL_PITCH + 0.5, 0]);
  run(core, 1500);
  core.apply({ 'Lift1.down': true });
  until(core, 'Lift1.atLevel1');
  core.apply({ 'Lift1.down': false });
  run(core, 800);
};

/** A stacker crane stores two boxes in its rack and retrieves one; a machining centre turns a workpiece into a lid. */
const STATION_SCENE = () =>
  sceneOf(
    [
      part('stacker-crane', 'Crane1', [0, 0, 0]),
      part('box', 'BoxA', [0, FORK_TOP, 0], { height: '0.2' }, 90),
      part('belt', 'Feed1', [7, TOP, -4], { length: 1 }),
      part('machining-centre', 'Mc1', [8, TOP, -4], { cycleMs: 1000 }),
      part('workpiece', 'Blank1', [6.7, TOP, -4], { colour: 'red' }),
    ],
    'm5-station',
  );
/** Stores the box on the fork in (bay, level): raised, extend right, lower, retract. */
const storeAt = (core: PlantCore, bay: number, level: number): void => {
  core.apply({ 'Crane1.raise': true, 'Crane1.level': level, 'Crane1.bay': bay });
  run(core, 300);
  until(core, 'Crane1.inPosition');
  until(core, 'Crane1.raised');
  core.apply({ 'Crane1.forkRight': true });
  until(core, 'Crane1.forkAtRight');
  core.apply({ 'Crane1.raise': false });
  run(core, 1500);
  core.apply({ 'Crane1.forkRight': false });
  until(core, 'Crane1.forkCentre');
  run(core, 500);
};
const retrieveFrom = (core: PlantCore, bay: number, level: number): void => {
  core.apply({ 'Crane1.raise': false, 'Crane1.level': level, 'Crane1.bay': bay });
  run(core, 300);
  until(core, 'Crane1.inPosition');
  core.apply({ 'Crane1.forkRight': true });
  until(core, 'Crane1.forkAtRight');
  run(core, 500);
  core.apply({ 'Crane1.raise': true });
  until(core, 'Crane1.raised');
  run(core, 500);
  core.apply({ 'Crane1.forkRight': false });
  until(core, 'Crane1.forkCentre');
  run(core, 500);
};
const stationScript = (core: PlantCore): void => {
  run(core, 300);
  core.apply({ 'Feed1.run': true, 'Mc1.feed': true });
  run(core, 3200);
  core.apply({ 'Feed1.run': false, 'Mc1.feed': false });
  run(core, 800);
  core.apply({ 'Mc1.start': true });
  run(core, 200);
  core.apply({ 'Mc1.start': false });
  storeAt(core, 1, 1);
  core.apply({ 'Crane1.raise': false, 'Crane1.level': 0, 'Crane1.bay': 0 });
  run(core, 300);
  until(core, 'Crane1.inPosition');
  run(core, 500);
  core.addItem('box', [0, FORK_TOP, 0]);
  run(core, 500);
  storeAt(core, 2, 1);
  retrieveFrom(core, 1, 1);
  run(core, 4000);
};
// SCRIPTS-END

const M5_PARTS: Record<string, PartDefinition['family']> = {
  crate: 'items',
  lift: 'conveyors',
  'stacker-crane': 'stations',
  'machining-centre': 'stations',
  'limit-switch': 'sensors',
  aligner: 'flow',
  chute: 'flow',
};
/** The fact keys, in order, that these shipped scenes published before M5 (read from the M4 merge). */
const SCENE_KEYS: Record<string, string[]> = {
  'height-sorting-chain': [
    'itemsEmitted',
    'itemsRemoved',
    'itemsDropped',
    'itemsCollided',
    'emitted:Source1',
    'count:BeamLow',
    'count:BeamHigh',
    'count:EyeChain',
    'delivered:BinShort',
    'sorted:BinShort',
    'misrouted:BinShort',
    'delivered:BinMedium',
    'sorted:BinMedium',
    'misrouted:BinMedium',
    'delivered:BinTall',
    'sorted:BinTall',
    'misrouted:BinTall',
    'itemsAssembled',
  ],
  'three-axis-palletizing': [
    'itemsEmitted',
    'itemsRemoved',
    'itemsDropped',
    'itemsCollided',
    'emitted:Emitter1',
    'count:EyePick',
    'picked:Gantry1',
    'placed:Gantry1',
    'drops:Gantry1',
    'axis:Gantry1:x',
    'axis:Gantry1:y',
    'axis:Gantry1:z',
    'position:pallet:0',
    'itemsAssembled',
  ],
  'layer-palletizer': [
    'itemsEmitted',
    'itemsRemoved',
    'itemsDropped',
    'itemsCollided',
    'emitted:Emitter1',
    'emitted:Emitter2',
    'count:EyeIn',
    'picked:Palletizer1',
    'placed:Palletizer1',
    'drops:Palletizer1',
    'axis:Palletizer1:x',
    'axis:Palletizer1:y',
    'position:pallet:0',
    'itemsAssembled',
  ],
  'vision-sorting': [
    'itemsEmitted',
    'itemsRemoved',
    'itemsDropped',
    'itemsCollided',
    'emitted:Source1',
    'delivered:Product1',
    'sorted:Product1',
    'misrouted:Product1',
    'delivered:Product2',
    'sorted:Product2',
    'misrouted:Product2',
    'itemsAssembled',
  ],
};
const STATION_FACTS = ['stored:Crane1', 'blocked:Crane1', 'produced:Mc1', 'misfires:Mc1'];

describe('PlantCore lifts, stations and the M5 pins', () => {
  it('PRT-001 the catalogue contains every M5 part and the crate after the core is created', async () => {
    await make(sceneOf([part('box', 'Box1', [0, 0, 0])]));
    for (const [id, family] of Object.entries(M5_PARTS)) expect(catalogue.get(id)?.family).toBe(family);
    const ids = catalogue.list().map((d) => d.id);
    expect(ids.indexOf('turntable')).toBeLessThan(ids.indexOf('lift')); // the new parts come last: earlier order unchanged
    expect(ids.indexOf('lift')).toBeLessThan(ids.indexOf('stacker-crane'));
    expect(ids.indexOf('stacker-crane')).toBeLessThan(ids.indexOf('machining-centre'));
    expect(ids.indexOf('machining-centre')).toBeLessThan(ids.indexOf('limit-switch'));
  });

  it('PLT-010 stored, cell, produced, misfires and blocked are published by their parts and not by a scene without them', async () => {
    const core = await make(STATION_SCENE());
    const keys = Object.keys(core.facts());
    expect(keys).toEqual(
      expect.arrayContaining([...STATION_FACTS, 'cell:Crane1:1:1', 'cell:Crane1:4:3', 'axis:Crane1:x', 'axis:Crane1:z']),
    );
    expect(core.facts()).toMatchObject({ 'stored:Crane1': 0, 'blocked:Crane1': 0, 'produced:Mc1': 0, 'misfires:Mc1': 0 });
    const lifts = await make(LIFTS_SCENE());
    expect(lifts.facts()).toMatchObject({ 'axis:Lift1:y': 0 });
    const plain = await make(sceneOf([part('box', 'Box1', [0, 0, 0])]));
    run(plain, 100);
    expect(Object.keys(plain.facts()).filter((k) => /^(stored|cell|produced|misfires|blocked|loaded)/.test(k))).toEqual([]);
  });

  it('PLT-010 the station script stores two boxes, retrieves one and produces a lid, telling every fact', async () => {
    const core = await make(STATION_SCENE());
    stationScript(core);
    const facts = core.facts();
    expect(facts).toMatchObject({
      'stored:Crane1': 1,
      'produced:Mc1': 1,
      'misfires:Mc1': 0,
      'cell:Crane1:2:1': true,
      'cell:Crane1:1:1': false,
    });
    expect(core.snapshot().items.some((i) => i.tag === 'lid')).toBe(true);
  }, 120_000);

  it('PLT-010 addItem accepts a crate and the snapshot carries its tag', async () => {
    const core = await make(sceneOf([part('box', 'Box1', [5, 0, 0])]));
    const id = core.addItem('crate', [0, 0, 0]);
    run(core, 500);
    const added = body(core, id);
    expect(added).toMatchObject({ kind: 'item', size: [0.8, 0.25, 0.6], tag: 'crate' });
    expect(core.snapshot().items.find((i) => i.id !== id)).not.toHaveProperty('tag', 'crate');
    core.addItem('workpiece', [0, 0.3, 0]);
    run(core, 1000);
    expect(core.facts()['loaded:crate:0']).toBe(1);
  });

  it('PLT-016 addItem of an unknown kind is refused with the located message', async () => {
    const core = await make(sceneOf([part('box', 'Box1', [5, 0, 0])]));
    const before = await core.traceHash();
    expect(() => core.addItem('tray', [0, 1, 0])).toThrow('plant: unknown item kind "tray"; use box, workpiece, crate or pallet');
    expect(core.snapshot().items).toHaveLength(1);
    expect(await core.traceHash()).toBe(before);
  });

  it('PLT-012 a capture taken while a crate rides a lift restores to the same exact state and the same final hash', async () => {
    const tail = (c: PlantCore) => {
      run(c, 1500);
      c.apply({ 'Lift1.down': true });
      until(c, 'Lift1.atLevel1');
      c.apply({ 'Lift1.down': false });
      run(c, 800);
    };
    const head = async () => {
      const c = await make(sceneOf([part('lift', 'Lift1', [0, TOP, 0]), part('crate', 'Crate1', [0, TOP, 0])], 'ride'));
      run(c, 500);
      c.apply({ 'Lift1.up': true });
      until(c, 'Lift1.atLevel2');
      c.addItem('workpiece', [0, TOP + LEVEL_PITCH + 0.5, 0]);
      run(c, 300);
      c.apply({ 'Lift1.up': false, 'Lift1.down': true });
      run(c, 600);
      return c;
    };
    const plain = await head();
    tail(plain);
    const plainHash = await plain.traceHash();

    const core = await head();
    expect(core.facts()['axis:Lift1:y']).toBeGreaterThan(0.1); // travelling, the crate on the platform
    expect(core.facts()['axis:Lift1:y']).toBeLessThan(LEVEL_PITCH);
    const state = core.capture();
    const atCapture = JSON.stringify(core.snapshot());
    const hashAtCapture = await core.traceHash();
    tail(core);
    expect(await core.traceHash()).toBe(plainHash); // taking a capture changes nothing
    core.restore(state);
    expect(JSON.stringify(core.snapshot())).toBe(atCapture);
    expect(await core.traceHash()).toBe(hashAtCapture);
    tail(core);
    expect(await core.traceHash()).toBe(plainHash);
  }, 120_000);

  it('PLT-012 a capture taken with the fork extended restores to the same exact state and the same final hash', async () => {
    const scene = () => sceneOf([part('stacker-crane', 'Crane1', [0, 0, 0]), part('box', 'BoxA', [0, FORK_TOP, 0], { height: '0.2' }, 90)]);
    const head = async () => {
      const c = await make(scene());
      c.apply({ 'Crane1.raise': true, 'Crane1.level': 1, 'Crane1.bay': 1 });
      run(c, 300);
      until(c, 'Crane1.inPosition');
      until(c, 'Crane1.raised');
      c.apply({ 'Crane1.forkRight': true });
      run(c, 600);
      return c;
    };
    const tail = (c: PlantCore) => {
      until(c, 'Crane1.forkAtRight');
      c.apply({ 'Crane1.raise': false });
      run(c, 1500);
      c.apply({ 'Crane1.forkRight': false });
      until(c, 'Crane1.forkCentre');
      run(c, 500);
    };
    const plain = await head();
    tail(plain);
    const plainHash = await plain.traceHash();
    const core = await head();
    expect(core.sense()['Crane1.forkCentre']).toBe(false); // the fork is out
    const state = core.capture();
    const atCapture = JSON.stringify(core.snapshot());
    tail(core);
    expect(await core.traceHash()).toBe(plainHash);
    core.restore(state);
    expect(JSON.stringify(core.snapshot())).toBe(atCapture);
    tail(core);
    expect(await core.traceHash()).toBe(plainHash);
    expect(core.facts()['cell:Crane1:1:1']).toBe(true);
  }, 120_000);

  it('PLT-012 reset returns a station scene to its initial state', async () => {
    const core = await make(STATION_SCENE());
    const first = JSON.stringify(core.snapshot());
    const emptyHash = await core.traceHash();
    run(core, 300);
    core.apply({ 'Mc1.feed': true, 'Crane1.level': 1, 'Crane1.bay': 2 });
    run(core, 2000);
    expect(JSON.stringify(core.snapshot())).not.toBe(first);
    core.reset();
    expect(JSON.stringify(core.snapshot())).toBe(first);
    expect(await core.traceHash()).toBe(emptyHash);
    expect(core.facts()).toMatchObject({ 'stored:Crane1': 0, 'produced:Mc1': 0, 'axis:Crane1:x': 0 });
  }, 120_000);

  it('PLT-006 the two M5 core scripts give the pinned hashes on Linux', async () => {
    const lifts = await make(LIFTS_SCENE());
    liftsScript(lifts);
    const station = await make(STATION_SCENE());
    stationScript(station);
    expect(Object.keys(hashes)).toEqual(expect.arrayContaining(['m5-lifts-v1', 'm5-station-v1']));
    if (process.platform !== 'linux') return;
    expect(await lifts.traceHash()).toBe(hashes['m5-lifts-v1']);
    expect(await station.traceHash()).toBe(hashes['m5-station-v1']);
  }, 120_000);

  it(
    'PLT-006 the lifts script does what its name says: the box leaves the lift, the crate keeps its workpieces and comes ' + 'down',
    async () => {
      const core = await make(LIFTS_SCENE());
      liftsScript(core);
      const items = core.snapshot().items;
      expect(items.find((i) => i.id === 'boxa')!.p[0]).toBeGreaterThan(0.6); // carried off at level 2
      expect(core.facts()['loaded:crate:0']).toBe(2);
      expect(core.facts()['axis:Lift1:y']).toBe(0);
      expect(items.find((i) => i.tag === 'crate')!.p[1]).toBeLessThan(TOP + 0.2); // back at level 1
    },
    120_000,
  );

  it('PLT-006 the hash does not depend on host pacing', async () => {
    const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
    let state = 4242;
    const random = () => (state = (Math.imul(state, 1103515245) + 12345) >>> 0) / 4294967296;
    const core = await make(LIFTS_SCENE());
    const advance = core.advance.bind(core);
    let scans = 0;
    const pauses: Promise<void>[] = [];
    core.advance = (ms: number) => {
      advance(ms);
      scans += 1;
      if (scans % 3 === 0) pauses.push(wait(Math.floor(random() * 6)));
    };
    liftsScript(core);
    await Promise.all(pauses);
    if (process.platform === 'linux') expect(await core.traceHash()).toBe(hashes['m5-lifts-v1']);
    expect(scans).toBeGreaterThan(100);
  }, 120_000);

  it('PLT-006 no libm function is called by a part while the two M5 scripts run and the hashes are the pinned ones', async () => {
    const lifts = await make(LIFTS_SCENE());
    const station = await make(STATION_SCENE());
    const real = { sin: Math.sin, cos: Math.cos, tan: Math.tan, atan2: Math.atan2, pow: Math.pow };
    // Every spawn (an emitter, addItem, the machining swap) turns its yaw into a quaternion in `world.addBody`: that call is the
    // world's own, let through; a call from any part, from the core or from the step loop throws.
    const guard =
      (name: keyof typeof real) =>
      (...args: number[]) => {
        if (new Error().stack?.includes('addBody')) return (real[name] as (...a: number[]) => number)(...args);
        throw new Error(`libm call in a step: Math.${name}`);
      };
    Object.assign(Math, { sin: guard('sin'), cos: guard('cos'), tan: guard('tan'), atan2: guard('atan2'), pow: guard('pow') });
    try {
      liftsScript(lifts);
      stationScript(station);
    } finally {
      Object.assign(Math, real);
    }
    if (process.platform !== 'linux') return;
    expect(await lifts.traceHash()).toBe(hashes['m5-lifts-v1']);
    expect(await station.traceHash()).toBe(hashes['m5-station-v1']);
  }, 120_000);

  it('PLT-016 apply refuses a bay or a level outside its range with the located message and leaves the hash unchanged', async () => {
    const core = await make(sceneOf([part('stacker-crane', 'Crane1', [0, 0, 0])]));
    run(core, 200);
    const before = await core.traceHash();
    expect(() => core.apply({ 'Crane1.bay': 5 })).toThrow('plant: Crane1.bay 5 is above the limit 4 bay');
    expect(() => core.apply({ 'Crane1.level': 4 })).toThrow('plant: Crane1.level 4 is above the limit 3 level');
    expect(() => core.apply({ 'Crane1.level': -1 })).toThrow('plant: Crane1.level -1 is below the limit 0 level');
    expect(() => core.apply({ 'Crane1.bay': 2, 'Crane1.level': 9 })).toThrow('Crane1.level 9'); // nothing of the call is applied
    expect(() => core.apply({ 'Crane1.bay': Number.NaN })).toThrow('finite');
    expect(() => core.apply({ 'Crane1.bay': true })).toThrow('plant: Crane1.bay is INT, got true');
    expect(await core.traceHash()).toBe(before);
    run(core, 100);
    expect(core.sense()['Crane1.inPosition']).toBe(true); // bay 2 was not applied by the refused call
    core.apply({ 'Crane1.bay': 4, 'Crane1.level': 3 }); // the range limits themselves are accepted
  });

  it('PLT-010 a scene with no M5 part publishes the same facts, in the same key order, as before', async () => {
    for (const [id, keys] of Object.entries(SCENE_KEYS)) {
      const scene = JSON.parse(readFileSync(new URL(`../../../plant-scenes/${id}/scene.json`, import.meta.url), 'utf8')) as PlantSceneFile;
      expect(Object.keys((await make(scene)).facts())).toEqual(keys);
    }
  });
});

describe('the M1 to M4 evidence is unchanged by the M5 registration', () => {
  it('PLT-006 the six M1 to M4 core pins keep their values', () => {
    expect(hashes['m1-palletStack-v1']).toBe('d709b3b3059f85d100b392494efe3f47effb4d32575982301afe6e663a9b3fd5');
    expect(hashes['m2-tankLoop-v1']).toBe('4808d3f020c559020a0e7d47c893e9c690bb95903505e4fe4f5f14cb3b10fd02');
    expect(hashes['m3-gripCycle-v1']).toBe('be5ead7684a90f27a38869491861eda7185439d3dc94bbc20d7bfa27b6d66de6');
    expect(hashes['m3-gantryNumeric-v1']).toBe('bc6ac85d01bdf3fbb164423e8b98182d3a532f44ceaffc83670ce1d82e8e45d3');
    expect(hashes['m4-diverters-v1']).toBe('5c4918dd24449f34698088fca7d5246d379499b9c469c89f3d085bba0b0e3216');
    expect(hashes['m4-sorting-v1']).toBe('52dd70ae5a21dead2a26f17c207e4cf34b24742648950fab728cb36cbd831cc1');
  });

  const linux = sceneHashes.linux as Record<string, string>;
  it('PLT-006 every shipped scene keeps its pinned hash', () => {
    expect(SCENE_INDEX.filter((e) => !(e.id in linux)).map((e) => e.id)).toEqual([]);
  });
  // Each shipped scene's reference run is compared with its pinned hash once, by the SCN-004 scene test in src/plant/ci/sceneCheck.test.ts.
});

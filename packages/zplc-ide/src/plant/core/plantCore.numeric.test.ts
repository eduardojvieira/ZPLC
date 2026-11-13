import { afterEach, describe, expect, it } from 'bun:test';
import { resolve } from 'node:path';
import { itNative } from '../../cli/nativeRuntimeGuard';
import { SCENE_INDEX } from '../../generated/sceneIndex';
import type { PlantCore, PlantSceneFile, ScenePart } from '../contracts';
import sceneHashes from '../ci/sceneHashes.json';
import { runSceneCheck } from '../ci/sceneCheck';
import { conveyorParts } from './parts/conveyors';
import { flowParts } from './parts/flow';
import { indicatorParts } from './parts/indicators';
import { itemParts } from './parts/items';
import { operableParts } from './parts/operable';
import { panelParts } from './parts/panel';
import { processParts } from './parts/process';
import { sensorParts } from './parts/sensors';
import { sourceParts } from './parts/sources';
import hashes from './hashes.json';
import { createPlantCore } from './plantCore';

const cores: PlantCore[] = [];
afterEach(() => {
  for (const c of cores.splice(0)) c.dispose();
});
const part = (id: string, name: string, position: [number, number, number], config: ScenePart['config'] = {}): ScenePart => ({
  id: name.toLowerCase().replace(/_/g, '-'),
  part: id,
  name,
  position,
  rotationYDeg: 0,
  config,
});
const sceneOf = (parts: ScenePart[], name = 'test'): PlantSceneFile => ({ schemaVersion: 1, name, parts, cameras: [] });
const make = async (scene: PlantSceneFile) => {
  const core = await createPlantCore(scene);
  cores.push(core);
  return core;
};
const numericTank = (config: ScenePart['config'] = {}) =>
  sceneOf([part('tank', 'Tank1', [0, 0, 0], { variant: 'numeric', ...config })], 'tank');
const run = (core: PlantCore, ms: number) => {
  for (let t = 0; t < ms; t += 10) core.advance(10);
};

/** The reference tank script: fill 100 % for 5 s, drain 60 % for 10 s, then idle; 2000 scans of 10 ms. */
async function runTankScript(core: PlantCore, between?: (scan: number) => Promise<void>): Promise<string> {
  for (let scan = 0; scan < 2000; scan += 1) {
    if (scan === 0) core.apply({ 'Tank1.fill': 100, 'Tank1.drain': 0 });
    if (scan === 500) core.apply({ 'Tank1.fill': 0, 'Tank1.drain': 60 });
    if (scan === 1500) core.apply({ 'Tank1.drain': 0 });
    core.advance(10);
    await between?.(scan);
  }
  return core.traceHash();
}

describe('PlantCore numeric values', () => {
  it('PLT-003 apply refuses a value whose type is not the signal type, with the signal named', async () => {
    const digital = await make(sceneOf([part('tank', 'Tank1', [0, 0, 0], { variant: 'digital' })]));
    expect(() => digital.apply({ 'Tank1.fill': 12 })).toThrow('plant: Tank1.fill is BOOL, got 12');
    const numeric = await make(numericTank());
    expect(() => numeric.apply({ 'Tank1.fill': true })).toThrow('plant: Tank1.fill is REAL, got true');
    // a refused call changes nothing, not even the valid keys beside the bad one
    expect(() => numeric.apply({ 'Tank1.drain': 100, 'Tank1.fill': 'x' as unknown as number })).toThrow('got "x"');
    run(numeric, 100);
    expect(numeric.sense()['Tank1.flowOut']).toBe(0);
  });

  it('PLT-003 apply clamps a numeric command to its range and refuses a non-finite one', async () => {
    const core = await make(numericTank({ valveTauS: 0 }));
    core.apply({ 'Tank1.fill': 150 });
    run(core, 10);
    expect(core.sense()['Tank1.flowIn']).toBe(20); // 150 % saturates at the full opening, inletMaxLps 20
    core.apply({ 'Tank1.fill': -40 });
    run(core, 10);
    expect(core.sense()['Tank1.flowIn']).toBe(0);
    core.apply({ 'Tank1.fill': 50 });
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY]) expect(() => core.apply({ 'Tank1.fill': bad })).toThrow(RangeError);
    expect(() => core.apply({ 'Tank1.fill': Number.NaN })).toThrow('plant: Tank1.fill must be a finite number');
    run(core, 10);
    expect(core.sense()['Tank1.flowIn']).toBe(10); // the refused values left the command at 50 %
  });

  it('PLT-009 a tank scene runs in the test runner with no body but the floor', async () => {
    const core = await make(
      sceneOf(
        [
          part('tank', 'Tank1', [0, 0, 0], { variant: 'digital', initialFraction: 0.5 }),
          part('push-button', 'Start', [2, 0, 0]),
          part('emergency-stop', 'Estop1', [3, 0, 0]),
          part('stack-light', 'Light1', [4, 0, 0]),
        ],
        'tankScene',
      ),
    );
    run(core, 100);
    const snap = core.snapshot();
    expect(snap.items).toEqual([]);
    expect(snap.parts.map((p) => [p.name, p.part])).toEqual([
      ['Tank1', 'tank'],
      ['Start', 'push-button'],
      ['Estop1', 'emergency-stop'],
      ['Light1', 'stack-light'],
    ]);
    const tank = snap.parts[0]!;
    expect(Object.keys(tank.state).sort()).toEqual(['fraction', 'heightM', 'level', 'spilling']);
    expect(tank.state.level).toBeCloseTo(0.5, 9);
    expect(tank.pose.size).toEqual([0.4, 1, 0.25]);
    expect(core.sense()).toMatchObject({ 'Tank1.levelLow': false, 'Tank1.levelHigh': false, 'Estop1.ok': true });
  });

  it('VIS-010 operate sets a potentiometer and a selector, and refuses an out-of-range value with the range named', async () => {
    const core = await make(
      sceneOf([
        part('potentiometer', 'Pot1', [0, 0, 0], { min: 0, max: 100, unit: '%' }),
        part('selector-switch', 'Sel1', [1, 0, 0], { positions: 3, output: 'integer' }),
      ]),
    );
    core.operate('Pot1.value', 42.5);
    core.operate('Sel1.position', 2);
    run(core, 10);
    expect(core.sense()).toMatchObject({ 'Pot1.value': 42.5, 'Sel1.position': 2 });
    expect(() => core.operate('Pot1.value', 120)).toThrow('plant: Pot1.value 120 is above the limit 100 %');
    expect(() => core.operate('Pot1.value', -1)).toThrow(RangeError);
    expect(() => core.operate('Sel1.position', 3)).toThrow('plant: Sel1.position 3 is above the limit 2');
    expect(() => core.operate('Pot1.nope', 1)).toThrow('plant: unknown signal "Pot1.nope"');
    expect(core.sense()).toMatchObject({ 'Pot1.value': 42.5, 'Sel1.position': 2 }); // a refused operation changes nothing
  });

  it('VIS-010 the emergency stop latches through the core and ok follows', async () => {
    const core = await make(sceneOf([part('emergency-stop', 'Estop1', [0, 0, 0])]));
    expect(core.sense()).toEqual({ 'Estop1.pressed': false, 'Estop1.ok': true });
    core.operate('Estop1.pressed', true);
    run(core, 100);
    expect(core.sense()).toEqual({ 'Estop1.pressed': true, 'Estop1.ok': false });
    core.operate('Estop1.pressed', false);
    expect(core.sense()).toEqual({ 'Estop1.pressed': false, 'Estop1.ok': true });
    core.act('Estop1', 'wireBreak');
    expect(core.sense()['Estop1.ok']).toBe(false);
    expect(core.sense()['Estop1.pressed']).toBe(false);
  });

  it('PLT-010 the tank facts reach the scene facts', async () => {
    const core = await make(numericTank({ valveTauS: 0, bandLow: 0.2, bandHigh: 0.9, highFraction: 0.5 }));
    core.apply({ 'Tank1.fill': 100 });
    run(core, 1000); // 20 L/s for 1 s into 0.1 m2: 0.2 m, 20 L
    expect(core.facts()).toMatchObject({
      'level:Tank1': 0.2,
      'volume:Tank1': 20,
      'spilledL:Tank1': 0,
      'highs:Tank1': 0,
      'inBand:Tank1': true,
    });
    run(core, 3000);
    expect(core.facts()).toMatchObject({ 'level:Tank1': 0.8, 'highs:Tank1': 1, 'inBand:Tank1': true });
    run(core, 1000); // 100 L is exactly the full tank
    run(core, 1000); // then 20 L/s spill
    expect(core.facts()).toMatchObject({ 'level:Tank1': 1, 'inBand:Tank1': false });
    expect(core.facts()['spilledL:Tank1']).toBeGreaterThan(0);
  });

  it('PLT-006 the trace hash of the reference tank script equals the pinned hash', async () => {
    const core = await make(numericTank());
    expect(await runTankScript(core)).toBe(hashes['m2-tankLoop-v1']);
    expect(core.facts()['level:Tank1']).toBeGreaterThan(0); // the script really moved water
  }, 60000);

  it('PLT-006 three fresh cores give the same hash', async () => {
    const results = new Set<string>();
    for (let i = 0; i < 3; i += 1) {
      const core = await createPlantCore(numericTank());
      cores.push(core);
      results.add(await runTankScript(core));
    }
    expect(results.size).toBe(1);
  }, 60000);

  it('PLT-006 host pacing does not change the numeric trace', async () => {
    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    let state = 12345;
    const random = () => (state = (Math.imul(state, 1103515245) + 12345) >>> 0) / 4294967296;
    const core = await make(numericTank());
    const hash = await runTankScript(core, async (scan) => {
      if (scan % 50 === 0) await wait(Math.floor(random() * 6));
    });
    expect(hash).toBe(hashes['m2-tankLoop-v1']);
  }, 60000);

  it('PLT-012 reset returns a tank scene to its initial state and capture and restore resume a running one', async () => {
    const scene = numericTank({ initialFraction: 0.3, highFraction: 0.5, heightM: 0.6, valveTauS: 0.2 });
    const core = await make(scene);
    const first = JSON.stringify(core.snapshot());
    const emptyHash = await core.traceHash();
    core.apply({ 'Tank1.fill': 100, 'Tank1.drain': 0 });
    run(core, 3000); // rises past the high mark, then spills
    core.apply({ 'Tank1.fill': 20, 'Tank1.drain': 50 });
    run(core, 500);
    const state = core.capture();
    const atCapture = JSON.stringify(core.snapshot());
    const hashAtCapture = await core.traceHash();
    expect(core.facts()['highs:Tank1']).toBe(1);
    expect(core.facts()['spilledL:Tank1']).toBeGreaterThan(0);
    run(core, 3000);
    const later = JSON.stringify(core.snapshot());
    const laterHash = await core.traceHash();
    expect(later).not.toBe(atCapture);
    core.restore(state);
    expect(JSON.stringify(core.snapshot())).toBe(atCapture); // level, valve openings, highs and spilledL come back
    expect(await core.traceHash()).toBe(hashAtCapture);
    run(core, 3000);
    expect(JSON.stringify(core.snapshot())).toBe(later);
    expect(await core.traceHash()).toBe(laterHash);
    core.reset();
    expect(JSON.stringify(core.snapshot())).toBe(first);
    expect(await core.traceHash()).toBe(emptyHash);
    expect(core.facts()).toMatchObject({ 'spilledL:Tank1': 0, 'highs:Tank1': 0 });
  });

  it(
    'PRT-002 every signal a part declares exists in sense() or is accepted by apply(), over the whole catalogue including the new ' +
      'parts',
    async () => {
      const defs = [
        ...itemParts,
        ...conveyorParts,
        ...sourceParts,
        ...sensorParts,
        ...flowParts,
        ...panelParts,
        ...processParts,
        ...operableParts,
        ...indicatorParts,
      ];
      const extras = [
        part('tank', 'TankDigital', [0, 0, 20], { variant: 'digital' }),
        part('selector-switch', 'SelInt', [3, 0, 20], { output: 'integer' }),
        part('numeric-display', 'DispInt', [6, 0, 20], { type: 'INT', min: -10, max: 10, unit: 'V' }),
      ];
      const core = await make(sceneOf([...defs.map((d, i) => part(d.id, d.id.replace(/-/g, '_'), [i * 3, 0, 0])), ...extras]));
      const sensed = core.sense();
      expect(defs.length).toBeGreaterThanOrEqual(18);
      expect(core.signals.some((s) => s.type === 'INT')).toBe(true);
      expect(core.signals.some((s) => s.type === 'REAL' && s.direction === 'command')).toBe(true);
      for (const s of core.signals) {
        if (s.direction === 'sensor') expect(sensed).toHaveProperty([s.name]);
        else expect(() => core.apply({ [s.name]: s.type === 'BOOL' ? true : (s.range?.max ?? 1) })).not.toThrow();
      }
      expect(Object.keys(sensed).every((k) => core.signals.some((s) => s.name === k && s.direction === 'sensor'))).toBe(true);
      run(core, 50); // every command, applied together, steps without a throw
    },
  );
});

describe('the M1 evidence is unchanged', () => {
  it('PLT-013 the M1 pinned hash m1-palletStack-v1 is unchanged', () => {
    expect(hashes['m1-palletStack-v1']).toBe('d709b3b3059f85d100b392494efe3f47effb4d32575982301afe6e663a9b3fd5');
    expect(Object.keys(hashes)).toEqual(expect.arrayContaining(['m1-palletStack-v1', 'm2-tankLoop-v1', 'notes']));
  });

  const linux = sceneHashes.linux as Record<string, string>;
  for (const entry of SCENE_INDEX.filter((e) => e.id in linux)) {
    itNative(
      `PLT-013 the M1 scene ${entry.id} keeps its sceneHashes.json hash`,
      async () => {
        const result = await runSceneCheck(resolve(import.meta.dir, '../../..', entry.dir), 'native');
        expect(result.problems).toEqual([]);
        if (process.platform === 'linux') expect(result.traceHash).toBe(linux[entry.id]!);
      },
      240_000,
    );
  }
});

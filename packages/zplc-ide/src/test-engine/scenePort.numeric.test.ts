import { describe, expect, it } from 'bun:test';

import type { PlantCore } from '../plant/contracts';
import type { PlantMapV2 } from '../plants/plantMap';
import { exchangeScan } from './scenePort';

const map: PlantMapV2 = {
  schemaVersion: 2,
  target: { scene: 'tank' },
  signals: {
    'valve.pct': {
      direction: 'command',
      type: 'INT',
      point: 'P.Valve',
      range: { raw_min: 0, raw_max: 1000, eng_min: 0, eng_max: 100, unit: '%' },
    },
    'flow.lps': {
      direction: 'command',
      type: 'REAL',
      point: 'P.Flow',
      range: { raw_min: 0, raw_max: 10, eng_min: 0, eng_max: 50, unit: 'L/s' },
    },
    'pump.run': { direction: 'command', type: 'BOOL', point: 'P.Run' },
    'level.m': {
      direction: 'sensor',
      type: 'INT',
      point: 'P.Level',
      range: { raw_min: 0, raw_max: 1000, eng_min: 0, eng_max: 10, unit: 'm' },
    },
    'temp.c': {
      direction: 'sensor',
      type: 'REAL',
      point: 'P.Temp',
      range: { raw_min: 0, raw_max: 10, eng_min: 0, eng_max: 100, unit: 'degC' },
    },
    'eye.detect': { direction: 'sensor', type: 'BOOL', point: 'P.Eye' },
  },
};

function fakeCore(sensed: Record<string, boolean | number>) {
  const applied: Array<Record<string, boolean | number>> = [];
  const core = {
    apply: (commands: Record<string, boolean | number>) => void applied.push({ ...commands }),
    advance: () => undefined,
    sense: () => sensed,
    operate: () => undefined,
  } as unknown as PlantCore;
  return { core, applied };
}

const RAW: Record<string, boolean | number> = { 'P.Valve': 250, 'P.Flow': 5, 'P.Run': true };

describe('exchangeScan with numeric signals', () => {
  it('PLT-017 exchangeScan scales a numeric command and sensor with the map range, the same for any caller', async () => {
    const run = async (read: (point: string) => Promise<boolean | number>) => {
      const plant = fakeCore({ 'level.m': 2.5, 'temp.c': 25, 'eye.detect': true });
      let written: Record<string, boolean | number> = {};
      await exchangeScan({ core: plant.core, map }, read, async (s) => void (written = s), 5, 5);
      return { applied: plant.applied, written };
    };
    // a graded-style caller reads a table, a live-style caller reads memory bytes: both give the same raw values
    const graded = await run(async (point) => RAW[point]!);
    const bytes = new DataView(new Uint8Array(8).buffer);
    bytes.setInt16(0, 250, true);
    bytes.setFloat32(4, 5, true);
    const live = await run(async (point) =>
      point === 'P.Valve' ? bytes.getInt16(0, true) : point === 'P.Flow' ? bytes.getFloat32(4, true) : true,
    );
    expect(live).toEqual(graded);
    expect(graded.applied).toEqual([{ 'valve.pct': 25, 'flow.lps': 25, 'pump.run': true }]);
    expect(graded.written).toEqual({ 'level.m': 250, 'temp.c': 2.5, 'eye.detect': true });
  });

  it('PLT-003 a non-finite REAL command is ignored and the previous command value is kept', async () => {
    const plant = fakeCore({});
    const scan = (flow: number) =>
      exchangeScan(
        { core: plant.core, map },
        async (point) => (point === 'P.Flow' ? flow : 0),
        async () => undefined,
        5,
        5,
      );
    await scan(5);
    await scan(Number.NaN);
    await scan(Number.POSITIVE_INFINITY);
    // the plant records no command for a non-finite value // the plant latches the first
    expect(plant.applied.map((commands) => commands['flow.lps'])).toEqual([25, undefined, undefined] as unknown as number[]);
    expect(plant.applied.map((commands) => commands['valve.pct'])).toEqual([0, 0, 0]); // other commands are still applied
  });

  it('PLT-003 a non-finite sensor value from the plant is not written', async () => {
    const plant = fakeCore({ 'level.m': Number.NaN, 'temp.c': 25 });
    let written: Record<string, boolean | number> = {};
    await exchangeScan(
      { core: plant.core, map },
      async () => 0,
      async (s) => void (written = s),
      5,
      5,
    );
    expect(written).toEqual({ 'temp.c': 2.5 });
  });

  it('PLT-003 saturates at the engineering range of a sensor and the raw range of a command', async () => {
    const plant = fakeCore({ 'level.m': 50, 'temp.c': -5 });
    let written: Record<string, boolean | number> = {};
    await exchangeScan(
      { core: plant.core, map },
      async (point) => (point === 'P.Valve' ? 99999 : 0),
      async (s) => void (written = s),
      5,
      5,
    );
    expect(written).toEqual({ 'level.m': 1000, 'temp.c': 0 });
    expect(plant.applied[0]!['valve.pct']).toBe(100);
  });

  it('LNK-002 a numeric map signal without a range is a located error', async () => {
    const bare: PlantMapV2 = { ...map, signals: { 'valve.pct': { direction: 'command', type: 'INT', point: 'P.Valve' } } };
    expect(
      exchangeScan(
        { core: fakeCore({}).core, map: bare },
        async () => 0,
        async () => undefined,
        5,
        5,
      ),
    ).rejects.toThrow('scene map: valve.pct is a numeric signal and needs its range');
  });

  it('PLT-003 the BOOL behaviour of M1 holds: values pass through unscaled', async () => {
    const boolMap: PlantMapV2 = {
      schemaVersion: 2,
      target: { scene: 'cell' },
      signals: {
        'pump.run': map.signals['pump.run']!,
        'eye.detect': map.signals['eye.detect']!,
      },
    };
    const plant = fakeCore({ 'eye.detect': true });
    let written: Record<string, boolean | number> = {};
    await exchangeScan(
      { core: plant.core, map: boolMap },
      async () => true,
      async (s) => void (written = s),
      5,
      5,
    );
    expect(plant.applied).toEqual([{ 'pump.run': true }]);
    expect(written).toEqual({ 'eye.detect': true });
  });
});

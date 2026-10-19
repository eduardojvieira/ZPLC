import { describe, expect, it } from 'bun:test';

import type { DeclaredInput } from '../runtime/declaredInputs';
import type { DeclaredOutput } from '../runtime/ioMap';
import { createPlantRun } from './plantEngine';
import { createPlantLoop } from './plantLoop';

const output = (name: string) => ({ path: `Tank.${name}`, name } as unknown as DeclaredOutput);
const input = (name: string) => ({ path: `Tank.${name}`, name } as unknown as DeclaredInput);

/** A fake PLC: the program keeps the pump on while LevelLow (until LevelHigh); a scan counter advances with every `scan`. */
function fakePlc() {
  const image = new Map<string, boolean>([['Tank.LevelLow', false], ['Tank.LevelHigh', false], ['Tank.PumpFault', false], ['Tank.Pump', false]]);
  let pump = false;
  const writes: Array<[string, boolean]> = [];
  return {
    writes,
    cycles: 0,
    scan() { if (image.get('Tank.LevelLow')) pump = true; if (image.get('Tank.LevelHigh')) pump = false; image.set('Tank.Pump', pump); this.cycles += 1; },
    read: async (points: ReadonlyArray<{ path: string }>) => new Map(points.map((point) => [point.path, image.get(point.path)!] as const)),
    write: async (point: { path: string }, value: boolean | number) => { image.set(point.path, value as boolean); writes.push([point.path, value as boolean]); },
  };
}

describe('closed-loop plant session (LRN-018)', () => {
  const resolved = {
    reads: { pump: output('Pump') },
    drives: { levelLow: input('LevelLow'), levelHigh: input('LevelHigh'), pumpFault: input('PumpFault') },
    problems: [],
  };

  it('steps the plant once per observed scan, writes only the sensors that changed, and closes the loop with the program', async () => {
    const plc = fakePlc();
    const run = createPlantRun('tank-v1');
    const loop = createPlantLoop({ run, resolved, read: plc.read, write: plc.write, cycles: async () => plc.cycles });
    await loop.poll();
    expect(plc.writes.sort()).toEqual([['Tank.LevelHigh', false], ['Tank.LevelLow', false], ['Tank.PumpFault', false]]);
    plc.writes.length = 0;
    let sawLow = false;
    let sawHigh = false;
    for (let i = 0; i < 400; i += 1) {
      plc.scan();
      await loop.poll();
      sawLow ||= run.sense().levelLow;
      sawHigh ||= run.sense().levelHigh;
    }
    // The level fell to the low mark, the program switched the pump on, the level rose to the high mark, the pump went off.
    expect(sawLow).toBe(true);
    expect(sawHigh).toBe(true);
    expect(run.tickCount).toBe(400);
    for (const path of ['Tank.LevelLow', 'Tank.LevelHigh']) {
      const values = plc.writes.filter(([p]) => p === path).map(([, value]) => value);
      expect(values.every((value, index) => index === 0 || value !== values[index - 1])).toBe(true);
    }
    expect(new Set(plc.writes.map(([path]) => path))).toEqual(new Set(['Tank.LevelLow', 'Tank.LevelHigh']));
  });

  it('does not step when no scan has run, so the plant follows the program and not the poll rate', async () => {
    const plc = fakePlc();
    const run = createPlantRun('tank-v1');
    const loop = createPlantLoop({ run, resolved, read: plc.read, write: plc.write, cycles: async () => plc.cycles });
    await loop.poll();
    await loop.poll();
    await loop.poll();
    expect(run.tickCount).toBe(0);
    plc.scan();
    plc.scan();
    await loop.poll();
    expect(run.tickCount).toBe(2);
  });

  it('holds the plant while paused, advances exactly one scan on step, and a fault action reaches the program input', async () => {
    const plc = fakePlc();
    const run = createPlantRun('tank-v1');
    const loop = createPlantLoop({ run, resolved, read: plc.read, write: plc.write, cycles: async () => plc.cycles });
    await loop.poll();
    run.setPaused(true);
    plc.scan(); plc.scan(); plc.scan();
    await loop.poll();
    expect(run.tickCount).toBe(0);
    await loop.step();
    expect(run.tickCount).toBe(1);
    run.act('pumpFault');
    await loop.step();
    expect(plc.writes.at(-1)).toEqual(['Tank.PumpFault', true]);
  });
});

import { describe, expect, it } from 'bun:test';

import type { PlantSignal, SignalRange } from '../plants/plantMap';
import type { PlantSignalDef } from './contracts';
import { toEngineering, toRaw, validateScaling, type ScaledSignal } from './scaling';

const range: SignalRange = { raw_min: 0, raw_max: 27648, eng_min: 0, eng_max: 1, unit: 'm' };
const int: ScaledSignal = { type: 'INT', range };
const real: ScaledSignal = { type: 'REAL', range };

describe('PLT-003 scaling of a numeric signal', () => {
  it('PLT-003 an INT raw value converts to engineering units and back with the map range', () => {
    expect(toEngineering(int, 13824)).toBe(0.5);
    expect(toRaw(int, 0.5)).toBe(13824);
  });

  it('PLT-003 an INT conversion rounds half up and stays inside the raw range', () => {
    const half: ScaledSignal = { type: 'INT', range: { raw_min: 0, raw_max: 10, eng_min: 0, eng_max: 1, unit: 'm' } };
    expect(toRaw(half, 0.25)).toBe(3); // 2.5 -> 3
    const neg: ScaledSignal = { type: 'INT', range: { raw_min: -4, raw_max: 4, eng_min: -4, eng_max: 4, unit: 'm' } };
    expect(toRaw(neg, -3.5)).toBe(-3); // -3.5 -> -3, ties toward +infinity
    for (const e of [-5, 0, 0.3, 1, 5]) {
      const raw = toRaw(int, e);
      expect(raw).toBeGreaterThanOrEqual(0);
      expect(raw).toBeLessThanOrEqual(27648);
    }
  });

  it('PLT-003 a REAL raw value is the nearest float32', () => {
    const unity: ScaledSignal = { type: 'REAL', range: { raw_min: 0, raw_max: 1, eng_min: 0, eng_max: 1, unit: 'm' } };
    expect(toRaw(unity, 0.1)).toBe(Math.fround(0.1));
    expect(toRaw(real, 0.5)).toBe(13824);
  });

  it('PLT-003 a value outside its range saturates and never wraps', () => {
    expect(toEngineering(int, 40000)).toBe(1);
    expect(toEngineering(int, -5)).toBe(0);
    expect(toRaw(int, 2)).toBe(27648);
    expect(toRaw(int, -2)).toBe(0);
  });
});

const def: PlantSignalDef = { name: 'Tank1.level', direction: 'sensor', type: 'REAL', unit: 'm', range: { min: 0, max: 1 } };
const sig = (over: Partial<PlantSignal> = {}): PlantSignal => ({
  name: 'Tank1.level',
  direction: 'sensor',
  type: 'INT',
  point: 'Prog.Level',
  range,
  ...over,
});

describe('LNK-002 the map scaling against the part signal', () => {
  it('LNK-002 a map equal to the part range is valid, INT or REAL', () => {
    expect(validateScaling(def, sig())).toEqual([]);
    expect(validateScaling(def, sig({ type: 'REAL' }))).toEqual([]);
  });

  it('LNK-002 validateScaling reports a map whose engineering range differs from the part range', () => {
    expect(validateScaling(def, sig({ range: { ...range, eng_max: 2 } }))).toEqual([
      'plant map.signals.Tank1.level.range.eng_max: 2 differs from the range 1 of the part signal',
    ]);
    expect(validateScaling(def, sig({ range: { ...range, eng_min: -1 } }))).toEqual([
      'plant map.signals.Tank1.level.range.eng_min: -1 differs from the range 0 of the part signal',
    ]);
    expect(validateScaling(def, sig({ range: { ...range, unit: 'cm' } }))).toEqual([
      'plant map.signals.Tank1.level.range.unit: cm differs from the unit m of the part signal',
    ]);
  });

  it('LNK-002 a BOOL part signal with an INT map signal is a located problem', () => {
    const bool: PlantSignalDef = { name: 'Tank1.fill', direction: 'command', type: 'BOOL' };
    const problems = validateScaling(bool, sig({ name: 'Tank1.fill', direction: 'command' }));
    expect(problems).toEqual(['plant map.signals.Tank1.fill.type: the part signal is BOOL, the map says INT']);
    expect(validateScaling(bool, sig({ name: 'Tank1.fill', type: 'BOOL', range: undefined }))).toEqual([]);
  });

  it('LNK-002 a numeric part signal needs a numeric map signal with a range, and the part a range', () => {
    expect(validateScaling(def, sig({ type: 'BOOL', range: undefined }))).toEqual([
      'plant map.signals.Tank1.level.type: the part signal is numeric, the map says BOOL',
    ]);
    expect(validateScaling(def, sig({ range: undefined }))).toEqual([
      'plant map.signals.Tank1.level.range: is required for a numeric signal',
    ]);
    expect(validateScaling({ ...def, range: undefined }, sig())).toEqual(['plant map.signals.Tank1.level: the part signal has no range']);
  });

  it('LNK-002 an INT raw range must fit 16 bits', () => {
    expect(validateScaling(def, sig({ range: { ...range, raw_max: 40000 } }))).toEqual([
      "plant map.signals.Tank1.level.range.raw_max: an INT signal's raw range must fit -32768..32767",
    ]);
  });
});

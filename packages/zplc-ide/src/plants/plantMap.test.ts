import { describe, expect, it } from 'bun:test';

import type { IoMap } from '../runtime/ioMap';
import { normalizePlantMap, plantKindOf, resolvePlantMap, validatePlantMap, type PlantMap } from './plantMap';

const input = (name: string) => ({
  path: `Motor.${name}`,
  pou: 'Motor',
  name,
  type: 'BOOL',
  region: 'IPI' as const,
  address: 0,
  size: 1,
  bitOffset: 0,
});
const output = (name: string) => ({
  path: `Motor.${name}`,
  pou: 'Motor',
  name,
  type: 'BOOL',
  region: 'OPI' as const,
  address: 0,
  size: 1,
  bitOffset: 0,
});
const ioMap = { inputs: [input('Spd')], outputs: [output('Cmd')] } as unknown as IoMap;
const map: PlantMap = { schemaVersion: 1, plant: 'motor-v1', reads: { command: 'Motor.Cmd' }, drives: { atSpeed: 'Motor.Spd' } };

describe('plant mapping (LRN-018, LRN-021)', () => {
  it('accepts a mapping that names every signal of the plant, whatever the program calls its variables', () => {
    expect(validatePlantMap(map)).toEqual([]);
    const resolved = resolvePlantMap(map, ioMap);
    expect(resolved.problems).toEqual([]);
    expect(resolved.reads.command?.name).toBe('Cmd');
    expect(resolved.drives.atSpeed?.name).toBe('Spd');
  });

  it('refuses a mapping with an unknown plant, a missing or an extra signal', () => {
    expect(validatePlantMap({ ...map, plant: 'robot-v1' })).toEqual([expect.stringContaining('plant')]);
    expect(validatePlantMap({ ...map, reads: {} })).toEqual([expect.stringContaining('command')]);
    expect(validatePlantMap({ ...map, drives: { atSpeed: 'Motor.Spd', extra: 'Motor.X' } })).toEqual([expect.stringContaining('extra')]);
    expect(validatePlantMap('nope')).toEqual([expect.stringContaining('object')]);
  });

  it('reports a point the loaded program does not declare, instead of guessing a name', () => {
    const resolved = resolvePlantMap({ ...map, reads: { command: 'Motor.Missing' } }, ioMap);
    expect(resolved.problems).toEqual([expect.stringContaining('Motor.Missing')]);
    expect(resolved.reads.command).toBeUndefined();
  });
});

const rate = { raw_min: 0, raw_max: 1000, eng_min: 0, eng_max: 100, unit: '%' };
const v2: PlantMap = {
  schemaVersion: 2,
  target: { plant: 'motor-v1' },
  signals: {
    command: { direction: 'command', type: 'BOOL', point: 'Motor.Cmd' },
    atSpeed: { direction: 'sensor', type: 'BOOL', point: 'Motor.Spd' },
  },
};
const scene = (signals: unknown) => ({ schemaVersion: 2, target: { scene: 'bottling-line' }, signals });
const level = { direction: 'sensor', type: 'INT', point: 'Motor.Level', range: rate };

describe('typed plant map, schema 2 (LNK-001, PLT-003)', () => {
  it('accepts a map that names a 2.0 plant and a map that names a scene', () => {
    expect(validatePlantMap(v2)).toEqual([]);
    expect(
      validatePlantMap(
        scene({
          level,
          speed: { ...level, type: 'REAL', point: 'Motor.Spd' },
          run: { direction: 'command', type: 'BOOL', point: 'Motor.Cmd' },
        }),
      ),
    ).toEqual([]);
    expect(plantKindOf(v2)).toBe('motor-v1');
    expect(plantKindOf(scene({}) as PlantMap)).toBeUndefined();
  });

  it('normalizes a schema 1 map: every signal is BOOL, reads are commands, drives are sensors', () => {
    expect(normalizePlantMap(map)).toEqual({
      target: { plant: 'motor-v1' },
      signals: [
        { name: 'command', direction: 'command', type: 'BOOL', point: 'Motor.Cmd' },
        { name: 'atSpeed', direction: 'sensor', type: 'BOOL', point: 'Motor.Spd' },
      ],
    });
  });

  it('locates each problem by the path of the field', () => {
    const bad = (signal: unknown) => validatePlantMap(scene({ s: signal }));
    expect(validatePlantMap({ ...v2, target: { plant: 'robot-v1' } })).toEqual([expect.stringContaining('plant map.target.plant')]);
    expect(validatePlantMap({ ...v2, target: { plant: 'motor-v1', scene: 'x' } })).toEqual([expect.stringContaining('plant map.target')]);
    expect(validatePlantMap({ ...v2, target: { scene: '' } })).toEqual([expect.stringContaining('plant map.target.scene')]);
    expect(validatePlantMap({ ...v2, extra: 1 })).toEqual([expect.stringContaining('unknown key "extra"')]);
    expect(validatePlantMap(scene([]))).toEqual([expect.stringContaining('plant map.signals')]);
    expect(bad({ ...level, direction: 'both' })).toEqual([expect.stringContaining('plant map.signals.s.direction')]);
    expect(bad({ ...level, type: 'DINT' })).toEqual([expect.stringContaining('plant map.signals.s.type')]);
    expect(bad({ ...level, point: 'nope' })).toEqual([expect.stringContaining('plant map.signals.s.point')]);
    expect(bad({ direction: 'sensor', type: 'REAL', point: 'Motor.Spd' })).toEqual([expect.stringContaining('plant map.signals.s.range')]);
    expect(bad({ direction: 'sensor', type: 'BOOL', point: 'Motor.Spd', range: rate })).toEqual([
      expect.stringContaining('plant map.signals.s.range'),
    ]);
    expect(bad({ ...level, range: { ...rate, unit: '' } })).toEqual([expect.stringContaining('plant map.signals.s.range.unit')]);
    expect(bad({ ...level, range: { ...rate, eng_max: 'x' } })).toEqual([expect.stringContaining('plant map.signals.s.range.eng_max')]);
    expect(bad({ ...level, range: { ...rate, raw_max: 0 } })).toEqual([expect.stringContaining('plant map.signals.s.range.raw_max')]);
    expect(bad({ ...level, range: { ...rate, raw_max: 40000 } })).toEqual([expect.stringContaining('plant map.signals.s.range.raw_max')]);
  });

  it('checks a 2.0 plant target against the signals of that plant', () => {
    const { atSpeed } = (v2 as { signals: Record<string, unknown> }).signals;
    expect(validatePlantMap({ ...v2, signals: { atSpeed } })).toEqual([expect.stringContaining('"command" is not mapped')]);
    expect(validatePlantMap({ ...v2, signals: { ...(v2 as { signals: object }).signals, extra: atSpeed } })).toEqual([
      expect.stringContaining('plant map.signals.extra'),
    ]);
    expect(validatePlantMap({ ...v2, signals: { command: atSpeed, atSpeed } })).toEqual([
      expect.stringContaining('plant map.signals.command.direction'),
    ]);
    expect(
      validatePlantMap({
        ...v2,
        signals: { command: (v2 as unknown as { signals: { command: object } }).signals.command, atSpeed: { ...level } },
      }),
    ).toEqual([expect.stringContaining('plant map.signals.atSpeed.type')]);
  });

  it('resolves a schema 2 map like a schema 1 map', () => {
    const resolved = resolvePlantMap(v2, ioMap);
    expect(resolved.problems).toEqual([]);
    expect(resolved.reads.command?.name).toBe('Cmd');
    expect(resolved.drives.atSpeed?.name).toBe('Spd');
  });

  it('reports a signal whose type does not fit the program variable, and an unbound one', () => {
    const typed = {
      inputs: [
        { ...input('Lvl'), type: 'REAL' },
        { ...input('Flag'), type: 'BOOL' },
      ],
      outputs: [{ ...output('Cmd'), type: 'INT' }],
    } as unknown as IoMap;
    const m = scene({
      level: { ...level, point: 'Motor.Lvl' },
      flag: { ...level, point: 'Motor.Flag' },
      run: { direction: 'command', type: 'BOOL', point: 'Motor.Cmd' },
      gone: { direction: 'sensor', type: 'BOOL', point: 'Motor.Gone' },
    }) as PlantMap;
    const resolved = resolvePlantMap(m, typed);
    expect(resolved.problems).toEqual([
      'flag: Motor.Flag is BOOL, the signal is INT',
      'run: Motor.Cmd is INT, the signal is BOOL',
      'gone: the program has no input Motor.Gone',
    ]);
    expect(resolved.drives.level?.name).toBe('Lvl');
  });
});

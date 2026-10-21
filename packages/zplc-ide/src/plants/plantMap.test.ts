import { describe, expect, it } from 'bun:test';

import type { IoMap } from '../runtime/ioMap';
import { resolvePlantMap, validatePlantMap, type PlantMap } from './plantMap';

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

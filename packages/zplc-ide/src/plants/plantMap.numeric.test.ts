import { describe, expect, it } from 'bun:test';

import type { IoMap } from '../runtime/ioMap';
import { resolvePlantMap, type PlantMap } from './plantMap';

const variable = (name: string, type: string, region: 'IPI' | 'OPI') => ({
  path: `Prog.${name}`,
  pou: 'Prog',
  name,
  type,
  region,
  address: 0,
  size: type === 'REAL' ? 4 : 2,
  bitOffset: 0,
});
const range = { raw_min: 0, raw_max: 27648, eng_min: 0, eng_max: 1, unit: 'm' };
const level = (type: 'INT' | 'REAL'): PlantMap => ({
  schemaVersion: 2,
  target: { scene: 'tank' },
  signals: { 'Tank1.level': { direction: 'sensor', type, point: 'Prog.Level', range } },
});
const io = (type: string) => ({ inputs: [variable('Level', type, 'IPI')], outputs: [] }) as unknown as IoMap;

describe('LNK-002 the exact type of a numeric signal and its variable', () => {
  it('LNK-002 an INT plant signal is not bound to a REAL program variable', () => {
    const resolved = resolvePlantMap(level('INT'), io('REAL'));
    expect(resolved.problems).toEqual(['Tank1.level: Prog.Level is REAL, the signal is INT']);
    expect(resolved.drives).toEqual({});
  });

  it('LNK-002 a REAL plant signal is not bound to an INT program variable', () => {
    expect(resolvePlantMap(level('REAL'), io('INT')).problems).toEqual(['Tank1.level: Prog.Level is INT, the signal is REAL']);
  });

  it('LNK-002 an INT signal binds an INT variable, a REAL signal a REAL one', () => {
    expect(resolvePlantMap(level('INT'), io('INT')).problems).toEqual([]);
    expect(Object.keys(resolvePlantMap(level('REAL'), io('REAL')).drives)).toEqual(['Tank1.level']);
  });

  it('LNK-001 a schema 1 map of a 2.0 plant resolves exactly as before', () => {
    const bool = (name: string, region: 'IPI' | 'OPI') => ({ ...variable(name, 'BOOL', region), size: 1 });
    const v1: PlantMap = { schemaVersion: 1, plant: 'motor-v1', reads: { command: 'Prog.Cmd' }, drives: { atSpeed: 'Prog.Spd' } };
    const map = { inputs: [bool('Spd', 'IPI')], outputs: [bool('Cmd', 'OPI')] } as unknown as IoMap;
    const resolved = resolvePlantMap(v1, map);
    expect(resolved.problems).toEqual([]);
    expect(Object.keys(resolved.reads)).toEqual(['command']);
    expect(Object.keys(resolved.drives)).toEqual(['atSpeed']);
    expect(resolvePlantMap(v1, { inputs: [variable('Spd', 'INT', 'IPI')], outputs: map.outputs } as unknown as IoMap).problems).toEqual([
      'atSpeed: Prog.Spd is INT, the signal is BOOL',
    ]);
  });
});

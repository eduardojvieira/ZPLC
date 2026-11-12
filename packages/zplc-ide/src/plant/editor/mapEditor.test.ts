import { describe, expect, it } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { compileSingleFileWithTask } from '../../compiler';
import { normalizePlantMap, validatePlantMap, type PlantMap } from '../../plants/plantMap';
import type { IoMap } from '../../runtime/ioMap';
import type { PlantSignalDef } from '../contracts';
import { generateDeclarations } from './declarations';
import { createMapEditor } from './mapEditor';

const signals: PlantSignalDef[] = [
  { name: 'belt1.run', direction: 'command', type: 'BOOL' },
  { name: 'belt1.eye', direction: 'sensor', type: 'BOOL' },
  { name: 'tank.level', direction: 'sensor', type: 'REAL', unit: 'm' },
  { name: 'valve.pos', direction: 'command', type: 'INT' },
];
const out = (path: string, type: string) => ({
  path,
  pou: 'Main',
  name: path.split('.')[1],
  type,
  region: 'OPI' as const,
  address: 0,
  size: 1,
});
const inp = (path: string, type: string) => ({ path, pou: 'Main', name: path.split('.')[1], type }) as unknown as IoMap['inputs'][number];
const io = (outputs: IoMap['outputs'], inputs: IoMap['inputs'] = []): IoMap => ({ outputs, inputs });

describe('plant-map editor', () => {
  it('SCN-012 binding a BOOL signal to an INT point is a located mismatch', () => {
    const ed = createMapEditor(signals, 's');
    expect(ed.bind('belt1.run', 'Main.Speed')).toBeNull();
    const [p] = ed.check(io([out('Main.Speed', 'INT')])).filter((x) => x.path === 'signals.belt1.run');
    expect(p.message).toContain('Main.Speed is INT');
  });

  it('SCN-012 an unbound signal is reported at the signal', () => {
    const ed = createMapEditor(signals, 's');
    ed.bind('belt1.run', 'Main.Run');
    const problems = ed.check(io([out('Main.Run', 'BOOL')]));
    expect(problems.some((p) => p.path === 'signals.belt1.eye' && p.message.includes('not bound'))).toBe(true);
    expect(problems.some((p) => p.path === 'signals.belt1.run')).toBe(false);
  });

  it('SCN-012 INT and REAL points must match exactly and a numeric signal needs its range', () => {
    const ed = createMapEditor(signals, 's');
    ed.bind('tank.level', 'Main.Level');
    const mismatch = ed.check(io([], [inp('Main.Level', 'INT')])).filter((x) => x.path === 'signals.tank.level');
    expect(mismatch.map((p) => p.message).join('|')).toContain('Main.Level is INT, the signal is REAL');
    expect(mismatch.map((p) => p.message).join('|')).toContain('needs its scaling range');
    ed.bind('tank.level', 'Main.Level', { raw_min: 0, raw_max: 100, eng_min: 0, eng_max: 2, unit: 'm' });
    expect(ed.check(io([], [inp('Main.Level', 'REAL')])).filter((x) => x.path === 'signals.tank.level')).toEqual([]);
  });

  it('SCN-012 a bad point is refused at bind', () => {
    expect(createMapEditor(signals, 's').bind('belt1.run', 'nope')?.path).toBe('signals.belt1.run');
    expect(createMapEditor(signals, 's').bind('ghost', 'A.B')?.path).toBe('signals.ghost');
  });

  it('LNK-002 no signal is bound by guessing a name', () => {
    const ed = createMapEditor(signals, 's');
    const ioMap = io([out('Main.belt1_run', 'BOOL'), out('Main.belt1run', 'BOOL')], [inp('Main.belt1_eye', 'BOOL')]);
    expect(ed.map().signals).toEqual({});
    expect(ed.check(ioMap).filter((p) => p.message.includes('not bound')).length).toBe(4);
    ed.bind('belt1.run', 'Main.belt1run');
    expect(ed.map().signals['belt1.run']?.point).toBe('Main.belt1run');
    expect(Object.keys(ed.map().signals)).toEqual(['belt1.run']);
    ed.unbind('belt1.run');
    expect(ed.map().signals).toEqual({});
  });

  it('LNK-001 a 2.0 map (schema 1) loads and keeps loading', () => {
    const root = join(import.meta.dir, '../../../lessons');
    let seen = 0;
    for (const dir of readdirSync(root)) {
      let raw: string;
      try {
        raw = readFileSync(join(root, dir, 'plant-map.json'), 'utf8');
      } catch {
        continue;
      }
      const v1 = JSON.parse(raw) as PlantMap;
      expect(validatePlantMap(v1)).toEqual([]);
      const typed = normalizePlantMap(v1).signals;
      const ed = createMapEditor(typed, 'lesson');
      ed.load(v1);
      const v2 = ed.map();
      expect(v2.schemaVersion).toBe(2);
      expect(Object.values(v2.signals).map((s) => s.point)).toEqual(typed.map((s) => s.point));
      const ioMap = io(
        typed.filter((s) => s.direction === 'command').map((s) => out(s.point, 'BOOL')),
        typed.filter((s) => s.direction === 'sensor').map((s) => inp(s.point, 'BOOL')),
      );
      expect(ed.check(ioMap)).toEqual([]);
      ed.load(v2);
      expect(ed.map()).toEqual(v2);
      seen++;
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('LNK-001 an entry for a signal the scene lacks is kept out of the map and reported', () => {
    const ed = createMapEditor(signals, 's');
    ed.load({ schemaVersion: 1, plant: 'tank-v1', reads: { ghost: 'A.B' }, drives: {} });
    expect(Object.keys(ed.map().signals)).toEqual([]);
    expect(ed.check(io([])).some((p) => p.path === 'signals.ghost')).toBe(true);
  });
});

describe('generated declarations', () => {
  it('SCN-013 a REAL signal declares REAL, an INT signal INT', () => {
    const text = generateDeclarations(signals, 'st');
    expect(text).toContain('tank_level : REAL;');
    expect(text).toContain('valve_pos : INT;');
    expect(text).toContain('belt1_eye : BOOL;');
    expect(text.indexOf('VAR_INPUT')).toBeLessThan(text.indexOf('belt1_eye'));
    expect(text.indexOf('VAR_OUTPUT')).toBeLessThan(text.indexOf('belt1_run'));
  });

  it('SCN-013 names that collapse to one identifier stay distinct', () => {
    const text = generateDeclarations(
      [
        { name: 'a.b', direction: 'sensor', type: 'BOOL' },
        { name: 'a_b', direction: 'sensor', type: 'BOOL' },
      ],
      'st',
    );
    expect(text).toContain('a_b : BOOL;');
    expect(text).toContain('a_b_2 : BOOL;');
  });

  it('SCN-013 the generated declarations compile', () => {
    const source = `PROGRAM Main\n${generateDeclarations(signals, 'st')}\nEND_PROGRAM`;
    const built = compileSingleFileWithTask(source, 'ST', { programName: 'Main', sourceRef: 'src/main.st' });
    expect(built.bytecode.length).toBeGreaterThan(0);
  });
});

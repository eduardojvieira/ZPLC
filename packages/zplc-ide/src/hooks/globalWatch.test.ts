import { describe, expect, it } from 'bun:test';

import { buildDebugWatchRows } from '../components/debugWatchRows';
import { compileMultiTaskProject, type DebugMap } from '../compiler';
import { buildPolledDebugPaths, describePolledDebugVariable } from './debugPollingPaths';

// A global that one file declares and two programs use: the map lists it once, in the POU of its file, and a
// watch or a poll of it has to read the address of that one location (CMP-042).

const build = (): DebugMap => compileMultiTaskProject(
  {
    name: 'Watch', version: '1.0.0',
    tasks: [
      { name: 'A', trigger: 'cyclic', interval_ms: 10, priority: 0, programs: ['a.st'] },
      { name: 'B', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['b.st'] },
    ],
  },
  [
    { name: 'a.st', language: 'ST', sourceRef: 'src/a.st', content: 'PROGRAM A\nVAR own : INT; END_VAR\n  Total := Total + 1;\n  own := Total;\nEND_PROGRAM\n' },
    { name: 'b.st', language: 'ST', sourceRef: 'src/b.st', content: 'PROGRAM B\nVAR other : DINT; END_VAR\n  other := Total + Limit;\nEND_PROGRAM\n' },
    { name: 'globals.st', language: 'ST', sourceRef: 'src/globals.st', content: 'VAR_GLOBAL\n  Total : INT;\n  Limit : DINT := 50;\n  Trip AT %IX0.3 : BOOL;\nEND_VAR\n' },
  ],
).debugMap;

describe('a global in the debug map of a project of several files', () => {
  it('is listed once, and the descriptor a poll uses has its address, type and region', () => {
    const map = build();
    const listed = Object.values(map.pou).filter((pou) => pou.vars.Total !== undefined);
    expect(listed).toHaveLength(1);
    const where = map.pou['globals.st']!.vars.Total!;
    expect(describePolledDebugVariable(map, 'Total')).toMatchObject({ name: 'Total', address: where.addr, type: 'INT', forceable: false });
    // the programs' own variables sit elsewhere in the same layout
    const addresses = [map.pou.A!.vars.own!.addr, map.pou.B!.vars.other!.addr, where.addr, map.pou['globals.st']!.vars.Limit!.addr];
    expect(new Set(addresses).size).toBe(4);
  });

  it('is a forceable input when it is located in the input image', () => {
    const map = build();
    expect(describePolledDebugVariable(map, 'Trip')).toMatchObject({ address: 0, type: 'BOOL', forceable: true, bitOffset: 3 });
  });

  it('is polled once by the live preview, whichever program uses it', () => {
    const paths = buildPolledDebugPaths(['Total'], build(), true);
    expect(paths.filter((path) => path === 'Total')).toHaveLength(1);
    expect(paths).toEqual(expect.arrayContaining(['own', 'other', 'Limit', 'Trip']));
  });

  it('is a row of the watch table at the address the map gives it', () => {
    const map = build();
    const rows = buildDebugWatchRows(['Total', 'Limit', 'own'], map, new Map([['Total', 7]]), new Map(), true);
    expect(rows.map((row) => [row.path, row.result.exists, row.result.address, row.result.type, row.result.region]))
      .toEqual([
        ['Total', true, map.pou['globals.st']!.vars.Total!.addr, 'INT', 'WORK'],
        ['Limit', true, map.pou['globals.st']!.vars.Limit!.addr, 'DINT', 'WORK'],
        ['own', true, map.pou.A!.vars.own!.addr, 'INT', 'WORK'],
      ]);
    expect(rows[0]!.result.value).toBe(7);
  });
});

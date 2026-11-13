import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import type { ZPLCProjectConfig } from '../types';
import { buildProjectIndex } from '../langsvc/projectIndex';
import { buildReferenceIndex, type ReferenceInput } from './referenceIndex';
import { REFERENCE_LIMITS, type Language, type RefTarget } from './contracts';
import { parseAddress } from './addresses';

const project = (path: string): string => readFileSync(new URL(`../../projects/${path}`, import.meta.url), 'utf8');
type Model = { variables: { inputs: Array<{ name: string; type: string; address?: string }> } };
/** A bundled diagram with `from` renamed to `Start` and left undeclared, so that the name resolves to the global. */
function undeclared(path: string, from: string): string {
  const model = JSON.parse(project(path).replaceAll(from, 'Start')) as Model;
  model.variables.inputs = model.variables.inputs.filter((row) => row.name !== 'Start');
  return JSON.stringify(model);
}

const GLOBALS = 'VAR_GLOBAL\n  Lamp : BOOL;\n  Start AT %IX0.0 : BOOL;\nEND_VAR\n';
const MAIN = `FUNCTION_BLOCK Delay
VAR_OUTPUT Q : BOOL; END_VAR
END_FUNCTION_BLOCK

PROGRAM Main
VAR
  Delay1 : Delay;
  Count : INT;
END_VAR
Delay1();
Lamp := Start AND Delay1.Q;
Count := Count + 1;
END_PROGRAM
`;
const OTHER = 'PROGRAM Other\nVAR\n  Count : INT;\nEND_VAR\nCount := 2;\nEND_PROGRAM\n';
const IL = 'PROGRAM Il\nVAR\n  Mine : BOOL;\nEND_VAR\n  LD Start\n  ST Lamp\n  LD Mine\n';
const SCENARIO = JSON.stringify({
  id: 'S',
  events: [{ atMs: 0, set: { 'Main.Start': true } }],
  expectations: [{ kind: 'AT', atMs: 0, condition: { 'Main.Count': true } }],
});
const CONFIG = {
  io: { inputs: [{ name: 'Start', address: '%I0.0' }], outputs: [{ name: 'Lamp', address: '%Q0.0' }] },
} as unknown as ZPLCProjectConfig;

function input(over: Partial<{ st: Array<[string, string]>; files: ReferenceInput['files']; config: ZPLCProjectConfig | null }> = {}) {
  const st = over.st ?? [
    ['src/globals.st', GLOBALS],
    ['src/main.st', MAIN],
    ['src/other.st', OTHER],
  ];
  const ladder = JSON.parse(undeclared('seal_in_ladder/src/SealIn.ld.json', 'StartPB')) as Model;
  ladder.variables.inputs.push({ name: 'Btn', type: 'BOOL', address: '%IX0.0' });
  const files: ReferenceInput['files'] = over.files ?? [
    { path: 'src/SealIn.ld.json', language: 'LD', content: JSON.stringify(ladder) },
    { path: 'src/BatchCount.fbd.json', language: 'FBD', content: undeclared('batch_count_fbd/src/BatchCount.fbd.json', 'PartSensor') },
    { path: 'src/PressCell.sfc.json', language: 'SFC', content: undeclared('sfc_press_cell/src/PressCell.sfc.json', 'Start') },
    { path: 'src/il.il', language: 'IL', content: IL },
  ];
  return {
    st: buildProjectIndex(st.map(([path, content]) => ({ path, content }))),
    files,
    config: over.config === undefined ? CONFIG : over.config,
    watch: ['Main.Start'],
    scenarios: [{ path: 'tests/s.scenario.json', content: SCENARIO }],
  } satisfies ReferenceInput;
}
const start: RefTarget = { kind: 'symbol', scope: '', name: 'Start' };
const languages = (uses: ReadonlyArray<{ language: Language }>): Language[] => [...new Set(uses.map((u) => u.language))].sort();

describe('the reference index', () => {
  test('FND-004 all references of a variable list its uses in the five languages', () => {
    const refs = buildReferenceIndex(input()).referencesOf(start);
    expect(refs.definition).toMatchObject({ language: 'ST', role: 'declaration', text: 'Start' });
    expect(languages(refs.uses)).toEqual(['FBD', 'IL', 'IO', 'LD', 'SCENARIO', 'SFC', 'ST', 'WATCH']);
    expect(refs.uses.filter((u) => u.language === 'IL')).toHaveLength(1);
    expect(refs.broken).toEqual([]);
    expect(refs.truncated).toBe(false);
  });

  test('FND-004 a variable local to one program is not a use of a same-named variable of another', () => {
    const index = buildReferenceIndex(input());
    const main = index.referencesOf({ kind: 'symbol', scope: 'src/main.st#Main', name: 'Count' });
    const other = index.referencesOf({ kind: 'symbol', scope: 'src/other.st#Other', name: 'Count' });
    const textual = (refs: typeof main) => [refs.definition, ...refs.uses].filter((o) => o?.place.kind === 'text');
    expect(textual(main).every((o) => o?.place.kind === 'text' && o.place.file === 'src/main.st')).toBe(true);
    expect(textual(main)).toHaveLength(3);
    expect(textual(other).every((o) => o?.place.kind === 'text' && o.place.file === 'src/other.st')).toBe(true);
    expect(textual(other)).toHaveLength(2);
    // the scenario condition `Main.Count` is a use of the local of Main, and of no other
    expect(main.uses.some((u) => u.language === 'SCENARIO')).toBe(true);
    expect(other.uses.some((u) => u.language === 'SCENARIO')).toBe(false);
  });

  test('FND-004 a global is found from a diagram that does not declare it', () => {
    const refs = buildReferenceIndex(input()).referencesOf(start);
    const ladder = refs.uses.find((u) => u.language === 'LD');
    expect(ladder?.place).toMatchObject({ kind: 'element', file: 'src/SealIn.ld.json' });
    // a name the diagram declares is its own: the global is not one of its uses
    const own = buildReferenceIndex(input()).referencesOf({ kind: 'symbol', scope: 'src/SealIn.ld.json', name: 'Motor' });
    expect(own.definition?.place).toMatchObject({ kind: 'table', section: 'outputs', name: 'Motor' });
    expect(own.uses.length).toBeGreaterThan(0);
  });

  test('FND-004 a function block instance lists its member accesses', () => {
    const refs = buildReferenceIndex(input()).referencesOf({ kind: 'symbol', scope: 'src/main.st#Main', name: 'Delay1' });
    expect(refs.definition?.role).toBe('declaration');
    // `Delay1();` and `Delay1.Q`
    expect(refs.uses.map((u) => u.place.kind === 'text' && u.place.line).sort()).toEqual([10, 11]);
  });

  test('FND-004 an I/O address lists the AT clause, the diagram table row and the zplc.json row, in the two notations', () => {
    const index = buildReferenceIndex(input());
    const point: RefTarget = { kind: 'address', address: parseAddress('%I0.0')! };
    const refs = index.referencesOf(point);
    const all = [refs.definition!, ...refs.uses];
    expect(all.map((o) => o.language)).toEqual(['ST', 'LD', 'IO']);
    expect(all.map((o) => o.text)).toEqual(['%IX0.0', '%IX0.0', '%I0.0']);
    expect(all[2]!.place).toEqual({ kind: 'config', editor: 'io', row: 'inputs[0]' });
    // %IB0 is another point and an output is not an input
    expect(index.referencesOf({ kind: 'address', address: parseAddress('%IB0')! }).uses).toEqual([]);
    const out = index.referencesOf({ kind: 'address', address: parseAddress('%Q0.0')! });
    expect([out.definition, ...out.uses].every((o) => o?.text === '%Q0.0')).toBe(true);
  });

  test('FND-004 the definition is the ST declaration before a diagram table row before a zplc.json row', () => {
    const point: RefTarget = { kind: 'address', address: parseAddress('%IX0.0')! };
    const base = input();
    const without = (path: string) => base.files.filter((f) => f.path !== path);
    expect(buildReferenceIndex(base).referencesOf(point).definition?.language).toBe('ST');
    const noSt = input({ st: [['src/main.st', MAIN]] });
    expect(buildReferenceIndex(noSt).referencesOf(point).definition?.language).toBe('LD');
    const onlyConfig = input({ st: [['src/main.st', MAIN]], files: without('src/SealIn.ld.json') });
    expect(buildReferenceIndex(onlyConfig).referencesOf(point).definition?.language).toBe('IO');
    expect(buildReferenceIndex(input({ config: null, st: [], files: [] })).referencesOf(point).definition).toBeUndefined();
  });

  test('FND-004 a zplc.json row is a use of the symbol only when a symbol of that name has that address', () => {
    const refs = buildReferenceIndex(input()).referencesOf(start);
    expect(refs.uses.some((u) => u.language === 'IO')).toBe(true);
    const lamp = buildReferenceIndex(input()).referencesOf({ kind: 'symbol', scope: '', name: 'Lamp' });
    expect(lamp.uses.some((u) => u.language === 'IO')).toBe(false);
  });

  test('FND-005 the watch table and a scenario are references', () => {
    const refs = buildReferenceIndex(input()).referencesOf(start);
    expect(refs.uses.find((u) => u.language === 'WATCH')?.place).toEqual({ kind: 'watch', path: 'Main.Start' });
    expect(refs.uses.find((u) => u.language === 'SCENARIO')?.place).toEqual({
      kind: 'scenario',
      file: 'tests/s.scenario.json',
      pointer: '/events/0/set/Main.Start',
    });
    const count = buildReferenceIndex(input()).referencesOf({ kind: 'symbol', scope: 'src/main.st#Main', name: 'Count' });
    expect(count.uses.find((u) => u.language === 'SCENARIO')?.place).toMatchObject({
      pointer: '/expectations/0/condition/Main.Count',
    });
  });

  test('FND-004 targetAt gives the target of a text position, an element, a table row and a config row', () => {
    const index = buildReferenceIndex(input());
    // `Lamp := Start AND ...` is line 11, `Start` at column 9
    expect(index.targetAt({ kind: 'text', file: 'src/main.st', line: 11, column: 10, length: 5 })).toEqual(start);
    expect(index.targetAt({ kind: 'text', file: 'src/main.st', line: 2, column: 1, length: 1 })).toBeUndefined();
    expect(index.targetAt({ kind: 'text', file: 'src/globals.st', line: 3, column: 14, length: 6 })).toEqual({
      kind: 'address',
      address: parseAddress('%I0.0')!,
    });
    expect(index.targetAt({ kind: 'text', file: 'src/il.il', line: 5, column: 6, length: 5 })).toEqual(start);
    expect(index.targetAt({ kind: 'table', file: 'src/SealIn.ld.json', section: 'outputs', name: 'Motor' })).toEqual({
      kind: 'symbol',
      scope: 'src/SealIn.ld.json',
      name: 'Motor',
    });
    expect(index.targetAt({ kind: 'config', editor: 'io', row: 'inputs[0]' })).toEqual({
      kind: 'address',
      address: parseAddress('%I0.0')!,
    });
    expect(index.targetAt({ kind: 'watch', path: 'Main.Start' })).toEqual(start);
    const contact = { kind: 'element', file: 'src/SealIn.ld.json', element: 'rung:rung_1/cell:0,1', field: 'variable' } as const;
    expect(index.targetAt(contact)).toEqual(start);
    expect(index.namesOfElement(contact.file, contact.element)).toEqual(['Start']);
    expect(index.namesOfElement(contact.file, 'rung:nope')).toEqual([]);
  });

  test('FND-004 a broken file is listed in broken and the rest is still answered', () => {
    const files = [...input().files, { path: 'src/Bad.ld.json', language: 'LD' as const, content: '{ not json' }];
    const refs = buildReferenceIndex(
      input({
        files,
        st: [
          ['src/globals.st', GLOBALS],
          ['src/bad.st', 'PROGRAM Bad VAR ((( END_PROGRAM'],
        ],
      }),
    ).referencesOf(start);
    expect(refs.broken.sort()).toEqual(['src/Bad.ld.json', 'src/bad.st']);
    expect(refs.definition?.language).toBe('ST');
    expect(languages(refs.uses)).toContain('LD');
  });

  test('FND-004 results stop at the limit and say truncated', () => {
    const lines = Array.from({ length: 150 }, () => 'Count := Count + 1;').join('\n');
    const big = (name: string) => `PROGRAM ${name}\nVAR\n  Count : INT;\nEND_VAR\n${lines}\nEND_PROGRAM\n`;
    const one = buildReferenceIndex(input({ st: [['src/a.st', big('A')]], files: [], config: null }));
    const a = one.referencesOf({ kind: 'symbol', scope: 'src/a.st#A', name: 'Count' });
    expect(a.uses).toHaveLength(REFERENCE_LIMITS.perFile);
    expect(a.truncated).toBe(true);
    const manyFiles = Array.from(
      { length: 8 },
      (_, i) => [`src/g${i}.st`, `PROGRAM G${i}\n${'Lamp := TRUE;\n'.repeat(90)}END_PROGRAM\n`] as [string, string],
    );
    const global = buildReferenceIndex(input({ st: [['src/globals.st', GLOBALS], ...manyFiles], files: [], config: null }));
    const lamp = global.referencesOf({ kind: 'symbol', scope: '', name: 'Lamp' });
    expect(lamp.uses).toHaveLength(REFERENCE_LIMITS.occurrences);
    expect(lamp.truncated).toBe(true);
  });
});

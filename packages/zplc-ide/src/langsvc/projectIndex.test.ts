// LNG-015: definition, references and hover across the files of a project, and LNG-016's rename, on the index of the
// project (`projectIndex.ts`): names are resolved by scope and by type, never matched as text.
import { describe, expect, it } from 'bun:test';
import { buildProjectIndex } from './projectIndex';

const TYPES = `TYPE Color : (Red, Green, Blue); END_TYPE
TYPE Pair : STRUCT
  A : INT;
  B : BOOL;
END_STRUCT END_TYPE
VAR_GLOBAL
  Shared : INT;
  Mode : Color;
END_VAR
`;

const LIB = `FUNCTION Twice : INT
VAR_INPUT
  X : INT;
END_VAR
  Twice := X * 2;
END_FUNCTION

FUNCTION_BLOCK Motor
VAR_INPUT
  Start : BOOL;
END_VAR
VAR_OUTPUT
  Running : BOOL;
END_VAR
VAR
  Count : INT;
END_VAR
  Running := Start;
  Count := Count + 1;
END_FUNCTION_BLOCK

FUNCTION_BLOCK Pump EXTENDS Motor
VAR_INPUT
  Boost : BOOL;
END_VAR
METHOD Reset : BOOL
VAR_INPUT
  Force : BOOL;
END_VAR
  Reset := Force;
  Count := 0;
END_METHOD
  Running := Start AND Boost;
END_FUNCTION_BLOCK
`;

const MAIN = `PROGRAM Main
VAR
  M : Motor;
  P : Pump;
  Pr : Pair;
  Pairs : ARRAY[0..3] OF Pair;
  T : TON;
  Count : INT;
  Local : BOOL;
END_VAR
  M(Start := Local);
  P(Start := TRUE, Boost := Local);
  Count := Twice(X := Shared);
  Local := M.Running AND P.Running;
  Pr.A := Count;
  Pairs[1].B := Local;
  T(IN := Local, PT := T#1s);
  Local := T.Q;
  IF Mode = Red THEN Count := 0; END_IF;
  Local := P.Reset(Force := FALSE);
END_PROGRAM
`;

const OTHER = `PROGRAM Other
VAR
  Count : DINT;
  Local : BOOL;
END_VAR
  Count := Count + 1;
  Local := FALSE;
END_PROGRAM
`;

const project = [
  { path: 'src/types.st', content: TYPES },
  { path: 'src/lib/blocks.st', content: LIB },
  { path: 'src/main.st', content: MAIN },
  { path: 'src/other.st', content: OTHER },
];

const at = (file: string, text: string, nth = 1): { line: number; column: number } => {
  const content = project.find((entry) => entry.path === file)!.content;
  let from = -1;
  for (let count = 0; count < nth; count++) from = content.indexOf(text, from + 1);
  expect(from).toBeGreaterThanOrEqual(0);
  const before = content.slice(0, from);
  return { line: before.split('\n').length, column: from - before.lastIndexOf('\n') };
};

describe('the index of a project resolves names by scope (LNG-015)', () => {
  const index = buildProjectIndex(project);

  it('reads every file and none is broken', () => {
    expect(index.broken).toEqual([]);
    expect([...index.files.keys()]).toEqual(project.map((file) => file.path));
  });

  it('finds the definition of a block in another file', () => {
    const use = at('src/main.st', 'Motor;');
    const reference = index.referenceAt('src/main.st', use.line, use.column)!;
    const symbol = index.symbol(reference.symbol)!;
    expect(symbol).toMatchObject({ name: 'Motor', kind: 'functionBlock', file: 'src/lib/blocks.st' });
    expect(symbol.line).toBe(8);
  });

  it('finds a global of another file, and the type of a variable declared as an enumeration', () => {
    const use = at('src/main.st', 'Shared');
    expect(index.symbol(index.referenceAt('src/main.st', use.line, use.column)!.symbol)).toMatchObject({
      name: 'Shared',
      kind: 'global',
      file: 'src/types.st',
    });
    const value = at('src/main.st', 'Red');
    expect(index.symbol(index.referenceAt('src/main.st', value.line, value.column)!.symbol)).toMatchObject({
      name: 'Red',
      kind: 'enumValue',
    });
  });

  it('resolves a member by the type of what is before the dot, through the base block', () => {
    const running = at('src/main.st', 'P.Running');
    const member = index.referenceAt('src/main.st', running.line, running.column + 2)!;
    expect(index.symbol(member.symbol)).toMatchObject({ name: 'Running', kind: 'output', file: 'src/lib/blocks.st', line: 13 });
    const method = at('src/main.st', 'P.Reset');
    expect(index.symbol(index.referenceAt('src/main.st', method.line, method.column + 2)!.symbol)).toMatchObject({
      name: 'Reset',
      kind: 'method',
    });
  });

  it('resolves a field of a structure and of an element of an array of structures', () => {
    const field = at('src/main.st', 'Pr.A');
    expect(index.symbol(index.referenceAt('src/main.st', field.line, field.column + 3)!.symbol)).toMatchObject({
      name: 'A',
      kind: 'field',
      file: 'src/types.st',
      line: 3,
    });
    const element = at('src/main.st', 'Pairs[1].B');
    expect(index.symbol(index.referenceAt('src/main.st', element.line, element.column + 9)!.symbol)).toMatchObject({
      name: 'B',
      kind: 'field',
    });
  });

  it('resolves the name of an argument to the parameter of the callee', () => {
    const argument = at('src/main.st', 'Boost :=');
    const reference = index.referenceAt('src/main.st', argument.line, argument.column)!;
    expect(reference.label).toBe(true);
    expect(index.symbol(reference.symbol)).toMatchObject({ name: 'Boost', kind: 'input', container: index.declaration('Pump')!.id });
    const twice = at('src/main.st', 'X := Shared');
    expect(index.symbol(index.referenceAt('src/main.st', twice.line, twice.column)!.symbol)).toMatchObject({
      name: 'X',
      file: 'src/lib/blocks.st',
    });
  });

  it('resolves a member of a standard block to the library, and has no symbol of the project for it', () => {
    const q = at('src/main.st', 'T.Q');
    const reference = index.referenceAt('src/main.st', q.line, q.column + 2)!;
    expect(reference.symbol).toBe(-1);
    expect(reference.builtin).toMatchObject({ kind: 'member', owner: 'TON', name: 'Q' });
  });

  it('keeps a variable of one program apart from a variable of the same name in another', () => {
    const own = at('src/main.st', 'Count := Twice');
    const symbol = index.symbol(index.referenceAt('src/main.st', own.line, own.column)!.symbol)!;
    expect(symbol).toMatchObject({ name: 'Count', file: 'src/main.st', container: index.declaration('Main')!.id });
    const uses = index.referencesTo(symbol.id).map((reference) => reference.file);
    expect(uses.every((file) => file === 'src/main.st')).toBe(true);
    expect(uses).toHaveLength(4);
  });

  it('keeps the variable of a block apart from the one of the program that has the same name', () => {
    const inBlock = at('src/lib/blocks.st', 'Count := Count');
    const symbol = index.symbol(index.referenceAt('src/lib/blocks.st', inBlock.line, inBlock.column)!.symbol)!;
    expect(symbol).toMatchObject({ name: 'Count', container: index.declaration('Motor')!.id });
    // the method of the derived block reads the base block's variable
    const inMethod = at('src/lib/blocks.st', 'Count := 0');
    expect(index.referenceAt('src/lib/blocks.st', inMethod.line, inMethod.column)!.symbol).toBe(symbol.id);
    expect(index.referencesTo(symbol.id)).toHaveLength(4);
  });

  it('lists the references of a function across files, and the declaration with them', () => {
    const twice = index.declaration('Twice')!;
    const all = index.referencesTo(twice.id);
    expect(all.map((reference) => `${reference.file}:${reference.line}:${reference.declaration ? 'decl' : 'use'}`)).toEqual([
      'src/lib/blocks.st:1:decl',
      'src/lib/blocks.st:5:use',
      'src/main.st:13:use',
    ]);
    expect(index.referencesTo(twice.id, false)).toHaveLength(2);
  });

  it('says which program, function, block or method a position is in', () => {
    const inMethod = at('src/lib/blocks.st', 'Reset := Force');
    expect(index.symbol(index.scopeAt('src/lib/blocks.st', inMethod.line, inMethod.column))).toMatchObject({
      name: 'Reset',
      kind: 'method',
    });
    const inBlock = at('src/lib/blocks.st', 'Running := Start AND');
    expect(index.symbol(index.scopeAt('src/lib/blocks.st', inBlock.line, inBlock.column))).toMatchObject({ name: 'Pump' });
  });
});

describe('a file that does not parse is listed, and what its tokens declare is still there', () => {
  it('lists it as broken, and keeps its declarations for the files that use them', () => {
    const index = buildProjectIndex([
      project[0]!,
      { path: 'src/lib/blocks.st', content: LIB.replace('Running := Start;', 'Running := ;') },
      project[2]!,
    ]);
    expect(index.broken).toEqual(['src/lib/blocks.st']);
    expect(index.files.get('src/lib/blocks.st')!.ok).toBe(false);
    const use = at('src/main.st', 'Motor;');
    expect(index.symbol(index.referenceAt('src/main.st', use.line, use.column)!.symbol)).toMatchObject({
      name: 'Motor',
      kind: 'functionBlock',
    });
  });

  it('does not take a statement of an unfinished declaration block for a declaration', () => {
    const half = `PROGRAM Half\nVAR\n  Done : BOOL;\n  Pending := 1;\n`;
    const index = buildProjectIndex([{ path: 'src/half.st', content: half }]);
    expect(index.symbols.map((symbol) => symbol.name)).toEqual(['Half', 'Done']);
  });
});

// LNG-015 / LNG-016: hover, completion, signature help and outline answered from the index of the project.
import { describe, expect, it } from 'bun:test';
import { buildProjectIndex } from './projectIndex';
import { completionsAt, hoverAt, outlineOf, projectOutline, signatureAt } from './assist';

const TYPES = `TYPE Pair : STRUCT
  A : INT;
  B : BOOL;
END_STRUCT END_TYPE
TYPE Color : (Red, Green);
END_TYPE
VAR_GLOBAL
  Shared : INT;
END_VAR
`;

const LIB = `FUNCTION Twice : INT
VAR_INPUT
  X : INT;
  Gain : REAL;
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
  Running := Start;
END_FUNCTION_BLOCK
`;

const withBuffer = (buffer: string) =>
  buildProjectIndex([
    { path: 'src/types.st', content: TYPES },
    { path: 'src/lib/blocks.st', content: LIB },
    { path: 'src/main.st', content: buffer },
  ]);

const PREAMBLE = `PROGRAM Main
VAR
  M : Motor;
  Pr : Pair;
  Pairs : ARRAY[0..2] OF Pair;
  T : TON;
  Count : INT;
END_VAR
`;

/** The position just after `marker` in `buffer`, where the cursor is for a completion. */
const after = (buffer: string, marker: string): { line: number; column: number } => {
  const at = buffer.indexOf(marker);
  expect(at).toBeGreaterThanOrEqual(0);
  const end = at + marker.length;
  const before = buffer.slice(0, end);
  return { line: before.split('\n').length, column: end - before.lastIndexOf('\n') };
};

const labels = (items: Array<{ label: string }>): string[] => items.map((item) => item.label);

describe('completion in a buffer that is being typed (LNG-015)', () => {
  it('offers the members of a block of another file after a dot, with the buffer not parsing', () => {
    const buffer = `${PREAMBLE}  M.\nEND_PROGRAM\n`;
    const cursor = after(buffer, '  M.');
    const items = completionsAt(withBuffer(buffer), 'src/main.st', cursor.line, cursor.column, buffer);
    expect(labels(items)).toEqual(['Running', 'Start']);
  });

  it('offers the fields of a structure, and of an element of an array of structures', () => {
    for (const written of ['Pr.', 'Pairs[1].']) {
      const buffer = `${PREAMBLE}  ${written}\nEND_PROGRAM\n`;
      const cursor = after(buffer, `  ${written}`);
      expect(labels(completionsAt(withBuffer(buffer), 'src/main.st', cursor.line, cursor.column, buffer))).toEqual(['A', 'B']);
    }
  });

  it('offers the members of a standard block', () => {
    const buffer = `${PREAMBLE}  T.\nEND_PROGRAM\n`;
    const cursor = after(buffer, '  T.');
    const names = labels(completionsAt(withBuffer(buffer), 'src/main.st', cursor.line, cursor.column, buffer));
    expect(names).toContain('Q');
    expect(names).toContain('ET');
  });

  it('offers the variables of this program, the globals and the blocks and functions of every file, and not another program', () => {
    const buffer = `${PREAMBLE}  Count := \nEND_PROGRAM\n\nPROGRAM Second\nVAR\n  Hidden : BOOL;\nEND_VAR\nEND_PROGRAM\n`;
    const cursor = after(buffer, '  Count := ');
    const names = labels(completionsAt(withBuffer(buffer), 'src/main.st', cursor.line, cursor.column, buffer));
    for (const expected of ['Count', 'M', 'Shared', 'Twice', 'Motor', 'TON', 'ABS']) expect(names).toContain(expected);
    expect(names).not.toContain('Hidden');
    // what is in scope comes before the project, and the project before the library
    expect(names.indexOf('Count')).toBeLessThan(names.indexOf('Twice'));
    expect(names.indexOf('Twice')).toBeLessThan(names.indexOf('ABS'));
  });

  it('offers the types where a type goes', () => {
    const buffer = `PROGRAM Main\nVAR\n  X : \nEND_VAR\nEND_PROGRAM\n`;
    const cursor = after(buffer, '  X : ');
    const names = labels(completionsAt(withBuffer(buffer), 'src/main.st', cursor.line, cursor.column, buffer));
    for (const expected of ['INT', 'BOOL', 'Pair', 'Motor', 'Color', 'TON']) expect(names).toContain(expected);
    expect(names).not.toContain('Twice');
  });

  it('offers the parameters of a function as named arguments inside its call', () => {
    const buffer = `${PREAMBLE}  Count := Twice(\nEND_PROGRAM\n`;
    const cursor = after(buffer, 'Twice(');
    const items = completionsAt(withBuffer(buffer), 'src/main.st', cursor.line, cursor.column, buffer);
    const parameters = items.filter((item) => item.kind === 'parameter');
    expect(parameters.map((item) => item.insertText)).toEqual(['Gain := ', 'X := ']);
  });
});

describe('signature help (LNG-016)', () => {
  it('shows the signature of a function and the parameter the cursor is at', () => {
    const buffer = `${PREAMBLE}  Count := Twice(1, \nEND_PROGRAM\n`;
    const cursor = after(buffer, 'Twice(1, ');
    const help = signatureAt(withBuffer(buffer), 'src/main.st', cursor.line, cursor.column, buffer)!;
    expect(help.label).toBe('Twice(X : INT; Gain : REAL) : INT');
    expect(help.activeParameter).toBe(1);
    expect(help.parameters.map((parameter) => parameter.label)).toEqual(['X : INT', 'Gain : REAL']);
  });

  it('follows a named argument, wherever it is written', () => {
    const buffer = `${PREAMBLE}  Count := Twice(Gain := 2.0, X := \nEND_PROGRAM\n`;
    const cursor = after(buffer, 'X := ');
    expect(signatureAt(withBuffer(buffer), 'src/main.st', cursor.line, cursor.column, buffer)!.activeParameter).toBe(0);
  });

  it('shows the inputs and outputs of the block an instance is of', () => {
    const buffer = `${PREAMBLE}  M(Start := TRUE, \nEND_PROGRAM\n`;
    const cursor = after(buffer, 'TRUE, ');
    const help = signatureAt(withBuffer(buffer), 'src/main.st', cursor.line, cursor.column, buffer)!;
    expect(help.label).toBe('M(Start : BOOL; Running => BOOL)');
    expect(help.activeParameter).toBe(1);
  });

  it('is not shown outside a call', () => {
    const buffer = `${PREAMBLE}  Count := 1;\nEND_PROGRAM\n`;
    const cursor = after(buffer, 'Count := 1;');
    expect(signatureAt(withBuffer(buffer), 'src/main.st', cursor.line, cursor.column, buffer)).toBeNull();
  });
});

describe('hover and outline across the project (LNG-015)', () => {
  const buffer = `${PREAMBLE}  Count := Twice(X := Shared);\n  M.Running;\nEND_PROGRAM\n`;
  const index = withBuffer(buffer);

  it('says what a name is and where it is declared, also when it is declared in another file', () => {
    const shared = after(buffer, 'Twice(X := Shared');
    const hover = hoverAt(index, 'src/main.st', shared.line, shared.column - 2)!;
    expect(hover.value).toContain('**Shared**');
    expect(hover.value).toContain('src/types.st:8');
    const twice = after(buffer, 'Twice');
    expect(hoverAt(index, 'src/main.st', twice.line, twice.column - 2)!.value).toContain('FUNCTION : INT');
  });

  it('describes a member of a standard block from the library', () => {
    const q = withBuffer(`${PREAMBLE}  Count := 0;\n  T(IN := TRUE);\n  M.Running := T.Q;\nEND_PROGRAM\n`);
    const text = `${PREAMBLE}  Count := 0;\n  T(IN := TRUE);\n  M.Running := T.Q;\nEND_PROGRAM\n`;
    const cursor = after(text, 'T.Q');
    expect(hoverAt(q, 'src/main.st', cursor.line, cursor.column)!.value).toContain('member of TON');
  });

  it('lists the declarations of a file as a tree, and of the whole project in file order', () => {
    const blocks = outlineOf(index, 'src/lib/blocks.st');
    expect(blocks.map((entry) => `${entry.kind}:${entry.name}`)).toEqual(['function:Twice', 'functionBlock:Motor']);
    expect(blocks[1]!.children.map((child) => child.name)).toEqual(['Start', 'Running']);
    expect(blocks[1]!.range.endLine).toBe(17);
    const everything = projectOutline(index);
    expect(everything.map((group) => group.file)).toEqual(['src/types.st', 'src/lib/blocks.st', 'src/main.st']);
    expect(everything[0]!.entries.map((entry) => entry.name)).toEqual(['Pair', 'Color']);
    expect(everything[0]!.entries[1]!.children.map((child) => child.name)).toEqual(['Red', 'Green']);
  });
});

// What the editor offers from the rest of the project (IDE-023): the blocks, functions and types that other files and
// library folders declare, in completion and in hover.
describe('completion from the project (IDE-023)', () => {
  const library = `FUNCTION_BLOCK Debounce
VAR_INPUT In : BOOL; END_VAR
VAR_OUTPUT Out : BOOL; END_VAR
END_FUNCTION_BLOCK

FUNCTION Scale : REAL
VAR_INPUT Raw : INT; END_VAR
Scale := INT_TO_REAL(Raw);
END_FUNCTION

TYPE Point :
STRUCT
  X : INT;
END_STRUCT
END_TYPE
`;
  const main = 'PROGRAM Main\nVAR\n  Local : BOOL;\nEND_VAR\n\nEND_PROGRAM\n';

  it('offers nothing of a library until the project has it', () => {
    const index = buildProjectIndex([{ path: 'src/main.st', content: main }]);
    expect(labels(completionsAt(index, 'src/main.st', 5, 1, main))).not.toContain('Debounce');
  });

  it('offers the function blocks, functions and types the project declares, with their kind and file', () => {
    const index = buildProjectIndex([
      { path: 'src/main.st', content: main },
      { path: 'lib/Library.st', content: library },
    ]);
    const items = completionsAt(index, 'src/main.st', 5, 1, main);
    expect(items.find((item) => item.label === 'Debounce')).toMatchObject({
      kind: 'functionBlock',
      detail: 'FUNCTION_BLOCK, lib/Library.st',
    });
    expect(items.find((item) => item.label === 'Scale')).toMatchObject({ kind: 'function', detail: 'FUNCTION : REAL, lib/Library.st' });
    expect(items.find((item) => item.label === 'Point')).toMatchObject({ kind: 'type', detail: 'STRUCT, lib/Library.st' });
  });

  it('keeps the variable of the buffer when a project declaration has the same name', () => {
    const clash = 'FUNCTION Local : INT\nEND_FUNCTION\n';
    const index = buildProjectIndex([
      { path: 'src/main.st', content: main },
      { path: 'lib/x.st', content: clash },
    ]);
    expect(completionsAt(index, 'src/main.st', 5, 1, main).find((item) => item.label === 'Local')?.kind).toBe('variable');
  });
});

describe('hover over a name of the project and of the library (IDE-023)', () => {
  const library = 'FUNCTION_BLOCK Debounce\nVAR_INPUT In : BOOL; END_VAR\nEND_FUNCTION_BLOCK\n';
  const main = 'PROGRAM Main\nVAR\n  D : Debounce;\n  T : TON;\n  V : INT;\nEND_VAR\n  V := MUX(0, 1, 2);\n  V := Nobody;\nEND_PROGRAM\n';
  const index = buildProjectIndex([
    { path: 'src/main.st', content: main },
    { path: 'lib/Library.st', content: library },
  ]);
  const over = (text: string): { value: string } | null => {
    const found = main.indexOf(text);
    const before = main.slice(0, found);
    return hoverAt(index, 'src/main.st', before.split('\n').length, found - before.lastIndexOf('\n'));
  };

  it('says what a name is and where it is declared', () => {
    const hover = over('Debounce');
    expect(hover?.value).toContain('**Debounce**');
    expect(hover?.value).toContain('FUNCTION_BLOCK');
    expect(hover?.value).toContain('lib/Library.st:1');
  });

  it('describes a standard block with its inputs and a standard function with its arguments', () => {
    expect(over('TON')?.value).toContain('standard function block');
    expect(over('TON')?.value).toContain('`IN`');
    expect(over('MUX')?.value).toContain('Variadic arguments');
  });

  it('answers nothing for a name nobody declares', () => {
    expect(over('Nobody')).toBeNull();
  });
});

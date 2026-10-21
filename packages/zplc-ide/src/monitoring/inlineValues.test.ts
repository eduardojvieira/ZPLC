// LNG-006: inline values in ST and IL are the values of the variables the language service resolves, read from the
// debug map of the program of the file; a name that is not a variable of the program is not given a value.
import { describe, expect, it } from 'bun:test';
import { compileSingleFileWithTask } from '../compiler';
import { buildProjectIndex } from '../langsvc/projectIndex';
import { ilInlineTargets, inlineValues, stInlineTargets } from './inlineValues';
import { resolveVariable } from './debugVariables';

const MAIN = `PROGRAM Main
VAR
  Count : INT;
  Ready : BOOL;
  T : TON;
  Items : ARRAY[0..2] OF INT;
END_VAR
  Count := Count + 1;
  T(IN := Ready, PT := T#1s);
  Ready := T.Q AND (Count > 3);
  Items[1] := Count;
  IF Ready THEN Count := ABS(Count); END_IF;
END_PROGRAM

FUNCTION Helper : INT
VAR_INPUT X : INT; END_VAR
  Helper := X + 1;
END_FUNCTION
`;

describe('inline values in Structured Text (LNG-006)', () => {
  const index = buildProjectIndex([{ path: 'src/main.st', content: MAIN }]);
  const targets = stInlineTargets(index, 'src/main.st');
  const names = (line: number) => targets.filter((target) => target.line === line).map((target) => target.label);

  it('names the variables a line reads or writes, by what the language service resolved', () => {
    expect(names(8)).toEqual(['Count', 'Count']);
    expect(names(10)).toEqual(['Ready', 'T.Q', 'Count']);
    // the member is shown at its end, with its path; an instance that is followed by a member is not a value of its own
    expect(targets.find((target) => target.line === 10 && target.label === 'T.Q')?.variable).toBe('T.Q');
  });

  it('gives no value to a function, a keyword, a type or a library function, nor to the body of a function', () => {
    expect(names(12)).toEqual(['Ready', 'Count', 'Count']);
    expect(targets.some((target) => target.label === 'ABS' || target.label === 'IF' || target.label === 'INT')).toBe(false);
    expect(targets.some((target) => target.line >= 15)).toBe(false);
  });

  it('does not show an element of an array as a variable of the map', () => {
    expect(names(11)).toEqual(['Count']);
  });
});

describe('inline values in Instruction List (LNG-006)', () => {
  const IL = `PROGRAM Main
VAR
  Start : BOOL;
  Motor : BOOL;
  T : TON;
END_VAR
  LD Start
  ST Motor
  CAL T(IN := Motor, PT := T#1s)
  LD T.Q
  ST Start
END_PROGRAM
`;

  it('names the declared variables of the program that each instruction uses', () => {
    const targets = ilInlineTargets(IL);
    expect(targets.map((target) => `${target.line}:${target.label}`)).toEqual(['7:Start', '8:Motor', '9:Motor', '10:T.Q', '11:Start']);
  });

  it('answers nothing for a source that does not parse', () => {
    expect(ilInlineTargets('PROGRAM Main\nLD ???\nEND_PROGRAM\n')).toEqual([]);
  });
});

describe('the widgets of a file (LNG-006)', () => {
  const read =
    (values: Record<string, { reading: number | boolean | string | undefined; type: string; known: boolean }>) => (variable: string) =>
      values[variable];
  const format = (value: number | boolean | string): string => String(value);
  const targets = [
    { line: 3, column: 3, label: 'Count', variable: 'Count' },
    { line: 3, column: 12, label: 'T.Q', variable: 'T.Q' },
    { line: 3, column: 20, label: 'Lost', variable: 'Lost' },
    { line: 3, column: 30, label: 'Count', variable: 'Count' },
  ];

  it('shows each variable of a line once, members first, and what cannot be read as unavailable', () => {
    const widgets = inlineValues(
      targets,
      read({
        Count: { reading: 7, type: 'INT', known: true },
        'T.Q': { reading: true, type: 'BOOL', known: true },
        Lost: { reading: undefined, type: '', known: false },
      }),
      format,
    );
    expect(widgets.map((widget) => `${widget.label}=${widget.text}`)).toEqual(['T.Q=true', 'Count=7', 'Lost=—']);
    expect(widgets[0]).toMatchObject({ isBool: true, isTrue: true, available: true });
    expect(widgets[2]).toMatchObject({ available: false });
  });

  it('shows a variable that is in the map and has not been read yet as unavailable', () => {
    const widgets = inlineValues(targets.slice(0, 1), read({ Count: { reading: undefined, type: 'INT', known: true } }), format);
    expect(widgets[0]).toMatchObject({ text: '—', available: false });
  });

  it('takes the variables of a program from its own debug map, so a name that the map lacks is unavailable', () => {
    const map = compileSingleFileWithTask(MAIN, 'ST', { sourceRef: 'src/main.st', programName: 'Main' }).debugMap;
    expect(resolveVariable(map, 'src/main.st', 'Count')).toBeDefined();
    expect(resolveVariable(map, 'src/main.st', 'T.Q')).toBeDefined();
    expect(resolveVariable(map, 'src/main.st', 'Items.0')).toBeUndefined();
  });
});

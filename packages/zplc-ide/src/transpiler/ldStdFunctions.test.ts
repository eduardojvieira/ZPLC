/**
 * LNG-030: a Ladder rung places every function the compiler registers as a box with EN and ENO (LNG-028), and the build
 * translates it. One compile case per name of `getAllFnNames()`, generated from the record of the standard functions, then the
 * rules the transpiler checks because the compiler does not: STRING literals, written operands, the operands of MUX, VOID, the
 * class of a generic operand. Every refusal names the rung and the cell (LNG-002, LNG-003) and leaves no ST in its place.
 */
import { describe, expect, it } from 'bun:test';
import { getAllFnNames } from '@zplc/compiler';

import { compileMultiTaskProject } from '../compiler';
import { stdFunction, type StdFunction } from '../catalog/stdFunctions';
import { LD_FUNCTIONS } from '../models/ldSupport';
import { transpileLDToST } from './ldToST';
import { box, coil, contact, ldFile, variable } from './ldFunctionFixture';

const GENERIC_AS: Record<string, string> = { ANY: 'INT', ANY_NUM: 'INT', ANY_INT: 'INT', ANY_BIT: 'WORD' };
const concrete = (type: string): string => GENERIC_AS[type] ?? type;

/** A rung `Start -> [NAME(V_<pin>...) -> Result] -> Lamp`: every operand a variable of its pin's type. */
function ldCallFile(record: StdFunction): Record<string, unknown> {
  const local = record.inputs.map(([pin, type]) => variable(`V_${pin}`, concrete(type)));
  const hasResult = record.returns !== 'VOID';
  if (hasResult) local.push(variable('Result', concrete(record.returns)));
  const operands = record.inputs.map(([pin]) => `V_${pin}`);
  return ldFile(
    { local: [...local, variable('Start', 'BOOL'), variable('Lamp', 'BOOL')] },
    contact('c1', 'Start'),
    box('f1', record.name, operands, hasResult ? 'Result' : undefined),
    coil('k1', 'Lamp'),
  );
}

function compileRung(file: Record<string, unknown>): unknown[] {
  try {
    const result = compileMultiTaskProject(
      { name: 'P', version: '1.0.0', tasks: [{ name: 'Main', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['main'] }] },
      [{ name: 'main', content: JSON.stringify(file), language: 'LD', sourceRef: 'src/main.ld.json' }],
    );
    return result.zplcFile.length > 0 ? [] : ['no program'];
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }
}

/** What the owner's decision of 2026-11-26 has MUX and SEL say of a STRING. */
const ADVICE = 'does not select STRING values; use an IF in Structured Text to choose between strings';

describe('LNG-030 every registered function compiles from a Ladder rung', () => {
  const names = [...getAllFnNames()].sort();

  it('covers the 297 registered functions, and LD_FUNCTIONS is the 15 boxes of before plus the 293 others', () => {
    expect(names.length).toBe(297);
    const keys = Object.keys(LD_FUNCTIONS);
    expect(keys.slice(0, 15)).toEqual([
      'GT',
      'GE',
      'EQ',
      'NE',
      'LE',
      'LT',
      'ADD',
      'SUB',
      'MUL',
      'DIV',
      'MOD',
      'MOVE',
      'LIMIT',
      'MIN',
      'MAX',
    ]);
    expect(keys.length).toBe(308);
    for (const name of names) expect([name, keys.includes(name)]).toEqual([name, true]);
  });

  for (const name of names) {
    it(name, () => {
      const record = stdFunction(name);
      expect(record).toBeDefined();
      expect(compileRung(ldCallFile(record!))).toEqual([]);
    });
  }
});

const declared = {
  local: [
    variable('Start', 'BOOL'),
    variable('Lamp', 'BOOL'),
    variable('Level', 'REAL'),
    variable('Root', 'REAL'),
    variable('Text', 'STRING'),
    variable('Mask', 'WORD'),
    variable('K', 'INT'),
    variable('A', 'INT'),
    variable('B', 'INT'),
    variable('C', 'INT'),
    variable('Big', 'REAL'),
    variable('Count', 'INT'),
    variable('Up', 'DINT'),
  ],
};
const lines = (source: string): string[] => source.split('\n').map((line) => line.trim());
const rung = (...series: Array<Record<string, unknown>>) =>
  transpileLDToST(ldFile(declared, contact('c1', 'Start'), ...series, coil('k1', 'Lamp')));

describe('LNG-030 the box of a standard function: the statements', () => {
  it('stores the result of the call while the power reaches it, and passes that power on (ENO = EN, LNG-028)', () => {
    const result = rung(box('f1', 'SQRT', ['Level'], 'Root'));
    expect(result.errors).toEqual([]);
    expect(lines(result.source)).toEqual(
      expect.arrayContaining(['_rung1_result := Start;', 'IF _rung1_result THEN Root := SQRT(Level); END_IF;', 'Lamp := _rung1_result;']),
    );
  });

  it('a VOID function is a statement under EN, with no output', () => {
    const result = rung(box('f1', 'WATCHDOG_RESET', []));
    expect(result.errors).toEqual([]);
    expect(lines(result.source)).toContain('IF _rung1_result THEN WATCHDOG_RESET(); END_IF;');
  });

  it('a function without parameters is called with none', () => {
    const result = rung(box('f1', 'UPTIME', [], 'Up'));
    expect(lines(result.source)).toContain('IF _rung1_result THEN Up := UPTIME(); END_IF;');
  });

  it('MOD stays the box it was: a MOD b', () => {
    const result = rung(box('f1', 'MOD', ['A', 'B'], 'Count'));
    expect(lines(result.source)).toContain('IF _rung1_result THEN Count := A MOD B; END_IF;');
  });

  it('a STRING literal operand is passed verbatim, with its $ escapes', () => {
    const result = rung(box('f1', 'CONCAT', ["'AB'", "'it$'s $$5'"], 'Text'));
    expect(result.errors).toEqual([]);
    expect(lines(result.source)).toContain("IF _rung1_result THEN Text := CONCAT('AB', 'it$'s $$5'); END_IF;");
  });

  it('a written operand that is a declared variable is passed: COPY(SRC, DST)', () => {
    const result = rung(box('f1', 'COPY', ["'HI'", 'Text'], 'Text'));
    expect(result.errors).toEqual([]);
    expect(lines(result.source)).toContain("IF _rung1_result THEN Text := COPY('HI', Text); END_IF;");
  });

  it('MUX takes K and three or more inputs, in order', () => {
    const result = rung(box('f1', 'MUX', ['K', 'A', 'B', 'C'], 'Count'));
    expect(result.errors).toEqual([]);
    expect(lines(result.source)).toContain('IF _rung1_result THEN Count := MUX(K, A, B, C); END_IF;');
  });

  it('a conversion is a box of one operand', () => {
    const result = rung(box('f1', 'INT_TO_REAL', ['A'], 'Root'));
    expect(lines(result.source)).toContain('IF _rung1_result THEN Root := INT_TO_REAL(A); END_IF;');
  });
});

describe('LNG-030 LNG-002 LNG-003 the box of a standard function: every fault names its rung and cell', () => {
  const faults = (element: Record<string, unknown>) => {
    const result = rung(element);
    expect(result.success).toBe(false);
    expect(result.source).toBe('');
    return result.diagnostics ?? [];
  };

  it.each([
    ['a STRING literal that is not closed', box('f1', 'LEN', ["'AB"], 'Count'), "Function 'f1' (LEN) operand S ''AB' is neither"],
    ['a quote inside a STRING literal', box('f1', 'LEN', ["'A'B'"], 'Count'), "Function 'f1' (LEN) operand S ''A'B'' is neither"],
    [
      'a literal where the call writes',
      box('f1', 'COPY', ["'HI'", "'X'"], 'Text'),
      "Function 'f1' (COPY) operand DST ''X'' is written by COPY, so it has to be a declared variable, not a literal",
    ],
    [
      'a literal where CLEAR writes',
      box('f1', 'CLEAR', ["'X'"], 'Text'),
      "Function 'f1' (CLEAR) operand S ''X'' is written by CLEAR, so it has to be a declared variable, not a literal",
    ],
    ['a MUX of two operands', box('f1', 'MUX', ['K', 'A'], 'Count'), "Function 'f1' (MUX) takes at least 3 operands, found 2"],
    [
      'a fixed function with one operand too many',
      box('f1', 'SQRT', ['Level', 'Level'], 'Root'),
      "Function 'f1' (SQRT) takes 1 operands, found 2",
    ],
    [
      'a BOOL into a bit-string pin',
      box('f1', 'SHL', ['Start', '2'], 'Mask'),
      "Function 'f1' (SHL) operand IN is BOOL, and SHL takes a bit string (BYTE, WORD, DWORD or LWORD) there",
    ],
    [
      'a STRING into a numeric pin',
      box('f1', 'NEG', ['Text'], 'Count'),
      "Function 'f1' (NEG) operand IN is STRING, and NEG takes a number",
    ],
    ['a typed literal of the wrong class', box('f1', 'NEG', ['T#5s'], 'Count'), "Function 'f1' (NEG) operand IN is TIME"],
    [
      'generic operands of different types',
      box('f1', 'MUX', ['K', 'A', 'Big'], 'Count'),
      "Function 'f1' (MUX): its operands have different types (INT, REAL); the box keeps the type of its operands, so convert one of them",
    ],
    [
      'an output on a VOID function',
      box('f1', 'WATCHDOG_RESET', [], 'Count'),
      "Function 'f1' (WATCHDOG_RESET) returns nothing and has no output",
    ],
    ['a missing output', box('f1', 'SQRT', ['Level']), "Function 'f1' (SQRT) needs an output variable"],
  ])('%s', (_name, element, message) => {
    expect(faults(element)).toEqual([{ message: expect.stringContaining(message), element: 'rung:r1/cell:0,1' }]);
  });

  it('MUX and SEL do not select a STRING: the message names the pin and says to use an IF in Structured Text', () => {
    expect(faults(box('f1', 'MUX', ['K', 'Text', "'B'"], 'Text')).map((fault) => fault.message)).toEqual([
      "Function 'f1' (MUX) operand IN0 is STRING: MUX " + ADVICE,
      "Function 'f1' (MUX) operand IN1 is STRING: MUX " + ADVICE,
    ]);
    expect(faults(box('f1', 'SEL', ['Start', 'Text', 'Text'], 'Text')).map((fault) => fault.message)).toEqual([
      "Function 'f1' (SEL) operand IN0 is STRING: SEL " + ADVICE,
      "Function 'f1' (SEL) operand IN1 is STRING: SEL " + ADVICE,
    ]);
  });
});

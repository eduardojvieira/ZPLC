/**
 * The Ladder `function` element (LNG-028): the box of an IEC function with EN and ENO. Validation reports each fault against
 * the rung and cell of the box (LNG-002, LNG-003); the transpiler gives a comparison a place in the power expression and runs
 * any other function only while the power reaches it.
 */
import { describe, expect, it } from 'bun:test';
import { transpileLDToST } from './ldToST';
import { box, coil, contact, ldFile, rungsFile, variable } from './ldFunctionFixture';

const declared = {
  inputs: [variable('Start', 'BOOL', '%IX0.0'), variable('A', 'INT', '%IW0'), variable('B', 'INT', '%IW1')],
  local: [variable('Sum', 'INT'), variable('Hold', 'TON')],
  outputs: [variable('Lamp', 'BOOL', '%QX0.0')],
};

const lines = (source: string): string[] => source.split('\n').map((line) => line.trim());

describe('LNG-028 the function box in a rung: the statements', () => {
  it('LNG-028 a comparison is a term of the power: ENO is the power that reached it AND the comparison', () => {
    const result = transpileLDToST(ldFile(declared, contact('c1', 'Start'), box('f1', 'GT', ['A', '100']), coil('k1', 'Lamp')));
    expect(result.errors).toEqual([]);
    expect(lines(result.source)).toEqual(
      expect.arrayContaining(['_rung1_result := A > 100;', '_rung1_result_2 := Start AND _rung1_result;', 'Lamp := _rung1_result_2;']),
    );
  });

  it('LNG-028 each comparison has its own operator', () => {
    const operators = { GT: '>', GE: '>=', EQ: '=', NE: '<>', LE: '<=', LT: '<' };
    for (const [name, operator] of Object.entries(operators)) {
      const result = transpileLDToST(ldFile(declared, box('f1', name, ['A', 'B']), coil('k1', 'Lamp')));
      expect(lines(result.source)).toContain(`_rung1_result := A ${operator} B;`);
    }
  });

  it('LNG-028 LNG-021 comparisons in parallel branches compose like contacts: an OR of their terms', () => {
    const file = rungsFile(declared, [
      {
        cols: 2,
        grid: [
          [box('f1', 'GT', ['A', '10']), coil('k1', 'Lamp')],
          [box('f2', 'LT', ['B', '5']), null],
        ],
        branches: [{ id: 'b1', startCol: 0, endCol: 0, rows: [0, 1] }],
      },
    ]);
    const result = transpileLDToST(file);
    expect(result.errors).toEqual([]);
    expect(lines(result.source)).toEqual(
      expect.arrayContaining([
        '_rung1_result := A > 10;',
        '_rung1_result_2 := B < 5;',
        '_rung1_result_3 := _rung1_result OR _rung1_result_2;',
      ]),
    );
  });

  it('LNG-028 any other function runs only while the power reaches it, and passes that power on (ENO = EN)', () => {
    const result = transpileLDToST(ldFile(declared, contact('c1', 'Start'), box('f1', 'ADD', ['A', 'B'], 'Sum'), coil('k1', 'Lamp')));
    expect(result.errors).toEqual([]);
    expect(lines(result.source)).toEqual(
      expect.arrayContaining(['_rung1_result := Start;', 'IF _rung1_result THEN Sum := A + B; END_IF;', 'Lamp := _rung1_result;']),
    );
  });

  it('LNG-028 every function of the set has its statement', () => {
    const expected: Array<[string, unknown[], string]> = [
      ['ADD', ['A', 'B'], 'Sum := A + B;'],
      ['SUB', ['A', 'B'], 'Sum := A - B;'],
      ['MUL', ['A', '2'], 'Sum := A * 2;'],
      ['DIV', ['A', 'B'], 'Sum := A / B;'],
      ['MOD', ['A', 'B'], 'Sum := A MOD B;'],
      ['MOVE', ['A'], 'Sum := A;'],
      ['LIMIT', ['0', 'A', '4095'], 'Sum := LIMIT(0, A, 4095);'],
      ['MIN', ['A', 'B'], 'Sum := MIN(A, B);'],
      ['MAX', ['A', 'B'], 'Sum := MAX(A, B);'],
    ];
    for (const [name, operands, statement] of expected) {
      const result = transpileLDToST(ldFile(declared, box('f1', name, operands, 'Sum'), coil('k1', 'Lamp')));
      expect(result.errors).toEqual([]);
      expect(lines(result.source)).toContain(`IF _rung1_result THEN ${statement} END_IF;`);
    }
  });

  it('LNG-028 a negative literal is written in parentheses, and a TIME literal stays as it is', () => {
    const result = transpileLDToST(ldFile(declared, box('f1', 'SUB', ['A', '-5'], 'Sum'), coil('k1', 'Lamp')));
    expect(lines(result.source)).toContain('IF _rung1_result THEN Sum := A - (-5); END_IF;');
    const time = transpileLDToST(
      ldFile({ ...declared, local: [variable('Elapsed', 'TIME')] }, box('f1', 'GE', ['Elapsed', 'T#3s']), coil('k1', 'Lamp')),
    );
    expect(time.errors).toEqual([]);
    expect(lines(time.source)).toContain('_rung1_result := Elapsed >= T#3s;');
  });

  it('LNG-028 the source map gives the statements of a box to its rung and cell', () => {
    const result = transpileLDToST(ldFile(declared, contact('c1', 'Start'), box('f1', 'ADD', ['A', 'B'], 'Sum'), coil('k1', 'Lamp')));
    expect(result.sourceMap?.some((range) => range.element === 'rung:r1/cell:0,1')).toBe(true);
  });

  it('LNG-021 LNG-028 logic placed after a box follows the ENO of that box', () => {
    const result = transpileLDToST(ldFile(declared, box('f1', 'GT', ['A', '1']), contact('c2', 'Start'), coil('k1', 'Lamp')));
    expect(lines(result.source)).toContain('_rung1_result_2 := _rung1_result AND Start;');
  });
});

describe('LNG-028 the function box: the monitor entries', () => {
  it('LNG-006 LNG-028 a box has a power entry like any element, and the pins that name a variable carry its value', () => {
    const result = transpileLDToST(ldFile(declared, contact('c1', 'Start'), box('f1', 'ADD', ['A', '3'], 'Sum'), coil('k1', 'Lamp')));
    const at = (role: string) => result.monitor?.filter((entry) => entry.element === 'rung:r1/cell:0,1' && entry.role === role);
    expect(at('power')).toEqual([
      { element: 'rung:r1/cell:0,1', role: 'power', in: { op: 'var', variable: 'Start' }, out: { op: 'var', variable: '_rung1_result' } },
    ]);
    expect(at('output')).toEqual([
      { element: 'rung:r1/cell:0,1', role: 'output', port: 'IN1', variable: 'A' },
      { element: 'rung:r1/cell:0,1', role: 'output', port: 'OUT', variable: 'Sum' },
    ]);
  });
});

describe('LNG-028 the function box: what stays as it was', () => {
  it('a rung with a timer block and a plain contact transpile exactly as before the function box existed', () => {
    const timer = {
      id: 'fb1',
      type: 'function_block',
      fbType: 'TON',
      instance: 'Hold',
      parameters: { IN: 'CONNECTED', PT: 'T#3s' },
    };
    const result = transpileLDToST(ldFile(declared, contact('c1', 'Start'), timer, coil('k1', 'Lamp')));
    expect(result.source).toBe(
      [
        'PROGRAM Rungs',
        '',
        'VAR_INPUT',
        '    Start AT %IX0.0 : BOOL;',
        '    A AT %IW0 : INT;',
        '    B AT %IW1 : INT;',
        'END_VAR',
        '',
        'VAR',
        '    Sum : INT;',
        '    Hold : TON;',
        '    _rung1_result : BOOL;',
        '    _rung1_result_2 : BOOL;',
        'END_VAR',
        '',
        'VAR_OUTPUT',
        '    Lamp AT %QX0.0 : BOOL;',
        'END_VAR',
        '',
        '(* LD Execution - Auto-generated *)',
        '',
        '(* Rung 1 *)',
        '_rung1_result := Start;',
        'Hold(IN := _rung1_result, PT := T#3s);',
        '_rung1_result_2 := Hold.Q;',
        'Lamp := _rung1_result_2;',
        '',
        'END_PROGRAM',
      ].join('\n'),
    );
  });
});

describe('LNG-028 LNG-002 LNG-003 the function box: every fault names its rung and cell', () => {
  const faults = (...series: Array<Record<string, unknown>>) => {
    const result = transpileLDToST(ldFile(declared, contact('c1', 'Start'), ...series, coil('k1', 'Lamp')));
    expect(result.success).toBe(false);
    return result.diagnostics ?? [];
  };

  it.each([
    ['an unknown function', box('f1', 'POWER', ['A', 'B'], 'Sum'), "Function 'f1' names the unknown function 'POWER'"],
    ['a wrong operand count', box('f1', 'ADD', ['A'], 'Sum'), "Function 'f1' (ADD) takes 2 operands, found 1"],
    ['an empty operand', box('f1', 'ADD', ['A', ''], 'Sum'), "Function 'f1' (ADD) operand IN2 is empty"],
    ['an operand that is not a list', { ...box('f1', 'ADD', [], 'Sum'), operands: 'A' }, "Function 'f1' operands must be a list"],
    [
      'an undeclared variable operand',
      box('f1', 'ADD', ['A', 'Nope'], 'Sum'),
      "Function 'f1' (ADD) operand IN2 'Nope' is neither a declared variable nor a literal",
    ],
    ['a missing output', box('f1', 'ADD', ['A', 'B']), "Function 'f1' (ADD) needs an output variable"],
    ['an undeclared output', box('f1', 'ADD', ['A', 'B'], 'Nope'), "Function 'f1' output 'Nope' must reference a declared variable"],
    ['an output that is an input variable', box('f1', 'ADD', ['A', 'B'], 'B'), "Function 'f1' output 'B' must not write a VAR_INPUT"],
    [
      'an output that is a function block instance',
      box('f1', 'MOVE', ['A'], 'Hold'),
      "Function 'f1' output 'Hold' must be a variable of an elementary type",
    ],
    ['an output on a comparison', box('f1', 'GT', ['A', 'B'], 'Sum'), "Function 'f1' (GT) is a comparison and has no output"],
  ])('%s', (_name, element, message) => {
    expect(faults(element)).toEqual([{ message: expect.stringContaining(message), element: 'rung:r1/cell:0,1' }]);
  });

  it('LNG-028 several boxes may write one variable: each writes while its EN is on, the last in scan order wins', () => {
    const result = transpileLDToST(
      rungsFile({ ...declared, local: [variable('Sum', 'INT')] }, [
        { cols: 1, grid: [[box('f1', 'MOVE', ['A'], 'Sum')]] },
        { cols: 1, grid: [[box('f2', 'MOVE', ['B'], 'Sum')]] },
      ]),
    );
    expect(result.errors).toEqual([]);
    expect(result.success).toBe(true);
  });

  it('LNG-028 a coil and a box on one variable are refused, naming both positions', () => {
    const result = transpileLDToST(
      rungsFile({ ...declared, local: [variable('Flag', 'BOOL')] }, [
        { cols: 1, grid: [[coil('k1', 'Flag')]] },
        { cols: 1, grid: [[box('f1', 'MOVE', ['Start'], 'Flag')]] },
      ]),
    );
    expect(result.success).toBe(false);
    expect(result.diagnostics).toEqual([
      {
        message: "Multiple writers target 'FLAG': a coil (rung:r1/cell:0,0) and a function box (rung:r2/cell:0,0)",
        element: 'rung:r2/cell:0,0',
      },
    ]);
  });

  it('LNG-028 a set/reset pair plus a box is refused at the box, which the message names (LNG-003)', () => {
    const result = transpileLDToST(
      rungsFile({ ...declared, local: [variable('Flag', 'BOOL')] }, [
        { cols: 1, grid: [[{ id: 's1', type: 'coil_set', variable: 'Flag' }]] },
        { cols: 1, grid: [[{ id: 'r1', type: 'coil_reset', variable: 'Flag' }]] },
        { cols: 1, grid: [[box('f1', 'MOVE', ['Start'], 'Flag')]] },
      ]),
    );
    expect(result.success).toBe(false);
    expect(result.diagnostics).toEqual([
      {
        message: "Multiple writers target 'FLAG': a coil (rung:r1/cell:0,0) and a function box (rung:r3/cell:0,0)",
        element: 'rung:r3/cell:0,0',
      },
    ]);
  });

  it('LNG-028 two plain coils on one variable stay refused', () => {
    const result = transpileLDToST(
      rungsFile(declared, [
        { cols: 1, grid: [[coil('k1', 'Lamp')]] },
        { cols: 1, grid: [[coil('k2', 'Lamp')]] },
      ]),
    );
    expect(result.success).toBe(false);
    expect(result.diagnostics).toEqual([{ message: "Multiple writers target 'LAMP'", element: 'rung:r2/cell:0,0' }]);
  });

  it('literals are accepted: integers, REAL, based, typed and TIME', () => {
    for (const literal of ['100', '-3', '4095.0', '16#FF', 'INT#7', 'T#3s']) {
      const result = transpileLDToST(ldFile(declared, box('f1', 'EQ', ['A', literal]), coil('k1', 'Lamp')));
      expect(result.errors).toEqual([]);
    }
  });
});

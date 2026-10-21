import { describe, expect, it } from 'bun:test';
import { compileToBinary } from '@zplc/compiler';

import type { FBDBlock, FBDModel } from './fbd';
import { judgeConnection, pinTypeProblem } from './pinTypes';

const ELEMENTARY = [
  'BOOL',
  'SINT',
  'INT',
  'DINT',
  'LINT',
  'USINT',
  'UINT',
  'UDINT',
  'ULINT',
  'BYTE',
  'WORD',
  'DWORD',
  'LWORD',
  'REAL',
  'LREAL',
  'TIME',
  'STRING',
  'WSTRING',
  'DATE',
  'TOD',
  'DT',
];

/** What the compiler says to `b := a;` for two declared variables: accepted, refused as a type error, or unsupported today. */
function compilerVerdict(from: string, to: string): 'accepts' | 'refuses' | 'cannot say' {
  try {
    compileToBinary(`PROGRAM P\nVAR a : ${from}; b : ${to}; END_VAR\nb := a;\nEND_PROGRAM`);
    return 'accepts';
  } catch (error) {
    const message = (error as Error).message;
    if (/Type mismatch|cannot be used where|it is not a string|do not mix/.test(message)) return 'refuses';
    return 'cannot say'; // a 64-bit conversion the VM does not have yet (CMP-015)
  }
}

describe('LNG-013 a pin takes what the compiler would take', () => {
  it('agrees with the compiler on every pair of elementary types', () => {
    const disagreements: string[] = [];
    let compared = 0;
    for (const from of ELEMENTARY) {
      for (const to of ELEMENTARY) {
        const verdict = compilerVerdict(from, to);
        if (verdict === 'cannot say') continue;
        compared += 1;
        const problem = pinTypeProblem(from, to);
        if ((problem === undefined) !== (verdict === 'accepts'))
          disagreements.push(`${from} -> ${to}: compiler ${verdict}, pin ${problem === undefined ? 'accepts' : 'refuses'}`);
      }
    }
    expect(compared).toBeGreaterThan(350);
    expect(disagreements).toEqual([]);
  });

  it('refuses a string for anything but a string of its own kind, as the compiler does', () => {
    for (const from of ['STRING', 'WSTRING']) {
      for (const to of ['BOOL', 'INT', 'REAL', 'TIME', 'DATE']) expect(pinTypeProblem(from, to)).toContain(from);
      expect(pinTypeProblem(from, from)).toBeUndefined();
    }
    expect(pinTypeProblem('STRING', 'WSTRING')).toBeDefined();
  });
});

describe('LNG-013 the reason a pin gives', () => {
  it('names both types and the way out', () => {
    expect(pinTypeProblem('BOOL', 'INT')).toBe(
      'BOOL is a BOOL and INT is an integer (INT): IEC 61131-3 converts implicitly only to a wider type of the same kind; convert it ' +
        'explicitly, for example with BOOL_TO_INT',
    );
    expect(pinTypeProblem('REAL', 'BOOL')).toContain('REAL is a real number (REAL)');
    expect(pinTypeProblem('REAL', 'DINT')).toContain('does not convert a REAL to an integer implicitly');
    // the build accepts an LREAL where a REAL goes and warns of the narrowing, so the pin does not refuse it
    expect(pinTypeProblem('LREAL', 'REAL')).toBeUndefined();
  });

  it('lets a number into a numeric pin and keeps a BOOL, a time and a string out of it', () => {
    for (const source of ['INT', 'UDINT', 'BYTE', 'REAL', 'LREAL', 'ANY_NUM', 'INTEGER_LITERAL'])
      expect(pinTypeProblem(source, 'ANY_NUM')).toBeUndefined();
    expect(pinTypeProblem('BOOL', 'ANY_NUM')).toContain('BOOL is a BOOL and ANY_NUM takes numbers');
    expect(pinTypeProblem('STRING', 'ANY_NUM')).toContain('ANY_NUM takes numbers');
    expect(pinTypeProblem('TIME', 'ANY_NUM')).toBeUndefined();
  });

  it('does not judge what it does not know', () => {
    for (const [source, target] of [
      ['ANY', 'BOOL'],
      ['BOOL', 'ANY'],
      [undefined, 'INT'],
      ['INT', undefined],
      ['MyBlock', 'INT'],
      ['INT', 'MyStruct'],
      ['TON', 'TON'],
    ] as const) {
      expect(pinTypeProblem(source, target)).toBeUndefined();
    }
  });

  it('takes the type names without regard to case and the long names of the date types', () => {
    expect(pinTypeProblem('bool', 'Int')).toBeDefined();
    expect(pinTypeProblem('time_of_day', 'TOD')).toBeUndefined();
    expect(pinTypeProblem('date_and_time', 'DT')).toBeUndefined();
  });
});

function block(id: string, type: string, extra: Partial<FBDBlock> = {}): FBDBlock {
  const ports: Record<string, Pick<FBDBlock, 'inputs' | 'outputs'>> = {
    AND: {
      inputs: [
        { name: 'IN1', type: 'BOOL' },
        { name: 'IN2', type: 'BOOL' },
      ],
      outputs: [{ name: 'OUT', type: 'BOOL' }],
    },
    ADD: {
      inputs: [
        { name: 'IN1', type: 'ANY_NUM' },
        { name: 'IN2', type: 'ANY_NUM' },
      ],
      outputs: [{ name: 'OUT', type: 'ANY_NUM' }],
    },
    TON: {
      inputs: [
        { name: 'IN', type: 'BOOL' },
        { name: 'PT', type: 'TIME' },
      ],
      outputs: [
        { name: 'Q', type: 'BOOL' },
        { name: 'ET', type: 'TIME' },
      ],
    },
    CTU: {
      inputs: [
        { name: 'CU', type: 'BOOL' },
        { name: 'R', type: 'BOOL' },
        { name: 'PV', type: 'INT' },
      ],
      outputs: [
        { name: 'Q', type: 'BOOL' },
        { name: 'CV', type: 'INT' },
      ],
    },
    variable: { inputs: [{ name: 'IN', type: 'ANY' }], outputs: [{ name: 'OUT', type: 'ANY' }] },
    output: { inputs: [{ name: 'IN', type: 'ANY' }], outputs: [] },
    constant: { inputs: [], outputs: [{ name: 'OUT', type: 'ANY' }] },
  };
  return { id, type, position: { x: 0, y: 0 }, ...ports[type], ...extra };
}

function diagram(blocks: FBDBlock[], connections: FBDModel['connections'] = []): FBDModel {
  return {
    name: 'D',
    variables: {
      local: [
        { name: 'Level', type: 'REAL' },
        { name: 'Count', type: 'INT' },
      ],
      inputs: [{ name: 'Start', type: 'BOOL' }],
      outputs: [{ name: 'Lamp', type: 'BOOL' }],
    },
    blocks,
    connections,
  };
}

describe('LNG-013 judging a wire of the diagram', () => {
  const model = diagram([
    block('gate', 'AND'),
    block('sum', 'ADD'),
    block('tmr', 'TON'),
    block('cnt', 'CTU'),
    block('start', 'variable', { variableName: 'Start' }),
    block('level', 'variable', { variableName: 'Level' }),
    block('count', 'variable', { variableName: 'Count' }),
    block('lamp', 'output', { variableName: 'Lamp' }),
    block('five', 'constant', { value: 5 }),
    block('half', 'constant', { value: 0.5 }),
    block('delay', 'constant', { value: 'T#2s' }),
    block('on', 'constant', { value: true }),
  ]);

  it('accepts a BOOL into a BOOL input and a number into a numeric input', () => {
    expect(judgeConnection(model, { block: 'gate', port: 'OUT' }, { block: 'tmr', port: 'IN' }).reason).toBeUndefined();
    expect(judgeConnection(model, { block: 'level', port: 'OUT' }, { block: 'sum', port: 'IN1' }).reason).toBeUndefined();
    expect(judgeConnection(model, { block: 'five', port: 'OUT' }, { block: 'cnt', port: 'PV' }).reason).toBeUndefined();
    expect(judgeConnection(model, { block: 'delay', port: 'OUT' }, { block: 'tmr', port: 'PT' }).reason).toBeUndefined();
  });

  it('refuses a BOOL into a numeric input, with the reason', () => {
    const verdict = judgeConnection(model, { block: 'gate', port: 'OUT' }, { block: 'sum', port: 'IN1' });
    expect(verdict.reason).toBe(
      "'gate.OUT' cannot feed 'sum.IN1': BOOL is a BOOL and ANY_NUM takes numbers: IEC 61131-3 converts implicitly only to a wider type " +
        'of the same kind; convert it explicitly',
    );
    expect(verdict.from).toEqual({ block: 'gate', port: 'OUT' });
    expect(verdict.to).toEqual({ block: 'sum', port: 'IN1' });
    expect(judgeConnection(model, { block: 'on', port: 'OUT' }, { block: 'cnt', port: 'PV' }).reason).toContain(
      'BOOL is a BOOL and INT is an integer (INT)',
    );
  });

  it('refuses a REAL variable into a BOOL input and a REAL into an integer input', () => {
    expect(judgeConnection(model, { block: 'level', port: 'OUT' }, { block: 'gate', port: 'IN1' }).reason).toContain(
      'REAL is a real number (REAL) and BOOL is a BOOL',
    );
    expect(judgeConnection(model, { block: 'half', port: 'OUT' }, { block: 'cnt', port: 'PV' }).reason).toContain(
      'does not convert a REAL to an integer',
    );
  });

  it('refuses a number into a time input and a time into a number', () => {
    expect(judgeConnection(model, { block: 'five', port: 'OUT' }, { block: 'tmr', port: 'PT' }).reason).toContain(
      'integer constant is a number',
    );
    expect(judgeConnection(model, { block: 'tmr', port: 'ET' }, { block: 'cnt', port: 'PV' }).reason).toContain('TIME is a TIME');
  });

  it('judges a variable by the type it is declared with, and writes a number into a variable of another type', () => {
    expect(judgeConnection(model, { block: 'start', port: 'OUT' }, { block: 'lamp', port: 'IN' }).reason).toBeUndefined();
    expect(judgeConnection(model, { block: 'level', port: 'OUT' }, { block: 'lamp', port: 'IN' }).reason).toContain('REAL');
    expect(judgeConnection(model, { block: 'count', port: 'OUT' }, { block: 'level', port: 'IN' }).reason).toBeUndefined();
    expect(judgeConnection(model, { block: 'level', port: 'OUT' }, { block: 'count', port: 'IN' }).reason).toContain(
      'does not convert a REAL to an integer',
    );
  });

  it('takes a wire drawn from the input end, and refuses two outputs and two inputs', () => {
    const drawnBackwards = judgeConnection(model, { block: 'tmr', port: 'IN' }, { block: 'gate', port: 'OUT' });
    expect(drawnBackwards.reason).toBeUndefined();
    expect(drawnBackwards.from).toEqual({ block: 'gate', port: 'OUT' });
    expect(judgeConnection(model, { block: 'gate', port: 'OUT' }, { block: 'sum', port: 'OUT' }).reason).toContain('two outputs');
    expect(judgeConnection(model, { block: 'gate', port: 'IN1' }, { block: 'tmr', port: 'IN' }).reason).toBe(
      'a wire joins an output to an input',
    );
  });

  it('refuses a second wire into an input', () => {
    const wired = diagram(model.blocks, [{ id: 'w1', from: { block: 'gate', port: 'OUT' }, to: { block: 'tmr', port: 'IN' } }]);
    expect(judgeConnection(wired, { block: 'start', port: 'OUT' }, { block: 'tmr', port: 'IN' }).reason).toBe(
      "input 'tmr.IN' already has a wire: an input has one source",
    );
  });

  it('does not judge a pin whose type it cannot know', () => {
    const unknown = diagram([block('member', 'variable', { variableName: 'Timer1.Q' }), block('sum', 'ADD')]);
    expect(judgeConnection(unknown, { block: 'member', port: 'OUT' }, { block: 'sum', port: 'IN1' }).reason).toBeUndefined();
  });
});

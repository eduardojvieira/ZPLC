import { afterAll, beforeAll, describe, expect } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { itNative, nativeRuntimeBinary } from '../cli/nativeRuntimeGuard';
import { compilerCompile, scenarioRun } from '../cli/toolApi';

/**
 * Compiler and runtime support for the constructs the course does not teach yet (finding L7 of the course review, matrix in
 * specs/012-zplc-2-1-plant-simulation/course-l7-support.md). Each probe is the smallest program that uses one construct in one
 * language, with a scenario that checks what the construct does, run the way a lesson's Check runs it: `scenarioRun` on a fresh
 * native POSIX session. A probe without `gap` must pass: a lesson can teach the construct. A probe with `gap` documents what
 * the compiler or the runtime does instead, so the suite stays green while the gap is open and fails the day it closes.
 */

type Language = 'ST' | 'LD' | 'FBD' | 'IL' | 'SFC';
type Signals = Record<string, boolean>;
interface Probe {
  construct: string;
  language: Language;
  /** The program file under src/, named Probe.<extension>; the program inside is `Probe`. */
  source: string;
  /** Further Structured Text files under src/ (a function, a global): compiled with the program, as a lesson's are. */
  libraries?: Record<string, string>;
  /** Input values from a time on, in ms; the scenario ticks every 10 ms. */
  events: Array<[number, Signals]>;
  /** Output values the construct must produce at a time, in ms. */
  expect: Array<[number, Signals]>;
  /** The gap: the build fails with a diagnostic that contains `build`, or the run fails these `wrong` checks. */
  gap?: { build: string } | { wrong: string[] };
}

const EXTENSION: Record<Language, string> = { ST: 'st', LD: 'ld.json', FBD: 'fbd.json', IL: 'il', SFC: 'sfc.json' };

// ---------------------------------------------------------------------------------------------------------------
// Builders of the graphical sources: only what a probe needs, in the shape the editors save.
// ---------------------------------------------------------------------------------------------------------------

interface Declarations {
  local?: Array<{ name: string; type: string; initialValue?: unknown }>;
  inputs: Array<[string, string]>;
  outputs: Array<[string, string]>;
}
const declare = ({ local = [], inputs, outputs }: Declarations) => ({
  local,
  inputs: inputs.map(([name, address]) => ({ name, type: 'BOOL', address })),
  outputs: outputs.map(([name, address]) => ({ name, type: 'BOOL', address })),
});

/** A Ladder program: each rung is its elements from left to right. */
function ladder(variables: Declarations, rungs: Array<Array<Record<string, unknown>>>): string {
  return JSON.stringify({
    name: 'Probe',
    variables: declare(variables),
    rungs: rungs.map((elements, rung) => ({
      id: `r${rung + 1}`,
      number: rung + 1,
      elements: elements.map((element, column) => ({ id: `e${rung}_${column}`, position: { x: 50 + 100 * column, y: 0 }, ...element })),
      connections: [],
    })),
  });
}

/** An FBD program: blocks by id, and wires written `block.port -> block.port`. */
function diagram(variables: Declarations, blocks: Record<string, Record<string, unknown>>, wires: string[]): string {
  return JSON.stringify({
    name: 'Probe',
    variables: declare(variables),
    blocks: Object.entries(blocks).map(([id, block]) => ({ id, position: { x: 0, y: 0 }, ...block })),
    connections: wires.map((wire, index) => {
      const [from, to] = wire.split(' -> ').map((end) => end.split('.'));
      return { id: `w${index}`, from: { block: from![0], port: from![1] }, to: { block: to![0], port: to![1] } };
    }),
  });
}

/** An SFC program of one initial step whose N action is `body`, written in Structured Text. */
function chart(variables: Declarations, body: string): string {
  return JSON.stringify({
    name: 'Probe',
    variables: declare(variables),
    steps: [{ id: 's_run', name: 'Run', isInitial: true, position: { x: 0, y: 0 }, actions: [{ qualifier: 'N', actionName: 'Body' }] }],
    transitions: [],
    actions: [{ id: 'body', name: 'Body', type: 'ST', body }],
  });
}

const input = (variableName: string) => ({ type: 'input', variableName });
const output = (variableName: string) => ({ type: 'output', variableName });
const constant = (dataType: string, value: unknown) => ({ type: 'constant', dataType, value });

// ---------------------------------------------------------------------------------------------------------------
// TP, CTD, CTUD: one scenario per block, the same in every language.
// ---------------------------------------------------------------------------------------------------------------

const TP_IO: Declarations = { inputs: [['Start', '%IX0.0']], outputs: [['Lamp', '%QX0.0']] };
const TP_BODY = 'Shot(IN := Start, PT := T#100ms);\nLamp := Shot.Q;';
const TP_SCENARIO = {
  // The pulse lasts PT whatever IN does: it outlives a short IN, and it ends while a long IN is still TRUE.
  events: [
    [0, { 'Probe.Start': false }],
    [20, { 'Probe.Start': true }],
    [50, { 'Probe.Start': false }],
    [200, { 'Probe.Start': true }],
    [400, { 'Probe.Start': false }],
  ] as Array<[number, Signals]>,
  expect: [
    [10, { 'Probe.Lamp': false }],
    [30, { 'Probe.Lamp': true }],
    [90, { 'Probe.Lamp': true }],
    [150, { 'Probe.Lamp': false }],
    [250, { 'Probe.Lamp': true }],
    [350, { 'Probe.Lamp': false }],
  ] as Array<[number, Signals]>,
};

const CTD_IO: Declarations = {
  inputs: [
    ['Down', '%IX0.0'],
    ['Load', '%IX0.1'],
  ],
  outputs: [['Empty', '%QX0.0']],
};
const CTD_BODY = 'Stock(CD := Down, LD := Load, PV := 3);\nEmpty := Stock.Q;';
const pulses = (signal: string, times: number[]): Array<[number, Signals]> =>
  times.flatMap((at): Array<[number, Signals]> => [
    [at, { [signal]: true }],
    [at + 20, { [signal]: false }],
  ]);
const CTD_SCENARIO = {
  // LD loads PV = 3; three falling counts take CV to 0, and Q is CV <= 0.
  events: [
    [0, { 'Probe.Load': true, 'Probe.Down': false }],
    [20, { 'Probe.Load': false }],
    ...pulses('Probe.Down', [40, 80, 120]),
  ] as Array<[number, Signals]>,
  expect: [
    [10, { 'Probe.Empty': false }],
    [110, { 'Probe.Empty': false }],
    [130, { 'Probe.Empty': true }],
  ] as Array<[number, Signals]>,
};

const CTUD_IO: Declarations = {
  inputs: [
    ['Up', '%IX0.0'],
    ['Down', '%IX0.1'],
    ['Reset', '%IX0.2'],
  ],
  outputs: [
    ['AtTop', '%QX0.0'],
    ['AtBottom', '%QX0.1'],
  ],
};
const CTUD_BODY = 'Level(CU := Up, CD := Down, R := Reset, LD := FALSE, PV := 2);\nAtTop := Level.QU;\nAtBottom := Level.QD;';
const CTUD_SCENARIO = {
  // PV = 2: two counts up reach QU, two down reach QD (CV <= 0), R takes CV back to 0.
  events: [
    [0, { 'Probe.Up': false, 'Probe.Down': false, 'Probe.Reset': false }],
    ...pulses('Probe.Up', [20, 60]),
    ...pulses('Probe.Down', [100, 140]),
    ...pulses('Probe.Up', [180]),
    [220, { 'Probe.Reset': true }],
  ] as Array<[number, Signals]>,
  expect: [
    [10, { 'Probe.AtTop': false, 'Probe.AtBottom': true }],
    [50, { 'Probe.AtTop': false, 'Probe.AtBottom': false }],
    [90, { 'Probe.AtTop': true, 'Probe.AtBottom': false }],
    [130, { 'Probe.AtTop': false, 'Probe.AtBottom': false }],
    [170, { 'Probe.AtTop': false, 'Probe.AtBottom': true }],
    [210, { 'Probe.AtTop': false, 'Probe.AtBottom': false }],
    [240, { 'Probe.AtTop': false, 'Probe.AtBottom': true }],
  ] as Array<[number, Signals]>,
};

function stProgram(io: Declarations, locals: string, body: string): string {
  const list = (pairs: Array<[string, string]>) => pairs.map(([name, at]) => `${name} AT ${at} : BOOL;`).join(' ');
  return `PROGRAM Probe\nVAR_INPUT ${list(io.inputs)} END_VAR\nVAR_OUTPUT ${list(io.outputs)} END_VAR\nVAR ${locals} END_VAR\n${body}\nEND_PROGRAM\n`;
}
/** The same program in IL: `CAL` the block with its inputs, then load and store each output. */
function ilBlockProgram(io: Declarations, locals: string, call: string, outputs: Array<[string, string]>): string {
  const body = [`    CAL ${call}`, ...outputs.flatMap(([from, to]) => [`    LD ${from}`, `    ST ${to}`])].join('\n');
  return stProgram(io, locals, body);
}

const BLOCK_PROBES: Probe[] = [
  { construct: 'TP', language: 'ST', source: stProgram(TP_IO, 'Shot : TP;', TP_BODY), ...TP_SCENARIO },
  {
    construct: 'TP',
    language: 'LD',
    source: ladder({ ...TP_IO, local: [{ name: 'Shot', type: 'TP' }] }, [
      [
        { type: 'contact_no', variable: 'Start' },
        { type: 'function_block', fbType: 'TP', instance: 'Shot', parameters: { IN: 'CONNECTED', PT: 'T#100ms' } },
        { type: 'coil', variable: 'Lamp' },
      ],
    ]),
    ...TP_SCENARIO,
  },
  {
    construct: 'TP',
    language: 'FBD',
    source: diagram(
      TP_IO,
      { start: input('Start'), pt: constant('TIME', 'T#100ms'), shot: { type: 'TP', instanceName: 'Shot' }, lamp: output('Lamp') },
      ['start.OUT -> shot.IN', 'pt.OUT -> shot.PT', 'shot.Q -> lamp.IN'],
    ),
    ...TP_SCENARIO,
  },
  {
    construct: 'TP',
    language: 'IL',
    source: ilBlockProgram(TP_IO, 'Shot : TP;', 'Shot(IN := Start, PT := T#100ms)', [['Shot.Q', 'Lamp']]),
    ...TP_SCENARIO,
  },
  { construct: 'TP', language: 'SFC', source: chart({ ...TP_IO, local: [{ name: 'Shot', type: 'TP' }] }, TP_BODY), ...TP_SCENARIO },

  { construct: 'CTD', language: 'ST', source: stProgram(CTD_IO, 'Stock : CTD;', CTD_BODY), ...CTD_SCENARIO },
  {
    construct: 'CTD',
    language: 'LD',
    source: ladder({ ...CTD_IO, local: [{ name: 'Stock', type: 'CTD' }] }, [
      [
        { type: 'contact_no', variable: 'Down' },
        { type: 'function_block', fbType: 'CTD', instance: 'Stock', parameters: { CD: 'CONNECTED', LD: 'Load', PV: '3' } },
        { type: 'coil', variable: 'Empty' },
      ],
    ]),
    ...CTD_SCENARIO,
  },
  {
    construct: 'CTD',
    language: 'FBD',
    source: diagram(
      CTD_IO,
      {
        down: input('Down'),
        load: input('Load'),
        pv: constant('INT', 3),
        stock: { type: 'CTD', instanceName: 'Stock' },
        empty: output('Empty'),
      },
      ['down.OUT -> stock.CD', 'load.OUT -> stock.LD', 'pv.OUT -> stock.PV', 'stock.Q -> empty.IN'],
    ),
    ...CTD_SCENARIO,
  },
  {
    construct: 'CTD',
    language: 'IL',
    source: ilBlockProgram(CTD_IO, 'Stock : CTD;', 'Stock(CD := Down, LD := Load, PV := 3)', [['Stock.Q', 'Empty']]),
    ...CTD_SCENARIO,
  },
  { construct: 'CTD', language: 'SFC', source: chart({ ...CTD_IO, local: [{ name: 'Stock', type: 'CTD' }] }, CTD_BODY), ...CTD_SCENARIO },

  { construct: 'CTUD', language: 'ST', source: stProgram(CTUD_IO, 'Level : CTUD;', CTUD_BODY), ...CTUD_SCENARIO },
  {
    construct: 'CTUD',
    language: 'LD',
    source: ladder({ ...CTUD_IO, local: [{ name: 'Level', type: 'CTUD' }] }, [
      [
        { type: 'contact_no', variable: 'Up' },
        {
          type: 'function_block',
          fbType: 'CTUD',
          instance: 'Level',
          parameters: { CU: 'CONNECTED', CD: 'Down', R: 'Reset', LD: 'FALSE', PV: '2' },
          outputs: { QD: 'AtBottom' },
        },
        { type: 'coil', variable: 'AtTop' },
      ],
    ]),
    ...CTUD_SCENARIO,
  },
  {
    construct: 'CTUD',
    language: 'FBD',
    source: diagram(
      CTUD_IO,
      {
        up: input('Up'),
        down: input('Down'),
        reset: input('Reset'),
        load: constant('BOOL', false),
        pv: constant('INT', 2),
        level: { type: 'CTUD', instanceName: 'Level' },
        top: output('AtTop'),
        bottom: output('AtBottom'),
      },
      [
        'up.OUT -> level.CU',
        'down.OUT -> level.CD',
        'reset.OUT -> level.R',
        'load.OUT -> level.LD',
        'pv.OUT -> level.PV',
        'level.QU -> top.IN',
        'level.QD -> bottom.IN',
      ],
    ),
    ...CTUD_SCENARIO,
  },
  {
    construct: 'CTUD',
    language: 'IL',
    source: ilBlockProgram(CTUD_IO, 'Level : CTUD;', 'Level(CU := Up, CD := Down, R := Reset, LD := FALSE, PV := 2)', [
      ['Level.QU', 'AtTop'],
      ['Level.QD', 'AtBottom'],
    ]),
    ...CTUD_SCENARIO,
  },
  {
    construct: 'CTUD',
    language: 'SFC',
    source: chart({ ...CTUD_IO, local: [{ name: 'Level', type: 'CTUD' }] }, CTUD_BODY),
    ...CTUD_SCENARIO,
  },
];

// ---------------------------------------------------------------------------------------------------------------
// A user FUNCTION: Triple(X) = 3X + 1, called with 5 (Sel TRUE, 16) or 2 (Sel FALSE, 7).
// ---------------------------------------------------------------------------------------------------------------

const TRIPLE = 'FUNCTION Triple : INT\nVAR_INPUT X : INT; END_VAR\nTriple := X * 3 + 1;\nEND_FUNCTION\n';
const SEL_IO: Declarations = { inputs: [['Sel', '%IX0.0']], outputs: [['Hit', '%QX0.0']] };
const SEL_EVENTS: Array<[number, Signals]> = [
  [0, { 'Probe.Sel': false }],
  [50, { 'Probe.Sel': true }],
];
const FUNCTION_SCENARIO = {
  events: SEL_EVENTS,
  expect: [
    [20, { 'Probe.Hit': false }],
    [80, { 'Probe.Hit': true }],
  ] as Array<[number, Signals]>,
};
const FUNCTION_BODY = 'IF Sel THEN V := 5; ELSE V := 2; END_IF;\nHit := Triple(X := V) = 16;';

const FUNCTION_PROBES: Probe[] = [
  { construct: 'user FUNCTION', language: 'ST', source: TRIPLE + stProgram(SEL_IO, 'V : INT;', FUNCTION_BODY), ...FUNCTION_SCENARIO },
  {
    construct: 'user FUNCTION',
    language: 'LD',
    libraries: { 'Triple.st': TRIPLE },
    // A Ladder function box holds only the functions of its own table (comparison, arithmetic, MOVE, LIMIT, MIN, MAX).
    source: ladder(SEL_IO, [
      [
        { type: 'contact_no', variable: 'Sel' },
        { type: 'function', functionName: 'Triple', operands: ['5'], output: 'Hit' },
      ],
    ]),
    ...FUNCTION_SCENARIO,
    gap: { build: "names the unknown function 'Triple'" },
  },
  {
    construct: 'user FUNCTION',
    language: 'FBD',
    libraries: { 'Triple.st': TRIPLE },
    source: diagram(
      SEL_IO,
      {
        sel: input('Sel'),
        two: constant('INT', 2),
        five: constant('INT', 5),
        pick: { type: 'SEL' },
        triple: { type: 'Triple' },
        sixteen: constant('INT', 16),
        same: { type: 'EQ' },
        hit: output('Hit'),
      },
      [
        'sel.OUT -> pick.G',
        'two.OUT -> pick.IN0',
        'five.OUT -> pick.IN1',
        'pick.OUT -> triple.X',
        'triple.OUT -> same.IN1',
        'sixteen.OUT -> same.IN2',
        'same.OUT -> hit.IN',
      ],
    ),
    ...FUNCTION_SCENARIO,
  },
  {
    construct: 'user FUNCTION',
    language: 'IL',
    libraries: { 'Triple.st': TRIPLE },
    // IEC IL calls a function by its name, the accumulator being its first input.
    source: stProgram(
      SEL_IO,
      'V : INT := 2;',
      ['    LD Sel', '    JMPCN Call', '    LD 5', '    ST V', 'Call:', '    LD V', '    Triple', '    EQ 16', '    ST Hit'].join('\n'),
    ),
    ...FUNCTION_SCENARIO,
    gap: { build: "Unknown mnemonic 'Triple'" },
  },
  {
    construct: 'user FUNCTION',
    language: 'SFC',
    libraries: { 'Triple.st': TRIPLE },
    source: chart({ ...SEL_IO, local: [{ name: 'V', type: 'INT' }] }, FUNCTION_BODY),
    ...FUNCTION_SCENARIO,
  },
];

// ---------------------------------------------------------------------------------------------------------------
// Bit and word operations: each check is `Sel AND (<operation> = <result>)`, so all are FALSE before Sel and TRUE after.
// ---------------------------------------------------------------------------------------------------------------

interface WordCheck {
  out: string;
  type: 'BYTE' | 'WORD' | 'DWORD';
  value: number;
  op: 'AND' | 'OR' | 'XOR' | 'NOT' | 'SHL' | 'SHR' | 'ROL' | 'ROR';
  arg?: number;
  result: number;
}
const LOGIC: WordCheck[] = [
  { out: 'AndB', type: 'BYTE', value: 0xa5, op: 'AND', arg: 0x0f, result: 0x05 },
  { out: 'OrB', type: 'BYTE', value: 0xa5, op: 'OR', arg: 0x0f, result: 0xaf },
  { out: 'XorB', type: 'BYTE', value: 0xa5, op: 'XOR', arg: 0xff, result: 0x5a },
  { out: 'NotB', type: 'BYTE', value: 0xa5, op: 'NOT', result: 0x5a },
  { out: 'AndW', type: 'WORD', value: 0x1234, op: 'AND', arg: 0x00ff, result: 0x0034 },
  { out: 'OrW', type: 'WORD', value: 0x1234, op: 'OR', arg: 0xf000, result: 0xf234 },
  { out: 'XorW', type: 'WORD', value: 0x1234, op: 'XOR', arg: 0xffff, result: 0xedcb },
  { out: 'NotW', type: 'WORD', value: 0x1234, op: 'NOT', result: 0xedcb },
  { out: 'AndD', type: 'DWORD', value: 0x12345678, op: 'AND', arg: 0xffff0000, result: 0x12340000 },
  { out: 'OrD', type: 'DWORD', value: 0x12345678, op: 'OR', arg: 0x0000ffff, result: 0x1234ffff },
  { out: 'XorD', type: 'DWORD', value: 0x12345678, op: 'XOR', arg: 0xffffffff, result: 0xedcba987 },
  { out: 'NotD', type: 'DWORD', value: 0x12345678, op: 'NOT', result: 0xedcba987 },
];
// The width of the type decides what a shift drops and what a rotation brings round.
const SHIFTS: WordCheck[] = [
  { out: 'ShlB', type: 'BYTE', value: 0x81, op: 'SHL', arg: 1, result: 0x02 },
  { out: 'ShrB', type: 'BYTE', value: 0x80, op: 'SHR', arg: 7, result: 0x01 },
  { out: 'RolB', type: 'BYTE', value: 0x81, op: 'ROL', arg: 1, result: 0x03 },
  { out: 'RorB', type: 'BYTE', value: 0x01, op: 'ROR', arg: 1, result: 0x80 },
  { out: 'ShlW', type: 'WORD', value: 0x4001, op: 'SHL', arg: 2, result: 0x0004 },
  { out: 'ShrW', type: 'WORD', value: 0x8000, op: 'SHR', arg: 15, result: 0x0001 },
  { out: 'RolW', type: 'WORD', value: 0x8001, op: 'ROL', arg: 1, result: 0x0003 },
  { out: 'RorW', type: 'WORD', value: 0x0001, op: 'ROR', arg: 1, result: 0x8000 },
  { out: 'ShlD', type: 'DWORD', value: 0x40000001, op: 'SHL', arg: 2, result: 0x00000004 },
  { out: 'ShrD', type: 'DWORD', value: 0x80000000, op: 'SHR', arg: 31, result: 0x00000001 },
  { out: 'RolD', type: 'DWORD', value: 0x80000001, op: 'ROL', arg: 1, result: 0x00000003 },
  { out: 'RorD', type: 'DWORD', value: 0x00000001, op: 'ROR', arg: 1, result: 0x80000000 },
];
const hex = (type: WordCheck['type'], value: number) => `${type}#16#${value.toString(16).toUpperCase()}`;
const operand = (check: WordCheck) => `V${check.out}`;
const stExpression = (check: WordCheck): string =>
  check.op === 'NOT'
    ? `NOT ${operand(check)}`
    : ['SHL', 'SHR', 'ROL', 'ROR'].includes(check.op)
      ? `${check.op}(${operand(check)}, ${check.arg})`
      : `${operand(check)} ${check.op} ${hex(check.type, check.arg!)}`;
const wordIo = (checks: WordCheck[]): Declarations => ({
  inputs: [['Sel', '%IX0.0']],
  outputs: checks.map((check, index): [string, string] => [check.out, `%QX${Math.floor(index / 8)}.${index % 8}`]),
});
const wordLocals = (checks: WordCheck[], literal = (check: WordCheck) => hex(check.type, check.value)) =>
  checks.map((check) => `${operand(check)} : ${check.type} := ${literal(check)};`).join(' ');
const wordBody = (checks: WordCheck[]) =>
  checks.map((check) => `${check.out} := Sel AND ((${stExpression(check)}) = ${hex(check.type, check.result)});`).join('\n');
const wordScenario = (checks: WordCheck[]) => ({
  events: SEL_EVENTS,
  expect: [
    [20, Object.fromEntries(checks.map((check) => [`Probe.${check.out}`, false]))],
    [80, Object.fromEntries(checks.map((check) => [`Probe.${check.out}`, true]))],
  ] as Array<[number, Signals]>,
});
/** IL: load the operand, apply the operator, compare, AND with Sel, store. The IL lexer reads `16#FF`, not `WORD#16#FF`. */
const ilHex = (value: number) => `16#${value.toString(16).toUpperCase()}`;
const ilWordBody = (checks: WordCheck[]) =>
  checks
    .flatMap((check) => [
      `    LD ${operand(check)}`,
      check.op === 'NOT' ? '    NOT' : `    ${check.op} ${['AND', 'OR', 'XOR'].includes(check.op) ? ilHex(check.arg!) : check.arg}`,
      `    EQ ${ilHex(check.result)}`,
      '    AND Sel',
      `    ST ${check.out}`,
    ])
    .join('\n');
/** FBD: the operand is a constant, picked by SEL against zero so the check is FALSE until Sel; then the gate, EQ and the output. */
function fbdWord(checks: WordCheck[]): string {
  const blocks: Record<string, Record<string, unknown>> = { sel: input('Sel') };
  const wires: string[] = [];
  checks.forEach((check, i) => {
    Object.assign(blocks, {
      [`zero${i}`]: constant(check.type, 0),
      [`value${i}`]: constant(check.type, check.value),
      [`pick${i}`]: { type: 'SEL' },
      // The editor gives a shift block one input port (IN) only; the probe declares IN and N, so that the transpiler is what answers
      [`op${i}`]: ['SHL', 'SHR', 'ROL', 'ROR'].includes(check.op)
        ? {
            type: check.op,
            inputs: [
              { name: 'IN', type: 'ANY' },
              { name: 'N', type: 'INT' },
            ],
            outputs: [{ name: 'OUT', type: 'ANY' }],
          }
        : { type: check.op },
      [`result${i}`]: constant(check.type, check.result),
      [`same${i}`]: { type: 'EQ' },
      [`out${i}`]: output(check.out),
    });
    wires.push(`sel.OUT -> pick${i}.G`, `zero${i}.OUT -> pick${i}.IN0`, `value${i}.OUT -> pick${i}.IN1`);
    if (check.op === 'NOT') wires.push(`pick${i}.OUT -> op${i}.IN`);
    else if (['AND', 'OR', 'XOR'].includes(check.op)) {
      blocks[`arg${i}`] = constant(check.type, check.arg);
      wires.push(`pick${i}.OUT -> op${i}.IN1`, `arg${i}.OUT -> op${i}.IN2`);
    } else {
      // SHL(IN, N), as the compiler's library declares it
      blocks[`arg${i}`] = constant('INT', check.arg);
      wires.push(`pick${i}.OUT -> op${i}.IN`, `arg${i}.OUT -> op${i}.N`);
    }
    wires.push(`op${i}.OUT -> same${i}.IN1`, `result${i}.OUT -> same${i}.IN2`, `same${i}.OUT -> out${i}.IN`);
  });
  return diagram(wordIo(checks), blocks, wires);
}
const wordProbes = (construct: string, checks: WordCheck[], gaps: Partial<Record<Language, Probe['gap']>>): Probe[] =>
  (['ST', 'LD', 'FBD', 'IL', 'SFC'] as Language[]).map((language) => ({
    construct,
    language,
    source:
      language === 'ST'
        ? stProgram(wordIo(checks), wordLocals(checks), wordBody(checks))
        : language === 'IL'
          ? stProgram(
              wordIo(checks),
              wordLocals(checks, (check) => ilHex(check.value)),
              ilWordBody(checks),
            )
          : language === 'FBD'
            ? fbdWord(checks)
            : language === 'SFC'
              ? chart(
                  {
                    ...wordIo(checks),
                    local: checks.map((check) => ({ name: operand(check), type: check.type, initialValue: check.value })),
                  },
                  wordBody(checks),
                )
              : // A Ladder function box holds only comparison, arithmetic, MOVE, LIMIT, MIN and MAX.
                ladder(
                  {
                    ...wordIo(checks.slice(0, 1)),
                    local: [
                      { name: operand(checks[0]!), type: checks[0]!.type },
                      { name: 'Scratch', type: checks[0]!.type },
                    ],
                  },
                  [
                    [
                      { type: 'contact_no', variable: 'Sel' },
                      {
                        type: 'function',
                        functionName: checks[0]!.op,
                        operands: [operand(checks[0]!), String(checks[0]!.arg)],
                        output: 'Scratch',
                      },
                    ],
                  ],
                ),
    ...(language === 'LD' ? wordScenario(checks.slice(0, 1)) : wordScenario(checks)),
    ...(gaps[language] ? { gap: gaps[language] } : {}),
  }));

const WORD_PROBES: Probe[] = [
  ...wordProbes('AND, OR, XOR, NOT on BYTE, WORD, DWORD', LOGIC, { LD: { build: "names the unknown function 'AND'" } }),
  ...wordProbes('SHL, SHR, ROL, ROR', SHIFTS, {
    LD: { build: "names the unknown function 'SHL'" },
    FBD: { build: '(SHL): this block type is not supported by the FBD transpiler' },
    IL: { build: "Unknown mnemonic 'SHL'" },
  }),
];

// ---------------------------------------------------------------------------------------------------------------
// Statements, declarations and types: Structured Text only (an SFC action body is Structured Text too).
// ---------------------------------------------------------------------------------------------------------------

const io = (outputs: string[]): Declarations => ({
  inputs: [['Sel', '%IX0.0']],
  outputs: outputs.map((name, index): [string, string] => [name, `%QX0.${index}`]),
});
/** Every output is `before` until Sel turns TRUE at 50 ms and `after` from then on. */
const selScenario = (before: Signals, after: Signals) => ({
  events: SEL_EVENTS,
  expect: [
    [20, Object.fromEntries(Object.entries(before).map(([name, value]) => [`Probe.${name}`, value]))],
    [80, Object.fromEntries(Object.entries(after).map(([name, value]) => [`Probe.${name}`, value]))],
  ] as Array<[number, Signals]>,
});

const ST_PROBES: Probe[] = [
  {
    construct: 'WHILE',
    language: 'ST',
    source: stProgram(
      io(['Sum55', 'Sum10']),
      'I : INT; N : INT; Sum : INT;',
      'IF Sel THEN N := 10; ELSE N := 4; END_IF;\nI := 0; Sum := 0;\nWHILE I < N DO\n  I := I + 1; Sum := Sum + I;\nEND_WHILE;\nSum55 := Sum = 55; Sum10 := Sum = 10;',
    ),
    ...selScenario({ Sum55: false, Sum10: true }, { Sum55: true, Sum10: false }),
  },
  {
    construct: 'REPEAT',
    language: 'ST',
    // The body runs once before UNTIL is tested: with N = 0 the sum is 1, not 0.
    source: stProgram(
      io(['Sum55', 'RanOnce']),
      'I : INT; N : INT; Sum : INT;',
      'IF Sel THEN N := 10; ELSE N := 0; END_IF;\nI := 0; Sum := 0;\nREPEAT\n  I := I + 1; Sum := Sum + I;\nUNTIL I >= N\nEND_REPEAT;\nSum55 := Sum = 55; RanOnce := Sum = 1;',
    ),
    ...selScenario({ Sum55: false, RanOnce: true }, { Sum55: true, RanOnce: false }),
  },
  {
    construct: 'FOR',
    language: 'ST',
    // 1 TO N, and a negative step: 10, 7, 4, 1 is four turns.
    source: stProgram(
      io(['Sum55', 'Sum6', 'FourDown']),
      'I : INT; N : INT; Sum : INT; Turns : INT;',
      'IF Sel THEN N := 10; ELSE N := 3; END_IF;\nSum := 0;\nFOR I := 1 TO N DO Sum := Sum + I; END_FOR;\nTurns := 0;\nFOR I := 10 TO 1 BY -3 DO Turns := Turns + 1; END_FOR;\nSum55 := Sum = 55; Sum6 := Sum = 6; FourDown := Turns = 4;',
    ),
    ...selScenario({ Sum55: false, Sum6: true, FourDown: true }, { Sum55: true, Sum6: false, FourDown: true }),
  },
  {
    construct: 'ARRAY',
    language: 'ST',
    source: stProgram(
      io(['Is25', 'Is4']),
      'Squares : ARRAY[1..5] OF INT; I : INT; Pick : INT;',
      'FOR I := 1 TO 5 DO Squares[I] := I * I; END_FOR;\nIF Sel THEN Pick := 5; ELSE Pick := 2; END_IF;\nIs25 := Squares[Pick] = 25; Is4 := Squares[Pick] = 4;',
    ),
    ...selScenario({ Is25: false, Is4: true }, { Is25: true, Is4: false }),
  },
  {
    construct: 'STRUCT',
    language: 'ST',
    source:
      'TYPE MotorData :\nSTRUCT\n  Running : BOOL;\n  Speed : INT;\nEND_STRUCT;\nEND_TYPE\n' +
      stProgram(
        io(['Run', 'Fast']),
        'M : MotorData;',
        'M.Running := Sel;\nIF M.Running THEN M.Speed := 1500; ELSE M.Speed := 0; END_IF;\nRun := M.Running; Fast := M.Speed = 1500;',
      ),
    ...selScenario({ Run: false, Fast: false }, { Run: true, Fast: true }),
  },
  {
    construct: 'VAR_GLOBAL',
    language: 'ST',
    // The global is declared in its own file, written by the program and read by a function block through VAR_EXTERNAL.
    libraries: { 'Globals.st': 'VAR_GLOBAL\n  Setpoint : INT;\nEND_VAR\n' },
    source:
      'FUNCTION_BLOCK Watcher\nVAR_EXTERNAL Setpoint : INT; END_VAR\nVAR_OUTPUT High : BOOL; END_VAR\nHigh := Setpoint > 100;\nEND_FUNCTION_BLOCK\n' +
      stProgram(
        io(['High', 'Seen']),
        'W : Watcher;',
        'IF Sel THEN Setpoint := 150; ELSE Setpoint := 50; END_IF;\nW();\nHigh := W.High; Seen := Setpoint = 150;',
      ),
    ...selScenario({ High: false, Seen: false }, { High: true, Seen: true }),
  },
  {
    construct: 'RETAIN',
    language: 'ST',
    // Inside one run a RETAIN variable is an ordinary variable; what RETAIN adds (the value survives a restart) needs a
    // restart, which a scenario cannot ask for. Where it is placed is checked by the debug-map test below.
    source: stProgram(
      io(['Counted2']),
      'Edge : R_TRIG; END_VAR\nVAR RETAIN Count : INT;',
      'Edge(CLK := Sel);\nIF Edge.Q THEN Count := Count + 2; END_IF;\nCounted2 := Count = 2;',
    ),
    ...selScenario({ Counted2: false }, { Counted2: true }),
  },
  {
    construct: 'STRING',
    language: 'ST',
    source: stProgram(
      io(['LenOk', 'EqOk', 'LeftOk', 'FindOk']),
      'Name : STRING; Tag : STRING[20];',
      "IF Sel THEN Name := 'PUMP'; ELSE Name := 'FAN'; END_IF;\nTag := CONCAT(Name, '-01');\n" +
        "LenOk := LEN(Tag) = 7; EqOk := Tag = 'PUMP-01'; LeftOk := LEFT(Tag, 4) = 'PUMP'; FindOk := FIND(Tag, '-') = 5;",
    ),
    ...selScenario({ LenOk: false, EqOk: false, LeftOk: false, FindOk: false }, { LenOk: true, EqOk: true, LeftOk: true, FindOk: true }),
  },
  {
    construct: 'REAL',
    language: 'ST',
    // 2048 counts of a 0..4095 input are 50.012 %; 2048 / 4096 is exactly 0.5 in binary floating point.
    source: stProgram(
      io(['InBand', 'Rounded', 'Half']),
      'Raw : INT; Level : REAL;',
      'IF Sel THEN Raw := 2048; ELSE Raw := 0; END_IF;\nLevel := INT_TO_REAL(Raw) * 100.0 / 4095.0;\n' +
        'InBand := Level > 50.0 AND Level < 50.1; Rounded := REAL_TO_INT(Level) = 50; Half := INT_TO_REAL(Raw) / 4096.0 = 0.5;',
    ),
    ...selScenario({ InBand: false, Rounded: false, Half: false }, { InBand: true, Rounded: true, Half: true }),
  },
];

const PROBES: Probe[] = [...BLOCK_PROBES, ...FUNCTION_PROBES, ...WORD_PROBES, ...ST_PROBES];

// ---------------------------------------------------------------------------------------------------------------

let workRoot = '';
let previousBinary: string | undefined;
beforeAll(() => {
  workRoot = mkdtempSync(join(tmpdir(), 'zplc-l7-support-'));
  previousBinary = process.env.ZPLC_NATIVE_SIM_BIN;
  process.env.ZPLC_NATIVE_SIM_BIN = nativeRuntimeBinary;
});
afterAll(() => {
  if (previousBinary === undefined) delete process.env.ZPLC_NATIVE_SIM_BIN;
  else process.env.ZPLC_NATIVE_SIM_BIN = previousBinary;
  rmSync(workRoot, { recursive: true, force: true });
});

let counter = 0;
/** A lesson-shaped workspace: zplc.json with one cyclic 10 ms task, src/ with the program and its libraries, tests/ with the scenario. */
function workspace(probe: Probe): string {
  const root = join(workRoot, `probe-${counter++}`);
  const program = `Probe.${EXTENSION[probe.language]}`;
  mkdirSync(join(root, 'src'), { recursive: true });
  mkdirSync(join(root, 'tests'), { recursive: true });
  const manifest = {
    schemaVersion: 2,
    name: 'Probe',
    version: '1.0.0',
    target: { board: 'posix' },
    tasks: [{ name: 'MainTask', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: [program] }],
  };
  writeFileSync(join(root, 'zplc.json'), JSON.stringify(manifest, null, 2));
  writeFileSync(join(root, 'src', program), probe.source);
  for (const [file, text] of Object.entries(probe.libraries ?? {})) writeFileSync(join(root, 'src', file), text);
  const scenario = {
    schemaVersion: 1,
    id: 'Probe',
    tickMs: 10,
    durationMs: 500,
    events: probe.events.map(([atMs, set]) => ({ atMs, set })),
    expectations: probe.expect.map(([atMs, condition]) => ({ kind: 'AT', atMs, condition })),
  };
  writeFileSync(join(root, 'tests', 'probe.scenario.json'), JSON.stringify(scenario, null, 2));
  return root;
}

/** The test name the matrix cites: `<construct> in <language>`, then what a lesson can do with it. */
const title = (probe: Probe) =>
  `${probe.construct} in ${probe.language}: ${probe.gap === undefined ? 'a lesson can teach it' : 'a gap, the run shows it'}`;

describe('L7 support: what a lesson can teach (course review L7)', () => {
  for (const probe of PROBES) {
    itNative(
      title(probe),
      async () => {
        const run = await scenarioRun(workspace(probe), 'Probe');
        const said = JSON.stringify(run.evidence.diagnostics);
        if (probe.gap === undefined) {
          expect(said).toBe('[]');
          expect(run.ok).toBe(true);
          return;
        }
        expect(run.ok).toBe(false);
        if ('build' in probe.gap) expect(said).toContain(probe.gap.build);
        else for (const signal of probe.gap.wrong) expect(said).toContain(signal);
      },
      60_000,
    );
  }

  itNative('RETAIN in ST: the compiler places a RETAIN variable in the retentive region', async () => {
    const probe = ST_PROBES.find((candidate) => candidate.construct === 'RETAIN')!;
    const compiled = await compilerCompile(workspace(probe));
    expect(compiled.ok).toBe(true);
    const vars = compiled.debugMap!.pou.Probe!.vars;
    expect(vars.Count!.region).toBe('RETAIN');
    expect(vars.Counted2!.region).toBe('OPI');
  });
});

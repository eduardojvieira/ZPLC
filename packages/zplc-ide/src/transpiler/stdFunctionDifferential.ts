/**
 * The native differential of LNG-029 and LNG-030: for each function the compiler registers, one project in which an FBD diagram, a
 * Ladder rung and the same call in Structured Text compute the call with the operands of the function's reference example, and the
 * ST program compares the three inside the runtime. Test support only; the production code never imports it.
 *
 * A task holds one PROGRAM (`assertTaskProgramCardinality`), so the three programs run in three tasks; they share their results
 * through located memory (`%M`) that two programs declare at the same address: the FBD result `LngFbd` (`%M7200`) and the Ladder
 * result `LngLd` (`%M7600`), high in the work memory so that no automatic variable meets them. The ST program sets the flags
 * `LngSameF` (`%QX0.0`) and `LngSameL` (`%QX0.1`), then writes into `LngFbd` and `LngLd` a value that differs from its own result, so
 * that a diagram or a rung that does not compute in the next scan is caught even when the right result is the default value of its
 * type (NAND, TAN, CYCLE_TIME, CLEAR). The diagram and the rung also set
 * `FbdRan` (`%QX0.2`) and `LdRan` (`%QX0.3`), which is all a function that returns nothing can show.
 */
import { getAllFnNames } from '@zplc/compiler';

import type { ProgramSource } from '../compiler';
import type { ZPLCProjectConfig } from '../types';
import { stdFunction, type StdFunction } from '../catalog/stdFunctions';
import { getDefaultPorts } from '../models/fbd';

/** Every function of the differential: every name the compiler registers. */
export const DIFFERENTIAL_FUNCTIONS: readonly string[] = [...getAllFnNames()].sort();

/** A reference example: a VAR block, then statements; `scans` is how many scans it needs (UPTIME). */
export interface Example {
  source: string;
  scans?: number;
}

export interface DifferentialCase {
  name: string;
  config: ZPLCProjectConfig;
  sources: ProgramSource[];
  /** Scans to run before the flags are read. */
  scans: number;
  /** The call as the ST program writes it, for a failure message. */
  call: string;
}

interface Declared {
  name: string;
  type: string;
  init?: string;
}

const STRING_LITERAL = /^'(?:[^'$]|\$.)*'$/;

/** The variables of the example's VAR block. */
function exampleVariables(source: string): Declared[] {
  const block = source.slice(source.indexOf('VAR') + 3, source.indexOf('END_VAR'));
  return [...block.matchAll(/^\s*(\w+)\s*:\s*([\w[\]]+)\s*(?::=\s*(.+?))?\s*;/gm)].map(([, name, type, init]) => ({
    name: name!,
    type: type!,
    ...(init === undefined ? {} : { init }),
  }));
}

/** The arguments of the call that starts at `open` (the index of its parenthesis), split at the commas of its own level. */
function callArguments(text: string, open: number): string[] {
  const args: string[] = [];
  let depth = 0;
  let start = open + 1;
  for (let index = open; index < text.length; index += 1) {
    const char = text[index];
    if (char === "'") {
      // a STRING literal: its parentheses and commas are text (a quoted quote '' ends it and starts it again)
      for (index += 1; index < text.length && text[index] !== "'"; index += 1);
      continue;
    }
    if (char === '(') depth += 1;
    else if (char === ')' && --depth === 0) {
      args.push(text.slice(start, index).trim());
      break;
    } else if (char === ',' && depth === 1) {
      args.push(text.slice(start, index).trim());
      start = index + 1;
    }
  }
  return args.length === 1 && args[0] === '' ? [] : args;
}

/**
 * The operands of the first call of `name` in the statements of the example, and the variable it is stored in when the call is the
 * whole statement.
 */
function exampleCall(name: string, source: string): { operands: string[]; target?: string } {
  const body = source.slice(source.indexOf('END_VAR') + 'END_VAR'.length);
  if (name === 'MOD') {
    // the call form of MOD does not parse: the example writes `a MOD b`
    const [, target, a, b] = body.match(/(\w+)\s*:=\s*(.+?)\s+MOD\s+(.+?)\s*;/)!;
    return { operands: [a!, b!], target };
  }
  const at = body.search(new RegExp(`\\b${name}\\(`));
  if (at < 0) throw new Error(`the example of ${name} does not call it`);
  const open = body.indexOf('(', at);
  const operands = callArguments(body, open);
  const statement = body.slice(body.lastIndexOf('\n', at) + 1, body.indexOf(';', at) + 1).trim();
  const whole = statement.match(new RegExp(`^(\\w+)\\s*:=\\s*${name}\\(.*\\);$`));
  return { operands, ...(whole ? { target: whole[1] } : {}) };
}

/** A literal of the example as the value a diagram or a rung stores: a number, a BOOL, or the text of a STRING or a TIME. */
function literalValue(text: string): unknown {
  if (text === 'TRUE' || text === 'FALSE') return text === 'TRUE';
  if (STRING_LITERAL.test(text)) return text.slice(1, -1).replace(/\$(.)/g, '$1');
  const based = text.match(/^(\d+)#([0-9A-Fa-f_]+)$/);
  if (based) return parseInt(based[2]!.replaceAll('_', ''), Number(based[1]));
  const number = Number(text);
  return Number.isNaN(number) ? text : number;
}

const GENERIC = new Set(['ANY', 'ANY_NUM', 'ANY_INT', 'ANY_BIT']);

function fbdDiagram(
  record: StdFunction,
  operands: string[],
  variables: Declared[],
  result: string | undefined,
  pins: string[],
  sink: string,
): string {
  const known = new Map(variables.map((variable) => [variable.name.toUpperCase(), variable]));
  const pinType = (pin: string) => record.inputs.find(([name]) => name === pin)?.[1] ?? record.inputs[record.inputs.length - 1]![1];
  const blocks: unknown[] = [];
  const connections: unknown[] = [];
  const ports = getDefaultPorts(record.name);
  const inputs = record.variadic ? pins.map((pin) => ({ name: pin, type: pinType(pin) })) : undefined;
  blocks.push({ id: 'fn', type: record.name, position: { x: 300, y: 0 }, ...(inputs ? { inputs, outputs: ports.outputs } : {}) });
  operands.forEach((operand, index) => {
    const id = `op${index}`;
    const type = pinType(pins[index]!);
    if (known.has(operand.toUpperCase())) blocks.push({ id, type: 'input', variableName: operand, position: { x: 0, y: index * 60 } });
    else
      blocks.push({
        id,
        type: 'constant',
        value: literalValue(operand),
        // a constant into a generic pin has the type of the result, as the ST compiler gives the literal
        dataType: GENERIC.has(type) ? result : type,
        position: { x: 0, y: index * 60 },
      });
    connections.push({ id: `w${index}`, from: { block: id, port: 'OUT' }, to: { block: 'fn', port: pins[index] } });
  });
  if (result) {
    blocks.push({ id: 'out', type: 'output', variableName: sink, position: { x: 600, y: 0 } });
    connections.push({ id: 'wout', from: { block: 'fn', port: 'OUT' }, to: { block: 'out', port: 'IN' } });
  }
  blocks.push({ id: 'one', type: 'constant', value: true, position: { x: 300, y: 300 } });
  blocks.push({ id: 'ran', type: 'output', variableName: 'FbdRan', position: { x: 600, y: 300 } });
  connections.push({ id: 'wran', from: { block: 'one', port: 'OUT' }, to: { block: 'ran', port: 'IN' } });
  return JSON.stringify({
    name: 'FbdCall',
    variables: {
      local: [...variables.map((variable) => local(variable)), ...(result && sink !== 'LngFbd' ? [{ name: sink, type: result }] : [])],
      inputs: [],
      outputs: [
        ...(result ? [{ name: 'LngFbd', type: result, address: '%M7200' }] : []),
        { name: 'FbdRan', type: 'BOOL', address: '%QX0.2' },
      ],
    },
    blocks,
    connections,
  });
}

const local = (variable: Declared) => ({
  name: variable.name,
  type: variable.type,
  ...(variable.init === undefined ? {} : { initialValue: literalValue(variable.init) }),
});

/** The bit strings, whose variables a Ladder file declares without an initial value. */
const BIT_STRINGS = new Set(['BYTE', 'WORD', 'DWORD', 'LWORD']);

function ldRung(record: StdFunction, given: string[], variables: Declared[], result: string | undefined, sink: string): string {
  const cell = (element: Record<string, unknown>, col: number) => ({ element: { ...element, row: 0, col }, hasWire: true });
  // an initialised bit-string variable of the example is its value written as a typed literal: Ladder initialises no bit string
  const initialised = new Map(
    variables
      .filter((variable) => BIT_STRINGS.has(variable.type) && variable.init !== undefined)
      .map((variable) => [variable.name.toUpperCase(), variable]),
  );
  const operands = given.map((operand) => {
    const variable = initialised.get(operand.toUpperCase());
    if (!variable) return operand;
    // LWORD#5 does not build even in ST (the code generator leaves the stack empty), so an LWORD is the untyped value
    const value = String(literalValue(variable.init!));
    return variable.type === 'LWORD' ? value : `${variable.type}#${value}`;
  });
  return JSON.stringify({
    name: 'LdCall',
    variables: {
      local: [
        ...variables.filter((variable) => !initialised.has(variable.name.toUpperCase())).map((variable) => local(variable)),
        ...(result ? [{ name: 'LngLd', type: result, address: '%M7600' }] : []),
        ...(result && sink !== 'LngLd' ? [{ name: sink, type: result }] : []),
      ],
      inputs: [],
      outputs: [{ name: 'LdRan', type: 'BOOL', address: '%QX0.3' }],
    },
    rungs: [
      {
        id: 'r1',
        number: 1,
        gridConfig: { cols: 2, rows: 1, cellWidth: 80, cellHeight: 60 },
        grid: [
          [
            cell({ id: 'f1', type: 'function', functionName: record.name, operands, ...(result ? { output: sink } : {}) }, 0),
            cell({ id: 'k1', type: 'coil', variable: 'LdRan' }, 1),
          ],
        ],
        branches: [],
        verticalLinks: [],
      },
    ],
  });
}

/** The project of one function: its call in ST, FBD and Ladder, and the comparison in the ST program. */
/**
 * A value of the type of the result that is never the result itself: what the ST program leaves in `LngFbd` and `LngLd` after it
 * compares them, so that the next scan has to compute them again.
 */
function otherThan(type: string): string {
  if (type === 'STRING') return "CONCAT(LngSt, 'x')";
  return type === 'REAL' || type === 'LREAL' ? 'LngSt + 1.0' : 'NOT LngSt';
}

/**
 * The project of one function: its call in ST, FBD and Ladder, and the comparison in the ST program. `discardResults` is the fault
 * probe of the differential: the diagram and the rung store their results elsewhere, as boxes that compute nothing would, and every
 * function with a result must then differ.
 */
export function differentialCase(name: string, example: Example, { discardResults = false } = {}): DifferentialCase {
  const record = stdFunction(name);
  if (!record) throw new Error(`${name} is not a registered function`);
  const variables = exampleVariables(example.source);
  const { operands, target } = exampleCall(name, example.source);
  const targetType = target ? variables.find((variable) => variable.name.toUpperCase() === target.toUpperCase())?.type : undefined;
  const result = record.returns === 'VOID' ? undefined : (targetType ?? record.returns);
  const extra = Math.max(0, operands.length - record.inputs.length);
  const pins = [
    ...record.inputs.map(([pin]) => pin),
    ...Array.from({ length: extra }, (_, index) => `IN${record.inputs.length - 1 + index}`),
  ];
  const call = name === 'MOD' ? `${operands[0]} MOD ${operands[1]}` : `${name}(${operands.join(', ')})`;
  const same = (other: string) => (result === 'STRING' ? `EQ_STRING(${other}, LngSt)` : `${other} = LngSt`);
  const st = [
    'PROGRAM StCall',
    'VAR',
    ...variables.map((variable) => `    ${variable.name} : ${variable.type}${variable.init === undefined ? '' : ` := ${variable.init}`};`),
    ...(result ? [`    LngSt : ${result};`, `    LngFbd AT %M7200 : ${result};`, `    LngLd AT %M7600 : ${result};`] : []),
    '    LngSameF AT %QX0.0 : BOOL;',
    '    LngSameL AT %QX0.1 : BOOL;',
    'END_VAR',
    ...(result
      ? [
          `LngSt := ${call};`,
          `LngSameF := ${same('LngFbd')};`,
          `LngSameL := ${same('LngLd')};`,
          `LngFbd := ${otherThan(result)};`,
          `LngLd := ${otherThan(result)};`,
        ]
      : [`${call};`, 'LngSameF := TRUE;', 'LngSameL := TRUE;']),
    'END_PROGRAM',
    '',
  ].join('\n');
  // the diagram and the rung run first in each scan, so the ST program compares the values of the same scan
  const task = (taskName: string, program: string, priority: number) => ({
    name: taskName,
    trigger: 'cyclic' as const,
    interval_ms: 10,
    priority,
    programs: [program],
  });
  return {
    name,
    config: { name: 'Lng', version: '1.0.0', tasks: [task('TFbd', 'fbd', 1), task('TLd', 'ld', 2), task('TSt', 'st', 3)] },
    sources: [
      {
        name: 'fbd',
        content: fbdDiagram(record, operands, variables, result, pins, discardResults ? 'LngSink' : 'LngFbd'),
        language: 'FBD',
        sourceRef: 'src/fbd.fbd.json',
      },
      {
        name: 'ld',
        content: ldRung(record, operands, variables, result, discardResults ? 'LngSink' : 'LngLd'),
        language: 'LD',
        sourceRef: 'src/ld.ld.json',
      },
      { name: 'st', content: st, language: 'ST', sourceRef: 'src/st.st' },
    ],
    scans: Math.max(1, example.scans ?? 1) + 2,
    call,
  };
}

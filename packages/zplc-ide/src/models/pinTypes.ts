/**
 * Pin types of an FBD diagram (LNG-013): which output may feed which input, and the reason when it may not.
 *
 * The rules are the ones the compiler applies to an assignment (CMP-005): integers, bit strings and the real types form one
 * family of numbers, an integer converts to a real type, one real type to the other (the build warns when an LREAL is
 * narrowed to a REAL), and BOOL, TIME, DATE, TOD, DT and STRING take their own type only. The compiler keeps its rules private, so the
 * table below is the editor's one copy and
 * `pinTypes.test.ts` compiles an assignment for every pair of elementary types and fails when the two disagree.
 */

import { stdFunction } from '../catalog/stdFunctions';
import {
  getDefaultPorts,
  isComparison,
  isLogicGate,
  isMathOperator,
  type FBDBlock,
  type FBDConnectionEndpoint,
  type FBDModel,
  type FBDPort,
} from './fbd';
import { findProjectBlock, type ProjectBlock } from './projectBlocks';

const INTEGERS = ['SINT', 'INT', 'DINT', 'LINT', 'USINT', 'UINT', 'UDINT', 'ULINT', 'BYTE', 'WORD', 'DWORD', 'LWORD'];
const REALS = ['REAL', 'LREAL'];
const BIT_STRINGS = ['BYTE', 'WORD', 'DWORD', 'LWORD'];
const STRINGS = ['STRING', 'WSTRING'];
const DATES = ['DATE', 'TOD', 'DT'];
const ALIASES: Record<string, string> = { TIME_OF_DAY: 'TOD', DATE_AND_TIME: 'DT' };

/** The generic types of IEC 61131-3 that a pin may be declared with, and the elementary types each one admits. */
const GENERIC: Record<string, readonly string[]> = {
  ANY_NUM: [...INTEGERS, ...REALS, 'TIME', ...DATES],
  ANY_MAGNITUDE: [...INTEGERS, ...REALS, 'TIME'],
  ANY_INT: INTEGERS,
  ANY_REAL: REALS,
  ANY_BIT: ['BOOL', ...BIT_STRINGS],
  ANY_STRING: STRINGS,
  ANY_DATE: DATES,
};

/** What a generic pin takes, for the reason. */
const TAKES: Record<string, string> = {
  ANY_NUM: 'numbers',
  ANY_MAGNITUDE: 'numbers and times',
  ANY_INT: 'integers',
  ANY_REAL: 'real numbers',
  ANY_BIT: 'a BOOL or a bit string',
  ANY_STRING: 'strings',
  ANY_DATE: 'dates and times',
};

const SIGNED = ['SINT', 'INT', 'DINT', 'LINT'];
const UNSIGNED = ['USINT', 'UINT', 'UDINT', 'ULINT'];

/**
 * The elementary types a generic pin of a standard function takes (LNG-029, LNG-030). The compiler accepts `SHL(REAL)` and a `MUX`
 * of mixed types, so the transpilers check the class themselves, and the FBD editor judges a wire into such a pin by the same
 * class; `ANY` takes anything but a STRING, which the code generator does not select.
 */
export const GENERIC_CLASSES: Readonly<Record<string, { types?: readonly string[]; takes: string }>> = {
  ANY: { takes: 'any elementary type but a STRING' },
  ANY_NUM: { types: [...SIGNED, ...UNSIGNED, ...REALS], takes: 'a number (an integer or a real type)' },
  ANY_INT: { types: [...SIGNED, ...UNSIGNED], takes: 'an integer' },
  ANY_BIT: { types: BIT_STRINGS, takes: 'a bit string (BYTE, WORD, DWORD or LWORD)' },
};

/** The elementary type that a generic pin of class `generic` does not take, or undefined when it takes `type` or `type` is not known. */
export function outsideClass(generic: string, type: string | undefined): string | undefined {
  const wanted = GENERIC_CLASSES[generic];
  if (!wanted || !type) return undefined;
  return wanted.types ? (wanted.types.includes(type) ? undefined : type) : type === 'STRING' ? type : undefined;
}

/** The standard functions FBD places as functions of their own, before LNG-029: they keep their path and their type rules. */
export const FBD_FUNCTION_BLOCKS: ReadonlySet<string> = new Set(['MAX', 'MIN', 'LIMIT', 'SEL']);

/** Whether FBD translates a block of this type as a call of a standard function of the table (LNG-029), the path of `GENERIC_CLASSES`. */
function callsStdFunction(type: string, projectBlocks?: readonly ProjectBlock[]): boolean {
  if (findProjectBlock(projectBlocks, type) || isLogicGate(type) || isComparison(type) || isMathOperator(type)) return false;
  return !FBD_FUNCTION_BLOCKS.has(type) && stdFunction(type) !== undefined;
}

/** The type of an integer constant that names none: it goes where any number does, and nowhere else. */
export const INTEGER_LITERAL = 'INTEGER_LITERAL';

const ELEMENTARY = new Set([...INTEGERS, ...REALS, 'BOOL', 'TIME', ...DATES, ...STRINGS]);

function normalize(type: string | undefined): string | undefined {
  const name = type
    ?.trim()
    .replace(/\[\d+\]$|\(\d+\)$/, '')
    .toUpperCase();
  return name ? (ALIASES[name] ?? name) : undefined;
}

function describe(type: string): string {
  if (type === 'BOOL') return 'a BOOL';
  if (INTEGERS.includes(type)) return `an integer (${type})`;
  if (REALS.includes(type)) return `a real number (${type})`;
  if (STRINGS.includes(type)) return `a string (${type})`;
  return `a ${type}`;
}

/** Whether a value of the elementary type `from` converts implicitly to the elementary type `to`. */
function converts(from: string, to: string): boolean {
  if (from === to) return true;
  // a REAL goes into an LREAL, and an LREAL into a REAL with the compiler's warning of a narrowing
  if (REALS.includes(to)) return REALS.includes(from) || INTEGERS.includes(from);
  if (INTEGERS.includes(to)) return INTEGERS.includes(from);
  return false; // BOOL, TIME, DATE, TOD, DT and the strings take their own type only
}

/**
 * Why a value of type `source` cannot go into a pin of type `target`, or undefined when it can. A type that is not
 * an elementary or generic type (a function block, a structure, a type the project declares) or that is not known
 * is not judged here: the compiler checks it where the diagram is built.
 */
export function pinTypeProblem(source: string | undefined, target: string | undefined): string | undefined {
  const from = normalize(source);
  const to = normalize(target);
  if (!from || !to || from === 'ANY' || to === 'ANY' || from === to) return undefined;

  const admitted = GENERIC[to];
  if (from === INTEGER_LITERAL) {
    if (admitted) return admitted.some((type) => INTEGERS.includes(type)) ? undefined : `an integer constant cannot go into ${to}`;
    return !ELEMENTARY.has(to) || INTEGERS.includes(to) || REALS.includes(to)
      ? undefined
      : `an integer constant is a number and ${to} takes only its own type: write a ${to} value, or convert it explicitly`;
  }

  const sources = GENERIC[from] ?? (ELEMENTARY.has(from) ? [from] : undefined);
  if (!sources || (!admitted && !ELEMENTARY.has(to))) return undefined;
  // a result that depends on its inputs (ANY_NUM) is wrong only where none of its possible types fits
  const fits = (candidate: string): boolean => (admitted ? admitted.includes(candidate) : converts(candidate, to));
  if (sources.some(fits)) return undefined;

  const what = GENERIC[from] ? `${from} is a number` : `${from} is ${describe(from)}`;
  if (REALS.includes(from) && INTEGERS.includes(to)) {
    return (
      `${what}, and IEC 61131-3 does not convert a REAL to an integer implicitly; convert it explicitly, for example ` +
      `with ${from}_TO_${to}`
    );
  }
  const into = admitted ? `${to} takes ${TAKES[to]}` : `${to} is ${describe(to)}`;
  return (
    `${what} and ${into}: IEC 61131-3 converts implicitly only to a wider type of the same kind; convert it ` +
    `explicitly${admitted ? '' : `, for example with ${from}_TO_${to}`}`
  );
}

// =============================================================================
// Connections of a diagram
// =============================================================================

interface Pin {
  block: FBDBlock;
  port: FBDPort;
  endpoint: FBDConnectionEndpoint;
}

function declaredType(model: FBDModel, name: string | undefined): string | undefined {
  if (!name) return undefined;
  const wanted = name.trim().toUpperCase();
  const all = [...model.variables.local, ...(model.variables.inputs ?? []), ...model.variables.outputs];
  return all.find((variable) => typeof variable.name === 'string' && variable.name.toUpperCase() === wanted)?.type;
}

function constantType(block: FBDBlock): string | undefined {
  if (typeof block.dataType === 'string' && block.dataType.trim() !== '') return block.dataType;
  const value = block.value;
  if (typeof value === 'boolean') return 'BOOL';
  if (typeof value === 'string') return value.toUpperCase().startsWith('T#') ? 'TIME' : 'STRING';
  if (typeof value === 'number') return Number.isInteger(value) ? INTEGER_LITERAL : 'REAL';
  return undefined;
}

/**
 * The type of the value on a pin: a variable block holds what its variable holds, a constant is what it is written as, else the type of the
 * port.
 */
function valueType(model: FBDModel, pin: Pin): string | undefined {
  const { type } = pin.block;
  if (type === 'constant') return constantType(pin.block);
  if (type === 'variable' || type === 'input' || type === 'output') return declaredType(model, pin.block.variableName);
  return pin.port.type;
}

export interface ConnectionVerdict {
  /** The wire as it would be drawn, from an output to an input; absent when the two pins cannot be wired at all. */
  from?: FBDConnectionEndpoint;
  to?: FBDConnectionEndpoint;
  /** Why the wire is refused; absent when it is accepted. */
  reason?: string;
}

/**
 * Whether a wire between the pins `a` and `b` may be drawn, in either direction (the canvas lets a wire start at an
 * input). It is refused when it does not join an output to an input, when the input already has a wire, and when the
 * type of the output cannot feed the type of the input (LNG-013); the reason is a sentence the editor shows.
 */
export function judgeConnection(
  model: FBDModel,
  a: FBDConnectionEndpoint,
  b: FBDConnectionEndpoint,
  projectBlocks?: readonly ProjectBlock[],
): ConnectionVerdict {
  const blocks = new Map(model.blocks.map((block) => [block.id, block]));
  const ports = (block: FBDBlock) => {
    const defaults = getDefaultPorts(block.type, projectBlocks);
    return { inputs: block.inputs ?? defaults.inputs, outputs: block.outputs ?? defaults.outputs };
  };
  const pin = (end: FBDConnectionEndpoint, side: 'inputs' | 'outputs'): Pin | undefined => {
    const block = blocks.get(end.block);
    const port = block && ports(block)[side].find((candidate) => candidate.name === end.port);
    return block && port ? { block, port, endpoint: end } : undefined;
  };
  if (!blocks.has(a.block) || !blocks.has(b.block)) return { reason: 'one end of the wire is not on the diagram' };

  const forward = [pin(a, 'outputs'), pin(b, 'inputs')] as const;
  const backward = [pin(b, 'outputs'), pin(a, 'inputs')] as const;
  const [source, sink] = forward[0] && forward[1] ? forward : backward;
  if (!source || !sink) {
    return {
      reason:
        pin(a, 'outputs') && pin(b, 'outputs')
          ? 'two outputs cannot be wired together: a wire joins an output to an input'
          : 'a wire joins an output to an input',
    };
  }
  const label = (end: FBDConnectionEndpoint) => `'${end.block}.${end.port}'`;
  const verdict = { from: source.endpoint, to: sink.endpoint };
  if (model.connections.some((connection) => connection.to.block === sink.endpoint.block && connection.to.port === sink.endpoint.port)) {
    return { ...verdict, reason: `input ${label(sink.endpoint)} already has a wire: an input has one source` };
  }
  // a generic pin of a standard function takes the class the transpiler checks; an integer constant is an INT there, as it is built
  if (callsStdFunction(sink.block.type, projectBlocks) && sink.port.type in GENERIC_CLASSES) {
    const from = normalize(valueType(model, source));
    const odd = outsideClass(sink.port.type, from === INTEGER_LITERAL ? 'INT' : from && ELEMENTARY.has(from) ? from : undefined);
    if (odd) {
      const takes = `${sink.block.type} takes ${GENERIC_CLASSES[sink.port.type]!.takes} there`;
      return {
        ...verdict,
        reason: `${label(source.endpoint)} cannot feed ${label(sink.endpoint)}: ${odd} is ${describe(odd)}, and ${takes}`,
      };
    }
    if (from && (from === INTEGER_LITERAL || ELEMENTARY.has(from))) return verdict;
  }
  const problem = pinTypeProblem(valueType(model, source), valueType(model, sink));
  return problem ? { ...verdict, reason: `${label(source.endpoint)} cannot feed ${label(sink.endpoint)}: ${problem}` } : verdict;
}

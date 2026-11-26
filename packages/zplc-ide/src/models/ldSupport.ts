/**
 * What a Ladder rung is built from, as the transpiler translates it (LNG-007). The palette of the editor and the
 * transpiler read this one table: an element the transpiler does not translate cannot be offered.
 */

import { getFB } from '@zplc/compiler';
import { getFunctionBlockNamesForVisualEditors } from '../catalog/blockCatalog';
import { stdFunctions, type StdFunction } from '../catalog/stdFunctions';
import { findProjectBlock, type ProjectBlock } from './projectBlocks';
import type { LDElement, LDElementType } from './ld';
import { t } from '../i18n';

export const LD_CONTACT_TYPES = ['contact_no', 'contact_nc', 'contact_p', 'contact_n'] as const;
export const LD_COIL_TYPES = ['coil', 'coil_negated', 'coil_set', 'coil_reset', 'coil_p', 'coil_n'] as const;

/** The compile-time Modbus tag helpers: placed like a function block, with no instance of their own. */
export const LD_MODBUS_HELPERS: ReadonlySet<string> = new Set(['MB_COIL', 'MB_DISCRETE_INPUT', 'MB_INPUT_REGISTER', 'MB_HOLDING_REGISTER']);

/**
 * How an IEC function is placed in a rung as a `function` element (LNG-028, LNG-030): the pins its operands bind to, in order, and
 * how it reads as Structured Text. A comparison has no output: it passes power when it holds. The palette, the validation and
 * the transpiler read this one table.
 */
export interface LDFunctionSpec {
  /**
   * `compare` passes power; the others store a result in the output of the box while power reaches it. `function` is a standard
   * function of the compiler's table (LNG-030), called with its operands in the table's order.
   */
  kind: 'compare' | 'math' | 'move' | 'select' | 'function';
  /** The operand pins, in order; a variadic function lists its fixed part and its first extra inputs. */
  pins: readonly string[];
  /** The record of a `function` box: its pin types, its return type, whether it takes more inputs and the pins it writes. */
  record?: StdFunction;
  /** The expression for operands that are already written as ST. */
  expression(operands: readonly string[]): string;
}

const infix = (kind: LDFunctionSpec['kind'], operator: string): LDFunctionSpec => ({
  kind,
  pins: ['IN1', 'IN2'],
  expression: ([a, b]) => `${a} ${operator} ${b}`,
});
const call = (name: string, pins: readonly string[]): LDFunctionSpec => ({
  kind: 'select',
  pins,
  expression: (operands) => `${name}(${operands.join(', ')})`,
});

const BOXES: Readonly<Record<string, LDFunctionSpec>> = {
  GT: infix('compare', '>'),
  GE: infix('compare', '>='),
  EQ: infix('compare', '='),
  NE: infix('compare', '<>'),
  LE: infix('compare', '<='),
  LT: infix('compare', '<'),
  ADD: infix('math', '+'),
  SUB: infix('math', '-'),
  MUL: infix('math', '*'),
  DIV: infix('math', '/'),
  MOD: infix('math', 'MOD'),
  MOVE: { kind: 'move', pins: ['IN'], expression: ([a]) => a },
  LIMIT: call('LIMIT', ['MN', 'IN', 'MX']),
  MIN: call('MIN', ['IN1', 'IN2']),
  MAX: call('MAX', ['IN1', 'IN2']),
};

const stdCall = (record: StdFunction): LDFunctionSpec => ({
  kind: 'function',
  pins: record.inputs.map(([pin]) => pin),
  record,
  expression: (operands) => `${record.name}(${operands.join(', ')})`,
});

/** The 15 boxes of LNG-028 as they were, then every other function the compiler registers, from its record (LNG-030). */
export const LD_FUNCTIONS: Readonly<Record<string, LDFunctionSpec>> = {
  ...BOXES,
  ...Object.fromEntries(
    [...stdFunctions().values()].filter((record) => !Object.hasOwn(BOXES, record.name)).map((record) => [record.name, stdCall(record)]),
  ),
};

/** The function of this name, or undefined when a box cannot hold it. Own names only: `constructor` is not a function. */
export const ldFunctionSpec = (name: unknown): LDFunctionSpec | undefined =>
  typeof name === 'string' && Object.hasOwn(LD_FUNCTIONS, name) ? LD_FUNCTIONS[name] : undefined;

/** Whether a box of this function stores a result: all but a comparison and a function that returns nothing. */
export const ldFunctionHasOutput = (spec: LDFunctionSpec): boolean => spec.kind !== 'compare' && spec.record?.returns !== 'VOID';

/**
 * The operand pins of a box with `count` operands: the pins of the function, and for one that takes more inputs (MUX) its
 * selector and as many `IN<n>` as the box has, never fewer than the table's.
 */
export function ldFunctionPins(spec: LDFunctionSpec, count = 0): readonly string[] {
  if (!spec.record?.variadic) return spec.pins;
  const [selector] = spec.pins;
  const inputs = Math.max(spec.pins.length - 1, count - 1);
  return [selector!, ...Array.from({ length: inputs }, (_, index) => `IN${index}`)];
}

/** A function box for someone who cannot see it, as the function is written: `ADD(Level, 3) -> Sum`; an operand not bound yet is `_`. */
export function ldFunctionLabel(element: LDElement): string {
  const operands = (element.operands ?? []).map((operand) => (operand === '' ? '_' : operand)).join(', ');
  return `${element.functionName ?? ''}(${operands})${element.output ? ` -> ${element.output}` : ''}`;
}

/**
 * Whether a function block of this type can be placed in a rung: the transpiler declares an instance of a block of the
 * compiler's library or of the project, and the Modbus helpers have none. The catalogue names more blocks than that (the
 * communication blocks of the runtime are not types a Ladder file can declare): those are not offered.
 */
export function ldPlacesFunctionBlock(type: string, projectBlocks?: readonly ProjectBlock[]): boolean {
  if (LD_MODBUS_HELPERS.has(type)) return true;
  const declared = findProjectBlock(projectBlocks, type);
  if (declared) return declared.kind === 'FUNCTION_BLOCK';
  return getFB(type) !== undefined;
}

/** The function blocks the palette offers: the catalogue's, as far as a rung can hold them, then the project's. */
export function ldPaletteFunctionBlocks(projectBlocks: readonly ProjectBlock[] = []): string[] {
  const names = new Set(getFunctionBlockNamesForVisualEditors().filter((name) => ldPlacesFunctionBlock(name)));
  for (const block of projectBlocks) if (block.kind === 'FUNCTION_BLOCK') names.add(block.name);
  return [...names].sort();
}

/** How an element is named to someone who cannot see it: the label of its button and what the keyboard editor says (LNG-012). */
export const ldElementKind = (type: LDElementType): string => t(`ld.kind.${type}`);

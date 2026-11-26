/**
 * The IEC function boxes of the Ladder palette and their editing (LNG-028, LNG-012): the entries of the "Functions" group, the
 * slots of a box (its operand pins and its output) and the change of the function of a box. The table is `LD_FUNCTIONS`.
 */

import { t } from '../../i18n';
import type { LDElement, LDToolboxItem } from '../../models/ld';
import { LD_FUNCTIONS, ldFunctionHasOutput, ldFunctionPins, ldFunctionSpec, type LDFunctionSpec } from '../../models/ldSupport';

/** An entry of the toolbox: a contact, a coil, a block, or one of the functions. */
export type LDPaletteEntry = Omit<LDToolboxItem, 'category'> & {
  category: LDToolboxItem['category'] | 'function';
  functionName?: string;
  kind?: LDFunctionSpec['kind'];
};

/** What the face of each function shows in the palette: the operator, or the name when it has none. */
const SYMBOL: Record<string, string> = { GT: '>', GE: '>=', EQ: '=', NE: '<>', LE: '<=', LT: '<', ADD: '+', SUB: '-', MUL: '*', DIV: '/' };

export const functionKindLabel = (kind: LDFunctionSpec['kind']): string => t(`ld.fnKind.${kind}`);

/** The functions the palette offers, in the order of the table: compare, math, move and select. */
export function functionItems(): LDPaletteEntry[] {
  return Object.entries(LD_FUNCTIONS).map(([functionName, spec]) => ({
    type: 'function',
    functionName,
    label: functionName,
    symbol: SYMBOL[functionName] ?? functionName,
    category: 'function' as const,
    kind: spec.kind,
  })) as LDPaletteEntry[];
}

/** The operand pins of a box: those of its function, and as many inputs as it has for one that takes more (MUX). */
export function functionPins(element: Pick<LDElement, 'functionName' | 'operands'>): readonly string[] {
  const spec = ldFunctionSpec(element.functionName);
  return spec ? ldFunctionPins(spec, element.operands?.length) : [];
}

/** The slots of a box in order: its operand pins, then OUT unless it is a comparison or returns nothing. */
export function functionSlots(element: Pick<LDElement, 'functionName' | 'operands'>): string[] {
  const spec = ldFunctionSpec(element.functionName);
  return spec ? [...functionPins(element), ...(ldFunctionHasOutput(spec) ? ['OUT'] : [])] : [];
}

/** A new box of a function: every operand empty, and an empty output unless it is a comparison or returns nothing. */
export function emptyFunction(functionName: string): Pick<LDElement, 'functionName' | 'operands' | 'output'> {
  const spec = ldFunctionSpec(functionName);
  return {
    functionName,
    operands: (spec?.pins ?? []).map(() => ''),
    ...(spec && ldFunctionHasOutput(spec) ? { output: '' } : {}),
  };
}

/** The box with another function: the operands it had stay in their pins, and their number follows the new function. */
export function withFunction(element: LDElement, functionName: string): LDElement {
  const { output, ...rest } = element;
  const next = emptyFunction(functionName);
  const operands = (next.operands ?? []).map((_, index) => element.operands?.[index] ?? '');
  return { ...rest, ...next, operands, ...(next.output === undefined ? {} : { output: output ?? '' }) };
}

/** The box with a slot set: operands are numbered from 0, and the slot after the last pin is the output. */
export function withSlot(element: LDElement, slot: number, value: string): LDElement {
  const pins = functionPins(element).length;
  if (slot >= pins) return { ...element, output: value };
  const operands = [...(element.operands ?? [])];
  operands[slot] = value;
  return { ...element, operands };
}

/** The value in a slot of the box, '' when empty. */
export const slotValue = (element: LDElement, slot: number): string => {
  const pins = functionPins(element).length;
  return (slot >= pins ? element.output : element.operands?.[slot]) ?? '';
};

/** Whether a box takes more inputs (MUX), so that an input can be added and removed. */
export const takesMoreOperands = (element: Pick<LDElement, 'functionName'>): boolean =>
  ldFunctionSpec(element.functionName)?.record?.variadic === true;

/** The box with one more input `IN<n>`, empty; undefined for a box whose function has a fixed set of operands, or at its most. */
export function withOperandAdded(element: LDElement): LDElement | undefined {
  const max = ldFunctionSpec(element.functionName)?.record?.maxInputs;
  const operands = element.operands ?? [];
  if (!takesMoreOperands(element) || (max !== undefined && operands.length - 1 >= max)) return undefined;
  return { ...element, operands: [...operands, ''] };
}

/** The most inputs after the selector of a box that takes more, or undefined. */
export const maxOperandInputs = (element: Pick<LDElement, 'functionName'>): number | undefined =>
  ldFunctionSpec(element.functionName)?.record?.maxInputs;

/** The box without its last input; undefined when it has a fixed set of operands, or only the inputs the table requires. */
export function withOperandRemoved(element: LDElement): LDElement | undefined {
  const required = ldFunctionSpec(element.functionName)?.pins.length ?? 0;
  const operands = element.operands ?? [];
  return takesMoreOperands(element) && operands.length > required ? { ...element, operands: operands.slice(0, -1) } : undefined;
}

/**
 * The symbols a visual document declares, as the list a variable is bound from (LNG-012).
 *
 * An element is bound to a name that the document declares: its inputs, outputs and local variables. The list is built
 * from the variable tables of the model, so a name that is not there is not offered.
 */

import { getDefaultPorts } from '../models/fbd';
import type { ProjectBlock } from '../models/projectBlocks';
import type { PickerItem } from './picker';

export interface DeclaredVariable {
  name: string;
  type: string;
  address?: string;
}

export interface VariableTables {
  local?: readonly DeclaredVariable[];
  inputs?: readonly DeclaredVariable[];
  outputs?: readonly DeclaredVariable[];
}

export interface DeclaredSymbol extends DeclaredVariable {
  section: 'input' | 'output' | 'local';
}

/** Every symbol of the tables, inputs first, then outputs, then locals; each section in the order of the file. */
export function declaredSymbols(tables: VariableTables | undefined): DeclaredSymbol[] {
  if (!tables) return [];
  const section = (variables: readonly DeclaredVariable[] | undefined, name: DeclaredSymbol['section']): DeclaredSymbol[] =>
    (variables ?? [])
      .filter((variable) => typeof variable?.name === 'string' && variable.name !== '')
      .map((variable) => ({ ...variable, section: name }));
  return [...section(tables.inputs, 'input'), ...section(tables.outputs, 'output'), ...section(tables.local, 'local')];
}

const SECTION_TEXT: Record<DeclaredSymbol['section'], string> = { input: 'input', output: 'output', local: 'local' };

/** The list items for symbols: the name, with its type and section next to it. */
export function symbolItems(symbols: readonly DeclaredSymbol[]): PickerItem[] {
  return symbols.map((symbol) => ({
    id: symbol.name,
    label: symbol.name,
    detail: `${symbol.type} · ${SECTION_TEXT[symbol.section]}${symbol.address ? ` · ${symbol.address}` : ''}`,
    group: 'Declared symbols',
  }));
}

/** Whether a type name is the type named (the language is not case sensitive). */
export function sameType(first: string | undefined, second: string | undefined): boolean {
  return first !== undefined && second !== undefined && first.toUpperCase() === second.toUpperCase();
}

/** The BOOL outputs of a function block type, from the library or from the project: what `Instance.Q` reads. */
export function boolOutputsOf(type: string, projectBlocks?: readonly ProjectBlock[]): string[] {
  return getDefaultPorts(type, projectBlocks)
    .outputs.filter((port) => sameType(port.type, 'BOOL'))
    .map((port) => port.name);
}

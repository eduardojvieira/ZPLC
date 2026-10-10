/**
 * What a Ladder rung is built from, as the transpiler translates it (LNG-007). The palette of the editor and the
 * transpiler read this one table: an element the transpiler does not translate cannot be offered.
 */

import { getFB } from '@zplc/compiler';
import { getFunctionBlockNamesForVisualEditors } from '../catalog/blockCatalog';
import { findProjectBlock, type ProjectBlock } from './projectBlocks';

export const LD_CONTACT_TYPES = ['contact_no', 'contact_nc', 'contact_p', 'contact_n'] as const;
export const LD_COIL_TYPES = ['coil', 'coil_negated', 'coil_set', 'coil_reset', 'coil_p', 'coil_n'] as const;

/** The compile-time Modbus tag helpers: placed like a function block, with no instance of their own. */
export const LD_MODBUS_HELPERS: ReadonlySet<string> = new Set(['MB_COIL', 'MB_DISCRETE_INPUT', 'MB_INPUT_REGISTER', 'MB_HOLDING_REGISTER']);

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

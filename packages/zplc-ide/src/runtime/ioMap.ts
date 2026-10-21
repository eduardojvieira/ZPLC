/**
 * The I/O map of a program as the faceplate shows it (LRN-017): its declared inputs (IDE-024) and the outputs it maps to
 * the output image. Both come from the debug map of the build, never from a list of names, and both are plain data
 * (address, width, type, bit), so that a plant (LRN-018) can bind to the same points by an explicit mapping later.
 *
 * Pure TypeScript with no Electron, store or component import.
 */
import type { DebugMap } from '../compiler';
import { MEMORY_MAP } from './debugAdapter';
import { isScalar, listDeclaredInputs, type DeclaredInput } from './declaredInputs';

/** A scalar variable mapped to the output image (`AT %QX0.5`, `AT %QW2`), whatever its name. */
export interface DeclaredOutput {
  /** `Program.Name`: the path the Watch table uses. */
  path: string;
  pou: string;
  name: string;
  type: string;
  region: 'OPI';
  address: number;
  size: number;
  /** For a bit-addressed BOOL (`%QX0.5`): the bit inside the byte at `address`. */
  bitOffset?: number;
}

export interface IoMap {
  inputs: DeclaredInput[];
  outputs: DeclaredOutput[];
}

/** The scalar variables of the debug map that live in the output image, in the order of the map. */
export function listDeclaredOutputs(debugMap: DebugMap | null | undefined): DeclaredOutput[] {
  if (!debugMap) return [];
  const found: DeclaredOutput[] = [];
  for (const [pou, info] of Object.entries(debugMap.pou)) {
    for (const [name, variable] of Object.entries(info.vars)) {
      if (variable.region !== 'OPI' || !isScalar(variable.type) || variable.children !== undefined) continue;
      found.push({
        path: `${pou}.${name}`,
        pou,
        name,
        type: variable.type,
        region: 'OPI',
        address: variable.addr,
        size: variable.size,
        ...(variable.bitOffset === undefined ? {} : { bitOffset: variable.bitOffset }),
      });
    }
  }
  return found;
}

export function listIoMap(debugMap: DebugMap | null | undefined): IoMap {
  return { inputs: listDeclaredInputs(debugMap), outputs: listDeclaredOutputs(debugMap) };
}

/** The direct address of an output as the program writes it (`%QX0.5`, `%QW2`). */
export function outputAddressLabel(output: Pick<DeclaredOutput, 'type' | 'size' | 'address' | 'bitOffset'>): string {
  // The debug map holds the address in the memory of the runtime; the program writes the offset in the output image.
  const offset = output.address - MEMORY_MAP.opi.baseAddress;
  if (output.type === 'BOOL') return `%QX${offset}.${output.bitOffset ?? 0}`;
  const prefix = output.size === 1 ? 'B' : output.size === 2 ? 'W' : output.size === 4 ? 'D' : 'L';
  return `%Q${prefix}${output.size > 1 ? offset / output.size : offset}`;
}

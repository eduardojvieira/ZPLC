/**
 * Builders for the Ladder files the tests of the `function` element (LNG-028) read: a rung of one row, or a rung given cell
 * by cell. Test support only; the production code never imports it.
 */
import type { LDVariable } from '../models/ld';

export const contact = (id: string, variable: string): Record<string, unknown> => ({ id, type: 'contact_no', variable });
export const coil = (id: string, variable: string): Record<string, unknown> => ({ id, type: 'coil', variable });
/** A `function` element; `output` is left out for a comparison. */
export const box = (id: string, functionName: string, operands: unknown[], output?: string): Record<string, unknown> => ({
  id,
  type: 'function',
  functionName,
  operands,
  ...(output === undefined ? {} : { output }),
});

export interface Declared {
  local?: LDVariable[];
  inputs?: LDVariable[];
  outputs?: LDVariable[];
}

export const variable = (name: string, type: string, address?: string): LDVariable => ({
  name,
  type,
  ...(address === undefined ? {} : { address }),
});

const wired = (element: Record<string, unknown> | null, row: number, col: number) => ({
  element: element === null ? null : { ...element, row, col },
  hasWire: row === 0 || element !== null,
});

/** One rung of one row: the elements in series, from the left rail. */
export function ldFile(declared: Declared, ...series: Array<Record<string, unknown>>): Record<string, unknown> {
  return rungsFile(declared, [{ cols: series.length, grid: [series] }]);
}

/** Rungs given as grids (`grid[row][col]`, `null` for a wire), each with its branches; ids are r1, r2, ... */
export function rungsFile(
  declared: Declared,
  rungs: Array<{ cols: number; grid: Array<Array<Record<string, unknown> | null>>; branches?: unknown[] }>,
): Record<string, unknown> {
  return {
    name: 'Rungs',
    variables: { local: declared.local ?? [], inputs: declared.inputs ?? [], outputs: declared.outputs ?? [] },
    rungs: rungs.map((rung, index) => ({
      id: `r${index + 1}`,
      number: index + 1,
      gridConfig: { cols: rung.cols, rows: rung.grid.length, cellWidth: 80, cellHeight: 60 },
      grid: rung.grid.map((row, r) => row.map((element, c) => wired(element, r, c))),
      branches: rung.branches ?? [],
      verticalLinks: [],
    })),
  };
}

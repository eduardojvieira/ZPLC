/**
 * The power flow of a Ladder rung (LNG-021): how it is followed through series and parallel paths, and the boolean
 * expression that the power at a point of a rung is.
 */

import type { LDBranch, LDCell, LDElement } from '../models/ld';
import type { PowerExpr } from '../models/sourceElements';

// =============================================================================
// Power flow
// =============================================================================

export interface WalkHooks<T> {
  /** The power at the left rail. */
  rail: T;
  /** The power that leaves a branch, from the power of each of its rows. */
  join(values: T[]): T;
  /** An element on a row that has power: returns the power that leaves it. */
  element(element: LDElement, row: number, col: number, power: T): T;
  /** Something that no power reaches (an element after its branch ended, a branch off a dead row), and its cell when it is one. */
  unpowered(what: string, row?: number, col?: number): void;
}

/**
 * Follows the power through a rung column by column, left to right, top to bottom in a column.
 * A branch splits the power of its source row (its first row) into all its rows at its first column
 * and joins them back into the source row after its last column; the innermost branch joins first.
 * Returns the power at the right end of the main line.
 */
export function walkRung<T>(grid: LDCell[][], branches: LDBranch[], cols: number, hooks: WalkHooks<T>): T | undefined {
  const power: Array<T | undefined> = grid.map(() => undefined);
  power[0] = hooks.rail;
  // The innermost branch joins first: depth is the number of parents above a branch
  const depth = (branch: LDBranch): number => {
    let found = 0;
    for (let next = branch.parentBranchId; next !== undefined && found <= branches.length;) {
      found++;
      next = branches.find((candidate) => candidate.id === next)?.parentBranchId;
    }
    return found;
  };
  const byDepth = (a: LDBranch, b: LDBranch) => depth(a) - depth(b);
  for (let col = 0; col < cols; col++) {
    const starting = branches.filter((branch) => branch.startCol === col).sort(byDepth);
    for (const branch of starting) {
      const source = power[branch.rows[0]];
      if (source === undefined)
        hooks.unpowered(`branch '${branch.id}' starts on row ${branch.rows[0]}, which no power reaches at column ${col}`);
      for (const row of branch.rows.slice(1)) power[row] = source;
    }
    for (let row = 0; row < grid.length; row++) {
      const element = grid[row]?.[col]?.element;
      if (!element) continue;
      const incoming = power[row];
      if (incoming === undefined) {
        hooks.unpowered(`element '${element.id}' (row ${row}, column ${col}) is on a path that no power reaches`, row, col);
        continue;
      }
      power[row] = hooks.element(element, row, col, incoming);
    }
    const ending = branches.filter((branch) => branch.endCol === col).sort((a, b) => byDepth(b, a));
    for (const branch of ending) {
      const values = branch.rows.map((row) => power[row]).filter((value): value is T => value !== undefined);
      for (const row of branch.rows.slice(1)) power[row] = undefined;
      power[branch.rows[0]] = values.length > 0 ? hooks.join(values) : undefined;
    }
  }
  return power[0];
}

// =============================================================================
// Power expressions
// =============================================================================

/** A boolean power expression: AND of series elements, OR of parallel paths. */
export type Power = { kind: 'true' } | { kind: 'atom'; text: string } | { kind: 'and'; terms: Power[] } | { kind: 'or'; terms: Power[] };

export const TRUE_POWER: Power = { kind: 'true' };
export const atom = (text: string): Power => ({ kind: 'atom', text });

export function and(...parts: Power[]): Power {
  const terms: Power[] = [];
  for (const part of parts) {
    if (part.kind === 'true') continue;
    if (part.kind === 'and') terms.push(...part.terms);
    else terms.push(part);
  }
  if (terms.length === 0) return TRUE_POWER;
  return terms.length === 1 ? terms[0] : { kind: 'and', terms };
}

/** The power as an expression of variables, for the debug map (LNG-006): an atom is a variable, or `NOT` a variable. */
export function powerExpr(power: Power): PowerExpr {
  switch (power.kind) {
    case 'true':
      return { op: 'true' };
    case 'atom':
      return power.text.startsWith('NOT ') ? { op: 'var', variable: power.text.slice(4), not: true } : { op: 'var', variable: power.text };
    case 'and':
      return { op: 'and', terms: power.terms.map(powerExpr) };
    case 'or':
      return { op: 'or', terms: power.terms.map(powerExpr) };
  }
}

export function printPower(power: Power): string {
  switch (power.kind) {
    case 'true':
      return 'TRUE';
    case 'atom':
      return power.text;
    case 'and':
      return power.terms.map((term) => (term.kind === 'or' ? `(${printPower(term)})` : printPower(term))).join(' AND ');
    case 'or':
      return power.terms.map((term) => (term.kind === 'and' ? `(${printPower(term)})` : printPower(term))).join(' OR ');
  }
}

/** OR of parallel paths; the series elements that all of them share are taken out in front. */
export function or(values: Power[]): Power {
  const terms: Power[] = [];
  const printed = new Set<string>();
  for (const value of values.flatMap((entry) => (entry.kind === 'or' ? entry.terms : [entry]))) {
    const text = printPower(value);
    if (!printed.has(text)) {
      printed.add(text);
      terms.push(value);
    }
  }
  if (terms.some((term) => term.kind === 'true')) return TRUE_POWER;
  if (terms.length === 1) return terms[0];
  const chains = terms.map((term) => (term.kind === 'and' ? term.terms : [term]));
  let shared = 0;
  while (chains.every((chain) => shared < chain.length && printPower(chain[shared]) === printPower(chains[0][shared]))) shared++;
  if (shared === 0) return { kind: 'or', terms };
  const rests = chains.map((chain) => and(...chain.slice(shared)));
  return and(...chains[0].slice(0, shared), or(rests));
}

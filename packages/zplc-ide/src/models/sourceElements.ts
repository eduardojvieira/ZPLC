/**
 * The elements of a source file that the author edited, and the map from the Structured Text that a visual or IL
 * source is translated to back to them (LNG-003, LNG-004, LNG-026).
 *
 * An element is named by a short id whose form says what it is:
 *
 *   IL    line:12                      a line of the IL source
 *   LD    rung:rung_1                  a rung
 *         rung:rung_1/cell:0,3         the cell at row 0, column 3 of a rung
 *         rung:rung_1/element:c1       an element of a rung that has no grid (a file written as a list of elements)
 *   FBD   block:and_1                  a block
 *         connection:w3                a wire
 *   SFC   step:s1  transition:t1       a step, a transition (and its condition)
 *         step:s1/enter                the statement that makes the step active when a transition enters it
 *         transition:t1/fire           the statement that deactivates the steps a transition leaves when it fires
 *         action:a1                    an action (and its body)
 *
 * Ids written by the author are percent-encoded where they hold `:`, `/` or `,`, so the form is unambiguous.
 */

import type { DebugMonitorEntry, DebugPowerExpr } from '@zplc/compiler';

export type SourceElementId = string;

/**
 * How an online display reads the state of an element: which variable of the program holds it (LNG-006). A transpiler
 * returns these beside its source map; the build puts them in the debug map, so the display reads what the map says
 * and not what the name of a variable suggests.
 */
export type MonitorEntry = DebugMonitorEntry;
/** The power at a point of a Ladder rung, as an expression of the variables that make it up. */
export type PowerExpr = DebugPowerExpr;

export type ElementLanguage = 'IL' | 'LD' | 'FBD' | 'SFC';

export interface ParsedElement {
  language: ElementLanguage;
  kind: 'line' | 'rung' | 'cell' | 'element' | 'block' | 'connection' | 'step' | 'transition' | 'action';
  /** The id the file gives it; the number of the line for an IL line. */
  id: string;
  /** For a step or a transition: the statement of the chart that the id names (`enter`, `fire`), when it is not the whole. */
  role?: 'enter' | 'fire';
  /** For a cell or an element of a rung: the rung. */
  rung?: string;
  row?: number;
  col?: number;
}

const encode = (id: string | number): string => encodeURIComponent(String(id));

export const ilLineElement = (line: number): SourceElementId => `line:${line}`;
export const rungElement = (rung: string | number): SourceElementId => `rung:${encode(rung)}`;
export const cellElement = (rung: string | number, row: number, col: number): SourceElementId => `${rungElement(rung)}/cell:${row},${col}`;
export const rungItemElement = (rung: string | number, id: string): SourceElementId => `${rungElement(rung)}/element:${encode(id)}`;
export const blockElement = (id: string): SourceElementId => `block:${encode(id)}`;
export const connectionElement = (id: string): SourceElementId => `connection:${encode(id)}`;
export const stepElement = (id: string): SourceElementId => `step:${encode(id)}`;
export const transitionElement = (id: string): SourceElementId => `transition:${encode(id)}`;
export const actionElement = (id: string): SourceElementId => `action:${encode(id)}`;

/** The longest element id a diagnostic may carry across the main process and the window. */
export const SOURCE_ELEMENT_ID_MAX_CHARS = 256;
const ELEMENT_ID_FORM = new RegExp(String.raw`^(?:line|rung|block|connection|step|transition|action):[A-Za-z0-9_%.,!~*'()` + String.raw`-]+(?:\/(?:cell:\d+,\d+|element:[A-Za-z0-9_%.,!~*'()-]+|enter|fire))?$`);

/**
 * Whether a value is an element id as the ids above are written: the part before the first `:` names the kind, the ids are
 * percent-encoded, at most 256 characters. A diagnostic carries its element across the process boundary only when it is
 * (`electron/workspaceCompileFailure.ts` keeps a copy of this form, and its test holds the two equal).
 */
export function isSourceElementId(value: unknown): value is SourceElementId {
  return typeof value === 'string' && value.length <= SOURCE_ELEMENT_ID_MAX_CHARS && ELEMENT_ID_FORM.test(value);
}

const LANGUAGE_OF: Record<string, ElementLanguage> = {
  line: 'IL', rung: 'LD', block: 'FBD', connection: 'FBD', step: 'SFC', transition: 'SFC', action: 'SFC',
};

export function parseElement(element: SourceElementId): ParsedElement | undefined {
  const [head, tail, extra] = element.split('/');
  if (extra !== undefined) return undefined;
  const split = (part: string): [string, string] | undefined => {
    const at = part.indexOf(':');
    return at > 0 ? [part.slice(0, at), part.slice(at + 1)] : undefined;
  };
  const first = split(head ?? '');
  if (!first || !LANGUAGE_OF[first[0]]) return undefined;
  const [kind, raw] = first;
  const id = decodeURIComponent(raw);
  if (tail === undefined) return { language: LANGUAGE_OF[kind]!, kind: kind as ParsedElement['kind'], id };
  if ((kind === 'step' && tail === 'enter') || (kind === 'transition' && tail === 'fire')) {
    return { language: 'SFC', kind, id, role: tail };
  }
  const second = split(tail);
  if (kind !== 'rung' || !second) return undefined;
  if (second[0] === 'cell') {
    const match = /^(\d+),(\d+)$/.exec(second[1]);
    return match ? { language: 'LD', kind: 'cell', id: `${match[1]},${match[2]}`, rung: id, row: Number(match[1]), col: Number(match[2]) } : undefined;
  }
  return second[0] === 'element' ? { language: 'LD', kind: 'element', id: decodeURIComponent(second[1]), rung: id } : undefined;
}

/** Whether `inner` is `outer` or a part of it (a cell is part of its rung). */
export function elementWithin(outer: SourceElementId, inner: SourceElementId): boolean {
  return inner === outer || inner.startsWith(`${outer}/`);
}

/** The element in words, for a message: `LD rung 'rung_1', cell 0,3`. */
export function describeElement(element: SourceElementId): string {
  const parsed = parseElement(element);
  if (!parsed) return element;
  switch (parsed.kind) {
    case 'line': return `IL line ${parsed.id}`;
    case 'rung': return `LD rung '${parsed.id}'`;
    case 'cell': return `LD rung '${parsed.rung}', cell ${parsed.row},${parsed.col}`;
    case 'element': return `LD rung '${parsed.rung}', element '${parsed.id}'`;
    case 'block': return `FBD block '${parsed.id}'`;
    case 'connection': return `FBD wire '${parsed.id}'`;
    case 'step': return `SFC step '${parsed.id}'`;
    case 'transition': return `SFC transition '${parsed.id}' condition`;
    case 'action': return `SFC action '${parsed.id}' body`;
  }
}

// =============================================================================
// Source map: generated Structured Text line -> element
// =============================================================================

/** Lines `line` to `endLine` (1-based, inclusive) of the generated Structured Text were written for `element`. */
export interface SourceMapRange {
  line: number;
  endLine: number;
  element: SourceElementId;
}

/** One diagnostic of a transpiler: the message, and the element it is about when it has one. */
export interface ElementDiagnostic {
  message: string;
  element?: SourceElementId;
  /** The line of the IL source, for an IL diagnostic. */
  line?: number;
}

/**
 * The element a line of the generated source belongs to: the narrowest range that holds it (a cell inside a rung),
 * or undefined for a line that is scaffolding (a declaration the author did not write, the header, the END_PROGRAM).
 */
export function elementAtLine(map: readonly SourceMapRange[] | undefined, line: number): SourceElementId | undefined {
  let best: SourceMapRange | undefined;
  for (const range of map ?? []) {
    if (line < range.line || line > range.endLine) continue;
    if (!best || range.endLine - range.line < best.endLine - best.line
      || (range.endLine - range.line === best.endLine - best.line && range.element.length > best.element.length)) best = range;
  }
  return best?.element;
}

/** The generated lines written for `element` and for the parts of it, ascending. */
export function linesOfElement(map: readonly SourceMapRange[] | undefined, element: SourceElementId): number[] {
  const lines = new Set<number>();
  for (const range of map ?? []) {
    if (!elementWithin(element, range.element)) continue;
    for (let line = range.line; line <= range.endLine; line += 1) lines.add(line);
  }
  return [...lines].sort((a, b) => a - b);
}

/**
 * The lines of a generated source as a transpiler writes them, each with the element it is for. An entry may hold more
 * than one line (a comment or an action body with line breaks): the numbers of the map count them.
 */
export class Listing {
  private readonly texts: string[] = [];
  private readonly owners: Array<SourceElementId | undefined> = [];

  push(text: string, element?: SourceElementId): void {
    this.texts.push(text);
    this.owners.push(element);
  }

  /** Append the lines of another listing, those of an element it holds keeping their element. */
  append(other: Listing, element?: SourceElementId): void {
    other.texts.forEach((text, index) => this.push(text, other.owners[index] ?? element));
  }

  get length(): number {
    return this.texts.length;
  }

  toString(): string {
    return this.texts.join('\n');
  }

  /** The map: adjacent lines of one element are one range. */
  sourceMap(): SourceMapRange[] {
    const ranges: SourceMapRange[] = [];
    let line = 1;
    this.texts.forEach((text, index) => {
      const lines = text.split('\n').length;
      const element = this.owners[index];
      if (element !== undefined) {
        const last = ranges[ranges.length - 1];
        if (last && last.element === element && last.endLine === line - 1) last.endLine = line + lines - 1;
        else ranges.push({ line, endLine: line + lines - 1, element });
      }
      line += lines;
    });
    return ranges;
  }
}

/**
 * The problems a transpiler finds, as the messages it has always returned and, for each, the element it is about.
 * `within` sets the element of the problems pushed while it runs.
 */
export class Problems {
  readonly messages: string[] = [];
  readonly diagnostics: ElementDiagnostic[] = [];
  private current: SourceElementId | undefined;

  push(message: string, element: SourceElementId | undefined = this.current): void {
    this.messages.push(message);
    this.diagnostics.push(element === undefined ? { message } : { message, element });
  }

  /** The element the problems pushed now are about. */
  get element(): SourceElementId | undefined {
    return this.current;
  }

  /** Set the element of the problems pushed from now on, for a loop that has `continue` in it; `undefined` ends it. */
  focus(element: SourceElementId | undefined): void {
    this.current = element;
  }

  within<T>(element: SourceElementId | undefined, run: () => T): T {
    const outer = this.current;
    this.current = element;
    try {
      return run();
    } finally {
      this.current = outer;
    }
  }

  get length(): number {
    return this.messages.length;
  }
}

/** An error that is about one element: the transpilers throw it where the element is known. */
export class ElementError extends Error {
  readonly element: SourceElementId | undefined;

  constructor(message: string, element?: SourceElementId) {
    super(message);
    this.name = 'ElementError';
    this.element = element;
  }
}

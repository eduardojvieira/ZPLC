/**
 * The debug map in terms of the source the author edited (LNG-004).
 *
 * The compiler maps instruction ranges to lines of the Structured Text it was given. A visual or IL source is translated
 * to Structured Text first, so those lines are the translation's: the transpiler returns, for each generated line, the
 * element it was written for, and this puts it on the ranges of the debug map and the places where execution can stop.
 *
 *  - IL: a range is an IL line, and the map says IL lines, as an IL editor expects.
 *  - LD, FBD, SFC: the lines stay those of the generated source (there is no other line to name) and each range and
 *    breakpoint location carries the element: a rung or cell, a block, a step, a transition, an action.
 *
 * A breakpoint on an element is stored as the line of its location, so everything that arms a breakpoint from a line
 * (the store, the sync to the runtime, the hardware adapters) works for an element without knowing what one is.
 */

import type { BreakpointLocation, DebugMap, DebugPOUInfo, SourceLineMapping } from '@zplc/compiler';
import {
  elementAtLine,
  elementWithin,
  parseElement,
  type SourceElementId,
  type SourceMapRange,
} from '../models/sourceElements';
import type { PLCLanguage } from './index';

export interface TranslatedSource {
  language: PLCLanguage;
  map: readonly SourceMapRange[];
}

/**
 * Annotate the POUs of `debugMap` whose source was translated, keyed by the `sourceRef` of the POU. Mutates the map,
 * which is the compiler's fresh result; a POU of a plain Structured Text file is left as it is.
 */
export function annotateDebugMapElements(debugMap: DebugMap, translated: ReadonlyMap<string, TranslatedSource>): void {
  for (const pou of Object.values(debugMap.pou)) {
    const source = pou.sourceRef === undefined ? undefined : translated.get(pou.sourceRef);
    if (!source) continue;
    if (source.language === 'IL') annotateIL(pou, source.map);
    else annotateDiagram(pou, source.map);
  }
}

function annotateIL(pou: DebugPOUInfo, map: readonly SourceMapRange[]): void {
  const ranges: SourceLineMapping[] = [];
  for (const range of pou.sourceMap) {
    const element = elementAtLine(map, range.line);
    const parsed = element === undefined ? undefined : parseElement(element);
    // a range of the scaffolding of a jump has no IL line: it is not a place the author can name
    if (!element || parsed?.kind !== 'line') continue;
    ranges.push({ line: Number(parsed.id), pc: range.pc, length: range.length, element });
  }
  pou.sourceMap = ranges;
  pou.breakpoints = firstOfEachLine(ranges);
}

function annotateDiagram(pou: DebugPOUInfo, map: readonly SourceMapRange[]): void {
  // The statements nested in another statement of the line (the assignment of `IF x THEN y := 1; END_IF;`) start further
  // right than it: a step is entered, and a transition fires, at that statement, not at the test that precedes it.
  const leftmost = new Map<number, number>();
  for (const range of pou.sourceMap) leftmost.set(range.line, Math.min(leftmost.get(range.line) ?? Infinity, range.column ?? 1));

  for (const range of pou.sourceMap) {
    const element = elementAtLine(map, range.line);
    if (element === undefined) continue;
    const kind = parseElement(element)?.kind;
    const inner = (range.column ?? 1) > (leftmost.get(range.line) ?? 1);
    range.element = inner && kind === 'step' ? `${element}/enter` : inner && kind === 'transition' ? `${element}/fire` : element;
  }
  pou.breakpoints = firstOfEachLine(pou.sourceMap.filter((range) => range.element !== undefined));
}

/**
 * One location for each line: its first instruction, or the nested statement when the line holds one that a step is
 * entered or a transition fires at.
 */
function firstOfEachLine(ranges: readonly SourceLineMapping[]): BreakpointLocation[] {
  const byLine = new Map<number, SourceLineMapping[]>();
  for (const range of [...ranges].sort((a, b) => a.pc - b.pc)) byLine.set(range.line, [...(byLine.get(range.line) ?? []), range]);
  return [...byLine.values()].map((onLine) => {
    const stop = onLine.find((range) => range.element !== undefined && parseElement(range.element)?.role !== undefined) ?? onLine[0]!;
    return { line: stop.line, pc: stop.pc, valid: true, ...(stop.element === undefined ? {} : { element: stop.element }) };
  }).sort((a, b) => a.pc - b.pc);
}

// =============================================================================
// Element <-> line, for the editors and the debugger
// =============================================================================

/** The same file by any spelling the editor and the build use: `src/main.ld.json`, `./src/main.ld.json`, `src/main.ld`. */
const sameFile = (a: string, b: string): boolean => {
  const key = (value: string) => value.replace(/\\/g, '/').replace(/^(\.\/)+/, '').replace(/^file:/i, '').replace(/\.json$/i, '').toLowerCase();
  return key(a) === key(b);
};

function pouOf(debugMap: DebugMap | null | undefined, sourceRef: string): DebugPOUInfo | undefined {
  return debugMap ? Object.values(debugMap.pou).find((pou) => pou.sourceRef !== undefined && sameFile(pou.sourceRef, sourceRef)) : undefined;
}

/**
 * The line a breakpoint on `element` is stored as, or undefined when execution never reaches the element (a rung or a
 * block that generated no statement, a step no transition enters). A rung or step holds its parts: the place that is
 * executed first stands for it.
 */
export function elementBreakpointLine(debugMap: DebugMap | null | undefined, sourceRef: string, element: SourceElementId): number | undefined {
  let locations = (pouOf(debugMap, sourceRef)?.breakpoints ?? []).filter((location) => location.valid && location.element !== undefined && elementWithin(element, location.element));
  // a step or a transition that the chart enters or fires stops there, not at the statements it also has on every scan
  const roles = locations.filter((location) => parseElement(location.element!)?.role !== undefined);
  if (roles.length > 0) locations = roles;
  return locations.sort((a, b) => a.pc - b.pc)[0]?.line;
}

/** The element of the place that `line` of the stored breakpoints names, if it is one. */
export function breakpointLineElement(debugMap: DebugMap | null | undefined, sourceRef: string, line: number): SourceElementId | undefined {
  return pouOf(debugMap, sourceRef)?.breakpoints.find((location) => location.line === line)?.element;
}

/** Every element of the source that execution can stop at, in the order the code runs. */
export function breakpointElements(debugMap: DebugMap | null | undefined, sourceRef: string): SourceElementId[] {
  const seen = new Set<SourceElementId>();
  for (const location of [...(pouOf(debugMap, sourceRef)?.breakpoints ?? [])].sort((a, b) => a.pc - b.pc)) {
    if (location.valid && location.element !== undefined) seen.add(location.element);
  }
  return [...seen];
}

/** The element whose statement the instruction at `pc` belongs to. */
export function elementAtPc(debugMap: DebugMap | null | undefined, sourceRef: string, pc: number): SourceElementId | undefined {
  const range = pouOf(debugMap, sourceRef)?.sourceMap.find((candidate) => pc >= candidate.pc && pc < candidate.pc + Math.max(candidate.length, 1));
  return range?.element;
}

/** Whether the debug map has places to stop for the source: a build made it from a diagram or an IL file. */
export function hasBreakpointElements(debugMap: DebugMap | null | undefined, sourceRef: string): boolean {
  return (pouOf(debugMap, sourceRef)?.breakpoints ?? []).some((location) => location.element !== undefined);
}

/**
 * The contract of the reference index (plan-u2.md, C-R): types only. Tasks R1 to R4 implement against it, and no lane
 * changes it without the parent.
 */
import type { SourceElementId } from '../models/sourceElements';
import type { ConfigEditorKind } from '../navigator/configEditors';

/** Where a name or an address is written. A diagram has no text position: its places are elements (LNG-003). */
export type Place =
  | { kind: 'text'; file: string; line: number; column: number; length: number }
  | { kind: 'element'; file: string; element: SourceElementId; field: string }
  | { kind: 'table'; file: string; section: 'local' | 'inputs' | 'outputs'; name: string }
  | { kind: 'config'; editor: ConfigEditorKind; row: string }
  | { kind: 'watch'; path: string }
  | { kind: 'scenario'; file: string; pointer: string };
export type OccurrenceRole = 'declaration' | 'write' | 'use' | 'binding';
export type Language = 'ST' | 'IL' | 'LD' | 'FBD' | 'SFC' | 'IO' | 'WATCH' | 'SCENARIO';
export interface Occurrence {
  language: Language;
  place: Place;
  role: OccurrenceRole;
  text: string;
}
/** What is looked up: a symbol of the project, or a point of the process image. */
export type RefTarget = { kind: 'symbol'; scope: string; name: string } | { kind: 'address'; address: NormalizedAddress };
/** %IX0.0 and %I0.0 are one point; %IB0 is another (the byte that contains it). */
export interface NormalizedAddress {
  area: 'I' | 'Q' | 'M';
  byte: number;
  bit?: number;
  width: 1 | 8 | 16 | 32 | 64;
}
export interface References {
  target: RefTarget;
  definition?: Occurrence;
  uses: Occurrence[];
  truncated: boolean;
  broken: string[];
}
/** The same caps as SEARCH_LIMITS (projectSearch.ts). */
export const REFERENCE_LIMITS = { occurrences: 500, perFile: 100 } as const;

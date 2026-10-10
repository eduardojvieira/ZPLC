/**
 * Opening a Ladder, FBD or SFC file validates it first. A bad file comes back as an error value that
 * names the file and its first violations, so the editor shows a message instead of crashing on it.
 *
 * Stage one checks the shape each editor relies on and reports every violation it finds; stage two
 * runs the model's own parser, which holds the semantic rules (duplicate ids, unknown block ports).
 */

import * as z from 'zod/v4';
import { parseFBDModel, serializeFBDModel, type FBDModel } from './fbd';
import { LD_COIL_TYPES, LD_CONTACT_TYPES } from './ldSupport';
import { parseLDModel, serializeLDModel, type LDModel } from './ld';
import { parseSFCModel, serializeSFCModel, type SFCModel } from './sfc';

export const MAX_VIOLATIONS = 5;

export interface VisualFileError {
  fileName: string;
  /** At most MAX_VIOLATIONS, in document order. */
  violations: string[];
  /** Violations found beyond the ones listed. */
  more: number;
}

export type VisualFileLoad<T> = { ok: true; model: T } | { ok: false; error: VisualFileError };

const id = z.string().min(1);
const finite = z.number();
const position = z.looseObject({ x: finite, y: finite });
const variable = z.looseObject({ name: id, type: id });

const LD_ELEMENT_TYPES = ['left_rail', 'right_rail', ...LD_CONTACT_TYPES, ...LD_COIL_TYPES, 'function_block'] as const;
const ldElement = z.looseObject({ id, type: z.enum(LD_ELEMENT_TYPES), variable: z.string().optional() });
const ldRung = z.looseObject({
  id,
  number: finite,
  grid: z.array(z.array(z.looseObject({ element: ldElement.nullish() }))).optional(),
  elements: z.array(ldElement).optional(),
  gridConfig: z.looseObject({ cols: z.int().min(1), rows: z.int().min(1) }).optional(),
}).refine((rung) => rung.grid !== undefined || rung.elements !== undefined, { message: 'a rung needs a grid or elements' });
const ldFile = z.looseObject({
  name: z.string(),
  variables: z.looseObject({ local: z.array(variable), outputs: z.array(variable), inputs: z.array(variable).optional() }),
  rungs: z.array(ldRung),
});

const fbdPort = z.looseObject({ name: id, type: id });
const fbdEndpoint = z.looseObject({ block: id, port: id });
const fbdFile = z.looseObject({
  name: id,
  variables: z.looseObject({ local: z.array(variable), outputs: z.array(variable), inputs: z.array(variable).optional() }),
  blocks: z.array(z.looseObject({
    id, type: id, position, inputs: z.array(fbdPort).optional(), outputs: z.array(fbdPort).optional(),
  })),
  connections: z.array(z.looseObject({ id, from: fbdEndpoint, to: fbdEndpoint })),
});

const sfcFile = z.looseObject({
  name: z.string(),
  variables: z.looseObject({ local: z.array(variable), outputs: z.array(variable), inputs: z.array(variable).optional() }).optional(),
  steps: z.array(z.looseObject({
    id: z.string(), name: z.string(), position,
    actions: z.array(z.looseObject({ actionName: id, qualifier: id })).optional(),
  })),
  transitions: z.array(z.looseObject({
    id: z.string(), fromStep: z.string(), toStep: z.string(), condition: z.string(), position: position.optional(),
  })),
  actions: z.array(z.looseObject({ id, name: id, body: z.string() })).optional(),
});

/** `rungs[0].grid[1]`-style location of a zod issue, followed by its message. */
function describeIssue(issue: z.core.$ZodIssue): string {
  const location = issue.path.reduce<string>((text, part) => typeof part === 'number' ? `${text}[${part}]` : text ? `${text}.${String(part)}` : String(part), '');
  const message = issue.message.split('\n', 1)[0];
  return location ? `${location}: ${message}` : message;
}

function rejected(fileName: string, all: string[]): { ok: false; error: VisualFileError } {
  return { ok: false, error: { fileName, violations: all.slice(0, MAX_VIOLATIONS), more: Math.max(0, all.length - MAX_VIOLATIONS) } };
}

function load<T>(fileName: string, content: string, shape: z.ZodType, parse: (text: string) => T): VisualFileLoad<T> {
  let document: unknown;
  try {
    document = JSON.parse(content);
  } catch (error) {
    return rejected(fileName, [`not valid JSON: ${error instanceof Error ? error.message.split('\n', 1)[0] : 'unreadable'}`]);
  }
  const checked = shape.safeParse(document);
  if (!checked.success) return rejected(fileName, checked.error.issues.map(describeIssue));
  try {
    return { ok: true, model: parse(content) };
  } catch (error) {
    return rejected(fileName, [error instanceof Error ? error.message.split('\n', 1)[0] : 'the model could not be read']);
  }
}

export const loadLDFile = (fileName: string, content: string): VisualFileLoad<LDModel> => load(fileName, content, ldFile, parseLDModel);
export const loadFBDFile = (fileName: string, content: string): VisualFileLoad<FBDModel> => load(fileName, content, fbdFile, parseFBDModel);
export const loadSFCFile = (fileName: string, content: string): VisualFileLoad<SFCModel> => load(fileName, content, sfcFile, parseSFCModel);

/**
 * Whether `next`, what an editor commit serialized, says no more than `current`, the file as it was opened.
 * An editor re-serializes the whole model on every commit, so a drag that ends where it started, or a file
 * written by hand in another layout, would otherwise be rewritten without a change (LNG-014): a commit that
 * leaves the model as it was keeps the bytes the file has.
 */
export function isUnchangedVisualDocument(language: 'LD' | 'FBD' | 'SFC', current: string, next: string): boolean {
  if (current === next) return true;
  try {
    const opened = language === 'LD' ? serializeLDModel(parseLDModel(current))
      : language === 'FBD' ? serializeFBDModel(parseFBDModel(current))
        : serializeSFCModel(parseSFCModel(current));
    // the same document in another order of keys is the same document: an editor writes the fields of a block in its own order
    return opened === next || sortedKeys(JSON.parse(opened)) === sortedKeys(JSON.parse(next));
  } catch {
    return false; // a file that does not open is not a file an editor committed
  }
}

/** The JSON of a value with the keys of every object in order, so two documents compare as what they say. */
function sortedKeys(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown) => (
    inner && typeof inner === 'object' && !Array.isArray(inner)
      ? Object.fromEntries(Object.entries(inner as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : inner
  ));
}

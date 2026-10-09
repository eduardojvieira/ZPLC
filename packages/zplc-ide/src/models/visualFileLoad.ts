/**
 * Opening a Ladder, FBD or SFC file validates it first. A bad file comes back as an error value that
 * names the file and its first violations, so the editor shows a message instead of crashing on it.
 *
 * Stage one checks the shape each editor relies on and reports every violation it finds; stage two
 * runs the model's own parser, which holds the semantic rules (duplicate ids, unknown block ports).
 */

import * as z from 'zod/v4';
import { parseFBDModel, type FBDModel } from './fbd';
import { parseLDModel, type LDModel } from './ld';
import { parseSFCModel, type SFCModel } from './sfc';

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
const list = z.array(z.unknown());

const LD_ELEMENT_TYPES = [
  'left_rail', 'right_rail', 'contact_no', 'contact_nc', 'contact_p', 'contact_n',
  'coil', 'coil_negated', 'coil_set', 'coil_reset', 'coil_p', 'coil_n', 'function_block',
] as const;
const ldElement = z.looseObject({ id, type: z.enum(LD_ELEMENT_TYPES) });
const ldVariable = z.looseObject({ name: id, type: id });
const ldRung = z.looseObject({
  id,
  number: finite,
  grid: z.array(z.array(z.looseObject({ element: ldElement.nullish() }))).optional(),
  elements: z.array(ldElement).optional(),
  gridConfig: z.looseObject({ cols: z.int().min(1), rows: z.int().min(1) }).optional(),
}).refine((rung) => rung.grid !== undefined || rung.elements !== undefined, { message: 'a rung needs a grid or elements' });
const ldFile = z.looseObject({
  name: z.string(),
  variables: z.looseObject({ local: z.array(ldVariable), outputs: z.array(ldVariable), inputs: z.array(ldVariable).optional() }),
  rungs: z.array(ldRung),
});

const fbdPort = z.looseObject({ name: id, type: id });
const fbdEndpoint = z.looseObject({ block: id, port: id });
const fbdFile = z.looseObject({
  name: id,
  variables: z.looseObject({ local: list, outputs: list, inputs: list.optional() }),
  blocks: z.array(z.looseObject({
    id, type: id, position: z.looseObject({ x: finite, y: finite }), inputs: z.array(fbdPort).optional(), outputs: z.array(fbdPort).optional(),
  })),
  connections: z.array(z.looseObject({ id, from: fbdEndpoint, to: fbdEndpoint })),
});

const sfcFile = z.looseObject({
  name: z.string(),
  steps: z.array(z.looseObject({ id: z.string(), name: z.string() })),
  transitions: z.array(z.looseObject({ id: z.string(), fromStep: z.string(), toStep: z.string() })),
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

/**
 * Opening a Ladder, FBD or SFC file validates it first. A bad file comes back as an error value that
 * names the file and its first violations, so the editor shows a message instead of crashing on it.
 *
 * Stage one checks the shape each editor relies on and reports every violation it finds; stage two
 * runs the model's own parser, which holds the semantic rules (duplicate ids, unknown block ports).
 */

import * as z from 'zod/v4';
import { FBD_VALUE_BLOCKS, fbdPaletteBlocks } from '../editors/fbd/palette';
import { fbdPlacesBlock } from '../transpiler/fbdToST';
import { parseFBDModel, serializeFBDModel, type FBDModel } from './fbd';
import { LD_COIL_TYPES, LD_CONTACT_TYPES } from './ldSupport';
import { parseLDModel, serializeLDModel, type LDModel } from './ld';
import type { ProjectBlock } from './projectBlocks';
import { SFC_QUALIFIERS, parseSFCModel, serializeSFCModel, type SFCModel } from './sfc';

export const MAX_VIOLATIONS = 5;

/**
 * One violation as data (AIX-013): what kind it is, its JSON path, and for a closed set the value found and the accepted
 * values. No words: the editor and the Assistant say it through the catalogue, the CLI and the MCP compose their own.
 * `reason` is the words of zod or of the model parser, for the kinds that have no more structure.
 */
export interface VisualFileViolation {
  code: 'not-json' | 'invalid-value' | 'missing-field' | 'unknown-block' | 'invalid';
  path: string;
  found?: string;
  acceptedValues?: readonly string[];
  /** For unknown-block: the id of the block. */
  block?: string;
  reason?: string;
}

export interface VisualFileError {
  fileName: string;
  /** At most MAX_VIOLATIONS, in document order, as they were before `details`: kept for the consumers that read them. */
  violations: string[];
  /** The same violations, as data. */
  details: VisualFileViolation[];
  /** Violations found beyond the ones listed. */
  more: number;
}

export type VisualFileLoad<T> = { ok: true; model: T } | { ok: false; error: VisualFileError };

const id = z.string().min(1);
const finite = z.number();
const position = z.looseObject({ x: finite, y: finite });
const variable = z.looseObject({ name: id, type: id });

export const LD_ELEMENT_TYPES = ['left_rail', 'right_rail', ...LD_CONTACT_TYPES, ...LD_COIL_TYPES, 'function_block', 'function'] as const;
// A function box (LNG-028) names its function and lists its operands; an operand not bound yet is an empty string the build reports.
const ldElement = z
  .looseObject({
    id,
    type: z.enum(LD_ELEMENT_TYPES),
    variable: z.string().optional(),
    functionName: id.optional(),
    operands: z.array(z.string()).optional(),
    output: z.string().optional(),
  })
  .superRefine((element, context) => {
    if (element.type !== 'function') return;
    // zod's own words for a missing field: `expected string, received undefined`
    const needed = { functionName: id, operands: z.array(z.string()) };
    for (const [field, shape] of Object.entries(needed)) {
      const checked = shape.safeParse(element[field as keyof typeof needed]);
      if (!checked.success)
        for (const issue of checked.error.issues) context.addIssue({ code: 'custom', message: issue.message, path: [field] });
    }
  });
const ldRung = z
  .looseObject({
    id,
    number: finite,
    grid: z.array(z.array(z.looseObject({ element: ldElement.nullish() }))).optional(),
    elements: z.array(ldElement).optional(),
    gridConfig: z.looseObject({ cols: z.int().min(1), rows: z.int().min(1) }).optional(),
  })
  .refine((rung) => rung.grid !== undefined || rung.elements !== undefined, { message: 'a rung needs a grid or elements' });
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
  blocks: z.array(
    z.looseObject({
      id,
      type: id,
      position,
      inputs: z.array(fbdPort).optional(),
      outputs: z.array(fbdPort).optional(),
    }),
  ),
  connections: z.array(z.looseObject({ id, from: fbdEndpoint, to: fbdEndpoint })),
});

const sfcFile = z.looseObject({
  name: z.string(),
  variables: z.looseObject({ local: z.array(variable), outputs: z.array(variable), inputs: z.array(variable).optional() }).optional(),
  steps: z.array(
    z.looseObject({
      id: z.string(),
      name: z.string(),
      position,
      actions: z.array(z.looseObject({ actionName: id, qualifier: z.enum(SFC_QUALIFIERS) })).optional(),
    }),
  ),
  transitions: z.array(
    z.looseObject({
      id: z.string(),
      fromStep: z.string(),
      toStep: z.string(),
      condition: z.string(),
      position: position.optional(),
    }),
  ),
  actions: z.array(z.looseObject({ id, name: id, body: z.string() })).optional(),
});

/** A violation and the string `violations` has always held for it. */
type Found = { detail: VisualFileViolation; legacy: string };

const shown = (value: unknown): string => (typeof value === 'string' ? value : (JSON.stringify(value) ?? String(value)));
const valueAt = (document: unknown, path: readonly PropertyKey[]): unknown =>
  path.reduce<unknown>((value, part) => (value as Record<PropertyKey, unknown> | undefined)?.[part], document);

/** A zod issue at its `rungs[0].grid[1]`-style place. */
function describeIssue(issue: z.core.$ZodIssue, document: unknown): Found {
  const path = issue.path.reduce<string>(
    (text, part) => (typeof part === 'number' ? `${text}[${part}]` : text ? `${text}.${String(part)}` : String(part)),
    '',
  );
  const reason = issue.message.split('\n', 1)[0]!;
  const legacy = path ? `${path}: ${reason}` : reason;
  if (issue.code === 'invalid_value' && issue.values.every((value) => typeof value === 'string')) {
    const detail = {
      code: 'invalid-value' as const,
      path,
      found: shown(valueAt(document, issue.path)),
      acceptedValues: issue.values as string[],
    };
    return { detail, legacy };
  }
  const missing = issue.code === 'invalid_type' && valueAt(document, issue.path) === undefined;
  return { detail: { code: missing ? 'missing-field' : 'invalid', path, reason }, legacy };
}

function rejected(fileName: string, all: Found[]): { ok: false; error: VisualFileError } {
  const listed = all.slice(0, MAX_VIOLATIONS);
  return {
    ok: false,
    error: {
      fileName,
      violations: listed.map(({ legacy }) => legacy),
      details: listed.map(({ detail }) => detail),
      more: Math.max(0, all.length - MAX_VIOLATIONS),
    },
  };
}

function load<T>(
  fileName: string,
  content: string,
  shape: z.ZodType,
  parse: (text: string) => T,
  check: (document: unknown) => Found[] = () => [],
): VisualFileLoad<T> {
  let document: unknown;
  try {
    document = JSON.parse(content);
  } catch (error) {
    const reason = error instanceof Error ? error.message.split('\n', 1)[0] : 'unreadable';
    return rejected(fileName, [{ detail: { code: 'not-json', path: '', reason }, legacy: `not valid JSON: ${reason}` }]);
  }
  const checked = shape.safeParse(document);
  if (!checked.success)
    return rejected(
      fileName,
      checked.error.issues.map((issue) => describeIssue(issue, document)),
    );
  const unchecked = check(document);
  if (unchecked.length > 0) return rejected(fileName, unchecked);
  try {
    return { ok: true, model: parse(content) };
  } catch (error) {
    const reason = error instanceof Error ? error.message.split('\n', 1)[0]! : 'the model could not be read';
    return rejected(fileName, [{ detail: { code: 'invalid', path: '', reason }, legacy: reason }]);
  }
}

/**
 * The blocks no diagram can place, by the rule of the FBD transpiler and the palette (`fbdPlacesBlock`); the accepted
 * values are the palette's blocks and the ones the project declares that a diagram can place.
 */
function unplacedBlocks(document: unknown, projectBlocks: readonly ProjectBlock[]): Found[] {
  const blocks = (document as { blocks: Array<{ id: string; type: string }> }).blocks;
  const placeable = (type: string) => (FBD_VALUE_BLOCKS as readonly string[]).includes(type) || fbdPlacesBlock(type, projectBlocks);
  let accepted: string[] | undefined;
  return blocks.flatMap((block, index) => {
    if (placeable(block.type)) return [];
    accepted ??= [
      ...new Set([
        ...fbdPaletteBlocks(),
        ...projectBlocks.map((declared) => declared.name).filter((name) => fbdPlacesBlock(name, projectBlocks)),
      ]),
    ];
    const path = `blocks[${index}].type`;
    return [
      {
        detail: { code: 'unknown-block' as const, path, block: block.id, found: block.type, acceptedValues: accepted },
        legacy: `${path}: '${block.type}'`,
      },
    ];
  });
}

export const loadLDFile = (fileName: string, content: string): VisualFileLoad<LDModel> => load(fileName, content, ldFile, parseLDModel);
/**
 * `projectBlocks`, when the caller knows them, has every block checked against what a diagram can place (AIX-013); the editor
 * opens a file without them, and a block of the project would otherwise be refused.
 */
export const loadFBDFile = (fileName: string, content: string, projectBlocks?: readonly ProjectBlock[]): VisualFileLoad<FBDModel> =>
  load(
    fileName,
    content,
    fbdFile,
    (text) => parseFBDModel(text, projectBlocks),
    projectBlocks ? (document) => unplacedBlocks(document, projectBlocks) : undefined,
  );
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
    const opened =
      language === 'LD'
        ? serializeLDModel(parseLDModel(current))
        : language === 'FBD'
          ? serializeFBDModel(parseFBDModel(current))
          : serializeSFCModel(parseSFCModel(current));
    // the same document in another order of keys is the same document: an editor writes the fields of a block in its own order
    return opened === next || sortedKeys(JSON.parse(opened)) === sortedKeys(JSON.parse(next));
  } catch {
    return false; // a file that does not open is not a file an editor committed
  }
}

/** The JSON of a value with the keys of every object in order, so two documents compare as what they say. */
function sortedKeys(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown) =>
    inner && typeof inner === 'object' && !Array.isArray(inner)
      ? Object.fromEntries(Object.entries(inner as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : inner,
  );
}

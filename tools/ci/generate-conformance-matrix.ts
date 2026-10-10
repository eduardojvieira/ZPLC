// The tracked IEC 61131-3 conformance matrix (VF-003, WP-14). Section 6 of the 2.0 remediation spec may be untracked,
// so the suite, the language reference (DOC-006) and the progress counts read conformance/matrix.json and never the spec.
//
//   bun tools/ci/generate-conformance-matrix.ts           regenerate the matrix from the spec, keeping the "cases" of each row
//   bun tools/ci/generate-conformance-matrix.ts --check   CI: fail when the committed matrix is not what section 6 generates;
//                                                         when the spec is absent, only check that the matrix is well formed
//   --spec <file>                                         where to read the spec (default: specs/011-zplc-2-0-remediation/spec.md)
//
// Everything in a row but "cases" comes from section 6. "cases" is written by tools/ci/conformance-coverage.ts --write
// from the "matrix" lists of the conformance cases, so adding a case never edits this file by hand.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { ID_PATTERN } from './generate-requirement-index';

/** State today. The spec's "Ignored" is parsed with no effect; "unverified" is a row the spec says was "not executed". */
export type RowStatus = 'works' | 'partial' | 'broken' | 'ignored' | 'missing' | 'unverified';
/** 2.0 target. "decision" is a row left to decision D-04 whose recommendation is 2.x: in 2.0 the construct is rejected with a message. */
export type RowTarget = 'works' | 'rejects' | 'decision';

export interface MatrixRow {
  id: string;
  area: string;
  section: string;
  title: string;
  status: RowStatus;
  /** The spec's own words for the state today and the target, so that nothing the table says is lost. */
  statusText: string;
  target: RowTarget;
  targetText: string;
  requirements: string[];
  /** Conformance cases that cover the row, as paths under conformance/ without the extension. Written by conformance-coverage. */
  cases: string[];
  /** Architecture-sensitive behaviour (VF-005): "arch-sensitive" and, among those, "alignment". */
  tags: string[];
}
export interface Matrix { schemaVersion: 1; source: string; rows: MatrixRow[] }

export const STATUSES: RowStatus[] = ['works', 'partial', 'broken', 'ignored', 'missing', 'unverified'];
export const TARGETS: RowTarget[] = ['works', 'rejects', 'decision'];
export const ROW_TAGS = ['arch-sensitive', 'alignment'];
const ROOT = new URL('../../', import.meta.url);
export const MATRIX_FILE = new URL('conformance/matrix.json', ROOT);
const SPEC_FILE = 'specs/011-zplc-2-0-remediation/spec.md';
const SOURCE = 'specs/011-zplc-2-0-remediation/spec.md section 6';
const SLUG_MAX = 48;

/** The sections of section 6 and the area slug each one gets. A new subsection must be named here on purpose. */
const AREAS: Record<string, string> = {
  'Data types': 'data-types',
  Literals: 'literals',
  Declarations: 'declarations',
  'Program organisation units': 'pous',
  'Statements and operators': 'statements',
  'Conversions and standard functions': 'functions',
  'Standard and library function blocks': 'blocks',
  'Sequential Function Chart': 'sfc',
  'Instruction List': 'il',
  'Ladder Diagram and Function Block Diagram': 'ld-fbd',
  Configuration: 'configuration',
};

/**
 * The id of a row is its area and a slug of its element. These elements are too long or too symbolic for a readable
 * slug, so they are named here; a name for an element that section 6 no longer has stops the generator.
 */
const SLUGS: Record<string, string> = {
  'REF_TO, REF(), ^': 'ref-to-ref-deref',
  'Arrays with negative or constant bounds; arrays of structures, function blocks, strings, 64-bit types': 'arrays-bounds-and-element-types',
  'Type aliases; several types in one TYPE block': 'type-aliases-and-type-blocks',
  'Decimal, real, exponent, TRUE, FALSE': 'decimal-real-exponent-boolean',
  'T#, D#, TOD#, DT#, string literals': 'time-date-and-string-literals',
  'Based literals 2#, 8#, 16#; digit separators': 'based-literals-and-digit-separators',
  'Typed literals such as INT#5': 'typed-literals',
  'AT %I, AT %Q (bit, byte, word, double word)': 'at-i-at-q-direct-addresses',
  'Function-block instances inside function blocks; arrays of instances': 'function-block-instances-nested-and-arrays',
  'Function-block call with =>': 'function-block-call-with-output-binding',
  'POUs and globals shared across files; libraries': 'shared-pous-and-libraries',
  'Function call as a statement; empty statement': 'call-statement-and-empty-statement',
  '+ - * / MOD and comparisons': 'arithmetic-and-comparisons',
  '**, &, bit access w.0': 'power-ampersand-and-bit-access',
  'Comments (* *)': 'comments-parenthesis-star',
  'Comments /* */': 'comments-slash-star',
  'INT_TO_REAL, REAL_TO_INT, BOOL_TO_INT, INT_TO_BOOL, TRUNC, ROUND': 'basic-conversions',
  'All other X_TO_Y conversions': 'other-conversions',
  'ABS, MAX, MIN, LIMIT, SEL, MUX, SQRT': 'selection-limit-and-sqrt-functions',
  'Trigonometric, logarithmic and exponential functions': 'trigonometric-logarithmic-exponential',
  'SHL, SHR, ROL, ROR and the word logic functions': 'shift-rotate-and-word-logic',
  'String functions (14)': 'string-functions',
  'Function forms of operators (ADD, MUL, GT, EQ, MOVE)': 'function-forms-of-operators',
  'R_TRIG, F_TRIG, SR, RS': 'edge-detectors-and-bistables',
  'BLINK, PWM, PULSE, HYSTERESIS, DEADBAND, LAG_FILTER, RAMP_REAL, INTEGRAL, DERIVATIVE, PID_Compact, FIFO, LIFO (not in the standard)': 'library-blocks-not-in-the-standard',
  'Communication and cloud blocks (12)': 'communication-and-cloud-blocks',
  'The 34 implemented operators on a DINT or BOOL accumulator, including function-block calls CAL, CALC and CALCN with named parameters and the returns RET, RETC and RETCN (IDE/src/compiler/il/ilToST.ts:442-484, IDE/src/compiler/il/parser.ts:334, :399-416)': 'implemented-operators',
  'Typed accumulator; calls of functions (function-block calls exist, above); shifts': 'typed-accumulator-function-calls-and-shifts',
  'LD: normally open and closed contacts; normal, negated, set and reset coils': 'ld-contacts-and-coils',
  'FBD: gates, comparison, arithmetic, selection, timers, counters, triggers, bistables': 'fbd-blocks',
  'User function blocks and functions in LD and FBD': 'user-blocks-and-functions',
  'Cyclic tasks in zplc.json (interval, priority, programs)': 'cyclic-tasks',
  'Output ownership check between programs; memory limit check': 'ownership-and-memory-checks',
  'Textual CONFIGURATION, RESOURCE, TASK': 'textual-configuration',
};

/** Rows whose behaviour depends on the architecture (VF-005): division, shifts, float conversion, alignment, 64-bit arithmetic. */
const ARCH_SENSITIVE = [
  'data-types.dint', 'data-types.udint', 'data-types.lint-ulint-lword', 'data-types.real', 'data-types.lreal', 'data-types.time',
  'data-types.date-tod-dt', 'data-types.struct', 'data-types.arrays-bounds-and-element-types',
  'statements.arithmetic-and-comparisons', 'functions.implicit-widening-conversion', 'functions.basic-conversions',
  'functions.selection-limit-and-sqrt-functions', 'functions.trigonometric-logarithmic-exponential', 'functions.shift-rotate-and-word-logic',
];
/** Rows that read or write a multi-byte value at a byte offset, where an unaligned access would show on a Cortex-M0. */
const ALIGNMENT = ['data-types.lint-ulint-lword', 'data-types.lreal', 'data-types.date-tod-dt', 'data-types.struct', 'data-types.arrays-bounds-and-element-types'];

// ---------------------------------------------------------------------------------------------------------------------
// Reading section 6
// ---------------------------------------------------------------------------------------------------------------------

const plain = (text: string) => text.replaceAll('`', '').replace(/\s+/g, ' ').trim();

/** "CMP-011, CMP-016" and "COM-001 to COM-009" as a list of identifiers. */
export function expandRequirements(cell: string): string[] {
  const found: string[] = [];
  const text = plain(cell);
  for (const match of text.matchAll(/\b([A-Z]{2,4})-([0-9]{3})(?: to ([A-Z]{2,4})-([0-9]{3}))?/g)) {
    const [, prefix = '', from = '', endPrefix, to] = match;
    if (to === undefined) { found.push(`${prefix}-${from}`); continue; }
    if (endPrefix !== prefix) throw new Error(`"${match[0]}" crosses workstreams`);
    for (let n = Number(from); n <= Number(to); n += 1) found.push(`${prefix}-${String(n).padStart(3, '0')}`);
  }
  return found;
}

/** Status today by the words of the spec's cell. The first rule that matches wins; a cell no rule knows stops the generator. */
const STATUS_RULES: Array<[RegExp, RowStatus]> = [
  [/^Works with two-input gates/, 'partial'],
  [/^Works/, 'works'],
  [/^Partial/, 'partial'],
  [/^`?SHL`? and `?ROL`? work/, 'partial'],
  [/^Broken/, 'broken'],
  [/^Shown in the legend; do not compile/, 'broken'],
  [/^Offered in the palette; rejected by the transpiler/, 'broken'],
  [/^Ignored/, 'ignored'],
  [/^Missing/, 'missing'],
  [/^(Registered|Present)[;,] not executed/, 'unverified'],
  [/^Registered, not executed/, 'unverified'],
];

/** 2.0 target by the words of the spec's cell. */
const TARGET_RULES: Array<[RegExp, RowTarget]> = [
  [/^Works/, 'works'],
  [/^Decision D-04 \(2\.x recommended\); rejected with a message/, 'rejects'],
  [/^Decision D-04 \(2\.x recommended\)$/, 'decision'],
  [/^Reported as an error/, 'rejects'],
  [/^Detected and reported/, 'rejects'],
];

function classify<T>(rules: Array<[RegExp, T]>, text: string, what: string, where: string): T {
  const hit = rules.find(([pattern]) => pattern.test(text));
  if (!hit) throw new Error(`${where}: no rule reads the ${what} "${text}"; add one to tools/ci/generate-conformance-matrix.ts`);
  return hit[1];
}

function slug(text: string): string {
  const words = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (words.length <= SLUG_MAX) return words;
  const cut = words.slice(0, SLUG_MAX);
  return cut.slice(0, Math.max(cut.lastIndexOf('-'), 1));
}

/**
 * The rows of section 6 in spec order, without cases. `strict` is for the whole spec: it stops when a name in SLUGS or a row of
 * the architecture lists is no longer in section 6, which a fixture of a few rows cannot satisfy.
 */
export function parseSection(spec: string, strict = false): MatrixRow[] {
  const start = spec.search(/^## 6\. /m);
  if (start < 0) throw new Error('the spec has no "## 6." section');
  const after = spec.slice(start + 1);
  const end = after.search(/^## /m);
  const section = end < 0 ? after : after.slice(0, end);
  const rows: MatrixRow[] = [];
  const used = new Set<string>();
  const named = new Set<string>();
  let current: { number: string; area: string } | undefined;
  for (const line of section.split('\n')) {
    const heading = /^### (6\.[0-9]+) (.+)$/.exec(line);
    if (heading) {
      const [, number = '', name = ''] = heading;
      const area = AREAS[name.trim()];
      if (area === undefined) throw new Error(`section ${number} "${name}" has no area slug; add it to tools/ci/generate-conformance-matrix.ts`);
      current = { number, area };
      continue;
    }
    if (!line.startsWith('|') || !current) continue;
    const cells = line.split(/ \| /).map((cell) => cell.replace(/^\| ?/, '').replace(/ ?\|$/, '').trim());
    if (cells[0] === 'Element' || /^-+$/.test(cells[0]!.replaceAll('|', ''))) continue;
    if (cells.length !== 4) throw new Error(`section ${current.number}: a row must have four cells, found ${cells.length} in "${line}"`);
    const [element = '', state = '', target = '', requirement = ''] = cells;
    const where = `section ${current.number} "${plain(element)}"`;
    const name = SLUGS[plain(element)];
    if (name !== undefined) named.add(plain(element));
    let id = `${current.area}.${name ?? slug(plain(element))}`;
    for (let n = 2; used.has(id); n += 1) id = `${current.area}.${name ?? slug(plain(element))}-${n}`;
    used.add(id);
    const requirements = expandRequirements(requirement);
    if (requirements.length === 0) throw new Error(`${where}: names no requirement`);
    rows.push({
      id, area: current.area, section: current.number, title: plain(element),
      status: classify(STATUS_RULES, plain(state), 'state today', where), statusText: plain(state),
      target: classify(TARGET_RULES, plain(target), '2.0 target', where), targetText: plain(target),
      requirements, cases: [],
      tags: ARCH_SENSITIVE.includes(id) ? [...(ALIGNMENT.includes(id) ? ['arch-sensitive', 'alignment'] : ['arch-sensitive'])] : [],
    });
  }
  if (rows.length === 0) throw new Error('section 6 has no rows');
  const stale = Object.keys(SLUGS).filter((title) => !named.has(title));
  if (strict && stale.length > 0) throw new Error(`SLUGS names elements that section 6 no longer has: ${stale.join('; ')}`);
  const unknown = [...ARCH_SENSITIVE, ...ALIGNMENT].filter((id) => !rows.some((candidate) => candidate.id === id));
  if (strict && unknown.length > 0) throw new Error(`the architecture-sensitive lists name rows that section 6 does not have: ${unknown.join(', ')}`);
  return rows;
}

export function buildMatrix(spec: string, casesOf: (id: string) => string[] = () => [], strict = true): Matrix {
  const rows = parseSection(spec, strict).map((row) => ({ ...row, cases: casesOf(row.id) }));
  return { schemaVersion: 1, source: SOURCE, rows };
}

// ---------------------------------------------------------------------------------------------------------------------
// The file
// ---------------------------------------------------------------------------------------------------------------------

/** One row per line, so that a change to the spec or a new case shows as a small diff. */
export const serialize = (matrix: Matrix): string =>
  `{\n  "schemaVersion": ${matrix.schemaVersion},\n  "source": ${JSON.stringify(matrix.source)},\n  "rows": [\n${matrix.rows.map((row) => `    ${JSON.stringify(row)}`).join(',\n')}\n  ]\n}\n`;

export function validateMatrix(matrix: unknown): string[] {
  const errors: string[] = [];
  const value = matrix as Partial<Matrix> | null;
  if (typeof value !== 'object' || value === null || value.schemaVersion !== 1 || !Array.isArray(value.rows)) return ['the matrix must be {"schemaVersion": 1, "source": ..., "rows": [...]}'];
  const seen = new Set<string>();
  for (const row of value.rows as MatrixRow[]) {
    const id = String(row?.id);
    if (typeof row?.id !== 'string' || !/^[a-z0-9-]+\.[a-z0-9-]+$/.test(row.id)) { errors.push(`${id}: id must look like data-types.bool`); continue; }
    if (seen.has(id)) errors.push(`${id}: duplicate`);
    seen.add(id);
    if (!row.id.startsWith(`${row.area}.`)) errors.push(`${id}: the id must start with its area "${row.area}"`);
    if (typeof row.title !== 'string' || row.title === '') errors.push(`${id}: title must not be empty`);
    if (!/^6\.[0-9]+$/.test(String(row.section))) errors.push(`${id}: section must look like 6.1`);
    if (!STATUSES.includes(row.status)) errors.push(`${id}: status must be one of ${STATUSES.join(', ')}`);
    if (!TARGETS.includes(row.target)) errors.push(`${id}: target must be one of ${TARGETS.join(', ')}`);
    if (typeof row.statusText !== 'string' || typeof row.targetText !== 'string') errors.push(`${id}: statusText and targetText must be the spec's words`);
    if (!Array.isArray(row.requirements) || row.requirements.length === 0 || !row.requirements.every((req) => ID_PATTERN.test(String(req)))) errors.push(`${id}: requirements must list identifiers like CMP-011`);
    if (!Array.isArray(row.cases) || !row.cases.every((name) => typeof name === 'string' && /^[a-z0-9-]+\/[a-z0-9._-]+$/.test(name))) errors.push(`${id}: cases must be paths like cmp/cmp-011-int-limits`);
    if (!Array.isArray(row.tags) || !row.tags.every((tag) => ROW_TAGS.includes(String(tag)))) errors.push(`${id}: tags must be among ${ROW_TAGS.join(', ')}`);
  }
  return errors;
}

const REGENERATE = 'regenerate it with: bun tools/ci/generate-conformance-matrix.ts';

/** The differences between the committed matrix and section 6, ignoring "cases" (the coverage script owns them). */
export function checkAgainstSpec(committed: Matrix, spec: string, strict = true): string[] {
  const expected = parseSection(spec, strict);
  const strip = ({ cases: _cases, ...rest }: MatrixRow) => JSON.stringify(rest);
  const before = new Map(committed.rows.map((row) => [row.id, strip(row)]));
  const after = new Map(expected.map((row) => [row.id, strip(row)]));
  const names = (ids: string[]) => (ids.length === 0 ? 'none' : ids.slice(0, 8).join(', ') + (ids.length > 8 ? ` and ${ids.length - 8} more` : ''));
  const added = [...after.keys()].filter((id) => !before.has(id));
  const removed = [...before.keys()].filter((id) => !after.has(id));
  const changed = [...after].filter(([id, text]) => before.has(id) && before.get(id) !== text).map(([id]) => id);
  const sameOrder = JSON.stringify([...before.keys()]) === JSON.stringify([...after.keys()]);
  if (added.length + removed.length + changed.length === 0 && sameOrder && committed.source === SOURCE) return [];
  return [`conformance/matrix.json is stale against section 6 of the spec (added ${names(added)}; removed ${names(removed)}; changed ${names(changed)}${sameOrder ? '' : '; order differs'}); ${REGENERATE}`];
}

if (import.meta.main) {
  const { values } = parseArgs({ args: Bun.argv.slice(2), options: { check: { type: 'boolean', default: false }, spec: { type: 'string' } } });
  const specFile = values.spec ?? new URL(SPEC_FILE, ROOT).pathname;
  const spec = existsSync(specFile) ? readFileSync(specFile, 'utf8') : undefined;
  let errors: string[] = [];
  if (values.check) {
    let committed: Matrix | undefined;
    try {
      committed = JSON.parse(readFileSync(MATRIX_FILE, 'utf8')) as Matrix;
      errors = validateMatrix(committed);
    } catch {
      errors = ['conformance/matrix.json is not valid JSON'];
    }
    if (errors.length === 0 && committed && spec !== undefined) errors = checkAgainstSpec(committed, spec);
    if (errors.length === 0 && committed) console.log(`conformance-matrix: ${committed.rows.length} rows${spec !== undefined ? ', in step with section 6 of the spec' : ' (spec not present: only checked that the matrix is well formed)'}`);
  } else if (spec === undefined) {
    errors = [`the spec is needed to regenerate the matrix: ${specFile}`];
  } else {
    // The cases of each row are not in the spec: keep what the coverage script wrote, so that regenerating never loses them.
    const previous = existsSync(MATRIX_FILE) ? (JSON.parse(readFileSync(MATRIX_FILE, 'utf8')) as Matrix) : undefined;
    const kept = new Map((previous?.rows ?? []).map((row) => [row.id, row.cases]));
    const matrix = buildMatrix(spec, (id) => kept.get(id) ?? []);
    errors = validateMatrix(matrix);
    if (errors.length === 0) {
      writeFileSync(MATRIX_FILE, serialize(matrix));
      console.log(`conformance-matrix: wrote ${matrix.rows.length} rows to conformance/matrix.json`);
    }
  }
  if (errors.length > 0) {
    console.error(errors.map((message) => `conformance-matrix: ${message}`).join('\n'));
    process.exit(1);
  }
}

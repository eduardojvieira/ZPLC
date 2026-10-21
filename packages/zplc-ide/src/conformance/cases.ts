// The conformance case format (VF-001, VF-002). A case is two files in conformance/:
//
//   name.st            the program (.il, .ld.json, .fbd.json and .sfc.json work the same way)
//   name.expect.json   how to run it and what to read back from VM memory
//
// Adding a case never touches test code: conformance.test.ts discovers the pairs, so a malformed or
// half-written case has to fail here, loudly, rather than silently assert less than it says.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

import { isErrorCode } from '@zplc/compiler';

export type CellType = 'BOOL' | 'SINT' | 'INT' | 'DINT' | 'USINT' | 'UINT' | 'UDINT' | 'BYTE' | 'WORD' | 'DWORD' | 'REAL';

// letter: the width in a direct address (%QW0); size in bytes; min and max: the values the type holds.
const TYPES: Record<CellType, { letter: 'X' | 'B' | 'W' | 'D'; size: 1 | 2 | 4; min: number; max: number }> = {
  BOOL: { letter: 'X', size: 1, min: 0, max: 1 },
  SINT: { letter: 'B', size: 1, min: -128, max: 127 },
  USINT: { letter: 'B', size: 1, min: 0, max: 255 },
  BYTE: { letter: 'B', size: 1, min: 0, max: 255 },
  INT: { letter: 'W', size: 2, min: -32768, max: 32767 },
  UINT: { letter: 'W', size: 2, min: 0, max: 65535 },
  WORD: { letter: 'W', size: 2, min: 0, max: 65535 },
  DINT: { letter: 'D', size: 4, min: -(2 ** 31), max: 2 ** 31 - 1 },
  UDINT: { letter: 'D', size: 4, min: 0, max: 2 ** 32 - 1 },
  DWORD: { letter: 'D', size: 4, min: 0, max: 2 ** 32 - 1 },
  REAL: { letter: 'D', size: 4, min: -Infinity, max: Infinity },
};
export const CELL_TYPES = Object.keys(TYPES) as CellType[];
export const cellSize = (type: CellType): number => TYPES[type].size;

export interface Cell {
  at?: string;
  var?: string;
  type: CellType;
  value: number | boolean;
}
export interface Check extends Cell {
  afterScan: number;
}
export interface Input {
  at: string;
  type: CellType;
  value: number | boolean;
  beforeScan: number;
}

/**
 * The tags a case may carry (VF-005). "arch-sensitive" marks a case whose result could differ between a 64-bit host, a 32-bit
 * host and a Cortex-M3 under QEMU; the other tags say why, and "alignment" also selects the case for the Cortex-M0, which
 * faults on an unaligned access that the Cortex-M3 tolerates.
 */
export const CASE_TAGS = ['arch-sensitive', 'alignment', 'division', 'shifts', 'float', 'float-conversion', '64-bit'] as const;
export type CaseTag = (typeof CASE_TAGS)[number];

/** A task of the generated zplc.json (CMP-047); the program of the case is main.<extension> and `files` name the others. */
export interface TaskSpec {
  name: string;
  trigger: 'cyclic' | 'event' | 'freewheeling';
  interval_ms: number;
  priority: number;
  programs: string[];
}

interface Named {
  requirement: string;
  title: string;
  /** Rows of conformance/matrix.json (VF-003) that this case is evidence for. */
  matrix: string[];
  tags: CaseTag[];
  /** Why the expected value is right: the IEC rule it cites, or the contract of the requirement. */
  note?: string;
  /** Further source files in the same folder that the program needs (a function block or a global declared in another file). */
  files: string[];
  /** The tasks of the project; empty means one cyclic task, at the scan interval, that runs the program of the case. */
  tasks: TaskSpec[];
}
/** A warning a build that passes must report: its stable code and the line it points at (CMP-008). */
export interface ExpectedWarning {
  code: string;
  line: number;
}
/**
 * A program that must build, load and run; `fault` says the last scan ends in a VM fault. `warnings`, when
 * present, is the exact list of the warnings of the build, in order: an empty list asserts there is none.
 */
export interface RunExpectation extends Named {
  build: 'succeeds';
  scans: number;
  scanMs: number;
  inputs: Input[];
  expect: Check[];
  fault: boolean;
  warnings?: ExpectedWarning[];
}
/**
 * A program that must not build: no artifact, and where stated the position of each diagnostic (`lines`, `columns`, one entry
 * per diagnostic), its stable `codes` (CMP-006; none exists before it, so a case asserts them only once they do), the
 * element of the source each diagnostic is about (`elements`, one entry per diagnostic: `rung:r1/cell:0,1`, `block:and1`,
 * `step:s1`, `line:7`; LNG-003) and the words of the messages.
 */
export interface RejectExpectation extends Named {
  build: 'fails';
  lines?: number[];
  columns?: number[];
  codes?: string[];
  elements?: string[];
  messageIncludes: string[];
}
export type Expectation = RunExpectation | RejectExpectation;

export interface ConformanceCase {
  name: string;
  /** Where the case lives under the conformance root, without the extension: cmp/cmp-011-int-limits. */
  id: string;
  /** Absolute path of the program the case compiles. */
  source: string;
  /** Its extension, which names the language: .st, .il, .ld.json, .fbd.json or .sfc.json. */
  extension: string;
  /** Absolute paths of the further source files the case lists under "files". */
  extras: string[];
  expectation: Expectation;
}

export const EXTENSIONS = ['.st', '.il', '.ld.json', '.fbd.json', '.sfc.json'];
/** The id of an element of the source a diagnostic is about (LNG-003): see models/sourceElements.ts. */
const ELEMENT_ID = /^(?:line|rung|block|connection|step|transition|action):[^\s/]+(?:\/(?:cell:\d+,\d+|element:[^\s/]+|enter|fire))?$/;
const EXPECT_SUFFIX = '.expect.json';
const isSource = (path: string) => EXTENSIONS.some((extension) => path.endsWith(extension));

type Json = Record<string, unknown>;
function fail(where: string, message: string): never {
  throw new Error(`${where}: ${message}`);
}
const isInt = (value: unknown, min: number, max: number): value is number =>
  Number.isInteger(value) && (value as number) >= min && (value as number) <= max;

function object(value: unknown, where: string, allowed: string[]): Json {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(where, 'must be a JSON object');
  for (const key of Object.keys(value as Json))
    if (!allowed.includes(key)) fail(where, `unknown key "${key}" (allowed: ${allowed.join(', ')})`);
  return value as Json;
}

function list(value: unknown, where: string, name: string): unknown[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : fail(where, `${name} must be a list`);
}

function checkValue(type: CellType, value: unknown, where: string): number | boolean {
  const { min, max } = TYPES[type];
  const holds =
    type === 'BOOL'
      ? typeof value === 'boolean'
      : type === 'REAL'
        ? typeof value === 'number' && Number.isFinite(value)
        : isInt(value, min, max);
  return holds ? (value as number | boolean) : fail(where, `value ${JSON.stringify(value)} is not a ${type}`);
}

/** Where a direct address such as %QW2 or %QX0.3 lives in VM memory: the input, output and work (%M) regions. */
export function cellLocation(at: string, type: CellType): { address: number; size: number; bit?: number } {
  const parts = /^%([IQM])([XBWD])(\d+)(?:\.(\d+))?$/.exec(at);
  if (!parts) return fail(at, 'address must look like %QW0 or %QX0.3');
  const [, region, letter, index, bit] = parts;
  const { letter: expected, size } = TYPES[type];
  if (letter !== expected) fail(at, `width ${letter} does not hold a ${type}: use %${region}${expected}`);
  if ((letter === 'X') !== (bit !== undefined)) fail(at, 'a bit address (%QX0.3) needs a bit, and no other width takes one');
  if (bit !== undefined && Number(bit) > 7) fail(at, 'bit must be 0 to 7');
  const offset = Number(index) * (letter === 'W' ? 2 : letter === 'D' ? 4 : 1);
  return {
    address: { I: 0x0000, Q: 0x1000, M: 0x2000 }[region as 'I' | 'Q' | 'M'] + offset,
    size,
    ...(bit === undefined ? {} : { bit: Number(bit) }),
  };
}

function cell(value: unknown, where: string, allowed: string[]): Cell {
  const entry = object(value, where, allowed);
  if ((entry.at === undefined) === (entry.var === undefined)) fail(where, 'name exactly one of "at" and "var"');
  const type = entry.type as CellType;
  if (!CELL_TYPES.includes(type)) fail(where, `unknown type ${JSON.stringify(entry.type)} (one of ${CELL_TYPES.join(', ')})`);
  if (entry.at !== undefined) {
    if (typeof entry.at !== 'string') fail(where, '"at" must be a direct address');
    cellLocation(entry.at as string, type);
  } else if (typeof entry.var !== 'string' || entry.var === '') {
    fail(where, '"var" must be a variable name');
  }
  return {
    ...(entry.at === undefined ? { var: entry.var as string } : { at: entry.at as string }),
    type,
    value: checkValue(type, entry.value, where),
  };
}

export function parseExpectation(text: string, where: string): Expectation {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return fail(where, `not valid JSON (${(error as Error).message})`);
  }
  const named = ['requirement', 'title', 'build', 'matrix', 'tags', 'note', 'files', 'tasks'];
  const head = object(parsed, where, [
    ...named,
    'lines',
    'columns',
    'codes',
    'elements',
    'messageIncludes',
    'scans',
    'scanMs',
    'inputs',
    'expect',
    'fault',
    'warnings',
  ]);
  if (typeof head.requirement !== 'string' || !/^[A-Z]+-[0-9]{3}$/.test(head.requirement))
    fail(where, 'requirement must look like CMP-011');
  if (typeof head.title !== 'string' || head.title.trim() === '') fail(where, 'title must be a non-empty string');
  const matrix = list(head.matrix, where, 'matrix');
  if (matrix.some((row) => typeof row !== 'string' || !/^[a-z0-9-]+\.[a-z0-9-]+$/.test(row)))
    fail(where, 'matrix must list row ids like data-types.bool');
  if (new Set(matrix).size !== matrix.length) fail(where, 'matrix names a row twice');
  const tags = list(head.tags, where, 'tags');
  if (tags.some((tag) => !CASE_TAGS.includes(tag as CaseTag))) fail(where, `tags must be among ${CASE_TAGS.join(', ')}`);
  if (tags.length > 0 && !tags.includes('arch-sensitive'))
    fail(where, 'a tag that says why a case is architecture-sensitive needs "arch-sensitive" as well');
  if (head.note !== undefined && (typeof head.note !== 'string' || head.note.trim() === '')) fail(where, 'note must be a non-empty string');
  const files = list(head.files, where, 'files').map((file) => {
    if (typeof file !== 'string' || !/^[\w][\w.-]*$/.test(file) || !isSource(file))
      fail(where, `files entry ${JSON.stringify(file)} must be the plain name of a source file`);
    return file as string;
  });
  const interval =
    head.scanMs === undefined
      ? 10
      : isInt(head.scanMs, 1, 3_600_000)
        ? head.scanMs
        : fail(where, 'scanMs must be a positive integer, in milliseconds');
  const tasks = list(head.tasks, where, 'tasks').map((value, index): TaskSpec => {
    const at = `${where}: tasks[${index}]`;
    const task = object(value, at, ['name', 'trigger', 'interval_ms', 'priority', 'programs']);
    if (typeof task.name !== 'string' || !/^[A-Za-z_]\w*$/.test(task.name)) fail(at, 'name must be an identifier');
    const trigger = task.trigger ?? 'cyclic';
    if (trigger !== 'cyclic' && trigger !== 'event' && trigger !== 'freewheeling')
      fail(at, 'trigger must be "cyclic", "event" or "freewheeling"');
    if (task.interval_ms !== undefined && !isInt(task.interval_ms, 1, 3_600_000)) fail(at, 'interval_ms must be a positive integer');
    if (task.priority !== undefined && !isInt(task.priority, 0, 255)) fail(at, 'priority must be an integer from 0 to 255');
    const programs = list(task.programs, at, 'programs');
    if (programs.length === 0 || programs.some((name) => typeof name !== 'string' || !isSource(name)))
      fail(at, 'programs must name source files: main.<extension> or an entry of "files"');
    return {
      name: task.name as string,
      trigger: trigger as TaskSpec['trigger'],
      interval_ms: (task.interval_ms as number | undefined) ?? interval,
      priority: (task.priority as number | undefined) ?? index + 1,
      programs: programs as string[],
    };
  });
  const common = {
    requirement: head.requirement as string,
    title: head.title as string,
    matrix: matrix as string[],
    tags: tags as CaseTag[],
    ...(head.note === undefined ? {} : { note: head.note as string }),
    files,
    tasks,
  };
  const build = head.build ?? 'succeeds';
  if (build !== 'succeeds' && build !== 'fails') fail(where, 'build must be "succeeds" or "fails"');

  if (build === 'fails') {
    const reject = object(parsed, where, [...named, 'lines', 'columns', 'codes', 'elements', 'messageIncludes']);
    const lines = reject.lines === undefined ? undefined : list(reject.lines, where, 'lines');
    if (lines?.some((line) => !isInt(line, 1, Number.MAX_SAFE_INTEGER))) fail(where, 'lines must be line numbers, 1 or more');
    const columns = reject.columns === undefined ? undefined : list(reject.columns, where, 'columns');
    if (columns?.some((column) => !isInt(column, 1, Number.MAX_SAFE_INTEGER))) fail(where, 'columns must be column numbers, 1 or more');
    if (columns && (!lines || lines.length !== columns.length)) fail(where, 'columns needs "lines" and one column for each line');
    const codes = reject.codes === undefined ? undefined : list(reject.codes, where, 'codes');
    if (codes?.some((code) => !isErrorCode(code)))
      fail(
        where,
        'codes must be codes of the registry of the compiler (packages/zplc-compiler/src/compiler/error-codes.ts), such as ' +
          'UNKNOWN_IDENTIFIER',
      );
    if (codes && lines && codes.length !== lines.length)
      fail(where, 'codes and lines name one entry for each diagnostic: they must have the same length');
    const elements = reject.elements === undefined ? undefined : list(reject.elements, where, 'elements');
    if (elements?.some((element) => typeof element !== 'string' || !ELEMENT_ID.test(element)))
      fail(where, 'elements must be ids of the source such as rung:r1/cell:0,1, block:and1, step:s1, transition:t1, action:a1 or line:7');
    if (elements && lines && elements.length !== lines.length)
      fail(where, 'elements and lines name one entry for each diagnostic: they must have the same length');
    const messageIncludes = list(reject.messageIncludes, where, 'messageIncludes');
    if (messageIncludes.some((word) => typeof word !== 'string' || word === '')) fail(where, 'messageIncludes must be non-empty strings');
    return {
      ...common,
      build,
      lines: lines as number[] | undefined,
      columns: columns as number[] | undefined,
      codes: codes as string[] | undefined,
      elements: elements as string[] | undefined,
      messageIncludes: messageIncludes as string[],
    };
  }

  const run = object(parsed, where, [...named, 'scans', 'scanMs', 'inputs', 'expect', 'fault', 'warnings']);
  if (!isInt(run.scans, 1, 100_000)) fail(where, 'scans must be an integer from 1 to 100000');
  if (!isInt(run.scanMs, 1, 3_600_000)) fail(where, 'scanMs must be a positive integer, in milliseconds');
  const scans = run.scans as number;
  if (run.fault !== undefined && typeof run.fault !== 'boolean') fail(where, 'fault must be true or false');
  const inScans = (value: unknown, name: string, at: string, fallback: number): number => {
    if (value === undefined) return fallback;
    return isInt(value, 1, scans) ? value : fail(at, `${name} must be an integer from 1 to scans (${scans})`);
  };

  const inputs = list(run.inputs, where, 'inputs').map((value, index): Input => {
    const at = `${where}: inputs[${index}]`;
    const entry = cell(value, at, ['at', 'var', 'type', 'value', 'beforeScan']);
    if (entry.at === undefined || !entry.at.startsWith('%I')) fail(at, 'an input needs an "at" address in the input image (%I...)');
    return { ...entry, at: entry.at!, beforeScan: inScans((value as Json).beforeScan, 'beforeScan', at, 1) };
  });
  const expect = list(run.expect, where, 'expect').map((value, index): Check => {
    const at = `${where}: expect[${index}]`;
    return {
      ...cell(value, at, ['at', 'var', 'type', 'value', 'afterScan']),
      afterScan: inScans((value as Json).afterScan, 'afterScan', at, scans),
    };
  });
  const fault = run.fault === true;
  const warnings =
    run.warnings === undefined
      ? undefined
      : list(run.warnings, where, 'warnings').map((value, index): ExpectedWarning => {
          const at = `${where}: warnings[${index}]`;
          const entry = object(value, at, ['code', 'line']);
          if (typeof entry.code !== 'string' || !/^[A-Z][A-Z0-9_]*$/.test(entry.code))
            fail(at, 'code must be a diagnostic code such as IMPLICIT_NARROWING');
          if (!isInt(entry.line, 1, Number.MAX_SAFE_INTEGER)) fail(at, 'line must be a line number, 1 or more');
          return { code: entry.code as string, line: entry.line as number };
        });
  if (expect.length === 0 && !fault) fail(where, 'asserts nothing: give "expect" at least one check, or "fault": true');
  return { ...common, build, scans, scanMs: run.scanMs as number, inputs, expect, fault, ...(warnings === undefined ? {} : { warnings }) };
}

/** The ids of the rows of the tracked matrix (VF-003) under `root`; absent when the root has no matrix.json. */
function matrixRows(root: string): Set<string> | undefined {
  const file = join(root, 'matrix.json');
  if (!existsSync(file)) return undefined;
  const { rows } = JSON.parse(readFileSync(file, 'utf8')) as { rows: Array<{ id: string }> };
  return new Set(rows.map((row) => row.id));
}

/** Every case under `root`: each .expect.json with the source of the same name beside it. */
export function loadCases(root: string): ConformanceCase[] {
  const all = (readdirSync(root, { recursive: true }) as string[]).map((path) => join(root, path)).sort();
  const claimed = new Set<string>();
  const names = new Set<string>();
  const rows = matrixRows(root);
  const cases = all
    .filter((path) => path.endsWith(EXPECT_SUFFIX))
    .map((file): ConformanceCase => {
      const shown = relative(root, file);
      const expectation = parseExpectation(readFileSync(file, 'utf8'), shown);
      const stem = file.slice(0, -EXPECT_SUFFIX.length);
      for (const row of expectation.matrix)
        if (rows && !rows.has(row)) fail(shown, `matrix names the row "${row}", which conformance/matrix.json does not have`);
      const found = EXTENSIONS.filter((extension) => existsSync(stem + extension));
      if (found.length === 0) fail(shown, `no source file beside it (${EXTENSIONS.map((extension) => `name${extension}`).join(', ')})`);
      if (found.length > 1) fail(shown, `more than one source file beside it: ${found.map((extension) => `name${extension}`).join(', ')}`);
      const extras = expectation.files.map((name) => join(dirname(file), name));
      for (const extra of extras)
        if (!existsSync(extra)) fail(shown, `file ${relative(dirname(file), extra)} listed in "files" does not exist`);
      for (const task of expectation.tasks) {
        for (const program of task.programs)
          if (program !== `main${found[0]}` && !expectation.files.includes(program))
            fail(shown, `task ${task.name} runs ${program}, which is neither main${found[0]} nor listed in "files"`);
      }
      for (const path of [stem + found[0], ...extras]) claimed.add(path);
      const name = `${expectation.requirement} ${expectation.title}`;
      if (names.has(name)) fail(shown, `duplicate case name "${name}"; the name identifies the test`);
      names.add(name);
      return { name, id: relative(root, stem), source: stem + found[0], extension: found[0]!, extras, expectation };
    });
  const orphans = all.filter((path) => isSource(path) && !claimed.has(path)).map((path) => relative(root, path));
  if (orphans.length > 0) fail(root, `source files with no .expect.json (an orphan asserts nothing): ${orphans.join(', ')}`);
  return cases;
}

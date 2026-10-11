// Configuration fragments of the documentation (DOC-009): a fragment of `zplc.json` that a page shows is merged into a
// minimal project and built with the Tool API that Studio, the command line and the MCP server share, so a fragment that
// the schema or the build refuses is a docs defect.
//
//   bun tools/docs/check-docs-config.ts            check every page, English and Spanish
//   bun tools/docs/check-docs-config.ts --list     print the inventory only
//
// The fence marks the fragment, as `runnable` marks a program (docs/docs/contributing/index.md):
//
//   ```json zplc-fragment            merged into a project for the host simulator (board posix)
//   ```json zplc-fragment board=rpi_pico   merged into a project for that board of the manifest
//
// A scenario that a page shows is run too (`json zplc-scenario`): the first runnable program of the same page is built,
// the scenario is written to the `tests` folder of that project, and every expectation must pass on the native runtime.
//
//   ```json zplc-scenario            the scenario of the page's first runnable Structured Text program
//
// A board entry that a page shows (`json zplc-board`, docs/docs/guides/port-to-a-board.md) is put through the validator of
// the board manifest together with the manifest of this repository, so a field that the manifest would refuse, or a name
// that another board already has, is a docs defect.
//
//   ```json zplc-board               one entry of firmware/app/boards/boards.json
//
// The keys of the fragment replace the keys of the project at the top level, so a fragment shows the part of
// `zplc.json` that it is about (communication, io, network, safety) and never the whole file. The program of the project
// is `PROGRAM Main` with the variables the fragment names declared as BOOL, so a binding or a mapping has a symbol to
// reach. The English page and its Spanish twin must show the same fragments, in the same order.
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { markdownFiles } from './check_doc_claims';

const ROOT = new URL('../../', import.meta.url).pathname;
const EN_DIR = 'docs/docs';
const ES_DIR = 'docs/i18n/es/docusaurus-plugin-content-docs/current';
const FENCE = /^(\s*)(`{3,}|~{3,})(.*)$/;
const SCHEMA = 'packages/zplc-ide/zplc.schema.json';

interface Schema {
  type?: string | string[];
  properties?: Record<string, Schema>;
  required?: string[];
  items?: Schema | Schema[];
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  pattern?: string;
  additionalProperties?: boolean | Schema;
  anyOf?: Schema[];
  $ref?: string;
  definitions?: Record<string, Schema>;
}

const kindOf = (value: unknown): string => (value === null ? 'null' : Array.isArray(value) ? 'array' : Number.isInteger(value) ? 'integer' : typeof value);

/**
 * The errors of a value against the JSON schema of the project file. Stricter than the schema in one place: a property
 * that the schema does not name is an error, because a fragment in the documentation is there to show a real key.
 */
export function schemaErrors(value: unknown, schema: Schema, root: Schema, path = '$'): string[] {
  if (schema.$ref) {
    const target = root.definitions?.[schema.$ref.replace('#/definitions/', '')];
    if (!target) return [`${path}: the schema names the unknown definition ${schema.$ref}`];
    return schemaErrors(value, target, root, path);
  }
  if (schema.anyOf) {
    return schema.anyOf.some((option) => schemaErrors(value, option, root, path).length === 0) ? [] : [`${path}: matches none of the shapes the schema allows`];
  }
  const errors: string[] = [];
  const kind = kindOf(value);
  const allowed = schema.type === undefined ? undefined : Array.isArray(schema.type) ? schema.type : [schema.type];
  if (allowed && !allowed.includes(kind) && !(kind === 'integer' && allowed.includes('number'))) return [`${path}: is ${kind}, the schema wants ${allowed.join(' or ')}`];
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${path}: ${JSON.stringify(value)} is not one of ${schema.enum.map((option) => JSON.stringify(option)).join(', ')}`);
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${path}: is shorter than ${schema.minLength}`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${path}: is longer than ${schema.maxLength}`);
    if (schema.pattern !== undefined && !new RegExp(schema.pattern).test(value)) errors.push(`${path}: does not match ${schema.pattern}`);
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path}: ${value} is below ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path}: ${value} is above ${schema.maximum}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path}: has fewer than ${schema.minItems} items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${path}: has more than ${schema.maxItems} items`);
    const items = schema.items;
    if (items) value.forEach((item, position) => errors.push(...schemaErrors(item, Array.isArray(items) ? items[position] ?? {} : items, root, `${path}[${position}]`)));
  }
  if (kind === 'object') {
    const object = value as Record<string, unknown>;
    for (const key of schema.required ?? []) if (!(key in object)) errors.push(`${path}: lacks the required key ${key}`);
    for (const [key, entry] of Object.entries(object)) {
      const known = schema.properties?.[key];
      if (known) errors.push(...schemaErrors(entry, known, root, `${path}.${key}`));
      else if (schema.properties && key !== '$schema') errors.push(`${path}: ${key} is not a key of the project file`);
    }
  }
  return errors;
}

export interface Fragment {
  page: string;
  /** 1-based line of the first line of the fragment. */
  line: number;
  board: string;
  source: string;
  /** `fragment` is merged into a project file; `scenario` is run against the page's program; `board` is an entry of the board manifest. */
  kind: 'fragment' | 'scenario' | 'board';
  /** For a scenario: the Structured Text program of the page it is run against. */
  program?: string;
}

export function extractFragments(page: string, text: string): { fragments: Fragment[]; errors: string[] } {
  const fragments: Fragment[] = [];
  const errors: string[] = [];
  const lines = text.split('\n');
  let program: string | undefined;
  for (let index = 0; index < lines.length; index += 1) {
    const open = FENCE.exec(lines[index]!);
    if (!open) continue;
    const [, indent = '', fence = '', info = ''] = open;
    const body: string[] = [];
    let closed = false;
    for (index += 1; index < lines.length; index += 1) {
      const close = FENCE.exec(lines[index]!);
      if (close && close[2]!.startsWith(fence[0]!) && close[2]!.length >= fence.length && close[3]!.trim() === '') { closed = true; break; }
      body.push(lines[index]!.startsWith(indent) ? lines[index]!.slice(indent.length) : lines[index]!);
    }
    const words = info.trim().split(/\s+/);
    if (['st', 'iecst', 'pascal'].includes(words[0]!) && words.includes('runnable') && !words.includes('fragment') && closed && program === undefined) program = body.join('\n');
    const kind = words[0] !== 'json' ? undefined
      : words.includes('zplc-fragment') ? 'fragment'
      : words.includes('zplc-scenario') ? 'scenario'
      : words.includes('zplc-board') ? 'board'
      : undefined;
    if (kind === undefined) continue;
    const line = index - body.length + 1;
    if (!closed) { errors.push(`${page}:${line}: the ${kind} is never closed`); continue; }
    const board = words.find((word) => word.startsWith('board='))?.slice('board='.length) ?? 'posix';
    for (const word of words.slice(1)) if (word !== `zplc-${kind}` && !word.startsWith('board=')) errors.push(`${page}:${line}: unknown fence attribute "${word}"`);
    if (kind === 'scenario' && program === undefined) { errors.push(`${page}:${line}: a scenario needs a runnable Structured Text program earlier on the same page`); continue; }
    fragments.push({ page, line, board, source: body.join('\n'), kind, ...(kind === 'scenario' ? { program } : {}) });
  }
  return { fragments, errors };
}

/** The English page and its Spanish twin show the same fragments, for the same boards, in the same order. */
export function parityErrors(english: Map<string, Fragment[]>, spanish: Map<string, Fragment[]>): string[] {
  const errors: string[] = [];
  const signature = (fragment: Fragment) => JSON.stringify([fragment.kind, fragment.board, JSON.parse(fragment.source)]);
  for (const [page, fragments] of english) {
    const twin = spanish.get(page) ?? [];
    if (twin.length !== fragments.length) { errors.push(`${EN_DIR}/${page} has ${fragments.length} configuration fragment(s) and its Spanish page has ${twin.length}`); continue; }
    fragments.forEach((fragment, position) => {
      try {
        if (signature(fragment) !== signature(twin[position]!)) errors.push(`${fragment.page}:${fragment.line} and ${twin[position]!.page}:${twin[position]!.line} show different fragments`);
      } catch { /* a fragment that is not JSON is reported by its own check */ }
    });
  }
  for (const [page, fragments] of spanish) if (!english.has(page) && fragments.length > 0) errors.push(`${ES_DIR}/${page} has configuration fragments and no English page does`);
  return errors;
}

/** The project that a fragment is merged into: one cyclic task and a program that declares what the fragment names. */
export function projectOf(fragment: Fragment): { manifest: Record<string, unknown>; program: string } {
  const parsed = JSON.parse(fragment.source) as Record<string, unknown>;
  const names = new Set<string>();
  const communication = parsed.communication as { bindings?: Array<{ symbol?: string }>; tags?: Array<{ symbol?: string }> } | undefined;
  for (const binding of [...(communication?.bindings ?? []), ...(communication?.tags ?? [])]) if (typeof binding.symbol === 'string') names.add(binding.symbol);
  const io = parsed.io as { inputs?: Array<{ name?: string }>; outputs?: Array<{ name?: string }> } | undefined;
  for (const entry of [...(io?.inputs ?? []), ...(io?.outputs ?? [])]) if (typeof entry.name === 'string') names.add(entry.name);
  const declarations = [...names].filter((name) => /^[A-Za-z_]\w*$/.test(name)).map((name) => `    ${name} : BOOL;`).join('\n');
  const program = `PROGRAM Main\n${declarations ? `VAR\n${declarations}\nEND_VAR\n` : ''}END_PROGRAM\n`;
  const manifest = {
    schemaVersion: 2,
    name: 'docs-fragment',
    version: '1.0.0',
    target: { board: fragment.board },
    tasks: [{ name: 'MainTask', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['main.st'] }],
    ...parsed,
  };
  return { manifest, program };
}

/**
 * The addresses of `io.inputs` and `io.outputs` of a fragment that the board of the manifest has no channel for, which is a
 * build error in Studio (IO-003) unless the project lists the address under `io.virtual`. A board that is not in the manifest
 * (`posix`, the simulator) has no description to hold the addresses to.
 */
export function addressesWithoutChannel(fragment: Record<string, unknown>, board: string): string[] {
  const boards = JSON.parse(readFileSync(join(ROOT, 'firmware/app/boards/boards.json'), 'utf8')) as Array<{ ide_id: string; io: { channels: Array<{ address: string }> } }>;
  const described = boards.find((entry) => entry.ide_id === board);
  if (!described) return [];
  const channels = new Set(described.io.channels.map((channel) => channel.address));
  const io = fragment.io as { inputs?: Array<{ address?: string }>; outputs?: Array<{ address?: string }>; virtual?: Array<{ address?: string }> } | undefined;
  const virtual = new Set((io?.virtual ?? []).map((entry) => entry.address));
  const normal = (address: string) => address.replace(/^%([IQ])(\d)/, '%$1X$2');
  return [...(io?.inputs ?? []), ...(io?.outputs ?? [])]
    .map((entry) => entry.address ?? '')
    .filter((address) => address !== '' && !channels.has(normal(address)) && !virtual.has(address));
}

/** Runs a scenario of a page against the page's program on the native runtime: empty when every expectation passes. */
async function scenarioProblems(fragment: Fragment, scenario: { id?: string; tickMs?: number }): Promise<string[]> {
  const { testsRun } = await import('../../packages/zplc-ide/src/cli/toolApi');
  const root = await mkdtemp(join(tmpdir(), 'zplc-docs-scenario-'));
  try {
    await mkdir(join(root, 'src'));
    await mkdir(join(root, 'tests'));
    await writeFile(join(root, 'src', 'main.st'), fragment.program!);
    const manifest = {
      schemaVersion: 2, name: 'docs-scenario', version: '1.0.0', target: { board: 'posix' },
      tasks: [{ name: 'MainTask', trigger: 'cyclic', interval_ms: scenario.tickMs ?? 10, priority: 1, programs: ['main.st'] }],
    };
    await writeFile(join(root, 'zplc.json'), JSON.stringify(manifest, null, 2));
    await writeFile(join(root, 'tests', `${scenario.id ?? 'docs'}.scenario.json`), fragment.source);
    const result = await testsRun(root);
    if (result.ok) return [];
    return [`does not pass against the program of the page: ${result.evidence.diagnostics.map((d) => `${d.code}: ${d.message}`).join('; ') || 'no diagnostic'}`];
  } finally { await rm(root, { recursive: true, force: true }); }
}

/** What the validator of the board manifest says about an entry, shown beside the manifest of this repository: empty when it accepts it. */
export function boardProblems(source: string): string[] {
  const script = [
    'import importlib.util, json, sys',
    "spec = importlib.util.spec_from_file_location('zplc_boards', 'firmware/zephyr/scripts/zplc_boards.py')",
    'library = importlib.util.module_from_spec(spec)',
    'spec.loader.exec_module(library)',
    "manifest = json.load(open('firmware/app/boards/boards.json'))",
    'entry = json.loads(sys.stdin.read())',
    'print(json.dumps(library.validate_manifest(manifest + [entry], None)))',
  ].join('\n');
  const result = spawnSync('python3', ['-B', '-c', script], { cwd: ROOT, input: source, encoding: 'utf8' });
  if (result.status !== 0) return [`could not be checked: ${result.stderr.trim().split('\n').at(-1) ?? 'the validator failed'}`];
  return JSON.parse(result.stdout) as string[];
}

/** What the validation and the build say about a fragment: empty when the project that holds it builds. */
export async function problemsOf(fragment: Fragment): Promise<string[]> {
  let parsed: unknown;
  try { parsed = JSON.parse(fragment.source); } catch (error) { return [`is not JSON: ${(error as Error).message}`]; }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return ['must be a JSON object'];
  if (fragment.kind === 'scenario') return scenarioProblems(fragment, parsed as { id?: string; tickMs?: number });
  if (fragment.kind === 'board') return boardProblems(fragment.source);
  const { compilerCompile, projectValidate } = await import('../../packages/zplc-ide/src/cli/toolApi');
  const { manifest, program } = projectOf(fragment);
  const schema = JSON.parse(readFileSync(join(ROOT, SCHEMA), 'utf8')) as Schema;
  const violations = schemaErrors(manifest, schema, schema);
  if (violations.length > 0) return [`does not follow ${SCHEMA}: ${violations.join('; ')}`];
  const unmapped = addressesWithoutChannel(parsed as Record<string, unknown>, fragment.board);
  if (unmapped.length > 0) return [`maps ${unmapped.join(', ')}, which board ${fragment.board} has no channel for and the fragment does not list under io.virtual`];
  const root = await mkdtemp(join(tmpdir(), 'zplc-docs-fragment-'));
  try {
    await mkdir(join(root, 'src'));
    await writeFile(join(root, 'src', 'main.st'), program);
    await writeFile(join(root, 'zplc.json'), JSON.stringify(manifest, null, 2));
    const diagnostics = (result: { evidence: { diagnostics: Array<{ code: string; line?: number; message: string }> } }) =>
      result.evidence.diagnostics.map((d) => `${d.code}${d.line === undefined ? '' : ` at line ${d.line}`}: ${d.message}`);
    const validated = await projectValidate(root);
    if (!validated.ok) return [`is not a valid project file: ${diagnostics(validated).join('; ') || 'no diagnostic'}`];
    const built = await compilerCompile(root);
    if (!built.ok) return [`does not build: ${diagnostics(built).join('; ') || 'no diagnostic'}`];
    return [];
  } finally { await rm(root, { recursive: true, force: true }); }
}

if (import.meta.main) {
  const listOnly = process.argv.includes('--list');
  const english = new Map<string, Fragment[]>();
  const spanish = new Map<string, Fragment[]>();
  const errors: string[] = [];
  let checked = 0;
  for (const [base, into] of [[EN_DIR, english], [ES_DIR, spanish]] as const) {
    for (const file of markdownFiles(ROOT, base)) {
      const found = extractFragments(file, readFileSync(join(ROOT, file), 'utf8'));
      errors.push(...found.errors);
      if (found.fragments.length > 0) into.set(file.slice(base.length + 1), found.fragments);
    }
  }
  for (const fragments of [...english.values(), ...spanish.values()]) {
    for (const fragment of fragments) {
      checked += 1;
      if (listOnly) { console.log(`${fragment.page}:${fragment.line}  board=${fragment.board}`); continue; }
      for (const problem of await problemsOf(fragment)) errors.push(`${fragment.page}:${fragment.line}: the ${fragment.kind} ${problem}`);
    }
  }
  errors.push(...parityErrors(english, spanish));
  if (errors.length > 0) { console.error(errors.map((message) => `docs-config: ${message}`).join('\n')); process.exit(1); }
  console.log(`docs-config: ${checked} configuration fragment(s) and scenario(s) of ${english.size} page(s) are valid, build and pass`);
}

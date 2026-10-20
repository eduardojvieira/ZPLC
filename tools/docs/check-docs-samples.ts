// Runnable documentation samples (VF-020): a code sample that the docs mark runnable is compiled in CI, and
// executed when its fence states an expected result. A sample that stops compiling is a docs defect.
//
//   bun tools/docs/check-docs-samples.ts            check every page, English and Spanish
//   bun tools/docs/check-docs-samples.ts --list     print the inventory only, without compiling
//
// The fence marks the sample (the convention is in docs/docs/contributing/index.md):
//
//   ```st runnable                                         compiled
//   ```st runnable expect="Out1=TRUE" scans=30 scan_ms=10  compiled, run 30 scans of 10 ms, then Out1 must be TRUE
//   ```st runnable fragment                                a bare body: wrapped in PROGRAM DocSample ... END_PROGRAM
//   ```iecst runnable language=il                          the sample is Instruction List
//
// expect is a list of NAME=VALUE separated by spaces. NAME is a variable of the program (its type comes from the
// debug map) or a direct address (%QX0.0, %QW0, %MD4; the type is the width letter, X BOOL, B USINT, W INT, D DINT,
// or NAME:TYPE overrides it). The English page and its Spanish twin must mark the same samples the same way.
//
// The compile is the Tool API that Studio, the CLI and MCP share, and the run is the native POSIX runtime on its
// virtual clock, as in the conformance suite: ZPLC_NATIVE_SIM_BIN names it, and a sample with `expect` fails, never
// skips, when it is missing.
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

import productManifest from '../../package.json';
import { cellLocation, cellSize, type CellType } from '../../packages/zplc-ide/src/conformance/cases';

export type SampleLanguage = 'st' | 'il';
export interface Expected { name: string; type?: CellType; value: number | boolean }
export interface Sample {
  page: string;
  /** 1-based line of the opening fence. */
  line: number;
  language: SampleLanguage;
  fragment: boolean;
  source: string;
  expected: Expected[];
  scans: number;
  scanMs: number;
}
export interface Unmarked { page: string; line: number; info: string }

const ROOT = new URL('../../', import.meta.url);
const EN_DIR = 'docs/docs';
const ES_DIR = 'docs/i18n/es/docusaurus-plugin-content-docs/current';
const FENCE = /^(\s*)(`{3,}|~{3,})(.*)$/;
const ST_FENCES = new Set(['st', 'iecst', 'pascal']);
const CELL_TYPES: readonly CellType[] = ['BOOL', 'SINT', 'INT', 'DINT', 'USINT', 'UINT', 'UDINT', 'BYTE', 'WORD', 'DWORD', 'REAL'];
const WIDTH_TYPE: Record<string, CellType> = { X: 'BOOL', B: 'USINT', W: 'INT', D: 'DINT' };
const KEYS = ['runnable', 'fragment', 'expect', 'scans', 'scan_ms', 'language', 'title', 'showLineNumbers'];

/** `st runnable expect="A=1 B=TRUE"` -> language `st`, flags and key=value attributes. */
export function parseInfo(info: string): { language: string; attributes: Map<string, string> } {
  const words = info.trim();
  const language = /^[^\s{]*/.exec(words)?.[0] ?? '';
  const attributes = new Map<string, string>();
  for (const match of words.slice(language.length).matchAll(/([A-Za-z_][\w-]*)(?:=(?:"([^"]*)"|(\S+)))?/g)) {
    attributes.set(match[1]!, match[2] ?? match[3] ?? '');
  }
  return { language, attributes };
}

export function parseExpected(text: string, where: string): { expected: Expected[]; errors: string[] } {
  const expected: Expected[] = [];
  const errors: string[] = [];
  for (const token of text.split(/\s+/).filter(Boolean)) {
    const match = /^([%A-Za-z_][\w.%]*?)(?::([A-Z]+))?=(.+)$/.exec(token);
    if (!match) { errors.push(`${where}: expect entry "${token}" must look like Name=Value`); continue; }
    const [, name, typeName, raw] = match as unknown as [string, string, string | undefined, string];
    if (typeName !== undefined && !CELL_TYPES.includes(typeName as CellType)) { errors.push(`${where}: "${typeName}" in "${token}" is not a type (${CELL_TYPES.join(', ')})`); continue; }
    const type = typeName as CellType | undefined;
    const number = Number(raw);
    const value = /^(TRUE|true)$/.test(raw) ? true : /^(FALSE|false)$/.test(raw) ? false : Number.isFinite(number) ? number : undefined;
    if (value === undefined) { errors.push(`${where}: value "${raw}" in "${token}" is neither TRUE, FALSE nor a number`); continue; }
    expected.push({ name, ...(type ? { type } : {}), value });
  }
  if (expected.length === 0) errors.push(`${where}: expect names no value`);
  return { expected, errors };
}

/** Every block marked runnable in one page, and every ST-looking block that is not marked. */
export function extractSamples(page: string, text: string): { samples: Sample[]; unmarked: Unmarked[]; errors: string[] } {
  const samples: Sample[] = [];
  const unmarked: Unmarked[] = [];
  const errors: string[] = [];
  const lines = text.split('\n');
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
    const line = index - body.length;
    const { language, attributes } = parseInfo(info);
    const language_ = attributes.get('language') ?? (ST_FENCES.has(language) ? 'st' : language);
    if (!attributes.has('runnable')) {
      if (ST_FENCES.has(language) || language_ === 'il') unmarked.push({ page, line, info: info.trim() });
      continue;
    }
    const sampleWhere = `${page}:${line}`;
    if (!closed) { errors.push(`${sampleWhere}: the runnable block is never closed`); continue; }
    if (language_ !== 'st' && language_ !== 'il') { errors.push(`${sampleWhere}: runnable needs an st, iecst or pascal fence, or language=il (found "${language || 'no language'}")`); continue; }
    for (const key of attributes.keys()) if (!KEYS.includes(key)) errors.push(`${sampleWhere}: unknown fence attribute "${key}" (${KEYS.join(', ')})`);
    const scans = attributes.has('scans') ? Number(attributes.get('scans')) : 1;
    const scanMs = attributes.has('scan_ms') ? Number(attributes.get('scan_ms')) : 10;
    if (!Number.isInteger(scans) || scans < 1 || scans > 100_000) errors.push(`${sampleWhere}: scans must be an integer from 1 to 100000`);
    if (!Number.isInteger(scanMs) || scanMs < 1 || scanMs > 60_000) errors.push(`${sampleWhere}: scan_ms must be an integer from 1 to 60000`);
    let expected: Expected[] = [];
    if (attributes.has('expect')) {
      const parsed = parseExpected(attributes.get('expect')!, sampleWhere);
      expected = parsed.expected;
      errors.push(...parsed.errors);
    } else if (attributes.has('scans') || attributes.has('scan_ms')) {
      errors.push(`${sampleWhere}: scans and scan_ms only mean something with expect`);
    }
    samples.push({
      page, line, language: language_, fragment: attributes.has('fragment'), source: body.join('\n'), expected, scans, scanMs,
    });
  }
  return { samples, unmarked, errors };
}

/** A bare fragment becomes the body of a program; everything else is compiled as it stands. */
export function programOf(sample: Pick<Sample, 'source' | 'fragment'>): string {
  return sample.fragment ? `PROGRAM DocSample\n${sample.source.trimEnd()}\nEND_PROGRAM\n` : sample.source;
}

const locate = (sample: Sample) => `${sample.page}:${sample.line}`;
const signature = (sample: Sample) => JSON.stringify([sample.language, sample.fragment, sample.expected, sample.scans, sample.scanMs]);

/** The English page and its Spanish twin carry the same runnable samples, in the same order, marked the same way. */
export function parityErrors(english: Map<string, Sample[]>, spanish: Map<string, Sample[]>): string[] {
  const errors: string[] = [];
  for (const [page, samples] of english) {
    const twin = spanish.get(page) ?? [];
    if (twin.length !== samples.length) {
      errors.push(`${EN_DIR}/${page} has ${samples.length} runnable sample(s) and its Spanish page has ${twin.length}`);
      continue;
    }
    samples.forEach((sample, index) => {
      if (signature(sample) !== signature(twin[index]!)) errors.push(`${locate(sample)} and ${locate(twin[index]!)} are marked differently (language, fragment, expect, scans or scan_ms)`);
    });
  }
  for (const [page, samples] of spanish) if (!english.has(page) && samples.length > 0) errors.push(`${ES_DIR}/${page} has runnable samples and no English page does`);
  return errors;
}

export function markdownPages(root: string, base: string): string[] {
  const out: string[] = [];
  const walk = (directory: string) => {
    for (const entry of readdirSync(join(root, directory), { withFileTypes: true })) {
      if (entry.name.startsWith('_')) continue; // Docusaurus skips files and folders that start with an underscore
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (/\.mdx?$/.test(entry.name)) out.push(relative(base, path));
    }
  };
  walk(base);
  return out.sort();
}

export interface Outcome { sample: Sample; compiled: boolean; executed: boolean; failures: string[] }

export async function compileAndRun(sample: Sample, binary: string): Promise<Outcome> {
  const [{ compilerCompile }, { NativeSimulationSupervisor }, { NativeAdapter }] = await Promise.all([
    import('../../packages/zplc-ide/src/cli/toolApi'),
    import('../../packages/zplc-ide/shared/nativeSimulationSupervisor'),
    import('../../packages/zplc-ide/src/runtime/nativeAdapter'),
  ]);
  const outcome: Outcome = { sample, compiled: false, executed: false, failures: [] };
  const root = await mkdtemp(join(tmpdir(), 'zplc-docs-sample-'));
  try {
    const program = `main.${sample.language}`;
    await mkdir(join(root, 'src'));
    await writeFile(join(root, 'src', program), programOf(sample));
    const tasks = [{ name: 'MainTask', trigger: 'cyclic', interval_ms: sample.scanMs, priority: 1, programs: [program] }];
    await writeFile(join(root, 'zplc.json'), JSON.stringify({ schemaVersion: 2, name: 'docs-sample', version: '1.0.0', target: { board: 'posix' }, tasks }));
    const built = await compilerCompile(root);
    if (!built.ok || !built.zplcFile) {
      const text = built.evidence.diagnostics.map((d) => `${d.code}${d.line === undefined ? '' : ` at line ${d.line}`}: ${d.message}`).join('; ');
      outcome.failures.push(`does not compile: ${text || 'no diagnostic'}`);
      return outcome;
    }
    outcome.compiled = true;
    if (sample.expected.length === 0) return outcome;

    if (!existsSync(binary)) {
      outcome.failures.push(`has an expected result and the native runtime is missing: ${binary} (bun run build:runtime, or export ZPLC_NATIVE_SIM_BIN)`);
      return outcome;
    }
    const persist = await mkdtemp(join(tmpdir(), 'zplc-docs-run-'));
    const supervisor = new NativeSimulationSupervisor({
      clientName: 'zplc-docs-samples',
      clientVersion: productManifest.version,
      environment: { ...process.env, ZPLC_NATIVE_SIM_BIN: binary, ZPLC_PERSIST_ROOT: persist, ZPLC_NATIVE_SCENARIO_VIRTUAL_CLOCK: '1' },
    });
    const adapter = new NativeAdapter(supervisor);
    try {
      await adapter.connect();
      await adapter.loadProgram(built.zplcFile);
      for (let scan = 1; scan <= sample.scans; scan += 1) await adapter.scenarioStep((scan - 1) * sample.scanMs);
      for (const want of sample.expected) {
        const entry = want.name.startsWith('%') ? undefined : Object.values(built.debugMap?.pou ?? {}).map((pou) => pou.vars[want.name]).find(Boolean);
        if (!want.name.startsWith('%') && !entry) { outcome.failures.push(`${want.name}: the debug map has no such variable`); continue; }
        let type: CellType;
        let location: { address: number; bit?: number };
        if (entry) {
          type = (want.type ?? entry.type) as CellType;
          if (!CELL_TYPES.includes(type)) { outcome.failures.push(`${want.name}: a variable of type ${entry.type} cannot be compared; name a type with ${want.name}:TYPE`); continue; }
          location = { address: entry.addr, ...(entry.bitOffset === undefined ? {} : { bit: entry.bitOffset }) };
        } else {
          const width = /^%[IQM]([XBWD])/.exec(want.name)?.[1];
          type = want.type ?? WIDTH_TYPE[width ?? ''] ?? 'INT';
          try { location = cellLocation(want.name, type); } catch (error) { outcome.failures.push((error as Error).message); continue; }
        }
        const bytes = await adapter.peek(location.address, cellSize(type));
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const observed: number | boolean = type === 'BOOL' ? (bytes[0]! & (1 << (location.bit ?? 0))) !== 0
          : type === 'SINT' ? view.getInt8(0) : type === 'USINT' || type === 'BYTE' ? view.getUint8(0)
            : type === 'INT' ? view.getInt16(0, true) : type === 'UINT' || type === 'WORD' ? view.getUint16(0, true)
              : type === 'DINT' ? view.getInt32(0, true) : type === 'REAL' ? view.getFloat32(0, true) : view.getUint32(0, true);
        const wanted = type === 'REAL' ? Math.fround(want.value as number) : want.value;
        if (observed !== wanted) outcome.failures.push(`${want.name} expected ${want.value}, observed ${observed} after ${sample.scans} scan(s) of ${sample.scanMs} ms`);
      }
      outcome.executed = true;
    } catch (error) {
      outcome.failures.push(`failed while running: ${(error as Error).message}`);
    } finally {
      await adapter.disconnect().catch(() => undefined);
      await supervisor.stopSession().catch(() => undefined);
      await rm(persist, { recursive: true, force: true });
    }
    return outcome;
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

export async function checkRepository(options: { list: boolean }): Promise<{ lines: string[]; errors: string[] }> {
  const root = ROOT.pathname;
  const binary = process.env.ZPLC_NATIVE_SIM_BIN ?? join(root, 'firmware/lib/zplc_core/build/zplc_runtime');
  const errors: string[] = [];
  const found = new Map<string, Map<string, Sample[]>>([['en', new Map()], ['es', new Map()]]);
  const unmarked: Unmarked[] = [];
  for (const [language, base] of [['en', EN_DIR], ['es', ES_DIR]] as const) {
    for (const page of markdownPages(root, base)) {
      const result = extractSamples(`${base}/${page}`, await readFile(join(root, base, page), 'utf8'));
      errors.push(...result.errors);
      unmarked.push(...result.unmarked);
      if (result.samples.length > 0) found.get(language)!.set(page, result.samples);
    }
  }
  errors.push(...parityErrors(found.get('en')!, found.get('es')!));

  const samples = [...found.get('en')!.values(), ...found.get('es')!.values()].flat();
  const lines: string[] = [];
  if (options.list) {
    for (const sample of samples) lines.push(`${locate(sample)}  ${sample.language}  ${sample.expected.length > 0 ? `expect ${sample.expected.length}` : 'compile only'}`);
  } else {
    // ponytail: one project and one runtime process per sample (tens of milliseconds each); batch them if the docs grow to hundreds.
    for (const sample of samples) {
      const outcome = await compileAndRun(sample, binary);
      lines.push(`${locate(sample)}  ${sample.language}  compiled ${outcome.compiled ? 'yes' : 'NO'}  executed ${sample.expected.length === 0 ? 'n/a' : outcome.executed ? 'yes' : 'NO'}`);
      for (const failure of outcome.failures) errors.push(`${locate(sample)}: ${failure}`);
    }
  }
  lines.push(`${samples.length} runnable samples; ${unmarked.length} other ST or IL blocks are not marked runnable${unmarked.length > 0 ? ` (${unmarked.map((u) => `${u.page}:${u.line}`).join(', ')})` : ''}`);
  return { lines, errors };
}

if (import.meta.main) {
  const { lines, errors } = await checkRepository({ list: process.argv.includes('--list') });
  console.log(lines.join('\n'));
  if (errors.length > 0) {
    console.error(errors.map((message) => `docs-samples: ${message}`).join('\n'));
    process.exit(1);
  }
  console.log('docs-samples: every runnable sample compiles, and every stated result holds');
}

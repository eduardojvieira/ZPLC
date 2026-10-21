import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'bun:test';

import productManifest from '../../../../package.json';
import { NativeSimulationSupervisor } from '../../shared/nativeSimulationSupervisor';
import { cellLocation, cellSize, CELL_TYPES, type CellType } from '../conformance/cases';
import { NativeAdapter } from '../runtime/nativeAdapter';
import { itNative, nativeRuntimeBinary } from './nativeRuntimeGuard';
import { compilerCompile } from './toolApi';

// The language fixtures of tools/hil (HIL-005, HIL-006). tools/hil/fixtures.json holds the expected values of every one of
// them; here each fixture is compiled by the repository compiler (the Tool API of Studio, the CLI and MCP) and its phases run
// on the native POSIX runtime with a virtual clock, which is the machinery of the conformance suite. The language suites
// of tools/hil run the same phases on a board, so a fixture is a host test and a hardware test with one set of values.

const HIL = fileURLToPath(new URL('../../../../tools/hil/', import.meta.url));
const REPOSITORY = fileURLToPath(new URL('../../../../', import.meta.url));
const LANGUAGE_DIRECTORIES = ['st_tests', 'il_tests', 'ld_tests', 'fbd_tests', 'sfc_tests'];
const EXTENSIONS = ['.ld.json', '.fbd.json', '.sfc.json', '.il', '.st'];
const OPERATIONS = ['eq', 'ge', 'approx', 'between', 'toggles'] as const;

interface Cell {
  at: string;
  type: CellType;
  value?: number | boolean;
  op?: (typeof OPERATIONS)[number];
  tolerance?: number;
  min?: number;
  max?: number;
}
interface Phase {
  scans: number;
  inputs?: Array<{ at: string; type: CellType; value: boolean | number }>;
  expect: Cell[];
}
interface Fixture {
  id: string;
  source: string;
  language: string;
  title: string;
  hardware: boolean;
  note?: string;
  phases: Phase[];
}
interface Manifest {
  schema: number;
  scanMs: number;
  fixtures: Fixture[];
}

const manifest = JSON.parse(readFileSync(join(HIL, 'fixtures.json'), 'utf8')) as Manifest;

function fixtureFiles(): string[] {
  const files = LANGUAGE_DIRECTORIES.flatMap((directory) =>
    readdirSync(join(HIL, directory))
      .filter((name) => EXTENSIONS.some((extension) => name.endsWith(extension)))
      .map((name) => `${directory}/${name}`),
  );
  return [...files, 'blinky_ld_gen.st'].sort();
}

function decode(type: CellType, bytes: Uint8Array, bit: number | undefined): number | boolean {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  switch (type) {
    case 'BOOL':
      return (bytes[0]! & (1 << (bit ?? 0))) !== 0;
    case 'SINT':
      return view.getInt8(0);
    case 'USINT':
    case 'BYTE':
      return view.getUint8(0);
    case 'INT':
      return view.getInt16(0, true);
    case 'UINT':
    case 'WORD':
      return view.getUint16(0, true);
    case 'DINT':
      return view.getInt32(0, true);
    case 'UDINT':
    case 'DWORD':
      return view.getUint32(0, true);
    case 'REAL':
      return view.getFloat32(0, true);
  }
}

function judge(cell: Cell, seen: number | boolean, changes: number): string | undefined {
  const op = cell.op ?? 'eq';
  const wanted = cell.value;
  if (op === 'toggles')
    return changes >= (cell.min ?? 1) ? undefined : `${cell.at} changed ${changes} times, expected at least ${cell.min}`;
  if (op === 'eq') return seen === wanted ? undefined : `${cell.at} (${cell.type}) is ${seen}, expected ${wanted}`;
  const number = Number(seen);
  if (op === 'ge') return number >= Number(wanted) ? undefined : `${cell.at} (${cell.type}) is ${seen}, expected at least ${wanted}`;
  if (op === 'approx')
    return Math.abs(number - Number(wanted)) <= (cell.tolerance ?? 0)
      ? undefined
      : `${cell.at} (${cell.type}) is ${seen}, expected ${wanted} within ${cell.tolerance}`;
  return number >= (cell.min ?? -Infinity) && number <= (cell.max ?? Infinity)
    ? undefined
    : `${cell.at} (${cell.type}) is ${seen}, expected between ${cell.min} and ${cell.max}`;
}

async function workspaceOf(fixture: Fixture, scanMs: number): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'zplc-hil-fixture-'));
  await mkdir(join(root, 'src'));
  const extension = EXTENSIONS.find((candidate) => fixture.source.endsWith(candidate))!;
  const program = `main${extension}`;
  await copyFile(join(HIL, fixture.source), join(root, 'src', program));
  await writeFile(
    join(root, 'zplc.json'),
    JSON.stringify({
      schemaVersion: 2,
      name: basename(fixture.id),
      version: '1.0.0',
      target: { board: 'posix' },
      tasks: [{ name: 'MainTask', trigger: 'cyclic', interval_ms: scanMs, priority: 1, programs: [program] }],
    }),
  );
  return root;
}

/** What differed from the expectation, as one line per difference; an empty list is a pass. */
async function runFixture(fixture: Fixture): Promise<string[]> {
  const root = await workspaceOf(fixture, manifest.scanMs);
  const persist = await mkdtemp(join(tmpdir(), 'zplc-hil-run-'));
  const supervisor = new NativeSimulationSupervisor({
    clientName: 'zplc-hil-fixtures',
    clientVersion: productManifest.version,
    environment: {
      ...process.env,
      ZPLC_NATIVE_SIM_BIN: nativeRuntimeBinary,
      ZPLC_PERSIST_ROOT: persist,
      ZPLC_NATIVE_SCENARIO_VIRTUAL_CLOCK: '1',
    },
  });
  const adapter = new NativeAdapter(supervisor);
  try {
    const compiled = await compilerCompile(root);
    if (!compiled.ok || !compiled.zplcFile) return [`does not compile: ${compiled.evidence.diagnostics.map((d) => d.message).join('; ')}`];
    await adapter.connect();
    await adapter.loadProgram(compiled.zplcFile);
    const failures: string[] = [];
    let scan = 0;
    for (const [index, phase] of fixture.phases.entries()) {
      for (const input of phase.inputs ?? []) {
        const { address, bit } = cellLocation(input.at, input.type);
        const [current] = await adapter.peek(address, 1);
        const next = bit === undefined ? Number(input.value) : input.value ? current! | (1 << bit) : current! & ~(1 << bit);
        await adapter.pokeN(address, new Uint8Array([next]));
      }
      const watched = phase.expect.filter((cell) => cell.op === 'toggles');
      const last = new Map<string, number | boolean>();
      const changes = new Map<string, number>();
      for (let step = 0; step < phase.scans; step += 1) {
        await adapter.scenarioStep(scan * manifest.scanMs);
        scan += 1;
        for (const cell of watched) {
          const { address, bit } = cellLocation(cell.at, cell.type);
          const seen = decode(cell.type, await adapter.peek(address, cellSize(cell.type)), bit);
          if (last.has(cell.at) && last.get(cell.at) !== seen) changes.set(cell.at, (changes.get(cell.at) ?? 0) + 1);
          last.set(cell.at, seen);
        }
      }
      for (const cell of phase.expect) {
        const { address, bit } = cellLocation(cell.at, cell.type);
        const seen = decode(cell.type, await adapter.peek(address, cellSize(cell.type)), bit);
        const problem = judge(cell, seen, changes.get(cell.at) ?? 0);
        if (problem) failures.push(`phase ${index + 1} after ${scan} scans: ${problem}`);
      }
    }
    return failures;
  } catch (error) {
    return [`the run failed: ${(error as Error).message}`];
  } finally {
    await adapter.disconnect().catch(() => undefined);
    await supervisor.stopSession().catch(() => undefined);
    await rm(persist, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  }
}

describe('language fixtures of tools/hil (HIL-005, HIL-006)', () => {
  test('the manifest lists every language fixture of tools/hil, once (HIL-005)', () => {
    const listed = manifest.fixtures.map((fixture) => fixture.source).sort();
    expect(listed).toEqual(fixtureFiles());
    expect(new Set(manifest.fixtures.map((fixture) => fixture.id)).size).toBe(manifest.fixtures.length);
  });

  test('every expected value of the manifest names a real address of its type (HIL-005)', () => {
    const problems: string[] = [];
    for (const fixture of manifest.fixtures) {
      if (fixture.phases.length === 0) problems.push(`${fixture.id}: no phase`);
      for (const phase of fixture.phases) {
        if (!Number.isInteger(phase.scans) || phase.scans < 1) problems.push(`${fixture.id}: scans must be a positive integer`);
        if (phase.expect.length === 0) problems.push(`${fixture.id}: a phase checks nothing`);
        for (const cell of [...(phase.inputs ?? []), ...phase.expect]) {
          if (!CELL_TYPES.includes(cell.type)) problems.push(`${fixture.id}: unknown type ${cell.type}`);
          else
            try {
              cellLocation(cell.at, cell.type);
            } catch (error) {
              problems.push(`${fixture.id}: ${(error as Error).message}`);
            }
          if ('op' in cell && cell.op !== undefined && !OPERATIONS.includes(cell.op)) problems.push(`${fixture.id}: unknown op ${cell.op}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  test('no compiled fixture is tracked under tools/hil (HIL-006)', () => {
    const tracked = execFileSync('git', ['ls-files', '--', 'tools/hil'], { cwd: REPOSITORY, encoding: 'utf8' }).split('\n').filter(Boolean);
    expect(tracked.filter((file) => /\.(bin|zplc|map\.json)$/.test(file))).toEqual([]);
  });

  itNative(
    'every phase of every language fixture holds on the native runtime (HIL-005)',
    async () => {
      const failures: string[] = [];
      for (const fixture of manifest.fixtures) {
        for (const problem of await runFixture(fixture)) failures.push(`${fixture.id}: ${problem}`);
      }
      expect(failures).toEqual([]);
    },
    180_000,
  );
});

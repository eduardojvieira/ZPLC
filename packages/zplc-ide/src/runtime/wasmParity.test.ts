import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assemble } from '@zplc/compiler';

import { buildCoreWasm, toolchain } from '../../../../tools/wasm-core/build';
import { compilerCompile } from '../cli/toolApi';
import { cellLocation, cellSize, loadCases, type CellType, type ConformanceCase, type RunExpectation } from '../conformance/cases';
import { ACCESS, label, workspace } from '../conformance/harness';

// IDE-025: the core of the runtime, built as WebAssembly from the same source files as the native runtime and the
// firmware, gives the results that the conformance cases state, with the loader's verifier on the path that loads the
// program. The module is built by tools/wasm-core with clang and wasm-ld; it is not the Emscripten module of the browser
// simulation, which needs the Emscripten SDK and is not built by this repository's CI yet (see the note at the end).
//
// Without clang and wasm-ld the tests skip on a developer machine and fail in CI, as the tests that need the native
// runtime do (VF-023).

const tools = toolchain();
const inCi = !['', '0', 'false'].includes(process.env.CI ?? '');
const available = !('missing' in tools);
if (!available && !inCi) console.warn(`the WebAssembly core is not built: ${(tools as { missing: string[] }).missing.join(' and ')} not found; the tests of ${fileURLToPath(import.meta.url).split('/').at(-1)} are skipped here and fail in CI`);

const itWasm = (available || !inCi ? it.skipIf(!available) : (name: string) => it(name, () => {
  throw new Error(`cannot build the WebAssembly core: ${(tools as { missing: string[] }).missing.join(' and ')} not found on the PATH (CI is set); install clang and lld`);
})) as ReturnType<typeof it.skipIf>;

interface CoreExports {
  memory: WebAssembly.Memory;
  zplc_core_init(): number;
  zplc_core_load(binary: number, size: number, workspace: number, workspaceSize: number): number;
  zplc_core_run_cycle(): number;
  zplc_core_get_error(): number;
  zplc_ipi_write8(offset: number, value: number): number;
  zplc_mem_get_region(base: number): number;
  zplc_shim_set_time(milliseconds: number): void;
  zplc_shim_artifact(): number;
  zplc_shim_artifact_capacity(): number;
  zplc_shim_workspace(): number;
  zplc_shim_workspace_capacity(): number;
}

// the regions of the memory map (zplc_isa.h): the input image, the output image, work memory and retentive memory
const REGIONS = [0x4000, 0x2000, 0x1000, 0x0000];

let workDirectory = '';
let compiled: WebAssembly.Module;
beforeAll(async () => {
  if (!available) return;
  workDirectory = mkdtempSync(join(tmpdir(), 'zplc-wasm-parity-'));
  const file = join(workDirectory, 'core.wasm');
  buildCoreWasm(file);
  compiled = await WebAssembly.compile(readFileSync(file));
}, 180_000);
afterAll(() => { if (workDirectory !== '') rmSync(workDirectory, { recursive: true, force: true }); });

async function instance(): Promise<CoreExports> {
  const created = await WebAssembly.instantiate(compiled, {});
  const core = created.exports as unknown as CoreExports;
  expect(core.zplc_core_init()).toBe(0);
  return core;
}

function load(core: CoreExports, artifact: Uint8Array): number {
  expect(artifact.byteLength).toBeLessThanOrEqual(core.zplc_shim_artifact_capacity());
  new Uint8Array(core.memory.buffer).set(artifact, core.zplc_shim_artifact());
  return core.zplc_core_load(core.zplc_shim_artifact(), artifact.byteLength, core.zplc_shim_workspace(), core.zplc_shim_workspace_capacity());
}

function read(core: CoreExports, address: number, size: number): Uint8Array {
  const base = REGIONS.find((candidate) => address >= candidate)!;
  const pointer = core.zplc_mem_get_region(base);
  expect(pointer).not.toBe(0);
  return new Uint8Array(core.memory.buffer).slice(pointer + (address - base), pointer + (address - base) + size);
}

/** What differed from the expectation of the case when its artifact runs in the WebAssembly core; an empty list is a pass. */
async function runOnWasm(expectation: RunExpectation, zplcFile: Uint8Array, addressOf: (cell: { at?: string; var?: string; type: CellType }) => { address: number; bit?: number } | string): Promise<string[]> {
  const core = await instance();
  const refused = load(core, zplcFile);
  if (refused !== 0) return [`the loader of the WebAssembly core refused the artifact: error ${refused}`];
  const failures: string[] = [];
  let faulted = false;
  for (let scan = 1; scan <= expectation.scans; scan += 1) {
    for (const input of expectation.inputs.filter((candidate) => candidate.beforeScan === scan)) {
      const { address, size, bit } = cellLocation(input.at, input.type);
      if (bit !== undefined) {
        const [current] = read(core, address, 1);
        core.zplc_ipi_write8(address, input.value ? current! | (1 << bit) : current! & ~(1 << bit));
      } else {
        const bytes = new Uint8Array(size);
        ACCESS[input.type as Exclude<CellType, 'BOOL'>][1](new DataView(bytes.buffer), input.value as number);
        bytes.forEach((value, index) => core.zplc_ipi_write8(address + index, value));
      }
    }
    // the clock of the virtual scan: the first scan at 0 ms, each next one a scan interval later, as the native session steps it
    core.zplc_shim_set_time((scan - 1) * expectation.scanMs);
    const result = core.zplc_core_run_cycle();
    if (result < 0) {
      if (!expectation.fault || scan !== expectation.scans) return [...failures, `scan ${scan}: the VM faulted: error ${core.zplc_core_get_error()}`];
      faulted = true;
    }
    for (const check of expectation.expect.filter((candidate) => candidate.afterScan === scan)) {
      const where = addressOf(check);
      if (typeof where === 'string') { failures.push(`after scan ${scan}: ${label(check)}: ${where}`); continue; }
      const bytes = read(core, where.address, cellSize(check.type));
      const observed = check.type === 'BOOL'
        ? (bytes[0]! & (1 << (where.bit ?? 0))) !== 0
        : ACCESS[check.type][0](new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength));
      const wanted = check.type === 'REAL' ? Math.fround(check.value as number) : check.value;
      if (observed !== wanted) failures.push(`after scan ${scan}: ${label(check)} expected ${check.value}, observed ${observed}`);
    }
  }
  if (expectation.fault && !faulted) failures.push(`the last scan (${expectation.scans}) was expected to end in a VM fault, and it completed`);
  return failures;
}

async function runCase(found: ConformanceCase): Promise<string[]> {
  const expectation = found.expectation as RunExpectation;
  const root = await workspace({ ...found, tasks: expectation.tasks }, expectation.scanMs);
  try {
    const built = await compilerCompile(root);
    if (!built.ok || !built.zplcFile) return [`the build failed: ${built.evidence.diagnostics.map((diagnostic) => diagnostic.message).join('; ')}`];
    const map = built.debugMap;
    return await runOnWasm(expectation, built.zplcFile, (cell) => {
      if (cell.at !== undefined) return cellLocation(cell.at, cell.type);
      const entry = Object.values(map?.pou ?? {}).map((pou) => pou.vars[cell.var!]).find(Boolean);
      return entry ? { address: entry.addr, bit: entry.bitOffset } : `the debug map has no variable "${cell.var}"`;
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const conformanceRoot = fileURLToPath(new URL('../../../../conformance', import.meta.url));

// What the bare core cannot show, and the reason. A project of several tasks needs the scheduler of a runtime session; the
// safe state of the outputs on a VM fault is applied by that session too, so the core, which only stops, leaves them as they
// were (RT-007, and the shared scheduler core of RT-008 is not there yet: a WebAssembly runtime has no scheduler).
const SESSION_ONLY = ['RT-007 a VM fault drives the outputs to their safe state'];

const runnable = loadCases(conformanceRoot).filter((found) => found.expectation.build === 'succeeds');
const cases = runnable.filter((found) => found.expectation.tasks.length === 0 && !SESSION_ONLY.includes(found.name));
const leftOut = runnable.filter((found) => !cases.includes(found));

describe('the core in WebAssembly gives the results of the conformance cases (IDE-025)', () => {
  for (const found of cases) {
    itWasm(found.name, async () => {
      expect(await runCase(found)).toEqual([]);
    }, 30_000);
  }

  it('runs every conformance case of one task that builds, and leaves out only the cases of several tasks and of the session', () => {
    expect(cases.length).toBeGreaterThan(400);
    expect(leftOut.filter((found) => found.expectation.tasks.length === 0).map((found) => found.name)).toEqual(SESSION_ONLY);
    expect(leftOut.length).toBeLessThan(10);
  });
});

describe('the verifier of the loader is on the path that loads a program in WebAssembly (IDE-025)', () => {
  itWasm('refuses an artifact whose code would take a value from an empty stack, and accepts the one that does not', async () => {
    const core = await instance();
    // two programs that differ in one instruction, each with a valid container and checksum: the verifier is what tells them apart
    expect(load(core, assemble('    PUSH8 1\n    PUSH8 2\n    ADD\n    HALT\n').zplcFile)).toBe(0);
    const underflow = await instance();
    expect(load(underflow, assemble('    ADD\n    HALT\n').zplcFile)).not.toBe(0);
  });

  itWasm('refuses an artifact that is not a program, whatever the checksum says', async () => {
    const core = await instance();
    const artifact = assemble('    PUSH8 1\n    HALT\n').zplcFile;
    expect(load(core, artifact)).toBe(0);
    const truncated = artifact.slice(0, artifact.byteLength - 1);
    expect(load(await instance(), truncated)).not.toBe(0);
  });
});

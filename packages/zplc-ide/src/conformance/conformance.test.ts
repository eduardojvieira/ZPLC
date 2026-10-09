import { describe, expect, it } from 'bun:test';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import productManifest from '../../../../package.json';
import { NativeSimulationSupervisor } from '../../electron/nativeSimulationSupervisor';
import { nativeRuntimeBinary, itNative } from '../cli/nativeRuntimeGuard';
import { compilerCompile } from '../cli/toolApi';
import { NativeAdapter } from '../runtime/nativeAdapter';
import compilerManifest from '../../../zplc-compiler/package.json';
import { cellLocation, cellSize, loadCases, type Cell, type CellType, type ConformanceCase, type RunExpectation } from './cases';

// Each conformance case runs end to end: the repository compiler (through the Tool API that Studio, the CLI
// and MCP share), the loader and VM of the native POSIX runtime on its virtual clock, and a read of VM memory.
// runCase returns what differed from the expectation; an empty list is a pass. This file stays a test file
// on purpose: the IDE build (tsc -b) skips test files, and the runner imports the CLI and Electron code it does not build.

type Access = [read: (view: DataView) => number, write: (view: DataView, value: number) => void];
const ACCESS: Record<Exclude<CellType, 'BOOL'>, Access> = {
  SINT: [(v) => v.getInt8(0), (v, x) => v.setInt8(0, x)],
  USINT: [(v) => v.getUint8(0), (v, x) => v.setUint8(0, x)],
  BYTE: [(v) => v.getUint8(0), (v, x) => v.setUint8(0, x)],
  INT: [(v) => v.getInt16(0, true), (v, x) => v.setInt16(0, x, true)],
  UINT: [(v) => v.getUint16(0, true), (v, x) => v.setUint16(0, x, true)],
  WORD: [(v) => v.getUint16(0, true), (v, x) => v.setUint16(0, x, true)],
  DINT: [(v) => v.getInt32(0, true), (v, x) => v.setInt32(0, x, true)],
  UDINT: [(v) => v.getUint32(0, true), (v, x) => v.setUint32(0, x, true)],
  DWORD: [(v) => v.getUint32(0, true), (v, x) => v.setUint32(0, x, true)],
  REAL: [(v) => v.getFloat32(0, true), (v, x) => v.setFloat32(0, x, true)],
};

const label = (cell: Cell) => `${cell.at ?? cell.var} (${cell.type})`;

function diagnosticText(diagnostics: Array<{ code: string; message: string; phase?: string; line?: number }>): string {
  return diagnostics.map(({ code, message, phase, line }) => `${code}${phase ? ` in ${phase}` : ''}${line === undefined ? '' : ` at line ${line}`}: ${message}`).join('; ');
}

async function workspace(found: Pick<ConformanceCase, 'source' | 'extension' | 'extras'>, scanMs: number): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'zplc-conformance-'));
  await mkdir(join(root, 'src'));
  const program = `main${found.extension}`;
  await copyFile(found.source, join(root, 'src', program));
  for (const extra of found.extras) await copyFile(extra, join(root, 'src', basename(extra)));
  await writeFile(join(root, 'zplc.json'), JSON.stringify({
    schemaVersion: 2, name: 'conformance', version: '1.0.0', target: { board: 'posix' },
    tasks: [{ name: 'MainTask', trigger: 'cyclic', interval_ms: scanMs, priority: 1, programs: [program] }],
  }));
  return root;
}

async function execute(expectation: RunExpectation, zplcFile: Uint8Array, address: (cell: Cell) => { address: number; bit?: number } | string): Promise<string[]> {
  const failures: string[] = [];
  const persist = await mkdtemp(join(tmpdir(), 'zplc-conformance-run-'));
  // ponytail: one runtime process per case (tens of milliseconds each); share a session and reset between cases if the suite outgrows that.
  const supervisor = new NativeSimulationSupervisor({
    clientName: 'zplc-conformance',
    clientVersion: productManifest.version,
    environment: { ...process.env, ZPLC_NATIVE_SIM_BIN: nativeRuntimeBinary, ZPLC_PERSIST_ROOT: persist, ZPLC_NATIVE_SCENARIO_VIRTUAL_CLOCK: '1' },
  });
  const adapter = new NativeAdapter(supervisor);
  try {
    await adapter.connect();
    try {
      await adapter.loadProgram(zplcFile);
    } catch (error) {
      return [`the loader refused the artifact the compiler produced: ${(error as Error).message}`];
    }
    let faulted = false;
    for (let scan = 1; scan <= expectation.scans; scan += 1) {
      for (const input of expectation.inputs.filter((candidate) => candidate.beforeScan === scan)) {
        const { address: where, size, bit } = cellLocation(input.at, input.type);
        if (bit !== undefined) {
          const [current] = await adapter.peek(where, 1);
          await adapter.pokeN(where, new Uint8Array([input.value ? current! | (1 << bit) : current! & ~(1 << bit)]));
        } else {
          const bytes = new Uint8Array(size);
          ACCESS[input.type as Exclude<CellType, 'BOOL'>][1](new DataView(bytes.buffer), input.value as number);
          await adapter.pokeN(where, bytes);
        }
      }
      try {
        await adapter.scenarioStep((scan - 1) * expectation.scanMs);
      } catch (error) {
        if (!expectation.fault || scan !== expectation.scans) return [...failures, `scan ${scan}: the VM faulted: ${(error as Error).message}`];
        faulted = true;
      }
      for (const check of expectation.expect.filter((candidate) => candidate.afterScan === scan)) {
        const where = address(check);
        if (typeof where === 'string') { failures.push(`after scan ${scan}: ${label(check)}: ${where}`); continue; }
        const bytes = await adapter.peek(where.address, cellSize(check.type));
        const observed = check.type === 'BOOL'
          ? (bytes[0]! & (1 << (where.bit ?? 0))) !== 0
          : ACCESS[check.type][0](new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength));
        const wanted = check.type === 'REAL' ? Math.fround(check.value as number) : check.value;
        if (observed !== wanted) failures.push(`after scan ${scan}: ${label(check)} expected ${check.value}, observed ${observed}`);
      }
    }
    if (expectation.fault && !faulted) failures.push(`the last scan (${expectation.scans}) was expected to end in a VM fault, and it completed`);
    return failures;
  } finally {
    await adapter.disconnect().catch(() => undefined);
    await supervisor.stopSession().catch(() => undefined);
    await rm(persist, { recursive: true, force: true });
  }
}

async function runCase(found: ConformanceCase): Promise<string[]> {
  const { expectation } = found;
  const root = await workspace(found, expectation.build === 'succeeds' ? expectation.scanMs : 10);
  try {
    const compiled = await compilerCompile(root);
    const diagnostics = compiled.evidence.diagnostics;

    if (expectation.build === 'fails') {
      const failures: string[] = [];
      if (compiled.ok || compiled.evidence.artifacts.length > 0) return [`the build succeeded and produced an artifact (${compiled.evidence.artifacts.map((artifact) => `${artifact.kind}, ${artifact.byteLength} bytes`).join('; ')}); it must be rejected`];
      if (expectation.lines && JSON.stringify(diagnostics.map((diagnostic) => diagnostic.line)) !== JSON.stringify(expectation.lines)) {
        failures.push(`diagnostics at lines [${diagnostics.map((diagnostic) => diagnostic.line ?? 'none').join(', ')}], expected [${expectation.lines.join(', ')}] (${diagnosticText(diagnostics)})`);
      }
      for (const word of expectation.messageIncludes) {
        if (!diagnostics.some((diagnostic) => diagnostic.message.includes(word))) failures.push(`no diagnostic message mentions "${word}" (${diagnosticText(diagnostics)})`);
      }
      return failures;
    }

    if (!compiled.ok || !compiled.zplcFile) return [`the build failed: ${diagnosticText(diagnostics)}`];
    const debugMap = compiled.debugMap;
    return await execute(expectation, compiled.zplcFile, (cell) => {
      if (cell.at !== undefined) return cellLocation(cell.at, cell.type);
      // The one place the debug map is trusted: a check that names a variable asks the map where it lives.
      const entry = Object.values(debugMap?.pou ?? {}).map((pou) => pou.vars[cell.var!]).find(Boolean);
      return entry ? { address: entry.addr, bit: entry.bitOffset } : `the debug map has no variable "${cell.var}"`;
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const conformanceRoot = fileURLToPath(new URL('../../../../conformance', import.meta.url));

// One test per case in conformance/, named "<requirement> <title>": that name is what
// tools/ci/expected-failures.json lists while a known defect keeps the case red.
describe('conformance', () => {
  for (const found of loadCases(conformanceRoot)) {
    // A case that must not build never reaches the VM, so it runs without the native runtime.
    const test = found.expectation.build === 'fails' ? it : itNative;
    test(found.name, async () => {
      expect(await runCase(found)).toEqual([]);
    }, 30_000);
  }
});

// Properties of a build that hold for every program, so no single case can state them. One committed program stands in for all.
const sample = { source: join(conformanceRoot, 'cmp', 'cmp-058-selection-and-limit-functions.st'), extension: '.st', extras: [] };

async function build() {
  const root = await workspace(sample, 10);
  try {
    const built = await compilerCompile(root);
    if (!built.ok || !built.zplcFile || !built.debugMap) throw new Error(`the sample program does not build: ${diagnosticText(built.evidence.diagnostics)}`);
    return { zplc: built.zplcFile, map: built.debugMap };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe('conformance: properties of every build', () => {
  it('CMP-053 two builds of one project produce the same bytecode', async () => {
    const [first, second] = [await build(), await build()];
    expect(Buffer.from(second.zplc).equals(Buffer.from(first.zplc))).toBe(true);
  });

  it('CMP-053 two builds of one project produce the same debug map', async () => {
    const first = await build();
    await Bun.sleep(5); // the map carries a millisecond timestamp
    expect(JSON.stringify((await build()).map)).toBe(JSON.stringify(first.map));
  });

  it('CMP-053 the debug map records the version of the compiler package', async () => {
    expect((await build()).map.compilerVersion).toBe(compilerManifest.version);
  });

  it('CMP-055 every instruction of a statement resolves to that statement in the debug map', async () => {
    const statements = Object.values((await build()).map.pou).flatMap((pou) => pou.sourceMap).sort((a, b) => a.pc - b.pc);
    expect(statements.length).toBeGreaterThan(1);
    // A statement covers all its instructions: it ends where the next one starts.
    const gaps = statements.slice(0, -1).flatMap((entry, index) => entry.pc + entry.length === statements[index + 1]!.pc ? []
      : [`line ${entry.line} ends at ${entry.pc + entry.length}, the next statement starts at ${statements[index + 1]!.pc}`]);
    expect(gaps).toEqual([]);
  });
});

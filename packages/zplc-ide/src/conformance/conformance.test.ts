import { describe, expect, it } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import productManifest from '../../../../package.json';
import { NativeSimulationSupervisor } from '../../shared/nativeSimulationSupervisor';
import { nativeRuntimeBinary, itNative } from '../cli/nativeRuntimeGuard';
import { compilerCompile } from '../cli/toolApi';
import { NativeAdapter } from '../runtime/nativeAdapter';
import compilerManifest from '../../../zplc-compiler/package.json';
import { CASE_TAGS, cellLocation, loadCases, type Cell, type CaseTag, type ConformanceCase, type RunExpectation } from './cases';
import { workspace } from './harness';
import { runScenario } from './scenarioRun';

// Each conformance case runs end to end: the repository compiler (through the Tool API that Studio, the CLI
// and MCP share), the loader and VM of the native POSIX runtime on its virtual clock, and a read of VM memory.
// runCase returns what differed from the expectation; an empty list is a pass. This file stays a test file
// on purpose: the IDE build (tsc -b) skips test files, and the runner imports the CLI and Electron code it does not build.

// CMP-051: what the loader said about each artifact the compiler produced for a case. The count is part of the check, so
// a loader that refused everything, or a suite that stopped producing artifacts, cannot pass by having nothing to look at.
const loader = { accepted: [] as string[], refused: [] as string[] };

function diagnosticText(diagnostics: Array<{ code: string; message: string; phase?: string; line?: number; element?: string }>): string {
  return diagnostics
    .map(
      ({ code, message, phase, line, element }) =>
        `${code}${phase ? ` in ${phase}` : ''}${line === undefined ? '' : ` at line ${line}`}${
          element === undefined ? '' : ` on ${element}`
        }: ${message}`,
    )
    .join('; ');
}

async function execute(
  name: string,
  expectation: RunExpectation,
  zplcFile: Uint8Array,
  address: (cell: Cell) => { address: number; bit?: number } | string,
): Promise<string[]> {
  const persist = await mkdtemp(join(tmpdir(), 'zplc-conformance-run-'));
  // ponytail: one runtime process per case (tens of milliseconds each); share a session and reset between cases if the suite outgrows that.
  const supervisor = new NativeSimulationSupervisor({
    clientName: 'zplc-conformance',
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
    await adapter.connect();
    const outcome = await runScenario(adapter, expectation, zplcFile, address);
    (outcome.loaderRefused ? loader.refused : loader.accepted).push(name);
    return outcome.failures;
  } finally {
    await adapter.disconnect().catch(() => undefined);
    await supervisor.stopSession().catch(() => undefined);
    await rm(persist, { recursive: true, force: true });
  }
}

async function runCase(found: ConformanceCase): Promise<string[]> {
  const { expectation } = found;
  const root = await workspace({ ...found, tasks: expectation.tasks }, expectation.build === 'succeeds' ? expectation.scanMs : 10);
  try {
    const compiled = await compilerCompile(root);
    const diagnostics = compiled.evidence.diagnostics;

    if (expectation.build === 'fails') {
      const failures: string[] = [];
      if (compiled.ok || compiled.evidence.artifacts.length > 0)
        return [
          `the build succeeded and produced an artifact ` +
            `(${compiled.evidence.artifacts
              .map((artifact) => `${artifact.kind}, ${artifact.byteLength} bytes`)
              .join('; ')}); it must be rejected`,
        ];
      if (expectation.lines && JSON.stringify(diagnostics.map((diagnostic) => diagnostic.line)) !== JSON.stringify(expectation.lines)) {
        failures.push(
          `diagnostics at lines [${diagnostics
            .map((diagnostic) => diagnostic.line ?? 'none')
            .join(', ')}], expected [${expectation.lines.join(', ')}] (${diagnosticText(diagnostics)})`,
        );
      }
      if (
        expectation.columns &&
        JSON.stringify(diagnostics.map((diagnostic) => diagnostic.column)) !== JSON.stringify(expectation.columns)
      ) {
        failures.push(
          `diagnostics at columns [${diagnostics
            .map((diagnostic) => diagnostic.column ?? 'none')
            .join(', ')}], expected [${expectation.columns.join(', ')}] (${diagnosticText(diagnostics)})`,
        );
      }
      if (
        expectation.elements &&
        JSON.stringify(diagnostics.map((diagnostic) => diagnostic.element ?? null)) !== JSON.stringify(expectation.elements)
      ) {
        failures.push(
          `diagnostics on elements [${diagnostics
            .map((diagnostic) => diagnostic.element ?? 'none')
            .join(', ')}], expected [${expectation.elements.join(', ')}] (${diagnosticText(diagnostics)})`,
        );
      }
      if (expectation.codes && JSON.stringify(diagnostics.map((diagnostic) => diagnostic.code)) !== JSON.stringify(expectation.codes)) {
        failures.push(
          `diagnostic codes [${diagnostics.map((diagnostic) => diagnostic.code).join(', ')}], expected [${expectation.codes.join(', ')}]`,
        );
      }
      for (const word of expectation.messageIncludes) {
        if (!diagnostics.some((diagnostic) => diagnostic.message.includes(word)))
          failures.push(`no diagnostic message mentions "${word}" (${diagnosticText(diagnostics)})`);
      }
      return failures;
    }

    if (!compiled.ok || !compiled.zplcFile) return [`the build failed: ${diagnosticText(diagnostics)}`];
    // the warnings of a build that passed are its diagnostics (CMP-008): the case lists them all, or none
    const warningFailures: string[] = [];
    if (expectation.warnings) {
      const observed = diagnostics.map((diagnostic) => `${diagnostic.code} at line ${diagnostic.line ?? 'none'}`);
      const wanted = expectation.warnings.map((warning) => `${warning.code} at line ${warning.line}`);
      if (JSON.stringify(observed) !== JSON.stringify(wanted))
        warningFailures.push(`warnings [${observed.join(', ')}], expected [${wanted.join(', ')}] (${diagnosticText(diagnostics)})`);
    }
    const debugMap = compiled.debugMap;
    return [
      ...warningFailures,
      ...(await execute(found.name, expectation, compiled.zplcFile, (cell) => {
        if (cell.at !== undefined) return cellLocation(cell.at, cell.type);
        // The one place the debug map is trusted: a check that names a variable asks the map where it lives.
        const entry = Object.values(debugMap?.pou ?? {})
          .map((pou) => pou.vars[cell.var!])
          .find(Boolean);
        return entry ? { address: entry.addr, bit: entry.bitOffset } : `the debug map has no variable "${cell.var}"`;
      })),
    ];
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const conformanceRoot = fileURLToPath(new URL('../../../../conformance', import.meta.url));

// ZPLC_CONFORMANCE_TAGS=arch-sensitive,alignment runs only the cases that carry one of those tags (VF-005): the firmware
// test method selects the architecture-sensitive subset this way; an unset or empty variable runs every case.
const selectedTags = (process.env.ZPLC_CONFORMANCE_TAGS ?? '')
  .split(',')
  .map((tag) => tag.trim())
  .filter(Boolean);
const unknownTags = selectedTags.filter((tag) => !CASE_TAGS.includes(tag as CaseTag));
if (unknownTags.length > 0) throw new Error(`ZPLC_CONFORMANCE_TAGS names ${unknownTags.join(', ')}; the tags are ${CASE_TAGS.join(', ')}`);
// ZPLC_CONFORMANCE_ROOT points the runner at another folder of cases (VF-002): addCase.test.ts runs a case that exists
// only in a temporary folder, to show that a source file and an expected-values file are all a new case needs.
const casesRoot = process.env.ZPLC_CONFORMANCE_ROOT ?? conformanceRoot;
const selected = loadCases(casesRoot).filter(
  (found) => selectedTags.length === 0 || found.expectation.tags.some((tag) => selectedTags.includes(tag)),
);

// One test per case in conformance/, named "<requirement> <title>": that name is what
// tools/ci/expected-failures.json lists while a known defect keeps the case red.
describe('conformance', () => {
  for (const found of selected) {
    // A case that must not build never reaches the VM, so it runs without the native runtime.
    const test = found.expectation.build === 'fails' ? it : itNative;
    test(
      found.name,
      async () => {
        expect(await runCase(found)).toEqual([]);
      },
      30_000,
    );
  }
});

describe('conformance: the loader accepts what the compiler produces', () => {
  // Runs after every case above (a file's tests run in the order they are declared), and reads what each one saw.
  itNative('CMP-051 the loader accepts every artifact the compiler produced for a conformance case', () => {
    console.log(
      `CMP-051: the loader accepted ${loader.accepted.length} of ${
        loader.accepted.length + loader.refused.length
      } artifacts the compiler produced`,
    );
    expect(loader.accepted.length + loader.refused.length).toBeGreaterThan(0);
    expect(loader.refused).toEqual([]);
  });
});

// Properties of a build that hold for every program, so no single case can state them. One committed program stands in for all.
const sample = {
  source: join(conformanceRoot, 'cmp', 'cmp-058-selection-and-limit-functions.st'),
  extension: '.st',
  extras: [],
  tasks: [],
};

async function build() {
  const root = await workspace(sample, 10);
  try {
    const built = await compilerCompile(root);
    if (!built.ok || !built.zplcFile || !built.debugMap)
      throw new Error(`the sample program does not build: ${diagnosticText(built.evidence.diagnostics)}`);
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
    const statements = Object.values((await build()).map.pou)
      .flatMap((pou) => pou.sourceMap)
      .sort((a, b) => a.pc - b.pc);
    expect(statements.length).toBeGreaterThan(1);
    // A statement covers all its instructions: it ends where the next one starts.
    const gaps = statements
      .slice(0, -1)
      .flatMap((entry, index) =>
        entry.pc + entry.length === statements[index + 1]!.pc
          ? []
          : [`line ${entry.line} ends at ${entry.pc + entry.length}, the next statement starts at ${statements[index + 1]!.pc}`],
      );
    expect(gaps).toEqual([]);
  });
});

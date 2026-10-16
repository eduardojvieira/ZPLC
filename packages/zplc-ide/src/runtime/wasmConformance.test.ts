import { describe, expect, it } from 'bun:test';
import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { builtWasmModule, itWasm } from '../cli/wasmModuleGuard';
import { compilerCompile } from '../cli/toolApi';
import { cellLocation, loadCases, type ConformanceCase, type RunExpectation } from '../conformance/cases';
import { workspace } from '../conformance/harness';
import { runScenario } from '../conformance/scenarioRun';
import { WASMAdapter } from './wasmAdapter';

// IDE-025, RT-007, RT-008: every conformance case that builds, with its tasks, runs on the WebAssembly runtime through
// the adapter of the IDE, on the virtual clock of a scenario, and gives the values that the case states. These are the
// cases and the steps that conformance.test.ts runs on the native runtime (the runner is shared: scenarioRun.ts), so the
// scheduler, the verifier, the fault latch and the safe state of the browser runtime are held to the same file as the
// native runtime's. wasmParity.test.ts drives the bare core for the one-task cases.

const conformanceRoot = fileURLToPath(new URL('../../../../conformance', import.meta.url));
const cases = loadCases(conformanceRoot).filter((found) => found.expectation.build === 'succeeds');

// The one declared difference. A runtime that registers no handler for a communication block answers STATUS 3 (no
// handler), which the COM-002 cases state because the native runtime of the suite registers none. The browser runtime
// registers a handler for every block that fails the request with STATUS 10 (UNAVAILABLE), because a browser module has no
// network (wasmCapabilities.ts): the same cells hold 10 there, and nothing else about these cases changes.
const STATUS_NO_HANDLER = 3;
const STATUS_UNAVAILABLE = 10;
const STATUS_CELL = '%QD1';

function browserExpectation(found: ConformanceCase): { expectation: RunExpectation; changed: number } {
  const expectation = found.expectation as RunExpectation;
  let changed = 0;
  const expect = expectation.expect.map((check) => {
    if (check.at !== STATUS_CELL || check.value !== STATUS_NO_HANDLER || !found.name.startsWith('COM-002')) return check;
    changed += 1;
    return { ...check, value: STATUS_UNAVAILABLE };
  });
  return { expectation: { ...expectation, expect }, changed };
}

async function runCase(found: ConformanceCase): Promise<string[]> {
  const { expectation } = browserExpectation(found);
  const root = await workspace({ ...found, tasks: expectation.tasks }, expectation.scanMs);
  try {
    const built = await compilerCompile(root);
    if (!built.ok || !built.zplcFile) return [`the build failed: ${built.evidence.diagnostics.map((diagnostic) => diagnostic.message).join('; ')}`];
    const map = built.debugMap;
    const adapter = new WASMAdapter({ loadModule: async () => builtWasmModule().bytes, scenarioClock: true });
    await adapter.connect();
    try {
      const outcome = await runScenario(adapter, expectation, built.zplcFile, (cell) => {
        if (cell.at !== undefined) return cellLocation(cell.at, cell.type);
        const entry = Object.values(map?.pou ?? {}).map((pou) => pou.vars[cell.var!]).find(Boolean);
        return entry ? { address: entry.addr, bit: entry.bitOffset } : `the debug map has no variable "${cell.var}"`;
      });
      return outcome.failures;
    } finally {
      await adapter.disconnect().catch(() => undefined);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe('the conformance cases on the WebAssembly runtime, through the adapter (IDE-025)', () => {
  it('runs every case that builds, the ones with several tasks and the ones that end in a fault included', () => {
    expect(cases.length).toBeGreaterThan(450);
    expect(cases.some((found) => (found.expectation as RunExpectation).tasks.length > 1)).toBe(true);
    expect(cases.some((found) => (found.expectation as RunExpectation).fault)).toBe(true);
  });

  it('differs from the native runtime in exactly the two COM-002 cases that read the STATUS of a block with no network', () => {
    expect(cases.filter((found) => browserExpectation(found).changed > 0).map((found) => found.name)).toEqual([
      'COM-002 a failed request holds ERROR while EN stays TRUE, EN FALSE clears it and STATUS keeps the code',
      'COM-002 a result is shown once for each rising edge of EN, and a held EN makes no second request',
    ]);
  });

  for (const found of cases) {
    itWasm(found.name, async () => {
      expect(await runCase(found)).toEqual([]);
    }, 30_000);
  }
});

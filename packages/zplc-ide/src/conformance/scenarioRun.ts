import type { NativeAdapter } from '../runtime/nativeAdapter';
import { cellLocation, cellSize, type Cell, type CellType, type RunExpectation } from './cases';
import { ACCESS, label } from './harness';

// What the runners of the conformance suite that go through an adapter share: load the artifact, set the inputs before
// each scan, step the scenario clock, and read the cells the case names. The native runtime's runner is
// conformance.test.ts and the WebAssembly runtime's is runtime/wasmConformance.test.ts; each connects its own adapter and
// hands it here, so the two prove the same steps and the same expectations.

export interface ScenarioOutcome {
  /** True when the loader refused the artifact: nothing ran. */
  loaderRefused: boolean;
  /** What differed from the expectation; an empty list is a pass. */
  failures: string[];
}

export type ScenarioAdapter = Pick<NativeAdapter, 'loadProgram' | 'peek' | 'pokeN' | 'scenarioStep'>;

export async function runScenario(
  adapter: ScenarioAdapter,
  expectation: RunExpectation,
  zplcFile: Uint8Array,
  address: (cell: Cell) => { address: number; bit?: number } | string,
): Promise<ScenarioOutcome> {
  const failures: string[] = [];
  try {
    await adapter.loadProgram(zplcFile);
  } catch (error) {
    return { loaderRefused: true, failures: [`the loader refused the artifact the compiler produced: ${(error as Error).message}`] };
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
      if (!expectation.fault || scan !== expectation.scans)
        return { loaderRefused: false, failures: [...failures, `scan ${scan}: the VM faulted: ${(error as Error).message}`] };
      faulted = true;
    }
    for (const check of expectation.expect.filter((candidate) => candidate.afterScan === scan)) {
      const where = address(check);
      if (typeof where === 'string') {
        failures.push(`after scan ${scan}: ${label(check)}: ${where}`);
        continue;
      }
      const bytes = await adapter.peek(where.address, cellSize(check.type));
      const observed =
        check.type === 'BOOL'
          ? (bytes[0]! & (1 << (where.bit ?? 0))) !== 0
          : ACCESS[check.type][0](new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength));
      const wanted = check.type === 'REAL' ? Math.fround(check.value as number) : check.value;
      if (observed !== wanted) failures.push(`after scan ${scan}: ${label(check)} expected ${check.value}, observed ${observed}`);
    }
  }
  if (expectation.fault && !faulted)
    failures.push(`the last scan (${expectation.scans}) was expected to end in a VM fault, and it completed`);
  return { loaderRefused: false, failures };
}

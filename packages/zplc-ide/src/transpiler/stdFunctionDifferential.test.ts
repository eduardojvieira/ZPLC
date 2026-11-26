/**
 * LNG-029 and LNG-030, the native differential: for each of the 297 registered functions an FBD diagram, a Ladder rung and the same
 * call in Structured Text, with the operands of the function's reference example, run on the native runtime, and the ST program
 * compares the three values inside it (`stdFunctionDifferential.ts`). The functions run in batches, one per category of the
 * reference and one per source type of the conversions, each with its own time limit.
 */
import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CONVERSION_TYPES, FUNCTION_DOCS } from '@zplc/compiler';

import productManifest from '../../../../package.json';
import { NativeSimulationSupervisor } from '../../shared/nativeSimulationSupervisor';
import { itNative, nativeRuntimeBinary } from '../cli/nativeRuntimeGuard';
import { compileMultiTaskProject, transpileToST } from '../compiler';
import { NativeAdapter } from '../runtime/nativeAdapter';
import { stdFunction } from '../catalog/stdFunctions';
import { DIFFERENTIAL_FUNCTIONS, differentialCase, type Example } from './stdFunctionDifferential';

// the example of a conversion is the one the docs job runs; the generator is read at run time, outside the type check of the IDE
const generator = '../../../../tools/docs/generate_function_reference.ts';
const { conversionExample } = (await import(generator)) as { conversionExample: (from: string) => Example };

const FLAGS = 0x1000; // %QX0.0 LngSameF, %QX0.1 LngSameL, %QX0.2 FbdRan, %QX0.3 LdRan

const open: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(open.splice(0).map((stop) => stop()));
});

function exampleOf(name: string): Example {
  const record = stdFunction(name)!;
  if (record.category === 'conversion') return conversionExample(record.inputs[0]![1]);
  const doc = FUNCTION_DOCS[name]!;
  return { source: doc.example.source, ...(doc.example.scans === undefined ? {} : { scans: doc.example.scans }) };
}

/** Builds the project of one function, runs it for its scans on the virtual clock, and returns what differs, or nothing. */
async function differential(name: string, discardResults = false): Promise<string[]> {
  const project = differentialCase(name, exampleOf(name), { discardResults });
  // a function that returns nothing shows only that it ran: its call is in the ST of the diagram and of the rung
  if (stdFunction(name)!.returns === 'VOID') {
    for (const source of project.sources.filter((candidate) => candidate.language !== 'ST')) {
      const translated = transpileToST(source.content, source.language).source;
      if (!translated.includes(`${name}();`)) return [`${name}: the ${source.language} source does not call it`];
    }
  }
  let zplcFile: Uint8Array;
  try {
    zplcFile = compileMultiTaskProject(project.config, project.sources).zplcFile;
  } catch (error) {
    return [`${name}: the project does not build: ${error instanceof Error ? error.message : String(error)}`];
  }
  const persist = await mkdtemp(join(tmpdir(), 'zplc-lng-'));
  const supervisor = new NativeSimulationSupervisor({
    clientName: 'zplc-lng-differential',
    clientVersion: productManifest.version,
    environment: {
      ...process.env,
      ZPLC_NATIVE_SIM_BIN: nativeRuntimeBinary,
      ZPLC_PERSIST_ROOT: persist,
      ZPLC_NATIVE_SCENARIO_VIRTUAL_CLOCK: '1',
    },
  });
  const adapter = new NativeAdapter(supervisor);
  const stop = async () => {
    await adapter.disconnect().catch(() => undefined);
    await supervisor.stopSession().catch(() => undefined);
    await rm(persist, { recursive: true, force: true });
  };
  try {
    await adapter.connect();
    await adapter.loadProgram(zplcFile);
    for (let scan = 0; scan < project.scans; scan += 1) await adapter.scenarioStep(scan * 10);
    const [flags] = await adapter.peek(FLAGS, 1);
    const named = ['FBD and ST differ', 'Ladder and ST differ', 'the diagram did not run', 'the rung did not run'];
    return named.filter((_, bit) => (flags! & (1 << bit)) === 0).map((what) => `${name}: ${what} (${project.call})`);
  } finally {
    await stop();
  }
}

/** The batches: one per category of the reference, and one per source type of the conversions. */
const batches = new Map<string, string[]>();
for (const name of DIFFERENTIAL_FUNCTIONS) {
  const record = stdFunction(name)!;
  const batch = record.category === 'conversion' ? `conversions from ${record.inputs[0]![1]}` : record.category;
  batches.set(batch, [...(batches.get(batch) ?? []), name]);
}

describe('LNG-029 LNG-030 every registered function gives in FBD and in Ladder the value it gives in ST, on the native runtime', () => {
  it('covers the 297 registered functions in batches', () => {
    expect([...batches.values()].flat().sort()).toEqual([...DIFFERENTIAL_FUNCTIONS]);
    expect(DIFFERENTIAL_FUNCTIONS.length).toBe(297);
    expect(batches.size).toBe(10 + CONVERSION_TYPES.length);
  });

  for (const [batch, names] of batches) {
    // ponytail: one session per function (about 0.1 s each); a shared session per batch if the suite grows slow
    itNative(
      `${batch} (${names.length})`,
      async () => {
        const failures: string[] = [];
        for (const name of names) failures.push(...(await differential(name)));
        expect(failures).toEqual([]);
      },
      5_000 + names.length * 1_000,
    );
  }

  // the fault probe: the diagram and the rung store their results elsewhere, as boxes that compute nothing would
  itNative(
    'catches a box that computes nothing: every function with a result differs, WATCHDOG_RESET still runs',
    async () => {
      const caught = new Set<string>();
      for (const name of DIFFERENTIAL_FUNCTIONS) {
        const failures = await differential(name, true);
        const both = failures.some((f) => f.includes('FBD and ST differ')) && failures.some((f) => f.includes('Ladder and ST differ'));
        if (both) caught.add(name);
      }
      expect(DIFFERENTIAL_FUNCTIONS.filter((name) => !caught.has(name))).toEqual(['WATCHDOG_RESET']);
    },
    60_000,
  );
});

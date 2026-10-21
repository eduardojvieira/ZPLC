import { describe, expect } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import productManifest from '../../../../package.json';
import { NativeSimulationSupervisor } from '../../shared/nativeSimulationSupervisor';
import { NativeAdapter } from '../runtime/nativeAdapter';
import { itNative, nativeRuntimeBinary } from './nativeRuntimeGuard';
import { compilerCompile } from './toolApi';

// CMP-029: a RETAIN variable keeps what the retentive region holds. The runtime restores the region before the first
// scan (RT-025); the program applies the declared initial values only when the region holds no saved state. The
// region is written here the way a restore would write it, and the program is run on the native runtime.

const SOURCE = `PROGRAM Kept
VAR RETAIN
  count : INT := 5;
  total : DINT;
END_VAR
VAR
  seenCount AT %QW0 : INT;
  seenTotal AT %QD1 : DINT;
END_VAR
  count := count + 1;
  total := total + 10;
  seenCount := count;
  seenTotal := total;
END_PROGRAM
`;

const MARKER = 0x4000;
const COUNT = 0x4004;
const TOTAL = 0x4008;

async function run(restore: boolean): Promise<{ count: number; total: number; marker: number }> {
  const root = await mkdtemp(join(tmpdir(), 'zplc-retain-'));
  const persist = await mkdtemp(join(tmpdir(), 'zplc-retain-run-'));
  try {
    await mkdir(join(root, 'src'));
    await writeFile(join(root, 'src', 'main.st'), SOURCE);
    await writeFile(
      join(root, 'zplc.json'),
      JSON.stringify({
        schemaVersion: 2,
        name: 'retain',
        version: '1.0.0',
        target: { board: 'posix' },
        tasks: [{ name: 'MainTask', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['main.st'] }],
      }),
    );
    const compiled = await compilerCompile(root);
    if (!compiled.ok || !compiled.zplcFile) throw new Error(JSON.stringify(compiled.evidence.diagnostics));
    const vars = compiled.debugMap!.pou.Kept!.vars;
    expect([vars.count!.addr, vars.total!.addr]).toEqual([COUNT, TOTAL]);

    const supervisor = new NativeSimulationSupervisor({
      clientName: 'zplc-retain',
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
      await adapter.loadProgram(compiled.zplcFile);
      if (restore) {
        // what a restored record looks like: the marker set, count 100 and total 1000
        await adapter.pokeN(MARKER, new Uint8Array([1, 0, 0, 0, 100, 0, 0, 0, 0xe8, 0x03, 0, 0]));
      }
      await adapter.scenarioStep(0);
      await adapter.scenarioStep(10);
      const region = await adapter.peek(MARKER, 12);
      const view = new DataView(region.buffer, region.byteOffset, region.byteLength);
      return { marker: view.getUint8(0), count: view.getInt16(4, true), total: view.getInt32(8, true) };
    } finally {
      await adapter.disconnect().catch(() => undefined);
      await supervisor.stopSession().catch(() => undefined);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(persist, { recursive: true, force: true });
  }
}

describe('RETAIN initial values (CMP-029)', () => {
  itNative('applies the declared initial values when the retentive region holds no saved state', async () => {
    // count 5 then two scans: 7; total 0 then two scans: 20; the marker is set
    expect(await run(false)).toEqual({ marker: 1, count: 7, total: 20 });
  });

  itNative('keeps the values of a restored region and does not apply the initial values over them', async () => {
    expect(await run(true)).toEqual({ marker: 1, count: 102, total: 1020 });
  });
});

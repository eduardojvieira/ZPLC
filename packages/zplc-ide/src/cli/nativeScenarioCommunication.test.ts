import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { itNative, nativeRuntimeBinary } from './nativeRuntimeGuard';
import { createNativeScenarioSession } from './nativeScenarioRuntime';
import { compilerCompile } from './toolApi';

// COM-009 through the command line: `zplc test` and the scenario runner outside Studio start the same simulation
// as Studio does, so a block of a communication service meets the answer of the simulation, not "no handler".
// An Azure DPS block has no simulated peer: with the loopback environment it answers 10 ("not available"), and
// without it 3 ("no handler"), which is what a CLI run answered before it shared the Studio environment.

const STATUS_UNAVAILABLE = 10;
const STATUS_OUTPUT = 0x1004; // %QD1
let root = '';

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'zplc-cli-comm-'));
  await mkdir(join(root, 'src'));
  await writeFile(join(root, 'src', 'main.st'), `PROGRAM Demo
VAR
  Dps : AZURE_DPS_PROV;
  Cloud AT %QD1 : DINT;
END_VAR
  Dps(EN := TRUE);
  Cloud := Dps.STATUS;
END_PROGRAM
`);
  await writeFile(join(root, 'zplc.json'), JSON.stringify({
    schemaVersion: 2, name: 'comm', version: '1.0.0', target: { board: 'posix' },
    tasks: [{ name: 'MainTask', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['main.st'] }],
  }));
});
afterAll(() => rm(root, { recursive: true, force: true }));

describe('the scenario session of the command line', () => {
  itNative('answers a communication block with the simulation answer, not "no handler"', async () => {
    const compiled = await compilerCompile(root);
    if (!compiled.ok || !compiled.zplcFile) throw new Error('the program does not build');
    const environment = { ...process.env, ZPLC_NATIVE_SIM_BIN: nativeRuntimeBinary };
    delete environment.ZPLC_NATIVE_COMM;
    delete environment.ZPLC_NATIVE_LOOPBACK;
    const session = await createNativeScenarioSession(environment);
    try {
      await session.runtime.loadProgram(compiled.zplcFile);
      for (let scan = 0; scan < 3; scan += 1) await session.runtime.step(scan * 10);
      const bits = await Promise.all([0, 1, 2, 3].map((bit) => session.runtime.readOutput(STATUS_OUTPUT, bit)));
      const status = bits.reduce((sum, set, bit) => sum + (set ? 1 << bit : 0), 0);
      expect(status).toBe(STATUS_UNAVAILABLE);
    } finally {
      await session.close();
    }
  }, 30_000);
});

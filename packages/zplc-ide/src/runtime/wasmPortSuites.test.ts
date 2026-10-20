import { beforeAll, describe, expect } from 'bun:test';

import { assemble } from '@zplc/compiler';

import { buildSuites, runSuite, SUITES } from '../../../../tools/wasm-core/suites';
import { builtWasmModule, itWasm, wasmToolchainAvailable } from '../cli/wasmModuleGuard';
import { MemoryRecordStore, WasmRuntime } from './wasmRuntime';

// IO-013, RT-008: the port conformance suite on the WebAssembly port. The C suites of firmware/lib/zplc_core/tests, the
// files that ctest runs on the POSIX port and Twister on Zephyr, are built by tools/wasm-core/suites.ts with the HAL port
// of the runtime (src/hal/wasm) and run here with the host imports the IDE gives the runtime: the per-opcode tests, the
// loader negative tests, the scheduler phase and fault tests (the same scheduler suite as the other ports), the timing
// self-test on the clock of the host and the I/O table. Storage on this port is the record store of the host: the retain
// rules are wasmRetain.test.ts, the program store is below. Without clang and wasm-ld the tests skip on a developer
// machine and fail in CI (VF-023).

const built = new Map<string, Uint8Array>();
beforeAll(async () => {
  if (!wasmToolchainAvailable) return;
  for (const { suite, bytes } of await buildSuites()) built.set(suite.name, bytes);
}, 300_000);

describe('the port conformance suite on WebAssembly: the C suites of the core on its HAL port (IO-013, RT-008)', () => {
  for (const suite of SUITES) {
    // a suite runs in well under a second; the limit is for a machine under the load of a full run
    itWasm(`${suite.category}: ${suite.name}`, async () => {
      const run = await runSuite(built.get(suite.name)!);
      expect({ suite: suite.name, code: run.code, failures: run.output.filter((line) => /FAIL|trapped/.test(line)) })
        .toEqual({ suite: suite.name, code: 0, failures: [] });
    }, 60_000);
  }
});

// ---------------------------------------------------------------------------------------------------------------------
// Storage: the program store of the session, over the record store of the host
// ---------------------------------------------------------------------------------------------------------------------

const PROGRAM = assemble('    PUSH32 5\n    STORE32 0x1000\n    HALT\n').zplcFile;
const hex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

interface Stored { program_generation: number; stats: { program_size: number } }

/** A runtime over `records`; `status` answers status.get, `end` shuts the session down as the IDE does. */
async function boot(records: MemoryRecordStore) {
  const runtime = await WasmRuntime.instantiate(builtWasmModule().bytes, { clock: () => 0, records });
  let counter = 0;
  const send = (method: string, params: object = {}) => {
    counter += 1;
    return JSON.parse(runtime.request(JSON.stringify({ id: `p${counter}`, type: 'request', method, params })).response) as { result?: unknown };
  };
  return {
    load: () => send('program.load', { bytecode_hex: hex(PROGRAM) }),
    status: () => send('status.get').result as Stored,
    end() {
      send('session.shutdown');
      runtime.shutdown();
    },
  };
}

describe('the storage of the WebAssembly port: the program store over the records of the host (IO-013)', () => {
  itWasm('stores the loaded program, restores it in a new session, and refuses a record that is not whole', async () => {
    const records = new MemoryRecordStore();
    const first = await boot(records);
    expect(first.load().result).toMatchObject({ program_size: PROGRAM.byteLength, program_generation: 1 });
    first.end();
    // the records of zplc_program_store.c: a payload and its metadata in a slot, and the record of the active slot
    const payload = records.get('program_v1_slot_a_payload');
    expect(payload).toBeDefined();
    expect(records.get('program_v1_slot_a_meta')).toBeDefined();
    expect(records.get('program_v1_active')).toBeDefined();

    const restored = await boot(records);
    expect(restored.status()).toMatchObject({ program_generation: 1, stats: { program_size: PROGRAM.byteLength } });
    restored.end();

    // one flipped bit of the stored program: the store refuses it and the session starts without a program
    const damaged = new Uint8Array(payload!);
    damaged[24] ^= 0x01;
    records.set('program_v1_slot_a_payload', damaged);
    const afterDamage = await boot(records);
    expect(afterDamage.status()).toMatchObject({ program_generation: 0, stats: { program_size: 0 } });
    afterDamage.end();

    // a record cut short (a write that stopped half way): refused the same way
    records.set('program_v1_slot_a_payload', payload!.slice(0, payload!.byteLength - 8));
    const afterCut = await boot(records);
    expect(afterCut.status()).toMatchObject({ program_generation: 0, stats: { program_size: 0 } });
    afterCut.end();
  });
});

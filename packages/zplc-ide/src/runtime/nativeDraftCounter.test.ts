// CMP-052 against the real native runtime: the hello carries its draft contract counter, a program built for another
// draft (or before the counter) is refused with both numbers, by Studio first and by the runtime itself when a client
// skips Studio, and the refusal leaves the loaded program running. The runtime tests drive the real zplc_runtime binary.
import { describe, expect } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ZPLC_CONSTANTS, compileToBinary } from '@zplc/compiler';

import { NativeSimulationSupervisor } from '../../shared/nativeSimulationSupervisor';
import { isAllowedNativeSimulationRequest } from '../../electron/security';
import { itNative, nativeRuntimeBinary } from '../cli/nativeRuntimeGuard';
import { bytesToHex } from './debugAdapter';
import { NativeAdapter } from './nativeAdapter';

const OWN = ZPLC_CONSTANTS.DRAFT_COUNTER;
const OFFSET = ZPLC_CONSTANTS.DRAFT_COUNTER_OFFSET;

/** CRC32 over the whole file except its own four bytes (tools/contract/contract.json: container.crc). */
function refreshCrc(file: Uint8Array): void {
  let crc = 0xffffffff;
  for (let index = 0; index < file.length; index += 1) {
    if (index >= 12 && index < 16) continue;
    crc ^= file[index]!;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) !== 0 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  new DataView(file.buffer, file.byteOffset, file.byteLength).setUint32(12, (crc ^ 0xffffffff) >>> 0, true);
}

function builtForDraft(draft: number): Uint8Array {
  const file = new Uint8Array(compileToBinary('PROGRAM Draft\nVAR x : DINT; END_VAR\n x := x + 1;\nEND_PROGRAM\n').zplcFile);
  new DataView(file.buffer).setUint32(OFFSET, draft, true);
  refreshCrc(file);
  return file;
}

async function withSession<T>(
  run: (session: { adapter: NativeAdapter; supervisor: NativeSimulationSupervisor; hello: unknown }) => Promise<T>,
): Promise<T> {
  const persistRoot = await mkdtemp(join(tmpdir(), 'zplc-draft-counter-'));
  const supervisor = new NativeSimulationSupervisor({
    clientName: 'zplc-draft-counter-test',
    clientVersion: '0',
    environment: { ...process.env, ZPLC_NATIVE_SIM_BIN: nativeRuntimeBinary, ZPLC_PERSIST_ROOT: persistRoot },
  });
  let hello: unknown;
  const adapter = new NativeAdapter({
    startSession: async () => { hello = await supervisor.startSession(); return hello as never; },
    stopSession: () => supervisor.stopSession(),
    request: async (request) => {
      if (!isAllowedNativeSimulationRequest(request)) throw new Error('Request denied');
      return supervisor.request(request) as never;
    },
  });
  try {
    await adapter.connect();
    return await run({ adapter, supervisor, hello });
  } finally {
    await adapter.disconnect().catch(() => undefined);
    await supervisor.stopSession().catch(() => undefined);
    await rm(persistRoot, { recursive: true, force: true });
  }
}

describe('native simulation and the draft contract counter', () => {
  itNative('reports its own counter in the hello, and that is the counter the compiler writes', async () => {
    await withSession(async ({ hello }) => {
      expect((hello as { draft_counter?: number }).draft_counter).toBe(OWN);
    });
  }, 30_000);

  itNative('loads a program of its own draft and runs it', async () => {
    await withSession(async ({ adapter }) => {
      await adapter.loadProgram(builtForDraft(OWN));
      await adapter.start();
      await adapter.stop();
    });
  }, 30_000);

  itNative('refuses a program built for another draft or before the counter, with both numbers', async () => {
    await withSession(async ({ adapter, supervisor }) => {
      const other = OWN + 5;
      const message = (built: string) => `Program was built for contract draft ${built}, this runtime is draft ${OWN}`;

      await adapter.loadProgram(builtForDraft(OWN));

      // Studio says it before anything is sent.
      await expect(adapter.loadProgram(builtForDraft(other))).rejects.toThrow(message(String(other)));
      await expect(adapter.loadProgram(builtForDraft(0))).rejects.toThrow(message('none'));

      // The runtime says the same when a client skips Studio (a script, the CLI).
      for (const [id, draft, built] of [['other', other, String(other)], ['none', 0, 'none']] as const) {
        await expect(supervisor.request({
          id: `direct-${id}`,
          type: 'request',
          method: 'program.load',
          params: { bytecode_hex: bytesToHex(builtForDraft(draft)) },
        })).rejects.toThrow(message(built));
      }

      // The refusals left the session as it was: the program of its own draft is still loaded and runs.
      await adapter.start();
      await adapter.stop();
    });
  }, 30_000);
});

import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { assertMemoryAccess, checkMemoryAccess, MemoryAccessError, regionsOf, sameRegion, type AccessKind } from './memoryAccess';
import { NativeAdapter } from './nativeAdapter';
import { SerialAdapter } from './serialAdapter';
import { WASMAdapter } from './wasmAdapter';
import { groupVariablesForBatchPeek } from './peekParser';
import type { IDebugAdapter, WatchVariable } from './debugAdapter';
import type { SerialConnection } from '../uploader/webserial';

// The access cases are written once, in tools/contract/protocol.json, and generated into the vectors file. The
// device runs the same cases against its engine (firmware/lib/zplc_core/tests/test_proto_session.c): an access is
// accepted or refused, and a refusal names the region, by the same rule in the three adapters and on the device.
interface AccessCase {
  name: string;
  address: number;
  length: number;
  kind: AccessKind;
  ok: boolean;
  reason?: string;
  region: string | null;
  start: number;
  end: number;
}
const cases = (
  JSON.parse(readFileSync(fileURLToPath(new URL('../../../../tools/contract/golden/protocol-vectors.json', import.meta.url)), 'utf8')) as {
    accessCases: AccessCase[];
  }
).accessCases;

/** A session that answers every request the way a runtime does for an access that the adapter let through. */
const session = {
  startSession: async () => {
    throw new Error('not used');
  },
  stopSession: async () => undefined,
  request: async (message: { method: string; params: Record<string, unknown> }) => {
    if (message.method === 'memory.read') return { bytes_hex: '00'.repeat(Number(message.params.length)) } as never;
    if (message.method === 'force.set') return { force_entries: [] } as never;
    return {} as never;
  },
};

function nativeAdapter(): NativeAdapter {
  const adapter = new NativeAdapter(session);
  (adapter as unknown as { _connected: boolean })._connected = true;
  return adapter;
}

function serialAdapter(): SerialAdapter {
  const adapter = new SerialAdapter();
  const connection = {
    _rxBuffer: '',
    isConnected: true,
    writer: {
      write: async (data: Uint8Array) => {
        const command = new TextDecoder().decode(data).trim();
        if (command) {
          const peek = /dbg peek 0x([0-9a-f]+) (\d+)/.exec(command);
          connection._rxBuffer = peek ? `Memory at 0x${peek[1]}:\r\n0000: ${'00 '.repeat(Number(peek[2]))}\r\nOK\r\n` : 'OK: accepted\r\n';
        }
      },
    },
  } as unknown as SerialConnection;
  const internals = adapter as unknown as { _connected: boolean; connection: SerialConnection };
  internals._connected = true;
  internals.connection = connection;
  return adapter;
}

/** The adapter of the browser runtime is the session adapter over another transport: it makes the same check. */
function wasmAdapter(): WASMAdapter {
  const adapter = new WASMAdapter({
    loadModule: async () => {
      throw new Error('not used');
    },
  });
  Object.assign(adapter, { _connected: true, api: session });
  return adapter;
}

const ADAPTERS: ReadonlyArray<readonly [string, () => IDebugAdapter]> = [
  ['native', nativeAdapter],
  ['serial', serialAdapter],
  ['wasm', wasmAdapter],
];

async function perform(adapter: IDebugAdapter, kind: AccessKind, address: number, length: number): Promise<void> {
  if (kind === 'read') await adapter.peek(address, length);
  else if (kind === 'write') await adapter.pokeN(address, new Uint8Array(length));
  else await adapter.forceValue(address, new Uint8Array(length));
}

describe('the shared address and length check (COM-024)', () => {
  for (const testCase of cases) {
    it(`${testCase.name}: ${testCase.ok ? 'accepted' : 'refused'}`, () => {
      const refusal = checkMemoryAccess(testCase.address, testCase.length, testCase.kind);
      if (testCase.ok) {
        expect(refusal).toBeNull();
        return;
      }
      expect(refusal).toBeInstanceOf(MemoryAccessError);
      expect(refusal!.address).toBe(testCase.address);
      expect(refusal!.length).toBe(testCase.length);
      expect(refusal!.kind).toBe(testCase.kind);
      expect(refusal!.reason).toBe(testCase.reason as never);
      if (testCase.region === null) {
        expect(refusal!.region).toBeNull();
      } else {
        expect(refusal!.region?.name.toUpperCase()).toBe(testCase.region);
        expect(refusal!.region?.start).toBe(testCase.start);
        expect(refusal!.region?.end).toBe(testCase.end);
      }
    });
  }

  it('the message says what was asked for, why, and the valid range', () => {
    expect(() => assertMemoryAccess(0x4ffe, 4, 'write')).toThrow(
      'Cannot write 4 bytes at 0x4FFE: the access runs out of RETAIN 0x4000 to 0x4FFF; one access stays inside one region',
    );
    expect(() => assertMemoryAccess(0x5000, 1, 'read')).toThrow(
      'Cannot read 1 byte at 0x5000: the address is outside PLC memory (valid: IPI 0x0000 to 0x0FFF; OPI 0x1000 to 0x1FFF; WORK 0x2000 ' +
        'to 0x3FFF; RETAIN 0x4000 to 0x4FFF)',
    );
  });

  it('a device with smaller regions has smaller windows', () => {
    const sizes = { ipi: 0x1000, opi: 0x1000, work: 0x400, retain: 0x100 };
    expect(regionsOf(sizes).map((region) => [region.name, region.start, region.end])).toEqual([
      ['ipi', 0, 0x1000],
      ['opi', 0x1000, 0x2000],
      ['work', 0x2000, 0x2400],
      ['retain', 0x4000, 0x4100],
    ]);
    expect(checkMemoryAccess(0x2400, 1, 'read', sizes)?.reason).toBe('outside');
    expect(checkMemoryAccess(0x23ff, 1, 'read', sizes)).toBeNull();
    // a region larger than its window does not reach the next region
    expect(regionsOf({ ipi: 0x1000, opi: 0x1000, work: 0x9000, retain: 0x1000 })[2]!.end).toBe(0x4000);
  });

  it('a batched read does not span two regions', () => {
    const variable = (name: string, address: number): WatchVariable => ({ name, address, type: 'INT', forceable: true });
    const groups = groupVariablesForBatchPeek([variable('a', 0x0ffe), variable('b', 0x1000)]);
    expect(groups.map((group) => [group.baseAddress, group.span])).toEqual([
      [0x0ffe, 2],
      [0x1000, 2],
    ]);
    expect(sameRegion(0x0ffe, 0x0fff)).toBe(true);
    expect(sameRegion(0x0fff, 0x1000)).toBe(false);
  });
});

describe('every adapter applies the same check before it touches the device (COM-024)', () => {
  for (const [adapterName, make] of ADAPTERS) {
    for (const testCase of cases) {
      it(`${adapterName}: ${testCase.name}`, async () => {
        const adapter = make();
        const outcome = await perform(adapter, testCase.kind, testCase.address, testCase.length).then(
          () => null,
          (error: unknown) => error,
        );
        if (testCase.ok) {
          expect(outcome).toBeNull();
          return;
        }
        expect(outcome).toBeInstanceOf(MemoryAccessError);
        const refusal = outcome as MemoryAccessError;
        expect(refusal.address).toBe(testCase.address);
        expect(refusal.length).toBe(testCase.length);
        expect(refusal.region?.start ?? 0xffff).toBe(testCase.start);
        expect(refusal.region?.end ?? 0xffff).toBe(testCase.end);
      });
    }
  }

  it('the serial adapter uses the sizes the device reported', async () => {
    const adapter = serialAdapter();
    (adapter as unknown as { systemInfoCache: unknown }).systemInfoCache = {
      memory: { work_size: 0x400, retain_size: 0x100, ipi_size: 0x1000, opi_size: 0x1000 },
    };
    await expect(adapter.peek(0x2400, 1)).rejects.toThrow('the address is outside PLC memory');
    await expect(adapter.peek(0x23ff, 1)).resolves.toHaveLength(1);
  });
});

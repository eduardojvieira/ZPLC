import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';

import { assemble } from '@zplc/compiler';

import { builtWasmModule, itWasm } from '../cli/wasmModuleGuard';
import { ProjectRecordStore, openRecordStore } from './projectRecordStore';
import { WASMAdapter } from './wasmAdapter';
import { MemoryRecordStore, WasmRuntime, type WasmRecordStore } from './wasmRuntime';

// RT-025, RT-026, RT-027: the browser runtime applies the retain rules of the firmware and of the POSIX host, because it
// runs the same module of rules (zplc_retain.c) over a store that the host supplies. The scenarios below are the ones of
// the POSIX session test (firmware/lib/zplc_core/tests/test_native_runtime_session.c, "RETAIN persistence of the host
// runtime"): the same program, the same steps and the same status fields. The files are held together by the last test.

const RETAIN = 0x4000;
const SCAN_MS = 100; // the interval that a program with no task segment is given

/** RETAIN[0..3] += 1 once per scan: LOAD32 RETAIN; PUSH32 1; ADD; STORE32 RETAIN; HALT. */
const COUNTER = assemble('    LOAD32 0x4000\n    PUSH32 1\n    ADD\n    STORE32 0x4000\n    HALT\n').zplcFile;
/** A program that writes the output image and nothing of RETAIN. */
const OTHER = assemble('    PUSH32 5\n    STORE32 0x1000\n    HALT\n').zplcFile;

const hex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

interface RetainStatus { reason: string; restored: boolean; sequence: number; saves: number; save_errors: number; saved_at_ms: number | null }

/** One runtime of the module, driven by request lines and polls at times the test names, over a store it is given. */
async function boot(records: WasmRecordStore, clock: { now: number }) {
  const runtime = await WasmRuntime.instantiate(builtWasmModule().bytes, { clock: () => clock.now, records });
  let counter = 0;
  const send = (method: string, params: object = {}) => {
    counter += 1;
    const answer = JSON.parse(runtime.request(JSON.stringify({ id: `r${counter}`, type: 'request', method, params })).response) as { result?: Record<string, unknown>; error?: { message: string } };
    return answer;
  };
  return {
    runtime,
    send,
    load: (program: Uint8Array) => send('program.load', { bytecode_hex: hex(program) }),
    status: () => (send('status.get').result as { retain: RetainStatus }).retain,
    counter: () => {
      const bytes = send('memory.read', { address: RETAIN, length: 4 }).result!.bytes_hex as string;
      return Number.parseInt(bytes.slice(6, 8) + bytes.slice(4, 6) + bytes.slice(2, 4) + bytes.slice(0, 2), 16);
    },
    ticks(from: number, to: number) {
      for (let now = from; now <= to; now += SCAN_MS) {
        clock.now = now;
        runtime.tick(now);
      }
    },
    end() {
      send('session.shutdown');
      runtime.shutdown();
    },
  };
}

describe('RETAIN on the WebAssembly runtime follows the rules of the firmware (RT-025, RT-027)', () => {
  itWasm('continues a counter in a new session, and a different program starts from an initialised region', async () => {
    const records = new MemoryRecordStore();
    const clock = { now: 0 };

    const first = await boot(records, clock);
    first.load(COUNTER);
    expect(first.status()).toEqual({ reason: 'none', restored: false, sequence: 0, saves: 0, save_errors: 0, saved_at_ms: null });
    first.send('execution.start');
    first.ticks(SCAN_MS, 3 * SCAN_MS);
    expect(first.counter()).toBe(3);
    clock.now = 3 * SCAN_MS;
    first.send('execution.stop');
    expect(first.status()).toMatchObject({ sequence: 1, saves: 1, save_errors: 0, saved_at_ms: 300 });
    first.end();

    clock.now = 0;
    const second = await boot(records, clock);
    second.load(COUNTER);
    expect(second.status()).toMatchObject({ reason: 'restored', restored: true, sequence: 1 });
    expect(second.counter()).toBe(3);
    second.send('execution.start');
    second.ticks(SCAN_MS, SCAN_MS);
    expect(second.counter()).toBe(4);
    second.send('execution.stop');
    expect(second.status()).toMatchObject({ sequence: 2, saves: 1 });
    second.end();

    // a different program does not inherit the values
    const other = await boot(records, clock);
    expect(other.load(OTHER).result).toBeDefined();
    expect(other.counter()).toBe(0);
    expect(other.status()).toMatchObject({ reason: 'identity_mismatch', restored: false });
    other.end();

    // the first program finds its record again, as long as no newer record replaced it
    const again = await boot(records, clock);
    again.load(COUNTER);
    expect(again.counter()).toBe(4);
    expect(again.status().reason).toBe('restored');
    again.end();
  });

  itWasm('refuses a record that is damaged, and one that was written for another layout, and says which', async () => {
    const records = new MemoryRecordStore();
    const clock = { now: 0 };
    const first = await boot(records, clock);
    first.load(COUNTER);
    first.send('execution.start');
    first.ticks(SCAN_MS, 2 * SCAN_MS);
    first.send('execution.stop');
    first.end();
    // a record is stored in chunks of at most 1024 bytes under "retain_a0", "retain_a1", ... (zplc_retain.h)
    const chunks = [0, 1, 2, 3, 4].map((index) => records.get(`retain_a${index}`)!);
    expect(chunks.every((chunk) => chunk !== undefined)).toBe(true);
    expect(records.get('retain_a5')).toBeUndefined();
    const intact = new Uint8Array(chunks.flatMap((chunk) => [...chunk]));
    const store = (record: Uint8Array) => chunks.forEach((_, index) => records.set(`retain_a${index}`, record.slice(index * 1024, (index + 1) * 1024)));

    // one flipped bit of the payload: the checksum no longer matches
    const damaged = new Uint8Array(intact);
    damaged[28] ^= 0x01;
    store(damaged);
    const afterDamage = await boot(records, clock);
    afterDamage.load(COUNTER);
    expect(afterDamage.status()).toMatchObject({ reason: 'corrupt', restored: false });
    expect(afterDamage.counter()).toBe(0);
    afterDamage.end();

    // the same record with another layout hash and a correct checksum: a record of another draft or version
    const stale = new Uint8Array(intact);
    new DataView(stale.buffer).setUint32(20, new DataView(stale.buffer).getUint32(20, true) ^ 0xa5a5a5a5, true);
    const body = stale.subarray(0, stale.length - 4);
    new DataView(stale.buffer).setUint32(stale.length - 4, Bun.hash.crc32(body) >>> 0, true);
    store(stale);
    const afterStale = await boot(records, clock);
    afterStale.load(COUNTER);
    expect(afterStale.status()).toMatchObject({ reason: 'layout_mismatch', restored: false });
    expect(afterStale.counter()).toBe(0);
    afterStale.end();
  });

  itWasm('saves on the interval, skips a region that did not change, and stores only on STOP when the interval is 0', async () => {
    // the interval of the POSIX host is the environment variable ZPLC_RETAIN_SAVE_INTERVAL_MS (30 s without it); a module has no
    // environment, so the default applies: one periodic save a whole interval after the last record
    const records = new MemoryRecordStore();
    const clock = { now: 0 };
    const run = await boot(records, clock);
    run.load(COUNTER);
    run.send('execution.start');
    run.ticks(SCAN_MS, 29_900);
    expect(run.status().saves).toBe(0);
    run.ticks(30_000, 30_000);
    expect(run.status()).toMatchObject({ sequence: 1, saves: 1, save_errors: 0, saved_at_ms: 30_000 });
    run.ticks(30_100, 59_900);
    expect(run.status().saves).toBe(1);
    run.ticks(60_000, 60_000);
    expect(run.status()).toMatchObject({ sequence: 2, saves: 2, saved_at_ms: 60_000 });
    run.end();

    // a program that never writes RETAIN stores its initialised region once and never again
    const idle = await boot(new MemoryRecordStore(), { now: 0 });
    idle.load(OTHER);
    idle.send('execution.start');
    idle.ticks(SCAN_MS, 30_000);
    expect(idle.status().saves).toBe(1);
    idle.ticks(30_100, 120_000);
    expect(idle.status().saves).toBe(1);
    idle.end();
  });

  itWasm('initialises the region on a reset and does not bring the old values back', async () => {
    const records = new MemoryRecordStore();
    const clock = { now: 0 };
    const run = await boot(records, clock);
    run.load(COUNTER);
    run.send('execution.start');
    run.ticks(SCAN_MS, 2 * SCAN_MS);
    run.send('execution.stop');
    expect(run.counter()).toBe(2);
    run.send('execution.reset');
    expect(run.counter()).toBe(0);
    expect(run.status()).toMatchObject({ reason: 'reset', restored: false, sequence: 2 });
    run.end();

    const next = await boot(records, clock);
    next.load(COUNTER);
    expect(next.counter()).toBe(0);
    next.end();
  });

  itWasm('reports a store that fails as an error of the save and keeps the previous record', async () => {
    const records = new MemoryRecordStore();
    const clock = { now: 0 };
    const run = await boot(records, clock);
    run.load(COUNTER);
    run.send('execution.start');
    run.ticks(SCAN_MS, SCAN_MS);
    run.send('execution.stop');
    expect(run.status().saves).toBe(1);
    // the next save cannot be written
    const failing: WasmRecordStore = { get: (key) => records.get(key), set: () => { throw new Error('disk full'); }, delete: (key) => records.delete(key) };
    run.end();
    const broken = await boot(failing, clock);
    broken.load(COUNTER);
    expect(broken.status().reason).toBe('restored');
    broken.send('execution.start');
    broken.ticks(SCAN_MS, SCAN_MS);
    broken.send('execution.stop');
    expect(broken.status().save_errors).toBeGreaterThanOrEqual(1);
    broken.end();
    // the previous record is intact
    const after = await boot(records, clock);
    after.load(COUNTER);
    expect(after.counter()).toBe(1);
    after.end();
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// The project's folder
// ---------------------------------------------------------------------------------------------------------------------

/** A folder of a project, in memory, with the part of the handle interface that the store uses. */
class MemoryDirectory {
  readonly kind = 'directory' as const;
  readonly directories = new Map<string, MemoryDirectory>();
  readonly files = new Map<string, Uint8Array>();
  failWrites = false;

  constructor(readonly name = 'project') {}

  async getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<MemoryDirectory> {
    let directory = this.directories.get(name);
    if (directory === undefined) {
      if (options?.create !== true) throw new DOMException('not found', 'NotFoundError');
      directory = new MemoryDirectory(name);
      directory.failWrites = this.failWrites;
      this.directories.set(name, directory);
    }
    return directory;
  }

  async getFileHandle(name: string, options?: { create?: boolean }) {
    if (!this.files.has(name)) {
      if (options?.create !== true) throw new DOMException('not found', 'NotFoundError');
      this.files.set(name, new Uint8Array());
    }
    const files = this.files;
    return {
      kind: 'file' as const,
      name,
      getFile: async () => {
        const bytes = files.get(name)!;
        return { arrayBuffer: async () => bytes.slice().buffer };
      },
      createWritable: async () => {
        if (this.failWrites) throw new Error('the folder is read-only');
        let written = new Uint8Array();
        return {
          async write(data: Uint8Array) { written = new Uint8Array(data); },
          async close() { files.set(name, written); },
        };
      },
    };
  }

  async removeEntry(name: string): Promise<void> {
    if (!this.files.delete(name)) throw new DOMException('not found', 'NotFoundError');
  }
}

const asHandle = (directory: MemoryDirectory) => directory as unknown as FileSystemDirectoryHandle;

describe('RETAIN records kept with the project (RT-027)', () => {
  itWasm('survive a simulation that is closed and a project that is opened again', async () => {
    const project = new MemoryDirectory();
    const module = builtWasmModule().bytes;
    const messages: string[] = [];

    const first = await openRecordStore(asHandle(project), (message) => messages.push(message));
    expect(first.retainStorage).toBe('project');
    const adapter = new WASMAdapter({ loadModule: async () => module, ...first });
    await adapter.connect();
    await adapter.loadProgram(COUNTER);
    await adapter.start();
    await new Promise((resolve) => setTimeout(resolve, 450));
    await adapter.stop();
    const counted = (await adapter.peek(RETAIN, 1))[0]!;
    expect(counted).toBeGreaterThanOrEqual(2);
    await adapter.disconnect();

    // the records are files of the project's build folder, written when the session stopped
    const retained = project.directories.get('build')?.directories.get('retain');
    expect([...retained!.files.keys()].sort()).toEqual([0, 1, 2, 3, 4].map((index) => `retain_a${index}.bin`));
    expect(messages).toEqual([]);

    // another session, over the same folder, continues from the stored value
    const reopened = await openRecordStore(asHandle(project));
    const next = new WASMAdapter({ loadModule: async () => module, ...reopened });
    await next.connect();
    await next.loadProgram(COUNTER);
    expect((await next.peek(RETAIN, 1))[0]).toBe(counted);
    await next.disconnect();
  });

  itWasm('say so when the folder cannot be written, and keep the session running', async () => {
    const project = new MemoryDirectory();
    project.failWrites = true;
    const messages: string[] = [];
    const store = await ProjectRecordStore.open(asHandle(project), (message) => messages.push(message));
    const adapter = new WASMAdapter({ loadModule: async () => builtWasmModule().bytes, records: store, retainStorage: 'project' });
    await adapter.connect();
    await adapter.loadProgram(COUNTER);
    await adapter.start();
    await adapter.stop();
    await adapter.disconnect();
    expect(messages.some((message) => message.includes('could not be kept with the project'))).toBe(true);
  });

  it('keeps records in the memory of the page when no project folder is open, and says so', async () => {
    const opened = await openRecordStore(null);
    expect(opened.retainStorage).toBe('memory');
    expect(opened.records).toBeInstanceOf(MemoryRecordStore);
  });
});

describe('the retain scenarios are the ones of the POSIX session test', () => {
  it('names, in the C test, the status fields these scenarios assert', () => {
    // A pinned source check, the only seam two languages have: when the expectations of the POSIX test change, this one
    // says that the scenarios above have to follow.
    const posix = readFileSync(new URL('../../../../firmware/lib/zplc_core/tests/test_native_runtime_session.c', import.meta.url), 'utf8');
    for (const fragment of [
      '"\\"retain\\":{\\"reason\\":\\"none\\",\\"restored\\":false,\\"sequence\\":0,\\"saves\\":0,"',
      '\\"sequence\\":1,\\"saves\\":1,\\"save_errors\\":0,\\"saved_at_ms\\":300}',
      '\\"reason\\":\\"restored\\",\\"restored\\":true,\\"sequence\\":1,',
      '\\"reason\\":\\"identity_mismatch\\",\\"restored\\":false,',
      '\\"sequence\\":1,\\"saves\\":1,\\"save_errors\\":0,\\"saved_at_ms\\":1000}',
      '\\"retain\\":{\\"reason\\":\\"reset\\",\\"restored\\":false,\\"sequence\\":2,',
    ]) {
      expect(posix).toContain(fragment);
    }
  });
});

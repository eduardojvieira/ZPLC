// The serial adapter over the framed device link against the real native runtime (COM-019 to COM-025, COM-028,
// COM-029): the text shell of a device is a bridge in this test (`zplc link <hex>` becomes the raw frames the
// runtime reads, and what it writes comes back as `ZF:<hex>` lines), so the engine and the program store are the
// real ones and the adapter, the transport and the router are Studio's.
import { afterEach, describe, expect } from 'bun:test';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ZPLC_CONSTANTS, compileToBinary } from '@zplc/compiler';

import type { SerialConnection } from '../uploader/webserial';
import { itNative, nativeRuntimeBinary } from '../cli/nativeRuntimeGuard';
import { FramedSerialAdapter } from './framedSerialAdapter';
import { MemoryAccessError } from './memoryAccess';
import { bytesToLowerHex, hexToBytes } from './link/shellTransport';

const SYS_INFO = {
  board: 'native_sim', board_profile: 'native_sim/native', zplc_version: '2.0.0-rc.3', zephyr_version: '4.0.0', uptime_ms: 1,
  cpu_freq_mhz: 1, device_protocol_version: 1, bytecode_abi_major: ZPLC_CONSTANTS.VERSION_MAJOR, bytecode_abi_minor: ZPLC_CONSTANTS.VERSION_MINOR,
  draft_counter: ZPLC_CONSTANTS.DRAFT_COUNTER, capabilities: { fpu: true, mpu: true, scheduler: true, max_tasks: 4 },
  memory: { work_size: 8192, retain_size: 4096, ipi_size: 4096, opi_size: 4096, code_size: 45056, max_artifact_size: 45056 },
};

interface Bridge {
  connection: SerialConnection;
  transcript: string[];
  child: ChildProcessWithoutNullStreams | null;
  stop(): Promise<void>;
}

const roots: string[] = [];
const bridges: Bridge[] = [];

/** `withLink` false is a firmware that has the text shell only: it does not know `zplc link`. */
async function bridge(withLink: boolean): Promise<Bridge> {
  const transcript: string[] = [];
  const listeners = new Set<(chunk: string) => void>();
  let child: ChildProcessWithoutNullStreams | null = null;
  const connection = {
    _rxBuffer: '', isConnected: true, port: { close: async () => undefined } as unknown as SerialPort,
    _dataListeners: listeners, _reader: null, _readerTask: null,
    writer: {
      releaseLock: () => undefined,
      write: async (data: Uint8Array) => {
        for (const raw of new TextDecoder().decode(data).split(/\r?\n/)) {
          const line = raw.trim();
          if (line === '') continue;
          transcript.push(line);
          const deliver = (text: string) => { connection._rxBuffer += text; listeners.forEach((listener) => listener(text)); };
          if (line.startsWith('zplc link ') && withLink && child) {
            child.stdin.write(hexToBytes(line.slice('zplc link '.length)));
          } else if (line.startsWith('zplc sys info')) {
            deliver(`${JSON.stringify(SYS_INFO)}\r\n`);
          } else if (line.startsWith('zplc link ')) {
            deliver('Unknown command: link\r\n');
          } else {
            deliver('OK: accepted\r\n');
          }
        }
      },
    },
  } as unknown as SerialConnection;
  if (withLink) {
    const root = await mkdtemp(join(tmpdir(), 'zplc-framed-adapter-'));
    roots.push(root);
    child = spawn(nativeRuntimeBinary, ['--device-link'], { env: { ...process.env, ZPLC_PERSIST_ROOT: root }, stdio: ['pipe', 'pipe', 'pipe'] });
    child.stderr.on('data', () => undefined);
    child.stdout.on('data', (chunk: Buffer) => {
      // a frame that the device writes is a line of the shell, after a newline
      const text = `\nZF:${bytesToLowerHex(new Uint8Array(chunk))}\n`;
      connection._rxBuffer += text;
      listeners.forEach((listener) => listener(text));
    });
  }
  const made: Bridge = {
    connection, transcript, child,
    stop: async () => { if (child) { child.stdin.end(); await new Promise((resolve) => { child!.once('close', resolve); setTimeout(() => child!.kill('SIGTERM'), 500).unref(); }); } },
  };
  bridges.push(made);
  return made;
}

afterEach(async () => {
  for (const made of bridges.splice(0)) await made.stop();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function connected(made: Bridge): Promise<FramedSerialAdapter> {
  const adapter = new FramedSerialAdapter();
  const internals = adapter as unknown as { connection: SerialConnection; _connected: boolean; negotiate: () => Promise<void> };
  internals.connection = made.connection;
  internals._connected = true;
  await internals.negotiate();
  return adapter;
}

const program = (): Uint8Array =>
  new Uint8Array(compileToBinary('PROGRAM Adapter\nVAR counter : DINT; END_VAR\n counter := counter + 1;\nEND_PROGRAM\n').zplcFile);

describe('the serial adapter on firmware that speaks the link', () => {
  itNative('recognises it, writes whole values, forces and releases them, and reports a refused range before any frame', async () => {
    const made = await bridge(true);
    const adapter = await connected(made);
    expect(adapter.framed).toBe(true);
    expect(adapter.firmware).toMatchObject({ action: 'use-link', features: { sessions: true, atomicWrite: true, events: true, checkedDownload: true } });
    expect(adapter.linkStatus()).toMatchObject({ source: 'events', label: 'state pushed by the device' });

    await adapter.pokeN(0x2010, new Uint8Array([0x78, 0x56, 0x34, 0x12]));
    expect([...(await adapter.peek(0x2010, 4))]).toEqual([0x78, 0x56, 0x34, 0x12]);
    // no `poke` command of the text shell: one frame did it
    expect(made.transcript.some((line) => /zplc dbg poke/.test(line))).toBe(false);

    await adapter.forceValue(0x2020, new Uint8Array([0xaa, 0xbb]));
    expect(await adapter.listForcedValues()).toEqual([{ path: '0x2020', address: 0x2020, size: 2, type: 'WORD', bytesHex: 'AABB', state: 'forced' }]);
    await adapter.clearForcedValue(0x2020);
    expect(await adapter.listForcedValues()).toEqual([]);

    const before = made.transcript.length;
    await expect(adapter.pokeN(0x3ffe, new Uint8Array(4))).rejects.toBeInstanceOf(MemoryAccessError);
    await expect(adapter.pokeN(0x1000, new Uint8Array(1))).rejects.toThrow('written by the program');
    expect(made.transcript.length).toBe(before);
    await expect(adapter.pokeN(0x2000, new Uint8Array(600))).rejects.toThrow('does not fit one frame');
    await adapter.disconnect().catch(() => undefined);
  });

  itNative('downloads a program with progress and a read-back, runs and stops it, and is told the state', async () => {
    const made = await bridge(true);
    const adapter = await connected(made);
    const states: string[] = [];
    adapter.setEventHandlers({ onStateChange: (state) => states.push(state) });
    const trace: string[] = [];
    await adapter.loadProgram(program(), { trace: (event) => trace.push(`${event.kind}: ${event.message}`) });
    expect(trace[0]).toContain('over the device link');
    expect(trace.at(-1)).toContain('The device holds');
    await adapter.start();
    expect(adapter.state).toBe('running');
    await adapter.stop();
    expect(adapter.state).toBe('idle');
    expect(states).toContain('running');
    expect(made.transcript.filter((line) => line.startsWith('zplc load') || line.startsWith('zplc data'))).toEqual([]);
    await adapter.disconnect().catch(() => undefined);
  });

  itNative('breakpoints go through the link and come back from the device', async () => {
    const made = await bridge(true);
    const adapter = await connected(made);
    await adapter.loadProgram(program());
    expect(await adapter.setBreakpoint(2)).toBe(true);
    expect(await adapter.getBreakpoints()).toEqual([2]);
    expect(await adapter.removeBreakpoint(2)).toBe(true);
    await adapter.disconnect().catch(() => undefined);
  });
});

describe('the serial adapter on firmware that speaks only the text shell', () => {
  itNative('says so, says what to install, and keeps writing as the text shell does', async () => {
    const made = await bridge(false);
    const adapter = await connected(made);
    expect(adapter.framed).toBe(false);
    expect(adapter.firmware).toMatchObject({ action: 'use-shell-and-offer-update', protocol: { kind: 'shell-only' } });
    expect(adapter.firmware?.message).toContain('Install the firmware of release');
    expect(adapter.linkStatus().label).toContain('polled');
    await adapter.pokeN(0x2010, new Uint8Array([1, 2]));
    expect(made.transcript.filter((line) => /zplc dbg poke/.test(line))).toHaveLength(2); // one byte at a time, as before
    await adapter.disconnect().catch(() => undefined);
  });
});

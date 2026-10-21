/**
 * A device for the journeys that deploy (LNG-001): the real native runtime in its `--device-link` mode behind the text shell
 * of a board, reached through a WebSerial port that the page is given in place of a physical one. The page's own serial
 * code, handshake, deploy preflight and dialog run unchanged; only the wire is replaced. There is no serial port, no adapter
 * and no board: the "device" is a child process of the journey, and nothing outside the machine is touched.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ZPLC_CONSTANTS } from '@zplc/compiler';
import { getBoardIoIdentity, getZephyrBoardTarget } from '../src/config/boardProfiles';
import { FrameDecoder, KIND } from '../src/runtime/link/frame';
import { decodeEvent, decodeResponse, eventNameOf, messageNameOf } from '../src/runtime/link/messages';
import { bytesToLowerHex, hexToBytes } from '../src/runtime/link/shellTransport';
import type { App } from './journeyApp';

export interface EmulatedDevice {
  /** The shell lines the page wrote, in order. */
  readonly transcript: string[];
  stop(): void;
}

/** What the text shell of `board` answers to `zplc sys info --json`: the identity the deploy preflight compares. */
function systemInfo(board: string): Record<string, unknown> {
  const profile = getZephyrBoardTarget(board);
  const io = getBoardIoIdentity(board);
  if (!profile || !io) throw new Error(`The board ${board} has no profile or no I/O description to emulate.`);
  return {
    board: profile.split('/')[0],
    board_profile: profile,
    zplc_version: '2.0.0',
    zephyr_version: '4.0.0',
    uptime_ms: 1,
    cpu_freq_mhz: 1,
    device_protocol_version: 1,
    bytecode_abi_major: ZPLC_CONSTANTS.VERSION_MAJOR,
    bytecode_abi_minor: ZPLC_CONSTANTS.VERSION_MINOR,
    draft_counter: ZPLC_CONSTANTS.DRAFT_COUNTER,
    capabilities: { fpu: true, mpu: true, scheduler: true, max_tasks: 4 },
    memory: { work_size: 8192, retain_size: 4096, ipi_size: 4096, opi_size: 4096, code_size: 45056, max_artifact_size: 45056 },
    io: { schema: 1, board_id: io.boardId, hash: io.hash, channels: 0, input_bytes: io.inputBytes, output_bytes: io.outputBytes },
  };
}

/** Starts the device and gives the page a serial port to it, as the one `navigator.serial.requestPort()` returns. */
export async function attachEmulatedDevice(app: App, runtime: string, board: string): Promise<EmulatedDevice> {
  const persist = mkdtempSync(join(tmpdir(), 'zplc-emulated-device-'));
  const child: ChildProcessWithoutNullStreams = spawn(runtime, ['--device-link'], {
    env: { ...process.env, ZPLC_PERSIST_ROOT: persist },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  child.stderr.on('data', () => undefined);
  const transcript: string[] = [];
  const info = JSON.stringify(systemInfo(board));
  const toPage = (text: string) => {
    void app.eval(`window.__emulatedDevicePush(${JSON.stringify(text)})`).catch(() => undefined);
  };
  // what the runtime says of its own state, read from the frames it writes: the text `zplc status` of the shell must tell the same
  let state = 'idle';
  let cycles = 0;
  const frames = new FrameDecoder();
  const NAMES = ['idle', 'running', 'paused', 'error'];
  // a frame the device writes is a line of the shell, after a newline
  child.stdout.on('data', (chunk: Buffer) => {
    const bytes = new Uint8Array(chunk);
    for (const frame of frames.push(bytes)) {
      if (frame.kind === KIND.EVENT && eventNameOf(frame.message) === 'EVT_STATUS') {
        const values = decodeEvent('EVT_STATUS', frame.payload);
        state = NAMES[values.state] ?? 'error';
        cycles = values.cycles;
      } else if (frame.kind === KIND.RESPONSE) {
        const name = messageNameOf(frame.message);
        const answer = name === null ? null : decodeResponse(name, frame.payload);
        const values = answer?.ok ? (answer.values as { state?: number; cycles?: number }) : null;
        if (typeof values?.state === 'number') state = NAMES[values.state] ?? 'error';
        if (typeof values?.cycles === 'number') cycles = values.cycles;
      }
    }
    toPage(`\nZF:${bytesToLowerHex(bytes)}\n`);
  });
  await app.cdp.command('Runtime.addBinding', { name: '__emulatedDeviceWrite' });
  app.cdp.on('Runtime.bindingCalled', (params) => {
    const { name, payload } = params as { name?: string; payload?: string };
    if (name !== '__emulatedDeviceWrite' || payload === undefined) return;
    for (const raw of payload.split(/\r?\n/)) {
      const line = raw.trim();
      if (line === '') continue;
      transcript.push(line);
      if (line.startsWith('zplc link ')) child.stdin.write(hexToBytes(line.slice('zplc link '.length)));
      else if (line.startsWith('zplc sys info')) toPage(`${info}\r\n`);
      else if (line.startsWith('zplc status')) toPage(`${JSON.stringify({ state, uptime_ms: 1, stats: { cycles }, opi: [0] })}\r\n`);
      else toPage('OK: accepted\r\n');
    }
  });
  await app.eval(
    `(() => {
    const encoder = new TextEncoder(); const decoder = new TextDecoder(); let controller;
    const readable = new ReadableStream({ start(c) { controller = c; } });
    window.__emulatedDevicePush = (text) => controller.enqueue(encoder.encode(text));
    const writable = new WritableStream({ write(chunk) { window.__emulatedDeviceWrite(decoder.decode(chunk)); } });
    const port = { readable, writable, open: async () => undefined, close: async () => undefined, getInfo: () => ({ usbVendorId: 0x2e8a, ` +
      `usbProductId: 0x000a }) };
    Object.defineProperty(navigator, 'serial', { configurable: true, value: { requestPort: async () => port, getPorts: async () => ` +
      `[port], addEventListener() {}, removeEventListener() {} } });
  })()`,
  );
  return {
    transcript,
    stop: () => {
      child.stdin.end();
      setTimeout(() => child.kill('SIGTERM'), 500).unref();
      rmSync(persist, { recursive: true, force: true });
    },
  };
}

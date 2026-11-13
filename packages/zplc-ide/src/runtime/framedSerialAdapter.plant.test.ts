// The plant board port of the framed adapter (LNK-012, COM-025), on a scripted device behind the text shell bridge.
import { describe, expect, it } from 'bun:test';

import type { SerialConnection } from '../uploader/webserial';
import { FramedSerialAdapter } from './framedSerialAdapter';
import { KIND, beginFrame, finishFrame, parseFrame } from './link/frame';
import { encodeResponse } from './link/messages';
import { CAPABILITY, EVENT_MASK, MESSAGES } from './link/protocol.generated';
import { bytesToLowerHex, hexToBytes } from './link/shellTransport';

const byId = new Map<number, string>(Object.entries(MESSAGES).map(([name, spec]) => [spec.id, name]));

interface Fake {
  adapter: FramedSerialAdapter;
  log: string[];
  /** Hold the answer to the next PLANT_FRAME until `release()`. */
  hold(): { release(): void };
  push(message: number, payload: Uint8Array): void;
  /** The mask of the EVENTS_SET the adapter sent. */
  eventMask: number | null;
}

/** `capabilities` null is a text-shell firmware: it does not know `zplc link`. */
async function connect(capabilities: number | null): Promise<Fake> {
  const log: string[] = [];
  const listeners = new Set<(chunk: string) => void>();
  let held: Promise<void> | null = null;
  let eventSequence = 1;
  let eventMask: number | null = null;
  const deliver = (text: string) => {
    connection._rxBuffer += text;
    listeners.forEach((listener) => listener(text));
  };
  const reply = (message: number, sequence: number, payload: Uint8Array) =>
    deliver(`\nZF:${bytesToLowerHex(finishFrame(beginFrame(KIND.RESPONSE, message, sequence, payload)))}\n`);
  const answer = (name: string): Uint8Array => {
    switch (name) {
      case 'HELLO':
        return encodeResponse('HELLO', {
          version: 1,
          transport: 0,
          max_payload: 512,
          capabilities: capabilities!,
          session_state: 0,
          key_provisioned: 0,
          idle_timeout_s: 30,
          signature_required: 0,
        });
      case 'SESSION_OPEN':
        return encodeResponse('SESSION_OPEN', { session_id: 1, idle_timeout_s: 30, authenticated: 0 });
      case 'MEM_READ':
        return encodeResponse('MEM_READ', { data: new Uint8Array([0]) });
      case 'PLANT_MIRROR':
        return Uint8Array.from([0, 1]);
      case 'PLANT_FRAME':
        return encodeResponse('PLANT_FRAME', { applied_seq: 1, scans: 1, flags: 0, late: 0, rejected: 0, values: new Uint8Array([0]) });
      default:
        return new Uint8Array([0]);
    }
  };
  const connection = {
    _rxBuffer: '',
    isConnected: true,
    port: { close: async () => undefined } as unknown as SerialPort,
    _dataListeners: listeners,
    _reader: null,
    _readerTask: null,
    writer: {
      releaseLock: () => undefined,
      write: async (data: Uint8Array) => {
        for (const raw of new TextDecoder().decode(data).split(/\r?\n/)) {
          const line = raw.trim();
          if (line === '') continue;
          if (line.startsWith('zplc link ') && capabilities !== null) {
            const parsed = parseFrame(hexToBytes(line.slice('zplc link '.length)));
            if (!('frame' in parsed)) throw new Error('bad frame from the adapter');
            const { frame } = parsed;
            const name = byId.get(frame.message) ?? `#${frame.message}`;
            log.push(`${name}:in`);
            if (name === 'EVENTS_SET') eventMask = new DataView(frame.payload.buffer, frame.payload.byteOffset).getUint32(0, true);
            const wait = name === 'PLANT_FRAME' ? held : null;
            held = name === 'PLANT_FRAME' ? null : held;
            void (wait ?? Promise.resolve()).then(() => {
              log.push(`${name}:out`);
              reply(frame.message, frame.sequence, answer(name));
            });
          } else if (line.startsWith('zplc sys info')) {
            deliver(
              `${JSON.stringify({
                board: 'b',
                board_profile: 'b/p',
                zplc_version: '2.1.0',
                zephyr_version: '4.0.0',
                uptime_ms: 1,
                cpu_freq_mhz: 1,
                device_protocol_version: 1,
                bytecode_abi_major: 1,
                bytecode_abi_minor: 0,
                draft_counter: 0,
                capabilities: { fpu: true, mpu: true, scheduler: true, max_tasks: 4 },
                memory: { work_size: 8192, retain_size: 4096, ipi_size: 4096, opi_size: 4096, code_size: 45056, max_artifact_size: 45056 },
              })}\r\n`,
            );
          } else if (line.startsWith('zplc sys io')) {
            deliver('{}\r\n');
          } else if (line.startsWith('zplc link ')) {
            deliver('Unknown command: link\r\n');
          } else {
            deliver('OK: accepted\r\n');
          }
        }
      },
    },
  } as unknown as SerialConnection;
  const adapter = new FramedSerialAdapter();
  adapter.linkRequestTimeoutMs = 200; // the scripted device answers at once; the text shell never does
  const internals = adapter as unknown as { connection: SerialConnection; _connected: boolean; negotiate: () => Promise<void> };
  internals.connection = connection;
  internals._connected = true;
  await internals.negotiate();
  return {
    adapter,
    log,
    get eventMask() {
      return eventMask;
    },
    hold() {
      let release = () => undefined as void;
      held = new Promise<void>((resolve) => (release = resolve));
      return { release };
    },
    push: (message, payload) =>
      deliver(`\nZF:${bytesToLowerHex(finishFrame(beginFrame(KIND.EVENT, message, eventSequence++, payload)))}\n`),
  };
}

describe('FramedSerialAdapter.plantBoardPort (LNK-012, COM-025)', () => {
  it('supported() is false for a text-shell firmware and for a framed firmware without the bit', async () => {
    expect((await connect(null)).adapter.plantBoardPort().supported()).toBe(false);
    expect((await connect(CAPABILITY.EVENTS)).adapter.plantBoardPort().supported()).toBe(false);
    expect((await connect(CAPABILITY.EVENTS | CAPABILITY.PLANT)).adapter.plantBoardPort().supported()).toBe(true);
  }, 20_000);

  it('connecting does not enter the mode: nothing plant is sent until a person calls the port (LNK-008)', async () => {
    const { log } = await connect(CAPABILITY.EVENTS | CAPABILITY.PLANT);
    expect(log.filter((entry) => entry.startsWith('PLANT'))).toEqual([]);
  });

  it('the port methods go through the adapter discipline: a frame in flight is not interleaved with another request', async () => {
    const fake = await connect(CAPABILITY.EVENTS | CAPABILITY.PLANT);
    const port = fake.adapter.plantBoardPort();
    const gate = fake.hold();
    fake.log.length = 0;
    const frame = port.frame(1, 1, new Uint8Array([0]));
    const read = fake.adapter.peek(0x2000, 1);
    await new Promise((resolve) => setTimeout(resolve, 30));
    // the session opened for the change, then the frame went out; the read waits for the answer
    expect(fake.log).toEqual(['SESSION_OPEN:in', 'SESSION_OPEN:out', 'PLANT_FRAME:in']);
    gate.release();
    await Promise.all([frame, read]);
    expect(fake.log.slice(-4)).toEqual(['PLANT_FRAME:in', 'PLANT_FRAME:out', 'MEM_READ:in', 'MEM_READ:out']);
  });

  it('mirror goes through and onExit hears EVT_PLANT_EXIT once with the reason name', async () => {
    const fake = await connect(CAPABILITY.EVENTS | CAPABILITY.PLANT);
    const port = fake.adapter.plantBoardPort();
    expect(await port.mirror(true)).toBe(true);
    const heard: unknown[] = [];
    const off = port.onExit((event) => heard.push(event));
    fake.push(136, Uint8Array.from([1, 0xd2, 4, 0, 0]));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(heard).toEqual([{ reason: 'TIMEOUT', frames: 1234 }]);
    off();
  });

  it('asks for plant events only when the firmware has the bit', async () => {
    for (const [caps, expected] of [
      [CAPABILITY.EVENTS | CAPABILITY.PLANT, true],
      [CAPABILITY.EVENTS, false],
    ] as const) {
      const fake = await connect(caps);
      expect(fake.eventMask !== null && (fake.eventMask & EVENT_MASK.PLANT) !== 0).toBe(expected);
    }
  });
});

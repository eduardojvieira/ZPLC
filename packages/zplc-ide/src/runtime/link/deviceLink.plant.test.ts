// The plant I/O calls of the device link against the byte-exact payloads of tools/contract/plant_vectors.json (LNK-012).
import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { DeviceLink, LinkError, type LinkEvent, type LinkTransport } from './deviceLink';
import { KIND, beginFrame, finishFrame, parseFrame } from './frame';
import { encodeResponse, encodeErrorResponse } from './messages';
import { CAPABILITY, ERROR, MESSAGES } from './protocol.generated';

interface Vector {
  name: string;
  payload: string;
}
const vectors = new Map<string, Uint8Array>(
  (JSON.parse(readFileSync(join(import.meta.dir, '../../../../../tools/contract/plant_vectors.json'), 'utf8')).vectors as Vector[]).map(
    (v) => [v.name, Uint8Array.from(Buffer.from(v.payload, 'hex'))],
  ),
);
const vector = (name: string): Uint8Array => vectors.get(name)!;

/** A scripted device: `answer` maps a request (message id, payload) to a response payload. */
function device(answer: (message: number, payload: Uint8Array) => Uint8Array) {
  const sent: Array<{ message: number; payload: Uint8Array }> = [];
  let receive: (bytes: Uint8Array) => void = () => undefined;
  const transport: LinkTransport = {
    write(bytes) {
      const parsed = parseFrame(bytes);
      if (!('frame' in parsed)) throw new Error('the link wrote a bad frame');
      const { frame } = parsed;
      sent.push({ message: frame.message, payload: frame.payload });
      const reply = finishFrame(beginFrame(KIND.RESPONSE, frame.message, frame.sequence, answer(frame.message, frame.payload)));
      queueMicrotask(() => receive(reply));
    },
    onData(handler) {
      receive = handler;
      return () => undefined;
    },
    close: () => undefined,
  };
  const push = (message: number, payload: Uint8Array) => receive(finishFrame(beginFrame(KIND.EVENT, message, 1, payload)));
  return { link: new DeviceLink(transport), sent, push };
}

const helloPayload = (capabilities: number) =>
  encodeResponse('HELLO', {
    version: 1,
    transport: 0,
    max_payload: 512,
    capabilities,
    session_state: 0,
    key_provisioned: 0,
    idle_timeout_s: 30,
    signature_required: 0,
  });

const byName = new Map<number, string>(Object.entries(MESSAGES).map(([name, spec]) => [spec.id, name]));

describe('deviceLink plant (LNK-012)', () => {
  it('hello with bit 12 has(PLANT) is true and without is false', async () => {
    const withBit = device(() => helloPayload(CAPABILITY.PLANT | CAPABILITY.EVENTS));
    await withBit.link.hello();
    expect(withBit.link.has('PLANT')).toBe(true);
    const without = device(() => helloPayload(CAPABILITY.EVENTS));
    await without.link.hello();
    expect(without.link.has('PLANT')).toBe(false);
  });

  it(
    'plantEnter, plantFrame, plantExit, plantMirror, plantStatus encode the payloads of plant_vectors.json byte for byte and decode the ' +
      'responses',
    async () => {
      const answers: Record<string, string> = {
        PLANT_ENTER: 'plant_enter_response',
        PLANT_FRAME: 'plant_frame_response',
        PLANT_EXIT: 'plant_exit_response',
        PLANT_MIRROR: 'plant_mirror_response',
        PLANT_STATUS: 'plant_status_response',
      };
      const { link, sent } = device((message) => vector(answers[byName.get(message)!]!));

      const grant = await link.plantEnter({
        timeoutMs: 500,
        inputs: [
          { offset: 0, type: 'BOOL', bit: 0 },
          { offset: 0, type: 'BOOL', bit: 1 },
          { offset: 1, type: 'BOOL', bit: 7 },
          { offset: 2, type: 'INT' },
          { offset: 4, type: 'REAL' },
        ],
        outputs: [
          { offset: 0, type: 'BOOL', bit: 0 },
          { offset: 0, type: 'BOOL', bit: 3 },
        ],
      });
      expect(grant).toEqual({ plantId: 1, inBytes: 7, outBytes: 1, maxSlots: 32, timeoutMs: 500 });

      const frame = await link.plantFrame(1, 258, vector('plant_frame_request').subarray(6));
      expect(frame).toMatchObject({ appliedSeq: 258, scans: 1000, flags: 1, late: 3, rejected: 1 });
      expect([...frame.values]).toEqual([0x02]);

      expect(await link.plantMirror(true)).toBe(true);
      expect(await link.plantStatus()).toEqual({ active: true, plantId: 1, mirror: true, frames: 1234, late: 3, rejected: 1, ageMs: 20 });
      expect(await link.plantExit()).toEqual({ reason: 'CLOSED', frames: 1234, late: 3, rejected: 1 });

      expect(sent.map((s) => byName.get(s.message))).toEqual(['PLANT_ENTER', 'PLANT_FRAME', 'PLANT_MIRROR', 'PLANT_STATUS', 'PLANT_EXIT']);
      expect(sent[0]!.payload).toEqual(vector('plant_enter_request'));
      expect(sent[1]!.payload).toEqual(vector('plant_frame_request'));
      expect(sent[2]!.payload).toEqual(vector('plant_mirror_request'));
      expect(sent[3]!.payload).toEqual(vector('plant_exit_request'));
      expect(sent[4]!.payload).toEqual(vector('plant_exit_request'));
    },
  );

  it('an ERR_BAD_REQUEST frame response raises LinkError with the error name', async () => {
    const { link } = device(() => encodeErrorResponse(ERROR.BAD_REQUEST));
    const error = await link.plantFrame(1, 1, new Uint8Array(0)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LinkError);
    expect((error as LinkError).errorName).toBe('BAD_REQUEST');
  });

  it('EVT_PLANT_EXIT reaches the listener once with the reason', async () => {
    const { link, push } = device(() => new Uint8Array([0]));
    const seen: LinkEvent[] = [];
    link.onEvent((event) => seen.push(event));
    push(136, vector('plant_exit_event'));
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(seen).toHaveLength(1);
    expect(seen[0]!.name).toBe('EVT_PLANT_EXIT');
    expect(seen[0]!.values).toEqual({ reason: 1, frames: 1234 } as never);
  });

  it('refuses a slot it cannot encode before sending anything', async () => {
    const { link, sent } = device(() => new Uint8Array([0]));
    await expect(link.plantEnter({ timeoutMs: 500, inputs: [{ offset: 0, type: 'BOOL', bit: 8 }], outputs: [] })).rejects.toThrow(
      RangeError,
    );
    expect(sent).toHaveLength(0);
  });
});

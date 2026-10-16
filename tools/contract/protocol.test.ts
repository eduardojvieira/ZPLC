// The TypeScript codec of the device link against the frames generated from tools/contract/protocol.json (COM-019).
//
//   bun test ./tools/contract
//
// golden/protocol-vectors.json is written by tools/contract/generate_protocol.py, with its own encoder and decoder.
// The C codec of the firmware runs the same frames (firmware/lib/zplc_core/tests/test_proto_codec.c). Every stream
// is also fed one byte at a time: where the bytes are cut must not change what comes out.
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import { FrameDecoder, PARSE_ERROR, beginFrame, encodeFrame, finishFrame, parseFrame } from '../../packages/zplc-ide/src/runtime/link/frame.ts';
import { decodeFields, decodeResponse, encodeFields, errorName } from '../../packages/zplc-ide/src/runtime/link/messages.ts';
import { ERROR, EVENTS, LIMITS, MESSAGES, type FieldSpec } from '../../packages/zplc-ide/src/runtime/link/protocol.generated.ts';

interface VectorFrame {
  name: string; kind: number; message: number; sequence: number; auth: boolean; payload: string; wire: string;
  fields: Record<string, number | string>;
}
interface SignatureCase { name: string; public: string; message: string; signature: string; valid: boolean }
interface VectorStream {
  name: string; hex: string; delivered: string[];
  counters: { crc_errors: number; version_errors: number; malformed: number; oversize: number; resyncs: number };
}
const vectors = JSON.parse(readFileSync(new URL('./golden/protocol-vectors.json', import.meta.url), 'utf8')) as {
  payloadMax: number; keyHex: string; frames: VectorFrame[]; streams: VectorStream[]; signatures: SignatureCase[];
};
const bytes = (hex: string) => Uint8Array.from(Buffer.from(hex, 'hex'));
const hex = (data: Uint8Array) => Buffer.from(data).toString('hex');

function fieldsOf(frame: VectorFrame): readonly FieldSpec[] | null {
  const base = frame.name.replace(/_(request|response|event)(_authenticated)?$/, '').toUpperCase();
  if (frame.kind === 2) return (EVENTS as Record<string, { fields: readonly FieldSpec[] }>)[base]?.fields ?? null;
  const spec = (MESSAGES as Record<string, { request: readonly FieldSpec[]; response: readonly FieldSpec[] }>)[base];
  if (!spec) return null;
  return frame.kind === 0 ? spec.request : spec.response;
}

describe('the frames the generator wrote, in TypeScript (COM-019)', () => {
  test('there is a request and a response of every message and an event of every event', () => {
    for (const name of Object.keys(MESSAGES)) {
      expect(vectors.frames.some((frame) => frame.name === `${name.toLowerCase()}_request`)).toBe(true);
      expect(vectors.frames.some((frame) => frame.name === `${name.toLowerCase()}_response`)).toBe(true);
    }
    for (const name of Object.keys(EVENTS)) expect(vectors.frames.some((frame) => frame.name === `${name.toLowerCase()}_event`)).toBe(true);
  });

  for (const vector of vectors.frames) {
    test(`${vector.name}: parse, then encode to the same bytes`, () => {
      const parsed = parseFrame(bytes(vector.wire), vectors.payloadMax);
      if (!('frame' in parsed)) throw new Error(`not a frame: ${parsed.error}`);
      const { frame } = parsed;
      expect(frame.kind).toBe(vector.kind);
      expect(frame.message).toBe(vector.message);
      expect(frame.sequence).toBe(vector.sequence);
      expect(frame.authenticated).toBe(vector.auth);
      expect(hex(frame.payload)).toBe(vector.payload);
      const again = finishFrame(beginFrame(frame.kind, frame.message, frame.sequence, frame.payload, frame.authenticated), frame.mac ?? undefined);
      expect(hex(again)).toBe(vector.wire);
      if (!vector.auth) expect(hex(encodeFrame(frame.kind, frame.message, frame.sequence, frame.payload))).toBe(vector.wire);
    });

    test(`${vector.name}: the fields of the payload are the ones the generator used`, () => {
      const fields = fieldsOf(vector);
      if (fields === null || Object.keys(vector.fields).length === 0) return;
      const status = vector.kind === 1 ? 1 : 0;
      const decoded = decodeFields(fields, bytes(vector.payload), status);
      for (const [name, expected] of Object.entries(vector.fields)) {
        const got = decoded[name];
        expect(got instanceof Uint8Array ? hex(got) : got).toBe(expected);
      }
      const body = encodeFields(fields, decoded);
      expect(hex(body)).toBe(vector.payload.slice(status * 2));
    });
  }

  test('an error response carries the range of the access', () => {
    const vector = vectors.frames.find((frame) => frame.name === 'mem_write_range_error')!;
    const decoded = decodeResponse('MEM_WRITE', bytes(vector.payload));
    expect(decoded.ok).toBe(false);
    if (!decoded.ok) {
      expect(decoded.status).toBe(ERROR.RANGE);
      expect(decoded.error).toBe('RANGE');
      expect(decoded.range).toEqual({ address: 0x4ffe, length: 4, regionStart: 0x4000, regionEnd: 0x5000 });
    }
    expect(errorName(ERROR.NO_SESSION)).toBe('NO_SESSION');
  });
});

describe('the streams the generator wrote, whole and byte by byte (COM-019)', () => {
  for (const stream of vectors.streams) {
    const run = (chunks: Uint8Array[]) => {
      const decoder = new FrameDecoder(vectors.payloadMax);
      const delivered: string[] = [];
      for (const chunk of chunks) {
        for (const frame of decoder.push(chunk)) {
          const wire = hex(finishFrame(beginFrame(frame.kind, frame.message, frame.sequence, frame.payload, frame.authenticated), frame.mac ?? undefined));
          delivered.push(vectors.frames.find((vector) => vector.wire === wire)?.name ?? 'stream:?');
        }
      }
      return { delivered, counters: decoder.counters };
    };
    const expectCounters = (counters: ReturnType<typeof run>['counters']) => {
      expect(counters.crcErrors).toBe(stream.counters.crc_errors);
      expect(counters.versionErrors).toBe(stream.counters.version_errors);
      expect(counters.malformed).toBe(stream.counters.malformed);
      expect(counters.oversize).toBe(stream.counters.oversize);
      expect(counters.resyncs).toBe(stream.counters.resyncs);
    };

    test(`${stream.name}: whole`, () => {
      const result = run([bytes(stream.hex)]);
      expect(result.delivered).toEqual(stream.delivered);
      expectCounters(result.counters);
    });

    test(`${stream.name}: one byte at a time`, () => {
      const data = bytes(stream.hex);
      const result = run(Array.from(data, (byte) => new Uint8Array([byte])));
      expect(result.delivered).toEqual(stream.delivered);
      expectCounters(result.counters);
    });
  }
});

describe('parseFrame names why a buffer is not a frame (COM-019)', () => {
  const good = bytes(vectors.frames[0]!.wire);
  const mutate = (change: (copy: Uint8Array) => void) => {
    const copy = good.slice();
    change(copy);
    return parseFrame(copy, LIMITS.payloadMaxDefault);
  };
  test('every reason', () => {
    expect(parseFrame(good.subarray(0, good.length - 1))).toEqual({ error: PARSE_ERROR.SHORT });
    expect(parseFrame(new Uint8Array([...good, 0]))).toEqual({ error: PARSE_ERROR.LENGTH });
    expect(mutate((c) => { c[0]! ^= 0xff; })).toEqual({ error: PARSE_ERROR.SYNC });
    expect(mutate((c) => { c[2] = 2; })).toEqual({ error: PARSE_ERROR.VERSION });
    expect(mutate((c) => { c[3]! |= 0x08; })).toEqual({ error: PARSE_ERROR.MALFORMED });
    expect(mutate((c) => { c[3] = 3; })).toEqual({ error: PARSE_ERROR.MALFORMED });
    expect(parseFrame(good, 2)).toEqual({ error: PARSE_ERROR.OVERSIZE });
    expect(mutate((c) => { c[c.length - 1]! ^= 1; })).toEqual({ error: PARSE_ERROR.CRC });
    expect(mutate((c) => { c[11]! ^= 1; })).toEqual({ error: PARSE_ERROR.CRC });
  });
});

describe('the signatures the generator wrote, against the runtime Ed25519 (COM-026)', () => {
  // The vectors are computed by a Python reference of RFC 8032. The runtime's own Ed25519 (the one Studio signs with)
  // has to agree with it on every case, so the C verifier of the firmware, which the same vectors hold, is held to
  // the standard and not to one implementation.
  for (const [index, vector] of vectors.signatures.entries()) {
    test(`${index}: ${vector.name}`, async () => {
      const publicKey = bytes(vector.public);
      let accepted = false;
      try {
        const key = await globalThis.crypto.subtle.importKey('raw', publicKey, { name: 'Ed25519' }, false, ['verify']);
        accepted = await globalThis.crypto.subtle.verify({ name: 'Ed25519' }, key, bytes(vector.signature), bytes(vector.message));
      } catch {
        accepted = false; // a key that is not a point is refused at import
      }
      expect(accepted).toBe(vector.valid);
    });
  }
});

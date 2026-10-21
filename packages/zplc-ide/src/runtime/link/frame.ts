/**
 * @file frame.ts
 * @brief The frame codec of the device link protocol (COM-019): encode, parse and a stream decoder.
 *
 * The numbers come from protocol.generated.ts, which tools/contract/generate_protocol.py writes from
 * tools/contract/protocol.json, the file the C codec of the firmware (zplc_proto.c) is generated from as well.
 * Both codecs run the same generated frames (tools/contract/golden/protocol-vectors.json) and must give the same
 * bytes and the same counters. The rules of the decoder are written in protocol.json (frame.resync).
 */

import { FRAME, KIND, LIMITS, PROTOCOL_VERSION } from './protocol.generated';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index++) {
    let value = index;
    for (let bit = 0; bit < 8; bit++) value = (value & 1) !== 0 ? (0xedb88320 ^ (value >>> 1)) >>> 0 : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();

/** CRC-32/ISO-HDLC, the CRC of the artifact container and of every frame. */
export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let index = 0; index < data.length; index++) crc = (CRC_TABLE[(crc ^ data[index]!) & 0xff]! ^ (crc >>> 8)) >>> 0;
  return (crc ^ 0xffffffff) >>> 0;
}

export interface Frame {
  readonly kind: number;
  readonly message: number;
  readonly sequence: number;
  readonly authenticated: boolean;
  readonly payload: Uint8Array;
  /** The code of an authenticated frame (a copy), or null. */
  readonly mac: Uint8Array | null;
  /** The bytes the code covers: the header and the payload (a copy). */
  readonly covered: Uint8Array;
}

export const PARSE_ERROR = {
  SHORT: 'short',
  SYNC: 'sync',
  VERSION: 'version',
  MALFORMED: 'malformed',
  OVERSIZE: 'oversize',
  LENGTH: 'length',
  CRC: 'crc',
} as const;
export type ParseError = (typeof PARSE_ERROR)[keyof typeof PARSE_ERROR];

export interface DecoderCounters {
  frames: number;
  crcErrors: number;
  versionErrors: number;
  malformed: number;
  oversize: number;
  resyncs: number;
}

const HEADER = FRAME.headerBytes;
const MAC = FRAME.macBytes;
const CRC = FRAME.crcBytes;

export function frameSize(length: number, authenticated: boolean): number {
  return HEADER + length + (authenticated ? MAC : 0) + CRC;
}

/**
 * The header and the payload of a frame: the bytes a code covers. An authenticated frame has its AUTH flag set
 * already, because the flag is covered too.
 */
export function beginFrame(kind: number, message: number, sequence: number, payload: Uint8Array, authenticated = false): Uint8Array {
  if (payload.length > LIMITS.payloadMaxHard)
    throw new RangeError(`payload of ${payload.length} bytes is above the limit of ${LIMITS.payloadMaxHard}`);
  if (!Number.isInteger(sequence) || sequence < 0 || sequence > 0xffffffff) throw new RangeError('sequence is not a 32-bit number');
  const out = new Uint8Array(HEADER + payload.length);
  const view = new DataView(out.buffer);
  out[0] = FRAME.sync[0];
  out[1] = FRAME.sync[1];
  out[FRAME.offset.version] = PROTOCOL_VERSION;
  out[FRAME.offset.flags] = (kind & 0x03) | (authenticated ? FRAME.flagAuth : 0);
  out[FRAME.offset.message] = message & 0xff;
  view.setUint32(FRAME.offset.sequence, sequence, true);
  view.setUint16(FRAME.offset.length, payload.length, true);
  out.set(payload, HEADER);
  return out;
}

/** The whole frame: the covered bytes, the code (when the frame was begun authenticated) and the checksum. */
export function finishFrame(covered: Uint8Array, mac?: Uint8Array): Uint8Array {
  const authenticated = (covered[FRAME.offset.flags]! & FRAME.flagAuth) !== 0;
  if (authenticated && (mac === undefined || mac.length !== MAC))
    throw new RangeError(`an authenticated frame needs a code of ${MAC} bytes`);
  const body = new Uint8Array(covered.length + (authenticated ? MAC : 0));
  body.set(covered, 0);
  if (authenticated) body.set(mac!, covered.length);
  const out = new Uint8Array(body.length + CRC);
  out.set(body, 0);
  new DataView(out.buffer).setUint32(body.length, crc32(body), true);
  return out;
}

/** A frame that carries no code. */
export function encodeFrame(kind: number, message: number, sequence: number, payload: Uint8Array = new Uint8Array(0)): Uint8Array {
  return finishFrame(beginFrame(kind, message, sequence, payload, false));
}

type Header = { total: number } | { more: true } | { error: ParseError };

/** What the first bytes are: the size of the frame, "more bytes", or why the candidate is not a frame. */
function checkHeader(bytes: Uint8Array, available: number, payloadMax: number): Header {
  if (available >= 1 && bytes[0] !== FRAME.sync[0]) return { error: PARSE_ERROR.SYNC };
  if (available >= 2 && bytes[1] !== FRAME.sync[1]) return { error: PARSE_ERROR.SYNC };
  if (available < HEADER) return { more: true };
  if (bytes[FRAME.offset.version] !== PROTOCOL_VERSION) return { error: PARSE_ERROR.VERSION };
  const flags = bytes[FRAME.offset.flags]!;
  if ((flags & FRAME.flagsReserved) !== 0 || (flags & 0x03) === 0x03) return { error: PARSE_ERROR.MALFORMED };
  const length = bytes[FRAME.offset.length]! | (bytes[FRAME.offset.length + 1]! << 8);
  if (length > payloadMax) return { error: PARSE_ERROR.OVERSIZE };
  return { total: frameSize(length, (flags & FRAME.flagAuth) !== 0) };
}

function checksumOk(bytes: Uint8Array, total: number): boolean {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return crc32(bytes.subarray(0, total - CRC)) === view.getUint32(total - CRC, true);
}

function openFrame(bytes: Uint8Array): Frame {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const flags = bytes[FRAME.offset.flags]!;
  const length = view.getUint16(FRAME.offset.length, true);
  const authenticated = (flags & FRAME.flagAuth) !== 0;
  const coveredLength = HEADER + length;
  return {
    kind: flags & 0x03,
    message: bytes[FRAME.offset.message]!,
    sequence: view.getUint32(FRAME.offset.sequence, true),
    authenticated,
    payload: bytes.slice(HEADER, coveredLength),
    mac: authenticated ? bytes.slice(coveredLength, coveredLength + MAC) : null,
    covered: bytes.slice(0, coveredLength),
  };
}

/** One whole frame (a transport that frames its own lines). */
export function parseFrame(bytes: Uint8Array, payloadMax: number = LIMITS.payloadMaxDefault): { frame: Frame } | { error: ParseError } {
  const header = checkHeader(bytes, bytes.length, payloadMax);
  if ('error' in header) return { error: header.error };
  if ('more' in header || bytes.length < header.total) return { error: PARSE_ERROR.SHORT };
  if (bytes.length > header.total) return { error: PARSE_ERROR.LENGTH };
  if (!checksumOk(bytes, header.total)) return { error: PARSE_ERROR.CRC };
  return { frame: openFrame(bytes) };
}

/**
 * Finds frames in a byte stream. A candidate that is not valid costs its first byte and the decoder looks for the
 * next sync pair among the bytes it holds, so a frame hidden inside a damaged one is delivered and nothing after a
 * damaged frame is lost.
 */
export class FrameDecoder {
  readonly counters: DecoderCounters = { frames: 0, crcErrors: 0, versionErrors: 0, malformed: 0, oversize: 0, resyncs: 0 };
  private readonly buffer: Uint8Array;
  private fill = 0;
  private readonly payloadMax: number;

  constructor(payloadMax: number = LIMITS.payloadMaxDefault) {
    this.payloadMax = Math.min(Math.max(payloadMax, 0), LIMITS.payloadMaxHard);
    this.buffer = new Uint8Array(HEADER + this.payloadMax + MAC + CRC);
  }

  /** Forget the bytes of a frame that is being assembled (a link that was reopened). The counters stay. */
  reset(): void {
    this.fill = 0;
  }

  /** The frames the bytes complete, in order. */
  push(data: Uint8Array): Frame[] {
    const delivered: Frame[] = [];
    for (const byte of data) {
      this.buffer[this.fill++] = byte;
      for (;;) {
        if (this.fill === 0) break;
        const header = checkHeader(this.buffer, this.fill, this.payloadMax);
        if ('error' in header) {
          if (header.error !== PARSE_ERROR.SYNC) this.abandon(header.error);
          else this.discardFirst();
          continue;
        }
        if ('more' in header || this.fill < header.total) break;
        if (!checksumOk(this.buffer, header.total)) {
          this.abandon(PARSE_ERROR.CRC);
          continue;
        }
        delivered.push(openFrame(this.buffer));
        this.counters.frames++;
        this.buffer.copyWithin(0, header.total, this.fill);
        this.fill -= header.total;
      }
    }
    return delivered;
  }

  private discardFirst(): void {
    this.buffer.copyWithin(0, 1, this.fill);
    this.fill -= 1;
  }

  private abandon(reason: ParseError): void {
    if (reason === PARSE_ERROR.VERSION) this.counters.versionErrors++;
    else if (reason === PARSE_ERROR.MALFORMED) this.counters.malformed++;
    else if (reason === PARSE_ERROR.OVERSIZE) this.counters.oversize++;
    else this.counters.crcErrors++;
    this.counters.resyncs++;
    this.discardFirst();
  }
}

export { KIND };

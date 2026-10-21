/**
 * @file messages.ts
 * @brief The payloads of the device link protocol (COM-019): typed requests, responses and events, driven by the
 *        field tables of protocol.generated.ts.
 *
 * A request and an event are their fields in order; a response is a status byte (an ERROR number), then its
 * fields when the status is OK, or the detail of the error (ERROR.RANGE carries the address, the length and the
 * region of the access, COM-024).
 */

import { ERROR, EVENTS, MESSAGES, RANGE_DETAIL, type EventName, type FieldSpec, type MessageName } from './protocol.generated';

export type FieldValue<T extends string> = T extends 'u8' | 'u16' | 'u32'
  ? number
  : T extends 'tail' | `bytes:${number}`
    ? Uint8Array
    : T extends `str:${number}`
      ? string
      : never;

export type ValuesOf<F extends readonly FieldSpec[]> = { [K in F[number] as K['name']]: FieldValue<K['type']> };

export type RequestOf<N extends MessageName> = ValuesOf<(typeof MESSAGES)[N]['request']>;
export type ResponseOf<N extends MessageName> = ValuesOf<(typeof MESSAGES)[N]['response']>;
export type EventOf<N extends EventName> = ValuesOf<(typeof EVENTS)[N]['fields']>;

export class PayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PayloadError';
  }
}

function fixedSize(type: string): number | null {
  if (type === 'u8') return 1;
  if (type === 'u16') return 2;
  if (type === 'u32') return 4;
  if (type === 'tail') return null;
  const size = Number.parseInt(type.slice(type.indexOf(':') + 1), 10);
  if (!Number.isInteger(size) || size <= 0) throw new PayloadError(`unknown field type ${type}`);
  return size;
}

type Loose = Record<string, number | string | Uint8Array>;

export function encodeFields(fields: readonly FieldSpec[], values: Loose): Uint8Array {
  const parts: Uint8Array[] = [];
  for (const field of fields) {
    const value = values[field.name];
    const size = fixedSize(field.type);
    if (value === undefined) throw new PayloadError(`field ${field.name} is missing`);
    if (field.type === 'u8' || field.type === 'u16' || field.type === 'u32') {
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value >= 2 ** (8 * size!)) {
        throw new PayloadError(`field ${field.name} is not a ${field.type}`);
      }
      const bytes = new Uint8Array(size!);
      for (let index = 0; index < size!; index++) bytes[index] = Math.floor(value / 2 ** (8 * index)) & 0xff;
      parts.push(bytes);
    } else if (field.type === 'tail') {
      if (!(value instanceof Uint8Array)) throw new PayloadError(`field ${field.name} is not bytes`);
      parts.push(value);
    } else if (field.type.startsWith('bytes:')) {
      if (!(value instanceof Uint8Array) || value.length !== size) throw new PayloadError(`field ${field.name} is not ${size} bytes`);
      parts.push(value);
    } else {
      if (typeof value !== 'string' || !/^[\x20-\x7e]*$/.test(value) || value.length > size!) {
        throw new PayloadError(`field ${field.name} is not printable ASCII of at most ${size} characters`);
      }
      const bytes = new Uint8Array(size!);
      for (let index = 0; index < value.length; index++) bytes[index] = value.charCodeAt(index);
      parts.push(bytes);
    }
  }
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/**
 * Decode the fields at `start`; a payload that is shorter than the fixed fields, or has bytes after them when there is no tail, is an
 * error.
 */
export function decodeFields(fields: readonly FieldSpec[], payload: Uint8Array, start = 0): Loose {
  const out: Loose = {};
  let offset = start;
  for (const field of fields) {
    const size = fixedSize(field.type);
    if (size === null) {
      out[field.name] = payload.slice(offset);
      offset = payload.length;
      continue;
    }
    if (offset + size > payload.length) throw new PayloadError(`the payload ends inside field ${field.name}`);
    const bytes = payload.subarray(offset, offset + size);
    if (field.type === 'u8' || field.type === 'u16' || field.type === 'u32') {
      let value = 0;
      for (let index = size - 1; index >= 0; index--) value = value * 256 + bytes[index]!;
      out[field.name] = value;
    } else if (field.type.startsWith('bytes:')) {
      out[field.name] = bytes.slice();
    } else {
      let end = size;
      while (end > 0 && bytes[end - 1] === 0) end--;
      out[field.name] = String.fromCharCode(...bytes.subarray(0, end));
    }
    offset += size;
  }
  if (!fields.some((field) => field.type === 'tail') && offset !== payload.length) {
    throw new PayloadError(`the payload has ${payload.length - offset} bytes more than its fields`);
  }
  return out;
}

export function encodeRequest<N extends MessageName>(name: N, values: RequestOf<N>): Uint8Array {
  return encodeFields(MESSAGES[name].request, values as unknown as Loose);
}

export interface RangeDetail {
  readonly address: number;
  readonly length: number;
  readonly regionStart: number;
  readonly regionEnd: number;
}

export type Decoded<N extends MessageName> =
  { ok: true; status: 0; values: ResponseOf<N> } | { ok: false; status: number; error: string; range: RangeDetail | null };

const ERROR_NAMES: Record<number, string> = Object.fromEntries(Object.entries(ERROR).map(([name, value]) => [value, name]));

export function errorName(status: number): string {
  return ERROR_NAMES[status] ?? `ERROR_${status}`;
}

/** The status byte, and the fields or the detail of the error. */
export function decodeResponse<N extends MessageName>(name: N, payload: Uint8Array): Decoded<N> {
  if (payload.length < 1) throw new PayloadError('a response has no status byte');
  const status = payload[0]!;
  if (status === ERROR.OK) {
    return { ok: true, status: 0, values: decodeFields(MESSAGES[name].response, payload, 1) as unknown as ResponseOf<N> };
  }
  let range: RangeDetail | null = null;
  if (status === ERROR.RANGE && payload.length >= 1 + RANGE_DETAIL.length * 2) {
    const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
    range = {
      address: view.getUint16(1, true),
      length: view.getUint16(3, true),
      regionStart: view.getUint16(5, true),
      regionEnd: view.getUint16(7, true),
    };
  }
  return { ok: false, status, error: errorName(status), range };
}

export function encodeResponse<N extends MessageName>(name: N, values: ResponseOf<N>): Uint8Array {
  const body = encodeFields(MESSAGES[name].response, values as unknown as Loose);
  const out = new Uint8Array(1 + body.length);
  out.set(body, 1);
  return out;
}

export function encodeErrorResponse(status: number, range?: RangeDetail): Uint8Array {
  if (status === ERROR.RANGE && range !== undefined) {
    const out = new Uint8Array(1 + 8);
    const view = new DataView(out.buffer);
    out[0] = status;
    view.setUint16(1, range.address, true);
    view.setUint16(3, range.length, true);
    view.setUint16(5, range.regionStart, true);
    view.setUint16(7, range.regionEnd, true);
    return out;
  }
  return new Uint8Array([status]);
}

export function decodeEvent<N extends EventName>(name: N, payload: Uint8Array): EventOf<N> {
  return decodeFields(EVENTS[name].fields, payload) as unknown as EventOf<N>;
}

export function messageNameOf(id: number): MessageName | null {
  for (const [name, spec] of Object.entries(MESSAGES)) if (spec.id === id) return name as MessageName;
  return null;
}

export function eventNameOf(id: number): EventName | null {
  for (const [name, spec] of Object.entries(EVENTS)) if (spec.id === id) return name as EventName;
  return null;
}

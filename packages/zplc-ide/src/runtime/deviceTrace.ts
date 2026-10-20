/**
 * The per-scan I/O trace a device records (LRN-024): at the end of every scan the firmware keeps the scan's time, its number
 * in the run and the first bytes of the input and output images, and Studio reads them afterwards in chunks
 * (firmware/lib/zplc_core/include/zplc_io_trace.h). A board answers `zplc dbg trace ...` on its shell; the native runtime
 * answers `trace.*` requests with the same fields. Both are read-only for the program: arming, reading and clearing the trace
 * never write PLC memory, force, or start or stop anything.
 */

export interface DeviceTraceStatus {
  /** The device has a trace and its scheduler feeds it. */
  available: boolean;
  armed: boolean;
  /** Samples the ring holds while armed. */
  capacity: number;
  inBytes: number;
  outBytes: number;
  /** Samples kept since the arm; the next one gets this sequence number. */
  written: number;
  /** The oldest sequence number still held. */
  first: number;
  /** The most input, and output, bytes one sample holds. */
  maxIoBytes: number;
}

export interface DeviceTraceSample {
  seq: number;
  /** When the scan latched its inputs, in microseconds since the arm. */
  tUs: number;
  /** The scan's number in its run: 1 is the first scan after a start. */
  batch: number;
  inputs: Uint8Array;
  outputs: Uint8Array;
}

/** Samples from `from` on; `from` is later than asked when the ring overwrote the ones in between. */
export interface DeviceTraceChunk { from: number; next: number; samples: DeviceTraceSample[] }

export interface DeviceTrace {
  status(): Promise<DeviceTraceStatus>;
  /** Empty the trace and keep `inBytes` input and `outBytes` output bytes per scan; capacity 0 is as many as fit. */
  arm(capacity: number, inBytes: number, outBytes: number): Promise<DeviceTraceStatus>;
  read(from: number, count: number): Promise<DeviceTraceChunk>;
  clear(): Promise<DeviceTraceStatus>;
}

/** The most samples one read returns, on both devices. */
export const DEVICE_TRACE_READ_MAX = 32;

const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0;

function malformed(what: string): never {
  throw new Error(`The device sent a malformed I/O trace ${what}.`);
}

export function parseDeviceTraceStatus(value: unknown): DeviceTraceStatus {
  const record = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;
  const { available, armed, capacity, in_bytes: inBytes, out_bytes: outBytes, written, first, max_io_bytes: maxIoBytes } = record;
  if (typeof available !== 'boolean' || typeof armed !== 'boolean' || !isCount(capacity) || !isCount(inBytes) || !isCount(outBytes)
    || !isCount(written) || !isCount(first) || !isCount(maxIoBytes) || first > written) malformed('status');
  return { available, armed, capacity, inBytes, outBytes, written, first, maxIoBytes };
}

function bytesOf(hex: unknown): Uint8Array {
  if (typeof hex !== 'string' || hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) malformed('sample');
  return Uint8Array.from({ length: hex.length / 2 }, (_, index) => Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16));
}

export function parseDeviceTraceChunk(value: unknown): DeviceTraceChunk {
  const record = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;
  const { from, next, samples } = record;
  if (!isCount(from) || !isCount(next) || !Array.isArray(samples) || next !== from + samples.length) malformed('chunk');
  return {
    from, next,
    samples: samples.map((entry: unknown, index) => {
      if (!Array.isArray(entry) || entry.length !== 4 || !isCount(entry[0]) || !isCount(entry[1])) malformed('sample');
      return { seq: from + index, tUs: entry[0], batch: entry[1], inputs: bytesOf(entry[2]), outputs: bytesOf(entry[3]) };
    }),
  };
}

/** The trace of a board, over its shell: `json` sends one command and resolves with the JSON object the device printed. */
export function shellDeviceTrace(json: (command: string) => Promise<unknown>): DeviceTrace {
  return {
    status: async () => parseDeviceTraceStatus(await json('zplc dbg trace status')),
    arm: async (capacity, inBytes, outBytes) => parseDeviceTraceStatus(await json(`zplc dbg trace arm ${capacity} ${inBytes} ${outBytes}`)),
    read: async (from, count) => parseDeviceTraceChunk(await json(`zplc dbg trace dump ${from} ${Math.min(count, DEVICE_TRACE_READ_MAX)}`)),
    clear: async () => parseDeviceTraceStatus(await json('zplc dbg trace clear')),
  };
}

/** The trace of the native runtime: `request` sends one request of its session protocol and resolves with the result. */
export function nativeDeviceTrace(request: (method: string, params: Record<string, unknown>) => Promise<unknown>): DeviceTrace {
  return {
    status: async () => parseDeviceTraceStatus(await request('trace.status', {})),
    arm: async (capacity, inBytes, outBytes) => parseDeviceTraceStatus(await request('trace.arm', { capacity, in_bytes: inBytes, out_bytes: outBytes })),
    read: async (from, count) => parseDeviceTraceChunk(await request('trace.read', { from, count: Math.min(count, DEVICE_TRACE_READ_MAX) })),
    clear: async () => parseDeviceTraceStatus(await request('trace.clear', {})),
  };
}

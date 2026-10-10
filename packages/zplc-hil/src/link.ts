/**
 * The link between the HIL tools and a device (HIL-001, HIL-002).
 *
 * A link is what a tool needs from a board in its own terms: who it is, deploy a program, start and stop, read and
 * write memory, force. How that travels is the link's business: `ShellLink` speaks the firmware shell grammar over a
 * serial port, `HostRuntimeLink` speaks the native runtime's session protocol, and a framed protocol (COM-019) is
 * one more link. The scenario port, the runner and the record are written against this interface only.
 */

/** `serial` is hardware. Only a record made on a `serial` link is hardware evidence. */
export type LinkKind = 'serial' | 'host-runtime' | 'fake';

export interface DeviceIdentity {
  /** What the device says it is: `board` of `zplc sys info`. This is what a person types to confirm a step. */
  board: string;
  boardProfile?: string;
  zplcVersion?: string;
  zephyrVersion?: string;
  abiMajor?: number;
  abiMinor?: number;
  draftCounter?: number | null;
  schedulerCommands?: boolean;
  /** The whole answer, for the record. The firmware's build information (REL-023) is read from it when it lands. */
  raw: Record<string, unknown>;
}

export interface DeviceStatus {
  state: string;
  /** The device's own clock, in milliseconds. Scenario time is taken from it. */
  uptimeMs: number;
  /** Scans the device has run since it was started. */
  cycles: number;
}

export interface ForceEntry {
  address: number;
  size: number;
  bytesHex: string;
}

/** A line of HIL trace the device printed on its own (`{"t":"opcode",...}`); only a firmware image built with the trace prints them. */
export type TraceListener = (line: string) => void;

export interface DeviceLink {
  readonly kind: LinkKind;
  identity(): Promise<DeviceIdentity>;
  status(): Promise<DeviceStatus>;
  /** Deploy: stop, replace the program, leave it stopped. */
  load(zplc: Uint8Array): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  reset(): Promise<void>;
  peek(address: number, length: number): Promise<Uint8Array>;
  poke(address: number, bytes: Uint8Array): Promise<void>;
  /** Force bytes of the memory image. A force belongs to this link and is released by `clearForces`, and by the device when the link is lost (COM-020). */
  force(address: number, bytes: Uint8Array): Promise<void>;
  clearForces(): Promise<void>;
  forces(): Promise<ForceEntry[]>;
  /** Trace lines, when the link carries any. Returns the way to stop listening. */
  onTrace?(listener: TraceListener): () => void;
  close(): Promise<void>;
}

export class DeviceCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeviceCommandError';
  }
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function fromHex(hex: string): Uint8Array {
  const clean = hex.trim();
  if (clean.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(clean)) throw new Error(`not a hex string: ${hex.slice(0, 40)}`);
  return Uint8Array.from(clean.match(/../g) ?? [], (pair) => Number.parseInt(pair, 16));
}

/** The first complete JSON object in a reply that may start with the echo of the command. */
export function extractJson(reply: string): Record<string, unknown> {
  const start = reply.indexOf('{');
  if (start < 0) throw new DeviceCommandError(`no JSON in the reply: ${reply.slice(0, 120)}`);
  let depth = 0;
  for (let index = start; index < reply.length; index += 1) {
    const char = reply[index];
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return JSON.parse(reply.slice(start, index + 1)) as Record<string, unknown>;
    }
  }
  throw new DeviceCommandError(`unterminated JSON in the reply: ${reply.slice(0, 120)}`);
}

/** The bytes of a `zplc dbg peek` dump: lines of `ADDR: HH HH ...` after a `Memory at` header. */
export function parseDump(reply: string, length: number): Uint8Array {
  const out: number[] = [];
  for (const line of reply.split(/\r?\n/)) {
    const match = /^\s*[0-9A-Fa-f]+:\s+((?:[0-9A-Fa-f]{2}\s*)+)$/.exec(line);
    if (match?.[1]) for (const pair of match[1].trim().split(/\s+/)) out.push(Number.parseInt(pair, 16));
  }
  if (out.length < length) throw new DeviceCommandError(`read ${out.length} of ${length} bytes`);
  return Uint8Array.from(out.slice(0, length));
}

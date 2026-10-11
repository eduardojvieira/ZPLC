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

/** What an image says it is (REL-023): the object of `zplc sys build --json`, or the `build` of a host runtime's session.hello. */
export interface BuildIdentity {
  version: string;
  /** 40 hex digits, or `unknown` for a tree that had no git. */
  commit: string;
  dirty: boolean;
  board: string;
  abiMajor: number;
  abiMinor: number;
  draftCounter: number;
  optionsHash: string;
  options: string;
}

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
  /** The build identity of the image (REL-023), when it reports one: an older image has no `zplc sys build`. */
  build?: BuildIdentity;
  /** The whole answer of `zplc sys info --json`, for the record. */
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

const BUILD_KEYS = ['version', 'commit', 'dirty', 'board', 'abi_major', 'abi_minor', 'draft_counter', 'options_hash', 'options'];

/** The identity object of `zplc sys build --json`, exactly: anything else is no identity. */
export function parseBuildIdentity(value: unknown): BuildIdentity | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const object = value as Record<string, unknown>;
  const text = (key: string): string | undefined => (typeof object[key] === 'string' ? (object[key] as string) : undefined);
  const count = (key: string): number | undefined => (Number.isInteger(object[key]) ? (object[key] as number) : undefined);
  if (Object.keys(object).length !== BUILD_KEYS.length || BUILD_KEYS.some((key) => !(key in object))) return undefined;
  const [version, commit, board, optionsHash, options] = [text('version'), text('commit'), text('board'), text('options_hash'), text('options')];
  const [abiMajor, abiMinor, draftCounter] = [count('abi_major'), count('abi_minor'), count('draft_counter')];
  if (version === undefined || commit === undefined || board === undefined || optionsHash === undefined || options === undefined
    || abiMajor === undefined || abiMinor === undefined || draftCounter === undefined || typeof object.dirty !== 'boolean') return undefined;
  return { version, commit, dirty: object.dirty, board, abiMajor, abiMinor, draftCounter, optionsHash, options };
}

const TEXT_LABELS: Record<string, string> = {
  Commit: 'commit', Dirty: 'dirty', Board: 'board', 'Bytecode ABI': 'abi', 'Contract draft': 'draft_counter', 'Options hash': 'options_hash', Options: 'options',
};

/** The identity from the text of `zplc version` (or `zplc sys build`); undefined for an image that prints something else. */
export function parseIdentityText(text: string): BuildIdentity | undefined {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const first = lines.find((line) => line.startsWith('ZPLC Runtime v'));
  if (first === undefined) return undefined;
  const found: Record<string, unknown> = { version: first.slice('ZPLC Runtime v'.length) };
  for (const line of lines) {
    const at = line.indexOf(':');
    if (at < 0) continue;
    const key = TEXT_LABELS[line.slice(0, at).trim()];
    const value = line.slice(at + 1).trim();
    if (key === undefined) continue;
    if (key === 'abi') {
      const [major, minor] = value.split('.');
      if (/^\d+$/.test(major ?? '') && /^\d+$/.test(minor ?? '')) { found.abi_major = Number(major); found.abi_minor = Number(minor); }
    } else if (key === 'draft_counter') {
      if (/^\d+$/.test(value)) found[key] = Number(value);
    } else if (key === 'dirty') found[key] = value === 'yes';
    else found[key] = value;
  }
  return parseBuildIdentity(found);
}

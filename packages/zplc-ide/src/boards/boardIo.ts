/**
 * The I/O description of a board (IO-001, IO-003): the channels of the board with their direction, kind, IEC address,
 * pin name and electrical notes, as firmware/app/boards/boards.json lists them. Studio, the docs generator and the
 * firmware table generator read the same JSON; the rules here mirror firmware/zephyr/scripts/zplc_boards.py.
 *
 * The human text (pin name, location, electrical notes, scaling) is English, the text the firmware and its logs use;
 * a learner board also gives it in Spanish under the same key with `_es` (LRN-029), read here into `es`.
 */

export type ChannelKind = 'digital' | 'analog';
export type ChannelDirection = 'input' | 'output';

export interface AnalogRange {
  readonly rawMin: number;
  readonly rawMax: number;
  readonly engMin: number;
  readonly engMax: number;
  readonly unit: string;
}

export interface BoardChannel {
  readonly id: string;
  readonly direction: ChannelDirection;
  readonly kind: ChannelKind;
  /** The IEC direct address of the channel: `%IX0.3`, `%QX0.0`, `%IW4`. */
  readonly address: string;
  /** The pin or terminal name printed on the board. */
  readonly pin: string;
  readonly location?: string;
  readonly electrical: string;
  readonly pinStatus: 'devicetree' | 'profile';
  readonly source: string;
  /** The value of an output in the safe state. */
  readonly safe?: 0 | 1;
  readonly resolutionBits?: number;
  readonly range?: AnalogRange;
  readonly scaling?: string;
  /** The Spanish twins of the human text, where the description gives them; `channelIn` shows them. */
  readonly es?: Readonly<Partial<Record<TranslatedKey, string>>>;
}

/** The keys of a channel whose text may also be given in Spanish, as `<key>_es` in the manifest. */
const TRANSLATED = ['pin', 'location', 'electrical', 'scaling'] as const;
type TranslatedKey = (typeof TRANSLATED)[number];

export interface BoardIoDescription {
  readonly channels: readonly BoardChannel[];
  readonly unmapped: ReadonlyArray<{ readonly terminal: string; readonly reason: string }>;
}

export interface ParsedAddress {
  readonly region: 'I' | 'Q';
  /** Byte offset in the input (I) or output (Q) image. */
  readonly byte: number;
  /** Bit of the byte, for a bit address only. */
  readonly bit?: number;
  /** Bytes the address covers: 1 for a bit, 2 for a word. */
  readonly width: number;
  readonly text: string;
}

export const SCHEMA_VERSION = 1;
/** The first byte of the system registers at the end of the 4 KB input image: no input channel may reach it. */
export const SYSTEM_REGISTER_OFFSET = 0x0ff0;
const IMAGE_SIZE = 0x1000;
const MAX_CHANNELS = 64;
/** The longest note or scaling text: a Spanish note runs longer than its English one. */
const NOTE_MAX = 512;

const ADDRESS = /^%([IQ])([XW])(\d{1,4})(?:\.(\d))?$/;

/** `%IX0.3` is bit 3 of input byte 0; `%IW4` is the word at input byte 8 (a word is two bytes). */
export function parseDirectAddress(text: string): ParsedAddress | undefined {
  const match = typeof text === 'string' ? ADDRESS.exec(text) : null;
  if (!match) return undefined;
  const region = match[1] as 'I' | 'Q';
  const number = Number(match[3]);
  if (match[2] === 'X') {
    if (match[4] === undefined || Number(match[4]) > 7) return undefined;
    return { region, byte: number, bit: Number(match[4]), width: 1, text };
  }
  if (match[4] !== undefined) return undefined;
  return { region, byte: number * 2, width: 2, text };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isText(value: unknown, max = 256): value is string {
  return typeof value === 'string' && value.trim() !== '' && value.length <= max;
}

function readRange(value: unknown): AnalogRange | undefined {
  if (!isRecord(value)) return undefined;
  const { raw_min: rawMin, raw_max: rawMax, eng_min: engMin, eng_max: engMax, unit } = value;
  if (![rawMin, rawMax, engMin, engMax].every((entry) => typeof entry === 'number' && Number.isFinite(entry))) return undefined;
  if (!isText(unit, 16)) return undefined;
  return { rawMin: rawMin as number, rawMax: rawMax as number, engMin: engMin as number, engMax: engMax as number, unit };
}

function readChannel(value: unknown): BoardChannel | undefined {
  if (!isRecord(value)) return undefined;
  const { id, direction, kind, address, pin, electrical, source } = value;
  if (typeof id !== 'string' || !/^[A-Za-z][A-Za-z0-9_]{0,15}$/.test(id)) return undefined;
  if (direction !== 'input' && direction !== 'output') return undefined;
  if (kind !== 'digital' && kind !== 'analog') return undefined;
  if (!isText(pin, 64) || !isText(electrical) || !isText(source)) return undefined;
  const parsed = typeof address === 'string' ? parseDirectAddress(address) : undefined;
  if (!parsed || (parsed.region === 'I') !== (direction === 'input')) return undefined;
  if ((kind === 'digital') !== (parsed.bit !== undefined)) return undefined;
  if (parsed.byte + parsed.width > (parsed.region === 'I' ? SYSTEM_REGISTER_OFFSET : IMAGE_SIZE)) return undefined;
  if (value.pin_status !== 'devicetree' && value.pin_status !== 'profile') return undefined;
  const es = readTwins(value);
  if (!es) return undefined;
  const base: Omit<BoardChannel, 'safe' | 'resolutionBits' | 'range'> = {
    id, direction, kind, address: address as string, pin, electrical, source, pinStatus: value.pin_status as 'devicetree' | 'profile',
    ...(isText(value.location) ? { location: value.location } : {}),
    ...(isText(value.scaling, NOTE_MAX) ? { scaling: value.scaling } : {}),
    ...(Object.keys(es).length > 0 ? { es } : {}),
  };
  if (direction === 'output') {
    if (kind === 'analog' || (value.safe !== 0 && value.safe !== 1)) return undefined;
    return { ...base, safe: value.safe };
  }
  if (kind === 'analog') {
    const range = readRange(value.range);
    const bits = value.resolution_bits;
    if (!range || typeof bits !== 'number' || !Number.isInteger(bits) || bits < 1 || bits > 16) return undefined;
    return { ...base, resolutionBits: bits, range };
  }
  return base;
}

/** A channel with its human text in a language: the Spanish twins where the description has them, else English. */
export const channelIn = (channel: BoardChannel, lang: 'en' | 'es'): BoardChannel => (lang === 'es' && channel.es ? { ...channel, ...channel.es } : channel);

/** The Spanish twins of a channel; undefined when one is empty or translates a text the channel does not have. */
function readTwins(value: Record<string, unknown>): BoardChannel['es'] | undefined {
  const twins: Partial<Record<TranslatedKey, string>> = {};
  for (const key of TRANSLATED) {
    const twin = value[`${key}_es`];
    if (twin === undefined) continue;
    if (!isText(twin, NOTE_MAX) || !isText(value[key], NOTE_MAX)) return undefined;
    twins[key] = twin;
  }
  return twins;
}

/** Reads the `io` object of a manifest entry; undefined when any rule of the description is broken. */
export function readBoardIo(raw: unknown): BoardIoDescription | undefined {
  if (!isRecord(raw) || raw.schema_version !== SCHEMA_VERSION || !Array.isArray(raw.channels)) return undefined;
  if (raw.channels.length === 0 || raw.channels.length > MAX_CHANNELS) return undefined;
  const channels: BoardChannel[] = [];
  const ids = new Set<string>();
  const taken = new Map<string, number>();
  for (const entry of raw.channels) {
    const channel = readChannel(entry);
    if (!channel || ids.has(channel.id)) return undefined;
    ids.add(channel.id);
    const address = parseDirectAddress(channel.address)!;
    for (let offset = 0; offset < address.width; offset += 1) {
      const key = `${address.region}${address.byte + offset}`;
      const mask = address.bit === undefined ? 0xff : 1 << address.bit;
      if (((taken.get(key) ?? 0) & mask) !== 0) return undefined;
      taken.set(key, (taken.get(key) ?? 0) | mask);
    }
    channels.push(channel);
  }
  const unmappedRaw = raw.unmapped ?? [];
  if (!Array.isArray(unmappedRaw)) return undefined;
  const unmapped: Array<{ terminal: string; reason: string }> = [];
  for (const item of unmappedRaw) {
    if (!isRecord(item) || !isText(item.terminal) || !isText(item.reason)) return undefined;
    unmapped.push({ terminal: item.terminal, reason: item.reason });
  }
  return { channels, unmapped };
}

/** Bytes of the input and of the output image that the channels need (IO-005). */
export function imageExtent(io: BoardIoDescription): { inputBytes: number; outputBytes: number } {
  let inputBytes = 0;
  let outputBytes = 0;
  for (const channel of io.channels) {
    const address = parseDirectAddress(channel.address)!;
    const end = address.byte + address.width;
    if (address.region === 'I') inputBytes = Math.max(inputBytes, end);
    else outputBytes = Math.max(outputBytes, end);
  }
  return { inputBytes, outputBytes };
}

/** Outputs first, then inputs, each by image address: the order of the generated firmware table. */
export function sortedChannels(io: BoardIoDescription): BoardChannel[] {
  const key = (channel: BoardChannel): [number, number, number] => {
    const address = parseDirectAddress(channel.address)!;
    return [address.region === 'Q' ? 0 : 1, address.byte, address.bit ?? 0];
  };
  return [...io.channels].sort((left, right) => {
    const a = key(left);
    const b = key(right);
    return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
  });
}

export function fnv1a32(value: string): number {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(value)) {
    hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * The identity of a description: FNV-1a 32 over the board id and the id, direction, kind and address of each
 * channel, eight hex digits. The firmware reports it with `zplc sys io` and Studio compares it (IO-004); the Python
 * library computes the same text and hash.
 */
export function descriptionHash(boardId: string, io: BoardIoDescription): string {
  const lines = [boardId, ...sortedChannels(io).map((channel) => `${channel.id}|${channel.direction}|${channel.kind}|${channel.address}`)];
  return fnv1a32(`${lines.join('\n')}\n`).toString(16).padStart(8, '0');
}

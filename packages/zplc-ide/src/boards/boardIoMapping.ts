/**
 * The I/O mapping editor against the channels of the selected board (IO-003).
 *
 * The rows of a project's `io` section name process-image addresses; the board description says which of them a
 * channel of the board stands behind. These functions are what the editor uses to list the channels, to offer the
 * next free one and to say, in words that name the board, that a row sits where the board has nothing.
 */
import { parseDirectAddress, type BoardChannel, type BoardIoDescription } from './boardIo';

export type IoSection = 'inputs' | 'outputs';

const SECTION_REGION: Record<IoSection, 'I' | 'Q'> = { inputs: 'I', outputs: 'Q' };

/**
 * The canonical text of a direct address as a project writes it: `%Q0.1` and `%qx0.1` are `%QX0.1`; `%IW8` stays.
 * Undefined for text that is not an input or output address.
 */
export function normalizeAddress(text: string): string | undefined {
  const match = /^%([IiQq])([XxWwBb]?)(\d{1,4})(?:\.(\d))?$/.exec(text.trim());
  if (!match) return undefined;
  const region = match[1]!.toUpperCase();
  const size = match[2]!.toUpperCase();
  const number = match[3]!;
  const bit = match[4];
  if (bit !== undefined) {
    if (size !== '' && size !== 'X') return undefined;
    return Number(bit) <= 7 ? `%${region}X${Number(number)}.${bit}` : undefined;
  }
  if (size === 'W') return `%${region}W${Number(number)}`;
  if (size === 'B') return `%${region}B${Number(number)}`;
  return undefined;
}

/** The channels of the board that belong to a section: its inputs or its outputs, digital and analog. */
export function channelsFor(io: BoardIoDescription, section: IoSection): BoardChannel[] {
  const region = SECTION_REGION[section];
  return io.channels.filter((channel) => parseDirectAddress(channel.address)!.region === region);
}

function listing(channels: readonly BoardChannel[]): string {
  return channels.length === 0 ? 'none' : channels.map((channel) => `${channel.id} ${channel.address} (${channel.pin})`).join(', ');
}

/** The channel of the board a row's address stands on, if there is one. */
export function channelAt(io: BoardIoDescription, section: IoSection, address: string): BoardChannel | undefined {
  const wanted = normalizeAddress(address);
  return wanted === undefined ? undefined : channelsFor(io, section).find((channel) => channel.address === wanted);
}

/**
 * Why a row cannot be on this board, or undefined when it can: the address is not an address of the section, or the
 * board has no channel there. The message names the board and lists the channels it has.
 */
export function mappingProblem(
  io: BoardIoDescription,
  boardLabel: string,
  section: IoSection,
  row: { readonly address: string },
): string | undefined {
  const normal = normalizeAddress(row.address);
  const direction = section === 'inputs' ? 'input' : 'output';
  if (normal === undefined) {
    return `'${row.address}' is not an ${direction} address of the process image (for example ${channelsFor(io, section)[0]?.address ?? '%IX0.0'})`;
  }
  if (normal.charAt(1) !== SECTION_REGION[section]) {
    return `${normal} is not an ${direction} address: it belongs in the ${section === 'inputs' ? 'outputs' : 'inputs'} section`;
  }
  if (channelAt(io, section, normal) !== undefined) return undefined;
  return `Board ${boardLabel} has no ${direction} channel at ${normal}; it has ${listing(channelsFor(io, section))}`;
}

/** The first channel of the section and kind that no row of the section uses, in the order of the board. */
export function nextFreeChannel(
  io: BoardIoDescription,
  section: IoSection,
  kind: 'digital' | 'analog',
  rows: ReadonlyArray<{ readonly address: string }>,
): BoardChannel | undefined {
  const used = new Set(rows.map((row) => normalizeAddress(row.address)).filter((address): address is string => address !== undefined));
  return channelsFor(io, section).find((channel) => channel.kind === kind && !used.has(channel.address));
}

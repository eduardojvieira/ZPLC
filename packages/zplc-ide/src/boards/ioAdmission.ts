/**
 * Deploy admission and build checks against the I/O description of a board (IO-003, IO-004).
 *
 * The description is the one the firmware was built from (firmware/app/boards/boards.json). A program is checked
 * twice: when it is built, each located variable must sit on a channel of the board (a build error that names the
 * board), and when it is deployed, the firmware must report the description Studio holds and every process-image
 * byte the code touches must belong to a channel of it.
 */
import { getBoardIo, getBoardIoIdentity } from '../config/boardProfiles';
import { SYSTEM_REGISTER_OFFSET, parseDirectAddress, type BoardChannel } from './boardIo';
import type { ProcessImageAccess } from './programIo';

export type IoAdmissionCode =
  | 'ZPLC_DEVICE_IO_DESCRIPTION_MISSING'
  | 'ZPLC_DEVICE_IO_DESCRIPTION_MISMATCH'
  | 'ZPLC_DEVICE_PROGRAM_IO_MISMATCH';

/** The `io` object of the firmware's `sys info` handshake. */
export interface DeviceIoIdentity {
  readonly schema: number;
  readonly boardId: string;
  readonly hash: string;
  readonly channels: number;
  readonly inputBytes: number;
  readonly outputBytes: number;
}

export type IoAdmission = { readonly ok: true } | { readonly ok: false; readonly code: IoAdmissionCode; readonly detail: string };

function label(board: string): string {
  return getBoardIoIdentity(board)?.displayName ?? board;
}

/** %IB3 or %QB0 for a byte, %IX0.3 for a bit: the way a person reads an address. */
function byteAddress(region: 'I' | 'Q', byte: number): string {
  return `%${region}B${byte}`;
}

function channelsOf(board: string, region: 'I' | 'Q'): BoardChannel[] {
  const io = getBoardIo(board);
  return (io?.channels ?? []).filter((channel) => parseDirectAddress(channel.address)!.region === region);
}

function coveredBytes(channels: readonly BoardChannel[]): Set<number> {
  const bytes = new Set<number>();
  for (const channel of channels) {
    const address = parseDirectAddress(channel.address)!;
    for (let offset = 0; offset < address.width; offset += 1) bytes.add(address.byte + offset);
  }
  return bytes;
}

function describeChannels(channels: readonly BoardChannel[]): string {
  return channels.length === 0 ? 'no channel' : channels.map((channel) => `${channel.id} ${channel.address}`).join(', ');
}

/**
 * Whether the program may be deployed to the board it targets.
 * `accesses` is what the code touches (undefined when it cannot be read), `device` what the firmware reported.
 */
export function checkProgramIo({ accesses, board, device }: {
  readonly accesses: readonly ProcessImageAccess[] | undefined;
  readonly board: string | undefined;
  readonly device: DeviceIoIdentity | null;
}): IoAdmission {
  const identity = getBoardIoIdentity(board);
  if (!board || !identity) return { ok: true };
  if (accesses === undefined) {
    return { ok: false, code: 'ZPLC_DEVICE_PROGRAM_IO_MISMATCH', detail: `the code of the program cannot be read, so its I/O cannot be compared with board ${identity.displayName}` };
  }
  const touched = accesses.filter((access) => !(access.region === 'I' && access.byte >= SYSTEM_REGISTER_OFFSET));
  if (touched.length === 0) return { ok: true };
  if (device === null) {
    return { ok: false, code: 'ZPLC_DEVICE_IO_DESCRIPTION_MISSING', detail: `the firmware of the board does not report its I/O description, so the I/O of the program cannot be compared with board ${identity.displayName}` };
  }
  if (device.boardId !== identity.boardId || device.hash !== identity.hash) {
    return {
      ok: false,
      code: 'ZPLC_DEVICE_IO_DESCRIPTION_MISMATCH',
      detail: `the firmware describes the I/O of board ${device.boardId} as ${device.hash}, Studio describes board ${identity.displayName} (${identity.boardId}) as ${identity.hash}`,
    };
  }
  const inputBytes = coveredBytes(channelsOf(board, 'I'));
  const outputBytes = coveredBytes(channelsOf(board, 'Q'));
  const problems: string[] = [];
  for (const access of touched) {
    const covered = access.region === 'I' ? inputBytes : outputBytes;
    for (let offset = 0; offset < access.width; offset += 1) {
      const byte = access.byte + offset;
      if (!covered.has(byte)) {
        problems.push(`${byteAddress(access.region, byte)}`);
        break;
      }
    }
  }
  if (problems.length === 0) return { ok: true };
  const unique = [...new Set(problems)];
  return {
    ok: false,
    code: 'ZPLC_DEVICE_PROGRAM_IO_MISMATCH',
    detail: `the program uses ${unique.join(', ')}, which board ${identity.displayName} has no channel for (${channelSummary(board)})`,
  };
}

function channelSummary(board: string): string {
  return `inputs: ${describeChannels(channelsOf(board, 'I'))}; outputs: ${describeChannels(channelsOf(board, 'Q'))}`;
}

/** A located variable as the compiler's debug map lists it. */
export interface LocatedVariable {
  readonly name: string;
  readonly region: 'IPI' | 'OPI';
  readonly addr: number;
  readonly size: number;
  readonly bitOffset?: number;
}

/**
 * The located variables that sit where the board has no channel, as sentences that name the variable, its address and
 * the board (IO-003). A board without a description (host, custom) is not checked.
 */
export function checkLocatedVariables(
  board: string | undefined,
  located: readonly LocatedVariable[],
  virtualAddresses: ReadonlySet<string> = new Set(),
): string[] {
  const io = board ? getBoardIo(board) : undefined;
  if (!board || !io) return [];
  const errors: string[] = [];
  for (const variable of located) {
    const region: 'I' | 'Q' = variable.region === 'IPI' ? 'I' : 'Q';
    const base = region === 'I' ? 0x0000 : 0x1000;
    const byte = variable.addr - base;
    if (region === 'I' && byte >= SYSTEM_REGISTER_OFFSET) continue;
    // an address the project declares virtual (an image word no pin drives) is exempt
    if (virtualAddresses.has(variable.size === 2 && variable.bitOffset === undefined ? `%${region}W${byte / 2}` : variable.bitOffset !== undefined ? `%${region}X${byte}.${variable.bitOffset}` : `%${region}B${byte}`)) continue;
    const channels = channelsOf(board, region);
    const found = variable.bitOffset !== undefined && variable.size <= 1
      ? channels.some((channel) => {
          const address = parseDirectAddress(channel.address)!;
          return address.bit === variable.bitOffset && address.byte === byte;
        })
      : variable.size === 2 && channels.some((channel) => {
          const address = parseDirectAddress(channel.address)!;
          return address.bit === undefined && address.byte === byte;
        });
    const wholeBytes = variable.bitOffset === undefined && variable.size !== 2
      ? Array.from({ length: Math.max(1, variable.size) }, (_, offset) => byte + offset).every((each) => coveredBytes(channels).has(each))
      : false;
    if (found || wholeBytes) continue;
    const address = variable.bitOffset !== undefined
      ? `%${region}X${byte}.${variable.bitOffset}`
      : variable.size === 2 ? `%${region}W${byte / 2}` : byteAddress(region, byte);
    errors.push(
      `Variable '${variable.name}' is located at ${address}, which board ${label(board)} has no channel for `
      + `(${region === 'I' ? 'inputs' : 'outputs'}: ${describeChannels(channels)})`,
    );
  }
  return errors;
}

/** The located variables of a compiler debug map (the variables of every POU that sit in the process images). */
export function locatedVariablesOf(map: { readonly pou: Readonly<Record<string, { readonly vars: Readonly<Record<string, {
  readonly addr: number; readonly size: number; readonly region: string; readonly bitOffset?: number }>> }>> }): LocatedVariable[] {
  const found = new Map<string, LocatedVariable>();
  for (const pou of Object.values(map.pou)) {
    for (const [name, info] of Object.entries(pou.vars)) {
      if (info.region !== 'IPI' && info.region !== 'OPI') continue;
      const key = `${info.region}:${info.addr}:${info.bitOffset ?? -1}:${name}`;
      if (!found.has(key)) {
        found.set(key, { name, region: info.region, addr: info.addr, size: info.size, ...(info.bitOffset === undefined ? {} : { bitOffset: info.bitOffset }) });
      }
    }
  }
  return [...found.values()];
}

import type { NetworkConfig } from '../types';
import type { CompilerMemoryProfile } from '@zplc/compiler';
import boardManifest from '../../../../firmware/app/boards/boards.json';
import { descriptionHash, imageExtent, readBoardIo, type BoardIoDescription } from '../boards/boardIo';
import { EVIDENCE_RECORDS } from '../boards/evidenceRecords';
import { supportLevelFromRecords } from '../boards/supportLevel';

export const NETWORK_INTERFACE = {
  NONE: 'none',
  WIFI: 'wifi',
  ETHERNET: 'ethernet',
} as const;

export type NetworkInterfaceKind = (typeof NETWORK_INTERFACE)[keyof typeof NETWORK_INTERFACE];

export interface BoardOption {
  value: string;
  label: string;
}

interface BoardProfile {
  boardId: string;
  label: string;
  network: NetworkInterfaceKind;
  zephyrBoard: string;
  memory: CompilerMemoryProfile;
  validationLevel: 'cross-build' | 'human-hil';
  /** Records that name this board, the firmware version and the image they were made on (IO-015). */
  evidenceCount: number;
  /** The channels of the board with their pins (IO-001, IO-003). */
  io: BoardIoDescription;
  /** The identity of the description, as the firmware reports it in the handshake (IO-004). */
  ioHash: string;
}

interface SupportedBoardManifestEntry {
  board_id: string;
  display_name: string;
  ide_id: string;
  zephyr_board: string;
  network_class: 'serial-focused' | 'network-capable' | 'other';
  network_interface: 'none' | 'wifi' | 'ethernet';
  memory: { work_size: number; retain_size: number; code_size_max: number };
  evidence_refs: string[];
  io: unknown;
}

/** The support level is derived from the records the manifest references; a hand-set field is not read (IO-015). */
function boardEvidence(board: SupportedBoardManifestEntry): Pick<BoardProfile, 'validationLevel' | 'evidenceCount'> | undefined {
  if (!Array.isArray(board.evidence_refs)
    || board.evidence_refs.length > 16
    || !board.evidence_refs.every((reference) => typeof reference === 'string' && reference.length > 0 && reference.length <= 256)) return undefined;
  const derived = supportLevelFromRecords(board.board_id, board.evidence_refs.map((reference) => [reference, EVIDENCE_RECORDS[reference] ?? null] as const));
  return { validationLevel: derived.level, evidenceCount: derived.records.length };
}

function mapNetworkClassToInterface(
  networkInterface: SupportedBoardManifestEntry['network_interface']
): NetworkInterfaceKind {
  if (networkInterface === 'wifi') {
    return NETWORK_INTERFACE.WIFI;
  }

  if (networkInterface === 'ethernet') {
    return NETWORK_INTERFACE.ETHERNET;
  }

  return NETWORK_INTERFACE.NONE;
}

const BOARD_PROFILES: Record<string, BoardProfile> = Object.fromEntries(
  (boardManifest as unknown as SupportedBoardManifestEntry[]).flatMap((board) => {
    const evidence = boardEvidence(board);
    const io = readBoardIo(board.io);
    return evidence && io ? [[board.ide_id, {
      boardId: board.board_id,
      io,
      ioHash: descriptionHash(board.board_id, io),
      label: board.display_name,
      network: mapNetworkClassToInterface(board.network_interface),
      zephyrBoard: board.zephyr_board,
      memory: {
        workSize: board.memory.work_size,
        retainSize: board.memory.retain_size,
        codeSizeMax: board.memory.code_size_max,
      },
      ...evidence,
    }]] : [];
  })
);

export const BOARD_OPTIONS: BoardOption[] = [
  { value: '', label: 'Select a board...' },
  ...Object.entries(BOARD_PROFILES).map(([value, profile]) => ({ value, label: profile.label })),
  { value: 'custom', label: 'Custom (enter manually)' },
];

export function getBoardNetworkType(board: string | undefined): NetworkInterfaceKind {
  if (!board) {
    return NETWORK_INTERFACE.NONE;
  }

  return BOARD_PROFILES[board]?.network ?? NETWORK_INTERFACE.NONE;
}

/** Exact Zephyr board target declared for an IDE board identifier. */
export function getZephyrBoardTarget(board: string | undefined): string | undefined {
  return board ? BOARD_PROFILES[board]?.zephyrBoard : undefined;
}

/** Safe public evidence tier for a catalogue board; paths and references stay private. */
export function getBoardEvidenceSummary(board: string | undefined): Readonly<{
  zephyrBoard: string;
  validationLevel: 'cross-build' | 'human-hil';
  evidenceCount: number;
}> | undefined {
  const profile = board ? BOARD_PROFILES[board] : undefined;
  return profile && {
    zephyrBoard: profile.zephyrBoard,
    validationLevel: profile.validationLevel,
    evidenceCount: profile.evidenceCount,
  };
}

/** The I/O description of a catalogue board: undefined for host, custom and unknown selectors (IO-003). */
export function getBoardIo(board: string | undefined): BoardIoDescription | undefined {
  return board ? BOARD_PROFILES[board]?.io : undefined;
}

/** What the firmware of the board reports about its I/O description, as Studio expects it (IO-004). */
export function getBoardIoIdentity(board: string | undefined): Readonly<{
  boardId: string; displayName: string; hash: string; inputBytes: number; outputBytes: number;
}> | undefined {
  const profile = board ? BOARD_PROFILES[board] : undefined;
  return profile && { boardId: profile.boardId, displayName: profile.label, hash: profile.ioHash, ...imageExtent(profile.io) };
}

/** The IDE board identifier of a full Zephyr board target the device reports, when the catalogue has it. */
export function getBoardByZephyrTarget(target: string | undefined): string | undefined {
  return Object.entries(BOARD_PROFILES).find(([, profile]) => profile.zephyrBoard === target)?.[0];
}

/** Effective compiler limits for a catalogue board; host/custom remain default. */
export function getCompilerMemoryProfile(board: string | undefined): CompilerMemoryProfile | undefined {
  return board ? BOARD_PROFILES[board]?.memory : undefined;
}

/** Whether an IDE board identifier is in the single supported-board catalogue. */
export function isKnownBoardTarget(board: string | undefined): boolean {
  return getZephyrBoardTarget(board) !== undefined;
}

/** Whether a device-reported full Zephyr board target is in the catalogue. */
export function isKnownZephyrBoardTarget(target: string | undefined): boolean {
  return Boolean(target) && Object.values(BOARD_PROFILES).some((profile) => profile.zephyrBoard === target);
}

function defaultWifiConfig(existing: NetworkConfig | undefined): NetworkConfig {
  return {
    hostname: existing?.hostname,
    wifi: {
      enabled: existing?.wifi?.enabled ?? true,
      ssid: existing?.wifi?.ssid,
      password: existing?.wifi?.password,
      security: existing?.wifi?.security ?? 'wpa2-psk',
      hiddenSsid: existing?.wifi?.hiddenSsid ?? false,
      ipv4: {
        dhcp: existing?.wifi?.ipv4?.dhcp ?? true,
        ip: existing?.wifi?.ipv4?.ip,
        netmask: existing?.wifi?.ipv4?.netmask,
        gateway: existing?.wifi?.ipv4?.gateway,
        dns: existing?.wifi?.ipv4?.dns,
      },
    },
  };
}

function defaultEthernetConfig(existing: NetworkConfig | undefined): NetworkConfig {
  return {
    hostname: existing?.hostname,
    ethernet: {
      enabled: existing?.ethernet?.enabled ?? true,
      macAddress: existing?.ethernet?.macAddress,
      ipv4: {
        dhcp: existing?.ethernet?.ipv4?.dhcp ?? true,
        ip: existing?.ethernet?.ipv4?.ip,
        netmask: existing?.ethernet?.ipv4?.netmask,
        gateway: existing?.ethernet?.ipv4?.gateway,
        dns: existing?.ethernet?.ipv4?.dns,
      },
    },
  };
}

export function normalizeNetworkConfigForBoard(
  existing: NetworkConfig | undefined,
  board: string | undefined
): NetworkConfig | undefined {
  const networkType = getBoardNetworkType(board);

  if (networkType === NETWORK_INTERFACE.WIFI) {
    return defaultWifiConfig(existing);
  }

  if (networkType === NETWORK_INTERFACE.ETHERNET) {
    return defaultEthernetConfig(existing);
  }

  return undefined;
}

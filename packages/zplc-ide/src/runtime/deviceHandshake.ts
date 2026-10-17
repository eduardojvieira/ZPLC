import { ZPLC_CONSTANTS } from '@zplc/compiler';
import { getZephyrBoardTarget, isKnownZephyrBoardTarget } from '../config/boardProfiles';
import { checkProgramIo, type DeviceIoIdentity } from '../boards/ioAdmission';
import { processImageAccesses } from '../boards/programIo';
import { artifactDraftCounter, draftMismatchMessage } from './draftCounter';

const MAX_TEXT_LENGTH = 128;
const REQUIRED_ROOT_KEYS = [
  'board', 'board_profile', 'zplc_version', 'zephyr_version', 'uptime_ms', 'cpu_freq_mhz',
  'device_protocol_version', 'bytecode_abi_major', 'bytecode_abi_minor', 'capabilities', 'memory',
] as const;
/**
 * Firmware images from before the draft counter (CMP-052) do not report it; Studio refuses to deploy to them.
 * `io` is the identity of the board I/O description the image was built from (IO-004); an image without it cannot
 * be compared, so Studio refuses a program that uses I/O on it. The device does not report it in `sys info`, whose
 * keys stay exactly as released Studios accept them: the adapter reads it with `sys io` and joins it to the
 * system information it keeps (see joinDeviceIo).
 */
const OPTIONAL_ROOT_KEYS = ['draft_counter', 'io'] as const;
const REQUIRED_IO_KEYS = ['schema', 'board_id', 'hash', 'channels', 'input_bytes', 'output_bytes'] as const;
const REQUIRED_CAPABILITY_KEYS = ['fpu', 'mpu', 'scheduler', 'max_tasks'] as const;
const REQUIRED_MEMORY_KEYS = ['work_size', 'retain_size', 'ipi_size', 'opi_size'] as const;
/**
 * The program memory a firmware reports from RT-028 on: the size of the CODE region and the largest artifact the
 * program store accepts. An image before it does not have them; Studio then has no capacity to check a size against.
 */
const OPTIONAL_MEMORY_KEYS = ['code_size', 'max_artifact_size'] as const;

export const DEVICE_ADMISSION_CODE = {
  HANDSHAKE_INVALID: 'ZPLC_DEVICE_HANDSHAKE_INVALID',
  PROTOCOL_UNSUPPORTED: 'ZPLC_DEVICE_PROTOCOL_UNSUPPORTED',
  PROJECT_TARGET_MISSING: 'ZPLC_DEVICE_PROJECT_TARGET_MISSING',
  PROJECT_TARGET_UNKNOWN: 'ZPLC_DEVICE_PROJECT_TARGET_UNKNOWN',
  IO_DESCRIPTION_MISSING: 'ZPLC_DEVICE_IO_DESCRIPTION_MISSING',
  IO_DESCRIPTION_MISMATCH: 'ZPLC_DEVICE_IO_DESCRIPTION_MISMATCH',
  PROGRAM_IO_MISMATCH: 'ZPLC_DEVICE_PROGRAM_IO_MISMATCH',
  BOARD_PROFILE_UNKNOWN: 'ZPLC_DEVICE_BOARD_PROFILE_UNKNOWN',
  BOARD_PROFILE_MISMATCH: 'ZPLC_DEVICE_BOARD_PROFILE_MISMATCH',
  ARTIFACT_INVALID: 'ZPLC_DEVICE_ARTIFACT_INVALID',
  BYTECODE_ABI_MISMATCH: 'ZPLC_DEVICE_BYTECODE_ABI_MISMATCH',
  ARTIFACT_TOO_LARGE: 'ZPLC_DEVICE_ARTIFACT_TOO_LARGE',
  PREFLIGHT_STALE: 'ZPLC_DEVICE_PREFLIGHT_STALE',
  RESULT_UNKNOWN: 'ZPLC_DEVICE_RESULT_UNKNOWN',
} as const;

export type DeviceAdmissionCode = (typeof DEVICE_ADMISSION_CODE)[keyof typeof DEVICE_ADMISSION_CODE];

export class DeviceAdmissionError extends Error {
  readonly code: DeviceAdmissionCode;
  /** Plain words for the person, only where the denial has some (the draft counter mismatch). */
  readonly detail?: string;

  constructor(code: DeviceAdmissionCode, detail?: string) {
    super(code);
    this.name = 'DeviceAdmissionError';
    this.code = code;
    if (detail !== undefined) this.detail = detail;
  }
}

export interface DeviceHandshake {
  readonly board: string;
  readonly boardProfile: string;
  readonly deviceProtocolVersion: number;
  readonly bytecodeAbiMajor: number;
  readonly bytecodeAbiMinor: number;
  /** Draft contract counter of the firmware image (CMP-052); null when the image does not report one. */
  readonly draftCounter: number | null;
  /** Identity of the board I/O description of the image (IO-004); null when the image does not report one. */
  readonly io: DeviceIoIdentity | null;
  /** The largest artifact the device accepts, in bytes; null when the image does not report it (before RT-028). */
  readonly maxArtifactBytes: number | null;
}

export interface DeviceSystemInfo {
  board: string;
  board_profile: string;
  zplc_version: string;
  zephyr_version: string;
  uptime_ms: number;
  cpu_freq_mhz: number;
  device_protocol_version: number;
  bytecode_abi_major: number;
  bytecode_abi_minor: number;
  draft_counter?: number;
  io?: { schema: number; board_id: string; hash: string; channels: number; input_bytes: number; output_bytes: number };
  capabilities: { fpu: boolean; mpu: boolean; scheduler: boolean; max_tasks: number };
  memory: {
    work_size: number; retain_size: number; ipi_size: number; opi_size: number;
    code_size?: number; max_artifact_size?: number;
  };
}

function fail(code: DeviceAdmissionCode, detail?: string): never {
  throw new DeviceAdmissionError(code, detail);
}

function snapshotRecord(value: unknown): Record<string, unknown> | null {
  try {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const snapshot = Object.create(null) as Record<string, unknown>;
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) return null;
      snapshot[key] = descriptor.value;
    }
    return snapshot;
  } catch {
    return null;
  }
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], optional: readonly string[] = []): boolean {
  const actual = Object.keys(value);
  const present = optional.filter((key) => Object.hasOwn(value, key));
  return actual.length === keys.length + present.length && keys.every((key) => Object.hasOwn(value, key));
}

function readText(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_TEXT_LENGTH && /^[\x20-\x7E]+$/.test(value) ? value : null;
}

function readInteger(value: unknown, max: number): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= max ? value : null;
}

function parseDeviceIo(value: unknown): DeviceSystemInfo['io'] | null {
  const io = snapshotRecord(value);
  if (!io || !exactKeys(io, REQUIRED_IO_KEYS)) return null;
  const board = readText(io.board_id);
  const channels = readInteger(io.channels, 64);
  const inputBytes = readInteger(io.input_bytes, 0x1000);
  const outputBytes = readInteger(io.output_bytes, 0x1000);
  if (io.schema !== 1 || board === null || channels === null || inputBytes === null || outputBytes === null) return null;
  if (typeof io.hash !== 'string' || !/^[0-9a-f]{8}$/.test(io.hash)) return null;
  return { schema: 1, board_id: board, hash: io.hash, channels, input_bytes: inputBytes, output_bytes: outputBytes };
}

function parseDeviceSystemInfoSnapshot(value: unknown): DeviceSystemInfo | null {
  const root = snapshotRecord(value);
  if (!root || !exactKeys(root, REQUIRED_ROOT_KEYS, OPTIONAL_ROOT_KEYS)) return null;
  const capabilities = snapshotRecord(root.capabilities);
  const memory = snapshotRecord(root.memory);
  if (!capabilities || !memory || !exactKeys(capabilities, REQUIRED_CAPABILITY_KEYS) || !exactKeys(memory, REQUIRED_MEMORY_KEYS, OPTIONAL_MEMORY_KEYS)) return null;
  const io = Object.hasOwn(root, 'io') ? parseDeviceIo(root.io) : undefined;
  if (io === null) return null;
  if (!(typeof capabilities.fpu === 'boolean' && typeof capabilities.mpu === 'boolean' && typeof capabilities.scheduler === 'boolean'
    && readInteger(capabilities.max_tasks, 1024) !== null
    && REQUIRED_MEMORY_KEYS.every((key) => readInteger(memory[key], 0xffffffff) !== null)
    && OPTIONAL_MEMORY_KEYS.every((key) => !Object.hasOwn(memory, key) || readInteger(memory[key], 0xffffffff) !== null)
    && readText(root.board) !== null && readText(root.board_profile) !== null
    && readText(root.zplc_version) !== null && readText(root.zephyr_version) !== null
    && readInteger(root.uptime_ms, 0xffffffff) !== null && readInteger(root.cpu_freq_mhz, 1_000_000) !== null
    && readInteger(root.device_protocol_version, 0xffff) !== null
    && readInteger(root.bytecode_abi_major, 0xffff) !== null && readInteger(root.bytecode_abi_minor, 0xffff) !== null
    && (!Object.hasOwn(root, 'draft_counter') || readInteger(root.draft_counter, 0xffffffff) !== null))) return null;
  return {
    board: root.board as string, board_profile: root.board_profile as string,
    zplc_version: root.zplc_version as string, zephyr_version: root.zephyr_version as string,
    uptime_ms: root.uptime_ms as number, cpu_freq_mhz: root.cpu_freq_mhz as number,
    device_protocol_version: root.device_protocol_version as number,
    bytecode_abi_major: root.bytecode_abi_major as number, bytecode_abi_minor: root.bytecode_abi_minor as number,
    ...(Object.hasOwn(root, 'draft_counter') ? { draft_counter: root.draft_counter as number } : {}),
    ...(io ? { io } : {}),
    capabilities: { fpu: capabilities.fpu, mpu: capabilities.mpu, scheduler: capabilities.scheduler, max_tasks: capabilities.max_tasks as number },
    memory: {
      work_size: memory.work_size as number, retain_size: memory.retain_size as number,
      ipi_size: memory.ipi_size as number, opi_size: memory.opi_size as number,
      ...(Object.hasOwn(memory, 'code_size') ? { code_size: memory.code_size as number } : {}),
      ...(Object.hasOwn(memory, 'max_artifact_size') ? { max_artifact_size: memory.max_artifact_size as number } : {}),
    },
  };
}

/** Parse the complete, bounded system-info contract without executing payload accessors. */
export function parseDeviceHandshake(value: unknown): DeviceHandshake {
  const info = parseDeviceSystemInfo(value);
  return {
    board: info.board,
    boardProfile: info.board_profile,
    deviceProtocolVersion: info.device_protocol_version,
    bytecodeAbiMajor: info.bytecode_abi_major,
    bytecodeAbiMinor: info.bytecode_abi_minor,
    draftCounter: info.draft_counter ?? null,
    maxArtifactBytes: info.memory.max_artifact_size ?? null,
    io: info.io
      ? { schema: info.io.schema, boardId: info.io.board_id, hash: info.io.hash, channels: info.io.channels, inputBytes: info.io.input_bytes, outputBytes: info.io.output_bytes }
      : null,
  };
}

/**
 * The system information with the I/O identity of the image (IO-004) joined to it: the answer of `sys io`, which is
 * a command of its own so that the keys of `sys info` stay as released Studios accept them. An image that does not
 * have the command does not answer it (the caller bounds the wait) and has no identity to compare.
 */
export async function joinDeviceIo(info: DeviceSystemInfo, askIo: () => Promise<unknown>): Promise<DeviceSystemInfo> {
  try {
    const io = parseDeviceIo(await askIo());
    return io ? { ...info, io } : info;
  } catch {
    return info;
  }
}

/** Parse into a detached safe copy for adapter caches and scheduler selection. */
export function parseDeviceSystemInfo(value: unknown): DeviceSystemInfo {
  return parseDeviceSystemInfoSnapshot(value) ?? fail(DEVICE_ADMISSION_CODE.HANDSHAKE_INVALID);
}

/** The ABI version and contract draft that an artifact was built for; refuses bytes that are not an artifact. */
export function readArtifactAbi(bytes: Uint8Array): { major: number; minor: number; draftCounter: number } {
  if (bytes.byteLength < 8) fail(DEVICE_ADMISSION_CODE.ARTIFACT_INVALID);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== ZPLC_CONSTANTS.MAGIC) fail(DEVICE_ADMISSION_CODE.ARTIFACT_INVALID);
  // A header shorter than the counter's offset has no counter (0), as an artifact built before it does.
  return {
    major: view.getUint16(4, true),
    minor: view.getUint16(6, true),
    draftCounter: artifactDraftCounter(bytes) ?? 0,
  };
}

/** Validate the exact bytes that will be sent before a human-triggered hardware deploy. */
export function validateHardwareDeployAdmission(
  bytes: Uint8Array,
  projectBoard: string | undefined,
  handshake: DeviceHandshake,
): DeviceHandshake {
  if (!projectBoard) fail(DEVICE_ADMISSION_CODE.PROJECT_TARGET_MISSING);
  const target = getZephyrBoardTarget(projectBoard);
  if (!target) fail(DEVICE_ADMISSION_CODE.PROJECT_TARGET_UNKNOWN);
  if (handshake.deviceProtocolVersion !== 1) fail(DEVICE_ADMISSION_CODE.PROTOCOL_UNSUPPORTED);
  if (!isKnownZephyrBoardTarget(handshake.boardProfile)) fail(DEVICE_ADMISSION_CODE.BOARD_PROFILE_UNKNOWN);
  if (handshake.boardProfile !== target) fail(DEVICE_ADMISSION_CODE.BOARD_PROFILE_MISMATCH);
  const artifact = readArtifactAbi(bytes);
  // CMP-052: the draft counter is compared before the version, and a refusal names both numbers.
  if (artifact.draftCounter !== ZPLC_CONSTANTS.DRAFT_COUNTER) {
    fail(DEVICE_ADMISSION_CODE.BYTECODE_ABI_MISMATCH, draftMismatchMessage(artifact.draftCounter, ZPLC_CONSTANTS.DRAFT_COUNTER));
  }
  if (handshake.draftCounter !== artifact.draftCounter) {
    fail(DEVICE_ADMISSION_CODE.BYTECODE_ABI_MISMATCH, draftMismatchMessage(artifact.draftCounter, handshake.draftCounter));
  }
  // COM-028: the size is part of the preflight, against what this device says it accepts
  if (handshake.maxArtifactBytes !== null && bytes.byteLength > handshake.maxArtifactBytes) {
    fail(DEVICE_ADMISSION_CODE.ARTIFACT_TOO_LARGE,
      `The program is ${bytes.byteLength} bytes and this device accepts at most ${handshake.maxArtifactBytes}.`);
  }
  if (artifact.major !== ZPLC_CONSTANTS.VERSION_MAJOR || artifact.minor !== ZPLC_CONSTANTS.VERSION_MINOR
    || handshake.bytecodeAbiMajor !== ZPLC_CONSTANTS.VERSION_MAJOR || handshake.bytecodeAbiMinor !== ZPLC_CONSTANTS.VERSION_MINOR
    || artifact.major !== handshake.bytecodeAbiMajor || artifact.minor !== handshake.bytecodeAbiMinor) {
    fail(DEVICE_ADMISSION_CODE.BYTECODE_ABI_MISMATCH);
  }
  // IO-004: the I/O the program uses is compared with the description of the board the firmware was built for
  const io = checkProgramIo({ accesses: processImageAccesses(bytes), board: projectBoard, device: handshake.io });
  if (!io.ok) fail(io.code === 'ZPLC_DEVICE_IO_DESCRIPTION_MISSING' ? DEVICE_ADMISSION_CODE.IO_DESCRIPTION_MISSING
    : io.code === 'ZPLC_DEVICE_IO_DESCRIPTION_MISMATCH' ? DEVICE_ADMISSION_CODE.IO_DESCRIPTION_MISMATCH
      : DEVICE_ADMISSION_CODE.PROGRAM_IO_MISMATCH, io.detail);
  return handshake;
}

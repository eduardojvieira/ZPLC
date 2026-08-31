import { ZPLC_CONSTANTS } from '@zplc/compiler';
import { getZephyrBoardTarget, isKnownZephyrBoardTarget } from '../config/boardProfiles';

const MAX_TEXT_LENGTH = 128;
const REQUIRED_ROOT_KEYS = [
  'board', 'board_profile', 'zplc_version', 'zephyr_version', 'uptime_ms', 'cpu_freq_mhz',
  'device_protocol_version', 'bytecode_abi_major', 'bytecode_abi_minor', 'capabilities', 'memory',
] as const;
const REQUIRED_CAPABILITY_KEYS = ['fpu', 'mpu', 'scheduler', 'max_tasks'] as const;
const REQUIRED_MEMORY_KEYS = ['work_size', 'retain_size', 'ipi_size', 'opi_size'] as const;

export const DEVICE_ADMISSION_CODE = {
  HANDSHAKE_INVALID: 'ZPLC_DEVICE_HANDSHAKE_INVALID',
  PROTOCOL_UNSUPPORTED: 'ZPLC_DEVICE_PROTOCOL_UNSUPPORTED',
  PROJECT_TARGET_MISSING: 'ZPLC_DEVICE_PROJECT_TARGET_MISSING',
  PROJECT_TARGET_UNKNOWN: 'ZPLC_DEVICE_PROJECT_TARGET_UNKNOWN',
  BOARD_PROFILE_UNKNOWN: 'ZPLC_DEVICE_BOARD_PROFILE_UNKNOWN',
  BOARD_PROFILE_MISMATCH: 'ZPLC_DEVICE_BOARD_PROFILE_MISMATCH',
  ARTIFACT_INVALID: 'ZPLC_DEVICE_ARTIFACT_INVALID',
  BYTECODE_ABI_MISMATCH: 'ZPLC_DEVICE_BYTECODE_ABI_MISMATCH',
  PREFLIGHT_STALE: 'ZPLC_DEVICE_PREFLIGHT_STALE',
  RESULT_UNKNOWN: 'ZPLC_DEVICE_RESULT_UNKNOWN',
} as const;

export type DeviceAdmissionCode = (typeof DEVICE_ADMISSION_CODE)[keyof typeof DEVICE_ADMISSION_CODE];

export class DeviceAdmissionError extends Error {
  readonly code: DeviceAdmissionCode;

  constructor(code: DeviceAdmissionCode) {
    super(code);
    this.name = 'DeviceAdmissionError';
    this.code = code;
  }
}

export interface DeviceHandshake {
  readonly board: string;
  readonly boardProfile: string;
  readonly deviceProtocolVersion: number;
  readonly bytecodeAbiMajor: number;
  readonly bytecodeAbiMinor: number;
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
  capabilities: { fpu: boolean; mpu: boolean; scheduler: boolean; max_tasks: number };
  memory: { work_size: number; retain_size: number; ipi_size: number; opi_size: number };
}

function fail(code: DeviceAdmissionCode): never {
  throw new DeviceAdmissionError(code);
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

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function readText(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_TEXT_LENGTH && /^[\x20-\x7E]+$/.test(value) ? value : null;
}

function readInteger(value: unknown, max: number): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= max ? value : null;
}

function parseDeviceSystemInfoSnapshot(value: unknown): DeviceSystemInfo | null {
  const root = snapshotRecord(value);
  if (!root || !exactKeys(root, REQUIRED_ROOT_KEYS)) return null;
  const capabilities = snapshotRecord(root.capabilities);
  const memory = snapshotRecord(root.memory);
  if (!capabilities || !memory || !exactKeys(capabilities, REQUIRED_CAPABILITY_KEYS) || !exactKeys(memory, REQUIRED_MEMORY_KEYS)) return null;
  if (!(typeof capabilities.fpu === 'boolean' && typeof capabilities.mpu === 'boolean' && typeof capabilities.scheduler === 'boolean'
    && readInteger(capabilities.max_tasks, 1024) !== null
    && REQUIRED_MEMORY_KEYS.every((key) => readInteger(memory[key], 0xffffffff) !== null)
    && readText(root.board) !== null && readText(root.board_profile) !== null
    && readText(root.zplc_version) !== null && readText(root.zephyr_version) !== null
    && readInteger(root.uptime_ms, 0xffffffff) !== null && readInteger(root.cpu_freq_mhz, 1_000_000) !== null
    && readInteger(root.device_protocol_version, 0xffff) !== null
    && readInteger(root.bytecode_abi_major, 0xffff) !== null && readInteger(root.bytecode_abi_minor, 0xffff) !== null)) return null;
  return {
    board: root.board as string, board_profile: root.board_profile as string,
    zplc_version: root.zplc_version as string, zephyr_version: root.zephyr_version as string,
    uptime_ms: root.uptime_ms as number, cpu_freq_mhz: root.cpu_freq_mhz as number,
    device_protocol_version: root.device_protocol_version as number,
    bytecode_abi_major: root.bytecode_abi_major as number, bytecode_abi_minor: root.bytecode_abi_minor as number,
    capabilities: { fpu: capabilities.fpu, mpu: capabilities.mpu, scheduler: capabilities.scheduler, max_tasks: capabilities.max_tasks as number },
    memory: { work_size: memory.work_size as number, retain_size: memory.retain_size as number, ipi_size: memory.ipi_size as number, opi_size: memory.opi_size as number },
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
  };
}

/** Parse into a detached safe copy for adapter caches and scheduler selection. */
export function parseDeviceSystemInfo(value: unknown): DeviceSystemInfo {
  return parseDeviceSystemInfoSnapshot(value) ?? fail(DEVICE_ADMISSION_CODE.HANDSHAKE_INVALID);
}

function readArtifactAbi(bytes: Uint8Array): { major: number; minor: number } {
  if (bytes.byteLength < 8) fail(DEVICE_ADMISSION_CODE.ARTIFACT_INVALID);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== ZPLC_CONSTANTS.MAGIC) fail(DEVICE_ADMISSION_CODE.ARTIFACT_INVALID);
  return { major: view.getUint16(4, true), minor: view.getUint16(6, true) };
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
  if (artifact.major !== ZPLC_CONSTANTS.VERSION_MAJOR || artifact.minor !== ZPLC_CONSTANTS.VERSION_MINOR
    || handshake.bytecodeAbiMajor !== ZPLC_CONSTANTS.VERSION_MAJOR || handshake.bytecodeAbiMinor !== ZPLC_CONSTANTS.VERSION_MINOR
    || artifact.major !== handshake.bytecodeAbiMajor || artifact.minor !== handshake.bytecodeAbiMinor) {
    fail(DEVICE_ADMISSION_CODE.BYTECODE_ABI_MISMATCH);
  }
  return handshake;
}

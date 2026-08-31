import { describe, expect, it } from 'bun:test';

import {
  DeviceAdmissionError,
  parseDeviceHandshake,
  parseDeviceSystemInfo,
  validateHardwareDeployAdmission,
} from './deviceHandshake';
import { ZPLC_CONSTANTS } from '@zplc/compiler';

const info = {
  board: 'stm32f746g_disco',
  board_profile: 'stm32f746g_disco/stm32f746xx',
  zplc_version: '1.0.0',
  zephyr_version: '4.0.0',
  uptime_ms: 0,
  cpu_freq_mhz: 216,
  device_protocol_version: 1,
  bytecode_abi_major: 1,
  bytecode_abi_minor: 0,
  capabilities: { fpu: true, mpu: true, scheduler: true, max_tasks: 4 },
  memory: { work_size: 1, retain_size: 1, ipi_size: 1, opi_size: 1 },
};

function artifact(major = 1, minor = 0): Uint8Array {
  const bytes = new Uint8Array(ZPLC_CONSTANTS.HEADER_SIZE);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, ZPLC_CONSTANTS.MAGIC, true);
  view.setUint16(4, major, true);
  view.setUint16(6, minor, true);
  return bytes;
}

describe('device handshake admission', () => {
  it('accepts an exact v1 handshake and same artifact ABI', () => {
    const handshake = parseDeviceHandshake(info);
    expect(validateHardwareDeployAdmission(artifact(), 'stm32f746g_disco', handshake)).toEqual(handshake);
  });

  it('rejects non-plain, malformed, oversized and legacy payloads without echoing them', () => {
    const secret = 'sentinel-secret';
    const getter = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(getter, 'board', { enumerable: true, get: () => { throw new Error(secret); } });
    for (const payload of [
      { ...info, extra: secret },
      { ...info, board: secret.repeat(20) },
      { ...info, board: `board\n${secret}` },
      { ...info, zplc_version: `1.0\u0000${secret}` },
      { ...info, device_protocol_version: undefined },
      getter,
      Object.assign(Object.create({ inherited: true }), info),
      new Proxy({}, { getPrototypeOf: () => { throw new Error(secret); } }),
      new Proxy({}, { ownKeys: () => { throw new Error(secret); } }),
    ]) {
      expect(() => parseDeviceHandshake(payload)).toThrow(DeviceAdmissionError);
      expect(() => parseDeviceHandshake(payload)).not.toThrow(secret);
    }
  });

  it('accepts uint32 uptime and memory snapshots, rejects overflow, and detaches the cache copy', () => {
    const payload = {
      ...info,
      uptime_ms: 0xffffffff,
      memory: { work_size: 0xffffffff, retain_size: 0xffffffff, ipi_size: 0xffffffff, opi_size: 0xffffffff },
    };
    const parsed = parseDeviceSystemInfo(payload);
    payload.memory.work_size = 1;
    expect(parsed.uptime_ms).toBe(0xffffffff);
    expect(parsed.memory.work_size).toBe(0xffffffff);
    for (const invalid of [
      { ...info, uptime_ms: 0x1_0000_0000 },
      { ...info, memory: { ...info.memory, work_size: 0x1_0000_0000 } },
      { ...info, cpu_freq_mhz: 1_000_001 },
      { ...info, capabilities: { ...info.capabilities, max_tasks: 1025 } },
    ]) expect(() => parseDeviceSystemInfo(invalid)).toThrow('ZPLC_DEVICE_HANDSHAKE_INVALID');
  });

  it('returns stable, content-free codes for artifact, protocol, board and ABI denials', () => {
    const handshake = parseDeviceHandshake(info);
    for (const [bytes, projectBoard, currentHandshake, code] of [
      [new Uint8Array(7), 'stm32f746g_disco', handshake, 'ZPLC_DEVICE_ARTIFACT_INVALID'],
      [artifact(), 'missing', handshake, 'ZPLC_DEVICE_PROJECT_TARGET_UNKNOWN'],
      [artifact(), 'stm32f746g_disco', { ...handshake, deviceProtocolVersion: 2 }, 'ZPLC_DEVICE_PROTOCOL_UNSUPPORTED'],
      [artifact(2), 'stm32f746g_disco', handshake, 'ZPLC_DEVICE_BYTECODE_ABI_MISMATCH'],
      [artifact(2), 'stm32f746g_disco', { ...handshake, bytecodeAbiMajor: 2 }, 'ZPLC_DEVICE_BYTECODE_ABI_MISMATCH'],
      [artifact(), 'nucleo_h743zi', handshake, 'ZPLC_DEVICE_BOARD_PROFILE_MISMATCH'],
      [artifact(), 'stm32f746g_disco', { ...handshake, boardProfile: 'unknown/profile' }, 'ZPLC_DEVICE_BOARD_PROFILE_UNKNOWN'],
    ] as const) {
      expect(() => validateHardwareDeployAdmission(bytes, projectBoard, currentHandshake)).toThrow(code);
    }
  });

  it('accepts an Opta legacy board name when its reported canonical profile is exact', () => {
    const handshake = parseDeviceHandshake({
      ...info,
      board: 'arduino_opta',
      board_profile: 'arduino_opta/stm32h747xx/m7',
    });
    expect(validateHardwareDeployAdmission(artifact(), 'arduino_opta_wifi', handshake)).toEqual(handshake);
  });
});

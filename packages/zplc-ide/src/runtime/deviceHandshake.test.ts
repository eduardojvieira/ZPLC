import { describe, expect, it } from 'bun:test';

import {
  DeviceAdmissionError,
  joinDeviceIo,
  parseDeviceHandshake,
  parseDeviceSystemInfo,
  validateHardwareDeployAdmission,
} from './deviceHandshake';
import { ZPLC_CONSTANTS, ZPLC_CONTRACT } from '@zplc/compiler';
import { getBoardIoIdentity } from '../config/boardProfiles';

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
  draft_counter: ZPLC_CONSTANTS.DRAFT_COUNTER,
  capabilities: { fpu: true, mpu: true, scheduler: true, max_tasks: 4 },
  memory: { work_size: 1, retain_size: 1, ipi_size: 1, opi_size: 1 },
};

/** A header and one code segment holding the given code (HALT by default: it touches no process image). */
function artifact(
  major = 1,
  minor = 0,
  draft: number = ZPLC_CONSTANTS.DRAFT_COUNTER,
  code: number[] = [ZPLC_CONTRACT.Opcode.HALT],
): Uint8Array {
  const table = ZPLC_CONSTANTS.HEADER_SIZE + ZPLC_CONSTANTS.SEGMENT_ENTRY_SIZE;
  const bytes = new Uint8Array(table + code.length);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, ZPLC_CONSTANTS.MAGIC, true);
  view.setUint16(4, major, true);
  view.setUint16(6, minor, true);
  view.setUint32(16, code.length, true);
  view.setUint16(26, 1, true);
  view.setUint32(ZPLC_CONSTANTS.DRAFT_COUNTER_OFFSET, draft, true);
  view.setUint16(ZPLC_CONSTANTS.HEADER_SIZE, ZPLC_CONSTANTS.SEGMENT_TYPE_CODE, true);
  view.setUint32(ZPLC_CONSTANTS.HEADER_SIZE + 4, code.length, true);
  bytes.set(code, table);
  return bytes;
}

/** The handshake of a firmware image that predates the draft counter. */
function withoutCounter(): Record<string, unknown> {
  const legacy: Record<string, unknown> = { ...info };
  delete legacy.draft_counter;
  return legacy;
}

function refusal(bytes: Uint8Array, handshake: ReturnType<typeof parseDeviceHandshake>): DeviceAdmissionError {
  try {
    validateHardwareDeployAdmission(bytes, 'stm32f746g_disco', handshake);
  } catch (error) {
    if (error instanceof DeviceAdmissionError) return error;
    throw error;
  }
  throw new Error('the deploy was admitted');
}

describe('the program memory a firmware reports (COM-028)', () => {
  const withCapacity = (maxArtifact: number) => ({
    ...info,
    memory: { work_size: 8192, retain_size: 4096, ipi_size: 4096, opi_size: 4096, code_size: maxArtifact, max_artifact_size: maxArtifact },
  });

  it('accepts what the firmware prints from RT-028 on: the code size and the largest artifact', () => {
    // `zplc sys info --json` of the application carries both keys; a parser that took exactly four refused the device
    const handshake = parseDeviceHandshake(withCapacity(4096));
    expect(handshake.maxArtifactBytes).toBe(4096);
    expect(parseDeviceHandshake(info).maxArtifactBytes).toBeNull();
  });

  it('still refuses a key that is not one of those', () => {
    expect(() => parseDeviceSystemInfo({ ...info, memory: { ...withCapacity(4096).memory, secret: 1 } })).toThrow(
      'ZPLC_DEVICE_HANDSHAKE_INVALID',
    );
    expect(() => parseDeviceSystemInfo({ ...info, memory: { ...withCapacity(4096).memory, code_size: -1 } })).toThrow(
      'ZPLC_DEVICE_HANDSHAKE_INVALID',
    );
  });

  it('refuses a program larger than the device accepts, with both numbers, and accepts one that fits', () => {
    const big = artifact(1, 0, ZPLC_CONSTANTS.DRAFT_COUNTER, new Array(100).fill(ZPLC_CONTRACT.Opcode.HALT));
    const refused = refusal(big, parseDeviceHandshake(withCapacity(64)));
    expect(refused.code).toBe('ZPLC_DEVICE_ARTIFACT_TOO_LARGE');
    expect(refused.detail).toBe(`The program is ${big.byteLength} bytes and this device accepts at most 64.`);
    expect(validateHardwareDeployAdmission(big, 'stm32f746g_disco', parseDeviceHandshake(withCapacity(big.byteLength)))).toBeDefined();
  });
});

describe('device handshake admission', () => {
  it('accepts an exact v1 handshake and same artifact ABI', () => {
    const handshake = parseDeviceHandshake(info);
    expect(validateHardwareDeployAdmission(artifact(), 'stm32f746g_disco', handshake)).toEqual(handshake);
  });

  it('rejects non-plain, malformed, oversized and legacy payloads without echoing them', () => {
    const secret = 'sentinel-secret';
    const getter = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(getter, 'board', {
      enumerable: true,
      get: () => {
        throw new Error(secret);
      },
    });
    for (const payload of [
      { ...info, extra: secret },
      { ...info, board: secret.repeat(20) },
      { ...info, board: `board\n${secret}` },
      { ...info, zplc_version: `1.0\u0000${secret}` },
      { ...info, device_protocol_version: undefined },
      getter,
      Object.assign(Object.create({ inherited: true }), info),
      new Proxy(
        {},
        {
          getPrototypeOf: () => {
            throw new Error(secret);
          },
        },
      ),
      new Proxy(
        {},
        {
          ownKeys: () => {
            throw new Error(secret);
          },
        },
      ),
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
    ])
      expect(() => parseDeviceSystemInfo(invalid)).toThrow('ZPLC_DEVICE_HANDSHAKE_INVALID');
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

  // CMP-052: the draft counter of the firmware image is part of the handshake; a different one is refused with both numbers.
  describe('draft contract counter', () => {
    const other = ZPLC_CONSTANTS.DRAFT_COUNTER + 3;

    it('reads the counter the firmware reports', () => {
      expect(parseDeviceHandshake(info).draftCounter).toBe(ZPLC_CONSTANTS.DRAFT_COUNTER);
      expect(parseDeviceSystemInfo(info).draft_counter).toBe(ZPLC_CONSTANTS.DRAFT_COUNTER);
    });

    it('parses an image that reports no counter as none, and refuses to deploy to it', () => {
      const handshake = parseDeviceHandshake(withoutCounter());
      expect(handshake.draftCounter).toBeNull();
      const error = refusal(artifact(), handshake);
      expect(error.code).toBe('ZPLC_DEVICE_BYTECODE_ABI_MISMATCH');
      expect(error.detail).toBe(`Program was built for contract draft ${ZPLC_CONSTANTS.DRAFT_COUNTER}, this runtime is draft none`);
    });

    it('refuses an artifact built for another draft and shows both numbers', () => {
      const error = refusal(artifact(1, 0, other), parseDeviceHandshake(info));
      expect(error.code).toBe('ZPLC_DEVICE_BYTECODE_ABI_MISMATCH');
      expect(error.detail).toBe(`Program was built for contract draft ${other}, this runtime is draft ${ZPLC_CONSTANTS.DRAFT_COUNTER}`);
    });

    it('refuses a firmware image on another draft and shows both numbers', () => {
      const handshake = parseDeviceHandshake({ ...info, draft_counter: other });
      const error = refusal(artifact(), handshake);
      expect(error.code).toBe('ZPLC_DEVICE_BYTECODE_ABI_MISMATCH');
      expect(error.detail).toBe(`Program was built for contract draft ${ZPLC_CONSTANTS.DRAFT_COUNTER}, this runtime is draft ${other}`);
    });

    it('says none for an artifact built before the counter', () => {
      const error = refusal(artifact(1, 0, 0), parseDeviceHandshake(info));
      expect(error.detail).toBe(`Program was built for contract draft none, this runtime is draft ${ZPLC_CONSTANTS.DRAFT_COUNTER}`);
    });

    it('keeps the message the content-free code and carries the numbers in detail only', () => {
      const error = refusal(artifact(1, 0, other), parseDeviceHandshake(info));
      expect(error.message).toBe('ZPLC_DEVICE_BYTECODE_ABI_MISMATCH');
    });

    it('rejects a counter that is not a uint32 integer', () => {
      for (const draft_counter of [-1, 1.5, 0x1_0000_0000, '1', null]) {
        expect(() => parseDeviceHandshake({ ...info, draft_counter })).toThrow('ZPLC_DEVICE_HANDSHAKE_INVALID');
      }
    });
  });
});

describe('device handshake: the I/O description of the firmware (IO-004)', () => {
  const identity = getBoardIoIdentity('stm32f746g_disco')!;
  const io = { schema: 1, board_id: identity.boardId, hash: identity.hash, channels: 2, input_bytes: 1, output_bytes: 1 };
  const Op = ZPLC_CONTRACT.Opcode;
  const storeOutputByte = (byte: number) => [Op.STORE8, (0x1000 + byte) & 0xff, (0x1000 + byte) >> 8, Op.HALT];
  const loadInputByte = (byte: number) => [Op.LOAD8, byte & 0xff, byte >> 8, Op.HALT];

  it('reads the io object of the handshake and keeps it apart from the cache copy', () => {
    const handshake = parseDeviceHandshake({ ...info, io });
    expect(handshake.io).toEqual({ schema: 1, boardId: identity.boardId, hash: identity.hash, channels: 2, inputBytes: 1, outputBytes: 1 });
    expect(parseDeviceHandshake(info).io).toBeNull();
  });

  it('joins the answer of `sys io` to the system information, which keeps the keys it had', async () => {
    const system = parseDeviceSystemInfo(info);
    const joined = await joinDeviceIo(system, async () => io);
    expect(joined.io).toEqual(io);
    expect(Object.keys(system)).not.toContain('io');
    expect(parseDeviceHandshake(joined).io?.hash).toBe(identity.hash);
  });

  it('leaves the system information as it is when the image does not answer `sys io` or answers something else', async () => {
    const system = parseDeviceSystemInfo(info);
    for (const answer of [
      async () => {
        throw new Error('Command timeout');
      },
      async () => ({ ...io, extra: 1 }),
      async () => 'ERROR: unknown command',
    ]) {
      expect((await joinDeviceIo(system, answer)).io).toBeUndefined();
    }
  });

  it('rejects an io object that is not exactly the typed v1 shape', () => {
    for (const bad of [
      { ...io, extra: 1 },
      { ...io, schema: 2 },
      { ...io, hash: 'XYZ' },
      { ...io, hash: 'ABCDEF01' },
      { ...io, channels: -1 },
      { ...io, board_id: '' },
      'text',
      null,
    ])
      expect(() => parseDeviceHandshake({ ...info, io: bad })).toThrow(DeviceAdmissionError);
  });

  it('admits a program that stays on the channels of the board', () => {
    const handshake = parseDeviceHandshake({ ...info, io });
    expect(
      validateHardwareDeployAdmission(artifact(1, 0, ZPLC_CONSTANTS.DRAFT_COUNTER, storeOutputByte(0)), 'stm32f746g_disco', handshake),
    ).toEqual(handshake);
  });

  it('refuses a program that uses a byte the board has no channel for, naming the board', () => {
    const error = refusal(artifact(1, 0, ZPLC_CONSTANTS.DRAFT_COUNTER, storeOutputByte(3)), parseDeviceHandshake({ ...info, io }));
    expect(error.code).toBe('ZPLC_DEVICE_PROGRAM_IO_MISMATCH');
    expect(error.detail).toContain('STM32F746G Discovery');
    expect(error.detail).toContain('%QB3');
  });

  it('refuses a program that uses I/O on firmware that does not report its description', () => {
    const error = refusal(artifact(1, 0, ZPLC_CONSTANTS.DRAFT_COUNTER, loadInputByte(0)), parseDeviceHandshake(info));
    expect(error.code).toBe('ZPLC_DEVICE_IO_DESCRIPTION_MISSING');
  });

  it('refuses when the firmware was built from another description than the one Studio holds', () => {
    const error = refusal(
      artifact(1, 0, ZPLC_CONSTANTS.DRAFT_COUNTER, loadInputByte(0)),
      parseDeviceHandshake({ ...info, io: { ...io, hash: '00000000' } }),
    );
    expect(error.code).toBe('ZPLC_DEVICE_IO_DESCRIPTION_MISMATCH');
    expect(error.detail).toContain('00000000');
  });

  it('admits a program that touches no process image on firmware that reports nothing', () => {
    const handshake = parseDeviceHandshake(info);
    expect(validateHardwareDeployAdmission(artifact(), 'stm32f746g_disco', handshake)).toEqual(handshake);
  });
});

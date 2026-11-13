import { describe, expect, it } from 'bun:test';
import { ZPLC_CONSTANTS, ZPLC_CONTRACT } from '@zplc/compiler';
import { getBoardIoIdentity } from '../config/boardProfiles';
import { DeviceAdmissionError, parseDeviceHandshake, validateHardwareDeployAdmission } from './deviceHandshake';

const Op = ZPLC_CONTRACT.Opcode;
const identity = getBoardIoIdentity('rpi_pico')!;
const info = {
  board: 'rpi_pico',
  board_profile: 'rpi_pico/rp2040',
  zplc_version: '1.0.0',
  zephyr_version: '4.0.0',
  uptime_ms: 0,
  cpu_freq_mhz: 125,
  device_protocol_version: 1,
  bytecode_abi_major: 1,
  bytecode_abi_minor: 0,
  draft_counter: ZPLC_CONSTANTS.DRAFT_COUNTER,
  capabilities: { fpu: false, mpu: false, scheduler: true, max_tasks: 4 },
  memory: { work_size: 1, retain_size: 1, ipi_size: 1, opi_size: 1 },
  io: { schema: 1, board_id: identity.boardId, hash: identity.hash, channels: 14, input_bytes: 18, output_bytes: 1 },
};

function artifact(code: number[]): Uint8Array {
  const table = ZPLC_CONSTANTS.HEADER_SIZE + ZPLC_CONSTANTS.SEGMENT_ENTRY_SIZE;
  const bytes = new Uint8Array(table + code.length);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, ZPLC_CONSTANTS.MAGIC, true);
  view.setUint16(4, 1, true);
  view.setUint16(6, 0, true);
  view.setUint32(16, code.length, true);
  view.setUint16(26, 1, true);
  view.setUint32(ZPLC_CONSTANTS.DRAFT_COUNTER_OFFSET, ZPLC_CONSTANTS.DRAFT_COUNTER, true);
  view.setUint16(ZPLC_CONSTANTS.HEADER_SIZE, ZPLC_CONSTANTS.SEGMENT_TYPE_CODE, true);
  view.setUint32(ZPLC_CONSTANTS.HEADER_SIZE + 4, code.length, true);
  bytes.set(code, table);
  return bytes;
}

const loadInput = (byte: number) => artifact([Op.LOAD8, byte & 0xff, byte >> 8, Op.HALT]);
const handshake = () => parseDeviceHandshake(info);

describe('hardware deploy admission with the plant map of the project (LNK-013)', () => {
  it('admits an input the plant feeds and no pin covers', () => {
    const shake = handshake();
    expect(validateHardwareDeployAdmission(loadInput(2), 'rpi_pico', shake, [{ region: 'I', byte: 2, width: 1 }])).toEqual(shake);
  });

  it('refuses an input nothing provides, with the program I/O mismatch code', () => {
    try {
      validateHardwareDeployAdmission(loadInput(3), 'rpi_pico', handshake(), [{ region: 'I', byte: 2, width: 1 }]);
      throw new Error('the deploy was admitted');
    } catch (error) {
      expect(error).toBeInstanceOf(DeviceAdmissionError);
      expect((error as DeviceAdmissionError).code).toBe('ZPLC_DEVICE_PROGRAM_IO_MISMATCH');
      expect((error as DeviceAdmissionError).detail).toContain('%IB3');
    }
  });

  it('without a plant map a deploy is admitted or refused exactly as before', () => {
    const shake = handshake();
    expect(validateHardwareDeployAdmission(loadInput(0), 'rpi_pico', shake)).toEqual(shake);
    expect(() => validateHardwareDeployAdmission(loadInput(2), 'rpi_pico', shake)).toThrow(DeviceAdmissionError);
  });
});

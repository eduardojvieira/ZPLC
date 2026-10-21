import { describe, expect, test } from 'bun:test';
import { ZPLC_CONTRACT, createZplcFile } from '@zplc/compiler';
import { getBoardIoIdentity } from '../config/boardProfiles';
import { checkLocatedVariables, checkProgramIo, type DeviceIoIdentity } from './ioAdmission';
import { processImageAccesses } from './programIo';

const Op = ZPLC_CONTRACT.Opcode;

/** An artifact whose code is the given instructions (opcode, then a 16-bit little endian address for memory ops). */
function program(instructions: Array<[number, number?]>): Uint8Array {
  const code: number[] = [];
  for (const [opcode, address] of instructions) {
    code.push(opcode);
    if (address !== undefined) code.push(address & 0xff, (address >> 8) & 0xff);
  }
  code.push(Op.HALT);
  return createZplcFile(new Uint8Array(code), 0);
}

function device(board: string): DeviceIoIdentity {
  const identity = getBoardIoIdentity(board)!;
  return {
    schema: 1,
    boardId: identity.boardId,
    hash: identity.hash,
    channels: 9,
    inputBytes: identity.inputBytes,
    outputBytes: identity.outputBytes,
  };
}

const accessesOf = (instructions: Array<[number, number?]>) => processImageAccesses(program(instructions));

describe('deploy admission by I/O (IO-004)', () => {
  test('a program that stays on the channels of its board is admitted', () => {
    const accesses = accessesOf([
      [Op.LOAD8, 0x0000],
      [Op.STORE8, 0x1000],
      [Op.LOAD16, 0x0008],
    ]);
    expect(checkProgramIo({ accesses, board: 'rpi_pico', device: device('rpi_pico') })).toEqual({ ok: true });
  });

  test('a program that uses a byte of the output image the board has no channel in is refused, naming the board', () => {
    const accesses = accessesOf([[Op.STORE8, 0x1003]]);
    const result = checkProgramIo({ accesses, board: 'rpi_pico', device: device('rpi_pico') });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('ZPLC_DEVICE_PROGRAM_IO_MISMATCH');
      expect(result.detail).toContain('Raspberry Pi Pico (RP2040)');
      expect(result.detail).toContain('%QB3');
    }
  });

  test('an analog input on a board without analog channels is refused', () => {
    const accesses = accessesOf([[Op.LOAD16, 0x0008]]);
    const result = checkProgramIo({ accesses, board: 'nucleo_h743zi', device: device('nucleo_h743zi') });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.detail).toContain('STM32 Nucleo-H743ZI');
  });

  test('the system registers of the input image are readable on every board', () => {
    const accesses = accessesOf([
      [Op.LOAD32, 0x0ff0],
      [Op.LOAD8, 0x0ff9],
    ]);
    expect(checkProgramIo({ accesses, board: 'nucleo_h743zi', device: device('nucleo_h743zi') })).toEqual({ ok: true });
  });

  test('a program that touches no process image is admitted even when the firmware reports no description', () => {
    const accesses = accessesOf([[Op.LOAD8, 0x2000]]);
    expect(checkProgramIo({ accesses, board: 'rpi_pico', device: null })).toEqual({ ok: true });
  });

  test('a program that uses I/O is refused when the firmware does not report its description', () => {
    const result = checkProgramIo({ accesses: accessesOf([[Op.LOAD8, 0x0000]]), board: 'rpi_pico', device: null });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('ZPLC_DEVICE_IO_DESCRIPTION_MISSING');
  });

  test('a firmware whose description is not the one Studio holds is refused with both identities', () => {
    const other = { ...device('rpi_pico'), hash: 'deadbeef' };
    const result = checkProgramIo({ accesses: accessesOf([[Op.LOAD8, 0x0000]]), board: 'rpi_pico', device: other });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('ZPLC_DEVICE_IO_DESCRIPTION_MISMATCH');
      expect(result.detail).toContain('deadbeef');
      expect(result.detail).toContain(getBoardIoIdentity('rpi_pico')!.hash);
    }
  });

  test('a firmware that describes another board is refused', () => {
    const other = { ...device('rpi_pico'), boardId: 'nucleo-h743zi' };
    const result = checkProgramIo({ accesses: accessesOf([[Op.LOAD8, 0x0000]]), board: 'rpi_pico', device: other });
    expect(result.ok).toBe(false);
  });

  test('a board without a description (host, custom) is not checked', () => {
    expect(checkProgramIo({ accesses: accessesOf([[Op.STORE8, 0x1003]]), board: 'posix', device: null })).toEqual({ ok: true });
  });

  test('code that cannot be read is refused, not admitted', () => {
    const result = checkProgramIo({ accesses: undefined, board: 'rpi_pico', device: device('rpi_pico') });
    expect(result.ok).toBe(false);
  });
});

describe('a located variable the board has no channel for is a build error (IO-003)', () => {
  test('a bit on a channel of the board is accepted', () => {
    expect(checkLocatedVariables('rpi_pico', [{ name: 'Led', region: 'OPI', addr: 0x1000, size: 1, bitOffset: 3 }])).toEqual([]);
  });

  test('a bit past the channels of the board is an error that names the variable, the address and the board', () => {
    const errors = checkLocatedVariables('rpi_pico', [{ name: 'Led', region: 'OPI', addr: 0x1000, size: 1, bitOffset: 6 }]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("'Led'");
    expect(errors[0]).toContain('%QX0.6');
    expect(errors[0]).toContain('Raspberry Pi Pico (RP2040)');
  });

  test('a word needs an analog channel at its address', () => {
    expect(checkLocatedVariables('rpi_pico', [{ name: 'Temp', region: 'IPI', addr: 0x0010, size: 2 }])).toEqual([]);
    const errors = checkLocatedVariables('rpi_pico', [{ name: 'Temp', region: 'IPI', addr: 0x0020, size: 2 }]);
    expect(errors[0]).toContain('%IW16');
  });

  test('host and custom boards are not checked', () => {
    expect(checkLocatedVariables('posix', [{ name: 'X', region: 'OPI', addr: 0x1fff, size: 1, bitOffset: 7 }])).toEqual([]);
    expect(checkLocatedVariables(undefined, [{ name: 'X', region: 'OPI', addr: 0x1fff, size: 1, bitOffset: 7 }])).toEqual([]);
  });
});

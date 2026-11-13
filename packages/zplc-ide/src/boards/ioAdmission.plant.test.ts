import { describe, expect, test } from 'bun:test';
import { ZPLC_CONTRACT, createZplcFile } from '@zplc/compiler';
import { getBoardIoIdentity } from '../config/boardProfiles';
import { checkLocatedVariables, checkProgramIo, type DeviceIoIdentity, type PlantProvidedInput } from './ioAdmission';
import { processImageAccesses } from './programIo';

const Op = ZPLC_CONTRACT.Opcode;

function program(instructions: Array<[number, number]>): Uint8Array {
  const code: number[] = [];
  for (const [opcode, address] of instructions) code.push(opcode, address & 0xff, (address >> 8) & 0xff);
  code.push(Op.HALT);
  return createZplcFile(new Uint8Array(code), 0);
}

const identity = getBoardIoIdentity('rpi_pico')!;
const device: DeviceIoIdentity = {
  schema: 1,
  boardId: identity.boardId,
  hash: identity.hash,
  channels: 14,
  inputBytes: identity.inputBytes,
  outputBytes: identity.outputBytes,
};
const check = (instructions: Array<[number, number]>, plantProvided?: readonly PlantProvidedInput[]) =>
  checkProgramIo({ accesses: processImageAccesses(program(instructions)), board: 'rpi_pico', device, plantProvided });

// the Pico has input channels at bytes 0 and 8..17 only: %IB2 and %IB3 have no pin
const slot = (byte: number, width = 1): PlantProvidedInput => ({ region: 'I', byte, width });

describe('deploy admission counts what the plant feeds (LNK-013)', () => {
  test('an input the plant provides and no pin covers is admitted', () => {
    const result = check([[Op.LOAD8, 2]], [slot(2)]);
    expect(result).toEqual({ ok: true, plantFed: ['%IB2'] });
  });

  test('an input neither a pin nor the plant provides is still refused with ZPLC_DEVICE_PROGRAM_IO_MISMATCH and the address named', () => {
    const result = check([[Op.LOAD8, 3]], [slot(2)]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('ZPLC_DEVICE_PROGRAM_IO_MISMATCH');
      expect(result.detail).toContain('%IB3');
    }
  });

  test('an output with no channel is refused even when a plant map exists', () => {
    const result = check([[Op.STORE8, 0x1003]], [slot(3)]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.detail).toContain('%QB3');
  });

  test('a plant slot covering part of a word leaves the other byte refused', () => {
    const result = check([[Op.LOAD16, 2]], [slot(2)]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.detail).toContain('%IB3');
  });

  test('no plant map: the result is byte-identical to before', () => {
    expect(check([[Op.LOAD8, 0]])).toEqual({ ok: true });
    expect(check([[Op.LOAD8, 0]], [])).toEqual({ ok: true });
    const refused = check([[Op.LOAD8, 2]]);
    expect(refused).toEqual(check([[Op.LOAD8, 2]], []));
    expect(refused.ok).toBe(false);
  });

  test('located variable on a plant-provided input is not an error', () => {
    const located = [{ name: 'sensor', region: 'IPI' as const, addr: 2, size: 1 }];
    expect(checkLocatedVariables('rpi_pico', located, new Set(), [slot(2)])).toEqual([]);
    expect(checkLocatedVariables('rpi_pico', located)).toHaveLength(1);
    expect(checkLocatedVariables('rpi_pico', [{ name: 'lamp', region: 'OPI', addr: 0x1003, size: 1 }], new Set(), [slot(3)])).toHaveLength(
      1,
    );
  });
});

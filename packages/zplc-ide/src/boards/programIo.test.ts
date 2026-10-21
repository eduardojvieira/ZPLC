import { describe, expect, test } from 'bun:test';
import { ZPLC_CONTRACT, createZplcFile } from '@zplc/compiler';
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

describe('the process image a program touches, read from its code', () => {
  test('a load from the input image and a store to the output image are listed with their width', () => {
    const accesses = processImageAccesses(
      program([
        [Op.LOAD8, 0x0003],
        [Op.STORE16, 0x1004],
      ]),
    );
    expect(accesses).toEqual([
      { region: 'I', byte: 3, width: 1, access: 'read' },
      { region: 'Q', byte: 4, width: 2, access: 'write' },
    ]);
  });

  test('work memory and retentive memory are not process image', () => {
    expect(
      processImageAccesses(
        program([
          [Op.LOAD8, 0x2000],
          [Op.STORE32, 0x4000],
        ]),
      ),
    ).toEqual([]);
  });

  test('a wide access reports its width so that every byte can be checked', () => {
    expect(processImageAccesses(program([[Op.LOAD64, 0x0008]]))).toEqual([{ region: 'I', byte: 8, width: 8, access: 'read' }]);
  });

  test('an immediate that looks like an address is not an access', () => {
    expect(processImageAccesses(program([[Op.PUSH16, 0x0003]]))).toEqual([]);
  });

  test('bytes that are not an artifact have no readable code', () => {
    expect(processImageAccesses(new Uint8Array([1, 2, 3]))).toBeUndefined();
  });
});

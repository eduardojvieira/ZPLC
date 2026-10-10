/**
 * ZPLC Assembler - operand fields and directives (CMP-049, CMP-060)
 *
 * SPDX-License-Identifier: MIT
 *
 * An operand or a relocated address that does not fit its field is an error that names the source line;
 * it is never truncated. Every directive the assembler accepts has the effect the reference documents.
 * These are the assembler's own unit tests, so they may state assembly text.
 */

import { describe, test, expect } from 'bun:test';
import {
    AssemblerError,
    Opcode,
    assemble,
    assembleRaw,
    createMultiTaskZplcFile,
    createZplcFile,
    emitBytecode,
    relocateBytecode,
    TASK_TYPE,
} from './index';
import type { Instruction } from './index';

function failure(source: string): AssemblerError {
    try {
        assemble(source);
    } catch (error) {
        if (error instanceof AssemblerError) return error;
        throw error;
    }
    throw new Error('the source assembled');
}

describe('an operand that does not fit its field is an error, not a truncation (CMP-049)', () => {
    test.each([
        ['PUSH8 256', 'PUSH8', 8],
        ['PUSH8 -129', 'PUSH8', 8],
        ['PUSH16 65536', 'PUSH16', 16],
        ['PUSH16 -32769', 'PUSH16', 16],
        ['PUSH32 0x100000000', 'PUSH32', 32],
        ['PUSH32 -2147483649', 'PUSH32', 32],
        ['LOAD16 0x10000', 'LOAD16', 16],
        ['STORE8 70000', 'STORE8', 16],
        ['LOAD32 -1', 'LOAD32', 16],
        ['COMM_EXEC 0x100000000', 'COMM_EXEC', 32],
        ['COMM_STATUS -1', 'COMM_STATUS', 32],
    ])('%s', (line, mnemonic, bits) => {
        const error = failure(`NOP\n${line}\nHALT`);
        expect(error.lineNum).toBe(2);
        expect(error.line).toBe(line);
        expect(error.message).toContain(mnemonic);
        expect(error.message).toContain(`${bits}-bit`);
    });

    test.each([
        ['PUSH8 -128', [0x40, 0x80]],
        ['PUSH8 255', [0x40, 0xff]],
        ['PUSH16 -32768', [0x88, 0x00, 0x80]],
        ['PUSH16 65535', [0x88, 0xff, 0xff]],
        ['PUSH32 0xFFFFFFFF', [0xc0, 0xff, 0xff, 0xff, 0xff]],
        ['PUSH32 -2147483648', [0xc0, 0x00, 0x00, 0x00, 0x80]],
        ['LOAD16 0xFFFF', [0x81, 0xff, 0xff]],
        ['COMM_EXEC 0xFFFFFFFF', [0xd0, 0xff, 0xff, 0xff, 0xff]],
    ])('the extremes of the field still assemble: %s', (line, bytes) => {
        expect(Array.from(assembleRaw(line))).toEqual(bytes);
    });

    test('a numeric relative jump keeps to a signed byte', () => {
        expect(failure('JR 128').message).toContain('offset');
        expect(failure('JRZ -129').message).toContain('offset');
        expect(Array.from(assembleRaw('NOP\nNOP\nJR 0\nJR -2'))).toEqual([0, 0, 0x50, 0, 0x50, 0xfe]);
    });

    test('a relative jump to a label further than 127 bytes names the line of the jump', () => {
        const body = Array.from({ length: 200 }, () => 'NOP').join('\n');
        const error = failure(`JR far\n${body}\nfar:\nHALT`);
        expect(error.lineNum).toBe(1);
        expect(error.line).toBe('JR far');
        expect(error.message).toContain('out of range');
        const edge = Array.from({ length: 126 }, () => 'NOP').join('\n');
        expect(() => assemble(`JR near\n${edge}\nnear:\nHALT`)).not.toThrow();
        expect(() => assemble(`JR near\n${edge}\nNOP\nnear:\nHALT`)).not.toThrow();
        expect(() => assemble(`JR near\n${edge}\nNOP\nNOP\nnear:\nHALT`)).toThrow(AssemblerError);
    });

    test('a jump to an address outside the code is an error', () => {
        const error = failure('NOP\nJMP 0x9000\nHALT');
        expect(error.lineNum).toBe(2);
        expect(error.message).toContain('outside the code');
        expect(failure('CALL 6\nHALT').message).toContain('outside the code');
        expect(failure('JR 20\nHALT').message).toContain('outside the code');
        expect(Array.from(assembleRaw('JMP 3\nHALT'))).toEqual([0x90, 3, 0, 0x01]);
    });

    test('a jump to a label after the last instruction is an error', () => {
        const error = failure('JMP end\nHALT\nend:');
        expect(error.lineNum).toBe(1);
        expect(error.message).toContain('after the last instruction');
    });

    test('a label address that does not fit 16 bits is an error', () => {
        const body = Array.from({ length: 0x10000 }, () => 'NOP').join('\n');
        const error = failure(`${body}\nlate:\nNOP\nJMP late\nHALT`);
        expect(error.message).toContain('16-bit');
    });

    test('emitBytecode refuses an instruction that was built by hand with an operand that does not fit', () => {
        const instruction = (opcode: number, operand: number): Instruction => ({ opcode, operand, operandLabel: null, lineNum: 1, address: 0 });
        expect(() => emitBytecode([instruction(Opcode.PUSH8, 300)])).toThrow(AssemblerError);
        expect(() => emitBytecode([instruction(Opcode.LOAD16, 0x10000)])).toThrow(AssemblerError);
        expect(() => emitBytecode([instruction(Opcode.PUSH32, 2 ** 32)])).toThrow(AssemblerError);
        expect(() => emitBytecode([instruction(Opcode.PUSH8, 1.5)])).toThrow(AssemblerError);
        expect(Array.from(emitBytecode([instruction(Opcode.PUSH8, 200)]))).toEqual([0x40, 200]);
    });
});

describe('a relocated address that does not fit 16 bits is an error', () => {
    test('relocation past 0xFFFF', () => {
        const bytecode = new Uint8Array([Opcode.JMP, 0x00, 0xff, Opcode.HALT]);
        expect(() => relocateBytecode(bytecode, 0x200)).toThrow(AssemblerError);
        expect(Array.from(bytecode)).toEqual([Opcode.JMP, 0x00, 0xff, Opcode.HALT]);
    });

    test('a relocated address of exactly 0xFFFF still fits', () => {
        const bytecode = new Uint8Array([Opcode.CALL, 0xfe, 0xff, Opcode.HALT]);
        relocateBytecode(bytecode, 1);
        expect(Array.from(bytecode)).toEqual([Opcode.CALL, 0xff, 0xff, Opcode.HALT]);
    });

    test('an offset that is negative or not an integer is refused before anything is changed', () => {
        const bytecode = new Uint8Array([Opcode.JMP, 0x10, 0x00, Opcode.HALT]);
        expect(() => relocateBytecode(bytecode, -1)).toThrow(AssemblerError);
        expect(() => relocateBytecode(bytecode, 0.5)).toThrow(AssemblerError);
        expect(() => relocateBytecode(bytecode, 0x10000)).toThrow(AssemblerError);
        expect(Array.from(bytecode)).toEqual([Opcode.JMP, 0x10, 0x00, Opcode.HALT]);
    });
});

describe('the container fields are checked, not masked (CMP-049)', () => {
    const code = new Uint8Array([Opcode.HALT]);

    test('the entry point of a single-program file', () => {
        expect(() => createZplcFile(code, 0x10000)).toThrow(AssemblerError);
        expect(() => createZplcFile(code, -1)).toThrow(AssemblerError);
        expect(() => createZplcFile(code, 1)).toThrow(/entry point/i);
        expect(() => createZplcFile(code, 0)).not.toThrow();
    });

    test.each([
        ['address', { varAddr: 0x10000, varType: 1, tagId: 1, value: 0 }],
        ['data type', { varAddr: 0, varType: 256, tagId: 1, value: 0 }],
        ['tag id', { varAddr: 0, varType: 1, tagId: 256, value: 0 }],
        ['value', { varAddr: 0, varType: 1, tagId: 2, value: 2 ** 32 }],
        ['negative value', { varAddr: 0, varType: 1, tagId: 2, value: -1 }],
    ])('a tag %s that does not fit', (_name, tag) => {
        expect(() => createZplcFile(code, 0, [tag])).toThrow(AssemblerError);
        const task = { id: 0, type: TASK_TYPE.CYCLIC, priority: 1, intervalUs: 10_000, entryPoint: 0, stackSize: 4 };
        expect(() => createMultiTaskZplcFile(code, [task], [tag])).toThrow(AssemblerError);
    });
});

describe('every directive has its documented effect (CMP-060)', () => {
    test('.DB and .BYTE emit their values, in order, at the place they stand', () => {
        expect(Array.from(assembleRaw('NOP\n.DB 1, 2, 0x7F\nHALT'))).toEqual([0, 1, 2, 0x7f, 1]);
        expect(Array.from(assembleRaw('.BYTE 0xFF, -1, \'A\''))).toEqual([0xff, 0xff, 65]);
    });

    test('a label after .DB points past its bytes', () => {
        const bytes = assembleRaw('JMP over\n.DB 0, 0\nover:\nHALT');
        expect(Array.from(bytes)).toEqual([0x90, 5, 0, 0, 0, 0x01]);
    });

    test('.DB refuses a value that is not a byte, an empty list and a bad number', () => {
        expect(failure('.DB 256').message).toContain('8-bit');
        expect(failure('.DB -129').message).toContain('8-bit');
        expect(failure('.DB').message).toContain('.DB');
        expect(failure('.DB 1,,2').message).toContain('.DB');
        expect(failure('.DB nope').message).toContain('.DB');
        expect(failure('.BYTE 1, 300').lineNum).toBe(1);
    });

    test('.ORG moves the location counter forward, filling the gap with NOP, so that the labels are the offsets', () => {
        const result = assemble('NOP\n.ORG 4\nstart:\nHALT\nJMP start');
        expect(Array.from(result.bytecode)).toEqual([0, 0, 0, 0, 1, 0x90, 4, 0]);
        expect(result.labels.get('START')?.address).toBe(4);
    });

    test('.ORG at the current address is a no-op and a move backwards is an error', () => {
        expect(Array.from(assembleRaw('NOP\n.ORG 1\nHALT'))).toEqual([0, 1]);
        expect(failure('NOP\nNOP\n.ORG 1\nHALT').message).toContain('backwards');
        expect(failure('.ORG 0x10000').message).toContain('16-bit');
        expect(failure('.ORG -1').message).toContain('.ORG');
        expect(failure('.ORG').message).toContain('.ORG');
    });

    test('.ENTRY sets the entry point of the file, by label or by address, and it must be inside the code', () => {
        const byLabel = assemble('NOP\n.ENTRY go\ngo:\nHALT');
        expect(byLabel.entryPoint).toBe(1);
        expect(new DataView(byLabel.zplcFile.buffer).getUint16(24, true)).toBe(1);
        expect(assemble('NOP\n.ENTRY 1\nHALT').entryPoint).toBe(1);
        expect(failure('NOP\n.ENTRY 9\nHALT').message).toContain('outside the code');
        expect(failure('.ENTRY 0x10000\nHALT').message).toContain('16-bit');
        expect(failure('.ENTRY\nHALT').message).toContain('.ENTRY');
        const missing = failure('HALT\n.ENTRY nowhere');
        expect(missing.message).toContain('NOWHERE');
        expect(missing.lineNum).toBe(2);
    });

    test('.TAG records a variable tag in the TAGS segment, and takes exactly four numbers that fit', () => {
        const result = assemble('HALT\n.TAG 0x2000 4 2 100');
        expect(result.tags).toEqual([{ varAddr: 0x2000, varType: 4, tagId: 2, value: 100 }]);
        expect(result.zplcFile.length).toBe(32 + 3 * 8 + 1 + 8 + 4);
        expect(failure('.TAG 1 2 3').message).toContain('.TAG');
        expect(failure('.TAG 1 2 3 4 5').message).toContain('.TAG');
        expect(failure('.TAG 0x10000 4 2 0').message).toContain('16-bit');
        expect(failure('.TAG 0 256 2 0').message).toContain('8-bit');
        expect(failure('.TAG 0 4 256 0').message).toContain('8-bit');
        expect(failure('.TAG 0 4 2 0x100000000').message).toContain('32-bit');
    });

    test('an unknown directive is an error that names it', () => {
        const error = failure('NOP\n.SECTION text');
        expect(error.lineNum).toBe(2);
        expect(error.message).toContain('.SECTION');
    });
});

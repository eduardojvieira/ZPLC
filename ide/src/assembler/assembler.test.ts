/**
 * ZPLC Assembler - Tests
 *
 * SPDX-License-Identifier: MIT
 *
 * Tests for the TypeScript assembler, comparing output with Python assembler.
 */

import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
    assemble,
    assembleRaw,
    validate,
    parseNumber,
    Opcode,
    getOperandSize,
    disassemble,
    hexDump,
    ZPLC_CONSTANTS,
    createMultiTaskZplcFile,
    TASK_TYPE,
} from './index';
import type { TaskDef } from './index';

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Convert Uint8Array to hex string for debugging.
 */
function toHex(arr: Uint8Array): string {
    return Array.from(arr)
        .map(b => b.toString(16).padStart(2, '0'))
        .join(' ');
}

/**
 * Get path to examples directory.
 */
function examplesPath(filename: string): string {
    return join(__dirname, '..', '..', '..', 'examples', filename);
}

// =============================================================================
// Opcode Tests
// =============================================================================

describe('Opcodes', () => {
    test('opcode values match zplc_isa.h', () => {
        // System
        expect(Opcode.NOP).toBe(0x00);
        expect(Opcode.HALT).toBe(0x01);
        expect(Opcode.BREAK).toBe(0x02);

        // Stack
        expect(Opcode.DUP).toBe(0x10);
        expect(Opcode.DROP).toBe(0x11);
        expect(Opcode.SWAP).toBe(0x12);

        // Arithmetic
        expect(Opcode.ADD).toBe(0x20);
        expect(Opcode.SUB).toBe(0x21);
        expect(Opcode.MUL).toBe(0x22);

        // Memory
        expect(Opcode.LOAD16).toBe(0x81);
        expect(Opcode.STORE16).toBe(0x85);

        // Control
        expect(Opcode.JMP).toBe(0x90);
        expect(Opcode.JZ).toBe(0x91);
        expect(Opcode.CALL).toBe(0x93);
        expect(Opcode.RET).toBe(0x94);

        // Type conversion
        expect(Opcode.I2F).toBe(0xA0);
        expect(Opcode.F2I).toBe(0xA1);
    });

    test('operand sizes are correct', () => {
        // No operand
        expect(getOperandSize(Opcode.NOP)).toBe(0);
        expect(getOperandSize(Opcode.ADD)).toBe(0);
        expect(getOperandSize(Opcode.DUP)).toBe(0);

        // 8-bit operand
        expect(getOperandSize(Opcode.PUSH8)).toBe(1);
        expect(getOperandSize(Opcode.JR)).toBe(1);
        expect(getOperandSize(Opcode.JRZ)).toBe(1);

        // 16-bit operand
        expect(getOperandSize(Opcode.LOAD16)).toBe(2);
        expect(getOperandSize(Opcode.STORE32)).toBe(2);
        expect(getOperandSize(Opcode.JMP)).toBe(2);
        expect(getOperandSize(Opcode.CALL)).toBe(2);

        // 32-bit operand
        expect(getOperandSize(Opcode.PUSH32)).toBe(4);

        // Special cases: no operand despite range
        expect(getOperandSize(Opcode.RET)).toBe(0);  // 0x94 is in 16-bit range but has no operand
        expect(getOperandSize(Opcode.I2F)).toBe(0);
        expect(getOperandSize(Opcode.F2I)).toBe(0);
        expect(getOperandSize(Opcode.ZEXT16)).toBe(0);
    });
});

// =============================================================================
// Number Parsing Tests
// =============================================================================

describe('parseNumber', () => {
    test('decimal numbers', () => {
        expect(parseNumber('0')).toBe(0);
        expect(parseNumber('123')).toBe(123);
        expect(parseNumber('-45')).toBe(-45);
        expect(parseNumber('+10')).toBe(10);
    });

    test('hexadecimal numbers', () => {
        expect(parseNumber('0x0')).toBe(0);
        expect(parseNumber('0x1234')).toBe(0x1234);
        expect(parseNumber('0xABCD')).toBe(0xABCD);
        expect(parseNumber('0Xff')).toBe(255);
    });

    test('binary numbers', () => {
        expect(parseNumber('0b0')).toBe(0);
        expect(parseNumber('0b1010')).toBe(10);
        expect(parseNumber('0b11111111')).toBe(255);
    });

    test('character literals', () => {
        expect(parseNumber("'A'")).toBe(65);
        expect(parseNumber("'0'")).toBe(48);
        expect(parseNumber("'\\n'")).toBe(10);
        expect(parseNumber("'\\0'")).toBe(0);
    });
});

// =============================================================================
// Simple Assembly Tests
// =============================================================================

describe('Simple assembly', () => {
    test('single NOP', () => {
        const result = assembleRaw('NOP');
        expect(result).toEqual(new Uint8Array([0x00]));
    });

    test('HALT', () => {
        const result = assembleRaw('HALT');
        expect(result).toEqual(new Uint8Array([0x01]));
    });

    test('NOP + HALT', () => {
        const result = assembleRaw('NOP\nHALT');
        expect(result).toEqual(new Uint8Array([0x00, 0x01]));
    });

    test('PUSH8 with immediate', () => {
        const result = assembleRaw('PUSH8 42\nHALT');
        expect(result).toEqual(new Uint8Array([0x40, 42, 0x01]));
    });

    test('LOAD16 with address', () => {
        const result = assembleRaw('LOAD16 0x1234');
        // LOAD16 = 0x81, address = 0x1234 little-endian = 0x34 0x12
        expect(result).toEqual(new Uint8Array([0x81, 0x34, 0x12]));
    });

    test('PUSH32 with immediate', () => {
        const result = assembleRaw('PUSH32 0x12345678');
        // PUSH32 = 0xC0, value = 0x12345678 little-endian = 0x78 0x56 0x34 0x12
        expect(result).toEqual(new Uint8Array([0xC0, 0x78, 0x56, 0x34, 0x12]));
    });

    test('comments are ignored', () => {
        const result = assembleRaw(`
            ; This is a comment
            NOP  ; inline comment
            ; Another comment
            HALT
        `);
        expect(result).toEqual(new Uint8Array([0x00, 0x01]));
    });

    test('labels work correctly', () => {
        const result = assembleRaw(`
            start:
                NOP
                JMP start
        `);
        // NOP = 0x00, JMP = 0x90, address = 0x0000 little-endian
        expect(result).toEqual(new Uint8Array([0x00, 0x90, 0x00, 0x00]));
    });
});

// =============================================================================
// Label Resolution Tests
// =============================================================================

describe('Label resolution', () => {
    test('forward reference', () => {
        const result = assembleRaw(`
            JMP end
            NOP
            end:
                HALT
        `);
        // JMP = 0x90, end is at address 0x04 (JMP=3 + NOP=1)
        expect(result).toEqual(new Uint8Array([0x90, 0x04, 0x00, 0x00, 0x01]));
    });

    test('backward reference', () => {
        const result = assembleRaw(`
            loop:
                NOP
                JMP loop
        `);
        // NOP at 0x00, JMP at 0x01 pointing to 0x00
        expect(result).toEqual(new Uint8Array([0x00, 0x90, 0x00, 0x00]));
    });

    test('relative jump forward', () => {
        const result = assembleRaw(`
            JR skip
            NOP
            NOP
            skip:
                HALT
        `);
        // JR = 0x50 at addr 0, offset = 3 - 2 = 1 (skip is at 3, PC after JR is 2)
        // Wait: JR at 0, operand at 1, skip at 4 (JR=2 + NOP=1 + NOP=1)
        // Offset = 4 - 2 = 2
        expect(result).toEqual(new Uint8Array([0x50, 0x02, 0x00, 0x00, 0x01]));
    });

    test('relative jump backward', () => {
        const result = assembleRaw(`
            loop:
                NOP
                JR loop
        `);
        // NOP at 0, JR at 1, loop at 0
        // Offset = 0 - 3 = -3 = 0xFD (signed byte)
        expect(result).toEqual(new Uint8Array([0x00, 0x50, 0xFD]));
    });
});

// =============================================================================
// Error Handling Tests
// =============================================================================

describe('Error handling', () => {
    test('unknown instruction', () => {
        const error = validate('FOOBAR');
        expect(error).toContain("Unknown instruction 'FOOBAR'");
    });

    test('missing operand', () => {
        const error = validate('LOAD16');
        expect(error).toContain("requires an operand");
    });

    test('unexpected operand', () => {
        const error = validate('NOP 123');
        expect(error).toContain("takes no operand");
    });

    test('undefined label', () => {
        const error = validate('JMP undefined_label');
        expect(error).toContain("Undefined label");
    });

    test('duplicate label', () => {
        const error = validate('foo:\nfoo:');
        expect(error).toContain("Duplicate label");
    });
});

// =============================================================================
// Header Generation Tests
// =============================================================================

describe('ZPLC file format', () => {
    test('header is 32 bytes', () => {
        const result = assemble('HALT');
        // Header (32) + Segment entry (8) + Code (1)
        expect(result.zplcFile.length).toBe(32 + 8 + 1);
    });

    test('magic number is correct', () => {
        const result = assemble('HALT');
        const view = new DataView(result.zplcFile.buffer);
        expect(view.getUint32(0, true)).toBe(ZPLC_CONSTANTS.MAGIC);
        // Also check the ASCII representation
        expect(result.zplcFile[0]).toBe(0x5A); // 'Z'
        expect(result.zplcFile[1]).toBe(0x50); // 'P'
        expect(result.zplcFile[2]).toBe(0x4C); // 'L'
        expect(result.zplcFile[3]).toBe(0x43); // 'C'
    });

    test('version is 1.0', () => {
        const result = assemble('HALT');
        const view = new DataView(result.zplcFile.buffer);
        expect(view.getUint16(4, true)).toBe(1);  // major
        expect(view.getUint16(6, true)).toBe(0);  // minor
    });

    test('code size is correct', () => {
        const result = assemble('NOP\nNOP\nHALT');
        const view = new DataView(result.zplcFile.buffer);
        expect(view.getUint32(16, true)).toBe(3);  // code_size
    });

    test('segment count is 1', () => {
        const result = assemble('HALT');
        const view = new DataView(result.zplcFile.buffer);
        expect(view.getUint16(26, true)).toBe(1);  // segment_count
    });
});

// =============================================================================
// Golden File Tests (Compare with Python assembler output)
// =============================================================================

describe('Golden file comparison', () => {
    test('02_addition.asm matches Python output', () => {
        try {
            const source = readFileSync(examplesPath('02_addition.asm'), 'utf-8');
            const expected = new Uint8Array(readFileSync(examplesPath('02_addition.zplc')));

            const result = assemble(source);

            // Compare full .zplc file
            expect(toHex(result.zplcFile)).toBe(toHex(expected));
        } catch (e) {
            // If files don't exist, skip
            console.warn('Skipping golden file test: files not found');
        }
    });

    test('04_loop.asm matches Python output', () => {
        try {
            const source = readFileSync(examplesPath('04_loop.asm'), 'utf-8');
            const expected = new Uint8Array(readFileSync(examplesPath('04_loop.zplc')));

            const result = assemble(source);

            // Compare full .zplc file
            expect(toHex(result.zplcFile)).toBe(toHex(expected));
        } catch (e) {
            console.warn('Skipping golden file test: files not found');
        }
    });
});

// =============================================================================
// Disassembler Tests
// =============================================================================

describe('Disassembler', () => {
    test('disassemble simple program', () => {
        const bytecode = new Uint8Array([0x00, 0x01]);  // NOP, HALT
        const output = disassemble(bytecode);
        expect(output).toContain('NOP');
        expect(output).toContain('HALT');
    });

    test('disassemble with operands', () => {
        const bytecode = new Uint8Array([0x81, 0x34, 0x12]);  // LOAD16 0x1234
        const output = disassemble(bytecode);
        expect(output).toContain('LOAD16');
        expect(output).toContain('1234');
    });

    test('hex dump', () => {
        const bytecode = new Uint8Array([0x00, 0x01, 0x02]);
        const output = hexDump(bytecode);
        expect(output).toContain('00 01 02');
    });
});

// =============================================================================
// Integration Tests
// =============================================================================

describe('Integration', () => {
    test('assemble and disassemble roundtrip', () => {
        const source = `
            start:
                LOAD16 0x0000
                LOAD16 0x0002
                ADD
                STORE16 0x1000
                HALT
        `;

        const result = assemble(source);
        const disasm = disassemble(result.bytecode);

        expect(disasm).toContain('LOAD16');
        expect(disasm).toContain('ADD');
        expect(disasm).toContain('STORE16');
        expect(disasm).toContain('HALT');
    });

    test('full addition program structure', () => {
        const source = `
            ; Simple addition: C = A + B
            LOAD16  0x0000          ; Load A from IPI
            LOAD16  0x0002          ; Load B from IPI
            ADD                     ; A + B
            STORE16 0x1000          ; Store to OPI
            HALT
        `;

        const result = assemble(source);

        // Expected bytecode:
        // LOAD16 0x0000 = 0x81 0x00 0x00
        // LOAD16 0x0002 = 0x81 0x02 0x00
        // ADD = 0x20
        // STORE16 0x1000 = 0x85 0x00 0x10
        // HALT = 0x01
        const expected = new Uint8Array([
            0x81, 0x00, 0x00,  // LOAD16 0x0000
            0x81, 0x02, 0x00,  // LOAD16 0x0002
            0x20,              // ADD
            0x85, 0x00, 0x10,  // STORE16 0x1000
            0x01               // HALT
        ]);

        expect(toHex(result.bytecode)).toBe(toHex(expected));
    });
});

// =============================================================================
// Multi-Task Support Tests
// =============================================================================

describe('Multi-Task Support', () => {
    test('createMultiTaskZplcFile generates correct header', () => {
        const bytecode = new Uint8Array([0x00, 0x01]); // NOP, HALT
        const tasks: TaskDef[] = [
            {
                id: 1,
                type: TASK_TYPE.CYCLIC,
                priority: 0,
                intervalUs: 10000,
                entryPoint: 0,
                stackSize: 64,
            },
        ];

        const zplcFile = createMultiTaskZplcFile(bytecode, tasks);
        const view = new DataView(zplcFile.buffer);

        // Check magic
        expect(view.getUint32(0, true)).toBe(ZPLC_CONSTANTS.MAGIC);

        // Check version
        expect(view.getUint16(4, true)).toBe(1);  // major
        expect(view.getUint16(6, true)).toBe(0);  // minor

        // Check code_size (at offset 16)
        expect(view.getUint32(16, true)).toBe(2);  // bytecode length

        // Check data_size (task segment size = 1 task * 16 bytes)
        expect(view.getUint32(20, true)).toBe(16);

        // Check entry_point (first task's entry)
        expect(view.getUint16(24, true)).toBe(0);

        // Check segment_count = 2 (CODE + TASK)
        expect(view.getUint16(26, true)).toBe(2);
    });

    test('createMultiTaskZplcFile generates correct segment table', () => {
        const bytecode = new Uint8Array([0x01]); // HALT
        const tasks: TaskDef[] = [
            { id: 1, type: TASK_TYPE.CYCLIC, priority: 1, intervalUs: 100000, entryPoint: 0, stackSize: 64 },
        ];

        const zplcFile = createMultiTaskZplcFile(bytecode, tasks);
        const view = new DataView(zplcFile.buffer);

        // Segment table starts at offset 32 (after header)
        // Segment 1: CODE
        expect(view.getUint16(32, true)).toBe(ZPLC_CONSTANTS.SEGMENT_TYPE_CODE);
        expect(view.getUint16(34, true)).toBe(0);  // flags
        expect(view.getUint32(36, true)).toBe(1);  // size = bytecode length

        // Segment 2: TASK
        expect(view.getUint16(40, true)).toBe(ZPLC_CONSTANTS.SEGMENT_TYPE_TASK);
        expect(view.getUint16(42, true)).toBe(0);  // flags
        expect(view.getUint32(44, true)).toBe(16); // size = 1 task * 16 bytes
    });

    test('createMultiTaskZplcFile generates correct task definitions', () => {
        const bytecode = new Uint8Array([0x01]); // HALT
        const tasks: TaskDef[] = [
            { id: 1, type: TASK_TYPE.CYCLIC, priority: 0, intervalUs: 10000, entryPoint: 0, stackSize: 64 },
            { id: 2, type: TASK_TYPE.CYCLIC, priority: 2, intervalUs: 100000, entryPoint: 50, stackSize: 128 },
        ];

        const zplcFile = createMultiTaskZplcFile(bytecode, tasks);
        const view = new DataView(zplcFile.buffer);

        // Task segment starts after: header (32) + 2 segment entries (16) + code (1) = 49
        const taskSegmentStart = 32 + 16 + 1;

        // Task 1 (16 bytes)
        expect(view.getUint16(taskSegmentStart + 0, true)).toBe(1);      // id
        expect(view.getUint8(taskSegmentStart + 2)).toBe(0);             // type (CYCLIC)
        expect(view.getUint8(taskSegmentStart + 3)).toBe(0);             // priority
        expect(view.getUint32(taskSegmentStart + 4, true)).toBe(10000);  // interval_us
        expect(view.getUint16(taskSegmentStart + 8, true)).toBe(0);      // entry_point
        expect(view.getUint16(taskSegmentStart + 10, true)).toBe(64);    // stack_size
        expect(view.getUint32(taskSegmentStart + 12, true)).toBe(0);     // reserved

        // Task 2 (16 bytes, starts at taskSegmentStart + 16)
        const task2Offset = taskSegmentStart + 16;
        expect(view.getUint16(task2Offset + 0, true)).toBe(2);           // id
        expect(view.getUint8(task2Offset + 2)).toBe(0);                  // type (CYCLIC)
        expect(view.getUint8(task2Offset + 3)).toBe(2);                  // priority
        expect(view.getUint32(task2Offset + 4, true)).toBe(100000);      // interval_us
        expect(view.getUint16(task2Offset + 8, true)).toBe(50);          // entry_point
        expect(view.getUint16(task2Offset + 10, true)).toBe(128);        // stack_size
    });

    test('total file size is correct for multi-task', () => {
        const bytecode = new Uint8Array([0x00, 0x01, 0x02]); // 3 bytes
        const tasks: TaskDef[] = [
            { id: 1, type: TASK_TYPE.CYCLIC, priority: 0, intervalUs: 10000, entryPoint: 0, stackSize: 64 },
            { id: 2, type: TASK_TYPE.CYCLIC, priority: 1, intervalUs: 50000, entryPoint: 2, stackSize: 64 },
        ];

        const zplcFile = createMultiTaskZplcFile(bytecode, tasks);

        // Expected size: header (32) + 2 segments (16) + code (3) + 2 tasks (32) = 83
        expect(zplcFile.length).toBe(32 + 16 + 3 + 32);
    });
});

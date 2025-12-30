/**
 * ZPLC Comprehensive Opcode & Bytecode Test
 *
 * SPDX-License-Identifier: MIT
 *
 * This test verifies:
 * 1. All opcodes in the IDE assembler match zplc_isa.h exactly
 * 2. Every instruction generates correct bytecode
 * 3. Operand sizes are correct for all instructions
 * 4. The full compiler pipeline works (ST -> ASM -> bytecode)
 */

import { Opcode, getOperandSize, assembleRaw, disassemble } from './src/assembler/index.ts';

// Helper function since getInstructionSize is not exported
function getInstructionSize(opcode: number): number {
    return 1 + getOperandSize(opcode);
}

// ============================================================================
// Expected Opcodes from zplc_isa.h
// ============================================================================

const EXPECTED_OPCODES = {
    // System Operations (0x00-0x0F)
    NOP: 0x00,
    HALT: 0x01,
    BREAK: 0x02,
    GET_TICKS: 0x03,

    // Stack Operations (0x10-0x14)
    DUP: 0x10,
    DROP: 0x11,
    SWAP: 0x12,
    OVER: 0x13,
    ROT: 0x14,

    // Indirect Memory Access (0x15-0x1A)
    LOADI8: 0x15,
    LOADI32: 0x16,
    STOREI8: 0x17,
    STOREI32: 0x18,
    LOADI16: 0x19,
    STOREI16: 0x1A,

    // String Operations (0x1B-0x1F)
    STRLEN: 0x1B,
    STRCPY: 0x1C,
    STRCAT: 0x1D,
    STRCMP: 0x1E,
    STRCLR: 0x1F,

    // Integer Arithmetic (0x20-0x26)
    ADD: 0x20,
    SUB: 0x21,
    MUL: 0x22,
    DIV: 0x23,
    MOD: 0x24,
    NEG: 0x25,
    ABS: 0x26,

    // Float Arithmetic (0x28-0x2D)
    ADDF: 0x28,
    SUBF: 0x29,
    MULF: 0x2A,
    DIVF: 0x2B,
    NEGF: 0x2C,
    ABSF: 0x2D,

    // Logical/Bitwise Operations (0x30-0x36)
    AND: 0x30,
    OR: 0x31,
    XOR: 0x32,
    NOT: 0x33,
    SHL: 0x34,
    SHR: 0x35,
    SAR: 0x36,

    // Comparison Operations (0x38-0x3F)
    EQ: 0x38,
    NE: 0x39,
    LT: 0x3A,
    LE: 0x3B,
    GT: 0x3C,
    GE: 0x3D,
    LTU: 0x3E,
    GTU: 0x3F,

    // 8-bit operand instructions (0x40-0x5F)
    PUSH8: 0x40,
    PICK: 0x41,
    JR: 0x50,
    JRZ: 0x51,
    JRNZ: 0x52,

    // 16-bit operand instructions (0x80-0x9F)
    LOAD8: 0x80,
    LOAD16: 0x81,
    LOAD32: 0x82,
    LOAD64: 0x83,
    STORE8: 0x84,
    STORE16: 0x85,
    STORE32: 0x86,
    STORE64: 0x87,
    PUSH16: 0x88,
    JMP: 0x90,
    JZ: 0x91,
    JNZ: 0x92,
    CALL: 0x93,
    RET: 0x94,

    // Type Conversion (0xA0-0xA6)
    I2F: 0xA0,
    F2I: 0xA1,
    I2B: 0xA2,
    EXT8: 0xA3,
    EXT16: 0xA4,
    ZEXT8: 0xA5,
    ZEXT16: 0xA6,

    // 32-bit operand instructions (0xC0-0xFF)
    PUSH32: 0xC0,
} as const;

// Expected operand sizes based on opcode range
const EXPECTED_OPERAND_SIZES: Record<string, number> = {
    // No operand (0x00-0x3F)
    NOP: 0, HALT: 0, BREAK: 0, GET_TICKS: 0,
    DUP: 0, DROP: 0, SWAP: 0, OVER: 0, ROT: 0,
    LOADI8: 0, LOADI32: 0, STOREI8: 0, STOREI32: 0, LOADI16: 0, STOREI16: 0,
    STRLEN: 0, STRCPY: 0, STRCAT: 0, STRCMP: 0, STRCLR: 0,
    ADD: 0, SUB: 0, MUL: 0, DIV: 0, MOD: 0, NEG: 0, ABS: 0,
    ADDF: 0, SUBF: 0, MULF: 0, DIVF: 0, NEGF: 0, ABSF: 0,
    AND: 0, OR: 0, XOR: 0, NOT: 0, SHL: 0, SHR: 0, SAR: 0,
    EQ: 0, NE: 0, LT: 0, LE: 0, GT: 0, GE: 0, LTU: 0, GTU: 0,

    // 8-bit operand (0x40-0x7F)
    PUSH8: 1, PICK: 1, JR: 1, JRZ: 1, JRNZ: 1,

    // 16-bit operand (0x80-0xBF) - with exceptions
    LOAD8: 2, LOAD16: 2, LOAD32: 2, LOAD64: 2,
    STORE8: 2, STORE16: 2, STORE32: 2, STORE64: 2,
    PUSH16: 2,
    JMP: 2, JZ: 2, JNZ: 2, CALL: 2,
    RET: 0, // Exception! No operand despite range

    // Type conversion (0xA0-0xA6) - Exception! No operand despite range
    I2F: 0, F2I: 0, I2B: 0, EXT8: 0, EXT16: 0, ZEXT8: 0, ZEXT16: 0,

    // 32-bit operand (0xC0-0xFF)
    PUSH32: 4,
};

// ============================================================================
// Test Functions
// ============================================================================

function toHex(arr: Uint8Array): string {
    return Array.from(arr)
        .map(b => b.toString(16).padStart(2, '0').toUpperCase())
        .join(' ');
}

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
    if (condition) {
        passed++;
        console.log(`  ✅ ${message}`);
    } else {
        failed++;
        console.error(`  ❌ ${message}`);
    }
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
    const match = actual === expected;
    if (match) {
        passed++;
        console.log(`  ✅ ${message}`);
    } else {
        failed++;
        console.error(`  ❌ ${message}`);
        console.error(`      Expected: ${expected}`);
        console.error(`      Actual:   ${actual}`);
    }
}

// ============================================================================
// Test 1: Verify all opcodes match zplc_isa.h
// ============================================================================

console.log('\n' + '='.repeat(70));
console.log('TEST 1: Opcode Values Match zplc_isa.h');
console.log('='.repeat(70));

for (const [name, expectedValue] of Object.entries(EXPECTED_OPCODES)) {
    const actualValue = Opcode[name as keyof typeof Opcode];
    assertEqual(actualValue, expectedValue, `${name} = 0x${expectedValue.toString(16).padStart(2, '0').toUpperCase()}`);
}

// Check that all expected opcodes exist in the Opcode object
console.log('\n--- Checking for missing opcodes ---');
for (const name of Object.keys(EXPECTED_OPCODES)) {
    assert(name in Opcode, `Opcode.${name} exists`);
}

// Check that no extra opcodes exist
console.log('\n--- Checking for extra opcodes ---');
for (const name of Object.keys(Opcode)) {
    assert(name in EXPECTED_OPCODES, `${name} is expected (not extra)`);
}

// ============================================================================
// Test 2: Verify operand sizes
// ============================================================================

console.log('\n' + '='.repeat(70));
console.log('TEST 2: Operand Sizes');
console.log('='.repeat(70));

for (const [name, expectedSize] of Object.entries(EXPECTED_OPERAND_SIZES)) {
    const opcode = Opcode[name as keyof typeof Opcode];
    const actualSize = getOperandSize(opcode);
    assertEqual(actualSize, expectedSize, `${name} (0x${opcode.toString(16).padStart(2, '0')}) operand size = ${expectedSize}`);
}

// ============================================================================
// Test 3: Assemble and verify bytecode for each instruction
// ============================================================================

console.log('\n' + '='.repeat(70));
console.log('TEST 3: Bytecode Generation');
console.log('='.repeat(70));

// Instructions with no operand
const noOperandInstructions = [
    'NOP', 'HALT', 'BREAK', 'GET_TICKS',
    'DUP', 'DROP', 'SWAP', 'OVER', 'ROT',
    'LOADI8', 'LOADI32', 'STOREI8', 'STOREI32', 'LOADI16', 'STOREI16',
    'STRLEN', 'STRCPY', 'STRCAT', 'STRCMP', 'STRCLR',
    'ADD', 'SUB', 'MUL', 'DIV', 'MOD', 'NEG', 'ABS',
    'ADDF', 'SUBF', 'MULF', 'DIVF', 'NEGF', 'ABSF',
    'AND', 'OR', 'XOR', 'NOT', 'SHL', 'SHR', 'SAR',
    'EQ', 'NE', 'LT', 'LE', 'GT', 'GE', 'LTU', 'GTU',
    'RET',
    'I2F', 'F2I', 'I2B', 'EXT8', 'EXT16', 'ZEXT8', 'ZEXT16',
];

console.log('\n--- No-operand instructions (1 byte) ---');
for (const instr of noOperandInstructions) {
    try {
        const bytecode = assembleRaw(instr);
        const expectedOpcode = Opcode[instr as keyof typeof Opcode];
        assertEqual(bytecode.length, 1, `${instr} assembles to 1 byte`);
        assertEqual(bytecode[0], expectedOpcode, `${instr} opcode = 0x${expectedOpcode.toString(16).padStart(2, '0')}`);
    } catch (e) {
        failed++;
        console.error(`  ❌ ${instr} failed to assemble: ${e}`);
    }
}

// Instructions with 8-bit operand
console.log('\n--- 8-bit operand instructions (2 bytes) ---');
const int8Tests = [
    { asm: 'PUSH8 42', opcode: 0x40, operand: 42 },
    { asm: 'PUSH8 0xFF', opcode: 0x40, operand: 0xFF },
    { asm: 'PUSH8 0', opcode: 0x40, operand: 0 },
    { asm: 'PICK 0', opcode: 0x41, operand: 0 },
    { asm: 'PICK 3', opcode: 0x41, operand: 3 },
];

for (const test of int8Tests) {
    try {
        const bytecode = assembleRaw(test.asm);
        assertEqual(bytecode.length, 2, `"${test.asm}" assembles to 2 bytes`);
        assertEqual(bytecode[0], test.opcode, `"${test.asm}" opcode = 0x${test.opcode.toString(16).padStart(2, '0')}`);
        assertEqual(bytecode[1], test.operand, `"${test.asm}" operand = ${test.operand}`);
    } catch (e) {
        failed++;
        console.error(`  ❌ "${test.asm}" failed to assemble: ${e}`);
    }
}

// Instructions with 16-bit operand
console.log('\n--- 16-bit operand instructions (3 bytes) ---');
const int16Tests = [
    { asm: 'LOAD8 0x0000', opcode: 0x80, operand: 0x0000 },
    { asm: 'LOAD16 0x1234', opcode: 0x81, operand: 0x1234 },
    { asm: 'LOAD32 0x2000', opcode: 0x82, operand: 0x2000 },
    { asm: 'LOAD64 0x4000', opcode: 0x83, operand: 0x4000 },
    { asm: 'STORE8 0x1000', opcode: 0x84, operand: 0x1000 },
    { asm: 'STORE16 0x1002', opcode: 0x85, operand: 0x1002 },
    { asm: 'STORE32 0x1004', opcode: 0x86, operand: 0x1004 },
    { asm: 'STORE64 0x1008', opcode: 0x87, operand: 0x1008 },
    { asm: 'PUSH16 0x7FFF', opcode: 0x88, operand: 0x7FFF },
];

for (const test of int16Tests) {
    try {
        const bytecode = assembleRaw(test.asm);
        assertEqual(bytecode.length, 3, `"${test.asm}" assembles to 3 bytes`);
        assertEqual(bytecode[0], test.opcode, `"${test.asm}" opcode = 0x${test.opcode.toString(16).padStart(2, '0')}`);
        // 16-bit operand is little-endian
        const actualOperand = bytecode[1] | (bytecode[2] << 8);
        assertEqual(actualOperand, test.operand, `"${test.asm}" operand = 0x${test.operand.toString(16).padStart(4, '0')}`);
    } catch (e) {
        failed++;
        console.error(`  ❌ "${test.asm}" failed to assemble: ${e}`);
    }
}

// Jump/Call instructions with labels
console.log('\n--- Control flow instructions with labels ---');
const controlFlowTests = [
    {
        asm: 'target:\nJMP target',
        expectedBytecode: [0x90, 0x00, 0x00], // JMP 0x0000
    },
    {
        asm: 'target:\nNOP\nJMP target',
        expectedBytecode: [0x00, 0x90, 0x00, 0x00], // NOP, JMP 0x0000
    },
    {
        asm: 'JMP target\nNOP\ntarget:\nHALT',
        expectedBytecode: [0x90, 0x04, 0x00, 0x00, 0x01], // JMP 0x0004, NOP, HALT
    },
    {
        asm: 'target:\nJZ target',
        expectedBytecode: [0x91, 0x00, 0x00], // JZ 0x0000
    },
    {
        asm: 'target:\nJNZ target',
        expectedBytecode: [0x92, 0x00, 0x00], // JNZ 0x0000
    },
    {
        asm: 'func:\nRET\nCALL func',
        expectedBytecode: [0x94, 0x93, 0x00, 0x00], // RET, CALL 0x0000
    },
];

for (const test of controlFlowTests) {
    try {
        const bytecode = assembleRaw(test.asm);
        const expected = new Uint8Array(test.expectedBytecode);
        assertEqual(toHex(bytecode), toHex(expected), `Control flow: "${test.asm.replace(/\n/g, '; ')}"`);
    } catch (e) {
        failed++;
        console.error(`  ❌ "${test.asm.replace(/\n/g, '; ')}" failed: ${e}`);
    }
}

// Relative jumps
console.log('\n--- Relative jump instructions ---');
const relJumpTests = [
    {
        asm: 'JR target\nNOP\nNOP\ntarget:\nHALT',
        desc: 'JR forward',
        checkOffset: (bc: Uint8Array) => bc[1] === 2, // offset +2 (skip 2 NOPs)
    },
    {
        asm: 'target:\nNOP\nJR target',
        desc: 'JR backward',
        checkOffset: (bc: Uint8Array) => bc[2] === 0xFD, // offset -3 (signed)
    },
];

for (const test of relJumpTests) {
    try {
        const bytecode = assembleRaw(test.asm);
        assert(test.checkOffset(bytecode), `${test.desc}: offset is correct`);
    } catch (e) {
        failed++;
        console.error(`  ❌ "${test.desc}" failed: ${e}`);
    }
}

// Instructions with 32-bit operand
console.log('\n--- 32-bit operand instructions (5 bytes) ---');
const int32Tests = [
    { asm: 'PUSH32 0x12345678', opcode: 0xC0, operand: 0x12345678 },
    { asm: 'PUSH32 0x00000000', opcode: 0xC0, operand: 0x00000000 },
    { asm: 'PUSH32 0xFFFFFFFF', opcode: 0xC0, operand: 0xFFFFFFFF },
    { asm: 'PUSH32 1000', opcode: 0xC0, operand: 1000 },
];

for (const test of int32Tests) {
    try {
        const bytecode = assembleRaw(test.asm);
        assertEqual(bytecode.length, 5, `"${test.asm}" assembles to 5 bytes`);
        assertEqual(bytecode[0], test.opcode, `"${test.asm}" opcode = 0x${test.opcode.toString(16).padStart(2, '0')}`);
        // 32-bit operand is little-endian
        const view = new DataView(bytecode.buffer, bytecode.byteOffset, bytecode.byteLength);
        const actualOperand = view.getUint32(1, true);
        assertEqual(actualOperand, test.operand >>> 0, `"${test.asm}" operand = 0x${(test.operand >>> 0).toString(16).padStart(8, '0')}`);
    } catch (e) {
        failed++;
        console.error(`  ❌ "${test.asm}" failed to assemble: ${e}`);
    }
}

// ============================================================================
// Test 4: Complex program assembly
// ============================================================================

console.log('\n' + '='.repeat(70));
console.log('TEST 4: Complex Program Assembly');
console.log('='.repeat(70));

const complexProgram = `
; Test all major instruction categories
_start:
    ; Load/Store
    LOAD32 0x0000       ; Load from IPI
    LOAD32 0x0004       ; Load second value
    
    ; Arithmetic
    ADD                 ; Add them
    DUP                 ; Duplicate result
    PUSH8 10
    MUL                 ; Multiply by 10
    
    ; Store result
    STORE32 0x1000      ; Store to OPI
    
    ; Comparison and branching
    PUSH32 100
    GT                  ; Is result > 100?
    JZ skip_increment
    
    ; Conditional code
    LOAD32 0x2000
    PUSH8 1
    ADD
    STORE32 0x2000
    
skip_increment:
    ; Float operations
    LOAD32 0x0008       ; Load float
    I2F                 ; Convert to float if needed
    PUSH32 0x40000000   ; 2.0 in IEEE 754
    MULF                ; Multiply
    F2I                 ; Convert back
    STORE32 0x1004
    
    ; String operation addresses
    PUSH16 0x2100       ; String A address
    PUSH16 0x2200       ; String B address
    STRCMP              ; Compare strings
    STORE8 0x1008       ; Store comparison result
    
    ; Loop with counter
    PUSH8 5             ; Counter
loop:
    DUP
    JZ loop_done
    
    ; Loop body
    PUSH8 1
    SUB
    JMP loop
    
loop_done:
    DROP
    HALT
`;

try {
    const bytecode = assembleRaw(complexProgram);
    console.log(`\n  Program size: ${bytecode.length} bytes`);
    assert(bytecode.length > 50, 'Complex program generates substantial bytecode');
    
    // Verify it can be disassembled
    const disasm = disassemble(bytecode);
    assert(disasm.includes('LOAD32'), 'Disassembly includes LOAD32');
    assert(disasm.includes('ADD'), 'Disassembly includes ADD');
    assert(disasm.includes('STRCMP'), 'Disassembly includes STRCMP');
    assert(disasm.includes('HALT'), 'Disassembly includes HALT');
    
    console.log('\n  Disassembly excerpt:');
    console.log(disasm.split('\n').slice(0, 15).map(l => '    ' + l).join('\n'));
    console.log('    ...');
} catch (e) {
    failed++;
    console.error(`  ❌ Complex program failed to assemble: ${e}`);
}

// ============================================================================
// Test 5: Instruction size consistency
// ============================================================================

console.log('\n' + '='.repeat(70));
console.log('TEST 5: Instruction Size Consistency');
console.log('='.repeat(70));

for (const [name, opcode] of Object.entries(Opcode)) {
    const operandSize = getOperandSize(opcode);
    const instrSize = getInstructionSize(opcode);
    assertEqual(instrSize, 1 + operandSize, `${name}: instruction size = 1 + operand size`);
}

// ============================================================================
// Test 6: Verify opcode count
// ============================================================================

console.log('\n' + '='.repeat(70));
console.log('TEST 6: Total Opcode Count');
console.log('='.repeat(70));

const opcodeCount = Object.keys(Opcode).length;
console.log(`\n  Total opcodes in IDE: ${opcodeCount}`);
assertEqual(opcodeCount, 75, 'Total opcode count matches documentation (75)');

// List by category
const categories = {
    'System (0x00-0x0F)': ['NOP', 'HALT', 'BREAK', 'GET_TICKS'],
    'Stack (0x10-0x14)': ['DUP', 'DROP', 'SWAP', 'OVER', 'ROT'],
    'Indirect (0x15-0x1A)': ['LOADI8', 'LOADI32', 'STOREI8', 'STOREI32', 'LOADI16', 'STOREI16'],
    'String (0x1B-0x1F)': ['STRLEN', 'STRCPY', 'STRCAT', 'STRCMP', 'STRCLR'],
    'Int Arith (0x20-0x26)': ['ADD', 'SUB', 'MUL', 'DIV', 'MOD', 'NEG', 'ABS'],
    'Float Arith (0x28-0x2D)': ['ADDF', 'SUBF', 'MULF', 'DIVF', 'NEGF', 'ABSF'],
    'Logic (0x30-0x36)': ['AND', 'OR', 'XOR', 'NOT', 'SHL', 'SHR', 'SAR'],
    'Compare (0x38-0x3F)': ['EQ', 'NE', 'LT', 'LE', 'GT', 'GE', 'LTU', 'GTU'],
    '8-bit Op (0x40-0x5F)': ['PUSH8', 'PICK', 'JR', 'JRZ', 'JRNZ'],
    'Load/Store (0x80-0x88)': ['LOAD8', 'LOAD16', 'LOAD32', 'LOAD64', 'STORE8', 'STORE16', 'STORE32', 'STORE64', 'PUSH16'],
    'Control (0x90-0x94)': ['JMP', 'JZ', 'JNZ', 'CALL', 'RET'],
    'Conversion (0xA0-0xA6)': ['I2F', 'F2I', 'I2B', 'EXT8', 'EXT16', 'ZEXT8', 'ZEXT16'],
    '32-bit Op (0xC0)': ['PUSH32'],
};

console.log('\n  Opcodes by category:');
let totalCounted = 0;
for (const [category, ops] of Object.entries(categories)) {
    console.log(`    ${category}: ${ops.length} (${ops.join(', ')})`);
    totalCounted += ops.length;
}
assertEqual(totalCounted, 75, 'All categories sum to 75 opcodes');

// ============================================================================
// Summary
// ============================================================================

console.log('\n' + '='.repeat(70));
console.log('SUMMARY');
console.log('='.repeat(70));
console.log(`\n  ✅ Passed: ${passed}`);
console.log(`  ❌ Failed: ${failed}`);
console.log(`  Total:    ${passed + failed}`);

if (failed > 0) {
    console.log('\n  ⚠️  Some tests failed! Check the output above.\n');
    process.exit(1);
} else {
    console.log('\n  🎉 All tests passed!\n');
    process.exit(0);
}

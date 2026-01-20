/**
 * ZPLC Assembler - Opcode Definitions
 *
 * SPDX-License-Identifier: MIT
 *
 * This file defines all ZPLC VM opcodes matching zplc_isa.h exactly.
 * The opcode values and operand sizes must be bit-perfect with the C header.
 */

/**
 * ZPLC VM Opcodes
 *
 * Encoding scheme:
 *   0x00-0x3F: No operand (1 byte instruction)
 *   0x40-0x7F: 8-bit operand (2 bytes instruction)
 *   0x80-0xBF: 16-bit operand (3 bytes instruction)
 *   0xC0-0xFF: 32-bit operand (5 bytes instruction)
 *
 * Exceptions:
 *   RET (0x94): No operand despite being in 0x80-0xBF range
 *   Type conversions (0xA0-0xA6): No operand despite range
 */
export const Opcode = {
    // ===== System Operations (0x00-0x0F) =====
    NOP: 0x00,     // No operation
    HALT: 0x01,     // Stop execution
    BREAK: 0x02,     // Debugger breakpoint
    GET_TICKS: 0x03,   // Push system tick (ms)

    // ===== Stack Operations (0x10-0x1F) =====
    DUP: 0x10,     // Duplicate top of stack
    DROP: 0x11,     // Discard top of stack
    SWAP: 0x12,     // Swap top two elements
    OVER: 0x13,     // Copy second element to top
    ROT: 0x14,     // Rotate top three elements

    // ===== Indirect Memory Access (0x15-0x1A) =====
    LOADI8: 0x15,   // Load 8-bit from address on stack
    LOADI32: 0x16,  // Load 32-bit from address on stack
    STOREI8: 0x17,  // Store 8-bit to address on stack [addr val] -> []
    STOREI32: 0x18, // Store 32-bit to address on stack [addr val] -> []
    LOADI16: 0x19,  // Load 16-bit from address on stack
    STOREI16: 0x1A, // Store 16-bit to address on stack [addr val] -> []

    // ===== String Operations (0x1B-0x1F) =====
    STRLEN: 0x1B,   // Get string length: [str_addr] -> [length]
    STRCPY: 0x1C,   // Copy string: [src_addr dst_addr] -> [] (safe, bounds-checked)
    STRCAT: 0x1D,   // Concatenate: [src_addr dst_addr] -> [] (safe, bounds-checked)
    STRCMP: 0x1E,   // Compare strings: [addr1 addr2] -> [result] (-1, 0, 1)
    STRCLR: 0x1F,   // Clear string: [str_addr] -> []

    // ===== Integer Arithmetic (0x20-0x27) =====
    ADD: 0x20,     // Integer addition
    SUB: 0x21,     // Integer subtraction
    MUL: 0x22,     // Integer multiplication
    DIV: 0x23,     // Integer division
    MOD: 0x24,     // Integer modulo
    NEG: 0x25,     // Integer negation
    ABS: 0x26,     // Absolute value

    // ===== Float Arithmetic (0x28-0x2F) =====
    ADDF: 0x28,     // Float addition
    SUBF: 0x29,     // Float subtraction
    MULF: 0x2A,     // Float multiplication
    DIVF: 0x2B,     // Float division
    NEGF: 0x2C,     // Float negation
    ABSF: 0x2D,     // Float absolute value

    // ===== Logical/Bitwise Operations (0x30-0x37) =====
    AND: 0x30,     // Bitwise AND
    OR: 0x31,     // Bitwise OR
    XOR: 0x32,     // Bitwise XOR
    NOT: 0x33,     // Bitwise NOT
    SHL: 0x34,     // Shift left
    SHR: 0x35,     // Shift right (logical)
    SAR: 0x36,     // Shift right (arithmetic)

    // ===== Comparison Operations (0x38-0x3F) =====
    EQ: 0x38,     // Equal
    NE: 0x39,     // Not equal
    LT: 0x3A,     // Less than (signed)
    LE: 0x3B,     // Less or equal (signed)
    GT: 0x3C,     // Greater than (signed)
    GE: 0x3D,     // Greater or equal (signed)
    LTU: 0x3E,     // Less than (unsigned)
    GTU: 0x3F,     // Greater than (unsigned)

    // ===== 8-bit operand instructions (0x40-0x7F) =====
    PUSH8: 0x40,     // Push 8-bit immediate (sign-extended)
    PICK: 0x41,     // Copy nth stack element to top (n is 8-bit operand)
    JR: 0x50,     // Relative jump (signed 8-bit offset)
    JRZ: 0x51,     // Relative jump if zero
    JRNZ: 0x52,     // Relative jump if not zero

    // ===== 16-bit operand instructions (0x80-0xBF) =====
    LOAD8: 0x80,     // Load 8-bit from address
    LOAD16: 0x81,     // Load 16-bit from address
    LOAD32: 0x82,     // Load 32-bit from address
    LOAD64: 0x83,     // Load 64-bit from address
    STORE8: 0x84,     // Store 8-bit to address
    STORE16: 0x85,     // Store 16-bit to address
    STORE32: 0x86,     // Store 32-bit to address
    STORE64: 0x87,     // Store 64-bit to address
    PUSH16: 0x88,     // Push 16-bit immediate (sign-extended)
    JMP: 0x90,     // Unconditional jump
    JZ: 0x91,     // Jump if zero (false)
    JNZ: 0x92,     // Jump if not zero (true)
    CALL: 0x93,     // Call subroutine
    RET: 0x94,     // Return from subroutine (NO operand!)

    // ===== Type Conversion (0xA0-0xAF) - NO operand! =====
    I2F: 0xA0,     // Integer to float
    F2I: 0xA1,     // Float to integer
    I2B: 0xA2,     // Integer to boolean
    EXT8: 0xA3,     // Sign-extend 8-bit to 32-bit
    EXT16: 0xA4,     // Sign-extend 16-bit to 32-bit
    ZEXT8: 0xA5,     // Zero-extend 8-bit to 32-bit
    ZEXT16: 0xA6,     // Zero-extend 16-bit to 32-bit

    // ===== 32-bit operand instructions (0xC0-0xFF) =====
    PUSH32: 0xC0,     // Push 32-bit immediate
} as const;

export type OpcodeValue = typeof Opcode[keyof typeof Opcode];

/**
 * Opcode name to value lookup table.
 */
export const OPCODE_BY_NAME: Record<string, number> = { ...Opcode };

/**
 * Opcode value to name lookup table.
 */
export const OPCODE_BY_VALUE: Record<number, string> = Object.fromEntries(
    Object.entries(Opcode).map(([key, val]) => [val, key])
);

/**
 * Get the operand size in bytes for an opcode.
 *
 * Most opcodes follow range-based encoding:
 *   0x00-0x3F: 0 bytes (no operand)
 *   0x40-0x7F: 1 byte (8-bit operand)
 *   0x80-0xBF: 2 bytes (16-bit operand)
 *   0xC0-0xFF: 4 bytes (32-bit operand)
 *
 * Exceptions:
 *   RET (0x94): No operand despite being in 0x80-0xBF range
 *   Type conversions (0xA0-0xA6): No operand despite range
 *
 * @param opcode - The opcode value
 * @returns Operand size in bytes (0, 1, 2, or 4)
 */
export function getOperandSize(opcode: number): number {
    // Special cases - no operand despite opcode range
    if (opcode === Opcode.RET) {
        return 0;
    }
    if (opcode >= 0xA0 && opcode <= 0xA6) {
        return 0;
    }

    // Standard range-based encoding
    if (opcode < 0x40) {
        return 0;
    } else if (opcode < 0x80) {
        return 1;
    } else if (opcode < 0xC0) {
        return 2;
    } else {
        return 4;
    }
}

/**
 * Get total instruction size (opcode + operand) in bytes.
 *
 * @param opcode - The opcode value
 * @returns Total instruction size (1, 2, 3, or 5 bytes)
 */
export function getInstructionSize(opcode: number): number {
    return 1 + getOperandSize(opcode);
}

/**
 * Check if an opcode is a relative jump instruction.
 *
 * Relative jumps use signed 8-bit offsets from PC+2.
 */
export function isRelativeJump(opcode: number): boolean {
    return opcode === Opcode.JR || opcode === Opcode.JRZ || opcode === Opcode.JRNZ;
}

/**
 * Check if an opcode requires a label/address operand.
 *
 * These opcodes accept label names that get resolved to addresses.
 */
export function isAddressOperand(opcode: number): boolean {
    return opcode === Opcode.JMP ||
        opcode === Opcode.JZ ||
        opcode === Opcode.JNZ ||
        opcode === Opcode.CALL ||
        opcode === Opcode.JR ||
        opcode === Opcode.JRZ ||
        opcode === Opcode.JRNZ;
}

/**
 * Pre-computed operand sizes for all known opcodes.
 */
export const OPERAND_SIZES: Record<number, number> = Object.fromEntries(
    (Object.values(Opcode) as number[])
        .map((opcode) => [opcode, getOperandSize(opcode)])
);

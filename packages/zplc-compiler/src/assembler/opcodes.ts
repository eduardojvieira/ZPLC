/**
 * ZPLC Assembler - Opcode Definitions
 *
 * SPDX-License-Identifier: MIT
 *
 * The opcode numbers and operand sizes come from the generated contract
 * (tools/contract/contract.json), the same source the C header zplc_isa.h is
 * generated from, so the two cannot differ.
 */

import { Opcode as GeneratedOpcode, getOperandSize as generatedOperandSize, opcodeHasFlag } from '../contract.generated';

/**
 * ZPLC VM Opcodes (generated from tools/contract/contract.json).
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
export const Opcode = GeneratedOpcode;

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
 * The rule (range-based encoding with RET and the conversions as exceptions)
 * is part of the generated contract: see getOperandSize in contract.generated.ts.
 *
 * @param opcode - The opcode value
 * @returns Operand size in bytes (0, 1, 2, or 4)
 */
export const getOperandSize: (opcode: number) => number = generatedOperandSize;

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
    return opcodeHasFlag(opcode, 'relative');
}

/**
 * Check if an opcode requires a label/address operand.
 *
 * These opcodes accept label names that get resolved to addresses.
 */
export function isAddressOperand(opcode: number): boolean {
    return opcodeHasFlag(opcode, 'relative') || opcodeHasFlag(opcode, 'absolute');
}

/**
 * Pre-computed operand sizes for all known opcodes.
 */
export const OPERAND_SIZES: Record<number, number> = Object.fromEntries(
    (Object.values(Opcode) as number[])
        .map((opcode) => [opcode, getOperandSize(opcode)])
);

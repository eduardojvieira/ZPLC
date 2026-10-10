/**
 * ZPLC Assembler - Opcode Definitions
 *
 * SPDX-License-Identifier: MIT
 *
 * The opcode numbers and operand sizes come from the generated contract
 * (tools/contract/contract.json), the same source the C header zplc_isa.h is
 * generated from, so the two cannot differ.
 */

import { Opcode as GeneratedOpcode, OPCODE_TABLE, getOperandSize as generatedOperandSize, opcodeHasFlag } from '../contract.generated';

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

/**
 * What an operand field holds and the values it can hold (CMP-049). A value fits when it is an integer in
 * [min, max]: an immediate may be written signed or unsigned (the VM sign-extends it), an address only unsigned,
 * a relative offset only signed.
 */
export interface OperandField {
    /** What the field holds, for the message: "8-bit immediate", "16-bit memory address". */
    description: string;
    min: number;
    max: number;
    /** The operand is a distance from the next instruction; it is stored as a two's complement byte. */
    relative: boolean;
    /** The operand is the address of an instruction of the code. */
    codeAddress: boolean;
}

const TABLE_BY_CODE = new Map(OPCODE_TABLE.map((entry) => [entry.code, entry]));

/**
 * The operand field of an opcode, derived from the generated opcode table; undefined for an opcode that has no
 * operand or is not in the table.
 */
export function operandField(opcode: number): OperandField | undefined {
    const entry = TABLE_BY_CODE.get(opcode);
    if (!entry || entry.operand === 0) return undefined;
    const bits = entry.operand * 8;
    if (opcodeHasFlag(opcode, 'relative')) {
        return { description: `signed ${bits}-bit offset`, min: -(2 ** (bits - 1)), max: 2 ** (bits - 1) - 1, relative: true, codeAddress: false };
    }
    if (opcodeHasFlag(opcode, 'absolute')) {
        return { description: `${bits}-bit code address`, min: 0, max: 2 ** bits - 1, relative: false, codeAddress: true };
    }
    if (entry.memory || entry.group === 'comm') {
        const what = entry.memory ? 'memory address' : 'function-block kind';
        return { description: `${bits}-bit ${what}`, min: 0, max: 2 ** bits - 1, relative: false, codeAddress: false };
    }
    return { description: `${bits}-bit immediate`, min: -(2 ** (bits - 1)), max: 2 ** bits - 1, relative: false, codeAddress: false };
}

/** True when `value` is an integer the field can hold. */
export function fitsOperandField(field: OperandField, value: number): boolean {
    return Number.isInteger(value) && value >= field.min && value <= field.max;
}

/** The sentence that says why `value` is refused by the operand of `mnemonic`. */
export function operandRefusal(mnemonic: string, field: OperandField, value: number): string {
    return `${mnemonic} operand ${value} does not fit its ${field.description} (${field.min} to ${field.max})`;
}

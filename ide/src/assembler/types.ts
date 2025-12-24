/**
 * ZPLC Assembler - Type Definitions
 *
 * SPDX-License-Identifier: MIT
 */

/**
 * A parsed token from source code.
 */
export interface Token {
    type: 'label' | 'instruction' | 'operand' | 'directive' | 'comment';
    value: string;
    lineNum: number;
    rawLine: string;
}

/**
 * A parsed instruction.
 */
export interface Instruction {
    opcode: number;
    /** Resolved operand value (null if label ref not yet resolved) */
    operand: number | null;
    /** Label reference to resolve in pass 2 */
    operandLabel: string | null;
    lineNum: number;
    /** Byte offset in code segment */
    address: number;
}

/**
 * A label definition.
 */
export interface Label {
    name: string;
    address: number;
    lineNum: number;
}

/**
 * Assembler error with line information.
 */
export class AssemblerError extends Error {
    lineNum: number;
    line: string;

    constructor(message: string, lineNum: number = 0, line: string = '') {
        super(`Line ${lineNum}: ${message}\n  -> ${line}`);
        this.name = 'AssemblerError';
        this.lineNum = lineNum;
        this.line = line;
    }
}

/**
 * Result of assembly process.
 */
export interface AssemblyResult {
    /** Raw bytecode (no header) */
    bytecode: Uint8Array;
    /** Complete .zplc file (header + segments + bytecode) */
    zplcFile: Uint8Array;
    /** Parsed labels for debugging */
    labels: Map<string, Label>;
    /** Entry point address */
    entryPoint: number;
    /** Code size in bytes */
    codeSize: number;
}

/**
 * Assembler options.
 */
export interface AssemblerOptions {
    /** Enable verbose logging */
    verbose?: boolean;
    /** Generate raw bytecode only (no header) */
    raw?: boolean;
}

/**
 * ZPLC file format constants.
 */
export const ZPLC_CONSTANTS = {
    /** Magic number: "ZPLC" in little-endian (0x5A 0x50 0x4C 0x43) */
    MAGIC: 0x434C505A,
    /** Current ISA major version */
    VERSION_MAJOR: 1,
    /** Current ISA minor version */
    VERSION_MINOR: 0,
    /** File header size in bytes */
    HEADER_SIZE: 32,
    /** Segment entry size in bytes */
    SEGMENT_ENTRY_SIZE: 8,
    /** Code segment type ID */
    SEGMENT_TYPE_CODE: 0x01,
} as const;
